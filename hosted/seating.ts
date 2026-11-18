import type { D1Database } from "@cloudflare/workers-types";
import { escapeHtml, page, readForm, redirectTo } from "./http";

const uuid = /^[0-9a-f-]{36}$/;
const authorized = "SELECT event_id FROM events WHERE event_id=? AND owner_id=? AND purge_at>?";
type Table = { table_id: string; table_number: number; capacity: number; occupied: number };
type Person = { guest_id: string; name: string; guest_count: number; table_id: string | null; table_number: number | null };

export function seatingStore(db: D1Database, owner: string, eventId: string, now: number) {
  const scope = [eventId, owner, now];
  return {
    async tables() {
      return (await db.prepare(`SELECT t.table_id, t.table_number, t.capacity,
        COALESCE(SUM(CASE WHEN r.attendance='yes' THEN r.guest_count ELSE 0 END),0) AS occupied
        FROM seating_tables t
        LEFT JOIN seating_assignments a ON a.event_id=t.event_id AND a.table_id=t.table_id
        LEFT JOIN rsvps r ON r.event_id=a.event_id AND r.guest_id=a.guest_id
        WHERE t.event_id=(${authorized}) GROUP BY t.table_id ORDER BY t.table_number`).bind(...scope).all<Table>()).results;
    },
    async people(offset = 0, limit = 25) {
      return (await db.prepare(`SELECT g.guest_id, g.name, r.guest_count, a.table_id, t.table_number FROM guests g
        JOIN rsvps r ON r.event_id=g.event_id AND r.guest_id=g.guest_id
        LEFT JOIN seating_assignments a ON a.event_id=g.event_id AND a.guest_id=g.guest_id
        LEFT JOIN seating_tables t ON t.event_id=a.event_id AND t.table_id=a.table_id
        WHERE g.event_id=(${authorized}) AND r.attendance='yes' ORDER BY g.name, g.guest_id LIMIT ? OFFSET ?`).bind(...scope, limit, offset).all<Person>()).results;
    },
    async create(number: number, capacity: number) {
      return !!await db.prepare(`INSERT INTO seating_tables (event_id,table_id,table_number,capacity)
        SELECT event_id, ?, ?, ? FROM events WHERE event_id=(${authorized})
        AND (SELECT COUNT(*) FROM seating_tables WHERE event_id=events.event_id)<60
        ON CONFLICT(event_id,table_number) DO NOTHING RETURNING table_id`)
        .bind(crypto.randomUUID(), number, capacity, ...scope).first();
    },
    async remove(guest: string) {
      return !!await db.prepare(`DELETE FROM seating_assignments WHERE event_id=(${authorized}) AND guest_id=? RETURNING guest_id`)
        .bind(...scope, guest).first();
    },
    async assign(guest: string, table: string) {
      return !!await db.prepare(`INSERT INTO seating_assignments(event_id,guest_id,table_id)
        SELECT t.event_id,r.guest_id,t.table_id FROM seating_tables t JOIN rsvps r ON r.event_id=t.event_id
        WHERE t.event_id=(${authorized}) AND t.table_id=? AND r.guest_id=? AND r.attendance='yes'
          AND r.guest_count + COALESCE((SELECT SUM(other.guest_count) FROM seating_assignments a
            JOIN rsvps other ON other.event_id=a.event_id AND other.guest_id=a.guest_id
            WHERE a.event_id=t.event_id AND a.table_id=t.table_id AND a.guest_id<>r.guest_id AND other.attendance='yes'),0) <= t.capacity
        ON CONFLICT(event_id,guest_id) DO UPDATE SET table_id=excluded.table_id RETURNING guest_id`)
        .bind(...scope, table, guest).first();
    },
  };
}

export async function seatingPage(request: Request, db: D1Database, origin: string | undefined,
  owner: string, eventId: string, title: string, print: boolean, now: number) {
  const path = "/events/" + eventId + "/seating";
  const seating = seatingStore(db, owner, eventId, now);
  if (request.method === "POST" && !print) {
    if (!origin || request.headers.get("origin") !== origin || new URL(request.url).origin !== origin) return page("הבקשה נחסמה", "", 403);
    const form = await readForm(request, 1024);
    let changed = false;
    if (form?.get("action") === "table") {
      const number = Number(form.get("number"));
      const capacity = Number(form.get("capacity"));
      if (!Number.isInteger(number) || number < 1 || number > 999 || !Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
        return page("מספר שולחן או קיבולת לא תקינים", "", 400);
      }
      changed = await seating.create(number, capacity);
    } else if (form?.get("action") === "assign") {
      const guest = String(form.get("guest") ?? "");
      const table = String(form.get("table") ?? "");
      if (!uuid.test(guest) || (table && !uuid.test(table))) return page("בחירה לא תקינה", "", 400);
      changed = table ? await seating.assign(guest, table) : await seating.remove(guest);
    }
    return changed ? redirectTo(path) : page("לא ניתן לשמור את השינוי", `<p>בדקו את קיבולת השולחן ואת פרטי השיבוץ.</p><a href="${path}">חזרה להושבה</a>`, 409);
  }
  if (request.method !== "GET") return page("העמוד לא נמצא", "", 404);
  const index = Number(new URL(request.url).searchParams.get("page"));
  const current = Number.isInteger(index) && index >= 0 && index < 12 ? index : 0;
  const [tables, people] = await Promise.all([seating.tables(), seating.people(print ? 0 : current * 25, print ? 300 : 25)]);
  const pagination = `${current ? `<a href="?page=${current - 1}">הקודם</a> ` : ""}${people.length === 25 && current < 11 ? `<a href="?page=${current + 1}">הבא</a>` : ""}`;
  if (print) {
    return page(title + " - סידור הושבה", '<p>בחרו הדפסה בדפדפן ושמרו כ-PDF.</p>' +
      tables.map(table => `<section><h2>שולחן ${table.table_number}</h2><ul>${people.filter(p => p.table_id === table.table_id)
        .map(p => `<li>${escapeHtml(p.name)} (${p.guest_count})</li>`).join("")}</ul></section>`).join(""));
  }
  return page(title + " - סידור הושבה", `<p>שינויים בתשובות עשויים לשנות את התפוסה. בדקו שולחנות שחורגים מהקיבולת.</p>
    <p><a href="${path}/print">גרסה להדפסה ולשמירה כ-PDF</a> · <a href="/events/${eventId}">חזרה לאירוע</a></p>
    <h2>שולחנות</h2><ul>${tables.map(t => `<li>שולחן ${t.table_number}: ${t.occupied} / ${t.capacity}${t.occupied > t.capacity ? " (חריגה)" : ""}</li>`).join("")}</ul>
    <form method="post"><input type="hidden" name="action" value="table"><label>מספר שולחן <input name="number" type="number" min="1" max="999" required></label>
    <label>מקומות <input name="capacity" type="number" min="1" max="50" value="12" required></label><button>הוספת שולחן</button></form>
    <h2>אורחים שאישרו הגעה</h2><ul>${people.map(p => `<li><form method="post"><input type="hidden" name="action" value="assign"><input type="hidden" name="guest" value="${escapeHtml(p.guest_id)}">
      <label>${escapeHtml(p.name)} (${p.guest_count}) <select name="table"><option value="">ללא שולחן</option>${tables.map(t => `<option value="${escapeHtml(t.table_id)}"${t.table_id === p.table_id ? " selected" : ""}>שולחן ${t.table_number}</option>`).join("")}</select></label><button>שמירת שיבוץ</button></form></li>`).join("")}</ul>${pagination}`);
}
