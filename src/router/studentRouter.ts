import { getStudents, getStudent, postStudents, putStudent, removeStudent } from '../app/controller/studentController';
import { authenticate, authorize } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Học sinh — mount tại /students
// Học sinh là dữ liệu của lớp, không có tài khoản đăng nhập. Dữ liệu trả về kèm classname (vd 6A1), gradeid, branchid
// Quyền: đọc = admin, user (cờ đỏ chỉ xem học sinh lớp được phân công); ghi = admin
// Mọi route qua authenticate (401 chưa đăng nhập); route ghi qua authorize('admin') (403)

// GET /students?classid=&branchid=&gradeid=
// Lấy danh sách học sinh, lọc theo lớp/phân hiệu/khối (không bắt buộc), sắp xếp theo lớp → id
// 400 id lọc sai
router.get('/', getStudents);

// GET /students/:id
// Lấy 1 học sinh. 400 id sai, 404 không tìm thấy
router.get('/:id', getStudent);

// POST /students
// Body: { classid: number, students: [{ code: string (chữ/số, ≤ 20, duy nhất), name: string (≤ 50), gender?: 'Nam' | 'Nữ' | null, birthdate?: 'YYYY-MM-DD' | null }] }
// Thêm hàng loạt học sinh vào 1 lớp
// 201 tạo thành công, 400 dữ liệu sai, 404 không tìm thấy lớp, 409 trùng mã học sinh
router.post('/', authorize('admin'), postStudents);

// PUT /students/:id
// Body: { code?, name?, gender?, birthdate?, classid? } — gender/birthdate gửi null để xóa; đổi classid là chuyển lớp
// 400 dữ liệu sai, 404 không tìm thấy học sinh/lớp, 409 trùng mã học sinh
router.put('/:id', authorize('admin'), putStudent);

// DELETE /students/:id
// 404 không tìm thấy, 409 học sinh đã được gắn vào lượt chấm điểm
router.delete('/:id', authorize('admin'), removeStudent);

export default router;
