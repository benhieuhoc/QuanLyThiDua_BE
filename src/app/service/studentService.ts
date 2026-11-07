import pool from "../../config/db";
import { HttpError } from "../utils/http";
import { getClassById } from "./classService";

export const GENDERS = ['Nam', 'Nữ'];

export type StudentInput = { code: string, name: string, gender: string | null, birthdate: string | null };

// Kèm tên lớp (classname), sắp xếp theo lớp → id
// classIds: chỉ lấy học sinh thuộc các lớp này (dùng giới hạn cho cờ đỏ)
export const fetchAllStudent = async (filter: { classid?: number, branchid?: number, gradeid?: number, classIds?: number[] } = {}) => {
    const query = `
        SELECT s.*, cv.name AS classname, cv.gradeid, cv.branchid
        FROM student s
        JOIN class_view cv ON cv.id = s.classid
        WHERE ($1::int IS NULL OR s.classid = $1)
          AND ($2::int IS NULL OR cv.branchid = $2)
          AND ($3::int IS NULL OR cv.gradeid = $3)
          AND ($4::int[] IS NULL OR s.classid = ANY($4))
        ORDER BY cv.numgrade, cv.branchcode, cv.seq, s.id
    `;
    const result = await pool.query(query, [filter.classid ?? null, filter.branchid ?? null, filter.gradeid ?? null, filter.classIds ?? null]);
    return result.rows;
}

export const checkStudentExist = async (id: number) => {
    const query = `
        SELECT s.*, cv.name AS classname, cv.gradeid, cv.branchid
        FROM student s
        JOIN class_view cv ON cv.id = s.classid
        WHERE s.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}

export const checkListStudentExist = async (ids: number[]) => {
    const result = await pool.query(`SELECT * FROM student WHERE id = ANY($1)`, [ids]);
    return result.rows;
}

// Thêm hàng loạt học sinh vào 1 lớp
export const createStudent = async (classid: number, students: StudentInput[]) => {
    if (students.length === 0) return [];
    if (!(await getClassById(classid))) throw new HttpError(404, 'Không tìm thấy lớp');

    const placeholder: string[] = [];
    const values: any[] = [classid];
    let index = 2;

    for (const student of students) {
        placeholder.push(`($${index}, $${index + 1}, $${index + 2}, $${index + 3}, $1)`);
        values.push(student.code, student.name, student.gender, student.birthdate);
        index += 4;
    }

    const insertResult = await pool.query(`
        INSERT INTO student (code, name, gender, birthdate, classid)
        VALUES ${placeholder.join(',')}
        RETURNING id;
    `, values);
    const ids = insertResult.rows.map((r: any) => r.id);
    return (await fetchAllStudent({ classid })).filter((s: any) => ids.includes(s.id));
}

// Sửa thông tin; đổi classid là chuyển lớp
export const updateStudent = async (id: number, data: Partial<StudentInput> & { classid?: number }) => {
    const student = await checkStudentExist(id);
    if (!student) throw new HttpError(404, 'Không tìm thấy học sinh');
    if (data.classid !== undefined && data.classid !== student.classid && !(await getClassById(data.classid))) {
        throw new HttpError(404, 'Không tìm thấy lớp');
    }

    const query = `
        UPDATE student
        SET code = $2, name = $3, gender = $4, birthdate = $5, classid = $6, updated_at = NOW()
        WHERE id = $1
    `;
    await pool.query(query, [
        id,
        data.code ?? student.code,
        data.name ?? student.name,
        data.gender !== undefined ? data.gender : student.gender,
        data.birthdate !== undefined ? data.birthdate : student.birthdate,
        data.classid ?? student.classid,
    ]);
    return checkStudentExist(id);
}

export const deleteStudent = async (id: number) => {
    const student = await checkStudentExist(id);
    if (!student) throw new HttpError(404, 'Không tìm thấy học sinh');

    // Không cho xóa học sinh đã được gắn vào lượt chấm, tránh CASCADE xóa lịch sử vi phạm
    const linkResult = await pool.query(`SELECT COUNT(*)::int AS total FROM point_student WHERE studentid = $1`, [id]);
    if (linkResult.rows[0].total > 0) {
        throw new HttpError(409, `Học sinh ${student.name} đã có trong ${linkResult.rows[0].total} lượt chấm điểm, không thể xóa`);
    }

    await pool.query(`DELETE FROM student WHERE id = $1`, [id]);
    return student;
}
