# Delete event data

Choose and communicate a deletion date for your event. Set `GUEST_DATA_RETENTION_AT` to that instant as an ISO UTC timestamp, for example `2026-12-01T22:00:00Z`. The standalone Worker cron `17 3 * * *` (03:17 UTC daily) runs the same deletes as `scripts/purge-guest-data.sql` once `Date.now()` is at or after that instant. An empty or invalid value does not delete anything. The job is repeatable. Apply migration `0014_security_controls` so invite-control and lockout rows are included. Redeploy the Worker after pulling this change so Cloudflare registers the cron. This does not delete Sheets, Make history, exports or backups.

Guest data includes RSVP/contact information, invitation links and visits, caller details and attempts, source-sheet JSON, seating/sketch documents, reconciliation history, per-invite expiry and revocation rows. The same run clears rate-limit hashes, webhook nonces and auth lockouts.

After the event, disable inbound Make/Sheets/WhatsApp scenarios and public access first. Set `INVITE_TOKENS_EXPIRE_AT` to a past UTC timestamp, rotate both invite secrets and the admin/staff/service passwords, and increment `SEATING_TOKEN_EPOCH`. Keep access disabled during deletion. If you delete revocation records while accepting old keys, revoked invitations could become usable again.

Review the destructive SQL in `scripts/purge-guest-data.sql`, verify the exact database name and account, and execute it against the intended database:

```sh
npx wrangler d1 execute YOUR_EVENT_DATABASE --remote --file=scripts/purge-guest-data.sql
```

The script deletes application records, including JSON documents and runtime sync snapshots, while retaining migrated schema. The scheduled job runs those same statements. On failure, keep access disabled, resolve the error and rerun (deletes are repeatable). Check that all application tables are empty afterwards. Do not re-enable demo mode on this database; it would reseed fictional records. For a disposable event instance, deleting the entire D1 database and Worker is another option after checking that no other application shares them.

The hosted edition does not use this script. Its hourly cron deletes events whose `purge_at` has passed, in small batches, and access is already refused at that instant. Couples can also delete one event from **ייצוא או מחיקת האירוע**.

Separately delete guest data from Google Sheets, Make execution histories, exports, downloaded PDFs/screenshots, local D1 files under `.wrangler/state`, logs and backups. Inspect custom public artwork/configuration for personal information. Database deletion does not remove third-party copies or provider backups; review those providers' retention settings and restoration history. Stop any scheduled import/reset jobs that could restore records. This procedure has no automatic audit trail, so record when and where you completed it without copying guest data into that record.
