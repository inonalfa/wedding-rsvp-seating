import { authRoute, sessionOwner, type AuthEnv } from "./auth";

import { ownerPage } from "./events";
import { page } from "./http";
import { guestInvitation } from "./invites";
import { tableSearch } from "./table-search";
import { purgeExpired } from "./retention";

const worker = {
  async scheduled(_controller: unknown, env: AuthEnv) {
    await purgeExpired(env.HOSTED_DB, Date.now());
  },
  async fetch(request: Request, env: AuthEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
    }
    const invite = url.pathname.match(/^\/invite\/([a-zA-Z0-9_.-]{1,160})$/);
    if (invite) return guestInvitation(request, env, invite[1]);
    const search = url.pathname.match(/^\/find-table\/([a-f0-9.-]{1,130})$/);
    if (search) return tableSearch(request, env, search[1]);
    if (url.pathname.startsWith("/auth/")) return authRoute(request, env);
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

export default worker;
