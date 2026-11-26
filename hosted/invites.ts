import { checkChallenge, limited, widget, type AbuseEnv } from "./abuse";
import type { D1Database } from "@cloudflare/workers-types";
import { escapeHtml, page, readForm, redirectTo } from "./http";
import { sameAllowedOrigin } from "./origins";
import { readDetails } from "./details";
import { hebrewDate, hostsLine, invitationMarkup } from "./public/assets/invitation-view.js";

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
type InviteGuest = { title: string; event_date: string; details: string; name: string; max_guests: number; table_number: number | null;
  table_label: string | null; attendance: "yes" | "no" | null; guest_count: number | null; note: string | null };
const active = `g.event_id = ? AND g.guest_id = ? AND g.invite_version = ? AND e.purge_at > ?`;

async function eventPhotos(db: D1Database, eventId: string) {
  const rows = (await db.prepare("SELECT kind, photo_id FROM event_photos WHERE event_id = ?").bind(eventId)
    .all<{ kind: string; photo_id: string }>()).results;
  return Object.fromEntries(rows.map(row => [row.kind, "/media/" + row.photo_id])) as Record<string, string>;
}

export function invitationPage(model: Parameters<typeof invitationMarkup>[0], origin: string | undefined, status = 200, turnstile = false) {
  const hosts = hostsLine(model.title, model.details);
  const heading = hosts.b ? `${hosts.a} ו${hosts.b} מתחתנים` : model.title;
  const when = hebrewDate(model.date);
  const image = model.photos?.cover && origin ? `<meta property="og:image" content="${escapeHtml(origin + model.photos.cover)}">` : "";
  const head = `<meta name="robots" content="noindex"><meta property="og:title" content="${escapeHtml(heading)}"><meta property="og:description" content="${escapeHtml([when.long, model.details?.venue].filter(Boolean).join(" · "))}">${image}<link rel="stylesheet" href="/assets/invite.css">`;
  const response = page(heading, invitationMarkup(model), status, turnstile, false, { bare: true, bodyClass: "invite-page", head });
  // same-origin, not no-referrer: Chrome sends "Origin: null" on form posts under no-referrer, which the RSVP origin check rejects.
  return response;
}

