// Owner app and local-only demo. One UI, two data backends: the JSON API (/api/app) or localStorage.
import { esc, hebrewDate, invitationMarkup } from "./invitation-view.js";
import { waLink } from "./whatsapp.js";

const root = document.getElementById("app");
const DEMO = root.dataset.mode === "demo";
const DEMO_KEY = "wedding-demo-v1";
const TEMPLATE_KEY = "wedding-message-template";
const SENT_KEY = "wedding-sent-v1";
const base = DEMO ? "/demo" : "/app";

/* ---------------------------------------------------------------- storage */

function readLocal(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function removeLocal(key) { try { localStorage.removeItem(key); } catch { /* storage is optional */ } }

/* ---------------------------------------------------------------- validation shared by the local backend */

class UserError extends Error {}
const control = /[\u0000-\u001f\u007f]/;
function checkGuest(g, partial = false) {
  const out = {};
  if (!partial || "name" in g) {
    const name = String(g.name ?? "").trim();
    if (!name || name.length > 80 || control.test(name)) throw new UserError("שם מוזמן חסר או ארוך מדי");
    out.name = name;
  }
  if (!partial || "maxGuests" in g) {
    const n = Number(g.maxGuests);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw new UserError("מספר מוזמנים בהזמנה: 1 עד 20");
    out.maxGuests = n;
  }
  if (!partial || "phone" in g) {
    const phone = String(g.phone ?? "").replace(/[^\d+]/g, "");
    if (phone && !/^\+?\d{7,15}$/.test(phone)) throw new UserError("מספר טלפון לא תקין");
    out.phone = phone || null;
  }
  if (!partial || "group" in g) {
    const group = String(g.group ?? "").trim();
    if (group.length > 40) throw new UserError("שם קבוצה ארוך מדי");
    out.group = group || null;
  }
  return out;
}
function todayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts;
}
function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError("בחרו תאריך");
  const today = todayIso();
  const max = new Date(Date.parse(today) + 366 * 86_400_000).toISOString().slice(0, 10);
  if (date < today || date > max) throw new UserError("בחרו תאריך מהיום ועד שנה קדימה");
}

/* ---------------------------------------------------------------- backends */

const remote = {
  async call(method, path, payload, raw) {
    const init = { method, headers: {}, cache: "no-store", credentials: "same-origin" };
    if (raw) { init.body = raw; init.headers["Content-Type"] = raw.type || "application/octet-stream"; }
    else if (payload !== undefined) { init.body = JSON.stringify(payload); init.headers["Content-Type"] = "application/json"; }
    let response;
    try { response = await fetch("/api/app" + path, init); } catch { throw new UserError("אין חיבור לשרת. בדקו את האינטרנט ונסו שוב."); }
    if (response.status === 401) { location.href = "/auth/login"; throw new UserError("נדרשת התחברות מחדש"); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new UserError(data.error || "הפעולה נכשלה");
    return data;
  },
  state() { return this.call("GET", "/state"); },
  createEvent(event) { return this.call("POST", "/event", event); },
  updateEvent(patch) { return this.call("PUT", "/event", patch); },
  importDemo(payload) { return this.call("POST", "/import", payload); },
  addGuests(guests) { return this.call("POST", "/guests", { guests }); },
  updateGuest(id, patch) { return this.call("PATCH", "/guests/" + id, patch); },
  deleteGuest(id) { return this.call("DELETE", "/guests/" + id); },
  setRsvp(id, answer) { return this.call("PUT", "/guests/" + id + "/rsvp", answer); },
  async links(ids) { return (await this.call("POST", "/links", ids ? { ids } : {})).links; },
  async revoke(id) { return (await this.call("POST", "/guests/" + id + "/revoke", {})).links; },
  addTables(tables) { return this.call("POST", "/tables", { tables }); },
  updateTable(id, patch) { return this.call("PATCH", "/tables/" + id, patch); },
  deleteTable(id) { return this.call("DELETE", "/tables/" + id); },
  seat(guestId, tableId) { return this.call("PUT", "/seats", { guestId, tableId }); },
  async seatMany(assignments) {
    let state = null, placed = 0;
    for (let i = 0; i < assignments.length; i += 40) {
      const result = await this.call("PUT", "/seats", { assignments: assignments.slice(i, i + 40) });
      placed += result.placed; state = result;
    }
    return { placed, state };
  },
  uploadPhoto(kind, blob) { return this.call("PUT", "/photos/" + kind, undefined, blob); },
  deletePhoto(kind) { return this.call("DELETE", "/photos/" + kind); },
  async staffLink() { return this.call("POST", "/staff-link", {}); },
};

const uuid = () => crypto.randomUUID();
const local = {
  load() { return readLocal(DEMO_KEY, null); },
  save(data) {
    data.savedAt = Date.now();
    if (!writeLocal(DEMO_KEY, data)) throw new UserError("אין מספיק מקום באחסון הדפדפן. נסו תמונה קטנה יותר או מחקו תמונה.");
    return this.view(data);
  },
  view(data) {
    if (!data?.event) return { account: { name: null, method: "demo" }, event: null, guests: [], tables: [], staffSearch: false };
    const people = data.guests.reduce((sum, g) => sum + g.maxGuests, 0);
    return {
      account: { name: null, method: "demo" },
      event: { ...data.event, photos: { ...data.photos }, quota: { invitations: data.guests.length, people, maxInvitations: 300, maxPeople: 500 } },
      guests: data.guests.map(g => ({ ...g })), tables: data.tables.map(t => ({ ...t })), staffSearch: false,
    };
  },
  need() { const data = this.load(); if (!data?.event) throw new UserError("עדיין לא נוצר אירוע"); return data; },
  async state() { return this.view(this.load()); },
  async createEvent({ title, date, details }) {
    checkDate(date);
    if (!String(title || "").trim()) throw new UserError("נדרש שם לאירוע");
    const data = { event: { id: "demo", title: title.trim().slice(0, 100), date, purgeAt: Date.parse(date) + 91 * 86_400_000, details }, guests: [], tables: [], photos: {} };
    return this.save(data);
  },
  async updateEvent(patch) {
    const data = this.need();
    if (patch.date) { checkDate(patch.date); data.event.date = patch.date; data.event.purgeAt = Date.parse(patch.date) + 91 * 86_400_000; }
    if (patch.title !== undefined) { if (!patch.title.trim()) throw new UserError("נדרש שם לאירוע"); data.event.title = patch.title.trim().slice(0, 100); }
    if (patch.details) data.event.details = { ...data.event.details, ...patch.details };
    return this.save(data);
  },
  async addGuests(list) {
    const data = this.need();
    const clean = list.map(g => checkGuest(g));
    if (data.guests.length + clean.length > 300) throw new UserError("עד 300 הזמנות לאירוע");
    if (data.guests.reduce((s, g) => s + g.maxGuests, 0) + clean.reduce((s, g) => s + g.maxGuests, 0) > 500) throw new UserError("עד 500 מוזמנים לאירוע");
    for (const g of clean) data.guests.push({ id: uuid(), ...g, attendance: null, count: null, note: null, updatedAt: null, source: null, tableId: null });
    return { added: clean.length, ...this.save(data) };
  },
  async updateGuest(id, patch) {
    const data = this.need();
    const guest = data.guests.find(g => g.id === id) ?? (() => { throw new UserError("המוזמן לא נמצא"); })();
    const clean = checkGuest(patch, true);
    if (clean.maxGuests !== undefined && guest.attendance === "yes" && guest.count > clean.maxGuests) throw new UserError(`כבר אושרו ${guest.count} מגיעים. עדכנו קודם את האישור.`);
    Object.assign(guest, clean);
    return this.save(data);
  },
  async deleteGuest(id) { const data = this.need(); data.guests = data.guests.filter(g => g.id !== id); return this.save(data); },
  async setRsvp(id, answer, source = "owner") {
    const data = this.need();
    const guest = data.guests.find(g => g.id === id) ?? (() => { throw new UserError("המוזמן לא נמצא"); })();
    if (answer.attendance === null) Object.assign(guest, { attendance: null, count: null, note: null, updatedAt: null, source: null, tableId: null });
    else {
      const count = answer.attendance === "no" ? 0 : Number(answer.count);
      if (answer.attendance === "yes" && (!Number.isInteger(count) || count < 1 || count > guest.maxGuests)) throw new UserError(`מספר המגיעים: 1 עד ${guest.maxGuests}`);
      if (answer.attendance === "yes" && guest.tableId) {
        const table = data.tables.find(t => t.id === guest.tableId);
        const used = data.guests.filter(g => g.id !== id && g.tableId === guest.tableId && g.attendance === "yes").reduce((s, g) => s + g.count, 0);
        if (table && used + count > table.capacity) guest.tableId = null;
      }
      if (answer.attendance === "no") guest.tableId = null;
      Object.assign(guest, { attendance: answer.attendance, count, note: answer.note?.trim().slice(0, 500) || guest.note || null, updatedAt: Date.now(), source });
    }
    return this.save(data);
  },
  async links(ids) {
    const data = this.need();
    return Object.fromEntries(data.guests.filter(g => !ids || ids.includes(g.id)).map(g => [g.id, location.origin + base + "#/invite/" + g.id]));
  },
  async revoke(id) { return this.links([id]); },
  async addTables(list) {
    const data = this.need();
    let created = 0;
    for (const t of list) {
      const number = Number(t.number), capacity = Number(t.capacity);
      if (!Number.isInteger(number) || number < 1 || number > 999 || !Number.isInteger(capacity) || capacity < 1 || capacity > 50) throw new UserError("מספר שולחן 1-999 וקיבולת 1-50");
      if (data.tables.length >= 60 || data.tables.some(x => x.number === number)) continue;
      data.tables.push({ id: uuid(), number, capacity, label: String(t.label || "").trim().slice(0, 40) || null });
      created++;
    }
    if (!created) throw new UserError("השולחן כבר קיים או שהגעתם ל-60 שולחנות");
    data.tables.sort((a, b) => a.number - b.number);
    return this.save(data);
  },
  async updateTable(id, patch) {
    const data = this.need();
    const table = data.tables.find(t => t.id === id) ?? (() => { throw new UserError("השולחן לא נמצא"); })();
    if (patch.capacity !== undefined) {
      const c = Number(patch.capacity);
      if (!Number.isInteger(c) || c < 1 || c > 50) throw new UserError("קיבולת 1-50");
      table.capacity = c;
    }
    if (patch.label !== undefined) table.label = String(patch.label).trim().slice(0, 40) || null;
    return this.save(data);
  },
  async deleteTable(id) {
    const data = this.need();
    data.tables = data.tables.filter(t => t.id !== id);
    for (const g of data.guests) if (g.tableId === id) g.tableId = null;
    return this.save(data);
  },
  place(data, guestId, tableId) {
    const guest = data.guests.find(g => g.id === guestId);
    if (!guest || guest.attendance !== "yes") return false;
    if (!tableId) { guest.tableId = null; return true; }
    const table = data.tables.find(t => t.id === tableId);
    if (!table) return false;
    const used = data.guests.filter(g => g.id !== guestId && g.tableId === tableId && g.attendance === "yes").reduce((s, g) => s + g.count, 0);
    if (used + guest.count > table.capacity) return false;
    guest.tableId = tableId;
    return true;
  },
  async seat(guestId, tableId) {
    const data = this.need();
    if (!this.place(data, guestId, tableId)) throw new UserError("אין מספיק מקום בשולחן, או שהמוזמן עוד לא אישר הגעה.");
    return this.save(data);
  },
  async seatMany(assignments) {
    const data = this.need();
    let placed = 0;
    for (const a of assignments) if (this.place(data, a.guestId, a.tableId)) placed++;
    return { placed, state: this.save(data) };
  },
  async uploadPhoto(kind, blob) {
    const data = this.need();
    data.photos[kind] = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new UserError("קריאת התמונה נכשלה"));
      reader.readAsDataURL(blob);
    });
    return this.save(data);
  },
  async deletePhoto(kind) { const data = this.need(); delete data.photos[kind]; return this.save(data); },
  async staffLink() { throw new UserError("קישור לצוות זמין אחרי יצירת חשבון."); },
};

