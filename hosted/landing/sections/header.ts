import { escapeHtml as esc } from "../../http";
import { CTA, FOOTER } from "../copy";

export function cta(kind: "primary" | "secondary", extra = "") {
  const c = CTA[kind];
  return `<a class="lp-btn lp-btn-${kind}${extra ? " " + extra : ""}" href="${c.href}">${esc(c.label)}</a>`;
}

export function ctaRow(extra = "") {
  return `<div class="lp-cta-row${extra ? " " + extra : ""}">${cta("primary")}${cta("secondary")}</div>`;
}

export function header() {
  return `<header class="lp-header"><div class="lp-wrap lp-header-in">
  <a class="lp-brand" href="/"><img src="/assets/logo.webp" alt="אישור הגעה פלוס" width="160" height="94"></a>
  <nav class="lp-nav" aria-label="תפריט ראשי">
    <a class="lp-nav-link" href="${CTA.demoNav.href}">${esc(CTA.demoNav.label)}</a>
    <a class="lp-nav-link" href="${CTA.login.href}">${esc(CTA.login.label)}</a>
    ${cta("primary", "lp-btn-sm")}
  </nav>
</div></header>`;
}

export function footer() {
  const links = FOOTER.links.map(l => `<a href="${l.href}">${esc(l.label)}</a>`).join('<span aria-hidden="true">·</span>');
  return `<footer class="lp-footer"><div class="lp-wrap lp-footer-in">
  <img src="/assets/logo.webp" alt="" width="96" height="56" loading="lazy">
  <p>${esc(FOOTER.line)}</p>
  <p class="lp-footer-links">${links}</p>
</div></footer>`;
}

/** Visible "fictional data" tag on every demo. */
export const fictional = '<span class="lp-tag">נתונים בדויים</span>';

/** Numbered eyebrow ("01 · ..."): a narrative spine through the page, tabular figures. */
export function eyebrow(n: string, text: string) {
  return `<p class="lp-eyebrow"><span class="lp-eyebrow-n">${n}</span><span aria-hidden="true"> · </span>${esc(text)}</p>`;
}

export function sectionHead(id: string, n: string, text: string, h2: string, lead: string) {
  return `${eyebrow(n, text)}<h2 id="${id}-title" class="lp-h2">${esc(h2)}</h2><p class="lp-lead">${esc(lead)}</p>`;
}
