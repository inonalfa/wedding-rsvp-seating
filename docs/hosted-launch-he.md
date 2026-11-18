# העלאת השירות לאוויר - מדריך צעד אחר צעד

המדריך מיועד למפעיל השירות. הכול נשאר בשכבות החינמיות של Cloudflare ו-Google. זמן משוער: 30 עד 45 דקות. המדריך המלא באנגלית, כולל ההסברים, נמצא ב-[hosted-deploy.md](hosted-deploy.md).

## 1. Cloudflare

1. פתחו חשבון Cloudflare חדש וייעודי לשירות (לא החשבון של הדמו). השאירו אותו בתוכנית **Workers Free** ואל תפעילו מוצרים בתשלום.
2. ב-Workers & Pages הפעילו תת-דומיין חינמי של `workers.dev`. כתובת השירות תהיה `https://wedding-rsvp-seating-hosted.<תת-הדומיין>.workers.dev`.
3. צרו מסד D1 בשם `wedding-rsvp-seating-hosted` ושמרו את המזהה שלו (Database ID). שמרו גם את Account ID.
4. ב-Turnstile צרו widget חינמי, הגבילו אותו לכתובת השירות ושמרו את Site Key ואת Secret Key.
5. צרו שני API Tokens:
   - **לפריסה:** הרשאות Billing Read, Workers Scripts Edit ו-D1 Edit, רק לחשבון הזה.
   - **למדידת שימוש:** הרשאת Account Analytics Read בלבד.

## 2. Google

1. ב-Google Cloud Console צרו פרויקט, ובמסך ההסכמה (OAuth consent screen) בחרו External. אין צורך בחיוב ובאימות של Google, כי השירות מבקש רק את ההרשאה `openid`.
2. פרסמו את מסך ההסכמה (Publish app). במצב Testing רק משתמשים שהוספתם ידנית יוכלו להיכנס.
3. צרו OAuth Client מסוג Web application, עם Redirect URI: `https://wedding-rsvp-seating-hosted.<תת-הדומיין>.workers.dev/auth/callback`. שמרו את Client ID ואת Client Secret.

## 3. סודות

צרו שני מפתחות נפרדים (הריצו את הפקודה פעמיים):

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## 4. פריסה

ייצאו את המשתנים בטרמינל, רצוי ממנהל סיסמאות ולא מקובץ:

| משתנה | ערך |
| --- | --- |
| `CF_ACCOUNT_ID`, `HOSTED_DB_ID` | מזהה החשבון ומזהה מסד D1 |
| `HOSTED_ORIGIN` | כתובת השירות המלאה, בלי `/` בסוף |
| `HOSTED_FREE_CONFIRMED` | `1`, אחרי שווידאתם ב-Dashboard שהחשבון בתוכנית Free |
| `CLOUDFLARE_API_TOKEN` | טוקן הפריסה |
| `CF_ANALYTICS_TOKEN` | טוקן מדידת השימוש |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | מ-Google |
| `HOSTED_AUTH_SECRET`, `HOSTED_INVITE_SECRET` | שני המפתחות משלב 3 |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | מ-Turnstile |
| `HOSTED_OPERATOR_SUB` | בפריסה הראשונה `pending`. מעדכנים בשלב 5 |
| `HOSTED_CONTACT_EMAIL` | לא חובה: כתובת לפניות פרטיות שתוצג ב-`/privacy` וב-`/terms` |

ואז:

```bash
npm ci
```

```bash
node scripts/deploy-hosted.mjs
```

הסקריפט בודק שהחשבון חינמי ושהמסד הוא המסד הייעודי, מריץ את המיגרציות ומעלה את ה-Worker ואת קבצי האפליקציה.

## 5. אחרי הפריסה

1. פתחו `<כתובת השירות>/health` וודאו שמתקבל `ok`.
2. התחברו פעם אחת עם Google. ואז ב-Cloudflare Dashboard פתחו Storage & Databases, D1, את המסד `wedding-rsvp-seating-hosted`, ובלשונית Console הריצו `SELECT provider_subject FROM accounts`. אם יש יותר משורה אחת, הריצו את השאילתה לפני שמישהו אחר נכנס.
3. הגדירו את `HOSTED_OPERATOR_SUB` לערך שקיבלתם והריצו שוב את `node scripts/deploy-hosted.mjs`. עכשיו `/operator/usage` נפתח רק לכם.
4. **המתינו עד שעה.** יצירת אירועים פתוחה רק אחרי שהמדידה השעתית הראשונה מצליחה. זה מנגנון ההגנה שמונע חריגה מהמכסה החינמית. אם אחרי שעה עדיין מופיעה ההודעה "יצירת אירועים מושהית", בדקו את `/operator/usage` ואת הרשאות טוקן המדידה.
5. בדיקת עשן: צרו אירוע פיקטיבי, הוסיפו אורח, פתחו את הקישור שלו מטלפון אחר ואשרו הגעה, שבצו לשולחן, הורידו עותק ומחקו את האירוע.

## מה עדיין עליכם

- **בדיקה משפטית:** דפי `/privacy` ו-`/terms` הם טיוטות שנכתבו לפי מה שהמערכת באמת עושה, ומסומנות כטיוטה. לפני שמזמינים זוגות אמיתיים, כדאי שעורך דין יעבור עליהם.
- **מכסות:** עד 20 אירועים שמורים בשירות כולו, אירוע אחד לחשבון. למספר קטן של משתמשים זה מספיק.
- **כניסה עם סיסמה:** כבויה. להפעלה מגדירים `HOSTED_PASSWORD_LOGIN=1` לפני הפריסה. בתוכנית החינמית היא עלולה להיכשל לפעמים בגלל מגבלת המעבד.
