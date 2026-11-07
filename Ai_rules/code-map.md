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

Helper response/lỗi: `src/app/utils/http.ts` (`parseId`, `parseIntInRange`, `parseDate`).
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
| GET | `/classes?branchid=&gradeid=` | `classController.getClasses` — kèm `numstudents` | admin, user | ✅ |
| GET | `/classes/:id` | `classController.getClass` — kèm `numstudents`, `students[]` (cờ đỏ: `[]` nếu lớp không được phân công) | admin, user | ✅ |
| POST | `/classes` | `classController.postClasses` — body `{ gradeid, branchid, teacherIds[] }`, phần tử `null` = lớp chưa có GVCN | admin | ✅ |
| PUT | `/classes/:id` | `classController.putClass` — body `{ teacherid }`, `null` = bỏ GVCN | admin | ✅ |
| DELETE | `/classes/:id` | `classController.removeClass` — 409 nếu còn học sinh hoặc đã có điểm | admin | ✅ |
| GET | `/students?classid=&branchid=&gradeid=` | `studentController.getStudents` — kèm `classname` | admin, user (cờ đỏ: chỉ lớp được phân công, `classid` khác → 403) | ✅ |
| GET | `/students/:id` | `studentController.getStudent` | admin, user (cờ đỏ: 403 nếu HS ngoài lớp được phân công) | ✅ |
| POST | `/students` | `studentController.postStudents` — body `{ classid, students: [{ code, name, gender?, birthdate? }] }` | admin | ✅ |
| PUT | `/students/:id` | `studentController.putStudent` — body `{ code?, name?, gender?, birthdate?, classid? }` (đổi `classid` = chuyển lớp) | admin | ✅ |
| DELETE | `/students/:id` | `studentController.removeStudent` — 409 nếu đã gắn vào lượt chấm | admin | ✅ |
| GET | `/school-years` | `schoolYearController.getSchoolYears` — kèm `numweeks`, `enddate`, `semester2_week` | admin, user | ✅ |
| GET | `/school-years/:id` | `schoolYearController.getSchoolYear` — kèm `weeks[]` | admin, user | ✅ |
| POST | `/school-years` | `schoolYearController.postSchoolYear` — body `{ name, startdate, numweeks, conduct_base?, study_base?, semester2_week? }`, tự sinh tuần | admin | ✅ |
| PUT | `/school-years/:id` | `schoolYearController.putSchoolYear` — body `{ name?, numweeks?, semester2_week? }` (`null` = về mặc định) | admin | ✅ |
| DELETE | `/school-years/:id` | `schoolYearController.removeSchoolYear` — 409 nếu đã có điểm | admin | ✅ |
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
| GET | `/scores/ranking?schoolyearid=&week=\|month=\|semester=&branchid=&gradeid=` | `scoreController.getRanking` — xếp hạng theo tuần / tháng / học kỳ | admin, user | ✅ |
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
| `gradeService.ts` | `fetchAllGrade`, `checkGradeExist` | grade | Khối chỉ đọc (khởi tạo trong migration) |
| `teacherService.ts` | `fetchAllTeacher(branchid?)`, `checkTeacherExist`, `checkListTeacherExist`, `fetchHomeroomClasses`, `createTeacher(branchid, names)`, `updateTeacher`, `deleteTeacher` | teacher, class_view | Insert hàng loạt theo phân hiệu; đổi phân hiệu bị chặn khi đang chủ nhiệm |
| `classService.ts` | `getAllClass(filter)`, `getClassById`, `batchCreateClass`, `updateClassTeacher`, `deleteClass` | class, class_view, student | Xem luồng tạo lớp bên dưới; `getAllClass`/`getClassById` kèm `numstudents` (đếm thẳng bảng `student`, không import `studentService` để tránh import vòng) |
| `studentService.ts` | `GENDERS`, `fetchAllStudent(filter)` (filter `classIds` để giới hạn cờ đỏ), `checkStudentExist`, `checkListStudentExist`, `createStudent(classid, students)`, `updateStudent`, `deleteStudent` | student, class_view, point_student | Thêm hàng loạt vào 1 lớp; chuyển lớp bằng đổi `classid`; dùng `getClassById` để kiểm tra lớp |
| `schoolYearService.ts` | `fetchAllSchoolYear`, `checkSchoolYearExist`, `createSchoolYear`, `updateSchoolYear`, `deleteSchoolYear` | school_year, week | Tạo/đổi số tuần trong transaction + `LOCK TABLE school_year`; chặn chồng thời gian giữa các năm học; `semester2_week` trả giá trị hiệu lực (null → `CEIL(numweeks/2)+1`), phải nằm trong 2..numweeks |
| `weekService.ts` | `fetchAllWeek(schoolyearid?)`, `checkWeekExist`, `fetchCurrentWeek`, `checkWeekOpen`, `updateWeek` | week | `checkWeekOpen` dùng chung để chặn sửa điểm tuần đã khóa (409) |
| `pointService.ts` | `POINT_TYPES`, `fetchAllPoint(filter)`, `checkPointExist`, `createPoint(actor, ...)`, `updatePoint(actor, ...)`, `deletePoint(actor, ...)` | point, point_student, student, class_view, week, account | Kèm `classteacherid`, `accountusername`; GVCN bị chặn bằng `assertNotViewOnly`; quyền theo lớp bằng `canScoreClass` + `assertCanManagePoint` (403 trước 409 tuần khóa); lượt cộng/trừ nhập tự do; gắn học sinh qua `point_student` (tạo/sửa trong transaction, học sinh mới gắn phải thuộc lớp của lượt chấm, dùng `checkListStudentExist`) |
| `accountService.ts` | `ROLES`, `Actor`, `fetchAllAccount(filter)`, `checkAccountExist`, `fetchAuthAccount`, `fetchAssignedClassIds`, `canScoreClass`, `login`, `changePassword`, `createAccount`, `updateAccount`, `deleteAccount`, `replaceAccountClasses` | account, account_class, teacher, student, class_view | Không SELECT `password` ra ngoài (`selectAccount` liệt kê cột); `kind` = admin / gvcn / codo; login sai username vẫn chạy bcrypt với hash giả; luôn còn ≥ 1 admin hoạt động; không tự khóa / xóa mình; cờ đỏ không được phân công lớp của mình |
| `scoreService.ts` | `fetchWeeklyScore`, `fetchSummaryScore`, `fetchClassScore`, `fetchRanking`, `fetchRankingPeriods` | score_view, week | Chỉ đọc; rank bằng `RANK() OVER` (cùng điểm cùng hạng). Xem mục xếp hạng theo khoảng bên dưới |

