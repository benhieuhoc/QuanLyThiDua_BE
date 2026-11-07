import pool from "../../config/db";
import { HttpError } from "../utils/http";
import { checkBranchExist } from "./branchService";

// Kèm tên lớp chủ nhiệm (null nếu chưa chủ nhiệm)
export const fetchAllTeacher = async (branchid?: number) => {
    const query = `
        SELECT t.*, cv.id AS classid, cv.name AS classname
        FROM teacher t
        LEFT JOIN class_view cv ON cv.teacherid = t.id
        WHERE ($1::int IS NULL OR t.branchid = $1)
        ORDER BY t.id
    `;
    const result = await pool.query(query, [branchid ?? null]);
    return result.rows;
}

export const createTeacher = async (branchid: number, listTeacher: string[]) => {
    if (listTeacher.length === 0) return [];
    if (!(await checkBranchExist(branchid))) throw new HttpError(404, 'Không tìm thấy phân hiệu');

    const placeholder: string[] = [];
    const values: any[] = [branchid];
    let index = 2;

    for (const teacherName of listTeacher) {
        placeholder.push(`($${index}, $1)`);
        values.push(teacherName);
        index += 1;
    };

    const query = `
    INSERT INTO teacher (name, branchid)
    VALUES ${placeholder.join(',')}
    RETURNING *;
    `;
    const result = await pool.query(query, values);
    return result.rows;
}

export const checkTeacherExist = async (id: number) => {
    const query = `
        SELECT * FROM teacher
        WHERE id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
};

export const checkListTeacherExist = async (ids: number[]) => {
    const query = `
        SELECT * FROM teacher
        WHERE id = ANY($1)
    `;
    const result = await pool.query(query, [ids]);
    return result.rows;
}

// Lớp mà các giáo viên đang chủ nhiệm
export const fetchHomeroomClasses = async (teacherIds: number[]) => {
    const query = `
        SELECT * FROM class_view
        WHERE teacherid = ANY($1)
    `;
    const result = await pool.query(query, [teacherIds]);
    return result.rows;
}

export const updateTeacher = async (id: number, name?: string, branchid?: number) => {
    const teacher = await checkTeacherExist(id);
    if (!teacher) throw new HttpError(404, 'Không tìm thấy giáo viên');

    // Đổi phân hiệu: lớp chủ nhiệm phải cùng phân hiệu với giáo viên
    if (branchid !== undefined && branchid !== teacher.branchid) {
        if (!(await checkBranchExist(branchid))) throw new HttpError(404, 'Không tìm thấy phân hiệu');
        const homeroom = await fetchHomeroomClasses([id]);
        if (homeroom.length > 0) {
            throw new HttpError(409, `Giáo viên đang chủ nhiệm lớp ${homeroom[0].name}, không thể đổi phân hiệu`);
        }
    }

    const query = `
        UPDATE teacher
        SET name = $2, branchid = $3, updated_at = NOW()
        WHERE id = $1
        RETURNING *;
    `;
    const result = await pool.query(query, [id, name ?? teacher.name, branchid ?? teacher.branchid]);
    return result.rows[0];
}

// Không cho xóa giáo viên đang chủ nhiệm, tránh CASCADE xóa lớp và điểm
export const deleteTeacher = async (id: number) => {
    const teacher = await checkTeacherExist(id);
    if (!teacher) throw new HttpError(404, 'Không tìm thấy giáo viên');

    const homeroom = await fetchHomeroomClasses([id]);
    if (homeroom.length > 0) {
        throw new HttpError(409, `Giáo viên đang chủ nhiệm lớp ${homeroom[0].name}, không thể xóa`);
    }

    await pool.query(`DELETE FROM teacher WHERE id = $1`, [id]);
    return teacher;
}
