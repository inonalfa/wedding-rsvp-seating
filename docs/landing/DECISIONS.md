# Landing decisions log (issues #36-#45, umbrella #34)

## CTAs
- Exactly two labels sitewide. Primary "צרו את האירוע שלכם" -> `/auth/signup` (header, hero, after the demos, final section). Secondary "התנסו בלי הרשמה" -> `/demo`. Header also has quiet "הדגמה" (`/demo`) and "כניסה" (`/auth/login`) text links.
- Why the primary goes to signup: Google sign-in is one step, and the page already lets visitors try the core flows inline (RSVP, seating, themes, dashboard), so the next useful step is the real event. The secondary keeps a no-commitment path to `/demo`, where data stays in the browser until signup.

## Headline
- Implemented (owner recommended): H1 "אישורי הגעה וסידורי הושבה לחתונה. בחינם." with lead "הזמנה דיגיטלית עם קישור אישי לכל אורח, דשבורד שמראה מי מגיע, וסידור שולחנות שמתעדכן לפי האישורים."
- "הכול נופל למקום" is the hero eyebrow and the story (section 2) heading, not the H1.
- Considered and not used: "כל החתונה שלכם, במקום אחד." (previous landing, vaguer), "הכול נופל למקום" as H1 (poetic but does not say what the product is or that it is free).
- LCP guard: the H1 is server-rendered text and is never transformed or faded. Only its decorative `::after` underline animates.

## No founder section
- Owner decision: no founder section, no placeholder, no empty slot. `PLAN.md` S7 is dropped.

## Copy needing owner approval
- Why free (exact owner wording): "התחתנו, גילינו כמה מערכת כזו חסרה, ולכן אנחנו מציעים אותה בחינם, כדי לעזור לזוגות נוספים."
- Capacity link text: "צריכים יותר? הרחבת מכסה אפשרית בתשלום" -> `/capacity` (page built in another branch).
- FAQ answers in `hosted/landing/copy.ts` (`FAQ`), meta description and page title.
- Story fragment pairs (`hosted/landing/sections/story.ts`), demo status messages (`hosted/public/assets/landing/demos.js`).

## Claims discipline
- No "בזמן אמת": "כל תשובה מופיעה בדשבורד". No "אין מעקב": "בלי פרסומות ובלי מעקב שיווקי". No open-source mention.
- WhatsApp is manual everywhere: "פותחים את הוואטסאפ שלכם עם הודעה מוכנה לכל אורח". Demo send buttons are `aria-disabled`, never `wa.me` links, and only show an explanation.
- Limits are published: one event per account, 300 invitations and 500 guests per event, 60 tables (50 seats per table), and event creation may pause when the free infrastructure quota fills. "ללא התחייבות לזמינות" appears in the trust ledger and footer.
- Fictional data (couple מאיה ועומר, 17 ביוני 2027, a Thursday) does not overlap the `/demo` fixtures (דנה ויואב). Every demo carries the visible tag "נתונים בדויים".

## Architecture notes
- `hosted/landing/page.ts` renders via `page(..., { bare, bodyClass: "landing-page", selfScript: true, head })`. `selfScript` adds only `'self'` to `script-src`; every other page's CSP is unchanged (tested).
- Demo initial state travels in a `data-demo` attribute on `<main>` (escaped JSON) instead of an inline `<script type="application/json">`, so the page has no inline script tags at all.
- CSS is split into `landing-base.css`, `landing-sections.css`, `landing-motion.css` (no `@import`), all versioned with `LANDING_VERSION` from `scripts/landing-version.mjs`.
- JS: `landing.js` (entry: flags, envelope, story observer, themes) lazily imports `demos.js` (+ `store.js`, `render.js`) when the RSVP section nears the viewport, reusing the versioned query string.
- Invitation themes reuse the real `invite.css` (`.inv theme-<id>`) with div equivalents of its header/main/footer; sizing-only overrides under `.lp-inv`. `.inv-kicker` letter-spacing is reset to 0 inside the landing only; the product's own letter-spacing on Hebrew and its gold eyebrow contrast remain product follow-ups.
- The paper grain is a tiny SVG `feTurbulence` data URI on the body background (the only texture). The wax seal uses the single radial gradient.

## Contrast (WCAG 2.x, computed)
| Pair | Ratio | Use |
|---|---|---|
| ink `#1b2a24` on ivory `#faf6ee` | 13.88 | body |
| ink-soft `#4f5d57` on ivory | 6.42 | secondary text |
| ink-soft on champagne-2 `#f6eedb` | 5.99 | story, send note |
| ink-soft on white | 6.92 | product UI |
| forest `#1f4d3d` on ivory | 8.91 | links, secondary CTA, focus ring (non-text) |
| forest on forest-soft `#e6efe9` | 8.18 | tags, chip counts |
| white on forest | 9.60 | primary CTA |
| white on forest-deep `#183d30` | 12.01 | primary CTA hover |
| ivory on forest | 8.91 | final block heading, final primary CTA (inverted) |
| champagne `#f1e7d3` on forest | 7.82 | final lead, focus ring on forest |
| gold-ink `#7a5c2e` on ivory / champagne | 5.73 / 5.04 | eyebrows, "נתונים בדויים" tag |
| `#23633e` on good-soft `#e4f3e9` | 6.25 | "מגיעים" chip |
| `#9c3a33` on bad-soft `#fbe9e7` | 5.84 | "לא מגיעים" chip |
| wait `#8a5d0c` on wait-soft `#fdf3dd` | 5.21 | "ממתינים" chip |
| good `#2e7d4f` / bad `#b3423a` on white | 5.05 / 5.59 | seating status messages |
| alert `#8e2f28` on bad-soft | 6.92 | sign-in failed alert |
| input and pending-chip border `#8f897a` on white | 3.48 | non-text UI boundary (>= 3:1) |
| gold `#b8945a` on ivory | 2.62 | decoration only (hairlines, seal ring), never text |

## Motion
- Tokens 180/320/600ms, ease `cubic-bezier(.2,.7,.2,1)`, transform/opacity only. Scattered story states exist only under `body[data-motion="on"]`. The envelope starts closed only when JS runs with motion allowed: `nojs.css` shows it open without JS and `landing.js` opens it immediately under reduced motion, so both show the settled state (envelope open, story ordered). No scroll listeners, no pinning beyond a sticky copy rail on desktop.
