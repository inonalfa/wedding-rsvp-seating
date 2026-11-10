import { ensureRsvpSchema, getD1Binding } from '@/db';

/** Atomic D1 window counter. The stored key is a hash, never a raw IP. */
export async function limitPublicRequest(request: Request, scope: string, limit: number): Promise<Response | null> {
  await ensureRsvpSchema();
  const windowSeconds = 600;
  const now = Math.floor(Date.now() / 1_000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  // Cloudflare supplies this header on deployed Workers. Without it, use one
  // shared bucket so an absent header cannot disable the limit.
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const material = new TextEncoder().encode(`${scope}\0${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', material);
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const row = await getD1Binding().prepare(`INSERT INTO public_rate_limits (key, window_start, hits)
    VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET
      hits = CASE WHEN window_start = excluded.window_start THEN hits + 1 ELSE 1 END,
      window_start = excluded.window_start RETURNING hits`).bind(key, windowStart).first<{ hits: number }>();
  if (row && row.hits > limit) {
    return Response.json({ error: 'יותר מדי בקשות. נסו שוב בעוד כמה דקות.' }, {
      status: 429,
      headers: { 'Retry-After': String(windowStart + windowSeconds - now), 'Cache-Control': 'no-store' },
    });
  }
  return null;
}
