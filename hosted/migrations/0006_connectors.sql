CREATE TABLE event_connectors (
  event_id TEXT PRIMARY KEY REFERENCES events(event_id) ON DELETE CASCADE,
  token_hash TEXT,
  used_day TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK(used_count BETWEEN 0 AND 24)
);
