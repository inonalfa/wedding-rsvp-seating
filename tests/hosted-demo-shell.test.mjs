import assert from "node:assert/strict";
import test from "node:test";
import { appShell } from "../hosted/shell.ts";

for (const mode of ["demo", "app"]) {
  test(`${mode} shell sends a CSP that allows Cloudflare Insights only`, async () => {
    const csp = appShell(mode).headers.get("content-security-policy");
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self' https:\/\/static\.cloudflareinsights\.com;/);
    assert.match(csp, /connect-src 'self' https:\/\/cloudflareinsights\.com;/);
  });
}

test("demo shell uses the product brand and PNG icons", async () => {
  const html = await appShell("demo").text();
  assert.match(html, /<title>הדגמה - אישור הגעה פלוס<\/title>/);
  assert.ok(html.includes("אישור הגעה פלוס"));
  assert.ok(!html.includes("בקליק"));
  assert.ok(!html.includes("favicon.svg"));
  assert.ok(!html.includes("png\">}"));
  assert.ok(html.includes("/assets/apple-touch-icon.png"));
});
