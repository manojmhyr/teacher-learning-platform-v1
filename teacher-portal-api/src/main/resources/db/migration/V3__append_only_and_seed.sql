-- Enforce append-only teaching history in the database, not only in code.
--
-- A bug, a stray script or a future developer cannot quietly rewrite what a
-- teacher recorded. The trigger covers tools that connect as the owner, where
-- table privileges would not apply.

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'teaching_record is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teaching_record_no_update
    BEFORE UPDATE OR DELETE ON teaching_record
    FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER teaching_record_topic_no_update
    BEFORE UPDATE ON teaching_record_topic
    FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- ---------------------------------------------------------------------------
-- Reference data. Edit to match the real school before go-live.
-- ---------------------------------------------------------------------------

INSERT INTO subject (id, name, icon) VALUES
    ('math',    'Mathematics', 'math'),
    ('science', 'Science',     'science');

INSERT INTO class_room (id, name, grade, students, room, schedule) VALUES
    ('5A', 'Class 5A', 5, 32, 'Room 204', 'Mon, Wed, Fri · Period 2'),
    ('6B', 'Class 6B', 6, 29, 'Room 311', 'Tue, Thu · Period 4'),
    ('7A', 'Class 7A', 7, 34, 'Room 118', 'Mon–Fri · Period 6');

INSERT INTO class_subject (class_id, subject_id) VALUES
    ('5A', 'math'), ('5A', 'science'),
    ('6B', 'math'), ('6B', 'science'),
    ('7A', 'math');

-- ---------------------------------------------------------------------------
-- Bootstrap administrator.
--
-- Chicken-and-egg: you cannot create the first admin from the admin console.
-- This row exists so you can sign in once and create real accounts.
--
--   Employee ID : A1001
--   Password    : ChangeMe!2026
--
-- `must_change = true` forces a new password before any other screen loads.
--
-- BEFORE PRODUCTION: delete this INSERT, deploy, then insert your own admin
-- row manually with a hash you generated yourself. A password committed to git
-- is not a password.
-- ---------------------------------------------------------------------------

INSERT INTO app_user (employee_id, full_name, email, title, role, must_change, active)
VALUES ('A1001', 'Portal Administrator', 'admin@lumenacademy.edu', 'Portal Administrator', 'ADMIN', TRUE, TRUE);

INSERT INTO user_credential (user_id, password_hash)
SELECT id, '$2a$12$5ER9ntoOJzEjeOYMy31uROvYSdZz2QRyYBaKpn86AASOahw6NdmSK'
FROM app_user WHERE employee_id = 'A1001';
