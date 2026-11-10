# Code map

**Đọc file này đầu tiên** để tìm đúng luồng cần xử lý, sau đó mới mở file code liên quan.

**Bắt buộc cập nhật** file này trong cùng lần thay đổi khi thêm, sửa hoặc xóa route, controller, service, middleware hay bảng. Code map sai lệch với code được coi là lỗi.

Trạng thái: ✅ hoàn thành · 🚧 đang làm / còn lỗi · ⬜ chưa làm

## Luồng request

```
src/index.ts  (express.json → morgan → cors)
  └─ src/router/index.ts            mount /branches, /grades, /teachers, /classes, /students,
       │                            /school-years, /weeks, /points, /scores, /auth, /accounts
       └─ src/router/<entity>Router.ts
            └─ authenticate → authorize(...roles)   src/app/middleware/auth.ts
                                    ✅ mọi router (trừ GET / và POST /auth/login); route ghi nghiệp vụ authorize('admin');
                                    /points kiểm tra quyền theo lớp trong pointService
                 └─ src/app/controller/<entity>Controller.ts   validate, gọi service, handleError
                      └─ src/app/service/<entity>Service.ts    nghiệp vụ + SQL, throw HttpError
                           └─ pool  src/config/db.ts → PostgreSQL
```

Helper response/lỗi: `src/app/utils/http.ts` (`parseId`, `parseIntInRange`, `parseDate`, `sendFile` trả file tải về kèm `Content-Disposition`).
CORS (`src/index.ts`) có `exposedHeaders: ['Content-Disposition']` để FE đọc tên file Excel.
Helper auth: `src/app/utils/auth.ts` (`hashPassword`, `comparePassword`, `compareDummyPassword` bằng `bcryptjs` cost 10; `signToken`, `verifyToken` bằng `jsonwebtoken`, payload `{ id, role }`, không có secret mặc định).

`src/config/db.ts` đặt type parser cho cột `date` → chuỗi `'YYYY-MM-DD'` (không trả Date/ISO).

## Routes

Cột "Quyền" là quyền đã gắn (`security.md`): `authenticate` ở đầu mỗi router, `authorize('admin')` trên route ghi. "user" = GVCN + cờ đỏ.

