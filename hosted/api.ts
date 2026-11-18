import type { D1Database } from "@cloudflare/workers-types";
import type { AuthEnv } from "./auth";
import { DetailsError, normalizePhone, parseDetails, readDetails, validTitle, type EventDetails } from "./details";
import { purgeTime } from "./events";
import { json } from "./http";
import { invitationKey, signInvitation } from "./invites";
import { maxPhotoBytes, photoStore, readLimitedBody, sniffImage, type PhotoKind } from "./media";
import { seatingStore } from "./seating";
import { signStaffLookup } from "./table-search";
import { hasHeadroom } from "./usage";

const timeZone = "Asia/Jerusalem";
const uuid = /^[0-9a-f-]{36}$/;
const control = /[\u0000-\u001f\u007f]/;
const active = "SELECT event_id FROM events WHERE owner_id = ? AND purge_at > ?";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const fail = (status: number, message: string): never => { throw new ApiError(status, message); };

export type GuestInput = { name: string; maxGuests: number; phone: string | null; group: string | null };

export function parseGuest(input: unknown, partial = false): Partial<GuestInput> {
  if (!input || typeof input !== "object") fail(400, "נתוני מוזמן לא תקינים");
  const source = input as Record<string, unknown>;
  const result: Partial<GuestInput> = {};
  if (!partial || "name" in source) {
    const name = typeof source.name === "string" ? source.name.trim() : "";
    if (!name || name.length > 80 || control.test(name)) fail(400, "שם מוזמן חסר או ארוך מדי");
    result.name = name;
  }
  if (!partial || "maxGuests" in source) {
    const count = Number(source.maxGuests);
    if (!Number.isInteger(count) || count < 1 || count > 20) fail(400, "מספר מוזמנים בהזמנה: 1 עד 20");
    result.maxGuests = count;
  }
  if (!partial || "phone" in source) {
    try { result.phone = normalizePhone(source.phone ?? "") || null; } catch { fail(400, "מספר טלפון לא תקין"); }
  }
  if (!partial || "group" in source) {
    const group = typeof source.group === "string" ? source.group.trim() : "";
    if (group.length > 40 || control.test(group)) fail(400, "שם קבוצה ארוך מדי");
    result.group = group || null;
  }
  return result;
}

async function body(request: Request, limit = 64 * 1024): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) fail(415, "נדרש JSON");
  const bytes = await readLimitedBody(request, limit);
  if (!bytes) fail(413, "הבקשה גדולה מדי");
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes!));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("shape");
    return value;
  } catch {
    return fail(400, "JSON לא תקין");
  }
}

type EventRow = { event_id: string; title: string; event_date: string; purge_at: number; details: string; invitation_count: number; invited_people: number };

function appStore(db: D1Database, owner: string, now: number) {
  return {
    async account() {
      return db.prepare(`SELECT a.display_name, a.provider_subject, c.username FROM accounts a
        LEFT JOIN password_credentials c ON c.account_id = a.id WHERE a.id = ?`).bind(owner)
        .first<{ display_name: string | null; provider_subject: string; username: string | null }>();
    },
    event() {
      return db.prepare(`SELECT event_id, title, event_date, purge_at, details, invitation_count, invited_people
        FROM events WHERE owner_id = ? AND purge_at > ?`).bind(owner, now).first<EventRow>();
    },
  };
}

async function requireEvent(db: D1Database, owner: string, now: number) {
  return await appStore(db, owner, now).event() ?? fail(404, "עדיין לא נוצר אירוע");
}

