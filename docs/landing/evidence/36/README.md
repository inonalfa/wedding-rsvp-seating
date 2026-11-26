# Evidence for #36 (landing page rebuild)

Local hosted fixture (`e2e/fixtures/hosted-server.mjs`), Chrome headless, 26.11.2026. Two visual iterations, each driven by an Opus design critique of real screenshots (`critique-v1-opus.md`, `critique-v2-opus.md`). Factual claims were checked against source by Haiku (`claims-haiku-v3.md`); the flagged items were fixed in the last commit or are listed below as owner decisions.

Screenshots were taken before the last copy-only commit, which changes two strings: the dashboard H2 and the WhatsApp line.

## Screenshots
- Before (current production landing): `before-390-fold.webp`, `before-1440-fold.webp`
- Final: `v3-390-hero.webp`, `v3-1440-hero.webp`, `v3-390-full.webp`, `v3-1440-full.webp`
- Interaction states (hero closed/open, story settled, RSVP answered, seating after assigning a party to a full table, themes, dashboard): `v3-390-states.webp`, `v3-1440-states.webp`
- Iteration history (390 states): `v1-390-states.webp` -> `v2-390-states.webp` -> `v3-390-states.webp`

## Lighthouse (median of 3; perf / a11y / best practices / SEO, LCP, CLS, TBT)
| Run | Mobile | Desktop |
|---|---|---|
| Old landing, production (Phase 0) | 100 / 95 / 100 / 92, 0.94 s, 0.001, 11 ms | 100 / 95 / 100 / 92, 0.29 s, 0, 0 ms |
| Old landing, local fixture | 100 / 95 / 100 / 91, 0.90 s, 0.001, 0 ms | 100 / 95 / 100 / 91, 0.24 s, 0.001, 0 ms |
| New v1 | 100 / 96 / 100 / 100, 1.50 s, 0, 0 ms | 100 / 96 / 100 / 100, 0.32 s, 0, 0 ms |
| New v2 | 99 / 100 / 100 / 100, 1.66 s, 0, 79 ms | 100 / 100 / 100 / 100, 0.40 s, 0, 0 ms |
| **New v3 (final)** | **98 / 100 / 100 / 100, 1.80 s, 0, 0 ms** | **100 / 100 / 100 / 100, 0.40 s, 0, 0 ms** |

Mobile LCP is the H1 text (LCP = FCP). It is slower than the old page because of three render-blocking stylesheets plus the display font. It is still inside the 2.5 s "good" limit. A possible follow-up is to inline critical CSS or preload the font.

## axe-core and console (`axe-console-v3.json`)
- 390 and 1440, after every interaction: 0 violations. Console errors: 0, with and without reduced motion.
- v1 had `label-content-name-mismatch` on the seating table buttons and Lighthouse color-contrast on the story cards. v2 had `region` on the sticky CTA. All are fixed.
- No-JS: the full page renders; the H1 is "אישורי הגעה וסידורי הושבה לחתונה. בחינם.", the envelope is open and the story is ordered.

## Budgets
- JS, gzip -9: landing.js 1935, demos.js 2771, render.js 1518, store.js 1168. That is 7.4 KB total (budget 10 KB), and demos load lazily.
- CSS, gzip: base 3647, sections 5535, motion 1078, nojs 353.
- No new dependencies, no WebGL, no GSAP or Three.js. CSP for `/` adds only `'self'` to `script-src` through `page(..., { selfScript: true })`. Every other route's CSP is unchanged, and tests cover this.

## Tests
- Hosted unit tests: 44/44 (`tests/hosted-landing.test.mjs`, 11 new tests), plus typecheck, lint and `node scripts/landing-version.mjs --check`.
- Not run: the Playwright e2e suite, because the vinext dev webServer does not start on the build box. Playwright visual-regression baselines are not committed yet; that is a follow-up.

## Owner decisions / content still open
- The founder line under "למה זה בחינם?" is the approved plural wording, marked OA in `copy.ts`.
- "בלי פרסומות" (footer, OG image, FAQ) is true of the code, but the privacy page only says "no ad cookies / no personalised ads". Either keep it or align the legal text.
- `/capacity` links 404 until #50 is merged. Merge #50 before or together with this PR.
- `og.png` is rendered from `docs/landing/og/og.html`. The owner can replace it.
- Sign-in copy says Google. Password accounts exist in code but are off unless `HOSTED_PASSWORD_LOGIN=1` (production var, owner's call).
