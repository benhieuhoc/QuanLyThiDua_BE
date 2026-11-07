import { sendSuccess, sendError, handleError, parseId, parseIntInRange, parseDate } from "../utils/http";
import { fetchAllSchoolYear, checkSchoolYearExist, createSchoolYear, updateSchoolYear, deleteSchoolYear } from "../service/schoolYearService";
import { fetchAllWeek } from "../service/weekService";

// Tên năm học dạng "2026-2027", năm sau = năm trước + 1
const isValidName = (name: any) => {
    const match = typeof name === 'string' ? /^(\d{4})-(\d{4})$/.exec(name.trim()) : null;
    return !!match && Number(match[2]) === Number(match[1]) + 1;
}

export const getSchoolYears = async (req: any, res: any) => {
    try {
        return sendSuccess(res, await fetchAllSchoolYear());
    } catch (err) {
        return handleError(res, err);
    }
}

// Kèm danh sách tuần
export const getSchoolYear = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const schoolYear = await checkSchoolYearExist(id);
        if (!schoolYear) return sendError(res, 404, 'Không tìm thấy năm học');
        return sendSuccess(res, { ...schoolYear, weeks: await fetchAllWeek(id) });
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { name, startdate, numweeks, conduct_base?, study_base?, semester2_week? }
export const postSchoolYear = async (req: any, res: any) => {
    try {
        const body = req.body ?? {};
        const errors: any[] = [];
        if (!isValidName(body.name)) errors.push({ field: 'name', message: 'Tên năm học dạng YYYY-YYYY, năm sau = năm trước + 1' });
        const startdate = parseDate(body.startdate);
        if (!startdate) errors.push({ field: 'startdate', message: 'startdate là ngày dạng YYYY-MM-DD' });
        const numweeks = parseIntInRange(body.numweeks, 1, 60);
        if (!numweeks) errors.push({ field: 'numweeks', message: 'numweeks là số nguyên 1-60' });
        const conductBase = body.conduct_base === undefined ? 100 : parseIntInRange(body.conduct_base, 0, 1000);
        if (conductBase === null) errors.push({ field: 'conduct_base', message: 'conduct_base là số nguyên 0-1000' });
        const studyBase = body.study_base === undefined ? 100 : parseIntInRange(body.study_base, 0, 1000);
        if (studyBase === null) errors.push({ field: 'study_base', message: 'study_base là số nguyên 0-1000' });
        const semester2Week = body.semester2_week === undefined || body.semester2_week === null ? undefined : parseIntInRange(body.semester2_week, 2, 60);
        if (semester2Week === null) errors.push({ field: 'semester2_week', message: 'semester2_week là số nguyên 2-60' });
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        const schoolYear = await createSchoolYear(body.name.trim(), startdate!, numweeks!, conductBase!, studyBase!, semester2Week ?? undefined);
        return sendSuccess(res, schoolYear, 'Tạo năm học thành công', 201);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { name?, numweeks?, semester2_week? } — semester2_week null = về mặc định
export const putSchoolYear = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const body = req.body ?? {};
        const errors: any[] = [];
        if (body.name !== undefined && !isValidName(body.name)) {
            errors.push({ field: 'name', message: 'Tên năm học dạng YYYY-YYYY, năm sau = năm trước + 1' });
        }
        let numweeks: number | undefined;
        if (body.numweeks !== undefined) {
            numweeks = parseIntInRange(body.numweeks, 1, 60) ?? undefined;
            if (!numweeks) errors.push({ field: 'numweeks', message: 'numweeks là số nguyên 1-60' });
        }
        let semester2Week: number | null | undefined;
        if (body.semester2_week !== undefined) {
            semester2Week = body.semester2_week === null ? null : parseIntInRange(body.semester2_week, 2, 60);
            if (body.semester2_week !== null && semester2Week === null) errors.push({ field: 'semester2_week', message: 'semester2_week là số nguyên 2-60 hoặc null' });
        }
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        const schoolYear = await updateSchoolYear(id, body.name?.trim(), numweeks, semester2Week);
        return sendSuccess(res, schoolYear, 'Cập nhật năm học thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

export const removeSchoolYear = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        return sendSuccess(res, await deleteSchoolYear(id), 'Xóa năm học thành công');
    } catch (err) {
        return handleError(res, err);
    }
}
