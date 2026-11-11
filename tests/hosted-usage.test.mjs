import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getUsage, hasHeadroom, refreshUsage } from "../hosted/usage.ts";

const now = Date.parse("2026-11-11T23:30:00Z");
const good = {
  workersInvocationsAdaptive: [{ sum: { requests: 12 } }],
  d1QueriesAdaptiveGroups: [{ sum: { rowsRead: 500, rowsWritten: 200 } }],
};
const payload = account => ({ data: { viewer: { accounts: [account] } } });
const respond = body => async () => Response.json(body);
const zero = payload({
  workersInvocationsAdaptive: [{ sum: { requests: 0 } }],
  d1QueriesAdaptiveGroups: [{ sum: { rowsRead: 0, rowsWritten: 0 } }],
});

function fixture(t) {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  for (const name of ["0007_usage.sql", "0008_usage_refresh_status.sql"]) {
    sql.exec(readFileSync(new URL("../hosted/migrations/" + name, import.meta.url), "utf8"));
  }
  const db = { prepare(query) { return { bind(...values) { return {
    async first() { return sql.prepare(query).get(...values) ?? null; },
    async run() { return { meta: { ...sql.prepare(query).run(...values), size_after: 12345 } }; },
  }; } }; } };
  return { db, env: { HOSTED_DB: db, CF_ACCOUNT_ID: "fixture", CF_ANALYTICS_TOKEN: "fixture" } };
}

test("missing or failed usage refresh closes admission without changing the last valid measurement", async t => {
  const { db, env } = fixture(t);
  const failures = [
    respond(payload({ workersInvocationsAdaptive: [], d1QueriesAdaptiveGroups: [] })),
    respond(payload({ ...good, workersInvocationsAdaptive: [] })),
    respond(payload({ ...good, d1QueriesAdaptiveGroups: [] })),
    respond(payload({ ...good, workersInvocationsAdaptive: null })),
    respond(payload({ ...good, d1QueriesAdaptiveGroups: [null] })),
    respond(payload({ ...good, workersInvocationsAdaptive: [{ sum: { requests: null } }] })),
    respond(payload({ ...good, d1QueriesAdaptiveGroups: [{ sum: { rowsRead: 0 } }] })),
    respond(payload({ ...good, d1QueriesAdaptiveGroups: [{ sum: null }] })),
    respond({ data: null }),
    respond({ ...payload(good), errors: null }),
    respond({ ...payload(good), errors: [{ message: "partial response" }] }),
    async () => new Response("unavailable", { status: 503 }),
    async () => { throw new Error("network failure"); },
  ];
  assert.equal(await hasHeadroom(db, now), false);
  assert.equal(await refreshUsage(env, now, failures[0]), false);
  assert.equal(await getUsage(db), null);
  for (const [i, failure] of failures.entries()) {
    const sampleAt = now + i * 1000;
    assert.equal(await refreshUsage(env, sampleAt, respond(payload(good))), true);
    assert.equal(await hasHeadroom(db, sampleAt), true);
    assert.equal(await refreshUsage(env, sampleAt + 1, failure), false);
    assert.deepEqual({ ...await getUsage(db) }, {
      recorded_at: sampleAt, worker_requests: 12, d1_reads: 500, d1_writes: 200,
      hosted_bytes: 12345, last_attempt_ok: 0,
    });
    assert.equal(await hasHeadroom(db, sampleAt + 1), false);
  }
});

test("explicit zero is valid; stale, prior-day and over-threshold measurements close admission", async t => {
  const { db, env } = fixture(t);
  assert.equal(await refreshUsage(env, now, respond(zero)), true);
  assert.equal(await hasHeadroom(db, now), true);
  assert.equal(await hasHeadroom(db, Date.parse("2026-11-12T00:00:00Z") - 1), true);
  assert.equal(await hasHeadroom(db, Date.parse("2026-11-12T00:00:00Z")), false);
  const noon = Date.parse("2026-11-12T12:00:00Z");
  assert.equal(await refreshUsage(env, noon, respond(zero)), true);
  assert.equal(await hasHeadroom(db, noon + 7200_000 - 1), true);
  assert.equal(await hasHeadroom(db, noon + 7200_000), false);
  assert.equal(await refreshUsage(env, noon + 1, respond(payload({
    ...good, d1QueriesAdaptiveGroups: [{ sum: { rowsRead: 0, rowsWritten: 60_000 } }],
  }))), true);
  assert.equal(await hasHeadroom(db, noon + 1), false);
  await refreshUsage(env, noon, respond(zero)); // An older result cannot reopen the gate.
  assert.equal(await hasHeadroom(db, noon + 1), false);
});
