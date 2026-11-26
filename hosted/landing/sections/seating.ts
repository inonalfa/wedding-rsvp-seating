import { escapeHtml as esc } from "../../http";
import { SEATING } from "../copy";
import { GUESTS, TABLES, used, type DemoGuest, type DemoTable } from "../data";
import { fictional, sectionHead } from "./header";

// Markup here is mirrored by hosted/public/assets/landing/seating.js (re-render after each action).
export function chip(g: DemoGuest) {
  if (g.rsvp !== "yes") {
    return `<li><button type="button" class="lp-chip is-pending" data-guest="${g.id}" aria-disabled="true"><span class="lp-chip-name">${esc(g.name)}</span><span class="lp-chip-n">${g.rsvp === "no" ? "לא מגיעים" : "ממתינים לתשובה"}</span></button></li>`;
  }
  return `<li><button type="button" class="lp-chip" data-guest="${g.id}" aria-pressed="false" draggable="true"><span class="lp-chip-name">${esc(g.name)}</span><span class="lp-chip-n">${g.count}</span></button></li>`;
}

export function tableCard(t: DemoTable, guests: readonly DemoGuest[]) {
  const n = used(t.id, guests);
  const seated = guests.filter(g => g.table === t.id && g.rsvp === "yes");
  const full = n >= t.cap;
  const width = Math.round((n / t.cap) * 100);
  return `<li class="lp-table${full ? " is-full" : ""}" data-table-card="${t.id}">
    <button type="button" class="lp-table-btn" data-table="${t.id}" aria-label="${esc(`${t.name}, ${t.label}. ${n} מתוך ${t.cap} מקומות תפוסים`)}">
      <span class="lp-table-name">${esc(t.name)}</span><span class="lp-table-label">${esc(t.label)}</span>
      <span class="lp-table-count"><b>${n}/${t.cap}</b>${full ? " מלא" : ""}</span>
      <svg class="lp-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="100" height="6" rx="3" class="lp-bar-bg"/><rect width="${width}" height="6" rx="3" class="lp-bar-fill"/></svg>
    </button>
    <ul class="lp-seated">${seated.map(g => `<li>${esc(g.name)} <span>(${g.count})</span></li>`).join("")}</ul>
  </li>`;
}

export function seating() {
  const waiting = GUESTS.filter(g => g.rsvp !== "yes" || !g.table);
  const facts = SEATING.facts.map(f => `<li>${esc(f)}</li>`).join("");
  return `<section class="lp-section lp-seating" id="seating" aria-labelledby="seating-title">
  <div class="lp-wrap">
    <div class="lp-section-head">
      ${sectionHead("seating", SEATING.eyebrow, SEATING.h2, SEATING.lead)}
      <ul class="lp-ticks lp-ticks-row">${facts}</ul>
    </div>
    <div class="lp-board lp-paper" data-seating>
      <div class="lp-demo-bar">${fictional}<button type="button" class="lp-link-btn" data-auto>שיבוץ אוטומטי לפי קבוצה</button><button type="button" class="lp-link-btn" data-reset>איפוס</button></div>
      <div class="lp-board-grid">
        <div class="lp-pool-wrap">
          <h3 class="lp-h3">ממתינים לשיבוץ</h3>
          <ul class="lp-pool" data-pool>${waiting.map(chip).join("")}</ul>
        </div>
        <ul class="lp-tables" data-tables>${TABLES.map(t => tableCard(t, GUESTS)).join("")}</ul>
      </div>
      <p class="lp-status lp-seat-status" id="lp-seat-status" role="status" aria-live="polite" aria-atomic="true">בחרו הזמנה מהרשימה ואז שולחן.</p>
    </div>
  </div>
</section>`;
}
