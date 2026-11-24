# Code map

**Đọc file này đầu tiên** để tìm đúng luồng cần xử lý, sau đó mới mở file code liên quan.

**Bắt buộc cập nhật** file này trong cùng lần thay đổi khi thêm, sửa hoặc xóa route, controller, service, middleware hay bảng. Code map sai lệch với code được coi là lỗi.

Trạng thái: ✅ hoàn thành · 🚧 đang làm / còn lỗi · ⬜ chưa làm

## Luồng request

```
src/index.ts  (express.json → morgan → cors)
  └─ src/router/index.ts            mount /branches, /grades, /teachers, /classes, /students,
       │                            /school-years, /weeks, /points, /rules, /scores, /auth, /accounts, /parents,
       │                            /folders, /files, /public
       └─ src/router/<entity>Router.ts
            └─ authenticate → authorize(...roles)   src/app/middleware/auth.ts
                                    ✅ mọi router (trừ GET /, POST /auth/login, POST /auth/parent/login và /public: trang lớp QR + tổng quan công khai); route ghi nghiệp vụ authorize('admin');
                                    /auth/parent/me, /auth/parent/password dùng authenticateParent (token phụ huynh);
                                    /points kiểm tra quyền theo lớp trong pointService
                 └─ src/app/controller/<entity>Controller.ts   validate, gọi service, handleError
                      └─ src/app/service/<entity>Service.ts    nghiệp vụ + SQL, throw HttpError
                           └─ pool  src/config/db.ts → PostgreSQL
```

Helper response/lỗi: `src/app/utils/http.ts` (`parseId`, `parseIntInRange`, `parseDate`, `sendFile` trả file tải về kèm `Content-Disposition`).
CORS (`src/index.ts`) có `exposedHeaders: ['Content-Disposition']` để FE đọc tên file Excel.
Helper auth: `src/app/utils/auth.ts` (`hashPassword`, `comparePassword`, `compareDummyPassword` bằng `bcryptjs` cost 10; `signToken`, `verifyToken` bằng `jsonwebtoken`, payload `{ id, role }`, không có secret mặc định; `PARENT_ROLE = 'parent'` cho token phụ huynh; `normalizeUsername`, `isValidUsername`, `isValidPassword` + thông báo dùng chung cho `accountController` và `parentController`).