const api = DEMO ? local : remote;

/* ---------------------------------------------------------------- app state */

const S = { data: null, filter: { q: "", status: "all", group: "" }, busy: false, links: {}, previewGuest: "" };

function toast(message, kind = "ok") {
  let box = document.querySelector(".toasts");
  if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.append(box); }
  const item = document.createElement("div");
  item.className = "toast " + kind;
  item.textContent = message;
  box.append(item);
  while (box.children.length > 2) box.firstElementChild.remove();
  setTimeout(() => item.remove(), kind === "error" ? 6000 : 3200);
}

async function run(task, success) {
  if (S.busy) return null;
  S.busy = true;
  document.body.classList.add("is-busy");
  try {
    const result = await task();
    if (result && typeof result === "object" && "event" in result && "guests" in result) S.data = result;
    else if (result?.state) S.data = result.state;
    if (success) toast(typeof success === "function" ? success(result) : success);
    render();
    return result ?? true;
  } catch (error) {
    toast(error instanceof UserError ? error.message : "אירעה שגיאה. נסו שוב.", "error");
    if (!(error instanceof UserError)) console.error(error);
    return null;
  } finally {
    S.busy = false;
    document.body.classList.remove("is-busy");
  }
}

/* ---------------------------------------------------------------- helpers */

const isSeated = g => g.attendance === "yes" && g.tableId;
function stats() {
  const g = S.data?.guests ?? [];
  const yes = g.filter(x => x.attendance === "yes"), no = g.filter(x => x.attendance === "no"), pending = g.filter(x => !x.attendance);
  const coming = yes.reduce((s, x) => s + x.count, 0);
  const seated = yes.filter(x => x.tableId).reduce((s, x) => s + x.count, 0);
  const capacity = (S.data?.tables ?? []).reduce((s, t) => s + t.capacity, 0);
  return { invites: g.length, invited: g.reduce((s, x) => s + x.maxGuests, 0), yes: yes.length, no: no.length, pending: pending.length, coming, seated, capacity,
    rate: g.length ? Math.round((yes.length + no.length) / g.length * 100) : 0 };
}
function tableUse(table) {
  return S.data.guests.filter(g => g.tableId === table.id && g.attendance === "yes").reduce((s, g) => s + g.count, 0);
}
function groups() { return [...new Set(S.data.guests.map(g => g.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "he")); }
function statusBadge(g) {
  if (g.attendance === "yes") return `<span class="badge yes">מגיעים · ${g.count}</span>`;
  if (g.attendance === "no") return `<span class="badge no">לא מגיעים</span>`;
  return `<span class="badge pending">ממתינים</span>`;
}
function relTime(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "עכשיו";
  if (diff < 3_600_000) return `לפני ${Math.round(diff / 60_000)} דק׳`;
  if (diff < 86_400_000) return `לפני ${Math.round(diff / 3_600_000)} שע׳`;
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" }).format(ms);
}
function daysLeft(date) {
  const diff = Math.ceil((Date.parse(date + "T00:00:00") - Date.now()) / 86_400_000);
  return diff;
}
function defaultTemplate() {
  const d = S.data.event.details;
  const names = d.hostA && d.hostB ? `${d.hostA} ו${d.hostB}` : S.data.event.title;
  return `היי {שם}! 💍\n${names} מתחתנים ב-${hebrewDate(S.data.event.date).long} ונשמח מאוד לראותכם.\nלאישור הגעה:\n{קישור}`;
}
function messageFor(guest, link) {
  const template = readLocal(TEMPLATE_KEY, null) || defaultTemplate();
  return template.replaceAll("{שם}", guest.name.split(/\s+/)[0]).replaceAll("{קישור}", link);
}
async function ensureLinks(ids) {
  const missing = ids.filter(id => !S.links[id]);
  if (missing.length) Object.assign(S.links, await api.links(missing.length > 50 ? null : missing));
  return S.links;
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("הועתק"); }
  catch { window.prompt("העתיקו את הטקסט:", text); }
}
function sentSet() { return new Set(readLocal(SENT_KEY, [])); }
function markSent(id) { const set = sentSet(); set.add(id); writeLocal(SENT_KEY, [...set]); }

/* ---------------------------------------------------------------- CSV / paste parsing */

