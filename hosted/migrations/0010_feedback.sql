CREATE TABLE feedback (
  feedback_id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  category TEXT CHECK(category IS NULL OR category IN ('bug', 'idea', 'other')),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 2000),
  reply_email TEXT CHECK(reply_email IS NULL OR length(reply_email) <= 120),
  page_url TEXT CHECK(page_url IS NULL OR length(page_url) <= 200),
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK(email_status IN ('pending', 'sent', 'skipped', 'failed')),
  github_status TEXT NOT NULL DEFAULT 'pending' CHECK(github_status IN ('pending', 'created', 'skipped', 'failed')),
  github_issue_number INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX feedback_created_at ON feedback(created_at DESC);
