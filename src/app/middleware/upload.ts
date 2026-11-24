import { sendError, handleError } from "../utils/http";
import { STORAGE_DIR, newStorageKey } from "../utils/storage";

const multer = require('multer');

// Giới hạn dung lượng 1 file (MB), đặt bằng FILE_MAX_SIZE_MB trong .env, mặc định 20, tối đa 2000 (cột file.size là integer)
export const MAX_FILE_SIZE_MB = Math.min(Number(process.env.FILE_MAX_SIZE_MB) || 20, 2000);

const upload = multer({
    // Ghi thẳng vào kho với tên = storagekey mới (req.file.filename), không giữ file trong RAM
    storage: multer.diskStorage({
        destination: STORAGE_DIR,
        filename: (req: any, file: any, cb: any) => cb(null, newStorageKey()),
    }),
    limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: 1, fields: 10 },
}).single('file');

// Nhận multipart/form-data, 1 file ở trường "file" (không bắt buộc, controller tự kiểm tra), các trường text vào req.body
// Request JSON (không phải multipart) đi qua bình thường. Đặt SAU authorize để người không có quyền không ghi được file lên đĩa
// 413 file quá lớn, 400 sai trường / quá nhiều file / form lỗi
export const uploadFile = (req: any, res: any, next: any) => {
    upload(req, res, (err: any) => {
        if (!err) return next();
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') return sendError(res, 413, `File vượt quá ${MAX_FILE_SIZE_MB}MB`);
            if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
                return sendError(res, 400, 'Chỉ gửi 1 file ở trường "file"');
            }
            return sendError(res, 400, 'Dữ liệu tải lên không hợp lệ');
        }
        // busboy báo form hỏng (vd thiếu boundary) bằng Error thường
        if (err?.message && /multipart|boundary/i.test(err.message)) return sendError(res, 400, 'Dữ liệu tải lên không hợp lệ');
        return handleError(res, err);
    });
}
