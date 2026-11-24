import type { D1Database } from "@cloudflare/workers-types";
import { checkChallenge, widget } from "./abuse";
import { cookie, hash, random, recordSession, redirect, sessionCookie, type AuthEnv } from "./auth";
import { escapeHtml, page, readForm } from "./http";

const encoder = new TextEncoder();
const algorithm = "pbkdf2-sha256";
/** Workers caps PBKDF2 at 100,000 iterations. The count is stored with each hash so it can change later. */
export const defaultIterations = 100_000;

function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function unb64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string, iterations = defaultIterations) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return [algorithm, iterations, b64(salt), b64(await derive(password, salt, iterations))].join("$");
}

export async function verifyPassword(password: string, stored: string) {
  const [name, rounds, salt, expected, extra] = stored.split("$");
  const iterations = Number(rounds);
  if (name !== algorithm || extra !== undefined || !Number.isInteger(iterations) || iterations < 1 || iterations > 100_000) return false;
  const actual = await derive(password, unb64(salt), iterations);
  const target = unb64(expected);
  if (actual.length !== target.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ target[i];
  return diff === 0;
}

/** A fixed hash so unknown usernames cost the same work as real ones. */
let dummyHash: Promise<string> | null = null;

export function normalizeUsername(value: unknown) {
  const name = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9][a-z0-9._@+-]{2,63}$/.test(name) ? name : null;
}
export function passwordProblem(password: string, username: string) {
  if (password.length < 10) return "הסיסמה צריכה לכלול לפחות 10 תווים.";
  if (password.length > 128) return "הסיסמה ארוכה מדי.";
  if (password.toLowerCase().includes(username)) return "הסיסמה לא יכולה לכלול את שם המשתמש.";
  if (/^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|password123|qwertyuiop)/i.test(password)) return "הסיסמה צפויה מדי.";
  return null;
}

export async function createPasswordAccount(db: D1Database, username: string, password: string, displayName: string, now: number) {
  const id = crypto.randomUUID();
  const subject = "local:" + id;
  const stored = await hashPassword(password);
  try {
    const [inserted] = await db.batch([
      db.prepare(`INSERT INTO accounts(id, provider_subject, created_at, display_name)
        SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM password_credentials WHERE username = ?) RETURNING id`)
        .bind(id, subject, now, displayName || null, username),
      db.prepare(`INSERT INTO password_credentials(username, account_id, password_hash, created_at)
        SELECT ?, id, ?, ? FROM accounts WHERE id = ?`).bind(username, stored, now, id),
    ]);
    return inserted.results.length === 1 ? subject : null;
  } catch {
    return null;
  }
}

export async function checkPasswordAccount(db: D1Database, username: string, password: string) {
  const row = await db.prepare(`SELECT a.provider_subject, c.password_hash FROM password_credentials c
    JOIN accounts a ON a.id = c.account_id WHERE c.username = ?`).bind(username).first<{ provider_subject: string; password_hash: string }>();
  if (!row) {
    dummyHash ??= hashPassword("not-a-real-password-placeholder");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  return await verifyPassword(password, row.password_hash) ? row.provider_subject : null;
}

/** Password accounts are off unless the operator sets HOSTED_PASSWORD_LOGIN=1. Google is the default sign-in. */
export function passwordsEnabled(env: AuthEnv) {
  return env.HOSTED_PASSWORD_LOGIN === "1";
}

function googleConfigured(env: AuthEnv) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.HOSTED_AUTH_SECRET);
}

const googleMark = '<svg class="g-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z"/></svg>';

