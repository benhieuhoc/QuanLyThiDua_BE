# Logic triển khai: Hệ thống chấm điểm thi đua

Tài liệu tổng hợp nghiệp vụ, luồng xử lý và cách dùng API của back-end. Dành cho người phát triển front-end/back-end khi mới tham gia dự án.

> Tài liệu kỹ thuật chi tiết cho từng file xem [Ai_rules/code-map.md](../Ai_rules/code-map.md). Khi nghiệp vụ thay đổi, cập nhật cả hai. Hướng dẫn tích hợp cho FE nằm ở mục 9 (đã gom các file `fe-handoff-*.md` cũ vào đây); thay đổi API mới thì cập nhật mục 9 và ghi vào mục 10, không tạo file bàn giao riêng.

## 1. Mục đích

**Mục đích chính là chấm điểm thi đua cho các lớp** trong một trường THCS có nhiều phân hiệu. Điểm mỗi lớp được quản lý theo tuần, gồm 2 phần **Nề nếp** và **Học tập**; mỗi tuần mỗi phần được cấp một lượng điểm gốc cố định, sau đó cộng/trừ theo các lượt chấm. Kết quả được xếp hạng theo tuần, tháng hoặc học kỳ.

Phân hiệu, giáo viên, lớp, học sinh là dữ liệu nền: biết chấm cho lớp nào, ai chủ nhiệm, và học sinh nào vi phạm / được khen trong từng lượt chấm.

## 2. Mô hình nghiệp vụ

```
Trường
 ├─ Phân hiệu 1 (mã A)                 Khối dùng chung toàn trường: 6, 7, 8, 9
 │   ├─ Giáo viên ... (thuộc phân hiệu A)
 │   └─ Lớp 6A1, 6A2, 7A1 ...          ← tối đa 1 GVCN của phân hiệu A, có danh sách học sinh
 └─ Phân hiệu 2 (mã B)
     ├─ Giáo viên ...
     └─ Lớp 6B1, 7B1 ...

Năm học 2026-2027 (HK2 bắt đầu từ tuần semester2_week)
 └─ Tuần 1..N (điểm gốc Nề nếp / Học tập, cờ khóa)
     └─ Lượt chấm của 1 lớp (Nề nếp/Học tập, nội dung, ±điểm)
         └─ Học sinh được nêu tên (0..n học sinh của lớp đó)
```

| Khái niệm | Bảng | Ghi chú |
|---|---|---|
| Phân hiệu | `branch` | `code` là 1 chữ cái in hoa, duy nhất. Khởi tạo sẵn: Phân hiệu 1 (A), Phân hiệu 2 (B) |
| Khối | `grade` | Cố định 6, 7, 8, 9, khởi tạo trong `cscript/init.sql`, chỉ đọc |
| Giáo viên | `teacher` | Thuộc đúng 1 phân hiệu, tên ≤ 25 ký tự |
| Lớp | `class` | Xác định bởi (khối, phân hiệu, số thứ tự `seq`); GVCN có thể để trống |
| Học sinh | `student` | Thuộc đúng 1 lớp; mã học sinh `code` (theo hồ sơ của Sở, duy nhất, chữ/số ≤ 20 ký tự), họ tên (≤ 50 ký tự), giới tính (`Nam`/`Nữ`, không bắt buộc), ngày sinh (không bắt buộc). Chỉ là dữ liệu; riêng học sinh làm cờ đỏ được cấp tài khoản |
| Tài khoản | `account` | Role `admin` hoặc `user`; `user` gắn `teacherid` (GVCN) hoặc `studentid` (cờ đỏ). Có cờ `active` (khóa) |
| Phân công cờ đỏ | `account_class` | Các lớp một tài khoản cờ đỏ được chấm (không gồm lớp của chính em đó) |
| Năm học | `school_year` | Tên `YYYY-YYYY`, ngày bắt đầu tuần 1, tuần bắt đầu học kỳ 2 (`semester2_week`). Tạo năm học thì tự sinh các tuần và lên lớp (mục 4.7) |
| Lớp theo năm học | `class_year` | Ảnh chụp tên lớp / khối / GVCN của một năm học đã kết thúc, ghi lúc lên lớp để bảng điểm năm cũ giữ tên lớp cũ |
| Tuần | `week` | Tuần 1..N liên tiếp, 7 ngày. Có điểm gốc Nề nếp (`conduct_base`), Học tập (`study_base`) và cờ khóa (`locked`) |
| Lượt chấm điểm | `point` | Nhập tự do: phần (`Nề nếp`/`Học tập`), nội dung (≤ 255 ký tự), số điểm nguyên khác 0 từ -1000 đến 1000 (âm = trừ, dương = cộng) |
| Học sinh trong lượt chấm | `point_student` | Bảng nối lượt chấm ↔ học sinh (học sinh vi phạm hoặc được khen) |
| Bảng điểm | view `score_view` | Không lưu, tính từ điểm gốc + các lượt chấm |

### Quy tắc tính điểm thi đua

```
Điểm Nề nếp  = điểm gốc Nề nếp của tuần  + Σ lượt chấm Nề nếp  (trừ là số âm, cộng là số dương)
Điểm Học tập = điểm gốc Học tập của tuần + Σ lượt chấm Học tập
Tổng điểm    = Điểm Nề nếp + Điểm Học tập
```

- Điểm gốc mặc định 100 mỗi phần, đặt khi tạo năm học; có thể đổi từng tuần (và áp cho các tuần sau bằng `applyToNext`).
- **Khóa tuần**: tuần đã chốt (`locked`) không được thêm/sửa/xóa lượt chấm (kể cả danh sách học sinh) và không đổi điểm gốc. Muốn sửa thì mở khóa trước.
- Điểm là số nguyên. Bảng điểm tự cập nhật khi sửa điểm gốc hay lượt chấm vì không lưu điểm tuần.

### Quy tắc xếp hạng

- Xếp theo tổng điểm, **cùng điểm cùng hạng** (1, 1, 3...). Xếp được trong toàn trường, theo phân hiệu, theo khối (hạng tính trong phạm vi lọc).
- Xếp hạng theo **1 khoảng** của năm học: 1 tuần, 1 tháng, 1 học kỳ hoặc cả năm học (`GET /scores/ranking`). Cùng khoảng đó xuất được file Excel (`GET /scores/export`); file tuần có thêm cột chi tiết các lượt cộng / trừ (không ghi tên học sinh). Điểm của khoảng = cộng điểm các tuần trong khoảng, kèm điểm trung bình/tuần.
- **Chỉ tính các tuần đã bắt đầu** (ngày bắt đầu ≤ hôm nay), để tuần tương lai (chỉ có điểm gốc) không làm sai tổng. Tháng/học kỳ đang diễn ra thì response cho biết đã tính bao nhiêu tuần (`countedweeks` / `numweeks`). Khoảng chưa có tuần nào bắt đầu trả `409`.
- **Tháng**: mỗi tuần thuộc tháng chứa ngày thứ Năm của tuần (tháng có nhiều ngày của tuần hơn), nên mỗi tuần thuộc đúng 1 tháng. Ví dụ tuần 28/09–04/10/2026 thuộc tháng 10.
- **Học kỳ**: HK1 là tuần 1 đến `semester2_week - 1`, HK2 từ `semester2_week` đến hết. Không đặt thì mặc định HK1 là nửa đầu năm làm tròn lên (35 tuần → HK1 tuần 1–18, HK2 tuần 19–35). `semester2_week` phải nằm trong 2..số tuần.
- `GET /scores/periods` trả sẵn danh sách tuần / tháng / học kỳ của năm học để giao diện dựng ô chọn.

### Quy tắc đặt tên lớp

**Tên lớp = khối + mã phân hiệu + số thứ tự.** Ví dụ khối 6, phân hiệu A, lớp thứ 2 là `6A2`.

- Tên lớp **không lưu** trong DB mà được tính trong view `class_view`. Đổi mã phân hiệu (A → C) thì tên mọi lớp của phân hiệu đó tự đổi (`6A1` → `6C1`).
- Số thứ tự tăng tiếp từ lớp lớn nhất hiện có của cùng khối và phân hiệu. Xóa lớp ở giữa (ví dụ `6A2`) thì số đó không được dùng lại tự động.

