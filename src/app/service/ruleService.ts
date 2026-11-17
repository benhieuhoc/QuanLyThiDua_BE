import pool from "../../config/db";
import { HttpError } from "../utils/http";

// Mục quy chế thi đua, kèm uses = số lượt chấm đang gắn mục này (ruleid)
const selectRule = `
    SELECT r.*, (SELECT COUNT(*) FROM point p WHERE p.ruleid = r.id)::int AS uses
    FROM rule r
`;

// Lọc theo phần (type) và trạng thái áp dụng (active); sắp Nề nếp trước, điểm trừ nặng trước
export const fetchAllRule = async (filter: { type?: string, active?: boolean } = {}) => {
    const query = `
        ${selectRule}
        WHERE ($1::text IS NULL OR r.type = $1)
          AND ($2::boolean IS NULL OR r.active = $2)
        ORDER BY r.type DESC, r.value, r.content
    `;
    const result = await pool.query(query, [filter.type ?? null, filter.active ?? null]);
    return result.rows;
}

export const checkRuleExist = async (id: number) => {
    const query = `
        ${selectRule}
        WHERE r.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}

// Trùng (type, content) → lỗi 23505, handleError trả 409
export const createRule = async (type: string, content: string, value: number, active = true) => {
    const result = await pool.query(`
        INSERT INTO rule (type, content, value, active)
        VALUES ($1, $2, $3, $4)
        RETURNING id;
    `, [type, content, value, active]);
    return checkRuleExist(result.rows[0].id);
}

// Chỉ đổi mục quy chế; các lượt chấm đã gắn giữ nguyên type/content/value đã chép lúc chấm
export const updateRule = async (id: number, data: { type?: string, content?: string, value?: number, active?: boolean }) => {
    const rule = await checkRuleExist(id);
    if (!rule) throw new HttpError(404, 'Không tìm thấy mục quy chế');

    await pool.query(`
        UPDATE rule
        SET type = $2, content = $3, value = $4, active = $5, updated_at = NOW()
        WHERE id = $1
    `, [id, data.type ?? rule.type, data.content ?? rule.content, data.value ?? rule.value, data.active ?? rule.active]);
    return checkRuleExist(id);
}

// Mục đã có lượt chấm dùng thì không xóa (giữ liên kết lịch sử), gợi ý ngừng áp dụng
export const deleteRule = async (id: number) => {
    const rule = await checkRuleExist(id);
    if (!rule) throw new HttpError(404, 'Không tìm thấy mục quy chế');
    if (rule.uses > 0) {
        throw new HttpError(409, `Mục quy chế đã dùng trong ${rule.uses} lượt chấm, không thể xóa. Hãy chuyển sang ngừng áp dụng (active = false)`);
    }

    await pool.query(`DELETE FROM rule WHERE id = $1`, [id]);
    return rule;
}
