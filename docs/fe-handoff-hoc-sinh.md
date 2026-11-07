# Bàn giao FE: Học sinh, mã học sinh, lớp chưa có GVCN

Ngày: 2026-11-03 · Phía BE đã xong và đã kiểm tra trên DB dev. Contract đầy đủ: [Ai_rules/code-map.md](../Ai_rules/code-map.md), nghiệp vụ: [logic-trien-khai.md](logic-trien-khai.md), note từng route: `src/router/studentRouter.ts`, `src/router/classRouter.ts`.

## Tóm tắt thay đổi

1. **Entity mới: học sinh** (`/students`). Mỗi học sinh thuộc đúng 1 lớp, có **mã học sinh** (`code`) duy nhất. Học sinh chỉ là dữ liệu, không có tài khoản.
2. **Lớp có thể chưa có GVCN**: `teacherid` và `teachername` của lớp có thể là `null`.
3. **Lớp có sĩ số** (`numstudents`), `GET /classes/:id` trả kèm danh sách học sinh.
4. **Dữ liệu dev đã thay toàn bộ**: 55 lớp (6A1–6A8, 6B1–6B5, 7A1–7A9, 7B1–7B5, 8A1–8A8, 8B1–8B5, 9A1–9A9, 9B1–9B6), 2493 học sinh. **Tất cả lớp đang chưa có GVCN**, lượt chấm điểm cũ đã bị xóa. 20 giáo viên vẫn còn, đều chưa chủ nhiệm lớp nào.

## Thay đổi phá vỡ (FE hiện tại sẽ hiển thị sai)

`teachername: null` xuất hiện ở mọi chỗ trả lớp hoặc điểm: `GET /classes`, `GET /classes/:id`, `GET /teachers` (không đổi), `GET /scores/weekly`, `/scores/summary`, `/scores/class/:classid`.

| Chỗ FE | Hiện tại | Cần sửa |
|---|---|---|
| `src/lib/types.ts` `ClassItem`, kiểu điểm tuần/tổng hợp (dòng ~33, 103, 128) | `teacherid: number`, `teachername: string` | `number \| null`, `string \| null` |
| `classes-view.tsx:328`, `summary-view.tsx:122`, `weekly-scores-view.tsx:96`, `overview-view.tsx:115`, `scoring-view.tsx:440` | in thẳng `teachername` | hiện "Chưa có GVCN" (chữ mờ) khi null |
| `scoring-view.tsx:319`, `scores.tsx:219` | `` `GVCN ${teachername}` `` | ra "GVCN null"; đổi thành "Chưa có GVCN" |
| `classes-view.tsx:182`, `:230` (dialog đổi GVCN) | `String(cls.teacherid)` | ra `"null"`; xử lý lớp chưa có GVCN, thêm lựa chọn "Bỏ phân công" gửi `{ teacherid: null }` |

## API lớp (thay đổi)

| Method | Path | Thay đổi |
|---|---|---|
| GET | `/classes?branchid=&gradeid=` | Thêm `numstudents`; `teacherid`/`teachername` có thể null |
| GET | `/classes/:id` | Thêm `numstudents`, `students[]` (sắp theo id) |
| POST | `/classes` | `teacherIds` cho phép phần tử `null` = tạo lớp chưa có GVCN. Ví dụ `[5, null, null]` tạo 3 lớp, lớp đầu GVCN là GV 5 |
| PUT | `/classes/:id` | `{ "teacherid": null }` = bỏ GVCN |
| DELETE | `/classes/:id` | **409** khi lớp còn học sinh: `"Lớp 6A1 còn 48 học sinh, chuyển hoặc xóa học sinh trước"` |

```json
// GET /classes → data[]
{
  "id": 1, "seq": 1, "gradeid": 1, "branchid": 1, "teacherid": null,
  "numgrade": 6, "branchcode": "A", "branchname": "Phân hiệu 1",
  "teachername": null, "name": "6A1", "numstudents": 48,
  "created_at": "2026-11-03", "updated_at": "2026-11-03"
}
// GET /classes/:id → data = lớp như trên + "students": Student[]
```

## API học sinh (mới)

Quyền thiết kế: xem = admin, teacher; thêm/sửa/xóa = admin (auth chưa triển khai).

| Method | Path | Body / Query | Mã lỗi |
|---|---|---|---|
| GET | `/students` | `?classid=&branchid=&gradeid=` (không bắt buộc), sắp theo lớp → id | 400 |
| GET | `/students/:id` | | 400, 404 |
| POST | `/students` | `{ classid, students: [{ code, name, gender?, birthdate? }] }`, thêm nhiều học sinh vào 1 lớp | 400, 404 lớp, 409 trùng mã |
| PUT | `/students/:id` | `{ code?, name?, gender?, birthdate?, classid? }`, đổi `classid` = chuyển lớp | 400, 404, 409 trùng mã |
| DELETE | `/students/:id` | | 404 |