export function parseGuestText(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const split = line => {
    const out = []; let field = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) { if (c === '"' && line[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
      else if (c === '"' && !field) quoted = true;
      else if (c === delimiter) { out.push(field.trim()); field = ""; }
      else field += c;
    }
    out.push(field.trim());
    return out;
  };
  let rows = lines.map(split);
  const header = rows[0].map(h => h.toLowerCase());
  const find = names => header.findIndex(h => names.some(n => h.includes(n)));
  let cols = { name: 0, count: 1, phone: 2, group: 3 };
  if (find(["name", "שם"]) !== -1) {
    cols = { name: find(["name", "שם"]), count: find(["max", "count", "כמות", "מוזמנים", "מספר"]), phone: find(["phone", "טלפון", "נייד"]), group: find(["group", "קבוצה", "צד"]) };
    rows = rows.slice(1);
  }
  return rows.map(r => {
    let count = cols.count >= 0 ? r[cols.count] : "";
    let phone = cols.phone >= 0 ? r[cols.phone] : "";
    if (count && /\d{6,}/.test(count.replace(/\D/g, "")) && !phone) { phone = count; count = ""; }
    return { name: r[cols.name] ?? "", maxGuests: Number(count) || 1, phone: phone || "", group: cols.group >= 0 ? r[cols.group] ?? "" : "" };
  }).filter(g => g.name);
}

/* ---------------------------------------------------------------- image compression */

async function compressImage(file, maxSide, budget) {
  if (!/^image\//.test(file.type)) throw new UserError("בחרו קובץ תמונה");
  if (file.size > 25 * 1024 * 1024) throw new UserError("התמונה גדולה מדי");
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new UserError("לא ניתן לקרוא את התמונה. נסו JPEG או PNG."); }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= budget) return blob;
  }
  throw new UserError("לא הצלחנו לכווץ את התמונה מספיק");
}

/* ---------------------------------------------------------------- dialogs */

function dialog(title, body, { submit = "שמירה", danger = false, wide = false } = {}) {
  return new Promise(resolve => {
    const el = document.createElement("dialog");
    el.className = "dialog" + (wide ? " wide" : "");
    el.innerHTML = `<form method="dialog" class="stack"><header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="סגירה">✕</button></header>${body}
      <footer>${submit ? `<button class="btn ${danger ? "danger" : "primary"}" value="ok">${esc(submit)}</button>` : ""}<button type="button" class="btn ghost" data-close>ביטול</button></footer></form>`;
    document.body.append(el);
    const finish = value => { el.close(); el.remove(); resolve(value); };
    el.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => finish(null)));
    el.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
    el.querySelector("form").addEventListener("submit", event => {
      event.preventDefault();
      if (event.submitter?.value !== "ok") return;
      finish(new FormData(event.target));
    });
    el.showModal();
    el.querySelector("input, select, textarea")?.focus();
  });
}

/* ---------------------------------------------------------------- layout */

const pages = [
  ["", "סקירה"], ["details", "פרטי האירוע"], ["guests", "מוזמנים"], ["send", "שליחה"], ["seating", "הושבה"], ["preview", "תצוגת הזמנה"],
];
function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [page, arg] = hash.split("/");
  return { page: page || "", arg: arg ? decodeURIComponent(arg) : "" };
}

function demoMenu() {
  return `<div class="menu-wrap"><button class="menu-demo" type="button" data-action="toggle-menu" data-menu="demo" aria-expanded="false" aria-haspopup="true">הדגמה</button>
    <div class="menu-pop" data-pop="demo" hidden>
      <p><strong>אתם בסביבת הדגמה.</strong> כל מה שתזינו נשמר רק בדפדפן הזה, עד שתיצרו חשבון.</p>
      <a class="btn primary block" href="/auth/signup">יצירת חשבון ושמירת הנתונים</a>
      <a class="btn ghost block" href="/auth/login">כבר יש לי חשבון</a>
      <button class="btn ghost block" type="button" data-action="demo-sample">מילוי נתוני דוגמה</button>
      <button class="btn ghost block danger-text" type="button" data-action="demo-reset">איפוס ההדגמה</button>
    </div></div>`;
}
function accountMenu() {
  const a = S.data.account;
  const label = a.name || a.username || "החשבון שלי";
  const ev = S.data.event;
  return `<div class="menu-wrap"><button class="menu-account" type="button" data-action="toggle-menu" data-menu="account" aria-expanded="false" aria-haspopup="true">${esc(label)}</button>
    <div class="menu-pop" data-pop="account" hidden>
      <p class="muted small">${a.method === "password" ? "כניסה עם שם משתמש" : "מחוברים עם Google"}</p>
      ${ev ? `<a class="btn ghost block" href="/events/${esc(ev.id)}/data">ייצוא או מחיקת נתונים</a><a class="btn ghost block" href="/events/${esc(ev.id)}/reminder">תזכורת ביומן לפני מחיקה</a>` : ""}
      <form method="post" action="/auth/logout"><button class="btn ghost block">התנתקות</button></form>
      <p class="muted small center"><a href="/privacy">פרטיות</a> · <a href="/terms">תנאי שימוש</a></p>
    </div></div>`;
}

