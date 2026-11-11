import { escapeHtml, page } from "./http";

type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
export type AbuseEnv = {
  HOSTED_ORIGIN?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  LOGIN_LIMIT?: RateLimiter;
  GUEST_LIMIT?: RateLimiter;
  CLIENT_LIMIT?: RateLimiter;
};

export async function limited(binding: RateLimiter | undefined, key: string) {
  if (!binding) return page("השירות אינו זמין כרגע", "", 503);
  try {
    if ((await binding.limit({ key })).success) return null;
    const blocked = page("יותר מדי ניסיונות", "<p>נסו שוב בעוד דקה.</p>", 429);
    blocked.headers.set("Retry-After", "60");
    return blocked;
  } catch {
    return page("השירות אינו זמין כרגע", "", 503);
  }
}

export function widget(env: AbuseEnv, action: string) {
  if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET) return "";
  return `<div class="cf-turnstile" data-sitekey="${escapeHtml(env.TURNSTILE_SITE_KEY)}" data-action="${escapeHtml(action)}"></div>`;
}

export async function checkChallenge(env: AbuseEnv, form: FormData | null, action: string, fetcher: typeof fetch = fetch) {
  const response = form?.get("cf-turnstile-response");
  if (!env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY || !env.HOSTED_ORIGIN ||
      typeof response !== "string" || response.length < 1 || response.length > 2048) return false;
  try {
    const verify = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response }),
      signal: AbortSignal.timeout(5000),
    });
    if (!verify.ok) return false;
    const result = await verify.json() as { success: boolean; hostname: string; action: string };
    return result.success === true && result.hostname === new URL(env.HOSTED_ORIGIN).hostname && result.action === action;
  } catch {
    return false;
  }
}