```ts
type Student = {
  id: number
  code: string              // mã học sinh, chữ/số, ≤ 20 ký tự, duy nhất toàn trường (vd "2609138407")
  name: string              // ≤ 50 ký tự
  gender: "Nam" | "Nữ" | null
  birthdate: string | null  // "YYYY-MM-DD"
  classid: number
  classname: string         // "6A1"
  gradeid: number
  branchid: number
  created_at: string
  updated_at: string
}
```

Validate (BE trả `errors[]` theo field, với POST là `students[i].code`, `students[i].name`...):

- `code`: bắt buộc khi tạo, chỉ chữ và số, 1–20 ký tự; trùng trong cùng request → 400 `"Mã học sinh bị trùng"`; trùng trong DB → 409 `"Dữ liệu bị trùng"`.
- `name`: bắt buộc khi tạo, ≤ 50 ký tự (BE tự trim).
- `gender`: `"Nam"`, `"Nữ"` hoặc `null`; `birthdate`: `"YYYY-MM-DD"` hoặc `null`. Khi PUT, gửi `null` để xóa giá trị, bỏ trường để giữ nguyên.

## Gợi ý giao diện

- **Trang Lớp học** (`/lop-hoc`): thêm cột Sĩ số; cột GVCN hiện "Chưa có GVCN" khi null; bấm vào lớp mở danh sách học sinh (`GET /classes/:id`). Khi tạo lớp, cho phép tạo lớp chưa chọn GVCN.
- **Danh sách học sinh**: bảng gồm STT, mã HS, họ tên, giới tính, ngày sinh (hiển thị dd/mm/yyyy); tìm theo tên/mã; lọc phân hiệu/khối/lớp (`GET /students?...`, khoảng 2500 dòng toàn trường nên nên lọc theo lớp hoặc phân trang ở FE). Có thể là trang mới (ví dụ `/hoc-sinh` trong nhóm cấu hình) hoặc panel trong trang lớp.
- **Thao tác**: thêm học sinh (form 1 người hoặc dán nhiều dòng → `POST /students`), sửa, chuyển lớp (chọn lớp cùng khối → `PUT` với `classid`), xóa (dùng `ConfirmDelete`).
- Sau khi thêm/xóa/chuyển học sinh cần làm mới cả `/classes` (sĩ số) và `/students`.

## Cập nhật 2: gắn học sinh vi phạm vào lượt chấm

BE đã xong và test trên DB dev. Không có endpoint mới; `/points` thêm trường, `/students` thêm 1 mã lỗi.

| Method | Path | Thay đổi |
|---|---|---|
| GET | `/points` | Thêm query `studentid` (lịch sử các lượt chấm có gắn học sinh này). Mỗi lượt chấm có thêm `students: [{ id, code, name }]` (luôn là mảng, rỗng nếu không gắn) |
| GET | `/points/:id` | Thêm `students[]` như trên |
| POST | `/points` | Body thêm `studentIds?: number[]` (không bắt buộc) |
| PUT | `/points/:id` | Body thêm `studentIds?: number[]`: **bỏ trường = giữ nguyên**, mảng = thay toàn bộ, `[]` = bỏ hết |
| DELETE | `/students/:id` | **409** khi học sinh đã được gắn vào lượt chấm: `"Học sinh X đã có trong N lượt chấm điểm, không thể xóa"` |

```ts
type PointStudent = { id: number; code: string; name: string }
// Point hiện có + students: PointStudent[]
```

Ràng buộc và mã lỗi của `studentIds` (POST/PUT):

- Không phải mảng id dương, hoặc bị trùng → 400, `errors: [{ field: "studentIds", message: "studentIds phải là mảng id học sinh" | "studentIds bị trùng" }]`.
- Học sinh không tồn tại → 404 `"Không tìm thấy học sinh"`, `errors: [{ studentid }]`.
- Học sinh không thuộc lớp của lượt chấm → 400 `"Học sinh không thuộc lớp của lượt chấm"`, `errors: [{ studentid, name }]`. Chỉ kiểm tra học sinh **mới gắn**: học sinh đã gắn từ trước rồi chuyển lớp vẫn giữ được khi PUT.
- Tuần đã khóa → 409 như cũ (không sửa được cả danh sách học sinh).
- Không giới hạn theo dấu điểm: lượt cộng cũng gắn tên được (ví dụ khen thưởng), FE có thể chỉ hiện ô chọn học sinh cho lượt trừ nếu muốn.

Gợi ý giao diện:

- **Form chấm điểm** (`/cham-diem`): thêm ô chọn nhiều học sinh (tìm theo tên/mã) lấy từ `GET /students?classid=<lớp đang chấm>`. Khi sửa lượt chấm, chọn sẵn `students` hiện có; chỉ gửi `studentIds` khi người dùng đổi danh sách.
- **Danh sách lượt chấm**: hiện tên học sinh dưới nội dung (ví dụ "Đi trễ · Nguyễn Văn A, Trần Thị B").
- **Trang học sinh** (`/hoc-sinh`): thêm "Lịch sử vi phạm" của 1 học sinh qua `GET /points?studentid=` (có `numweek`, `classname`, `type`, `content`, `value`). Xử lý 409 khi xóa học sinh đã gắn.
- Sau khi tạo/sửa/xóa lượt chấm, làm mới cả `/points?studentid=` nếu đang mở.