async function state(env: AuthEnv, owner: string, now: number) {
  const store = appStore(env.HOSTED_DB, owner, now);
  const [account, event] = await Promise.all([store.account(), store.event()]);
  const me = {
    name: account?.display_name ?? null,
    username: account?.username ?? null,
    method: account?.username ? "password" : "google",
  };
  if (!event) return { account: me, event: null };
  const scope = [owner, now];
  const [guests, tables, photos] = await env.HOSTED_DB.batch([
    env.HOSTED_DB.prepare(`SELECT g.guest_id AS id, g.name, g.max_guests AS maxGuests, g.phone, g.group_name AS "group",
        r.attendance, r.guest_count AS count, r.note, r.updated_at AS updatedAt, r.source, a.table_id AS tableId
      FROM guests g LEFT JOIN rsvps r ON r.event_id = g.event_id AND r.guest_id = g.guest_id
      LEFT JOIN seating_assignments a ON a.event_id = g.event_id AND a.guest_id = g.guest_id
      WHERE g.event_id = (${active}) ORDER BY g.rowid LIMIT 300`).bind(...scope),
    env.HOSTED_DB.prepare(`SELECT table_id AS id, table_number AS number, capacity, label FROM seating_tables
      WHERE event_id = (${active}) ORDER BY table_number`).bind(...scope),
    env.HOSTED_DB.prepare(`SELECT kind, photo_id FROM event_photos WHERE event_id = (${active})`).bind(...scope),
  ]);
  return {
    account: me,
    event: {
      id: event.event_id, title: event.title, date: event.event_date, purgeAt: event.purge_at,
      details: readDetails(event.details),
      photos: Object.fromEntries((photos.results as { kind: string; photo_id: string }[]).map(p => [p.kind, "/media/" + p.photo_id])),
      quota: { invitations: event.invitation_count, people: event.invited_people, maxInvitations: 300, maxPeople: 500 },
    },
    guests: guests.results,
    tables: tables.results,
    staffSearch: Boolean(env.HOSTED_INVITE_SECRET),
  };
}

async function insertGuests(db: D1Database, owner: string, now: number, guests: GuestInput[]) {
  const statements = [];
  for (let i = 0; i < guests.length; i += 20) {
    const chunk = guests.slice(i, i + 20);
    const rows = chunk.map(() => "(?, ?, ?, ?, ?)").join(", ");
    statements.push(db.prepare(`WITH incoming(guest_id, name, max_guests, phone, group_name) AS (VALUES ${rows})
      INSERT INTO guests (event_id, guest_id, name, max_guests, phone, group_name)
      SELECT allowed.event_id, incoming.guest_id, incoming.name, incoming.max_guests, incoming.phone, incoming.group_name
      FROM incoming CROSS JOIN (${active}) AS allowed RETURNING guest_id`)
      .bind(...chunk.flatMap(g => [crypto.randomUUID(), g.name, g.maxGuests, g.phone, g.group]), owner, now));
  }
  try {
    const results = await db.batch(statements);
    return results.reduce((count, item) => count + item.results.length, 0);
  } catch (error) {
    if (String(error).includes("hosted guest quota exceeded")) fail(409, "מכסת המוזמנים התמלאה: עד 300 הזמנות ו-500 מוזמנים לאירוע.");
    throw error;
  }
}

function guestList(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 300) fail(400, "יש לשלוח בין 1 ל-300 מוזמנים");
  return (value as unknown[]).map(item => parseGuest(item) as GuestInput);
}

function eventFields(input: Record<string, unknown>, now: number, base?: EventDetails) {
  const title = "title" in input ? validTitle(input.title) ?? fail(400, "שם האירוע חסר או ארוך מדי") : null;
  let purgeAt: number | null = null;
  const date = "date" in input ? String(input.date ?? "") : null;
  if (date !== null) purgeAt = purgeTime(date, now) ?? fail(400, "בחרו תאריך מהיום ועד שנה קדימה");
  let details: EventDetails | null = null;
  if ("details" in input) {
    try { details = parseDetails(input.details, base); } catch (error) { fail(400, error instanceof DetailsError ? error.message : "פרטים לא תקינים"); }
  }
  return { title, date, purgeAt, details };
}

async function createEvent(env: AuthEnv, owner: string, now: number, input: Record<string, unknown>) {
  const fields = eventFields(input, now);
  if (!fields.title || !fields.date || !fields.purgeAt) fail(400, "נדרשים שם ותאריך לאירוע");
  if (!await hasHeadroom(env.HOSTED_DB, now)) fail(503, "יצירת אירועים מושהית זמנית בגלל עומס. נסו שוב מאוחר יותר.");
  const id = crypto.randomUUID();
  const result = await env.HOSTED_DB.prepare(`INSERT INTO events(event_id, owner_id, title, event_date, time_zone, purge_at, details)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM events) < 20
    ON CONFLICT(owner_id) DO NOTHING`)
    .bind(id, owner, fields.title, fields.date, timeZone, fields.purgeAt, JSON.stringify(fields.details ?? parseDetails({}))).run();
  if (result.meta.changes !== 1) fail(409, "לא ניתן ליצור אירוע: כל חשבון יכול לשמור אירוע אחד, בכפוף למקום פנוי בשירות.");
  return id;
}

