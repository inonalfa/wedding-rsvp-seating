import type { D1Database } from "@cloudflare/workers-types";
import { page, readForm, redirectTo } from "./http";
import { ownerStore } from "./store";
import { sessionOwner, type AuthEnv } from "./auth";

const day = 86_400_000;
const exportQueries = {
  event: "SELECT event_id,title,event_date,time_zone,purge_at FROM events WHERE event_id=(SELECT event_id FROM events WHERE event_id=? AND owner_id=? AND purge_at>?)",
  guests: "SELECT guest_id,name,max_guests FROM guests WHERE event_id=(SELECT event_id FROM events WHERE event_id=? AND owner_id=? AND purge_at>?)",
  rsvps: "SELECT guest_id,attendance,guest_count FROM rsvps WHERE event_id=(SELECT event_id FROM events WHERE event_id=? AND owner_id=? AND purge_at>?)",
  tables: "SELECT table_id,table_number,capacity FROM seating_tables WHERE event_id=(SELECT event_id FROM events WHERE event_id=? AND owner_id=? AND purge_at>?)",
  assignments: "SELECT guest_id,table_id FROM seating_assignments WHERE event_id=(SELECT event_id FROM events WHERE event_id=? AND owner_id=? AND purge_at>?)",
};

export async function purgeExpired(db: D1Database, now: number) {
  return db.batch([
    db.prepare("DELETE FROM events WHERE event_id IN (SELECT event_id FROM events WHERE purge_at<=? ORDER BY purge_at,event_id LIMIT 2)").bind(now),
    db.prepare("DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at<=? ORDER BY expires_at LIMIT 100)").bind(now),
    db.prepare(`DELETE FROM accounts WHERE id IN (SELECT a.id FROM accounts a
      WHERE a.created_at<=? AND NOT EXISTS (SELECT 1 FROM events e WHERE e.owner_id=a.id)
        AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.account_id=a.id) LIMIT 100)`).bind(now - 30 * day),
  ]);
}

export function retentionNotice(eventId: string, purgeAt: number, now: number) {
  const left = purgeAt - now;
  const note = left <= 7 * day ? "<p role=\"alert\">האירוע יימחק בשבוע הקרוב. הורידו עותק לפני המועד.</p>"
    : left <= 30 * day ? "<p role=\"status\">האירוע יימחק ב-30 הימים הקרובים. אפשר להוריד עותק.</p>" : "";
  return note + `<p><a href="/events/${eventId}/reminder">הוספת תזכורת ליומן</a> · <a href="/events/${eventId}/data">ייצוא או מחיקת האירוע</a></p>`;
}

export async function dataPage(request: Request, env: AuthEnv, owner: string, eventId: string, now: number) {
  const event = ownerStore(env.HOSTED_DB, owner, now).event(eventId);
  const details = await event.details();
  if (!details) return page("האירוע לא נמצא", "", 404);
  const path = new URL(request.url).pathname;
  if (path.endsWith("/reminder") && request.method === "GET") {
    const stamp = (time: number) => new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const reminder = stamp(Math.max(now, details.purge_at - 7 * day));
    return new Response(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wedding RSVP//Retention//HE", "BEGIN:VEVENT",
      "UID:" + eventId + "-retention", "DTSTAMP:" + stamp(now), "DTSTART:" + reminder,
      "SUMMARY:ייצוא נתוני אירוע לפני המחיקה", "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT0M", "DESCRIPTION:ייצוא נתוני האירוע", "END:VALARM", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n"),
    { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="event-reminder.ics"', "Cache-Control": "no-store" } });
  }
  if (!path.endsWith("/data")) return page("העמוד לא נמצא", "", 404);
  if (request.method === "GET") {
    return page("ייצוא או מחיקת אירוע", `<p>אפשר לייצא עותק מלא או למחוק את האירוע ואת נתוני המוזמנים. מחיקה מבטלת את הקישורים מיד. עותקי שחזור של Cloudflare עשויים להישמר עד 7 ימים.</p>
      <form method="post"><button name="action" value="export">הורדת נתוני האירוע</button></form>
      <form method="post"><label><input type="checkbox" name="confirm" value="yes" required> אני מבין שהמחיקה בלתי הפיכה במערכת</label> <button name="action" value="delete">מחיקת אירוע</button></form>`);
  }
  if (request.method !== "POST" || !env.HOSTED_ORIGIN || new URL(request.url).origin !== env.HOSTED_ORIGIN ||
      request.headers.get("origin") !== env.HOSTED_ORIGIN) return page("הבקשה נחסמה", "", 403);
  if (await sessionOwner(request, env, now, 15 * 60_000) !== owner) {
    return page("יש להתחבר מחדש", `<p>ייצוא ומחיקה דורשים התחברות ב-15 הדקות האחרונות.</p><a href="/auth/login">התחברות</a> · <a href="${path}">חזרה</a>`, 403);
  }
  const fields = await readForm(request, 1024);
  if (fields?.get("action") === "delete" && fields.get("confirm") === "yes") {
    return await event.delete() ? redirectTo("/") : page("האירוע לא נמצא", "", 404);
  }
  if (fields?.get("action") !== "export") return page("בחרו ייצוא או אשרו מחיקה", "", 400);
  const entries = Object.entries(exportQueries);
  const rows = await env.HOSTED_DB.batch(entries.map(([, query]) => env.HOSTED_DB.prepare(query).bind(eventId, owner, now)));
  if (!rows[0].results.length) return page("האירוע לא נמצא", "", 404);
  return Response.json(Object.fromEntries(entries.map(([key], i) => [key, rows[i].results])), {
    headers: { "Content-Disposition": 'attachment; filename="wedding-event.json"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
