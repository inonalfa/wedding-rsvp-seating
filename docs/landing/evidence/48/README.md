# Evidence for #48 (/capacity request form)

Local hosted fixture (http://127.0.0.1:4174), Chrome headless, 26.11.2026.

- Screenshots: `capacity-m.webp` (390), `capacity-d.webp` (1440), `capacity_sent_1-m.webp` (thank-you state).
- axe-core: 2 color-contrast nodes, both from the shared `--muted` token (#6f7b76, 4.4:1). Fixed in #46's PR (shared app.css), so this goes away after both merge.
- Console: one Turnstile 400 error. It comes from the fixture's fake site key, not from production.
- Lighthouse `/capacity`, median of 3:

| | Perf | A11y | BP | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| Mobile | 100 | 93 | 96 | 91 | 0.90 s | 0.018 | 0 ms |
| Desktop | 100 | 93 | 96 | 91 | 0.24 s | 0.002 | 0 ms |

A11y = the shared contrast token above. BP = the fixture Turnstile console error. SEO = no meta description (same on every `page()` route today).
- Hosted unit tests: 37/37 pass (`tests/hosted-capacity.test.mjs` new). Typecheck + lint pass. The Playwright e2e suite was not run (the vinext dev server webServer failed to start on the box); the fixture siteverify regex now accepts `capacity`.
- Quota text checked against code: 1 event per account (api.ts ON CONFLICT owner_id), 300 invitations / 500 people (api.ts:111), 60 tables (api.ts:345).

Owner steps (not done by this PR): none required for the code path. Requests are emailed through the existing feedback mailer to FEEDBACK_EMAIL_TO and stored in the feedback table with page_url `/capacity`; no GitHub issue is created. If capacity mail should go to a different address, that is a production var change for the owner.