export function authPage(env: AuthEnv, mode: "login" | "signup", message = "", status = 200, values: { username?: string; name?: string } = {}) {
  const loginChallenge = widget(env, "login");
  const signupChallenge = widget(env, "signup");
  const alert = message ? `<p class="alert" role="alert">${escapeHtml(message)}</p>` : "";
  const passwords = passwordsEnabled(env);
  const challenge = mode === "login" ? loginChallenge : signupChallenge;
  const google = googleConfigured(env)
    ? `<form method="post" action="/auth/login" class="google-form"><button class="btn google">${googleMark}<span>המשך עם Google</span></button></form>${passwords ? '<div class="divider"><span>או</span></div>' : ""}`
    : "";
  if (!google && (!passwords || !challenge)) return page("ההתחברות אינה זמינה כרגע", "<p>נסו שוב מאוחר יותר.</p>", 503);
  const legal = `<p class="muted small center">בהמשך אתם מאשרים את <a href="/terms">תנאי השימוש</a> ואת <a href="/privacy">מדיניות הפרטיות</a>.</p>`;
  if (!passwords || !challenge) {
    const intro = mode === "signup"
      ? "ההרשמה מתבצעת עם חשבון Google, ללא סיסמה נוספת. נתונים שהזנתם בהדגמה יועברו לחשבון אחרי הכניסה."
      : "הכניסה מתבצעת עם חשבון Google. אם זו הפעם הראשונה, ייווצר לכם חשבון.";
    return page(mode === "login" ? "כניסה לחשבון" : "יצירת חשבון", `<p class="lead">${intro}</p>${alert}${google}${legal}
      <p class="muted center"><a href="/demo">לנסות קודם את ההדגמה</a></p>`, status, false, true, { bodyClass: "auth" });
  }
  const body = mode === "login"
    ? `${alert}${google}<form method="post" action="/auth/password" class="stack">
      <label>שם משתמש או אימייל <input name="username" autocomplete="username" dir="ltr" required maxlength="64" value="${escapeHtml(values.username ?? "")}"></label>
      <label>סיסמה <input name="password" type="password" autocomplete="current-password" dir="ltr" required maxlength="128"></label>
      ${loginChallenge.replace('class="cf-turnstile"', 'class="cf-turnstile" data-appearance="interaction-only"')}
      <button class="btn primary">כניסה</button></form>
      <p class="muted center">אין לכם חשבון? <a href="/auth/signup">הרשמה בחינם</a> · <a href="/demo">כניסה להדגמה</a></p>`
    : `${alert}${google}<form method="post" action="/auth/signup" class="stack">
      <label>איך לקרוא לכם? <input name="name" autocomplete="name" maxlength="60" value="${escapeHtml(values.name ?? "")}" placeholder="דנה ויואב"></label>
      <label>שם משתמש או אימייל <input name="username" autocomplete="username" dir="ltr" required minlength="3" maxlength="64" value="${escapeHtml(values.username ?? "")}"></label>
      <label>סיסמה (לפחות 10 תווים) <input name="password" type="password" autocomplete="new-password" dir="ltr" required minlength="10" maxlength="128"></label>
      <label>אימות סיסמה <input name="confirm" type="password" autocomplete="new-password" dir="ltr" required minlength="10" maxlength="128"></label>
      <p class="muted small">אין אפשרות לשחזר סיסמה בדוא"ל. שמרו אותה במנהל סיסמאות, או התחברו עם Google.</p>
      ${signupChallenge.replace('class="cf-turnstile"', 'class="cf-turnstile" data-appearance="interaction-only"')}
      <button class="btn primary">יצירת חשבון</button></form>
      ${legal}<p class="muted center">כבר רשומים? <a href="/auth/login">כניסה</a></p>`;
  return page(mode === "login" ? "כניסה לחשבון" : "יצירת חשבון", `<p class="lead">${mode === "signup" ? "נתונים שהזנתם בהדגמה יועברו לחשבון החדש אחרי ההרשמה." : "ממשיכים מאיפה שעצרתם."}</p>${body}`,
    status, true, Boolean(google), { bodyClass: "auth" });
}

async function startSession(env: AuthEnv, subject: string, now: number) {
  const token = random();
  await recordSession(env.HOSTED_DB, subject, await hash(token), now);
  return redirect("/app", [cookie(sessionCookie, token, 86400)]);
}

/** Handles POST /auth/password and GET/POST /auth/signup. Returns null for other paths. */
export async function passwordRoute(request: Request, env: AuthEnv, now: number, fetcher: typeof fetch) {
  const url = new URL(request.url);
  if (url.pathname === "/auth/signup" && request.method === "GET") return authPage(env, "signup");
  const isLogin = url.pathname === "/auth/password" && request.method === "POST";
  const isSignup = url.pathname === "/auth/signup" && request.method === "POST";
  if (!isLogin && !isSignup) return null;
  if (!passwordsEnabled(env)) return page("העמוד לא נמצא", "", 404);
  if (!env.HOSTED_ORIGIN || url.origin !== env.HOSTED_ORIGIN || request.headers.get("origin") !== env.HOSTED_ORIGIN) {
    return page("הבקשה נחסמה", "", 403);
  }
  const form = await readForm(request, 4096);
  const username = normalizeUsername(form?.get("username"));
  const password = String(form?.get("password") ?? "");
  const name = String(form?.get("name") ?? "").trim().slice(0, 60).replace(/[\u0000-\u001f\u007f<>]/g, "");
  const mode = isLogin ? "login" : "signup";
  const retry = (message: string, status = 400) => authPage(env, mode, message, status, { username: String(form?.get("username") ?? "").slice(0, 64), name });
  if (!await checkChallenge(env, form, mode, fetcher)) return retry("אימות האבטחה נכשל. נסו שוב.", 403);
  if (!username) return retry("שם משתמש: 3-64 תווים באנגלית, ספרות או . _ - @");
  if (isLogin) {
    const subject = password ? await checkPasswordAccount(env.HOSTED_DB, username, password) : null;
    return subject ? startSession(env, subject, now) : retry("שם המשתמש או הסיסמה שגויים.", 401);
  }
  const problem = passwordProblem(password, username);
  if (problem) return retry(problem);
  if (password !== String(form?.get("confirm") ?? "")) return retry("הסיסמאות אינן תואמות.");
  const subject = await createPasswordAccount(env.HOSTED_DB, username, password, name, now);
  if (!subject) return retry("שם המשתמש כבר תפוס. בחרו שם אחר או התחברו.", 409);
  return startSession(env, subject, now);
}