Helper kho file: `src/app/utils/storage.ts` (`STORAGE_DIR` = `<gốc source>/public/files`, tự tạo khi khởi động; `newStorageKey` (uuid), `storagePath` chỉ nhận uuid để không thoát khỏi kho, `removeStoredFiles` bỏ qua file đã mất; `parseItemName` + `NAME_RULE_MESSAGE` validate tên thư mục / file; `decodeOriginalName` đổi tên file multipart latin1 → UTF-8). `parseNullableId` (`http.ts`): `null` / `''` / `'null'` → null, dùng cho `parentid` / `folderid`.

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
| GET | `/classes?branchid=&gradeid=&archived=` | `classController.getClasses` — kèm `numstudents`, `archivedyearname`, `BaseQRCode`; `archived=true` = lớp ra trường | admin, user | ✅ |
| GET | `/classes/:id` | `classController.getClass` — kèm `numstudents`, `students[]` (cờ đỏ: `[]` nếu lớp không được phân công); lấy được cả lớp lưu trữ | admin, user | ✅ |
| POST | `/classes` | `classController.postClasses` — body `{ gradeid, branchid, teacherIds[] }`, phần tử `null` = lớp chưa có GVCN | admin | ✅ |
| PUT | `/classes/:id` | `classController.putClass` — body `{ teacherid }`, `null` = bỏ GVCN; 409 lớp lưu trữ | admin | ✅ |
| PUT | `/classes/:id/qrcode` | `classController.putClassQRCode` — sinh `qrcode` mới (QR cũ hết hiệu lực), cả lớp lưu trữ | admin | ✅ |
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
| GET | `/points?weekid=&classid=&type=&studentid=&ruleid=` | `pointController.getPoints` — kèm `students[]`, `rulecontent`, `pointdate`, `entereddate`, `enteredtime`; sắp theo tuần → lớp → `pointdate` → `created_at` | admin, user | ✅ |
| GET | `/points/:id` | `pointController.getPoint` | admin, user | ✅ |
| POST | `/points` | `pointController.postPoint` — body `{ weekid, classid, ruleid?, type?, content?, value?, pointdate?, studentIds? }` (có `ruleid` thì trường thiếu lấy theo mục, không có thì `type`/`content`/`value` bắt buộc; `ruleid: null` → 400); ghi `accountid`; 400 `type` khác phần của mục / `pointdate` ngoài tuần, 403 lớp không được chấm, 404 mục quy chế, 409 tuần đã khóa / mục đã ngừng áp dụng | admin mọi lớp · cờ đỏ lớp được phân công (trừ lớp mình) · GVCN 403 (chỉ xem) | ✅ |
| PUT | `/points/:id` | `pointController.putPoint` — body `{ ruleid?, type?, content?, value?, pointdate?, studentIds? }` (`ruleid`: bỏ = giữ, `null` = bỏ liên kết, số = đổi mục; mảng `studentIds` = thay toàn bộ) | admin mọi lượt · cờ đỏ chỉ lượt mình nhập, lớp còn được phân công · GVCN 403 | ✅ |
| DELETE | `/points/:id` | `pointController.removePoint` | như PUT | ✅ |
| GET | `/rules?type=&active=` | `ruleController.getRules` — quy chế thi đua kèm `uses`; `active` chỉ nhận `'true'`/`'false'`; sắp `type DESC, value, content` | admin, user | ✅ |
| GET | `/rules/:id` | `ruleController.getRule` | admin, user | ✅ |
| POST | `/rules` | `ruleController.postRule` — body `{ type, content, value, active? }`; 409 trùng `(type, content)` | admin | ✅ |
| PUT | `/rules/:id` | `ruleController.putRule` — body `{ type?, content?, value?, active? }`; không đổi lượt chấm đã gắn | admin | ✅ |
| DELETE | `/rules/:id` | `ruleController.removeRule` — 409 nếu đã dùng (`uses > 0`), gợi ý `active = false` | admin | ✅ |
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
| GET | `/public/classes/:qrcode?schoolyearid=` | `scoreController.getPublicClassScore` — trang lớp cho phụ huynh (mã QR `BaseQRCode`), tìm lớp theo `class.qrcode`: thông tin lớp, `schoolyears[]`, điểm các tuần đã bắt đầu + `points[]` kèm `students: { name }[]`; 404 mã sai / lớp / năm học | public | ✅ |
| GET | `/public/meta` | `scoreController.getPublicMeta` — trang tổng quan khi chưa đăng nhập: `schoolyears[]`, `currentweek` (null nếu ngoài mọi tuần), `branches[]`, `grades[]` | public | ✅ |
| GET | `/public/scores/periods?schoolyearid=` | `scoreController.getPublicRankingPeriods` — như `/scores/periods`, `schoolyear` chỉ cột công khai | public | ✅ |
| GET | `/public/scores/ranking?` (query như `/scores/ranking`) | `scoreController.getPublicRanking` — như `/scores/ranking`, `scores[]` bỏ `teacherid` | public | ✅ |
| PUT | `/accounts/:id/classes` | `accountController.putAccountClasses` — body `{ classIds[] }` thay toàn bộ lớp cờ đỏ chấm | admin | ✅ |
| GET | `/parents?studentid=&classid=` | `parentController.getParents` — kèm `hasaccount`, `studentcode`, `studentname`, `classid`, `classname`; không lọc thì bỏ HS lớp lưu trữ | admin | ✅ |
| GET | `/parents/:id` | `parentController.getParent` | admin | ✅ |
| POST | `/parents` | `parentController.postParent` — body `{ name, relation: 'Cha'\|'Mẹ', studentid, username?, password? }` (username/password cùng có hoặc cùng không); 409 trùng username / HS đã có cha (mẹ) | admin | ✅ |
| PUT | `/parents/:id` | `parentController.putParent` — body `{ name?, relation?, studentid?, username? (null = xóa tài khoản đăng nhập), password?, active? }` | admin | ✅ |
| DELETE | `/parents/:id` | `parentController.removeParent` | admin | ✅ |
| POST | `/auth/parent/login` | `parentController.postParentLogin` — body `{ username, password }` → `{ token (role 'parent'), parent }`; 401 sai, 403 bị khóa | public | ✅ |
| GET | `/auth/parent/me` | `parentController.getParentMe` — phụ huynh + con + lớp + `BaseQRCode` | phụ huynh (`authenticateParent`) | ✅ |
| PUT | `/auth/parent/password` | `parentController.putParentPassword` — body `{ oldPassword, newPassword }` | phụ huynh | ✅ |
| GET | `/folders` | `folderController.getRootFolder` — nội dung thư mục gốc `{ folder: null, path: [], folders[], files[] }` | admin, user | ✅ |
| GET | `/folders/:id` | `folderController.getFolder` — `{ folder, path[] (gốc → thư mục), folders[], files[] }` | admin, user | ✅ |
| POST | `/folders` | `folderController.postFolder` — body `{ name, parentid? }`; 404 thư mục cha, 409 trùng tên | admin | ✅ |
| PUT | `/folders/:id` | `folderController.putFolder` — body `{ name?, parentid? (null = gốc) }`; 409 chuyển vào chính nó / thư mục con, trùng tên | admin | ✅ |
| DELETE | `/folders/:id?recursive=` | `folderController.removeFolder` — 409 thư mục không trống nếu không có `recursive=true`; trả thêm `deletedfolders`, `deletedfiles` | admin | ✅ |
| GET | `/files/:id` | `fileController.getFile` — metadata (không có `storagekey`) | admin, user | ✅ |
| GET | `/files/:id/download` | `fileController.downloadFile` — `res.sendFile` từ `public/files/<storagekey>`, `attachment` + `nosniff`; 404 không còn trong kho | admin, user | ✅ |
| POST | `/files` | `uploadFile` → `fileController.postFile` — multipart `file`, `folderid?`, `name?`; 413 quá `FILE_MAX_SIZE_MB` | admin | ✅ |
| PUT | `/files/:id` | `uploadFile` → `fileController.putFile` — JSON / multipart `{ name?, folderid?, file? (thay nội dung) }` | admin | ✅ |
| DELETE | `/files/:id` | `fileController.removeFile` — xóa cả file trong kho | admin | ✅ |
| GET | `/auth/parent/points?schoolyearid=` | `parentController.getParentPoints` — lượt chấm có gắn con (`req.parent.studentid`): `{ schoolyear, points[], summary: { count, plus, minus, total } }`; mặc định năm học đã bắt đầu gần nhất; 400 / 404 năm học | phụ huynh | ✅ |

