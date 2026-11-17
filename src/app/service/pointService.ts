import pool from "../../config/db";
import { HttpError } from "../utils/http";
import { checkWeekOpen } from "./weekService";
import { getClassById, assertClassActive } from "./classService";
import { checkListStudentExist } from "./studentService";
import { Actor, canScoreClass } from "./accountService";
import { checkRuleExist } from "./ruleService";

export const POINT_TYPES = ['Nề nếp', 'Học tập'];

// Dữ liệu lượt chấm gửi lên; trường không có = lấy theo mục quy chế (POST) / giữ nguyên (PUT)
// ruleid: null = bỏ liên kết mục quy chế (chỉ PUT); pointdate: 'YYYY-MM-DD'
export type PointInput = { type?: string, content?: string, value?: number, ruleid?: number | null, pointdate?: string };

// Kèm tên lớp, GVCN của lớp, số tuần, người nhập (accountusername, null nếu không rõ),
// ngày / giờ nhập theo giờ Việt Nam (entereddate 'YYYY-MM-DD', enteredtime 'HH:mm'),
// nội dung mục quy chế hiện tại (rulecontent, null nếu không gắn mục)
// và học sinh được gắn (students: [{ id, code, name }], rỗng nếu không có)
const selectPoint = `
    SELECT p.*, cv.name AS classname, cv.teacherid AS classteacherid, w.numweek, w.schoolyearid, w.locked,
           a.username AS accountusername,
           to_char(p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS entereddate,
           to_char(p.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') AS enteredtime,
           r.content AS rulecontent,
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
    LEFT JOIN rule r ON r.id = p.ruleid
`;

