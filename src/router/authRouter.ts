import { postLogin, getMe, putMyPassword } from '../app/controller/accountController';
import { authenticate } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();

// Đăng nhập / tài khoản đang đăng nhập — mount tại /auth
// Quyền: /login public; còn lại mọi tài khoản đã đăng nhập (admin, user)

// POST /auth/login  (public)
// Body: { username: string (không phân biệt hoa thường), password: string }
// 200 { token, account } — gửi token qua header Authorization: Bearer <token>
// 400 thiếu dữ liệu, 401 sai tài khoản hoặc mật khẩu, 403 tài khoản bị khóa
router.post('/login', postLogin);

// GET /auth/me
// Thông tin tài khoản đang đăng nhập (không có password): kind = admin | gvcn | codo,
// homeroomclass* (GVCN), studentclass* và classes[] được phân công (cờ đỏ). 401 chưa đăng nhập
router.get('/me', authenticate, getMe);

// PUT /auth/password
// Body: { oldPassword: string, newPassword: string (6 ký tự – 72 byte, khác mật khẩu cũ) }
// 400 dữ liệu sai hoặc mật khẩu cũ không đúng, 401 chưa đăng nhập
router.put('/password', authenticate, putMyPassword);

export default router;
