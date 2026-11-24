import { sendSuccess, sendError, handleError, parseId } from "../utils/http";
import { normalizeUsername, isValidUsername, isValidPassword, USERNAME_MESSAGE, PASSWORD_MESSAGE } from "../utils/auth";
import {
    RELATIONS, ParentUpdate, fetchAllParent, checkParentExist, fetchParentMe, loginParent, changeParentPassword,
    createParent, updateParent, deleteParent, fetchParentPoints,
} from "../service/parentService";

// parent.name varchar(50)
const readName = (value: any) => typeof value === 'string' ? value.trim() : '';
const isValidName = (value: string) => value.length > 0 && value.length <= 50;
const NAME_MESSAGE = 'Họ tên bắt buộc, tối đa 50 ký tự';
const RELATION_MESSAGE = `relation là một trong: ${RELATIONS.join(', ')}`;

// ---------- /auth/parent (phụ huynh) ----------

// Body: { username, password }
export const postParentLogin = async (req: any, res: any) => {
    try {
        const username = normalizeUsername(req.body?.username);
        const password = req.body?.password;
        if (!username || typeof password !== 'string' || !password) {
            return sendError(res, 400, 'Vui lòng nhập tên đăng nhập và mật khẩu');
        }
        return sendSuccess(res, await loginParent(username, password), 'Đăng nhập thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

export const getParentMe = async (req: any, res: any) => {
    try {
        const parent = await fetchParentMe(req.parent.id);
        if (!parent) return sendError(res, 401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
        return sendSuccess(res, parent);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { oldPassword, newPassword }
export const putParentPassword = async (req: any, res: any) => {
    try {
        const { oldPassword, newPassword } = req.body ?? {};
        const errors: any[] = [];
        if (typeof oldPassword !== 'string' || !oldPassword) errors.push({ field: 'oldPassword', message: 'Mật khẩu cũ bắt buộc' });
        if (!isValidPassword(newPassword)) errors.push({ field: 'newPassword', message: PASSWORD_MESSAGE });
        else if (newPassword === oldPassword) errors.push({ field: 'newPassword', message: 'Mật khẩu mới phải khác mật khẩu cũ' });
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        await changeParentPassword(req.parent.id, oldPassword, newPassword);
        return sendSuccess(res, null, 'Đổi mật khẩu thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

// ---------- /parents (admin) ----------

// Query: ?studentid=&classid=
export const getParents = async (req: any, res: any) => {
    try {
        const filter: { studentid?: number, classid?: number } = {};
        for (const key of ['studentid', 'classid'] as const) {
            if (req.query[key] !== undefined) {
                const value = parseId(req.query[key]);
                if (!value) return sendError(res, 400, `${key} không hợp lệ`);
                filter[key] = value;
            }
        }
        return sendSuccess(res, await fetchAllParent(filter));
    } catch (err) {
        return handleError(res, err);
    }
}

export const getParent = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const parent = await checkParentExist(id);
        if (!parent) return sendError(res, 404, 'Không tìm thấy phụ huynh');
        return sendSuccess(res, parent);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { name, relation, studentid, username?, password? } — username và password đi cùng nhau
export const postParent = async (req: any, res: any) => {
    try {
        const body = req.body ?? {};
        const errors: any[] = [];
        const name = readName(body.name);
        if (!isValidName(name)) errors.push({ field: 'name', message: NAME_MESSAGE });
        if (!RELATIONS.includes(body.relation)) errors.push({ field: 'relation', message: RELATION_MESSAGE });
        const studentid = parseId(body.studentid);
        if (!studentid) errors.push({ field: 'studentid', message: 'studentid không hợp lệ' });

        const hasUsername = body.username !== undefined && body.username !== null;
        const hasPassword = body.password !== undefined && body.password !== null;
        let username: string | null = null;
        if (hasUsername) {
            username = normalizeUsername(body.username);
            if (!isValidUsername(username)) errors.push({ field: 'username', message: USERNAME_MESSAGE });
        }
        if (hasPassword && !isValidPassword(body.password)) errors.push({ field: 'password', message: PASSWORD_MESSAGE });
        if (hasUsername !== hasPassword) {
            errors.push({ field: hasUsername ? 'password' : 'username', message: 'username và password phải gửi cùng nhau' });
        }
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        const parent = await createParent({
            name, relation: body.relation, studentid: studentid!, username, password: hasPassword ? body.password : null,
        });
        return sendSuccess(res, parent, 'Thêm phụ huynh thành công', 201);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { name?, relation?, studentid?, username? (null = xóa tài khoản đăng nhập), password? (đặt lại), active? }
export const putParent = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const body = req.body ?? {};
        const errors: any[] = [];
        const data: ParentUpdate = {};

        if (body.name !== undefined) {
            data.name = readName(body.name);
            if (!isValidName(data.name)) errors.push({ field: 'name', message: NAME_MESSAGE });
        }
        if (body.relation !== undefined) {
            if (!RELATIONS.includes(body.relation)) errors.push({ field: 'relation', message: RELATION_MESSAGE });
            data.relation = body.relation;
        }
        if (body.studentid !== undefined) {
            const studentid = parseId(body.studentid);
            if (!studentid) errors.push({ field: 'studentid', message: 'studentid không hợp lệ' });
            else data.studentid = studentid;
        }
        if (body.username !== undefined) {
            if (body.username === null) data.username = null;
            else {
                data.username = normalizeUsername(body.username);
                if (!isValidUsername(data.username)) errors.push({ field: 'username', message: USERNAME_MESSAGE });
            }
        }
        if (body.password !== undefined) {
            if (!isValidPassword(body.password)) errors.push({ field: 'password', message: PASSWORD_MESSAGE });
            data.password = body.password;
        }
        if (body.active !== undefined) {
            if (typeof body.active !== 'boolean') errors.push({ field: 'active', message: 'active là true hoặc false' });
            data.active = body.active;
        }
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        return sendSuccess(res, await updateParent(id, data), 'Cập nhật phụ huynh thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

export const removeParent = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        return sendSuccess(res, await deleteParent(id), 'Xóa phụ huynh thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

// Query: ?schoolyearid= (không bắt buộc)
export const getParentPoints = async (req: any, res: any) => {
    try {
        let schoolyearid: number | undefined;
        if (req.query.schoolyearid !== undefined) {
            schoolyearid = parseId(req.query.schoolyearid) ?? undefined;
            if (!schoolyearid) return sendError(res, 400, 'schoolyearid không hợp lệ');
        }
        return sendSuccess(res, await fetchParentPoints(req.parent.studentid, schoolyearid));
    } catch (err) {
        return handleError(res, err);
    }
}
