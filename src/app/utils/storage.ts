import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

// Kho file của tài liệu (bảng file): thư mục public/files ở gốc source, mỗi file lưu theo storagekey (uuid, không đuôi)
// Không mount express.static cho thư mục này: tải file phải qua GET /files/:id/download (có đăng nhập)
// __dirname = src/app/utils (tsx) hoặc dist/app/utils (build), đều lùi 3 cấp về gốc source
export const STORAGE_DIR = path.resolve(__dirname, '../../../public/files');
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const newStorageKey = () => randomUUID();

// Đường dẫn tuyệt đối của file trong kho; chỉ nhận storagekey dạng uuid để không thoát ra ngoài STORAGE_DIR
export const storagePath = (key: string) => {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error(`storagekey không hợp lệ: ${key}`);
    return path.join(STORAGE_DIR, key);
}

// Tên thư mục / file (cột name ≤ 255, CHECK folder_name_check / file_name_check): bỏ khoảng trắng 2 đầu,
// không rỗng, không chứa / \ hay ký tự điều khiển. Trả null nếu không hợp lệ
export const NAME_RULE_MESSAGE = 'Tên bắt buộc, tối đa 255 ký tự, không chứa / \\ hoặc ký tự điều khiển';
export const parseItemName = (value: any) => {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    if (!name || name.length > 255 || /[\/\\\u0000-\u001f\u007f]/.test(name)) return null;
    return name;
}

// Tên file gốc từ multipart: busboy đọc filename="..." theo latin1, trình duyệt gửi byte UTF-8 → đổi lại UTF-8
// Tên đã có ký tự ngoài latin1 (gửi qua filename*=UTF-8'') thì giữ nguyên
export const decodeOriginalName = (value: string) => {
    if (/[^\u0000-ÿ]/.test(value)) return value;
    const decoded = Buffer.from(value, 'latin1').toString('utf8');
    return decoded.includes('�') ? value : decoded;
}

// Xóa file vật lý; file đã mất thì bỏ qua, lỗi khác chỉ log (dòng trong DB đã xóa, không trả lỗi cho client)
export const removeStoredFiles = async (keys: string[]) => {
    await Promise.all(keys.map(async (key) => {
        try {
            await fs.promises.unlink(storagePath(key));
        } catch (err: any) {
            if (err?.code !== 'ENOENT') console.error('Không xóa được file trong kho:', key, err);
        }
    }));
}
