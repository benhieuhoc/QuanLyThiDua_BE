import { getPoints, getPoint, postPoint, putPoint, removePoint } from '../app/controller/pointController';
import { authenticate } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Lượt chấm điểm (cộng/trừ nhập tự do) — mount tại /points
// Dữ liệu trả về kèm classname, classteacherid, accountid + accountusername (người nhập), numweek, schoolyearid, locked (tuần đã khóa), students: [{ id, code, name }] (học sinh vi phạm / được nêu),
// ruleid + rulecontent (mục quy chế đã chọn, null = nhập tự do), pointdate (ngày diễn ra 'YYYY-MM-DD', trong tuần),
// entereddate 'YYYY-MM-DD' + enteredtime 'HH:mm' (thời điểm nhập theo giờ Việt Nam), created_at/updated_at (timestamptz, ISO)
// Quyền: đọc = admin, user; ghi = admin mọi lớp, cờ đỏ lớp được phân công (sửa/xóa chỉ lượt mình nhập); GVCN chỉ xem (ghi → 403) — kiểm tra ở pointService
// Mọi route qua authenticate (401 chưa đăng nhập)

// GET /points?weekid=&classid=&type=&studentid=&ruleid=
// Lấy danh sách lượt chấm, lọc theo tuần / lớp / type / học sinh được gắn / mục quy chế (đều không bắt buộc)
// Sắp theo tuần → lớp → pointdate → thời điểm nhập. 400 tham số sai
router.get('/', getPoints);

// GET /points/:id
// Lấy 1 lượt chấm. 400 id sai, 404 không tìm thấy
router.get('/:id', getPoint);

// POST /points
// Body: { weekid: number, classid: number,
//         ruleid?: number (mục quy chế đang áp dụng; có thì type/content/value không gửi sẽ lấy theo mục, không gửi null),
//         type: 'Nề nếp' | 'Học tập' (trùng phần của mục nếu có ruleid), content: string (≤255),
//         value: số nguyên khác 0, -1000..1000 (âm = trừ, dương = cộng; BE không nhân theo số học sinh),
//         pointdate?: 'YYYY-MM-DD' (ngày diễn ra, trong tuần; mặc định hôm nay kẹp vào tuần),
//         studentIds?: number[] (học sinh vi phạm / được nêu, phải thuộc lớp classid, không trùng) }
// Ghi accountid = tài khoản đang đăng nhập
// 201 tạo thành công, 400 dữ liệu sai / type khác phần của mục / pointdate ngoài tuần / học sinh khác lớp, 403 không được chấm lớp này,
// 404 không tìm thấy tuần/lớp/học sinh/mục quy chế, 409 tuần đã khóa / mục quy chế đã ngừng áp dụng
router.post('/', postPoint);

// PUT /points/:id
// Body: { ruleid?, type?, content?, value?, pointdate?, studentIds? } — không đổi được tuần/lớp
// ruleid: bỏ trường = giữ nguyên, null = bỏ liên kết mục (giữ nội dung, điểm), số = đổi mục (mục khác mục cũ thì trường không gửi lấy theo mục mới;
//         mục đang gắn sẵn dùng được dù đã ngừng áp dụng)
// pointdate: bỏ trường = giữ nguyên, phải nằm trong tuần của lượt chấm
// studentIds: bỏ trường = giữ nguyên, mảng = thay toàn bộ ([] để bỏ hết); học sinh mới gắn phải thuộc lớp của lượt chấm
// 400 dữ liệu sai / type khác phần của mục / pointdate ngoài tuần / học sinh khác lớp, 403 không có quyền với lượt này (cờ đỏ: không phải lượt mình nhập),
// 404 không tìm thấy lượt chấm/học sinh/mục quy chế, 409 tuần đã khóa / mục quy chế đã ngừng áp dụng
router.put('/:id', putPoint);

// DELETE /points/:id
// 403 không có quyền với lượt này, 404 không tìm thấy, 409 tuần đã khóa
router.delete('/:id', removePoint);

export default router;