### Luồng tạo lớp hàng loạt (`batchCreateClass`)

1. Kiểm tra khối, phân hiệu tồn tại.
2. `validateTeachers` (chỉ với các phần tử khác null): giáo viên tồn tại → cùng phân hiệu → chưa chủ nhiệm lớp nào (dùng chung cho `updateClassTeacher`).
3. Transaction: `SELECT ... FROM branch FOR UPDATE` (khóa để không trùng seq) → `MAX(seq)` của (khối, phân hiệu) → insert nhiều dòng, seq tăng tiếp → trả về từ `class_view`.

### Tính điểm thi đua (`score_view`)

- Mỗi tuần (`week`) có `conduct_base` (Nề nếp) và `study_base` (Học tập), mặc định 100, sinh khi tạo năm học.
- `point` là lượt cộng/trừ nhập tự do: `value < 0` trừ, `value > 0` cộng.
- `score_view` = `week` × `class_view` LEFT JOIN `point`: `conduct_score = conduct_base + Σ value (Nề nếp)`, tương tự `study_score`; `total = conduct_score + study_score`; `*_plus`/`*_minus` là tổng cộng / tổng trừ (số dương).
- Tuần `locked = true` thì không tạo/sửa/xóa `point` và không đổi điểm gốc (trừ khi mở khóa cùng request).

### Xếp hạng theo tuần / tháng / học kỳ (`fetchRanking`)

1. `fetchPeriodWeeks`: lấy các tuần của năm học kèm `month` = `to_char(startdate + 3, 'YYYY-MM')` (tháng chứa thứ Năm, tức tháng có nhiều ngày của tuần hơn), `semester` (= 1 nếu `numweek < semester2_week`), `started` (`startdate <= CURRENT_DATE`).
2. Lọc tuần thuộc khoảng; không có tuần nào → 404; chưa tuần nào bắt đầu → 409.
3. Gom `score_view` của các tuần **đã bắt đầu** theo lớp: tổng các cột điểm, `avg_total`, `entries`, `RANK() OVER (ORDER BY SUM(total) DESC)`.
4. `fetchRankingPeriods` dùng cùng `fetchPeriodWeeks`, gom các tuần liên tiếp cùng tháng/học kỳ thành `{ value, label, fromweek, toweek, startdate, enddate }`.

