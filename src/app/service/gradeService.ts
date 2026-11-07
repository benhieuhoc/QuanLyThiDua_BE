import pool from "../../config/db";

export const fetchAllGrade = async () => {
    const query = `
        SELECT * FROM grade
        ORDER BY numgrade
    `;
    const result = await pool.query(query);
    return result.rows;
}

export const checkGradeExist = async (id: number) => {
    const query = `
        SELECT * FROM grade
        WHERE id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
}
