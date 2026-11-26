/** Canonical and legacy origins for the hosted domain cutover. */

export interface OriginEnv {
  HOSTED_ORIGIN?: string;
  HOSTED_LEGACY_ORIGINS?: string;
  HOSTED_REDIRECT_LEGACY?: string;
}

/** Empty or missing values are treated as "not configured" by callers; invalid non-empty values are rejected. */
export function hostedOriginAllowed(origin: string | undefined) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol === "https:") return true;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    return url.protocol === "http:" && (host === "localhost" || host === "127.0.0.1" || host === "::1");
  } catch {
    return false;
  }
}

function originValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || !hostedOriginAllowed(trimmed)) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

/** Canonical origin plus any valid entries in HOSTED_LEGACY_ORIGINS (comma-separated). */
export function allowedOrigins(env: OriginEnv): Set<string> {
  const allowed = new Set<string>();
  const canonical = originValue(env.HOSTED_ORIGIN ?? "");
  if (!canonical) return allowed;
  allowed.add(canonical);
  for (const part of (env.HOSTED_LEGACY_ORIGINS ?? "").split(",")) {
    const origin = originValue(part);
    if (origin) allowed.add(origin);
  }
  return allowed;
}

export function hostnameAllowed(hostname: string, env: OriginEnv) {
  for (const origin of allowedOrigins(env)) {
    if (new URL(origin).hostname === hostname) return true;
  }
  return false;
}

/**
 * CSRF check for mutating routes: the request URL origin is allowed, and the
 * Origin header matches that same origin (not a cross-host post between
 * canonical and legacy).
 */
export function sameAllowedOrigin(request: Request, env: OriginEnv) {
  const origin = new URL(request.url).origin;
  return allowedOrigins(env).has(origin) && request.headers.get("origin") === origin;
}

/**
 * 301 (GET/HEAD) or 308 (other methods) from a legacy origin to HOSTED_ORIGIN,
 * preserving path and query. Off unless HOSTED_REDIRECT_LEGACY=1.
 * /health is not redirected so probes on the old hostname still confirm the Worker.
 */
export function legacyRedirectResponse(request: Request, env: OriginEnv) {
  if ((env.HOSTED_REDIRECT_LEGACY ?? "").trim() !== "1") return null;
  const url = new URL(request.url);
  if (url.pathname === "/health") return null;
  const canonical = originValue(env.HOSTED_ORIGIN ?? "");
  if (!canonical || url.origin === canonical) return null;
  const legacy = new Set<string>();
  for (const part of (env.HOSTED_LEGACY_ORIGINS ?? "").split(",")) {
    const origin = originValue(part);
    if (origin && origin !== canonical) legacy.add(origin);
  }
  if (!legacy.has(url.origin)) return null;
  const status = request.method === "GET" || request.method === "HEAD" ? 301 : 308;
  return new Response(null, {
    status,
    headers: { Location: canonical + url.pathname + url.search, "Cache-Control": "no-store" },
  });
}
