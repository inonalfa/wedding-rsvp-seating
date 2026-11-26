import { escapeHtml as esc } from "../../http";
import { THEMES } from "../copy";
import { COUPLE } from "../data";
import { fictional, sectionHead } from "./header";

/** Mini invitation built from real invite.css classes, without nested main/header/footer or a second h1. */
function invitation() {
  return `<div class="inv theme-garden lp-inv" data-inv>
    <div class="inv-hero"><div class="inv-hero-inner">
      <p class="inv-kicker">מתחתנים</p>
      <p class="inv-names"><span>${esc(COUPLE.a)}</span><i aria-hidden="true">&amp;</i><span>${esc(COUPLE.b)}</span></p>
      <p class="inv-date"><time datetime="${COUPLE.date}">${esc(COUPLE.dateLong)}</time><span>${esc(COUPLE.weekday)}</span></p>
      <p class="inv-greeting">נשמח שתהיו חלק מהשמחה שלנו.</p>
    </div></div>
    <div class="inv-body">
      <div class="inv-section">
        <div class="inv-schedule"><div><time>${COUPLE.reception}</time><span>קבלת פנים</span></div><div><time>${COUPLE.ceremony}</time><span>חופה וקידושין</span></div></div>
      </div>
      <div class="inv-section inv-rsvp">
        <p class="lp-inv-h">נתראה ברחבה?</p>
        <div class="inv-choice"><span class="inv-btn">מאשרים הגעה</span><span class="inv-btn ghost">לא מגיעים</span></div>
      </div>
      <div class="inv-footer"><p>${esc(COUPLE.a)} &amp; ${esc(COUPLE.b)}</p></div>
    </div>
  </div>`;
}

export function themes() {
  const radios = THEMES.list.map((t, i) => `<label class="lp-pill lp-swatch-${t.id}"><input type="radio" name="lp-theme" value="${t.id}"${i === 0 ? " checked" : ""}><span><i class="lp-swatch" aria-hidden="true"></i>${esc(t.name)}</span></label>`).join("");
  return `<section class="lp-section lp-themes" id="invitation" aria-labelledby="invitation-title">
  <div class="lp-wrap lp-split lp-split-center">
    <div class="lp-split-copy">
      ${sectionHead("invitation", "04", THEMES.eyebrow, THEMES.h2, THEMES.lead)}
      <fieldset class="lp-pills" data-themes><legend class="lp-sr">ערכת עיצוב</legend>${radios}</fieldset>
      <p class="lp-sr" id="lp-theme-status" role="status" aria-live="polite">מוצגת ערכת גן ירוק</p>
    </div>
    <div class="lp-inv-frame" data-demo-card>
      <div class="lp-demo-bar">${fictional}</div>
      ${invitation()}
    </div>
  </div>
</section>`;
}
