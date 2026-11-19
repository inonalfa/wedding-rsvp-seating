import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createHostedWorker } from "../hosted/worker.ts";
import { hashPassword, verifyPassword, normalizeUsername, passwordProblem } from "../hosted/password.ts";
import { parseDetails } from "../hosted/details.ts";
import { sniffImage } from "../hosted/media.ts";
import { invitationMarkup } from "../hosted/public/assets/invitation-view.js";
import { waDigits, waLink } from "../hosted/public/assets/whatsapp.js";

const origin = "https://weddings.example.test";
const futureDate = days => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

function fixture(t) {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  sql.exec("PRAGMA foreign_keys=ON");
  const dir = new URL("../hosted/migrations/", import.meta.url);
  for (const name of readdirSync(dir).filter(n => n.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(name, dir), "utf8"));
  sql.prepare("INSERT INTO usage_snapshot VALUES (1, ?, 0, 0, 0, 0, ?, 1)").run(Date.now(), Date.now());
  const HOSTED_DB = {
    prepare(query) {
      return { bind(...values) {
        return {
          async first() { return sql.prepare(query).get(...values) ?? null; },
          async all() { return { results: sql.prepare(query).all(...values) }; },
          async run() { return { meta: sql.prepare(query).run(...values) }; },
        };
      } };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sql.exec("COMMIT");
        return results;
      } catch (error) { sql.exec("ROLLBACK"); throw error; }
    },
  };
  const allow = { limit: async () => ({ success: true }) };
  const env = {
    HOSTED_DB, HOSTED_ORIGIN: origin, HOSTED_INVITE_SECRET: Buffer.alloc(32, 5).toString("base64url"),
    TURNSTILE_SITE_KEY: "fixture", TURNSTILE_SECRET: "fixture", HOSTED_PASSWORD_LOGIN: "1",
    LOGIN_LIMIT: allow, OWNER_LIMIT: allow, RECOVERY_LIMIT: allow, GUEST_LIMIT: allow, CLIENT_LIMIT: allow,
  };
  const worker = createHostedWorker(async (url, init) => {
    if (String(url).includes("turnstile")) {
      const action = String(init.body.get("response")).split(":")[0];
      return Response.json({ success: true, hostname: "weddings.example.test", action });
    }
    throw new Error("unexpected fetch " + url);
  });
  const form = (path, values, cookie = "") => worker.fetch(new Request(origin + path, {
    method: "POST", headers: { origin, ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(values),
  }), env);
  async function signup(username, password = "Correct-Horse-91") {
    const response = await form("/auth/signup", { username, password, confirm: password, name: "Fictional " + username, "cf-turnstile-response": "signup:x" });
    assert.equal(response.status, 303, await response.clone().text());
    assert.equal(response.headers.get("location"), "/app");
    return response.headers.get("set-cookie").split(";")[0];
  }
  const api = (cookie, method, path, body, headers = {}) => worker.fetch(new Request(origin + "/api/app" + path, {
    method, headers: { origin, cookie, ...(body !== undefined && !(body instanceof Uint8Array) ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
  }), env);
  const get = (path, cookie = "") => worker.fetch(new Request(origin + path, { headers: cookie ? { cookie } : {} }), env);
  return { sql, env, worker, form, signup, api, get };
}

test("passwords are salted PBKDF2 hashes and weak choices are refused", async () => {
  const stored = await hashPassword("Correct-Horse-91", 1000);
  assert.match(stored, /^pbkdf2-sha256\$1000\$[\w-]{22}\$[\w-]{43}$/);
  assert.notEqual(stored, await hashPassword("Correct-Horse-91", 1000));
  assert.equal(await verifyPassword("Correct-Horse-91", stored), true);
  assert.equal(await verifyPassword("correct-horse-91", stored), false);
  assert.equal(await verifyPassword("x", "md5$1$a$b"), false);
  assert.equal(normalizeUsername("  Dana.Cohen@Example.com "), "dana.cohen@example.com");
  assert.equal(normalizeUsername("a"), null);
  assert.equal(normalizeUsername("<script>"), null);
  assert.ok(passwordProblem("short", "dana"));
  assert.ok(passwordProblem("dana-is-great-2027", "dana"));
  assert.equal(passwordProblem("Correct-Horse-91", "dana"), null);
});

test("username sign-up, sign-in and wrong passwords", async t => {
  const { signup, form, sql, get } = fixture(t);
  const cookie = await signup("couple.one");
  assert.match(cookie, /^__Host-hosted_session=[\w-]{43}$/);
  assert.equal((await form("/auth/signup", { username: "couple.one", password: "Another-Pass-77", confirm: "Another-Pass-77", "cf-turnstile-response": "signup:y" })).status, 409);
  assert.equal((await form("/auth/signup", { username: "couple.two", password: "Another-Pass-77", confirm: "Different-Pass-77", "cf-turnstile-response": "signup:y" })).status, 400);
  assert.equal((await form("/auth/signup", { username: "couple.two", password: "Another-Pass-77", confirm: "Another-Pass-77" })).status, 403);
  assert.equal((await form("/auth/password", { username: "couple.one", password: "wrong-password-1", "cf-turnstile-response": "login:z" })).status, 401);
  assert.equal((await form("/auth/password", { username: "nobody.here", password: "wrong-password-1", "cf-turnstile-response": "login:z" })).status, 401);
  const login = await form("/auth/password", { username: "COUPLE.ONE", password: "Correct-Horse-91", "cf-turnstile-response": "login:z" });
  assert.equal(login.status, 303);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM accounts").get().n, 1);
  const stored = sql.prepare("SELECT password_hash FROM password_credentials").get().password_hash;
  assert.doesNotMatch(stored, /Correct-Horse/);
  const cross = await new Request(origin + "/auth/password", { method: "POST", headers: { origin: "https://evil.example.test" }, body: "" });
  assert.equal((await fixtureFetch(t, cross)).status, 403);
  assert.equal((await get("/", cookie)).headers.get("location"), "/app");
  assert.equal((await get("/app")).headers.get("location"), "/auth/login");
  const shell = await get("/app", cookie);
  assert.equal(shell.status, 200);
  assert.match(shell.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal((await get("/demo")).status, 200);
});

async function fixtureFetch(t, request) {
  const { worker, env } = fixture(t);
  return worker.fetch(request, env);
}

test("owner API manages details, guests, RSVPs, tables and photos without crossing accounts", async t => {
  const { signup, api, get, form, sql } = fixture(t);
  const a = await signup("owner.alpha");
  const b = await signup("owner.bravo");
  assert.equal((await api("", "GET", "/state")).status, 401);
  assert.equal((await (await api(a, "GET", "/state")).json()).event, null);
  assert.equal((await api(a, "POST", "/event", { title: "x", date: futureDate(400) })).status, 400);
  assert.equal((await api(a, "POST", "/event", { title: "Alpha", date: futureDate(40), details: { hostA: "דנה", receptionTime: "25:00" } })).status, 400);
  const created = await api(a, "POST", "/event", { title: "Alpha", date: futureDate(40), details: { hostA: "דנה", hostB: "יואב", venue: "<b>גן</b>", address: "תל אביב" } });
  assert.equal(created.status, 201);
  assert.equal((await api(a, "POST", "/event", { title: "Again", date: futureDate(40) })).status, 409);
  const crossOrigin = await api(a, "PUT", "/event", { title: "Hijack" }, { origin: "https://evil.example.test" });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await api(a, "PUT", "/event", { title: "Hijack" }, { "content-type": "text/plain" })).status, 415);

  let state = await (await api(a, "POST", "/guests", { guests: [
    { name: "נועה לוי", maxGuests: 2, phone: "050-123-4567", group: "חברים" },
    { name: "סבתא רחל", maxGuests: 1 },
  ] })).json();
  assert.equal(state.added, 2);
  assert.equal(state.guests[0].phone, "0501234567");
  assert.equal((await api(a, "POST", "/guests", { guests: [{ name: "", maxGuests: 2 }] })).status, 400);
  assert.equal((await api(a, "POST", "/guests", { guests: [{ name: "Too many", maxGuests: 21 }] })).status, 400);
  const [noa, rachel] = state.guests;

  assert.equal((await api(b, "PATCH", "/guests/" + noa.id, { name: "stolen" })).status, 404);
  assert.equal((await api(b, "PUT", "/guests/" + noa.id + "/rsvp", { attendance: "yes", count: 1 })).status, 404);
  assert.equal((await api(b, "POST", "/event", { title: "Bravo", date: futureDate(50) })).status, 201);
  assert.equal((await api(b, "PATCH", "/guests/" + noa.id, { name: "stolen" })).status, 404);
  assert.equal((await api(b, "DELETE", "/guests/" + noa.id)).status, 404);
  const bLinks = await (await api(b, "POST", "/links", { ids: [noa.id] })).json();
  assert.deepEqual(bLinks.links, {});

  assert.equal((await api(a, "PUT", "/guests/" + noa.id + "/rsvp", { attendance: "yes", count: 3 })).status, 400);
  state = await (await api(a, "PUT", "/guests/" + noa.id + "/rsvp", { attendance: "yes", count: 2, note: "phoned" })).json();
  assert.equal(state.guests[0].source, "owner");
  assert.equal((await api(a, "PATCH", "/guests/" + noa.id, { maxGuests: 1 })).status, 409);

  state = await (await api(a, "POST", "/tables", { tables: [{ number: 1, capacity: 2, label: "משפחה" }, { number: 2, capacity: 1 }] })).json();
  const [t1, t2] = state.tables;
  assert.equal(t1.label, "משפחה");
  assert.equal((await api(a, "PUT", "/seats", { guestId: noa.id, tableId: t2.id })).status, 409);
  assert.equal((await api(a, "PUT", "/seats", { guestId: rachel.id, tableId: t1.id })).status, 409);
  state = await (await api(a, "PUT", "/seats", { guestId: noa.id, tableId: t1.id })).json();
  assert.equal(state.guests[0].tableId, t1.id);
  const bTables = (await (await api(b, "POST", "/tables", { number: 5, capacity: 10 })).json()).tables;
  assert.equal((await api(b, "PUT", "/seats", { guestId: noa.id, tableId: bTables[0].id })).status, 409);
  assert.equal((await api(a, "PUT", "/seats", { guestId: noa.id, tableId: bTables[0].id })).status, 409);

  const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0);
  assert.equal((await api(a, "PUT", "/photos/cover", new TextEncoder().encode("<svg onload=alert(1)>"), { "content-type": "image/jpeg" })).status, 415);
  assert.equal((await api(a, "PUT", "/photos/other", jpeg)).status, 404);
  state = await (await api(a, "PUT", "/photos/cover", jpeg, { "content-type": "image/jpeg" })).json();
  const photo = await get(state.event.photos.cover);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/jpeg");
  assert.equal(photo.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), jpeg);
  assert.equal((await get("/media/00000000-0000-0000-0000-000000000000")).status, 404);

  const links = (await (await api(a, "POST", "/links", {})).json()).links;
  const invite = new URL(links[noa.id]).pathname;
  const page = await (await get(invite)).text();
  assert.match(page, /דנה/);
  assert.match(page, /&lt;b&gt;גן&lt;\/b&gt;/);
  assert.doesNotMatch(page, /<b>גן/);
  assert.match(page, /השולחן שלכם: 1 \(משפחה\)/);
  assert.match(page, new RegExp(state.event.photos.cover));
  assert.match(page, /og:image/);
  assert.match(await (await get(invite + "/calendar")).text(), /DTSTART;TZID=Asia\/Jerusalem:/);
  const answer = await form(invite, { attendance: "yes", guest_count: "1", note: "מזל טוב!", "cf-turnstile-response": "rsvp:q" });
  assert.equal(answer.status, 303);
  const after = await (await api(a, "GET", "/state")).json();
  assert.equal(after.guests[0].note, "מזל טוב!");
  assert.equal(after.guests[0].source, "guest");
  assert.equal(after.guests[0].count, 1);

  const revoked = (await (await api(a, "POST", "/guests/" + noa.id + "/revoke", {})).json()).links;
  assert.notEqual(revoked[noa.id], links[noa.id]);
  assert.equal((await get(invite)).status, 404);

  assert.equal((await api(a, "DELETE", "/tables/" + t1.id)).status, 200);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM seating_assignments").get().n, 0);
  assert.equal((await api(a, "DELETE", "/guests/" + rachel.id)).status, 200);
  assert.equal(sql.prepare("SELECT invitation_count AS n FROM events WHERE title='Alpha'").get().n, 1);
});

