import { getAccounts, getAccount, postAccount, putAccount, removeAccount, putAccountClasses } from '../app/controller/accountController';
import { authenticate, authorize } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();

// Tài khoản — mount tại /accounts
// Quyền: chỉ admin (mọi route). 401 chưa đăng nhập, 403 không phải admin
router.use(authenticate, authorize('admin'));

// GET /accounts?role=admin|user&active=true|false
// Danh sách tài khoản (không có password), kèm kind, tên GV / HS, lớp chủ nhiệm, lớp cờ đỏ được chấm
router.get('/', getAccounts);

// GET /accounts/:id
// 400 id sai, 404 không tìm thấy
router.get('/:id', getAccount);

// POST /accounts
// Body: { username (3–50, chữ/số . _ -), password (6 ký tự – 72 byte), role: 'admin'|'user', teacherid?, studentid? }
//   admin: teacherid tùy chọn, không gắn studentid
//   user : đúng 1 trong teacherid (GVCN) hoặc studentid (cờ đỏ)
// 201 tạo thành công, 400 dữ liệu sai, 404 không tìm thấy GV/HS,
// 409 trùng username / giáo viên hoặc học sinh đã có tài khoản
router.post('/', postAccount);

// PUT /accounts/:id
// Body: { username?, password? (đặt lại mật khẩu), active? (false = khóa) }
// Không đổi được role, teacherid, studentid (400). 404 không tìm thấy,
// 409 trùng username / tự khóa mình / khóa admin hoạt động cuối cùng
router.put('/:id', putAccount);

// DELETE /accounts/:id
// Lượt chấm đã nhập được giữ (point.accountid = null). 404 không tìm thấy, 409 tự xóa mình / xóa admin hoạt động cuối cùng
router.delete('/:id', removeAccount);

// PUT /accounts/:id/classes
// Body: { classIds: number[] } — thay toàn bộ lớp cờ đỏ được phân công chấm ([] = bỏ hết)
// 400 không phải tài khoản cờ đỏ / phân công lớp của chính cờ đỏ / dữ liệu sai, 404 không tìm thấy tài khoản hoặc lớp
router.put('/:id/classes', putAccountClasses);

export default router;
