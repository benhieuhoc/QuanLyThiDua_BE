import pool from "../../config/db";
import { HttpError } from "../utils/http";
import { checkWeekExist } from "./weekService";
import { checkSchoolYearExist } from "./schoolYearService";
import { getClassById } from "./classService";

// Bảng điểm 1 tuần, xếp hạng theo tổng điểm trong phạm vi lọc (toàn trường / phân hiệu / khối)
export const fetchWeeklyScore = async (weekid: number, filter: { branchid?: number, gradeid?: number } = {}) => {
    const week = await checkWeekExist(weekid);
    if (!week) throw new HttpError(404, 'Không tìm thấy tuần');

    const query = `
        SELECT *, RANK() OVER (ORDER BY total DESC)::int AS rank
        FROM score_view
        WHERE weekid = $1
          AND ($2::int IS NULL OR branchid = $2)
          AND ($3::int IS NULL OR gradeid = $3)
        ORDER BY rank, numgrade, branchcode, seq
    `;
    const result = await pool.query(query, [weekid, filter.branchid ?? null, filter.gradeid ?? null]);
    return { week, scores: result.rows };
}

// Tổng hợp nhiều tuần của 1 năm học (vd học kỳ); mặc định từ tuần 1 đến tuần đã bắt đầu gần nhất
export const fetchSummaryScore = async (schoolyearid: number, filter: { fromweek?: number, toweek?: number, branchid?: number, gradeid?: number } = {}) => {
    const schoolYear = await checkSchoolYearExist(schoolyearid);
    if (!schoolYear) throw new HttpError(404, 'Không tìm thấy năm học');

    const fromweek = filter.fromweek ?? 1;
    let toweek = filter.toweek;
    if (toweek === undefined) {
        const started = await pool.query(
            `SELECT MAX(numweek)::int AS numweek FROM week WHERE schoolyearid = $1 AND startdate <= CURRENT_DATE`,
            [schoolyearid]
        );
        toweek = started.rows[0].numweek ?? schoolYear.numweeks;
    }
    if (fromweek > toweek!) throw new HttpError(400, 'fromweek phải nhỏ hơn hoặc bằng toweek');

    const query = `
        SELECT classid, classname, gradeid, numgrade, branchid, branchcode, seq, teacherid, teachername,
               COUNT(*)::int AS weeks,
               SUM(conduct_score)::int AS conduct_score,
               SUM(study_score)::int AS study_score,
               SUM(total)::int AS total,
               ROUND(AVG(total), 2)::float AS avg_total,
               RANK() OVER (ORDER BY SUM(total) DESC)::int AS rank
        FROM score_view
        WHERE schoolyearid = $1 AND numweek BETWEEN $2 AND $3
          AND ($4::int IS NULL OR branchid = $4)
          AND ($5::int IS NULL OR gradeid = $5)
        GROUP BY classid, classname, gradeid, numgrade, branchid, branchcode, seq, teacherid, teachername
        ORDER BY rank, numgrade, branchcode, seq
    `;
    const result = await pool.query(query, [schoolyearid, fromweek, toweek, filter.branchid ?? null, filter.gradeid ?? null]);
    return { schoolyear: schoolYear, fromweek, toweek, scores: result.rows };
}

export type RankingPeriod = { type: 'week', value: number } | { type: 'month', value: string } | { type: 'semester', value: 1 | 2 };

// Tháng của tuần = tháng chứa thứ Năm (ngày thứ 4) của tuần, tức tháng có nhiều ngày của tuần hơn
const weekMonthSql = `to_char(w.startdate + 3, 'YYYY-MM')`;

// Các tuần của năm học kèm tháng, học kỳ và đã bắt đầu hay chưa
const fetchPeriodWeeks = async (schoolYear: any) => {
    const query = `
        SELECT w.id, w.numweek, w.startdate, w.enddate, w.locked,
               ${weekMonthSql} AS month,
               CASE WHEN w.numweek < $2 THEN 1 ELSE 2 END AS semester,
               w.startdate <= CURRENT_DATE AS started
        FROM week w
        WHERE w.schoolyearid = $1
        ORDER BY w.numweek
    `;
    const result = await pool.query(query, [schoolYear.id, schoolYear.semester2_week]);
    return result.rows;
}

const monthLabel = (month: string) => `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`;

// Gom các tuần liên tiếp theo key thành khoảng { value, label, fromweek, toweek, startdate, enddate }
const groupWeeks = (weeks: any[], key: string, label: (value: any) => string) => {
    const groups: any[] = [];
    for (const w of weeks) {
        const last = groups[groups.length - 1];
        if (last && last.value === w[key]) {
            last.toweek = w.numweek;
            last.enddate = w.enddate;
        } else {
            groups.push({ value: w[key], label: label(w[key]), fromweek: w.numweek, toweek: w.numweek, startdate: w.startdate, enddate: w.enddate });
        }
    }
    return groups;
}

