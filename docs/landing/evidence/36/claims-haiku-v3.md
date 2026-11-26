| Claim (file:line) | Status | Evidence / note |
|---|---|---|
| "שליחה... לכל אורח" with a ready message, DASH.send (copy.ts:66) and landing WhatsApp buttons on every row (dashboard.ts:17) | UNSUPPORTED as written | The SPA shows the WhatsApp action only when `g.phone` is set (app.js:620). Reword to "לכל אורח עם מספר טלפון" or show the button only when a phone exists, and confirm the copy-message action (app.js:621) covers guests without a phone. |
| "בלי לרדוף אחרי אף אחד" (DASH.h2, copy.ts:57) | UNSUPPORTED (overpromise) | Sending is manual (copy.ts:66, FAQ copy.ts:95, terms.ts:176). The heading implies the product removes follow-up work. Suggest a neutral heading, e.g. "רואים מי כבר ענה". |
| `/capacity` link (copy.ts:81, copy.ts:98; trust.ts:21) | UNCLEAR (dependency) | The route exists only in /tmp/capacity.ts, not in the repo tree. The copy is backed by capacity.ts:45-46 ("שירות בתשלום"), but the link 404s until the sibling PR is merged. Gate the link or merge first. |
| "הכניסה עם חשבון Google" (copy.ts:19) and "מתחילים בכניסה עם Google" (copy.ts:104) | UNCLEAR (incomplete) | Password login is in the code (api.ts:91, legal.ts:31 "ככל שתתאפשר"). Google is supported (legal.ts:24, 73). Say "כניסה, למשל עם Google" unless password login is off. |
| "כל תשובה מופיעה בדשבורד, יחד עם ברכות והערות" (copy.ts:58) | UNCLEAR | Notes are stored (api.ts:189, invites.ts:94). The landing demo shows them (dashboard.ts:24). The owner list at events.ts:145 does not show notes, and the SPA rendering is not in the attachments. |
| "שלוש ערכות עיצוב" (copy.ts:46, 49-51) | UNCLEAR | Only garden is referenced (themes.ts:8). Night and blush CSS is not in the attachments. |
| og image `/assets/landing/og.png` (page.ts:21) | UNCLEAR | The asset is not in the attachments. Confirm it exists before merge. |
| "התחתנו, גילינו כמה מערכת כזו חסרה..." (TRUST.why, copy.ts:73) | UNCLEAR (OA) | Personal statement, owner approval pending per the in-file OA marker. |

**Overall:** Not ready as-is. Three fixes before merge: (1) the per-guest WhatsApp claim at copy.ts:66, (2) the "בלי לרדוף" heading at copy.ts:57, (3) the `/capacity` link, which needs the sibling PR merged or the link hidden. The remaining rows are supported or need confirmation of assets and owner approval.

**Out of scope, for the orchestrator:** the legal pages contain the operator's personal name and contact email (legal.ts:19, 117; contactMailto in legal.ts:9-12). This conflicts with the "no PII in code" rule. It predates this landing work, so I have not changed it.