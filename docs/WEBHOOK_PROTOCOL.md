# Inbound integration requests

Apply all D1 migrations **before** deploying this change. Update service callers of `POST /api/rsvp/whatsapp` and `POST /api/admin/seating/sync` to send:

- `Authorization: Bearer <WHATSAPP_RSVP_SECRET or SEATING_SYNC_SECRET>`
- `X-Webhook-Timestamp`: current Unix time in whole seconds (10 decimal digits).
- `X-Webhook-Nonce`: a new random UUID or 16-128 URL-safe characters for **each** request.

HTTPS is required. The timestamp must be within five minutes of the Worker clock. Nonces are claimed atomically in D1, separately for each endpoint. Concurrent duplicates are rejected. Expired nonce records are cleaned opportunistically; their timestamp is already outside the acceptance window before deletion. Missing migrations or a failed nonce store produce 503, never bypass replay checks.

Responses: 401 for invalid credentials, absent/malformed freshness headers or a stale timestamp; 409 for a reused nonce; 503 if replay storage is unavailable. A nonce is consumed before processing the body. After a timeout or failure, check the current result, then retry with a new timestamp and nonce. Sync requests are idempotent; RSVP is an upsert by invite ID. There is no exactly-once guarantee across an application write and an external webhook.

Browser admin seating sync continues to use Basic auth and same-origin protections without service headers. Never expose service credentials in frontend code. Make scenarios and other senders need to generate these headers themselves; they are not deployed by this repository.

This protocol authenticates the request with a bearer over TLS. It does not add a separate HMAC body signature, authenticate a third-party WhatsApp provider directly, or order different legitimate requests. Upstream scenarios must authenticate provider messages and reject out-of-order updates using their own event IDs/timestamps. A stolen bearer can create fresh requests; rotate it immediately.
