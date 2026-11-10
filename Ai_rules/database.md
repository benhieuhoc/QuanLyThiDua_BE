# Quy tắc database

## Nguồn chuẩn

- `cscript/init.sql` là file SQL duy nhất của project và là **nguồn chuẩn duy nhất** cho schema: **phần 1** tạo bảng / view, **phần 2** nạp dữ liệu giai đoạn đầu. Trước khi viết hoặc sửa bất kỳ câu SQL nào, phải đọc phần 1 để xác nhận tên bảng, tên cột, kiểu dữ liệu, ràng buộc và khóa ngoại.
- Không được dùng bảng hay cột chưa khai báo trong `cscript/init.sql`. Nếu cần bảng/cột mới, **cập nhật phần 1 của `cscript/init.sql` trước**, rồi mới viết code dùng nó, và cập nhật `code-map.md`.
- Không tự suy đoán schema từ code service; code có thể sai, `init.sql` mới là chuẩn.
- Không tạo thêm file SQL rời (migration, seed, script cập nhật); thay đổi schema hay dữ liệu khởi tạo đều sửa vào `init.sql`, giữ chạy lại được.

## Viết schema

- Dùng `CREATE TABLE IF NOT EXISTS` để chạy lại được.
- Theo quy ước đặt tên hiện có: tên bảng số ít, chữ thường (`teacher`, `class`); khóa ngoại dạng `<bảng>id` không gạch dưới (`teacherid`, `gradeid`); tên ràng buộc `<bảng>_pkey`, `fk_<bảng>_<bảng tham chiếu>`.
- Bảng có dữ liệu thay đổi thêm `created_at`, `updated_at` mặc định `NOW()`.
- Giá trị dạng enum dùng `CHECK (... = ANY (ARRAY[...]))` như `point.type`.
- Không tự ý đổi `ON DELETE CASCADE` hiện có; nếu đổi phải ghi lý do vào `code-map.md` (mục Quyết định thiết kế).

## Truy vấn

- Luôn dùng tham số `$1, $2...` và truyền **mảng** giá trị: `pool.query(sql, [id])`. Không nối chuỗi giá trị vào SQL.
- Cột trong `IN`/`ANY` truyền mảng: `WHERE id = ANY($1)` với `[ids]`.
- Thao tác ghi nhiều câu lệnh phải chạy trong transaction (`pool.connect()` → `BEGIN` / `COMMIT` / `ROLLBACK`, `client.release()` trong `finally`).
- Truy vấn lấy danh sách trả `result.rows`; lấy một bản ghi trả `result.rows[0]`.
- Mọi bảng dùng cột identity, không truyền id khi insert.
- Cột `date` được trả về dạng chuỗi `'YYYY-MM-DD'` (type parser trong `src/config/db.ts`).

## Phân hiệu và tên lớp

- Một trường có nhiều phân hiệu (`branch`), mỗi phân hiệu có `code` là 1 chữ cái (A, B...). Khối (`grade`) dùng chung toàn trường.
- Lớp được định danh bởi `(gradeid, branchid, seq)`. **Không lưu tên lớp** trong bảng `class`; tên `6A1` = `numgrade` + `branch.code` + `seq` được tính trong view `class_view`. Đọc lớp luôn dùng `class_view`.
- Học sinh (`student`) thuộc đúng 1 lớp (`classid`); `code` là mã học sinh theo hồ sơ của Sở, duy nhất; `gender` là `'Nam'`/`'Nữ'` hoặc null, `birthdate` có thể null.
- Giáo viên thuộc 1 phân hiệu (`teacher.branchid`), chủ nhiệm tối đa 1 lớp (`class_teacher_unique`), lớp chủ nhiệm phải cùng phân hiệu. `class.teacherid` có thể null (lớp chưa có GVCN), nên `class_view` LEFT JOIN `teacher`.
- `class.archivedyearid` khác null = lớp đã ra trường (lưu trữ khi lên lớp). `class_view` gồm cả lớp lưu trữ; truy vấn danh sách lớp / học sinh đang học phải lọc `archivedyearid IS NULL`. `(gradeid, branchid, seq)` chỉ duy nhất trong lớp đang học (unique index `class_active_unique`), nên tìm lớp theo tên (`name = '9A1'`) phải kèm điều kiện này.
- `class_year` (`schoolyearid`, `classid`, `gradeid`, `numgrade`, `name`, `teacherid`, `teachername`): ảnh chụp lớp của năm học đã lên lớp; `score_view` dùng để giữ tên / khối / GVCN năm cũ.

## Tài khoản

- `account` (`username` duy nhất, `password` = hash bcrypt 60 ký tự, `role` `'admin'`/`'user'`, `teacherid`, `studentid`, `active`). Mỗi giáo viên / học sinh tối đa 1 tài khoản. `account_owner_check`: admin không gắn học sinh; user gắn đúng 1 trong `teacherid` (GVCN) hoặc `studentid` (cờ đỏ).
- `account_class` (`accountid`, `classid`): lớp cờ đỏ được phân công chấm, khóa chính ghép.
- `point.accountid`: người nhập lượt chấm, `ON DELETE SET NULL` để xóa tài khoản vẫn giữ lượt chấm.
- Không bao giờ SELECT cột `password` ra response; truy vấn tài khoản liệt kê cột cụ thể, không dùng `a.*`.

## Năm học, tuần và điểm thi đua

- `point_student` (`pointid`, `studentid`): học sinh được gắn vào lượt chấm, khóa chính ghép.
- `school_year` (tên `YYYY-YYYY`, `startdate`, `semester2_week` = tuần bắt đầu học kỳ 2, null = mặc định `CEIL(số tuần/2)+1`) → `week` (tuần 1..N liên tiếp, 7 ngày, `conduct_base`, `study_base`, `locked`) → `point` (lượt cộng/trừ: `type`, `content`, `value` ≠ 0).
- Không lưu điểm tuần; đọc điểm luôn dùng `score_view`.

## Dữ liệu khởi tạo

- Cuối phần 1 có insert 4 khối (6–9) và 2 phân hiệu (A, B), dùng `ON CONFLICT DO NOTHING` để chạy lại không bị trùng.
- Phần 2 (trong 1 transaction) nạp dữ liệu giai đoạn đầu theo **khóa tự nhiên**, không ghi cứng id: lớp + GVCN theo (khối, mã phân hiệu, seq) qua bảng tạm `init_class` (chỉ tạo lớp đang học chưa có, mỗi lớp 1 bản ghi giáo viên), học sinh theo tên lớp qua `init_student` (`ON CONFLICT (code) DO NOTHING`), năm học 2026-2027 + 35 tuần (`ON CONFLICT (name)`), tài khoản `admin` mật khẩu `1`. Không có lượt chấm hay tài khoản GVCN / cờ đỏ (tạo qua API).
- Mật khẩu trong SQL hash bằng `crypt(..., gen_salt('bf', 10))` của extension `pgcrypto` (ra `$2a$`, thư viện bcrypt verify được).
- Phần 2 chứa thông tin cá nhân thật của học sinh (họ tên, ngày sinh, mã học sinh): không đưa `init.sql` lên repo công khai.
- Cột mới thêm vào bảng đã có thì khai báo trong `CREATE TABLE` và thêm `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ngay sau (mẫu `point.accountid`) để DB cũ chạy lại `init.sql` không mất dữ liệu.
- `CREATE TABLE IF NOT EXISTS` không sửa bảng đã có: khi đổi cấu trúc bảng ở môi trường dev, drop bảng rồi chạy lại `init.sql`.
