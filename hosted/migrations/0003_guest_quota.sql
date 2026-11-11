ALTER TABLE events ADD COLUMN invitation_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN invited_people INTEGER NOT NULL DEFAULT 0;

UPDATE events SET
  invitation_count = (SELECT COUNT(*) FROM guests WHERE guests.event_id = events.event_id),
  invited_people = COALESCE((SELECT SUM(max_guests) FROM guests WHERE guests.event_id = events.event_id), 0);

CREATE TRIGGER guests_enforce_quota BEFORE INSERT ON guests
WHEN EXISTS (
  SELECT 1 FROM events
  WHERE event_id = NEW.event_id
    AND (invitation_count >= 300 OR invited_people + NEW.max_guests > 500)
)
BEGIN
  SELECT RAISE(ABORT, 'hosted guest quota exceeded');
END;

CREATE TRIGGER guests_count_insert AFTER INSERT ON guests
BEGIN
  UPDATE events SET invitation_count = invitation_count + 1, invited_people = invited_people + NEW.max_guests
  WHERE event_id = NEW.event_id;
END;

CREATE TRIGGER guests_count_delete AFTER DELETE ON guests
BEGIN
  UPDATE events SET invitation_count = invitation_count - 1, invited_people = invited_people - OLD.max_guests
  WHERE event_id = OLD.event_id;
END;

CREATE TRIGGER guests_count_update BEFORE UPDATE OF max_guests ON guests
BEGIN
  SELECT RAISE(ABORT, 'hosted guest quota exceeded') WHERE EXISTS (
    SELECT 1 FROM events WHERE event_id = OLD.event_id AND invited_people - OLD.max_guests + NEW.max_guests > 500
  );
  UPDATE events SET invited_people = invited_people - OLD.max_guests + NEW.max_guests
  WHERE event_id = OLD.event_id;
END;

CREATE TRIGGER guests_no_tenant_transfer BEFORE UPDATE OF event_id ON guests
WHEN NEW.event_id <> OLD.event_id
BEGIN
  SELECT RAISE(ABORT, 'cannot move a guest across events');
END;
