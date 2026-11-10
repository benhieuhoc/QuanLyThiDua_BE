# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tổng quan

Backend cho ứng dụng quản lý lớp học: API Express 5 + TypeScript trên PostgreSQL (`pg`), quản lý giáo viên, khối, lớp và điểm thi đua theo tuần. Comment và log trong code viết bằng tiếng Việt.

## Quy tắc bắt buộc (`Ai_rules/`)

Trước khi làm bất kỳ thay đổi nào, **phải đọc và tuân theo** các file trong `Ai_rules/`:

1. [Ai_rules/code-map.md](Ai_rules/code-map.md): đọc **đầu tiên** để tìm đúng luồng cần xử lý. **Bắt buộc cập nhật** sau mỗi thay đổi về route/controller/service/middleware/bảng.
2. [Ai_rules/database.md](Ai_rules/database.md): schema lấy từ phần 1 của `cscript/init.sql`; đổi schema thì sửa file này trước.
3. [Ai_rules/backend.md](Ai_rules/backend.md): phân lớp router → controller → service, chuẩn response.
4. [Ai_rules/security.md](Ai_rules/security.md): authentication, authorization, phân cấp quyền.

Khi các file này mâu thuẫn với code hiện tại, làm theo `Ai_rules/` và ghi nhận vào `code-map.md`.

[docs/logic-trien-khai.md](docs/logic-trien-khai.md) là tài liệu nghiệp vụ và hướng dẫn dùng API cho người phát triển; cập nhật khi thay đổi nghiệp vụ hoặc API. Bàn giao cho FE ghi vào mục 9 (hướng dẫn tích hợp FE) và mục 10 (nhật ký thay đổi API) của file này, không tạo file `fe-handoff-*.md` riêng.

## Lệnh

- `npm run dev`: chạy `src/index.ts` bằng `tsx watch` (tự reload). Đây là cách chính để chạy app.
- `npm run build`: chạy `tsc`. Hiện **chưa có `tsconfig.json`**, cần tạo trước khi dùng build.
- `npm start`: chạy `node dist/server.js`, nhưng entry point là `src/index.ts` (khi build sẽ ra `dist/index.js`), nên script này không khớp với kết quả build.
- Chưa có test runner hay linter (`npm test` chỉ là placeholder).

Database chỉ có một file `cscript/init.sql`: phần 1 tạo bảng / view, phần 2 nạp dữ liệu giai đoạn đầu (55 lớp + GVCN, 2493 học sinh, năm học 2026-2027, tài khoản `admin` mật khẩu `1`). Chạy thủ công `psql -U postgres -d QLHS -f cscript/init.sql` (không có công cụ migration); chạy lại được, không xóa dữ liệu, dùng luôn để nâng cấp schema DB cũ.

## Cấu hình

`.env` (load qua `dotenv`) gồm `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME`, `DB_PORT` (mặc định 5432), `PORT` (mặc định 3001), `JWT_SECRET` (bắt buộc, không có giá trị mặc định) và `JWT_EXPIRES_IN` (mặc định `30m`), dùng cho đăng nhập `/auth`.

## Kiến trúc

Luồng: `src/router/<entity>Router.ts` → `src/app/controller/<entity>Controller.ts` → `src/app/service/<entity>Service.ts` → `pool` (`src/config/db.ts`). Chi tiết route và luồng xem [Ai_rules/code-map.md](Ai_rules/code-map.md).

- `src/index.ts`: khởi tạo Express (parse JSON body, morgan, CORS allowlist gồm `http://localhost:3000`), kết nối pool và mount `src/router/index.ts` tại `/`.
- `src/app/utils/http.ts`: `HttpError`, chuẩn response và map lỗi Postgres.
- Middleware auth ở `src/app/middleware/auth.ts` (`authenticate`, `authorize`), hiện chỉ gắn cho `/auth` và `/accounts`. `swagger-jsdoc`/`swagger-ui-express` đã cài nhưng chưa được tích hợp.

### Mô hình dữ liệu (`cscript/init.sql`)

Một trường có nhiều phân hiệu (`branch`, mã 1 chữ cái A/B). `teacher` thuộc một phân hiệu; `class` = (`grade`, `branch`, `seq`) với tối đa một giáo viên chủ nhiệm cùng phân hiệu (có thể null); `student` thuộc một lớp (chỉ là dữ liệu; riêng học sinh cờ đỏ được cấp tài khoản). `account` có 2 role: `admin` (GV quản lý nề nếp) và `user` (GVCN gắn `teacherid` hoặc cờ đỏ gắn `studentid`); `account_class` là các lớp cờ đỏ được phân công chấm; `point.accountid` ghi người nhập. Tên lớp như `6A1` không lưu trong bảng mà tính trong view `class_view`. `school_year` sinh các `week` (mỗi tuần có điểm gốc Nề nếp/Học tập và cờ khóa); `point` là lượt cộng/trừ nhập tự do của một lớp trong một tuần (`type` là `'Nề nếp'` hoặc `'Học tập'`); điểm tuần tính trong view `score_view`. `init.sql` khởi tạo sẵn 4 khối (6–9) và 2 phân hiệu (A, B). Lớp khối 9 được lưu trữ (`class.archivedyearid`) khi lên lớp sang năm học mới; `class_year` giữ tên lớp của năm cũ.

## Lỗi đã biết trong code hiện tại

- `CORS allowedOrigins` trong `src/index.ts` có `'*'`.
