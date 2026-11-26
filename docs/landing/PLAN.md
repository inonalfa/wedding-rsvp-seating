# RSVP Plus ("אישור הגעה פלוס") landing rebuild: execution plan

Status: draft for owner review. Scope: the anonymous `GET /` landing of the hosted Worker only. Concept: Everything Falls Into Place. Art direction: Editorial Romance.

Conventions in this document:
- **[OA]** marks copy that needs owner approval before it ships.
- **[PH]** marks placeholder content that must never reach production.
- Every product fact cites the code audit (`evidence/AUDIT-code.md`) as `file:line`.

---

## 1. Summary, goals, non-goals

### Summary

We will replace the short landing produced by `landingPage()` with a long-form, server-rendered editorial page. The story runs in one direction: scattered wedding-planning pieces settle into the real product.

- **Hero:** opens with a signature envelope, with the headline painted at first paint.
- **Demos:** three working, fully fictional demos (RSVP, seating, invitation themes) share one in-memory store.
- **Honesty:** the page ends with plain statements about why the service is free, what it cannot do, and a calm final call to action.
- **Stack:** HTML, CSS, inline SVG and about 18 KB of gzipped vanilla JS, loaded in islands.

### Goals (measurable)

1. **Coverage.** All 9 required sections from the brief, in Hebrew, RTL first, mobile first.
2. **CTAs.** Exactly two CTA labels sitewide: "צרו את האירוע שלכם" -> `/auth/signup` and "התנסו בלי הרשמה" -> `/demo`.
3. **Lab metrics on mobile, Lighthouse 13, 3-run median:**
   - Performance >= 95, Accessibility 100 (floor 95), Best Practices 100, SEO 100.
   - LCP <= 1.5 s (hard ceiling 2.5 s), CLS <= 0.02 (ceiling 0.05), TBT <= 50 ms.
   - INP proxy <= 150 ms (ceiling 200 ms).
4. **Accessibility.** axe-core reports zero violations in every interactive state. Keyboard, touch and screen-reader paths are documented and tested.
5. **Tests.** All existing tests stay green. New unit, e2e, axe, visual regression, console-error, claims-lint and performance gates are added.
6. **Iteration.** At least two documented visual iteration rounds, each with an Opus vision critique.
7. **Claims.** No unsupported claims. Every factual sentence maps to a row in section 14 or carries an owner approval.

### Non-goals

- **No other routes.** No changes to `/app`, `/demo`, `/auth/*`, `/invite/*`, `/find-table/*`, `/events*`, `/api/*`, `/media/*`, legal or feedback pages. The one exception is the optional, owner-gated L12.
- **Shared files are touched only additively:**
  - No edits to `app.js` or `invitation-view.js`.
  - No edits to `invite.css`.
  - No edits to shared selectors in `app.css`.
- **No deploy.** No production deploy, preview deploy, DNS change or merge of user-visible changes without explicit owner approval.
- **No 3D, no animation libraries, no paid dependencies.** One dev-only dependency is proposed: `@axe-core/playwright`.
- **No i18n layer.** The page is Hebrew only.

---

## 2. Verified audit findings that shape the plan

| # | Finding | Source | Consequence |
|---|---|---|---|
| F1 | Anonymous GET `/` -> `landingPage(error)`. Signed-in GET `/` -> 303 `/app`. The session check runs first. | worker.ts:106-120, shell.ts:19 | Change only the body of `landingPage`. Keep the branch order and the `?signin=failed` alert. |
| F2 | `page()` is the only HTML wrapper. It always emits `app.css`, favicons and `Cache-Control: no-store`, and supports `options.head`. | http.ts:14-16 | Use `options.head` for meta, CSS and the script. Keep `no-store`: the same URL redirects signed-in users, so caching HTML is unsafe. |
| F3 | The `page()` CSP has no `'self'` in `script-src`. Inline script and style are blocked. `img-src 'self' data:` applies. | http.ts:18 | Add an opt-in `selfScript` option that defaults off. No inline `style=""`, `<style>` or inline `<script>`. Custom properties are set only through classes. |
| F4 | `app.css` is shared by every page. `.eyebrow`, `.muted` and the footer fail contrast. | app.css:14-45,22,26,114 | All landing styles go in a separate file, scoped under `body.landing-page` with an `lp-` prefix. Never edit `app.css`. |
| F5 | There is no asset fingerprinting. | shell.ts:8, invites.ts:53 | A hand-run hash script writes a version constant. A test fails when the constant is stale. |
| F6 | Real themes are `garden`, `night` and `blush`, named "גן ירוק", "לילה כחול", "ורוד עדין". The CSS is scoped under `.inv`. | details.ts:50-52, app.js:561, invite.css:3-6 | Reuse `invite.css` and the theme classes for authentic previews. |
| F7 | `invitationMarkup` emits `<header>`, `<main>`, `<footer>`, an `h1` and `id="rsvp"`. With a guest it also emits a live `<form>`. | invitation-view.js:92-114 | Do not inject its output. Use landing-owned markup built on the real `invite.css` classes (see 3.6). |
| F8 | `app.js` auto-runs and owns the localStorage keys `wedding-demo-v1`, `wedding-message-template` and `wedding-sent-v1`. | app.js:5-9,1054 | Never import `app.js`. The landing never touches Web Storage. |
| F9 | Seating rules: only RSVP "yes" guests are seatable. The head count must fit the capacity, otherwise the seat is refused. Declining removes the seat. | api.ts:396, seating.ts:38-47, api.ts:331-334 | The seating demo mirrors these rules exactly. |
| F10 | WhatsApp is never automated. The app opens `wa.me` with a ready message, per guest. | whatsapp.js:13-15, app.js:931-939, legal.ts:163 | The copy says so explicitly. The demo never opens `wa.me`. |
| F11 | Current overstatements on the landing: "בזמן אמת", "אין מעקב", and "שליחה בוואטסאפ" implying bulk sending. | shell.ts:36,47,54 | Replaced by verified wording (section 14). |
| F12 | Coupled tests check `logo.webp`, `href="/privacy"`, `href="/terms"`, `href="/feedback"`, the nav "תפריט ראשי" with a link "הדגמה", and the signed-in 303. | hosted-app.test.mjs:103,270-273, hosted-feedback.test.mjs:155-158, hosted.spec.ts:108-109 | The new markup keeps all of them (section 10). |
| F13 | Fonts are already self-hosted: Heebo 400 and 700, and Frank Ruhl Libre as a single file with no weight declared. | app.css:1-3 | No new font origins. `font-synthesis: none`. A woff2 subset is decided by measurement (4.2). |
| F14 | Baseline: mobile Perf 100, LCP 0.94 s, 120 KB. a11y 95 (4 contrast nodes). SEO 92 (no meta description). | measured | The baseline is the budget to protect, not headroom to spend. |
| F15 | When neither Google nor password login is configured, `/auth/signup` and `/auth/login` can return 503. | password.ts:103 | Production configuration must be confirmed before launch (L13). |
| F16 | When Turnstile is not configured, the RSVP POST returns 403. | abuse.ts:34-35 | Not a landing change. Listed in launch readiness because the conversion path depends on it. |

---

## 3. Architecture inside `hosted/`

### 3.1 New files

```
hosted/landing/
  page.ts            renderLanding({ error, origin }) -> { markup, head }
  head.ts            meta description, canonical, OG, font preload, CSS and module script tags
  version.ts         export const LANDING_VERSION = "<12 hex>" (generated)
  copy.ts            every user-facing Hebrew string, each with a // src: file:line or // OA comment
  data.ts            frozen fictional dataset (section 6.0), also serialized for the client
  icons.ts           inline SVG <symbol> sprite (about 12 icons), emitted once
  sections/
    header.ts  hero.ts  story.ts  rsvp-demo.ts  seating.ts  invitation.ts
    dashboard.ts  founder.ts  trust.ts  final-cta.ts  footer.ts
  styles/            CSS partials, one per section; source of truth for CSS
    00-layers.css  01-tokens.css  02-base.css  03-type.css  04-materials.css
    10-header.css  11-hero.css  12-story.css  13-rsvp.css  14-seating.css
    15-invitation.css  16-dashboard.css  17-founder.css  18-trust.css  19-final.css  20-footer.css
    90-motion.css  99-nojs.css (copied to nojs.css, not concatenated)
hosted/public/assets/landing/
  landing.css        generated concatenation of styles/0*-9* (committed)
  nojs.css           generated copy of 99-nojs.css (committed)
  landing.js         boot module: feature flags, envelope, island loader (<= 4 KB gz)
  store.js           pure reducer, selectors, createStore (no DOM access)
  story.js  rsvp.js  seating.js  themes.js  dashboard.js   islands, loaded on visibility
  grain.webp         96x96 paper grain tile, <= 3 KB
  og.jpg             1200x630 social card, <= 80 KB (design approval required)
  founder.webp       only after owner approval and consent (L1), <= 60 KB, 640w
scripts/
  landing-build.mjs   concatenates CSS partials, copies nojs.css, hashes all landing assets, writes version.ts
  landing-lint.mjs    claims lint plus dash lint (regex, no dependencies)
  landing-budget.mjs  reads Lighthouse JSON reports, compares them to budget.json, prints a markdown table
tests/
  hosted-landing.test.mjs   tests/landing-store.test.mjs
e2e/
  landing.spec.ts  landing-a11y.spec.ts  landing-visual.spec.ts  landing-perf.spec.ts
docs/landing/
  PLAN.md  DECISIONS.md  CLAIMS.md  iterations/round-1.md  iterations/round-2.md  budget.json
```

### 3.2 Build step

