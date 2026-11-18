# Inbound integration requests

Apply all D1 migrations **before** deploying this change. Update service callers of `POST /api/rsvp/whatsapp` and `POST /api/admin/seating/sync` to send:

- `Authorization: Bearer <WHATSAPP_RSVP_SECRET or SEATING_SYNC_SECRET>`
- `X-Webhook-Timestamp`: current Unix time in whole seconds (10 decimal digits).
- `X-Webhook-Nonce`: a new random UUID or 16-128 URL-safe characters for **each** request.

HTTPS is required. The timestamp must be within five minutes of the Worker clock. Nonces are claimed atomically in D1, separately for each endpoint. Concurrent duplicates are rejected. Expired nonce records are cleaned opportunistically; their timestamp is already outside the acceptance window before deletion. Missing migrations or a failed nonce store produce 503, never bypass replay checks.

Responses: 401 for invalid credentials, absent/malformed freshness headers or a stale timestamp; 409 for a reused nonce; 503 if replay storage is unavailable. A nonce is consumed before processing the body. After a timeout or failure, check the current result, then retry with a new timestamp and nonce. Sync requests are idempotent; RSVP is an upsert by invite ID. There is no exactly-once guarantee across an application write and an external webhook.

Browser admin seating sync continues to use Basic auth and same-origin protections without service headers. Never expose service credentials in frontend code. Make scenarios and other senders need to generate these headers themselves; they are not deployed by this repository.

This protocol authenticates the request with a bearer over TLS, a fresh timestamp and a nonce. It does not authenticate a third-party WhatsApp provider directly or order different legitimate requests. Upstream scenarios must authenticate provider messages and reject out-of-order updates using their own event IDs/timestamps. A stolen bearer can create fresh requests until you rotate it.

## Body signature

Set `WEBHOOK_HMAC_REQUIRED=1` on a real event. The Worker then rejects `POST /api/rsvp/whatsapp` and bearer calls to `POST /api/admin/seating/sync` unless they also send:

`X-Webhook-Signature: v1=<base64url HMAC-SHA256>`

The HMAC key is that endpoint's existing bearer secret (`WHATSAPP_RSVP_SECRET` or `SEATING_SYNC_SECRET`). The signed message is the exact string `timestamp.nonce.rawBody`, using the `X-Webhook-Timestamp` and `X-Webhook-Nonce` values and the raw request body bytes. For an empty body the message ends with the second dot.

While the flag is unset, a missing signature is accepted so current Make scenarios keep working. If the header is present it is verified either way. A bad signature is 401 and does not consume the nonce. Browser admin sync does not use this header.

Outbound posts to `MAKE_WEBHOOK_URL` gain the same three headers only when `MAKE_WEBHOOK_HMAC_SECRET` is set. Receivers that ignore unknown headers stay compatible. The hosted connector is a GET. Set `HOSTED_CONNECTOR_HMAC=1` to require the same signature over an empty body, using the event bearer as the key. Leave it unset until the couple's scenario sends the header.
