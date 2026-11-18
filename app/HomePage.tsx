"use client";
import { eventConfig, eventDate, eventDateSpaced, eventHosts, eventMonth, eventWeekday, eventMapUrl } from "@/lib/event-config";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import RSVPForm, { wazeUrl, type InviteDetails, type InviteStatus } from "./rsvp-form";
import { Icon, Monogram } from "./wedding-icons";
import HeartHome from "./heart-home";

const weddingDate = new Date(eventConfig.start);

function CountdownStrip() {
  const [remaining, setRemaining] = useState<number[] | null>(null);
  useEffect(() => {
    function update() {
      const distance = Math.max(0, weddingDate.getTime() - Date.now());
      setRemaining([Math.floor(distance / 86_400_000), Math.floor(distance / 3_600_000) % 24, Math.floor(distance / 60_000) % 60, Math.floor(distance / 1_000) % 60]);
    }
    update();
    const interval = window.setInterval(() => { if (!document.hidden) update(); }, 1000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <div className="countdown" role="timer" aria-label="ספירה לאחור לחתונה" aria-live="off" dir="ltr">{["ימים", "שעות", "דקות", "שניות"].map((label, index) => <Fragment key={label}><div className="countdown-unit"><span className="countdown-number"><strong key={remaining?.[index] ?? "waiting"}>{remaining ? String(remaining[index]).padStart(2, "0") : "··"}</strong></span><span className="countdown-label">{label}</span></div>{index < 3 && <span className="countdown-separator" aria-hidden="true">:</span>}</Fragment>)}</div>;
}

function OpeningMoment() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try { seen = window.sessionStorage.getItem("oy-welcome-seen") === "1"; window.sessionStorage.setItem("oy-welcome-seen", "1"); } catch { /* The opening still works when storage is unavailable. */ }
    if (seen || reduced || window.location.hash) setVisible(false);
    const timeout = window.setTimeout(() => setVisible(false), 1400);
    return () => window.clearTimeout(timeout);
  }, []);
  if (!visible) return null;
  return <div className="opening-scene" aria-hidden="true" onAnimationEnd={event => { if (event.target === event.currentTarget) setVisible(false); }}><div className="opening-mark"><Monogram /><span>{eventDateSpaced}</span><div className="opening-line" /></div></div>;
}

function InvitationCard() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousOverflow = useRef("");
  function open() {
    if (!dialog.current?.showModal) return;
    previousOverflow.current = document.body.style.overflow;
    dialog.current.showModal();
    document.body.style.overflow = "hidden";
  }
  function close() { dialog.current?.close(); }
  function restore() { document.body.style.overflow = previousOverflow.current; trigger.current?.focus({ preventScroll: true }); }
  useEffect(() => () => { if (dialog.current?.open) document.body.style.overflow = previousOverflow.current; }, []);
  return <>
    <figure className="invitation-card" data-reveal>
      <button ref={trigger} className="invitation-button" type="button" onClick={open} aria-label="פתיחת ההזמנה בגודל מלא">
        <Image src="/demo-invitation.svg" alt={`ההזמנה לחתונה של ${eventHosts}, ${eventDate}`} width={1024} height={1536} unoptimized sizes="(max-width: 700px) 78vw, 360px" />
        <span className="invitation-zoom">מבט מקרוב <Icon name="external" /></span>
      </button>
      <figcaption><span className="fine-line" />ההזמנה שלכם לערב שלנו<span className="fine-line" /></figcaption>
    </figure>
    <dialog className="invitation-dialog" ref={dialog} onClose={restore} onClick={event => { if (event.target === event.currentTarget) close(); }} aria-label="הזמנת החתונה בגודל מלא"><button type="button" className="dialog-close" onClick={close} aria-label="סגירת ההזמנה"><Icon name="close" /></button><Image src="/demo-invitation.svg" alt={`הזמנת החתונה המלאה של ${eventHosts}`} width={1024} height={1536} unoptimized loading="lazy" /></dialog>
  </>;
}