### Quy tắc giáo viên chủ nhiệm

1. Mỗi lớp có tối đa 1 giáo viên chủ nhiệm. Lớp có thể **chưa có GVCN** (`teacherid`, `teachername` = null), ví dụ khi nhập danh sách lớp trước rồi phân công sau; GVCN không chấm điểm lớp (chỉ xem); người chấm là admin và cờ đỏ được phân công.
2. Mỗi giáo viên chủ nhiệm **tối đa 1 lớp**.
3. Giáo viên chủ nhiệm phải **cùng phân hiệu** với lớp.
4. Giáo viên đang chủ nhiệm thì không được đổi sang phân hiệu khác và không được xóa. Muốn làm vậy, trước hết phải đổi chủ nhiệm của lớp sang người khác (hoặc bỏ phân công).

### Quy tắc học sinh

1. Mỗi học sinh thuộc đúng 1 lớp; **chuyển lớp** bằng cách đổi `classid`.
2. Mã học sinh duy nhất toàn trường (trùng → `409`).
3. Một lượt chấm gắn được nhiều học sinh. Học sinh **mới gắn** phải đang học lớp của lượt chấm; học sinh đã gắn từ trước rồi chuyển lớp vẫn được giữ trong lượt chấm cũ (lịch sử không đổi).
4. Gắn học sinh không phụ thuộc dấu điểm: lượt trừ ghi học sinh vi phạm, lượt cộng ghi học sinh được khen.
5. Lịch sử của 1 học sinh: `GET /points?studentid=`.

### Quy tắc xóa

Không xóa dây chuyền. API trả lỗi `409` khi:

| Xóa | Bị chặn khi |
|---|---|
| Phân hiệu | Còn giáo viên hoặc lớp |
| Giáo viên | Đang chủ nhiệm lớp |
| Lớp | Còn học sinh hoặc đã có điểm thi đua |
| Học sinh | Đã được gắn vào lượt chấm điểm |
| Năm học | Đã có điểm thi đua hoặc có lớp ra trường được lưu trữ |
| Giảm số tuần của năm học | Các tuần bị bỏ đã có điểm |
| Lượt chấm | Tuần đã khóa (xóa lượt chấm thì xóa luôn danh sách học sinh gắn kèm) |

## 3. Phân quyền

Có 2 vai trò (bảng `account`). Vai trò `user` có 2 loại người dùng, phân biệt theo tài khoản gắn với giáo viên hay học sinh:

| Vai trò | Người dùng | Được làm |
|---|---|---|
| `admin` | Giáo viên quản lý nề nếp | Toàn quyền: phân hiệu, giáo viên, lớp, học sinh, năm học, tuần, điểm, tài khoản, phân công cờ đỏ |
| `user` (gắn `teacherid`) | Giáo viên chủ nhiệm | **Chỉ xem** dữ liệu, bảng điểm, xếp hạng để nắm thông tin; không được thao tác (kể cả chấm điểm lớp mình) |
| `user` (gắn `studentid`) | Cờ đỏ (học sinh) | Chỉ dùng trang Tổng quan và Chấm điểm. Xem lớp, bảng điểm; chỉ xem học sinh của lớp được phân công; tạo lượt chấm cho lớp được admin phân công (`account_class`), chỉ sửa/xóa lượt mình nhập; không chấm lớp của chính mình |

Học sinh thường không có tài khoản; chỉ học sinh được chọn làm cờ đỏ mới được admin cấp tài khoản. Mỗi lượt chấm lưu `point.accountid` là người nhập.

Đăng nhập dùng JWT gửi qua header `Authorization: Bearer <token>`. Mọi API (trừ `GET /` và `POST /auth/login`) bắt buộc gửi token: thiếu / sai / hết hạn → 401; không đủ quyền → 403. Thêm/sửa/xóa phân hiệu, giáo viên, lớp, học sinh, năm học, tuần chỉ admin. Cách FE gửi token, xử lý 401/403, chặn trang: mục 9.1–9.3.

Đăng nhập: username không phân biệt hoa thường; mật khẩu 6 ký tự – 72 byte, hash bcrypt cost 10. Tài khoản bị khóa (`active = false`) thì đăng nhập trả 403 và token đang dùng bị từ chối ngay (401). Luôn phải còn ít nhất 1 admin hoạt động; admin không tự khóa / xóa mình. Role, `teacherid`, `studentid` không sửa được (xóa và tạo lại). Quy chuẩn chi tiết: [Ai_rules/security.md](../Ai_rules/security.md).

### Loại người dùng (`kind`)

`GET /auth/me` (và `account` trong response `POST /auth/login`) trả `kind` để giao diện phân biệt 3 loại người dùng:

| `kind` | `role` | Trang được vào | Lớp được chấm |
|---|---|---|---|
| `admin` | `admin` | Tất cả, kể cả Tài khoản (`/tai-khoan`) | Mọi lớp |
| `gvcn` | `user` | Mọi trang trừ Tài khoản, **chỉ xem** | Không lớp nào (`classes = []`) |
| `codo` | `user` | Chỉ Tổng quan (`/`) và Chấm điểm (`/cham-diem`) | `classes[]` được phân công |

**Chặn trang là việc của FE**: BE chặn mọi thao tác ghi và chặn cờ đỏ xem học sinh ngoài lớp được phân công, nhưng không chặn cờ đỏ đọc xếp hạng hay danh sách giáo viên.

### Quyền chấm điểm

| | Tạo lượt chấm | Sửa / xóa lượt chấm |
|---|---|---|
| admin | Mọi lớp | Mọi lượt |
| gvcn | Không (403) | Không (403) |
| codo | Lớp được phân công, không phải lớp của mình | Chỉ lượt do chính mình nhập, và lớp vẫn đang được phân công |

Kiểm tra quyền trước, rồi mới tới tuần khóa: chưa có quyền → 403, có quyền nhưng tuần đã khóa → 409.

### Cờ đỏ xem học sinh

- `GET /students?classid=` với lớp được phân công → bình thường; lớp khác → 403.
- `GET /students` không truyền `classid` → chỉ trả học sinh của các lớp được phân công.
- `GET /classes/:id` với lớp không được phân công → `students: []` (`numstudents` vẫn đúng).
- `GET /points` vẫn trả tên học sinh đã gắn ở mọi lớp (thông tin công khai trên bảng thi đua).

### Quy tắc tài khoản

- `username`: 3–50 ký tự gồm chữ thường, số, `.`, `_`, `-`; BE tự chuyển về chữ thường.
- Tạo: **Quản lý nề nếp** → `role: "admin"` (gắn giáo viên không bắt buộc); **GVCN** → `role: "user"` + `teacherid`; **Cờ đỏ** → `role: "user"` + `studentid`. Mỗi giáo viên / học sinh tối đa 1 tài khoản (trùng → 409).
- `PUT /accounts/:id/classes` thay **toàn bộ** lớp cờ đỏ chấm (`[]` = bỏ hết); chỉ áp dụng cho cờ đỏ, không được chứa lớp của chính em đó (400).
- Xóa tài khoản thì lượt chấm đã nhập vẫn giữ, `point.accountid` thành null. Cờ đỏ hết nhiệm kỳ nên **khóa** (`active: false`) thay vì xóa để giữ tên người nhập.
- Token mặc định hết hạn sau 30 phút (`JWT_EXPIRES_IN`), chưa có refresh token; đăng xuất chỉ là xóa token phía FE (không có API logout).

| Mã | Khi đăng nhập | `message` |
|---|---|---|
| 400 | Thiếu username / mật khẩu | "Vui lòng nhập tên đăng nhập và mật khẩu" |
| 401 | Sai username hoặc mật khẩu (không phân biệt) | "Sai tài khoản hoặc mật khẩu" |
| 403 | Đúng mật khẩu nhưng tài khoản bị khóa | "Tài khoản đã bị khóa" |