## Services

| File | Hàm | Bảng/View | Mô tả |
|---|---|---|---|
| `branchService.ts` | `fetchAllBranch`, `checkBranchExist`, `createBranch`, `updateBranch`, `deleteBranch` | branch | CRUD phân hiệu |
| `gradeService.ts` | `fetchAllGrade`, `checkGradeExist` | grade | Khối chỉ đọc (khởi tạo trong `init.sql`) |
| `teacherService.ts` | `fetchAllTeacher(branchid?)`, `checkTeacherExist`, `checkListTeacherExist`, `fetchHomeroomClasses`, `createTeacher(branchid, names)`, `updateTeacher`, `deleteTeacher` | teacher, class_view | Insert hàng loạt theo phân hiệu; đổi phân hiệu bị chặn khi đang chủ nhiệm |
| `classService.ts` | `getAllClass(filter)` (`archived` mặc định false), `getClassById`, `findClassIdByQRCode`, `regenerateClassQRCode`, `assertClassActive`, `batchCreateClass`, `updateClassTeacher`, `deleteClass`, `promoteClasses(client, oldYearId, grade6?)` | class, class_view, class_year, student, account, account_class, school_year | Xem luồng tạo lớp và lên lớp bên dưới; `getAllClass`/`getClassById` kèm `numstudents` (đếm thẳng bảng `student`, không import `studentService` để tránh import vòng), `archivedyearname`; `BaseQRCode` = `BASE_QR_PATH` (`'/LopHoc/'`) + `qrcode`, tính trong SELECT; `assertClassActive` (409 lớp lưu trữ) dùng ở `updateClassTeacher`, `studentService`, `pointService.createPoint` |
| `parentService.ts` | `RELATIONS`, `fetchAllParent(filter)`, `checkParentExist`, `fetchAuthParent`, `fetchParentMe`, `loginParent`, `changeParentPassword`, `createParent`, `updateParent`, `deleteParent`, `fetchParentPoints(studentid, schoolyearid?)` | parent, student, class_view, point, point_student, week, school_year, class_year | Không SELECT `password` (`selectParent` liệt kê cột); lớp của con JOIN qua `student.classid`; login sai username vẫn chạy bcrypt hash giả; `updateParent`: `username: null` xóa luôn password, tạo tài khoản mới phải kèm password; 23505 map theo tên ràng buộc; `fetchParentPoints` lấy lượt qua `point_student` của con, `classname` = tên lớp lúc chấm (`class_year` năm đã lên lớp, ngược lại `class_view`), không trả học sinh khác / người nhập |
| `studentService.ts` | `GENDERS`, `fetchAllStudent(filter)` (filter `classIds` để giới hạn cờ đỏ; không có `classid` thì bỏ lớp lưu trữ), `checkStudentExist`, `checkListStudentExist`, `createStudent(classid, students)`, `updateStudent`, `deleteStudent` (409 nếu gắn lượt chấm hoặc còn phụ huynh, đếm thẳng bảng `parent`) | student, class_view, point_student, parent | Thêm hàng loạt vào 1 lớp; chuyển lớp bằng đổi `classid`; dùng `getClassById` + `assertClassActive` để kiểm tra lớp đích |
| `schoolYearService.ts` | `fetchAllSchoolYear`, `checkSchoolYearExist`, `createSchoolYear(..., grade6?)`, `updateSchoolYear`, `deleteSchoolYear` | school_year, week, class_year, class | Tạo/đổi số tuần trong transaction + `LOCK TABLE school_year`; chặn chồng thời gian giữa các năm học; tạo năm học chỉ khi năm mới nhất đã kết thúc và gọi `promoteClasses` trong cùng transaction (xem luồng lên lớp); `semester2_week` trả giá trị hiệu lực (null → `CEIL(numweeks/2)+1`), phải nằm trong 2..numweeks |
| `weekService.ts` | `fetchAllWeek(schoolyearid?)`, `checkWeekExist`, `fetchCurrentWeek`, `checkWeekOpen`, `updateWeek` | week | `checkWeekOpen` dùng chung để chặn sửa điểm tuần đã khóa (409) |
| `pointService.ts` | `POINT_TYPES`, `PointInput`, `fetchAllPoint(filter)` (lọc thêm `ruleid`), `checkPointExist`, `createPoint(actor, weekid, classid, input, studentIds)`, `updatePoint(actor, id, input, studentIds?)`, `deletePoint(actor, ...)` | point, point_student, student, class_view, week, account, rule | Kèm `classteacherid`, `accountusername`, `entereddate` / `enteredtime` (`created_at` theo giờ `Asia/Ho_Chi_Minh`, `'YYYY-MM-DD'` / `'HH:mm'`), `rulecontent` (LEFT JOIN `rule`), `pointdate`; GVCN bị chặn bằng `assertNotViewOnly`; quyền theo lớp bằng `canScoreClass` + `assertCanManagePoint` (403 trước 409 tuần khóa); lượt cộng/trừ nhập tự do hoặc theo mục quy chế: `loadRule` (404 / 409 mục ngừng áp dụng, trừ mục đang gắn sẵn), `assertRuleType` (400 `type` khác phần của mục); `pointdate`: `assertDateInWeek` (400 ngoài tuần, `week` lấy từ `checkWeekOpen`), `defaultPointDate` (hôm nay giờ local kẹp vào tuần) khi POST không gửi, PUT không gửi thì giữ; gắn học sinh qua `point_student` (tạo/sửa trong transaction, học sinh mới gắn phải thuộc lớp của lượt chấm, dùng `checkListStudentExist`) |
| `ruleService.ts` | `fetchAllRule({ type?, active? })`, `checkRuleExist`, `createRule`, `updateRule`, `deleteRule` | rule, point | Quy chế thi đua; mỗi mục kèm `uses` (số lượt chấm có `ruleid` = mục, `::int`); sắp `type DESC, value, content`; xóa mục `uses > 0` → 409 (gợi ý `active = false`); trùng `(type, content)` để lỗi 23505 map 409 |
| `accountService.ts` | `ROLES`, `Actor`, `fetchAllAccount(filter)`, `checkAccountExist`, `fetchAuthAccount`, `fetchAssignedClassIds`, `canScoreClass`, `login`, `changePassword`, `createAccount`, `updateAccount`, `deleteAccount`, `replaceAccountClasses` | account, account_class, teacher, student, class_view | Không SELECT `password` ra ngoài (`selectAccount` liệt kê cột); `kind` = admin / gvcn / codo; login sai username vẫn chạy bcrypt với hash giả; luôn còn ≥ 1 admin hoạt động; không tự khóa / xóa mình; cờ đỏ không được phân công lớp của mình hay lớp lưu trữ (409) |
| `scoreService.ts` | `fetchWeeklyScore`, `fetchSummaryScore`, `fetchClassScore`, `fetchRanking` (khoảng `week`/`month`/`semester`/`year`), `fetchRankingPeriods`, `fetchWeekPointDetails(weekid)`, `fetchPublicClassScore(qrcode, schoolyearid?)`, `fetchPublicMeta`, `fetchPublicRankingPeriods`, `fetchPublicRanking` | score_view, week, point, point_student, student, school_year | Chỉ đọc; rank bằng `RANK() OVER` (cùng điểm cùng hạng). Xem mục xếp hạng theo khoảng bên dưới. Lượt chấm (Excel, trang công khai) sắp theo phần → `pointdate` → `created_at`; trang công khai trả `points[].pointdate`. Tổng quan công khai: `fetchPublicMeta` SQL liệt kê cột (school_year, week, branch, grade); `fetchPublicRanking` / `fetchPublicRankingPeriods` bọc `fetchRanking` / `fetchRankingPeriods` (cùng số liệu, cùng lỗi) và chỉ giữ cột công khai |
| `folderService.ts` | `fetchAllFolder(parentid)`, `checkFolderExist`, `fetchFolderPath`, `createFolder(accountid, name, parentid)`, `updateFolder`, `deleteFolder(id, recursive)` | folder, file, account | Mỗi thư mục kèm `accountusername`, `numfolders`, `numfiles`; `fetchFolderPath` CTE đệ quy lên gốc; `updateFolder` chuyển thư mục trong transaction + `LOCK TABLE folder IN SHARE ROW EXCLUSIVE MODE`, chặn vòng bằng CTE cây con; `deleteFolder` gom cây con (CTE) → `FOR UPDATE` → xóa `file` (lấy `storagekey`) → 1 câu xóa `folder` → COMMIT → `removeStoredFiles`; 23505 `folder_name_unique` → 409. Không import `fileService` (tránh import vòng), xóa `file` bằng SQL thẳng |
| `fileService.ts` | `StoredUpload`, `fetchAllFile(folderid)`, `checkFileExist`, `fetchFileForDownload`, `createFile(accountid, folderid, name, upload)`, `updateFile(id, { name?, folderid?, upload? })`, `deleteFile` | file, account (qua `checkFolderExist`) | Không trả `storagekey` (chỉ `fetchFileForDownload` dùng nội bộ); thay nội dung: UPDATE trỏ `storagekey` mới rồi mới xóa file cũ; 23505 `file_name_unique` → 409 |
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
- `point` là lượt cộng/trừ nhập tự do hoặc chọn từ quy chế (`ruleid`, chép `type`/`content`/`value` của mục): `value < 0` trừ, `value > 0` cộng; `pointdate` là ngày diễn ra trong tuần.
- `score_view` = `week` × `class_view` LEFT JOIN `point`: `conduct_score = conduct_base + Σ value (Nề nếp)`, tương tự `study_score`; `total = conduct_score + study_score`; `*_plus`/`*_minus` là tổng cộng / tổng trừ (số dương).
- Lớp của từng năm: năm có `class_year` (đã lên lớp) chỉ gồm các lớp trong ảnh chụp, `classname`/`gradeid`/`numgrade`/`teacherid`/`teachername` lấy từ ảnh chụp; năm chưa có (năm hiện tại) gồm các lớp đang học (`archivedyearid IS NULL`).
- Tuần `locked = true` thì không tạo/sửa/xóa `point` và không đổi điểm gốc (trừ khi mở khóa cùng request).

