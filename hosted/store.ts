import type { ImportedGuest } from "./csv";
import type { D1Database } from "@cloudflare/workers-types";

type EventRecord = { event_id: string; title: string; event_date: string; time_zone: string; purge_at: number };
type Guest = { guest_id: string; name: string; max_guests: number; attendance: "yes" | "no" | null; guest_count: number | null };

/** Construct only after authentication; the owner ID comes from the verified session. */
export function ownerStore(db: D1Database, ownerId: string, now = Date.now()) {
  const activeEvent = "SELECT event_id FROM events WHERE event_id = ? AND owner_id = ? AND purge_at > ?";
  return {
    async createEvent(title: string, date: string, timeZone: string, purgeAt: number) {
      const id = crypto.randomUUID();
      const result = await db.prepare(`INSERT INTO events(event_id, owner_id, title, event_date, time_zone, purge_at)
        SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM events) < 20
        ON CONFLICT(owner_id) DO NOTHING`).bind(id, ownerId, title, date, timeZone, purgeAt).run();
      return result.meta.changes === 1 ? id : null;
    },
    async listEvents() {
      return (await db.prepare(
        "SELECT event_id, title, event_date, time_zone, purge_at FROM events WHERE owner_id = ? AND purge_at > ?",
      ).bind(ownerId, now).all<EventRecord>()).results;
    },
    event(eventId: string) {
      const scope = [eventId, ownerId, now];
      return {
        details() {
          return db.prepare(
            "SELECT event_id, title, event_date, time_zone, purge_at FROM events WHERE event_id = ? AND owner_id = ? AND purge_at > ?",
          ).bind(...scope).first<EventRecord>();
        },
        async guests(after = "") {
          return (await db.prepare(`SELECT g.guest_id, g.name, g.max_guests, r.attendance, r.guest_count FROM guests g
            LEFT JOIN rsvps r ON g.event_id = r.event_id AND g.guest_id = r.guest_id
            WHERE g.event_id = (${activeEvent}) AND g.guest_id > ? ORDER BY g.guest_id LIMIT 100`)
            .bind(...scope, after).all<Guest>()).results;
        },
        invitation(guestId: string) {
          return db.prepare(`SELECT guest_id, invite_version FROM guests
            WHERE event_id = (${activeEvent}) AND guest_id = ?`)
            .bind(...scope, guestId).first<{ guest_id: string; invite_version: number }>();
        },
        async importGuests(guests: ImportedGuest[]) {
          const statements = [];
          for (let i = 0; i < guests.length; i += 30) {
            const chunk = guests.slice(i, i + 30);
            const rows = chunk.map(() => "(?, ?, ?)").join(", ");
            statements.push(db.prepare(`WITH incoming(guest_id, name, max_guests) AS (VALUES ${rows})
              INSERT INTO guests (event_id, guest_id, name, max_guests)
              SELECT allowed.event_id, incoming.guest_id, incoming.name, incoming.max_guests
              FROM incoming CROSS JOIN (${activeEvent}) AS allowed RETURNING guest_id`)
              .bind(...chunk.flatMap(g => [crypto.randomUUID(), g.name, g.maxGuests]), ...scope));
          }
          const result = await db.batch(statements);
          return result.reduce((count, item) => count + item.results.length, 0);
        },
        async rename(title: string) {
          const result = await db.prepare(
            "UPDATE events SET title = ? WHERE event_id = ? AND owner_id = ? AND purge_at > ?",
          ).bind(title, ...scope).run();
          return result.meta.changes === 1;
        },
        async delete() {
          const result = await db.prepare(
            "DELETE FROM events WHERE event_id = ? AND owner_id = ?",
          ).bind(eventId, ownerId).run();
          return result.meta.changes === 1;
        },
      };
    },
  };
}
