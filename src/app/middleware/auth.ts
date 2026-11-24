import { sendError, handleError } from "../utils/http";
import { verifyToken, PARENT_ROLE } from "../utils/auth";
import { fetchAuthAccount, ROLES } from "../service/accountService";
import { fetchAuthParent } from "../service/parentService";

// Đọc token phụ huynh (role 'parent'), gắn req.parent = { id, studentid } — tra lại từ DB mỗi request
// Chỉ dùng cho route của phụ huynh (/auth/parent/me, /auth/parent/password); token phụ huynh bị authenticate từ chối
// 401: thiếu token, token sai / hết hạn / không phải token phụ huynh, phụ huynh bị khóa / xóa / không còn tài khoản
export const authenticateParent = async (req: any, res: any, next: any) => {
    try {
        const header = req.headers?.authorization;
        const match = typeof header === 'string' ? header.match(/^Bearer\s+(\S+)$/i) : null;
        if (!match) return sendError(res, 401, 'Chưa đăng nhập');

        const payload = verifyToken(match[1]);
        if (!payload || payload.role !== PARENT_ROLE) return sendError(res, 401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');

        const parent = await fetchAuthParent(payload.id);
        if (!parent || !parent.active || !parent.username) return sendError(res, 401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');

        req.parent = { id: parent.id, studentid: parent.studentid };
        return next();
    } catch (err) {
        return handleError(res, err);
    }
}

// Đọc header Authorization: Bearer <token>, verify và gắn req.user
// req.user = { id, role, kind, teacherid, studentid, studentclassid } — tra lại từ DB mỗi request
// để tài khoản bị khóa / xóa / đổi thông tin có hiệu lực ngay, không chờ token hết hạn
// 401: thiếu token, token sai / hết hạn, tài khoản không còn hoặc bị khóa
export const authenticate = async (req: any, res: any, next: any) => {
    try {
        const header = req.headers?.authorization;
        const match = typeof header === 'string' ? header.match(/^Bearer\s+(\S+)$/i) : null;
        if (!match) return sendError(res, 401, 'Chưa đăng nhập');

        const payload = verifyToken(match[1]);
        // Token phụ huynh có id là parent.id, không được tra như account.id (trùng số sẽ thành tài khoản khác)
        if (!payload || !ROLES.includes(payload.role)) return sendError(res, 401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');

        const account = await fetchAuthAccount(payload.id);
        if (!account || !account.active) return sendError(res, 401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn');

        // role lấy từ DB, không tin role trong token nếu admin đã đổi
        req.user = {
            id: account.id,
            role: account.role,
            kind: account.kind,           // 'admin' | 'gvcn' | 'codo'
            teacherid: account.teacherid,
            studentid: account.studentid,
            studentclassid: account.studentclassid,
        };
        return next();
    } catch (err) {
        return handleError(res, err);
    }
}

// Dùng sau authenticate. authorize('admin') = chỉ admin; authorize('admin', 'user') = mọi tài khoản
// 403: không đủ quyền
export const authorize = (...roles: string[]) => (req: any, res: any, next: any) => {
    if (!req.user) return sendError(res, 401, 'Chưa đăng nhập');
    if (!roles.includes(req.user.role)) return sendError(res, 403, 'Không có quyền thực hiện');
    return next();
}
