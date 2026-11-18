import { hasHeadroom } from "./usage";
import { escapeHtml, page, readForm, redirectTo } from "./http";
import { sessionOwner, type AuthEnv } from "./auth";

const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const encoder = new TextEncoder();
const eventOwned = "SELECT event_id FROM events WHERE event_id=? AND owner_id=? AND purge_at>?";

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
}
export async function connectorSettings(request: Request, env: AuthEnv, owner: string, eventId: string, now: number) {
  const url = new URL(request.url);
  const path = "/events/" + eventId + "/connections";
  const event = await env.HOSTED_DB.prepare(eventOwned).bind(eventId, owner, now).first();
  if (!event) return page("האירוע לא נמצא", "", 404);
  if (request.method === "GET") {
    const enabled = await env.HOSTED_DB.prepare(`SELECT 1 FROM event_connectors WHERE token_hash IS NOT NULL AND event_id=(${eventOwned})`).bind(eventId, owner, now).first();
    return page("חיבורים אופציונליים", `<p>Make ו-Google Sheets יכולים למשוך סיכום ממערכת זו באמצעות החשבון שלכם. השירות לא שולח דבר בשמכם. הפעולה עשויה לצרוך מכסה או לעלות כסף בחשבון שלכם.</p><p>החיבור ${enabled ? "פעיל" : "כבוי"}. מותרות עד 24 משיכות ביום.</p>
      <form method="post"><button name="action" value="enable">${enabled ? "החלפת מפתח" : "הפעלת חיבור"}</button>${enabled ? '<button name="action" value="disable">כיבוי חיבור</button>' : ""}</form><a href="/events/${eventId}">חזרה לאירוע</a>`);
  }
  if (request.method !== "POST" || !env.HOSTED_ORIGIN || url.origin !== env.HOSTED_ORIGIN || request.headers.get("origin") !== url.origin) {
    return page("הבקשה נחסמה", "", 403);
  }
  if (await sessionOwner(request, env, now, 15 * 60_000) !== owner) {
    return page("יש להתחבר מחדש", `<a href="/auth/login">התחברות</a> · <a href="${path}">חזרה לחיבורים</a>`, 403);
  }
  const action = (await readForm(request, 1024))?.get("action");
  if (action === "disable") {
    await env.HOSTED_DB.prepare(`UPDATE event_connectors SET token_hash=NULL WHERE event_id=(${eventOwned})`).bind(eventId, owner, now).run();
    return redirectTo(path);
  }
  if (action !== "enable") return page("פעולה לא תקינה", "", 400);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, "0")).join("");
  const result = await env.HOSTED_DB.prepare(`INSERT INTO event_connectors(event_id,token_hash,used_day)
    SELECT event_id, ?, ? FROM events WHERE event_id=(${eventOwned})
    ON CONFLICT(event_id) DO UPDATE SET token_hash=excluded.token_hash RETURNING event_id`)
    .bind(await tokenHash(token), new Date(now).toISOString().slice(0, 10), eventId, owner, now).first();
  if (!result) return page("האירוע לא נמצא", "", 404);
  const endpoint = env.HOSTED_ORIGIN + "/api/connectors/" + eventId;
  return page("מפתח החיבור", `<p>המפתח מוצג רק עכשיו. הגדירו GET עם הכותרת Authorization בפורמט Bearer והמפתח, ושמרו אותו בסוד. אל תפרסמו את הגיליון או התרחיש.</p><label>כתובת <input dir="ltr" readonly value="${escapeHtml(endpoint)}"></label> <label>מפתח <input dir="ltr" readonly value="${token}"></label> <a href="${path}">חזרה לחיבורים</a>`);
}

export async function connectorSnapshot(request: Request, env: AuthEnv, eventId: string, now = Date.now()) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  const deny = () => Response.json({ error: "Unauthorized" }, { status: 401, headers: privateHeaders });
  if (request.method !== "GET" || !token) return deny();
  const hash = await tokenHash(token);
  if (!await hasHeadroom(env.HOSTED_DB, now)) return Response.json({ error: "Sync paused" }, { status: 503, headers: privateHeaders });
  const date = new Date(now).toISOString().slice(0, 10);
  const scope = "SELECT c.event_id FROM event_connectors c JOIN events e ON e.event_id=c.event_id WHERE c.event_id=? AND c.token_hash=? AND e.purge_at>?";
  const allowed = await env.HOSTED_DB.prepare(`UPDATE event_connectors
    SET used_count=CASE WHEN used_day=? THEN used_count+1 ELSE 1 END, used_day=?
    WHERE event_id=(${scope}) AND (used_day<>? OR used_count<24) RETURNING event_id`)
    .bind(date, date, eventId, hash, now, date).first();
  if (!allowed) {
    const active = await env.HOSTED_DB.prepare(scope).bind(eventId, hash, now).first();
    return active ? Response.json({ error: "Daily sync quota reached" }, { status: 429, headers: privateHeaders }) : deny();
  }
  const rows = await env.HOSTED_DB.prepare(`SELECT g.guest_id,g.name,g.max_guests,r.attendance,r.guest_count,t.table_number
    FROM guests g LEFT JOIN rsvps r ON r.event_id=g.event_id AND r.guest_id=g.guest_id
    LEFT JOIN seating_assignments a ON a.event_id=g.event_id AND a.guest_id=g.guest_id AND r.attendance='yes'
    LEFT JOIN seating_tables t ON t.event_id=a.event_id AND t.table_id=a.table_id
    WHERE g.event_id=(${scope}) ORDER BY g.guest_id LIMIT 300`).bind(eventId, hash, now).all();
  return Response.json({ guests: rows.results }, { headers: privateHeaders });
}