Các API khác khi chưa đăng nhập: 401 "Chưa đăng nhập" (thiếu token) hoặc "Phiên đăng nhập không hợp lệ hoặc đã hết hạn".

Tài khoản mẫu dev (mật khẩu `1`): xem [tai-khoan-dev.md](tai-khoan-dev.md).

## 4. Luồng sử dụng

### 4.1. Thiết lập ban đầu (admin)

Thực hiện theo đúng thứ tự vì có ràng buộc dữ liệu:

```
1. Chạy cscript/init.sql           → có sẵn 4 khối, 2 phân hiệu, 55 lớp + GVCN, học sinh, năm học 2026-2027, admin
                                     (các bước dưới dùng khi thêm / thay đổi dữ liệu)
2. (Tùy chọn) POST /branches       → thêm phân hiệu khác
3. POST /teachers                  → nhập giáo viên theo từng phân hiệu
4. POST /classes                   → tạo lớp: chọn khối + phân hiệu + danh sách GVCN (null = chưa phân công)
5. POST /students                  → nhập học sinh theo từng lớp
6. POST /school-years              → tạo năm học, tự sinh tuần
```

Ví dụ: tạo 3 lớp khối 6 cho phân hiệu A, lớp thứ 3 chưa có GVCN.

```http
POST /teachers
{ "branchid": 1, "names": ["Nguyễn Văn An", "Trần Thị Bình"] }
→ 201, trả về 2 giáo viên id 1, 2

POST /classes
{ "gradeid": 1, "branchid": 1, "teacherIds": [1, 2, null] }
→ 201, trả về 6A1 (GV An), 6A2 (GV Bình), 6A3 (chưa có GVCN)

PUT /classes/3
{ "teacherid": 5 }                       → phân công GVCN cho 6A3 sau

POST /students
{ "classid": 1, "students": [
    { "code": "2609138407", "name": "Hồ Đặng Minh An", "gender": "Nam", "birthdate": "2015-09-02" },
    { "code": "2609138427", "name": "Nguyễn Ngọc Bảo An", "gender": "Nữ" }
] }
→ 201, thêm hàng loạt học sinh vào 6A1
```

Gọi lại `POST /classes` cho khối 6 phân hiệu A sẽ tạo tiếp `6A4`.

### 4.2. Chấm điểm thi đua hằng tuần

```
1. Đầu năm (admin): POST /school-years { "name": "2026-2027", "startdate": "2026-09-07", "numweeks": 35, "semester2_week": 19 }
                    → sinh tuần 1..35, mỗi tuần Nề nếp 100, Học tập 100
2. Hằng tuần:       GET /weeks/current                     → tuần hiện tại
                    GET /students?classid=                 → danh sách học sinh để chọn
                    POST /points { weekid, classid, type, content, value, studentIds? }   (lặp cho từng lỗi / điểm cộng)
3. Xem kết quả:     GET /scores/ranking?schoolyearid=&week=   → bảng điểm + xếp hạng tuần
4. Cuối tuần:       PUT /weeks/:id { "locked": true }      → chốt điểm
5. Tổng kết:        GET /scores/periods?schoolyearid=                  → danh sách tuần / tháng / học kỳ để chọn
                    GET /scores/ranking?schoolyearid=&month=2026-10    → xếp hạng tháng (hoặc week=8, semester=1)
                    GET /scores/class/:classid?schoolyearid=           → diễn biến 1 lớp theo tuần
                    GET /points?studentid=                             → lịch sử vi phạm / khen của 1 học sinh
```

Ví dụ một lượt trừ có nêu tên học sinh và một lượt cộng của cả lớp:

```http
POST /points
{ "weekid": 8, "classid": 1, "type": "Nề nếp", "content": "Đi học muộn (2 bạn)", "value": -4, "studentIds": [12, 15] }

POST /points
{ "weekid": 8, "classid": 1, "type": "Học tập", "content": "Giờ học tốt (xếp loại A)", "value": 3 }

PUT /points/41
{ "studentIds": [12] }                   → thay danh sách học sinh; bỏ trường = giữ nguyên, [] = bỏ hết
```

### 4.3. Luồng xử lý tạo lớp hàng loạt

```
POST /classes { gradeid, branchid, teacherIds }
 │
 ├─ Controller: kiểm tra id hợp lệ, teacherIds không rỗng, id khác null không trùng   → 400
 ├─ Service:
 │   ├─ Khối, phân hiệu tồn tại?                                            → 404
 │   ├─ (với các phần tử khác null)
 │   │   ├─ Mọi giáo viên tồn tại?                                          → 404
 │   │   ├─ Mọi giáo viên cùng phân hiệu?                                   → 400
 │   │   └─ Giáo viên nào đã chủ nhiệm lớp khác?                            → 409
 │   └─ Transaction:
 │        khóa dòng phân hiệu (chống 2 request cùng lúc lấy trùng số thứ tự)
 │        lấy số thứ tự lớn nhất hiện có của (khối, phân hiệu)
 │        insert các lớp, số thứ tự tăng dần theo thứ tự teacherIds
 └─ 201, trả về danh sách lớp kèm tên (6A1, 6A2...)
```

### 4.4. Luồng xử lý lượt chấm có học sinh

```
POST /points { weekid, classid, type, content, value, studentIds? }
 │
 ├─ Controller: type, content, value hợp lệ; studentIds là mảng id, không trùng → 400
 ├─ Service:
 │   ├─ Tuần tồn tại và chưa khóa?                                → 404 / 409
 │   ├─ Lớp tồn tại?                                               → 404
 │   ├─ Mọi học sinh tồn tại?                                      → 404
 │   ├─ Mọi học sinh đang học lớp classid?                         → 400
 │   └─ Transaction: insert point → insert point_student
 └─ 201, trả về lượt chấm kèm students: [{ id, code, name }]
```

`PUT /points/:id` chạy cùng luồng nhưng chỉ kiểm tra học sinh **mới gắn** và thay toàn bộ danh sách khi có `studentIds`.

### 4.5. Luồng xử lý xếp hạng theo khoảng

```
GET /scores/ranking?schoolyearid=1&month=2026-10&branchid=1
 │
 ├─ Controller: schoolyearid hợp lệ; đúng 1 trong week / month / semester / year, đúng định dạng → 400
 ├─ Service:
 │   ├─ Năm học tồn tại?                                                     → 404
 │   ├─ Lấy các tuần của năm học kèm tháng (theo thứ Năm), học kỳ, đã bắt đầu chưa
 │   ├─ Lọc tuần thuộc khoảng; không có tuần nào                              → 404
 │   ├─ Chưa tuần nào bắt đầu                                                 → 409
 │   └─ Cộng điểm score_view của các tuần đã bắt đầu theo lớp, RANK() theo tổng
 └─ 200 { schoolyear, period, scores[] }
```

### 4.6. Các thao tác thường gặp

