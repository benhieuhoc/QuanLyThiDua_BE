import pool from "../../config/db";
import { HttpError } from "../utils/http";
import { hashPassword, comparePassword, compareDummyPassword, signToken, PARENT_ROLE } from "../utils/auth";
import { checkStudentExist } from "./studentService";
import { BASE_QR_PATH } from "./classService";

export const RELATIONS = ['Cha', 'Mẹ'];

// Không bao giờ SELECT cột password ra ngoài (database.md)
// Lớp của con suy từ student.classid (không lưu trong parent), nên chuyển lớp / lên lớp thì tự đúng
// hasaccount: có username + password (đăng nhập được)
const selectParent = `
    SELECT p.id, p.name, p.relation, p.studentid, p.username, p.active, p.created_at, p.updated_at,
           (p.username IS NOT NULL) AS hasaccount,
           s.code AS studentcode, s.name AS studentname,
           s.classid, cv.name AS classname, cv.gradeid, cv.branchid, cv.archivedyearid
    FROM parent p
    JOIN student s     ON s.id = p.studentid
    JOIN class_view cv ON cv.id = s.classid
`;

const UNIQUE_MESSAGES: Record<string, string> = {
    parent_username_unique: 'Tên đăng nhập đã tồn tại',
    parent_student_relation_unique: 'Học sinh đã có phụ huynh với quan hệ này (mỗi học sinh tối đa 1 cha, 1 mẹ)',
};

const rethrowUnique = (err: any) => {
    if (err?.code === '23505') throw new HttpError(409, UNIQUE_MESSAGES[err.constraint] ?? 'Dữ liệu bị trùng');
    throw err;
}

// Sắp theo lớp → học sinh → quan hệ. Không truyền studentid / classid thì bỏ phụ huynh của học sinh lớp lưu trữ
export const fetchAllParent = async (filter: { studentid?: number, classid?: number } = {}) => {
    const query = `
        ${selectParent}
        WHERE ($1::int IS NULL OR p.studentid = $1)
          AND ($2::int IS NULL OR s.classid = $2)
          AND ($1::int IS NOT NULL OR $2::int IS NOT NULL OR cv.archivedyearid IS NULL)
        ORDER BY cv.numgrade, cv.branchcode, cv.seq, s.id, p.relation
    `;
    const result = await pool.query(query, [filter.studentid ?? null, filter.classid ?? null]);
    return result.rows;
}

export const checkParentExist = async (id: number) => {
    const result = await pool.query(`${selectParent} WHERE p.id = $1`, [id]);
    return result.rows[0];
}

// Dùng cho middleware authenticateParent
export const fetchAuthParent = async (id: number) => {
    const result = await pool.query(`SELECT id, studentid, username, active FROM parent WHERE id = $1`, [id]);
    return result.rows[0];
}

// Thông tin cho phụ huynh đang đăng nhập: kèm lớp của con và BaseQRCode để mở trang lớp công khai
export const fetchParentMe = async (id: number) => {
    const result = await pool.query(`
        SELECT p.id, p.name, p.relation, p.username, p.studentid,
               s.code AS studentcode, s.name AS studentname, s.gender AS studentgender, s.birthdate AS studentbirthdate,
               s.classid, cv.name AS classname, cv.numgrade, cv.branchcode, cv.branchname, cv.teachername,
               cv.archivedyearid, '${BASE_QR_PATH}' || cv.qrcode AS "BaseQRCode"
        FROM parent p
        JOIN student s     ON s.id = p.studentid
        JOIN class_view cv ON cv.id = s.classid
        WHERE p.id = $1
    `, [id]);
    return result.rows[0];
}

const LOGIN_FAILED = 'Sai tài khoản hoặc mật khẩu';

// Token { id: parent.id, role: 'parent' }; chỉ dùng được với route của phụ huynh
export const loginParent = async (username: string, password: string) => {
    const result = await pool.query(`SELECT id, password, active FROM parent WHERE username = $1`, [username]);
    const row = result.rows[0];
    if (!row) {
        await compareDummyPassword(password);
        throw new HttpError(401, LOGIN_FAILED);
    }
    if (!(await comparePassword(password, row.password))) throw new HttpError(401, LOGIN_FAILED);
    if (!row.active) throw new HttpError(403, 'Tài khoản đã bị khóa');

    return { token: signToken({ id: row.id, role: PARENT_ROLE }), parent: await fetchParentMe(row.id) };
}

