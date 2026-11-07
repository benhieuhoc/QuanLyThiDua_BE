import { sendSuccess, sendError, handleError, parseId, parseIntInRange } from "../utils/http";
import { fetchAllWeek, checkWeekExist, fetchCurrentWeek, updateWeek } from "../service/weekService";

// Query: ?schoolyearid= (không bắt buộc)
export const getWeeks = async (req: any, res: any) => {
    try {
        let schoolyearid: number | undefined;
        if (req.query.schoolyearid !== undefined) {
            schoolyearid = parseId(req.query.schoolyearid) ?? undefined;
            if (!schoolyearid) return sendError(res, 400, 'schoolyearid không hợp lệ');
        }
        return sendSuccess(res, await fetchAllWeek(schoolyearid));
    } catch (err) {
        return handleError(res, err);
    }
}

export const getCurrentWeek = async (req: any, res: any) => {
    try {
        const week = await fetchCurrentWeek();
        if (!week) return sendError(res, 404, 'Hôm nay không thuộc tuần nào');
        return sendSuccess(res, week);
    } catch (err) {
        return handleError(res, err);
    }
}

export const getWeek = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const week = await checkWeekExist(id);
        if (!week) return sendError(res, 404, 'Không tìm thấy tuần');
        return sendSuccess(res, week);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { conduct_base?, study_base?, locked?, applyToNext? }
export const putWeek = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const body = req.body ?? {};
        const errors: any[] = [];
        const data: { conduct_base?: number, study_base?: number, locked?: boolean, applyToNext?: boolean } = {};

        for (const key of ['conduct_base', 'study_base'] as const) {
            if (body[key] !== undefined) {
                const value = parseIntInRange(body[key], 0, 1000);
                if (value === null) errors.push({ field: key, message: `${key} là số nguyên 0-1000` });
                else data[key] = value;
            }
        }
        for (const key of ['locked', 'applyToNext'] as const) {
            if (body[key] !== undefined) {
                if (typeof body[key] !== 'boolean') errors.push({ field: key, message: `${key} là true/false` });
                else data[key] = body[key];
            }
        }
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        return sendSuccess(res, await updateWeek(id, data), 'Cập nhật tuần thành công');
    } catch (err) {
        return handleError(res, err);
    }
}