| Nhu cầu | Cách làm |
|---|---|
| Danh sách lớp của 1 phân hiệu | `GET /classes?branchid=1` |
| Danh sách lớp của 1 khối trong 1 phân hiệu | `GET /classes?branchid=1&gradeid=1` |
| Giáo viên chưa chủ nhiệm (để chọn khi tạo lớp) | `GET /teachers?branchid=1`, lọc các giáo viên có `classid = null` |
| Đổi giáo viên chủ nhiệm | `PUT /classes/:id` với `{ "teacherid": 5 }` (gửi `null` để bỏ phân công) |
| Chuyển giáo viên sang phân hiệu khác | Đổi chủ nhiệm lớp của họ trước, rồi `PUT /teachers/:id` với `{ "branchid": 2 }` |
| Xem lớp kèm danh sách học sinh | `GET /classes/:id` → `data.students[]`, sĩ số `data.numstudents` |
| Thêm học sinh vào lớp | `POST /students` với `{ "classid": 1, "students": [{ "code": "...", "name": "..." }] }` |
| Chuyển học sinh sang lớp khác | `PUT /students/:id` với `{ "classid": 2 }` |
| Các lượt chấm của 1 lớp trong tuần | `GET /points?weekid=8&classid=1` |
| Ghi tên học sinh vi phạm khi chấm | `POST /points` thêm `"studentIds": [12, 15]` (học sinh của lớp đó) |
| Lịch sử vi phạm / khen của 1 học sinh | `GET /points?studentid=12` |
| Xếp hạng tuần trong 1 phân hiệu | `GET /scores/ranking?schoolyearid=1&week=8&branchid=1` |
| Xếp hạng tháng / học kỳ | `GET /scores/ranking?schoolyearid=1&month=2026-10` hoặc `&semester=1` |
| Cộng dồn khoảng tuần tùy chọn | `GET /scores/summary?schoolyearid=1&fromweek=3&toweek=10` |
| Xếp hạng cả năm học | `GET /scores/ranking?schoolyearid=1&year=1` |
| Tải Excel điểm thi đua | `GET /scores/export?schoolyearid=1&week=8` (hoặc `month=2026-10`, `semester=1`, `year=1`; thêm `branchid`, `gradeid` để lọc) |
| Đổi tuần bắt đầu học kỳ 2 | `PUT /school-years/:id` với `{ "semester2_week": 20 }` (`null` = về mặc định) |
| Đổi điểm gốc từ tuần 20 trở đi | `PUT /weeks/:id` (tuần 20) với `{ "conduct_base": 120, "applyToNext": true }` |
| Thêm tuần cho năm học | `PUT /school-years/:id` với `{ "numweeks": 37 }` |
| Sang năm học mới (lên lớp) | Sau khi năm cũ kết thúc: `POST /school-years` (thêm `grade6` nếu số lớp 6 khác năm cũ), xem mục 4.7 |
| Xem lớp đã ra trường | `GET /classes?archived=true`; học sinh của lớp đó: `GET /students?classid=` |

### 4.7. Luồng chuyển năm học và lên lớp

Lớp (`class`) là một lứa học sinh đi lên theo năm: 6A1 năm nay thành 7A1 năm sau, giữ nguyên id, học sinh, GVCN. Không xóa lớp khối 9 mà **lưu trữ** (ra trường) để giữ điểm thi đua và lịch sử vi phạm của năm cũ.

```
POST /school-years { name, startdate, numweeks, ..., grade6? }
 │
 ├─ Controller: dữ liệu năm học hợp lệ; grade6 là [{ branchid, count: 0-30 }], không trùng phân hiệu → 400
 ├─ Service (1 transaction, khóa bảng school_year và class):
 │   ├─ Năm học mới nhất đã kết thúc? (ngày cuối tuần cuối < hôm nay)             → 409
 │   ├─ startdate sau ngày kết thúc năm học mới nhất?                              → 409
 │   ├─ Không chồng thời gian, không trùng tên                                     → 409
 │   ├─ Tạo năm học + sinh tuần
 │   └─ Năm cũ chưa lên lớp (chưa có class_year)? → lên lớp:
 │        1. Chụp tên lớp / khối / GVCN của mọi lớp đang học vào class_year (năm cũ)
 │        2. Lớp khối 9 → lưu trữ: archivedyearid = năm cũ, bỏ GVCN (GV rảnh để nhận lớp 6),
 │           khóa tài khoản cờ đỏ của học sinh ra trường, bỏ phân công chấm của các em và vào lớp đó
 │        3. Khối 8 → 9, 7 → 8, 6 → 7 (giữ học sinh, GVCN, phân công cờ đỏ)
 │        4. Tạo lớp khối 6 mới (chưa GVCN, chưa học sinh): mỗi phân hiệu số lớp theo grade6,
 │           không gửi grade6 thì bằng số lớp khối 6 năm cũ của phân hiệu đó
 │        Lỗi bất kỳ bước nào → rollback cả năm học
 └─ 201 { ...năm học, promotion }
```

`promotion` là `null` khi đây là năm học đầu tiên hoặc năm cũ đã lên lớp rồi; ngược lại:

```json
{
  "fromschoolyear": "2025-2026",
  "archived": [{ "id": 7, "name": "9A1" }],
  "promoted": 40,
  "created": [{ "id": 60, "name": "6A1" }, { "id": 61, "name": "6B1" }],
  "deactivatedAccounts": 2
}
```

Sau khi lên lớp:

- Lớp đang học (`GET /classes`, `GET /students` không truyền `classid`) không còn lớp / học sinh ra trường. Lớp ra trường xem bằng `GET /classes?archived=true` (kèm `archivedyearid`, `archivedyearname`); `GET /classes/:id` và `GET /students?classid=` vẫn xem được.
- Lớp ra trường chỉ để xem: đổi GVCN, thêm / chuyển học sinh vào, tạo lượt chấm, phân công cờ đỏ đều trả 409.
- Bảng điểm, xếp hạng năm cũ dùng tên / khối / GVCN theo ảnh chụp (`class_year`), nên 6A1 năm cũ vẫn hiện là 6A1 và lọc `gradeid` theo khối năm đó. Năm mới chỉ gồm lớp đang học. Riêng `GET /points` vẫn hiện tên lớp hiện tại.
- Admin làm tiếp: nhập học sinh lớp 6 (`POST /students`), phân công GVCN lớp 6 (`PUT /classes/:id`), đổi GVCN / phân công lại cờ đỏ nếu cần.
- Không hoàn tác: xóa năm học mới vừa tạo thì các lớp vẫn ở khối mới; tạo lại năm học đó không lên lớp lần nữa (năm cũ đã có `class_year`).
- Việc FE cần làm: mục 9.7.

## 5. API

Base URL khi chạy local: `http://localhost:3001` (theo `PORT` trong `.env`).

| Method | Path | Body / Query | Quyền |
|---|---|---|---|
| GET | `/branches` | | admin, user |
| GET | `/branches/:id` | | admin, user |
| POST | `/branches` | `{ name, code }` | admin |
| PUT | `/branches/:id` | `{ name?, code? }` | admin |
| DELETE | `/branches/:id` | | admin |
| GET | `/grades` | | admin, user |
| GET | `/teachers` | `?branchid=` (kèm `classid`, `classname` lớp chủ nhiệm) | admin, user |
| GET | `/teachers/:id` | | admin, user |
| POST | `/teachers` | `{ branchid, names[] }` | admin |
| PUT | `/teachers/:id` | `{ name?, branchid? }` | admin |
| DELETE | `/teachers/:id` | | admin |
| GET | `/classes` | `?branchid=&gradeid=` (kèm `numstudents`) | admin, user |
| GET | `/classes/:id` | (kèm `numstudents`, `students[]`) | admin, user |
| POST | `/classes` | `{ gradeid, branchid, teacherIds[] }` (phần tử `null` = chưa có GVCN) | admin |
| PUT | `/classes/:id` | `{ teacherid }` (`null` = bỏ GVCN) | admin |
| DELETE | `/classes/:id` | | admin |
| GET | `/students` | `?classid=&branchid=&gradeid=` | admin, user |
| GET | `/students/:id` | | admin, user |
| POST | `/students` | `{ classid, students: [{ code, name, gender?, birthdate? }] }` | admin |
| PUT | `/students/:id` | `{ code?, name?, gender?, birthdate?, classid? }` | admin |
| DELETE | `/students/:id` | | admin |
| GET | `/school-years` | (kèm `numweeks`, `enddate`, `semester2_week`) | admin, user |
| GET | `/school-years/:id` | (kèm `weeks[]`) | admin, user |
| POST | `/school-years` | `{ name, startdate, numweeks, conduct_base?, study_base?, semester2_week?, grade6? }`; chỉ khi năm cũ đã kết thúc, tự lên lớp (mục 4.7) | admin |
| PUT | `/school-years/:id` | `{ name?, numweeks?, semester2_week? }` | admin |
| DELETE | `/school-years/:id` | | admin |
| GET | `/weeks` | `?schoolyearid=` | admin, user |
| GET | `/weeks/current` | | admin, user |
| GET | `/weeks/:id` | | admin, user |
| PUT | `/weeks/:id` | `{ conduct_base?, study_base?, locked?, applyToNext? }` | admin |
| GET | `/points` | `?weekid=&classid=&type=&studentid=` | admin, user |
| GET | `/points/:id` | | admin, user |
| POST | `/points` | `{ weekid, classid, type, content, value, studentIds? }` | admin mọi lớp · cờ đỏ lớp được phân công |
| PUT | `/points/:id` | `{ type?, content?, value?, studentIds? }` | admin mọi lượt · cờ đỏ lượt mình nhập |
| DELETE | `/points/:id` | | như PUT |
| GET | `/scores/ranking` | `?schoolyearid=` (bắt buộc) + đúng 1 trong `week=` (số tuần) / `month=YYYY-MM` / `semester=1\|2` / `year=1`, `&branchid=&gradeid=` | admin, user |
| GET | `/scores/export` | Query như `/scores/ranking`; trả file `.xlsx` (mục 9.8) | admin, user |
| GET | `/scores/periods` | `?schoolyearid=` (bắt buộc) | admin, user |
| GET | `/scores/weekly` | `?weekid=` (bắt buộc) `&branchid=&gradeid=`; chi tiết điểm gốc từng phần của 1 tuần | admin, user |
| GET | `/scores/summary` | `?schoolyearid=` (bắt buộc) `&fromweek=&toweek=&branchid=&gradeid=`; cộng dồn khoảng tuần tùy chọn | admin, user |
| GET | `/scores/class/:classid` | `?schoolyearid=` (bắt buộc) | admin, user |
| POST | `/auth/login` | `{ username, password }` → `{ token, account }` | public |
| GET | `/auth/me` | Tài khoản đang đăng nhập | admin, user |
| PUT | `/auth/password` | `{ oldPassword, newPassword }` | admin, user |
| GET | `/accounts` | `?role=admin\|user&active=true\|false` | admin |
| GET | `/accounts/:id` | | admin |
| POST | `/accounts` | `{ username, password, role, teacherid?, studentid? }` | admin |
| PUT | `/accounts/:id` | `{ username?, password? (đặt lại), active? (false = khóa) }` | admin |
| DELETE | `/accounts/:id` | | admin |
| PUT | `/accounts/:id/classes` | `{ classIds: number[] }` thay toàn bộ lớp cờ đỏ chấm | admin |

