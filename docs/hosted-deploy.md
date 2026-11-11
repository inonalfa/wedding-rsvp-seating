# Deploy the free hosted service

This is a limited pilot, free to use, with no SLA and no guaranteed capacity. Do not admit real couples until the smoke checks and [legal review](hosted-legal-templates.md) are done. This Worker and D1 are separate from the demo and the existing self-hosted installation.

## Operator prerequisites

1. Use a dedicated **Workers Free** Cloudflare account and enable a free `workers.dev` subdomain. Verify the plan in Dashboard, leave paid products disabled and never enable paid overages. Create a D1 database named `wedding-rsvp-seating-hosted` and save its ID. Do not reuse the demo database, credentials or account resources.
2. Create a Free Turnstile widget restricted to the hosted hostname and a Google OAuth Web client with callback `https://wedding-rsvp-seating-hosted.<subdomain>.workers.dev/auth/callback`. Use only the `openid` scope. Verify the consent screen and publication status; testing mode is limited to configured users.
3. Supply these values through environment variables in your local shell, ideally from a secret manager. Do not paste values into tracked files.

| Name | Setup |
| --- | --- |
| `CF_ACCOUNT_ID`, `HOSTED_DB_ID` | Dedicated account and database identifiers. |
| `HOSTED_ORIGIN` | Exact hosted HTTPS origin with no trailing slash. |
| `HOSTED_FREE_CONFIRMED` | Set to `1` after verifying Workers Free in Dashboard. |
| `CLOUDFLARE_API_TOKEN` | Deploy-time credential restricted to the dedicated account, with Billing Read, Workers Scripts Edit and D1 Edit. This token is never deployed. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Credentials for the registered OAuth Web client. |
| `HOSTED_AUTH_SECRET`, `HOSTED_INVITE_SECRET` | Two independent 32-byte secrets encoded as Base64URL. Generate separately with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Rotating the invitation key revokes all hosted invite and staff links. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Public site key and secret from the hostname-pinned Free widget. |
| `HOSTED_OPERATOR_SUB` | The Google OIDC subject of the operator, never an email or arbitrary user ID. Get it from a trusted verified Google sign-in for your account. |
| `CF_ANALYTICS_TOKEN` | Separate token, Account Analytics Read only, scoped to the dedicated account. |

## Deploy

After `npm ci`, run:

```sh
node scripts/deploy-hosted.mjs
```

The command verifies the configured target, checks account subscriptions through the [Cloudflare API](https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/methods/get/), applies the hosted migrations and deploys only the hosted Worker. The Free plan confirmation in Dashboard remains mandatory because subscription metadata does not certify all account settings. The command does not provision a database or upgrade the account. `node scripts/deploy-hosted.mjs --dry-run` only bundles locally.

## Before sharing the address

- Check `/health`, Google sign-in, Turnstile and the authorized `/operator/usage` screen. Wait for the hourly Cron snapshot. Verify it against account usage in Cloudflare Dashboard. The app pauses new events, import and sync at 60% or when telemetry is missing, failed, stale, or from a previous UTC day. Empty datasets, null aggregates, partial results and request failures close admission without moving the last valid timestamp. Only a complete, explicit zero counts as zero. Confirm that the account's Free plan rejects over-quota operations.
- Create a fictional event, run the couple and guest flows, export and delete it. Run a bounded pilot load test with synchronized imports and RSVPs before raising the cap of 20 retained events. If live provider metrics are incompatible, keep enrollment closed and diagnose dataset permissions/schema.
- Keep request logging disabled: invitation URLs are bearer credentials. Confirm operator privacy contact, retention and recovery procedure, and publish the lawyer-reviewed terms before accepting real guest data.

## Couple-owned connections

In the event, open **חיבורים אופציונליים** and enable the read-only connection. Use an HTTP GET module in the couple's Make scenario or `UrlFetchApp.fetch` from a private Google Sheets Apps Script. Supply the displayed address and `Authorization: Bearer <event key>` using provider-side private storage. Parse the `guests` array and use `guest_id` as the matching key. For Sheets, write untrusted text as literal values, never as formulas. Configure at most hourly pulls, handle HTTP 429/503 without immediate retry, and stop the trigger when finished. Deletion revokes the key; separately delete any copies in the couple's accounts. WhatsApp uses manual sharing from the invitation page; the service does not send messages automatically.


### Open launch check: Cloudflare Analytics on Workers Free

Repository review cross-checked the D1 filter against the pinned Wrangler 4.92.0 `d1 insights` implementation: it uses `ZoneWorkersRequestsFilter_InputObject` for `d1QueriesAdaptiveGroups` with `datetimeHour_geq`, `datetimeHour_leq`, `rowsRead`, and `rowsWritten`. This is source evidence, not live schema or entitlement verification. No dedicated Free-account credentials were available for this review.

Before opening the pilot, use the intended Free account and Account Analytics Read token to run the exact `HostedUsage` query and variables from `hosted/usage.ts`. Use [schema discovery](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/) to verify the D1 filter argument and fields (including `__type(name: "ZoneWorkersRequestsFilter_InputObject")`), and check [dataset settings](https://developers.cloudflare.com/analytics/graphql-api/features/settings/) and [D1 Analytics](https://developers.cloudflare.com/d1/observability/metrics-analytics/) for the account. Verify both aggregates after known harmless pilot traffic, and compare them with the dashboard. If a dataset is denied or returns no row on a quiet day, leave admission closed and investigate; do not substitute zero or upgrade to a paid plan.
