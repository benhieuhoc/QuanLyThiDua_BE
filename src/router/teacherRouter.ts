import { getTeachers, getTeacher, postTeachers, putTeacher, removeTeacher } from '../app/controller/teacherController';
import { authenticate, authorize } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Giáo viên — mount tại /teachers
// Quyền: đọc = admin, user; ghi = admin
// Mọi route qua authenticate (401 chưa đăng nhập); route ghi qua authorize('admin') (403)

// GET /teachers?branchid=
// Lấy danh sách giáo viên, lọc theo phân hiệu (không bắt buộc)
// Mỗi giáo viên kèm classid, classname của lớp chủ nhiệm (null nếu chưa có)
router.get('/', getTeachers);

// GET /teachers/:id
// Lấy 1 giáo viên. 400 id sai, 404 không tìm thấy
router.get('/:id', getTeacher);

// POST /teachers
// Body: { branchid: number, names: string[] (mỗi tên ≤25) } — tạo hàng loạt cho 1 phân hiệu
// 201 trả về danh sách đã tạo, 400 dữ liệu sai, 404 không tìm thấy phân hiệu
router.post('/', authorize('admin'), postTeachers);

// PUT /teachers/:id
// Body: { name?, branchid? } — chỉ cập nhật trường được gửi
// 404 không tìm thấy, 409 đổi phân hiệu khi đang chủ nhiệm lớp
router.put('/:id', authorize('admin'), putTeacher);

// DELETE /teachers/:id
// 404 không tìm thấy, 409 nếu đang chủ nhiệm lớp
router.delete('/:id', authorize('admin'), removeTeacher);

export default router;