Giới hạn dữ liệu và mã lỗi của từng route được ghi trong note ở `src/router/*Router.ts`.

### Dữ liệu lớp trả về

```json
{
  "id": 1, "seq": 1, "gradeid": 1, "branchid": 1, "teacherid": 1,
  "numgrade": 6, "branchcode": "A", "branchname": "Phân hiệu 1",
  "teachername": "Nguyễn Văn An", "name": "6A1", "numstudents": 48,
  "archivedyearid": null, "archivedyearname": null,
  "created_at": "...", "updated_at": "..."
}
```

`teacherid`, `teachername` là `null` khi lớp chưa có GVCN. `archivedyearid`, `archivedyearname` khác `null` khi lớp đã ra trường (lưu trữ ở năm học đó). `GET /classes/:id` trả thêm `students[]`, mỗi phần tử:

```json
{
  "id": 1, "code": "2609138407", "name": "Hồ Đặng Minh An", "gender": "Nam", "birthdate": "2015-09-02", "classid": 1,
  "classname": "6A1", "gradeid": 1, "branchid": 1, "created_at": "...", "updated_at": "..."
}
```

### Dữ liệu lượt chấm (`GET /points` → `data[]`)

```json
{
  "id": 41, "weekid": 8, "classid": 1, "type": "Nề nếp", "content": "Đi học muộn (2 bạn)", "value": -4,
  "classname": "6A1", "numweek": 8, "schoolyearid": 1, "locked": false,
  "students": [{ "id": 12, "code": "2609138512", "name": "..." }, { "id": 15, "code": "...", "name": "..." }],
  "accountid": 5, "accountusername": "codo.duc", "classteacherid": 1,
  "created_at": "...", "updated_at": "..."
}
```

`students` luôn là mảng (rỗng nếu không gắn học sinh). `accountid` / `accountusername` là người nhập (null nếu nhập trước khi có đăng nhập hoặc tài khoản đã bị xóa); `classteacherid` là GVCN của lớp.

### Dữ liệu người dùng (`GET /auth/me` → `data`)

```json
{
  "id": 5, "username": "codo.duc", "role": "user", "kind": "codo", "active": true,
  "teacherid": null, "teachername": null, "homeroomclassid": null, "homeroomclassname": null,
  "studentid": 1, "studentcode": "SEED000001", "studentname": "Hoàng Minh Đức",
  "studentclassid": 3, "studentclassname": "7A1",
  "classes": [{ "id": 1, "name": "6A1" }, { "id": 2, "name": "6A2" }],
  "created_at": "...", "updated_at": "..."
}
```

`homeroomclass*` là lớp chủ nhiệm của GVCN (null nếu chưa được phân lớp); `studentclass*` là lớp của cờ đỏ (không được chấm); `classes` là lớp cờ đỏ được phân công, `[]` với admin và GVCN. `GET /accounts` trả mỗi tài khoản cùng dạng này. `POST /auth/login` trả `{ token, account }` với `account` cùng dạng.

### Dữ liệu xếp hạng (`GET /scores/ranking` → `data`)

```json
{
  "schoolyear": { "id": 1, "name": "2026-2027", "numweeks": 35, "semester2_week": 19, "...": "..." },
  "period": {
    "type": "month", "value": "2026-10", "label": "Tháng 10/2026",
    "fromweek": 4, "toweek": 8, "startdate": "2026-09-28", "enddate": "2026-11-01",
    "numweeks": 5, "countedweeks": 5, "weekids": [4, 5, 6, 7, 8]
  },
  "scores": [{
    "classid": 2, "classname": "6A2", "gradeid": 1, "numgrade": 6, "branchid": 1, "branchcode": "A", "seq": 2,
    "teacherid": 2, "teachername": "Trần Thị Bình",
    "weeks": 5, "conduct_plus": 6, "conduct_minus": 4, "conduct_score": 502,
    "study_plus": 3, "study_minus": 7, "study_score": 496,
    "total": 998, "avg_total": 199.6, "entries": 18, "rank": 1
  }]
}
```

`period.type` là `week` / `month` / `semester` / `year` (`value` = số tuần / `"YYYY-MM"` / `1`\|`2` / `null`); `label` ví dụ "Tuần 8", "Tháng 10/2026", "Học kỳ 1", "Năm học 2026-2027". `scores[]` đã sắp theo `rank` rồi khối → phân hiệu → seq.

`GET /scores/periods` trả `{ schoolyear, weeks[], months[], semesters[] }`; `months`/`semesters` mỗi phần tử là `{ value, label, fromweek, toweek, startdate, enddate }` (`value` là `"YYYY-MM"` hoặc `1`/`2`), `weeks` có thêm `month`, `semester`, `started`, `locked`.

### Dữ liệu bảng điểm tuần (`GET /scores/weekly` → `data.scores[]`)

```json
{
  "weekid": 8, "schoolyearid": 1, "numweek": 8, "locked": false,
  "classid": 1, "classname": "6A1", "gradeid": 1, "numgrade": 6,
  "branchid": 1, "branchcode": "A", "seq": 1, "teacherid": 1, "teachername": "Nguyễn Văn An",
  "conduct_base": 100, "conduct_plus": 3, "conduct_minus": 7, "conduct_score": 96,
  "study_base": 100, "study_plus": 0, "study_minus": 2, "study_score": 98,
  "total": 194, "entries": 4, "rank": 5
}
```

`*_minus` là tổng điểm bị trừ (số dương). Cột ngày (`startdate`, `enddate`, `created_at`...) trả về dạng `"YYYY-MM-DD"`.

### Định dạng response

```json
// Thành công
{ "success": true, "data": ..., "message": "Thành công" }

// Lỗi
{ "success": false, "message": "Dữ liệu không hợp lệ",
  "errors": [{ "field": "teacherIds", "message": "teacherIds bị trùng" }] }
```

Lỗi theo từng phần tử dùng field dạng `students[2].code`; lỗi về học sinh trong lượt chấm trả `errors: [{ studentid, name? }]`.

