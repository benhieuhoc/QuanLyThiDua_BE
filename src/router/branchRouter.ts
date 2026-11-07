import { getBranches, getBranch, postBranch, putBranch, removeBranch } from '../app/controller/branchController';
import { authenticate, authorize } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Phân hiệu — mount tại /branches
// Quyền: đọc = admin, user; ghi = admin
// Mọi route qua authenticate (401 chưa đăng nhập); route ghi qua authorize('admin') (403)

// GET /branches
// Lấy tất cả phân hiệu, sắp xếp theo code
router.get('/', getBranches);

// GET /branches/:id
// Lấy 1 phân hiệu. 400 id sai, 404 không tìm thấy
router.get('/:id', getBranch);

// POST /branches
// Body: { name: string (≤100), code: string (1 chữ cái, tự chuyển in hoa) }
// 201 tạo thành công, 400 dữ liệu sai, 409 trùng code
router.post('/', authorize('admin'), postBranch);

// PUT /branches/:id
// Body: { name?, code? } — chỉ cập nhật trường được gửi; đổi code thì tên lớp tự đổi theo
// 400 dữ liệu sai, 404 không tìm thấy, 409 trùng code
router.put('/:id', authorize('admin'), putBranch);

// DELETE /branches/:id
// 404 không tìm thấy, 409 nếu phân hiệu còn giáo viên hoặc lớp
router.delete('/:id', authorize('admin'), removeBranch);

export default router;