test("demo data can be imported only into an account without an event", async t => {
  const { signup, api } = fixture(t);
  const a = await signup("importer");
  const payload = {
    event: { title: "החתונה של דנה ויואב", date: futureDate(90), details: { hostA: "דנה", hostB: "יואב", theme: "night" } },
    guests: [{ name: "אורח פיקטיבי", maxGuests: 3, phone: "", group: "חברים" }],
    tables: [{ number: 4, capacity: 8, label: "" }],
  };
  assert.equal((await api(a, "POST", "/import", { ...payload, guests: [{ name: "", maxGuests: 1 }] })).status, 400);
  const imported = await api(a, "POST", "/import", payload);
  assert.equal(imported.status, 201);
  const state = await imported.json();
  assert.equal(state.event.details.theme, "night");
  assert.equal(state.guests.length, 1);
  assert.equal(state.tables[0].number, 4);
  assert.equal((await api(a, "POST", "/import", payload)).status, 409);
});

test("details, image sniffing and invitation markup are strict", () => {
  assert.throws(() => parseDetails({ theme: "neon" }));
  assert.throws(() => parseDetails({ contactPhone: "call me" }));
  assert.throws(() => parseDetails({ message: "x".repeat(601) }));
  assert.equal(parseDetails({ hostA: "  דנה  " }).hostA, "דנה");
  assert.equal(sniffImage(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0)), "image/png");
  assert.equal(sniffImage(new TextEncoder().encode("RIFF0000WEBPVP8 ")), "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg>")), null);
  const html = invitationMarkup({ title: "T", date: "2027-06-10", details: { hostA: '"><img src=x onerror=alert(1)>', hostB: "ב", theme: "x" },
    photos: { cover: '/media/x" onerror="alert(1)' }, guest: { name: "<i>א</i>", maxGuests: 2, attendance: null }, formAction: "/invite/t" });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /" onerror="/);
  assert.match(html, /theme-garden/);
  assert.match(html, /<option value="2" selected>2<\/option>/);
});

