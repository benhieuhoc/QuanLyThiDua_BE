import pool from "../../config/db";
import { HttpError } from "../utils/http";
import { hashPassword, comparePassword, compareDummyPassword, signToken } from "../utils/auth";
import { checkTeacherExist } from "./teacherService";
import { checkStudentExist } from "./studentService";

export const ROLES = ['admin', 'user'];

// Không bao giờ SELECT cột password ra ngoài (database.md)
// kind: 'admin' | 'gvcn' (user gắn giáo viên) | 'codo' (user gắn học sinh)
// classes: lớp cờ đỏ được phân công chấm
const selectAccount = `
    SELECT a.id, a.username, a.role, a.teacherid, a.studentid, a.active, a.created_at, a.updated_at,
           CASE WHEN a.role = 'admin' THEN 'admin' WHEN a.teacherid IS NOT NULL THEN 'gvcn' ELSE 'codo' END AS kind,
           t.name AS teachername,
           hr.id AS homeroomclassid, hr.name AS homeroomclassname,
           s.code AS studentcode, s.name AS studentname,
           s.classid AS studentclassid, sc.name AS studentclassname,
           COALESCE((
               SELECT json_agg(json_build_object('id', cv.id, 'name', cv.name)
                               ORDER BY cv.numgrade, cv.branchcode, cv.seq)
               FROM account_class ac
               JOIN class_view cv ON cv.id = ac.classid
               WHERE ac.accountid = a.id
           ), '[]'::json) AS classes
    FROM account a
    LEFT JOIN teacher t     ON t.id = a.teacherid
    LEFT JOIN class_view hr ON hr.teacherid = a.teacherid
    LEFT JOIN student s     ON s.id = a.studentid
    LEFT JOIN class_view sc ON sc.id = s.classid
`;

export const fetchAllAccount = async (filter: { role?: string, active?: boolean } = {}) => {
    const query = `
        ${selectAccount}
        WHERE ($1::text IS NULL OR a.role = $1)
          AND ($2::boolean IS NULL OR a.active = $2)
        ORDER BY a.role, a.username
    `;
    const result = await pool.query(query, [filter.role ?? null, filter.active ?? null]);
    return result.rows;
}

export const checkAccountExist = async (id: number) => {
    const result = await pool.query(`${selectAccount} WHERE a.id = $1`, [id]);
    return result.rows[0];
}

// Dùng cho middleware authenticate: thông tin tối thiểu để phân quyền, kiểm tra active ở mỗi request
export const fetchAuthAccount = async (id: number) => {
    const result = await pool.query(`
        SELECT a.id, a.role, a.teacherid, a.studentid, a.active, s.classid AS studentclassid,
               CASE WHEN a.role = 'admin' THEN 'admin' WHEN a.teacherid IS NOT NULL THEN 'gvcn' ELSE 'codo' END AS kind
        FROM account a
        LEFT JOIN student s ON s.id = a.studentid
        WHERE a.id = $1
    `, [id]);
    return result.rows[0];
}

// Id các lớp cờ đỏ được phân công chấm
export const fetchAssignedClassIds = async (accountid: number): Promise<number[]> => {
    const result = await pool.query(`SELECT classid FROM account_class WHERE accountid = $1`, [accountid]);
    return result.rows.map((r: any) => r.classid);
}

export type Actor = { id: number, role: string, kind: string, teacherid: number | null, studentid: number | null, studentclassid: number | null };

// Lớp tài khoản được tạo lượt chấm: admin mọi lớp; cờ đỏ lớp được phân công, trừ lớp của mình
// GVCN chỉ được xem, không chấm điểm lớp nào
export const canScoreClass = async (actor: Actor, cls: { id: number }) => {
    if (actor.kind === 'admin') return true;
    if (actor.kind === 'codo') {
        if (cls.id === actor.studentclassid) return false;
        return (await fetchAssignedClassIds(actor.id)).includes(cls.id);
    }
    return false;
}

const LOGIN_FAILED = 'Sai tài khoản hoặc mật khẩu';

export const login = async (username: string, password: string) => {
    const result = await pool.query(`SELECT id, role, password, active FROM account WHERE username = $1`, [username]);
    const row = result.rows[0];
    if (!row) {
        await compareDummyPassword(password);
        throw new HttpError(401, LOGIN_FAILED);
    }
    if (!(await comparePassword(password, row.password))) throw new HttpError(401, LOGIN_FAILED);
    // Chỉ báo bị khóa khi đã đúng mật khẩu
    if (!row.active) throw new HttpError(403, 'Tài khoản đã bị khóa');

    return { token: signToken({ id: row.id, role: row.role }), account: await checkAccountExist(row.id) };
}