| Method | Path | Controller | Quyền | Trạng thái |
|---|---|---|---|---|
| GET | `/` | inline trong `src/router/index.ts` | public | ✅ placeholder |
| GET | `/branches` | `branchController.getBranches` | admin, user | ✅ |
| GET | `/branches/:id` | `branchController.getBranch` | admin, user | ✅ |
| POST | `/branches` | `branchController.postBranch` — body `{ name, code }` | admin | ✅ |
| PUT | `/branches/:id` | `branchController.putBranch` — body `{ name?, code? }` | admin | ✅ |
| DELETE | `/branches/:id` | `branchController.removeBranch` — 409 nếu còn GV/lớp | admin | ✅ |
| GET | `/grades` | `gradeController.getGrades` | admin, user | ✅ |
| GET | `/teachers?branchid=` | `teacherController.getTeachers` — kèm `classid`, `classname` | admin, user | ✅ |
| GET | `/teachers/:id` | `teacherController.getTeacher` | admin, user | ✅ |
| POST | `/teachers` | `teacherController.postTeachers` — body `{ branchid, names[] }` | admin | ✅ |
| PUT | `/teachers/:id` | `teacherController.putTeacher` — body `{ name?, branchid? }` | admin | ✅ |
| DELETE | `/teachers/:id` | `teacherController.removeTeacher` — 409 nếu đang chủ nhiệm | admin | ✅ |
| GET | `/classes?branchid=&gradeid=&archived=` | `classController.getClasses` — kèm `numstudents`, `archivedyearname`; `archived=true` = lớp ra trường | admin, user | ✅ |
| GET | `/classes/:id` | `classController.getClass` — kèm `numstudents`, `students[]` (cờ đỏ: `[]` nếu lớp không được phân công); lấy được cả lớp lưu trữ | admin, user | ✅ |
| POST | `/classes` | `classController.postClasses` — body `{ gradeid, branchid, teacherIds[] }`, phần tử `null` = lớp chưa có GVCN | admin | ✅ |
| PUT | `/classes/:id` | `classController.putClass` — body `{ teacherid }`, `null` = bỏ GVCN; 409 lớp lưu trữ | admin | ✅ |
| DELETE | `/classes/:id` | `classController.removeClass` — 409 nếu còn học sinh hoặc đã có điểm | admin | ✅ |
| GET | `/students?classid=&branchid=&gradeid=` | `studentController.getStudents` — kèm `classname`; không truyền `classid` thì bỏ học sinh lớp lưu trữ | admin, user (cờ đỏ: chỉ lớp được phân công, `classid` khác → 403) | ✅ |
| GET | `/students/:id` | `studentController.getStudent` | admin, user (cờ đỏ: 403 nếu HS ngoài lớp được phân công) | ✅ |
| POST | `/students` | `studentController.postStudents` — body `{ classid, students: [{ code, name, gender?, birthdate? }] }` | admin | ✅ |
| PUT | `/students/:id` | `studentController.putStudent` — body `{ code?, name?, gender?, birthdate?, classid? }` (đổi `classid` = chuyển lớp) | admin | ✅ |
| DELETE | `/students/:id` | `studentController.removeStudent` — 409 nếu đã gắn vào lượt chấm | admin | ✅ |
| GET | `/school-years` | `schoolYearController.getSchoolYears` — kèm `numweeks`, `enddate`, `semester2_week` | admin, user | ✅ |
| GET | `/school-years/:id` | `schoolYearController.getSchoolYear` — kèm `weeks[]` | admin, user | ✅ |
| POST | `/school-years` | `schoolYearController.postSchoolYear` — body `{ name, startdate, numweeks, conduct_base?, study_base?, semester2_week?, grade6? }`, tự sinh tuần; 409 năm mới nhất chưa kết thúc; tự lên lớp, trả `promotion` | admin | ✅ |
| PUT | `/school-years/:id` | `schoolYearController.putSchoolYear` — body `{ name?, numweeks?, semester2_week? }` (`null` = về mặc định) | admin | ✅ |
| DELETE | `/school-years/:id` | `schoolYearController.removeSchoolYear` — 409 nếu đã có điểm / có lớp lưu trữ | admin | ✅ |
| GET | `/weeks?schoolyearid=` | `weekController.getWeeks` — kèm `schoolyearname`, `entries` | admin, user | ✅ |
| GET | `/weeks/current` | `weekController.getCurrentWeek` — 404 nếu hôm nay ngoài mọi tuần | admin, user | ✅ |
| GET | `/weeks/:id` | `weekController.getWeek` | admin, user | ✅ |
| PUT | `/weeks/:id` | `weekController.putWeek` — body `{ conduct_base?, study_base?, locked?, applyToNext? }` | admin | ✅ |
| GET | `/points?weekid=&classid=&type=&studentid=` | `pointController.getPoints` — kèm `students[]` | admin, user | ✅ |
| GET | `/points/:id` | `pointController.getPoint` | admin, user | ✅ |
| POST | `/points` | `pointController.postPoint` — body `{ weekid, classid, type, content, value, studentIds? }`; ghi `accountid`; 403 lớp không được chấm, 409 tuần đã khóa | admin mọi lớp · cờ đỏ lớp được phân công (trừ lớp mình) · GVCN 403 (chỉ xem) | ✅ |
| PUT | `/points/:id` | `pointController.putPoint` — body `{ type?, content?, value?, studentIds? }` (mảng = thay toàn bộ) | admin mọi lượt · cờ đỏ chỉ lượt mình nhập, lớp còn được phân công · GVCN 403 | ✅ |
| DELETE | `/points/:id` | `pointController.removePoint` | như PUT | ✅ |
| GET | `/scores/weekly?weekid=&branchid=&gradeid=` | `scoreController.getWeeklyScore` — bảng điểm + rank 1 tuần | admin, user | ✅ |
| GET | `/scores/summary?schoolyearid=&fromweek=&toweek=&branchid=&gradeid=` | `scoreController.getSummaryScore` — tổng hợp nhiều tuần | admin, user | ✅ |
| GET | `/scores/ranking?schoolyearid=&week=\|month=\|semester=\|year=1&branchid=&gradeid=` | `scoreController.getRanking` — xếp hạng theo tuần / tháng / học kỳ / cả năm; `period.weekids[]` | admin, user | ✅ |
| GET | `/scores/export?` (query như `/scores/ranking`) | `scoreController.getScoreExport` — file `.xlsx`; file tuần có điểm gốc + cột chi tiết cộng / trừ (không kèm học sinh); lỗi trả JSON | admin, user | ✅ |
| GET | `/scores/periods?schoolyearid=` | `scoreController.getRankingPeriods` — danh sách tuần / tháng / học kỳ để chọn | admin, user | ✅ |
| GET | `/scores/class/:classid?schoolyearid=` | `scoreController.getClassScore` — điểm từng tuần của 1 lớp | admin, user | ✅ |
| POST | `/auth/login` | `accountController.postLogin` — body `{ username, password }` → `{ token, account }`; 401 sai, 403 bị khóa | public | ✅ |
| GET | `/auth/me` | `accountController.getMe` — kèm `kind`, lớp chủ nhiệm / lớp HS, `classes[]` | admin, user | ✅ |
| PUT | `/auth/password` | `accountController.putMyPassword` — body `{ oldPassword, newPassword }` | admin, user | ✅ |
| GET | `/accounts?role=&active=` | `accountController.getAccounts` | admin | ✅ |
| GET | `/accounts/:id` | `accountController.getAccount` | admin | ✅ |
| POST | `/accounts` | `accountController.postAccount` — body `{ username, password, role, teacherid?, studentid? }` | admin | ✅ |
| PUT | `/accounts/:id` | `accountController.putAccount` — body `{ username?, password?, active? }`; không đổi role/teacherid/studentid | admin | ✅ |
| DELETE | `/accounts/:id` | `accountController.removeAccount` — 409 tự xóa / admin hoạt động cuối | admin | ✅ |
| PUT | `/accounts/:id/classes` | `accountController.putAccountClasses` — body `{ classIds[] }` thay toàn bộ lớp cờ đỏ chấm | admin | ✅ |

