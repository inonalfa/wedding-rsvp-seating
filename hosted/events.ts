import { signStaffLookup } from "./table-search";
import { seatingPage } from "./seating";
import { invitationKey, signInvitation } from "./invites";
import { parseGuestCsv } from "./csv";
import { escapeHtml, page, readForm, redirectTo } from "./http";
import { ownerStore } from "./store";
import type { AuthEnv } from "./auth";

const day = 86_400_000;
const timeZone = "Asia/Jerusalem";

/** 90 full calendar days after the event date, using Jerusalem local midnight. */
export function purgeTime(date: string, now: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== date) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = Date.parse(formatter.format(now) + "T00:00:00Z");
  if (start < today || start > today + 366 * day) return null;
  const nominal = start + 91 * day;
  const offset = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(nominal).find(p => p.type === "timeZoneName")?.value.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!offset) return null;
  return nominal - (offset[1] === "+" ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3])) * 60_000;
}

export async function ownerPage(request: Request, env: AuthEnv, ownerId: string, now = Date.now()) {
  const url = new URL(request.url);
  const store = ownerStore(env.HOSTED_DB, ownerId, now);
  if (request.method === "POST" && url.pathname === "/events") {
    if (!env.HOSTED_ORIGIN || url.origin !== env.HOSTED_ORIGIN || request.headers.get("origin") !== env.HOSTED_ORIGIN) {
      return page("הבקשה נחסמה", "", 403);
    }
    const form = await readForm(request, 2048);
    const title = String(form?.get("title") ?? "").trim();
    const date = String(form?.get("date") ?? "");
    const purgeAt = purgeTime(date, now);
    if (!title || title.length > 100 || !purgeAt) {
      return page("לא ניתן ליצור אירוע", '<p>בחרו שם ותאריך בשנה הקרובה.</p><a href="/">חזרה</a>', 400);
    }
    const id = await store.createEvent(title, date, timeZone, purgeAt);
    if (!id) return page("לא ניתן ליצור אירוע כרגע", '<p>אפשר לשמור אירוע אחד לחשבון, בכפוף למקומות פנויים בשירות.</p><a href="/">חזרה</a>', 409);
    return redirectTo("/events/" + id);
  }

  const importMatch = url.pathname.match(/^\/events\/([0-9a-f-]{36})\/guests$/);
  if (request.method === "POST" && importMatch) {
    if (!env.HOSTED_ORIGIN || url.origin !== env.HOSTED_ORIGIN || request.headers.get("origin") !== env.HOSTED_ORIGIN) {
      return page("הבקשה נחסמה", "", 403);
    }
    const event = store.event(importMatch[1]);
    if (!await event.details()) return page("האירוע לא נמצא", "", 404);
    const form = await readForm(request, 258 * 1024);
    const file = form?.get("guests");
    if (!file || typeof file === "string" || file.size > 256 * 1024) return page("בחרו קובץ CSV בגודל עד 256 קילובייט", "", 400);
    let guests;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      guests = parseGuestCsv(text);
    } catch (error) {
      return page("הייבוא לא הושלם", `<p>${escapeHtml(error instanceof Error ? error.message : "קובץ לא תקין")}</p>`, 400);
    }
    try {
      if (await event.importGuests(guests) !== guests.length) return page("האירוע לא נמצא", "", 404);
    } catch (error) {
      if (String(error).includes("hosted guest quota exceeded")) {
        return page("מכסת המוזמנים התמלאה", "<p>עד 300 הזמנות ו-500 מוזמנים לאירוע.</p>", 409);
      }
      throw error;
    }
    return redirectTo("/events/" + importMatch[1]);
  }

  const seatingMatch = url.pathname.match(/^\/events\/([0-9a-f-]{36})\/seating(\/print)?$/);
  if (seatingMatch) {
    const event = await store.event(seatingMatch[1]).details();
    if (!event) return page("האירוע לא נמצא", "", 404);
    return seatingPage(request, env.HOSTED_DB, env.HOSTED_ORIGIN, ownerId, event.event_id, event.title, !!seatingMatch[2], now);
  }

  if (request.method !== "GET") return page("העמוד לא נמצא", "", 404);
  const staffMatch = url.pathname.match(/^\/events\/([0-9a-f-]{36})\/staff-link$/);
  if (staffMatch) {
    if (!env.HOSTED_ORIGIN || url.origin !== env.HOSTED_ORIGIN || !env.HOSTED_INVITE_SECRET) return page("חיפוש שולחן אינו זמין", "", 503);
    const event = await store.event(staffMatch[1]).details();
    if (!event) return page("האירוע לא נמצא", "", 404);
    const token = await signStaffLookup(env.HOSTED_INVITE_SECRET, event.event_id, now);
    const link = env.HOSTED_ORIGIN + "/find-table/" + token;
    return page("קישור לחיפוש שולחן", `<p>הקישור תקף ל-24 שעות. שתפו אותו רק עם הצוות בכניסה.</p><label>קישור לצוות <input dir="ltr" value="${escapeHtml(link)}" readonly></label> <a href="${escapeHtml(link)}">פתיחת החיפוש</a> <a href="/events/${event.event_id}">חזרה לאירוע</a>`);
  }
  const inviteMatch = url.pathname.match(/^\/events\/([0-9a-f-]{36})\/invites\/([0-9a-f-]{36})$/);
  if (inviteMatch) {
    if (!env.HOSTED_ORIGIN || new URL(request.url).origin !== env.HOSTED_ORIGIN || !env.HOSTED_INVITE_SECRET) {
      return page("הזמנות אינן זמינות כרגע", "", 503);
    }
    const [, eventId, guestId] = inviteMatch;
    const invite = await store.event(eventId).invitation(guestId);
    if (!invite) return page("ההזמנה לא נמצאה", "", 404);
    const token = await signInvitation(await invitationKey(env.HOSTED_INVITE_SECRET), eventId, guestId, invite.invite_version, now);
    const link = env.HOSTED_ORIGIN + "/invite/" + token;
    return page("קישור אישי להזמנה", `<p>אפשר להעתיק את הקישור ולשלוח אותו לאורחים. הוא תקף עד 30 יום, כל עוד האירוע קיים.</p><label>קישור להזמנה <input dir="ltr" value="${escapeHtml(link)}" readonly></label> <a href="${escapeHtml(link)}">פתיחת ההזמנה</a> <a href="https://wa.me/?text=${encodeURIComponent(link)}" rel="noreferrer">שיתוף בוואטסאפ</a> <a href="/events/${eventId}">חזרה לאירוע</a>`);
  }

  const match = url.pathname.match(/^\/events\/([0-9a-f-]{36})$/);
  if (match) {
    const scoped = store.event(match[1]);
    const event = await scoped.details();
    if (!event) return page("האירוע לא נמצא", "", 404);
    const purge = new Intl.DateTimeFormat("he-IL", { timeZone: event.time_zone, dateStyle: "long" }).format(event.purge_at);
    const after = url.searchParams.get("after") ?? "";
    const guests = await scoped.guests(after.length === 36 ? after : "");
    const list = guests.map(guest => `<li>${escapeHtml(guest.name)} (${guest.max_guests}) · ${guest.attendance === "yes" ? `אישרו: ${guest.guest_count}` : guest.attendance === "no" ? "לא מגיעים" : "ממתינים לתשובה"}${env.HOSTED_INVITE_SECRET ? ` <a href="/events/${match[1]}/invites/${encodeURIComponent(guest.guest_id)}">קישור להזמנה</a>` : ""}</li>`).join("");
    const next = guests.length === 100 ? `<a href="?after=${encodeURIComponent(guests[99].guest_id)}">עוד מוזמנים</a>` : "";
    return page(event.title, `<p>תאריך האירוע: <time>${escapeHtml(event.event_date)}</time></p><p>מחיקה מתוכננת: ${escapeHtml(purge)}</p><p><a href="/events/${match[1]}/seating">סידורי הושבה</a>${env.HOSTED_INVITE_SECRET ? ` · <a href="/events/${match[1]}/staff-link">קישור לחיפוש שולחן לצוות</a>` : ""}</p><h2>מוזמנים</h2><ul>${list}</ul>${next}<form method="post" action="/events/${match[1]}/guests" enctype="multipart/form-data"><p>השתמשו בקובץ CSV עם הכותרת <code dir="ltr">name,max_guests</code>.</p><label>קובץ מוזמנים <input type="file" name="guests" accept=".csv,text/csv" required></label> <button>ייבוא מוזמנים</button></form><a href="/">כל האירועים</a>`);
  }
  if (url.pathname !== "/") return page("העמוד לא נמצא", "", 404);
  const events = await store.listEvents();
  return page("האירועים שלי", (events.length
    ? `<ul>${events.map(event => `<li><a href="/events/${escapeHtml(event.event_id)}">${escapeHtml(event.title)}</a></li>`).join("")}</ul>`
    : '<form method="post" action="/events"><label>שם האירוע <input name="title" maxlength="100" required></label> <label>תאריך <input type="date" name="date" required></label><p>האירוע מיועד למחיקה אוטומטית אחרי 90 יום. התאריך מחושב לפי שעון ישראל.</p><button>יצירת אירוע</button></form>')
    + '<form method="post" action="/auth/logout"><button>התנתקות</button></form>');
}
