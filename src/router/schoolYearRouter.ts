import { getSchoolYears, getSchoolYear, postSchoolYear, putSchoolYear, removeSchoolYear } from '../app/controller/schoolYearController';
import { authenticate, authorize } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Năm học — mount tại /school-years
// Mỗi năm học có numweeks (số tuần) và enddate (ngày cuối tuần cuối) tính từ bảng week
// Quyền: đọc = admin, user; ghi = admin
// Mọi route qua authenticate (401 chưa đăng nhập); route ghi qua authorize('admin') (403)

// GET /school-years
// Lấy tất cả năm học, mới nhất trước
router.get('/', getSchoolYears);

// GET /school-years/:id
// Lấy 1 năm học kèm weeks[]. 400 id sai, 404 không tìm thấy
router.get('/:id', getSchoolYear);

// POST /school-years
// Body: { name: "YYYY-YYYY" (năm sau = năm trước + 1), startdate: "YYYY-MM-DD", numweeks: 1-60,
//         conduct_base?: 0-1000 (mặc định 100), study_base?: 0-1000 (mặc định 100),
//         semester2_week?: 2..numweeks (tuần bắt đầu học kỳ 2, mặc định CEIL(numweeks / 2) + 1),
//         grade6?: [{ branchid, count: 0-30 }] (số lớp khối 6 mới mỗi phân hiệu khi lên lớp, mặc định = số lớp khối 6 năm cũ) }
// Tự sinh tuần 1..numweeks, mỗi tuần 7 ngày liên tiếp từ startdate, cùng điểm gốc
// Chỉ tạo được khi năm học mới nhất đã kết thúc (ngày cuối < hôm nay) và startdate sau ngày kết thúc đó
// Năm cũ chưa lên lớp thì lên lớp cùng transaction: lưu trữ lớp khối 9 (ra trường, bỏ GVCN, khóa cờ đỏ),
// tăng khối 6-8 lên 7-9 (giữ học sinh, GVCN), tạo lớp khối 6 mới chưa có GVCN / học sinh
// data.promotion: { fromschoolyear, archived: [{ id, name }], promoted, created: [{ id, name }], deactivatedAccounts } hoặc null (năm đầu tiên / năm cũ đã lên lớp)
// 201 trả về năm học, 400 dữ liệu sai, 404 phân hiệu trong grade6 không tồn tại,
// 409 năm học cũ chưa kết thúc / bắt đầu trước khi năm cũ kết thúc / trùng tên / chồng thời gian
router.post('/', authorize('admin'), postSchoolYear);

// PUT /school-years/:id
// Body: { name?, numweeks?, semester2_week? } — tăng numweeks thì sinh thêm tuần (điểm gốc theo tuần cuối), giảm thì xóa các tuần cuối
// semester2_week: 2..numweeks, null = về mặc định; giảm numweeks nhỏ hơn tuần HK2 đã đặt thì báo 400
// 400 dữ liệu sai / tuần HK2 ngoài số tuần, 404 không tìm thấy, 409 trùng tên / chồng thời gian / tuần bị xóa đã có điểm
router.put('/:id', authorize('admin'), putSchoolYear);

// DELETE /school-years/:id
// Không hoàn tác lên lớp: xóa năm mới vừa tạo thì lớp vẫn ở khối mới, tạo lại năm học không lên lớp lần nữa
// 404 không tìm thấy, 409 nếu năm học đã có điểm thi đua hoặc có lớp ra trường được lưu trữ
router.delete('/:id', authorize('admin'), removeSchoolYear);

export default router;