test("by default only Google sign-in is offered and password routes are closed", async t => {
  const { env, form, get, sql } = fixture(t);
  delete env.HOSTED_PASSWORD_LOGIN;
  Object.assign(env, { GOOGLE_CLIENT_ID: "fictional", GOOGLE_CLIENT_SECRET: "fictional", HOSTED_AUTH_SECRET: Buffer.alloc(32, 1).toString("base64url") });
  for (const path of ["/auth/login", "/auth/signup"]) {
    const html = await (await get(path)).text();
    assert.match(html, /המשך עם Google/);
    assert.doesNotMatch(html, /type="password"/);
    assert.match(html, /href="\/privacy"/);
  }
  assert.equal((await form("/auth/signup", { username: "closed.door", password: "Correct-Horse-91", confirm: "Correct-Horse-91", "cf-turnstile-response": "signup:x" })).status, 404);
  assert.equal((await form("/auth/password", { username: "closed.door", password: "Correct-Horse-91", "cf-turnstile-response": "login:x" })).status, 404);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM accounts").get().n, 0);
  delete env.GOOGLE_CLIENT_ID;
  assert.equal((await get("/auth/login")).status, 503);
  env.HOSTED_CONTACT_EMAIL = "privacy@example.test";
  for (const path of ["/privacy", "/terms"]) {
    const response = await get(path);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /טיוטה/);
    assert.match(text, /mailto:privacy@example\.test/);
  }
});

