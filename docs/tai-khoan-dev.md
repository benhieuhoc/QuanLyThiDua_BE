# Tài khoản dev

Tài khoản đăng nhập trên DB dev `QLHS`. **Chỉ dùng cho môi trường dev, không dùng trên production.**

Cập nhật: 2026-11-16

**Mật khẩu: `1`** (trừ `nkn.codo`: mật khẩu đã đặt riêng, `init.sql` giữ nguyên hash)

| Tên đăng nhập | Loại (`kind`) | Role | Người dùng | Lớp của người dùng | Được chấm điểm |
|---|---|---|---|---|---|
| `admin` | Quản lý nề nếp (`admin`) | `admin` | (không gắn giáo viên) | — | Toàn trường |
| `gvcn.6a1` | GVCN (`gvcn`) | `user` | Lê Thị Hương Lan | Chủ nhiệm 6A1 | Không (chỉ xem) |
| `gvcn.7a1` | GVCN (`gvcn`) | `user` | Trần Thị Hoài Linh | Chủ nhiệm 7A1 | Không (chỉ xem) |
| `gvcn.6b1` | GVCN (`gvcn`) | `user` | Phan Thị Vân | Chủ nhiệm 6B1 | Không (chỉ xem) |
| `codo.duc` | Cờ đỏ (`codo`) | `user` | HS Bùi Thị Vân Anh | Học lớp 7A1 | 6A1, 6A2 |
| `codo.ha` | Cờ đỏ (`codo`) | `user` | HS Nguyễn Thế Trường An | Học lớp 6A2 | 7A1 |
| `nkn.codo` | Cờ đỏ (`codo`) | `user` | HS Nguyễn Khánh Ngọc | Học lớp 9A1 | 9A2, 9A3, 9A4, 9A5 |

## Mỗi loại tài khoản làm được gì

| Loại | Trang trên FE | Quyền |
|---|---|---|
| Quản lý nề nếp | Tất cả, kể cả **Tài khoản** | Toàn quyền: dữ liệu, năm học/tuần, khóa tuần, tài khoản, phân công cờ đỏ, chấm điểm mọi lớp |
| GVCN | Tất cả (chỉ xem) | Chỉ xem để nắm thông tin, không thao tác gì (kể cả chấm điểm lớp mình) |
| Cờ đỏ | Chỉ **Tổng quan** và **Chấm điểm** | Chấm lớp được phân công (không phải lớp mình); chỉ sửa/xóa lượt do mình nhập |

Chi tiết quyền: [Ai_rules/security.md](../Ai_rules/security.md).

## Ghi chú

- Tên đăng nhập không phân biệt hoa thường.
- Mật khẩu `1` được đặt thẳng trong DB. Mật khẩu tạo hoặc đổi qua API / giao diện (tạo tài khoản, đặt lại, đổi mật khẩu) phải **từ 6 ký tự**.
- Từ 2026-11-16, [cscript/init.sql](../cscript/init.sql) tạo đủ các tài khoản trong bảng trên kèm phân công lớp cờ đỏ (username đã có thì bỏ qua), nên DB mới chạy `init.sql` đăng nhập được ngay.
- Tài khoản tạo thêm qua trang **Tài khoản** không tự cập nhật vào file này; nhớ ghi thêm nếu muốn tra cứu.

## Phụ huynh (dữ liệu giả)

Đăng nhập ở trang phụ huynh (`POST /auth/parent/login`), **không** dùng trang đăng nhập giáo viên. **Mật khẩu: `123456`.**

- 50 phụ huynh giả của 30 học sinh (3 học sinh đầu mỗi lớp 6A1, 6A2, 6B1, 7A1, 7A2, 7B1, 8A1, 8B1, 9A1, 9B1), nạp từ [cscript/init.sql](../cscript/init.sql) (chỉ thêm cái chưa có).
- Tên đăng nhập: `ph.<mã học sinh>.cha` hoặc `ph.<mã học sinh>.me`, ví dụ `ph.2609138407.cha`, `ph.2609138407.me` (con học 6A1).
- 40 phụ huynh có tài khoản; 10 chưa cấp (dòng thứ 5, 10, 15... trong `init_parent`, `username` null), dùng để thử cấp tài khoản qua `PUT /parents/:id`.

Xem danh sách:

```sql
SELECT p.username, p.relation, p.name, s.code, s.name AS con, cv.name AS lop, p.active
FROM parent p
JOIN student s ON s.id = p.studentid
JOIN class_view cv ON cv.id = s.classid
ORDER BY cv.numgrade, cv.branchcode, cv.seq, s.id, p.relation;
```

## Xem lại / đặt lại mật khẩu

Xem danh sách tài khoản hiện có trong DB:

```sql
SELECT a.username, a.role, a.active,
       COALESCE(t.name, s.name) AS nguoidung,
       COALESCE(hr.name, sc.name) AS lop
FROM account a
LEFT JOIN teacher t ON t.id = a.teacherid
LEFT JOIN class_view hr ON hr.teacherid = a.teacherid
LEFT JOIN student s ON s.id = a.studentid
LEFT JOIN class_view sc ON sc.id = s.classid
ORDER BY a.role, a.username;
```

Đặt lại mật khẩu mọi tài khoản về `1` (cần extension `pgcrypto`, đã có sẵn sau khi chạy `init.sql`):

```sql
UPDATE account SET password = crypt('1', gen_salt('bf', 10)), updated_at = NOW();
```

Mở khóa một tài khoản bị khóa:

```sql
UPDATE account SET active = true, updated_at = NOW() WHERE username = 'codo.duc';
```