### Xếp hạng theo tuần / tháng / học kỳ (`fetchRanking`)

1. `fetchPeriodWeeks`: lấy các tuần của năm học kèm `month` = `to_char(startdate + 3, 'YYYY-MM')` (tháng chứa thứ Năm, tức tháng có nhiều ngày của tuần hơn), `semester` (= 1 nếu `numweek < semester2_week`), `started` (`startdate <= CURRENT_DATE`).
2. Lọc tuần thuộc khoảng; không có tuần nào → 404; chưa tuần nào bắt đầu → 409.
3. Gom `score_view` của các tuần **đã bắt đầu** theo lớp: tổng các cột điểm, `avg_total`, `entries`, `RANK() OVER (ORDER BY ROUND(AVG(total), 2) DESC)` (xếp theo điểm trung bình/tuần, làm tròn 2 số như `avg_total` để cùng số hiển thị thì cùng hạng; đổi từ tổng sang trung bình 2026-11-16 để lớp có ít tuần hơn không bị thiệt). `/scores/summary` cũng xếp theo trung bình.
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
| `src/app/middleware/auth.ts` → `authenticate` | Đọc `Authorization: Bearer`, verify JWT, tra lại `account` mỗi request (bị khóa / xóa → 401 ngay), gắn `req.user = { id, role, kind, teacherid, studentid, studentclassid }` (lấy từ DB) | ✅ mọi router (`router.use`), trừ `GET /`, `POST /auth/login`, `/public` (`publicRouter.ts`) |
| `src/app/middleware/auth.ts` → `authorize(...roles)` | Kiểm tra `req.user.role`, sai → 403 | ✅ route ghi của branch/teacher/class/student/school-year/week/rule/folder/file, toàn bộ `/accounts` |
| `src/app/middleware/auth.ts` → `authenticateParent` | Token `role = 'parent'`, tra `parent` mỗi request (khóa / xóa / bỏ tài khoản → 401), gắn `req.parent = { id, studentid }`. `authenticate` từ chối token có role ngoài `ROLES` (token phụ huynh) | ✅ `/auth/parent/me`, `/auth/parent/password`, `/auth/parent/points` |
| `src/app/middleware/upload.ts` → `uploadFile` | `multer` (`diskStorage`) nhận 1 file ở trường `file`, ghi thẳng vào `public/files` với tên = uuid mới (`req.file.filename` = `storagekey`); giới hạn `FILE_MAX_SIZE_MB` (mặc định 20, tối đa 2000) → 413; sai trường / > 1 file → 400. Request không phải multipart đi qua. Đặt **sau** `authorize('admin')`; controller lỗi thì tự xóa file vừa ghi (`discardUpload`) | ✅ `POST /files`, `PUT /files/:id` |
| Quyền theo dữ liệu sở hữu | `pointService` (chấm điểm), `studentController` / `classController` (cờ đỏ xem học sinh) | ✅ |

