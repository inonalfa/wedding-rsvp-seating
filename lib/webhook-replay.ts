import { getD1Binding } from '@/db';

/** Call only after authenticating the bearer. Atomic claims work across Workers. */
export async function claimWebhookRequest(request: Request, scope: string): Promise<Response | null> {
  const timestamp = request.headers.get('x-webhook-timestamp') ?? '';
  const nonce = request.headers.get('x-webhook-nonce') ?? '';
  const seconds = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!/^\d{10}$/.test(timestamp) || !Number.isSafeInteger(seconds) || Math.abs(now - seconds) > 300 || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
    return Response.json({ error: 'A fresh webhook timestamp and unique nonce are required' }, { status: 401 });
  }
  try {
    const db = getD1Binding();
    const claimed = await db.prepare('INSERT INTO webhook_nonces (key, expires_at) VALUES (?, ?) ON CONFLICT(key) DO NOTHING RETURNING key')
      .bind(`${scope}:${nonce}`, now + 601).first();
    if (!claimed) return Response.json({ error: 'Webhook already received; retry with a fresh nonce after checking the result' }, { status: 409 });
    // A timestamp at the positive edge of the window is stale before cleanup.
    await db.prepare('DELETE FROM webhook_nonces WHERE expires_at < ?').bind(now).run();
    return null;
  } catch {
    return Response.json({ error: 'Webhook replay protection unavailable' }, { status: 503 });
  }
}