test("declining frees the seat, whether the owner or the guest answers", async t => {
  const { signup, api, form, sql } = fixture(t);
  const a = await signup("owner.seats");
  assert.equal((await api(a, "POST", "/event", { title: "Seats", date: futureDate(30) })).status, 201);
  let state = await (await api(a, "POST", "/guests", { guests: [{ name: "Owner Answer", maxGuests: 2 }, { name: "Guest Answer", maxGuests: 2 }] })).json();
  const [byOwner, byGuest] = state.guests;
  state = await (await api(a, "POST", "/tables", { number: 1, capacity: 10 })).json();
  const table = state.tables[0];
  const seated = id => sql.prepare("SELECT count(*) AS n FROM seating_assignments WHERE guest_id = ?").get(id).n;
  for (const guest of [byOwner, byGuest]) {
    assert.equal((await api(a, "PUT", "/guests/" + guest.id + "/rsvp", { attendance: "yes", count: 2 })).status, 200);
    assert.equal((await api(a, "PUT", "/seats", { guestId: guest.id, tableId: table.id })).status, 200);
    assert.equal(seated(guest.id), 1);
  }

  // A changed head count keeps the seat; "no" from the owner frees it.
  state = await (await api(a, "PUT", "/guests/" + byOwner.id + "/rsvp", { attendance: "yes", count: 1 })).json();
  assert.equal(seated(byOwner.id), 1);
  state = await (await api(a, "PUT", "/guests/" + byOwner.id + "/rsvp", { attendance: "no" })).json();
  assert.equal(state.guests.find(g => g.id === byOwner.id).attendance, "no");
  assert.equal(state.guests.find(g => g.id === byOwner.id).tableId, null);
  assert.equal(seated(byOwner.id), 0);
  assert.equal(seated(byGuest.id), 1);

  // "no" from the guest's own invitation frees it too.
  const links = (await (await api(a, "POST", "/links", { ids: [byGuest.id] })).json()).links;
  const invite = new URL(links[byGuest.id]).pathname;
  assert.equal((await form(invite, { attendance: "yes", guest_count: "2", "cf-turnstile-response": "rsvp:y" })).status, 303);
  assert.equal(seated(byGuest.id), 1);
  assert.equal((await form(invite, { attendance: "no", "cf-turnstile-response": "rsvp:n" })).status, 303);
  assert.equal(seated(byGuest.id), 0);
  state = await (await api(a, "GET", "/state")).json();
  assert.equal(state.guests.find(g => g.id === byGuest.id).attendance, "no");
  assert.equal(state.guests.find(g => g.id === byGuest.id).source, "guest");
  // Answering "no" again is idempotent.
  assert.equal((await form(invite, { attendance: "no", "cf-turnstile-response": "rsvp:n" })).status, 303);
});

test("WhatsApp links keep international numbers and convert local Israeli ones", () => {
  assert.equal(waDigits("050-123-4567"), "972501234567");
  assert.equal(waDigits("0501234567"), "972501234567");
  assert.equal(waDigits("+972 50 123 4567"), "972501234567");
  assert.equal(waDigits("+1 (415) 555-0100"), "14155550100");
  assert.equal(waDigits("00972501234567"), "972501234567");
  assert.equal(waDigits("0044 20 7946 0000"), "442079460000");
  assert.equal(waDigits("972501234567"), "972501234567");
  assert.equal(waLink("00 1 415 555 0100", "שלום & hi"), "https://wa.me/14155550100?text=" + encodeURIComponent("שלום & hi"));
});
