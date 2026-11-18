CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  provider_subject TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE events (
  event_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES accounts(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
  event_date TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  purge_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX events_one_retained_per_owner ON events(owner_id);
CREATE INDEX events_by_expiry ON events(purge_at, event_id);

CREATE TABLE guests (
  event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  guest_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  max_guests INTEGER NOT NULL CHECK(max_guests BETWEEN 1 AND 20),
  PRIMARY KEY (event_id, guest_id)
);
CREATE TABLE rsvps (
  event_id TEXT NOT NULL,
  guest_id TEXT NOT NULL,
  attendance TEXT NOT NULL CHECK(attendance IN ('yes', 'no')),
  guest_count INTEGER NOT NULL CHECK(
    (attendance = 'no' AND guest_count = 0) OR
    (attendance = 'yes' AND guest_count BETWEEN 1 AND 20)
  ),
  PRIMARY KEY (event_id, guest_id),
  FOREIGN KEY (event_id, guest_id) REFERENCES guests(event_id, guest_id) ON DELETE CASCADE
);
CREATE TABLE seating_tables (
  event_id TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  table_id TEXT NOT NULL,
  table_number INTEGER NOT NULL CHECK(table_number > 0),
  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 50),
  PRIMARY KEY (event_id, table_id),
  UNIQUE (event_id, table_number)
);
CREATE TABLE seating_assignments (
  event_id TEXT NOT NULL,
  guest_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  PRIMARY KEY (event_id, guest_id),
  FOREIGN KEY (event_id, guest_id) REFERENCES guests(event_id, guest_id) ON DELETE CASCADE,
  FOREIGN KEY (event_id, table_id) REFERENCES seating_tables(event_id, table_id) ON DELETE CASCADE
);
CREATE INDEX seating_assignments_by_table ON seating_assignments(event_id, table_id);
