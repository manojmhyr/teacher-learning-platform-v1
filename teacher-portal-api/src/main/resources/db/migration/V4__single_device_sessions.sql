-- One device per account.
--
-- last_seen_at is refreshed by every authenticated request (the UI sends a
-- heartbeat), so a session whose tab was closed goes quiet and stops blocking
-- a new sign-in. A replaced session is kept, marked revoked, so the device
-- that lost it can be told why instead of seeing a bare 401.

ALTER TABLE user_session
    ADD COLUMN IF NOT EXISTS last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS device_id      VARCHAR(64),
    ADD COLUMN IF NOT EXISTS device_label   VARCHAR(120),
    ADD COLUMN IF NOT EXISTS revoked_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(24);

CREATE INDEX IF NOT EXISTS user_session_live_idx ON user_session (user_id, last_seen_at DESC) WHERE revoked_at IS NULL;