## Cập nhật 3: xếp hạng thi đua theo tuần / tháng / học kỳ

BE đã xong và test trên DB dev (server do session FE chạy). Thêm 2 endpoint, `/school-years` thêm 1 trường. `/scores/weekly` và `/scores/summary` **giữ nguyên**, nhưng trang xếp hạng nên chuyển sang `/scores/ranking`.

### `GET /scores/periods?schoolyearid=` — để dựng ô chọn

```ts
type PeriodRange = { value: string | number; label: string; fromweek: number; toweek: number; startdate: string; enddate: string }
type PeriodWeek = { id: number; numweek: number; startdate: string; enddate: string; locked: boolean;
                    month: string /* "2026-10" */; semester: 1 | 2; started: boolean }
// data
{ schoolyear: SchoolYear, weeks: PeriodWeek[], months: PeriodRange[] /* value "2026-10", label "Tháng 10/2026" */,
  semesters: PeriodRange[] /* value 1 | 2, label "Học kỳ 1" */ }
```

Lỗi: 400 `schoolyearid không hợp lệ`, 404 `Không tìm thấy năm học`. Dữ liệu dev (2026-2027, 35 tuần): tháng 9/2026 = tuần 1–3, tháng 10 = tuần 4–8, ...; HK1 = tuần 1–18, HK2 = tuần 19–35.

### `GET /scores/ranking?schoolyearid=&week=|month=|semester=&branchid=&gradeid=`

- `schoolyearid` bắt buộc; **đúng 1** trong `week` (số tuần 1–60, là `numweek`, không phải `weekid`), `month` (`YYYY-MM`), `semester` (`1` | `2`). `branchid`, `gradeid` không bắt buộc; rank tính trong phạm vi lọc.
- Chỉ tính các tuần **đã bắt đầu** (`started`). Tháng/học kỳ đang diễn ra thì `countedweeks < numweeks`.

```ts
// data
{
  schoolyear: SchoolYear,
  period: { type: "week" | "month" | "semester"; value: number | string; label: string /* "Tuần 8" | "Tháng 10/2026" | "Học kỳ 1" */;
            fromweek: number; toweek: number; startdate: string; enddate: string;
            numweeks: number /* số tuần trong khoảng */; countedweeks: number /* số tuần đã tính */ },
  scores: Array<{
    classid: number; classname: string; gradeid: number; numgrade: number; branchid: number; branchcode: string; seq: number;
    teacherid: number | null; teachername: string | null;
    weeks: number; conduct_plus: number; conduct_minus: number; conduct_score: number;
    study_plus: number; study_minus: number; study_score: number;
    total: number; avg_total: number; entries: number; rank: number   // rank theo total, cùng điểm cùng hạng (1, 1, 3)
  }>  // đã sắp theo rank, rồi khối → phân hiệu → seq
}
```

| Mã | Message |
|---|---|
| 400 | `schoolyearid không hợp lệ` · `Chọn đúng 1 trong week, month, semester` · `week là số tuần 1-60` · `month dạng YYYY-MM` · `semester là 1 hoặc 2` · `branchid/gradeid không hợp lệ` |
| 404 | `Không tìm thấy năm học` · `Năm học 2026-2027 không có tháng 1/2025` (khoảng không thuộc năm học) |
| 409 | `Học kỳ 2 chưa bắt đầu, chưa có điểm để xếp hạng` (khoảng chưa có tuần nào bắt đầu) |

### `/school-years` thêm `semester2_week`

- GET `/school-years`, `/school-years/:id`: thêm `semester2_week: number` (luôn có giá trị; chưa đặt thì là mặc định `CEIL(numweeks/2)+1`, dev hiện là 19).
- POST: body thêm `semester2_week?` (2..numweeks). PUT: body thêm `semester2_week?: number | null` (`null` = về mặc định). Ngoài khoảng → 400 `Tuần bắt đầu học kỳ 2 phải từ 2 đến N` (cả khi giảm `numweeks` nhỏ hơn tuần HK2 đã đặt).

### Gợi ý giao diện

- Trang xếp hạng: chọn năm học → tab/segmented **Tuần | Tháng | Học kỳ** → ô chọn lấy từ `/scores/periods` (mặc định tuần/tháng/học kỳ hiện tại: phần tử cuối có `started`). Thêm lọc phân hiệu/khối như bảng điểm tuần.
- Bảng: hạng, lớp, GVCN, Nề nếp, Học tập, tổng, TB/tuần; với tháng/học kỳ hiện "Đã tính X/Y tuần" khi `countedweeks < numweeks`.
- 409 (khoảng chưa bắt đầu) hiện trạng thái rỗng thay vì lỗi; có thể ẩn/disable các mục chưa `started` trong ô chọn.
- Trang năm học: thêm ô "Tuần bắt đầu học kỳ 2".
