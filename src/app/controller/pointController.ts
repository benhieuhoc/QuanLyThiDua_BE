import { sendSuccess, sendError, handleError, parseId, parseIntInRange } from "../utils/http";
import { POINT_TYPES, fetchAllPoint, checkPointExist, createPoint, updatePoint, deletePoint } from "../service/pointService";

// Kiểm tra type/content/value; required = true khi tạo mới
const validatePointInput = (body: any, required: boolean) => {
    const errors: any[] = [];
    let type: string | undefined;
    let content: string | undefined;
    let value: number | undefined;

    if (body?.type !== undefined || required) {
        type = body?.type;
        if (!POINT_TYPES.includes(type as string)) errors.push({ field: 'type', message: `type là một trong: ${POINT_TYPES.join(', ')}` });
    }
    if (body?.content !== undefined || required) {
        content = typeof body?.content === 'string' ? body.content.trim() : '';
        if (!content || content.length > 255) errors.push({ field: 'content', message: 'Nội dung bắt buộc, tối đa 255 ký tự' });
    }
    if (body?.value !== undefined || required) {
        value = parseIntInRange(body?.value, -1000, 1000) ?? undefined;
        if (!value) errors.push({ field: 'value', message: 'value là số nguyên khác 0, từ -1000 đến 1000 (âm = trừ, dương = cộng)' });
    }
    let studentIds: number[] | undefined;
    if (body?.studentIds !== undefined) {
        const raw = body.studentIds;
        studentIds = Array.isArray(raw) ? raw.map((id: any) => parseId(id) ?? 0) : [];
        if (!Array.isArray(raw) || studentIds.some((id) => !id)) {
            errors.push({ field: 'studentIds', message: 'studentIds phải là mảng id học sinh' });
        } else if (new Set(studentIds).size !== studentIds.length) {
            errors.push({ field: 'studentIds', message: 'studentIds bị trùng' });
        }
    }
    return { type, content, value, studentIds, errors };
}

// Query: ?weekid=&classid=&type=&studentid= (không bắt buộc)
export const getPoints = async (req: any, res: any) => {
    try {
        const filter: { weekid?: number, classid?: number, type?: string, studentid?: number } = {};
        for (const key of ['weekid', 'classid', 'studentid'] as const) {
            if (req.query[key] !== undefined) {
                const value = parseId(req.query[key]);
                if (!value) return sendError(res, 400, `${key} không hợp lệ`);
                filter[key] = value;
            }
        }
        if (req.query.type !== undefined) {
            if (!POINT_TYPES.includes(req.query.type)) return sendError(res, 400, 'type không hợp lệ');
            filter.type = req.query.type;
        }
        return sendSuccess(res, await fetchAllPoint(filter));
    } catch (err) {
        return handleError(res, err);
    }
}

export const getPoint = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const point = await checkPointExist(id);
        if (!point) return sendError(res, 404, 'Không tìm thấy lượt chấm điểm');
        return sendSuccess(res, point);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { weekid, classid, type, content, value }
export const postPoint = async (req: any, res: any) => {
    try {
        const weekid = parseId(req.body?.weekid);
        const classid = parseId(req.body?.classid);
        const { type, content, value, studentIds, errors } = validatePointInput(req.body, true);
        if (!weekid) errors.unshift({ field: 'weekid', message: 'weekid không hợp lệ' });
        if (!classid) errors.unshift({ field: 'classid', message: 'classid không hợp lệ' });
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        const point = await createPoint(req.user, weekid!, classid!, type!, content!, value!, studentIds);
        return sendSuccess(res, point, 'Chấm điểm thành công', 201);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { type?, content?, value?, studentIds? }
export const putPoint = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const { type, content, value, studentIds, errors } = validatePointInput(req.body, false);
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);
        return sendSuccess(res, await updatePoint(req.user, id, type, content, value, studentIds), 'Cập nhật lượt chấm điểm thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

export const removePoint = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        return sendSuccess(res, await deletePoint(req.user, id), 'Xóa lượt chấm điểm thành công');
    } catch (err) {
        return handleError(res, err);
    }
}
