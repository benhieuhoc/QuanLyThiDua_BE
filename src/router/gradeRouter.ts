import { getGrades } from '../app/controller/gradeController';
import { authenticate } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Khối — mount tại /grades
// Dữ liệu cố định khởi tạo trong migration (6–9), chỉ có API đọc
// Quyền: admin, user (chỉ đọc)
// Mọi route qua authenticate (401 chưa đăng nhập)

// GET /grades
// Lấy tất cả khối, sắp xếp theo numgrade
router.get('/', getGrades);

export default router;