export const changePassword = async (id: number, oldPassword: string, newPassword: string) => {
    const result = await pool.query(`SELECT password FROM account WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) throw new HttpError(404, 'Không tìm thấy tài khoản');
    if (!(await comparePassword(oldPassword, row.password))) throw new HttpError(400, 'Mật khẩu cũ không đúng');

    await pool.query(`UPDATE account SET password = $2, updated_at = NOW() WHERE id = $1`, [id, await hashPassword(newPassword)]);
}

type AccountInput = { username: string, password: string, role: string, teacherid?: number | null, studentid?: number | null };

// admin: teacherid tùy chọn, không gắn học sinh; user: gắn đúng 1 trong teacherid (GVCN) / studentid (cờ đỏ)
export const createAccount = async (data: AccountInput) => {
    const teacherid = data.teacherid ?? null;
    const studentid = data.studentid ?? null;
    if (data.role === 'admin' && studentid) throw new HttpError(400, 'Tài khoản admin không gắn với học sinh');
    if (data.role === 'user' && (teacherid ? 1 : 0) + (studentid ? 1 : 0) !== 1) {
        throw new HttpError(400, 'Tài khoản user phải gắn đúng 1 giáo viên (GVCN) hoặc 1 học sinh (cờ đỏ)');
    }
    if (teacherid && !(await checkTeacherExist(teacherid))) throw new HttpError(404, 'Không tìm thấy giáo viên');
    if (studentid && !(await checkStudentExist(studentid))) throw new HttpError(404, 'Không tìm thấy học sinh');

    try {
        const result = await pool.query(`
            INSERT INTO account (username, password, role, teacherid, studentid)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `, [data.username, await hashPassword(data.password), data.role, teacherid, studentid]);
        return checkAccountExist(result.rows[0].id);
    } catch (err: any) {
        if (err?.code === '23505') {
            const messages: Record<string, string> = {
                account_username_unique: 'Tên đăng nhập đã tồn tại',
                account_teacher_unique: 'Giáo viên đã có tài khoản',
                account_student_unique: 'Học sinh đã có tài khoản',
            };
            throw new HttpError(409, messages[err.constraint] ?? 'Dữ liệu bị trùng');
        }
        throw err;
    }
}

// Còn ít nhất 1 admin đang hoạt động ngoài tài khoản id
const ensureOtherActiveAdmin = async (id: number) => {
    const result = await pool.query(`SELECT 1 FROM account WHERE role = 'admin' AND active AND id <> $1 LIMIT 1`, [id]);
    if (result.rows.length === 0) throw new HttpError(409, 'Phải còn ít nhất 1 tài khoản admin đang hoạt động');
}

// Role, teacherid, studentid không đổi được (muốn đổi thì xóa tạo lại); password = admin đặt lại mật khẩu
// currentId: tài khoản đang đăng nhập, không được tự khóa mình
export const updateAccount = async (id: number, currentId: number, data: { username?: string, password?: string, active?: boolean }) => {
    const account = await checkAccountExist(id);
    if (!account) throw new HttpError(404, 'Không tìm thấy tài khoản');
    if (data.active === false && account.active) {
        if (id === currentId) throw new HttpError(409, 'Không thể tự khóa tài khoản của mình');
        if (account.role === 'admin') await ensureOtherActiveAdmin(id);
    }

    try {
        await pool.query(`
            UPDATE account
            SET username = $2, password = COALESCE($3, password), active = $4, updated_at = NOW()
            WHERE id = $1
        `, [id, data.username ?? account.username,
            data.password !== undefined ? await hashPassword(data.password) : null,
            data.active ?? account.active]);
    } catch (err: any) {
        if (err?.code === '23505') throw new HttpError(409, 'Tên đăng nhập đã tồn tại');
        throw err;
    }
    return checkAccountExist(id);
}

// Lượt chấm của tài khoản bị xóa vẫn giữ (point.accountid về null)
export const deleteAccount = async (id: number, currentId: number) => {
    const account = await checkAccountExist(id);
    if (!account) throw new HttpError(404, 'Không tìm thấy tài khoản');
    if (id === currentId) throw new HttpError(409, 'Không thể tự xóa tài khoản của mình');
    if (account.role === 'admin' && account.active) await ensureOtherActiveAdmin(id);

    await pool.query(`DELETE FROM account WHERE id = $1`, [id]);
    return account;
}

// Thay toàn bộ lớp cờ đỏ được phân công chấm ([] = bỏ hết)
export const replaceAccountClasses = async (id: number, classIds: number[]) => {
    const account = await checkAccountExist(id);
    if (!account) throw new HttpError(404, 'Không tìm thấy tài khoản');
    if (account.kind !== 'codo') throw new HttpError(400, 'Chỉ phân công lớp chấm cho tài khoản cờ đỏ');

    if (classIds.length > 0) {
        const found = await pool.query(`SELECT id, name, archivedyearid FROM class_view WHERE id = ANY($1)`, [classIds]);
        const foundIds = found.rows.map((c: any) => c.id);
        const missing = classIds.filter((cid) => !foundIds.includes(cid));
        if (missing.length > 0) throw new HttpError(404, 'Không tìm thấy lớp', missing.map((cid) => ({ classid: cid })));
        const archived = found.rows.filter((c: any) => c.archivedyearid !== null);
        if (archived.length > 0) {
            throw new HttpError(409, 'Lớp đã ra trường (lưu trữ), không thể phân công chấm', archived.map((c: any) => ({ classid: c.id, classname: c.name })));
        }
        if (classIds.includes(account.studentclassid)) {
            throw new HttpError(400, `Cờ đỏ không được chấm lớp của mình (${account.studentclassname})`);
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM account_class WHERE accountid = $1`, [id]);
        if (classIds.length > 0) {
            await client.query(`
                INSERT INTO account_class (accountid, classid)
                SELECT $1, UNNEST($2::int[])
            `, [id, classIds]);
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return checkAccountExist(id);
}
