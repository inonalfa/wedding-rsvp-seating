# מעבר הדומיין של השירות המתארח ל-rsvp.alfa-ai.co.il

מסמך זה מתאר את חיתוך הדומיין של **אישור הגעה פלוס** מ-`https://rsvp.hamisrd.co.il` אל `https://rsvp.alfa-ai.co.il`, כולל הפניה 301/308 מהכתובת הישנה. הוא אינו מאשר פריסה, שינוי DNS, או מיזוג.

הדמו ב-`https://wedding.hamisrd.co.il` אינו חלק מהמעבר הזה, ואין לגעת בו.

## מה כבר נמצא בקוד

- `HOSTED_ORIGIN` נשאר המקור הקנוני: ממנו נבנים קישורי הזמנה, קישורי חיפוש שולחן, ו-`redirect_uri` של Google.
- `HOSTED_LEGACY_ORIGINS` (רשימה מופרדת בפסיקים) מתירה גם את המקורות הישנים בבדיקות Origin בנתיבי שינוי (RSVP, פידבק, וכו') ובאימות hostname של Turnstile.
- `HOSTED_REDIRECT_LEGACY=1` מפעיל הפניה ב-Worker עצמו: 301 ל-GET/HEAD ו-308 לשאר השיטות, עם אותו נתיב ומחרוזת שאילתה. כבוי כברירת מחדל, כדי שאפשר יהיה לאמת קודם את הדומיין החדש.
- `/health` לא מופנה, בכל שיטת HTTP, כדי שאפשר יהיה לוודא שה-Worker עדיין מחובר ל-hostname הישן אחרי הפעלת ההפניה.
- כניסת Google ועוגיות `__Host-` עובדות רק על המקור הקנוני. עד שההפניה דולקת, יש לבצע כניסה ב-`https://rsvp.alfa-ai.co.il` בלבד.
- ברירת המחדל של כתובת הקשר המשפטית: `office@alfa-ai.co.il` (`HOSTED_CONTACT_EMAIL`).
- ברירת המחדל של שולח הפידבק: `feedback@alfa-ai.co.il` (`FEEDBACK_EMAIL_FROM`).
- `scripts/deploy-hosted.mjs` מקבל גם את `https://rsvp.alfa-ai.co.il` וגם את `https://rsvp.hamisrd.co.il`.

אין למזג, לפרוס, או לשנות DNS / Cloudflare / Google / Turnstile בלי אישור מפורש של בעל המוצר.

## שלבי חיתוך

### א. הכנה בדשבורדים (המפעיל)

1. בחשבון Cloudflare של השירות המתארח, לוודא ש-`alfa-ai.co.il` ו-`hamisrd.co.il` מופיעים באותו חשבון. אם האזור של alfa-ai בחשבון אחר, יש להעביר אותו לחשבון של ה-Worker לפני הוספת Custom Domain. CNAME אל `workers.dev` אינו נתיב נתמך.
2. Email Routing באזור `alfa-ai.co.il`: להוסיף ולאמת את הכתובות `office@alfa-ai.co.il` ו-`feedback@alfa-ai.co.il`, ולוודא שנמען הפידבק (כתובת היעד שכבר מאומתת) נשאר מוגדר. בלי זה שליחת פידבק מהכתובת החדשה תיכשל.
3. Google Search Console: לוודא ש-`alfa-ai.co.il` מאומת בחשבון Google שהוא Owner או Editor בפרויקט GCP הייעודי של השירות המתארח.
4. Google Cloud Console, לקוח ה-OAuth של השירות:
   - להוסיף Authorized domain: `alfa-ai.co.il`.
   - להוסיף Authorized redirect URI: `https://rsvp.alfa-ai.co.il/auth/callback`.
   - להוסיף Authorized JavaScript origin: `https://rsvp.alfa-ai.co.il`.
   - להשאיר בינתיים את הערכים של `hamisrd.co.il`.
   - לעדכן את קישורי מסך ההסכמה (דף הבית, מדיניות פרטיות, תנאי שימוש) לכתובות החדשות רק אחרי שהדומיין החדש חי ומחזיר 200.
5. בווידג'ט Turnstile: להוסיף את ה-hostname `rsvp.alfa-ai.co.il`.
6. ב-Worker `wedding-rsvp-seating-hosted`: להוסיף Custom Domain `rsvp.alfa-ai.co.il`. הפעולה יוצרת את רשומת ה-DNS. לוודא שהשם פנוי (בדיקה ציבורית: NXDOMAIN לפני ההוספה).

### ב. פריסה (רק אחרי אישור, ורק ל-Worker המתארח)

להגדיר משתני סביבה, ולשמור כל var שכבר מוגדר בדשבורד ולא צריך להימחק:

- `HOSTED_ORIGIN=https://rsvp.alfa-ai.co.il`
- `HOSTED_LEGACY_ORIGINS=https://rsvp.hamisrd.co.il`
- `HOSTED_CONTACT_EMAIL=office@alfa-ai.co.il`
- `FEEDBACK_EMAIL_FROM=feedback@alfa-ai.co.il`
- `HOSTED_REDIRECT_LEGACY` לא מוגדר, או לא שווה ל-`1`

לפרוס רק עם הקונפיג של hosted (`hosted/wrangler.jsonc`). לא לפרוס את הדמו, לא לגעת ב-secrets, ולא להפעיל עדיין את ההפניה.

### ג. בדיקה על הדומיין החדש

- `https://rsvp.alfa-ai.co.il/health` מחזיר `{"status":"ok"}`
- כניסת Google ב-`https://rsvp.alfa-ai.co.il/auth/login`
- פתיחת הזמנה ו-RSVP (GET ו-POST) בדומיין החדש
- קישור הזמנה ישן ב-`rsvp.hamisrd.co.il` עדיין נפתח, ו-POST של RSVP מצליח (כל עוד ההפניה כבויה)
- חיפוש שולחן, `/feedback`, `/privacy`, `/terms`
- המייל של הפידבק יוצא מ-`feedback@alfa-ai.co.il`, ודפי החוק מציגים `office@alfa-ai.co.il`

אין לפתוח לוגים מלאים של בקשות: קישורי הזמנה הם credentials.

### ד. הפעלת ההפניה

אחרי שהבדיקות בדומיין החדש עברו, להגדיר `HOSTED_REDIRECT_LEGACY=1` ולפרוס שוב (או לעדכן את ה-var בדשבורד ולשמור אותו בפריסה). לבדוק:

- GET אל `https://rsvp.hamisrd.co.il/invite/<token>?saved=1` מחזיר 301 אל אותה נתיב ושאילתה ב-`https://rsvp.alfa-ai.co.il`
- POST אל הכתובת הישנה מחזיר 308
- `/health` בכתובת הישנה נשאר 200 ולא מופנה
- קישור הזמנה ישן ממשיך לעבוד אחרי המעבר לדף החדש

להשאיר את ההפניה ואת `HOSTED_LEGACY_ORIGINS` לחודשים. אחר כך אפשר, בנפרד ובאישור, להחליף את ההפניה ב-Worker בכלל הפניה של Cloudflare ולנתק את ה-Custom Domain הישן.

### ה. חזרה לאחור

1. לכבות את `HOSTED_REDIRECT_LEGACY` (למחוק או להעמיד על ערך שונה מ-`1`).
2. להחזיר `HOSTED_ORIGIN=https://rsvp.hamisrd.co.il` אם צריך שהשירות הקנוני ישוב לכתובת הישנה.
3. להשאיר את שני ה-Custom Domains ואת כתובת ה-callback הישנה ב-Google.

עוגיות `__Host-` לא עוברות בין מארחים. אחרי חזרה לאחור המשתמשים יידרשו להיכנס מחדש.
