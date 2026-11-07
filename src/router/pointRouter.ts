import { getPoints, getPoint, postPoint, putPoint, removePoint } from '../app/controller/pointController';
import { authenticate } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Lượt chấm điểm (cộng/trừ nhập tự do) — mount tại /points
// Dữ liệu trả về kèm classname, classteacherid, accountid + accountusername (người nhập), numweek, schoolyearid, locked (tuần đã khóa), students: [{ id, code, name }] (học sinh vi phạm / được nêu)
// Quyền: đọc = admin, user; ghi = admin mọi lớp, cờ đỏ lớp được phân công (sửa/xóa chỉ lượt mình nhập); GVCN chỉ xem (ghi → 403) — kiểm tra ở pointService
// Mọi route qua authenticate (401 chưa đăng nhập)

// GET /points?weekid=&classid=&type=&studentid=
// Lấy danh sách lượt chấm, lọc theo tuần / lớp / type / học sinh được gắn (đều không bắt buộc)
router.get('/', getPoints);

// GET /points/:id
// Lấy 1 lượt chấm. 400 id sai, 404 không tìm thấy
router.get('/:id', getPoint);

// POST /points
// Body: { weekid: number, classid: number, type: 'Nề nếp' | 'Học tập', content: string (≤255),
//         value: số nguyên khác 0, -1000..1000 (âm = trừ, dương = cộng),
//         studentIds?: number[] (học sinh vi phạm / được nêu, phải thuộc lớp classid, không trùng) }
// Ghi accountid = tài khoản đang đăng nhập
// 201 tạo thành công, 400 dữ liệu sai / học sinh khác lớp, 403 không được chấm lớp này, 404 không tìm thấy tuần/lớp/học sinh, 409 tuần đã khóa
router.post('/', postPoint);

// PUT /points/:id
// Body: { type?, content?, value?, studentIds? } — không đổi được tuần/lớp
// studentIds: bỏ trường = giữ nguyên, mảng = thay toàn bộ ([] để bỏ hết); học sinh mới gắn phải thuộc lớp của lượt chấm
// 400 dữ liệu sai / học sinh khác lớp, 403 không có quyền với lượt này (cờ đỏ: không phải lượt mình nhập), 404 không tìm thấy lượt chấm/học sinh, 409 tuần đã khóa
router.put('/:id', putPoint);

// DELETE /points/:id
// 403 không có quyền với lượt này, 404 không tìm thấy, 409 tuần đã khóa
router.delete('/:id', removePoint);

export default router;
