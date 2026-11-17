import { getRules, getRule, postRule, putRule, removeRule } from '../app/controller/ruleController';
import { authenticate, authorize } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Quy chế thi đua (danh mục mục cộng/trừ mẫu để chọn khi chấm) — mount tại /rules
// Dữ liệu trả về: { id, type, content, value (điểm cho 1 lần / 1 học sinh), active, created_at, updated_at, uses (số lượt chấm đang gắn mục) }
// Quyền: đọc = admin, user; ghi = admin
// Mọi route qua authenticate (401 chưa đăng nhập); route ghi qua authorize('admin') (403)

// GET /rules?type=&active=
// type: 'Nề nếp' | 'Học tập'; active: 'true' | 'false' (đều không bắt buộc)
// Sắp theo type DESC (Nề nếp trước), value, content. 400 type/active sai
router.get('/', getRules);

// GET /rules/:id
// 400 id sai, 404 không tìm thấy
router.get('/:id', getRule);

// POST /rules
// Body: { type: 'Nề nếp' | 'Học tập', content: string (≤255), value: số nguyên khác 0, -1000..1000, active?: boolean (mặc định true) }
// 201 tạo thành công, 400 dữ liệu sai, 409 trùng (type, content)
router.post('/', authorize('admin'), postRule);

// PUT /rules/:id
// Body: { type?, content?, value?, active? } — chỉ cập nhật trường được gửi; lượt chấm đã gắn mục không đổi điểm
// 400 dữ liệu sai, 404 không tìm thấy, 409 trùng (type, content)
router.put('/:id', authorize('admin'), putRule);

// DELETE /rules/:id
// 404 không tìm thấy, 409 mục đã dùng trong lượt chấm (chuyển active = false thay vì xóa)
router.delete('/:id', authorize('admin'), removeRule);

export default router;
