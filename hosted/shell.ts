import { escapeHtml } from "./http";
import { renderLanding } from "./landing/page";

/** The single-page app shell shared by the signed-in app and the local-only demo. */
export function appShell(mode: "app" | "demo") {
  const title = mode === "demo" ? "הדגמה - אישור הגעה פלוס" : "ניהול האירוע - אישור הגעה פלוס";
  return new Response(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png"><link rel="icon" type="image/png" sizes="512x512" href="/assets/icon-512.png"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/invite.css"><script type="module" src="/assets/app.js"></script></head><body class="app-body"><div id="app" data-mode="${mode}"><div class="boot"><div class="spinner" aria-hidden="true"></div><p>טוענים…</p></div></div><noscript><p class="page-card">האפליקציה דורשת JavaScript.</p></noscript></body></html>`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function landingPage(error = "", origin = "") {
  return renderLanding(error, origin);
}
