import { escapeHtml as esc } from "../../http";
import { RSVP } from "../copy";
import { COUPLE, GUESTS, RSVP_GUEST_ID } from "../data";
import { fictional, sectionHead } from "./header";

export function rsvpDemo() {
  const guest = GUESTS.find(g => g.id === RSVP_GUEST_ID)!;
  const first = guest.name.split(" ")[0];
  const options = Array.from({ length: guest.max }, (_, i) => `<option value="${i + 1}"${i === 1 ? " selected" : ""}>${i + 1}</option>`).join("");
  const facts = RSVP.facts.map(f => `<li>${esc(f)}</li>`).join("");
  return `<section class="lp-section lp-rsvp" id="rsvp-demo" aria-labelledby="rsvp-demo-title">
  <div class="lp-wrap lp-split">
    <div class="lp-split-copy">
      ${sectionHead("rsvp-demo", "02", RSVP.eyebrow, RSVP.h2, RSVP.lead)}
      <ul class="lp-ticks">${facts}</ul>
    </div>
    <div class="lp-paper lp-invite-mini">
      <div class="lp-demo-bar">${fictional}<span class="lp-demo-url" dir="ltr">/invite/…</span></div>
      <p class="lp-mini-kicker">${esc(COUPLE.a)} ו${esc(COUPLE.b)} מתחתנים</p>
      <p class="lp-mini-greet"><strong>${esc(first)},</strong> נשמח מאוד לחגוג איתכם.</p>
      <p class="lp-mini-date">${esc(COUPLE.weekday)}, ${esc(COUPLE.dateLong)} · ${COUPLE.reception}</p>
      <div class="lp-form" data-rsvp>
        <h3 class="lp-h3">נתראה ברחבה?</h3>
        <label class="lp-field" for="lp-count">כמה תגיעו? <select id="lp-count" class="lp-input">${options}</select></label>
        <label class="lp-field" for="lp-note">ברכה או הערה (לא חובה) <textarea id="lp-note" class="lp-input" rows="2" maxlength="200" placeholder="מזל טוב!"></textarea></label>
        <div class="lp-choice">
          <button type="button" class="lp-btn lp-btn-primary" data-answer="yes">מגיעים</button>
          <button type="button" class="lp-btn lp-btn-secondary" data-answer="no">לא מגיעים</button>
        </div>
        <p class="lp-status" id="lp-rsvp-status" role="status" aria-live="polite">עדיין לא עניתם. התשובה תופיע בדשבורד&nbsp;למטה.</p>
      </div>
    </div>
  </div>
</section>`;
}
