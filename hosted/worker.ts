import { connectorSnapshot } from "./connectors";
import { limited } from "./abuse";
import { authRoute, sessionOwner, type AuthEnv } from "./auth";

import { ownerPage } from "./events";
import { page } from "./http";
import { guestInvitation } from "./invites";
import { tableSearch } from "./table-search";
import { purgeExpired } from "./retention";

export function createHostedWorker(fetcher: typeof fetch = fetch) {
  return {
    async scheduled(_controller: unknown, env: AuthEnv) {
      await purgeExpired(env.HOSTED_DB, Date.now());
    },
    async fetch(request: Request, env: AuthEnv): Promise<Response> {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
      }
      const invite = url.pathname.match(/^\/invite\/([a-zA-Z0-9_.-]{1,160})$/);
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
      if (invite) {
        const blocked = await limited(env.CLIENT_LIMIT, "guest:" + await clientKey());
        return blocked ?? guestInvitation(request, env, invite[1], Date.now(), fetcher);
      }
      const search = url.pathname.match(/^\/find-table\/([a-f0-9.-]{1,130})$/);
      if (search) {
        const blocked = await limited(env.CLIENT_LIMIT, "staff:" + await clientKey());
        return blocked ?? tableSearch(request, env, search[1]);
      }
      if (url.pathname.startsWith("/auth/")) {
        const blocked = await limited(env.LOGIN_LIMIT, "login:" + await clientKey());
        return blocked ?? authRoute(request, env, Date.now(), fetcher);
      }
      if (url.pathname === "/" || url.pathname === "/events" || url.pathname.startsWith("/events/")) {
        const owner = await sessionOwner(request, env);
        if (owner) return ownerPage(request, env, owner);
        if (url.pathname !== "/" || request.method !== "GET") return page("נדרשת התחברות", '<a href="/">חזרה</a>', 401);
        const error = url.searchParams.get("signin") === "failed" ? '<p role="alert">ההתחברות לא הצליחה. נסו שוב.</p>' : "";
        return page("אישורי הגעה וסידורי הושבה", error + '<a href="/auth/login">התחברות באמצעות Google</a>');
      }
      return new Response("Not found", { status: 404 });
    },
  };
}

const worker = createHostedWorker();
export default worker;
