import pool from "../../config/db";
import { HttpError } from "../utils/http";
import { checkGradeExist } from "./gradeService";
import { checkBranchExist } from "./branchService";
import { checkListTeacherExist, fetchHomeroomClasses } from "./teacherService";

// Tên lớp (6A1, 6B2...) lấy từ class_view, kèm sĩ số (numstudents)
// archived: false (mặc định) = lớp đang học, true = lớp đã lưu trữ (ra trường), kèm tên năm học ra trường
export const getAllClass = async (filter: { branchid?: number, gradeid?: number, archived?: boolean } = {}) => {
    const query = `
        SELECT cv.*, sy.name AS archivedyearname,
               (SELECT COUNT(*)::int FROM student s WHERE s.classid = cv.id) AS numstudents
        FROM class_view cv
        LEFT JOIN school_year sy ON sy.id = cv.archivedyearid
        WHERE ($1::int IS NULL OR cv.branchid = $1)
          AND ($2::int IS NULL OR cv.gradeid = $2)
          AND (cv.archivedyearid IS NOT NULL) = $3
        ORDER BY sy.startdate DESC NULLS FIRST, cv.numgrade, cv.branchcode, cv.seq
    `;
    const result = await pool.query(query, [filter.branchid ?? null, filter.gradeid ?? null, filter.archived ?? false]);
    return result.rows;
}

// Lấy cả lớp đã lưu trữ (để xem lịch sử); thao tác ghi dùng assertClassActive để chặn
export const getClassById = async (id: number) => {
    const query = `
        SELECT cv.*, sy.name AS archivedyearname,
               (SELECT COUNT(*)::int FROM student s WHERE s.classid = cv.id) AS numstudents
        FROM class_view cv
        LEFT JOIN school_year sy ON sy.id = cv.archivedyearid
        WHERE cv.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}

// Lớp đã lưu trữ (ra trường) chỉ để xem: không đổi GVCN, thêm học sinh, chấm điểm hay phân công cờ đỏ
export const assertClassActive = (cls: any) => {
    if (cls.archivedyearid !== null) {
        throw new HttpError(409, `Lớp ${cls.name} đã ra trường (lưu trữ năm học ${cls.archivedyearname}), không thể thay đổi`);
    }
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
            `SELECT COALESCE(MAX(seq), 0)::int AS maxseq FROM class WHERE gradeid = $1 AND branchid = $2 AND archivedyearid IS NULL`,
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
    assertClassActive(cls);
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

export type Grade6Input = { branchid: number, count: number };

// Lên lớp khi chuyển năm học (chạy trong transaction của createSchoolYear, client đã BEGIN):
// 1. Chụp tên lớp / khối / GVCN của các lớp đang học vào class_year của năm học cũ (giữ lịch sử bảng điểm)
// 2. Lưu trữ lớp khối cuối (9): đánh dấu archivedyearid, bỏ GVCN, khóa tài khoản cờ đỏ của học sinh, bỏ phân công chấm
// 3. Tăng khối các lớp còn lại (8 → 9, 7 → 8, 6 → 7), giữ nguyên học sinh, GVCN, seq
// 4. Tạo lớp khối đầu (6) mới chưa có GVCN, chưa có học sinh: số lớp mỗi phân hiệu theo grade6,
//    không truyền thì bằng số lớp khối 6 của năm cũ
export const promoteClasses = async (client: any, oldSchoolYearId: number, grade6?: Grade6Input[]) => {
    // Chặn tạo / sửa lớp đồng thời trong lúc lên lớp
    await client.query('LOCK TABLE class IN SHARE ROW EXCLUSIVE MODE');

    const grades = (await client.query(`SELECT id, numgrade FROM grade ORDER BY numgrade`)).rows;
    if (grades.length < 2) throw new HttpError(409, 'Cần ít nhất 2 khối để lên lớp');
    for (let i = 1; i < grades.length; i++) {
        if (grades[i].numgrade !== grades[i - 1].numgrade + 1) {
            throw new HttpError(409, `Thiếu khối ${grades[i - 1].numgrade + 1}, không thể lên lớp`);
        }
    }
    const first = grades[0];
    const last = grades[grades.length - 1];

    if (grade6) {
        const branchIds = grade6.map((g) => g.branchid);
        const found = (await client.query(`SELECT id FROM branch WHERE id = ANY($1)`, [branchIds])).rows.map((b: any) => b.id);
        const missing = branchIds.filter((id) => !found.includes(id));
        if (missing.length > 0) throw new HttpError(404, 'Không tìm thấy phân hiệu', missing.map((id) => ({ branchid: id })));
    }
    const newGrade6: Grade6Input[] = grade6 ?? (await client.query(`
        SELECT branchid, COUNT(*)::int AS count
        FROM class
        WHERE gradeid = $1 AND archivedyearid IS NULL
        GROUP BY branchid
    `, [first.id])).rows;

    await client.query(`
        INSERT INTO class_year (schoolyearid, classid, gradeid, numgrade, name, teacherid, teachername)
        SELECT $1, id, gradeid, numgrade, name, teacherid, teachername
        FROM class_view
        WHERE archivedyearid IS NULL
        ON CONFLICT (schoolyearid, classid) DO NOTHING
    `, [oldSchoolYearId]);

    const archived = (await client.query(`
        SELECT id, name FROM class_view
        WHERE gradeid = $1 AND archivedyearid IS NULL
        ORDER BY branchcode, seq
    `, [last.id])).rows;
    const archivedIds = archived.map((c: any) => c.id);
    let deactivatedAccounts = 0;
    if (archivedIds.length > 0) {
        await client.query(`
            UPDATE class SET archivedyearid = $2, teacherid = NULL, updated_at = NOW()
            WHERE id = ANY($1)
        `, [archivedIds, oldSchoolYearId]);
        // Học sinh ra trường: tài khoản cờ đỏ bị khóa và bỏ phân công; lớp ra trường không còn được phân công chấm
        deactivatedAccounts = (await client.query(`
            UPDATE account SET active = false, updated_at = NOW()
            WHERE active AND studentid IN (SELECT id FROM student WHERE classid = ANY($1))
        `, [archivedIds])).rowCount ?? 0;
        await client.query(`
            DELETE FROM account_class
            WHERE classid = ANY($1)
               OR accountid IN (SELECT a.id FROM account a JOIN student s ON s.id = a.studentid WHERE s.classid = ANY($1))
        `, [archivedIds]);
    }

    // Tăng khối từ trên xuống (8 → 9 trước) để không vướng unique (khối, phân hiệu, seq) của lớp đang học
    let promoted = 0;
    for (let i = grades.length - 2; i >= 0; i--) {
        const result = await client.query(`
            UPDATE class SET gradeid = $2, updated_at = NOW()
            WHERE gradeid = $1 AND archivedyearid IS NULL
        `, [grades[i].id, grades[i + 1].id]);
        promoted += result.rowCount ?? 0;
    }

    const createdIds: number[] = [];
    for (const g of newGrade6) {
        if (g.count <= 0) continue;
        const result = await client.query(`
            INSERT INTO class (seq, gradeid, branchid)
            SELECT n, $1, $2 FROM generate_series(1, $3::int) AS n
            RETURNING id
        `, [first.id, g.branchid, g.count]);
        createdIds.push(...result.rows.map((r: any) => r.id));
    }
    const created = (await client.query(
        `SELECT id, name FROM class_view WHERE id = ANY($1) ORDER BY branchcode, seq`,
        [createdIds]
    )).rows;

    return { archived, promoted, created, deactivatedAccounts };
}