// Danh sách tuần / tháng / học kỳ của năm học để chọn khoảng xếp hạng
export const fetchRankingPeriods = async (schoolyearid: number) => {
    const schoolYear = await checkSchoolYearExist(schoolyearid);
    if (!schoolYear) throw new HttpError(404, 'Không tìm thấy năm học');
    const weeks = await fetchPeriodWeeks(schoolYear);
    return {
        schoolyear: schoolYear,
        weeks,
        months: groupWeeks(weeks, 'month', monthLabel),
        semesters: groupWeeks(weeks, 'semester', (s) => `Học kỳ ${s}`),
    };
}

// Xếp hạng thi đua theo 1 tuần, 1 tháng hoặc 1 học kỳ của năm học
// Chỉ tính các tuần đã bắt đầu; rank theo tổng điểm các tuần trong phạm vi lọc (cùng điểm cùng hạng)
export const fetchRanking = async (schoolyearid: number, period: RankingPeriod, filter: { branchid?: number, gradeid?: number } = {}) => {
    const schoolYear = await checkSchoolYearExist(schoolyearid);
    if (!schoolYear) throw new HttpError(404, 'Không tìm thấy năm học');

    const allWeeks = await fetchPeriodWeeks(schoolYear);
    const inPeriod = allWeeks.filter((w: any) =>
        period.type === 'week' ? w.numweek === period.value
            : period.type === 'month' ? w.month === period.value
                : w.semester === period.value
    );
    const label = period.type === 'week' ? `Tuần ${period.value}`
        : period.type === 'month' ? monthLabel(period.value)
            : `Học kỳ ${period.value}`;
    if (inPeriod.length === 0) throw new HttpError(404, `Năm học ${schoolYear.name} không có ${label.toLowerCase()}`);

    const counted = inPeriod.filter((w: any) => w.started);
    if (counted.length === 0) throw new HttpError(409, `${label} chưa bắt đầu, chưa có điểm để xếp hạng`);

    const query = `
        SELECT classid, classname, gradeid, numgrade, branchid, branchcode, seq, teacherid, teachername,
               COUNT(*)::int AS weeks,
               SUM(conduct_plus)::int AS conduct_plus,
               SUM(conduct_minus)::int AS conduct_minus,
               SUM(conduct_score)::int AS conduct_score,
               SUM(study_plus)::int AS study_plus,
               SUM(study_minus)::int AS study_minus,
               SUM(study_score)::int AS study_score,
               SUM(total)::int AS total,
               ROUND(AVG(total), 2)::float AS avg_total,
               SUM(entries)::int AS entries,
               RANK() OVER (ORDER BY SUM(total) DESC)::int AS rank
        FROM score_view
        WHERE weekid = ANY($1)
          AND ($2::int IS NULL OR branchid = $2)
          AND ($3::int IS NULL OR gradeid = $3)
        GROUP BY classid, classname, gradeid, numgrade, branchid, branchcode, seq, teacherid, teachername
        ORDER BY rank, numgrade, branchcode, seq
    `;
    const result = await pool.query(query, [counted.map((w: any) => w.id), filter.branchid ?? null, filter.gradeid ?? null]);
    return {
        schoolyear: schoolYear,
        period: {
            type: period.type,
            value: period.value,
            label,
            fromweek: inPeriod[0].numweek,
            toweek: inPeriod[inPeriod.length - 1].numweek,
            startdate: inPeriod[0].startdate,
            enddate: inPeriod[inPeriod.length - 1].enddate,
            numweeks: inPeriod.length,
            countedweeks: counted.length,
        },
        scores: result.rows,
    };
}

// Điểm từng tuần của 1 lớp trong năm học, kèm hạng toàn trường của tuần đó
export const fetchClassScore = async (classid: number, schoolyearid: number) => {
    const cls = await getClassById(classid);
    if (!cls) throw new HttpError(404, 'Không tìm thấy lớp');
    const schoolYear = await checkSchoolYearExist(schoolyearid);
    if (!schoolYear) throw new HttpError(404, 'Không tìm thấy năm học');

    const query = `
        SELECT s.*, w.startdate, w.enddate
        FROM (
            SELECT *, RANK() OVER (PARTITION BY weekid ORDER BY total DESC)::int AS rank
            FROM score_view
            WHERE schoolyearid = $2
        ) s
        JOIN week w ON w.id = s.weekid
        WHERE s.classid = $1
        ORDER BY s.numweek
    `;
    const result = await pool.query(query, [classid, schoolyearid]);
    return { class: cls, schoolyear: schoolYear, weeks: result.rows };
}