## Services

| File | Hàm | Bảng/View | Mô tả |
|---|---|---|---|
| `branchService.ts` | `fetchAllBranch`, `checkBranchExist`, `createBranch`, `updateBranch`, `deleteBranch` | branch | CRUD phân hiệu |
| `gradeService.ts` | `fetchAllGrade`, `checkGradeExist` | grade | Khối chỉ đọc (khởi tạo trong `init.sql`) |
| `teacherService.ts` | `fetchAllTeacher(branchid?)`, `checkTeacherExist`, `checkListTeacherExist`, `fetchHomeroomClasses`, `createTeacher(branchid, names)`, `updateTeacher`, `deleteTeacher` | teacher, class_view | Insert hàng loạt theo phân hiệu; đổi phân hiệu bị chặn khi đang chủ nhiệm |
| `classService.ts` | `getAllClass(filter)` (`archived` mặc định false), `getClassById`, `assertClassActive`, `batchCreateClass`, `updateClassTeacher`, `deleteClass`, `promoteClasses(client, oldYearId, grade6?)` | class, class_view, class_year, student, account, account_class, school_year | Xem luồng tạo lớp và lên lớp bên dưới; `getAllClass`/`getClassById` kèm `numstudents` (đếm thẳng bảng `student`, không import `studentService` để tránh import vòng), `archivedyearname`; `assertClassActive` (409 lớp lưu trữ) dùng ở `updateClassTeacher`, `studentService`, `pointService.createPoint` |
| `studentService.ts` | `GENDERS`, `fetchAllStudent(filter)` (filter `classIds` để giới hạn cờ đỏ; không có `classid` thì bỏ lớp lưu trữ), `checkStudentExist`, `checkListStudentExist`, `createStudent(classid, students)`, `updateStudent`, `deleteStudent` | student, class_view, point_student | Thêm hàng loạt vào 1 lớp; chuyển lớp bằng đổi `classid`; dùng `getClassById` + `assertClassActive` để kiểm tra lớp đích |
| `schoolYearService.ts` | `fetchAllSchoolYear`, `checkSchoolYearExist`, `createSchoolYear(..., grade6?)`, `updateSchoolYear`, `deleteSchoolYear` | school_year, week, class_year, class | Tạo/đổi số tuần trong transaction + `LOCK TABLE school_year`; chặn chồng thời gian giữa các năm học; tạo năm học chỉ khi năm mới nhất đã kết thúc và gọi `promoteClasses` trong cùng transaction (xem luồng lên lớp); `semester2_week` trả giá trị hiệu lực (null → `CEIL(numweeks/2)+1`), phải nằm trong 2..numweeks |
| `weekService.ts` | `fetchAllWeek(schoolyearid?)`, `checkWeekExist`, `fetchCurrentWeek`, `checkWeekOpen`, `updateWeek` | week | `checkWeekOpen` dùng chung để chặn sửa điểm tuần đã khóa (409) |
| `pointService.ts` | `POINT_TYPES`, `fetchAllPoint(filter)`, `checkPointExist`, `createPoint(actor, ...)`, `updatePoint(actor, ...)`, `deletePoint(actor, ...)` | point, point_student, student, class_view, week, account | Kèm `classteacherid`, `accountusername`; GVCN bị chặn bằng `assertNotViewOnly`; quyền theo lớp bằng `canScoreClass` + `assertCanManagePoint` (403 trước 409 tuần khóa); lượt cộng/trừ nhập tự do; gắn học sinh qua `point_student` (tạo/sửa trong transaction, học sinh mới gắn phải thuộc lớp của lượt chấm, dùng `checkListStudentExist`) |
| `accountService.ts` | `ROLES`, `Actor`, `fetchAllAccount(filter)`, `checkAccountExist`, `fetchAuthAccount`, `fetchAssignedClassIds`, `canScoreClass`, `login`, `changePassword`, `createAccount`, `updateAccount`, `deleteAccount`, `replaceAccountClasses` | account, account_class, teacher, student, class_view | Không SELECT `password` ra ngoài (`selectAccount` liệt kê cột); `kind` = admin / gvcn / codo; login sai username vẫn chạy bcrypt với hash giả; luôn còn ≥ 1 admin hoạt động; không tự khóa / xóa mình; cờ đỏ không được phân công lớp của mình hay lớp lưu trữ (409) |
| `scoreService.ts` | `fetchWeeklyScore`, `fetchSummaryScore`, `fetchClassScore`, `fetchRanking` (khoảng `week`/`month`/`semester`/`year`), `fetchRankingPeriods`, `fetchWeekPointDetails(weekid)` | score_view, week, point | Chỉ đọc; rank bằng `RANK() OVER` (cùng điểm cùng hạng). Xem mục xếp hạng theo khoảng bên dưới |
| `scoreExportService.ts` | `buildScoreWorkbook(schoolyearid, period, filter)` → `{ filename, buffer }` | (qua `fetchRanking`, `fetchWeekPointDetails`, `checkBranchExist`, `checkGradeExist`) | Dựng file Excel bằng `exceljs`: dòng 1–3 tiêu đề / năm học + khoảng ngày + phạm vi / ghi chú, header 2 tầng (Nề nếp, Học tập), cố định cột Hạng–Lớp và header, in ngang vừa 1 trang ngang. Không đụng `res` |

