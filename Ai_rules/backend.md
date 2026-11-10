# Quy tắc back-end (controller & service)

## Phân lớp

```
router  →  middleware (auth, phân quyền)  →  controller  →  service  →  pool (db)
```

| Lớp | Vị trí | Trách nhiệm | Không được |
|---|---|---|---|
| Router | `src/router/` | Khai báo path, method, gắn middleware và controller | Chứa logic hay SQL |
| Controller | `src/app/controller/<entity>Controller.ts` | Đọc `req`, validate input, gọi service, trả response, bắt lỗi | Gọi `pool` trực tiếp |
| Service | `src/app/service/<entity>Service.ts` | Logic nghiệp vụ và SQL | Đụng tới `req`/`res` |
| DB | `src/config/db.ts` | Pool dùng chung | Tạo thêm Pool khác |
| Utils | `src/app/utils/http.ts` | `HttpError`, `sendSuccess`, `sendError`, `handleError`, `parseId` | Chứa logic nghiệp vụ |

- Service báo lỗi nghiệp vụ bằng `throw new HttpError(status, message, errors?)`. Controller bọc `try/catch` và gọi `handleError(res, err)`, hàm này cũng map lỗi Postgres (`23505` → 409, `23503` → 409, `23514`/`22P02` → 400, còn lại → 500).
- Xóa bản ghi có dữ liệu con phải kiểm tra trước và trả `409`, không để `ON DELETE CASCADE` xóa dây chuyền (xem `deleteBranch`, `deleteTeacher`, `deleteClass`).

- Mỗi entity (bảng) có một controller và một service riêng; router theo entity đặt ở `src/router/<entity>Router.ts` và được mount trong `src/router/index.ts`.
- Service khác cần dùng lại thì import hàm service (như `classService` dùng `checkGradeExist`, `checkTeacherExist`), không viết lại SQL.

## Quy ước code

- Mỗi router có note đầu file (entity, path mount, quyền) và note trên từng route: method + path, query/body kèm kiểu và giới hạn, các mã lỗi có thể trả về. Xem mẫu ở `src/router/classRouter.ts`. Sửa route thì sửa note.

- Export hàm dạng `export const tenHam = async (...) => {}` như code hiện có.
- Đặt tên REST: `GET /teachers`, `GET /teachers/:id`, `POST /teachers`, `PUT /teachers/:id`, `DELETE /teachers/:id`.
- Validate input ở controller trước khi gọi service: kiểu dữ liệu, trường bắt buộc, độ dài theo schema (ví dụ `teacher.name` tối đa 25 ký tự, `class.name` tối đa 5).
- Trước khi tạo bản ghi có khóa ngoại, service kiểm tra bản ghi tham chiếu tồn tại (các hàm `check...Exist`).
- Thao tác hàng loạt dùng một câu INSERT nhiều dòng (mẫu `createTeacher`) và transaction nếu ghi nhiều bảng.

## Response

Mọi API trả JSON cùng một dạng:

```json
{ "success": true, "data": ..., "message": "..." }
{ "success": false, "message": "...", "errors": [...] }
```

Mã HTTP: `200` thành công, `201` tạo mới, `400` input sai, `401` chưa đăng nhập, `403` không đủ quyền, `404` không tìm thấy, `409` trùng/xung đột, `500` lỗi server. Không trả stack trace hay lỗi SQL thô cho client; chỉ log ở server.

## Checklist khi thêm API

1. Đọc `code-map.md` để biết luồng hiện có.
2. Đọc phần 1 (schema) của `cscript/init.sql` (xem `database.md`).
3. Viết service → controller → router, gắn middleware phân quyền theo `security.md`.
4. Cập nhật `code-map.md` (route, controller, service, quyền, trạng thái).
