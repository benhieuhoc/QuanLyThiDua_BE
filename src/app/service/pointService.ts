import pool from "../../config/db";
import { HttpError } from "../utils/http";
import { checkWeekOpen } from "./weekService";
import { getClassById } from "./classService";
import { checkListStudentExist } from "./studentService";
import { Actor, canScoreClass } from "./accountService";

export const POINT_TYPES = ['Nề nếp', 'Học tập'];

// Kèm tên lớp, GVCN của lớp, số tuần, người nhập (accountusername, null nếu không rõ)
// và học sinh được gắn (students: [{ id, code, name }], rỗng nếu không có)
const selectPoint = `
    SELECT p.*, cv.name AS classname, cv.teacherid AS classteacherid, w.numweek, w.schoolyearid, w.locked,
           a.username AS accountusername,
           COALESCE((
               SELECT json_agg(json_build_object('id', s.id, 'code', s.code, 'name', s.name) ORDER BY s.id)
               FROM point_student ps
               JOIN student s ON s.id = ps.studentid
               WHERE ps.pointid = p.id
           ), '[]'::json) AS students
    FROM point p
    JOIN class_view cv ON cv.id = p.classid
    JOIN week w ON w.id = p.weekid
    LEFT JOIN account a ON a.id = p.accountid
`;

// studentid: các lượt chấm có gắn học sinh này
export const fetchAllPoint = async (filter: { weekid?: number, classid?: number, type?: string, studentid?: number } = {}) => {
    const query = `
        ${selectPoint}
        WHERE ($1::int IS NULL OR p.weekid = $1)
          AND ($2::int IS NULL OR p.classid = $2)
          AND ($3::text IS NULL OR p.type = $3)
          AND ($4::int IS NULL OR EXISTS (SELECT 1 FROM point_student ps WHERE ps.pointid = p.id AND ps.studentid = $4))
        ORDER BY w.startdate, cv.numgrade, cv.branchcode, cv.seq, p.id
    `;
    const result = await pool.query(query, [filter.weekid ?? null, filter.classid ?? null, filter.type ?? null, filter.studentid ?? null]);
    return result.rows;
}

export const checkPointExist = async (id: number) => {
    const query = `
        ${selectPoint}
        WHERE p.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}

const FORBIDDEN_CLASS = 'Không có quyền chấm điểm lớp này';

// GVCN chỉ được xem điểm, không tạo / sửa / xóa lượt chấm
const assertNotViewOnly = (actor: Actor) => {
    if (actor.kind === 'gvcn') throw new HttpError(403, 'Giáo viên chủ nhiệm chỉ được xem, không được chấm điểm');
}

// Sửa/xóa lượt chấm: admin mọi lượt; cờ đỏ chỉ lượt do mình nhập và lớp vẫn đang được phân công
const assertCanManagePoint = async (actor: Actor, point: any) => {
    assertNotViewOnly(actor);
    if (actor.kind === 'codo' && point.accountid !== actor.id) {
        throw new HttpError(403, 'Cờ đỏ chỉ được sửa / xóa lượt chấm do mình nhập');
    }
    if (!(await canScoreClass(actor, { id: point.classid }))) {
        throw new HttpError(403, FORBIDDEN_CLASS);
    }
}

// Học sinh gắn vào lượt chấm phải tồn tại và đang học lớp của lượt chấm
const validateStudents = async (studentIds: number[], classid: number) => {
    if (studentIds.length === 0) return;
    const students = await checkListStudentExist(studentIds);
    const foundIds = students.map((s: any) => s.id);
    const missing = studentIds.filter((id) => !foundIds.includes(id));
    if (missing.length > 0) {
        throw new HttpError(404, 'Không tìm thấy học sinh', missing.map((id) => ({ studentid: id })));
    }
    const otherClass = students.filter((s: any) => s.classid !== classid);
    if (otherClass.length > 0) {
        throw new HttpError(400, 'Học sinh không thuộc lớp của lượt chấm', otherClass.map((s: any) => ({ studentid: s.id, name: s.name })));
    }
}

// Ghi lại toàn bộ danh sách học sinh của lượt chấm (chạy trong transaction của client)
const replacePointStudents = async (client: any, pointid: number, studentIds: number[]) => {
    await client.query(`DELETE FROM point_student WHERE pointid = $1`, [pointid]);
    if (studentIds.length === 0) return;
    await client.query(`
        INSERT INTO point_student (pointid, studentid)
        SELECT $1, UNNEST($2::int[])
    `, [pointid, studentIds]);
}

// actor = req.user; ghi point.accountid = người nhập
export const createPoint = async (actor: Actor, weekid: number, classid: number, type: string, content: string, value: number, studentIds: number[] = []) => {
    assertNotViewOnly(actor);
    const cls = await getClassById(classid);
    if (!cls) throw new HttpError(404, 'Không tìm thấy lớp');
    if (!(await canScoreClass(actor, cls))) throw new HttpError(403, FORBIDDEN_CLASS);
    await checkWeekOpen(weekid);
    await validateStudents(studentIds, classid);

    const client = await pool.connect();
    let id: number;
    try {
        await client.query('BEGIN');
        const insertResult = await client.query(`
            INSERT INTO point (weekid, classid, type, content, value, accountid)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id;
        `, [weekid, classid, type, content, value, actor.id]);
        id = insertResult.rows[0].id;
        await replacePointStudents(client, id, studentIds);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return checkPointExist(id);
}

// Chỉ sửa type/content/value và học sinh; muốn chuyển tuần hoặc lớp thì xóa rồi tạo lại
// studentIds: undefined = giữ nguyên, mảng = thay toàn bộ ([] để bỏ hết)
export const updatePoint = async (actor: Actor, id: number, type?: string, content?: string, value?: number, studentIds?: number[]) => {
    const point = await checkPointExist(id);
    if (!point) throw new HttpError(404, 'Không tìm thấy lượt chấm điểm');
    await assertCanManagePoint(actor, point);
    await checkWeekOpen(point.weekid);
    if (studentIds) {
        // Học sinh đã gắn từ trước (kể cả đã chuyển lớp sau đó) được giữ lại, chỉ kiểm tra học sinh mới gắn
        const kept = point.students.map((s: any) => s.id);
        await validateStudents(studentIds.filter((sid) => !kept.includes(sid)), point.classid);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            UPDATE point
            SET type = $2, content = $3, value = $4, updated_at = NOW()
            WHERE id = $1
        `, [id, type ?? point.type, content ?? point.content, value ?? point.value]);
        if (studentIds) await replacePointStudents(client, id, studentIds);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return checkPointExist(id);
}

export const deletePoint = async (actor: Actor, id: number) => {
    const point = await checkPointExist(id);
    if (!point) throw new HttpError(404, 'Không tìm thấy lượt chấm điểm');
    await assertCanManagePoint(actor, point);
    await checkWeekOpen(point.weekid);

    await pool.query(`DELETE FROM point WHERE id = $1`, [id]);
    return point;
}
