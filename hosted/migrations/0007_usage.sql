CREATE TABLE usage_snapshot (
  id INTEGER PRIMARY KEY CHECK(id=1),
  recorded_at INTEGER NOT NULL,
  worker_requests INTEGER NOT NULL,
  d1_reads INTEGER NOT NULL,
  d1_writes INTEGER NOT NULL,
  hosted_bytes INTEGER NOT NULL
);
