import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createHostedWorker } from "../hosted/worker.ts";
import { invitationKey, signInvitation } from "../hosted/invites.ts";
import { hostedContactEmail } from "../hosted/legal.ts";
import {
  allowedOrigins, hostnameAllowed, hostedOriginAllowed, legacyRedirectResponse, sameAllowedOrigin,
} from "../hosted/origins.ts";

const canonical = "https://rsvp.alfa-ai.co.il";
const legacy = "https://rsvp.hamisrd.co.il";
const foreign = "https://evil.example";

function env(extra = {}) {
  return { HOSTED_ORIGIN: canonical, HOSTED_LEGACY_ORIGINS: legacy, ...extra };
}

test("allowedOrigins includes the canonical host and comma-separated legacy origins", () => {
  const allowed = allowedOrigins(env({ HOSTED_LEGACY_ORIGINS: ` ${legacy}, https://preview.example.test ` }));
  assert.deepEqual([...allowed].sort(), [legacy, "https://preview.example.test", canonical].sort());
  assert.equal(allowedOrigins({}).size, 0);
  assert.equal(allowedOrigins({ HOSTED_LEGACY_ORIGINS: legacy }).size, 0);
  assert.equal(hostedOriginAllowed("http://rsvp.alfa-ai.co.il"), false);
  assert.equal(hostedOriginAllowed("http://127.0.0.1:4174"), true);
  assert.equal(hostnameAllowed("rsvp.hamisrd.co.il", env()), true);
  assert.equal(hostnameAllowed("rsvp.alfa-ai.co.il", env()), true);
  assert.equal(hostnameAllowed("evil.example", env()), false);
});

test("sameAllowedOrigin accepts canonical or legacy when the Origin header matches the request host", () => {
  const base = env();
  const canonicalReq = new Request(canonical + "/feedback", { method: "POST", headers: { origin: canonical } });
  const legacyReq = new Request(legacy + "/feedback", { method: "POST", headers: { origin: legacy } });
  const foreignReq = new Request(foreign + "/feedback", { method: "POST", headers: { origin: foreign } });
  const mismatched = new Request(canonical + "/feedback", { method: "POST", headers: { origin: legacy } });
  const noLegacy = { HOSTED_ORIGIN: canonical };
  assert.equal(sameAllowedOrigin(canonicalReq, base), true);
  assert.equal(sameAllowedOrigin(legacyReq, base), true);
  assert.equal(sameAllowedOrigin(foreignReq, base), false);
  assert.equal(sameAllowedOrigin(mismatched, base), false);
  assert.equal(sameAllowedOrigin(legacyReq, noLegacy), false);
  assert.equal(sameAllowedOrigin(canonicalReq, noLegacy), true);
});

test("legacy redirect is off by default and preserves path plus query when enabled", () => {
  const off = env();
  const path = "/invite/abc.def?saved=1";
  const get = new Request(legacy + path, { method: "GET" });
  const head = new Request(legacy + path, { method: "HEAD" });
  const post = new Request(legacy + path, { method: "POST", headers: { origin: legacy } });
  assert.equal(legacyRedirectResponse(get, off), null);
  assert.equal(legacyRedirectResponse(get, env({ HOSTED_REDIRECT_LEGACY: "0" })), null);

  const on = env({ HOSTED_REDIRECT_LEGACY: "1" });
  const redirectedGet = legacyRedirectResponse(get, on);
  assert.equal(redirectedGet.status, 301);
  assert.equal(redirectedGet.headers.get("location"), canonical + path);
  const redirectedHead = legacyRedirectResponse(head, on);
  assert.equal(redirectedHead.status, 301);
  assert.equal(redirectedHead.headers.get("location"), canonical + path);
  const redirectedPost = legacyRedirectResponse(post, on);
  assert.equal(redirectedPost.status, 308);
  assert.equal(redirectedPost.headers.get("location"), canonical + path);

  assert.equal(legacyRedirectResponse(new Request(canonical + path), on), null);
  assert.equal(legacyRedirectResponse(new Request(foreign + path), on), null);
  const health = legacyRedirectResponse(new Request(legacy + "/health", { method: "GET" }), on);
  assert.equal(health, null);
});

test("hostedContactEmail defaults to office@alfa-ai.co.il and can be overridden", () => {
  assert.equal(hostedContactEmail(), "office@alfa-ai.co.il");
  assert.equal(hostedContactEmail({}), "office@alfa-ai.co.il");
  assert.equal(hostedContactEmail({ HOSTED_CONTACT_EMAIL: "  office@example.test  " }), "office@example.test");
});

function workerFixture(t, extraEnv = {}) {
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
  const sentEmails = [];
  const env = {
    HOSTED_DB,
    HOSTED_ORIGIN: canonical,
    HOSTED_LEGACY_ORIGINS: legacy,
    HOSTED_INVITE_SECRET: Buffer.alloc(32, 7).toString("base64url"),
    TURNSTILE_SITE_KEY: "fixture",
    TURNSTILE_SECRET: "fixture",
    LOGIN_LIMIT: allow,
    OWNER_LIMIT: allow,
    RECOVERY_LIMIT: allow,
    GUEST_LIMIT: allow,
    CLIENT_LIMIT: allow,
    FEEDBACK_EMAIL_TO: "owner@example.test",
    FEEDBACK_EMAIL: {
      async send(message) { sentEmails.push(message); return { messageId: "msg-1" }; },
    },
    ...extraEnv,
  };
  const worker = createHostedWorker(async (url, init) => {
    if (String(url).includes("turnstile")) {
      const body = init.body;
      const response = typeof body?.get === "function" ? String(body.get("response")) : "";
      const [action, hostname] = response.split(":");
      return Response.json({ success: true, hostname: hostname || "rsvp.alfa-ai.co.il", action });
    }
    throw new Error("unexpected fetch " + url);
  });
  return { sql, env, worker, sentEmails };
}

