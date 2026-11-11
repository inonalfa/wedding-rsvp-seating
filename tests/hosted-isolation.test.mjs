import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createHostedWorker } from "../hosted/worker.ts";
import { recordSession } from "../hosted/auth.ts";
import { ownerStore } from "../hosted/store.ts";
import { purgeExpired } from "../hosted/retention.ts";
import { purgeTime } from "../hosted/events.ts";

const origin = "https://weddings.example.test";
const a = "10000000-0000-4000-8000-000000000001";
const b = "20000000-0000-4000-8000-000000000002";
const guest = "30000000-0000-4000-8000-000000000003";
const foreignGuest = "30000000-0000-4000-8000-000000000004";
const table = "40000000-0000-4000-8000-000000000001";
const move = "40000000-0000-4000-8000-000000000002";
const foreignTable = "40000000-0000-4000-8000-000000000003";
const hash = value => createHash("sha256").update(value).digest("base64url");

function fixture(t) {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  sql.exec("PRAGMA foreign_keys=ON");
  const migrations = new URL("../hosted/migrations/", import.meta.url);
  for (const name of readdirSync(migrations).filter(name => name.endsWith(".sql")).sort()) {
    sql.exec(readFileSync(new URL(name, migrations), "utf8"));
  }
  const db = {
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
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const now = Date.now();
  for (const [owner, event, title, number] of [["a", a, "Alpha", 11], ["b", b, "Bravo", 22]]) {
    sql.prepare("INSERT INTO accounts VALUES (?, ?, ?)").run(owner, owner, now);
    sql.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(hash(owner.repeat(43)), owner, now + 86_400_000);
    sql.prepare("INSERT INTO events(event_id, owner_id, title, event_date, time_zone, purge_at) VALUES (?, ?, ?, '2027-06-10', 'Asia/Jerusalem', ?)").run(event, owner, title, now + 86_400_000);
    sql.prepare("INSERT INTO guests(event_id, guest_id, name, max_guests) VALUES (?, ?, 'Shared Guest', 2)").run(event, guest);
    sql.prepare("INSERT INTO rsvps VALUES (?, ?, 'yes', ?)").run(event, guest, owner === "a" ? 1 : 2);
    sql.prepare("INSERT INTO seating_tables VALUES (?, ?, ?, 10)").run(event, table, number);
    sql.prepare("INSERT INTO seating_assignments VALUES (?, ?, ?)").run(event, guest, table);
  }
  sql.prepare("INSERT INTO guests(event_id, guest_id, name, max_guests) VALUES (?, ?, 'Bravo Private', 2)").run(b, foreignGuest);
  sql.prepare("INSERT INTO seating_tables VALUES (?, ?, 12, 10)").run(a, move);
  sql.prepare("INSERT INTO seating_tables VALUES (?, ?, 23, 10)").run(b, foreignTable);
  sql.prepare("INSERT INTO usage_snapshot VALUES (1, ?, 0, 0, 0, 0, ?, 1)").run(now, now);
  const allow = { limit: async () => ({ success: true }) };
  const env = {
    HOSTED_DB: db, HOSTED_ORIGIN: origin, HOSTED_INVITE_SECRET: Buffer.alloc(32, 7).toString("base64url"),
    TURNSTILE_SITE_KEY: "fixture", TURNSTILE_SECRET: "fixture",
    LOGIN_LIMIT: allow, OWNER_LIMIT: allow, RECOVERY_LIMIT: allow, GUEST_LIMIT: allow, CLIENT_LIMIT: allow,
  };
  const worker = createHostedWorker(async () => Response.json({
    success: true, hostname: "weddings.example.test", action: "rsvp",
  }));
  function request(path, owner, form, bearer) {
    const headers = { origin };
    if (owner) headers.cookie = "__Host-hosted_session=" + owner.repeat(43);
    if (bearer) headers.authorization = "Bearer " + bearer;
    const body = form instanceof FormData ? form : form && new URLSearchParams(form);
    return worker.fetch(new Request(origin + path, { headers, method: body ? "POST" : "GET", body }), env);
  }
  return { sql, db, env, request, now };
}

function upload() {
  const form = new FormData();
  form.append("guests", new Blob(["name,max_guests\nImported Guest,1"]), "guests.csv");
  return form;
}
const event = id => "/events/" + id;

test("two live tenants with overlapping IDs are isolated across owner, guest, staff and connector routes", async t => {
  const { request, sql } = fixture(t);
  const ax = event(a), bx = event(b);
  const unchanged = () => ["events", "guests", "rsvps", "seating_tables", "seating_assignments", "event_connectors"]
    .map(name => sql.prepare(`SELECT * FROM ${name} WHERE event_id=? ORDER BY rowid`).all(b));
  const connector = async (path, owner) => {
    const res = await request(path + "/connections", owner, { action: "enable" });
    assert.equal(res.status, 200);
    return (await res.text()).match(/value="([a-f0-9]{64})"/)[1];
  };
  const keyA = await connector(ax, "a"), keyB = await connector(bx, "b");
  const snap = unchanged();
  for (const path of [bx, bx + "/seating", bx + "/seating/print", bx + "/invites/" + guest,
    bx + "/staff-link", bx + "/connections", bx + "/data", bx + "/reminder"]) {
    const denied = await request(path, "a");
    assert.equal(denied.status, 404, path);
    assert.doesNotMatch(await denied.text(), /Bravo|Shared Guest/);
  }
  for (const [suffix, form] of [
    ["/guests", upload()], ["/seating", { action: "assign", guest, table }],
    ["/connections", { action: "disable" }], ["/data", { action: "export" }],
    ["/data", { action: "delete", confirm: "yes" }],
  ]) assert.equal((await request(bx + suffix, "a", form)).status, 404, suffix);
  assert.equal((await request(ax + "/invites/" + foreignGuest, "a")).status, 404);
  for (const [guestId, tableId] of [[foreignGuest, table], [guest, foreignTable]]) {
    assert.equal((await request(ax + "/seating", "a", { action: "assign", guest: guestId, table: tableId })).status, 409);
  }
  assert.equal((await request(ax + "/guests", "a", upload())).status, 303);
  assert.equal((await request(ax + "/seating", "a", { action: "assign", guest, table: move })).status, 303);
  assert.match(await (await request(ax + "/seating/print", "a")).text(), /שולחן 12.*Shared Guest/s);
  assert.match(await (await request(bx + "/seating/print", "b")).text(), /שולחן 22.*Shared Guest/s);
  const ownerHtml = await (await request(ax, "a")).text();
  assert.match(ownerHtml, /Imported Guest/);
  assert.doesNotMatch(ownerHtml, /Bravo Private/);

  const invite = (await (await request(ax + "/invites/" + guest, "a")).text()).match(/href="https:\/\/weddings\.example\.test(\/invite\/[^"]+)"/)[1];
  const staff = (await (await request(ax + "/staff-link", "a")).text()).match(/href="https:\/\/weddings\.example\.test(\/find-table\/[^"]+)"/)[1];
  assert.match(await (await request(invite)).text(), /Alpha/);
  const rsvp = { attendance: "no", "cf-turnstile-response": "test" };
  assert.equal((await request(invite.replace(a, b))).status, 404);
  assert.equal((await request(invite.replace(a, b), null, rsvp)).status, 404);
  assert.equal((await request(staff.replace(a, b), null, { name: "Shared Guest" })).status, 404);
  assert.match(await (await request(staff, null, { name: "Shared Guest" })).text(), /role="status">שולחן 12</);
  assert.doesNotMatch(await (await request(staff, null, { name: "Bravo Private" })).text(), /role="status">שולחן /);
  assert.equal((await request(invite, null, rsvp)).status, 303);
  const api = id => "/api/connectors/" + id;
  assert.equal((await request(api(b), null, null, keyA)).status, 401);
  assert.equal((await request(api(a), null, null, keyB)).status, 401);
  const ownData = await (await request(api(a), null, null, keyA)).json();
  assert.ok(ownData.guests.some(g => g.name === "Imported Guest"));
  assert.ok(ownData.guests.every(g => g.name !== "Bravo Private"));
  const exported = await (await request(ax + "/data", "a", { action: "export" })).json();
  assert.deepEqual(exported.event.map(e => e.event_id), [a]);
  assert.deepEqual(exported.assignments.map(row => row.table_id), [move]);
  assert.doesNotMatch(JSON.stringify(exported), /Bravo/);
  assert.equal((await request(ax + "/data", "a", { action: "delete", confirm: "yes" })).status, 303);
  assert.equal((await request(invite)).status, 404);
  assert.equal((await request(staff)).status, 404);
  assert.equal((await request(api(a), null, null, keyA)).status, 401);
  assert.deepEqual(unchanged(), snap);
  assert.match(await (await request(bx, "b")).text(), /Bravo Private/);
});

