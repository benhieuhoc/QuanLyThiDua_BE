# Bàn giao FE: Đăng nhập và phân quyền (admin, GVCN, cờ đỏ)

Ngày: 2026-11-04 · BE đã xong và đã kiểm tra trên DB tạm. Contract đầy đủ: [Ai_rules/code-map.md](../Ai_rules/code-map.md), quy tắc quyền: [Ai_rules/security.md](../Ai_rules/security.md), note từng route: `src/router/authRouter.ts`, `src/router/accountRouter.ts`, `src/router/pointRouter.ts`.

## Tóm tắt

1. **Mọi API giờ bắt buộc đăng nhập** (trừ `GET /` và `POST /auth/login`). Không gửi token → **401**. FE hiện tại chưa gửi token nên **mọi trang sẽ lỗi cho tới khi tích hợp đăng nhập**.
2. Có 3 loại người dùng, phân biệt bằng `kind` trong `GET /auth/me`:

| `kind` | `role` | Ai | Trang được vào |
|---|---|---|---|
| `admin` | `admin` | Giáo viên quản lý nề nếp | Tất cả, kể cả trang mới **Tài khoản** |
| `gvcn` | `user` | Giáo viên chủ nhiệm | Mọi trang **chỉ xem**, không thao tác gì, **kể cả chấm điểm** (cập nhật 2026-11-04) |
| `codo` | `user` | Cờ đỏ (học sinh) | **Chỉ trang Tổng quan (`/`) và Chấm điểm (`/cham-diem`)** |

3. **Quyết định nghiệp vụ: cờ đỏ chỉ được vào Tổng quan và Chấm điểm.** FE ẩn các mục menu khác và chuyển hướng về `/` nếu cờ đỏ mở URL trang khác. BE vẫn tự chặn ghi và chặn xem học sinh ngoài lớp được phân công, nhưng **không** chặn cờ đỏ đọc xếp hạng hay danh sách giáo viên. Vì vậy chặn trang là việc của FE.

## Tài khoản dev

Mật khẩu tất cả: `1` (dữ liệu từ `cscript/seed.sql`, chỉ dev). Mật khẩu đặt qua API (tạo tài khoản, đổi / đặt lại mật khẩu) vẫn phải từ 6 ký tự; form đăng nhập không được chặn độ dài.

| username | kind | Ghi chú |
|---|---|---|
| `admin` | admin | |
| `gvcn.6a1`, `gvcn.7a1`, `gvcn.6b1` | gvcn | Chủ nhiệm lớp tương ứng |
| `codo.duc` | codo | HS lớp 7A1, chấm lớp 6A1, 6A2 |
| `codo.ha` | codo | HS lớp 6A2, chấm lớp 7A1 |

## Việc cần làm ở FE

### 1. Đăng nhập và gửi token (`src/lib/api.ts`)

- Trang mới `/dang-nhap` (ngoài layout `(dashboard)`): form username + mật khẩu → `POST /auth/login`.
- Lưu `token`; trong hàm `api()` thêm header `Authorization: Bearer <token>` cho mọi request.
- Nhận **401** ở bất kỳ API nào (trừ chính `/auth/login`): xóa token, chuyển về `/dang-nhap`. 401 xảy ra khi token hết hạn (mặc định **30 phút**, BE chưa có refresh token) hoặc khi admin khóa / xóa tài khoản đang dùng (có hiệu lực ngay).
- Nhận **403**: hiện toast `message` của BE ("Không có quyền thực hiện", "Không có quyền chấm điểm lớp này"...).
- Đăng xuất: xóa token phía FE (BE không có API logout).
- `DEMO_MODE` không đổi. Nhưng `scripts/snapshot-demo.mjs` đang gọi BE không có token nên sẽ nhận 401: cần login bằng `admin` rồi gửi token khi chụp snapshot.

### 2. Thông tin người dùng (`GET /auth/me`)

Gọi sau khi đăng nhập (hoặc dùng `account` trả kèm trong `/auth/login`), lưu vào context/SWR để mọi trang dùng.

```ts
type Me = {
  id: number
  username: string
  role: "admin" | "user"
  kind: "admin" | "gvcn" | "codo"
  active: boolean
  teacherid: number | null        // admin / GVCN
  teachername: string | null
  homeroomclassid: number | null  // GVCN: lớp chủ nhiệm (null nếu chưa được phân lớp)
  homeroomclassname: string | null
  studentid: number | null        // cờ đỏ
  studentcode: string | null
  studentname: string | null
  studentclassid: number | null   // cờ đỏ: lớp của chính em đó (không được chấm)
  studentclassname: string | null
  classes: { id: number; name: string }[]  // cờ đỏ: lớp được phân công chấm, [] với admin/GVCN
  created_at: string
  updated_at: string
}
```