| Mã | Ý nghĩa |
|---|---|
| 200 / 201 | Thành công / tạo mới thành công |
| 400 | Dữ liệu gửi lên sai |
| 401 / 403 | Chưa đăng nhập, token hết hạn hoặc tài khoản bị khóa / không đủ quyền |
| 404 | Không tìm thấy |
| 409 | Trùng dữ liệu hoặc vi phạm quy tắc nghiệp vụ (xem mục 2) |
| 500 | Lỗi server |

## 6. Kiến trúc back-end

```
Request → router → (middleware auth) → controller → service → PostgreSQL
```

| Lớp | Thư mục | Vai trò |
|---|---|---|
| Router | `src/router/` | Khai báo đường dẫn, note mã lỗi từng route |
| Controller | `src/app/controller/` | Kiểm tra dữ liệu gửi lên, trả response |
| Service | `src/app/service/` | Quy tắc nghiệp vụ, câu SQL |
| Database | `cscript/init.sql` | Phần 1: bảng, view; phần 2: dữ liệu giai đoạn đầu |

Chạy dự án: cấu hình `.env`, tạo database rồi chạy `psql -U postgres -d QLHS -f cscript/init.sql`, sau đó `npm install` và `npm run dev`. Đăng nhập `admin` / `1` và đổi mật khẩu ngay. `init.sql` chạy lại được, không xóa dữ liệu: cột mới thêm bằng `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, dữ liệu chỉ thêm phần còn thiếu; đổi cấu trúc bảng khác thì DB cũ cần `ALTER TABLE` hoặc drop rồi chạy lại.

Front-end (Next.js + shadcn/ui) nằm ở `../FE`, chạy tại `http://localhost:3000`. Các trang:

| Nhóm | Trang |
|---|---|
| Đăng nhập | `/dang-nhap` (ngoài layout dashboard) |
| Thi đua | Tổng quan (`/`), Chấm điểm (`/cham-diem`), Xếp hạng (`/tong-hop`: tuần / tháng / học kỳ / khoảng tuần), Điểm lớp (`/diem-lop`) |
| Cấu hình | Năm học & tuần (`/nam-hoc`), Phân hiệu (`/phan-hieu`), Giáo viên (`/giao-vien`), Lớp học (`/lop-hoc`), Học sinh (`/hoc-sinh`), Tài khoản (`/tai-khoan`, chỉ admin) |

Trang được vào theo `kind` xem mục 3.

## 7. Dữ liệu giai đoạn đầu (`cscript/init.sql`)

DB mới chạy `init.sql` (cập nhật 2026-11-09) có:

| Dữ liệu | Số lượng | Nguồn |
|---|---|---|
| Phân hiệu, khối | 2 (A, B), 4 (6–9) | Cố định |
| Lớp | 55 (A: 34 lớp, B: 21 lớp; 6A1–9B6) | Danh sách học sinh thật của trường (Google Sheet) |
| Học sinh | 2493, chỉ lưu mã, họ tên, ngày sinh, giới tính | Cùng Google Sheet; không lưu căn cước, số điện thoại, địa chỉ, thông tin cha mẹ |
| Giáo viên | 55, mỗi lớp 1 GVCN (Trần Thị Ngọc Hà chủ nhiệm 6A2 và 7A4 nên có 2 bản ghi trùng tên) | Danh sách GVCN của nhà trường |
| Năm học | 2026-2027, 35 tuần từ 07/09/2026, điểm gốc 100/100, HK2 mặc định (tuần 19), chưa khóa tuần nào | Sinh trong `init.sql` |
| Lượt chấm | 0 | Nhập qua giao diện chấm điểm |
| Tài khoản | 1: `admin`, mật khẩu `1` | `init.sql`; GVCN / cờ đỏ tạo qua trang **Tài khoản** (xem [tai-khoan-dev.md](tai-khoan-dev.md)) |

Dữ liệu học sinh là thông tin cá nhân thật: `init.sql` không đưa lên repo công khai, không dùng làm dữ liệu mẫu trong tài liệu ngoài vài ví dụ minh họa.

## 8. Trạng thái và việc tiếp theo

| Hạng mục | Trạng thái |
|---|---|
| Phân hiệu, khối, giáo viên, lớp (GVCN không bắt buộc) | ✅ Có API, FE đã tích hợp |
| Học sinh, mã học sinh, chuyển lớp | ✅ Có API, FE đã tích hợp (`/hoc-sinh`) |
| Năm học, tuần, điểm gốc, khóa tuần, học kỳ | ✅ Có API, FE đã tích hợp |
| Chuyển năm học: chặn khi năm cũ chưa kết thúc, lưu trữ khối 9, lên lớp, tạo khối 6 | ✅ BE xong (`POST /school-years`, `GET /classes?archived=`); FE chưa hiển thị `promotion`, `grade6`, danh sách lớp ra trường (mục 9.7) |
| Chấm điểm thi đua (`point`), gắn học sinh vào lượt chấm | ✅ Có API, FE đã tích hợp |
| Xếp hạng theo tuần / tháng / học kỳ, cộng dồn khoảng tuần | ✅ Có API, FE đã tích hợp (`/tong-hop`) |
| Xếp hạng cả năm học (`year=1`), xuất Excel `/scores/export` | ✅ BE xong; FE chưa có nút tải Excel, lựa chọn "Cả năm" (mục 9.8) |
| Tài khoản admin/user (GVCN, cờ đỏ), phân công cờ đỏ, đăng nhập JWT | ✅ Có API `/auth`, `/accounts`, middleware; FE đã có `/dang-nhap`, `/tai-khoan` |
| Gắn phân quyền cho mọi API, GVCN chỉ xem, cờ đỏ chỉ chấm lớp được phân công, ghi `point.accountid` | ✅ BE xong; FE đã gửi token và chặn trang (mục 9.1–9.4) |
| Refresh token | ⬜ Chưa có; token hết hạn sau 30 phút thì phải đăng nhập lại |
| Nhập học sinh từ file Excel/Sheet qua API | ⬜ Hiện nhập một lần bằng script; FE dán nhiều dòng vào `POST /students` |
| Tài liệu Swagger | ⬜ Đã cài thư viện, chưa tích hợp |
| Build production (`tsconfig.json`, script `npm start`) | ⬜ Chưa có `tsconfig.json`, `npm start` trỏ sai file (xem `CLAUDE.md`) |

## 9. Hướng dẫn tích hợp FE

Gom từ các file bàn giao `fe-handoff-hoc-sinh.md`, `fe-handoff-phan-quyen.md`, `fe-handoff-len-lop.md`, `fe-handoff-xuat-excel.md` (2026-11-03 → 2026-11-09), đã bỏ phần đã làm xong và đối chiếu lại với code BE ngày 2026-11-10. FE nằm ở `../FE`, gọi BE qua `src/lib/api.ts`.

### 9.1. Đăng nhập và token

- Trang `/dang-nhap` (ngoài layout `(dashboard)`): `POST /auth/login` → lưu `token`, dùng luôn `account` trả kèm làm thông tin người dùng.
- Hàm `api()` gửi `Authorization: Bearer <token>` cho mọi request.
- **401** ở bất kỳ API nào (trừ `/auth/login`): xóa token, về `/dang-nhap`. Xảy ra khi token hết hạn (mặc định 30 phút, chưa có refresh token) hoặc admin vừa khóa / xóa tài khoản (có hiệu lực ngay).
- **403**: hiện toast `message` của BE ("Không có quyền thực hiện", "Không có quyền chấm điểm lớp này"...).
- Đăng xuất: chỉ xóa token phía FE (BE không có API logout).
- Đổi mật khẩu: `PUT /auth/password` `{ oldPassword, newPassword }`; 400 khi mật khẩu cũ sai, mật khẩu mới < 6 ký tự / > 72 byte hoặc trùng mật khẩu cũ. Form đăng nhập không chặn độ dài (tài khoản dev có mật khẩu `1`).
- `DEMO_MODE` không gọi BE; script chụp snapshot demo phải đăng nhập `admin` rồi gửi token.

### 9.2. Thông tin người dùng (`GET /auth/me`)

