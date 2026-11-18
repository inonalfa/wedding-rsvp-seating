export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type PageOptions = { turnstile?: boolean; googleRedirect?: boolean; bare?: boolean; bodyClass?: string; head?: string };

/** Server-rendered page with the shared stylesheet and a strict CSP. Markup must already be escaped. */
export function page(title: string, markup: string, status = 200, turnstile = false, googleRedirect = false, options: PageOptions = {}) {
  const useTurnstile = turnstile || options.turnstile;
  const google = googleRedirect || options.googleRedirect;
  const heading = options.bare ? "" : `<h1>${escapeHtml(title)}</h1>`;
  const frame = options.bare ? markup
    : `<header class="site-bar"><a class="brand" href="/">חתונה<span>.</span>בקליק</a></header><main class="page-card">${heading}${markup}</main>`;
  return new Response(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/app.css">${options.head ?? ""}${useTurnstile ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ""}</head><body class="${escapeHtml(options.bodyClass ?? "plain")}">${frame}</body></html>`, {
    status, headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'self'${google ? " https://accounts.google.com" : ""}; frame-ancestors 'none'; base-uri 'none'` + (useTurnstile ? "; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com" : ""),
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export function redirectTo(path: string) {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}

export async function readForm(request: Request, limit: number) {
  if (!request.body || Number(request.headers.get("content-length")) > limit) return null;
  const reader = request.body.getReader();
  const buffer = new Uint8Array(limit);
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.byteLength > limit) {
        await reader.cancel();
        return null;
      }
      buffer.set(value, length);
      length += value.byteLength;
    }
    return await new Response(buffer.subarray(0, length), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
