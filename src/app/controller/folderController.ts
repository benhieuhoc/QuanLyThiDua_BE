import { sendSuccess, sendError, handleError, parseId, parseNullableId } from "../utils/http";
import { parseItemName, NAME_RULE_MESSAGE } from "../utils/storage";
import { fetchAllFolder, checkFolderExist, fetchFolderPath, createFolder, updateFolder, deleteFolder } from "../service/folderService";
import { fetchAllFile } from "../service/fileService";

// Nội dung 1 thư mục (null = gốc): { folder, path[], folders[], files[] }
const loadContents = async (id: number | null) => {
    const [folders, files] = await Promise.all([fetchAllFolder(id), fetchAllFile(id)]);
    if (id === null) return { folder: null, path: [], folders, files };
    return { folder: await checkFolderExist(id), path: await fetchFolderPath(id), folders, files };
}

// GET /folders: nội dung thư mục gốc
export const getRootFolder = async (req: any, res: any) => {
    try {
        return sendSuccess(res, await loadContents(null));
    } catch (err) {
        return handleError(res, err);
    }
}

// GET /folders/:id: nội dung 1 thư mục kèm đường dẫn từ gốc
export const getFolder = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        if (!(await checkFolderExist(id))) return sendError(res, 404, 'Không tìm thấy thư mục');
        return sendSuccess(res, await loadContents(id));
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { name, parentid? (bỏ / null = gốc) }
export const postFolder = async (req: any, res: any) => {
    try {
        const errors: any[] = [];
        const name = parseItemName(req.body?.name);
        if (!name) errors.push({ field: 'name', message: NAME_RULE_MESSAGE });
        const parentid = req.body?.parentid === undefined ? null : parseNullableId(req.body.parentid);
        if (parentid === undefined) errors.push({ field: 'parentid', message: 'parentid là id thư mục hoặc null (gốc)' });
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        return sendSuccess(res, await createFolder(req.user.id, name!, parentid!), 'Tạo thư mục thành công', 201);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { name?, parentid? (null = chuyển về gốc) }
export const putFolder = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');

        const errors: any[] = [];
        let name: string | undefined;
        let parentid: number | null | undefined;
        if (req.body?.name !== undefined) {
            name = parseItemName(req.body.name) ?? undefined;
            if (!name) errors.push({ field: 'name', message: NAME_RULE_MESSAGE });
        }
        if (req.body?.parentid !== undefined) {
            parentid = parseNullableId(req.body.parentid);
            if (parentid === undefined) errors.push({ field: 'parentid', message: 'parentid là id thư mục hoặc null (gốc)' });
            else if (parentid === id) errors.push({ field: 'parentid', message: 'Không thể chuyển thư mục vào chính nó' });
        }
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        return sendSuccess(res, await updateFolder(id, { name, parentid }), 'Cập nhật thư mục thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

// Query: ?recursive=true để xóa cả thư mục con và file bên trong
export const removeFolder = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const recursive = req.query.recursive;
        if (recursive !== undefined && recursive !== 'true' && recursive !== 'false') {
            return sendError(res, 400, 'recursive là true hoặc false');
        }
        return sendSuccess(res, await deleteFolder(id, recursive === 'true'), 'Xóa thư mục thành công');
    } catch (err) {
        return handleError(res, err);
    }
}
