# RSVP Plus (אישור הגעה פלוס) - Iteration 1 Critique

Colors below are approximate samples from the screenshots. Lock them as tokens: green `#1F4D3F`, cream `#F8F3EC`, deep cream `#F4EBDC`, gold `#B08A4E`, ink `#1E211F`.

---

### 1. P0 - Hero, mobile 390: dead gap between CTAs and envelope
**Where:** small-m0, hero.

**Evidence:**
- The CTA row ends around y=470.
- The envelope starts around y=625, leaving about 150px of empty cream.
- On an 844px viewport, the envelope (the hero's whole hook) is barely above the fold.
- The reassurance line ("בהדגמה הנתונים נשארים בדפדפן...") visible on desktop does not appear in the mobile capture.

**Change:**
- `.hero{min-height:auto}` below 768px. Kill any `100svh` plus `justify-content:space-between`.
- `.hero-grid{display:flex;flex-direction:column;gap:20px}`.
- Show the reassurance line under the CTAs: `font-size:13px;line-height:1.5;color:#6B665C;margin-top:12px`.
- Envelope wrapper: `margin-top:28px;width:min(88vw,360px);margin-inline:auto`.
- Target: the envelope top lands near y=540, so the seal and the "פתחו את ההזמנה" button are on the first screen.

### 2. P0 - Envelope closed state: letter text collides with the wax seal
**Where:** crop-d0 and small-m0, hero.

**Evidence:**
- "יום חנ... 2027" and "קבלת פנים... 20:00" print on both sides of the seal.
- A green button is guillotined under it, reading "אישור הגע...".
- The flap reads as transparent, so the letter shows through. It looks broken, not teasing.

**Change:**
- Stacking order: pocket back (z1) < letter (z2) < front pocket (z3) < flap (z4) < seal (z5).
- Give the flap a solid fill: `background:#EFE3CB`, with a 1px `#D9C7A2` edge.
- Closed state:
  - `.env:not(.is-open) .letter{transform:translateY(42%)}`
  - `.env:not(.is-open) .letter-content{opacity:0;visibility:hidden}`
  - Transition `opacity .2s .35s` on open, so content fades in only after the letter clears the pocket.
- Seal: `width:clamp(52px,6vw,72px)`, centered exactly on the flap apex (`top:calc(var(--flap-h) - var(--seal)/2)`), with nothing printed within 12px of it.

### 3. P1 - Envelope scale and presence, desktop 1440
**Where:** crop-d0 hero.

**Evidence:**
- The envelope is about 420px wide at 1440. That is about 29% of the width, against a headline block about 560px wide.
- It sits about 110px lower than the headline cap line.
- It reads as a small thumbnail floating in the left void, not the hero object.

**Change:**
- Grid: `grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);align-items:center;column-gap:clamp(48px,6vw,112px)`.
- Envelope: `width:clamp(440px,38vw,600px);aspect-ratio:3/2;transform:rotate(-2.5deg)`.
- Layered shadow: `0 1px 0 #fff inset, 0 24px 48px -16px rgba(31,77,63,.22), 0 4px 12px rgba(0,0,0,.06)`.
- Overlap the "פתחו את ההזמנה" button onto the envelope's bottom edge (`margin-top:-22px;position:relative;z-index:6`). It then reads as part of the object, not a caption.
- Give the closed envelope a soft gold radial behind it: `radial-gradient(closest-side,#F1E3C4 0%,transparent 70%)`, at 120% of the envelope size.

### 4. P0 - Dashboard guest list is far too long
**Where:** crop-d3 desktop (about 700px of rows), small-m4 to m5 mobile (about 1,500px of rows, each about 123px tall).

**Evidence:**
- 12 near-identical rows, each with 2 pill buttons.
- On mobile this is the longest stretch of the page and buries the next CTA.

**Change:**
- Show 5 rows plus a full-width button "הצגת כל המוזמנים (12)" (`height:48px;border:1px dashed #C9B48A`).
- Desktop alternative: `max-height:440px;overflow:auto` with `mask-image:linear-gradient(#000 85%,transparent)`.
- Mobile row redesign:
  - One line holds name, status pill and two 44x44 icon buttons (WhatsApp, copy) with `aria-label`s.
  - Meta goes on line 2.
  - `grid-template-columns:1fr auto auto auto;row-gap:2px;padding-block:12px`.
  - Rows drop from about 123px to about 68px.
- Net mobile saving: about 1,100px.

### 5. P1 - Story section: chaos state is illegible and overflows on mobile
**Where:** crop-d0 desktop, small-m0 to m1 mobile.

**Evidence:**
- Struck-through titles are about 12px light grey. Body text is about `#8A8A8A` on white, below 4.5:1 contrast.
- Rotated cards overlap each other's text on desktop (top-right card over top-left).
- On mobile, cards poke past both viewport edges (x<0 and x>390), which risks horizontal scroll.
- The chaos stack runs about 1,000px.

**Change:**
- `section.story{overflow-x:clip}`.
- Mobile:
  - Cards `width:86%`, rotation capped at `±3deg`.
  - Overlap with `margin-top:-20px`, so the stack is about 650px.
- Typography:
  - Struck title `font-size:14px;color:#7A6A55;text-decoration-color:#B08A4E;text-decoration-thickness:1.5px`.
  - Body `font-size:16px;line-height:1.55;color:#3F3C36`.
- Trigger the settle at 35% intersection.
- `@media (prefers-reduced-motion:reduce)`: render the settled grid directly.
- The settled grid in sheet-d is good. Make that the default for no-JS too.

### 6. P1 - Visible wrap bugs that read as unfinished
**Where:**
- Mobile themes preview: "מאשרים / הגעה" breaks onto 2 lines (small-m3).
- Mobile seating: "שולחן / 1" breaks (small-m2).

**Change:**
- `.btn,.table-title{white-space:nowrap}`.
- Invite buttons on mobile: `padding-inline:16px;font-size:15px`, keeping the 2-column `grid-template-columns:1fr 1fr;gap:10px`.
- Table cards: put the fraction under the title on mobile (`flex-direction:column;align-items:flex-start`) instead of beside it.
- Fractions: `font-variant-numeric:tabular-nums`.

### 7. P1 - Themes section: empty half and broken reading order
**Where:** crop-d2 desktop.

**Evidence:**
- The copy column ends around y=400 while the card runs to y=745, leaving about 350px of void.
- Copy sits on the left, so in RTL the eye hits the preview first.
- This is the only section that flips, so it reads as a mistake rather than a deliberate alternation.

**Change:**
- Either flip it back (copy on the right) or commit to alternation by also flipping the RSVP section. I recommend flipping it back.
- `.themes-grid{align-items:center}`.
- Replace the 3 text pills with swatch buttons:
  - 3 tiles at `min-height:56px;padding:8px 14px 8px 8px`.
  - Each holds a 40px circle of the theme gradient (green `#1F4D3F` to `#4E8A6E`, plus the night-blue and rose equivalents) and the label.
  - Selected state: `outline:2px solid #B08A4E;outline-offset:2px`.
- Crossfade the preview on change (`opacity .25s`) so the switch feels crafted.

### 8. P1 - Section rhythm is monotonous
**Where:** all sections, both viewports.

**Evidence:**
- Every section repeats the same pattern: gold eyebrow with rule, light display h2 about 48px, grey paragraph, white card with a "נתונים בדויים" pill.
- The same padding (about 140px) and a hairline divider separate every section.
- Only the story section changes background.

**Change:**
- Background cadence: hero `#F8F3EC`, story `#F4EBDC`, RSVP and seating as one chapter on `#F8F3EC` (remove the divider between them), themes `#F4EBDC`, dashboard full-bleed `#EEF2EC` (green-tinted), "why free" `#F8F3EC`.
- Padding scale:
  - Chapter openers `padding-block:clamp(88px,11vw,168px)`.
  - Sections inside a chapter `clamp(56px,7vw,104px)`.
- Number the eyebrows ("01 · אישור הגעה") in tabular figures. This gives a narrative spine without new copy.
- "נתונים בדויים": show it once per demo, at `11px`, in the card corner, not as a lead pill.

### 9. P1 - Hebrew line breaks: widows and orphans
**Where:**
- RSVP paragraph orphan "אורחת:" (crop-d1).
- "בתשלום" orphaned onto its own line (crop-d3/d4).
- "...בדשבורד / למטה" (small-m1).
- Seating bullets: the second column runs about 410px wide and past the paragraph's measure (crop-d1).

**Change:**
- `h1,h2,h3{text-wrap:balance}`, `p,li{text-wrap:pretty}`.
- Paragraph `max-inline-size:52ch`.
- Bullet list `grid-template-columns:repeat(2,minmax(0,26ch));column-gap:48px`.
- Where `pretty` is unsupported, bind the last 2 words with `&nbsp;` in markup (for example `בתור&nbsp;אורחת:`, `אפשרית&nbsp;בתשלום`).

### 10. P1 - Touch targets below 44px
**Where:** theme pills (about 34px), dashboard row buttons (about 34px desktop), mobile nav "הדגמה" and "כניסה" (text only), footer links (about 14px text), FAQ plus icon.

**Change:**
- All interactive elements: `min-block-size:44px`.
- Mobile nav links: `padding:12px 10px`.
- Footer links: `display:inline-block;padding:12px 6px`.
- FAQ: the whole `<summary>` row is the target, at `min-height:56px`.
- The RSVP `<select>` and textarea are fine (48px+). Keep them.

### 11. P2 - Dashboard stats and right column
**Where:**
- Mobile stats: 2+2+1 grid with an orphaned "הושבו" tile (small-m4).
- Desktop: the "תשובות אחרונות" column ends about 500px above the list (crop-d3).

**Change:**
- Mobile: `grid-template-columns:repeat(3,1fr)` with the first two tiles spanning (`.stat:nth-child(-n+2){grid-column:span 1}`). Better: a single 5-up strip, `grid-template-columns:repeat(5,minmax(64px,1fr));overflow-x:auto`, tiles at 72px tall with numbers at 24px.
- Desktop: `.recent{position:sticky;top:96px;align-self:start}`.

### 12. P2 - Mid CTA, final CTA, footer, mobile conversion
**Where:** crop-d3, crop-d4, small-m5, small-m6.

**Evidence:**
- Stacked mobile buttons have mismatched widths (about 205px vs 180px).
- The mid CTA duplicates the final band exactly.
- The footer logo is about 48px.
- Mobile has no header CTA, and nothing persistent after the hero.

**Change:**
- Stacked buttons: `width:100%;max-width:320px;height:52px`.
- Mid CTA: add one line of reassurance copy above it (reuse the hero fine print) so it isn't a clone.
- Footer: logo `height:56px`, links in `#1F4D3F` at 14px. On mobile, center the tagline under the logo.
- Mobile sticky CTA bar:
  - Shows when the hero leaves the viewport; hides when the final band is visible.
  - `position:fixed;inset-inline:12px;bottom:calc(12px + env(safe-area-inset-bottom));height:56px;background:#1F4D3F;border-radius:999px`.
  - One IntersectionObserver, about 0.4KB gz.

---

**Keep:**
- The headline set and the gold underline on "בחינם." are confident and on-brand. The green/cream/gold palette and the final green band feel premium.
- The interactive demos are real persuasion: the RSVP card, the seating "10/10 מלא" feedback, and the opened-envelope state.
- The settled story grid, the strikethrough-pain-to-solution device, and the honest "למה זה בחינם?" pull quote with its gold rule are distinctive. Polish them, don't replace them.