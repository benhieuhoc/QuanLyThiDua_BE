import pool from "../../config/db";
import { HttpError } from "../utils/http";
import { checkGradeExist } from "./gradeService";
import { checkBranchExist } from "./branchService";
import { checkListTeacherExist, fetchHomeroomClasses } from "./teacherService";

// Tên lớp (6A1, 6B2...) lấy từ class_view, kèm sĩ số (numstudents)
export const getAllClass = async (filter: { branchid?: number, gradeid?: number } = {}) => {
    const query = `
        SELECT cv.*, (SELECT COUNT(*)::int FROM student s WHERE s.classid = cv.id) AS numstudents
        FROM class_view cv
        WHERE ($1::int IS NULL OR branchid = $1)
          AND ($2::int IS NULL OR gradeid = $2)
        ORDER BY numgrade, branchcode, seq
    `;
    const result = await pool.query(query, [filter.branchid ?? null, filter.gradeid ?? null]);
    return result.rows;
}

export const getClassById = async (id: number) => {
    const query = `
        SELECT cv.*, (SELECT COUNT(*)::int FROM student s WHERE s.classid = cv.id) AS numstudents
        FROM class_view cv
        WHERE id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}

// Kiểm tra giáo viên tồn tại, cùng phân hiệu và chưa chủ nhiệm lớp nào
const validateTeachers = async (teacherIds: number[], branchid: number) => {
    const teachers = await checkListTeacherExist(teacherIds);
    const foundIds = teachers.map((t: any) => t.id);
    const missing = teacherIds.filter((id) => !foundIds.includes(id));
    if (missing.length > 0) {
        throw new HttpError(404, 'Không tìm thấy giáo viên', missing.map((id) => ({ teacherid: id })));
    }

    const otherBranch = teachers.filter((t: any) => t.branchid !== branchid);
    if (otherBranch.length > 0) {
        throw new HttpError(400, 'Giáo viên không thuộc phân hiệu của lớp', otherBranch.map((t: any) => ({ teacherid: t.id })));
    }

    const homeroom = await fetchHomeroomClasses(teacherIds);
    if (homeroom.length > 0) {
        throw new HttpError(409, 'Giáo viên đã chủ nhiệm lớp khác',
            homeroom.map((c: any) => ({ teacherid: c.teacherid, classname: c.name })));
    }
}

// Tạo hàng loạt lớp cho 1 khối của 1 phân hiệu, mỗi phần tử là GVCN của 1 lớp (null = chưa phân công),
// seq tăng tiếp từ lớp cuối
export const batchCreateClass = async (gradeid: number, branchid: number, teacherIds: (number | null)[]) => {
    if (teacherIds.length === 0) return [];
    if (!(await checkGradeExist(gradeid))) throw new HttpError(404, 'Không tìm thấy khối');
    if (!(await checkBranchExist(branchid))) throw new HttpError(404, 'Không tìm thấy phân hiệu');
    const assigned = teacherIds.filter((id): id is number => id !== null);
    if (assigned.length > 0) await validateTeachers(assigned, branchid);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Khóa dòng phân hiệu để các request đồng thời không lấy trùng seq
        await client.query(`SELECT id FROM branch WHERE id = $1 FOR UPDATE`, [branchid]);
        const maxResult = await client.query(
            `SELECT COALESCE(MAX(seq), 0)::int AS maxseq FROM class WHERE gradeid = $1 AND branchid = $2`,
            [gradeid, branchid]
        );
        const maxSeq: number = maxResult.rows[0].maxseq;

        const placeholder: string[] = [];
        const values: any[] = [gradeid, branchid];
        let index = 3;

        teacherIds.forEach((teacherId, i) => {
            placeholder.push(`($${index}, $1, $2, $${index + 1})`);
            values.push(maxSeq + i + 1, teacherId);
            index += 2;
        });

        const insertResult = await client.query(`
            INSERT INTO class (seq, gradeid, branchid, teacherid)
            VALUES ${placeholder.join(',')}
            RETURNING id;
        `, values);

        const ids = insertResult.rows.map((r: any) => r.id);
        const result = await client.query(
            `SELECT * FROM class_view WHERE id = ANY($1) ORDER BY seq`,
            [ids]
        );
        await client.query('COMMIT');
        return result.rows;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// Đổi giáo viên chủ nhiệm, teacherid = null để bỏ phân công
export const updateClassTeacher = async (id: number, teacherid: number | null) => {
    const cls = await getClassById(id);
    if (!cls) throw new HttpError(404, 'Không tìm thấy lớp');
    if (cls.teacherid === teacherid) return cls;

    if (teacherid !== null) await validateTeachers([teacherid], cls.branchid);

    await pool.query(
        `UPDATE class SET teacherid = $2, updated_at = NOW() WHERE id = $1`,
        [id, teacherid]
    );
    return getClassById(id);
}

// Không cho xóa lớp còn học sinh hoặc đã có điểm, tránh CASCADE xóa học sinh và điểm
export const deleteClass = async (id: number) => {
    const cls = await getClassById(id);
    if (!cls) throw new HttpError(404, 'Không tìm thấy lớp');
    if (cls.numstudents > 0) {
        throw new HttpError(409, `Lớp ${cls.name} còn ${cls.numstudents} học sinh, chuyển hoặc xóa học sinh trước`);
    }

    const pointResult = await pool.query(`SELECT COUNT(*)::int AS total FROM point WHERE classid = $1`, [id]);
    if (pointResult.rows[0].total > 0) {
        throw new HttpError(409, `Lớp ${cls.name} đã có điểm thi đua, không thể xóa`);
    }

    await pool.query(`DELETE FROM class WHERE id = $1`, [id]);
    return cls;
}
