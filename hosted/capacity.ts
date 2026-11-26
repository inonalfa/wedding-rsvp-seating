import { checkChallenge, widget, type AbuseEnv } from "./abuse";
import {
  FeedbackError,
  feedbackRateLimited,
  parseReplyEmail,
  submitFeedback,
  type ExecutionCtxLike,
  type FeedbackEnv,
} from "./feedback";
import { escapeHtml, page, readForm, redirectTo } from "./http";
import { sameAllowedOrigin } from "./origins";

type CapacityEnv = FeedbackEnv & AbuseEnv;

type CapacityValues = {
  email: string;
  date: string;
  invitations: string;
  guests: string;
  tables: string;
  note: string;
};

const TITLE = "בקשת הרחבת מכסה - אישור הגעה פלוס";
const noteControlChars = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const emptyValues: CapacityValues = { email: "", date: "", invitations: "", guests: "", tables: "", note: "" };

function field(form: FormData | null, name: string) {
  const value = form?.get(name);
  return typeof value === "string" ? value : "";
}

function renderCapacityPage(env: CapacityEnv, options: { sent?: boolean; error?: string; values?: CapacityValues; status?: number } = {}) {
  const v = options.values ?? emptyValues;
  const notice = options.sent
    ? `<p class="alert info" role="status">תודה! הבקשה התקבלה ונחזור אליכם במייל.</p>`
    : "";
  const error = options.error ? `<p class="alert" role="alert">${escapeHtml(options.error)}</p>` : "";
  const number = (name: string, label: string, value: string) =>
    `<label>${label} (לא חובה)
        <input name="${name}" type="number" inputmode="numeric" min="1" max="5000" step="1" value="${escapeHtml(value)}">
      </label>`;
  return page(
    TITLE,
    `<p class="lead">השירות חינמי עד המכסה: אירוע אחד לחשבון, עד 300 הזמנות, עד 500 מוזמנים ועד 60 שולחנות. צריכים יותר? השאירו פרטים ונחזור אליכם במייל.</p>
    <p class="muted">הרחבת מכסה היא שירות בתשלום. שליחת הטופס אינה מחייבת, והמחיר נקבע רק אחרי שנחזור אליכם.</p>
    ${notice}${error}
    <form method="post" action="/capacity" class="stack">
      <label>מייל לחזרה
        <input name="email" type="email" dir="ltr" required maxlength="120" value="${escapeHtml(v.email)}" placeholder="name@example.com" autocomplete="email">
      </label>
      <label>תאריך האירוע (לא חובה)
        <input name="date" type="date" value="${escapeHtml(v.date)}">
      </label>
      ${number("invitations", "כמה הזמנות תצטרכו?", v.invitations)}
      ${number("guests", "כמה מוזמנים?", v.guests)}
      ${number("tables", "כמה שולחנות?", v.tables)}
      <label>הערה קצרה (לא חובה)
        <textarea name="note" maxlength="600" rows="4">${escapeHtml(v.note)}</textarea>
      </label>
      <label class="check"><input name="paid" type="checkbox" required> הבנתי שהרחבת המכסה כרוכה בתשלום</label>
      ${widget(env, "capacity")}
      <button class="btn primary">שליחת הבקשה</button>
    </form>
    <p class="muted small center"><a href="/">חזרה לדף הבית</a> · <a href="/privacy">פרטיות</a> · <a href="/terms">תנאי שימוש</a></p>`,
    options.status ?? 200,
    true,
    false,
    { bodyClass: "auth" },
  );
}

function parseCount(value: string, label: string) {
  const text = value.trim();
  if (!text) return "";
  if (!/^\d{1,4}$/.test(text)) throw new FeedbackError(400, `${label}: יש להזין מספר שלם בין 1 ל-5000`);
  const n = Number(text);
  if (n < 1 || n > 5000) throw new FeedbackError(400, `${label}: יש להזין מספר שלם בין 1 ל-5000`);
  return String(n);
}

function parseDate(value: string) {
  const text = value.trim();
  if (!text) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const parsed = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!match || !parsed || parsed.toISOString().slice(0, 10) !== text) {
    throw new FeedbackError(400, "תאריך האירוע אינו תקין");
  }
  return text;
}

function composeMessage(v: CapacityValues) {
  return [
    "[בקשת הרחבת מכסה]",
    `תאריך: ${v.date || "לא צוין"}`,
    `הזמנות: ${v.invitations || "לא צוין"}`,
    `מוזמנים: ${v.guests || "לא צוין"}`,
    `שולחנות: ${v.tables || "לא צוין"}`,
    `הערה: ${v.note || "ללא"}`,
  ].join("\n");
}

export async function capacityPage(
  request: Request,
  env: CapacityEnv,
  accountId: string | null,
  clientKey: () => Promise<string>,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
  ctx?: ExecutionCtxLike,
) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    return renderCapacityPage(env, { sent: url.searchParams.get("sent") === "1" });
  }
  if (request.method !== "POST") return page("העמוד לא נמצא", "", 404);
  if (!sameAllowedOrigin(request, env)) return page("הבקשה נחסמה", "", 403);
  const blocked = await feedbackRateLimited(env, "capacity:ip:" + await clientKey());
  if (blocked) {
    if (blocked.status === 429) {
      const res = page("יותר מדי ניסיונות", "<p>נסו שוב בעוד דקה.</p>", 429);
      res.headers.set("Retry-After", "60");
      return res;
    }
    return page("השירות אינו זמין כרגע", "", 503);
  }
  const form = await readForm(request, 16 * 1024);
  const values: CapacityValues = {
    email: field(form, "email").trim().slice(0, 120),
    date: field(form, "date").trim().slice(0, 10),
    invitations: field(form, "invitations").trim().slice(0, 8),
    guests: field(form, "guests").trim().slice(0, 8),
    tables: field(form, "tables").trim().slice(0, 8),
    note: field(form, "note").replace(/\r\n?/g, "\n").replace(noteControlChars, "").trim().slice(0, 600),
  };
  if (!await checkChallenge(env, form, "capacity", fetcher)) {
    return renderCapacityPage(env, { error: "האימות נכשל. נסו שוב.", values, status: 403 });
  }
  try {
    if (!values.email) throw new FeedbackError(400, "יש להזין מייל לחזרה");
    const replyEmail = parseReplyEmail(values.email);
    const clean: CapacityValues = {
      email: replyEmail,
      date: parseDate(values.date),
      invitations: parseCount(values.invitations, "מספר ההזמנות"),
      guests: parseCount(values.guests, "מספר המוזמנים"),
      tables: parseCount(values.tables, "מספר השולחנות"),
      note: values.note,
    };
    if (field(form, "note").replace(noteControlChars, "").trim().length > 600) {
      throw new FeedbackError(400, "ההערה ארוכה מדי (עד 600 תווים)");
    }
    if (field(form, "paid") !== "on") {
      throw new FeedbackError(400, "יש לאשר שהרחבת המכסה כרוכה בתשלום");
    }
    await submitFeedback(
      env,
      { category: "other", message: composeMessage(clean), replyEmail, pageUrl: "/capacity", accountId },
      now,
      fetcher,
      ctx,
      { github: false },
    );
    return redirectTo("/capacity?sent=1");
  } catch (error) {
    if (error instanceof FeedbackError) {
      return renderCapacityPage(env, { error: error.message, values, status: error.status });
    }
    console.error("capacity page error");
    return page("אירעה שגיאה", "<p>נסו שוב מאוחר יותר.</p>", 500);
  }
}
