import { getPublicClassScore } from '../app/controller/scoreController';

const express = require('express');
const router = express.Router();

// Trang công khai — mount tại /public
// Quyền: public (KHÔNG qua authenticate). Chỉ trả dữ liệu thi đua và họ tên học sinh gắn vào lượt chấm;
// không trả danh sách / mã / ngày sinh học sinh, tài khoản hay id người nhập.
// Phụ huynh quét mã QR của lớp: FE render BaseQRCode ("/LopHoc/<qrcode>", có trong GET /classes, /classes/:id)
// thành URL trang FE, trang đó gọi API dưới đây. qrcode là mã ngẫu nhiên 16 ký tự hex (không dùng id để không dò được lớp khác)

// GET /public/classes/:qrcode?schoolyearid=
// schoolyearid không bắt buộc; mặc định năm học đã bắt đầu gần nhất mà lớp có tham gia
// Trả { class, schoolyears[], schoolyear, weeks[] }:
//   class = { id, name, numgrade, branchcode, branchname, teachername, numstudents, archivedyearid, archivedyearname, BaseQRCode }
//   schoolyears[] = { id, name, startdate, enddate, classname (tên lớp năm đó), started } (mới nhất trước)
//   weeks[] (chỉ tuần đã bắt đầu, mới nhất trước) = { weekid, numweek, startdate, enddate, locked, classname, teachername,
//     conduct_base/plus/minus/score, study_base/plus/minus/score, total, entries, rank (toàn trường), numclasses,
//     points[]: { type, content, value, students: { name }[] (họ tên học sinh được gắn, [] nếu không có) } }
//   Lớp chưa có năm học nào: schoolyear = null, weeks = []
// 400 schoolyearid sai, 404 mã sai / không tìm thấy lớp / lớp không có ở năm học đó
router.get('/classes/:qrcode', getPublicClassScore);

export default router;
