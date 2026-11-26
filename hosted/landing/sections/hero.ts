import { escapeHtml as esc } from "../../http";
import { HERO } from "../copy";
import { COUPLE } from "../data";
import { ctaRow } from "./header";

/** Envelope back, pocket and flap are inline SVG; only the flap and card move (transform/opacity). */
function envelope() {
  return `<div class="lp-env-stage">
  <div class="lp-env" data-env>
    <svg class="lp-env-back" viewBox="0 0 400 260" aria-hidden="true" focusable="false"><rect x="1" y="1" width="398" height="258" rx="6" fill="#efe4cc" stroke="#d6c49e"/></svg>
    <div class="lp-card" id="lp-card" role="group" aria-label="הזמנה לדוגמה">
      <div class="lp-card-in">
        <p class="lp-card-kicker">מתחתנים</p>
        <p class="lp-card-names"><span>${esc(COUPLE.a)}</span><span class="lp-amp" aria-hidden="true">&amp;</span><span class="lp-sr"> ו</span><span>${esc(COUPLE.b)}</span></p>
        <p class="lp-card-rule" aria-hidden="true"></p>
        <p class="lp-card-date"><time datetime="${COUPLE.date}">${esc(COUPLE.weekday)}, ${esc(COUPLE.dateLong)}</time></p>
        <p class="lp-card-meta">קבלת פנים ${COUPLE.reception} · חופה ${COUPLE.ceremony}</p>
        <p class="lp-card-meta">${esc(COUPLE.venue)}</p>
        <span class="lp-card-rsvp" aria-hidden="true">לאישור הגעה</span>
        <p class="lp-card-foot">הזמנה לדוגמה, נתונים בדויים</p>
      </div>
    </div>
    <svg class="lp-env-front" viewBox="0 0 400 260" aria-hidden="true" focusable="false">
      <path d="M1 120 L200 205 L399 120 L399 253 Q399 259 393 259 L7 259 Q1 259 1 253 Z" fill="#f6eedb" stroke="#d6c49e"/>
      <path d="M1 259 L170 150 M399 259 L230 150" stroke="#e2d3b0" fill="none"/>
    </svg>
    <div class="lp-env-flap" aria-hidden="true">
      <svg viewBox="0 0 400 150" preserveAspectRatio="none" focusable="false"><path d="M1 1 L399 1 L399 8 L200 148 L1 8 Z" fill="#f2e8d1" stroke="#d6c49e"/></svg>
    </div>
    <div class="lp-seal" aria-hidden="true">
      <svg viewBox="0 0 64 64" focusable="false">
        <defs><radialGradient id="lp-wax" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#2f6b55"/><stop offset="1" stop-color="#173a2e"/></radialGradient></defs>
        <path d="M32 3 C40 4 44 8 50 10 C57 14 61 22 60 30 C61 38 58 46 52 52 C46 58 38 61 31 60 C23 61 15 57 10 51 C5 45 3 38 4 31 C3 22 8 14 15 9 C20 5 26 3 32 3 Z" fill="url(#lp-wax)"/>
        <circle cx="32" cy="32" r="19" fill="none" stroke="#d9bf8c" stroke-width="1"/>
        <text x="32" y="38" text-anchor="middle" font-family="Frank Ruhl Libre, serif" font-size="17" fill="#f1e7d3">מ·ע</text>
      </svg>
    </div>
  </div>
  <button type="button" class="lp-env-btn" aria-expanded="false" aria-controls="lp-card" data-open="${esc(HERO.open)}" data-close="${esc(HERO.close)}">${esc(HERO.open)}</button>
</div>`;
}

export function hero(alert: string) {
  return `<section class="lp-hero" aria-labelledby="lp-h1">
  <div class="lp-wrap lp-hero-grid">
    <div class="lp-hero-copy">
      ${alert}
      <p class="lp-eyebrow">${esc(HERO.eyebrow)}</p>
      <h1 id="lp-h1" class="lp-h1">${esc(HERO.h1a)} <em>${esc(HERO.h1b)}</em></h1>
      <p class="lp-lead lp-hero-lead">${esc(HERO.lead)}</p>
      ${ctaRow()}
      <p class="lp-small">${esc(HERO.note)}</p>
    </div>
    ${envelope()}
  </div>
</section>`;
}