test("worker accepts invite RSVP on a legacy origin and rejects a foreign origin", async t => {
  const { sql, env, worker } = workerFixture(t);
  const now = Date.now();
  const eventId = "10000000-0000-4000-8000-000000000001";
  const guestId = "30000000-0000-4000-8000-000000000003";
  const owner = "owner-account";
  sql.prepare("INSERT INTO accounts(id, provider_subject, created_at) VALUES (?, ?, ?)").run(owner, owner, now);
  sql.prepare("INSERT INTO events (event_id, owner_id, title, event_date, time_zone, purge_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(eventId, owner, "חתונה", "2027-06-10", "Asia/Jerusalem", now + 86_400_000);
  sql.prepare("INSERT INTO guests (event_id, guest_id, name, max_guests) VALUES (?, ?, ?, ?)")
    .run(eventId, guestId, "נועה", 2);
  const token = await signInvitation(await invitationKey(env.HOSTED_INVITE_SECRET), eventId, guestId, 1, now);
  const body = new URLSearchParams({
    attendance: "yes", guest_count: "1", note: "", "cf-turnstile-response": "rsvp:rsvp.hamisrd.co.il",
  });
  const legacyPost = await worker.fetch(new Request(legacy + "/invite/" + token, {
    method: "POST", headers: { origin: legacy }, body,
  }), env);
  assert.equal(legacyPost.status, 303, await legacyPost.clone().text());
  assert.equal(legacyPost.headers.get("location"), "/invite/" + token + "?saved=1#rsvp");

  const foreignPost = await worker.fetch(new Request(foreign + "/invite/" + token, {
    method: "POST",
    headers: { origin: foreign },
    body: new URLSearchParams({ attendance: "no", guest_count: "0", "cf-turnstile-response": "rsvp:evil.example" }),
  }), env);
  assert.equal(foreignPost.status, 403);
});

test("worker redirect is off by default, 301/308 when enabled, and /health is not redirected", async t => {
  const off = workerFixture(t);
  const path = "/invite/token.value?saved=1";
  const stillOnLegacy = await off.worker.fetch(new Request(legacy + "/privacy"), off.env);
  assert.equal(stillOnLegacy.status, 200);
  assert.equal(stillOnLegacy.headers.get("location"), null);

  const on = workerFixture(t, { HOSTED_REDIRECT_LEGACY: "1" });
  const redirected = await on.worker.fetch(new Request(legacy + path), on.env);
  assert.equal(redirected.status, 301);
  assert.equal(redirected.headers.get("location"), canonical + path);

  const posted = await on.worker.fetch(new Request(legacy + path, { method: "POST", headers: { origin: legacy } }), on.env);
  assert.equal(posted.status, 308);
  assert.equal(posted.headers.get("location"), canonical + path);

  const health = await on.worker.fetch(new Request(legacy + "/health"), on.env);
  assert.equal(health.status, 200);
  assert.equal(await health.json().then(body => body.status), "ok");
  assert.equal(health.headers.get("location"), null);

  const canonicalStays = await on.worker.fetch(new Request(canonical + "/privacy"), on.env);
  assert.equal(canonicalStays.status, 200);
  assert.equal(canonicalStays.headers.get("location"), null);
});

test("legal pages use the default alfa-ai contact and honor HOSTED_CONTACT_EMAIL; feedback From defaults to feedback@alfa-ai.co.il", async t => {
  const { env, worker, sentEmails } = workerFixture(t);
  // workerFixture does not set FEEDBACK_EMAIL_FROM
  const privacy = await (await worker.fetch(new Request(canonical + "/privacy"), env)).text();
  const terms = await (await worker.fetch(new Request(canonical + "/terms"), env)).text();
  assert.match(privacy, /mailto:office@alfa-ai\.co\.il/);
  assert.match(terms, /mailto:office@alfa-ai\.co\.il/);
  assert.doesNotMatch(privacy, /office@hamisrd/);

  const overridden = workerFixture(t, { HOSTED_CONTACT_EMAIL: "office@example.test" });
  const custom = await (await overridden.worker.fetch(new Request(canonical + "/privacy"), overridden.env)).text();
  assert.match(custom, /mailto:office@example\.test/);
  assert.doesNotMatch(custom, /mailto:office@alfa-ai\.co\.il/);

  const ctx = { promises: [], waitUntil(p) { this.promises.push(p); } };
  const submitted = await worker.fetch(new Request(canonical + "/feedback", {
    method: "POST",
    headers: { origin: canonical },
    body: new URLSearchParams({ category: "other", message: "בדיקת כתובת השולח בפידבק", email: "", pageUrl: "/" }),
  }), env, ctx);
  assert.equal(submitted.status, 303);
  await Promise.all(ctx.promises);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].from.email, "feedback@alfa-ai.co.il");
});
