import type { D1Database } from "@cloudflare/workers-types";

const encoder = new TextEncoder();
const ready = new WeakMap<D1Database, Promise<void>>();
const failureLimit = 8;
const lockSeconds = 15 * 60;
const minimumPasswordLength = 12;
const deniedPasswords = new Set(["password", "admin", "wedding", "changeme", "123456789012"]);

export function insecureAdminTransport(url: URL) {
  if (url.protocol === "https:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
}

export function passwordPolicyFailure(demoMode: string | undefined, adminPassword?: string, staffPassword?: string) {
  if (demoMode === "1") return null;
  const problems: string[] = [];
  for (const [label, value] of [["המנהל", adminPassword], ["הצוות", staffPassword]] as const) {
    if (!value) continue;
    if (value.length < minimumPasswordLength || deniedPasswords.has(value.toLowerCase())) {
      problems.push(`סיסמת ${label} חייבת להיות באורך 12 תווים לפחות ולא סיסמה נפוצה`);
    }
  }
  if (adminPassword && staffPassword && adminPassword === staffPassword) {
    problems.push("סיסמאות המנהל והצוות חייבות להיות שונות");
  }
  if (!problems.length) return null;
  return Response.json({ error: problems.join(". ") }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

function unauthorized(realm: string) {
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`, "Cache-Control": "no-store" },
  });
}

function locked(retryAfter: number) {
  return Response.json({ error: "יותר מדי ניסיונות כניסה. נסו שוב בעוד כמה דקות." }, {
    status: 429,
    headers: { "Retry-After": String(Math.max(1, retryAfter)), "Cache-Control": "no-store" },
  });
}

async function ensureLockouts(db: D1Database) {
  const pending = ready.get(db) ?? db.prepare(`CREATE TABLE IF NOT EXISTS auth_lockouts (
      key text PRIMARY KEY NOT NULL,
      failures integer NOT NULL,
      locked_until integer NOT NULL
    )`).run().then(() => undefined).catch((error: unknown) => {
    ready.delete(db);
    throw error;
  });
  ready.set(db, pending);
  return pending;
}

async function clientKey(request: Request, realm: string) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${realm}\0${ip}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function validBasicPassword(request: Request, expected: string) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Basic ") || authorization.length > 2048) return false;
  try {
    const decoded = atob(authorization.slice(6));
    const colon = decoded.indexOf(":");
    if (colon < 0 || decoded.slice(0, colon) !== "admin") return false;
    const [leftDigest, rightDigest] = await Promise.all([
      crypto.subtle.digest("SHA-256", encoder.encode(decoded.slice(colon + 1))),
      crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    ]);
    const left = new Uint8Array(leftDigest);
    const right = new Uint8Array(rightDigest);
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
  } catch {
    return false;
  }
}

/** Null means the caller may continue. Missing D1 skips lockout so local unit gates still fail closed on the password. */
export async function basicAuthResult(db: D1Database | undefined, request: Request, realm: "Wedding admin" | "Wedding staff", expected: string | undefined) {
  if (!expected) return unauthorized(realm);
  if (!db) return await validBasicPassword(request, expected) ? null : unauthorized(realm);
  try {
    await ensureLockouts(db);
    const key = await clientKey(request, realm);
    const now = Math.floor(Date.now() / 1000);
    const row = await db.prepare("SELECT locked_until FROM auth_lockouts WHERE key=?").bind(key).first<{ locked_until: number }>();
    if (row && row.locked_until > now) return locked(row.locked_until - now);
    if (await validBasicPassword(request, expected)) {
      await db.prepare("DELETE FROM auth_lockouts WHERE key=?").bind(key).run();
      return null;
    }
    const until = now + lockSeconds;
    await db.prepare(`INSERT INTO auth_lockouts (key, failures, locked_until) VALUES (?, 1, 0)
      ON CONFLICT(key) DO UPDATE SET
        failures = CASE WHEN locked_until > ? THEN failures ELSE failures + 1 END,
        locked_until = CASE WHEN locked_until > ? THEN locked_until WHEN failures + 1 >= ? THEN ? ELSE 0 END`).bind(key, now, now, failureLimit, until).run();
    const updated = await db.prepare("SELECT locked_until FROM auth_lockouts WHERE key=?").bind(key).first<{ locked_until: number }>();
    if (updated && updated.locked_until > now) return locked(updated.locked_until - now);
    return unauthorized(realm);
  } catch {
    return Response.json({ error: "אימות המנהל אינו זמין כרגע" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function timingSafeEqual(leftValue: string, rightValue: string) {
  const left = encoder.encode(leftValue);
  const right = encoder.encode(rightValue);
  const length = Math.max(left.length, right.length, 1);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export function sitesModeGate(env: { AUTH_MODE?: string; DEMO_MODE?: string; SITES_DISPATCH_SECRET?: string }, request: Request): { warning: boolean } | Response {
  if (env.AUTH_MODE !== "sites") return { warning: false };
  const secret = env.SITES_DISPATCH_SECRET?.trim() ?? "";
  if (secret) {
    const presented = request.headers.get("x-sites-dispatch") ?? "";
    if (!timingSafeEqual(presented, secret)) {
      return Response.json({ error: "שכבת ה-Sites לא אומתה" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return { warning: false };
  }
  if (env.DEMO_MODE === "0") {
    return Response.json({
      error: "AUTH_MODE=sites נדחה על Worker חשוף. הגדירו SITES_DISPATCH_SECRET בשכבת ה-dispatch, או השתמשו ב-AUTH_MODE=basic.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return { warning: true };
}
