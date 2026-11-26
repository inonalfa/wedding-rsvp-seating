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
    }, { threshold: 0.3 });
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
