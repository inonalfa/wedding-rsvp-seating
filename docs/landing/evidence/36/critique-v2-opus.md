# RSVP Plus (אישור הגעה פלוס) - Iteration 2 Review

**Measurement note:** desktop crops are 1100px wide for a 1440 viewport (scale about 0.76). Desktop numbers below are crop px unless marked "CSS". Mobile crops are 390 wide, so mobile numbers are CSS px.

---

## 1. Verdicts on the iteration 1 items

| # | Item | Verdict | Note |
|---|---|---|---|
| 1 | Mobile hero gap | **PARTLY** | The reassurance line now shows. But there is still about 95px of void between the fine print (ends y≈505) and the envelope (starts y≈598). The "פתחו את ההזמנה" button sits at y≈790-835, right on the 844 fold edge (sheet-m frame 1). |
| 2 | Envelope text/seal collision | **FIXED** | The closed state is clean on both viewports. The seal sits on the flap apex and no letter text shows through. |
| 3 | Envelope scale (desktop) | **FIXED** | The envelope is about 560px CSS, tilted, layered shadow, with the button overlapping the bottom edge. The gold radial glow is not visible, which is acceptable. |
| 4 | Dashboard list length | **FIXED** | 5 rows plus "הצגת כל המוזמנים (12)" on both viewports. Mobile rows are about 95px, not the 68px target. |
| 5 | Story chaos state | **PARTLY** | No horizontal overflow, and the stack fits inside the viewport. On mobile, cards still overlap each other's struck titles (crop-m1, "עיצוב הזמנה ששולחים כתמונה" at y≈117). The stack is about 850px, not 650. |
| 6 | Wrap bugs | **FIXED** | "מאשרים הגעה" and "שולחן 1" are each on one line, with the fraction under the title. New wraps have appeared elsewhere; see items 4 and 5 below. |
| 7 | Themes reading order/void | **FIXED** | Copy is on the right and vertically centered. Swatch tiles have a gold selected outline. |
| 8 | Section rhythm | **FIXED** | Background cadence and numbered eyebrows 01-06 are in place, and "נתונים בדויים" is demoted to a corner tag. Exception: on themes the tag floats outside the card. |
| 9 | Hebrew widows/orphans | **PARTLY** | The named orphans are fixed. New ones: "חשבון Google." in the mid-CTA, "בהדגמה." in the mobile final band. The why-free lists are 3-line ragged items in about 300px CSS columns. |
| 10 | Touch targets | **FIXED** | Swatches, row icons and FAQ rows are now 44px or more. Footer and nav padding can't be verified from pixels. |
| 11 | Dashboard stats/right column | **PARTLY** | The 5-up strip exists, but "לא / מגיעים" wraps, so the "1" tile is misaligned (crop-m3). Desktop "תשובות אחרונות" still ends about 230px above the list (sticky not verifiable in a static shot). |
| 12 | CTAs/footer/sticky | **PARTLY** | Matched full-width buttons, the mid-CTA has reassurance, the footer is fixed. But the new sticky bar covers live demo controls (see the first fix below). |

---

## 2. Final fix list (last iteration)

### 1. P0 - Mobile sticky CTA covers the demos it should be selling
**Where:** sheet-m frames 3 (story), 4 (RSVP), 5 (seating).

**Evidence:**
- In frame 4, the bar sits on top of the "מגיעים / לא מגיעים" buttons. "לא מגיעים" is half-hidden.
- In frame 5, the confirmation "משפחת אזולאי הושבו בשולחן 1..." renders below the bar and outside the viewport. The user taps a table and sees nothing happen.
- To a first-time visitor this reads as broken.

**Change:** reuse the existing IntersectionObserver (about +0.15KB) so it also watches the demo cards.

```js
const band = new IntersectionObserver(es => {
  es.forEach(e => e.target._inBand = e.isIntersecting);
  update();
}, { rootMargin: '-82% 0px 0px 0px' }); // observes bottom ~18% of viewport
document.querySelectorAll('.demo-card').forEach(el => band.observe(el));
// update(): hidden = heroVisible || finalVisible || [...demos].some(d => d._inBand)
```

