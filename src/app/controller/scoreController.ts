import { sendSuccess, sendError, sendFile, handleError, parseId, parseIntInRange } from "../utils/http";
import { fetchWeeklyScore, fetchSummaryScore, fetchClassScore, fetchRanking, fetchRankingPeriods, fetchPublicClassScore, fetchPublicMeta, fetchPublicRankingPeriods, fetchPublicRanking, RankingPeriod } from "../service/scoreService";
import { buildScoreWorkbook } from "../service/scoreExportService";

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Đọc các query id không bắt buộc; trả về chuỗi lỗi nếu có key sai
const readIdQuery = <K extends string>(query: any, keys: readonly K[]) => {
    const result: Partial<Record<K, number>> = {};
    for (const key of keys) {
        if (query[key] !== undefined) {
            const value = parseId(query[key]);
            if (!value) return { error: `${key} không hợp lệ` };
            result[key] = value;
        }
    }
    return { result };
}

// Query: ?weekid= (bắt buộc) &branchid=&gradeid=
export const getWeeklyScore = async (req: any, res: any) => {
    try {
        const weekid = parseId(req.query.weekid);
        if (!weekid) return sendError(res, 400, 'weekid không hợp lệ');
        const { result, error } = readIdQuery(req.query, ['branchid', 'gradeid'] as const);
        if (error) return sendError(res, 400, error);
        return sendSuccess(res, await fetchWeeklyScore(weekid, result));
    } catch (err) {
        return handleError(res, err);
    }
}

// Query: ?schoolyearid= (bắt buộc) &fromweek=&toweek=&branchid=&gradeid=
export const getSummaryScore = async (req: any, res: any) => {
    try {
        const schoolyearid = parseId(req.query.schoolyearid);
        if (!schoolyearid) return sendError(res, 400, 'schoolyearid không hợp lệ');
        const { result, error } = readIdQuery(req.query, ['fromweek', 'toweek', 'branchid', 'gradeid'] as const);
        if (error) return sendError(res, 400, error);
        return sendSuccess(res, await fetchSummaryScore(schoolyearid, result));
    } catch (err) {
        return handleError(res, err);
    }
}

// Đọc khoảng xếp hạng: đúng 1 trong week= (số tuần) | month= (YYYY-MM) | semester= (1|2) | year=1 (cả năm học)
const readPeriodQuery = (query: any): { period?: RankingPeriod, error?: string } => {
    const keys = (['week', 'month', 'semester', 'year'] as const).filter((key) => query[key] !== undefined);
    if (keys.length !== 1) return { error: 'Chọn đúng 1 trong week, month, semester, year' };
    if (keys[0] === 'week') {
        const week = parseIntInRange(query.week, 1, 60);
        if (!week) return { error: 'week là số tuần 1-60' };
        return { period: { type: 'week', value: week } };
    }
    if (keys[0] === 'month') {
        const match = typeof query.month === 'string' ? /^(\d{4})-(\d{2})$/.exec(query.month) : null;
        if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return { error: 'month dạng YYYY-MM' };
        return { period: { type: 'month', value: query.month } };
    }
    if (keys[0] === 'semester') {
        const semester = parseIntInRange(query.semester, 1, 2);
        if (!semester) return { error: 'semester là 1 hoặc 2' };
        return { period: { type: 'semester', value: semester as 1 | 2 } };
    }
    if (query.year !== '1' && query.year !== 'true') return { error: 'year là 1 (cả năm học)' };
    return { period: { type: 'year', value: null } };
}

// Đọc schoolyearid + khoảng + branchid/gradeid dùng chung cho /ranking và /export
const readRankingQuery = (query: any) => {
    const schoolyearid = parseId(query.schoolyearid);
    if (!schoolyearid) return { error: 'schoolyearid không hợp lệ' };
    const { period, error: periodError } = readPeriodQuery(query);
    if (periodError) return { error: periodError };
    const { result, error } = readIdQuery(query, ['branchid', 'gradeid'] as const);
    if (error) return { error };
    return { schoolyearid, period: period!, filter: result! };
}

