import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Cost bcrypt theo security.md (>= 10)
const SALT_ROUNDS = 10;

export type AuthPayload = { id: number, role: string };

// Role trong token của phụ huynh (bảng parent), khác role 'admin' / 'user' của bảng account.
// id trong token là parent.id hoặc account.id tùy role, nên middleware phải kiểm tra role trước khi tra DB
export const PARENT_ROLE = 'parent';

// username varchar(50): chữ, số, dấu . _ -; lưu chữ thường (dùng cho account và parent)
const USERNAME_RE = /^[a-z0-9._-]{3,50}$/;
export const normalizeUsername = (value: any) => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const isValidUsername = (value: string) => USERNAME_RE.test(value);
export const USERNAME_MESSAGE = 'Tên đăng nhập 3–50 ký tự: chữ, số, dấu . _ -';

// bcrypt chỉ dùng 72 byte đầu nên giới hạn 72 byte
export const isValidPassword = (value: any) => typeof value === 'string' && value.length >= 6 && Buffer.byteLength(value, 'utf8') <= 72;
export const PASSWORD_MESSAGE = 'Mật khẩu từ 6 ký tự, tối đa 72 byte';

export const hashPassword = (password: string) => bcrypt.hash(password, SALT_ROUNDS);

export const comparePassword = (password: string, hash: string) => bcrypt.compare(password, hash);

// Hash giả để so sánh khi không tìm thấy username, giữ thời gian phản hồi như nhau (không lộ tài khoản có tồn tại)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-khong-dung', SALT_ROUNDS);
export const compareDummyPassword = (password: string) => bcrypt.compare(password, DUMMY_HASH);

// Không có secret mặc định: thiếu JWT_SECRET là lỗi cấu hình
const getSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('Thiếu biến môi trường JWT_SECRET');
    return secret;
}

// Payload chỉ chứa { id, role }
export const signToken = (payload: AuthPayload) => {
    return jwt.sign({ id: payload.id, role: payload.role }, getSecret(), {
        expiresIn: (process.env.JWT_EXPIRES_IN || '30m') as any,
    });
}

// Trả về payload hoặc null nếu token sai / hết hạn
export const verifyToken = (token: string): AuthPayload | null => {
    try {
        const decoded: any = jwt.verify(token, getSecret());
        if (!Number.isInteger(decoded?.id) || typeof decoded?.role !== 'string') return null;
        return { id: decoded.id, role: decoded.role };
    } catch (err: any) {
        if (err instanceof jwt.JsonWebTokenError) return null;  // gồm cả TokenExpiredError
        throw err;
    }
}