async function inviteLinks(env: AuthEnv, owner: string, now: number, ids: string[] | null) {
  if (!env.HOSTED_INVITE_SECRET || !env.HOSTED_ORIGIN) fail(503, "קישורי הזמנה אינם זמינים כרגע");
  const rows = (await env.HOSTED_DB.prepare(`SELECT event_id, guest_id, invite_version FROM guests WHERE event_id = (${active}) LIMIT 300`)
    .bind(owner, now).all<{ event_id: string; guest_id: string; invite_version: number }>()).results;
  const key = await invitationKey(env.HOSTED_INVITE_SECRET!);
  const wanted = ids ? new Set(ids) : null;
  const links: Record<string, string> = {};
  for (const row of rows) {
    if (wanted && !wanted.has(row.guest_id)) continue;
    links[row.guest_id] = env.HOSTED_ORIGIN + "/invite/" + await signInvitation(key, row.event_id, row.guest_id, row.invite_version, now);
  }
  return links;
}

function rsvpInput(input: Record<string, unknown>, maxGuests: number) {
  const attendance = input.attendance;
  if (attendance === null) return null;
  if (attendance !== "yes" && attendance !== "no") fail(400, "תשובה לא תקינה");
  const count = attendance === "no" ? 0 : Number(input.count);
  if (!Number.isInteger(count) || (attendance === "yes" && (count < 1 || count > maxGuests))) fail(400, `מספר המגיעים: 1 עד ${maxGuests}`);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
  return { attendance: attendance as "yes" | "no", count, note: note || null };
}