### Luồng tạo lớp hàng loạt (`batchCreateClass`)

1. Kiểm tra khối, phân hiệu tồn tại.
2. `validateTeachers` (chỉ với các phần tử khác null): giáo viên tồn tại → cùng phân hiệu → chưa chủ nhiệm lớp nào (dùng chung cho `updateClassTeacher`).
3. Transaction: `SELECT ... FROM branch FOR UPDATE` (khóa để không trùng seq) → `MAX(seq)` của (khối, phân hiệu) → insert nhiều dòng, seq tăng tiếp → trả về từ `class_view`.

### Luồng chuyển năm học / lên lớp (`createSchoolYear` → `promoteClasses`)

Một transaction, `LOCK TABLE school_year` rồi `LOCK TABLE class`:

1. `fetchLatestSchoolYear`: năm mới nhất theo `startdate`, kèm `enddate` (MAX tuần), `ended` (`enddate < CURRENT_DATE`), `promoted` (đã có `class_year`). Chưa kết thúc → 409; `startdate` mới ≤ `enddate` cũ → 409; rồi `checkOverlap`, insert năm học + tuần.
2. Có năm cũ và `promoted = false` thì `promoteClasses`, ngược lại `promotion = null` (năm đầu tiên, hoặc xóa rồi tạo lại năm mới: không lên lớp 2 lần).
3. `promoteClasses`: khối phải liên tiếp (6..9) → đếm số lớp khối đầu mỗi phân hiệu (mặc định cho lớp 6 mới, `grade6` thay thế) → insert `class_year` cho mọi lớp đang học (năm cũ) → lớp khối cuối: `archivedyearid = năm cũ`, `teacherid = NULL`, khóa `account` cờ đỏ của học sinh lớp đó, xóa `account_class` của lớp đó và của các em → `UPDATE gradeid` từ khối 8 xuống khối 6 (từ trên xuống để không vướng unique index) → insert lớp khối 6 seq 1..count, chưa GVCN.
4. Trả `{ fromschoolyear, archived[], promoted, created[], deactivatedAccounts }` trong `data.promotion`.

