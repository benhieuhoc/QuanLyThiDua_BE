import 'dotenv/config';

// khai báo express
const express = require('express');
const app = express();
// Parse JSON request body
app.use(express.json());
// Khai báo cors
const cors = require('cors');
// Khai báo router
import router from './router/index';
// khai báo morgan
const morgan = require('morgan');
app.use(morgan('dev'));
// connect 
import pool from './config/db';
// cài đặt cors
const allowedOrigins = [
  '*',
  'https://quan-ly-thi-dua.vercel.app/',
  'http://192.168.1.2:3000',
  'http://localhost:3000', // Local development
];
app.use(
  cors({
    origin: function (origin: any, callback: any) {
      // Cho phép request không có Origin
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    // FE đọc tên file khi tải Excel (/scores/export)
    exposedHeaders: ['Content-Disposition'],
  })
);
pool.connect()
.then(() => console.log(" Đã kết nói với database thành công"))
.catch((err) => console.error(" Lỗi kết nối cới database:", err));

app.use("/", router)
  const port = process.env.PORT || 3001;
  console.log("port:", port)
  app.listen(port, () => {
    console.log(`App đang chạy tại: http://localhost:${port}`);
  });
  