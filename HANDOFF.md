# הנדאוף: מערכת RSVP והושבה לחתונה

מסמך זה מיועד למפתח או לסוכן AI שנכנס לפרויקט מההתחלה. הוא מתאר את המבנה, את כללי העבודה ואת המצב הכללי של הפריסה. פרטי תשתית מזהים ומצב תפעולי פנימי מופיעים רק בגרסת ההנדאוף המלאה מחוץ לריפו.
עודכן ב-26.11.2026 (Asia/Jerusalem), על בסיס `main` ב-commit `f55bb59` (מיזוג [PR #30](https://github.com/inonalfa/wedding-rsvp-seating/pull/30)), ומסמכי הריפו, `docs/`, הגדרות Wrangler והמיגרציות.

**אזהרה:** במסמך זה מופיעים שמות של secrets ושל משתני סביבה שכבר גלויים בריפו הציבורי, לא הערכים עצמם. לעולם לא להדפיס, לשמור בצ'אט או להעתיק ל-commit את ערכי ה-secrets. גרסת ההנדאוף המלאה נשמרת מחוץ לריפו בלבד, ולא לבצע לה commit.

---

## 1. סקירה כללית ושלוש המהדורות

הריפו הציבורי: [inonalfa/wedding-rsvp-seating](https://github.com/inonalfa/wedding-rsvp-seating).
בעלים: ינון אלפנדרי (Inon Alfandari), alfa digital.

יש שלוש מהדורות נפרדות. אסור לערבב ביניהן D1, secrets, דומיינים או פקודות deploy.

### 1.1 דמו בדיוני - לעולם לא לגעת

- כתובת מוכרת: [https://wedding.hamisrd.co.il](https://wedding.hamisrd.co.il) (וגם `https://wedding-rsvp-seating-demo.inonalfa.workers.dev`).
- Worker: `wedding-rsvp-seating-demo` (זה גם השם ב-`wrangler.jsonc` בראש הריפו).
- D1: `wedding-rsvp-seating-demo`. בקונפיג המחויב עדיין מופיע placeholder (`site-creator-d1` / `00000000-0000-4000-8000-000000000000`); ה-binding החי הוא המזהה האמיתי, לא ה-placeholder. (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)
- מצב: `DEMO_MODE=1`, נתונים בדיוניים, באנר דמו בכל עמוד. Cron: `17 3 * * *`.
- **לעולם לא לגעת** ב-Worker הזה, בדומיין שלו, ב-D1 שלו, ב-secrets שלו, או להריץ `wrangler deploy` / `vinext deploy` / `secret put` / `d1 migrations apply` בלי `--env event` או בלי `--config` שמצביע במפורש למהדורה אחרת. deploy לא מוכוון מהקובץ בראש הריפו עלול לדרוס את הדמו.

### 1.2 שירות hosted מרובה-זוגות - באוויר

- מותג: **אישור הגעה פלוס**.
- כתובת: [https://rsvp.hamisrd.co.il](https://rsvp.hamisrd.co.il).
- Worker: `wedding-rsvp-seating-hosted` (קונפיג: `hosted/wrangler.jsonc`).
- Custom domain: `rsvp.hamisrd.co.il`. מזהי חשבון, zone, דומיין ו-D1 החיים אינם מתועדים כאן. (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)
- D1: `wedding-rsvp-seating-hosted`, binding בשם `HOSTED_DB`. בקונפיג המחויב מופיע placeholder ל-`database_id`.
- Cron: `7 * * * *` (מחיקת אירועים שפג תוקפם + צילום שימוש).
- בקונפיג המחויב `workers_dev` עדיין פעיל. כניסה עם Google עובדת רק על דומיין `rsvp`.

### 1.3 אירוע אמיתי מתוכנן (עדיין לא הוקם)

יש תוכנית מחוץ לריפו להקים Worker עצמאי לאירוע אמיתי תחת Wrangler env בשם `event`. (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)

- שם הסקריפט המתוכנן: `wedding-rsvp-seating` (לא שם הדמו).
- D1 חדש בשם `wedding-rsvp-seating` (לא דמו, לא hosted).
- מצב: `DEMO_MODE=0`, `AUTH_MODE=basic`, `REQUIRE_INVITE_TOKEN=1`.
- בסוף התהליך, ורק אחרי אישור מפורש, אפשר לשייך את `wedding.hamisrd.co.il` ל-Worker הזה.

**כל פקודה למהדורה הזו חייבת לכלול `--env event`.** בלי זה Wrangler כותב לדמו החי. לא להריץ את הצעדים האלה כחלק מעבודת ה-hosted, ולא בלי אישור מפורש למיזוג/deploy/cutover.

---

## 2. סטאק

- **Standalone / דמו:** Next.js 16 (`16.2.6`) + React 19, נבנה ל-Cloudflare Workers באמצעות **vinext** (`0.0.50`) ו-Vite. נקודת כניסה: `worker/index.ts`. אחסון: D1 דרך Drizzle (`db/`, מיגרציות ב-`drizzle/`).
- **Hosted:** Worker עצמאי ב-TypeScript תחת `hosted/` (לא vinext). נכסים סטטיים מ-`hosted/public` דרך Workers Assets. D1 נפרד, מיגרציות SQL ידניות ב-`hosted/migrations/`.
- **כלי פריסה:** Wrangler `4.92.0`. Node.js `>=22.13.0`.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) מריץ typecheck, lint, unit tests, `deploy-hosted.mjs --dry-run`, ו-Playwright e2e על דמו בדיוני. הריפו **לא** מפריס מ-Actions. הפריסה ל-production היא ידנית מהמחשב המקומי, ורק אחרי אישור.

---

## 3. מבנה הריפו

| נתיב | תפקיד |
| --- | --- |
| `app/`, `lib/`, `config/event.ts`, `worker/index.ts` | מהדורת standalone / דמו (Next.js) |
| `db/`, `drizzle/` | סכמת Drizzle ומיגרציות ל-standalone/דמו |
| `hosted/` | מהדורת השירות המרובה-זוגות: Worker, UI סטטי, מיגרציות, `wrangler.jsonc` |
| `hosted/feedback.ts`, `hosted/migrations/0010_feedback.sql` | טופס פידבק, שליחת מייל ופתיחת אישו |
| `hosted/legal.ts` | עמודי `/privacy` ו-`/terms` |
| `hosted/auth.ts` | Google OAuth (PKCE), סשנים, logout |
| `hosted/password.ts` | כניסת סיסמה (כבויה כברירת מחדל), כולל Turnstile |
| `hosted/invites.ts` | הזמנות אורחים ו-RSVP, כולל Turnstile |
| `hosted/usage.ts` | צילום שימוש שעתי ושער ליצירת אירועים |
| `hosted/abuse.ts` | Turnstile widget / siteverify ומגבלות קצב |
| `scripts/deploy-hosted.mjs` | סקריפט פריסה אוטומטי ל-hosted (כרגע לא בשימוש בפועל) |
| `scripts/setup-demo.mjs` | יצירת `.dev.vars` מקומי לדמו |
| `docs/` | מדריכי הפעלה, אבטחה, retention, webhooks |
| `docs/hosted-deploy.md`, `docs/hosted-launch-he.md`, `docs/hosted-service-plan.md` | תכנון והפעלת hosted. שימו לב: חלק מהמסמכים קודמים ל-PR #29 (עדיין מזכירים Turnstile במסך Google) |
| `tests/` | בדיקות יחידה (כולל `hosted-*.test.mjs`) |
| `e2e/` | Playwright לדמו ול-hosted |
| `wrangler.jsonc` | קונפיג הדמו בלבד |
| `.dev.vars`, `.dev.vars.example`, `.env.example` | מקומי / דוגמאות. **לא לרוץ `type` / `cat` על `.dev.vars` ולא לבצע commit אליו** |

עבודת קוד מתבצעת ב-checkout מקומי של הריפו אצל המפעיל. לפני שינוי: `git pull origin main` מתוך תיקיית העבודה. לא לשכפל את הריפו למכונה אחרת אם כבר יש checkout מעודכן שם. נתיב העבודה המקומי: (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)

---

## 4. פיתוח מקומי ובדיקות

דרישות: Node.js 22.13+, npm, וב-Windows מעטפת שיכולה להריץ `bash` (Git Bash או WSL) עבור `npm run lint`, `npm test` וסקריפטי build.

```sh
npm ci
npm run demo:setup
npx wrangler d1 migrations apply site-creator-d1 --local
npm run dev
```

`demo:setup` יוצר credentials זמניים ב-`.dev.vars` (קובץ ב-gitignore) ולא דורס קובץ קיים. שם המשתמש לאדמין ולצוות: `admin`. הסיסמאות נוצרות מקומית; לא לתעד אותן כאן.

בדיקות:

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium   # פעם אחת לפני e2e
npm run test:e2e
```

`npm test` מריץ קודם build ואחר כך את בדיקות היחידה. בדיקות ה-hosted רצות מתוך `tests/hosted-*.test.mjs` מול המודולים, בלי צורך בפריסה.

אין להעלות ל-CI או ל-commit ייצוא אורחים אמיתי, קישורים להזמנות, endpoints של webhooks, או קבצי D1.

---

## 5. פריסת Hosted בפועל (ידנית)

הפריסות החיות נעשות **ידנית** מול Worker בשם `wedding-rsvp-seating-hosted`, לא דרך `node scripts/deploy-hosted.mjs`.

### 5.1 למה הסקריפט האוטומטי לא בשימוש

1. הוא דורש `CLOUDFLARE_API_TOKEN` עם ההרשאות המתוארות ב-`scripts/deploy-hosted.mjs` וב-`docs/hosted-deploy.md`, וגם `HOSTED_FREE_CONFIRMED=1`. הפריסה בפועל נעשית ידנית ולא דרך הסקריפט.
2. הסקריפט כולל בדיקות חשבון נוספות שעלולות לחסום פריסה גם כשתוכנית Workers היא Free. פירוט החריגות התפעוליות: (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)
3. הסקריפט עדיין שימושי ל-`--dry-run` מקומי (גם CI מריץ אותו כך), והוא כן מקבל את `HOSTED_ORIGIN=https://rsvp.hamisrd.co.il` אחרי [PR #26](https://github.com/inonalfa/wedding-rsvp-seating/pull/26).

### 5.2 עקרונות לפריסה ידנית

- תמיד `--config hosted/wrangler.jsonc` (או עותק זמני שלו). בלי זה הפקודה עלולה לכוון ל-`wedding-rsvp-seating-demo`.
- `wrangler deploy` מחליף את כל משתני ה-vars לפי הקונפיג שמועבר לו. לפני כל פריסה יש לאשר ב-Cloudflare Dashboard (Worker Settings) אילו vars כבר מוגדרים, כדי לא לאבד ערכים קיימים. לא להדפיס secrets. רשימת ה-vars החיים: (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)
- לא לשים secrets בתוך קובץ הקונפיג. secrets כבר שמורים ב-Worker ושורדים פריסה, אלא אם דורסים אותם במפורש.
- ליצור קונפיג זמני לא-מחויב (הרשאות צרות), להשלים בו את `database_id` ואת ה-vars, להחיל מיגרציות, לפרוס, ואז למחוק את הקובץ הזמני.
- לא למזג ולא לפרוס בלי אישור מפורש מהמשתמש.

שלד הפקודות (להתאים לנתיב הקונפיג הזמני בלבד):

```sh
npx wrangler d1 migrations apply wedding-rsvp-seating-hosted --remote --config <temp-hosted-config>
npx wrangler deploy --config <temp-hosted-config>
```

בקונפיג הזמני חייבים להופיע לפחות `d1_databases[0].database_id` האמיתי (לא ה-placeholder שבריפו), ו-vars מתועדים ב-`docs/hosted-deploy.md` ובקוד, בהם `HOSTED_ORIGIN` (באוויר: `https://rsvp.hamisrd.co.il`), `GOOGLE_CLIENT_ID` ו-`TURNSTILE_SITE_KEY`. ערכים ומזהים חיים: (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)

אם `HOSTED_PASSWORD_LOGIN` לא מוגדר, להשאיר אותו כבוי (כניסת סיסמה לא מתאימה ל-Workers Free בגלל עלות CPU של PBKDF2).

ברירות מחדל בקוד אם ה-var חסר:

- `FEEDBACK_EMAIL_FROM` נופל ל-`feedback@hamisrd.co.il`
- `FEEDBACK_GITHUB_REPO` נופל ל-`inonalfa/wedding-rsvp-seating`

אחרי פריסה: לבדוק `/health`, כניסת Google ב-`https://rsvp.hamisrd.co.il/auth/login`, ואת `/feedback`. לא לפתוח לוגי בקשות מלאים: קישורי הזמנה הם credentials.

### 5.3 Caps ושימוש

- עד 20 אירועים שמורים בחשבון, עד 300 הזמנות ו-500 מוזמנים לאירוע.
- יצירת אירוע / ייבוא / סנכרון נחסמים כשצילום השימוש חסר, נכשל, ישן (מעל שעתיים, או מיום UTC קודם), או כשאחד המדדים הגיע ל-60% מהמכסה היומית: 100,000 בקשות Workers, 5,000,000 קריאות D1, 100,000 כתיבות D1, 500,000,000 בתים במסד. מכסות מתאפסות בחצות UTC.
- עמוד מפעיל: `/operator/usage` (רק אם `provider_subject` של המשתמש המחובר תואם ל-`HOSTED_OPERATOR_SUB`).
- אם יצירת אירוע נחסמת, לבדוק קודם את שורת `usage_snapshot` ואת ה-cron, לא "לתקן" את השער. מצב הצילום החי: (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)

תוכנית החשבון: **Workers Free**. לא להפעיל מוצרים בתשלום ולא overages בלי החלטת בעלים. R2 לא בשימוש לאחסון תמונות (נשמרות כ-BLOB ב-D1 אחרי דחיסה בדפדפן).

---

## 6. Secrets - שמות בלבד

שמות הסודות שלהלן כבר מופיעים בקוד הציבורי, ב-`.dev.vars.example` או בתיעוד. אין כאן ערכים, ואין כאן מצאי של מה שמוגדר כרגע בפרודקשן. (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)

### 6.1 Hosted (Worker `wedding-rsvp-seating-hosted`)

שמות שהקוד וסקריפט הפריסה מצפים להם:

| שם | תפקיד |
| --- | --- |
| `GOOGLE_CLIENT_SECRET` | OAuth Web client של הפרויקט הייעודי ב-Google |
| `HOSTED_AUTH_SECRET` | 32 בתים אקראיים ב-Base64URL לחתימת סשן / state. רוטציה מנתקת סשנים |
| `HOSTED_INVITE_SECRET` | 32 בתים אקראיים ב-Base64URL, נפרד לגמרי מהקודם. רוטציה מבטלת את כל קישורי ההזמנה וחיפוש השולחן |
| `TURNSTILE_SECRET` | הסוד של וידג'ט Turnstile (Free), תואם ל-site key של אותו וידג'ט |
| `CF_ANALYTICS_TOKEN` | טוקן עם Account Analytics Read בלבד, לצילום השימוש |
| `FEEDBACK_GITHUB_TOKEN` | Fine-grained PAT: רק הריפו `wedding-rsvp-seating`, הרשאת Issues: Read and write |

Bindings (לא secrets), כפי שמופיעים ב-`hosted/wrangler.jsonc`: `HOSTED_DB`, `ASSETS`, `FEEDBACK_EMAIL` (`send_email`), ומגבלות קצב `LOGIN_LIMIT`, `GUEST_LIMIT`, `OWNER_LIMIT`, `RECOVERY_LIMIT`, `CLIENT_LIMIT`.

### 6.2 דמו / standalone (לא לגעת בדמו החי)

שמות בלבד, לפי `.dev.vars.example`: `ADMIN_PASSWORD`, `STAFF_PASSWORD`, `INVITE_TOKEN_SECRET`, `INVITE_SHORT_TOKEN_SECRET`. אופציונליים לאירוע אמיתי: `WHATSAPP_RSVP_SECRET`, `SEATING_SYNC_SECRET`, `MAKE_WEBHOOK_HMAC_SECRET`.
`SITES_DISPATCH_SECRET` ו-`AUTH_MODE=sites` **אסור** להגדיר על hostname ציבורי.

יצירת מפתחות חתימה (להציג בפלט רק כשיוצרים ערך חדש למפעיל, לא לשמור אותו ביומן או במסמך):

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

### 6.3 העברה בטוחה של secret ל-Wrangler

אין להדביק secret בצ'אט. סיסמאות וסודות מהמשתמש עוברים רק בטופס מאובטח / secret input, ואז ל-`wrangler secret put` בלי להדפיס את הערך. תהליך ההעברה המלא: (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)

ל-hosted תמיד `--config hosted/wrangler.jsonc`. לאירוע המתוכנן תמיד `--env event`. בלי אלה הסיכון הוא כתיבה לדמו.

`CLOUDFLARE_API_TOKEN` (אם יופיע) הוא טוקן לפריסה בלבד, לא secret של ה-Worker, ולא נפרס.

---

## 7. Google OAuth

- פרויקט GCP **נפרד** לשירות ה-hosted (לא לשתף עם פרויקטים אחרים).
- Audience: External, והמסך **פורסם** (Published). במצב בדיקה רק משתמשים מוגדרים יכולים להיכנס.
- Authorized domain: `hamisrd.co.il`.
- Callback: `https://rsvp.hamisrd.co.il/auth/callback` בלבד.
- Scope: `openid` בלבד.
- ה-Client ID הוא ערך פומבי שמוגש לדפדפן. הערך החי אינו מתועד כאן. (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)
- כניסה עם Google עובדת רק על דומיין `rsvp`. עמודי `workers.dev` יכולים להיפתח, אבל OAuth ייכשל שם.
- זרימה בקוד: PKCE, ID token מאומת, עוגיות `__Host-hosted_login` ו-`__Host-hosted_session`.
- אם מופיע "האימות נכשל": לבדוק קודם שהמשתמש ב-`rsvp.hamisrd.co.il`, שה-callback וה-Client ID תואמים, ואז `wrangler tail` על ה-Worker המופרס בזמן ניסיון כניסה (callback, state cookie). לא להחזיר Turnstile למסך Google בלי סיבה חדשה.

אימות מותג ב-Google (העלאת לוגו) הוא שלב אופציונלי שעדיין פתוח אצל המפעיל.

---

## 8. Turnstile

- ה-site key הוא ערך פומבי שמוגש בווידג'ט. הערך החי אינו מתועד כאן. (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)
- הווידג'ט מוגדר ל-`rsvp.hamisrd.co.il`.
- **נשאר בשימוש** ב-RSVP של אורחים (`hosted/invites.ts`, action `rsvp`) ובמצב סיסמה (`hosted/password.ts`, כניסה/הרשמה), שכבוי כברירת מחדל.
- **הוסר ממסך הכניסה עם Google** ב-[PR #29](https://github.com/inonalfa/wedding-rsvp-seating/pull/29). הסיבה: הווידג'ט נטען לאט ולפעמים לא הופיע, ומשתמשים לחצו "המשך עם Google" לפני שהאתגר הושלם, וקיבלו "האימות נכשל".

---

## 9. CSP והערות RUM

עמודי HTML של hosted (כולל כניסה) נשלחים עם CSP מחמיר: `default-src 'none'`.
`hosted/http.ts` מתיר בין השאר:

- `script-src` ו-`connect-src` ל-Cloudflare Insights (`https://static.cloudflareinsights.com`, `https://cloudflareinsights.com`) ו-`connect-src 'self'`.
- כש-Turnstile פעיל גם `https://challenges.cloudflare.com` ו-`frame-src`.
- בכניסת Google: `form-action` כולל `https://accounts.google.com`.

Cloudflare RUM מזריק beacon של Insights ששולח ל-`/cdn-cgi/rum`. בעבר, לפני [PR #28](https://github.com/inonalfa/wedding-rsvp-seating/pull/28), זה נחסם וגרם לשגיאת CSP בקונסול ולכשל ב-Turnstile. הכניסה עם Google עצמה כבר לא תלויה ב-Turnstile, אבל ה-CSP עדיין צריך לאפשר את ה-beacon ואת Insights. שגיאת CSP על ה-beacon אחרי #28 נחשבת לא קשורה לכניסה, כל עוד הכניסה עצמה מצליחה.

---

## 10. מייל ופידבק

- שליחת מייל: binding `FEEDBACK_EMAIL` ב-`hosted/wrangler.jsonc`, דרך Cloudflare Email. מדיניות היעד: `verified_only`.
- נמען הפניות למפעיל וכתובות גיבוי: (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)
- שולח ברירת מחדל בקוד: `feedback@hamisrd.co.il`.
- טופס: [https://rsvp.hamisrd.co.il/feedback](https://rsvp.hamisrd.co.il/feedback), כפתור "שליחת פידבק" בתפריט ובתחתית מסכים, וקישורים בדף הבית, במסך הכניסה ובעמודים המשפטיים. גם `POST /api/feedback`.
- זרימה (PR #30, מיגרציה `hosted/migrations/0010_feedback.sql`): כל פנייה נשמרת קודם בטבלת `feedback` ב-D1 (`email_status` / `github_status` מתחילים ב-`pending`). אחר כך, ב-`waitUntil`, נשלח מייל ונפתח אישו. אם המייל או GitHub נכשלים, הרשומה נשארת במסד.
- הריפו ציבורי, לכן **המייל של השולח ומזהה החשבון של המשתמש לא נכנסים לאישו**. הם מופיעים רק במייל למפעיל.
- אישו בדיקה אחרי ההעלאה: [#31](https://github.com/inonalfa/wedding-rsvp-seating/issues/31) (אפשר לסגור).

---

## 11. עמודים משפטיים ומותג

- `/privacy` ו-`/terms`, טקסט מילה-במילה של המפעיל, מותג "אישור הגעה פלוס", "עדכון אחרון: 24.11.2026", יצירת קשר `office@hamisrd.co.il`.
- לוגו ו-favicon במהדורת hosted בלבד (`hosted/public/assets/`).
- קישורים לעמודים האלה מופיעים בדף הבית ובמסך הכניסה, לפי דרישות Google.
- נוסף ב-[PR #27](https://github.com/inonalfa/wedding-rsvp-seating/pull/27) (מיזוג `07ecc39`).
- הטקסט **עדיין ממתין לסקירת עורך דין**. עד אז אין להתייחס אליו כאל ייעוץ משפטי סגור.

---

## 12. היסטוריית PR רלוונטית

כל אלה כבר מוזגו ל-`main` ופריסה תואמת עלתה ל-`rsvp.hamisrd.co.il` (אחרי אישור מפורש בזמנו). מזהי גרסאות ה-deploy: (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)

| PR | נושא |
| --- | --- |
| [#26](https://github.com/inonalfa/wedding-rsvp-seating/pull/26) | `deploy-hosted.mjs` מקבל את `https://rsvp.hamisrd.co.il` כ-`HOSTED_ORIGIN` |
| [#27](https://github.com/inonalfa/wedding-rsvp-seating/pull/27) | מדיניות פרטיות, תנאי שימוש, מותג, לוגו וקישורים במסכי הכניסה והבית. מיזוג `07ecc39` |
| [#28](https://github.com/inonalfa/wedding-rsvp-seating/pull/28) | תיקון CSP במסך הכניסה כדי ש-Turnstile ו-RUM יוכלו לרוץ |
| [#29](https://github.com/inonalfa/wedding-rsvp-seating/pull/29) | הסרת Turnstile מזרימת הכניסה עם Google |
| [#30](https://github.com/inonalfa/wedding-rsvp-seating/pull/30) | טופס פידבק, מייל למפעיל, ואישו ב-GitHub בלי PII |

פריסה נוספת רלוונטית העבירה את השירות לדומיין `rsvp` ול-Client ID הייעודי.

מיגרציות hosted שכבר קיימות בריפו: `0001_tenants` עד `0010_feedback`. בפריסה ידנית יש להחיל רק מיגרציות חדשות שעוד לא רצות על D1 החי. לא להריץ מיגרציות של `drizzle/` על מסד ה-hosted, ולא את מיגרציות `hosted/migrations/` על הדמו.

---

## 13. Cutover לאירוע אמיתי (לעתיד, רק עם אישור)

המקור המחייב נמצא מחוץ לריפו. (ראו את גרסת ההנדאוף המלאה מחוץ לריפו) תקציר בלבד:

1. לא לגעת ב-Worker וב-D1 של הדמו.
2. להוסיף ב-`wrangler.jsonc` בלוק `env.event` (JSON קפדני, בלי הערות) עם שם `wedding-rsvp-seating`, D1 חדש, ו-vars של אירוע אמיתי. לא להעתיק את ה-vars לרמת-העל של הקובץ.
3. `npx wrangler d1 create wedding-rsvp-seating`, להדביק את המזהה רק תחת `env.event`.
4. לעדכן את `config/event.ts` לפרטי האירוע האמיתי **לפני** הפצת קישורים (שינוי prefixes אחרי ההפצה מבטל קישורים).
5. `npx wrangler d1 migrations apply wedding-rsvp-seating --remote --env event`
6. בדיקות, ואז `npx vinext deploy --env event`
7. `npx wrangler secret put ... --env event` לכל אחד מהסודות הנדרשים.
8. רק אחרי שהסודות קיימים, ורק אחרי בדיקה שה-hostname פנוי, להוסיף route ל-`wedding.hamisrd.co.il` תחת `env.event` ולפרוס שוב עם `--env event`.

אין להשאיר את ה-Worker נגיש בציבור לפני שהסודות מוגדרים. `GUEST_DATA_RETENTION_AT` נשאר ריק עד שבוחרים תאריך מחיקה. Google OAuth ו-Turnstile הם של hosted בלבד, לא קלטים ל-cutover הזה.

---

## 14. נושאים פתוחים וידועים

- **כניסת Google:** אחרי PR #29 המשתמש התבקש לבדוק כניסה חוזרת (לפני כן היו כשלים לסירוגין בגלל מרוץ Turnstile). אחרי פריסת PR #30 בדיקה חיה מצאה שהכניסה עם Google ממשיכה לעבוד. אם "האימות נכשל" חוזר, לא לנחש: להריץ `wrangler tail` על `wedding-rsvp-seating-hosted` בזמן ניסיון הכניסה.
- **אימות מותג ב-Google:** אופציונלי, אם המפעיל יעלה את הלוגו בקונסול.
- **סקירת עו"ד** לטקסטים ב-`/privacy` ו-`/terms`.
- **Cutover לאירוע אמיתי** לפי התוכנית שמחוץ לריפו, Worker נפרד, תמיד `--env event`.
- אישו בדיקת פידבק [#31](https://github.com/inonalfa/wedding-rsvp-seating/issues/31) אפשר לסגור.
- מסמכי `docs/hosted-service-plan.md` / חלק מ-`docs/hosted-deploy.md` לא עודכנו אחרי הסרת Turnstile מכניסת Google ואחרי המעבר ל-`rsvp.hamisrd.co.il`; במקרה של סתירה, המצב באוויר והקוד ב-`hosted/` גוברים.
- נושאים תפעוליים פנימיים נוספים: (ראו את גרסת ההנדאוף המלאה מחוץ לריפו)

---

## 15. כללי בטיחות ומשמעת עבודה

- אין force push.
- אין מיזוג ואין deploy בלי אישור מפורש מהמשתמש לכל פעולה.
- לעולם לא להדפיס ערכי secrets, לא בצ'אט, לא בלוגים, לא ב-HANDOFF, ולא בפלט פקודה. לכל היותר שמות שכבר גלויים בריפו.
- סיסמאות וסודות מהמשתמש עוברים רק בטופס מאובטח / secret input, לא בהודעת טקסט.
- לא לגעת ב-`wedding-rsvp-seating-demo`, בדומיין שלו או ב-D1 שלו.
- לא לקבל תנאי שימוש, לא לפתוח ניסיון בתשלום, ולא לשלם בלי אישור. בפרט: לא לפתוח את ניסיון ה-$300 של GCP, ולא לשדרג את חשבון Cloudflare מ-Workers Free.
- קישורי הזמנה הם bearer credentials; לא להפעיל request logging מלא.
- הריפו ציבורי: לא לשים PII באישוז, ב-PR או בקומיטים. גרסת ההנדאוף המלאה נשמרת מחוץ לריפו בלבד.
- קומיטים קצרים באנגלית, בקשות למשתמש בעברית. במסמכים ובממשק: מקף ASCII בלבד (`-`), בלי מקפים טיפוגרפיים.

---

## 16. קישורים שימושיים

- שירות חי: [https://rsvp.hamisrd.co.il](https://rsvp.hamisrd.co.il)
- כניסה: [https://rsvp.hamisrd.co.il/auth/login](https://rsvp.hamisrd.co.il/auth/login)
- פידבק: [https://rsvp.hamisrd.co.il/feedback](https://rsvp.hamisrd.co.il/feedback)
- פרטיות: [https://rsvp.hamisrd.co.il/privacy](https://rsvp.hamisrd.co.il/privacy)
- תנאים: [https://rsvp.hamisrd.co.il/terms](https://rsvp.hamisrd.co.il/terms)
- ריפו: [https://github.com/inonalfa/wedding-rsvp-seating](https://github.com/inonalfa/wedding-rsvp-seating)
- גרסת ההנדאוף המלאה ותוכנית האירוע האמיתי נשמרות מחוץ לריפו.
