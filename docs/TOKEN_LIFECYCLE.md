# Invitation and seating-card lifecycle

New short invitations use v3: HMAC-SHA256 with a 128-bit tag and a signed Unix expiry. Default lifetime is 90 days; `INVITE_TOKEN_TTL_SECONDS` accepts 1 through 31,536,000 seconds. Changing it affects newly issued links only. Invalid TTL configuration prevents issuing links.

Set `INVITE_TOKENS_EXPIRE_AT` to an ISO UTC timestamp to close **all** invitation formats at an event-wide deadline. Invalid nonempty values fail closed. Set this for a real event, especially when keeping legacy links. Legacy AES-GCM and short v1/v2 links have no expiry inside the token and still use a 64-bit tag on the old short format. On the first successful open, the Worker stores an expiry of `LEGACY_INVITE_TTL_SECONDS` (default 7776000, 90 days) in `invite_controls`. `0` disables that automatic legacy expiry. Invalid values fail closed for those legacy links. Apply migration `0014_security_controls` before relying on the table; the Worker also creates it if it is missing.

From **ניהול אישורי הגעה**, paste an invite ID to revoke that link or to save an earlier expiry. Revoke is also `POST /api/admin/invites/control` with `{ "inviteId", "revoke": true }` or `{ "inviteId", "expiresAt" }`. Revocation writes the same resolution row as the manual statement below and clears aliases that point at that ID. It does not delete the guest row. Rotate both invitation secrets when you need to invalidate every old link at once. Changing sheet names or ID prefixes is not a revocation mechanism.

The hosted edition already binds each link to an event, guest, version and 30-day expiry. On the event page, **ביטול קישור** increments that guest's invite version so the previous link stops working. Issue a new link afterwards. Hosted RSVP is only available from that signed link.

To revoke an individual standalone invite from SQL, run a bound D1 statement (substitute the ID privately):

```sql
INSERT INTO rsvp_invite_resolutions (invite_id, canonical_id, reconciliation_id)
VALUES (?, NULL, 'manual-revocation')
ON CONFLICT(invite_id) DO UPDATE SET canonical_id = NULL;
```

This blocks invitation decoding and RSVP through that link. It does not delete stored data or prohibit a trusted integration operator from updating the guest record by ID. Do not erase revocation records while old links are still accepted. Reconciled aliases may point to a canonical invite; revoke its aliases as well.

Seating cards use full HMAC-SHA256, expire after 30 minutes and validate the current assignment before updates. Increment `SEATING_TOKEN_EPOCH` (a string, default `0`) to invalidate outstanding cards without rotating invitation keys. Staff must search again to receive a fresh card. Cards are reusable within their lifetime for idempotent seating operations, not single-use credentials. Rotating invitation keys also invalidates cards.
