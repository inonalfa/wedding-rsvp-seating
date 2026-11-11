import assert from "node:assert/strict";
import test from "node:test";
import { hasHeadroom, refreshUsage } from "../hosted/usage.ts";

test("usage snapshots block stale, incomplete and over-threshold observations", async () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  let snapshot = null;
  const db = { prepare(query) { return { bind(...values) { return {
    async first() { return snapshot; },
    async run() {
      if (query.startsWith("INSERT")) {
        const [recorded_at, worker_requests, d1_reads, d1_writes, hosted_bytes] = values;
        snapshot = { recorded_at, worker_requests, d1_reads, d1_writes, hosted_bytes };
      }
      return { meta: { size_after: 12345 } };
    },
  }; } }; } };
  const env = { HOSTED_DB: db, CF_ACCOUNT_ID: "fixture", CF_ANALYTICS_TOKEN: "fixture" };
  const metrics = async () => Response.json({ data: { viewer: { accounts: [{
    workersInvocationsAdaptive: [{ sum: { requests: 12 } }],
    d1QueriesAdaptiveGroups: [{ sum: { rowsRead: 500, rowsWritten: 200 } }],
  }] } } });
  assert.equal(await hasHeadroom(db, now), false);
  assert.equal(await refreshUsage(env, now, async () => Response.json({ errors: [{ message: "unavailable" }] })), false);
  assert.equal(await hasHeadroom(db, now), false);
  assert.equal(await refreshUsage(env, now, metrics), true);
  assert.equal(await hasHeadroom(db, now), true);
  assert.equal(await hasHeadroom(db, now + 7200_000), false);
  snapshot.d1_writes = 60_000;
  assert.equal(await hasHeadroom(db, now), false);
});