Supporting CSS:
- `.sticky-cta{transition:transform .25s,opacity .25s}`
- `.sticky-cta[hidden-state]{transform:translateY(140%);opacity:0;pointer-events:none}`
- `html{scroll-padding-bottom:96px}` so focus and anchor jumps never land under the bar.

### 2. P1 - Mobile seating: the choose-then-place loop spans two screens
**Where:** crop-m2.

**Evidence:**
- The "ממתינים לשיבוץ" chips run one per line from y≈565 to y≈920 (7 ragged chips, about 360px).
- The tables start at y≈945, and the status line sits at y≈1350, about 800px below the guest you tapped.

**Change:**
- Mobile chip rail: `.pending{display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;scroll-snap-type:x proximity;padding-block:4px 12px;margin-inline:-20px;padding-inline:20px}` with `.pending>*{flex:none;scroll-snap-align:start}`.
- Put the unassignable dashed chips (לא מגיעים / ממתינים לתשובה) after the solid ones, using the existing order.
- Move the `role="status"` line directly under the rail and make it sticky inside the card: `.seat-status{position:sticky;top:64px;z-index:2;background:#fff;padding-block:8px;font-size:14px}`.
- Result: guest, table and feedback fit in one screen, about 380px shorter.

### 3. P1 - Mobile hero: envelope still parked on the fold edge
**Where:** crop-m0, sheet-m frame 1.

**Evidence:**
- About 95px of empty cream sits between the fine print and the envelope.
- The open button bottom is around y≈835 of 844, so it gets hidden by browser chrome on most phones.

**Change:**
- Below 768px: `.hero{padding-top:24px;padding-bottom:40px}`, `.hero-visual{margin-top:20px}`, envelope `width:min(82vw,320px)`.
- `.hero-fine{margin-top:10px}`.
- Target: envelope top about y=530, button bottom at or below y=760.

### 4. P1 - Themes swatches wrap 2+1 on mobile
**Where:** crop-m3. "גן ירוק" and "לילה כחול" sit on row 1, "ורוד עדין" is orphaned on row 2. It looks unfinished.

**Change:** stack the swatch vertically on mobile.
- `.swatches{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}`
- `.swatch{flex-direction:column;align-items:center;gap:6px;padding:10px 6px;min-height:84px;border-radius:16px}`
- `.swatch-dot{width:32px;height:32px}`
- `.swatch-label{font-size:13px;white-space:nowrap}`

### 5. P1 - Dashboard stats mix units, and one label wraps
**Where:** crop-d3, crop-m3.

**Evidence:**
- "12 הוזמנו" next to "19 מגיעים" reads like a bug, because 19 is greater than 12.
- The data shows these are different units: 12 invitations versus 19 people. 19 = 2+1+4+2+2+5+1+2 from the visible rows and chips, and "11 הושבו" = 5+4+2 seated people.
- On mobile, "לא / מגיעים" breaks onto 2 lines.

**Change:** group the tiles by unit, using only existing labels plus a caption.

```html
<div class="stat-group" aria-label="הזמנות"><span class="cap">הזמנות</span>הוזמנו 12 · לא מגיעים 1 · ממתינים 3</div>
<div class="stat-group" aria-label="אורחים"><span class="cap">אורחים</span>מגיעים 19 · הושבו 11</div>
```

- Desktop: `.stats{display:grid;grid-template-columns:3fr 2fr;gap:24px}`.
- Mobile: the groups stack, with 3-up and 2-up grids.
- `.cap{font-size:12px;color:#8A7A5E;letter-spacing:.02em}`
- `.stat span{white-space:nowrap}`

### 6. P1 - Story chaos state on mobile hides the struck titles
**Where:** crop-m0 and crop-m1, which a visitor sees while scrolling in.

**Evidence:**
- Card bottoms overlap the next card's struck title ("עיצוב הזמנה ששולחים כתמונה", "תור בכניסה...").
- The stacking order is inconsistent between pairs.

**Change:**
- `.story-card{position:relative;padding-bottom:28px}`.
- Give each card `z-index:calc(var(--i))` so z-index rises with source order. Later cards then sit on top and cover only the previous card's bottom padding, never its title.
- Mobile overlap: `margin-top:-14px`.
- Struck title: `font-size:14px;line-height:1.4;padding-top:4px`.

