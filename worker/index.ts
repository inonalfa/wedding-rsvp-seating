/** Cloudflare Worker entry point for the standalone RSVP application. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { D1Database } from "@cloudflare/workers-types";
import { basicAuthResult, insecureAdminTransport, passwordPolicyFailure, sitesModeGate } from "../lib/basic-auth";
import { runGuestRetention } from "../lib/guest-retention";
import { requestContext } from "../lib/request-context";
import { limitPublicRequest } from "../lib/public-rate-limit";
import type { WeddingRuntimeConfig } from "../lib/runtime-config";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  INVITE_TOKEN_TTL_SECONDS?: string;
  INVITE_TOKENS_EXPIRE_AT?: string;
  SEATING_TOKEN_EPOCH?: string;
  INVITE_TOKEN_SECRET?: string;
  INVITE_SHORT_TOKEN_SECRET?: string;
  MAKE_WEBHOOK_URL?: string;
  ADMIN_EMAILS?: string;
  SEATING_SHEETS_WEBHOOK_URL?: string;
  WHATSAPP_RSVP_SECRET?: string;
  SEATING_SYNC_SECRET?: string;
  DEMO_MODE?: string;
  DEMO_AUTH?: string;
  AUTH_MODE?: string;
  ADMIN_PASSWORD?: string;
  STAFF_PASSWORD?: string;
  REQUIRE_INVITE_TOKEN?: string;
  LEGACY_INVITE_TTL_SECONDS?: string;
  WEBHOOK_HMAC_REQUIRED?: string;
  MAKE_WEBHOOK_HMAC_SECRET?: string;
  SITES_DISPATCH_SECRET?: string;
  GUEST_DATA_RETENTION_AT?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

function runtimeConfig(env: Env): WeddingRuntimeConfig {
  return {
    inviteTokenTtlSeconds: env.INVITE_TOKEN_TTL_SECONDS,
    inviteTokensExpireAt: env.INVITE_TOKENS_EXPIRE_AT,
    legacyInviteTtlSeconds: env.LEGACY_INVITE_TTL_SECONDS,
    seatingTokenEpoch: env.SEATING_TOKEN_EPOCH,
    inviteTokenSecret: env.INVITE_TOKEN_SECRET,
    inviteShortTokenSecret: env.INVITE_SHORT_TOKEN_SECRET,
    makeWebhookUrl: env.MAKE_WEBHOOK_URL,
    makeWebhookHmacSecret: env.MAKE_WEBHOOK_HMAC_SECRET,
    adminEmails: env.ADMIN_EMAILS,
    seatingSheetsWebhookUrl: env.SEATING_SHEETS_WEBHOOK_URL,
    whatsappRsvpSecret: env.WHATSAPP_RSVP_SECRET,
    seatingSyncSecret: env.SEATING_SYNC_SECRET,
    demoMode: env.DEMO_MODE === "1",
    authMode: env.AUTH_MODE,
    requireInviteToken: env.REQUIRE_INVITE_TOKEN,
    webhookHmacRequired: env.WEBHOOK_HMAC_REQUIRED === "1",
  };
}

const worker = {
  async scheduled(_controller: unknown, env: Env) {
    await runGuestRetention(env.DB, env.GUEST_DATA_RETENTION_AT);
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const path = url.pathname;
    const admin = path === '/admin' || path.startsWith('/admin/') || path === '/api/admin' || path.startsWith('/api/admin/');
    const staff = path === '/find-table' || path.startsWith('/find-table/') || path === '/api/find-table' || path.startsWith('/api/find-table/');
    const service = path === '/api/admin/seating/sync';
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    // Browsers attach Origin or Fetch Metadata to unsafe requests. Keep the
    // no-Origin path for authenticated service clients without browser metadata.
    if ((admin || staff) && mutation && invalidBrowserOrigin(request)) {
      return Response.json({ error: 'Cross-origin request denied' }, { status: 403 });
    }
    if ((admin || staff) && insecureAdminTransport(url)) {
      return new Response("גישת ניהול דורשת HTTPS.", { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    let sitesWarning = false;
    if ((admin || staff) && env.AUTH_MODE === "sites") {
      const decision = sitesModeGate({
        AUTH_MODE: env.AUTH_MODE,
        DEMO_MODE: env.DEMO_MODE,
        SITES_DISPATCH_SECRET: env.SITES_DISPATCH_SECRET,
      }, request);
      if (decision instanceof Response) return decision;
      sitesWarning = decision.warning;
    }
    const headers = new Headers(request.headers);
    if (env.AUTH_MODE !== 'sites') {
      headers.delete('oai-authenticated-user-email');
      headers.delete('oai-authenticated-user-full-name');
      headers.delete('oai-authenticated-user-full-name-encoding');
      const bearerService = service && /^Bearer\s+\S/i.test(request.headers.get("authorization") || "");
      if ((admin || staff) && !bearerService) {
        const policy = passwordPolicyFailure(env.DEMO_MODE, env.ADMIN_PASSWORD, env.STAFF_PASSWORD);
        if (policy) return policy;
      }
      if (admin && !bearerService) {
        const demoOpen = env.DEMO_MODE === "1" && env.DEMO_AUTH !== "1";
        if (demoOpen) headers.set("oai-authenticated-user-email", env.ADMIN_EMAILS?.split(",")[0]?.trim() || "demo@example.test");
        else {
          const denied = await basicAuthResult(env.DB, request, "Wedding admin", env.ADMIN_PASSWORD);
          // Bearer-less service calls stay anonymous here; the sync route checks its own secret.
          if (denied && !service) return denied;
          if (!denied) headers.set("oai-authenticated-user-email", env.ADMIN_EMAILS?.split(",")[0]?.trim() || "demo@example.test");
        }
      } else if (staff && (env.DEMO_MODE !== "1" || env.DEMO_AUTH === "1")) {
        const denied = await basicAuthResult(env.DB, request, "Wedding staff", env.STAFF_PASSWORD);
        if (denied) return denied;
      }
    }
    request = new Request(request, { headers });
    const config = runtimeConfig(env);
    const response = await requestContext.run({ db: env.DB, config }, async () => {
    if (path === '/api/rsvp' && request.method === 'POST') {
      const denied = await limitPublicRequest(request, path, 20);
      if (denied) return denied;
    } else if ((path === '/api/invite/open' && request.method === 'POST') || (path === '/api/invite' && request.method === 'GET')) {
      const denied = await limitPublicRequest(request, path, 60);
      if (denied) return denied;
    }
    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
    });
    if (!sitesWarning) return response;
    const warningHeaders = new Headers(response.headers);
    warningHeaders.set("X-Auth-Warning", "AUTH_MODE=sites trusts identity headers without a dispatch secret");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: warningHeaders });
  },
};

export default worker;

function invalidBrowserOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return true;
  const site = request.headers.get('sec-fetch-site');
  return site === 'cross-site' || (request.headers.has('sec-fetch-mode') && !origin && site !== 'same-origin');
}
