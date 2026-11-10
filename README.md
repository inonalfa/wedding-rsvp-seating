# Wedding RSVP and seating

A Hebrew, right-to-left wedding invitation, RSVP system, guest calling workflow, seating planner, room sketch and staff table finder. This is a separate public edition of a Sites project with **fictional example data**. It does not contain the original guest list, photographs, credentials or database.

## Features

- Signed personal invitation links, attendance and guest counts, and an outbound RSVP sync with a pending record on failure.
- Admin pages for calls, invitations, reconciliation, table assignment and a draggable sketch with PDF export.
- Staff table finder with Hebrew fuzzy matching, phone and guest-number lookup, unseated matches first, signed seating tickets, capacity/revision validation and undo.
- Optional Google Sheets sync through external webhook endpoints. Column T is the numeric table number.
- Six fictional guests and three tables in local demo mode.

## Local setup

Use Node.js 22.13+, npm and Linux with `flock`, `curl` and GNU `timeout` for the included build helpers. A Cloudflare account is needed only for deployment.

```sh
npm ci
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply site-creator-d1 --local
npm run dev
```

Open the URL printed by Vite. `DEMO_MODE=1` opens `/admin` and `/find-table` with fictional data. Use an isolated D1 database for demo mode. Run `npm run typecheck`, `npm run lint` and `npm test` for verification.

## Configure your event

Edit `lib/event-config.ts` for event dates, venue and source sheet names. Table 2 has a special capacity policy in the seating model; change the model and its tests if your event uses a different table. Search the `app/` directory for the sample hosts, copy and date to tailor all UI text. Replace the placeholder SVGs under `public/`. The sample read source has two tabs of rows A:T. Review `lib/seating-model.ts` and `lib/demo-data.ts` before connecting real data.

Copy `.dev.vars.example` into `.dev.vars` for local development. Set production secrets with Wrangler or your deployment secret manager. Never commit `.dev.vars`, a database, a real guest export or invitation links.

| Variable | Purpose |
| --- | --- |
| `DEMO_MODE` | `1` loads fictional guests and disables outbound seating sync; `0` for real data. |
| `ADMIN_PASSWORD`, `STAFF_PASSWORD` | Independent long secrets for standalone HTTP Basic auth. The username is `admin`; use HTTPS. |
| `ADMIN_EMAILS` | First email is the authenticated admin identity; required for admin authorization in production. |
| `INVITE_TOKEN_SECRET`, `INVITE_SHORT_TOKEN_SECRET` | Independent secrets for invitation links and seating tickets. |
| `SEATING_SHEETS_WEBHOOK_URL` | POST endpoint returning `{ "valueRanges": [{ "range": "'מוזמנים דנה'!A1:T4", "values": [...] }, ...] }`. |
| `MAKE_WEBHOOK_URL` | POST endpoint receiving RSVP, opening and seating updates. |
| `SEATING_SYNC_SECRET`, `WHATSAPP_RSVP_SECRET` | Bearer secrets for service endpoints. |
| `AUTH_MODE` | Defaults to standalone Basic auth. `sites` trusts identity injected by the Sites dispatch layer. Never use `sites` on a directly exposed Worker. |

Generate each secret independently, for example with `openssl rand -base64 48`. The values in `.dev.vars.example` are placeholders.

### Sheets contract

The read webhook returns `valueRanges` for tabs matching `eventConfig.sheetNames`, each with a header and rows A:T. Relevant columns: D phone, E invited count, G guest number, I stable invite ID, J RSVP status, K confirmed count, T table number. `MAKE_WEBHOOK_URL` receives JSON events with `schemaVersion` and `event`. For `seating.updated`, locate the row by `inviteId` and `sourceSheet`, write integer `tableNumber` to T or clear it when the value is `""`, and respond `{ "ok": true, "event": "seating.updated" }` only after a successful write. The application leases synchronization, tracks a snapshot and retries pending changes. Implement and secure the external scenario separately.

## Deploy on Cloudflare

1. Create a separate D1 database: `npx wrangler d1 create wedding-rsvp-seating`. Put its ID and name in `wrangler.jsonc` and `vite.config.ts`.
2. Configure production secrets, `ADMIN_EMAILS`, HTTPS, and integration endpoints. Set `DEMO_MODE=0` for real data. A public demo should have its own D1 database.
3. Apply migrations with `npx wrangler d1 migrations apply wedding-rsvp-seating --remote`.
4. Run `npm run typecheck && npm test`, authenticate Wrangler, then `npx vinext deploy`.

The checked-in migrations retain the original schema history. `.openai/hosting.json` exists for optional Sites packaging with a placeholder project ID; ordinary Cloudflare deployment uses `wrangler.jsonc`.

## Security and privacy

The Worker uses request-local D1 bindings and configuration so concurrent requests do not mix secrets. Standalone mode strips client-supplied identity headers and protects admin and table-finder routes. Demo mode contains only fictional records. Staff search returns names, tables and signed seating tickets, so restrict staff credentials. Add edge rate limiting and monitoring for public RSVP and invitation endpoints. Set a retention policy for personal information, rotate credentials after the event and use separate staging and production databases. HTTP Basic credentials may remain cached in a browser session.

See [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed; font files in `public/fonts/` retain their SIL OFL notices.