```ts
type Kind = "admin" | "gvcn" | "codo"
type Me = {
  id: number; username: string; role: "admin" | "user"; kind: Kind; active: boolean
  teacherid: number | null; teachername: string | null              // admin / GVCN
  homeroomclassid: number | null; homeroomclassname: string | null  // GVCN: lớp chủ nhiệm
  studentid: number | null; studentcode: string | null; studentname: string | null  // cờ đỏ
  studentclassid: number | null; studentclassname: string | null    // cờ đỏ: lớp của mình (không được chấm)
  classes: { id: number; name: string }[]                           // cờ đỏ: lớp được phân công, [] với admin / GVCN
  created_at: string; updated_at: string
}
```

- Header hiển thị `teachername ?? studentname ?? username` kèm nhãn theo `kind` ("Quản lý nề nếp" / "GVCN 6A1" / "Cờ đỏ 7A1").
- **Lớp được chấm**: admin = mọi lớp; gvcn = không lớp nào; codo = `classes.map(c => c.id)`.

### 9.3. Menu và chặn trang

| Trang | admin | gvcn | codo |
|---|---|---|---|
| `/` Tổng quan | ✅ | ✅ | ✅ |
| `/cham-diem` Chấm điểm | ✅ | ✅ chỉ xem | ✅ |
| `/tong-hop` Xếp hạng, `/diem-lop` Điểm lớp | ✅ | ✅ | ❌ |
| `/nam-hoc`, `/phan-hieu`, `/giao-vien`, `/lop-hoc`, `/hoc-sinh` | ✅ sửa được | ✅ chỉ xem | ❌ |
| `/tai-khoan` | ✅ | ❌ | ❌ |

Lọc menu theo `me.kind` và chuyển về `/` khi mở trang không được phép. Đây là giới hạn hiển thị (BE không chặn cờ đỏ đọc xếp hạng hay giáo viên); quyền ghi BE vẫn tự chặn.

**Ẩn nút ghi khi `kind !== "admin"`** (BE trả 403): thêm / sửa / xóa phân hiệu, giáo viên, lớp (kể cả đổi GVCN), học sinh (kể cả chuyển lớp), năm học, tuần (điểm gốc, khóa / mở khóa tuần), tài khoản.

### 9.4. Chấm điểm (`/cham-diem`)

- Mọi người xem được bảng điểm tất cả lớp. Nút "Thêm lượt chấm" chỉ hiện với lớp nằm trong **lớp được chấm** (9.2); cờ đỏ nên mặc định chọn lớp được phân công đầu tiên.
- Nút sửa / xóa từng lượt: admin luôn hiện; gvcn không hiện; codo hiện khi `point.accountid === me.id` **và** lớp nằm trong `me.classes`.
- Hiện "Người nhập: `accountusername`" (null → "Không rõ").
- Cờ đỏ chưa được phân công lớp (`classes = []`): báo "Bạn chưa được phân công lớp chấm điểm, liên hệ giáo viên quản lý nề nếp".
- Thứ tự lỗi: chưa có quyền → 403 trước, có quyền nhưng tuần đã khóa → 409.
- **Gắn học sinh** (ô chọn nhiều, tìm theo tên / mã, nguồn `GET /students?classid=<lớp đang chấm>`): khi sửa thì chọn sẵn `students` hiện có, chỉ gửi `studentIds` khi người dùng đổi danh sách (bỏ trường = giữ nguyên, `[]` = bỏ hết). Lỗi:

| Mã | Khi nào |
|---|---|
| 400 | `studentIds` không phải mảng id dương ("studentIds phải là mảng id học sinh") hoặc bị trùng ("studentIds bị trùng"); học sinh không thuộc lớp của lượt chấm (`errors: [{ studentid, name }]`, chỉ kiểm tra học sinh **mới gắn**) |
| 404 | Học sinh không tồn tại (`errors: [{ studentid }]`) |
| 409 | Tuần đã khóa (không sửa được cả danh sách học sinh) |

- Danh sách lượt chấm hiện tên học sinh dưới nội dung ("Đi trễ · Nguyễn Văn A, Trần Thị B").
- Cờ đỏ chỉ mở picker học sinh cho lớp được chấm: `GET /students?classid=` lớp khác trả 403.
- Sau khi tạo / sửa / xóa lượt chấm, làm mới bảng điểm và `/points?studentid=` nếu đang mở.

### 9.5. Lớp, học sinh

```ts
type ClassItem = {
  id: number; seq: number; gradeid: number; branchid: number
  teacherid: number | null; teachername: string | null   // null = chưa có GVCN → hiện "Chưa có GVCN"
  numgrade: number; branchcode: string; branchname: string; name: string  // "6A1"
  numstudents: number
  archivedyearid: number | null; archivedyearname: string | null          // khác null = lớp đã ra trường
  created_at: string; updated_at: string
}
type Student = {
  id: number
  code: string              // mã học sinh, chữ/số, 1–20 ký tự, duy nhất toàn trường
  name: string              // ≤ 50 ký tự, BE tự trim
  gender: "Nam" | "Nữ" | null
  birthdate: string | null  // "YYYY-MM-DD", hiển thị dd/mm/yyyy
  classid: number; classname: string; gradeid: number; branchid: number
  created_at: string; updated_at: string
}
```

- `teachername: null` có thể xuất hiện ở mọi chỗ trả lớp hoặc điểm (`/classes`, `/scores/*`). Dialog đổi GVCN có lựa chọn "Bỏ phân công" → `PUT /classes/:id` `{ "teacherid": null }`.
- Tạo lớp chưa có GVCN: `POST /classes` với phần tử `null` trong `teacherIds`.
- Thêm học sinh: form 1 người hoặc dán nhiều dòng → `POST /students`. Lỗi theo field `students[i].code`, `students[i].name`...; mã trùng trong cùng request → 400 "Mã học sinh bị trùng", trùng trong DB → 409 "Dữ liệu bị trùng". PUT: gửi `null` để xóa `gender` / `birthdate`, bỏ trường để giữ nguyên.
- Toàn trường ~2500 học sinh: nên lọc theo lớp hoặc phân trang ở FE.
- Lịch sử vi phạm / khen của 1 học sinh: `GET /points?studentid=` (có `numweek`, `classname`, `type`, `content`, `value`).
- Xóa bị chặn 409: lớp còn học sinh hoặc đã có điểm; học sinh đã gắn vào lượt chấm ("Học sinh X đã có trong N lượt chấm điểm, không thể xóa").
- Sau khi thêm / xóa / chuyển học sinh, làm mới cả `/classes` (sĩ số) và `/students`.

### 9.6. Xếp hạng (`/tong-hop`)

```ts
type PeriodRange = { value: string | number; label: string; fromweek: number; toweek: number; startdate: string; enddate: string }
type PeriodWeek = { id: number; numweek: number; startdate: string; enddate: string; locked: boolean
                    month: string /* "2026-10" */; semester: 1 | 2; started: boolean }
// GET /scores/periods → { schoolyear, weeks: PeriodWeek[], months: PeriodRange[], semesters: PeriodRange[] }
```

- Chọn năm học → **Tuần | Tháng | Học kỳ | Cả năm** → ô chọn lấy từ `/scores/periods` (mặc định phần tử cuối có `started`); `week` là `numweek`, không phải `weekid`. Cả năm gửi `year=1`. Lọc thêm phân hiệu / khối (hạng tính trong phạm vi lọc).
- Bảng: hạng, lớp, GVCN, Nề nếp, Học tập, tổng, TB / tuần; hiện "Đã tính X/Y tuần" khi `countedweeks < numweeks`.
- 409 (khoảng chưa bắt đầu) hiện trạng thái rỗng thay vì lỗi; có thể ẩn / khóa các mục chưa `started`.
- Lỗi 400 của `/scores/ranking` và `/scores/export`: "schoolyearid không hợp lệ", "Chọn đúng 1 trong week, month, semester, year", "week là số tuần 1-60", "month dạng YYYY-MM", "semester là 1 hoặc 2", "year là 1 (cả năm học)", "branchid/gradeid không hợp lệ". 404: năm học / khoảng không tồn tại ("Năm học 2026-2027 không có tháng 1/2025").
- Trang năm học có ô "Tuần bắt đầu học kỳ 2" (`semester2_week`, 2..numweeks; PUT `null` = về mặc định).

