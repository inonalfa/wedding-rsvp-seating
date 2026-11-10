# Security policy

Report vulnerabilities via a private GitHub security advisory. Do not disclose guest data or exploit details in a public issue.

The demo is open and fictional. Real deployments need independent admin and staff passwords, `ADMIN_EMAILS`, invitation token secrets, HTTPS and a separate D1 database. Missing passwords fail closed. `AUTH_MODE=sites` requires a trusted Sites dispatch layer and is unsafe on a directly exposed Worker. Protect external webhooks and service secrets separately. Operators own guest-data retention, access and deletion policies.

Admin and staff paths use separate HTTP Basic passwords in standalone mode. Identity headers sent by clients are stripped before routing. Browser mutations with a foreign Origin or cross-site Fetch Metadata are rejected. Public RSVP and invite endpoints have atomic D1 counters per Cloudflare client IP and a ten-minute window. Incoming WhatsApp and seating sync endpoints require independent bearer secrets. D1 and Drizzle queries use bound parameters; document updates use optimistic revisions.

## Known limitations

- The general RSVP form deliberately accepts submissions without a personal invite. A signed link identifies a known invite, but it is not mandatory for the open form. Configure edge protection and monitor abuse; D1 rate limits alone are not a substitute for WAF controls.
- Existing invitation token formats have no expiry or revocation. Short invitation signatures are truncated to eight bytes. Rotate the independent signing secrets to invalidate links, and do not use this implementation for long-lived or high-value authorization. Seating tickets expire after 30 minutes and use a full HMAC; they are not one-time tokens, but seating assignment checks the current source and revision, making repeated requests idempotent.
- External Make/Sheets webhooks are separate services. This repository does not implement an HMAC signature protocol for their outbound payloads or validate the identity of an inbound Sheets response beyond its configured endpoint. Incoming service payloads have no signed timestamp or replay window; upstream scenarios must deduplicate and order updates to prevent an older reply from replacing a newer one. Keep those URLs and bearer credentials private, use HTTPS and validate upstream data.
- Basic credentials may remain cached by a browser. Give staff their own password, use TLS, rotate it after sharing, and prefer a stronger identity provider for a real deployment.
- `DEMO_MODE=1` allows writes to fictional data. `demo:setup` enables Basic authentication with ephemeral credentials through `DEMO_AUTH=1`; disabling it opens demo admin routes. Use a dedicated, disposable D1 database. A publicly hosted demo must prevent writes or reset data separately.
- Guest records, call attempts and hashed rate-limit identifiers have no automatic retention job. Define and execute a deletion policy for your jurisdiction and event.
