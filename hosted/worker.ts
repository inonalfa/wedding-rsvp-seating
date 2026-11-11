import { authRoute, sessionOwner, type AuthEnv } from "./auth";

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const worker = {
  async fetch(request: Request, env: AuthEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (url.pathname.startsWith("/auth/")) return authRoute(request, env);
    if (request.method === "GET" && url.pathname === "/") {
      const signedIn = await sessionOwner(request, env);
      const action = signedIn
        ? '<p>התחברתם בהצלחה.</p><form method="post" action="/auth/logout"><button>התנתקות</button></form>'
        : '<a href="/auth/login">התחברות באמצעות Google</a>';
      const error = url.searchParams.get("signin") === "failed" ? '<p role="alert">ההתחברות לא הצליחה. נסו שוב.</p>' : "";
      return new Response(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>אישורי הגעה וסידורי הושבה</title><main><h1>אישורי הגעה וסידורי הושבה</h1>${error}${action}</main></html>`, { headers });
    }
    return new Response("Not found", { status: 404 });
  },
};

export default worker;