- `app-header.tsx` đang ghi cứng "Quản trị viên / admin": thay bằng `teachername ?? studentname ?? username`, kèm nhãn theo `kind` ("Quản lý nề nếp" / "GVCN 6A1" / "Cờ đỏ 7A1"). Thêm menu đổi mật khẩu và đăng xuất.
- **Lớp được chấm** (dùng ở trang Chấm điểm):
  - admin: mọi lớp
  - gvcn: `[]` (không chấm lớp nào, kể cả lớp chủ nhiệm)
  - codo: `classes.map(c => c.id)`

### 3. Menu và chặn trang (`src/components/layout/nav.ts`, `sidebar-nav.tsx`, `layout.tsx`)

| Trang | admin | gvcn | codo |
|---|---|---|---|
| `/` Tổng quan | ✅ | ✅ | ✅ |
| `/cham-diem` Chấm điểm | ✅ | ✅ | ✅ |
| `/tong-hop` Xếp hạng | ✅ | ✅ | ❌ |
| `/diem-lop` Điểm lớp | ✅ | ✅ | ❌ |
| `/nam-hoc`, `/phan-hieu`, `/giao-vien`, `/lop-hoc`, `/hoc-sinh` | ✅ sửa được | ✅ chỉ xem | ❌ |
| `/tai-khoan` (mới) | ✅ | ❌ | ❌ |

Gợi ý: thêm `roles?: Kind[]` vào `NavItem`; lọc menu theo `me.kind`; trong `(dashboard)/layout.tsx` chuyển hướng về `/` nếu trang hiện tại không có trong danh sách được phép.

### 4. Ẩn nút ghi với người không phải admin

BE trả 403 cho các thao tác dưới đây nếu không phải admin. FE nên **ẩn nút** với `kind !== "admin"`:

| File | Thao tác |
|---|---|
| `branches-view.tsx` | Thêm / sửa / xóa phân hiệu |
| `teachers-view.tsx` | Thêm / sửa / xóa giáo viên |
| `classes-view.tsx` | Tạo lớp, đổi GVCN, xóa lớp |
| `students-view.tsx` | Thêm / sửa / chuyển lớp / xóa học sinh |
| `school-years-view.tsx` | Tạo / sửa / xóa năm học, sửa tuần (điểm gốc, khóa) |
| `scores.tsx` → `LockWeekButton` | Khóa / mở khóa tuần (đang dùng ở nhiều trang) |

### 5. Trang Chấm điểm (`scoring-view.tsx`)

Quyền chấm điểm BE đang áp dụng:

| | Tạo lượt chấm | Sửa / xóa lượt chấm |
|---|---|---|
| admin | Mọi lớp | Mọi lượt |
| gvcn | ❌ Không (403) | ❌ Không (403) |
| codo | Lớp được phân công, **không phải lớp của mình** | **Chỉ lượt do chính mình nhập**, và lớp vẫn đang được phân công |

Lượt chấm (`GET /points`) có thêm 3 trường:

```ts
type Point = {
  // ...các trường cũ
  accountid: number | null        // tài khoản nhập; null = nhập trước khi có đăng nhập hoặc tài khoản đã bị xóa
  accountusername: string | null  // hiển thị "Người nhập"
  classteacherid: number | null   // GVCN của lớp
}
```

Việc cần làm:

- Danh sách lớp bên trái (từ `/scores/weekly`): mọi người vẫn **xem** được bảng điểm tất cả lớp. Nút "Thêm lượt chấm" chỉ hiện khi lớp nằm trong **lớp được chấm** (mục 2). Với cờ đỏ, nên mặc định chọn lớp được phân công đầu tiên; có thể lọc danh sách chỉ còn lớp được phân công.
- Nút sửa / xóa từng lượt:
  - admin: luôn hiện
  - gvcn: không bao giờ hiện
  - codo: hiện khi `point.accountid === me.id` và lớp nằm trong `me.classes`
- Hiển thị cột / dòng nhỏ "Người nhập: `accountusername`" (null → "Không rõ").
- Cờ đỏ không có lớp nào được phân công (`classes` rỗng): hiện thông báo "Bạn chưa được phân công lớp chấm điểm, liên hệ giáo viên quản lý nề nếp".
- Tuần đã khóa vẫn trả **409** như cũ. Nếu chưa có quyền thì BE trả 403 trước, rồi mới tới 409.

### 6. Học sinh với cờ đỏ

