import { getWeeks, getCurrentWeek, getWeek, putWeek } from '../app/controller/weekController';
import { authenticate, authorize } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Tuần — mount tại /weeks
// Tuần được sinh khi tạo/sửa năm học, không tạo/xóa riêng lẻ
// Dữ liệu trả về kèm schoolyearname, entries (số lượt chấm điểm)
// Quyền: đọc = admin, user; ghi = admin
// Mọi route qua authenticate (401 chưa đăng nhập); route ghi qua authorize('admin') (403)

// GET /weeks?schoolyearid=
// Lấy danh sách tuần, lọc theo năm học (không bắt buộc), sắp xếp theo ngày
router.get('/', getWeeks);

// GET /weeks/current
// Tuần chứa ngày hôm nay. 404 nếu hôm nay không thuộc tuần nào
router.get('/current', getCurrentWeek);

// GET /weeks/:id
// Lấy 1 tuần. 400 id sai, 404 không tìm thấy
router.get('/:id', getWeek);

// PUT /weeks/:id
// Body: { conduct_base?: 0-1000, study_base?: 0-1000, locked?: boolean, applyToNext?: boolean }
// applyToNext = true: áp điểm gốc của tuần này cho các tuần sau chưa khóa cùng năm học
// Tuần đã khóa chỉ đổi được điểm gốc khi gửi kèm locked: false
// 400 dữ liệu sai, 404 không tìm thấy, 409 tuần đã khóa
router.put('/:id', authorize('admin'), putWeek);

export default router;
