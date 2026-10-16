-- ===========================================================================
-- Teacher Portal — schema + dummy data, for running by hand (DBeaver, psql).
--
-- RUN IT AGAINST THE DATABASE THE API USES:  teacherportal  (user tlp_app)
-- Not the default "postgres" database — tables created there are invisible
-- to the app.
--
-- Safe to run more than once: tables use IF NOT EXISTS and every insert is
-- ON CONFLICT DO NOTHING. If the API has already started once, Flyway has
-- created the tables and this script only adds the dummy data.
--
-- In DBeaver: open an SQL editor on `teacherportal`, then Alt+X
-- ("Execute SQL Script") — not Ctrl+Enter, which runs a single statement.
--
-- Sign-in after running:
--   Admin    A1001 / ChangeMe!2026     (forced to change on first sign-in)
--   Teachers T1024, T1098, T1150 / Teacher@2026
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Schema (mirrors Flyway V1–V4)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_user (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   VARCHAR(32)  NOT NULL UNIQUE,
    full_name     VARCHAR(160) NOT NULL,
    email         VARCHAR(255),
    title         VARCHAR(120) NOT NULL DEFAULT 'Teacher',
    role          VARCHAR(16)  NOT NULL DEFAULT 'TEACHER',
    must_change   BOOLEAN      NOT NULL DEFAULT TRUE,
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT app_user_role_chk CHECK (role IN ('TEACHER', 'ADMIN'))
);
CREATE UNIQUE INDEX IF NOT EXISTS app_user_email_key ON app_user (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_credential (
    user_id       UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    password_hash TEXT        NOT NULL,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_session (
    token      VARCHAR(64) PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    issued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS user_session_user_idx ON user_session (user_id);
-- Single-device sign-in (Flyway V4).
ALTER TABLE user_session
    ADD COLUMN IF NOT EXISTS last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS device_id      VARCHAR(64),
    ADD COLUMN IF NOT EXISTS device_label   VARCHAR(120),
    ADD COLUMN IF NOT EXISTS revoked_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(24);
CREATE INDEX IF NOT EXISTS user_session_live_idx ON user_session (user_id, last_seen_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS class_room (
    id            VARCHAR(16) PRIMARY KEY,
    name          VARCHAR(80) NOT NULL,
    grade         SMALLINT    NOT NULL,
    students      INT         NOT NULL DEFAULT 0,
    room          VARCHAR(40),
    schedule      VARCHAR(80),
    academic_year VARCHAR(16) NOT NULL DEFAULT '2026-27'
);

CREATE TABLE IF NOT EXISTS subject (
    id   VARCHAR(32) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    icon VARCHAR(32) NOT NULL DEFAULT 'math'
);

CREATE TABLE IF NOT EXISTS class_subject (
    class_id   VARCHAR(16) NOT NULL REFERENCES class_room(id) ON DELETE CASCADE,
    subject_id VARCHAR(32) NOT NULL REFERENCES subject(id)    ON DELETE CASCADE,
    PRIMARY KEY (class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS teacher_assignment (
    user_id     UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    class_id    VARCHAR(16) NOT NULL REFERENCES class_room(id),
    subject_id  VARCHAR(32) NOT NULL REFERENCES subject(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS lesson (
    id           VARCHAR(96)  PRIMARY KEY,
    class_id     VARCHAR(16)  NOT NULL REFERENCES class_room(id),
    subject_id   VARCHAR(32)  NOT NULL REFERENCES subject(id),
    title        VARCHAR(200) NOT NULL,
    description  TEXT         NOT NULL DEFAULT '',
    chapter      VARCHAR(120) NOT NULL DEFAULT '',
    duration_min SMALLINT     NOT NULL DEFAULT 45,
    difficulty   VARCHAR(16)  NOT NULL DEFAULT 'Beginner',
    content_key  VARCHAR(160) NOT NULL,
    blob_prefix  VARCHAR(200) NOT NULL,
    published    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by   UUID         REFERENCES app_user(id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT lesson_title_unique UNIQUE (class_id, subject_id, title),
    CONSTRAINT lesson_prefix_chk CHECK (blob_prefix ~ '^[a-z0-9][a-z0-9-]*/$')
);
CREATE INDEX IF NOT EXISTS lesson_class_subject_idx ON lesson (class_id, subject_id);

CREATE TABLE IF NOT EXISTS lesson_topic (
    lesson_id VARCHAR(96)  NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
    position  SMALLINT     NOT NULL,
    name      VARCHAR(160) NOT NULL,
    PRIMARY KEY (lesson_id, position)
);

CREATE TABLE IF NOT EXISTS lesson_objective (
    lesson_id VARCHAR(96)  NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
    position  SMALLINT     NOT NULL,
    text      VARCHAR(300) NOT NULL,
    PRIMARY KEY (lesson_id, position)
);

-- APPEND ONLY — enforced by the triggers below.
CREATE TABLE IF NOT EXISTS teaching_record (
    id           UUID        PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES app_user(id),
    lesson_id    VARCHAR(96) NOT NULL REFERENCES lesson(id),
    class_id     VARCHAR(16) NOT NULL REFERENCES class_room(id),
    date_taught  DATE        NOT NULL,
    duration_min SMALLINT    NOT NULL,
    notes        TEXT        NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT teaching_record_duration_chk CHECK (duration_min > 0 AND duration_min <= 240)
);
CREATE INDEX IF NOT EXISTS teaching_record_user_lesson_idx ON teaching_record (user_id, lesson_id);
CREATE INDEX IF NOT EXISTS teaching_record_date_idx ON teaching_record (date_taught DESC);

CREATE TABLE IF NOT EXISTS teaching_record_topic (
    record_id UUID         NOT NULL REFERENCES teaching_record(id) ON DELETE CASCADE,
    topic     VARCHAR(160) NOT NULL,
    PRIMARY KEY (record_id, topic)
);

CREATE TABLE IF NOT EXISTS access_audit (
    id      BIGSERIAL   PRIMARY KEY,
    user_id UUID        REFERENCES app_user(id),
    action  VARCHAR(40) NOT NULL,
    detail  TEXT,
    ip      VARCHAR(64),
    at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_audit_at_idx ON access_audit (at DESC);
CREATE INDEX IF NOT EXISTS access_audit_user_idx ON access_audit (user_id, at DESC);

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'teaching_record is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER teaching_record_no_update
    BEFORE UPDATE OR DELETE ON teaching_record
    FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE OR REPLACE TRIGGER teaching_record_topic_no_update
    BEFORE UPDATE ON teaching_record_topic
    FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ---------------------------------------------------------------------------
-- 2. Reference data and the bootstrap admin (same as Flyway V3)
-- ---------------------------------------------------------------------------

INSERT INTO subject (id, name, icon) VALUES
    ('math',    'Mathematics', 'math'),
    ('science', 'Science',     'science')
ON CONFLICT (id) DO NOTHING;

INSERT INTO class_room (id, name, grade, students, room, schedule) VALUES
    ('5A', 'Class 5A', 5, 32, 'Room 204', 'Mon, Wed, Fri · Period 2'),
    ('6B', 'Class 6B', 6, 29, 'Room 311', 'Tue, Thu · Period 4'),
    ('7A', 'Class 7A', 7, 34, 'Room 118', 'Mon–Fri · Period 6'),
    ('8C', 'Class 8C', 8, 30, 'Room 402', 'Mon, Tue, Thu · Period 3')
ON CONFLICT (id) DO NOTHING;

INSERT INTO class_subject (class_id, subject_id) VALUES
    ('5A', 'math'), ('5A', 'science'),
    ('6B', 'math'), ('6B', 'science'),
    ('7A', 'math'),
    ('8C', 'math'), ('8C', 'science')
ON CONFLICT DO NOTHING;

INSERT INTO app_user (employee_id, full_name, email, title, role, must_change, active)
VALUES ('A1001', 'Portal Administrator', 'admin@lumenacademy.edu', 'Portal Administrator', 'ADMIN', TRUE, TRUE)
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO user_credential (user_id, password_hash)
SELECT id, '$2a$12$5ER9ntoOJzEjeOYMy31uROvYSdZz2QRyYBaKpn86AASOahw6NdmSK'
FROM app_user WHERE employee_id = 'A1001'
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Dummy data
-- ---------------------------------------------------------------------------

-- Teachers. must_change = FALSE so they can sign in straight away.
INSERT INTO app_user (employee_id, full_name, email, title, role, must_change, active) VALUES
    ('T1024', 'Priya Sharma', 'priya.sharma@lumenacademy.edu', 'Mathematics Teacher', 'TEACHER', FALSE, TRUE),
    ('T1098', 'Anita Rao',    'anita.rao@lumenacademy.edu',    'Science Teacher',     'TEACHER', FALSE, TRUE),
    ('T1150', 'Rahul Verma',  'rahul.verma@lumenacademy.edu',  'Senior Teacher',      'TEACHER', FALSE, TRUE)
ON CONFLICT (employee_id) DO NOTHING;

-- Password Teacher@2026, hashed with bcrypt cost 12 — the format the API's
-- BCryptPasswordEncoder reads.
INSERT INTO user_credential (user_id, password_hash)
SELECT id, crypt('Teacher@2026', gen_salt('bf', 12))
FROM app_user WHERE employee_id IN ('T1024', 'T1098', 'T1150')
ON CONFLICT (user_id) DO NOTHING;

-- Who teaches what. This decides which lessons each teacher can see.
INSERT INTO teacher_assignment (user_id, class_id, subject_id)
SELECT u.id, a.class_id, a.subject_id
FROM (VALUES
    ('T1024', '5A', 'math'),
    ('T1024', '6B', 'math'),
    ('T1098', '5A', 'science'),
    ('T1098', '6B', 'science'),
    ('T1150', '7A', 'math'),
    ('T1150', '8C', 'math'),
    ('T1150', '8C', 'science')
) AS a(employee_id, class_id, subject_id)
JOIN app_user u ON u.employee_id = a.employee_id
ON CONFLICT DO NOTHING;

-- Lessons. Ids and folders follow the server's own derivation
-- (<class>-<subject>-<title-slug>, shared folder <subject>-<title-slug>).
INSERT INTO lesson (id, class_id, subject_id, title, description, chapter, duration_min, difficulty, content_key, blob_prefix, published, created_by)
SELECT l.id, l.class_id, l.subject_id, l.title, l.description, l.chapter, l.duration_min, l.difficulty,
       l.content_key, l.content_key || '/', l.published, (SELECT id FROM app_user WHERE employee_id = 'A1001')
FROM (VALUES
    ('5a-math-introduction-to-fractions', '5A', 'math', 'Introduction to Fractions',
     'Understand fractions as parts of a whole using everyday examples.', 'Fractions & Decimals', 45, 'Beginner',
     'math-introduction-to-fractions', TRUE),
    ('6b-math-introduction-to-fractions', '6B', 'math', 'Introduction to Fractions',
     'Understand fractions as parts of a whole using everyday examples.', 'Fractions & Decimals', 45, 'Beginner',
     'math-introduction-to-fractions', TRUE),
    ('5a-math-multiplying-decimals', '5A', 'math', 'Multiplying Decimals',
     'Multiply decimals by whole numbers and by other decimals.', 'Fractions & Decimals', 50, 'Intermediate',
     'math-multiplying-decimals', TRUE),
    ('6b-math-area-and-perimeter', '6B', 'math', 'Area and Perimeter',
     'Find the area and perimeter of rectangles and composite shapes.', 'Geometry', 45, 'Beginner',
     'math-area-and-perimeter', TRUE),
    ('7a-math-working-with-integers', '7A', 'math', 'Working with Integers',
     'Add, subtract and compare positive and negative numbers.', 'Integers', 45, 'Intermediate',
     'math-working-with-integers', TRUE),
    ('8c-math-linear-equations', '8C', 'math', 'Linear Equations',
     'Solve one-variable linear equations and check the solution.', 'Algebra', 55, 'Advanced',
     'math-linear-equations', TRUE),
    ('5a-science-the-water-cycle', '5A', 'science', 'The Water Cycle',
     'Trace how water moves through evaporation, condensation and precipitation.', 'Earth & Environment', 40, 'Beginner',
     'science-the-water-cycle', TRUE),
    ('6b-science-plant-cells', '6B', 'science', 'Plant Cells',
     'Identify the parts of a plant cell and what each one does.', 'Living Things', 45, 'Intermediate',
     'science-plant-cells', TRUE),
    ('8c-science-forces-and-motion', '8C', 'science', 'Forces and Motion',
     'Explore balanced and unbalanced forces and how they change motion.', 'Physics', 50, 'Intermediate',
     'science-forces-and-motion', TRUE),
    ('8c-science-acids-and-bases', '8C', 'science', 'Acids and Bases',
     'Classify substances using indicators. Draft — not yet visible to teachers.', 'Chemistry', 45, 'Advanced',
     'science-acids-and-bases', FALSE)
) AS l(id, class_id, subject_id, title, description, chapter, duration_min, difficulty, content_key, published)
ON CONFLICT (id) DO NOTHING;

-- Coverage checklist per lesson — what teachers tick off when recording.
INSERT INTO lesson_topic (lesson_id, position, name)
SELECT t.lesson_id, t.position, t.name
FROM (VALUES
    ('5a-math-introduction-to-fractions', 1, 'Lesson Plan'),
    ('5a-math-introduction-to-fractions', 2, 'Parts of a whole'),
    ('5a-math-introduction-to-fractions', 3, 'Numerator and denominator'),
    ('5a-math-introduction-to-fractions', 4, 'Practice worksheet'),
    ('6b-math-introduction-to-fractions', 1, 'Lesson Plan'),
    ('6b-math-introduction-to-fractions', 2, 'Parts of a whole'),
    ('6b-math-introduction-to-fractions', 3, 'Numerator and denominator'),
    ('6b-math-introduction-to-fractions', 4, 'Practice worksheet'),
    ('5a-math-multiplying-decimals', 1, 'Lesson Plan'),
    ('5a-math-multiplying-decimals', 2, 'Place value review'),
    ('5a-math-multiplying-decimals', 3, 'Decimal by whole number'),
    ('5a-math-multiplying-decimals', 4, 'Decimal by decimal'),
    ('6b-math-area-and-perimeter', 1, 'Lesson Plan'),
    ('6b-math-area-and-perimeter', 2, 'Perimeter of rectangles'),
    ('6b-math-area-and-perimeter', 3, 'Area of rectangles'),
    ('6b-math-area-and-perimeter', 4, 'Composite shapes'),
    ('7a-math-working-with-integers', 1, 'Lesson Plan'),
    ('7a-math-working-with-integers', 2, 'Number line'),
    ('7a-math-working-with-integers', 3, 'Adding integers'),
    ('7a-math-working-with-integers', 4, 'Subtracting integers'),
    ('8c-math-linear-equations', 1, 'Lesson Plan'),
    ('8c-math-linear-equations', 2, 'Balancing equations'),
    ('8c-math-linear-equations', 3, 'Solving for x'),
    ('8c-math-linear-equations', 4, 'Word problems'),
    ('5a-science-the-water-cycle', 1, 'Lesson Plan'),
    ('5a-science-the-water-cycle', 2, 'Evaporation'),
    ('5a-science-the-water-cycle', 3, 'Condensation'),
    ('5a-science-the-water-cycle', 4, 'Precipitation'),
    ('6b-science-plant-cells', 1, 'Lesson Plan'),
    ('6b-science-plant-cells', 2, 'Cell wall and membrane'),
    ('6b-science-plant-cells', 3, 'Chloroplasts'),
    ('6b-science-plant-cells', 4, 'Microscope activity'),
    ('8c-science-forces-and-motion', 1, 'Lesson Plan'),
    ('8c-science-forces-and-motion', 2, 'Balanced forces'),
    ('8c-science-forces-and-motion', 3, 'Unbalanced forces'),
    ('8c-science-forces-and-motion', 4, 'Friction experiment'),
    ('8c-science-acids-and-bases', 1, 'Lesson Plan'),
    ('8c-science-acids-and-bases', 2, 'Indicators'),
    ('8c-science-acids-and-bases', 3, 'pH scale')
) AS t(lesson_id, position, name)
ON CONFLICT DO NOTHING;

INSERT INTO lesson_objective (lesson_id, position, text)
SELECT o.lesson_id, o.position, o.text
FROM (VALUES
    ('5a-math-introduction-to-fractions', 1, 'Explain what a fraction represents'),
    ('5a-math-introduction-to-fractions', 2, 'Identify the numerator and denominator'),
    ('6b-math-introduction-to-fractions', 1, 'Explain what a fraction represents'),
    ('6b-math-introduction-to-fractions', 2, 'Identify the numerator and denominator'),
    ('5a-math-multiplying-decimals', 1, 'Place the decimal point correctly in a product'),
    ('6b-math-area-and-perimeter', 1, 'Tell the difference between area and perimeter'),
    ('6b-math-area-and-perimeter', 2, 'Calculate both for composite shapes'),
    ('7a-math-working-with-integers', 1, 'Use a number line to add and subtract integers'),
    ('8c-math-linear-equations', 1, 'Solve equations of the form ax + b = c'),
    ('5a-science-the-water-cycle', 1, 'Describe each stage of the water cycle'),
    ('6b-science-plant-cells', 1, 'Label the main parts of a plant cell'),
    ('8c-science-forces-and-motion', 1, 'Predict how a net force changes motion'),
    ('8c-science-acids-and-bases', 1, 'Classify substances as acidic, basic or neutral')
) AS o(lesson_id, position, text)
ON CONFLICT DO NOTHING;

-- Teaching records (append-only). Fixed ids keep the script re-runnable.
INSERT INTO teaching_record (id, user_id, lesson_id, class_id, date_taught, duration_min, notes)
SELECT r.id::uuid, u.id, r.lesson_id, r.class_id, CURRENT_DATE - r.days_ago, r.duration_min, r.notes
FROM (VALUES
    ('a1b2c3d4-0001-4000-8000-000000000001', 'T1024', '5a-math-introduction-to-fractions', '5A', 12, 45, 'Class engaged well with the pizza example.'),
    ('a1b2c3d4-0001-4000-8000-000000000002', 'T1024', '5a-math-introduction-to-fractions', '5A', 10, 40, 'Finished the worksheet in class.'),
    ('a1b2c3d4-0001-4000-8000-000000000003', 'T1024', '6b-math-area-and-perimeter',        '6B',  7, 45, 'Composite shapes need another session.'),
    ('a1b2c3d4-0001-4000-8000-000000000004', 'T1024', '5a-math-multiplying-decimals',      '5A',  3, 50, ''),
    ('a1b2c3d4-0001-4000-8000-000000000005', 'T1098', '5a-science-the-water-cycle',        '5A',  9, 40, 'Used the kettle demonstration for condensation.'),
    ('a1b2c3d4-0001-4000-8000-000000000006', 'T1098', '6b-science-plant-cells',            '6B',  4, 45, 'Microscopes booked for next week.'),
    ('a1b2c3d4-0001-4000-8000-000000000007', 'T1150', '7a-math-working-with-integers',     '7A',  6, 45, ''),
    ('a1b2c3d4-0001-4000-8000-000000000008', 'T1150', '8c-math-linear-equations',          '8C',  2, 55, 'Word problems set as homework.')
) AS r(id, employee_id, lesson_id, class_id, days_ago, duration_min, notes)
JOIN app_user u ON u.employee_id = r.employee_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO teaching_record_topic (record_id, topic)
SELECT t.record_id::uuid, t.topic
FROM (VALUES
    ('a1b2c3d4-0001-4000-8000-000000000001', 'Lesson Plan'),
    ('a1b2c3d4-0001-4000-8000-000000000001', 'Parts of a whole'),
    ('a1b2c3d4-0001-4000-8000-000000000002', 'Numerator and denominator'),
    ('a1b2c3d4-0001-4000-8000-000000000002', 'Practice worksheet'),
    ('a1b2c3d4-0001-4000-8000-000000000003', 'Lesson Plan'),
    ('a1b2c3d4-0001-4000-8000-000000000003', 'Perimeter of rectangles'),
    ('a1b2c3d4-0001-4000-8000-000000000003', 'Area of rectangles'),
    ('a1b2c3d4-0001-4000-8000-000000000004', 'Lesson Plan'),
    ('a1b2c3d4-0001-4000-8000-000000000004', 'Place value review'),
    ('a1b2c3d4-0001-4000-8000-000000000005', 'Lesson Plan'),
    ('a1b2c3d4-0001-4000-8000-000000000005', 'Evaporation'),
    ('a1b2c3d4-0001-4000-8000-000000000005', 'Condensation'),
    ('a1b2c3d4-0001-4000-8000-000000000005', 'Precipitation'),
    ('a1b2c3d4-0001-4000-8000-000000000006', 'Lesson Plan'),
    ('a1b2c3d4-0001-4000-8000-000000000006', 'Cell wall and membrane'),
    ('a1b2c3d4-0001-4000-8000-000000000007', 'Number line'),
    ('a1b2c3d4-0001-4000-8000-000000000007', 'Adding integers'),
    ('a1b2c3d4-0001-4000-8000-000000000008', 'Lesson Plan'),
    ('a1b2c3d4-0001-4000-8000-000000000008', 'Balancing equations'),
    ('a1b2c3d4-0001-4000-8000-000000000008', 'Solving for x')
) AS t(record_id, topic)
WHERE EXISTS (SELECT 1 FROM teaching_record r WHERE r.id = t.record_id::uuid)
ON CONFLICT DO NOTHING;

-- A little audit history so the admin's audit log is not empty.
-- Only added once: skipped if these seed entries are already there.
INSERT INTO access_audit (user_id, action, detail, ip, at)
SELECT u.id, a.action, a.detail, '127.0.0.1', now() - a.ago
FROM (VALUES
    ('A1001', 'USER_CREATED',        'T1024 (TEACHER) [seed]',            interval '14 days'),
    ('A1001', 'USER_CREATED',        'T1098 (TEACHER) [seed]',            interval '14 days'),
    ('A1001', 'USER_CREATED',        'T1150 (TEACHER) [seed]',            interval '14 days'),
    ('A1001', 'ASSIGNMENTS_UPDATED', 'Initial assignments [seed]',        interval '13 days'),
    ('A1001', 'LESSON_PUBLISHED',    '5a-math-introduction-to-fractions [seed]', interval '13 days'),
    ('T1024', 'LOGIN',               'Signed in [seed]',                  interval '12 days'),
    ('T1024', 'RECORD_SAVED',        '5a-math-introduction-to-fractions — Lesson Plan, Parts of a whole [seed]', interval '12 days'),
    ('T1098', 'LOGIN',               'Signed in [seed]',                  interval '9 days'),
    ('T1098', 'RECORD_SAVED',        '5a-science-the-water-cycle — Evaporation, Condensation [seed]', interval '9 days'),
    ('T1150', 'LOGIN',               'Signed in [seed]',                  interval '2 days')
) AS a(employee_id, action, detail, ago)
JOIN app_user u ON u.employee_id = a.employee_id
WHERE NOT EXISTS (SELECT 1 FROM access_audit WHERE detail LIKE '%[seed]');

-- ---------------------------------------------------------------------------
-- 4. Check — one row per table with its count.
-- ---------------------------------------------------------------------------
SELECT 'app_user' AS table_name, count(*) FROM app_user
UNION ALL SELECT 'user_credential',       count(*) FROM user_credential
UNION ALL SELECT 'class_room',            count(*) FROM class_room
UNION ALL SELECT 'subject',               count(*) FROM subject
UNION ALL SELECT 'class_subject',         count(*) FROM class_subject
UNION ALL SELECT 'teacher_assignment',    count(*) FROM teacher_assignment
UNION ALL SELECT 'lesson',                count(*) FROM lesson
UNION ALL SELECT 'lesson_topic',          count(*) FROM lesson_topic
UNION ALL SELECT 'lesson_objective',      count(*) FROM lesson_objective
UNION ALL SELECT 'teaching_record',       count(*) FROM teaching_record
UNION ALL SELECT 'teaching_record_topic', count(*) FROM teaching_record_topic
UNION ALL SELECT 'access_audit',          count(*) FROM access_audit;
