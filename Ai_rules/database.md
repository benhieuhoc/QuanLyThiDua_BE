# Quy tắc database

## Nguồn chuẩn

- `cscript/migration.sql` là **nguồn chuẩn duy nhất** cho schema. Trước khi viết hoặc sửa bất kỳ câu SQL nào, phải đọc file này để xác nhận tên bảng, tên cột, kiểu dữ liệu, ràng buộc và khóa ngoại.
- Không được dùng bảng hay cột chưa khai báo trong `cscript/`. Nếu cần bảng/cột mới, **cập nhật `cscript/migration.sql` trước**, rồi mới viết code dùng nó, và cập nhật `code-map.md`.
- Không tự suy đoán schema từ code service; code có thể sai, migration mới là chuẩn.

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

- Cuối `migration.sql` có insert 4 khối (6–9) và 2 phân hiệu (A, B), dùng `ON CONFLICT DO NOTHING` để chạy lại không bị trùng. Dữ liệu khởi tạo mới thêm theo cùng cách.
- Dữ liệu mẫu cho dev (giáo viên, lớp, cờ đỏ, tài khoản) nằm riêng ở `cscript/seed.sql`, chạy sau migration, không chạy trên production. Seed chạy được cả trên DB đã có dữ liệu: chỉ tạo GV/lớp/HS mẫu khi lớp chưa tồn tại hoặc chưa có học sinh; tài khoản `gvcn.*` gắn GVCN hiện tại của lớp, `codo.*` gắn học sinh id nhỏ nhất của lớp. Mật khẩu hash bằng `crypt(..., gen_salt('bf', 10))` của extension `pgcrypto` (ra `$2a$`, thư viện bcrypt verify được).
- Cột mới thêm vào bảng đã có thì khai báo trong `CREATE TABLE` và thêm `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ngay sau (mẫu `point.accountid`) để DB cũ chạy lại migration không mất dữ liệu.
- `CREATE TABLE IF NOT EXISTS` không sửa bảng đã có: khi đổi cấu trúc bảng ở môi trường dev, drop bảng rồi chạy lại migration.
