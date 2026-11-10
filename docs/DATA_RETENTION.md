# Delete event data

Choose and communicate a deletion date for your event. The application does not schedule deletion. Guest data includes RSVP/contact information, invitation links and visits, caller details and attempts, source-sheet JSON, seating/sketch documents and reconciliation history. Rate-limit hashes and webhook nonces are operational data with no scheduled purge.

After the event, disable inbound Make/Sheets/WhatsApp scenarios and public access first. Set `INVITE_TOKENS_EXPIRE_AT` to a past UTC timestamp, rotate both invite secrets and the admin/staff/service passwords, and increment `SEATING_TOKEN_EPOCH`. Keep access disabled during deletion. If you delete revocation records while accepting old keys, revoked invitations could become usable again.

Review the destructive SQL in `scripts/purge-guest-data.sql`, verify the exact database name and account, and execute it against the intended database:

```sh
npx wrangler d1 execute YOUR_EVENT_DATABASE --remote --file=scripts/purge-guest-data.sql
```

The script deletes application records, including JSON documents and runtime sync snapshots, while retaining migrated schema. Statements run sequentially; on failure, keep access disabled, resolve the error and rerun (deletes are repeatable). Check that all application tables are empty afterwards. Do not re-enable demo mode on this database; it would reseed fictional records. For a disposable event instance, deleting the entire D1 database and Worker is another option after checking that no other application shares them.

Separately delete guest data from Google Sheets, Make execution histories, exports, downloaded PDFs/screenshots, local D1 files under `.wrangler/state`, logs and backups. Inspect custom public artwork/configuration for personal information. Database deletion does not remove third-party copies or provider backups; review those providers' retention settings and restoration history. Stop any scheduled import/reset jobs that could restore records. This procedure has no automatic audit trail, so record when and where you completed it without copying guest data into that record.
