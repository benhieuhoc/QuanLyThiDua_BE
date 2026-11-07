import { sendSuccess, sendError, handleError, parseId } from "../utils/http";
import {
    ROLES, fetchAllAccount, checkAccountExist, login, changePassword,
    createAccount, updateAccount, deleteAccount, replaceAccountClasses,
} from "../service/accountService";

// account.username varchar(50): chữ, số, dấu . _ -; lưu chữ thường
const USERNAME_RE = /^[a-z0-9._-]{3,50}$/;
const normalizeUsername = (value: any) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const isValidUsername = (value: string) => USERNAME_RE.test(value);

// bcrypt chỉ dùng 72 byte đầu nên giới hạn 72 byte
const isValidPassword = (value: any) => typeof value === 'string' && value.length >= 6 && Buffer.byteLength(value, 'utf8') <= 72;
const PASSWORD_MESSAGE = 'Mật khẩu từ 6 ký tự, tối đa 72 byte';

// ---------- /auth ----------

// Body: { username, password }
export const postLogin = async (req: any, res: any) => {
    try {
        const username = normalizeUsername(req.body?.username);
        const password = req.body?.password;
        // Không nói rõ trường nào sai để không lộ thông tin
        if (!username || typeof password !== 'string' || !password) {
            return sendError(res, 400, 'Vui lòng nhập tên đăng nhập và mật khẩu');
        }
        return sendSuccess(res, await login(username, password), 'Đăng nhập thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

export const getMe = async (req: any, res: any) => {
    try {
        const account = await checkAccountExist(req.user.id);
        if (!account) return sendError(res, 401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');
        return sendSuccess(res, account);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { oldPassword, newPassword }
export const putMyPassword = async (req: any, res: any) => {
    try {
        const { oldPassword, newPassword } = req.body ?? {};
        const errors: any[] = [];
        if (typeof oldPassword !== 'string' || !oldPassword) errors.push({ field: 'oldPassword', message: 'Mật khẩu cũ bắt buộc' });
        if (!isValidPassword(newPassword)) errors.push({ field: 'newPassword', message: PASSWORD_MESSAGE });
        else if (newPassword === oldPassword) errors.push({ field: 'newPassword', message: 'Mật khẩu mới phải khác mật khẩu cũ' });
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        await changePassword(req.user.id, oldPassword, newPassword);
        return sendSuccess(res, null, 'Đổi mật khẩu thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

// ---------- /accounts (admin) ----------

// Query: ?role=admin|user&active=true|false
export const getAccounts = async (req: any, res: any) => {
    try {
        const filter: { role?: string, active?: boolean } = {};
        if (req.query.role !== undefined) {
            if (!ROLES.includes(req.query.role)) return sendError(res, 400, 'role không hợp lệ');
            filter.role = req.query.role;
        }
        if (req.query.active !== undefined) {
            if (req.query.active !== 'true' && req.query.active !== 'false') return sendError(res, 400, 'active là true hoặc false');
            filter.active = req.query.active === 'true';
        }
        return sendSuccess(res, await fetchAllAccount(filter));
    } catch (err) {
        return handleError(res, err);
    }
}

export const getAccount = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const account = await checkAccountExist(id);
        if (!account) return sendError(res, 404, 'Không tìm thấy tài khoản');
        return sendSuccess(res, account);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { username, password, role, teacherid?, studentid? }
export const postAccount = async (req: any, res: any) => {
    try {
        const body = req.body ?? {};
        const username = normalizeUsername(body.username);
        const errors: any[] = [];
        if (!isValidUsername(username)) errors.push({ field: 'username', message: 'Tên đăng nhập 3–50 ký tự: chữ, số, dấu . _ -' });
        if (!isValidPassword(body.password)) errors.push({ field: 'password', message: PASSWORD_MESSAGE });
        if (!ROLES.includes(body.role)) errors.push({ field: 'role', message: `role là một trong: ${ROLES.join(', ')}` });

        let teacherid: number | null = null;
        let studentid: number | null = null;
        if (body.teacherid !== undefined && body.teacherid !== null) {
            teacherid = parseId(body.teacherid);
            if (!teacherid) errors.push({ field: 'teacherid', message: 'teacherid không hợp lệ' });
        }
        if (body.studentid !== undefined && body.studentid !== null) {
            studentid = parseId(body.studentid);
            if (!studentid) errors.push({ field: 'studentid', message: 'studentid không hợp lệ' });
        }
        if (errors.length > 0) return sendError(res, 400, 'Dữ liệu không hợp lệ', errors);

        const account = await createAccount({ username, password: body.password, role: body.role, teacherid, studentid });
        return sendSuccess(res, account, 'Tạo tài khoản thành công', 201);
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { username?, password?, active? } — password = admin đặt lại mật khẩu
export const putAccount = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const body = req.body ?? {};
        const errors: any[] = [];
        const data: { username?: string, password?: string, active?: boolean } = {};

        if (body.role !== undefined || body.teacherid !== undefined || body.studentid !== undefined) {
            errors.push({ field: 'role', message: 'Không đổi được role, teacherid, studentid; hãy xóa và tạo lại tài khoản' });
        }
        if (body.username !== undefined) {
            data.username = normalizeUsername(body.username);
            if (!isValidUsername(data.username)) errors.push({ field: 'username', message: 'Tên đăng nhập 3–50 ký tự: chữ, số, dấu . _ -' });
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

        return sendSuccess(res, await updateAccount(id, req.user.id, data), 'Cập nhật tài khoản thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

export const removeAccount = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        return sendSuccess(res, await deleteAccount(id, req.user.id), 'Xóa tài khoản thành công');
    } catch (err) {
        return handleError(res, err);
    }
}

// Body: { classIds: number[] } — thay toàn bộ lớp cờ đỏ được chấm
export const putAccountClasses = async (req: any, res: any) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, 400, 'id không hợp lệ');
        const raw = req.body?.classIds;
        const classIds = Array.isArray(raw) ? raw.map((cid: any) => parseId(cid) ?? 0) : [];
        if (!Array.isArray(raw) || classIds.some((cid) => !cid)) return sendError(res, 400, 'classIds phải là mảng id lớp');
        if (new Set(classIds).size !== classIds.length) return sendError(res, 400, 'classIds bị trùng');

        return sendSuccess(res, await replaceAccountClasses(id, classIds), 'Cập nhật phân công cờ đỏ thành công');
    } catch (err) {
        return handleError(res, err);
    }
}