## Bảng tài khoản

| Bảng | Mô tả | Trạng thái |
|---|---|---|
| `account` | role `admin` (GV quản lý nề nếp) / `user` (GVCN gắn `teacherid` hoặc cờ đỏ gắn `studentid`), hash bcrypt, `active` | ✅ |
| `account_class` | Lớp cờ đỏ được phân công chấm | ✅ |
| `class.qrcode` | Mã ngẫu nhiên 16 hex của trang lớp công khai (`/LopHoc/<qrcode>`), unique `class_qrcode_unique`, default `gen_random_uuid()` | ✅ |
| `class.archivedyearid` | Năm học lớp ra trường (lưu trữ khi lên lớp), null = đang học; unique `(gradeid, branchid, seq)` chỉ áp cho lớp đang học (`class_active_unique`) | ✅ |
| `class_year` | Ảnh chụp tên / khối / GVCN của lớp trong năm học đã lên lớp, `score_view` dùng cho năm cũ | ✅ |
| `point.accountid` | Người nhập lượt chấm (`ON DELETE SET NULL`), ghi ở `createPoint` | ✅ |
| `rule` | Quy chế thi đua: mục cộng/trừ mẫu (`type`, `content`, `value` ≠ 0, `active`), unique `(type, content)`; 41 mục mặc định nạp ở phần 2 `init.sql` | ✅ |
| `point.ruleid` | Mục quy chế đã chọn (`fk_point_rule` `ON DELETE SET NULL`, index `point_rule_idx`), null = nhập tự do | ✅ |
| `parent` | Phụ huynh: `name`, `relation` (`Cha`/`Mẹ`), `studentid` (`ON DELETE CASCADE`, nhưng xóa HS còn phụ huynh bị chặn 409), `username`/`password` (tùy chọn, `parent_login_check` cùng có hoặc cùng null), `active`; unique `parent_username_unique`, `parent_student_relation_unique (studentid, relation)` | ✅ |
| `point.pointdate` | Ngày diễn ra (`date NOT NULL DEFAULT CURRENT_DATE`), phải nằm trong tuần (kiểm tra ở service); `point.created_at` / `updated_at` là `timestamptz` | ✅ |
| `folder` | Kho tài liệu: cây thư mục (`parentid` tự tham chiếu, null = gốc, `accountid` người tạo), tên duy nhất không phân biệt hoa thường trong cùng cha (`folder_name_unique`) | ✅ `/folders` |
| `file` | Metadata file trong thư mục (`folderid` null = gốc, `name`, `storagekey` unique, `mimetype`, `size`, `accountid` người tải lên); nội dung lưu ở `public/files/<storagekey>` | ✅ `/files` |