function VenueMap() {
  const [loaded, setLoaded] = useState(false);
  return <div className={`venue-map ${loaded ? "is-loaded" : ""}`}>
    {!loaded && <div className="map-loading" aria-hidden="true"><Icon name="pin" /><span>{eventConfig.venue} · {eventConfig.address}</span></div>}
    <iframe title={`מפת הגעה אל ${eventConfig.venue}`} src={eventMapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" onLoad={() => setLoaded(true)} allowFullScreen />
  </div>;
}

type DemoLinks = { inviteHref: string; tableSearchPublic: boolean };

function DemoTryBox({ links }: { links: DemoLinks }) {
  return <aside className="demo-try" aria-labelledby="demo-try-title">
    <div><p className="eyebrow">סביבת הדגמה פתוחה</p><h2 id="demo-try-title">נסו את המערכת</h2><p>כל השמות והנתונים בדמו פיקטיביים. אפשר למלא אישור הגעה ולחזור על התהליך בלי לפגוע במבקר הבא.</p></div>
    <nav aria-label="קישורי התנסות בדמו">
      <a className="demo-try-primary" href={links.inviteHref}>פתיחת הזמנה אישית לדוגמה <Icon name="arrow" /></a>
      {links.tableSearchPublic
        ? <a href="/find-table">חיפוש שולחן בעברית <Icon name="external" /></a>
        : <span>חיפוש השולחן מוגן בסיסמת צוות</span>}
      <a href="/admin">ניהול - הסיסמה זמינה לפי בקשה <Icon name="external" /></a>
    </nav>
  </aside>;
}

export default function Home({ demoLinks }: { demoLinks?: DemoLinks }) {
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>("loading");
  const [inviteAttempt, setInviteAttempt] = useState(0);
  const [saved, setSaved] = useState(false);
  const [dockVisible, setDockVisible] = useState(false);
  const root = useRef<HTMLElement>(null);
  const nav = useRef<HTMLElement>(null);
  const heroImage = useRef<HTMLDivElement>(null);
  const heroButton = useRef<HTMLAnchorElement>(null);
  const formPanel = useRef<HTMLDivElement>(null);
  const saveComplete = useCallback(() => setSaved(true), []);

  useEffect(() => {
    const queryToken = new URLSearchParams(window.location.search).get("invite")?.trim();
    const shortPathMatch = window.location.pathname.match(/^\/i\/([^/]+)\/?$/);
    let pathToken = "";
    try { if (shortPathMatch) pathToken = decodeURIComponent(shortPathMatch[1]).trim(); } catch { setInviteStatus("error"); return; }
    const token = queryToken || pathToken;
    if (!token) { setInviteStatus("general"); return; }
    setInviteStatus("loading");
    let active = true;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 12_000);
    fetch(`/api/invite?token=${encodeURIComponent(token)}`, { cache: "no-store", signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Invitation could not be loaded");
        return await response.json() as Omit<InviteDetails, "token">;
      })
      .then(details => {
        if (!active) return;
        setInvite({ ...details, token }); setInviteStatus("ready");
        const sessionKey = `invite-open:${details.inviteId}`;
        let recorded = false;
        try { recorded = Boolean(window.sessionStorage.getItem(sessionKey)); } catch { /* Do not block invitations in private browsers. */ }
        if (!recorded) void fetch("/api/invite/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inviteToken: token }), keepalive: true }).then(response => { if (response.ok) { try { window.sessionStorage.setItem(sessionKey, "1"); } catch { /* Storage is optional. */ } } }).catch(() => undefined);
      })
      .catch(() => { if (active) setInviteStatus("error"); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; abort.abort(); window.clearTimeout(timeout); };
  }, [inviteAttempt]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 901px) and (pointer: fine)");
    let frame = 0;
    function updateAnchorOffset() {
      if (nav.current && root.current) root.current.style.setProperty("--anchor-offset", `${Math.ceil(nav.current.getBoundingClientRect().bottom + 12)}px`);
    }
    const navObserver = typeof ResizeObserver === "function" ? new ResizeObserver(updateAnchorOffset) : null;
    if (nav.current) navObserver?.observe(nav.current);
    updateAnchorOffset();
    function update() {
      frame = 0;
      const y = window.scrollY;
      nav.current?.classList.toggle("is-scrolled", y > 40);
      if (heroImage.current) heroImage.current.style.setProperty("--parallax", !reduced.matches && desktop.matches ? `${Math.min(y * .085, 64)}px` : "0px");
    }
    function schedule() { if (!frame) frame = window.requestAnimationFrame(update); }
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("resize", updateAnchorOffset, { passive: true });
    reduced.addEventListener("change", schedule);
    return () => { window.cancelAnimationFrame(frame); navObserver?.disconnect(); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); window.removeEventListener("resize", updateAnchorOffset); reduced.removeEventListener("change", schedule); };
  }, []);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-reveal]") ?? []);
    const observer = new IntersectionObserver(entries => { for (const entry of entries) { if (entry.isIntersecting) { entry.target.classList.remove("reveal-pending"); entry.target.classList.add("is-revealed"); observer.unobserve(entry.target); } } }, { threshold: .08 });
    if (!reduced.matches) for (const element of elements) { if (element.getBoundingClientRect().top > window.innerHeight) { element.classList.add("reveal-pending"); observer.observe(element); } }
    function clearMotion() { if (reduced.matches) { elements.forEach(element => element.classList.remove("reveal-pending")); observer.disconnect(); } }
    reduced.addEventListener("change", clearMotion);
    let heroVisible = true;
    let formVisible = false;
    const dockObserver = new IntersectionObserver(entries => {
      for (const entry of entries) { if (entry.target === heroButton.current) heroVisible = entry.isIntersecting; if (entry.target === formPanel.current) formVisible = entry.isIntersecting; }
      setDockVisible(!heroVisible && !formVisible && window.scrollY > 200);
    });
    if (heroButton.current) dockObserver.observe(heroButton.current);
    if (formPanel.current) dockObserver.observe(formPanel.current);
    return () => { observer.disconnect(); dockObserver.disconnect(); reduced.removeEventListener("change", clearMotion); };
  }, []);

  return <main className="wedding-site" dir="rtl" ref={root}>
    <a className="skip-link" href="#rsvp-form">דילוג לטופס אישור ההגעה</a>
    <OpeningMoment />
    {demoLinks && <DemoTryBox links={demoLinks} />}
    <header className="floating-nav" ref={nav}>
      <a className="brand-link" href="#top" aria-label={`${eventHosts}, חזרה לראש העמוד`}><Monogram /></a>
      <nav className="nav-links" aria-label="ניווט בהזמנה"><a href="#celebrate">הערב שלנו</a><a href="#directions">איך מגיעים</a></nav>
      <a className="nav-cta" href="#rsvp">{saved ? "עדכון האישור" : "אישור הגעה"}<Icon name="external" /></a>
    </header>

    <section className="hero" id="top" aria-labelledby="wedding-title">
      <div className="hero-layout">
        <div className="hero-content">
          <p className="hero-kicker"><span />WE’RE GETTING MARRIED<span /></p>
          <h1 id="wedding-title" className="hero-names" aria-label={`${eventHosts} מתחתנים`}><span>{eventConfig.hosts[0]}</span><i aria-hidden="true">&amp;</i><span>{eventConfig.hosts[1]}</span></h1>
          <HeartHome />
          <p className="hero-date"><time dateTime={eventConfig.date}>{eventDate}</time><span />{eventWeekday}</p>
          <p className="personal-greeting" aria-live="polite">{invite ? <><strong>{invite.firstName},</strong> הערב שלנו לא יהיה אותו דבר בלעדיכם.</> : "נשמח שתהיו חלק מהערב שלנו."}</p>
          <a className="hero-button" href="#rsvp" ref={heroButton}><span>מאשרים ומתחילים להתרגש</span><span className="button-icon"><Icon name="arrow" /></span></a>
          <p className="hero-venue">{eventConfig.venue} · {eventConfig.address} · קבלת פנים ב-19:30</p>
        </div>
        <div className="hero-image-shell">
          <div className="hero-image-motion" ref={heroImage}><Image className="hero-image" src="/demo-hero.svg" sizes="(max-width: 900px) 100vw, 52vw" width={2048} height={1243} alt="איור חגיגי לדוגמה" priority unoptimized /></div>
          <div className="hero-image-shade" />
          <div className="hero-image-caption"><span>THE NEXT CHAPTER</span><span>{eventConfig.monogram[0]} &amp; {eventConfig.monogram[1]}</span></div>
        </div>
      </div>
      <a className="scroll-cue" href="#celebrate"><span>עוד קצת מהערב שלנו</span><Icon name="down" /></a>
      <span className="hero-edition" aria-hidden="true">TOGETHER, ALWAYS.</span>
    </section>

    <section className="celebration-section" id="celebrate" aria-labelledby="celebration-title">
      <div className="section-heading" data-reveal><span className="editorial-index" aria-hidden="true">01 / THE CELEBRATION</span><p className="eyebrow">הרגע שלנו מתקרב</p><h2 id="celebration-title">ערב אחד.<br /><em>כל האנשים שאנחנו אוהבים.</em></h2><p className="section-intro">נשמח שתהיו איתנו ברגע שבו שני סיפורים הופכים לסיפור אחד. ערב של אהבה, אוכל טוב ורחבה שלא מתכוונת לנוח.</p></div>
      <div className="celebration-grid">
        <div className="event-copy" data-reveal>
          <p className="eyebrow">שמרו לנו את התאריך</p>
          <div className="event-date" dir="ltr"><span className="event-day">{eventConfig.date.slice(8)}</span><div><span>{eventMonth}</span><strong>{eventConfig.date.slice(0,4)}</strong><span>{eventWeekday}</span></div></div>
          <div className="event-location"><Icon name="pin" /><div><strong>{eventConfig.venue}</strong><span>{eventConfig.address}</span></div></div>
          <div className="event-schedule"><div><time>19:30</time><span>קבלת פנים</span></div><span className="schedule-line" aria-hidden="true" /><div><time>20:30</time><span>חופה וקידושין</span></div></div>
          <div className="parents-credit" aria-label="הורי הכלה והחתן">
            <div><span>הורי הכלה</span><strong>משפחת הכלה</strong></div>
            <span className="parents-divider" aria-hidden="true" />
            <div><span>הורי החתן</span><strong>משפחת החתן</strong></div>
          </div>
          <div className="countdown-wrap"><p>סופרים את הרגעים עד שניפגש</p><CountdownStrip /></div>
          <a className="calendar-button" href="/api/calendar"><Icon name="calendar" /><span>הוספה ליומן</span><Icon name="external" /></a>
        </div>
        <div className="invitation-stage"><Image className="stationery-background" src="/demo-texture.svg" alt="" fill unoptimized sizes="(max-width: 700px) 100vw, 55vw" /><InvitationCard /></div>
      </div>
    </section>

    {inviteStatus !== "loading" && !invite?.hideAdultsNote && <section className="adults-note" id="rsvp" aria-label="אירוע למבוגרים בלבד"><Icon name="heart" /><p>אנחנו מאוד אוהבים את ילדיכם,<br className="mobile-break" /> אך בחרנו לחגוג באירוע למבוגרים בלבד</p></section>}

    <section className="rsvp-section" id={inviteStatus === "loading" || invite?.hideAdultsNote ? "rsvp" : undefined} aria-labelledby="rsvp-title">
      <div className="rsvp-panel" id="rsvp-form" ref={formPanel}>
        <div className="rsvp-heading"><span className="editorial-index" aria-hidden="true">02 / RÉPONDEZ S’IL VOUS PLAÎT</span><p className="eyebrow">רק עוד פרט קטן</p><h2 id="rsvp-title">{invite && <span className="rsvp-personal-name">{invite.firstName},</span>} נתראה ברחבה?</h2><p>מלאו את הפרטים ועדכנו אותנו מי מגיע.</p></div>
        <RSVPForm invite={invite} inviteStatus={inviteStatus} retryInvite={() => setInviteAttempt(value => value + 1)} onSaved={saveComplete} />
      </div>
      <div className="rsvp-art"><div className="rsvp-art-topline"><span>WITH LOVE</span><Monogram /></div><div className="rsvp-art-image" data-reveal><Image src="/demo-couple.svg" alt={`איור הזוג בריקוד החתונה, ${eventHosts}`} width={1350} height={900} unoptimized sizes="(max-width: 900px) 100vw, 45vw" /></div><p className="rsvp-art-caption">על הרחבה, ובכל מה שיבוא אחריה.</p><span className="rsvp-art-date" dir="ltr">{eventDateSpaced}</span></div>
    </section>

    <footer className="wedding-footer">
      <div className="footer-message" data-reveal><span className="editorial-index" aria-hidden="true">OUR FOREVER STARTS HERE</span><h2>כל מה שחסר,<br /><em>זה אתם.</em></h2><p>מחכים לחגוג איתכם</p><Monogram className="footer-monogram" /><span className="footer-date" dir="ltr">{eventDateSpaced}</span></div>
      <section className="venue-section" id="directions" aria-labelledby="venue-title"><div className="venue-copy"><div><p className="eyebrow">הדרך אל הרחבה</p><h2 id="venue-title">נפגשים ב{eventConfig.venue}.</h2><address>{eventConfig.address}</address></div><div className="venue-actions"><a className="waze-button" href={wazeUrl} target="_blank" rel="noreferrer"><Icon name="pin" /><span>ניווט עם Waze</span><Icon name="external" /></a><a className="venue-calendar" href="/api/calendar"><Icon name="calendar" /> שמירת התאריך ביומן</a></div></div><VenueMap /></section>
    </footer>
    <div className={`mobile-rsvp-dock ${dockVisible ? "is-visible" : ""}`} inert={!dockVisible} aria-hidden={!dockVisible}><div><span>{eventConfig.hosts[0]} &amp; {eventConfig.hosts[1]}</span><time dateTime={eventConfig.date} dir="ltr">{eventDate}</time></div><a href="#rsvp">{saved ? "עדכון האישור" : "אישור הגעה"}<Icon name="arrow" /></a></div>
  </main>;
}
