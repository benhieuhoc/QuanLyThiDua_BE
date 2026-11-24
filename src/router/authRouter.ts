import { postLogin, getMe, putMyPassword } from '../app/controller/accountController';
import { postParentLogin, getParentMe, putParentPassword, getParentPoints } from '../app/controller/parentController';
import { authenticate, authenticateParent } from '../app/middleware/auth';

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

// ---------- Phụ huynh (bảng parent, đăng nhập tách khỏi tài khoản giáo viên / cờ đỏ) ----------
// Token phụ huynh có role 'parent', chỉ dùng được với các route /auth/parent/* dưới đây;
// gửi token phụ huynh tới route khác → 401. Ngược lại token giáo viên / cờ đỏ gửi tới /auth/parent/me, /password → 401

// POST /auth/parent/login  (public)
// Body: { username: string (không phân biệt hoa thường), password: string }
// 200 { token, parent } (parent như GET /auth/parent/me)
// 400 thiếu dữ liệu, 401 sai tài khoản hoặc mật khẩu, 403 tài khoản bị khóa
router.post('/parent/login', postParentLogin);

// GET /auth/parent/me
// { id, name, relation, username, studentid, studentcode, studentname, studentgender, studentbirthdate,
//   classid, classname, numgrade, branchcode, branchname, teachername, archivedyearid, BaseQRCode }
// BaseQRCode = "/LopHoc/<qrcode>": FE mở trang lớp công khai của con (GET /public/classes/:qrcode). 401 chưa đăng nhập
router.get('/parent/me', authenticateParent, getParentMe);

// PUT /auth/parent/password
// Body: { oldPassword: string, newPassword: string (6 ký tự – 72 byte, khác mật khẩu cũ) }
// 400 dữ liệu sai hoặc mật khẩu cũ không đúng, 401 chưa đăng nhập
router.put('/parent/password', authenticateParent, putParentPassword);

// GET /auth/parent/points?schoolyearid=
// Lượt chấm có gắn con của phụ huynh đang đăng nhập. schoolyearid không bắt buộc: mặc định năm học đã bắt đầu gần nhất
// Trả { schoolyear: { id, name, startdate, enddate } | null, points[], summary: { count, plus, minus, total } }
//   points[] (mới nhất trước: pointdate → giờ nhập) = { id, weekid, numweek, locked, type, content, value, pointdate,
//     classid, classname (tên lớp lúc chấm) }; value là điểm của cả lượt (có thể gắn nhiều học sinh)
//   summary: plus = tổng điểm cộng, minus = tổng điểm trừ (số dương), total = plus - minus
//   Không trả học sinh khác hay người nhập
// 400 schoolyearid sai, 401 chưa đăng nhập (token phụ huynh), 404 không tìm thấy năm học
router.get('/parent/points', authenticateParent, getParentPoints);

export default router;
