import { getWeddingRuntimeConfig } from "./runtime-config";

const encoder = new TextEncoder();

function encodeBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(leftValue: string, rightValue: string) {
  const left = encoder.encode(leftValue);
  const right = encoder.encode(rightValue);
  const length = Math.max(left.length, right.length, 1);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

/** HMAC-SHA256 over timestamp, nonce and the raw body. The same string is used for inbound and outbound calls. */
export async function webhookBodySignature(secret: string, timestamp: string, nonce: string, body: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${nonce}.${body}`)));
  return `v1=${encodeBase64Url(mac)}`;
}

export async function verifyWebhookBodySignature(request: Request, body: string, secret: string, required: boolean) {
  const presented = request.headers.get("x-webhook-signature");
  if (!presented) {
    if (!required) return null;
    return Response.json({ error: "Webhook signature required" }, { status: 401 });
  }
  const timestamp = request.headers.get("x-webhook-timestamp") ?? "";
  const nonce = request.headers.get("x-webhook-nonce") ?? "";
  const expected = await webhookBodySignature(secret, timestamp, nonce, body);
  if (!timingSafeEqual(presented, expected)) return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
  return null;
}

export async function withWebhookSignature(body: string, headers: Record<string, string> = { "Content-Type": "application/json" }) {
  const secret = getWeddingRuntimeConfig().makeWebhookHmacSecret;
  if (!secret) return headers;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  return {
    ...headers,
    "X-Webhook-Timestamp": timestamp,
    "X-Webhook-Nonce": nonce,
    "X-Webhook-Signature": await webhookBodySignature(secret, timestamp, nonce, body),
  };
}