### 7. P2 - The hero eyebrow repeats the next section's H2
**Where:** crop-d0, crop-m0. The hero eyebrow reads "הכול נופל למקום". Section 01's H2, one scroll later, is the same "הכול נופל למקום".

**Change:**
- Change the hero eyebrow to a factual label built from visible features: `הזמנה · אישורים · הושבה`.
- Or delete it and let the H1 open the page. Deleting is the stronger option.

### 8. P2 - Seating and themes card craft
**Where:** crop-d1, crop-m2, crop-d2, crop-m3.

**Evidence:**
- Table cards are a card inside a cream frame inside a white card: 3 nested borders.
- The "נתונים בדויים" tag floats above the themes card, unlike every other demo.
- The textarea resize grip shows in the RSVP card.

**Change:**
- Flatten the tables: `.table{background:#FBF7F0;border:1px solid #E8DDC8;border-radius:14px;padding:14px}` and remove the inner card's border and background.
- Move the themes tag inside the card's top corner: `position:absolute;inset-block-start:12px;inset-inline-end:12px`.
- `textarea{resize:vertical}`. Or `resize:none` with a fixed `min-height:96px`.

### 9. P2 - Why-free and FAQ desktop layout, and remaining widows
**Where:** crop-d3 and crop-d4.

**Evidence:**
- The lists sit in columns about 300px CSS wide, so items run to 3 lines ("יצירת אירועים עלולה להיעצר...").
- The FAQ sits right-aligned with about 330px CSS empty on the left.
- The mid-CTA fine print breaks before "חשבון Google.", and the mobile final band orphans "בהדגמה.".

**Change:**
- `.why-lists{grid-template-columns:repeat(2,minmax(0,34ch));column-gap:64px}`.
- FAQ as a 2-column chapter: `.faq{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:64px}`, with `.faq h2{position:sticky;top:96px;align-self:start}` (the H2 lands on the right in RTL).
- `.cta-fine,.final p{text-wrap:balance;max-inline-size:44ch;margin-inline:auto}`. Fallback: `עם&nbsp;חשבון&nbsp;Google.` and `קודם&nbsp;בהדגמה.`.

### 10. P2 - Dashboard rows and the right-column void
**Where:** crop-m4 (rows about 95px), crop-d3 ("תשובות אחרונות" ends at y≈405 while the list runs to y≈635).

**Change:**
- Mobile rows: `padding-block:10px;row-gap:0`, meta line `font-size:13px;line-height:1.35`. Target about 72px per row.
- Desktop: if sticky is already applied, end the void by appending the existing WhatsApp note box to the right column under the recent replies instead of spanning it full-width below.

### Biggest remaining gap to award-level (CSS and markup only)
**Turn six identical sections into one journey.**

Every section is the same composition: eyebrow, H2, grey paragraph on the right, white demo card on the left. It is competent, but it never escalates.

Make the numbered eyebrows a visible spine:
- A 1px gold line in the inline-start gutter: `.chapters{position:relative}`, `.chapters::before{content:"";position:absolute;inset-block:0;inset-inline-start:clamp(16px,4vw,56px);width:1px;background:#E2D3B3}`.
- Each eyebrow number set as a 44px tabular-figure medallion on that line, echoing the wax seal: `border:1px solid #B08A4E;border-radius:50%;background:var(--section-bg)`.
- Under `@supports (animation-timeline: scroll())`, a gold overlay line that fills with `scaleY` as the reader scrolls, so "everything falls into place" literally draws itself from the opened envelope to the final green band.
- Fallback: a static line. Zero JS.

---

## 3. Scores

| Area | Score | Why |
|---|---|---|
| First impression | 8 | The H1, envelope and palette feel premium. The mobile fold placement holds it back. |
| Craft/typography | 7 | Hierarchy and rhythm are good now. Nested cards, the ragged why-free lists and the unit-mixing stats remain. |
| Interaction clarity | 7 | Desktop demos are excellent, and the RSVP feeds the dashboard. On mobile, seating feedback is off-screen. |
| Conversion clarity | 8 | Clear dual CTA, repeated with reassurance, plus the sticky bar. |
| Mobile | 6 | Sticky-bar collisions, the seating loop and the swatch wrap are the visible blockers. All three are small fixes. |