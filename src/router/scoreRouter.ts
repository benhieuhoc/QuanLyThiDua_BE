import { getWeeklyScore, getSummaryScore, getClassScore, getRanking, getRankingPeriods, getScoreExport } from '../app/controller/scoreController';
import { authenticate } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Bảng điểm thi đua (chỉ đọc, tính từ score_view) — mount tại /scores
// Điểm mỗi phần = điểm gốc của tuần + tổng các lượt cộng/trừ; total = Nề nếp + Học tập
// Quyền: admin, user (chỉ đọc)
// Mọi route qua authenticate (401 chưa đăng nhập)

// GET /scores/weekly?weekid=&branchid=&gradeid=
// weekid bắt buộc. Trả { week, scores[] }, mỗi lớp có conduct_base/plus/minus/score, study_*, total, entries, rank
// rank xếp theo total trong phạm vi lọc (cùng điểm cùng hạng)
// 400 query sai, 404 không tìm thấy tuần
router.get('/weekly', getWeeklyScore);

// GET /scores/summary?schoolyearid=&fromweek=&toweek=&branchid=&gradeid=
// schoolyearid bắt buộc; fromweek mặc định 1, toweek mặc định tuần đã bắt đầu gần nhất
// Trả { schoolyear, fromweek, toweek, scores[] }, mỗi lớp có weeks, conduct_score, study_score, total, avg_total, rank
// 400 query sai / fromweek > toweek, 404 không tìm thấy năm học
router.get('/summary', getSummaryScore);

// GET /scores/ranking?schoolyearid=&week=|month=|semester=|year=1&branchid=&gradeid=
// Xếp hạng thi đua theo 1 khoảng của năm học; schoolyearid bắt buộc và đúng 1 trong:
//   week: số tuần 1-60 | month: "YYYY-MM" (tuần thuộc tháng chứa thứ Năm của tuần) | semester: 1 | 2 (theo semester2_week của năm học)
//   | year: 1 (hoặc true) = cả năm học
// Chỉ tính các tuần đã bắt đầu. Trả { schoolyear, period, scores[] }:
//   period = { type, value, label, fromweek, toweek, startdate, enddate, numweeks, countedweeks, weekids[] } (year: value = null)
//   mỗi lớp có weeks, conduct_plus/minus/score, study_plus/minus/score, total, avg_total, entries, rank (theo total, cùng điểm cùng hạng)
// 400 query sai, 404 không tìm thấy năm học / năm học không có khoảng đó, 409 khoảng chưa bắt đầu
router.get('/ranking', getRanking);

// GET /scores/export?schoolyearid=&week=|month=|semester=|year=1&branchid=&gradeid=
// Xuất file Excel (.xlsx) bảng điểm thi đua, query và số liệu giống /scores/ranking (chỉ tính tuần đã bắt đầu, sắp theo hạng)
//   Tuần: Hạng, Lớp, GVCN, Nề nếp (gốc, cộng, trừ, điểm), Học tập (gốc, cộng, trừ, điểm), Tổng, Số lượt,
//         Chi tiết cộng / trừ (mỗi lượt 1 dòng "[Nề nếp] nội dung: -2", không kèm học sinh)
//   Tháng / học kỳ / cả năm: Hạng, Lớp, GVCN, Số tuần, Nề nếp (cộng, trừ, điểm), Học tập (cộng, trừ, điểm), Tổng, TB / tuần, Số lượt
// 200 file (Content-Disposition: attachment; filename="diem-thi-dua_<năm học>_<tuan-8|thang-2026-10|hoc-ky-1|ca-nam>[_phan-hieu-A][_khoi-6].xlsx")
// Lỗi trả JSON: 400 query sai, 404 năm học / khoảng / phân hiệu / khối không tồn tại, 409 khoảng chưa bắt đầu
router.get('/export', getScoreExport);

// GET /scores/periods?schoolyearid=
// Danh sách khoảng để chọn xếp hạng: { schoolyear, weeks[], months[], semesters[] }
//   weeks[]: { id, numweek, startdate, enddate, locked, month, semester, started }
//   months[] / semesters[]: { value, label, fromweek, toweek, startdate, enddate } (value: "YYYY-MM" / 1 | 2)
// 400 schoolyearid sai, 404 không tìm thấy năm học
router.get('/periods', getRankingPeriods);

// GET /scores/class/:classid?schoolyearid=
// schoolyearid bắt buộc. Trả { class, schoolyear, weeks[] }: điểm từng tuần của lớp, kèm rank toàn trường của tuần đó
// 400 id sai, 404 không tìm thấy lớp/năm học
router.get('/class/:classid', getClassScore);

export default router;
