import { getRootFolder, getFolder, postFolder, putFolder, removeFolder } from '../app/controller/folderController';
import { authenticate, authorize } from '../app/middleware/auth';

const express = require('express');
const router = express.Router();
router.use(authenticate);

// Thư mục của kho tài liệu — mount tại /folders (file trong thư mục ở /files)
// Thư mục: { id, name, parentid (null = gốc), accountid, accountusername (người tạo), numfolders, numfiles, created_at, updated_at }
// Quyền: đọc = admin, user; ghi = admin. 401 chưa đăng nhập, 403 không phải admin

// GET /folders
// Nội dung thư mục gốc: { folder: null, path: [], folders: Thư mục[], files: File[] } (sắp theo tên)
router.get('/', getRootFolder);

// GET /folders/:id
// Nội dung thư mục: { folder, path: [{ id, name }] (từ gốc tới thư mục này), folders[], files[] }
// 400 id sai, 404 không tìm thấy
router.get('/:id', getFolder);

// POST /folders
// Body: { name: string (≤255, không chứa / \), parentid?: number | null (bỏ / null = gốc) }
// 201 tạo thành công, 400 dữ liệu sai, 404 không tìm thấy thư mục cha, 409 trùng tên trong thư mục cha (không phân biệt hoa thường)
router.post('/', authorize('admin'), postFolder);

// PUT /folders/:id
// Body: { name?, parentid? (null = chuyển về gốc) } — đổi tên và / hoặc chuyển thư mục (kèm toàn bộ nội dung)
// 400 dữ liệu sai, 404 không tìm thấy thư mục / thư mục đích,
// 409 chuyển vào chính nó hoặc thư mục con của nó, 409 trùng tên ở thư mục đích
router.put('/:id', authorize('admin'), putFolder);

// DELETE /folders/:id?recursive=true
// Không có recursive: chỉ xóa được thư mục trống (409 nếu còn thư mục con / file)
// recursive=true: xóa cả cây thư mục con và file bên trong (cả file trong kho). Trả thư mục đã xóa + deletedfolders, deletedfiles
// 400 id / recursive sai, 404 không tìm thấy, 409 thư mục không trống
router.delete('/:id', authorize('admin'), removeFolder);

export default router;
