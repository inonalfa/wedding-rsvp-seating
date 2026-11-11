import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker from "../hosted/worker.ts";
import { purgeTime } from "../hosted/events.ts";

test("a signed-in owner can create one event, and other owners cannot read it", async () => {
  const sql = new DatabaseSync(":memory:");
  try {
    for (const name of ["0001_tenants.sql", "0002_sessions.sql", "0003_guest_quota.sql"]) {
      sql.exec(readFileSync(new URL("../hosted/migrations/" + name, import.meta.url), "utf8"));
    }
    const origin = "https://weddings.example.test";
    const env = { HOSTED_ORIGIN: origin, HOSTED_DB: { prepare(query) {
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
      sql.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(hash, owner, Date.now() + 60_000);
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

    assert.doesNotMatch(await (await get("/", "b")).text(), /Fictional event/);
    for (let i = 0; i < 19; i++) {
      sql.prepare("INSERT INTO accounts VALUES (?, ?, 0)").run(String(i), String(i));
      sql.prepare("INSERT INTO events(event_id, owner_id, title, event_date, time_zone, purge_at) VALUES (?, ?, 'Sample', '2027-06-10', 'Asia/Jerusalem', ?)").run(String(i), String(i), Date.now() + 60_000);
    }
    const hash = createHash("sha256").update("a".repeat(43)).digest("base64url");
    sql.prepare("UPDATE sessions SET account_id='b' WHERE token_hash=?").run(hash);
    assert.equal((await create()).status, 409);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM events").get().n, 20);
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