SQL: chỉ một file `cscript/init.sql` (phần 1 schema, phần 2 dữ liệu giai đoạn đầu: 55 lớp + GVCN theo danh sách nhà trường, 2493 học sinh, năm học 2026-2027 (tuần 1–10 đã khóa), 7 tài khoản + phân công cờ đỏ, 2271 lượt chấm tuần 1–10, mã QR lớp, 41 mục quy chế thi đua, 50 phụ huynh giả của 30 học sinh), xem `database.md`.

## Quyết định thiết kế

- SQL thuần qua `pg` Pool dùng chung, không ORM.
- Tên lớp không lưu trong DB; tính trong `class_view` (`numgrade` + `branch.code` + `seq`), nên đổi mã phân hiệu thì tên lớp tự đổi.
- Insert hàng loạt: một câu INSERT với placeholder `($1),($2),...` (mẫu ở `createTeacher`).
- Xóa có dữ liệu con trả 409 thay vì để CASCADE xóa dây chuyền.
- Schema và dữ liệu khởi tạo gom vào 1 file `cscript/init.sql` (2026-11-09, thay `migration.sql`, `seed.sql`, `data-dev.sql`, `update-gvcn.sql`). Dữ liệu nạp theo khóa tự nhiên (tên lớp, mã học sinh) để chạy lại được và không phụ thuộc id. Từ 2026-11-16 phần 2 là ảnh chụp toàn bộ DB dev (thêm lại tài khoản `gvcn.*` / `codo.*` / `nkn.codo`, phân công, lượt chấm tuần 1–10, khóa tuần, mã QR) theo yêu cầu người dùng; lượt chấm chỉ nạp vào tuần trống để chạy lại không nhân đôi.
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
- Trang công khai cho phụ huynh (2026-11-15): `BaseQRCode` = `/LopHoc/<qrcode>`, FE ghép domain FE rồi render mã QR. Router riêng `/public` không qua `authenticate`; `fetchPublicClassScore` chỉ chọn cột cần thiết, không trả danh sách học sinh, `accountid`, `teacherid`.
- Hiện họ tên học sinh gắn vào lượt chấm trên trang công khai (2026-11-16, người dùng xác nhận, cả lượt cộng và trừ): chỉ trả `name`, không id / mã / ngày sinh. Vì vậy link công khai đổi từ id lớp sang `class.qrcode` ngẫu nhiên (16 hex, ~60 bit): id tuần tự cho phép dò tên học sinh vi phạm của mọi lớp, mã ngẫu nhiên thì chỉ ai có QR của lớp mới xem được. Mã gắn với lớp nên vẫn giữ nguyên khi lên lớp; QR bị lộ thì admin đổi mã (`PUT /classes/:id/qrcode`). Link theo id cũ (`/LopHoc/<id>`) không còn dùng được.
- Lớp lưu trữ bỏ GVCN để giáo viên nhận lớp 6 mới (`class_teacher_unique`); tên GVCN năm đó vẫn còn trong `class_year`. Tài khoản cờ đỏ của học sinh ra trường bị khóa (`active = false`), không xóa, để giữ `point.accountid`.
- Quy chế thi đua (2026-11-17): bảng `rule` là danh mục mẫu; lượt chấm vẫn lưu `type`, `content`, `value` riêng (chép từ mục lúc chấm, sửa được), `ruleid` chỉ là liên kết, nên sửa mục quy chế không đổi điểm các lượt đã chấm. Xóa mục đã dùng trả 409 (chuyển `active = false` để ngừng áp dụng) dù FK là `ON DELETE SET NULL`. Mục ngừng áp dụng không chọn được cho lượt mới, nhưng lượt đang gắn mục đó vẫn sửa được. `value` của mục là điểm cho 1 lần / 1 học sinh; BE **không** nhân điểm theo số học sinh gắn kèm (FE tự tính nếu cần), để lượt chấm luôn lưu đúng điểm người chấm thấy.
- Lượt chấm có `pointdate` riêng (2026-11-17) vì cờ đỏ có thể nhập bù sau ngày vi phạm; `pointdate` phải nằm trong tuần của lượt chấm. Thời điểm nhập là `created_at`; chỉ bảng `point` dùng `timestamptz` (để hiện giờ nhập), các bảng khác vẫn `date`. `entereddate` / `enteredtime` tính trong SQL theo `Asia/Ho_Chi_Minh` để FE không phải đổi múi giờ.
- Phụ huynh (2026-11-22): bảng `parent` riêng thay vì thêm role vào `account`, vì mọi route GET hiện chỉ cần `authenticate` (mọi tài khoản đọc được học sinh, giáo viên...): thêm role vào `account` sẽ mở các route đó cho phụ huynh. Token phụ huynh có `role: 'parent'`, `id` là `parent.id`; `authenticate` từ chối role ngoài `ROLES` để id không bị tra nhầm sang `account`. Đăng nhập riêng `POST /auth/parent/login` (username hai bảng độc lập, có thể trùng nhau). Lớp của con không lưu (suy từ `student.classid`) để không lệch khi chuyển lớp / lên lớp. `username`/`password` không bắt buộc để nhập thông tin phụ huynh trước, cấp tài khoản sau. Mỗi bản ghi 1 con, mỗi học sinh tối đa 1 cha, 1 mẹ. Xóa học sinh còn phụ huynh trả 409 (theo quy tắc không CASCADE dây chuyền) dù FK là `ON DELETE CASCADE`.
- Tổng quan công khai (2026-11-22, người dùng yêu cầu): `/public/meta`, `/public/scores/periods`, `/public/scores/ranking` cho trang tổng quan khi chưa đăng nhập. Không mở `authenticate` của `/scores` mà thêm route riêng dưới `/public` để kiểm soát cột: chỉ số liệu tổng hợp theo lớp (điểm, hạng, tên lớp, tên GVCN như trang lớp QR), không có học sinh, nội dung lượt chấm, tài khoản, `teacherid`. Không công khai `/scores/weekly` (có thêm điểm gốc, không cần cho tổng quan), `/scores/export`, `/scores/class/:id` (truy theo id lớp). Chưa có giới hạn tần suất request (rate limit) cho `/public`.
- Kho tài liệu dạng thư mục (2026-11-24, người dùng yêu cầu, mới có bảng): 2 bảng `folder` (cây tự tham chiếu `parentid`, kiểu adjacency list, duyệt bằng CTE đệ quy) và `file` (chỉ metadata). Nội dung file **không** lưu trong DB (không dùng `bytea`) để DB và bản sao lưu không phình; lưu ra kho theo `storagekey` ngẫu nhiên do server sinh, nên tên người dùng đặt không bao giờ thành đường dẫn (tránh path traversal) và đổi tên / chuyển thư mục chỉ sửa DB, không đụng file thật. FK thư mục cha / thư mục chứa không CASCADE (theo quy tắc xóa có dữ liệu con không xóa dây chuyền, và CASCADE sẽ xóa dòng mà để lại file vật lý mồ côi): service tự gom cả cây để xóa. Tên duy nhất không phân biệt hoa thường trong cùng thư mục (unique index biểu thức `COALESCE(parentid, 0)` vì NULL không so trùng được, không dùng `NULLS NOT DISTINCT` để chạy được trên PostgreSQL < 15). `created_at` / `updated_at` dùng `timestamptz` như `point` để hiện giờ tải lên / sửa. API (2026-11-24): file lưu ở thư mục `public/files` trong source theo yêu cầu người dùng (đã thêm vào `.gitignore`), **không** mount `express.static` vì nội dung phải qua đăng nhập; tải về luôn `attachment` + `X-Content-Type-Options: nosniff` để file HTML / SVG tải lên không chạy được trên domain API. Quyền: đọc / tải = admin, user; ghi = admin (người dùng chưa chọn phân quyền theo thư mục). Phụ huynh không truy cập. Xóa thư mục không trống phải gửi `?recursive=true` (theo quy tắc xóa có dữ liệu con trả 409, nhưng vẫn cho xóa cả cây khi người dùng xác nhận). Thay nội dung file giữ id / tên (như "tải phiên bản mới"). Mỗi request 1 file để lỗi trùng tên / quá dung lượng rõ theo từng file. Multer ghi thẳng vào kho (không giữ trong RAM) với tên uuid; request lỗi thì controller xóa file vừa ghi. Chưa có: giới hạn loại file, tổng dung lượng kho, sao lưu thư mục `public/files` (backup DB không chứa nội dung file).
- Lượt chấm của con cho phụ huynh (2026-11-22, người dùng yêu cầu qua FE): `GET /auth/parent/points` sau `authenticateParent`, giới hạn theo `req.parent.studentid` (không nhận studentid từ query). Trả cả lượt ở lớp cũ nếu con đã chuyển lớp (`classid` để FE lọc theo lớp đang xem). `value` là điểm cả lượt, không chia theo số học sinh gắn kèm (cùng quyết định với quy chế: BE không nhân / chia điểm theo học sinh).
