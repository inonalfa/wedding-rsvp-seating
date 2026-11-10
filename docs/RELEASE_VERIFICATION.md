# Open-source release verification

Date: 2026-11-10. This records the work completed for the public edition, not a guarantee of absence of vulnerabilities.

## Privacy and history

- Gitleaks 8.24.2 scanned all reachable branches: 24 commits and about 1.21 MB of textual history, with zero findings. The scan used the default rules and no repository allowlist.
- Manual review covered 256 unique blobs, seed data, tests, SVG text and asset metadata. Assets included five SVGs, three WOFF fonts, four screenshots and one GIF; no PDFs were present in Git history.
- Original event branding in historical package metadata was removed with `git filter-repo` after owner approval. Six realistic phone fixture values in three test files were also replaced conservatively throughout history; their ownership was not established. Current demo contacts are explicitly fictional.
- No active credential, signing key, real sheet ID or webhook endpoint was found. No credential rotation was performed because no active secret was identified.
- Both the main and release branches were rewritten with expected-head checks. Old clones must be replaced or carefully reconciled. GitHub caches, old commit URLs and third-party copies are outside the scope of a branch rewrite.

Reproduce the automated scan with `gitleaks git . --log-opts='--all' --redact=100`. Review assets and personal data manually as well; secret scanners do not classify every kind of personal information.

## Functional verification

The reviewed application tree was `c05fdb0250917c3d281d778d3dccecc95683d08e`.

- A fresh clone completed `npm ci`, `npm run demo:setup`, all D1 migrations, TypeScript, zero-warning lint and 77 unit tests.
- Local HTTP checks verified authentication rejection, authenticated admin access, a fictional signed invite, RSVP persistence and seeded Hebrew search.
- [CI run 42849102604](https://github.com/inonalfa/wedding-rsvp-seating/actions/runs/42849102604) passed the full Playwright flow: admin authentication, invite creation, guest RSVP, seating assignment, Hebrew search and a PDF download with a valid PDF header.
- The client build no longer emits the 500 kB chunk warning; the optional Three.js scene loads split core and renderer chunks.
- `vinext deploy --dry-run` completed without tracked changes. This checks deployment configuration generation only, not a live deployment.

## Deployment and security limits

No authenticated Cloudflare account was available, so a live deployment and hosted demo were not performed. External Make scenarios were not changed. The original live Sites application was not modified.

See [SECURITY.md](../SECURITY.md) for token expiry/revocation, webhook authentication, open RSVP, Basic authentication, retention and operational limitations.