### Tính điểm thi đua (`score_view`)

- Mỗi tuần (`week`) có `conduct_base` (Nề nếp) và `study_base` (Học tập), mặc định 100, sinh khi tạo năm học.
- `point` là lượt cộng/trừ nhập tự do: `value < 0` trừ, `value > 0` cộng.
- `score_view` = `week` × `class_view` LEFT JOIN `point`: `conduct_score = conduct_base + Σ value (Nề nếp)`, tương tự `study_score`; `total = conduct_score + study_score`; `*_plus`/`*_minus` là tổng cộng / tổng trừ (số dương).
- Lớp của từng năm: năm có `class_year` (đã lên lớp) chỉ gồm các lớp trong ảnh chụp, `classname`/`gradeid`/`numgrade`/`teacherid`/`teachername` lấy từ ảnh chụp; năm chưa có (năm hiện tại) gồm các lớp đang học (`archivedyearid IS NULL`).
- Tuần `locked = true` thì không tạo/sửa/xóa `point` và không đổi điểm gốc (trừ khi mở khóa cùng request).

### Xếp hạng theo tuần / tháng / học kỳ (`fetchRanking`)

1. `fetchPeriodWeeks`: lấy các tuần của năm học kèm `month` = `to_char(startdate + 3, 'YYYY-MM')` (tháng chứa thứ Năm, tức tháng có nhiều ngày của tuần hơn), `semester` (= 1 nếu `numweek < semester2_week`), `started` (`startdate <= CURRENT_DATE`).
2. Lọc tuần thuộc khoảng; không có tuần nào → 404; chưa tuần nào bắt đầu → 409.
3. Gom `score_view` của các tuần **đã bắt đầu** theo lớp: tổng các cột điểm, `avg_total`, `entries`, `RANK() OVER (ORDER BY SUM(total) DESC)`.
4. `fetchRankingPeriods` dùng cùng `fetchPeriodWeeks`, gom các tuần liên tiếp cùng tháng/học kỳ thành `{ value, label, fromweek, toweek, startdate, enddate }`.

`/scores/weekly` và `/scores/summary` giữ nguyên cho tương thích; xếp hạng mới nên dùng `/scores/ranking`.

### Xuất Excel (`GET /scores/export`)

1. Controller dùng chung `readRankingQuery` với `/scores/ranking` (schoolyearid + đúng 1 khoảng + branchid/gradeid).
2. `buildScoreWorkbook`: kiểm tra phân hiệu / khối (404) → `fetchRanking` (cùng số liệu, cùng lỗi 404/409) → tuần thì `fetchWeekPointDetails(period.weekids[0])` lấy lượt cộng/trừ theo lớp (mỗi lượt 1 dòng `[Nề nếp] nội dung: -2`, không lấy `point_student`).
3. Cột tuần: Hạng, Lớp, GVCN, Nề nếp (gốc = điểm − cộng + trừ, cộng, trừ âm, điểm), Học tập (tương tự), Tổng, Số lượt, Chi tiết cộng / trừ. Cột tháng / học kỳ / năm: Hạng, Lớp, GVCN, Số tuần, Nề nếp (cộng, trừ, điểm), Học tập, Tổng, TB / tuần, Số lượt.
4. Tên file ASCII: `diem-thi-dua_<năm học>_<tuan-N|thang-YYYY-MM|hoc-ky-N|ca-nam>[_phan-hieu-X][_khoi-N].xlsx`; tên sheet bỏ ký tự cấm `* ? : \ / [ ]`.

