// Markup builders mirroring hosted/landing/sections/seating.ts and dashboard.ts. Every value is escaped.
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const STATUS = { yes: "מגיעים", no: "לא מגיעים", pending: "ממתינים" };

const ICON_WA = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 20l1.3-3.8A8 8 0 1 1 8 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 5H6a2 2 0 0 0-2 2v9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
export function chip(g, selected) {
  if (g.rsvp !== "yes") {
    return `<li><button type="button" class="lp-chip is-pending" data-guest="${g.id}" aria-disabled="true"><span class="lp-chip-name">${esc(g.name)}</span><span class="lp-chip-n">${g.rsvp === "no" ? "לא מגיעים" : "ממתינים לתשובה"}</span></button></li>`;
  }
  return `<li><button type="button" class="lp-chip" data-guest="${g.id}" aria-pressed="${selected === g.id}" draggable="true"><span class="lp-chip-name">${esc(g.name)}</span><span class="lp-chip-n">${g.count}</span></button></li>`;
}

export function tableCard(t, guests, used, picking) {
  const n = used(t.id);
  const seated = guests.filter(g => g.table === t.id && g.rsvp === "yes");
  const full = n >= t.cap;
  const width = Math.round((n / t.cap) * 100);
  const hint = picking ? ` לחצו כדי להושיב את ${picking.name}` : "";
  return `<li class="lp-table${full ? " is-full" : ""}${picking ? " is-target" : ""}" data-table-card="${t.id}">
    <button type="button" class="lp-table-btn" data-table="${t.id}">
      <span class="lp-table-name">${esc(t.name)}</span> <span class="lp-table-label">${esc(t.label)}</span>
      <span class="lp-table-count"><b>${n}/${t.cap}</b>${full ? " מלא" : ""}</span><span class="lp-sr">${esc(`, ${n} מתוך ${t.cap} מקומות תפוסים.${hint}`)}</span>
      <svg class="lp-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="100" height="6" rx="3" class="lp-bar-bg"/><rect width="${width}" height="6" rx="3" class="lp-bar-fill"/></svg>
    </button>
    <ul class="lp-seated">${seated.map(g => `<li>${esc(g.name)} <span>(${g.count})</span></li>`).join("")}</ul>
  </li>`;
}

export function row(g, tables) {
  const table = g.table && g.rsvp === "yes" ? tables.find(t => t.id === g.table)?.name ?? "" : "";
  const detail = g.rsvp === "yes" ? `${g.count} מתוך ${g.max}${table ? " · " + table : ""}` : `עד ${g.max}`;
  return `<li class="lp-row" data-row="${g.id}">
    <span class="lp-row-name">${esc(g.name)}</span>
    <span class="lp-chip-status is-${g.rsvp}">${STATUS[g.rsvp]}</span>
    <span class="lp-row-send"><button type="button" class="lp-mini-btn" data-send aria-disabled="true">${ICON_WA}<span class="lp-sr">פתיחה בוואטסאפ: ${esc(g.name)}</span></button><button type="button" class="lp-mini-btn" data-send aria-disabled="true">${ICON_COPY}<span class="lp-sr">העתקת הודעה: ${esc(g.name)}</span></button></span>
    <small class="lp-row-meta">${esc(g.group)} · ${esc(detail)}</small>
  </li>`;
}

export function recent(g) {
  const what = g.rsvp === "yes" ? `אישרו הגעה, ${g.count}` : g.rsvp === "no" ? "לא מגיעים" : "ממתינים";
  return `<li><b>${esc(g.name)}</b> <span>${esc(what)}</span>${g.note ? `<q>${esc(g.note)}</q>` : ""}</li>`;
}

/** Hebrew plural for missing seats. */
export function missing(n) {
  return n === 1 ? "חסר מקום 1" : `חסרים ${n} מקומות`;
}