### 9.7. Chuyển năm học, lên lớp (FE chưa làm)

Nghiệp vụ ở mục 4.7. Việc cần làm ở FE:

| Chỗ FE | Cần sửa |
|---|---|
| Dialog **Tạo năm học** (`school-years-view.tsx`) | Khóa nút / hiện ghi chú khi năm mới nhất có `enddate >= hôm nay` (BE trả 409 "Năm học ... chưa kết thúc ..."); `min` ngày bắt đầu = `enddate + 1`. Khi đã có năm cũ: ghi rõ "Tạo năm học sẽ lên lớp: lớp 9 ra trường, lớp 6–8 lên một khối, tạo lớp 6 mới. **Không hoàn tác được.**", hiện ô số lớp 6 cho từng phân hiệu (mặc định = số lớp khối 6 hiện có) gửi `grade6`, bắt buộc xác nhận |
| Toast sau khi tạo | `data.promotion` khác null thì hiện kết quả, ví dụ "Lên lớp từ 2026-2027: 15 lớp 9 ra trường, 40 lớp lên khối, tạo 13 lớp 6 mới" |
| SWR sau khi tạo | Làm mới `/classes`, `/students`, `/teachers`, `/accounts`, `/scores/*` (hoặc revalidate toàn bộ) vì lên lớp đổi lớp, GVCN lớp 9, tài khoản cờ đỏ |
| `types.ts` | `ClassItem` thêm `archivedyearid`, `archivedyearname` (9.5); kết quả `POST /school-years` là `SchoolYear & { promotion: Promotion \| null }` |
| Trang lớp / chi tiết lớp | Lớp có `archivedyearid` khác null: nhãn "Đã ra trường (năm học ...)", ẩn đổi GVCN / thêm học sinh / chấm điểm (BE trả 409). Có thể thêm mục **Lớp đã ra trường** (`GET /classes?archived=true`, gom theo `archivedyearname`) |
| Sau khi lên lớp | Dẫn admin: nhập học sinh lớp 6, phân công GVCN lớp 6 (GV chủ nhiệm lớp 9 cũ đã rảnh), kiểm tra lại GVCN và phân công cờ đỏ |

```ts
type Promotion = {
  fromschoolyear: string                    // năm vừa kết thúc
  archived: { id: number; name: string }[]  // lớp 9 ra trường
  promoted: number                          // số lớp lên 1 khối
  created: { id: number; name: string }[]   // lớp 6 mới
  deactivatedAccounts: number               // tài khoản cờ đỏ của học sinh ra trường bị khóa
}
// POST /school-years body thêm grade6?: { branchid: number; count: number /* 0-30 */ }[]
// Không gửi = mỗi phân hiệu bằng số lớp 6 năm cũ; phân hiệu không có trong mảng = không tạo lớp 6
```

Lỗi mới: 409 năm cũ chưa kết thúc / `startdate` ≤ ngày kết thúc năm cũ; 400 `grade6` sai dạng; 404 `branchid` trong `grade6` không tồn tại; 409 "Lớp 9A1 đã ra trường (lưu trữ năm học ...), không thể thay đổi" khi ghi vào lớp ra trường (đổi GVCN, thêm / chuyển học sinh vào, tạo lượt chấm, phân công cờ đỏ). `DELETE /school-years/:id` thêm 409 khi năm có lớp ra trường.

Thử trên DB riêng (không dùng `QLHS`): tạo DB, chạy `init.sql`, lùi năm 2026-2027 về quá khứ (`UPDATE school_year SET startdate = startdate - 420; UPDATE week SET startdate = startdate - 420, enddate = enddate - 420;`), chạy BE với `DB_NAME` đó rồi tạo năm học mới.

### 9.8. Xuất Excel (FE chưa làm)

`GET /scores/export` nhận đúng query của `/scores/ranking` (9.6), trả file `.xlsx` với header `Content-Disposition: attachment; filename="diem-thi-dua_2026-2027_tuan-8.xlsx"` (đã mở `Access-Control-Expose-Headers`). Lỗi vẫn trả JSON. Nội dung file xem `src/router/scoreRouter.ts`: file tuần có điểm gốc từng phần và cột "Chi tiết cộng / trừ" (mỗi lượt 1 dòng `[Nề nếp] Vệ sinh lớp chưa sạch: -2`, không ghi học sinh); file tháng / học kỳ / năm có Số tuần, TB / tuần.

Không dùng `<a href>` (cần header `Authorization`) hay `api()` (luôn đọc JSON). Thêm vào `src/lib/api.ts`:

```ts
// Tải file từ BE (vd Excel). Lỗi BE vẫn trả JSON { success, message } → ném ApiError như api()
export async function apiDownload(path: string, fallbackName = "download.xlsx") {
  const token = getToken()
  if (!token) {
    redirectToLogin()
    throw new ApiError(UNAUTHORIZED, 401)
  }
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new ApiError(`Không kết nối được máy chủ (${API_URL})`, 0)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    if (res.status === 401) {
      clearToken()
      redirectToLogin()
    }
    throw new ApiError(body?.message ?? "Không tải được file", res.status)
  }
  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition) ?? /filename="([^"]+)"/.exec(disposition)
  const filename = match ? decodeURIComponent(match[1]) : fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

Trang `/tong-hop`: nút **Tải Excel** cạnh bộ lọc, dựng query giống lúc gọi `/scores/ranking` rồi `await apiDownload(`/scores/export?${query}`)`; khóa nút khi đang tải hoặc khoảng chưa bắt đầu, toast khi lỗi; ẩn ở `DEMO_MODE`.

### 9.9. Tài khoản (`/tai-khoan`, chỉ admin)

- Form tạo: **Quản lý nề nếp** → `role: "admin"` (chọn giáo viên không bắt buộc); **GVCN** → `role: "user"` + `teacherid`; **Cờ đỏ** → `role: "user"` + `studentid` (chọn lớp → học sinh). `username` 3–50 ký tự (chữ thường, số, `.`, `_`, `-`), `password` 6 ký tự – 72 byte.
- Không đổi được loại tài khoản / người gắn (400): xóa và tạo lại.
- Cờ đỏ có nút "Phân công lớp" (chọn nhiều lớp, loại `studentclassid`, loại lớp ra trường) → `PUT /accounts/:id/classes`.
- Cờ đỏ hết nhiệm kỳ: **Khóa** (`active: false`) thay vì xóa để giữ tên người nhập trên lượt chấm.
- Lỗi: 400 dữ liệu sai / không phải cờ đỏ / chứa lớp của chính em đó; 404 không có GV / HS / lớp; 409 trùng username, GV / HS đã có tài khoản, tự khóa / xóa mình, khóa / xóa admin hoạt động cuối cùng, lớp ra trường.

## 10. Nhật ký thay đổi API cho FE

| Ngày | Thay đổi | Mục |
|---|---|---|
| 2026-11-03 | Học sinh (`/students`), lớp chưa có GVCN, sĩ số; gắn học sinh vào lượt chấm (`studentIds`, `GET /points?studentid=`); xếp hạng tuần / tháng / học kỳ (`/scores/ranking`, `/scores/periods`), `semester2_week` | 9.4, 9.5, 9.6 |
| 2026-11-04 | Bắt buộc đăng nhập mọi API, 3 loại người dùng (`kind`), GVCN chỉ xem, cờ đỏ chấm lớp được phân công, `point.accountid`, trang Tài khoản | 9.1–9.4, 9.9 |
| 2026-11-09 | Chuyển năm học / lên lớp, lớp ra trường (`archived`), `grade6`, `promotion`; DB chỉ còn `cscript/init.sql` | 4.7, 9.7 |
| 2026-11-09 | Xếp hạng cả năm (`year=1`), `period.weekids`, xuất Excel `/scores/export` | 9.6, 9.8 |