// Query: ?schoolyearid= (bắt buộc) và đúng 1 trong week | month | semester | year=1; &branchid=&gradeid=
export const getRanking = async (req: any, res: any) => {
    try {
        const { schoolyearid, period, filter, error } = readRankingQuery(req.query);
        if (error) return sendError(res, 400, error);
        return sendSuccess(res, await fetchRanking(schoolyearid!, period!, filter));
    } catch (err) {
        return handleError(res, err);
    }
}

// Query như /ranking; trả file .xlsx (lỗi vẫn trả JSON như các API khác)
export const getScoreExport = async (req: any, res: any) => {
    try {
        const { schoolyearid, period, filter, error } = readRankingQuery(req.query);
        if (error) return sendError(res, 400, error);
        const { filename, buffer } = await buildScoreWorkbook(schoolyearid!, period!, filter);
        return sendFile(res, buffer, filename, XLSX_TYPE);
    } catch (err) {
        return handleError(res, err);
    }
}

// Query: ?schoolyearid= (bắt buộc)
export const getRankingPeriods = async (req: any, res: any) => {
    try {
        const schoolyearid = parseId(req.query.schoolyearid);
        if (!schoolyearid) return sendError(res, 400, 'schoolyearid không hợp lệ');
        return sendSuccess(res, await fetchRankingPeriods(schoolyearid));
    } catch (err) {
        return handleError(res, err);
    }
}

// Params: :classid; Query: ?schoolyearid= (bắt buộc)
export const getClassScore = async (req: any, res: any) => {
    try {
        const classid = parseId(req.params.classid);
        if (!classid) return sendError(res, 400, 'classid không hợp lệ');
        const schoolyearid = parseId(req.query.schoolyearid);
        if (!schoolyearid) return sendError(res, 400, 'schoolyearid không hợp lệ');
        return sendSuccess(res, await fetchClassScore(classid, schoolyearid));
    } catch (err) {
        return handleError(res, err);
    }
}

// Public (không đăng nhập): trang lớp cho phụ huynh qua mã QR, :qrcode = class.qrcode. Query: ?schoolyearid= (không bắt buộc)
// Mã sai định dạng trả 404 như mã không tồn tại
export const getPublicClassScore = async (req: any, res: any) => {
    try {
        const qrcode = String(req.params.qrcode ?? '').toLowerCase();
        if (!/^[0-9a-f]{16}$/.test(qrcode)) return sendError(res, 404, 'Không tìm thấy lớp');
        let schoolyearid: number | undefined;
        if (req.query.schoolyearid !== undefined) {
            schoolyearid = parseId(req.query.schoolyearid) ?? undefined;
            if (!schoolyearid) return sendError(res, 400, 'schoolyearid không hợp lệ');
        }
        return sendSuccess(res, await fetchPublicClassScore(qrcode, schoolyearid));
    } catch (err) {
        return handleError(res, err);
    }
}

// ---------- Trang tổng quan công khai (không đăng nhập) ----------

export const getPublicMeta = async (req: any, res: any) => {
    try {
        return sendSuccess(res, await fetchPublicMeta());
    } catch (err) {
        return handleError(res, err);
    }
}

// Query: ?schoolyearid= (bắt buộc)
export const getPublicRankingPeriods = async (req: any, res: any) => {
    try {
        const schoolyearid = parseId(req.query.schoolyearid);
        if (!schoolyearid) return sendError(res, 400, 'schoolyearid không hợp lệ');
        return sendSuccess(res, await fetchPublicRankingPeriods(schoolyearid));
    } catch (err) {
        return handleError(res, err);
    }
}

// Query như /scores/ranking
export const getPublicRanking = async (req: any, res: any) => {
    try {
        const { schoolyearid, period, filter, error } = readRankingQuery(req.query);
        if (error) return sendError(res, 400, error);
        return sendSuccess(res, await fetchPublicRanking(schoolyearid!, period!, filter));
    } catch (err) {
        return handleError(res, err);
    }
}
