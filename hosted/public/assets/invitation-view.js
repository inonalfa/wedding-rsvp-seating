// Shared by the Worker (server-rendered guest invitation) and the browser (owner preview and demo).
// Every value is escaped here; callers pass plain data, never markup, except `challenge`.

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const weekday = new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function hebrewDate(date) {
  const instant = Date.parse(date + "T12:00:00Z");
  if (!Number.isFinite(instant)) return { long: date, weekday: "", short: date };
  return { long: longDate.format(instant), weekday: weekday.format(instant), short: date.split("-").reverse().join(".") };
}

export function hostsLine(title, details) {
  const a = details?.hostA?.trim(), b = details?.hostB?.trim();
  return a && b ? { a, b } : { a: title, b: "" };
}

export function mapLinks(details) {
  const query = [details?.venue, details?.address].filter(Boolean).join(", ");
  if (!query) return null;
  return {
    waze: "https://waze.com/ul?q=" + encodeURIComponent(query) + "&navigate=yes",
    google: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query),
  };
}

/** Google Calendar template link; times are local Israel time with an explicit zone. */
export function calendarLink(title, date, details) {
  const start = (details?.receptionTime || "19:30").replace(":", "");
  const day = date.replace(/-/g, "");
  const next = new Date(Date.parse(date + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE", text: title, dates: `${day}T${start}00/${next}T010000`, ctz: "Asia/Jerusalem",
    location: [details?.venue, details?.address].filter(Boolean).join(", "),
  });
  return "https://calendar.google.com/calendar/render?" + params;
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

/**
 * model: { title, date, details, photos: {cover, couple, card}, guest?: { name, maxGuests, attendance, count, note, table },
 *          formAction, challenge, saved, preview, icsHref }
 */
export function invitationMarkup(model) {
  const details = model.details || {};
  const photos = model.photos || {};
  const hosts = hostsLine(model.title, details);
  const when = hebrewDate(model.date);
  const maps = mapLinks(details);
  const guest = model.guest || null;
  const theme = ["garden", "night", "blush"].includes(details.theme) ? details.theme : "garden";
  const names = hosts.b
    ? `<span>${esc(hosts.a)}</span><i aria-hidden="true">&amp;</i><span>${esc(hosts.b)}</span>`
    : `<span>${esc(hosts.a)}</span>`;
  const cover = photos.cover ? `<img class="inv-cover" src="${esc(photos.cover)}" alt="">` : "";
  const greeting = guest
    ? `<p class="inv-greeting"><strong>${esc(firstName(guest.name))},</strong> נשמח מאוד לחגוג איתכם.</p>`
    : `<p class="inv-greeting">נשמח שתהיו חלק מהשמחה שלנו.</p>`;
  const schedule = [
    details.receptionTime ? `<div><time>${esc(details.receptionTime)}</time><span>קבלת פנים</span></div>` : "",
    details.ceremonyTime ? `<div><time>${esc(details.ceremonyTime)}</time><span>חופה וקידושין</span></div>` : "",
  ].join("");
  const families = details.familyA || details.familyB
    ? `<div class="inv-families">${details.familyA ? `<div><span>הורי הכלה</span><strong>${esc(details.familyA)}</strong></div>` : ""}${details.familyB ? `<div><span>הורי החתן</span><strong>${esc(details.familyB)}</strong></div>` : ""}</div>`
    : "";
  const venue = details.venue || details.address
    ? `<section class="inv-section inv-venue"><p class="inv-eyebrow">איפה נפגשים</p><h2>${esc(details.venue || details.address)}</h2>${details.venue && details.address ? `<address>${esc(details.address)}</address>` : ""}
      <div class="inv-actions">${maps ? `<a class="inv-btn" href="${esc(maps.waze)}" target="_blank" rel="noreferrer">ניווט ב-Waze</a><a class="inv-btn ghost" href="${esc(maps.google)}" target="_blank" rel="noreferrer">Google Maps</a>` : ""}
      <a class="inv-btn ghost" href="${esc(calendarLink(hosts.b ? `החתונה של ${hosts.a} ו${hosts.b}` : model.title, model.date, details))}" target="_blank" rel="noreferrer">הוספה ליומן</a>
      ${model.icsHref ? `<a class="inv-btn ghost" href="${esc(model.icsHref)}">קובץ יומן</a>` : ""}</div></section>`
    : "";
  const couple = photos.couple ? `<figure class="inv-photo"><img src="${esc(photos.couple)}" alt="${esc(hosts.b ? `${hosts.a} ו${hosts.b}` : model.title)}" loading="lazy"></figure>` : "";
  const card = photos.card ? `<figure class="inv-card"><a href="${esc(photos.card)}" target="_blank" rel="noreferrer"><img src="${esc(photos.card)}" alt="ההזמנה" loading="lazy"></a><figcaption>לחצו להגדלה</figcaption></figure>` : "";
  const message = details.message ? `<p class="inv-message">${esc(details.message).replace(/\n/g, "<br>")}</p>` : "";
  const table = guest && guest.table && guest.attendance === "yes" && !details.hideTableOnInvite
    ? `<p class="inv-table">השולחן שלכם: ${esc(guest.table)}</p>` : "";
  const saved = model.saved ? `<p class="inv-saved" role="status">התשובה נשמרה. תודה! אפשר לעדכן אותה כאן בכל עת.</p>` : "";
  const status = guest?.attendance === "yes" ? `<p class="inv-current">כרגע רשום: מגיעים, ${esc(guest.count)} ${guest.count === 1 ? "אורח" : "אורחים"}.</p>`
    : guest?.attendance === "no" ? `<p class="inv-current">כרגע רשום: לא מגיעים.</p>` : "";
  let rsvp = "";
  if (guest) {
    const max = Math.max(1, Math.min(20, Number(guest.maxGuests) || 1));
    const selected = guest.attendance === "yes" ? Number(guest.count) : max;
    const options = Array.from({ length: max }, (_, i) => `<option value="${i + 1}"${i + 1 === selected ? " selected" : ""}>${i + 1}</option>`).join("");
    rsvp = `<section class="inv-section inv-rsvp" id="rsvp"><p class="inv-eyebrow">אישור הגעה</p><h2>נתראה ברחבה?</h2>${saved}${status}${table}
      <form method="post" action="${esc(model.formAction || "")}" class="inv-form" data-rsvp>
        <label>כמות מגיעים <select name="guest_count">${options}</select></label>
        <label>ברכה או הערה (לא חובה) <textarea name="note" maxlength="500" rows="2" placeholder="אלרגיות, הערות או סתם ברכה">${esc(guest.note || "")}</textarea></label>
        ${model.challenge || ""}
        <div class="inv-choice"><button class="inv-btn" name="attendance" value="yes">מאשרים הגעה</button><button class="inv-btn ghost" name="attendance" value="no">לא מגיעים</button></div>
      </form></section>`;
  } else if (model.preview) {
    rsvp = `<section class="inv-section inv-rsvp"><p class="inv-eyebrow">אישור הגעה</p><h2>נתראה ברחבה?</h2><p class="inv-current">כאן כל אורח יראה טופס אישור הגעה אישי.</p></section>`;
  }
  const contact = details.contactPhone ? `<p class="inv-contact">שאלות? <a href="tel:${esc(details.contactPhone.replace(/[^\d+]/g, ""))}" dir="ltr">${esc(details.contactPhone)}</a></p>` : "";
  return `<div class="inv theme-${theme}">
    <header class="inv-hero${cover ? " has-cover" : ""}">${cover}<div class="inv-hero-inner">
      <p class="inv-kicker">מתחתנים</p>
      <h1 class="inv-names">${names}</h1>
      <p class="inv-date"><time datetime="${esc(model.date)}">${esc(when.long)}</time><span>${esc(when.weekday)}</span></p>
      ${greeting}
      ${guest ? `<a class="inv-btn light" href="#rsvp">לאישור הגעה</a>` : ""}
    </div></header>
    <main class="inv-body">
      ${message || schedule || families ? `<section class="inv-section"><p class="inv-eyebrow">${esc(when.short)}</p>${message}${schedule ? `<div class="inv-schedule">${schedule}</div>` : ""}${families}</section>` : ""}
      ${couple}${card}${venue}${rsvp}
      <footer class="inv-footer"><p>${esc(hosts.b ? `${hosts.a} & ${hosts.b}` : hosts.a)}</p>${contact}${model.preview || model.guest ? `<p class="inv-legal"><a href="/privacy" target="_blank" rel="noreferrer">פרטיות</a></p>` : ""}</footer>
    </main></div>`;
}
