# Quy tắc bảo mật: Authentication, Authorization, phân cấp quyền

> Đã triển khai: đăng nhập (`/auth`), quản lý tài khoản (`/accounts`), middleware `src/app/middleware/auth.ts` gắn cho mọi route (trừ `GET /`, `POST /auth/login`). File này là quy chuẩn bắt buộc. Khi thay đổi vai trò phải cập nhật file này và `code-map.md`.

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

## Khác

- CORS: chỉ cho phép origin cụ thể. Danh sách `allowedOrigins` trong `src/index.ts` đang có `'*'`, cần bỏ khi lên production.
- Luôn dùng truy vấn có tham số (chống SQL injection, xem `database.md`).
