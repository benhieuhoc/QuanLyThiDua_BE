// Lỗi nghiệp vụ có mã HTTP, service throw để controller trả về đúng status
export class HttpError extends Error {
    status: number;
    errors?: any[];

    constructor(status: number, message: string, errors?: any[]) {
        super(message);
        this.status = status;
        this.errors = errors;
    }
}

export const sendSuccess = (res: any, data: any, message = 'Thành công', status = 200) => {
    return res.status(status).json({ success: true, data, message });
}

export const sendError = (res: any, status: number, message: string, errors?: any[]) => {
    return res.status(status).json({ success: false, message, ...(errors ? { errors } : {}) });
}

// Map lỗi nghiệp vụ và lỗi Postgres sang response, không trả lỗi SQL thô cho client
export const handleError = (res: any, err: any) => {
    if (err instanceof HttpError) {
        return sendError(res, err.status, err.message, err.errors);
    }
    switch (err?.code) {
        case '23505':
            return sendError(res, 409, 'Dữ liệu bị trùng');
        case '23503':
            return sendError(res, 409, 'Dữ liệu tham chiếu không hợp lệ hoặc đang được sử dụng');
        case '23514':
        case '22P02':
            return sendError(res, 400, 'Dữ liệu không hợp lệ');
    }
    console.error(err);
    return sendError(res, 500, 'Lỗi server');
}

// Trả về số nguyên dương hoặc null nếu không hợp lệ
export const parseId = (value: any) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

// Trả về số nguyên trong [min, max] hoặc null nếu không hợp lệ (không nhận chuỗi rỗng/boolean)
export const parseIntInRange = (value: any, min: number, max: number) => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// Trả về chuỗi 'YYYY-MM-DD' nếu là ngày hợp lệ, ngược lại null
export const parseDate = (value: any) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
