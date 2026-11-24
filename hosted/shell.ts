import { escapeHtml, page } from "./http";

const brand = '<a class="brand" href="/">אישור הגעה פלוס</a>';

/** The single-page app shell shared by the signed-in app and the local-only demo. */
export function appShell(mode: "app" | "demo") {
  const title = mode === "demo" ? "הדגמה - חתונה בקליק" : "ניהול האירוע - אישור הגעה פלוס";
  return new Response(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/invite.css"><script type="module" src="/assets/app.js"></script></head><body class="app-body"><div id="app" data-mode="${mode}"><div class="boot"><div class="spinner" aria-hidden="true"></div><p>טוענים…</p></div></div><noscript><p class="page-card">האפליקציה דורשת JavaScript.</p></noscript></body></html>`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function landingPage(error = "") {
  const alert = error ? `<p class="alert" role="alert">${escapeHtml(error)}</p>` : "";
  return page("אישור הגעה פלוס - הזמנות, אישורי הגעה והושבה", `
  <header class="site-bar landing-bar">${brand}
    <nav class="main-menu" aria-label="תפריט ראשי">
      <a href="#how">איך זה עובד</a>
      <a class="menu-demo" href="/demo">הדגמה</a>
      <a href="/auth/login">כניסה</a>
      <a class="btn primary small" href="/auth/signup">הרשמה בחינם</a>
    </nav>
  </header>
  <main class="landing">
    ${alert}
    <section class="landing-hero">
      <div>
        <p class="eyebrow">הזמנה דיגיטלית · אישורי הגעה · סידורי הושבה</p>
        <h1>כל החתונה שלכם,<br><em>במקום אחד.</em></h1>
        <p class="lead">יוצרים דף הזמנה מעוצב עם התמונות שלכם, שולחים לכל אורח קישור אישי בוואטסאפ, רואים מי מגיע בזמן אמת ומסדרים שולחנות בגרירה.</p>
        <div class="cta-row"><a class="btn primary" href="/auth/signup">מתחילים עכשיו</a><a class="btn ghost" href="/demo">לנסות בלי הרשמה</a></div>
        <p class="muted small">בהדגמה הנתונים נשמרים רק בדפדפן שלכם. נרשמים? הם עוברים איתכם לחשבון.</p>
      </div>
      <div class="landing-art" aria-hidden="true"><div class="phone"><div class="phone-hero"><span>דנה</span><i>&amp;</i><span>יואב</span></div><div class="phone-line"></div><div class="phone-line short"></div><div class="phone-btn">מאשרים הגעה</div></div></div>
    </section>
    <section class="steps" id="how" aria-labelledby="how-title">
      <h2 id="how-title">איך זה עובד</h2>
      <ol>
        <li><strong>פרטי האירוע</strong><span>שמות, תאריך, שעות, מקום ותמונות. רואים תצוגה מקדימה של ההזמנה תוך כדי.</span></li>
        <li><strong>רשימת מוזמנים</strong><span>מוסיפים ידנית, מדביקים מאקסל או מייבאים CSV. אפשר לחלק לקבוצות.</span></li>
        <li><strong>שליחה בוואטסאפ</strong><span>לכל אורח קישור אישי עם הודעה מוכנה. האורח מאשר בלחיצה.</span></li>
        <li><strong>מעקב והושבה</strong><span>מי אישר, מי לא ענה, ברכות והערות. מסדרים שולחנות ומדפיסים רשימה לכניסה.</span></li>
      </ol>
    </section>
    <section class="features">
      <div><h3>קישור אישי לכל אורח</h3><p>חתום ומוגבל בזמן. אפשר לבטל קישור בודד בכל רגע.</p></div>
      <div><h3>חיפוש שולחן לצוות</h3><p>קישור זמני לדלפק הכניסה שמחזיר רק מספר שולחן.</p></div>
      <div><h3>פרטיות</h3><p>אין פרסומות ואין מעקב. הנתונים נמחקים אוטומטית 90 יום אחרי האירוע.</p></div>
    </section>
  </main>
  <footer class="site-footer"><p>שירות חינמי, ללא פרסומות וללא התחייבות לזמינות.</p><p><a href="/privacy">פרטיות</a> · <a href="/terms">תנאי שימוש</a></p></footer>`, 200, false, false, { bare: true, bodyClass: "landing-page" });
}
