# Quy tắc bảo mật: Authentication, Authorization, phân cấp quyền

> Đã triển khai: đăng nhập (`/auth`), quản lý tài khoản (`/accounts`), phụ huynh (`/parents`, `/auth/parent/*`), middleware `src/app/middleware/auth.ts` gắn cho mọi route (trừ `GET /`, `POST /auth/login`, `POST /auth/parent/login`, `/public/*`: trang lớp QR và tổng quan công khai). File này là quy chuẩn bắt buộc. Khi thay đổi vai trò phải cập nhật file này và `code-map.md`.

## Authentication

- Dùng JWT, ký bằng `process.env.JWT_SECRET`, hạn dùng `process.env.JWT_EXPIRES_IN`. Không hard-code secret, không đặt secret mặc định trong code.
- Client gửi token qua header `Authorization: Bearer <token>`.
- Payload chỉ chứa thông tin tối thiểu: `{ id, role }`. Không đưa mật khẩu hay dữ liệu nhạy cảm vào token.
- Mật khẩu lưu dạng hash (bcrypt, cost ≥ 10). Không bao giờ lưu, trả về hay log mật khẩu thô hoặc hash.
- Đăng nhập sai trả `401` với thông báo chung ("Sai tài khoản hoặc mật khẩu"), không tiết lộ tài khoản có tồn tại hay không.
- Không log token, mật khẩu, `.env` (lưu ý: `src/config/db.ts` đang log `DB_PASSWORD`, phải xóa).
- Bảng tài khoản/vai trò phải được khai báo trong `cscript/init.sql` trước (xem `database.md`).

## Middleware

Đặt trong `src/app/middleware/`:

- `authenticate`: đọc và verify token, gắn `req.user = { id, role }`; thiếu hoặc sai token → `401`.
- `authorize(...roles)`: kiểm tra `req.user.role` theo cấp quyền; không đủ quyền → `403`.

Mọi route mặc định phải qua `authenticate`, trừ route được ghi rõ là `public` trong `code-map.md` (ví dụ đăng nhập).

## Phân cấp quyền

Project chỉ có **2 role** (bảng `account`): `admin` và `user`. Role `user` gồm 2 loại người dùng, phân biệt bằng cột liên kết của tài khoản (ràng buộc `account_owner_check`: user gắn đúng 1 trong 2):

| Cấp | Role | Người dùng | Quyền |
|---|---|---|---|
| 1 (cao nhất) | `admin` | Giáo viên quản lý nề nếp (`teacherid` tùy chọn, không gắn `studentid`) | Toàn quyền: quản lý tài khoản, phân công cờ đỏ, giáo viên, khối, lớp, học sinh, năm học, tuần (điểm gốc, khóa tuần), điểm |
| 2 | `user` + `teacherid` | Giáo viên chủ nhiệm | **Chỉ xem** dữ liệu, bảng điểm, xếp hạng để nắm thông tin; không tạo / sửa / xóa gì, kể cả lượt chấm (`point`) của lớp mình chủ nhiệm (403) |
| 2 | `user` + `studentid` | Cờ đỏ | Xem lớp, bảng điểm, xếp hạng; chỉ xem học sinh của lớp được phân công; tạo lượt chấm cho lớp có trong `account_class` của mình; sửa/xóa chỉ lượt do mình nhập (`point.accountid = req.user.id`) và lớp vẫn được phân công |

- `admin` có toàn bộ quyền của `user`.
- Cột role trong DB giới hạn bằng `CHECK (role IN ('admin', 'user'))` (`account_role_check`).
- Học sinh thường **không** có tài khoản. Chỉ admin được tạo tài khoản cờ đỏ cho học sinh (gắn `studentid`); tài khoản cờ đỏ chỉ có quyền ở trên, không quản lý học sinh hay dữ liệu khác.
- Cờ đỏ không được chấm lớp của chính mình: service chặn phân công (`account_class`) và tạo lượt chấm khi `classid` = lớp của học sinh cờ đỏ. `account_class` chỉ được gán cho tài khoản có `studentid`.
- Tài khoản `active = false` không đăng nhập được, token đã cấp cũng bị từ chối (kiểm tra khi `authenticate`). Dùng để thu hồi cờ đỏ hết nhiệm kỳ thay vì xóa (xóa tài khoản thì `point.accountid` về null).
- Khi tạo lượt chấm luôn ghi `point.accountid = req.user.id`.
- Giao diện (FE) cho cờ đỏ chỉ mở trang Tổng quan và Chấm điểm; đây là giới hạn hiển thị, quyền thật vẫn kiểm tra ở BE theo bảng trên.
- Kiểm tra quyền theo **dữ liệu sở hữu** ở service/controller, không chỉ theo role: cờ đỏ chỉ chấm lớp được phân công và chỉ sửa lượt mình nhập. Payload token chỉ có `{ id, role }`; `teacherid`/`studentid` tra từ bảng `account` theo `id`.
- Không tin `role` hay `id` gửi từ body/query; chỉ dùng `req.user` lấy từ token.
- Người dùng không được tự nâng quyền; chỉ `admin` được gán role.