export async function guestInvitation(request: Request, env: InviteEnv, token: string, now = Date.now(), fetcher: typeof fetch = fetch) {
  const missing = () => page("ההזמנה לא נמצאה או שפג תוקפה", "<p>בקשו מהמארחים קישור חדש.</p>", 404);
  if (!env.HOSTED_INVITE_SECRET) return page("הזמנות אינן זמינות כרגע", "", 503);
  const verified = await checkInvitation(await invitationKey(env.HOSTED_INVITE_SECRET), token, now);
  if (!verified) return missing();
  const scope = [verified.eventId, verified.guestId, verified.version, now];
  if (request.method === "GET") {
    const guest = await env.HOSTED_DB.prepare(`SELECT e.title, e.event_date, e.details, g.name, g.max_guests, t.table_number, t.label AS table_label,
        r.attendance, r.guest_count, r.note
      FROM guests g JOIN events e ON e.event_id = g.event_id
      LEFT JOIN rsvps r ON r.event_id=g.event_id AND r.guest_id=g.guest_id
      LEFT JOIN seating_assignments a ON a.event_id=g.event_id AND a.guest_id=g.guest_id AND r.attendance='yes'
      LEFT JOIN seating_tables t ON t.event_id=a.event_id AND t.table_id=a.table_id
      WHERE ${active}`).bind(...scope).first<InviteGuest>();
    if (!guest) return missing();
    const challenge = widget(env, "rsvp");
    return invitationPage({
      title: guest.title, date: guest.event_date, details: readDetails(guest.details), photos: await eventPhotos(env.HOSTED_DB, verified.eventId),
      guest: { name: guest.name, maxGuests: guest.max_guests, attendance: guest.attendance, count: guest.guest_count, note: guest.note,
        table: guest.table_number ? String(guest.table_number) + (guest.table_label ? ` (${guest.table_label})` : "") : null },
      formAction: "/invite/" + token, challenge, saved: new URL(request.url).searchParams.get("saved") === "1",
      icsHref: "/invite/" + token + "/calendar",
    }, env.HOSTED_ORIGIN, 200, Boolean(challenge));
  }
  if (request.method !== "POST") return missing();
  if (!sameAllowedOrigin(request, env)) return page("הבקשה נחסמה", "", 403);
  const blocked = await limited(env.GUEST_LIMIT, "rsvp:" + verified.eventId + ":" + verified.guestId);
  if (blocked) return blocked;
  const form = await readForm(request, 4096);
  if (!await checkChallenge(env, form, "rsvp", fetcher)) {
    return page("האימות נכשל", `<a href="/invite/${token}">נסו שוב</a>`, 403);
  }
  const answer = form?.get("attendance");
  const count = answer === "no" ? 0 : Number(form?.get("guest_count"));
  const note = String(form?.get("note") ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, 500) || null;
  if ((answer !== "yes" && answer !== "no") || !Number.isInteger(count) || count < (answer === "yes" ? 1 : 0) || count > 20) {
    return page("מספר מוזמנים או תשובה לא תקינים", `<a href="/invite/${token}">חזרה להזמנה</a>`, 400);
  }
  const guest = await env.HOSTED_DB.prepare(`SELECT g.max_guests FROM guests g JOIN events e ON e.event_id = g.event_id
    WHERE ${active}`).bind(...scope).first<{ max_guests: number }>();
  if (!guest) return missing();
  if (count > guest.max_guests) return page("מספר האורחים חורג מההזמנה", `<a href="/invite/${token}">חזרה להזמנה</a>`, 400);
  const save = env.HOSTED_DB.prepare(`INSERT INTO rsvps(event_id, guest_id, attendance, guest_count, note, updated_at, source)
    SELECT g.event_id, g.guest_id, ?, ?, ?, ?, 'guest' FROM guests g JOIN events e ON e.event_id = g.event_id
    WHERE ${active} AND g.max_guests >= ?
    ON CONFLICT(event_id, guest_id) DO UPDATE SET attendance = excluded.attendance, guest_count = excluded.guest_count,
      note = excluded.note, updated_at = excluded.updated_at, source = 'guest'
    WHERE attendance <> excluded.attendance OR guest_count <> excluded.guest_count OR COALESCE(note, '') <> COALESCE(excluded.note, '')
    RETURNING guest_id`).bind(answer, count, note, now, ...scope, count);
  // A guest who is not coming must not keep a seat. The delete repeats the invitation checks.
  const unseat = env.HOSTED_DB.prepare(`DELETE FROM seating_assignments WHERE event_id = ? AND guest_id = ?
    AND EXISTS (SELECT 1 FROM guests g JOIN events e ON e.event_id = g.event_id WHERE ${active})`)
    .bind(verified.eventId, verified.guestId, ...scope);
  const [saved] = await env.HOSTED_DB.batch(answer === "no" ? [save, unseat] : [save]);
  const result = saved.results[0];
  if (!result) {
    const identical = await env.HOSTED_DB.prepare(`SELECT 1 FROM rsvps r JOIN guests g
      ON r.event_id = g.event_id AND r.guest_id = g.guest_id JOIN events e ON e.event_id = g.event_id
      WHERE ${active} AND r.attendance = ? AND r.guest_count = ?`).bind(...scope, answer, count).first();
    if (!identical) return missing();
  }
  return redirectTo("/invite/" + token + "?saved=1#rsvp");
}

/** Calendar file for one invitation; same verification as the invitation itself. */
export async function invitationCalendar(env: InviteEnv, token: string, now = Date.now()) {
  if (!env.HOSTED_INVITE_SECRET) return new Response("Not found", { status: 404 });
  const verified = await checkInvitation(await invitationKey(env.HOSTED_INVITE_SECRET), token, now);
  if (!verified) return new Response("Not found", { status: 404 });
  const row = await env.HOSTED_DB.prepare(`SELECT e.title, e.event_date, e.details FROM guests g JOIN events e ON e.event_id = g.event_id
    WHERE ${active}`).bind(verified.eventId, verified.guestId, verified.version, now).first<{ title: string; event_date: string; details: string }>();
  if (!row) return new Response("Not found", { status: 404 });
  const details = readDetails(row.details);
  const day = row.event_date.replace(/-/g, "");
  const time = (details.receptionTime || "19:30").replace(":", "") + "00";
  const escapeIcs = (value: string) => value.replace(/[\\;,]/g, c => "\\" + c).replace(/\n/g, "\\n");
  const hosts = hostsLine(row.title, details);
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wedding RSVP//Invite//HE", "BEGIN:VEVENT",
    "UID:" + verified.eventId + "@wedding-rsvp", "DTSTAMP:" + new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""),
    `DTSTART;TZID=Asia/Jerusalem:${day}T${time}`, "DURATION:PT5H",
    "SUMMARY:" + escapeIcs(hosts.b ? `החתונה של ${hosts.a} ו${hosts.b}` : row.title),
    "LOCATION:" + escapeIcs([details.venue, details.address].filter(Boolean).join(", ")),
    "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="wedding.ics"', "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
