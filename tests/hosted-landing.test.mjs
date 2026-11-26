import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { renderLanding } from "../hosted/landing/page.ts";
import { LANDING_VERSION } from "../hosted/landing/version.ts";
import { page } from "../hosted/http.ts";
import { createStore } from "../hosted/public/assets/landing/store.js";
import { GUESTS, TABLES, RECENT } from "../hosted/landing/data.ts";

const origin = "https://rsvp.example.test";
const assetsDir = new URL("../hosted/public/assets/landing/", import.meta.url);
const landingCsp = "default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com";

async function home(error = "") {
  const response = renderLanding(error, origin);
  return { response, html: await response.text(), csp: response.headers.get("content-security-policy") };
}

function landingSources() {
  const files = [];
  const walk = url => {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(new URL(entry.name + "/", url));
      else if (!entry.name.endsWith(".png")) files.push(new URL(entry.name, url));
    }
  };
  walk(new URL("../hosted/landing/", import.meta.url));
  walk(assetsDir);
  return files;
}

test("landing CSP adds only 'self' to script-src", async () => {
  const { response, csp } = await home();
  assert.equal(response.status, 200);
  assert.equal(csp, landingCsp);
});

test("other pages keep their CSP without 'self' in script-src", async () => {
  const legacy = page("x", "", 200).headers.get("content-security-policy");
  assert.equal(legacy, landingCsp.replace("script-src 'self' ", "script-src "));
});

test("worker serves the landing at / and keeps other CSPs unchanged", async () => {
  const { createHostedWorker } = await import("../hosted/worker.ts");
  const worker = createHostedWorker();
  const env = { HOSTED_ORIGIN: origin, GOOGLE_CLIENT_ID: "fictional", GOOGLE_CLIENT_SECRET: "fictional", HOSTED_AUTH_SECRET: Buffer.alloc(32, 1).toString("base64url") };
  const ctx = { waitUntil() {} };
  const get = path => worker.fetch(new Request(origin + path), env, ctx);
  const landing = await get("/");
  assert.equal(landing.headers.get("content-security-policy"), landingCsp);
  assert.match(await landing.text(), new RegExp(`<link rel="canonical" href="${origin}/">`));
  for (const path of ["/privacy", "/terms", "/auth/login"]) {
    const csp = (await get(path)).headers.get("content-security-policy") ?? "";
    const scriptSrc = csp.split(";").find(p => p.trim().startsWith("script-src")) ?? "";
    assert.doesNotMatch(scriptSrc, /'self'/, path);
  }
  const failed = await (await get("/?signin=failed")).text();
  assert.match(failed, /role="alert"/);
});

test("landing markup: headline, CTAs, nav, links, meta", async () => {
  const { html } = await home();
  assert.equal(html.match(/<h1[\s>]/g)?.length, 1);
  assert.match(html, /<h1[^>]*>אישורי הגעה וסידורי הושבה לחתונה\. <em>בחינם\.<\/em><\/h1>/);
  assert.match(html, /href="\/auth\/signup">צרו את האירוע שלכם<\/a>/);
  assert.match(html, /href="\/demo">התנסו בלי הרשמה<\/a>/);
  assert.match(html, /<nav[^>]*aria-label="תפריט ראשי"[\s\S]*?href="\/demo">הדגמה<\/a>[\s\S]*?<\/nav>/);
  assert.match(html, /href="\/auth\/login">כניסה<\/a>/);
  assert.match(html, /src="\/assets\/logo\.webp" alt="אישור הגעה פלוס"/);
  for (const href of ["/privacy", "/terms", "/feedback", "/capacity"]) assert.match(html, new RegExp(`href="${href}"`));
  assert.match(html, /ללא התחייבות לזמינות/);
  assert.match(html, /התחתנו, גילינו כמה מערכת כזו חסרה, ולכן אנחנו מציעים אותה בחינם, כדי לעזור לזוגות נוספים\./);
  assert.match(html, /aria-expanded="false" aria-controls="lp-card"/);
  const description = html.match(/<meta name="description" content="([^"]+)">/)[1];
  assert.ok(description.length >= 70 && description.length <= 160, String(description.length));
  for (const tag of ['property="og:locale" content="he_IL"', 'property="og:type" content="website"', `property="og:image" content="${origin}/assets/landing/og.png"`,
    'property="og:image:width" content="1200"', 'property="og:image:height" content="630"', 'name="twitter:card" content="summary_large_image"', `property="og:url" content="${origin}/"`]) {
    assert.ok(html.includes(tag), tag);
  }
  assert.match(html, new RegExp(`/assets/landing/landing\\.js\\?v=${LANDING_VERSION}`));
  assert.match(html, /<noscript><link rel="stylesheet" href="\/assets\/landing\/nojs\.css\?v=/);
  assert.equal(html.match(/<details/g)?.length >= 6, true);
  assert.doesNotMatch(html, /role="alert"/);
  assert.match((await home("שגיאה")).html, /role="alert">שגיאה</);
});

