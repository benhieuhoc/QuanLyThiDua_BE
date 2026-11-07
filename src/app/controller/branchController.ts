import { sendSuccess, sendError, handleError, parseId } from "../utils/http";
import { fetchAllBranch, checkBranchExist, createBranch, updateBranch, deleteBranch } from "../service/branchService";

// Chuẩn hóa và kiểm tra name/code; required = true khi tạo mới
const validateBranchInput = (body: any, required: boolean) => {
    const errors: any[] = [];
    let name: string | undefined;
    let code: string | undefined;

    if (body?.name !== undefined || required) {
        name = typeof body?.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 100) errors.push({ field: 'name', message: 'Tên phân hiệu bắt buộc, tối đa 100 ký tự' });
    }
    if (body?.code !== undefined || required) {
        code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
        if (!/^[A-Z]$/.test(code ?? '')) errors.push({ field: 'code', message: 'Mã phân hiệu là 1 chữ cái A-Z' });
    }
    return { name, code, errors };
}

export const getBranches = async (req: any, res: any) => {
    try {
        return sendSuccess(res, await fetchAllBranch());
    } catch (err) {
        return handleError(res, err);
    }
}

export const getBranch = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const branch = await checkBranchExist(id);
        if (!branch) return sendError(res, 404, 'Không tìm thấy phân hiệu');
        return sendSuccess(res, branch);
    } catch (err) {
        return handleError(res, err);
    }
}

export const postBranch = async (req: any, res: any) => {
    try {
        const { name, code, errors } = validateBranchInput(req.body, true);
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);
        return sendSuccess(res, await createBranch(name!, code!), 'Tạo phân hiệu thành công', 201);
    } catch (err) {
        return handleError(res, err);
    }
}

export const putBranch = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const { name, code, errors } = validateBranchInput(req.body, false);
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);
        return sendSuccess(res, await updateBranch(id, name, code), 'Cập nhật phân hiệu thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

export const removeBranch = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        return sendSuccess(res, await deleteBranch(id), 'Xóa phân hiệu thành công');
    } catch (err) {
        return handleError(res, err);
    }
}
