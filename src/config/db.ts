import pkg from 'pg';
const { Pool, types } = pkg;
import dotenv from 'dotenv';
dotenv.config();

// Cột date trả về chuỗi 'YYYY-MM-DD' thay vì Date (tránh lệch múi giờ khi serialize)
types.setTypeParser(types.builtins.DATE, (value: string) => value);


const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT?.toString() ? parseInt(process.env.DB_PORT) : 5432,
});

export default pool;