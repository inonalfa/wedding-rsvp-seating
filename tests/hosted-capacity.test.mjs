import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createHostedWorker } from "../hosted/worker.ts";

const origin = "https://weddings.example.test";

function fixture(t, { turnstile = true, turnstileOk = true } = {}) {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  sql.exec("PRAGMA foreign_keys=ON");
  const dir = new URL("../hosted/migrations/", import.meta.url);
  for (const name of readdirSync(dir).filter(n => n.endsWith(".sql")).sort()) {
    sql.exec(readFileSync(new URL(name, dir), "utf8"));
  }
  const HOSTED_DB = {
    prepare(query) {
      return {
        bind(...values) {
          return {
            async first() { return sql.prepare(query).get(...values) ?? null; },
            async all() { return { results: sql.prepare(query).all(...values) }; },
            async run() { return { meta: sql.prepare(query).run(...values) }; },
          };
        },
      };
    },
  };
  const sentEmails = [];
  const fetched = [];
  const waitUntilPromises = [];
  const ctx = { waitUntil(p) { waitUntilPromises.push(p); } };
  const allow = { limit: async () => ({ success: true }) };
  const env = {
    HOSTED_DB,
    HOSTED_ORIGIN: origin,
    HOSTED_INVITE_SECRET: Buffer.alloc(32, 5).toString("base64url"),
    HOSTED_AUTH_SECRET: Buffer.alloc(32, 6).toString("base64url"),
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    LOGIN_LIMIT: allow,
    OWNER_LIMIT: allow,
    RECOVERY_LIMIT: allow,
    GUEST_LIMIT: allow,
    CLIENT_LIMIT: allow,
    FEEDBACK_EMAIL_TO: "owner@example.test",
    FEEDBACK_EMAIL_FROM: "feedback@example.test",
    FEEDBACK_EMAIL: { async send(message) { sentEmails.push(message); return { messageId: "m" }; } },
    FEEDBACK_GITHUB_TOKEN: "ghp_test_token_do_not_leak",
    ...(turnstile ? { TURNSTILE_SITE_KEY: "fixture", TURNSTILE_SECRET: "fixture" } : {}),
  };
  const worker = createHostedWorker(async url => {
    const target = String(url);
    fetched.push(target);
    if (target === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
      return Response.json({ success: turnstileOk, hostname: "weddings.example.test", action: "capacity" });
    }
    throw new Error("unexpected fetch " + target);
  });
  const post = (fields, headers = { origin }) => worker.fetch(new Request(origin + "/capacity", {
    method: "POST",
    headers,
    body: new URLSearchParams({ "cf-turnstile-response": "capacity:x", ...fields }),
  }), env, ctx);
  const validFields = { email: "family@example.test", date: "2027-05-20", invitations: "400", guests: "650", tables: "80", note: "חתונה גדולה", paid: "on" };
  return { sql, env, worker, ctx, waitUntilPromises, sentEmails, fetched, post, validFields };
}

const count = sql => sql.prepare("SELECT COUNT(*) AS n FROM feedback").get().n;

test("GET /capacity renders the form with Turnstile CSP only on this page", async t => {
  const { worker, env, ctx } = fixture(t);
  const res = await worker.fetch(new Request(origin + "/capacity"), env, ctx);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-security-policy"), /challenges\.cloudflare\.com/);
  const html = await res.text();
  assert.match(html, /dir="rtl"/);
  assert.match(html, /<title>בקשת הרחבת מכסה - אישור הגעה פלוס<\/title>/);
  assert.match(html, /action="\/capacity"/);
  assert.match(html, /name="email"[^>]*type="email"|type="email"[^>]*name="email"/);
  assert.match(html, /name="paid" type="checkbox" required/);
  assert.match(html, /class="cf-turnstile"[^>]*data-action="capacity"/);
  assert.match(html, /הרחבת מכסה היא שירות בתשלום/);
  assert.doesNotMatch(html, /[\u2013\u2014]/);

  const sent = await (await worker.fetch(new Request(origin + "/capacity?sent=1"), env, ctx)).text();
  assert.match(sent, /role="status">תודה! הבקשה התקבלה ונחזור אליכם במייל\./);

  const landing = await worker.fetch(new Request(origin + "/"), env, ctx);
  assert.doesNotMatch(landing.headers.get("content-security-policy"), /challenges\.cloudflare\.com/);
});

test("valid POST stores one feedback row without GitHub and emails once", async t => {
  const { sql, post, validFields, waitUntilPromises, sentEmails, fetched } = fixture(t);
  const res = await post(validFields);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/capacity?sent=1");
  await Promise.all(waitUntilPromises);
  assert.equal(count(sql), 1);
  const row = sql.prepare("SELECT * FROM feedback").get();
  assert.equal(row.category, "other");
  assert.equal(row.page_url, "/capacity");
  assert.equal(row.reply_email, "family@example.test");
  assert.equal(row.github_status, "skipped");
  assert.equal(row.email_status, "sent");
  assert.ok(row.message.startsWith("[בקשת הרחבת מכסה]\n"));
  assert.match(row.message, /הזמנות: 400/);
  assert.ok(row.message.length <= 2000);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].replyTo, "family@example.test");
  assert.ok(!fetched.some(u => u.includes("api.github.com")));
});

test("invalid Turnstile, missing Turnstile config and cross-origin are rejected without a row", async t => {
  const bad = fixture(t, { turnstileOk: false });
  const res = await bad.post(bad.validFields);
  assert.equal(res.status, 403);
  assert.match(await res.text(), /האימות נכשל\. נסו שוב\./);
  assert.equal(count(bad.sql), 0);

  const none = fixture(t, { turnstile: false });
  const res2 = await none.post(none.validFields);
  assert.equal(res2.status, 403);
  assert.equal(count(none.sql), 0);
  assert.ok(!none.fetched.some(u => u.includes("siteverify")));

  const cross = fixture(t);
  const res3 = await cross.post(cross.validFields, { origin: "https://evil.example" });
  assert.equal(res3.status, 403);
  assert.equal(count(cross.sql), 0);
  assert.equal(cross.fetched.length, 0);
});

test("validation errors return a 400 Hebrew page and store nothing", async t => {
  const f = fixture(t);
  const noEmail = await f.post({ ...f.validFields, email: "" });
  assert.equal(noEmail.status, 400);
  assert.match(await noEmail.text(), /role="alert">יש להזין מייל לחזרה/);

  const unchecked = await f.post({ ...f.validFields, paid: "" });
  assert.equal(unchecked.status, 400);
  assert.match(await unchecked.text(), /כרוכה בתשלום<\/p>/);

  const badNumber = await f.post({ ...f.validFields, tables: "9999" });
  assert.equal(badNumber.status, 400);
  const badDate = await f.post({ ...f.validFields, date: "2027-02-31" });
  assert.equal(badDate.status, 400);
  const badEmail = await f.post({ ...f.validFields, email: "nope" });
  assert.equal(badEmail.status, 400);
  assert.equal(count(f.sql), 0);
});
