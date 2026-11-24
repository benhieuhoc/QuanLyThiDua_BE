import { getFile, downloadFile, postFile, putFile, removeFile } from '../app/controller/fileController';
import { authenticate, authorize } from '../app/middleware/auth';
import { uploadFile } from '../app/middleware/upload';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// File của kho tài liệu — mount tại /files (danh sách file theo thư mục: GET /folders, GET /folders/:id)
// Nội dung file lưu ở public/files/<storagekey> trong source, không phục vụ tĩnh: tải qua /files/:id/download
// File: { id, folderid (null = gốc), name, mimetype, size (byte), accountid, accountusername (người tải lên), created_at, updated_at }
// Quyền: đọc / tải = admin, user; ghi = admin. 401 chưa đăng nhập, 403 không phải admin
// Upload: authorize chạy trước uploadFile để người không có quyền không ghi được file lên đĩa

// GET /files/:id
// 400 id sai, 404 không tìm thấy
router.get('/:id', getFile);

// GET /files/:id/download
// Trả nội dung file (Content-Disposition: attachment, tên UTF-8). Lỗi trả JSON
// 400 id sai, 404 không tìm thấy / file không còn trong kho
router.get('/:id/download', downloadFile);

// POST /files (multipart/form-data)
// Trường: file (bắt buộc, 1 file, ≤ FILE_MAX_SIZE_MB, mặc định 20MB), folderid? (bỏ / '' / 'null' = gốc),
//         name? (≤255, không chứa / \; mặc định tên file gốc)
// 201 tải lên thành công, 400 thiếu file / dữ liệu sai, 404 không tìm thấy thư mục, 409 trùng tên trong thư mục, 413 file quá lớn
router.post('/', authorize('admin'), uploadFile, postFile);

// PUT /files/:id (JSON hoặc multipart/form-data)
// Trường: name? (đổi tên), folderid? (chuyển thư mục, null / 'null' = gốc), file? (chỉ multipart: thay nội dung, giữ tên cũ nếu không gửi name)
// 400 dữ liệu sai, 404 không tìm thấy file / thư mục đích, 409 trùng tên ở thư mục đích, 413 file quá lớn
router.put('/:id', authorize('admin'), uploadFile, putFile);

// DELETE /files/:id
// Xóa cả file trong kho. 400 id sai, 404 không tìm thấy
router.delete('/:id', authorize('admin'), removeFile);

export default router;