## Middleware

| File | Mục đích | Trạng thái |
|---|---|---|
| `src/app/middleware/auth.ts` → `authenticate` | Đọc `Authorization: Bearer`, verify JWT, tra lại `account` mỗi request (bị khóa / xóa → 401 ngay), gắn `req.user = { id, role, kind, teacherid, studentid, studentclassid }` (lấy từ DB) | ✅ mọi router (`router.use`), trừ `GET /`, `POST /auth/login` |
| `src/app/middleware/auth.ts` → `authorize(...roles)` | Kiểm tra `req.user.role`, sai → 403 | ✅ route ghi của branch/teacher/class/student/school-year/week, toàn bộ `/accounts` |
| Quyền theo dữ liệu sở hữu | `pointService` (chấm điểm), `studentController` / `classController` (cờ đỏ xem học sinh) | ✅ |

## Bảng tài khoản

| Bảng | Mô tả | Trạng thái |
|---|---|---|
| `account` | role `admin` (GV quản lý nề nếp) / `user` (GVCN gắn `teacherid` hoặc cờ đỏ gắn `studentid`), hash bcrypt, `active` | ✅ |
| `account_class` | Lớp cờ đỏ được phân công chấm | ✅ |
| `class.archivedyearid` | Năm học lớp ra trường (lưu trữ khi lên lớp), null = đang học; unique `(gradeid, branchid, seq)` chỉ áp cho lớp đang học (`class_active_unique`) | ✅ |
| `class_year` | Ảnh chụp tên / khối / GVCN của lớp trong năm học đã lên lớp, `score_view` dùng cho năm cũ | ✅ |
| `point.accountid` | Người nhập lượt chấm (`ON DELETE SET NULL`), ghi ở `createPoint` | ✅ |

SQL: chỉ một file `cscript/init.sql` (phần 1 schema, phần 2 dữ liệu giai đoạn đầu: 55 lớp + GVCN theo danh sách nhà trường, 2493 học sinh, năm học 2026-2027, `admin`), xem `database.md`.

## Quyết định thiết kế