`/scores/weekly` và `/scores/summary` giữ nguyên cho tương thích; xếp hạng mới nên dùng `/scores/ranking`.

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
| `point.accountid` | Người nhập lượt chấm (`ON DELETE SET NULL`), ghi ở `createPoint` | ✅ |

Dữ liệu mẫu dev: `cscript/seed.sql` (xem `database.md`).

## Quyết định thiết kế

- SQL thuần qua `pg` Pool dùng chung, không ORM.
- Tên lớp không lưu trong DB; tính trong `class_view` (`numgrade` + `branch.code` + `seq`), nên đổi mã phân hiệu thì tên lớp tự đổi.
- Insert hàng loạt: một câu INSERT với placeholder `($1),($2),...` (mẫu ở `createTeacher`).
- Xóa có dữ liệu con trả 409 thay vì để CASCADE xóa dây chuyền.
- Schema nằm ở `cscript/migration.sql` (xem database.md).
- Bỏ bảng `point_less`; `point` đổi từ "điểm theo loại" sang "lượt cộng/trừ" (nhập tự do theo yêu cầu nghiệp vụ). Điểm tuần không lưu mà tính trong `score_view`, nên sửa điểm gốc hay lượt chấm thì bảng điểm tự cập nhật.
- Học kỳ lưu bằng 1 cột `school_year.semester2_week` (tuần bắt đầu HK2, null = nửa đầu năm làm tròn lên thuộc HK1); tháng không lưu mà suy từ ngày thứ Năm của tuần để mỗi tuần thuộc đúng 1 tháng. Xếp hạng chỉ tính tuần đã bắt đầu để tuần tương lai (chỉ có điểm gốc) không làm sai tổng.
- `week` không có API tạo/xóa riêng: tuần sinh/xóa qua `POST`/`PUT /school-years` để luôn liên tiếp, không chồng ngày.
- `class.teacherid` cho phép null (lớp chưa phân công GVCN) để nhập danh sách lớp từ file trước, phân công sau; `class_view` dùng LEFT JOIN `teacher`. Không đổi `ON DELETE CASCADE` của `fk_class_teacher`, việc xóa giáo viên đang chủ nhiệm vẫn bị chặn ở service.
- `point_student` là bảng nối lượt chấm ↔ học sinh (học sinh vi phạm / được nêu). Xóa lượt chấm thì CASCADE xóa liên kết (liên kết là một phần của lượt chấm); xóa học sinh đã gắn bị chặn 409 để giữ lịch sử. Học sinh chuyển lớp vẫn giữ liên kết với lượt chấm của lớp cũ; chỉ học sinh **mới gắn** phải thuộc lớp của lượt chấm. Không giới hạn gắn học sinh theo dấu của `value` (lượt cộng cũng nêu tên được).
- Học sinh (`student`) chỉ là dữ liệu của lớp (mã học sinh duy nhất, họ tên, giới tính, ngày sinh), không có tài khoản hay role; xóa lớp còn học sinh trả 409. `class_view` không thêm cột sĩ số để không đổi thứ tự cột mà `score_view` dựa vào; sĩ số tính bằng subquery trong `classService`.
- GVCN chỉ xem, không chấm điểm (đổi 2026-11-04 theo yêu cầu nghiệp vụ: người chấm là cờ đỏ và GV quản lý nề nếp, tránh GVCN tự chấm lớp mình). `canScoreClass` không còn nhánh GVCN.
- Chỉ 2 role `admin`/`user` (đổi tên role `teacher` cũ thành `user` vì cờ đỏ cũng thuộc role này). Loại người dùng `user` suy từ tài khoản gắn `teacherid` (GVCN) hay `studentid` (cờ đỏ), không thêm role thứ 3. Học sinh chỉ có tài khoản khi được chọn làm cờ đỏ.
- `point.accountid` dùng `ON DELETE SET NULL` (không CASCADE) để xóa tài khoản không mất lượt chấm; xóa giáo viên / học sinh thì CASCADE xóa tài khoản của họ.
- Điểm là số nguyên (`integer`); `SUM`/`COUNT` trong SQL cast `::int` để `pg` trả number thay vì string.
