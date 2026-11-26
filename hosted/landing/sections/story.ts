import { escapeHtml as esc } from "../../http";
import { STORY } from "../copy";

// Each fragment pairs a planning mess (before) with the product state that replaces it (after).
const FRAGMENTS = [
  { kind: "note", before: "רשימת מוזמנים על פתק", after: "רשימה אחת: הקלדה, הדבקה מאקסל או ייבוא CSV", tag: "מוזמנים" },
  { kind: "chat", before: "הודעה שלא נענתה כבר שבוע", after: "קישור אישי לכל אורח, והתשובה מופיעה בדשבורד", tag: "אישורים" },
  { kind: "table", before: "שולחן בלי מקום לעוד שניים", after: "השולחן מראה 8/10 ומסרב למה שלא נכנס", tag: "הושבה" },
  { kind: "count", before: "כמה בעצם מגיעים?", after: "מגיעים, לא מגיעים וממתינים, בספירה אחת", tag: "דשבורד" },
  { kind: "card", before: "עיצוב הזמנה ששולחים כתמונה", after: "דף הזמנה מעוצב בשלוש ערכות", tag: "הזמנה" },
  { kind: "door", before: "תור בכניסה ליד רשימת השולחנות", after: "קישור חיפוש שולחן לצוות, תקף 24 שעות", tag: "בכניסה" },
] as const;

export function story() {
  const items = FRAGMENTS.map((f, i) => `<li class="lp-frag lp-frag-${i + 1} lp-frag-${f.kind}">
      <span class="lp-frag-before"><s>${esc(f.before)}</s></span>
      <span class="lp-frag-tag">${esc(f.tag)}</span>
      <span class="lp-frag-after">${esc(f.after)}</span>
    </li>`).join("");
  return `<section class="lp-section lp-story" id="story" aria-labelledby="story-title">
  <div class="lp-wrap lp-story-grid">
    <div class="lp-story-copy">
      <p class="lp-eyebrow">${esc(STORY.eyebrow)}</p>
      <h2 id="story-title" class="lp-h2">${esc(STORY.h2)}</h2>
      <p class="lp-lead">${esc(STORY.lead)}</p>
    </div>
    <ol class="lp-frags" data-settle>${items}</ol>
  </div>
</section>`;
}
