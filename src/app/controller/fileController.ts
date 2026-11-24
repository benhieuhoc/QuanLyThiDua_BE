import { sendSuccess, sendError, handleError, parseId, parseNullableId } from "../utils/http";
import { parseItemName, NAME_RULE_MESSAGE, decodeOriginalName, removeStoredFiles, storagePath } from "../utils/storage";
import { checkFileExist, fetchFileForDownload, createFile, updateFile, deleteFile, StoredUpload } from "../service/fileService";

// File multer vừa ghi vào kho (req.file) → dữ liệu cho service
const toStoredUpload = (file: any): StoredUpload => ({
    storagekey: file.filename,
    mimetype: (typeof file.mimetype === 'string' && file.mimetype ? file.mimetype : 'application/octet-stream').slice(0, 255),
    size: file.size,
});

// Request lỗi (validate / service throw) thì file vừa tải lên chưa được DB nhận: xóa khỏi kho
const discardUpload = async (req: any) => {
    if (req.file?.filename) await removeStoredFiles([req.file.filename]);
}

// GET /files/:id: metadata
export const getFile = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const file = await checkFileExist(id);
        if (!file) return sendError(res, 404, 'Không tìm thấy file');
        return sendSuccess(res, file);
    } catch (err) {
        return handleError(res, err);
    }
}

// GET /files/:id/download: luôn tải về (attachment) và nosniff, để file HTML / SVG tải lên không chạy được trên domain API
export const downloadFile = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const file = await fetchFileForDownload(id);
        if (!file) return sendError(res, 404, 'Không tìm thấy file');

        res.attachment(file.name);
        res.setHeader('Content-Type', file.mimetype);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.sendFile(storagePath(file.storagekey), (err: any) => {
            if (!err) return;
            if (res.headersSent) return console.error('Lỗi khi gửi file:', file.id, err);
            res.removeHeader('Content-Disposition');
            if (err.code === 'ENOENT') return sendError(res, 404, 'File không còn trong kho lưu trữ');
            return handleError(res, err);
        });
    } catch (err) {
        return handleError(res, err);
    }
}

// multipart/form-data: file (bắt buộc), folderid? (bỏ / '' / 'null' = gốc), name? (mặc định tên file gốc)
export const postFile = async (req: any, res: any) => {
    try {
        if (!req.file) return sendError(res, 400, 'Chưa chọn file (gửi multipart/form-data, trường "file")');

        const errors: any[] = [];
        const name = parseItemName(req.body?.name ?? decodeOriginalName(req.file.originalname));
        if (!name) errors.push({ field: 'name', message: NAME_RULE_MESSAGE });
        const folderid = req.body?.folderid === undefined ? null : parseNullableId(req.body.folderid);
        if (folderid === undefined) errors.push({ field: 'folderid', message: 'folderid là id thư mục hoặc null (gốc)' });
        if (errors.length > 0) {
            await discardUpload(req);
            return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);
        }

        const file = await createFile(req.user.id, folderid!, name!, toStoredUpload(req.file));
        return sendSuccess(res, file, 'Tải file lên thành công', 201);
    } catch (err) {
        await discardUpload(req);
        return handleError(res, err);
    }
}

// JSON { name?, folderid? } hoặc multipart (thêm file? để thay nội dung, giữ tên cũ nếu không gửi name)
export const putFile = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            await discardUpload(req);
            return sendError(res, 400, 'id không hợp lệ');
        }

        const errors: any[] = [];
        let name: string | undefined;
        let folderid: number | null | undefined;
        if (req.body?.name !== undefined) {
            name = parseItemName(req.body.name) ?? undefined;
            if (!name) errors.push({ field: 'name', message: NAME_RULE_MESSAGE });
        }
        if (req.body?.folderid !== undefined) {
            folderid = parseNullableId(req.body.folderid);
            if (folderid === undefined) errors.push({ field: 'folderid', message: 'folderid là id thư mục hoặc null (gốc)' });
        }
        if (errors.length > 0) {
            await discardUpload(req);
            return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);
        }

        const upload = req.file ? toStoredUpload(req.file) : undefined;
        return sendSuccess(res, await updateFile(id, { name, folderid, upload }), 'Cập nhật file thành công');
    } catch (err) {
        await discardUpload(req);
        return handleError(res, err);
    }
}

export const removeFile = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        return sendSuccess(res, await deleteFile(id), 'Xóa file thành công');
    } catch (err) {
        return handleError(res, err);
    }
}
