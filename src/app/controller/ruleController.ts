import { sendSuccess, sendError, handleError, parseId, parseIntInRange } from "../utils/http";
import { POINT_TYPES } from "../service/pointService";
import { fetchAllRule, checkRuleExist, createRule, updateRule, deleteRule } from "../service/ruleService";

// Kiểm tra type/content/value/active; required = true khi tạo mới (active không bắt buộc)
const validateRuleInput = (body: any, required: boolean) => {
    const errors: any[] = [];
    let type: string | undefined;
    let content: string | undefined;
    let value: number | undefined;
    let active: boolean | undefined;

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
    if (body?.active !== undefined) {
        active = body.active;
        if (typeof active !== 'boolean') errors.push({ field: 'active', message: 'active phải là true hoặc false' });
    }
    return { type, content, value, active, errors };
}

// Query: ?type=&active=true|false (không bắt buộc)
export const getRules = async (req: any, res: any) => {
    try {
        const filter: { type?: string, active?: boolean } = {};
        if (req.query.type !== undefined) {
            if (!POINT_TYPES.includes(req.query.type)) return sendError(res, 400, 'type không hợp lệ');
            filter.type = req.query.type;
        }
        if (req.query.active !== undefined) {
            if (req.query.active !== 'true' && req.query.active !== 'false') return sendError(res, 400, 'active là true hoặc false');
            filter.active = req.query.active === 'true';
        }
        return sendSuccess(res, await fetchAllRule(filter));
    } catch (err) {
        return handleError(res, err);
    }
}

export const getRule = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const rule = await checkRuleExist(id);
        if (!rule) return sendError(res, 404, 'Không tìm thấy mục quy chế');
        return sendSuccess(res, rule);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { type, content, value, active? }
export const postRule = async (req: any, res: any) => {
    try {
        const { type, content, value, active, errors } = validateRuleInput(req.body, true);
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);
        return sendSuccess(res, await createRule(type!, content!, value!, active ?? true), 'Tạo mục quy chế thành công', 201);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { type?, content?, value?, active? }
export const putRule = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const { type, content, value, active, errors } = validateRuleInput(req.body, false);
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);
        return sendSuccess(res, await updateRule(id, { type, content, value, active }), 'Cập nhật mục quy chế thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

export const removeRule = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        return sendSuccess(res, await deleteRule(id), 'Xóa mục quy chế thành công');
    } catch (err) {
        return handleError(res, err);
    }
}