`StudentPicker` gọi `GET /students?classid=` để gắn học sinh vào lượt chấm:

- Lớp được phân công → trả bình thường.
- Lớp khác → **403**. Chỉ mở picker cho lớp cờ đỏ được chấm thì sẽ không gặp lỗi này.
- `GET /students` không truyền `classid` → chỉ trả học sinh của lớp được phân công.
- `GET /classes/:id` với lớp không được phân công → `students: []` (sĩ số `numstudents` vẫn đúng).

Lượt chấm (`GET /points`) vẫn trả tên học sinh đã gắn ở mọi lớp. Cờ đỏ xem được, vì đây là thông tin công khai trên bảng thi đua.

### 7. Trang mới: Tài khoản (`/tai-khoan`, chỉ admin)

| Method | Path | Body / Query | Ghi chú lỗi |
|---|---|---|---|
| GET | `/accounts` | `?role=admin\|user&active=true\|false` | Kèm `kind`, `teachername`, `homeroomclassname`, `studentname`, `studentclassname`, `classes[]` (cùng dạng `Me`) |
| GET | `/accounts/:id` | | 404 |
| POST | `/accounts` | `{ username, password, role, teacherid?, studentid? }` | 400 sai dữ liệu, 404 không có GV/HS, 409 trùng username / GV hoặc HS đã có tài khoản |
| PUT | `/accounts/:id` | `{ username?, password?, active? }` | `password` = đặt lại mật khẩu, `active: false` = khóa. 409 tự khóa mình / khóa admin cuối cùng |
| DELETE | `/accounts/:id` | | 409 tự xóa mình / xóa admin cuối cùng. Lượt chấm đã nhập vẫn giữ (`accountid` → null) |
| PUT | `/accounts/:id/classes` | `{ classIds: number[] }` | Thay **toàn bộ** lớp cờ đỏ chấm (`[]` = bỏ hết). 400 nếu không phải cờ đỏ hoặc có lớp của chính em đó; 404 lớp không tồn tại |

Quy tắc form tạo tài khoản:

- Chọn loại: **Quản lý nề nếp** → `role: "admin"`, chọn giáo viên (không bắt buộc). **GVCN** → `role: "user"` + `teacherid`. **Cờ đỏ** → `role: "user"` + `studentid` (chọn lớp → học sinh).
- `username`: 3–50 ký tự, chữ thường, số, `.`, `_`, `-`. BE tự chuyển về chữ thường.
- `password`: tối thiểu 6 ký tự, tối đa 72 byte.
- Không sửa được loại tài khoản hay người gắn với tài khoản (BE trả 400). Muốn đổi thì xóa và tạo lại.
- Với cờ đỏ: có nút "Phân công lớp" (multi-select lớp, loại trừ `studentclassid`) → `PUT /accounts/:id/classes`.
- Cờ đỏ hết nhiệm kỳ: dùng **Khóa** (`active: false`) thay vì xóa, để còn giữ tên người nhập trên lượt chấm.

### 8. Đổi mật khẩu (mọi tài khoản)

`PUT /auth/password` với `{ oldPassword, newPassword }`. 400 khi mật khẩu cũ sai, mật khẩu mới không hợp lệ hoặc trùng mật khẩu cũ.

## Đăng nhập: response mẫu

```json
// POST /auth/login  { "username": "codo.duc", "password": "1" }
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": {
    "token": "eyJhbGciOi...",
    "account": {
      "id": 5, "username": "codo.duc", "role": "user", "kind": "codo",
      "teacherid": null, "teachername": null, "homeroomclassid": null, "homeroomclassname": null,
      "studentid": 1, "studentcode": "SEED000001", "studentname": "Hoàng Minh Đức",
      "studentclassid": 3, "studentclassname": "7A1",
      "classes": [{ "id": 1, "name": "6A1" }, { "id": 2, "name": "6A2" }],
      "active": true, "created_at": "2026-11-04", "updated_at": "2026-11-04"
    }
  }
}
```

| Mã | Khi nào | `message` |
|---|---|---|
| 400 | Thiếu username / mật khẩu | "Vui lòng nhập tên đăng nhập và mật khẩu" |
| 401 | Sai username hoặc mật khẩu (không phân biệt) | "Sai tài khoản hoặc mật khẩu" |
| 403 | Đúng mật khẩu nhưng tài khoản bị khóa | "Tài khoản đã bị khóa" |

Mọi API khác khi chưa đăng nhập: 401 "Chưa đăng nhập" (thiếu token) hoặc "Phiên đăng nhập không hợp lệ hoặc đã hết hạn".
