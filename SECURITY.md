# Security policy

Report vulnerabilities via a private GitHub security advisory. Do not disclose guest data or exploit details in a public issue.

The demo is open and fictional. Real deployments need independent admin and staff passwords, `ADMIN_EMAILS`, invitation token secrets, HTTPS and a separate D1 database. Missing passwords fail closed. `AUTH_MODE=sites` requires a trusted Sites dispatch layer and is unsafe on a directly exposed Worker. Protect external webhooks and service secrets separately. Add rate limits and monitoring at the edge. Operators own guest-data retention, access and deletion policies.
