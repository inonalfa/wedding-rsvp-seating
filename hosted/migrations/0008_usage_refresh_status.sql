ALTER TABLE usage_snapshot ADD COLUMN last_attempt_at INTEGER;
ALTER TABLE usage_snapshot ADD COLUMN last_attempt_ok INTEGER NOT NULL DEFAULT 0 CHECK (last_attempt_ok IN (0, 1));
