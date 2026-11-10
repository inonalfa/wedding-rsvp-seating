import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.doesNotMatch(html, developmentPreviewMeta);
  assert.match(html, /name=["']fullName["']/i);
  assert.doesNotMatch(html, /name=["']phone["']/i);
  assert.match(html, /href=["']\/api\/calendar["']/i);
  assert.match(html, /waze\.com\/ul/i);
  assert.match(html, /google\.com\/maps/i);
  assert.match(html, /גן האירועים/);
  assert.doesNotMatch(html, /תמודיאון/);
  assert.ok(html.indexOf("footer-message") < html.indexOf("venue-map"));
  assert.match(html, /aria-label="דנה ויואב מתחתנים"/);
  assert.match(html, /אהבה שהופכת לבית/);
  assert.match(html, /class="love-canvas"/);
  assert.doesNotMatch(html, /love-control|ניגון חוזר של האנימציה|השהיית האנימציה/);
  assert.ok(html.indexOf('class="hero-names"') < html.indexOf('class="love-story"'));
});

test("serves a ready-to-import wedding calendar event", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("calendar-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/api/calendar"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/calendar\b/i);
  const calendar = await response.text();
  assert.match(calendar, /DTSTART:20270610T163000Z/);
  assert.match(calendar, /LOCATION:גן האירועים\\, תל אביב/);
  assert.doesNotMatch(calendar, /תמודיאון/);
});
