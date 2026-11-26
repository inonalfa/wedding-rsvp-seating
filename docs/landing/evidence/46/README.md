# Evidence for #46 (/demo brand + CSP)

Local hosted fixture (`e2e/fixtures/hosted-server.mjs`, http://127.0.0.1:4174), Chrome headless, 26.11.2026.

- Screenshots: `demo-390.webp` (390x844, full page), `demo-1440.webp` (1440x900, full page). Header now shows the RSVP Plus logo; title "הדגמה - אישור הגעה פלוס".
- axe-core (`/demo`, `/privacy`, 390 and 1440): 0 violations after the contrast commit (before: 3 color-contrast nodes from shared `--muted` #6f7b76 at 4.4:1 and `.eyebrow` gold #b8945a at 2.82:1).
- Console errors: none.
- Lighthouse `/demo`, median of 3 (local fixture, before the contrast commit):

| | Perf | A11y | BP | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| Mobile | 98 | 100 | 100 | 54* | 2.40 s | 0 | 43 ms |
| Desktop | 100 | 100 | 100 | 54* | 0.56 s | 0 | 0 ms |

\* SEO 54 is expected: `/demo` is `noindex` by design (is-crawlable fails) and has no meta description.
- Hosted unit tests: 36/36 pass (`tests/hosted-demo-shell.test.mjs` new). Typecheck + lint pass.
- CSP change is limited to the app shell (`/app`, `/demo`): adds `https://static.cloudflareinsights.com` to `script-src` and `https://cloudflareinsights.com` to `connect-src`. Every other directive is unchanged.
