import type { D1Database } from "@cloudflare/workers-types";

type EventRecord = { event_id: string; title: string; event_date: string; time_zone: string; purge_at: number };
type Guest = { guest_id: string; name: string; max_guests: number };

/** Construct only after authentication; the owner ID comes from the verified session. */
export function ownerStore(db: D1Database, ownerId: string, now = Date.now()) {
  const activeEvent = "SELECT event_id FROM events WHERE event_id = ? AND owner_id = ? AND purge_at > ?";
  return {
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
          return (await db.prepare(`SELECT guest_id, name, max_guests FROM guests
            WHERE event_id = (${activeEvent}) AND guest_id > ? ORDER BY guest_id LIMIT 100`)
            .bind(...scope, after).all<Guest>()).results;
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
