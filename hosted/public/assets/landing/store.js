// In-memory demo store shared by the RSVP, seating and dashboard demos. No persistence, no network.

export function createStore(initial) {
  const fresh = () => ({
    guests: initial.guests.map(g => ({ ...g })),
    tables: initial.tables.map(t => ({ ...t })),
    recent: [...initial.recent],
  });
  let state = fresh();
  const subs = new Set();
  const emit = () => subs.forEach(fn => fn(state));
  const guest = id => state.guests.find(g => g.id === id);
  const table = id => state.tables.find(t => t.id === id);
  const used = id => state.guests.reduce((s, g) => s + (g.table === id && g.rsvp === "yes" ? g.count : 0), 0);

  function seatCheck(g, t) {
    if (!g || !t) return { ok: false, reason: "missing" };
    if (g.rsvp !== "yes") return { ok: false, reason: "not-coming" };
    const free = t.cap - used(t.id) + (g.table === t.id ? g.count : 0);
    if (g.count > free) return { ok: false, reason: "capacity", free, needed: g.count };
    return { ok: true };
  }

  return {
    get: () => state,
    guest, table, used,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    counts() {
      let yes = 0, no = 0, pending = 0, seated = 0;
      for (const g of state.guests) {
        if (g.rsvp === "yes") yes += g.count; else if (g.rsvp === "no") no++; else pending++;
        if (g.table && g.rsvp === "yes") seated += g.count;
      }
      return { invited: state.guests.length, yes, no, pending, seated };
    },
    rsvp(id, attendance, count, note) {
      const g = guest(id);
      if (!g) return { ok: false };
      const before = g.table;
      g.rsvp = attendance;
      g.note = String(note || "").slice(0, 200);
      g.count = attendance === "yes" ? Math.max(1, Math.min(g.max, Number(count) || 1)) : 0;
      let unseated = null;
      if (before && (attendance !== "yes" || used(before) > table(before).cap)) {
        g.table = null;
        unseated = table(before);
      }
      state.recent = [id, ...state.recent.filter(x => x !== id)].slice(0, 5);
      emit();
      return { ok: true, unseated };
    },
    seat(id, tableId) {
      const g = guest(id), t = table(tableId);
      const check = seatCheck(g, t);
      if (!check.ok) return check;
      g.table = tableId;
      emit();
      return { ok: true };
    },
    unseat(id) {
      const g = guest(id);
      if (g) { g.table = null; emit(); }
      return { ok: !!g };
    },
    /** Seats confirmed, unseated parties by group: a table labelled with the group first, then any table with room. */
    autoSeat() {
      let seated = 0, failed = 0;
      const waiting = state.guests.filter(g => g.rsvp === "yes" && !g.table).sort((a, b) => b.count - a.count);
      for (const g of waiting) {
        const order = [...state.tables].sort((a, b) => Number(b.label === g.group) - Number(a.label === g.group));
        const t = order.find(x => seatCheck(g, x).ok);
        if (t) { g.table = t.id; seated++; } else failed++;
      }
      emit();
      return { seated, failed };
    },
    reset() { state = fresh(); emit(); },
  };
}