test("owner limits are account-scoped, with separate capacity for export, deletion and logout", async t => {
  const { request, env, sql } = fixture(t);
  const seen = [];
  env.OWNER_LIMIT = { limit: async ({ key }) => { seen.push(key); return { success: key !== "owner:a" }; } };
  env.LOGIN_LIMIT = { limit: async () => ({ success: false }) };
  assert.equal((await request(event(a), "a")).status, 429);
  assert.equal((await request(event(a) + "/guests", "a", upload())).status, 429);
  assert.equal((await request(event(b), "b")).status, 200);
  assert.deepEqual(seen, ["owner:a", "owner:a", "owner:b"]);
  assert.equal((await request(event(a) + "/data", "a", { action: "export" })).status, 200);
  assert.equal((await request(event(a) + "/data", "a", { action: "delete", confirm: "yes" })).status, 303);
  assert.equal((await request("/auth/logout", "a", {})).status, 303);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM sessions WHERE account_id='a'").get().n, 0);
  env.RECOVERY_LIMIT = { limit: async () => ({ success: false }) };
  assert.equal((await request(event(b) + "/data", "b", { action: "export" })).status, 429);
  assert.equal((await request("/auth/logout", "b", {})).status, 429);
});

test("issuing a sixth session evicts the oldest session of that account only", async t => {
  const { db, sql, now } = fixture(t);
  for (let i = 0; i < 6; i++) await recordSession(db, "a", "token-" + i, now + i);
  const sessions = sql.prepare("SELECT token_hash FROM sessions WHERE account_id='a' ORDER BY token_hash").all();
  assert.deepEqual(sessions.map(row => row.token_hash), ["token-1", "token-2", "token-3", "token-4", "token-5"]);
  assert.equal(sql.prepare("SELECT token_hash FROM sessions WHERE account_id='b'").get().token_hash, hash("b".repeat(43)));
});

test("event access and scheduled deletion switch at the exact retention instant", async t => {
  const { db, sql } = fixture(t);
  const expires = purgeTime("2026-12-25", Date.parse("2026-11-11T12:00:00Z"));
  sql.prepare("UPDATE events SET purge_at=? WHERE event_id=?").run(expires, a);
  sql.prepare("UPDATE events SET purge_at=? WHERE event_id=?").run(expires + 1, b);
  assert.ok(await ownerStore(db, "a", expires - 1).event(a).details());
  await purgeExpired(db, expires - 1);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM events").get().n, 2);
  assert.equal(await ownerStore(db, "a", expires).event(a).details(), null);
  await purgeExpired(db, expires);
  assert.deepEqual(sql.prepare("SELECT event_id FROM events").all().map(row => row.event_id), [b]);
});
