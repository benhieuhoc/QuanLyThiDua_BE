-- Dữ liệu mẫu cho môi trường DEV: tài khoản 3 loại người dùng (admin, GVCN, cờ đỏ)
-- Chạy SAU migration.sql. Chạy lại không bị trùng. KHÔNG chạy trên production.
-- Mật khẩu mọi tài khoản mẫu: 1 (hash bcrypt cost 10 qua pgcrypto, tương thích thư viện bcrypt)
--
-- Chạy được trên DB trống lẫn DB đã có dữ liệu:
--   - Giáo viên / lớp / học sinh mẫu chỉ được tạo khi lớp tương ứng CHƯA tồn tại / chưa có học sinh
--   - Tài khoản GVCN gắn với GVCN HIỆN TẠI của lớp (lớp chưa có GVCN thì bỏ qua tài khoản đó)
--   - Tài khoản cờ đỏ gắn với học sinh có id nhỏ nhất của lớp
--
--   username      role   gắn với                         quyền chấm điểm
--   admin         admin  (không gắn giáo viên)           toàn trường
--   gvcn.6a1      user   GVCN hiện tại của 6A1           lớp 6A1
--   gvcn.7a1      user   GVCN hiện tại của 7A1           lớp 7A1
--   gvcn.6b1      user   GVCN hiện tại của 6B1           lớp 6B1
--   codo.duc      user   1 học sinh lớp 7A1              cờ đỏ chấm 6A1, 6A2
--   codo.ha       user   1 học sinh lớp 6A2              cờ đỏ chấm 7A1

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- Lớp mẫu và GVCN mẫu (6A2 chưa có GVCN); chỉ dùng khi lớp chưa tồn tại
CREATE TEMP TABLE seed_class (numgrade int, branchcode char(1), seq int, teachername varchar(25)) ON COMMIT DROP;
INSERT INTO seed_class VALUES
    (6, 'A', 1, 'Nguyễn Văn An'),
    (6, 'A', 2, NULL),
    (7, 'A', 1, 'Lê Thị Bình'),
    (6, 'B', 1, 'Phạm Văn Cường');

INSERT INTO teacher (name, branchid)
SELECT sc.teachername, b.id
FROM seed_class sc
JOIN grade g  ON g.numgrade = sc.numgrade
JOIN branch b ON b.code = sc.branchcode
WHERE sc.teachername IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM class c WHERE c.gradeid = g.id AND c.branchid = b.id AND c.seq = sc.seq)
  AND NOT EXISTS (SELECT 1 FROM teacher t WHERE t.name = sc.teachername AND t.branchid = b.id);

INSERT INTO class (gradeid, branchid, seq, teacherid)
SELECT g.id, b.id, sc.seq, t.id
FROM seed_class sc
JOIN grade g  ON g.numgrade = sc.numgrade
JOIN branch b ON b.code = sc.branchcode
LEFT JOIN teacher t ON t.name = sc.teachername AND t.branchid = b.id
  AND NOT EXISTS (SELECT 1 FROM class c2 WHERE c2.teacherid = t.id)
ON CONFLICT DO NOTHING;

-- Học sinh mẫu cho lớp cờ đỏ, chỉ khi lớp chưa có học sinh nào
INSERT INTO student (code, name, gender, birthdate, classid)
SELECT v.code, v.name, v.gender, v.birthdate::date, cv.id
FROM (VALUES
    ('SEED000001', 'Hoàng Minh Đức', 'Nam', '2013-03-12', '7A1'),
    ('SEED000002', 'Võ Thu Hà', 'Nữ', '2014-09-05', '6A2')
) AS v(code, name, gender, birthdate, classname)
JOIN class_view cv ON cv.name = v.classname
WHERE NOT EXISTS (SELECT 1 FROM student s WHERE s.classid = cv.id)
ON CONFLICT (code) DO NOTHING;

-- Tài khoản admin
INSERT INTO account (username, password, role)
VALUES ('admin', crypt('1', gen_salt('bf', 10)), 'admin')
ON CONFLICT DO NOTHING;

-- Tài khoản GVCN: gắn GVCN hiện tại của lớp (lớp chưa có GVCN thì bỏ qua)
INSERT INTO account (username, password, role, teacherid)
SELECT v.username, crypt('1', gen_salt('bf', 10)), 'user', cv.teacherid
FROM (VALUES ('gvcn.6a1', '6A1'), ('gvcn.7a1', '7A1'), ('gvcn.6b1', '6B1')) AS v(username, classname)
JOIN class_view cv ON cv.name = v.classname AND cv.teacherid IS NOT NULL
ON CONFLICT DO NOTHING;

-- Tài khoản cờ đỏ: học sinh id nhỏ nhất của lớp
INSERT INTO account (username, password, role, studentid)
SELECT v.username, crypt('1', gen_salt('bf', 10)), 'user',
       (SELECT MIN(s.id) FROM student s WHERE s.classid = cv.id)
FROM (VALUES ('codo.duc', '7A1'), ('codo.ha', '6A2')) AS v(username, classname)
JOIN class_view cv ON cv.name = v.classname
WHERE EXISTS (SELECT 1 FROM student s WHERE s.classid = cv.id)
ON CONFLICT DO NOTHING;

-- Phân công cờ đỏ chấm lớp khác lớp của mình
INSERT INTO account_class (accountid, classid)
SELECT a.id, cv.id
FROM (VALUES
    ('codo.duc', '6A1'),
    ('codo.duc', '6A2'),
    ('codo.ha',  '7A1')
) AS v(username, classname)
JOIN account a     ON a.username = v.username
JOIN class_view cv ON cv.name = v.classname
JOIN student s     ON s.id = a.studentid AND s.classid <> cv.id
ON CONFLICT (accountid, classid) DO NOTHING;

COMMIT;
