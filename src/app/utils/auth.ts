import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Cost bcrypt theo security.md (>= 10)
const SALT_ROUNDS = 10;

export type AuthPayload = { id: number, role: string };

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
