-- Lessons, the coverage checklist, and the append-only teaching history.

CREATE TABLE lesson (
    id           VARCHAR(96)  PRIMARY KEY,
    class_id     VARCHAR(16)  NOT NULL REFERENCES class_room(id),
    subject_id   VARCHAR(32)  NOT NULL REFERENCES subject(id),
    title        VARCHAR(200) NOT NULL,
    description  TEXT         NOT NULL DEFAULT '',
    chapter      VARCHAR(120) NOT NULL DEFAULT '',
    duration_min SMALLINT     NOT NULL DEFAULT 45,
    difficulty   VARCHAR(16)  NOT NULL DEFAULT 'Beginner',
    -- Folder in blob storage. Derived by the server from the title; never
    -- supplied by the client. Constrained so it cannot escape the container.
    content_key  VARCHAR(160) NOT NULL,
    blob_prefix  VARCHAR(200) NOT NULL,
    published    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_by   UUID         REFERENCES app_user(id),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT lesson_title_unique UNIQUE (class_id, subject_id, title),
    CONSTRAINT lesson_prefix_chk CHECK (blob_prefix ~ '^[a-z0-9][a-z0-9-]*/$')
);
CREATE INDEX lesson_class_subject_idx ON lesson (class_id, subject_id);

CREATE TABLE lesson_topic (
    lesson_id VARCHAR(96)  NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
    position  SMALLINT     NOT NULL,
    name      VARCHAR(160) NOT NULL,
    PRIMARY KEY (lesson_id, position)
);

CREATE TABLE lesson_objective (
    lesson_id VARCHAR(96) NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
    position  SMALLINT    NOT NULL,
    text      VARCHAR(300) NOT NULL,
    PRIMARY KEY (lesson_id, position)
);

-- APPEND ONLY. Never updated, never deleted — see V3 for the enforcement.
CREATE TABLE teaching_record (
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
CREATE INDEX teaching_record_user_lesson_idx ON teaching_record (user_id, lesson_id);
CREATE INDEX teaching_record_date_idx ON teaching_record (date_taught DESC);

CREATE TABLE teaching_record_topic (
    record_id UUID         NOT NULL REFERENCES teaching_record(id) ON DELETE CASCADE,
    topic     VARCHAR(160) NOT NULL,
    PRIMARY KEY (record_id, topic)
);

-- Who saw what, when. The record a security review asks for.
CREATE TABLE access_audit (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    UUID        REFERENCES app_user(id),
    action     VARCHAR(40) NOT NULL,
    detail     TEXT,
    ip         VARCHAR(64),
    at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX access_audit_at_idx ON access_audit (at DESC);
CREATE INDEX access_audit_user_idx ON access_audit (user_id, at DESC);
