import { getPublicClassScore, getPublicMeta, getPublicRankingPeriods, getPublicRanking } from '../app/controller/scoreController';

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
//     points[]: { type, content, value, pointdate ('YYYY-MM-DD', ngày diễn ra), students: { name }[] (họ tên học sinh được gắn, [] nếu không có) } }
//   Lớp chưa có năm học nào: schoolyear = null, weeks = []
// 400 schoolyearid sai, 404 mã sai / không tìm thấy lớp / lớp không có ở năm học đó
router.get('/classes/:qrcode', getPublicClassScore);

// ---------- Trang tổng quan công khai (chưa đăng nhập) ----------
// Chỉ số liệu tổng hợp theo lớp (điểm, hạng, tên lớp, tên GVCN); không có học sinh, nội dung lượt chấm, tài khoản, id giáo viên.
// Số liệu dùng chung hàm với /scores/periods, /scores/ranking nên khớp màn hình đã đăng nhập

// GET /public/meta
// Dữ liệu khởi tạo trang: { schoolyears[], currentweek, branches[], grades[] }
//   schoolyears[] = { id, name, startdate, enddate, numweeks, semester2_week } (mới nhất trước)
//   currentweek = { id, schoolyearid, schoolyearname, numweek, startdate, enddate, locked } | null (hôm nay ngoài mọi tuần)
//   branches[] = { id, name, code }, grades[] = { id, numgrade }
router.get('/meta', getPublicMeta);

// GET /public/scores/periods?schoolyearid=
// Như GET /scores/periods: { schoolyear, weeks[], months[], semesters[] } (schoolyear chỉ có các cột như schoolyears[] ở /meta)
// 400 schoolyearid sai, 404 không tìm thấy năm học
router.get('/scores/periods', getPublicRankingPeriods);

// GET /public/scores/ranking?schoolyearid=&week=|month=|semester=|year=1&branchid=&gradeid=
// Như GET /scores/ranking (query, số liệu, mã lỗi giống hệt), mỗi dòng scores[] không có teacherid:
//   { classid, classname, gradeid, numgrade, branchid, branchcode, seq, teachername, weeks, conduct_plus/minus/score,
//     study_plus/minus/score, total, avg_total, entries, rank }
// 400 query sai, 404 không tìm thấy năm học / khoảng, 409 khoảng chưa bắt đầu
router.get('/scores/ranking', getPublicRanking);

export default router;
