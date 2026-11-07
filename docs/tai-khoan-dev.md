# Tài khoản dev

Tài khoản đăng nhập trên DB dev `QLHS`. **Chỉ dùng cho môi trường dev, không dùng trên production.**

Cập nhật: 2026-11-04

**Mật khẩu tất cả tài khoản: `1`**

| Tên đăng nhập | Loại (`kind`) | Role | Người dùng | Lớp của người dùng | Được chấm điểm |
|---|---|---|---|---|---|
| `admin` | Quản lý nề nếp (`admin`) | `admin` | (không gắn giáo viên) | — | Toàn trường |
| `gvcn.6a1` | GVCN (`gvcn`) | `user` | Nguyễn Văn An (CN) | Chủ nhiệm 6A1 | Không (chỉ xem) |
| `gvcn.7a1` | GVCN (`gvcn`) | `user` | Đỗ Văn Khánh | Chủ nhiệm 7A1 | Không (chỉ xem) |
| `gvcn.6b1` | GVCN (`gvcn`) | `user` | Dương Văn Minh | Chủ nhiệm 6B1 | Không (chỉ xem) |
| `codo.duc` | Cờ đỏ (`codo`) | `user` | HS Bùi Thị Vân Anh | Học lớp 7A1 | 6A1, 6A2 |
| `codo.ha` | Cờ đỏ (`codo`) | `user` | HS Nguyễn Thế Trường An | Học lớp 6A2 | 7A1 |

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
- Tài khoản dev được tạo bằng [cscript/seed.sql](../cscript/seed.sql), chạy sau `cscript/migration.sql`. Seed gắn `gvcn.*` với GVCN **hiện tại** của lớp và `codo.*` với học sinh có id nhỏ nhất của lớp. Nếu dữ liệu lớp / học sinh thay đổi rồi seed lại trên DB mới, người dùng trong bảng trên có thể khác (tên đăng nhập và mật khẩu giữ nguyên).
- Tài khoản tạo thêm qua trang **Tài khoản** không tự cập nhật vào file này; nhớ ghi thêm nếu muốn tra cứu.

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

Đặt lại mật khẩu mọi tài khoản về `1` (cần extension `pgcrypto`, đã có sẵn sau khi chạy seed):

```sql
UPDATE account SET password = crypt('1', gen_salt('bf', 10)), updated_at = NOW();
```

Mở khóa một tài khoản bị khóa:

```sql
UPDATE account SET active = true, updated_at = NOW() WHERE username = 'codo.duc';
```
