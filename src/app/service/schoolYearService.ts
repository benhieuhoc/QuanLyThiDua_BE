import pool from "../../config/db";
import { HttpError } from "../utils/http";

// Kèm số tuần, ngày kết thúc (ngày cuối của tuần cuối) và tuần bắt đầu học kỳ 2
// semester2_week chưa đặt thì mặc định CEIL(numweeks / 2) + 1 (HK1 nhiều hơn hoặc bằng HK2)
const selectSchoolYear = `
    SELECT sy.id, sy.name, sy.startdate, sy.created_at, sy.updated_at,
           COUNT(w.id)::int AS numweeks, MAX(w.enddate) AS enddate,
           COALESCE(sy.semester2_week, CEIL(COUNT(w.id) / 2.0)::int + 1) AS semester2_week
    FROM school_year sy
    LEFT JOIN week w ON w.schoolyearid = sy.id
`;

export const fetchAllSchoolYear = async () => {
    const query = `
        ${selectSchoolYear}
        GROUP BY sy.id
        ORDER BY sy.startdate DESC
    `;
    const result = await pool.query(query);
    return result.rows;
}

export const checkSchoolYearExist = async (id: number) => {
    const query = `
        ${selectSchoolYear}
        WHERE sy.id = $1
        GROUP BY sy.id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}

// Khoảng [startdate, startdate + 7 * numweeks - 1] không được chồng lên năm học khác
const checkOverlap = async (client: any, startdate: string, numweeks: number, excludeId?: number) => {
    const query = `
        SELECT sy.name
        FROM school_year sy
        JOIN week w ON w.schoolyearid = sy.id
        WHERE ($3::int IS NULL OR sy.id <> $3)
        GROUP BY sy.id
        HAVING sy.startdate <= $1::date + ($2::int * 7 - 1) AND MAX(w.enddate) >= $1::date
    `;
    const result = await client.query(query, [startdate, numweeks, excludeId ?? null]);
    if (result.rows.length > 0) {
        throw new HttpError(409, `Thời gian bị trùng với năm học ${result.rows[0].name}`);
    }
}

// Sinh tuần fromWeek..toWeek liên tiếp từ startdate của năm học, mỗi tuần 7 ngày
const insertWeeks = async (client: any, schoolyearid: number, startdate: string, fromWeek: number, toWeek: number, conductBase: number, studyBase: number) => {
    const query = `
        INSERT INTO week (schoolyearid, numweek, startdate, enddate, conduct_base, study_base)
        SELECT $1, n, $2::date + (n - 1) * 7, $2::date + (n - 1) * 7 + 6, $5, $6
        FROM generate_series($3::int, $4::int) AS n
    `;
    await client.query(query, [schoolyearid, startdate, fromWeek, toWeek, conductBase, studyBase]);
}

// Tuần bắt đầu học kỳ 2 phải nằm trong 2..numweeks
const checkSemester2Week = (semester2Week: number, numweeks: number) => {
    if (semester2Week < 2 || semester2Week > numweeks) {
        throw new HttpError(400, `Tuần bắt đầu học kỳ 2 phải từ 2 đến ${numweeks}`);
    }
}

export const createSchoolYear = async (name: string, startdate: string, numweeks: number, conductBase: number, studyBase: number, semester2Week?: number) => {
    if (semester2Week !== undefined) checkSemester2Week(semester2Week, numweeks);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Khóa bảng để 2 request đồng thời không tạo năm học chồng thời gian
        await client.query('LOCK TABLE school_year IN SHARE ROW EXCLUSIVE MODE');
        await checkOverlap(client, startdate, numweeks);
        const insertResult = await client.query(
            `INSERT INTO school_year (name, startdate, semester2_week) VALUES ($1, $2, $3) RETURNING id`,
            [name, startdate, semester2Week ?? null]
        );
        const id = insertResult.rows[0].id;
        await insertWeeks(client, id, startdate, 1, numweeks, conductBase, studyBase);
        await client.query('COMMIT');
        return checkSchoolYearExist(id);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// Đổi tên, số tuần và/hoặc tuần bắt đầu HK2: tăng số tuần thì sinh thêm tuần (điểm gốc theo tuần cuối),
// giảm thì xóa tuần cuối nếu chưa có điểm
// semester2Week: undefined = giữ nguyên, null = về mặc định
export const updateSchoolYear = async (id: number, name?: string, numweeks?: number, semester2Week?: number | null) => {
    const schoolYear = await checkSchoolYearExist(id);
    if (!schoolYear) throw new HttpError(404, 'Không tìm thấy năm học');

    // Tuần HK2 đã đặt (hoặc đang đặt) phải còn nằm trong số tuần mới
    const stored = (await pool.query(`SELECT semester2_week FROM school_year WHERE id = $1`, [id])).rows[0].semester2_week;
    const nextSemester2 = semester2Week === undefined ? stored : semester2Week;
    if (nextSemester2 !== null) checkSemester2Week(nextSemester2, numweeks ?? schoolYear.numweeks);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('LOCK TABLE school_year IN SHARE ROW EXCLUSIVE MODE');
        if (name !== undefined) {
            await client.query(`UPDATE school_year SET name = $2, updated_at = NOW() WHERE id = $1`, [id, name]);
        }
        if (semester2Week !== undefined) {
            await client.query(`UPDATE school_year SET semester2_week = $2, updated_at = NOW() WHERE id = $1`, [id, semester2Week]);
        }

        const current: number = schoolYear.numweeks;
        if (numweeks !== undefined && numweeks > current) {
            await checkOverlap(client, schoolYear.startdate, numweeks, id);
            const last = (await client.query(
                `SELECT conduct_base, study_base FROM week WHERE schoolyearid = $1 ORDER BY numweek DESC LIMIT 1`,
                [id]
            )).rows[0] ?? { conduct_base: 100, study_base: 100 };
            await insertWeeks(client, id, schoolYear.startdate, current + 1, numweeks, last.conduct_base, last.study_base);
        } else if (numweeks !== undefined && numweeks < current) {
            const pointResult = await client.query(`
                SELECT COUNT(*)::int AS total FROM point p
                JOIN week w ON w.id = p.weekid
                WHERE w.schoolyearid = $1 AND w.numweek > $2
            `, [id, numweeks]);
            if (pointResult.rows[0].total > 0) {
                throw new HttpError(409, `Các tuần sau tuần ${numweeks} đã có điểm, không thể giảm số tuần`);
            }
            await client.query(`DELETE FROM week WHERE schoolyearid = $1 AND numweek > $2`, [id, numweeks]);
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return checkSchoolYearExist(id);
}

// Không cho xóa năm học đã có điểm, tránh CASCADE xóa tuần và điểm
export const deleteSchoolYear = async (id: number) => {
    const schoolYear = await checkSchoolYearExist(id);
    if (!schoolYear) throw new HttpError(404, 'Không tìm thấy năm học');

    const pointResult = await pool.query(`
        SELECT COUNT(*)::int AS total FROM point p
        JOIN week w ON w.id = p.weekid
        WHERE w.schoolyearid = $1
    `, [id]);
    if (pointResult.rows[0].total > 0) {
        throw new HttpError(409, `Năm học ${schoolYear.name} đã có điểm thi đua, không thể xóa`);
    }

    await pool.query(`DELETE FROM school_year WHERE id = $1`, [id]);
    return schoolYear;
}
