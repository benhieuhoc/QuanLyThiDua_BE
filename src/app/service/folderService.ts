import pool from "../../config/db";
import { HttpError } from "../utils/http";
import { removeStoredFiles } from "../utils/storage";

// Thư mục của kho tài liệu, kèm người tạo và số thư mục con / file trực tiếp bên trong
const selectFolder = `
    SELECT f.id, f.name, f.parentid, f.accountid, a.username AS accountusername,
           (SELECT COUNT(*) FROM folder c WHERE c.parentid = f.id)::int AS numfolders,
           (SELECT COUNT(*) FROM file x WHERE x.folderid = f.id)::int AS numfiles,
           f.created_at, f.updated_at
    FROM folder f
    LEFT JOIN account a ON a.id = f.accountid
`;

// id thư mục và toàn bộ thư mục con cháu (CTE đệ quy)
const selectSubtreeIds = `
    WITH RECURSIVE tree AS (
        SELECT id FROM folder WHERE id = $1
        UNION ALL
        SELECT f.id FROM folder f JOIN tree t ON f.parentid = t.id
    )
    SELECT id FROM tree
`;

const rethrowUnique = (err: any) => {
    if (err?.code === '23505' && err.constraint === 'folder_name_unique') {
        throw new HttpError(409, 'Đã có thư mục cùng tên trong thư mục này');
    }
    throw err;
}

// Thư mục con trực tiếp của parentid (null = gốc), sắp theo tên
export const fetchAllFolder = async (parentid: number | null) => {
    const result = await pool.query(`
        ${selectFolder}
        WHERE f.parentid IS NOT DISTINCT FROM $1::int
        ORDER BY lower(f.name), f.id
    `, [parentid]);
    return result.rows;
}

export const checkFolderExist = async (id: number) => {
    const result = await pool.query(`
        ${selectFolder}
        WHERE f.id = $1
    `, [id]);
    return result.rows[0];
}

// Đường dẫn từ gốc tới thư mục (gồm cả thư mục đó): [{ id, name }], dùng cho breadcrumb
export const fetchFolderPath = async (id: number) => {
    const result = await pool.query(`
        WITH RECURSIVE ancestors AS (
            SELECT id, name, parentid, 0 AS depth FROM folder WHERE id = $1
            UNION ALL
            SELECT f.id, f.name, f.parentid, a.depth + 1
            FROM folder f JOIN ancestors a ON f.id = a.parentid
        )
        SELECT id, name FROM ancestors ORDER BY depth DESC
    `, [id]);
    return result.rows;
}

// parentid null = tạo ở gốc. 404 thư mục cha, 409 trùng tên trong cùng thư mục cha
export const createFolder = async (accountid: number, name: string, parentid: number | null) => {
    if (parentid !== null && !(await checkFolderExist(parentid))) {
        throw new HttpError(404, 'Không tìm thấy thư mục cha');
    }
    try {
        const result = await pool.query(`
            INSERT INTO folder (name, parentid, accountid)
            VALUES ($1, $2, $3)
            RETURNING id
        `, [name, parentid, accountid]);
        return checkFolderExist(result.rows[0].id);
    } catch (err) {
        return rethrowUnique(err);
    }
}

// Đổi tên và / hoặc chuyển thư mục (parentid: undefined = giữ, null = về gốc)
// Chuyển thư mục: khóa bảng folder để 2 lượt chuyển chạy song song không tạo vòng (A vào B, B vào A)
// 404 thư mục / thư mục đích, 409 đích là chính nó hoặc thư mục con của nó, 409 trùng tên ở thư mục đích
export const updateFolder = async (id: number, data: { name?: string, parentid?: number | null }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const moving = data.parentid !== undefined;
        if (moving) await client.query('LOCK TABLE folder IN SHARE ROW EXCLUSIVE MODE');

        const current = (await client.query(`SELECT id, name, parentid FROM folder WHERE id = $1`, [id])).rows[0];
        if (!current) throw new HttpError(404, 'Không tìm thấy thư mục');

        const parentid = moving ? data.parentid! : current.parentid;
        if (moving && parentid !== null && parentid !== current.parentid) {
            const target = await client.query(`SELECT id FROM folder WHERE id = $1`, [parentid]);
            if (target.rowCount === 0) throw new HttpError(404, 'Không tìm thấy thư mục đích');
            const subtree = await client.query(selectSubtreeIds, [id]);
            if (subtree.rows.some((r: any) => r.id === parentid)) {
                throw new HttpError(409, 'Không thể chuyển thư mục vào chính nó hoặc thư mục con của nó');
            }
        }

        await client.query(`
            UPDATE folder SET name = $2, parentid = $3, updated_at = NOW()
            WHERE id = $1
        `, [id, data.name ?? current.name, parentid]);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        rethrowUnique(err);
    } finally {
        client.release();
    }
    return checkFolderExist(id);
}

// Thư mục còn thư mục con / file: recursive = false → 409, recursive = true → xóa cả cây
// Xóa cả cây trong 1 transaction (khóa các thư mục của cây để không ai thêm file / thư mục con vào giữa chừng),
// xóa file vật lý sau khi COMMIT (lỗi xóa file chỉ log, DB đã nhất quán)
export const deleteFolder = async (id: number, recursive: boolean) => {
    const folder = await checkFolderExist(id);
    if (!folder) throw new HttpError(404, 'Không tìm thấy thư mục');
    if (!recursive && folder.numfolders + folder.numfiles > 0) {
        throw new HttpError(409, `Thư mục còn ${folder.numfolders} thư mục con và ${folder.numfiles} file. Gửi ?recursive=true để xóa cả nội dung bên trong`);
    }

    const client = await pool.connect();
    let storagekeys: string[] = [];
    let deletedfolders = 0;
    try {
        await client.query('BEGIN');
        const ids = (await client.query(selectSubtreeIds, [id])).rows.map((r: any) => r.id);
        await client.query(`SELECT id FROM folder WHERE id = ANY($1) FOR UPDATE`, [ids]);
        const files = await client.query(`DELETE FROM file WHERE folderid = ANY($1) RETURNING storagekey`, [ids]);
        storagekeys = files.rows.map((r: any) => r.storagekey);
        // 1 câu DELETE cho cả cây: FK fk_folder_folder (NO ACTION) kiểm tra cuối câu lệnh nên không vướng thứ tự cha / con
        deletedfolders = (await client.query(`DELETE FROM folder WHERE id = ANY($1)`, [ids])).rowCount ?? 0;
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    await removeStoredFiles(storagekeys);
    return { ...folder, deletedfolders, deletedfiles: storagekeys.length };
}
