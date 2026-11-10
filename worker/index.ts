/** Cloudflare Worker entry point for the standalone RSVP application. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { D1Database } from "@cloudflare/workers-types";
import { requestContext } from "../lib/request-context";
import { limitPublicRequest } from "../lib/public-rate-limit";

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

const worker = {
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
    const headers = new Headers(request.headers);
    if (env.AUTH_MODE !== 'sites') {
      headers.delete('oai-authenticated-user-email');
      headers.delete('oai-authenticated-user-full-name');
      headers.delete('oai-authenticated-user-full-name-encoding');
      if (admin) {
        const authenticated = (env.DEMO_MODE === '1' && env.DEMO_AUTH !== '1') ||
          !!(env.ADMIN_PASSWORD && await validBasicPassword(request, env.ADMIN_PASSWORD));
        if (authenticated) headers.set('oai-authenticated-user-email', env.ADMIN_EMAILS?.split(',')[0]?.trim() || 'demo@example.test');
        else if (!service) return authRequired('Wedding admin');
        // The sync handler independently checks service Bearer credentials.
      } else if (staff && (env.DEMO_MODE !== '1' || env.DEMO_AUTH === '1') && !(env.STAFF_PASSWORD && await validBasicPassword(request, env.STAFF_PASSWORD))) return authRequired('Wedding staff');
    }
    request = new Request(request, { headers });
    const config = {
      inviteTokenTtlSeconds: env.INVITE_TOKEN_TTL_SECONDS,
      inviteTokensExpireAt: env.INVITE_TOKENS_EXPIRE_AT,
      seatingTokenEpoch: env.SEATING_TOKEN_EPOCH,
      inviteTokenSecret: env.INVITE_TOKEN_SECRET,
      inviteShortTokenSecret: env.INVITE_SHORT_TOKEN_SECRET,
      makeWebhookUrl: env.MAKE_WEBHOOK_URL,
      adminEmails: env.ADMIN_EMAILS,
      seatingSheetsWebhookUrl: env.SEATING_SHEETS_WEBHOOK_URL,
      whatsappRsvpSecret: env.WHATSAPP_RSVP_SECRET,
      seatingSyncSecret: env.SEATING_SYNC_SECRET,
      demoMode: env.DEMO_MODE === '1',
      authMode: env.AUTH_MODE,
    };
    return requestContext.run({ db: env.DB, config }, async () => {
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
  },
};

export default worker;

function authRequired(realm: string): Response {
  return new Response('Authentication required', { status: 401, headers: { 'WWW-Authenticate': `Basic realm="${realm}", charset="UTF-8"`, 'Cache-Control': 'no-store' } });
}

function invalidBrowserOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return true;
  const site = request.headers.get('sec-fetch-site');
  return site === 'cross-site' || (request.headers.has('sec-fetch-mode') && !origin && site !== 'same-origin');
}
async function validBasicPassword(request: Request, expected: string): Promise<boolean> {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Basic ') || authorization.length > 2048) return false;
  try {
    const decoded = atob(authorization.slice(6));
    const colon = decoded.indexOf(':');
    if (colon < 0 || decoded.slice(0, colon) !== 'admin') return false;
    const encoder = new TextEncoder();
    const [a,b] = await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(decoded.slice(colon+1))),crypto.subtle.digest('SHA-256',encoder.encode(expected))]);
    const left = new Uint8Array(a),right = new Uint8Array(b); let difference = 0;
    for(let i=0;i<left.length;i++) difference |= left[i] ^ right[i];
    return difference === 0;
  } catch { return false; }
}
