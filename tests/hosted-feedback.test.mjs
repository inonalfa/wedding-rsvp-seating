import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createHostedWorker } from "../hosted/worker.ts";
import { parseFeedbackInput } from "../hosted/feedback.ts";

const origin = "https://weddings.example.test";

function fixture(t, { withEmail = true, withGithub = true, emailFail = false, githubStatus = 201 } = {}) {
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

  const sentEmails = [];
  const githubCalls = [];
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
    HOSTED_PASSWORD_LOGIN: "1",
    TURNSTILE_SITE_KEY: "fixture",
    TURNSTILE_SECRET: "fixture",
    LOGIN_LIMIT: allow,
    OWNER_LIMIT: allow,
    RECOVERY_LIMIT: allow,
    GUEST_LIMIT: allow,
    CLIENT_LIMIT: allow,
    ...(withEmail ? {
      FEEDBACK_EMAIL_TO: "owner@example.test",
      FEEDBACK_EMAIL_FROM: "feedback@example.test",
      FEEDBACK_EMAIL: {
        async send(message) {
          if (emailFail) {
            const err = new Error("Simulated delivery failure");
            err.code = "E_DELIVERY_FAILED";
            throw err;
          }
          sentEmails.push(message);
          return { messageId: "msg-123" };
        },
      },
    } : {}),
    ...(withGithub ? {
      FEEDBACK_GITHUB_TOKEN: "ghp_test_token_do_not_leak",
      FEEDBACK_GITHUB_REPO: "inonalfa/wedding-rsvp-seating",
    } : {}),
  };

  const worker = createHostedWorker(async (url, init) => {
    const target = String(url);
    if (target.includes("turnstile")) {
      return Response.json({ success: true, hostname: "weddings.example.test", action: "signup" });
    }
    if (target.startsWith("https://api.github.com/repos/")) {
      githubCalls.push({ url: target, headers: init?.headers, body: JSON.parse(String(init?.body ?? "{}")) });
      if (githubStatus >= 400) {
        return new Response(JSON.stringify({ message: "error" }), { status: githubStatus });
      }
      return Response.json({ number: 42 }, { status: githubStatus });
    }
    throw new Error("unexpected fetch " + target);
  });

  const signup = async (username = "couple@example.test") => {
    const res = await worker.fetch(new Request(origin + "/auth/signup", {
      method: "POST",
      headers: { origin },
      body: new URLSearchParams({
        username,
        password: "Correct-Horse-91",
        confirm: "Correct-Horse-91",
        name: "דנה ויואב",
        "cf-turnstile-response": "signup:x",
      }),
    }), env, ctx);
    if (res.status === 404 || res.status === 503) {
      // Turnstile not configured in fixture; insert account and session directly.
      const id = crypto.randomUUID();
      const token = "a".repeat(43);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const tokenHash = Buffer.from(digest).toString("base64url");
      sql.prepare("INSERT INTO accounts(id, provider_subject, created_at, display_name) VALUES (?, ?, ?, ?)").run(id, "local:" + id, Date.now(), "דנה ויואב");
      sql.prepare("INSERT INTO sessions(token_hash, account_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, id, Date.now() + 86_400_000);
      return { cookie: "__Host-hosted_session=" + token, accountId: id };
    }
    assert.equal(res.status, 303);
    return { cookie: res.headers.get("set-cookie").split(";")[0], accountId: sql.prepare("SELECT id FROM accounts LIMIT 1").get().id };
  };

  return { sql, env, worker, ctx, waitUntilPromises, sentEmails, githubCalls, signup };
}

test("parseFeedbackInput validates fields and strips unsafe pageUrl", () => {
  assert.throws(() => parseFeedbackInput({ message: "hi" }, origin), { status: 400 });
  assert.throws(() => parseFeedbackInput({ message: "x".repeat(2001) }, origin), { status: 400 });
  assert.throws(() => parseFeedbackInput({ message: "בדיקה תקינה", category: "unknown" }, origin), { status: 400 });
  assert.throws(() => parseFeedbackInput({ message: "בדיקה תקינה", email: "bad\r\nbcc:x@y.com" }, origin), { status: 400 });
  assert.throws(() => parseFeedbackInput({ message: "בדיקה תקינה", email: "not-an-email" }, origin), { status: 400 });

  const external = parseFeedbackInput({
    category: "bug",
    message: "לא נפתח מסך ההושבה",
    email: "user@example.test",
    pageUrl: "https://evil.example/phish",
  }, origin, "/app#/seating");
  assert.equal(external.category, "bug");
  assert.equal(external.pageUrl, "/app#/seating");

  const sameOrigin = parseFeedbackInput({
    category: "idea",
    message: "רעיון מעולה למערכת",
    pageUrl: origin + "/app#/guests",
  }, origin);
  assert.equal(sameOrigin.pageUrl, "/app#/guests");
});

