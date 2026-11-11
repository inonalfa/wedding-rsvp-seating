import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createHostedWorker } from "../hosted/worker.ts";
import { purgeTime } from "../hosted/events.ts";
import { invitationKey, signInvitation } from "../hosted/invites.ts";

test("a signed-in owner can create one event, and other owners cannot read it", async () => {
  const sql = new DatabaseSync(":memory:");
  try {
    for (const name of ["0001_tenants.sql", "0002_sessions.sql", "0003_guest_quota.sql", "0004_invite_revocation.sql", "0005_retention.sql", "0006_connectors.sql", "0007_usage.sql"]) {
      sql.exec(readFileSync(new URL("../hosted/migrations/" + name, import.meta.url), "utf8"));
    }
    sql.exec("PRAGMA foreign_keys=ON");
    const origin = "https://weddings.example.test";
    const worker = createHostedWorker(async () => Response.json({ success: true, hostname: "weddings.example.test", action: "rsvp" }));
    const allow = { limit: async () => ({ success: true }) };
    const env = { TURNSTILE_SITE_KEY: "fixture-site", TURNSTILE_SECRET: "fixture-only",
      HOSTED_OPERATOR_SUB: "a", LOGIN_LIMIT: allow, GUEST_LIMIT: allow, CLIENT_LIMIT: allow, HOSTED_ORIGIN: origin, HOSTED_INVITE_SECRET: Buffer.alloc(32, 9).toString("base64url"), HOSTED_DB: { prepare(query) {
      return { bind(...values) {
        return {
          async first() { return sql.prepare(query).get(...values) ?? null; },
          async all() { return { results: sql.prepare(query).all(...values) }; },
          async run() { return { meta: sql.prepare(query).run(...values) }; },
        };
      } };
    }, async batch(statements) {
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
    } } };
    for (const owner of ["a", "b"]) {
      sql.prepare("INSERT INTO accounts VALUES (?, ?, 0)").run(owner, owner);
      const hash = createHash("sha256").update(owner.repeat(43)).digest("base64url");
      sql.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(hash, owner, Date.now() + 86400_000);
    }
    const get = (path, owner = "") => worker.fetch(new Request(origin + path, {
      headers: { cookie: "__Host-hosted_session=" + owner.repeat(43) },
    }), env);
    const create = (source = origin) => worker.fetch(new Request(origin + "/events", {
      method: "POST", headers: { origin: source, cookie: "__Host-hosted_session=" + "a".repeat(43) },
      body: new URLSearchParams({ title: "<script>Fictional event</script>", date: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10) }),
    }), env);
    assert.equal((await get("/events/00000000-0000-0000-0000-000000000000")).status, 401);
    assert.equal((await create("https://another.example.test")).status, 403);
    assert.equal((await create()).status, 503);
    sql.prepare("INSERT INTO usage_snapshot VALUES(1, ?, 1000, 2000, 3000, 4000)").run(Date.now() - 1);
    assert.equal((await get("/operator/usage", "b")).status, 404);
    assert.match(await (await get("/operator/usage", "a")).text(), /3000 מתוך 100000/);
    sql.exec("UPDATE usage_snapshot SET d1_writes=60000");
    assert.equal((await create()).status, 503);
    sql.exec("UPDATE usage_snapshot SET d1_writes=3000");
    const first = await create();
    assert.equal(first.status, 303, await first.clone().text());
    assert.equal((await create()).status, 409);
    const path = first.headers.get("location");
    const event = await get(path, "a");
    assert.equal(event.status, 200);
    assert.match(await event.text(), /&lt;script&gt;Fictional event&lt;\/script&gt;/);
    assert.equal((await get(path, "b")).status, 404);
    const upload = (owner, csv) => {
      const form = new FormData();
      form.append("guests", new Blob([csv], { type: "text/csv" }), "fictional.csv");
      return worker.fetch(new Request(origin + path + "/guests", {
        method: "POST", headers: { origin, cookie: "__Host-hosted_session=" + owner.repeat(43) },
        body: form,
      }), env);
    };
    const csv = 'name,max_guests\r\n"נועה, לוי",2';
    assert.equal((await upload("b", csv)).status, 404);
    assert.equal((await upload("a", csv)).status, 303);
    assert.match(await (await get(path, "a")).text(), /נועה, לוי/);
    assert.equal((await upload("a", "wrong,header\nFictional,2")).status, 400);
    const tooMany = "name,max_guests\n" + "Fictional,1\n".repeat(300);
    assert.equal((await upload("a", tooMany)).status, 409);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM guests").get().n, 1);
    const guest = sql.prepare("SELECT guest_id FROM guests").get();
    const inviteRoute = path + "/invites/" + guest.guest_id;
    assert.equal((await get(inviteRoute, "b")).status, 404);
    const share = await get(inviteRoute, "a");
    const invite = (await share.text()).match(/href="(https:\/\/weddings\.example\.test(\/invite\/[^"]+))">פתיחת ההזמנה/)[2];
    assert.equal((await get(invite)).status, 200);
    const key = await invitationKey(env.HOSTED_INVITE_SECRET);
    const expired = await signInvitation(key, path.split("/").pop(), guest.guest_id, 1, Date.now() - 31 * 86400_000);
    assert.equal((await get("/invite/" + expired)).status, 404);
    assert.equal((await get(invite.replace(/(\.[^.])/, (_, start) => "." + (start[1] === "a" ? "b" : "a")))).status, 404);
    const answer = (count, attendance = "yes", challenge = "fictional") => worker.fetch(new Request(origin + invite, {
      method: "POST", headers: { origin },
      body: new URLSearchParams({ attendance, guest_count: String(count), name: "Ignored", "cf-turnstile-response": challenge }),
    }), env);
    assert.equal((await answer(2, "yes", "")).status, 403);
    env.GUEST_LIMIT = { limit: async () => ({ success: false }) };
    assert.equal((await answer(2)).status, 429);
    env.GUEST_LIMIT = allow;
    env.LOGIN_LIMIT = { limit: async () => ({ success: false }) };
    assert.equal((await get("/auth/login")).status, 429);
    env.LOGIN_LIMIT = allow;
    assert.equal((await answer(3)).status, 400);
    assert.equal((await answer(2)).status, 303);
    assert.equal((await answer(2)).status, 303);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM rsvps").get().n, 1);
    assert.equal(sql.prepare("SELECT guest_count FROM rsvps").get().guest_count, 2);
    assert.match(await (await get(path, "a")).text(), /אישרו: 2/);
    const seating = path + "/seating";
    const seat = (owner, values) => worker.fetch(new Request(origin + seating, {
      method: "POST", headers: { origin, cookie: "__Host-hosted_session=" + owner.repeat(43) },
      body: new URLSearchParams(values),
    }), env);
    assert.equal((await seat("b", { action: "table", number: 1, capacity: 10 })).status, 404);
    assert.equal((await seat("a", { action: "table", number: 1, capacity: 1 })).status, 303);
    assert.equal((await seat("a", { action: "table", number: 2, capacity: 2 })).status, 303);
    const table = number => sql.prepare("SELECT table_id FROM seating_tables WHERE table_number=?").get(number).table_id;
    assert.equal((await seat("a", { action: "assign", guest: guest.guest_id, table: table(1) })).status, 409);
    assert.equal((await seat("a", { action: "assign", guest: guest.guest_id, table: table(2) })).status, 303);
    assert.match(await (await get(invite)).text(), /השולחן שלכם: 2/);
    assert.match(await (await get(seating + "/print", "a")).text(), /שולחן 2.*נועה, לוי/);
    assert.equal((await get(seating + "/print", "b")).status, 404);
    assert.equal((await get(path + "/staff-link", "b")).status, 404);
    const staff = (await (await get(path + "/staff-link", "a")).text()).match(/href="https:\/\/weddings\.example\.test(\/find-table\/[^"]+)"/)[1];
    assert.equal((await get(staff)).status, 200);
    assert.equal((await get(staff.slice(0, -1) + (staff.endsWith("0") ? "1" : "0"))).status, 404);
    const lookup = await worker.fetch(new Request(origin + staff, {
      method: "POST", headers: { origin }, body: new URLSearchParams({ name: "נועה, לוי" }),
    }), env);
    assert.match(await lookup.text(), /role="status">שולחן 2</);
    const connect = (owner, action) => worker.fetch(new Request(origin + path + "/connections", {
      method: "POST", headers: { origin, cookie: "__Host-hosted_session=" + owner.repeat(43) },
      body: new URLSearchParams({ action }),
    }), env);
    const api = (credential, eventId = path.split("/").pop()) => worker.fetch(new Request(origin + "/api/connectors/" + eventId, {
      headers: { authorization: "Bearer " + credential },
    }), env);
    assert.equal((await api("f".repeat(64))).status, 401);
    assert.equal((await connect("b", "enable")).status, 404);
    const enable = await connect("a", "enable");
    const bearer = (await enable.text()).match(/value="([a-f0-9]{64})"/)[1];
    assert.equal((await api(bearer, "00000000-0000-0000-0000-000000000000")).status, 401);
    assert.equal((await (await api(bearer)).json()).guests[0].table_number, 2);
    sql.exec("UPDATE event_connectors SET used_count=24");
    assert.equal((await api(bearer)).status, 429);
    assert.equal((await connect("a", "disable")).status, 303);
    assert.equal((await api(bearer)).status, 401);
    const reenable = (await (await connect("a", "enable")).text()).match(/value="([a-f0-9]{64})"/)[1];
    assert.equal((await api(reenable)).status, 429);

    assert.equal((await answer(2, "no")).status, 303);
    assert.equal(sql.prepare("SELECT guest_count FROM rsvps").get().guest_count, 0);
    sql.exec("UPDATE guests SET invite_version = invite_version + 1");
    assert.equal((await get(invite)).status, 404);
    assert.equal((await answer(1)).status, 404);


    assert.doesNotMatch(await (await get("/", "b")).text(), /Fictional event/);
    for (let i = 0; i < 19; i++) {
      sql.prepare("INSERT INTO accounts VALUES (?, ?, 0)").run(String(i), String(i));
      sql.prepare("INSERT INTO events(event_id, owner_id, title, event_date, time_zone, purge_at) VALUES (?, ?, 'Sample', '2027-06-10', 'Asia/Jerusalem', ?)").run(String(i), String(i), Date.now() + 60_000);
    }
    const hash = createHash("sha256").update("a".repeat(43)).digest("base64url");
    sql.prepare("UPDATE sessions SET account_id='b' WHERE token_hash=?").run(hash);
    assert.equal((await create()).status, 409);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM events").get().n, 20);
    sql.prepare("UPDATE sessions SET account_id='a' WHERE token_hash=?").run(hash);
    const data = (owner, action, confirm = "") => worker.fetch(new Request(origin + path + "/data", {
      method: "POST", headers: { origin, cookie: "__Host-hosted_session=" + owner.repeat(43) },
      body: new URLSearchParams({ action, confirm }),
    }), env);
    assert.equal((await data("b", "export")).status, 404);
    assert.equal((await data("a", "export")).status, 200);
    assert.equal((await (await data("a", "export")).json()).guests[0].name, "נועה, לוי");
    assert.match(await (await get(path + "/reminder", "a")).text(), /BEGIN:VALARM/);
    assert.equal((await data("a", "delete")).status, 400);
    assert.equal((await data("a", "delete", "yes")).status, 303);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM guests").get().n, 0);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM seating_assignments").get().n, 0);
    assert.equal((await get(staff)).status, 404);
    sql.exec("UPDATE events SET purge_at=0 WHERE event_id IN ('0','1','2')");
    await worker.scheduled(null, env);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM events WHERE purge_at=0").get().n, 1);
    await worker.scheduled(null, env);
    await worker.scheduled(null, env);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM events WHERE purge_at=0").get().n, 0);
  } finally {
    sql.close();
  }
});

test("retention uses local calendar days and rejects invalid or out-of-window dates", () => {
  const now = Date.parse("2026-11-10T23:00:00Z");
  assert.equal(purgeTime("2026-11-10", now), null);
  assert.equal(purgeTime("2027-02-30", now), null);
  assert.equal(purgeTime("2028-01-01", now), null);
  assert.equal(new Date(purgeTime("2027-06-10", now)).toISOString(), "2027-09-08T21:00:00.000Z");
});
