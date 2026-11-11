import type { UsageEnv } from "./usage";
import { checkChallenge, widget, type AbuseEnv } from "./abuse";
import { page, readForm } from "./http";
import type { D1Database } from "@cloudflare/workers-types";

export interface AuthEnv extends AbuseEnv, UsageEnv {
  HOSTED_DB: D1Database;
  HOSTED_ORIGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  HOSTED_AUTH_SECRET?: string;
  HOSTED_INVITE_SECRET?: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sessionCookie = "__Host-hosted_session";
const loginCookie = "__Host-hosted_login";
const googleIssuer = "https://accounts.google.com";

function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function decode(value: string) {
  if (!/^[\w-]+$/.test(value)) throw new Error("Invalid base64url");
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
function random() { return encode(crypto.getRandomValues(new Uint8Array(32))); }
async function hash(value: string) {
  return encode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
function getCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map(x => x.trim())
    .find(x => x.startsWith(name + "="))?.slice(name.length + 1);
}
function cookie(name: string, value: string, age: number) {
  return `${name}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;
}
function redirect(url: string, cookies: string[] = []) {
  const headers = new Headers({ Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 303, headers });
}
async function signingKey(secret: string) {
  const bytes = decode(secret);
  if (bytes.byteLength !== 32) throw new Error("Invalid auth key");
  return crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
type Login = { state: string; nonce: string; verifier: string; expires: number };
async function signLogin(login: Login, secret: string) {
  const data = encode(encoder.encode(JSON.stringify(login)));
  const mac = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(data));
  return data + "." + encode(new Uint8Array(mac));
}
async function verifyLogin(value: string, secret: string, now: number): Promise<Login> {
  if (value.length > 1500) throw new Error("Invalid login");
  const [data, mac, extra] = value.split(".");
  if (!data || !mac || extra !== undefined ||
      !await crypto.subtle.verify("HMAC", await signingKey(secret), decode(mac), encoder.encode(data))) {
    throw new Error("Invalid login");
  }
  const login = JSON.parse(decoder.decode(decode(data))) as Login;
  if (login.expires <= now) throw new Error("Expired login");
  return login;
}

export async function verifyGoogleIdToken(token: string, client: string, nonce: string, now: number, fetcher: typeof fetch) {
  if (token.length > 8192) throw new Error("Invalid ID token");
  const [head, data, signature, extra] = token.split(".");
  if (!head || !data || !signature || extra !== undefined) throw new Error("Invalid ID token");
  const header = JSON.parse(decoder.decode(decode(head)));
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Invalid signing algorithm");
  const response = await fetcher("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Google keys unavailable");
  const body = await response.json() as { keys: (JsonWebKey & { kid: string })[] };
  const jwk = body.keys.find(key => key.kid === header.kid && key.kty === "RSA" && key.use === "sig");
  if (!jwk) throw new Error("Unknown Google signing key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(signature), encoder.encode(head + "." + data))) {
    throw new Error("Invalid Google signature");
  }
  const claims = JSON.parse(decoder.decode(decode(data)));
  if (claims.iss !== googleIssuer || claims.aud !== client || (claims.azp && claims.azp !== client) ||
      claims.nonce !== nonce || typeof claims.exp !== "number" || claims.exp * 1000 <= now ||
      typeof claims.sub !== "string" || !/^[\w-]{1,255}$/.test(claims.sub)) {
    throw new Error("Invalid Google claims");
  }
  return claims.sub as string;
}

export async function sessionOwner(request: Request, env: AuthEnv, now = Date.now(), maxAgeMs = 86400_000) {
  const token = getCookie(request, sessionCookie);
  if (!token || !/^[\w-]{43}$/.test(token)) return null;
  return (await env.HOSTED_DB.prepare("SELECT account_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await hash(token), now + 86400_000 - maxAgeMs).first<{ account_id: string }>())?.account_id ?? null;
}

export async function authRoute(request: Request, env: AuthEnv, now = Date.now(), fetcher: typeof fetch = fetch) {
  const url = new URL(request.url);
  const { HOSTED_ORIGIN: origin, GOOGLE_CLIENT_ID: client, GOOGLE_CLIENT_SECRET: clientSecret, HOSTED_AUTH_SECRET: secret } = env;
  const callback = origin + "/auth/callback";
  if (!origin || url.origin !== origin || !client || !clientSecret || !secret) {
    return new Response("Sign-in unavailable", { status: 503 });
  }
  if (request.method === "POST" && url.pathname === "/auth/logout" && request.headers.get("origin") === origin) {
    const token = getCookie(request, sessionCookie);
    if (token && /^[\w-]{43}$/.test(token)) {
      await env.HOSTED_DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hash(token)).run();
    }
    return redirect("/", [cookie(sessionCookie, "", 0)]);
  }
  if (url.pathname === "/auth/login" && request.method === "GET") {
    const challenge = widget(env, "login");
    if (!challenge) return page("ההתחברות אינה זמינה כרגע", "", 503);
    return page("התחברות לשירות", `<form method="post">${challenge}<button>המשך עם Google</button></form>`, 200, true);
  }
  if (request.method === "POST" && url.pathname === "/auth/login") {
    if (request.headers.get("origin") !== origin ||
        !await checkChallenge(env, await readForm(request, 4096), "login", fetcher)) {
      return page("האימות נכשל", '<a href="/auth/login">נסו שוב</a>', 403);
    }
    const login = { state: random(), nonce: random(), verifier: random(), expires: now + 300_000 };
    const params = new URLSearchParams({
      client_id: client, redirect_uri: callback, response_type: "code", scope: "openid",
      state: login.state, nonce: login.nonce, code_challenge: await hash(login.verifier), code_challenge_method: "S256",
    });
    return redirect(googleIssuer + "/o/oauth2/v2/auth?" + params, [cookie(loginCookie, await signLogin(login, secret), 300)]);
  }
  if (request.method !== "GET" || url.pathname !== "/auth/callback") return new Response("Not found", { status: 404 });
  const clear = cookie(loginCookie, "", 0);
  try {
    const login = await verifyLogin(getCookie(request, loginCookie) ?? "", secret, now);
    const code = url.searchParams.get("code");
    if (!code || code.length > 2048 || url.searchParams.get("state") !== login.state) throw new Error("Invalid callback");
    const exchange = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST", body: new URLSearchParams({
        code, client_id: client, client_secret: clientSecret, redirect_uri: callback,
        grant_type: "authorization_code", code_verifier: login.verifier,
      }), signal: AbortSignal.timeout(5000),
    });
    if (!exchange.ok) throw new Error("Token exchange failed");
    const { id_token: idToken } = await exchange.json() as { id_token: string };
    const subject = await verifyGoogleIdToken(idToken, client, login.nonce, now, fetcher);
    await env.HOSTED_DB.prepare("INSERT INTO accounts VALUES (?, ?, ?) ON CONFLICT(provider_subject) DO NOTHING")
      .bind(crypto.randomUUID(), subject, now).run();
    const token = random();
    await env.HOSTED_DB.prepare(`INSERT INTO sessions SELECT ?, id, ? FROM accounts WHERE provider_subject = ?`)
      .bind(await hash(token), now + 86400_000, subject).run();
    return redirect("/", [clear, cookie(sessionCookie, token, 86400)]);
  } catch {
    return redirect("/?signin=failed", [clear]);
  }
}
