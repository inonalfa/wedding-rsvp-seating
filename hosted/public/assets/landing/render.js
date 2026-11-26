// Markup builders mirroring hosted/landing/sections/seating.ts and dashboard.ts. Every value is escaped.
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const STATUS = { yes: "מגיעים", no: "לא מגיעים", pending: "ממתינים" };

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
    <button type="button" class="lp-table-btn" data-table="${t.id}" aria-label="${esc(`${t.name}, ${t.label}. ${n} מתוך ${t.cap} מקומות תפוסים.${hint}`)}">
      <span class="lp-table-name">${esc(t.name)}</span><span class="lp-table-label">${esc(t.label)}</span>
      <span class="lp-table-count"><b>${n}/${t.cap}</b>${full ? " מלא" : ""}</span>
      <svg class="lp-bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="100" height="6" rx="3" class="lp-bar-bg"/><rect width="${width}" height="6" rx="3" class="lp-bar-fill"/></svg>
    </button>
    <ul class="lp-seated">${seated.map(g => `<li>${esc(g.name)} <span>(${g.count})</span></li>`).join("")}</ul>
  </li>`;
}

export function row(g, tables) {
  const table = g.table && g.rsvp === "yes" ? tables.find(t => t.id === g.table)?.name ?? "" : "";
  const detail = g.rsvp === "yes" ? `${g.count} מתוך ${g.max}${table ? " · " + table : ""}` : `עד ${g.max}`;
  return `<li class="lp-row" data-row="${g.id}">
    <span class="lp-row-name">${esc(g.name)}<small>${esc(g.group)} · ${esc(detail)}</small></span>
    <span class="lp-chip-status is-${g.rsvp}">${STATUS[g.rsvp]}</span>
    <span class="lp-row-send"><button type="button" class="lp-mini-btn" data-send aria-disabled="true">פתיחה בוואטסאפ</button><button type="button" class="lp-mini-btn" data-send aria-disabled="true">העתקת הודעה</button></span>
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