## Phụ huynh (bảng `parent`)

- Phụ huynh **không** có tài khoản trong `account` và không phải role thứ 3: đăng nhập riêng `POST /auth/parent/login`, token `{ id: parent.id, role: 'parent' }`.
- Token phụ huynh chỉ qua `authenticateParent` (`/auth/parent/me`, `/auth/parent/password`). `authenticate` phải từ chối mọi token có role ngoài `admin`/`user` (401), vì `id` trong token phụ huynh là `parent.id`, tra vào `account` sẽ thành tài khoản khác. Ngược lại `authenticateParent` từ chối token giáo viên / cờ đỏ.
- Phụ huynh chỉ xem thông tin của mình, con và lớp con, và các lượt chấm có gắn con (`GET /auth/parent/points`, không có tên học sinh khác hay người nhập); xem kết quả thi đua qua trang công khai (`BaseQRCode`). Muốn mở thêm API cho phụ huynh thì tạo route riêng dưới `authenticateParent`, giới hạn theo `req.parent.studentid`, không gắn phụ huynh vào router hiện có.
- Chỉ admin tạo / sửa / khóa / xóa phụ huynh và cấp tài khoản (`/parents`). Mật khẩu bcrypt cost 10, không trả `password`; đăng nhập sai trả thông báo chung, sai username vẫn so hash giả; bị khóa → 403 khi đăng nhập, 401 với token đang dùng.

## Route công khai (`/public`)

- `GET /public/classes/:qrcode`: trang lớp cho phụ huynh mở qua mã QR (`BaseQRCode`), không đăng nhập.
- Link công khai dùng `class.qrcode` (ngẫu nhiên, khó đoán), **không** dùng id tuần tự, để không dò được trang của lớp khác. Mã sai định dạng trả 404 giống mã không tồn tại. QR bị lộ thì admin đổi mã (`PUT /classes/:id/qrcode`).
- Chỉ trả kết quả thi đua của lớp (điểm tuần, hạng, nội dung lượt cộng/trừ), **họ tên** học sinh gắn vào từng lượt chấm (người dùng đã chấp nhận công khai, 2026-11-16) và thông tin lớp (tên, phân hiệu, tên GVCN, sĩ số). **Không** trả danh sách học sinh của lớp, id / mã / ngày sinh / giới tính học sinh, tài khoản / người nhập hay id giáo viên.
- `GET /public/meta`, `/public/scores/periods`, `/public/scores/ranking` (trang tổng quan khi chưa đăng nhập, người dùng yêu cầu 2026-11-22): chỉ năm học / tuần / phân hiệu / khối và điểm, hạng tổng hợp theo lớp (kèm tên GVCN). **Không** trả học sinh, nội dung lượt chấm, tài khoản, `teacherid`. Bọc hàm service nội bộ thì phải lọc lại cột trước khi trả.
- Thêm dữ liệu vào route public phải liệt kê cột cụ thể, không `SELECT *`.

## Kho tài liệu (`/folders`, `/files`)

- Đọc danh sách, metadata và tải file: admin, user (`authenticate`). Tạo / sửa / xóa thư mục và file: chỉ `admin`. Phụ huynh (token `parent`) và route công khai không truy cập được.
- Upload: `authorize('admin')` phải đứng **trước** `uploadFile` để người không có quyền không ghi được file lên đĩa. Giới hạn dung lượng `FILE_MAX_SIZE_MB`, 1 file / request.
- Tên file trên đĩa là `storagekey` (uuid do server sinh), không dùng tên người dùng gửi; `storagePath` từ chối mọi key không phải uuid (chống path traversal). Không trả `storagekey` cho client.
- `public/files` **không** được mount `express.static`: nội dung chỉ tải qua `GET /files/:id/download` (có đăng nhập), luôn `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` để file HTML / SVG / JS tải lên không chạy trên domain API (XSS).
- `public/files` nằm trong `.gitignore`, không commit file người dùng tải lên.

## Khác

- CORS: chỉ cho phép origin cụ thể. Danh sách `allowedOrigins` trong `src/index.ts` đang có `'*'`, cần bỏ khi lên production.
- Luôn dùng truy vấn có tham số (chống SQL injection, xem `database.md`).
