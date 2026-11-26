import { escapeHtml as esc, page } from "../http";
import { DESCRIPTION, HERO, OG_TITLE, TITLE } from "./copy";
import { GUESTS, RSVP_GUEST_ID, TABLES, RECENT } from "./data";
import { LANDING_VERSION as V } from "./version";
import { cta, ctaRow, footer, header } from "./sections/header";
import { hero } from "./sections/hero";
import { story } from "./sections/story";
import { rsvpDemo } from "./sections/rsvp";
import { seating } from "./sections/seating";
import { themes } from "./sections/themes";
import { dashboard } from "./sections/dashboard";
import { finalCta, trust } from "./sections/trust";

const STYLES = ["landing-base.css", "landing-sections.css", "landing-motion.css"];

export function landingHead(origin: string) {
  const o = origin.replace(/\/+$/, "");
  const abs = o ? [
    `<link rel="canonical" href="${esc(o)}/">`,
    `<meta property="og:url" content="${esc(o)}/">`,
    `<meta property="og:image" content="${esc(o)}/assets/landing/og.png">`,
    `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(OG_TITLE)}">`,
  ] : [];
  return [
    `<meta name="description" content="${esc(DESCRIPTION)}">`,
    `<meta name="theme-color" content="#faf6ee">`,
    `<meta property="og:type" content="website"><meta property="og:locale" content="he_IL">`,
    `<meta property="og:site_name" content="אישור הגעה פלוס">`,
    `<meta property="og:title" content="${esc(OG_TITLE)}">`,
    `<meta property="og:description" content="${esc(DESCRIPTION)}">`,
    ...abs,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<link rel="preload" href="/fonts/frank-ruhl-libre.woff" as="font" type="font/woff" crossorigin>`,
    `<link rel="stylesheet" href="/assets/invite.css">`,
    ...STYLES.map(s => `<link rel="stylesheet" href="/assets/landing/${s}?v=${V}">`),
    `<noscript><link rel="stylesheet" href="/assets/landing/nojs.css?v=${V}"></noscript>`,
    `<script type="module" src="/assets/landing/landing.js?v=${V}"></script>`,
  ].join("");
}

/** Initial demo state for landing.js, carried in a data attribute (no inline script, CSP-neutral). */
export function demoState() {
  return JSON.stringify({ guests: GUESTS, tables: TABLES, recent: RECENT, rsvpGuest: RSVP_GUEST_ID });
}

export function landingMarkup(error: string) {
  const alert = error ? `<p class="lp-alert" role="alert">${esc(error)}</p>` : "";
  return `<a class="lp-skip" href="#lp-main">דלגו לתוכן</a>
${header()}
<main id="lp-main" class="lp-main" data-demo="${esc(demoState())}">
${hero(alert)}
<div class="lp-chapters">
${story()}
${rsvpDemo()}
${seating()}
${themes()}
${dashboard()}
<div class="lp-wrap lp-after-demos"><p class="lp-small lp-after-note">${esc(HERO.note)}</p>${ctaRow("lp-cta-center lp-cta-stack")}</div>
${trust()}
</div>
${finalCta()}
</main>
<aside class="lp-sticky" aria-label="פעולה מהירה" data-sticky inert>${cta("primary")}</aside>
${footer()}`;
}

export function renderLanding(error: string, origin: string): Response {
  return page(TITLE, landingMarkup(error), 200, false, false, { bare: true, bodyClass: "landing-page", selfScript: true, head: landingHead(origin) });
}