test("landing markup is CSP-clean and free of forbidden claims", async () => {
  const { html } = await home();
  assert.doesNotMatch(html, /\sstyle=/);
  assert.doesNotMatch(html, /<style/);
  for (const tag of html.match(/<script\b[^>]*>/g) ?? []) assert.match(tag, /\ssrc="/);
  assert.doesNotMatch(html, /wa\.me|api\.whatsapp/);
  assert.doesNotMatch(html, /\sname="(?!description|theme-color|twitter|viewport|color-scheme|lp-theme)/);
  for (const phrase of ["בזמן אמת", "אין מעקב", "ללא הגבלה", "בלי הגבלה", "שליחה אוטומטית", "נשלח אוטומטית", "קוד פתוח", "דנה", "יואב"]) {
    assert.ok(!html.includes(phrase), phrase);
  }
  assert.ok(!html.includes("<main", html.indexOf("<main") + 1), "single main");
});

test("landing sources contain no typographic dashes", () => {
  for (const file of landingSources()) assert.doesNotMatch(readFileSync(file, "utf8"), /[\u2013\u2014\u05BE]/, file.pathname);
});

test("LANDING_VERSION matches the asset hash", () => {
  const hash = createHash("sha256");
  for (const name of readdirSync(assetsDir).filter(n => n !== "og.png").sort()) {
    hash.update(name + "\0");
    hash.update(readFileSync(new URL(name, assetsDir)));
    hash.update("\0");
  }
  assert.equal(LANDING_VERSION, hash.digest("hex").slice(0, 12), "run node scripts/landing-version.mjs");
});

test("landing JS is isolated: no network, storage or cookies, no app imports", () => {
  for (const name of readdirSync(assetsDir).filter(n => n.endsWith(".js"))) {
    const src = readFileSync(new URL(name, assetsDir), "utf8");
    for (const banned of ["fetch(", "XMLHttpRequest", "localStorage", "sessionStorage", "sendBeacon", "document.cookie", "indexedDB", "app.js", "invitation-view", "wa.me"]) {
      assert.ok(!src.includes(banned), `${name}: ${banned}`);
    }
  }
  for (const name of readdirSync(assetsDir).filter(n => n.endsWith(".css"))) {
    const src = readFileSync(new URL(name, assetsDir), "utf8");
    for (const rule of src.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+(?=\{)/g) ?? []) {
      const selector = rule.trim();
      if (!selector || selector.startsWith("@") || /^(from|to|\d+%)/.test(selector)) continue;
      for (const part of selector.split(",")) assert.match(part.trim(), /^body\.landing-page/, `${name}: ${part.trim()}`);
    }
  }
});

test("demo store refuses unconfirmed and over-capacity seating", () => {
  const store = createStore({ guests: GUESTS, tables: TABLES, recent: RECENT });
  assert.equal(store.seat("g4", "t1").reason, "not-coming");
  const res = store.seat("g3", "t4");
  assert.equal(res.reason, "capacity");
  assert.equal(res.needed, 5);
  assert.equal(store.seat("g6", "t4").ok, true);
  assert.equal(store.used("t4"), 4);
  assert.equal(store.counts().seated, 13);
  store.rsvp("g7", "yes", 9, "מזל טוב");
  assert.equal(store.guest("g7").count, 6);
  store.rsvp("g6", "no", 0, "");
  assert.equal(store.guest("g6").table, null);
  store.reset();
  assert.equal(store.guest("g6").table, null);
  assert.equal(store.guest("g7").rsvp, "pending");
  assert.equal(GUESTS.find(g => g.id === "g7").rsvp, "pending");
});
