import { getPublicClassScore } from '../app/controller/scoreController';

const express = require('express');
const router = express.Router();

// Trang công khai — mount tại /public
// Quyền: public (KHÔNG qua authenticate). Chỉ trả dữ liệu thi đua, không trả học sinh, tài khoản hay id người nhập.
// Phụ huynh quét mã QR của lớp: FE render BaseQRCode ("/LopHoc/<id lớp>", có trong GET /classes, /classes/:id)
// thành URL trang FE, trang đó gọi API dưới đây.

// GET /public/classes/:id?schoolyearid=
// schoolyearid không bắt buộc; mặc định năm học đã bắt đầu gần nhất mà lớp có tham gia
// Trả { class, schoolyears[], schoolyear, weeks[] }:
//   class = { id, name, numgrade, branchcode, branchname, teachername, numstudents, archivedyearid, archivedyearname, BaseQRCode }
//   schoolyears[] = { id, name, startdate, enddate, classname (tên lớp năm đó), started } (mới nhất trước)
//   weeks[] (chỉ tuần đã bắt đầu, mới nhất trước) = { weekid, numweek, startdate, enddate, locked, classname, teachername,
//     conduct_base/plus/minus/score, study_base/plus/minus/score, total, entries, rank (toàn trường), numclasses,
//     points[]: { type, content, value } }
//   Lớp chưa có năm học nào: schoolyear = null, weeks = []
// 400 id / schoolyearid sai, 404 không tìm thấy lớp / lớp không có ở năm học đó
router.get('/classes/:id', getPublicClassScore);

export default router;
