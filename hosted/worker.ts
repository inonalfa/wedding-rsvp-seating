import { refreshUsage, usagePage } from "./usage";
import { connectorSnapshot } from "./connectors";
import { limited } from "./abuse";
import { authRoute, hostedOriginAllowed, sessionOwner, type AuthEnv } from "./auth";

import { ownerPage } from "./events";
import { page } from "./http";
import { guestInvitation, invitationCalendar } from "./invites";
import { appApi } from "./api";
import { appShell, landingPage } from "./shell";
import { servePhoto } from "./media";
import { privacyPage, termsPage } from "./legal";
import { tableSearch } from "./table-search";
import { purgeExpired } from "./retention";

export function createHostedWorker(fetcher: typeof fetch = fetch) {
  return {
    async scheduled(_controller: unknown, env: AuthEnv) {
      const now = Date.now();
      await purgeExpired(env.HOSTED_DB, now);
      await refreshUsage(env, now, fetcher);
    },
    async fetch(request: Request, env: AuthEnv): Promise<Response> {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
      }
      if (env.HOSTED_ORIGIN && !hostedOriginAllowed(env.HOSTED_ORIGIN)) {
        return new Response("HOSTED_ORIGIN must use HTTPS outside localhost", { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/")) {
        return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
      }
      const invite = url.pathname.match(/^\/invite\/([a-zA-Z0-9_.-]{1,160})$/);
      const calendar = url.pathname.match(/^\/invite\/([a-zA-Z0-9_.-]{1,160})\/calendar$/);
      const client = request.headers.get("cf-connecting-ip") ?? "unknown";
      const clientKey = async () => {
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(client)));
        return btoa(String.fromCharCode(...digest));
      };
      const connector = url.pathname.match(/^\/api\/connectors\/([a-f0-9-]{36})$/);
      if (connector) {
        const blocked = await limited(env.GUEST_LIMIT, "connector:" + await clientKey());
        return blocked ?? connectorSnapshot(request, env, connector[1]);
      }
      if (calendar && request.method === "GET") {
        const blocked = await limited(env.CLIENT_LIMIT, "guest:" + await clientKey());
        return blocked ?? invitationCalendar(env, calendar[1]);
      }
      const media = url.pathname.match(/^\/media\/([0-9a-f-]{36})$/);
      if (media && request.method === "GET") {
        const blocked = await limited(env.CLIENT_LIMIT, "media:" + await clientKey());
        return blocked ?? servePhoto(env.HOSTED_DB, media[1], Date.now());
      }
      if (request.method === "GET" && url.pathname === "/privacy") return privacyPage();
      if (request.method === "GET" && url.pathname === "/terms") return termsPage();
      if (url.pathname === "/demo" || url.pathname.startsWith("/demo/")) return appShell("demo");
      if (url.pathname.startsWith("/api/app/")) {
        const owner = await sessionOwner(request, env);
        if (!owner) return Response.json({ error: "נדרשת התחברות" }, { status: 401, headers: { "Cache-Control": "no-store" } });
        const blocked = await limited(env.OWNER_LIMIT, "owner:" + owner);
        if (blocked) return Response.json({ error: "יותר מדי פעולות בדקה. נסו שוב בעוד רגע." }, { status: blocked.status, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
        return appApi(request, env, owner);
      }
      if (url.pathname === "/app" || url.pathname.startsWith("/app/")) {
        const owner = await sessionOwner(request, env);
        if (!owner) return new Response(null, { status: 303, headers: { Location: "/auth/login", "Cache-Control": "no-store" } });
        return appShell("app");
      }
      if (invite) {
        const blocked = await limited(env.CLIENT_LIMIT, "guest:" + await clientKey());
        return blocked ?? guestInvitation(request, env, invite[1], Date.now(), fetcher);
      }
      const search = url.pathname.match(/^\/find-table\/([a-f0-9.-]{1,130})$/);
      if (search) {
        const blocked = await limited(env.CLIENT_LIMIT, "staff:" + await clientKey());
        return blocked ?? tableSearch(request, env, search[1]);
      }
      if (url.pathname === "/auth/logout" && request.method === "POST") {
        const blocked = await limited(env.RECOVERY_LIMIT, "logout:" + await clientKey());
        return blocked ?? authRoute(request, env, Date.now(), fetcher);
      }
      if (url.pathname.startsWith("/auth/")) {
        const blocked = await limited(env.LOGIN_LIMIT, "login:" + await clientKey());
        return blocked ?? authRoute(request, env, Date.now(), fetcher);
      }
      if (url.pathname === "/operator/usage" && request.method === "GET") {
        const owner = await sessionOwner(request, env);
        if (!owner) return page("העמוד לא נמצא", "", 404);
        const blocked = await limited(env.OWNER_LIMIT, "owner:" + owner);
        return blocked ?? usagePage(env, owner, Date.now());
      }
      if (url.pathname === "/" || url.pathname === "/events" || url.pathname.startsWith("/events/")) {
        const owner = await sessionOwner(request, env);
        if (owner && url.pathname === "/" && request.method === "GET") {
          return new Response(null, { status: 303, headers: { Location: "/app", "Cache-Control": "no-store" } });
        }
        if (owner) {
          const dataRoute = /^\/events\/[0-9a-f-]{36}\/data$/.test(url.pathname);
          const blocked = dataRoute
            ? await limited(env.RECOVERY_LIMIT, "data:" + owner)
            : await limited(env.OWNER_LIMIT, "owner:" + owner);
          return blocked ?? ownerPage(request, env, owner);
        }
        if (url.pathname !== "/" || request.method !== "GET") return page("נדרשת התחברות", '<a href="/auth/login">כניסה</a>', 401);
        return landingPage(url.searchParams.get("signin") === "failed" ? "ההתחברות לא הצליחה. נסו שוב." : "");
      }
      return new Response("Not found", { status: 404 });
    },
  };
}

const worker = createHostedWorker();
export default worker;