test("public pages link to /feedback and /feedback renders Hebrew RTL form", async t => {
  const { worker, env, ctx } = fixture(t);
  for (const path of ["/", "/privacy", "/terms", "/auth/login"]) {
    const html = await (await worker.fetch(new Request(origin + path), env, ctx)).text();
    assert.match(html, /href="\/feedback"/, path);
  }
  const page = await worker.fetch(new Request(origin + "/feedback?from=/demo%23/seating"), env, ctx);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /dir="rtl"/);
  assert.match(html, /action="\/feedback"/);
  assert.match(html, /value="\/demo#\/seating"/);

  const appJs = readFileSync(new URL("../hosted/public/assets/app.js", import.meta.url), "utf8");
  assert.match(appJs, /data-action="feedback"/);
  assert.match(appJs, /\/api\/feedback/);
});

test("signed-in /api/app/feedback saves to D1, sends email and opens GitHub issue without leaking PII", async t => {
  const { sql, env, worker, ctx, waitUntilPromises, sentEmails, githubCalls, signup } = fixture(t);
  const { cookie, accountId } = await signup();

  const unauth = await worker.fetch(new Request(origin + "/api/app/feedback", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ message: "ניסיון בלי התחברות" }),
  }), env, ctx);
  assert.equal(unauth.status, 401);

  const crossOrigin = await worker.fetch(new Request(origin + "/api/app/feedback", {
    method: "POST",
    headers: { origin: "https://evil.example", cookie, "content-type": "application/json" },
    body: JSON.stringify({ message: "בקשה זדונית" }),
  }), env, ctx);
  assert.equal(crossOrigin.status, 403);

  const res = await worker.fetch(new Request(origin + "/api/app/feedback", {
    method: "POST",
    headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({
      category: "bug",
      message: "כפתור השמירה לא מגיב\nבדפדפן נייד",
      email: "couple.private@example.test",
      pageUrl: "/app#/details",
    }),
  }), env, ctx);
  assert.equal(res.status, 201);
  const payload = await res.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.id);

  await Promise.all(waitUntilPromises);

  const row = sql.prepare("SELECT * FROM feedback WHERE feedback_id = ?").get(payload.id);
  assert.equal(row.account_id, accountId);
  assert.equal(row.category, "bug");
  assert.equal(row.reply_email, "couple.private@example.test");
  assert.equal(row.page_url, "/app#/details");
  assert.equal(row.email_status, "sent");
  assert.equal(row.github_status, "created");
  assert.equal(row.github_issue_number, 42);

  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "owner@example.test");
  assert.equal(sentEmails[0].replyTo, "couple.private@example.test");
  assert.match(sentEmails[0].text, /couple\.private@example\.test/);
  assert.doesNotMatch(sentEmails[0].subject, /[\u2013\u2014]/);

  assert.equal(githubCalls.length, 1);
  assert.equal(githubCalls[0].url, "https://api.github.com/repos/inonalfa/wedding-rsvp-seating/issues");
  assert.equal(githubCalls[0].headers["User-Agent"], "wedding-rsvp-seating-hosted");
  assert.match(githubCalls[0].body.title, /^\[פידבק - דיווח על תקלה\]/);
  assert.doesNotMatch(githubCalls[0].body.body, /couple\.private@example\.test/);
  assert.doesNotMatch(githubCalls[0].body.body, new RegExp(accountId));
});

test("public /feedback form and /api/feedback enforce rate limit and degrade gracefully when delivery is unconfigured or fails", async t => {
  // 1. Missing email binding and GitHub token
  const unconfigured = fixture(t, { withEmail: false, withGithub: false });
  const formRes = await unconfigured.worker.fetch(new Request(origin + "/feedback", {
    method: "POST",
    headers: { origin },
    body: new URLSearchParams({ category: "idea", message: "אפשר להוסיף ייצוא PDF?", email: "", pageUrl: "/" }),
  }), unconfigured.env, unconfigured.ctx);
  assert.equal(formRes.status, 303);
  assert.equal(formRes.headers.get("location"), "/feedback?sent=1");
  await Promise.all(unconfigured.waitUntilPromises);
  const saved = unconfigured.sql.prepare("SELECT * FROM feedback").get();
  assert.equal(saved.account_id, null);
  assert.equal(saved.email_status, "skipped");
  assert.equal(saved.github_status, "skipped");

  // 2. Failing email + failing GitHub still return 201 and preserve D1 record
  const failing = fixture(t, { emailFail: true, githubStatus: 500 });
  const apiRes = await failing.worker.fetch(new Request(origin + "/api/feedback", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ category: "other", message: "פידבק מתוך ההדגמה", pageUrl: "/demo" }),
  }), failing.env, failing.ctx);
  assert.equal(apiRes.status, 201);
  await Promise.all(failing.waitUntilPromises);
  const failedRow = failing.sql.prepare("SELECT * FROM feedback").get();
  assert.equal(failedRow.email_status, "failed");
  assert.equal(failedRow.github_status, "failed");
  assert.equal(failedRow.github_issue_number, null);

  // 3. Rate limit returns 429
  failing.env.GUEST_LIMIT = { limit: async () => ({ success: false }) };
  const limitedRes = await failing.worker.fetch(new Request(origin + "/api/feedback", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ message: "עוד הודעה מהירה" }),
  }), failing.env, failing.ctx);
  assert.equal(limitedRes.status, 429);
});