async function route(request: Request, env: AuthEnv, owner: string, now: number, path: string) {
  const db = env.HOSTED_DB;
  const method = request.method;
  if (path === "/state" && method === "GET") return json(await state(env, owner, now));

  if (method !== "GET") {
    if (!env.HOSTED_ORIGIN || new URL(request.url).origin !== env.HOSTED_ORIGIN || request.headers.get("origin") !== env.HOSTED_ORIGIN) {
      fail(403, "הבקשה נחסמה");
    }
  }

  if (path === "/event" && method === "POST") {
    await createEvent(env, owner, now, await body(request));
    return json(await state(env, owner, now), 201);
  }
  if (path === "/event" && method === "PUT") {
    const event = await requireEvent(db, owner, now);
    const fields = eventFields(await body(request), now, readDetails(event.details));
    await db.prepare(`UPDATE events SET title = COALESCE(?, title), event_date = COALESCE(?, event_date),
      purge_at = COALESCE(?, purge_at), details = COALESCE(?, details) WHERE event_id = ? AND owner_id = ? AND purge_at > ?`)
      .bind(fields.title, fields.date, fields.purgeAt, fields.details ? JSON.stringify(fields.details) : null, event.event_id, owner, now).run();
    return json(await state(env, owner, now));
  }

  if (path === "/import" && method === "POST") {
    const input = await body(request, 256 * 1024);
    const guests = Array.isArray(input.guests) && input.guests.length ? guestList(input.guests) : [];
    const tables = Array.isArray(input.tables) ? input.tables.slice(0, 60) : [];
    const parsedTables = tables.map(table => {
      const t = table as Record<string, unknown>;
      const number = Number(t.number), capacity = Number(t.capacity);
      if (!Number.isInteger(number) || number < 1 || number > 999 || !Number.isInteger(capacity) || capacity < 1 || capacity > 50) fail(400, "שולחן לא תקין");
      const label = typeof t.label === "string" ? t.label.trim().slice(0, 40) || null : null;
      return { number, capacity, label };
    });
    const id = await createEvent(env, owner, now, (input.event ?? {}) as Record<string, unknown>);
    try {
      if (guests.length) await insertGuests(db, owner, now, guests);
      if (parsedTables.length) {
        await db.batch(parsedTables.map(t => db.prepare(`INSERT INTO seating_tables(event_id, table_id, table_number, capacity, label)
          SELECT event_id, ?, ?, ?, ? FROM events WHERE event_id = ? AND owner_id = ? ON CONFLICT(event_id, table_number) DO NOTHING`)
          .bind(crypto.randomUUID(), t.number, t.capacity, t.label, id, owner)));
      }
    } catch (error) {
      await db.prepare("DELETE FROM events WHERE event_id = ? AND owner_id = ?").bind(id, owner).run();
      throw error;
    }
    return json(await state(env, owner, now), 201);
  }

  const event = await requireEvent(db, owner, now);
  const eventId = event.event_id;

  const photo = path.match(/^\/photos\/(cover|couple|card)$/);
  if (photo) {
    const photos = photoStore(db, owner, eventId, now);
    if (method === "DELETE") { await photos.remove(photo[1] as PhotoKind); return json(await state(env, owner, now)); }
    if (method !== "PUT") fail(405, "פעולה לא נתמכת");
    const bytes = await readLimitedBody(request, maxPhotoBytes) ?? fail(413, "התמונה גדולה מדי (עד 800KB אחרי כיווץ)");
    const type = sniffImage(bytes) ?? fail(415, "יש להעלות JPEG, PNG או WebP");
    if (!await photos.put(photo[1] as PhotoKind, bytes, type)) fail(404, "האירוע לא נמצא");
    return json(await state(env, owner, now));
  }

  if (path === "/guests" && method === "POST") {
    const input = await body(request, 256 * 1024);
    if (!await hasHeadroom(db, now)) fail(503, "הוספת מוזמנים מושהית זמנית. נסו שוב מאוחר יותר.");
    const guests = guestList(input.guests);
    const added = await insertGuests(db, owner, now, guests);
    return json({ added, ...await state(env, owner, now) }, 201);
  }
  if (path === "/links" && method === "POST") {
    const input = await body(request);
    const ids = Array.isArray(input.ids) ? (input.ids as unknown[]).filter((id): id is string => typeof id === "string" && uuid.test(id)) : null;
    return json({ links: await inviteLinks(env, owner, now, ids) });
  }
  if (path === "/staff-link" && method === "POST") {
    if (!env.HOSTED_INVITE_SECRET || !env.HOSTED_ORIGIN) fail(503, "חיפוש שולחן אינו זמין");
    return json({ url: env.HOSTED_ORIGIN + "/find-table/" + await signStaffLookup(env.HOSTED_INVITE_SECRET!, eventId, now), hours: 24 });
  }

  const guest = path.match(/^\/guests\/([0-9a-f-]{36})(\/rsvp|\/revoke)?$/);
  if (guest) {
    const [, guestId, action] = guest;
    const row = await db.prepare("SELECT max_guests FROM guests WHERE event_id = ? AND guest_id = ?").bind(eventId, guestId)
      .first<{ max_guests: number }>() ?? fail(404, "המוזמן לא נמצא");
    if (!action && method === "DELETE") {
      await db.prepare("DELETE FROM guests WHERE event_id = ? AND guest_id = ?").bind(eventId, guestId).run();
      return json(await state(env, owner, now));
    }
    if (!action && method === "PATCH") {
      const changes = parseGuest(await body(request), true);
      if (changes.maxGuests !== undefined) {
        const confirmed = await db.prepare("SELECT guest_count FROM rsvps WHERE event_id = ? AND guest_id = ? AND attendance = 'yes'")
          .bind(eventId, guestId).first<{ guest_count: number }>();
        if (confirmed && confirmed.guest_count > changes.maxGuests) fail(409, `כבר אושרו ${confirmed.guest_count} מגיעים. עדכנו קודם את האישור.`);
      }
      try {
        await db.prepare(`UPDATE guests SET name = COALESCE(?, name), max_guests = COALESCE(?, max_guests),
          phone = CASE WHEN ? THEN ? ELSE phone END, group_name = CASE WHEN ? THEN ? ELSE group_name END
          WHERE event_id = ? AND guest_id = ?`)
          .bind(changes.name ?? null, changes.maxGuests ?? null, "phone" in changes ? 1 : 0, changes.phone ?? null,
            "group" in changes ? 1 : 0, changes.group ?? null, eventId, guestId).run();
      } catch (error) {
        if (String(error).includes("hosted guest quota exceeded")) fail(409, "מכסת המוזמנים התמלאה");
        throw error;
      }
      return json(await state(env, owner, now));
    }
    if (action === "/revoke" && method === "POST") {
      await db.prepare("UPDATE guests SET invite_version = invite_version + 1 WHERE event_id = ? AND guest_id = ?").bind(eventId, guestId).run();
      return json({ links: await inviteLinks(env, owner, now, [guestId]) });
    }
    if (action === "/rsvp" && method === "PUT") {
      const answer = rsvpInput(await body(request), row.max_guests);
      if (!answer) {
        await db.batch([
          db.prepare("DELETE FROM seating_assignments WHERE event_id = ? AND guest_id = ?").bind(eventId, guestId),
          db.prepare("DELETE FROM rsvps WHERE event_id = ? AND guest_id = ?").bind(eventId, guestId),
        ]);
      } else {
        await db.prepare(`INSERT INTO rsvps(event_id, guest_id, attendance, guest_count, note, updated_at, source)
          VALUES (?, ?, ?, ?, ?, ?, 'owner') ON CONFLICT(event_id, guest_id) DO UPDATE SET attendance = excluded.attendance,
          guest_count = excluded.guest_count, note = COALESCE(excluded.note, rsvps.note), updated_at = excluded.updated_at, source = 'owner'`)
          .bind(eventId, guestId, answer.attendance, answer.count, answer.note, now).run();
      }
      return json(await state(env, owner, now));
    }
    fail(405, "פעולה לא נתמכת");
  }

  if (path === "/tables" && method === "POST") {
    const input = await body(request);
    const tables = Array.isArray(input.tables) ? input.tables : [input];
    if (tables.length > 60) fail(400, "עד 60 שולחנות");
    let created = 0;
    for (const t of tables as Record<string, unknown>[]) {
      const number = Number(t.number), capacity = Number(t.capacity);
      if (!Number.isInteger(number) || number < 1 || number > 999 || !Number.isInteger(capacity) || capacity < 1 || capacity > 50) {
        fail(400, "מספר שולחן 1-999 וקיבולת 1-50");
      }
      if (await seatingStore(db, owner, eventId, now).create(number, capacity)) created++;
      const label = typeof t.label === "string" ? t.label.trim().slice(0, 40) : "";
      if (label) await db.prepare("UPDATE seating_tables SET label = ? WHERE event_id = ? AND table_number = ?").bind(label, eventId, number).run();
    }
    if (!created) fail(409, "השולחן כבר קיים או שהגעתם ל-60 שולחנות");
    return json(await state(env, owner, now), 201);
  }
  const table = path.match(/^\/tables\/([0-9a-f-]{36})$/);
  if (table) {
    if (method === "DELETE") {
      const result = await db.prepare("DELETE FROM seating_tables WHERE event_id = ? AND table_id = ?").bind(eventId, table[1]).run();
      if (result.meta.changes !== 1) fail(404, "השולחן לא נמצא");
      return json(await state(env, owner, now));
    }
    if (method === "PATCH") {
      const input = await body(request);
      const capacity = input.capacity === undefined ? null : Number(input.capacity);
      if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 50)) fail(400, "קיבולת 1-50");
      const label = typeof input.label === "string" ? input.label.trim().slice(0, 40) : null;
      const result = await db.prepare(`UPDATE seating_tables SET capacity = COALESCE(?, capacity),
        label = CASE WHEN ? IS NULL THEN label ELSE NULLIF(?, '') END WHERE event_id = ? AND table_id = ?`)
        .bind(capacity, label, label, eventId, table[1]).run();
      if (result.meta.changes !== 1) fail(404, "השולחן לא נמצא");
      return json(await state(env, owner, now));
    }
  }
  if (path === "/seats" && method === "PUT") {
    const input = await body(request);
    if (Array.isArray(input.assignments)) {
      const list = input.assignments as Record<string, unknown>[];
      if (list.length < 1 || list.length > 40) fail(400, "עד 40 שיבוצים בבקשה");
      const seating = seatingStore(db, owner, eventId, now);
      let placed = 0;
      for (const item of list) {
        const g = String(item?.guestId ?? ""), t = String(item?.tableId ?? "");
        if (!uuid.test(g) || !uuid.test(t)) fail(400, "בחירה לא תקינה");
        if (await seating.assign(g, t)) placed++;
      }
      return json({ placed, ...await state(env, owner, now) });
    }
    const guestId = String(input.guestId ?? "");
    const tableId = input.tableId ? String(input.tableId) : "";
    if (!uuid.test(guestId) || (tableId && !uuid.test(tableId))) fail(400, "בחירה לא תקינה");
    const seating = seatingStore(db, owner, eventId, now);
    const changed = tableId ? await seating.assign(guestId, tableId) : (await seating.remove(guestId), true);
    if (!changed) fail(409, "אין מספיק מקום בשולחן, או שהמוזמן עוד לא אישר הגעה.");
    return json(await state(env, owner, now));
  }
  return fail(404, "לא נמצא");
}

/** Owner JSON API under /api/app. The owner ID comes from a verified session. */
export async function appApi(request: Request, env: AuthEnv, owner: string, now = Date.now()) {
  const path = new URL(request.url).pathname.slice("/api/app".length) || "/";
  try {
    return await route(request, env, owner, now, path);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    console.error("hosted api error");
    return json({ error: "אירעה שגיאה. נסו שוב." }, 500);
  }
}
