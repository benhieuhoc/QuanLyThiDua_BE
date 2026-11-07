import pool from "../../config/db";
import { HttpError } from "../utils/http";

export const fetchAllBranch = async () => {
    const query = `
        SELECT * FROM branch
        ORDER BY code
    `;
    const result = await pool.query(query);
    return result.rows;
}

export const checkBranchExist = async (id: number) => {
    const query = `
        SELECT * FROM branch
        WHERE id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}

export const createBranch = async (name: string, code: string) => {
    const query = `
        INSERT INTO branch (name, code)
        VALUES ($1, $2)
        RETURNING *;
    `;
    const result = await pool.query(query, [name, code]);
    return result.rows[0];
}

// Đổi code thì tên lớp (class_view) tự đổi theo
export const updateBranch = async (id: number, name?: string, code?: string) => {
    const branch = await checkBranchExist(id);
    if (!branch) throw new HttpError(404, 'Không tìm thấy phân hiệu');

    const query = `
        UPDATE branch
        SET name = $2, code = $3, updated_at = NOW()
        WHERE id = $1
        RETURNING *;
    `;
    const result = await pool.query(query, [id, name ?? branch.name, code ?? branch.code]);
    return result.rows[0];
}

// Không cho xóa khi còn giáo viên/lớp, tránh ON DELETE CASCADE xóa dây chuyền
export const deleteBranch = async (id: number) => {
    const branch = await checkBranchExist(id);
    if (!branch) throw new HttpError(404, 'Không tìm thấy phân hiệu');

    const query = `
        SELECT
            (SELECT COUNT(*) FROM teacher WHERE branchid = $1)::int AS teachers,
            (SELECT COUNT(*) FROM class WHERE branchid = $1)::int AS classes
    `;
    const { teachers, classes } = (await pool.query(query, [id])).rows[0];
    if (teachers > 0 || classes > 0) {
        throw new HttpError(409, `Phân hiệu còn ${teachers} giáo viên và ${classes} lớp, không thể xóa`);
    }

    await pool.query(`DELETE FROM branch WHERE id = $1`, [id]);
    return branch;
}
