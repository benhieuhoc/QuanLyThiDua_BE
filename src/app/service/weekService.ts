import pool from "../../config/db";
import { HttpError } from "../utils/http";

// Kèm tên năm học và số lượt chấm điểm trong tuần
const selectWeek = `
    SELECT w.*, sy.name AS schoolyearname,
           (SELECT COUNT(*) FROM point p WHERE p.weekid = w.id)::int AS entries
    FROM week w
    JOIN school_year sy ON sy.id = w.schoolyearid
`;

export const fetchAllWeek = async (schoolyearid?: number) => {
    const query = `
        ${selectWeek}
        WHERE ($1::int IS NULL OR w.schoolyearid = $1)
        ORDER BY w.startdate
    `;
    const result = await pool.query(query, [schoolyearid ?? null]);
    return result.rows;
}

export const checkWeekExist = async (id: number) => {
    const query = `
        ${selectWeek}
        WHERE w.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}

// Tuần chứa ngày hiện tại (theo giờ của database)
export const fetchCurrentWeek = async () => {
    const query = `
        ${selectWeek}
        WHERE CURRENT_DATE BETWEEN w.startdate AND w.enddate
    `;
    const result = await pool.query(query);
    return result.rows[0];
}

// Dùng cho chấm điểm: tuần phải tồn tại và chưa khóa
export const checkWeekOpen = async (id: number) => {
    const week = await checkWeekExist(id);
    if (!week) throw new HttpError(404, 'Không tìm thấy tuần');
    if (week.locked) throw new HttpError(409, `Tuần ${week.numweek} đã khóa, không thể sửa điểm`);
    return week;
}

// Đổi điểm gốc và/hoặc khóa tuần; applyToNext = true thì áp điểm gốc mới cho các tuần sau chưa khóa cùng năm học
export const updateWeek = async (id: number, data: { conduct_base?: number, study_base?: number, locked?: boolean, applyToNext?: boolean }) => {
    const week = await checkWeekExist(id);
    if (!week) throw new HttpError(404, 'Không tìm thấy tuần');

    const changeBase = (data.conduct_base !== undefined && data.conduct_base !== week.conduct_base)
        || (data.study_base !== undefined && data.study_base !== week.study_base);
    // Tuần đã khóa chỉ được đổi điểm gốc khi mở khóa trong cùng request
    if (week.locked && data.locked !== false && changeBase) {
        throw new HttpError(409, `Tuần ${week.numweek} đã khóa, không thể đổi điểm gốc`);
    }

    const conductBase = data.conduct_base ?? week.conduct_base;
    const studyBase = data.study_base ?? week.study_base;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            UPDATE week
            SET conduct_base = $2, study_base = $3, locked = $4, updated_at = NOW()
            WHERE id = $1
        `, [id, conductBase, studyBase, data.locked ?? week.locked]);
        if (data.applyToNext) {
            await client.query(`
                UPDATE week
                SET conduct_base = $3, study_base = $4, updated_at = NOW()
                WHERE schoolyearid = $1 AND numweek > $2 AND locked = false
            `, [week.schoolyearid, week.numweek, conductBase, studyBase]);
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return checkWeekExist(id);
}