The only build step is `node scripts/landing-build.mjs`. It uses `fs` and `crypto` only and adds no dependency. Its output is committed. `tests/hosted-landing.test.mjs` re-runs the concatenation and hashing in memory and fails with "run node scripts/landing-build.mjs" when anything is stale. This keeps the "static assets, no build" property of `hosted/public` (wrangler.jsonc:7) while avoiding merge conflicts on one big CSS file.

### 3.3 `shell.ts` switch

`landingPage(error = "", origin = "")` becomes a thin wrapper:

```ts
const { markup, head } = renderLanding({ error, origin });
return page(LANDING_TITLE, markup, 200, false, false,
  { bare: true, bodyClass: "landing-page", selfScript: true, head });
```

- **Call site.** `worker.ts:119` passes `env.HOSTED_ORIGIN ?? ""` as the second argument. The worker behaviour is otherwise untouched.
- **Old landing.** The old markup is deleted. The dead `.landing*` rules in `app.css` stay (an optional cleanup, not in scope).
- **Title.** "אישור הגעה פלוס - הזמנות דיגיטליות, אישורי הגעה וסידורי הושבה לחתונה" **[OA]**.

### 3.4 `PageOptions` change (`http.ts`)

```ts
export type PageOptions = { ...; selfScript?: boolean };
// inside the CSP template, http.ts:18
`script-src${options.selfScript ? " 'self'" : ""}${useTurnstile ? " https://challenges.cloudflare.com" : ""} https://static.cloudflareinsights.com`
```

- **Defaults.** The option defaults off, so `/privacy`, `/terms`, `/auth/*`, `/feedback`, invites and legacy pages emit byte-identical headers.
- **Coverage.** The existing tests (hosted-app.test.mjs:244-249) plus new explicit tests cover this.

### 3.5 Head contents (via `options.head`)

```html
<meta name="description" content="הזמנה דיגיטלית, אישורי הגעה וסידורי הושבה לחתונה. שירות חינמי, בלי פרסומות. התנסו בהדגמה בלי הרשמה.">  [OA]
<link rel="canonical" href="{origin}/">                       (omitted when origin is empty)
<meta property="og:type" content="website"><meta property="og:locale" content="he_IL">
<meta property="og:title" ...><meta property="og:description" ...><meta property="og:url" content="{origin}/">
<meta property="og:image" content="{origin}/assets/landing/og.jpg?v={V}">  (only after og.jpg approval)
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#faf8f3">
<link rel="preload" href="/fonts/frank-ruhl-libre.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="/assets/invite.css">
<link rel="stylesheet" href="/assets/landing/landing.css?v={V}">
<noscript><link rel="stylesheet" href="/assets/landing/nojs.css?v={V}"></noscript>
<script type="module" src="/assets/landing/landing.js?v={V}"></script>
```

- **Escaping.** All attribute values go through `escapeHtml`.
- **Canonical value.** Uses `HOSTED_ORIGIN`, so the canonical on production is `https://rsvp.hamisrd.co.il/`.

### 3.6 Versioning

- **Version source.** `LANDING_VERSION` is the first 12 hex characters of a SHA-256 over all files in `hosted/public/assets/landing/`.
- **Static references.** Top-level CSS and JS use `?v=`.
- **Islands.** They are loaded with dynamic import that reuses the boot module's query string:
  `import(new URL("./seating.js" + new URL(import.meta.url).search, import.meta.url))`.
  Every island and `store.js` therefore share one versioned URL, which gives one module instance and correct cache-busting.
- **Unchanged files.** `invite.css` and fonts are unversioned, as today.
- **To verify in L2.** The default Workers Static Assets cache headers are not in the supplied files. Record the observed headers in the PR.

### 3.7 Invitation preview approach (decision)

**Decision: do not call `invitationMarkup` on the landing.** Render landing-owned markup that uses the real `invite.css` classes and tokens:

```html
<div class="inv theme-garden">
  <div class="inv-hero"><div class="inv-hero-inner">
    <p class="inv-kicker">מתחתנים</p>
    <p class="inv-names"><span>מאיה</span><i aria-hidden="true">&amp;</i><span>עומר</span></p>
    <p class="inv-date"><time datetime="2027-06-17">17 ביוני 2027</time><span>יום חמישי</span></p>
  </div></div>
  <div class="inv-body"> <div class="inv-schedule">... </div> <div class="inv-choice">(non-interactive spans styled as .inv-btn)</div></div>
</div>
```

**Why:**
- No nested `<main>`, `<header>` or `<footer>`, no second `h1` and no `id="rsvp"`.
- No live form, and no external Waze, Maps or Calendar links to a fictional venue.
- The `/privacy` link (F7) is avoided.

**Fidelity safeguards:**
- Theme colors, fonts and spacing come from the real `invite.css`.
- A unit test asserts that every `inv-*` class used on the landing exists in `invite.css`.
- A unit test asserts that the theme ids equal the validated set in `invitation-view.js:58`.
- Landing-scoped overrides are limited to sizing: `.lp-invite .inv-hero { min-height: auto }` plus an aspect-ratio frame. Colors and fonts are never overridden.
- The landing omits `.inv-eyebrow` and `.inv-legal`. Their product contrast (gold `#b8945a` on `#fbf9f4`, about 2.7:1) would fail axe.
- That product contrast, and the `.inv-kicker` letter-spacing on Hebrew (invite.css), are logged as product follow-ups in `docs/landing/DECISIONS.md`, not hidden and not fixed here.

### 3.8 Isolation rules (tested)

1. The landing never imports `app.js` or `invitation-view.js`.
2. No `localStorage`, `sessionStorage`, IndexedDB, cookies or `document.cookie` access. The e2e test asserts storage length is 0 before and after all interactions.
3. No network calls from landing JS. The e2e test records every request after `load`: only same-origin `/assets/landing/*` and the Cloudflare beacon are allowed. No `fetch`, `XMLHttpRequest` or `sendBeacon` appears in landing JS (unit grep test).
4. All selectors live under `body.landing-page` with an `lp-` prefix. The only exception is `.inv*` theme classes, used read-only.
5. No inline `style=` or `<style>` anywhere in landing markup (unit test). SVG uses presentation attributes (`fill=`, `stroke=`), which CSP allows.
6. Demo forms carry no `name` attributes on free-text fields, so a no-JS submit leaks nothing (see 6.3).

### 3.9 Progressive enhancement and no-JS

- **Base markup is the complete, readable page.** Every section is server-rendered with its "settled" state.
- **`nojs.css`** (inside `<noscript>`) does three things:
  - shows the envelope already open;
  - turns the theme switcher into a static triptych;
  - hides interactive-only controls and shows "התנסו בלי הרשמה" links to `/demo` in each demo.
- **Motion flag.** `landing.js` sets `body[data-js="on"]` and `body[data-motion="on"]`, the latter only when reduced motion is not requested. Chaos offsets and envelope animation styles exist only under these attributes. Content is never hidden waiting for JS.

---

## 4. Design system

### 4.1 Color tokens (landing scope)

| Token | Hex | Role |
|---|---|---|
| `--lp-ivory` | `#faf8f3` | page ground (same as `--paper`) |
| `--lp-card` | `#ffffff` | product UI surfaces |
| `--lp-champagne` | `#f1e7d3` | stationery surfaces, tags, notes |
| `--lp-ink` | `#1b2a24` | primary text |
| `--lp-ink-soft` | `#4f5d57` | secondary text (replaces `--muted`) |
| `--lp-forest` | `#1f4d3d` | brand, primary buttons, dark sections |
| `--lp-forest-deep` | `#183d30` | hover, dark section shade |
| `--lp-gold` | `#b8945a` | decoration only: hairlines, seal, rules. Never text. |
| `--lp-gold-ink` | `#7a5c2e` | gold-colored text (eyebrows, numerals on light) |
| `--lp-gold-light` | `#d9bf8c` | gold text on forest |
| `--lp-line` | `#e3e0d8` | hairline dividers (decorative) |
| `--lp-good` / `--lp-bad` / `--lp-wait-ink` | `#2e7d4f` / `#b3423a` / `#8a5d0c` | status, inside product UI only |

Coral appears only inside `logo.webp`.

**Computed contrast (WCAG 2.x relative luminance, rounded down):**

| Pair | Ratio | Use | Pass |
|---|---|---|---|
| ink on ivory | 14.1 | body | AA/AAA |
| ink on white | 14.9 | product UI | AA/AAA |
| ink on champagne | 12.1 | notes | AA/AAA |
| ink-soft on ivory | 6.5 | secondary text | AA |
| ink-soft on white | 6.9 | product UI | AA |
| ink-soft on champagne | 5.6 | notes meta | AA |
| forest on ivory | 9.0 | links, secondary button text | AA/AAA |
| forest on champagne | 7.8 | tags | AA/AAA |
| white on forest | 9.6 | primary button | AA/AAA |
| ivory on forest | 9.0 | dark sections | AA/AAA |
| champagne on forest | 7.8 | dark section secondary | AA/AAA |
| gold-light on forest | 5.3 | dark section eyebrows | AA |
| gold-ink on ivory | 5.8 | eyebrows, numerals | AA |
| gold-ink on white | 6.1 | | AA |
| gold-ink on champagne | 5.0 | | AA |
| bad on white / ivory | 5.5 / 5.2 | over-capacity text | AA |
| good on white | 5.0 | "מגיעים" badge | AA |
| wait-ink `#8a5d0c` on white | 5.7 | "ממתינים" | AA |
| gold `#b8945a` on ivory | 2.6 | **fails**: decoration only | n/a |
| old `--muted #6f7b76` on ivory | 4.1 | **fails**: not used | n/a |
| old `--wait #a87412` on white | 4.0 | **fails**: replaced by wait-ink | n/a |
| app focus `#8fc2ad` on ivory | 1.8 | **fails 3:1 non-text**: replaced | n/a |

**Focus ring:**
- On light grounds: 3px `--lp-forest` outline, offset 3px (9.0:1).
- On forest grounds: 3px `--lp-champagne` (7.8:1).

**Gradients:** only as low-contrast material shading on the envelope paper and the wax seal. There are no decorative background gradients. The real invitation theme heroes keep their own gradients because they are product.

### 4.2 Typography

- **Families.** Display is Frank Ruhl Libre (single file, rendered at its native weight). Text is Heebo 400 and 700.
- **Synthesis.** `font-synthesis: none` prevents fake bold or italic.
- **Fallbacks.** Metric-adjusted fallback faces (`size-adjust`, `ascent-override`) are tuned in L4 so the font swap does not shift layout:
  - `"Frank Ruhl Fallback"` on `local("David")` and `local("Times New Roman")`;
  - `"Heebo Fallback"` on `local("Arial")`.
- **Letter-spacing.** Always 0 on Hebrew. Eyebrows are built from size, weight, `--lp-gold-ink` color and a 32px gold hairline. Never uppercase transforms or tracking.
- **Numerals.** Counters, times and table numbers use the display serif with `font-variant-numeric: tabular-nums` for counters.

| Role | Mobile (390) | Desktop (1440) | Line height | Family |
|---|---|---|---|---|
| Display (h1) | 2.75rem | clamp to 5.5rem | 1.08 | Frank Ruhl |
| Section h2 | 2.1rem | 3.6rem | 1.12 | Frank Ruhl |
| h3 | 1.3rem | 1.6rem | 1.25 | Frank Ruhl |
| Lead | 1.125rem | 1.3rem | 1.65 | Heebo 400 |
| Body | 1.0625rem | 1.125rem | 1.7 | Heebo 400 |
| Eyebrow / label | .95rem | 1rem | 1.4 | Heebo 700 |
| Small (min) | .9375rem | .9375rem | 1.55 | Heebo 400 |

- **Measure.** Body text max 38em, about 60 Hebrew characters. Leads max 30em.
- **Font bytes.** The current woff sizes are not in the supplied files. L4 measures them:
  - If the three files total <= 100 KB, keep them, preload only Frank Ruhl, and finish.
  - If they exceed 100 KB, create woff2 subsets under `/fonts/landing/` using `pyftsubset` as a one-off tool (not a repo dependency). Ranges: U+0020-007E, U+00A0, U+05B0-05EA, U+05F3-05F4, U+20AA, U+2019. Keep the OFL license files and log the decision in `docs/landing/DECISIONS.md`.
  - The landing declares the same family names in `landing.css` after `app.css`, so the landing loads only the subsets.
  - Budget: <= 90 KB woff2 total.

### 4.3 Spacing and grid

- **Spacing scale (rem).** 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8.
- **Section rhythm.** 6rem on mobile, 8-10rem on desktop.
- **Mobile grid.** 4 columns, 20px side margins, 16px gutters.
- **Desktop grid.** 12 columns, max 1240px, 24px gutters.
- **Asymmetry is intentional.**
  - Hero: text in columns 1-7 (right side in RTL), envelope in 8-12.
  - Story: copy rail 4 columns plus stage 8.
  - Trust: offset two-column ledger.
- **Logical properties only** (`margin-inline-start` and similar), so RTL is native.

### 4.4 Stationery materials

- **Paper grain.** A `grain.webp` tile at 4-6% opacity on `--lp-ivory` grounds, applied via a `::before` layer with `pointer-events: none`. A precomputed tile is cheaper to paint than an SVG `feTurbulence` filter on mobile.
- **Envelope.** Pure SVG and CSS:
  - a body rectangle, back flap and front pocket drawn as SVG paths;
  - the moving flap is an HTML element using `clip-path: polygon()` and `rotateX` under `perspective`;
  - a wax seal as a circle with a radial gradient and an embossed monogram "מ ע" in `--lp-forest`.
- **Deckle edge** on the hero card: an SVG mask, emitted once and referenced by id.
- **Place cards** for tables: tented-card silhouette via `clip-path`, a hairline gold fold line and the serif table number.
- **Notes and scraps** in the story: champagne paper, a slight rotation via classes `.lp-tilt-1..6`, and a 1px shadow with no blur bloom.
- **Explicitly not used:** photos of stock weddings, AI imagery, 3D, glows, glassmorphism.

### 4.5 Iconography

- About 12 line icons on a 24px grid, 1.5px stroke, round joins, drawn in-house: envelope, people, table, check, clock, phone, link, shield, calendar, print, search, sparkle-free "seal".
- Inline `<symbol>` sprite with `<use href="#lp-i-...">`.
- Always `aria-hidden="true"` next to visible text labels.

### 4.6 CTA styles

- **Primary "צרו את האירוע שלכם".**
  - Forest pill, white text (9.6:1), min-height 48px, padding 0.75rem 1.5rem, Heebo 700 1.0625rem.
  - Hover `--lp-forest-deep`. Active `translateY(1px)`.
- **Secondary "התנסו בלי הרשמה".** Transparent with a 1px forest border, forest text (9.0:1), same size.
- **Text links.** Forest, underline offset 0.2em.
- **Header.** Shows only the primary pill. "כניסה" and the nav are quiet text links.
- **Targets.** All interactive targets are >= 44x44 px.

---

## 5. Section storyboard

Global page structure:
- `<header class="lp-header">` with the logo (`/assets/logo.webp`, alt "אישור הגעה פלוס") and `<nav aria-label="תפריט ראשי">`. The nav links are "איך זה עובד" (#story), "הדגמה" (/demo), "שאלות" (#faq), "כניסה" (/auth/login), plus the primary pill.
- The skip link "דלגו לתוכן" comes first.
- One `<main id="content">`.
- `<footer>` with `/privacy`, `/terms`, `/feedback` as plain `href="/privacy"` and so on.
- Each section is `<section id=... aria-labelledby=...>` with one `h2`. There is exactly one `h1` on the page.

On mobile, the header shows the logo, the "הדגמה" text link and the primary pill. The remaining links collapse into a `<details>` disclosure labelled "תפריט", which works without JS. The "הדגמה" link stays visible because e2e hosted.spec.ts:108-109 clicks it.

### S1. Hero with envelope (`#top`)

**Purpose:** immediate value, the brand promise, and both CTAs above the fold.

**Copy:**
- Eyebrow **[OA]**: "הזמנה דיגיטלית, אישורי הגעה והושבה"
- H1 **[OA]**: "כל פרט מוצא את המקום שלו."
- Lead **[OA]**: "יוצרים הזמנה מעוצבת, שולחים לכל אורח קישור אישי מהוואטסאפ שלכם, ורואים בדשבורד אחד מי מגיע ואיפה כל אחד יושב."
- CTAs: "צרו את האירוע שלכם" (/auth/signup), "התנסו בלי הרשמה" (/demo).
- Micro **[OA]**: "שירות חינמי, בלי פרסומות. ההדגמה עובדת בדפדפן שלכם, בלי הרשמה."
- Envelope button: "פתחו את ההזמנה" / "סגרו את ההזמנה".
- Card label (visible, small): "הזמנה לדוגמה. השמות בדויים."

**Layout:**
- 390: header, then eyebrow, h1 (2-3 lines), lead, the CTA pair stacked full-width, micro. The envelope's top edge and seal are visible at the bottom of the 844px fold. The envelope sits below the text and is never above the h1.
- 1440: text on the right, 7 columns. The envelope on the left, 5 columns, slightly rotated (-2deg) on a champagne shadow card.

**Interaction:** spec 6.1. **Motion:** flap rotation and card rise. **Reduced motion:** the state change is instant with no transition. **No-JS:** the envelope is open and the card is visible; the button is hidden.

**A11y:**
- The headline is the LCP element and is never animated.
- The envelope is a `<figure>` with `<figcaption>` "הזמנה לדוגמה". The button has `aria-expanded` and `aria-controls`.

**Facts:** F10 (WhatsApp is the user's own), free (legal.ts:6), no ads (legal.ts:69), demo in the browser (app.js:104-107).

### S2. Chaos to order (`#story`)

**Purpose:** the narrative. Four planning beats, each turning a messy artifact into the real product fragment.

**Copy:**
- H2 **[OA]**: "מבלגן של פתקים, לאירוע שמסתדר"
- Sub **[OA]**: "כל מה שהיה מפוזר בין פתקים, הודעות וגיליונות, מוצא מקום אחד."

**Beats:**
1. "פרטי האירוע". Scrap: a sticky note with a crossed-out time. Settles into a mini invitation card. Text: "שמות, תאריך, שעות, מקום ותמונות. ההזמנה מתעצבת מול העיניים שלכם." (shell.ts:45, app preview)
2. "רשימת המוזמנים". Scrap: a torn notebook list. Settles into a clean guest list with group tags. Text: "מוסיפים ידנית, מדביקים רשימה מאקסל או מעלים קובץ CSV, ומחלקים לקבוצות." (app.js:352-382,775-795)
3. "שליחה מהטלפון שלכם". Scrap: a pile of copied messages. Settles into the send list with "פתיחה בוואטסאפ" per guest. Text: "לכל אורח קישור אישי והודעה מוכנה. לוחצים, הוואטסאפ שלכם נפתח עם ההודעה, ואתם שולחים. אין שליחה אוטומטית." (whatsapp.js:13-15, legal.ts:163)
4. "תשובות והושבה". Scrap: a crumpled napkin seating sketch. Settles into place cards with "6/8". Text: "כל תשובה מופיעה בדשבורד. מי שאישר הגעה מחכה לשולחן, ואתם מושיבים בכמה לחיצות." (app.js:529-540, 627-647)

**Layout:**
- 390: each beat is a block holding the scrap and the product fragment on one stage (4:3 box, fixed aspect-ratio), with the text below.
- 1440: a sticky copy rail on the right (CSS `position: sticky`, not pinning or hijacking) and a stage on the left. The beats stack naturally.

**Interaction:** none required; the section is purely scroll-linked (6.2).

**Reduced motion and no-JS:** settled state. The product fragments are fully visible, and the scraps show as a small "before" thumbnail beside each fragment.

**A11y:**
- Scraps are `aria-hidden="true"` because they are decorative.
- Fragments carry real text. Each beat is an `<article>` with an `h3`.

### S3. RSVP demo (`#rsvp-demo`)

**Purpose:** feel the guest side, and watch the owner side react.

**Copy:**
- H2 **[OA]**: "ככה זה נראה אצל האורחים"
- Sub **[OA]**: "ענו בשם יעל, אורחת בדויה. התשובה מתעדכנת מיד בדשבורד שבהמשך העמוד, ושום דבר לא נשלח לשום מקום."
- Form copy mirrors the product (invitation-view.js:92-98): "נתראה ברחבה?", "כמות מגיעים", "ברכה או הערה (לא חובה)", "מאשרים הגעה", "לא מגיעים".
- Status: "התשובה של יעל נקלטה בהדגמה: מגיעים, 2 אורחים." / "...: לא מגיעים."
- Link: "לדשבורד" (#dashboard).

**Layout:**
- 390: a phone-width invitation card (garden theme classes) with the form, then a mini counter strip "מגיעים 9 · ממתינים 3".
- 1440: the card on the left; on the right, a live "תשובות אחרונות" feed of 3 items plus the counter strip.

**Interaction:** spec 6.3. **No-JS:** the form shows with a note "כדי לנסות, היכנסו להדגמה" and link "התנסו בלי הרשמה" (nojs.css). Submit goes to `/demo` and carries no free text.

**Facts:** the RSVP flow (invites.ts:59-122), guest count 1-20 (api.ts:37), declining removes the seat (invites.ts:109-113).

### S4. Seating (`#seating`)

**Purpose:** the "falls into place" moment, with honest capacity rules.

**Copy:**
- H2 **[OA]**: "כל משפחה בשולחן שמתאים לה"
- Sub **[OA]**: "בחרו אורחים שאישרו הגעה והושיבו אותם. אם אין מספיק מקום לכל המשפחה, השיבוץ לא יתבצע ותראו כמה מקומות חסרים."
- Hint: "בוחרים אורח ואז שולחן. במחשב אפשר גם לגרור."
- Unseated header: "ממתינים לשיבוץ"
- Pending guests caption: "עוד לא ענו, לכן אי אפשר להושיב אותם."

**Layout:**
- 390: unseated chips in a horizontal wrap at the top, then three place-card tables stacked, each with a capacity bar.
- 1440: an unseated column on the right (3 columns) and a 3-up table row (9 columns).

**Interaction:** spec 6.4. **No-JS:** a half-seated static state with the link "התנסו בלי הרשמה".

**Facts:** F9; tables 1-60 with capacity 1-50 (api.ts:344-348); auto-seat by group (app.js:846-863); drag on desktop and tap elsewhere (app.js:1027-1041); print (app.js:958).

### S5. Invitation themes (`#invitation`)

**Purpose:** show the real design range.

**Copy:**
- H2 **[OA]**: "הזמנה שנראית כמו שלכם"
- Sub **[OA]**: "שלוש ערכות עיצוב מתוך המערכת. מוסיפים תמונות, מילים ושעות, והאורחים מקבלים דף עם ניווט, הוספה ליומן ואישור הגעה אישי."
- Legend "ערכת עיצוב", options "גן ירוק", "לילה כחול", "ורוד עדין" (app.js:561).

**Layout:**
- 390: a radio pill row (horizontal scroll if needed) above one 3:4 preview.
- 1440: the preview centered, with a stationery "swatch" column listing each theme's ink, accent and gold as small color chips (decorative).

**Interaction:** spec 6.5. **No-JS:** a triptych of all three previews, side by side on desktop and horizontally scrollable on mobile with snap.

**Facts:** F6; photos cover/couple/card <= 800 KB (media.ts:5,9-14); Waze, Maps and calendar links (invitation-view.js:68-72).

### S6. Dashboard and guest management (`#dashboard`)

**Purpose:** the owner's control room.

**Copy:**
- H2 **[OA]**: "תמונה אחת של כל התשובות"
- Sub **[OA]**: "מי מגיע, מי לא, מי עוד לא ענה, כמה כבר הושבו, וכל הברכות במקום אחד."
- Stats labels mirror app.js:529-535: "הזמנות", "מגיעים", "לא מגיעים", "ממתינים", "הושבו".
- Filters: "כולם", "מגיעים", "ממתינים", "לא מגיעים".
- Notes header: "ברכות והערות".
- Event-day card **[OA]**: "ביום האירוע: קישור לצוות הכניסה שמחזיר רק מספר שולחן לפי שם מלא, ותקף 24 שעות."
- Export line **[OA]**: "ייצוא רשימה לקובץ CSV שנפתח באקסל, והדפסת סידורי ההושבה."

**Layout:**
- 390: a 2x2 stat grid plus a full-width "הושבו" stat, the filter pills, a list of 8 guests as cards, notes, and the event-day card.
- 1440: a 5-up stat row, then two columns: the guest table with filters (left) and notes plus the event-day card (right). Status colors appear only here.

**Interaction:** spec 6.6. **No-JS:** static counters from server data; the filters are hidden.

**Facts:** table search (table-search.ts:11-14), CSV export (app.js:797-810), print (seating.ts:80).

### S7. Founder story (`#founder`)

**Purpose:** a human reason to trust.

- **Content [PH]:** server-rendered only when `data.founder` is non-null. The default is null, and the section is omitted entirely, including from the nav.
- **Structure:** h2 "[[PLACEHOLDER: כותרת]]", a first-person quote up to 120 words, name and role, photo 640w webp with alt text from the owner.
- **Layout:**
  - 390: the photo (4:5, `width` and `height` attributes, `loading="lazy"`) above the quote.
  - 1440: the photo at 4 columns, the quote at 7 columns in display serif.
- **Requirements:** the owner supplies the text, photo and written consent (L1). No invented biography.

### S8. Free service, limits, trust, FAQ (`#free`, `#faq`)

**Copy:**
- H2 **[OA]**: "חינם, ומה חשוב לדעת"

**Ledger rows**, each an `h3` plus 1-2 lines:
1. "חינם ובקוד פתוח" - "השירות ניתן בחינם, והקוד שלו פתוח לציבור." (legal.ts:6,170). The "למה חינם" sentence is **[OA]** and owner-supplied.
2. "בלי פרסומות ובלי מעקב שיווקי" - "אנחנו לא מציגים פרסומות ולא מוכרים מידע." (legal.ts:69,32)
3. "הנתונים נמחקים אחרי האירוע" - "90 יום אחרי האירוע הכול נמחק אוטומטית. אפשר לייצא או למחוק קודם. גיבויים עשויים להישמר עד 7 ימים נוספים." (events.ts:16-39, retention.ts:46-60, legal.ts:81)
4. "מגבלות שכדאי להכיר" **[OA]** - "אירוע אחד לכל חשבון, עד 300 הזמנות ו-500 מוזמנים, ועד 60 שולחנות. כשהשירות מגיע למכסה החינמית שלו, ייתכן שיצירת אירועים והוספת מוזמנים ייעצרו זמנית." (events.ts:58, api.ts:110,133,344, api.ts:158; legal.ts:122-129)
5. "בלי התחייבות לזמינות" - "השירות ניתן כמו שהוא, ללא התחייבות לזמינות." (legal.ts:118-119)
6. "קישורים מאובטחים" - "כל קישור אישי חתום ובתוקף 30 יום, ואפשר לבטל קישור של אורח בודד." (invites.ts:10,23-27, api.ts:316)

**FAQ** (`<details>`/`<summary>`, all **[OA]**):
- "זה באמת חינם?"
- "ההודעות נשלחות אוטומטית?" - "לא. המערכת מכינה לכל אורח הודעה עם קישור, ואתם שולחים אותה מהוואטסאפ שלכם או מעתיקים אותה."
- "אפשר לייבא מאקסל?" - "אפשר להדביק רשימה שהעתקתם מאקסל, או להעלות קובץ CSV. קובץ xlsx לא נקרא ישירות."
- "האורחים צריכים להירשם?" - "לא. כל אורח פותח קישור אישי ועונה."
- "מה קורה לנתוני ההדגמה כשנרשמים?" - "פרטי האירוע, המוזמנים, השולחנות והתמונות עוברים איתכם. תשובות והושבה מההדגמה לא עוברות." (app.js:502)
- "איך נכנסים?" - "עם חשבון Google. אנחנו מבקשים ממנו רק מזהה חשבון בסיסי." (auth.ts:154-163, legal.ts:12) **[OA]**: confirm production auth.

**Layout:**
- 390: single column, ledger rows separated by gold hairlines, then the FAQ.
- 1440: ledger in 2 offset columns, FAQ at 8 columns. **No-JS:** native.

**A11y:** `summary` elements are >= 44px tall; the expanded state is native.

### S9. Final conversion (`#start`)

**Copy:**
- H2 **[OA]**: "מוכנים שהכול יסתדר?"
- Sub **[OA]**: "צרו את האירוע, הוסיפו את המוזמנים, ותנו לפרטים למצוא את המקום שלהם."
- Both CTAs, plus the micro "ההדגמה בלי הרשמה. האירוע האמיתי נשמר בחשבון שלכם."

**Layout:** a full-width forest section with ivory text; the envelope motif returns closed and sealed as a still SVG. 390 is stacked; 1440 is centered at 8 columns. **No-JS and reduced motion:** identical.

**Footer:**
- "שירות חינמי, ללא פרסומות וללא התחייבות לזמינות." (kept verbatim, shell.ts:57)
- Links "פרטיות", "תנאי שימוש", "שליחת פידבק" as 44px targets, separated by spacing, not dots.

---

## 6. Interaction specs

### 6.0 Fictional dataset (`hosted/landing/data.ts`, frozen, fresh names)

- **Event.** Couple "מאיה" and "עומר". Date 2027-06-17, a Thursday; a unit test checks it with `Intl.DateTimeFormat("he-IL")`. Reception 19:00, ceremony 20:00. Venue text "גן לדוגמה" with no address and no map links.
- **Labels.** Every demo carries the visible tag "נתונים בדויים".
- **Overlap.** No name overlaps the `/demo` fixtures (app.js:703-727); a unit test checks this.

| id | Name | Group | Max | RSVP | Count | Table | Note |
|---|---|---|---|---|---|---|---|
| g1 | רוני ואלון גבאי | חברים | 2 | yes | 2 | t2 | |
| g2 | סבתא אסתר | משפחה | 1 | yes | 1 | t1 | "מחכה לרקוד!" |
| g3 | משפחת אזולאי | משפחה | 4 | yes | 4 | null | |
| g4 | ליאור בן דוד | עבודה | 2 | pending | 0 | null | |
| g5 | שקד ועידו | חברים | 2 | no | 0 | null | "נהיה בטיול, מזל טוב ענק" |
| g6 | דודה מרים ודוד שמעון | משפחה | 2 | yes | 2 | null | |
| g7 | יעל ברק (interactive) | חברים | 3 | pending | 0 | null | |
| g8 | צוות הסטודיו | עבודה | 5 | pending | 0 | null | |

| id | Label | Capacity |
|---|---|---|
| t1 | שולחן 1, משפחה | 8 |
| t2 | שולחן 2, חברים | 6 |
| t3 | שולחן 3, ליד הרחבה | 3 |

The table capacities are chosen so that seating "משפחת אזולאי" (4) at table 3 (capacity 3) demonstrates a refusal.

### 6.0.1 Shared store (`store.js`, pure, unit-tested in Node)

```
state = { guests[], tables[], selected: null|guestId, theme: "garden", filter: "all", lastMessage: "" }
reduce(state, action) -> { state, result: {ok:true} | {ok:false, reason, data} }
actions:
  rsvp {id, attendance:"yes"|"no", count, note}
    "no"  -> count 0, table null
    "yes" -> count clamped 1..max; if seated and the new count no longer fits -> table null, result.reason "unseated-capacity"
  select {id}    allowed only when attendance=="yes" (else reason "not-coming")
  seat {id, tableId}   reasons: "not-coming", "capacity" {free, needed}
  unseat {id}
  autoSeat       group-based, client-side, mirrors app.js:846-863 in spirit; skips guests that do not fit
  setTheme {theme in garden|night|blush}
  setFilter {all|yes|pending|no}
selectors: counts() -> {invitations, comingPeople, declined, pending, seatedPeople}; used(tableId); free(tableId)
createStore(initial) -> { get, dispatch, subscribe }   (microtask-batched notify)
```

- **Initial state.** The server serializes `data.ts` into `<script type="application/json" id="lp-data">`. It is non-executable and CSP-neutral; a unit test asserts it parses and contains no `</script`.
- **Single instance.** All islands import the same versioned `store.js` URL, so they share one instance.
- **Persistence.** None. A reload resets everything.

### 6.1 Envelope hero

**State machine:**

```
closed --(click | tap | Enter | Space on button)--> opening --(transitionend | 1000ms timeout)--> open
open   --(button)--> closing --> closed
any    --(prefers-reduced-motion: reduce)--> transitions are instant (opening/closing skipped)
closed --(scroll, motion allowed, @supports animation-timeline)--> flap lifts 0..25% linked to view(); never opens fully, never changes state
```

- **DOM.**
  - `<button class="lp-env-btn" aria-expanded="false" aria-controls="lp-card">פתחו את ההזמנה</button>`.
  - The card `#lp-card` is `inert` and `aria-hidden="true"` while closed, and neither while open.
  - The label swaps to "סגרו את ההזמנה". Focus stays on the button.
  - The whole envelope is also a pointer target that proxies to the button.
- **Rendering.** Only `transform` and `opacity` animate:
  - flap `rotateX(0 -> -178deg)` over 560ms with the transform easing;
  - card `translateY(0 -> -58%)` over 900ms with the settle easing, 180ms delay;
  - seal fades out over 160ms.
  The envelope box has a fixed `aspect-ratio`, so opening causes no layout shift.
- **LCP guard.** The h1 is server-rendered and never transformed, faded or delayed. The envelope contains no `<img>`, and the card text is smaller than the h1 block. Lighthouse must report the h1 as the LCP element (asserted in `landing-perf.spec.ts` via `largest-contentful-paint` entry `element.tagName === "H1"`).
- **Before JS.** The button exists but does nothing until `landing.js` runs (deferred module, a few ms). `nojs.css` shows the card open when JS is disabled.
- **Screen reader.** The button announces "פתחו את ההזמנה, מכווץ". The card holds a short text: "מאיה ועומר מתחתנים, יום חמישי 17 ביוני 2027. הזמנה לדוגמה."

### 6.2 Chaos-to-order story

- **Primary path.** Pure CSS, no JS:

```css
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    body[data-motion="on"] .lp-scrap { animation: lp-settle linear both; animation-timeline: view(); animation-range: entry 10% cover 45%; }
  }
}
```

  Each scrap class (`.lp-tilt-1..6`) defines `--from-x`, `--from-y` and `--from-r` in CSS, not inline. The keyframes go from offset and rotated to `none`.
- **Fallback path** (`story.js`, loaded only when `animation-timeline` is unsupported and motion is allowed):
  - One `IntersectionObserver` (threshold 0.35) toggles `.is-settled`.
  - A CSS transition of 900ms with the settle easing.
  - The observer unobserves after settling, so it settles once and never re-scatters.
- **No hijacking.** No pinning beyond `position: sticky` for the copy rail, no wheel or touch listeners, no `scroll-snap` on the page.
- **Reduced motion.** Settled immediately. Scraps sit as static "before" thumbnails.

### 6.3 RSVP demo

- **Form.**
  - `<form class="lp-rsvp" action="/demo" method="get" novalidate>`.
  - The attendance buttons and the count select have no `name`; JS reads them by id. A no-JS submit therefore lands on `/demo` with no query.
  - The textarea has no `name` and `maxlength="500"`.
- **States:** `idle -> answered(yes|no) -> idle (edit again)`. On submit, JS calls `preventDefault`, then `dispatch(rsvp)`, then:
  - updates the "כרגע רשום" line;
  - writes the polite live region `#lp-rsvp-status`;
  - pulses the affected counters (opacity 160ms, disabled under reduced motion).
- **Keyboard.** Tab order: count, note, "מאשרים הגעה", "לא מגיעים". Enter on a focused button submits that choice. Focus stays on the pressed button.
- **Validation.** The count is clamped to 1..3 (Yael's max). There are no error states beyond that.
- **Cross-effects.**
  - Yael appears in "ממתינים לשיבוץ" (seating) when she answers yes.
  - She disappears from her table when she answers no; the seating live region announces "יעל ברק הוסרה משולחן 2 כי סימנה שלא מגיעה".
  - The dashboard counters update.
- **Network.** None. A unit grep test and an e2e request log enforce this.

### 6.4 Seating

**State machine (per page):**

```
idle --(activate chip of "yes" guest)--> picking(guest)
picking --(activate table)--> seat: ok -> idle (announce) | refused -> picking (announce reason, table shakes 0px: color+icon only)
picking --(Esc | activate same chip | "ביטול")--> idle
idle --(activate "החזרה לרשימה" on seated chip)--> idle (unseat, announce)
pending/declined guest chip --(activate)--> idle (announce "אפשר להושיב רק מי שאישרו הגעה")
```

- **Controls.**
  - Unseated guests are `<button aria-pressed>` chips showing name and head count.
  - Tables are `<button>` place cards with an accessible name such as "שולחן 3, ליד הרחבה. 0 מתוך 3 מקומות תפוסים". While picking, the name appends "לחצו כדי להושיב את משפחת אזולאי".
  - Pending guests render as disabled-looking but focusable chips (`aria-disabled="true"`) so the explanation can be announced.
- **Capacity feedback.**
  - Each table shows "used/cap" (serif numerals) plus a bar.
  - Full state: wait-ink color and the text "מלא".
  - On refusal: a `--lp-bad` outline, an icon, and the inline text "חסרים 1 מקומות" (pluralized correctly: "חסר מקום 1" / "חסרים 2 מקומות") **[OA]**. It is shown for 4s and stays in the live region log.
  - Color is never the only signal.
- **Drag** (enhancement, `pointerType` mouse or pen only):
  - Pointer events with `setPointerCapture`; a ghost element moved with `transform` in rAF; hit-testing via cached table rects, recomputed on `resize`.
  - The drop dispatches the same `seat` action. Touch always uses tap-to-assign, so page scroll is never blocked.
- **Auto-seat.** The button "שיבוץ אוטומטי לפי קבוצה" seats fitting coming guests by group and announces the summary, for example "הושבו 3 הזמנות. 1 לא נכנסה בגלל מקום".
- **Live region.** `#lp-seat-status`, `aria-live="polite"`, `aria-atomic="true"`. It is the single source for announcements and reserves 2 lines of height so the layout does not shift.

### 6.5 Invitation themes

- **Control.** `<fieldset><legend>ערכת עיצוב</legend>` with three `input type="radio"` styled as pills (native arrow-key behavior in RTL).
- **On change.** Swap the `theme-*` class on `.inv` and update the visually hidden caption "מוצגת ערכת לילה כחול".
- **Motion.** A 280ms crossfade via two stacked previews (opacity only); reduced motion swaps instantly.
- **Data.** Default `garden`. The selection is stored only in the store, never persisted.

### 6.6 Dashboard and guest management

- **Counters.** Subscribe to the store and update text only. Numbers are wrapped in elements of fixed width (`tabular-nums`, `min-inline-size: 3ch`).
- **Filters.** `<button aria-pressed>` group. Filtering sets `hidden` on rows and updates "מוצגים 4 מתוך 8" in a polite region.
- **Send fragment.** "פתיחה בוואטסאפ" in the demo does not navigate. It shows an inline note: "במערכת האמיתית ייפתח הוואטסאפ שלכם עם ההודעה המוכנה, והשליחה נעשית מהטלפון שלכם." The WhatsApp button uses a desaturated forest outline, not `#25d366`.
- **Notes.** Notes from the store (including Yael's note, rendered via `textContent`) appear in "ברכות והערות".

---

## 7. Motion system

| Token | Value | Use |
|---|---|---|
| `--lp-dur-micro` | 160ms | counter pulse, seal fade, hover |
| `--lp-dur-short` | 280ms | theme crossfade, chip select |
| `--lp-dur-medium` | 560ms | envelope flap, capacity bar |
| `--lp-dur-long` | 900ms | card rise, scrap settle (fallback) |
| `--lp-ease-settle` | `cubic-bezier(0.16,1,0.3,1)` | arrivals, settling |
| `--lp-ease-transform` | `cubic-bezier(0.65,0,0.35,1)` | flap rotation, morphs |

### Principles

- Every motion explains a state change: opened, settled, seated, answered, themed.
- No idle loops, no parallax, no bounce, no cursor followers. Everything is interruptible: the CSS transitions reverse from their current value.

### Reduced motion

- With `prefers-reduced-motion: reduce`, `landing.js` never sets `data-motion="on"`. All motion selectors require that attribute, so the static settled state results.
- A `?reduced-motion` query forces the same behavior for QA.

### No WebGL, no GSAP, no Three.js

- **Why not.** The concept is paper and order, which CSS transforms, `clip-path`, scroll-driven animations and SVG render crisply at near-zero cost.
- **Cost.** Three.js (about 150 KB gz) or GSAP plus ScrollTrigger (about 40 KB gz) would multiply the JS budget, add a no-WebGL fallback burden and risk INP for no material gain.
- **No exception is planned.** Any future proposal needs a `DECISIONS.md` entry with measured numbers.

### INP safety

- Event delegation: one listener per island root, with passive listeners where applicable.
- Handlers only dispatch. DOM writes are batched in one rAF per store notification.
- No layout reads after writes in the same frame. Rects are cached.
- No handler exceeds 16ms on 4x CPU throttle (perf spec).
- Islands load on `IntersectionObserver` with `rootMargin: 600px`, so parsing happens before the user arrives.

### CLS safety

- Fixed `aspect-ratio` on the envelope, story stages, previews and founder photo.
- Reserved heights for live regions and status lines.
- Fallback font metrics are tuned.
- No content is injected above existing content. Banners render server-side only (`?signin=failed`).

---

## 8. Performance budgets

**Mobile lab, Lighthouse 13 simulated throttling:**

| Item | Budget (transfer, gzip/br) | Notes |
|---|---|---|
| HTML `/` | <= 28 KB | includes inline SVG sprite and the JSON dataset |
| CSS total | <= 26 KB | `app.css` (existing) + `invite.css` (existing) + `landing.css` <= 16 KB |
| JS initial | <= 4 KB | `landing.js` boot |
| JS islands | <= 14 KB total | store 2, story 1.5, rsvp 2.5, seating 5, themes 1, dashboard 2 |
| Fonts | <= 100 KB (or <= 90 KB woff2 after subsetting) | preload display only |
| Images | <= 15 KB above the fold (logo, grain) | founder <= 60 KB lazy; og.jpg not loaded by the page |
| Total initial transfer | <= 190 KB | full scroll with islands <= 290 KB |
| Requests at load | <= 11 | HTML, 3 CSS, 1-3 fonts, logo, grain, landing.js, favicon (+beacon in production) |
| DOM nodes | <= 1400 | |

| Metric | Target | Hard ceiling |
|---|---|---|
| LCP (h1) | <= 1.5 s | 2.5 s |
| CLS | <= 0.02 | 0.05 |
| TBT | <= 50 ms | 150 ms |
| INP (scripted proxy, 4x CPU) | <= 150 ms | 200 ms |
| Lighthouse mobile Perf / A11y / BP / SEO | >= 95 / 100 / 100 / 100 | 95 / 95 / 95 / 95 |
| Desktop LCP | <= 0.6 s | 1.2 s |

### How we measure

1. **Lighthouse on the local fixture.** Start the hosted fixture server (`node --import ./tests/resolve-typescript.mjs --experimental-strip-types e2e/fixtures/hosted-server.mjs`, port 4174).
   - Run `npx lighthouse@13` 3 times mobile (default) and 3 times with `--preset=desktop`, JSON output, on `http://127.0.0.1:4174/`.
   - Run `node scripts/landing-budget.mjs reports/*.json` to get median values and a markdown table checked against `docs/landing/budget.json`.
   - The CLI runs via `npx` pinned to v13. It is not a repo dependency.
2. **Transfer sizes** come from the Lighthouse network requests audit plus `landing-perf.spec.ts`, which sums the `transferSize` of resource timing entries.
3. **INP proxy** (`landing-perf.spec.ts`, Chromium):
   - CDP `Emulation.setCPUThrottlingRate(4)`.
   - A `PerformanceObserver` on `event` entries with `durationThreshold: 16`, installed via `page.evaluate`, so it needs no CSP bypass and no web-vitals dependency.
   - Scripted actions: open the envelope, answer the RSVP, select and seat, switch the theme, filter.
   - Assertion: max interaction duration <= 200 ms, p75 reported.
4. **Preview environment** numbers only after the owner approves a preview deployment (L13). Field LCP and INP are observed later via the existing Cloudflare RUM, with the owner's consent.

---

## 9. CSP

### `GET /` (anonymous) before, as measured

```
default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; script-src https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com
```

### `GET /` after (the only difference is `'self'` in `script-src`)

```
default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com
```

### Notes

- **Unchanged routes.** `/privacy`, `/terms`, `/feedback`, `/auth/*`, the 401 page, `/invite/*`, `/find-table/*`, legacy `/events*`, `/operator/usage` and 404 pages are byte-identical. New unit tests snapshot the `script-src` of `/privacy`, `/terms` and `/auth/login` to prove it. The `appShell` CSP is untouched.
- **What the landing relies on.**
  - `connect-src 'self'` is unchanged; landing JS makes no requests anyway.
  - The JSON data block `type="application/json"` is not script execution.
  - No `blob:` is needed.
- **Optional L12 (owner decision).** `/demo` currently logs a CSP console error because Cloudflare RUM injects its beacon and `appShell` allows only `script-src 'self'`. There are two options:
  - (a) add `https://static.cloudflareinsights.com` to `script-src` and `https://cloudflareinsights.com` to `connect-src` in `appShell`. The existing test (hosted-app.test.mjs:107) still matches `script-src 'self'`.
  - (b) disable RUM auto-injection for `/demo` and `/app` in the Cloudflare dashboard, which is an owner action with no code change.

  We recommend (b) if the owner prefers no analytics inside the app, and (a) otherwise. It is separate from the landing work.

---

## 10. Test strategy

### 10.1 Preserving coupled tests

| Assertion | How the new markup keeps it |
|---|---|
| hosted-app.test.mjs:270-273: `/assets/logo.webp`, `href="/privacy"`, `href="/terms"` | The header brand keeps `<img src="/assets/logo.webp" ...>`. The footer uses literal `href="/privacy"` and `href="/terms"` with no query or version. |
| hosted-feedback.test.mjs:155-158: `href="/feedback"` | The footer has a literal `href="/feedback"`. |
| hosted.spec.ts:108-109: nav "תפריט ראשי" with link "הדגמה" | `<nav aria-label="תפריט ראשי">` always contains a visible `<a href="/demo">הדגמה</a>` at every viewport. No other nav link contains the substring "הדגמה" (Playwright name matching is substring). |
| hosted-app.test.mjs:103: signed-in `/` -> 303 `/app` | `worker.ts` branch order is untouched. |
| hosted-app.test.mjs:107, 244-249; hosted.spec.ts:38-40 | `selfScript` defaults off. Auth and app CSPs are unchanged. |
| hosted-onboarding.test.mjs:162 | The landing contains no English "Fictional event" text. |
| `?signin=failed` banner | `role="alert"` paragraph at the top of `<main>`. A new test covers it. |

### 10.2 New unit tests (`node --test`, no build needed)

**`tests/hosted-landing.test.mjs`:**
- 200 status and the exact `/` CSP string.
- Meta description length 70-160 characters; canonical present when `HOSTED_ORIGIN` is set.
- Exactly one `<h1>`.
- Section ids `top, story, rsvp-demo, seating, invitation, dashboard, free, faq, start` present; `founder` absent when data is null.
- CTAs:
  - every `href="/auth/signup"` has text "צרו את האירוע שלכם";
  - every CTA-styled `/demo` link has text "התנסו בלי הרשמה";
  - no other CTA verbs ("מתחילים עכשיו", "הרשמה בחינם").
- No `style=`, no `<style`, no inline `<script>` without `src` except the `application/json` block.
- No U+2010-U+2015 or U+2212 characters, and no forbidden phrases (section 14).
- Version freshness plus CSS concatenation freshness.
- `inv-*` classes used exist in `invite.css`; theme ids equal the validated set.
- Other routes' CSP unchanged.
- The signin alert renders.
- Landing JS files contain no `localStorage`, `sessionStorage`, `fetch(`, `XMLHttpRequest`, `sendBeacon`, `app.js` or `wa.me`.

**`tests/landing-store.test.mjs`:**
- Reducer rules: pending and declined guests are not seatable; capacity refusal returns `free`/`needed`; decline unseats; a count change that no longer fits unseats.
- `autoSeat` respects capacity; counts selectors are correct; the date weekday is correct; there is no name overlap with `/demo` fixtures.

### 10.3 E2E (Playwright on the 4174 fixture)

- **Config.** Two new projects in `playwright.config.ts`:
  - `landing-desktop`: 1440x900, `he-IL`;
  - `landing-mobile`: 390x844, `isMobile`, `hasTouch`, deviceScaleFactor 3.

  Both use `testMatch: /landing.*\.spec\.ts/`. The existing project gets `testIgnore` for these files, so current e2e behavior and timing are unchanged.
- **`e2e/landing.spec.ts`:**
  - envelope by click, by keyboard (Tab to the button, Enter, then Space to close), and by tap on mobile; `aria-expanded` toggles;
  - the RSVP demo updates the counters ("מגיעים" 9 -> 11 for 2 guests);
  - seating: tap-to-assign succeeds; refusal for "משפחת אזולאי" -> table 3 announces the shortage; a pending guest is refused; Esc cancels; mouse drag seats on desktop;
  - the theme switch changes the class;
  - filters;
  - the no-JS context (`javaScriptEnabled: false`): content visible, envelope open, demo links present;
  - the reduced-motion context: no running animations (`document.getAnimations().length === 0` after load);
  - storage empty after all actions; a request allowlist; zero console errors or warnings.
- **`e2e/landing-a11y.spec.ts`.** Uses `@axe-core/playwright` (MPL-2.0, dev-only, about 1 MB on disk, maintained by Deque).
  - **Why this dependency:** the brief requires automated a11y gates, and hand-injecting axe would need a CSP bypass.
  - **Alternative considered:** the Lighthouse a11y score, which is coarser and has no per-state checks.
  - **Coverage:** tags `wcag2a, wcag2aa, wcag21aa, wcag22aa`, zero violations, run in the closed, open, picking, refused, themed (each theme) and no-JS states at both viewports.
- **`e2e/landing-visual.spec.ts`.**
  - `toHaveScreenshot` per section plus the full page at 390x844 and 1440x900.
  - `reducedMotion: "reduce"`, `animations: "disabled"`, `await document.fonts.ready`, `maxDiffPixelRatio: 0.01`.
  - Baselines are generated on Linux Chromium by the orchestrator and committed under `e2e/landing-visual.spec.ts-snapshots/`.
  - The data is deterministic, so no masks are needed.
- **`e2e/landing-perf.spec.ts`.** The LCP element is the h1; CLS stays under budget across a full scroll; the INP proxy (8.3); the transfer sum.
- **Console gate.** Every landing spec attaches `page.on("console")` and `pageerror` and fails on any error or warning.

### 10.4 Lint gates

- **`scripts/landing-lint.mjs`** (regex, no dependencies; runs inside the unit test and standalone). It scans `hosted/landing/**`, `hosted/public/assets/landing/**` and `docs/landing/**` for:
  - typographic dashes;
  - the forbidden-claims regex list;
  - `letter-spacing` values other than 0 or `normal` in landing CSS;
  - `!important` outside the reduced-motion block.
- **Haiku claims review** per PR that touches copy. Haiku compares every changed Hebrew sentence against section 14, and outputs a table: sentence, matched fact id or "UNSUPPORTED", and verdict. The table is pasted into the PR.
- **Existing gates must pass:** `npm run typecheck`, `npm run lint` (zero warnings; landing JS must satisfy the repo ESLint config), `npm test`, `npm run test:e2e`.

---

## 11. Workflow

### Branches and worktrees

- Branch names: `landing/<issue#>-<slug>`.
- One worktree per branch: `git worktree add ../rsvp-wt/landing-<issue#> -b landing/<issue#>-<slug>`.
- Conventional Commits. Squash-merge only after owner approval. No direct push to `main`, and never force-push without `--force-with-lease` plus an SHA check.

### PR order and dependencies

| Order | Issue | Depends on | Notes |
|---|---|---|---|
| 1 | L2 Foundation | L0 | CSP option, delegation, head, build script, skeleton with current-copy fixes |
| 2 | L3 QA harness | L2 | Can run in parallel with L4 |
| 3 | L4 Design system | L2 | |
| 4 | L5 Hero/envelope | L3, L4 | |
| 4 | L6 Story | L3, L4 | parallel with L5 |
| 4 | L7 Store + RSVP + dashboard | L3, L4 | |
| 5 | L8 Seating | L7 | |
| 5 | L9 Themes | L7 | |
| 5 | L10 Trust/FAQ/founder/final | L4, L1 (copy) | |
| 6 | L11 Visual iteration rounds | L5-L10 | Round 1, fixes, Round 2 |
| 7 | L13 Final QA + real device + launch readiness | L11, L1 | |
| any | L12 Optional /demo CSP + brand | owner decision | |

**Integration branch.** User-visible PRs merge into `landing/integration` rather than `main` until L13, so `main` stays shippable and no partial landing reaches production. The integration branch merges to `main` only with owner approval. It is rebased daily by the orchestrator.

### Evidence per PR

- Desktop 1440x900 and mobile 390x844 screenshots, each in the default, reduced-motion and no-JS variants where relevant.
- Playwright video (>= 10 s) of every interaction touched.
- A Lighthouse 3-run median table from `landing-budget.mjs`.
- The tails of `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e`.
- The axe summary.
- The Haiku claims table if copy changed.
- A list of files changed outside the issue's `owns`, which should be none.

### Two visual iteration rounds (L11)

1. **Round 1.** Assemble all sections on `landing/integration`. Capture a full-page screenshot and per-section screenshots at both viewports.
2. **Opus vision critique.** Score against a rubric in `docs/landing/iterations/round-1.md`: hierarchy, editorial typography, RTL rhythm, palette discipline, material credibility, product authenticity, CTA clarity, mobile fold, motion meaning, accessibility smells. Output a ranked defect list with screenshot crops.
3. **Fix.** Opus fixes the creative defects; Sonnet fixes the routine ones.
4. **Round 2.** Repeat with before and after pairs. Remaining defects are either fixed or owner-accepted.

### Model allocation

| Model | Responsibilities |
|---|---|
| Opus | Design system, envelope, story, seating, store, vision critiques, final review |
| Sonnet | Foundation, QA harness, themes, trust/FAQ, test writing |
| Haiku | Claims and dash lint reviews, link checks, PR evidence completeness |
| Orchestrator | Git, builds, all test runs, Lighthouse, axe, screenshots, rendered-experience review |

No agent approves its own PR. Opus reviews Sonnet PRs, and Sonnet reviews Opus PRs for test coverage, before the owner approves.

### Owner approval gates

1. Copy approval, including all **[OA]** lines (L1).
2. Founder text, photo and consent (L1).
3. The brand naming decision (L1, L12).
4. Approval of the visual direction after Round 1.
5. Merge of `landing/integration` to `main`.
6. Any preview or production deploy.
7. Real-device sign-off (L13).

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `app.css` base rules (`body`, `h1`, `.btn`, `.site-bar`) bleed into the landing | `lp-` classes and full re-declaration under `body.landing-page`; visual regression catches drift from future `app.css` edits. |
| The envelope or card becomes LCP, or delays it | No images in the envelope, an h1 size floor, and an e2e assertion on the LCP element. |
| Safari or Firefox lack scroll-driven animations | IO fallback in `story.js`; the settled state is the default. |
| Touch drag fights page scroll | Drag only for mouse and pen; tap-to-assign is primary. |
| Visual snapshots are flaky across machines | Baselines only from the orchestrator's Linux Chromium; fonts awaited; animations disabled; 1% threshold. |
| Stale cached assets after deploy | Content-hash version plus a freshness test; dynamic imports inherit the version. |
| Copy drifts into unsupported claims | Section 14 is the single source; regex lint plus Haiku review; owner approval of **[OA]** lines. |
| Product contrast inside the invitation preview fails axe | Preview omits `.inv-eyebrow` and `.inv-legal`; product issues are logged, not hidden. |
| Brand split confuses visitors (/demo reads "חתונה.בקליק") | Owner decision (Q1). Until it is resolved, the landing does not name the demo brand and says "הדגמה". |
| `/auth/signup` 503 or RSVP 403 when production configuration is incomplete | L13 checklist confirms Google login and Turnstile are configured (the owner verifies in the dashboard; no secrets in issues). |
| Long page hurts mobile memory and INP | Islands load on visibility; DOM <= 1400 nodes; no canvas. |
| PII in the public repo or issues | Founder content is delivered privately, committed only after consent, and contains no contact details. |
| Fixture server may not serve `/assets` exactly like Workers assets | L2 records observed headers. Production-like headers are verified only on an owner-approved preview. |
| ESLint config may not cover browser globals in `hosted/public` | L2 runs `npm run lint` first. If globals are missing, add a scoped override in a tiny separate PR (a shared file, so it is never mixed into feature work). |

---

## 13. Owner decisions and content needed

1. **מיתוג:** בדף הבית כתוב "אישור הגעה פלוס" ובהדגמה "חתונה.בקליק". איזה שם נשאר? לאשר יישור של ההדגמה לשם אחד?
2. **סיפור המייסד:** תוכלו לשלוח טקסט קצר (עד 120 מילים), תמונה, ואישור בכתב לפרסום? אם לא, הסעיף לא יוצג.
3. **מגבלות:** לפרסם בעמוד את המגבלות "אירוע אחד לחשבון, 300 הזמנות, 500 מוזמנים, 60 שולחנות" ואת האפשרות שיצירת אירועים תיעצר כשהמכסה החינמית מתמלאת?
4. **למה חינם:** מה המשפט שתרצו שיופיע? האם להזכיר "קוד פתוח" ולקשר למאגר ב-GitHub?
5. **המילה "חינם":** לאשר "שירות חינמי" כניסוח מרכזי, כולל בכותרת המטא?
6. **יעד הכפתור הראשי:** לאשר ש"צרו את האירוע שלכם" מוביל ל-/auth/signup, ושההרשמה בפרודקשן היא עם Google?
7. **תיקוני ניסוח קיימים:** לאשר החלפה של "בזמן אמת" ב"כל תשובה מופיעה בדשבורד", של "אין מעקב" ב"בלי מעקב שיווקי", ושל "שליחה בוואטסאפ" ב"פתיחת הוואטסאפ שלכם עם הודעה מוכנה"?
8. **כותרות:** לאשר את הכותרת "כל פרט מוצא את המקום שלו." ואת שאר שורות [OA], או לשלוח חלופות?
9. **תמונת שיתוף:** לעצב תמונת שיתוף (og) חדשה בסגנון המעטפה?
10. **ההדגמה:** לתקן את שגיאת ה-CSP בהדגמה (סעיף 9, אפשרות א או ב), או להשאיר?
11. **בדיקה במכשירים:** תוכלו לבדוק באייפון (Safari) ובאנדרואיד (Chrome) לפי רשימה שנשלח, ולצלם הקלטת מסך?
12. **פריסה:** האם לאשר בעתיד פריסת תצוגה מקדימה (preview) למדידת ביצועים, לפני מיזוג?

---

## 14. Factual capabilities and limits usable in copy

| id | Fact (usable wording) | Source |
|---|---|---|
| C1 | Free service, open source code | legal.ts:6,170 |
| C2 | No ads, no marketing tracking, data not sold | legal.ts:69,32 |
| C3 | Provided as is, no availability guarantee | legal.ts:118-119, shell.ts:57 |
| C4 | Data deleted automatically 90 days after the event; backups up to 7 more days; cached photos up to 24h | events.ts:16-39, retention.ts:17,47, legal.ts:80-81 |
| C5 | Export (JSON) or delete the event before that | retention.ts:46-60 |
| C6 | One event per account | events.ts:58, api.ts:162 |
| C7 | Up to 300 invitations and 500 people per event | api.ts:110,133, csv.ts:18,50, legal.ts:124-125 |
| C8 | Up to 60 tables, capacity up to 50 per table | api.ts:344,348 |
| C9 | Creating events and adding guests may pause when the free service capacity is reached | api.ts:158,164, usage.ts:106-109, legal.ts:122-129 |
| C10 | Personal guest link, signed, valid 30 days, can be revoked per guest | invites.ts:10,23-27,40, api.ts:316 |
| C11 | WhatsApp opens on your device with a ready message, per guest; or copy the message | whatsapp.js:13-15, app.js:926-939, legal.ts:163 |
| C12 | Paste a list from Excel or upload CSV; groups | app.js:352-382,775-795 |
| C13 | Export guest list to CSV (opens in Excel) | app.js:797-810 |
| C14 | Dashboard: invitations, coming, not coming, awaiting, seated, notes | app.js:529-540 |
| C15 | Only guests who confirmed can be seated; a seat is refused if the head count does not fit; declining removes the seat | api.ts:396, seating.ts:38-47, api.ts:331-334 |
| C16 | Drag tables on desktop, tap elsewhere; auto-seat by group; print or PDF via the browser | app.js:835-863,1027-1041,958, seating.ts:80 |
| C17 | Staff table-search link: returns only the table number, by exact full name, valid 24 hours | table-search.ts:11-14,34-43 |
| C18 | Three invitation themes: גן ירוק, לילה כחול, ורוד עדין | details.ts:50-52, app.js:561 |
| C19 | Invitation: names, date, schedule, families, photos (cover, couple, card), venue with Waze and Google Maps, add to calendar, personal RSVP form, table number | invitation-view.js:51-116 |
| C20 | Photos JPEG, PNG or WebP, up to 800 KB each | media.ts:5,9-14 |
| C21 | Guests do not register; they answer through their personal link | invites.ts:59-122 |
| C22 | Sign-in with Google, requesting only the basic `openid` identifier | auth.ts:154-163, legal.ts:12 |
| C23 | Demo runs in your browser without registration; on signup the event, guests, tables and photos move to the account (not RSVPs or seating) | app.js:104-107,502 |
| C24 | Guest count per invitation 1-20 | api.ts:37 |
| C25 | Event date from today up to one year ahead | events.ts:27 |

### Never say

**Delivery:**
- "שליחה אוטומטית", "נשלח אוטומטית", "שליחה המונית", "בלחיצה אחת לכל האורחים", or any promise of WhatsApp delivery or receipt.

**Usage and availability:**
- "ללא הגבלה", "בלי הגבלה", "unlimited", or any hidden limits.
- "זמינות מובטחת", "תמיד זמין", "99.9%", "אמינות מלאה".

**Data:**
- "בזמן אמת", "live", "מתעדכן מיד אצלכם" (about the real product).
- "אין מעקב", "בלי שום מעקב" (the RUM beacon exists).
- "קובץ אקסל" import, "xlsx".
- "מאובטח לחלוטין", "הצפנה מקצה לקצה" (not in the audit).

**Social proof and fabrication:**
- Any user counts, ratings, reviews, testimonials, logos of "clients", awards, or "הכי", "מספר 1".
- Any statement about the founder not supplied by the owner.

**Wording rules:**
- Typographic dashes or the Hebrew maqaf (use ASCII hyphen-minus).
- Uppercase or letter-spaced Hebrew.

---

## 15. Development API budget estimate (rough, USD)

Prices per 1M tokens (input/output): Opus 5.5 $5/$25, Sonnet 5.5 $2/$10, Haiku 5.5 $1/$5. Estimates include one retry and review passes. Prompt caching of shared context (plan, audit, tokens) should cut actual spend by 20-40%.

| Issue | Model(s) | Tokens in / out (approx) | Est. USD |
|---|---|---|---|
| L0 Epic | orchestrator | n/a | 0 |
| L1 Owner content and copy | Opus copy pass + Haiku claims | 0.25M/0.04M + 0.1M/0.02M | 3 |
| L2 Foundation | Sonnet + Opus review | 0.6M/0.08M + 0.2M/0.02M | 4 |
| L3 QA harness | Sonnet | 0.8M/0.12M | 4 |
| L4 Design system | Opus | 0.9M/0.12M | 8 |
| L5 Hero and envelope | Opus | 1.1M/0.15M | 10 |
| L6 Story | Opus | 1.4M/0.2M | 12 |
| L7 Store, RSVP demo, dashboard | Opus + Sonnet tests | 1.1M/0.14M + 0.4M/0.05M | 11 |
| L8 Seating | Opus + Sonnet tests | 1.4M/0.2M + 0.5M/0.06M | 14 |
| L9 Themes | Sonnet | 0.5M/0.06M | 2 |
| L10 Trust, FAQ, founder, final | Sonnet + Haiku | 0.6M/0.08M + 0.1M/0.02M | 3 |
| L11 Two iteration rounds | Opus vision + fixes | 2 x (0.4M/0.04M critique + 1.0M/0.12M fixes) | 23 |
| L12 Optional /demo | Sonnet | 0.2M/0.02M | 1 |
| L13 Final QA | Opus review + Haiku checks | 0.4M/0.03M + 0.2M/0.02M | 4 |
| **Subtotal** | | | **99** |
| Contingency 35% | | | 35 |
| **Total estimate** | | | **about 135** |


---

## Addendum (orchestrator, 26.11.2026)

- **Collision check.** Open PR #33 ("Prepare hosted domain move", by another agent) plans a move of the hosted origin and touches origin handling. The landing must derive canonical/OG URLs from `HOSTED_ORIGIN` (never hard-code the hostname) and rebase on `main` after #33 merges. PR #32 (handoff doc) is docs-only. No other open issues or PRs touch `hosted/shell.ts`, `hosted/http.ts` or `hosted/public/assets/`.
- **Legal vs code discrepancy (not landing scope, for the owner).** `hosted/retention.ts:19-21` deletes accounts created more than 30 days ago that have no event and no active session; the privacy text (`hosted/legal.ts:82`) says "an account without an event with no login for 30 days". Close but not identical; owner to decide which one is authoritative.
- **Issue numbers.** Plan keys L0-L13 map to GitHub issues #34-#47.
