// RSVP, seating and dashboard demos sharing one in-memory store. Loaded lazily by landing.js.
import { createStore } from "./store.js";
import { chip, missing, recent, row, tableCard } from "./render.js";

export function start(main) {
  let initial;
  try { initial = JSON.parse(main.dataset.demo || ""); } catch { return; }
  const store = createStore(initial);
  const $ = sel => main.querySelector(sel);
  const pool = $("[data-pool]"), tablesEl = $("[data-tables]"), seatStatus = $("#lp-seat-status");
  const rsvpStatus = $("#lp-rsvp-status"), sendNote = $("#lp-send-note");
  const rows = $("[data-rows]"), recentEl = $("[data-recent]");
  let selected = null;
  let timer = 0;

  const say = (el, text, tone) => {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-bad", tone === "bad");
    el.classList.toggle("is-ok", tone === "ok");
  };

  // Re-render while keeping keyboard focus on the same logical control.
  function keepFocus(fn) {
    const a = document.activeElement;
    const key = a?.dataset?.guest ? `[data-guest="${a.dataset.guest}"]` : a?.dataset?.table ? `[data-table="${a.dataset.table}"]` : "";
    fn();
    if (key && !main.contains(document.activeElement)) main.querySelector(key)?.focus({ preventScroll: true });
  }

  function renderSeating(state) {
    const picking = selected ? store.guest(selected) : null;
    keepFocus(() => {
      pool.innerHTML = state.guests.filter(g => g.rsvp !== "yes" || !g.table).map(g => chip(g, selected)).join("");
      tablesEl.innerHTML = state.tables.map(t => tableCard(t, state.guests, store.used, picking)).join("");
    });
  }

  let last = store.counts();
  function renderDash(state) {
    const c = store.counts();
    for (const [k, v] of Object.entries(c)) {
      const el = main.querySelector(`[data-stat="${k}"]`);
      if (!el || last[k] === v) continue;
      el.textContent = String(v);
      el.classList.remove("is-bump");
      requestAnimationFrame(() => el.classList.add("is-bump"));
    }
    last = c;
    rows.innerHTML = state.guests.map(g => row(g, state.tables)).join("");
    recentEl.innerHTML = state.recent.map(id => store.guest(id)).filter(Boolean).map(recent).join("");
  }

  store.subscribe(state => { renderSeating(state); renderDash(state); });

  // RSVP demo
  $("[data-rsvp]")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-answer]");
    if (!btn) return;
    const answer = btn.dataset.answer;
    const count = Number($("#lp-count").value);
    const note = $("#lp-note").value;
    const res = store.rsvp(initial.rsvpGuest, answer, count, note);
    for (const b of main.querySelectorAll("[data-answer]")) b.setAttribute("aria-pressed", String(b === btn));
    const g = store.guest(initial.rsvpGuest);
    say(rsvpStatus, answer === "yes"
      ? `נרשם: מגיעים, ${g.count} ${g.count === 1 ? "אורח" : "אורחים"}. ההזמנה מחכה לשיבוץ, והדשבורד התעדכן.`
      : "נרשם: לא מגיעים. הדשבורד התעדכן.", "ok");
    if (res.unseated) say(seatStatus, `${g.name} הוסרו מ${res.unseated.name} כי ${answer === "yes" ? "אין בו מקום למספר החדש" : "סימנו שלא מגיעים"}.`);
  });

  // Seating: tap a party, then a table. Enter/Space work because every control is a <button>.
  function trySeat(id, tableId) {
    const g = store.guest(id), t = store.table(tableId);
    const res = store.seat(id, tableId);
    if (res.ok) {
      selected = null;
      renderSeating(store.get());
      say(seatStatus, `${g.name} (${g.count}) הושבו ב${t.name}. ${store.used(t.id)}/${t.cap} תפוסים.`, "ok");
      return;
    }
    if (res.reason === "not-coming") { say(seatStatus, `אפשר להושיב רק מי שאישרו הגעה. ${g.name} עדיין לא אישרו.`, "bad"); return; }
    if (res.reason === "capacity") {
      say(seatStatus, `אין מקום: ב${t.name} נשארו ${res.free} מקומות ול${g.name} צריך ${res.needed}. ${missing(res.needed - res.free)}.`, "bad");
      const card = tablesEl.querySelector(`[data-table-card="${tableId}"]`);
      card?.classList.add("is-refused");
      clearTimeout(timer);
      timer = setTimeout(() => card?.classList.remove("is-refused"), 2400);
    }
  }

  main.querySelector("[data-seating]")?.addEventListener("click", e => {
    const target = e.target.closest("button");
    if (!target) return;
    if ("reset" in target.dataset) {
      selected = null; store.reset();
      for (const b of main.querySelectorAll("[data-answer]")) b.removeAttribute("aria-pressed");
      say(rsvpStatus, "עדיין לא עניתם. התשובה תופיע בדשבורד למטה.");
      say(seatStatus, "הדגמה אופסה. בחרו הזמנה מהרשימה ואז שולחן.");
      return;
    }
    if ("auto" in target.dataset) {
      selected = null;
      const r = store.autoSeat();
      say(seatStatus, r.seated || r.failed ? `הושבו ${r.seated} הזמנות לפי קבוצה.${r.failed ? ` ${r.failed} לא נכנסו בגלל מקום.` : ""}` : "אין הזמנות מאושרות שמחכות לשיבוץ.", r.failed ? "bad" : "ok");
      return;
    }
    if (target.dataset.guest) {
      const g = store.guest(target.dataset.guest);
      if (g.rsvp !== "yes") {
        selected = null; renderSeating(store.get());
        say(seatStatus, g.rsvp === "no" ? `${g.name} סימנו שלא מגיעים, ולכן אין מה להושיב.` : `אפשר להושיב רק מי שאישרו הגעה. ${g.name} עדיין לא ענו.`, "bad");
        return;
      }
      selected = selected === g.id ? null : g.id;
      renderSeating(store.get());
      say(seatStatus, selected ? `נבחרו ${g.name} (${g.count}). עכשיו בחרו שולחן. Esc לביטול.` : "הבחירה בוטלה.");
      return;
    }
    if (target.dataset.table) {
      if (!selected) { say(seatStatus, "קודם בחרו הזמנה מהרשימה."); return; }
      trySeat(selected, target.dataset.table);
    }
  });
  main.querySelector("[data-seating]")?.addEventListener("keydown", e => {
    if (e.key === "Escape" && selected) { selected = null; renderSeating(store.get()); say(seatStatus, "הבחירה בוטלה."); }
  });

  // HTML5 drag, fine pointers only (touch keeps tap-to-assign so page scroll is never blocked).
  if (window.matchMedia("(pointer: fine)").matches) {
    const board = main.querySelector("[data-seating]");
    board.addEventListener("dragstart", e => {
      const c = e.target.closest?.(".lp-chip:not(.is-pending)");
      if (!c) return;
      e.dataTransfer.setData("text/plain", c.dataset.guest);
      e.dataTransfer.effectAllowed = "move";
      c.classList.add("is-dragging");
    });
    board.addEventListener("dragend", e => e.target.classList?.remove("is-dragging"));
    board.addEventListener("dragover", e => { if (e.target.closest?.("[data-table-card]")) e.preventDefault(); });
    board.addEventListener("drop", e => {
      const card = e.target.closest?.("[data-table-card]");
      const id = e.dataTransfer.getData("text/plain");
      if (!card || !id) return;
      e.preventDefault();
      trySeat(id, card.dataset.tableCard);
    });
  }

  // Illustrative send buttons: never navigate, never copy, just explain.
  main.querySelector("[data-dash]")?.addEventListener("click", e => {
    if (!e.target.closest("[data-send]")) return;
    say(sendNote, "זו הדגמה, לא נשלח דבר. במערכת עצמה ייפתח הוואטסאפ שלכם עם ההודעה המוכנה, ואתם שולחים מהטלפון.");
  });
}
