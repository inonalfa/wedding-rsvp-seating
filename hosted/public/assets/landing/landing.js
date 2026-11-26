// RSVP Plus landing entry module. Dependency-free; no storage, no cookies, no network.
const body = document.body;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
body.dataset.js = "on";
const setMotion = () => { body.dataset.motion = reduce.matches ? "off" : "on"; };
setMotion();
reduce.addEventListener?.("change", setMotion);

// Envelope: the button owns state; the whole envelope proxies clicks to it.
const env = document.querySelector("[data-env]");
const envBtn = document.querySelector(".lp-env-btn");
const card = document.getElementById("lp-card");
function setEnvelope(open) {
  env.classList.toggle("is-open", open);
  envBtn.setAttribute("aria-expanded", String(open));
  envBtn.textContent = open ? envBtn.dataset.close : envBtn.dataset.open;
  card.toggleAttribute("inert", !open);
  card.setAttribute("aria-hidden", String(!open));
}
if (env && envBtn && card) {
  setEnvelope(false);
  envBtn.addEventListener("click", () => setEnvelope(envBtn.getAttribute("aria-expanded") !== "true"));
  env.addEventListener("click", () => envBtn.click());
  // Reduced motion: no animation to watch, so show the settled (open) state.
  if (reduce.matches) setEnvelope(true);
}

// Story: fragments settle once when they scroll into view. No scroll listeners, no pinning.
const frags = document.querySelector("[data-settle]");
if (frags) {
  if (body.dataset.motion !== "on" || !("IntersectionObserver" in window)) frags.classList.add("is-settled");
  else {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { frags.classList.add("is-settled"); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(frags);
  }
}

// Themes: native radios give arrow-key behaviour; swap the theme class on the real .inv element.
const themes = document.querySelector("[data-themes]");
const inv = document.querySelector("[data-inv]");
const themeStatus = document.getElementById("lp-theme-status");
themes?.addEventListener("change", e => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || !inv) return;
  const apply = () => {
    inv.classList.remove("theme-garden", "theme-night", "theme-blush");
    inv.classList.add("theme-" + input.value);
    inv.classList.remove("is-swapping");
  };
  if (themeStatus) themeStatus.textContent = "מוצגת ערכת " + input.nextElementSibling.textContent;
  if (body.dataset.motion === "on") {
    inv.classList.add("is-swapping");
    setTimeout(() => requestAnimationFrame(apply), 160);
  } else apply();
});

// Dashboard: collapse the guest list to 5 rows (CSS class, so it survives re-renders). No JS = full list.
const rowsEl = document.querySelector("[data-rows]");
const more = document.querySelector("[data-rows-more]");
if (rowsEl && more) {
  const setRows = open => {
    rowsEl.classList.toggle("is-collapsed", !open);
    more.setAttribute("aria-expanded", String(open));
    more.textContent = open ? more.dataset.less : more.dataset.more;
  };
  setRows(false);
  more.hidden = false;
  more.addEventListener("click", () => setRows(more.getAttribute("aria-expanded") !== "true"));
}

// Mobile sticky CTA: visible after the hero; hidden while the final band or footer is on screen,
// and while a demo card occupies the bottom band of the viewport (so it never covers live controls).
const sticky = document.querySelector("[data-sticky]");
const heroEl = document.querySelector(".lp-hero");
if (sticky && heroEl && "IntersectionObserver" in window) {
  const seen = new Set();
  const update = () => {
    const on = !seen.size;
    sticky.classList.toggle("is-on", on);
    sticky.toggleAttribute("inert", !on);
    body.classList.toggle("lp-has-sticky", on);
  };
  const track = e => { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); };
  const io = new IntersectionObserver(es => { es.forEach(track); update(); });
  for (const el of [heroEl, document.querySelector(".lp-final"), document.querySelector(".lp-footer")]) if (el) io.observe(el);
  const band = new IntersectionObserver(es => { es.forEach(track); update(); }, { rootMargin: "-78% 0px 0px 0px" });
  document.querySelectorAll("[data-demo-card]").forEach(el => band.observe(el));
}

// Demos: load lazily when the RSVP section approaches the viewport (or immediately without IO).
const main = document.getElementById("lp-main");
const demoRoot = document.getElementById("rsvp-demo");
let started = false;
const startDemos = () => {
  if (started || !main) return;
  started = true;
  import(new URL("./demos.js" + new URL(import.meta.url).search, import.meta.url).href).then(m => m.start(main));
};
if (demoRoot && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { io.disconnect(); startDemos(); }
  }, { rootMargin: "600px 0px" });
  io.observe(demoRoot);
  // Hash links straight into a demo should work too.
  window.addEventListener("hashchange", startDemos, { passive: true, once: true });
} else startDemos();