// studentid: các lượt chấm có gắn học sinh này; ruleid: các lượt chấm theo mục quy chế này
export const fetchAllPoint = async (filter: { weekid?: number, classid?: number, type?: string, studentid?: number, ruleid?: number } = {}) => {
    const query = `
        ${selectPoint}
        WHERE ($1::int IS NULL OR p.weekid = $1)
          AND ($2::int IS NULL OR p.classid = $2)
          AND ($3::text IS NULL OR p.type = $3)
          AND ($4::int IS NULL OR EXISTS (SELECT 1 FROM point_student ps WHERE ps.pointid = p.id AND ps.studentid = $4))
          AND ($5::int IS NULL OR p.ruleid = $5)
        ORDER BY w.startdate, cv.numgrade, cv.branchcode, cv.seq, p.pointdate, p.created_at, p.id
    `;
    const result = await pool.query(query, [filter.weekid ?? null, filter.classid ?? null, filter.type ?? null, filter.studentid ?? null, filter.ruleid ?? null]);
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

// Mục quy chế phải tồn tại (404) và còn áp dụng (409); keepRuleId = mục đang gắn sẵn trên lượt chấm thì vẫn dùng được dù đã ngừng
const loadRule = async (ruleid: number, keepRuleId?: number | null) => {
    const rule = await checkRuleExist(ruleid);
    if (!rule) throw new HttpError(404, 'Không tìm thấy mục quy chế');
    if (!rule.active && rule.id !== keepRuleId) throw new HttpError(409, 'Mục quy chế đã ngừng áp dụng');
    return rule;
}

// Phần (type) của lượt chấm phải trùng phần của mục quy chế
const assertRuleType = (rule: any, type: string) => {
    if (rule.type !== type) {
        throw new HttpError(400, 'Dữ liệu không hợp lệ', [{ field: 'type', message: `Mục quy chế "${rule.content}" thuộc phần ${rule.type}` }]);
    }
}

// Ngày diễn ra phải nằm trong tuần (so sánh chuỗi 'YYYY-MM-DD')
const assertDateInWeek = (pointdate: string, week: any) => {
    if (pointdate < week.startdate || pointdate > week.enddate) {
        throw new HttpError(400, 'Dữ liệu không hợp lệ', [{ field: 'pointdate', message: `Ngày phải nằm trong tuần ${week.numweek} (${week.startdate} đến ${week.enddate})` }]);
    }
}

// Hôm nay (giờ local của server) kẹp vào khoảng ngày của tuần: tuần đã qua → ngày cuối, tuần chưa tới → ngày đầu
const defaultPointDate = (week: any) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (today < week.startdate) return week.startdate;
    if (today > week.enddate) return week.enddate;
    return today;
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
// Có ruleid: trường không gửi lấy theo mục quy chế; không nhân điểm theo số học sinh (FE tự tính nếu cần)
// Không gửi pointdate: hôm nay kẹp vào tuần
export const createPoint = async (actor: Actor, weekid: number, classid: number, input: PointInput, studentIds: number[] = []) => {
    assertNotViewOnly(actor);
    const cls = await getClassById(classid);
    if (!cls) throw new HttpError(404, 'Không tìm thấy lớp');
    if (!(await canScoreClass(actor, cls))) throw new HttpError(403, FORBIDDEN_CLASS);
    assertClassActive(cls);
    const week = await checkWeekOpen(weekid);

    let { type, content, value } = input;
    let ruleid: number | null = null;
    if (input.ruleid != null) {
        const rule = await loadRule(input.ruleid);
        type = type ?? rule.type;
        content = content ?? rule.content;
        value = value ?? rule.value;
        assertRuleType(rule, type!);
        ruleid = rule.id;
    }
    if (!type || !content || !value) throw new HttpError(400, 'Thiếu type, content hoặc value (hoặc chọn ruleid)');

    const pointdate = input.pointdate ?? defaultPointDate(week);
    assertDateInWeek(pointdate, week);
    await validateStudents(studentIds, classid);

    const client = await pool.connect();
    let id: number;
    try {
        await client.query('BEGIN');
        const insertResult = await client.query(`
            INSERT INTO point (weekid, classid, type, content, value, accountid, ruleid, pointdate)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id;
        `, [weekid, classid, type, content, value, actor.id, ruleid, pointdate]);
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

// Chỉ sửa type/content/value, mục quy chế, ngày diễn ra và học sinh; muốn chuyển tuần hoặc lớp thì xóa rồi tạo lại
// ruleid: undefined = giữ nguyên, null = bỏ liên kết (giữ nội dung, điểm), số = đổi mục (mục khác mục cũ thì trường không gửi lấy theo mục mới)
// pointdate: undefined = giữ nguyên; studentIds: undefined = giữ nguyên, mảng = thay toàn bộ ([] để bỏ hết)
export const updatePoint = async (actor: Actor, id: number, input: PointInput, studentIds?: number[]) => {
    const point = await checkPointExist(id);
    if (!point) throw new HttpError(404, 'Không tìm thấy lượt chấm điểm');
    await assertCanManagePoint(actor, point);
    const week = await checkWeekOpen(point.weekid);

    let base = { type: point.type, content: point.content, value: point.value };
    let ruleid: number | null = point.ruleid;
    let rule: any = null;
    if (input.ruleid === null) {
        ruleid = null;
    } else if (input.ruleid !== undefined) {
        rule = await loadRule(input.ruleid, point.ruleid);
        if (rule.id !== point.ruleid) base = { type: rule.type, content: rule.content, value: rule.value };
        ruleid = rule.id;
    } else if (ruleid !== null && input.type !== undefined) {
        // Giữ mục cũ nhưng đổi phần: vẫn phải trùng phần của mục
        rule = await checkRuleExist(ruleid);
    }
    const type = input.type ?? base.type;
    const content = input.content ?? base.content;
    const value = input.value ?? base.value;
    if (rule) assertRuleType(rule, type);

    const pointdate = input.pointdate ?? point.pointdate;
    if (input.pointdate !== undefined) assertDateInWeek(pointdate, week);
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
            SET type = $2, content = $3, value = $4, ruleid = $5, pointdate = $6, updated_at = NOW()
            WHERE id = $1
        `, [id, type, content, value, ruleid, pointdate]);
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
