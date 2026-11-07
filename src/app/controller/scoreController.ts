import { sendSuccess, sendError, handleError, parseId, parseIntInRange } from "../utils/http";
import { fetchWeeklyScore, fetchSummaryScore, fetchClassScore, fetchRanking, fetchRankingPeriods, RankingPeriod } from "../service/scoreService";

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

// Query: ?schoolyearid= (bắt buộc) và đúng 1 trong week= (số tuần) | month= (YYYY-MM) | semester= (1|2); &branchid=&gradeid=
export const getRanking = async (req: any, res: any) => {
    try {
        const schoolyearid = parseId(req.query.schoolyearid);
        if (!schoolyearid) return sendError(res, 400, 'schoolyearid không hợp lệ');

        const keys = (['week', 'month', 'semester'] as const).filter((key) => req.query[key] !== undefined);
        if (keys.length !== 1) return sendError(res, 400, 'Chọn đúng 1 trong week, month, semester');
        let period: RankingPeriod;
        if (keys[0] === 'week') {
            const week = parseIntInRange(req.query.week, 1, 60);
            if (!week) return sendError(res, 400, 'week là số tuần 1-60');
            period = { type: 'week', value: week };
        } else if (keys[0] === 'month') {
            const match = /^(\d{4})-(\d{2})$/.exec(req.query.month);
            if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return sendError(res, 400, 'month dạng YYYY-MM');
            period = { type: 'month', value: req.query.month };
        } else {
            const semester = parseIntInRange(req.query.semester, 1, 2);
            if (!semester) return sendError(res, 400, 'semester là 1 hoặc 2');
            period = { type: 'semester', value: semester as 1 | 2 };
        }

        const { result, error } = readIdQuery(req.query, ['branchid', 'gradeid'] as const);
        if (error) return sendError(res, 400, error);
        return sendSuccess(res, await fetchRanking(schoolyearid, period, result));
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
