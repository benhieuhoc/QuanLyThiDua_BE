import { getSchoolYears, getSchoolYear, postSchoolYear, putSchoolYear, removeSchoolYear } from '../app/controller/schoolYearController';
import { authenticate, authorize } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Năm học — mount tại /school-years
// Mỗi năm học có numweeks (số tuần) và enddate (ngày cuối tuần cuối) tính từ bảng week
// Quyền: đọc = admin, user; ghi = admin
// Mọi route qua authenticate (401 chưa đăng nhập); route ghi qua authorize('admin') (403)

// GET /school-years
// Lấy tất cả năm học, mới nhất trước
router.get('/', getSchoolYears);

// GET /school-years/:id
// Lấy 1 năm học kèm weeks[]. 400 id sai, 404 không tìm thấy
router.get('/:id', getSchoolYear);

// POST /school-years
// Body: { name: "YYYY-YYYY" (năm sau = năm trước + 1), startdate: "YYYY-MM-DD", numweeks: 1-60,
//         conduct_base?: 0-1000 (mặc định 100), study_base?: 0-1000 (mặc định 100),
//         semester2_week?: 2..numweeks (tuần bắt đầu học kỳ 2, mặc định CEIL(numweeks / 2) + 1) }
// Tự sinh tuần 1..numweeks, mỗi tuần 7 ngày liên tiếp từ startdate, cùng điểm gốc
// 201 trả về năm học, 400 dữ liệu sai, 409 trùng tên hoặc chồng thời gian với năm học khác
router.post('/', authorize('admin'), postSchoolYear);

// PUT /school-years/:id
// Body: { name?, numweeks?, semester2_week? } — tăng numweeks thì sinh thêm tuần (điểm gốc theo tuần cuối), giảm thì xóa các tuần cuối
// semester2_week: 2..numweeks, null = về mặc định; giảm numweeks nhỏ hơn tuần HK2 đã đặt thì báo 400
// 400 dữ liệu sai / tuần HK2 ngoài số tuần, 404 không tìm thấy, 409 trùng tên / chồng thời gian / tuần bị xóa đã có điểm
router.put('/:id', authorize('admin'), putSchoolYear);

// DELETE /school-years/:id
// 404 không tìm thấy, 409 nếu năm học đã có điểm thi đua
router.delete('/:id', authorize('admin'), removeSchoolYear);

export default router;
