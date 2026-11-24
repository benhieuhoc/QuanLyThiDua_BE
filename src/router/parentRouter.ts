import { getParents, getParent, postParent, putParent, removeParent } from '../app/controller/parentController';
import { authenticate, authorize } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();

// Phụ huynh — mount tại /parents (quản lý; phụ huynh tự đăng nhập ở /auth/parent/*)
// Mỗi bản ghi = cha hoặc mẹ của 1 học sinh. Lớp của con suy từ học sinh (classid, classname), không lưu riêng
// Quyền: chỉ admin (mọi route). 401 chưa đăng nhập, 403 không phải admin
router.use(authenticate, authorize('admin'));

// GET /parents?studentid=&classid=
// Danh sách phụ huynh (không có password), kèm hasaccount, studentcode, studentname, classid, classname
// Không lọc studentid / classid thì bỏ phụ huynh của học sinh lớp đã ra trường. 400 id lọc sai
router.get('/', getParents);

// GET /parents/:id
// 400 id sai, 404 không tìm thấy
router.get('/:id', getParent);

// POST /parents
// Body: { name: string (≤ 50), relation: 'Cha' | 'Mẹ', studentid: number,
//         username?: string (3–50, chữ/số . _ -), password?: string (6 ký tự – 72 byte) } — username và password gửi cùng nhau hoặc bỏ cả hai
// 201 tạo thành công, 400 dữ liệu sai, 404 không tìm thấy học sinh,
// 409 trùng username / học sinh đã có cha (hoặc mẹ)
router.post('/', postParent);

// PUT /parents/:id
// Body: { name?, relation?, studentid? (đổi con), username? (null = xóa tài khoản đăng nhập), password? (đặt lại mật khẩu), active? (false = khóa) }
// Phụ huynh chưa có tài khoản: tạo tài khoản bằng cách gửi cả username và password
// 400 dữ liệu sai, 404 không tìm thấy phụ huynh / học sinh, 409 trùng username / học sinh đã có cha (hoặc mẹ)
router.put('/:id', putParent);

// DELETE /parents/:id
// 404 không tìm thấy
router.delete('/:id', removeParent);

export default router;