- SQL thuần qua `pg` Pool dùng chung, không ORM.
- Tên lớp không lưu trong DB; tính trong `class_view` (`numgrade` + `branch.code` + `seq`), nên đổi mã phân hiệu thì tên lớp tự đổi.
- Insert hàng loạt: một câu INSERT với placeholder `($1),($2),...` (mẫu ở `createTeacher`).
- Xóa có dữ liệu con trả 409 thay vì để CASCADE xóa dây chuyền.
- Schema và dữ liệu khởi tạo gom vào 1 file `cscript/init.sql` (2026-11-09, thay `migration.sql`, `seed.sql`, `data-dev.sql`, `update-gvcn.sql`). Dữ liệu nạp theo khóa tự nhiên (tên lớp, mã học sinh) để chạy lại được và không phụ thuộc id; bỏ lượt chấm test và tài khoản dev `gvcn.*` / `codo.*`.
- Bỏ bảng `point_less`; `point` đổi từ "điểm theo loại" sang "lượt cộng/trừ" (nhập tự do theo yêu cầu nghiệp vụ). Điểm tuần không lưu mà tính trong `score_view`, nên sửa điểm gốc hay lượt chấm thì bảng điểm tự cập nhật.
- Học kỳ lưu bằng 1 cột `school_year.semester2_week` (tuần bắt đầu HK2, null = nửa đầu năm làm tròn lên thuộc HK1); tháng không lưu mà suy từ ngày thứ Năm của tuần để mỗi tuần thuộc đúng 1 tháng. Xếp hạng chỉ tính tuần đã bắt đầu để tuần tương lai (chỉ có điểm gốc) không làm sai tổng.
- `week` không có API tạo/xóa riêng: tuần sinh/xóa qua `POST`/`PUT /school-years` để luôn liên tiếp, không chồng ngày.
- `class.teacherid` cho phép null (lớp chưa phân công GVCN) để nhập danh sách lớp từ file trước, phân công sau; `class_view` dùng LEFT JOIN `teacher`. Không đổi `ON DELETE CASCADE` của `fk_class_teacher`, việc xóa giáo viên đang chủ nhiệm vẫn bị chặn ở service.
- `point_student` là bảng nối lượt chấm ↔ học sinh (học sinh vi phạm / được nêu). Xóa lượt chấm thì CASCADE xóa liên kết (liên kết là một phần của lượt chấm); xóa học sinh đã gắn bị chặn 409 để giữ lịch sử. Học sinh chuyển lớp vẫn giữ liên kết với lượt chấm của lớp cũ; chỉ học sinh **mới gắn** phải thuộc lớp của lượt chấm. Không giới hạn gắn học sinh theo dấu của `value` (lượt cộng cũng nêu tên được).
- Học sinh (`student`) chỉ là dữ liệu của lớp (mã học sinh duy nhất, họ tên, giới tính, ngày sinh), không có tài khoản hay role; xóa lớp còn học sinh trả 409. `class_view` không thêm cột sĩ số để không đổi thứ tự cột mà `score_view` dựa vào; sĩ số tính bằng subquery trong `classService`.
- GVCN chỉ xem, không chấm điểm (đổi 2026-11-04 theo yêu cầu nghiệp vụ: người chấm là cờ đỏ và GV quản lý nề nếp, tránh GVCN tự chấm lớp mình). `canScoreClass` không còn nhánh GVCN.
- Chỉ 2 role `admin`/`user` (đổi tên role `teacher` cũ thành `user` vì cờ đỏ cũng thuộc role này). Loại người dùng `user` suy từ tài khoản gắn `teacherid` (GVCN) hay `studentid` (cờ đỏ), không thêm role thứ 3. Học sinh chỉ có tài khoản khi được chọn làm cờ đỏ.
- `point.accountid` dùng `ON DELETE SET NULL` (không CASCADE) để xóa tài khoản không mất lượt chấm; xóa giáo viên / học sinh thì CASCADE xóa tài khoản của họ.
- Xuất Excel (2026-11-09) dùng thư viện `exceljs` (thêm vào `dependencies`), dựng file trong service riêng `scoreExportService` (không phải bảng mới) để `scoreService` chỉ lo số liệu; số liệu dùng lại `fetchRanking` để file luôn khớp màn hình xếp hạng. Lỗi vẫn trả JSON (FE kiểm tra `response.ok` trước khi đọc blob).
- Điểm là số nguyên (`integer`); `SUM`/`COUNT` trong SQL cast `::int` để `pg` trả number thay vì string.
- Lên lớp (2026-11-09): lớp là lứa học sinh đi lên theo năm (đổi `gradeid`, giữ id / học sinh / GVCN) thay vì tạo lớp mới mỗi năm, để không phải chuyển học sinh và phân công lại. Khối 9 **lưu trữ** (`archivedyearid`) thay vì xóa, vì xóa lớp sẽ CASCADE mất điểm và lượt chấm của năm cũ. Tên / khối / GVCN năm cũ chụp vào `class_year` để bảng điểm năm cũ không đổi tên theo lớp đã lên. `class_unique` thay bằng unique index một phần `class_active_unique` (8A1 lên 9A1 khi 9A1 cũ đã lưu trữ). `class.archivedyearid` thêm bằng `ALTER TABLE` sau bảng `school_year` (khóa ngoại cần bảng này), không khai báo trong `CREATE TABLE class`; FK không CASCADE, xóa năm học có lớp lưu trữ bị chặn 409. `class_view`/`score_view` đổi sang `DROP VIEW` + `CREATE VIEW` vì `c.*` đổi thứ tự cột khi thêm cột. `GET /points` vẫn hiện tên lớp hiện tại (chưa dùng `class_year`).
- Lớp lưu trữ bỏ GVCN để giáo viên nhận lớp 6 mới (`class_teacher_unique`); tên GVCN năm đó vẫn còn trong `class_year`. Tài khoản cờ đỏ của học sinh ra trường bị khóa (`active = false`), không xóa, để giữ `point.accountid`.
