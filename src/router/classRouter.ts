import { getClasses, getClass, postClasses, putClass, removeClass } from '../app/controller/classController';
import { authenticate, authorize } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Lớp — mount tại /classes
// Dữ liệu trả về lấy từ class_view, có name (vd 6A1), numgrade, branchcode, branchname, teachername (null nếu chưa có GVCN), numstudents (sĩ số)
// Quyền: đọc = admin, user (cờ đỏ: students[] chỉ có ở lớp được phân công); ghi = admin
// Mọi route qua authenticate (401 chưa đăng nhập); route ghi qua authorize('admin') (403)

// GET /classes?branchid=&gradeid=&archived=
// Lấy danh sách lớp, lọc theo phân hiệu/khối (không bắt buộc), sắp xếp theo khối → phân hiệu → seq
// archived: false (mặc định) = lớp đang học; true = lớp đã ra trường (lưu trữ khi lên lớp), mới nhất trước,
// mỗi lớp có archivedyearid, archivedyearname (năm học ra trường). 400 archived sai
router.get('/', getClasses);

// GET /classes/:id
// Lấy 1 lớp (kể cả lớp đã lưu trữ), kèm students[] (danh sách học sinh của lớp). 400 id sai, 404 không tìm thấy
router.get('/:id', getClass);

// POST /classes
// Body: { gradeid: number, branchid: number, teacherIds: (number | null)[] }
// Tạo hàng loạt lớp cho 1 khối của 1 phân hiệu, mỗi phần tử là GVCN của 1 lớp (null = chưa phân công), seq tăng tiếp từ lớp cuối
// vd đã có 6A1, gửi [5, null] → tạo 6A2 (GV 5), 6A3 (chưa có GVCN)
// 201 tạo thành công, 400 dữ liệu sai / giáo viên khác phân hiệu,
// 404 không tìm thấy khối/phân hiệu/giáo viên, 409 giáo viên đã chủ nhiệm lớp khác
router.post('/', authorize('admin'), postClasses);

// PUT /classes/:id
// Body: { teacherid: number | null } — đổi giáo viên chủ nhiệm (phải cùng phân hiệu, chưa chủ nhiệm lớp khác), null để bỏ phân công
// 400 dữ liệu sai, 404 không tìm thấy, 409 giáo viên đã chủ nhiệm lớp khác / lớp đã ra trường (lưu trữ)
router.put('/:id', authorize('admin'), putClass);

// DELETE /classes/:id
// 404 không tìm thấy, 409 nếu lớp còn học sinh hoặc đã có điểm thi đua
router.delete('/:id', authorize('admin'), removeClass);

export default router;