function shell(content, active) {
  const ev = S.data.event;
  const nav = ev ? `<nav class="main-menu app-menu" aria-label="תפריט ראשי">${pages.map(([id, label]) => `<a href="#/${id}"${active === id ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>` : "";
  return `<header class="site-bar app-bar"><a class="brand" href="${DEMO ? "/" : "#/"}">${DEMO ? "חתונה<span>.</span>בקליק" : "אישור הגעה פלוס"}</a>${nav}
    <div class="bar-end">${DEMO ? demoMenu() : accountMenu()}</div></header>
    <main class="app-main" id="main">${content}</main>`;
}

/* ---------------------------------------------------------------- views */

function eventFormFields(ev = { title: "", date: "", details: {} }) {
  const d = ev.details || {};
  return `<div class="grid two">
      <label>שם הכלה / בן הזוג <input name="hostA" maxlength="40" value="${esc(d.hostA)}" placeholder="דנה" required></label>
      <label>שם החתן / בת הזוג <input name="hostB" maxlength="40" value="${esc(d.hostB)}" placeholder="יואב" required></label>
      <label>תאריך האירוע <input type="date" name="date" value="${esc(ev.date)}" min="${todayIso()}" required></label>
      <label>מקום האירוע <input name="venue" maxlength="80" value="${esc(d.venue)}" placeholder="גן האירועים"></label>
      <label>קבלת פנים <input type="time" name="receptionTime" value="${esc(d.receptionTime ?? "19:30")}"></label>
      <label>חופה <input type="time" name="ceremonyTime" value="${esc(d.ceremonyTime ?? "20:30")}"></label>
      <label class="span">כתובת (לניווט) <input name="address" maxlength="140" value="${esc(d.address)}" placeholder="רחוב, עיר"></label>
    </div>`;
}
function readEventForm(form, existing = {}) {
  const f = new FormData(form);
  const get = k => String(f.get(k) ?? "").trim();
  const details = { ...existing };
  for (const k of ["hostA", "hostB", "venue", "address", "receptionTime", "ceremonyTime", "message", "familyA", "familyB", "contactPhone", "theme"]) {
    if (f.has(k)) details[k] = get(k);
  }
  if (f.has("hideTableOnInvite") || form.querySelector("[name=hideTableOnInvite]")) details.hideTableOnInvite = f.get("hideTableOnInvite") === "on";
  const title = details.hostA && details.hostB ? `החתונה של ${details.hostA} ו${details.hostB}` : (get("title") || existing.title || "האירוע שלנו");
  return { title: title.slice(0, 100), date: get("date"), details };
}

function viewOnboarding() {
  const pending = !DEMO && local.load()?.event;
  if (pending) {
    const d = local.load();
    return shell(`<section class="panel narrow"><p class="eyebrow">ברוכים הבאים</p><h1>מצאנו נתונים מההדגמה</h1>
      <p>בדפדפן הזה שמור אירוע מההדגמה: <strong>${esc(d.event.title)}</strong>, ${d.guests.length} מוזמנים, ${d.tables.length} שולחנות${Object.keys(d.photos || {}).length ? " ותמונות" : ""}.</p>
      <p class="muted small">יועברו פרטי האירוע, התמונות, המוזמנים והשולחנות. אישורי הגעה ושיבוצים מההדגמה לא יועברו, כי הם הדמיה.</p>
      <div class="cta-row"><button class="btn primary" data-action="import-demo">העברה לחשבון</button><button class="btn ghost" data-action="discard-demo">להתחיל מחדש</button></div></section>`, "");
  }
  return shell(`<section class="panel narrow"><p class="eyebrow">שלב 1 מתוך 4</p><h1>${DEMO ? "בואו ננסה: " : ""}ספרו לנו על האירוע</h1>
    <p class="lead">אפשר לשנות הכול גם אחר כך. מתחילים מהבסיס, ואז ממשיכים לתמונות, מוזמנים ושליחה.</p>
    <form class="stack" data-form="create">${eventFormFields()}<div class="cta-row"><button class="btn primary">יצירת האירוע</button>${DEMO ? `<button type="button" class="btn ghost" data-action="demo-sample">או מלאו נתוני דוגמה</button>` : ""}</div></form>
    ${DEMO ? `<p class="muted small">הדגמה: הנתונים נשמרים רק בדפדפן הזה. <a href="/auth/signup">יצירת חשבון</a> תעביר אותם אליכם.</p>` : ""}</section>`, "");
}

function viewDashboard() {
  const ev = S.data.event, st = stats(), d = ev.details;
  const left = daysLeft(ev.date);
  const hasPhotos = Object.keys(ev.photos || {}).length > 0;
  const steps = [
    [Boolean(d.venue && d.address), "פרטי מקום וכתובת", "#/details"],
    [hasPhotos, "העלאת תמונות להזמנה", "#/details"],
    [st.invites > 0, "הוספת מוזמנים", "#/guests"],
    [sentSet().size > 0 || st.yes + st.no > 0, "שליחת הזמנות בוואטסאפ", "#/send"],
    [S.data.tables.length > 0 && st.coming > 0 && st.seated === st.coming, "סידור הושבה", "#/seating"],
  ];
  const done = steps.filter(s => s[0]).length;
  const recent = S.data.guests.filter(g => g.updatedAt).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const notes = S.data.guests.filter(g => g.note).slice(0, 8);
  const purge = new Intl.DateTimeFormat("he-IL", { dateStyle: "long" }).format(ev.purgeAt);
  return shell(`<section class="dash-head"><div><p class="eyebrow">${left > 0 ? `עוד ${left} ימים` : left === 0 ? "היום זה קורה!" : "האירוע עבר"}</p>
      <h1>${esc(d.hostA && d.hostB ? `${d.hostA} & ${d.hostB}` : ev.title)}</h1><p class="muted">${esc(hebrewDate(ev.date).long)} · ${esc(d.venue || "מקום עוד לא נקבע")}</p></div>
      <div class="cta-row"><a class="btn primary" href="#/send">שליחת הזמנות</a><a class="btn ghost" href="#/preview">תצוגת הזמנה</a></div></section>
    <section class="stat-grid">
      <div class="stat"><span>הזמנות</span><strong>${st.invites}</strong><small>${st.invited} מוזמנים</small></div>
      <div class="stat good"><span>מגיעים</span><strong>${st.coming}</strong><small>${st.yes} הזמנות אישרו</small></div>
      <div class="stat bad"><span>לא מגיעים</span><strong>${st.no}</strong><small>הזמנות</small></div>
      <div class="stat wait"><span>ממתינים לתשובה</span><strong>${st.pending}</strong><small>${st.rate}% השיבו</small></div>
      <div class="stat"><span>הושבו</span><strong>${st.seated}/${st.coming}</strong><small>${st.capacity} מקומות ב-${S.data.tables.length} שולחנות</small></div>
    </section>
    <div class="grid two dash-cols">
      <section class="panel"><h2>הצעדים הבאים <span class="muted small">${done}/${steps.length}</span></h2><div class="progress"><span data-pct="${Math.round(done / steps.length * 100)}"></span></div>
        <ul class="checklist">${steps.map(([ok, label, href]) => `<li class="${ok ? "done" : ""}"><a href="${href}"><span class="check" aria-hidden="true">${ok ? "✓" : ""}</span>${esc(label)}</a></li>`).join("")}</ul></section>
      <section class="panel"><h2>תשובות אחרונות</h2>${recent.length ? `<ul class="feed">${recent.map(g => `<li><strong>${esc(g.name)}</strong> ${statusBadge(g)}<span class="muted small">${esc(relTime(g.updatedAt))}${g.source === "owner" ? " · עודכן ידנית" : ""}</span></li>`).join("")}</ul>` : `<p class="muted">עדיין אין תשובות. אחרי השליחה הן יופיעו כאן.</p>`}
        ${notes.length ? `<h3>ברכות והערות</h3><ul class="notes">${notes.map(g => `<li><q>${esc(g.note)}</q><span>${esc(g.name)}</span></li>`).join("")}</ul>` : ""}</section>
    </div>
    ${!DEMO ? `<p class="muted small center">נתוני האירוע יימחקו אוטומטית ב-${esc(purge)}. אפשר לייצא עותק מתפריט החשבון.</p>` : ""}`, "");
}

function photoSlot(kind, label, hint) {
  const src = S.data.event.photos?.[kind];
  return `<div class="photo-slot"><div class="photo-frame">${src ? `<img src="${esc(src)}" alt="${esc(label)}">` : `<span>אין תמונה</span>`}</div>
    <div><strong>${esc(label)}</strong><p class="muted small">${esc(hint)}</p>
    <label class="btn ghost small file-btn">${src ? "החלפה" : "העלאה"}<input type="file" accept="image/*" data-photo="${kind}" hidden></label>
    ${src ? `<button class="btn ghost small danger-text" data-action="photo-delete" data-kind="${kind}">הסרה</button>` : ""}</div></div>`;
}

function viewDetails() {
  const ev = S.data.event, d = ev.details;
  return shell(`<div class="details-layout"><section class="panel"><h1>פרטי האירוע</h1>
    <form class="stack" data-form="details">${eventFormFields(ev)}
      <label>הודעה אישית בהזמנה <textarea name="message" maxlength="600" rows="4" placeholder="אחרי שנים של... נשמח לחגוג איתכם">${esc(d.message)}</textarea></label>
      <div class="grid two"><label>הורי הכלה <input name="familyA" maxlength="80" value="${esc(d.familyA)}" placeholder="משפחת כהן"></label>
      <label>הורי החתן <input name="familyB" maxlength="80" value="${esc(d.familyB)}" placeholder="משפחת לוי"></label>
      <label>טלפון לשאלות <input name="contactPhone" maxlength="20" dir="ltr" value="${esc(d.contactPhone)}" placeholder="050-0000000"></label>
      <label>עיצוב <select name="theme">${[["garden", "גן ירוק"], ["night", "לילה כחול"], ["blush", "ורוד עדין"]].map(([v, l]) => `<option value="${v}"${d.theme === v ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <label class="check-row"><input type="checkbox" name="hideTableOnInvite"${d.hideTableOnInvite ? " checked" : ""}> לא להציג לאורחים את מספר השולחן בהזמנה</label>
      <div class="cta-row sticky-actions"><button class="btn primary">שמירת הפרטים</button><a class="btn ghost" href="#/preview">לתצוגה המלאה</a></div>
    </form></section>
    <section class="panel"><h2>תמונות</h2><p class="muted small">התמונות מכווצות בדפדפן לפני ההעלאה. עד 800KB לתמונה.</p>
      ${photoSlot("cover", "תמונת שער", "רקע לראש ההזמנה. מומלץ לרוחב.")}${photoSlot("couple", "תמונה שלכם", "מופיעה באמצע ההזמנה.")}${photoSlot("card", "עיצוב ההזמנה", "אם יש לכם הזמנה מעוצבת כתמונה.")}
      <h2>תצוגה מקדימה</h2><div class="mini-preview" aria-label="תצוגה מקדימה">${invitationMarkup({ ...ev, preview: true })}</div></section></div>`, "details");
}

function guestRow(g) {
  const table = g.attendance === "yes" && g.tableId ? S.data.tables.find(t => t.id === g.tableId) : null;
  return `<tr data-id="${esc(g.id)}"><td><strong>${esc(g.name)}</strong>${g.group ? `<span class="chip">${esc(g.group)}</span>` : ""}${g.note ? `<div class="muted small note-line" title="${esc(g.note)}">💬 ${esc(g.note)}</div>` : ""}</td>
    <td>${g.maxGuests}</td><td>${statusBadge(g)}</td><td>${table ? `שולחן ${table.number}` : "<span class=muted>-</span>"}</td>
    <td dir="ltr" class="muted small">${esc(g.phone || "")}</td>
    <td class="row-actions"><button class="btn ghost small" data-action="rsvp" data-id="${esc(g.id)}">תשובה</button><button class="btn ghost small" data-action="edit-guest" data-id="${esc(g.id)}">עריכה</button><button class="btn ghost small" data-action="copy-link" data-id="${esc(g.id)}">קישור</button></td></tr>`;
}

function filteredGuests() {
  const { q, status, group } = S.filter;
  const needle = q.trim().toLowerCase();
  return S.data.guests.filter(g => (!needle || g.name.toLowerCase().includes(needle) || (g.phone || "").includes(needle)) &&
    (status === "all" || (status === "pending" ? !g.attendance : g.attendance === status)) && (!group || g.group === group));
}

function viewGuests() {
  const st = stats(), q = S.data.event.quota, list = filteredGuests();
  return shell(`<section class="page-head"><div><h1>מוזמנים</h1><p class="muted">${st.invites} הזמנות · ${st.invited} מוזמנים · מכסה: ${q.maxInvitations} הזמנות ו-${q.maxPeople} מוזמנים</p></div>
      <div class="cta-row"><button class="btn ghost" data-action="bulk-add">הדבקה מאקסל / ייבוא</button><button class="btn ghost" data-action="export-csv"${st.invites ? "" : " disabled"}>ייצוא לאקסל</button></div></section>
    <section class="panel"><form class="add-guest" data-form="add-guest">
      <label>שם <input name="name" maxlength="80" required placeholder="משפחת ישראלי"></label>
      <label>כמות <input name="maxGuests" type="number" min="1" max="20" value="2" required></label>
      <label>טלפון <input name="phone" dir="ltr" maxlength="20" inputmode="tel" placeholder="050..."></label>
      <label>קבוצה <input name="group" maxlength="40" list="groups" placeholder="משפחה / חברים / עבודה"></label>
      <datalist id="groups">${groups().map(g => `<option value="${esc(g)}">`).join("")}</datalist>
      <button class="btn primary">הוספה</button></form></section>
    <section class="panel">
      <div class="filters"><input type="search" placeholder="חיפוש לפי שם או טלפון" value="${esc(S.filter.q)}" data-filter="q" aria-label="חיפוש מוזמנים">
        <select data-filter="status" aria-label="סינון לפי סטטוס">${[["all", "כל הסטטוסים"], ["yes", "מגיעים"], ["no", "לא מגיעים"], ["pending", "ממתינים"]].map(([v, l]) => `<option value="${v}"${S.filter.status === v ? " selected" : ""}>${l}</option>`).join("")}</select>
        <select data-filter="group" aria-label="סינון לפי קבוצה"><option value="">כל הקבוצות</option>${groups().map(g => `<option${S.filter.group === g ? " selected" : ""}>${esc(g)}</option>`).join("")}</select></div>
      ${S.data.guests.length ? `<div class="table-wrap"><table class="guests"><thead><tr><th>שם</th><th>מוזמנים</th><th>סטטוס</th><th>שולחן</th><th>טלפון</th><th><span class="sr">פעולות</span></th></tr></thead>
        <tbody>${list.map(guestRow).join("") || `<tr><td colspan="6" class="muted center">אין תוצאות לסינון</td></tr>`}</tbody></table></div>`
        : `<div class="empty"><h2>עדיין אין מוזמנים</h2><p>הוסיפו אחד אחד, או הדביקו רשימה מאקסל: שם, כמות, טלפון, קבוצה.</p><button class="btn primary" data-action="bulk-add">הדבקת רשימה</button></div>`}
    </section>`, "guests");
}

function viewSend() {
  const sent = sentSet();
  const template = readLocal(TEMPLATE_KEY, null) || defaultTemplate();
  const show = S.filter.sendPending ? S.data.guests.filter(g => !g.attendance) : S.data.guests;
  return shell(`<section class="page-head"><div><h1>שליחת הזמנות</h1><p class="muted">לכל אורח קישור אישי. הקישור פותח את ההזמנה עם השם שלו וטופס אישור הגעה.</p></div></section>
    <div class="grid two send-layout"><section class="panel"><h2>נוסח ההודעה</h2>
      <form data-form="template" class="stack"><textarea name="template" rows="6" maxlength="800">${esc(template)}</textarea>
      <p class="muted small"><code>{שם}</code> יוחלף בשם הפרטי, <code>{קישור}</code> בקישור האישי.</p>
      <div class="cta-row"><button class="btn ghost small">שמירת נוסח</button><button type="button" class="btn ghost small" data-action="template-reset">נוסח ברירת מחדל</button></div></form>
      ${DEMO ? `<p class="alert info">בהדגמה הקישורים פותחים הדמיה של ההזמנה בדפדפן הזה, כדי שתוכלו לנסות לאשר הגעה בעצמכם.</p>` : `<p class="muted small">קישורים תקפים ל-30 יום. אפשר תמיד לשלוח קישור חדש. "ביטול קישור" מבטל את כל הקישורים הקודמים של אותו אורח.</p>`}
      ${S.data.staffSearch ? `<h2>חיפוש שולחן לצוות</h2><p class="muted small">קישור לדלפק הכניסה, תקף ל-24 שעות, מחזיר רק מספר שולחן.</p><button class="btn ghost" data-action="staff-link">יצירת קישור לצוות</button>` : ""}
    </section>
    <section class="panel"><div class="list-head"><h2>אורחים (${show.length})</h2><label class="check-row"><input type="checkbox" data-filter="sendPending"${S.filter.sendPending ? " checked" : ""}> רק מי שלא ענה</label></div>
      ${show.length ? `<ul class="send-list">${show.map(g => `<li><div><strong>${esc(g.name)}</strong> ${statusBadge(g)}${sent.has(g.id) ? `<span class="chip">נשלח</span>` : ""}</div>
        <div class="row-actions">${g.phone ? `<button class="btn whatsapp small" data-action="whatsapp" data-id="${esc(g.id)}">וואטסאפ</button>` : `<button class="btn ghost small" data-action="edit-guest" data-id="${esc(g.id)}">הוספת טלפון</button>`}
        <button class="btn ghost small" data-action="copy-message" data-id="${esc(g.id)}">העתקת הודעה</button><button class="btn ghost small" data-action="open-link" data-id="${esc(g.id)}">פתיחה</button>
        ${DEMO ? "" : `<button class="btn ghost small danger-text" data-action="revoke" data-id="${esc(g.id)}">ביטול קישור</button>`}</div></li>`).join("")}</ul>`
        : `<div class="empty"><p>אין אורחים להצגה.</p><a class="btn primary" href="#/guests">הוספת מוזמנים</a></div>`}
    </section></div>`, "send");
}

function viewSeating() {
  const confirmed = S.data.guests.filter(g => g.attendance === "yes");
  const unseated = confirmed.filter(g => !g.tableId || !S.data.tables.some(t => t.id === g.tableId));
  const st = stats();
  const chip = g => `<li class="guest-chip" draggable="true" data-guest="${esc(g.id)}"><button type="button" data-action="seat-pick" data-id="${esc(g.id)}"><strong>${esc(g.name)}</strong><span>${g.count}</span>${g.group ? `<em>${esc(g.group)}</em>` : ""}</button></li>`;
  const tables = S.data.tables.map(t => {
    const used = tableUse(t), over = used > t.capacity;
    const seated = confirmed.filter(g => g.tableId === t.id);
    return `<section class="seat-table${over ? " over" : ""}" data-table="${esc(t.id)}"><header><h3>שולחן ${t.number}${t.label ? ` <small>${esc(t.label)}</small>` : ""}</h3>
      <span class="occupancy${over ? " bad" : used === t.capacity ? " full" : ""}">${used}/${t.capacity}</span>
      <button class="icon-btn" data-action="edit-table" data-id="${esc(t.id)}" aria-label="עריכת שולחן ${t.number}">⋯</button></header>
      <div class="bar"><span data-pct="${Math.min(100, Math.round(used / t.capacity * 100))}"></span></div>
      <ul class="chips">${seated.map(chip).join("") || `<li class="muted small drop-hint">גררו לכאן אורחים</li>`}</ul></section>`;
  }).join("");
  return shell(`<section class="page-head"><div><h1>סידורי הושבה</h1><p class="muted">${st.seated} מתוך ${st.coming} מגיעים הושבו · ${st.capacity} מקומות</p></div>
      <div class="cta-row"><button class="btn ghost" data-action="add-tables">הוספת שולחנות</button><button class="btn ghost" data-action="auto-seat"${unseated.length && S.data.tables.length ? "" : " disabled"}>שיבוץ אוטומטי</button><button class="btn ghost" data-action="print-seating"${S.data.tables.length ? "" : " disabled"}>הדפסה / PDF</button></div></section>
    ${confirmed.length ? "" : `<p class="alert info">רק אורחים שאישרו הגעה מופיעים כאן. אפשר לעדכן תשובה ידנית בעמוד המוזמנים.</p>`}
    <div class="seating-layout"><aside class="panel unseated" data-table=""><h2>ממתינים לשיבוץ (${unseated.reduce((s, g) => s + g.count, 0)})</h2><ul class="chips">${unseated.map(chip).join("") || `<li class="muted small">כל המגיעים הושבו 🎉</li>`}</ul></aside>
      <div class="tables-grid">${tables || `<div class="empty panel"><h2>אין עדיין שולחנות</h2><p>הוסיפו כמה שולחנות בבת אחת, למשל 20 שולחנות של 12.</p><button class="btn primary" data-action="add-tables">הוספת שולחנות</button></div>`}</div></div>
    <div class="print-only">${printSeating()}</div>`, "seating");
}

function printSeating() {
  const ev = S.data.event;
  const rows = S.data.tables.map(t => `<section><h3>שולחן ${t.number}${t.label ? ` - ${esc(t.label)}` : ""} (${tableUse(t)}/${t.capacity})</h3><ul>${S.data.guests.filter(g => g.attendance === "yes" && g.tableId === t.id).map(g => `<li>${esc(g.name)} (${g.count})</li>`).join("")}</ul></section>`).join("");
  const alpha = S.data.guests.filter(isSeated).sort((a, b) => a.name.localeCompare(b.name, "he"))
    .map(g => `<tr><td>${esc(g.name)}</td><td>${g.count}</td><td>${S.data.tables.find(t => t.id === g.tableId)?.number ?? ""}</td></tr>`).join("");
  return `<h1>${esc(ev.title)} - סידור הושבה</h1><div class="print-tables">${rows}</div><h2 class="page-break">רשימה אלפביתית לכניסה</h2><table><thead><tr><th>שם</th><th>מגיעים</th><th>שולחן</th></tr></thead><tbody>${alpha}</tbody></table>`;
}

function viewPreview(arg) {
  const ev = S.data.event;
  const guest = S.data.guests.find(g => g.id === (arg || S.previewGuest));
  const pick = S.data.guests.length ? `<label class="inline">תצוגה כאורח: <select data-action-change="preview-guest"><option value="">ללא אורח</option>${S.data.guests.map(g => `<option value="${esc(g.id)}"${guest?.id === g.id ? " selected" : ""}>${esc(g.name)}</option>`).join("")}</select></label>` : "";
  const table = guest && guest.attendance === "yes" && guest.tableId ? S.data.tables.find(t => t.id === guest.tableId) : null;
  return shell(`<section class="page-head"><div><h1>תצוגת הזמנה</h1><p class="muted">${guest ? (DEMO ? "הדמיה: אפשר למלא את הטופס כאילו אתם האורח." : "כך האורח יראה את ההזמנה. הטופס כאן לתצוגה בלבד.") : "בחרו אורח כדי לראות הזמנה אישית."}</p></div>${pick}</section>
    <div class="preview-frame">${invitationMarkup({ ...ev, preview: !guest, guest: guest ? { ...guest, table: table ? String(table.number) : null } : null, formAction: "#" })}</div>`, "preview");
}

/* ---------------------------------------------------------------- render + routing */

function render() {
  if (!S.data) return;
  const { page, arg } = currentRoute();
  if (DEMO && page === "invite" && S.data.event) { renderGuestDemo(arg); return; }
  document.body.classList.remove("invite-page");
  let html;
  if (!S.data.event) html = viewOnboarding();
  else if (page === "details") html = viewDetails();
  else if (page === "guests") html = viewGuests();
  else if (page === "send") html = viewSend();
  else if (page === "seating") html = viewSeating();
  else if (page === "preview") html = viewPreview(arg);
  else html = viewDashboard();
  const focus = document.activeElement?.dataset?.filter;
  const caret = document.activeElement?.selectionStart;
  root.innerHTML = html;
  root.querySelectorAll("[data-pct]").forEach(el => { el.style.width = el.dataset.pct + "%"; });
  if (focus) { const el = root.querySelector(`[data-filter="${focus}"]`); el?.focus(); if (caret != null && el?.setSelectionRange) el.setSelectionRange(caret, caret); }
  document.title = (S.data.event ? S.data.event.title + " · " : "") + (DEMO ? "הדגמה" : "אישור הגעה פלוס");
}

/** Demo only: a guest-eye view of the invitation, with a working RSVP stored locally. */
function renderGuestDemo(id) {
  const guest = S.data.guests.find(g => g.id === id);
  document.body.classList.add("invite-page");
  if (!guest) { root.innerHTML = `<main class="page-card"><h1>ההזמנה לא נמצאה</h1><a href="${base}#/send">חזרה</a></main>`; return; }
  const table = guest.attendance === "yes" && guest.tableId ? S.data.tables.find(t => t.id === guest.tableId) : null;
  const saved = sessionStorage.getItem("demo-saved") === id;
  try { sessionStorage.removeItem("demo-saved"); } catch { /* optional */ }
  root.innerHTML = `<div class="demo-guest-bar">הדמיית אורח · <a href="${base}#/send">חזרה לניהול</a></div>` +
    invitationMarkup({ ...S.data.event, guest: { ...guest, table: table ? String(table.number) : null }, formAction: "#", saved });
}

/* ---------------------------------------------------------------- actions */

async function loadSample() {
  const date = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
  const details = { hostA: "דנה", hostB: "יואב", receptionTime: "19:30", ceremonyTime: "20:30", venue: "גן האירועים", address: "תל אביב",
    message: "אחרי שש שנים, שתי ערים וכלב אחד - החלטנו שזה הזמן.\nנשמח לחגוג איתכם את הערב הכי חשוב שלנו.", familyA: "משפחת כהן", familyB: "משפחת לוי", contactPhone: "", theme: "garden" };
  if (S.data.event && !confirm("נתוני הדוגמה יחליפו את מה שמילאתם בהדגמה. להמשיך?")) return;
  removeLocal(DEMO_KEY);
  await local.createEvent({ title: "החתונה של דנה ויואב", date, details });
  await local.addGuests([
    { name: "נועה ואורי כהן", maxGuests: 2, phone: "0501234567", group: "משפחה" },
    { name: "סבתא רחל", maxGuests: 1, phone: "", group: "משפחה" },
    { name: "משפחת לוי", maxGuests: 4, phone: "0527654321", group: "משפחה" },
    { name: "תמר שפירא", maxGuests: 2, phone: "0549876543", group: "חברים" },
    { name: "איתי ומיכל", maxGuests: 2, phone: "", group: "חברים" },
    { name: "צוות המשרד", maxGuests: 6, phone: "", group: "עבודה" },
  ]);
  await local.addTables([{ number: 1, capacity: 10, label: "משפחה" }, { number: 2, capacity: 12, label: "חברים" }, { number: 3, capacity: 10 }]);
  const data = local.load();
  await local.setRsvp(data.guests[0].id, { attendance: "yes", count: 2, note: "מזל טוב! מחכים 🎉" }, "guest");
  await local.setRsvp(data.guests[2].id, { attendance: "yes", count: 3 }, "guest");
  await local.setRsvp(data.guests[3].id, { attendance: "no", count: 0, note: "נהיה בחו״ל, מצטערים ואוהבים" }, "guest");
  S.data = await local.state();
  location.hash = "#/";
  render();
  toast("נתוני הדוגמה נטענו");
}

async function importDemo() {
  const d = local.load();
  if (!d?.event) return;
  const result = await run(() => remote.importDemo({
    event: { title: d.event.title, date: d.event.date, details: d.event.details },
    guests: d.guests.map(g => ({ name: g.name, maxGuests: g.maxGuests, phone: g.phone || "", group: g.group || "" })),
    tables: d.tables.map(t => ({ number: t.number, capacity: t.capacity, label: t.label || "" })),
  }));
  if (!result) return;
  for (const [kind, url] of Object.entries(d.photos || {})) {
    try { const blob = await (await fetch(url)).blob(); S.data = await remote.uploadPhoto(kind, blob); }
    catch { toast("תמונה אחת לא הועברה. אפשר להעלות אותה שוב בפרטי האירוע.", "error"); }
  }
  removeLocal(DEMO_KEY);
  render();
  toast("נתוני ההדגמה הועברו לחשבון");
}

async function editGuest(id) {
  const g = S.data.guests.find(x => x.id === id);
  if (!g) return;
  const form = await dialog("עריכת מוזמן", `<label>שם <input name="name" maxlength="80" value="${esc(g.name)}" required></label>
    <div class="grid two"><label>כמות מוזמנים <input name="maxGuests" type="number" min="1" max="20" value="${g.maxGuests}" required></label>
    <label>טלפון <input name="phone" dir="ltr" maxlength="20" value="${esc(g.phone || "")}"></label></div>
    <label>קבוצה <input name="group" maxlength="40" value="${esc(g.group || "")}" list="groups-edit"></label><datalist id="groups-edit">${groups().map(x => `<option value="${esc(x)}">`).join("")}</datalist>
    <button type="button" class="btn ghost danger-text small" data-delete-guest="${esc(g.id)}">מחיקת המוזמן</button>`);
  if (!form) return;
  await run(() => api.updateGuest(id, { name: form.get("name"), maxGuests: Number(form.get("maxGuests")), phone: form.get("phone"), group: form.get("group") }), "נשמר");
}

async function rsvpDialog(id) {
  const g = S.data.guests.find(x => x.id === id);
  if (!g) return;
  const options = Array.from({ length: g.maxGuests }, (_, i) => `<option${(g.attendance === "yes" ? g.count : g.maxGuests) === i + 1 ? " selected" : ""}>${i + 1}</option>`).join("");
  const form = await dialog(`תשובה של ${g.name}`, `<p class="muted small">למשל אחרי שיחת טלפון. התשובה תסומן כעדכון ידני.</p>
    <fieldset class="radios"><legend>הגעה</legend>
      <label><input type="radio" name="attendance" value="yes"${g.attendance === "yes" ? " checked" : ""}> מגיעים</label>
      <label><input type="radio" name="attendance" value="no"${g.attendance === "no" ? " checked" : ""}> לא מגיעים</label>
      <label><input type="radio" name="attendance" value=""${!g.attendance ? " checked" : ""}> עוד לא ענו</label></fieldset>
    <label>כמה מגיעים <select name="count">${options}</select></label>
    <label>הערה <textarea name="note" maxlength="500" rows="2">${esc(g.note || "")}</textarea></label>`);
  if (!form) return;
  const attendance = form.get("attendance") || null;
  await run(() => api.setRsvp(id, { attendance, count: Number(form.get("count")), note: String(form.get("note") || "") }), "התשובה עודכנה");
}

async function bulkAdd() {
  const form = await dialog("הוספת רשימת מוזמנים", `<p class="muted small">העתיקו עמודות מאקסל או מגוגל שיטס והדביקו כאן. סדר העמודות: שם, כמות, טלפון, קבוצה. שורת כותרת תזוהה אוטומטית.</p>
    <textarea name="text" rows="10" placeholder="משפחת כהן&#9;4&#9;0501234567&#9;משפחה&#10;תמר לוי&#9;2&#9;&#9;חברים"></textarea>
    <label>או קובץ CSV <input type="file" name="file" accept=".csv,text/csv,text/plain"></label>`, { submit: "המשך", wide: true });
  if (!form) return;
  let text = String(form.get("text") || "");
  const file = form.get("file");
  if (file && file.size) {
    if (file.size > 512 * 1024) { toast("הקובץ גדול מדי", "error"); return; }
    text += "\n" + await file.text();
  }
  const parsed = parseGuestText(text);
  if (!parsed.length) { toast("לא נמצאו שורות עם שמות", "error"); return; }
  const problems = [];
  parsed.forEach((g, i) => { try { checkGuest(g); } catch (e) { problems.push(`שורה ${i + 1}: ${e.message}`); } });
  const preview = await dialog(`נמצאו ${parsed.length} מוזמנים`, `${problems.length ? `<p class="alert" role="alert">${problems.slice(0, 5).map(esc).join("<br>")}</p>` : ""}
    <div class="table-wrap short"><table class="guests"><thead><tr><th>שם</th><th>כמות</th><th>טלפון</th><th>קבוצה</th></tr></thead><tbody>${parsed.slice(0, 200).map(g => `<tr><td>${esc(g.name)}</td><td>${esc(g.maxGuests)}</td><td dir="ltr">${esc(g.phone)}</td><td>${esc(g.group)}</td></tr>`).join("")}</tbody></table></div>`,
  { submit: problems.length ? "" : `הוספת ${parsed.length} מוזמנים`, wide: true });
  if (!preview) return;
  await run(() => api.addGuests(parsed), r => `נוספו ${r.added} מוזמנים`);
}

async function exportCsv() {
  let links = {};
  try { links = await ensureLinks(S.data.guests.map(g => g.id)); } catch { /* export without links */ }
  const cell = v => { const s = String(v ?? ""); return /^[=+\-@]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : `"${s.replace(/"/g, '""')}"`; };
  const header = ["שם", "מוזמנים", "קבוצה", "טלפון", "סטטוס", "מגיעים", "שולחן", "הערה", "קישור אישי"];
  const rows = S.data.guests.map(g => [g.name, g.maxGuests, g.group, g.phone, g.attendance === "yes" ? "מגיעים" : g.attendance === "no" ? "לא מגיעים" : "ממתינים",
    g.attendance === "yes" ? g.count : "", g.attendance === "yes" ? S.data.tables.find(t => t.id === g.tableId)?.number ?? "" : "", g.note, links[g.id] ?? ""]);
  const csv = "﻿" + [header, ...rows].map(r => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "guests.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function addTables() {
  const next = Math.max(0, ...S.data.tables.map(t => t.number)) + 1;
  const form = await dialog("הוספת שולחנות", `<div class="grid two"><label>כמה שולחנות <input name="count" type="number" min="1" max="60" value="1" required></label>
    <label>מספר ראשון <input name="first" type="number" min="1" max="999" value="${next}" required></label>
    <label>מקומות בכל שולחן <input name="capacity" type="number" min="1" max="50" value="12" required></label>
    <label>תווית (לא חובה) <input name="label" maxlength="40" placeholder="אבירים / רחבה"></label></div>`, { submit: "הוספה" });
  if (!form) return;
  const count = Math.min(60, Number(form.get("count")) || 1), first = Number(form.get("first")) || next;
  const tables = Array.from({ length: count }, (_, i) => ({ number: first + i, capacity: Number(form.get("capacity")), label: form.get("label") }));
  await run(() => api.addTables(tables), `נוספו שולחנות`);
}

async function editTable(id) {
  const t = S.data.tables.find(x => x.id === id);
  if (!t) return;
  const form = await dialog(`שולחן ${t.number}`, `<div class="grid two"><label>מקומות <input name="capacity" type="number" min="1" max="50" value="${t.capacity}" required></label>
    <label>תווית <input name="label" maxlength="40" value="${esc(t.label || "")}"></label></div>
    <label class="check-row"><input type="checkbox" name="delete"> מחיקת השולחן (האורחים יחזרו לרשימת הממתינים)</label>`);
  if (!form) return;
  if (form.get("delete") === "on") await run(() => api.deleteTable(id), "השולחן נמחק");
  else await run(() => api.updateTable(id, { capacity: Number(form.get("capacity")), label: String(form.get("label") || "") }), "נשמר");
}

async function seatPick(id) {
  const g = S.data.guests.find(x => x.id === id);
  if (!g) return;
  const form = await dialog(`שיבוץ ${g.name} (${g.count})`, `<label>שולחן <select name="table"><option value="">ללא שולחן</option>${S.data.tables.map(t => {
    const free = t.capacity - tableUse(t) + (g.tableId === t.id ? g.count : 0);
    return `<option value="${esc(t.id)}"${g.tableId === t.id ? " selected" : ""}${free < g.count ? " disabled" : ""}>שולחן ${t.number}${t.label ? ` · ${esc(t.label)}` : ""} (${free} פנויים)</option>`;
  }).join("")}</select></label>`, { submit: "שיבוץ" });
  if (!form) return;
  await run(() => api.seat(id, String(form.get("table") || "") || null));
}

async function autoSeat() {
  const tables = S.data.tables.map(t => ({ ...t, free: t.capacity - tableUse(t), groups: new Set(S.data.guests.filter(g => g.attendance === "yes" && g.tableId === t.id).map(g => g.group)) }));
  const waiting = S.data.guests.filter(g => g.attendance === "yes" && !(g.tableId && tables.some(t => t.id === g.tableId)))
    .sort((a, b) => (a.group || "￿").localeCompare(b.group || "￿", "he") || b.count - a.count);
  const plan = [];
  for (const g of waiting) {
    const fits = tables.filter(t => t.free >= g.count);
    if (!fits.length) continue;
    const same = fits.filter(t => g.group && t.groups.has(g.group)).sort((a, b) => a.free - b.free)[0];
    const empty = fits.filter(t => t.groups.size === 0).sort((a, b) => b.free - a.free)[0];
    const target = same || empty || fits.sort((a, b) => b.free - a.free)[0];
    target.free -= g.count; target.groups.add(g.group);
    plan.push({ guestId: g.id, tableId: target.id });
  }
  if (!plan.length) { toast("אין מקום פנוי מתאים. הוסיפו שולחנות.", "error"); return; }
  if (!confirm(`לשבץ אוטומטית ${plan.length} הזמנות לפי קבוצות? אפשר לשנות ידנית אחר כך.`)) return;
  await run(() => api.seatMany(plan), r => `שובצו ${r.placed} הזמנות${r.placed < waiting.length ? `, ${waiting.length - r.placed} עדיין ממתינות` : ""}`);
}

async function uploadPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  const kind = input.dataset.photo;
  await run(async () => {
    const blob = await compressImage(file, DEMO ? 1280 : 1920, DEMO ? 420 * 1024 : 780 * 1024);
    return api.uploadPhoto(kind, blob);
  }, "התמונה נשמרה");
}

async function linkFor(id) {
  const links = await ensureLinks([id]);
  return links[id];
}

const actions = {
  "toggle-menu": el => {
    const pop = root.querySelector(`[data-pop="${el.dataset.menu}"]`);
    const open = pop.hidden;
    root.querySelectorAll(".menu-pop").forEach(p => { p.hidden = true; });
    root.querySelectorAll("[data-action=toggle-menu]").forEach(b => b.setAttribute("aria-expanded", "false"));
    pop.hidden = !open;
    el.setAttribute("aria-expanded", String(open));
  },
  "demo-sample": () => loadSample(),
  "demo-reset": async () => {
    if (!confirm("למחוק את כל נתוני ההדגמה מהדפדפן?")) return;
    removeLocal(DEMO_KEY); removeLocal(SENT_KEY); S.data = await local.state(); location.hash = "#/"; render(); toast("ההדגמה אופסה");
  },
  "import-demo": () => importDemo(),
  "discard-demo": () => { if (confirm("למחוק את נתוני ההדגמה מהדפדפן ולהתחיל אירוע חדש?")) { removeLocal(DEMO_KEY); render(); } },
  "photo-delete": el => run(() => api.deletePhoto(el.dataset.kind), "התמונה הוסרה"),
  "bulk-add": () => bulkAdd(),
  "export-csv": () => exportCsv(),
  "edit-guest": el => editGuest(el.dataset.id),
  "rsvp": el => rsvpDialog(el.dataset.id),
  "copy-link": async el => { const link = await run(() => linkFor(el.dataset.id)); if (typeof link === "string") copy(link); },
  "copy-message": async el => {
    const g = S.data.guests.find(x => x.id === el.dataset.id);
    const link = await run(() => linkFor(g.id));
    if (typeof link === "string") { await copy(messageFor(g, link)); markSent(g.id); render(); }
  },
  "whatsapp": async el => {
    const g = S.data.guests.find(x => x.id === el.dataset.id);
    const pending = window.open("", "_blank");
    const link = await run(() => linkFor(g.id));
    if (typeof link !== "string") { pending?.close(); return; }
    const url = waLink(g.phone, messageFor(g, link));
    if (pending) { pending.opener = null; pending.location.href = url; } else location.href = url;
    markSent(g.id); render();
  },
  "open-link": async el => {
    const link = await run(() => linkFor(el.dataset.id));
    if (typeof link === "string") { if (DEMO) location.href = link; else window.open(link, "_blank", "noopener"); }
  },
  "revoke": async el => {
    if (!confirm("לבטל את הקישורים הקיימים של האורח? הקישור הישן יפסיק לעבוד, ותצטרכו לשלוח חדש.")) return;
    const links = await run(() => api.revoke(el.dataset.id), "הקישור הישן בוטל. נוצר קישור חדש.");
    if (links && typeof links === "object") Object.assign(S.links, links);
  },
  "template-reset": () => { removeLocal(TEMPLATE_KEY); render(); },
  "staff-link": async () => {
    const result = await run(() => api.staffLink());
    if (result?.url) await dialog("קישור לצוות הכניסה", `<p>תקף ל-${result.hours} שעות. שתפו רק עם הצוות.</p><input dir="ltr" readonly value="${esc(result.url)}" data-select-all><button type="button" class="btn ghost small" data-copy="${esc(result.url)}">העתקה</button>`, { submit: "" }).then(() => {});
  },
  "add-tables": () => addTables(),
  "edit-table": el => editTable(el.dataset.id),
  "seat-pick": el => seatPick(el.dataset.id),
  "auto-seat": () => autoSeat(),
  "print-seating": () => window.print(),
};

root.addEventListener("click", event => {
  const el = event.target.closest("[data-action]");
  if (el && actions[el.dataset.action] && !el.disabled) { event.preventDefault(); actions[el.dataset.action](el); return; }
  if (!event.target.closest(".menu-wrap")) root.querySelectorAll(".menu-pop").forEach(p => { p.hidden = true; });
});
document.addEventListener("click", event => {
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) { copy(copyButton.dataset.copy); return; }
  const del = event.target.closest("[data-delete-guest]");
  if (!del) return;
  const guest = S.data.guests.find(g => g.id === del.dataset.deleteGuest);
  if (!guest || !confirm(`למחוק את ${guest.name}? פעולה זו מבטלת גם את הקישור שלו.`)) return;
  del.closest("dialog").querySelector("[data-close]").click();
  run(() => api.deleteGuest(guest.id), "המוזמן נמחק");
});
document.addEventListener("focusin", event => { if (event.target.matches?.("[data-select-all]")) event.target.select(); });

root.addEventListener("input", event => {
  const key = event.target.dataset.filter;
  if (key === "q") { S.filter.q = event.target.value; render(); }
});
root.addEventListener("change", async event => {
  const el = event.target;
  if (el.dataset.filter === "status" || el.dataset.filter === "group") { S.filter[el.dataset.filter] = el.value; render(); }
  if (el.dataset.filter === "sendPending") { S.filter.sendPending = el.checked; render(); }
  if (el.dataset.photo) await uploadPhoto(el);
  if (el.dataset.actionChange === "preview-guest") { S.previewGuest = el.value; location.hash = "#/preview" + (el.value ? "/" + el.value : ""); }
});

root.addEventListener("submit", async event => {
  const form = event.target;
  const kind = form.dataset.form;
  if (form.matches("[data-rsvp]")) {
    event.preventDefault();
    const { page, arg } = currentRoute();
    if (!DEMO || page !== "invite") { toast("בתצוגה המקדימה הטופס אינו נשלח"); return; }
    const f = new FormData(form);
    const attendance = event.submitter?.value;
    try {
      S.data = await local.setRsvp(arg, { attendance, count: Number(f.get("guest_count")), note: String(f.get("note") || "") }, "guest");
      try { sessionStorage.setItem("demo-saved", arg); } catch { /* optional */ }
      render();
      root.querySelector("#rsvp")?.scrollIntoView({ block: "start" });
    } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (!kind) return;
  event.preventDefault();
  if (kind === "create") {
    const value = readEventForm(form);
    if (await run(() => api.createEvent(value), "האירוע נוצר! עכשיו נוסיף תמונות ופרטים.")) location.hash = "#/details";
  } else if (kind === "details") {
    const value = readEventForm(form, S.data.event.details);
    await run(() => api.updateEvent({ title: value.title, date: value.date, details: value.details }), "הפרטים נשמרו");
  } else if (kind === "add-guest") {
    const f = new FormData(form);
    const guest = { name: f.get("name"), maxGuests: Number(f.get("maxGuests")), phone: f.get("phone"), group: f.get("group") };
    if (await run(() => api.addGuests([guest]), `${String(guest.name).trim()} נוסף`)) root.querySelector('[data-form="add-guest"] [name=name]')?.focus();
  } else if (kind === "template") {
    const text = String(new FormData(form).get("template") || "");
    if (!text.includes("{קישור}")) { toast("הנוסח חייב לכלול {קישור}", "error"); return; }
    writeLocal(TEMPLATE_KEY, text); toast("הנוסח נשמר");
  }
});

/* drag and drop seating (desktop); tap-to-pick works everywhere */
root.addEventListener("dragstart", event => {
  const chip = event.target.closest("[data-guest]");
  if (chip) { event.dataTransfer.setData("text/plain", chip.dataset.guest); event.dataTransfer.effectAllowed = "move"; }
});
root.addEventListener("dragover", event => { const zone = event.target.closest("[data-table]"); if (zone) { event.preventDefault(); zone.classList.add("drop"); } });
root.addEventListener("dragleave", event => { event.target.closest?.("[data-table]")?.classList.remove("drop"); });
root.addEventListener("drop", event => {
  const zone = event.target.closest("[data-table]");
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("drop");
  const guest = event.dataTransfer.getData("text/plain");
  if (guest) run(() => api.seat(guest, zone.dataset.table || null));
});

window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
window.addEventListener("storage", async event => { if (DEMO && event.key === DEMO_KEY) { S.data = await local.state(); render(); } });

async function start() {
  try {
    S.data = await api.state();
    render();
  } catch (error) {
    root.innerHTML = `<main class="page-card"><h1>לא הצלחנו לטעון</h1><p>${esc(error instanceof UserError ? error.message : "אירעה שגיאה")}</p><a class="btn primary" href="">ניסיון נוסף</a></main>`;
  }
}
start();
