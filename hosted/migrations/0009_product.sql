-- Product slice: password accounts, invitation details, photos, richer guests and RSVP notes.
ALTER TABLE accounts ADD COLUMN display_name TEXT;

CREATE TABLE password_credentials (
  username TEXT PRIMARY KEY CHECK(length(username) BETWEEN 3 AND 64),
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL CHECK(length(password_hash) <= 300),
  created_at INTEGER NOT NULL
);

-- Validated JSON written only by hosted/details.ts.
ALTER TABLE events ADD COLUMN details TEXT NOT NULL DEFAULT '{}' CHECK(length(details) <= 6000);

ALTER TABLE guests ADD COLUMN phone TEXT CHECK(phone IS NULL OR length(phone) <= 20);
ALTER TABLE guests ADD COLUMN group_name TEXT CHECK(group_name IS NULL OR length(group_name) <= 40);

ALTER TABLE rsvps ADD COLUMN note TEXT CHECK(note IS NULL OR length(note) <= 500);
ALTER TABLE rsvps ADD COLUMN updated_at INTEGER;
ALTER TABLE rsvps ADD COLUMN source TEXT CHECK(source IS NULL OR source IN ('guest', 'owner'));

ALTER TABLE seating_tables ADD COLUMN label TEXT CHECK(label IS NULL OR length(label) <= 40);

CREATE TABLE event_photos (
  event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('cover', 'couple', 'card')),
  photo_id TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  data BLOB NOT NULL CHECK(length(data) BETWEEN 1 AND 819200),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, kind)
);