export const changeParentPassword = async (id: number, oldPassword: string, newPassword: string) => {
    const result = await pool.query(`SELECT password FROM parent WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row?.password) throw new HttpError(404, 'Không tìm thấy tài khoản');
    if (!(await comparePassword(oldPassword, row.password))) throw new HttpError(400, 'Mật khẩu cũ không đúng');

    await pool.query(`UPDATE parent SET password = $2, updated_at = NOW() WHERE id = $1`, [id, await hashPassword(newPassword)]);
}

export type ParentInput = { name: string, relation: string, studentid: number, username: string | null, password: string | null };

// username và password đi cùng nhau (cả hai hoặc không có), controller đã kiểm tra
export const createParent = async (data: ParentInput) => {
    if (!(await checkStudentExist(data.studentid))) throw new HttpError(404, 'Không tìm thấy học sinh');

    try {
        const result = await pool.query(`
            INSERT INTO parent (name, relation, studentid, username, password)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `, [data.name, data.relation, data.studentid, data.username,
            data.password !== null ? await hashPassword(data.password) : null]);
        return checkParentExist(result.rows[0].id);
    } catch (err) {
        rethrowUnique(err);
    }
}

// username: bỏ = giữ, null = xóa tài khoản đăng nhập (xóa luôn password), chuỗi = đặt / đổi
// password: đặt lại mật khẩu; phụ huynh chưa có tài khoản thì phải gửi kèm username
export type ParentUpdate = { name?: string, relation?: string, studentid?: number, username?: string | null, password?: string, active?: boolean };

export const updateParent = async (id: number, data: ParentUpdate) => {
    const parent = await checkParentExist(id);
    if (!parent) throw new HttpError(404, 'Không tìm thấy phụ huynh');
    if (data.studentid !== undefined && !(await checkStudentExist(data.studentid))) throw new HttpError(404, 'Không tìm thấy học sinh');

    const username = data.username !== undefined ? data.username : parent.username;
    if (username !== null && !parent.hasaccount && data.password === undefined) {
        throw new HttpError(400, 'Tạo tài khoản đăng nhập cho phụ huynh cần gửi kèm password');
    }
    if (username === null && data.password !== undefined) {
        throw new HttpError(400, 'Phụ huynh chưa có tài khoản đăng nhập, cần gửi kèm username');
    }

    // Xóa tài khoản: password về null; đặt mật khẩu mới: hash; còn lại giữ
    let passwordSql = 'password';
    const params: any[] = [id, data.name ?? parent.name, data.relation ?? parent.relation,
        data.studentid ?? parent.studentid, username, data.active ?? parent.active];
    if (username === null) passwordSql = 'NULL';
    else if (data.password !== undefined) {
        params.push(await hashPassword(data.password));
        passwordSql = `$${params.length}`;
    }

    try {
        await pool.query(`
            UPDATE parent
            SET name = $2, relation = $3, studentid = $4, username = $5, active = $6,
                password = ${passwordSql}, updated_at = NOW()
            WHERE id = $1
        `, params);
    } catch (err) {
        rethrowUnique(err);
    }
    return checkParentExist(id);
}

export const deleteParent = async (id: number) => {
    const parent = await checkParentExist(id);
    if (!parent) throw new HttpError(404, 'Không tìm thấy phụ huynh');
    await pool.query(`DELETE FROM parent WHERE id = $1`, [id]);
    return parent;
}

// Lượt chấm có gắn con của phụ huynh (point_student) trong 1 năm học, mới nhất trước
// schoolyearid không truyền: năm học đã bắt đầu gần nhất (chưa năm nào bắt đầu thì năm sớm nhất); không có năm học → schoolyear null
// classname = tên lớp lúc chấm (class_year của năm đã lên lớp, năm hiện tại theo class_view); classid để FE lọc lượt của lớp đang xem
// value là điểm của cả lượt chấm (có thể gắn nhiều học sinh), không chia theo học sinh. Không trả học sinh khác hay người nhập
export const fetchParentPoints = async (studentid: number, schoolyearid?: number) => {
    let schoolyear: any;
    if (schoolyearid !== undefined) {
        const result = await pool.query(`
            SELECT sy.id, sy.name, sy.startdate, MAX(w.enddate) AS enddate
            FROM school_year sy LEFT JOIN week w ON w.schoolyearid = sy.id
            WHERE sy.id = $1 GROUP BY sy.id
        `, [schoolyearid]);
        schoolyear = result.rows[0];
        if (!schoolyear) throw new HttpError(404, 'Không tìm thấy năm học');
    } else {
        const result = await pool.query(`
            SELECT sy.id, sy.name, sy.startdate, MAX(w.enddate) AS enddate
            FROM school_year sy LEFT JOIN week w ON w.schoolyearid = sy.id
            GROUP BY sy.id
            ORDER BY (sy.startdate <= CURRENT_DATE) DESC,
                     CASE WHEN sy.startdate <= CURRENT_DATE THEN sy.startdate END DESC NULLS LAST, sy.startdate
            LIMIT 1
        `);
        schoolyear = result.rows[0] ?? null;
    }
    const empty = { count: 0, plus: 0, minus: 0, total: 0 };
    if (!schoolyear) return { schoolyear: null, points: [], summary: empty };

    const result = await pool.query(`
        SELECT p.id, p.weekid, w.numweek, w.locked, p.type, p.content, p.value, p.pointdate,
               p.classid, COALESCE(cy.name, cv.name) AS classname
        FROM point_student ps
        JOIN point p        ON p.id = ps.pointid
        JOIN week w         ON w.id = p.weekid
        JOIN class_view cv  ON cv.id = p.classid
        LEFT JOIN class_year cy ON cy.classid = p.classid AND cy.schoolyearid = w.schoolyearid
        WHERE ps.studentid = $1 AND w.schoolyearid = $2
        ORDER BY p.pointdate DESC, p.created_at DESC, p.id DESC
    `, [studentid, schoolyear.id]);
    const points = result.rows;
    const summary = points.reduce((acc: any, p: any) => {
        acc.count += 1;
        if (p.value > 0) acc.plus += p.value; else acc.minus += -p.value;
        acc.total += p.value;
        return acc;
    }, { ...empty });
    return { schoolyear, points, summary };
}
