import pool from "../../config/db";
import { HttpError } from "../utils/http";
import { removeStoredFiles } from "../utils/storage";
import { checkFolderExist } from "./folderService";

// Metadata file trả cho client: không có storagekey (tên file trong kho là chi tiết nội bộ)
const selectFile = `
    SELECT x.id, x.folderid, x.name, x.mimetype, x.size, x.accountid, a.username AS accountusername,
           x.created_at, x.updated_at
    FROM file x
    LEFT JOIN account a ON a.id = x.accountid
`;

// File mới tải lên đã nằm trong kho (multer ghi sẵn), service chỉ ghi DB
export type StoredUpload = { storagekey: string, mimetype: string, size: number };

const rethrowUnique = (err: any) => {
    if (err?.code === '23505' && err.constraint === 'file_name_unique') {
        throw new HttpError(409, 'Đã có file cùng tên trong thư mục này');
    }
    throw err;
}

const assertFolder = async (folderid: number | null) => {
    if (folderid !== null && !(await checkFolderExist(folderid))) {
        throw new HttpError(404, 'Không tìm thấy thư mục');
    }
}

// File nằm trực tiếp trong folderid (null = gốc), sắp theo tên
export const fetchAllFile = async (folderid: number | null) => {
    const result = await pool.query(`
        ${selectFile}
        WHERE x.folderid IS NOT DISTINCT FROM $1::int
        ORDER BY lower(x.name), x.id
    `, [folderid]);
    return result.rows;
}

export const checkFileExist = async (id: number) => {
    const result = await pool.query(`
        ${selectFile}
        WHERE x.id = $1
    `, [id]);
    return result.rows[0];
}

// Chỉ dùng nội bộ để tải file: có storagekey
export const fetchFileForDownload = async (id: number) => {
    const result = await pool.query(`SELECT id, name, mimetype, storagekey FROM file WHERE id = $1`, [id]);
    return result.rows[0];
}

// Lỗi thì controller xóa file vừa tải lên (service chưa nhận file vào DB)
// 404 thư mục, 409 trùng tên trong thư mục
export const createFile = async (accountid: number, folderid: number | null, name: string, upload: StoredUpload) => {
    await assertFolder(folderid);
    try {
        const result = await pool.query(`
            INSERT INTO file (folderid, name, storagekey, mimetype, size, accountid)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [folderid, name, upload.storagekey, upload.mimetype, upload.size, accountid]);
        return checkFileExist(result.rows[0].id);
    } catch (err) {
        return rethrowUnique(err);
    }
}

// Đổi tên / chuyển thư mục (folderid: undefined = giữ, null = về gốc) / thay nội dung (upload)
// Thay nội dung: DB trỏ sang storagekey mới rồi mới xóa file cũ trong kho
// 404 file / thư mục đích, 409 trùng tên ở thư mục đích
export const updateFile = async (id: number, data: { name?: string, folderid?: number | null, upload?: StoredUpload }) => {
    const current = (await pool.query(`SELECT id, folderid, name, storagekey, mimetype, size FROM file WHERE id = $1`, [id])).rows[0];
    if (!current) throw new HttpError(404, 'Không tìm thấy file');

    const folderid = data.folderid !== undefined ? data.folderid : current.folderid;
    if (folderid !== current.folderid) await assertFolder(folderid);

    try {
        await pool.query(`
            UPDATE file
            SET name = $2, folderid = $3, storagekey = $4, mimetype = $5, size = $6, updated_at = NOW()
            WHERE id = $1
        `, [
            id, data.name ?? current.name, folderid,
            data.upload?.storagekey ?? current.storagekey,
            data.upload?.mimetype ?? current.mimetype,
            data.upload?.size ?? current.size,
        ]);
    } catch (err) {
        rethrowUnique(err);
    }

    if (data.upload) await removeStoredFiles([current.storagekey]);
    return checkFileExist(id);
}

// Xóa dòng trong DB rồi xóa file trong kho
export const deleteFile = async (id: number) => {
    const file = await checkFileExist(id);
    if (!file) throw new HttpError(404, 'Không tìm thấy file');

    const result = await pool.query(`DELETE FROM file WHERE id = $1 RETURNING storagekey`, [id]);
    if (result.rowCount === 0) throw new HttpError(404, 'Không tìm thấy file');
    await removeStoredFiles([result.rows[0].storagekey]);
    return file;
}
