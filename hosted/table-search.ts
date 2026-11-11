import type { D1Database } from "@cloudflare/workers-types";
import { escapeHtml, page, readForm } from "./http";
import { invitationKey } from "./invites";

const encoder = new TextEncoder();
const eventPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function digestInput(event: string, expires: string) {
  return encoder.encode(`hosted-table-lookup/v1:${event}:${expires}`);
}
export async function signStaffLookup(secret: string, event: string, now: number) {
  const expires = String(Math.floor(now / 1000) + 86_400);
  const tag = new Uint8Array(await crypto.subtle.sign("HMAC", await invitationKey(secret), digestInput(event, expires)));
  return [event, expires, Array.from(tag, byte => byte.toString(16).padStart(2, "0")).join("")].join(".");
}

export async function tableSearch(request: Request, env: { HOSTED_DB: D1Database; HOSTED_ORIGIN?: string; HOSTED_INVITE_SECRET?: string }, token: string, now = Date.now()) {
  const missing = () => page("הקישור לא נמצא או שפג תוקפו", "", 404);
  const [eventId, expires, signature, extra] = token.split(".");
  if (!env.HOSTED_INVITE_SECRET || extra !== undefined || !eventPattern.test(eventId) ||
      !/^\d{10}$/.test(expires) || Number(expires) * 1000 <= now || !/^[a-f0-9]{64}$/.test(signature)) return missing();
  const tag = Uint8Array.from(signature.match(/../g)!, pair => parseInt(pair, 16));
  if (!await crypto.subtle.verify("HMAC", await invitationKey(env.HOSTED_INVITE_SECRET), tag, digestInput(eventId, expires))) return missing();
  const event = await env.HOSTED_DB.prepare("SELECT event_id FROM events WHERE event_id=? AND purge_at>?").bind(eventId, now).first();
  if (!event) return missing();
  const searchForm = `<form method="post" action="/find-table/${token}"><label>שם מלא כפי שמופיע בהזמנה <input name="name" maxlength="80" required></label><button>חיפוש</button></form>`;
  if (request.method === "GET") return page("חיפוש שולחן", searchForm);
  if (request.method !== "POST") return missing();
  if (!env.HOSTED_ORIGIN || new URL(request.url).origin !== env.HOSTED_ORIGIN ||
      request.headers.get("origin") !== env.HOSTED_ORIGIN) return page("הבקשה נחסמה", "", 403);
  const body = await readForm(request, 1024);
  const name = String(body?.get("name") ?? "").trim();
  if (!name || name.length > 80) return page("חיפוש שולחן", searchForm + "<p>הזינו שם מלא.</p>", 400);
  const { results } = await env.HOSTED_DB.prepare(`SELECT t.table_number FROM guests g
    JOIN events e ON e.event_id=g.event_id
    LEFT JOIN rsvps r ON r.event_id=g.event_id AND r.guest_id=g.guest_id
    LEFT JOIN seating_assignments a ON a.event_id=g.event_id AND a.guest_id=g.guest_id AND r.attendance='yes'
    LEFT JOIN seating_tables t ON t.event_id=a.event_id AND t.table_id=a.table_id
    WHERE g.event_id=? AND e.purge_at>? AND g.name=? COLLATE NOCASE LIMIT 2`)
    .bind(eventId, now, name).all<{ table_number: number | null }>();
  const result = results.length === 1 && results[0].table_number !== null
    ? `שולחן ${results[0].table_number}`
    : "לא נמצאה התאמה יחידה. בדקו את קישור ההזמנה האישי או פנו למארחים.";
  return page("חיפוש שולחן", searchForm + `<p role="status">${escapeHtml(result)}</p>`);
}
