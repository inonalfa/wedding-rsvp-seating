import { checkChallenge, limited, widget, type AbuseEnv } from "./abuse";
import type { D1Database } from "@cloudflare/workers-types";
import { escapeHtml, page, readForm, redirectTo } from "./http";

const id = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const encoder = new TextEncoder();
const prefix = "hosted-invitation/v1";
const ttl = 30 * 86_400;

function bytes(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
function base64(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
export async function invitationKey(secret: string) {
  const material = bytes(secret);
  if (material.byteLength !== 32) throw new Error("Invalid invitation key");
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signInvitation(key: CryptoKey, eventId: string, guestId: string, version: number, now: number) {
  const payload = [eventId, guestId, version, Math.floor(now / 1000) + ttl].join(".");
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(prefix + "." + payload));
  return payload + "." + base64(signature);
}
export async function checkInvitation(key: CryptoKey, token: string, now: number) {
  if (token.length > 160) return null;
  const [eventId, guestId, version, expires, signature, extra] = token.split(".");
  if (extra !== undefined || !id.test(eventId) || !id.test(guestId) || !/^\d{1,9}$/.test(version) ||
      !/^\d{10}$/.test(expires) || Number(expires) * 1000 <= now || !/^[\w-]{43}$/.test(signature)) return null;
  if (!await crypto.subtle.verify("HMAC", key, bytes(signature), encoder.encode([prefix, eventId, guestId, version, expires].join(".")))) return null;
  return { eventId, guestId, version: Number(version) };
}

type InviteEnv = AbuseEnv & { HOSTED_DB: D1Database; HOSTED_ORIGIN?: string; HOSTED_INVITE_SECRET?: string };
type InviteGuest = { title: string; event_date: string; name: string; max_guests: number; table_number: number | null };
const active = `g.event_id = ? AND g.guest_id = ? AND g.invite_version = ? AND e.purge_at > ?`;

export async function guestInvitation(request: Request, env: InviteEnv, token: string, now = Date.now(), fetcher: typeof fetch = fetch) {
  const missing = () => page("ההזמנה לא נמצאה או שפג תוקפה", "", 404);
  if (!env.HOSTED_INVITE_SECRET) return page("הזמנות אינן זמינות כרגע", "", 503);
  const verified = await checkInvitation(await invitationKey(env.HOSTED_INVITE_SECRET), token, now);
  if (!verified) return missing();
  const scope = [verified.eventId, verified.guestId, verified.version, now];
  if (request.method === "GET") {
    const guest = await env.HOSTED_DB.prepare(`SELECT e.title, e.event_date, g.name, g.max_guests, t.table_number
      FROM guests g JOIN events e ON e.event_id = g.event_id
      LEFT JOIN rsvps r ON r.event_id=g.event_id AND r.guest_id=g.guest_id
      LEFT JOIN seating_assignments a ON a.event_id=g.event_id AND a.guest_id=g.guest_id AND r.attendance='yes'
      LEFT JOIN seating_tables t ON t.event_id=a.event_id AND t.table_id=a.table_id
      WHERE ${active}`).bind(...scope).first<InviteGuest>();
    if (!guest) return missing();
    const counts = Array.from({ length: guest.max_guests }, (_, i) => `<option>${i + 1}</option>`).join("");
    const saved = new URL(request.url).searchParams.get("saved") === "1" ? '<p role="status">התשובה נשמרה. אפשר לעדכן אותה כאן.</p>' : "";
    const table = guest.table_number ? `<p>השולחן שלכם: ${guest.table_number}</p>` : "";
    const challenge = widget(env, "rsvp");
    return page(guest.title, `${saved}${table}<p>שלום ${escapeHtml(guest.name)}, מוזמנים לחגוג איתנו ב-${escapeHtml(guest.event_date)}.</p><form method="post" action="/invite/${token}"><label>כמות מגיעים <select name="guest_count">${counts}</select></label>${challenge} <button name="attendance" value="yes">מאשרים הגעה</button> <button name="attendance" value="no">לא מגיעים</button></form>`, 200, Boolean(challenge));
  }
  if (request.method !== "POST") return missing();
  if (!env.HOSTED_ORIGIN || new URL(request.url).origin !== env.HOSTED_ORIGIN ||
      request.headers.get("origin") !== env.HOSTED_ORIGIN) return page("הבקשה נחסמה", "", 403);
  const blocked = await limited(env.GUEST_LIMIT, "rsvp:" + verified.eventId + ":" + verified.guestId);
  if (blocked) return blocked;
  const form = await readForm(request, 4096);
  if (!await checkChallenge(env, form, "rsvp", fetcher)) {
    return page("האימות נכשל", `<a href="/invite/${token}">נסו שוב</a>`, 403);
  }
  const answer = form?.get("attendance");
  const count = answer === "no" ? 0 : Number(form?.get("guest_count"));
  if ((answer !== "yes" && answer !== "no") || !Number.isInteger(count) || count < (answer === "yes" ? 1 : 0) || count > 20) {
    return page("מספר מוזמנים או תשובה לא תקינים", "", 400);
  }
  const guest = await env.HOSTED_DB.prepare(`SELECT g.max_guests FROM guests g JOIN events e ON e.event_id = g.event_id
    WHERE ${active}`).bind(...scope).first<{ max_guests: number }>();
  if (!guest) return missing();
  if (count > guest.max_guests) return page("מספר האורחים חורג מההזמנה", "", 400);
  const result = await env.HOSTED_DB.prepare(`INSERT INTO rsvps(event_id, guest_id, attendance, guest_count)
    SELECT g.event_id, g.guest_id, ?, ? FROM guests g JOIN events e ON e.event_id = g.event_id
    WHERE ${active} AND g.max_guests >= ?
    ON CONFLICT(event_id, guest_id) DO UPDATE SET attendance = excluded.attendance, guest_count = excluded.guest_count
    WHERE attendance <> excluded.attendance OR guest_count <> excluded.guest_count
    RETURNING guest_id`).bind(answer, count, ...scope, count).first();
  if (!result) {
    const identical = await env.HOSTED_DB.prepare(`SELECT 1 FROM rsvps r JOIN guests g
      ON r.event_id = g.event_id AND r.guest_id = g.guest_id JOIN events e ON e.event_id = g.event_id
      WHERE ${active} AND r.attendance = ? AND r.guest_count = ?`).bind(...scope, answer, count).first();
    if (!identical) return missing();
  }
  return redirectTo("/invite/" + token + "?saved=1");
}
