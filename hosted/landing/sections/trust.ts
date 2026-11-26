import { escapeHtml as esc } from "../../http";
import { FAQ, FINAL, TRUST } from "../copy";
import { ctaRow, eyebrow } from "./header";

export function trust() {
  const limits = TRUST.limits.map(l => `<li>${esc(l)}</li>`).join("");
  const privacy = TRUST.privacy.map(l => `<li>${esc(l)}</li>`).join("");
  const faq = FAQ.map(f => `<details class="lp-faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}${f.link ? ` <a href="${f.link.href}">${esc(f.link.label)}</a>` : ""}</p></details>`).join("");
  return `<section class="lp-section lp-trust" id="free" aria-labelledby="free-title">
  <div class="lp-wrap">
    <div class="lp-trust-grid">
      <div class="lp-why">
        ${eyebrow("06", TRUST.eyebrow)}
        <h2 id="free-title" class="lp-h2">${esc(TRUST.h2)}</h2>
        <p class="lp-why-line">${esc(TRUST.why)}</p>
      </div>
      <div class="lp-ledger">
        <div class="lp-ledger-col">
          <h3 class="lp-h3">${esc(TRUST.limitsTitle)}</h3>
          <ul class="lp-ticks">${limits}</ul>
          <p><a class="lp-text-link" href="/capacity">${esc(TRUST.capacity)}</a></p>
        </div>
        <div class="lp-ledger-col">
          <h3 class="lp-h3">${esc(TRUST.privacyTitle)}</h3>
          <ul class="lp-ticks">${privacy}</ul>
          <p><a class="lp-text-link" href="/privacy">מדיניות הפרטיות</a></p>
        </div>
      </div>
    </div>
    <div class="lp-faq" id="faq">
      <h2 class="lp-h2 lp-h2-sm">שאלות נפוצות</h2>
      ${faq}
    </div>
  </div>
</section>`;
}

export function finalCta() {
  return `<section class="lp-final" id="start" aria-labelledby="start-title">
  <div class="lp-wrap lp-final-in">
    <span class="lp-ornament" aria-hidden="true"></span>
    <h2 id="start-title" class="lp-h2">${esc(FINAL.h2)}</h2>
    <p class="lp-lead">${esc(FINAL.lead)}</p>
    ${ctaRow("lp-cta-center lp-cta-stack")}
  </div>
</section>`;
}
