-- Core identity and reference data.
--
-- Accounts are created by an administrator; there is no self-registration.
-- Credentials live in their own table so a profile can be read without ever
-- loading a password hash.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_user (
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

CREATE UNIQUE INDEX app_user_email_key ON app_user (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE user_credential (
    user_id       UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    password_hash TEXT        NOT NULL,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opaque server-side sessions. Deleting a row revokes access immediately,
-- which is what makes deactivating a teacher take effect at once.
CREATE TABLE user_session (
    token      VARCHAR(64) PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    issued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX user_session_user_idx ON user_session (user_id);

CREATE TABLE class_room (
    id            VARCHAR(16) PRIMARY KEY,
    name          VARCHAR(80) NOT NULL,
    grade         SMALLINT    NOT NULL,
    students      INT         NOT NULL DEFAULT 0,
    room          VARCHAR(40),
    schedule      VARCHAR(80),
    academic_year VARCHAR(16) NOT NULL DEFAULT '2026-27'
);

CREATE TABLE subject (
    id   VARCHAR(32) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    icon VARCHAR(32) NOT NULL DEFAULT 'math'
);

CREATE TABLE class_subject (
    class_id   VARCHAR(16) NOT NULL REFERENCES class_room(id) ON DELETE CASCADE,
    subject_id VARCHAR(32) NOT NULL REFERENCES subject(id)    ON DELETE CASCADE,
    PRIMARY KEY (class_id, subject_id)
);

-- The three-way link that decides what a teacher can see.
CREATE TABLE teacher_assignment (
    user_id     UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    class_id    VARCHAR(16) NOT NULL REFERENCES class_room(id),
    subject_id  VARCHAR(32) NOT NULL REFERENCES subject(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, class_id, subject_id)
);
