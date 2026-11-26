import { escapeHtml as esc } from "../../http";
import { DASH } from "../copy";
import { GUESTS, RECENT, TABLES, counts, type DemoGuest } from "../data";
import { fictional, sectionHead } from "./header";

const STATUS: Record<string, string> = { yes: "מגיעים", no: "לא מגיעים", pending: "ממתינים" };

const ICON_WA = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 5H6a2 2 0 0 0-2 2v9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
// Markup mirrored by hosted/public/assets/landing/dashboard.js.
export function row(g: DemoGuest) {
  const table = g.table && g.rsvp === "yes" ? TABLES.find(t => t.id === g.table)?.name ?? "" : "";
  const detail = g.rsvp === "yes" ? `${g.count} מתוך ${g.max}${table ? " · " + table : ""}` : `עד ${g.max}`;
  return `<li class="lp-row" data-row="${g.id}">
    <span class="lp-row-name">${esc(g.name)}</span>
    <span class="lp-chip-status is-${g.rsvp}">${STATUS[g.rsvp]}</span>
    <span class="lp-row-send"><button type="button" class="lp-mini-btn" data-send aria-disabled="true">${ICON_WA}<span class="lp-sr">פתיחה בוואטסאפ: ${esc(g.name)}</span></button><button type="button" class="lp-mini-btn" data-send aria-disabled="true">${ICON_COPY}<span class="lp-sr">העתקת הודעה: ${esc(g.name)}</span></button></span>
    <small class="lp-row-meta">${esc(g.group)} · ${esc(detail)}</small>
  </li>`;
}

export function recent(g: DemoGuest) {
  const what = g.rsvp === "yes" ? `אישרו הגעה, ${g.count}` : g.rsvp === "no" ? "לא מגיעים" : "ממתינים";
  return `<li><b>${esc(g.name)}</b> <span>${esc(what)}</span>${g.note ? `<q>${esc(g.note)}</q>` : ""}</li>`;
}

export function dashboard() {
  const c = counts(GUESTS) as Record<string, number>;
  const stats = DASH.stats.map(s => `<li class="lp-stat lp-stat-${s.key}"><span class="lp-stat-n" data-stat="${s.key}">${c[s.key]}</span><span class="lp-stat-l">${esc(s.label)}</span></li>`).join("");
  const recentItems = RECENT.map(id => GUESTS.find(g => g.id === id)!).map(recent).join("");
  return `<section class="lp-section lp-dash" id="dashboard" aria-labelledby="dashboard-title">
  <div class="lp-wrap">
    <div class="lp-section-head">${sectionHead("dashboard", "05", DASH.eyebrow, DASH.h2, DASH.lead)}</div>
    <div class="lp-app lp-paper" data-dash>
      <div class="lp-demo-bar">${fictional}<span>החתונה של מאיה ועומר</span></div>
      <ul class="lp-stats" aria-label="סיכום">${stats}</ul>
      <div class="lp-app-grid">
        <div class="lp-app-panel lp-recent-panel">
          <h3 class="lp-h3">תשובות אחרונות</h3>
          <ul class="lp-recent" data-recent>${recentItems}</ul>
        </div>
        <div class="lp-app-panel">
          <h3 class="lp-h3">מוזמנים</h3>
          <ul class="lp-rows" id="lp-rows" data-rows>${GUESTS.map(row).join("")}</ul>
          <button type="button" class="lp-rows-more" data-rows-more aria-controls="lp-rows" aria-expanded="true" hidden data-more="${esc(`הצגת כל המוזמנים (${GUESTS.length})`)}" data-less="הצגת פחות מוזמנים">הצגת כל המוזמנים (${GUESTS.length})</button>
        </div>
      </div>
      <div class="lp-send">
        <p><strong>${esc(DASH.send)}</strong></p>
        <p class="lp-small" id="lp-send-note" role="status" aria-live="polite">${esc(DASH.sendNote)}</p>
      </div>
    </div>
  </div>
</section>`;
}
