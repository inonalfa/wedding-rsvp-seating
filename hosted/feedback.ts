import type { D1Database, SendEmail } from "@cloudflare/workers-types";
import { escapeHtml, json, page, readForm, redirectTo } from "./http";
import { readLimitedBody } from "./media";

export type FeedbackCategory = "bug" | "idea" | "other";

export interface FeedbackEnv {
  HOSTED_DB: D1Database;
  HOSTED_ORIGIN?: string;
  FEEDBACK_EMAIL?: SendEmail;
  FEEDBACK_EMAIL_TO?: string;
  FEEDBACK_EMAIL_FROM?: string;
  FEEDBACK_GITHUB_TOKEN?: string;
  FEEDBACK_GITHUB_REPO?: string;
  GUEST_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export interface ExecutionCtxLike {
  waitUntil(promise: Promise<unknown>): void;
}

export class FeedbackError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type ParsedFeedback = {
  category: FeedbackCategory | null;
  message: string;
  replyEmail: string | null;
  pageUrl: string | null;
};

const controlChars = /[\u0000-\u001f\u007f]/;
const messageControlChars = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const categoryLabels: Record<FeedbackCategory, string> = {
  bug: "דיווח על תקלה",
  idea: "רעיון לשיפור",
  other: "אחר",
};

export function sanitizePageUrl(value: unknown, origin?: string): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(controlChars, "").trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("/") && !cleaned.startsWith("//")) {
    return cleaned.slice(0, 200);
  }
  if (origin) {
    try {
      const parsed = new URL(cleaned);
      if (parsed.origin === origin) {
        return (parsed.pathname + parsed.search + parsed.hash).slice(0, 200) || "/";
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function parseFeedbackInput(
  raw: Record<string, unknown>,
  origin?: string,
  fallbackPageUrl?: string | null,
): ParsedFeedback {
  const rawCategory = typeof raw.category === "string" ? raw.category.trim() : "";
  if (rawCategory && rawCategory !== "bug" && rawCategory !== "idea" && rawCategory !== "other") {
    throw new FeedbackError(400, "קטגוריה לא תקינה");
  }
  const category: FeedbackCategory | null = rawCategory ? (rawCategory as FeedbackCategory) : null;

  const rawMessage = typeof raw.message === "string" ? raw.message : "";
  const message = rawMessage.replace(/\r\n?/g, "\n").replace(messageControlChars, "").trim();
  if (message.length < 3) {
    throw new FeedbackError(400, "כתבו הודעה של לפחות 3 תווים");
  }
  if (message.length > 2000) {
    throw new FeedbackError(400, "ההודעה ארוכה מדי (עד 2000 תווים)");
  }

  const rawEmail = typeof raw.email === "string" ? raw.email.trim() : "";
  if (rawEmail && (controlChars.test(rawEmail) || rawEmail.length > 120 || !emailPattern.test(rawEmail))) {
    throw new FeedbackError(400, "כתובת המייל אינה תקינה");
  }
  const replyEmail = rawEmail || null;

  const pageUrl = sanitizePageUrl(raw.pageUrl, origin) ?? sanitizePageUrl(fallbackPageUrl, origin);
  return { category, message, replyEmail, pageUrl };
}

function formatJerusalemTime(now: number) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(now) + " (Asia/Jerusalem)";
}

function feedbackCategoryLabel(category: FeedbackCategory | null) {
  return category ? categoryLabels[category] : "כללי";
}

function safeFenceBody(text: string) {
  return text.replace(/\`\`\`/g, "'''");
}

async function sendFeedbackEmail(
  env: FeedbackEnv,
  params: {
    feedbackId: string;
    signedIn: boolean;
    category: FeedbackCategory | null;
    message: string;
    replyEmail: string | null;
    pageUrl: string | null;
    now: number;
  },
): Promise<"sent" | "skipped" | "failed"> {
  const toEmail = env.FEEDBACK_EMAIL_TO?.trim();
  if (!env.FEEDBACK_EMAIL || !toEmail) return "skipped";
  const fromEmail = env.FEEDBACK_EMAIL_FROM?.trim() || "feedback@hamisrd.co.il";
  const label = feedbackCategoryLabel(params.category);
  const when = formatJerusalemTime(params.now);
  const sourceLabel = params.signedIn ? "משתמש מחובר" : "טופס ציבורי";
  const subject = `[אישור הגעה פלוס] פידבק חדש - ${label}`;
  const textLines = [
    "התקבל פידבק חדש במערכת אישור הגעה פלוס.",
    "",
    `מזהה: ${params.feedbackId}`,
    `תאריך: ${when}`,
    `קטגוריה: ${label}`,
    `מקור: ${sourceLabel}`,
    `עמוד: ${params.pageUrl ?? "לא צוין"}`,
    `מייל לחזרה: ${params.replyEmail ?? "לא נמסר"}`,
    "",
    "תוכן הפידבק:",
    params.message,
  ];
  const html = `<!doctype html><html lang="he" dir="rtl"><body style="font-family:Arial,sans-serif;line-height:1.6;color:#1b2a24;direction:rtl;text-align:right">
    <h2 style="margin:0 0 12px">פידבק חדש - אישור הגעה פלוס</h2>
    <table style="border-collapse:collapse;margin-bottom:16px">
      <tr><td style="padding:4px 0 4px 12px;color:#4f5d57"><strong>מזהה:</strong></td><td dir="ltr">${escapeHtml(params.feedbackId)}</td></tr>
      <tr><td style="padding:4px 0 4px 12px;color:#4f5d57"><strong>תאריך:</strong></td><td>${escapeHtml(when)}</td></tr>
      <tr><td style="padding:4px 0 4px 12px;color:#4f5d57"><strong>קטגוריה:</strong></td><td>${escapeHtml(label)}</td></tr>
      <tr><td style="padding:4px 0 4px 12px;color:#4f5d57"><strong>מקור:</strong></td><td>${escapeHtml(sourceLabel)}</td></tr>
      <tr><td style="padding:4px 0 4px 12px;color:#4f5d57"><strong>עמוד:</strong></td><td dir="ltr">${escapeHtml(params.pageUrl ?? "לא צוין")}</td></tr>
      <tr><td style="padding:4px 0 4px 12px;color:#4f5d57"><strong>מייל לחזרה:</strong></td><td dir="ltr">${escapeHtml(params.replyEmail ?? "לא נמסר")}</td></tr>
    </table>
    <div style="background:#faf8f3;border:1px solid #e3e0d8;border-radius:10px;padding:12px 14px;white-space:pre-wrap">${escapeHtml(params.message)}</div>
  </body></html>`;

  try {
    await env.FEEDBACK_EMAIL.send({
      from: { email: fromEmail, name: "אישור הגעה פלוס" },
      to: toEmail,
      ...(params.replyEmail ? { replyTo: params.replyEmail } : {}),
      subject,
      text: textLines.join("\n"),
      html,
    });
    return "sent";
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "unknown";
    console.error("feedback email failed", params.feedbackId, code);
    return "failed";
  }
}

async function createGithubFeedbackIssue(
  env: FeedbackEnv,
  params: {
    feedbackId: string;
    signedIn: boolean;
    category: FeedbackCategory | null;
    message: string;
    hasReplyEmail: boolean;
    pageUrl: string | null;
    now: number;
  },
  fetcher: typeof fetch,
): Promise<{ status: "created" | "skipped" | "failed"; issueNumber: number | null }> {
  const token = env.FEEDBACK_GITHUB_TOKEN?.trim();
  if (!token) return { status: "skipped", issueNumber: null };
  const repo = env.FEEDBACK_GITHUB_REPO?.trim() || "inonalfa/wedding-rsvp-seating";
  if (!repoPattern.test(repo)) {
    console.error("feedback github invalid repo", params.feedbackId);
    return { status: "failed", issueNumber: null };
  }

  const label = feedbackCategoryLabel(params.category);
  const firstLine = params.message.split("\n").map(line => line.trim()).find(Boolean) || "פידבק חדש";
  const shortLine = firstLine.length > 72 ? firstLine.slice(0, 69) + "..." : firstLine;
  const title = `[פידבק${params.category ? ` - ${label}` : ""}] ${shortLine}`;

  // Never include replyEmail or accountId in the public GitHub issue.
  const body = [
    `- **מזהה פידבק:** \`${params.feedbackId}\``,
    `- **קטגוריה:** ${label}`,
    `- **מקור:** ${params.signedIn ? "משתמש מחובר" : "טופס ציבורי"}`,
    `- **עמוד:** ${params.pageUrl ? `\`${params.pageUrl}\`` : "לא צוין"}`,
    `- **תאריך:** ${formatJerusalemTime(params.now)}`,
    `- **פרטי קשר לחזרה:** ${params.hasReplyEmail ? "נמסר מייל לחזרה (נשלח במייל למפעיל, אינו מפורסם באישו ציבורי)" : "לא נמסר"}`,
    "",
    "### תוכן הפידבק",
    "",
    "\`\`\`text",
    safeFenceBody(params.message),
    "\`\`\`",
  ].join("\n");

  try {
    const response = await fetcher(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "User-Agent": "wedding-rsvp-seating-hosted",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ title, body }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("feedback github failed", params.feedbackId, response.status);
      return { status: "failed", issueNumber: null };
    }
    const created = await response.json().catch(() => null) as { number?: unknown } | null;
    const issueNumber = typeof created?.number === "number" && Number.isInteger(created.number) ? created.number : null;
    return { status: "created", issueNumber };
  } catch {
    console.error("feedback github error", params.feedbackId);
    return { status: "failed", issueNumber: null };
  }
}

export async function submitFeedback(
  env: FeedbackEnv,
  input: ParsedFeedback & { accountId: string | null },
  now = Date.now(),
  fetcher: typeof fetch = fetch,
  ctx?: ExecutionCtxLike,
): Promise<{ feedbackId: string }> {
  const feedbackId = crypto.randomUUID();
  await env.HOSTED_DB.prepare(
    `INSERT INTO feedback(feedback_id, account_id, category, message, reply_email, page_url, email_status, github_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 'pending', ?)`,
  )
    .bind(feedbackId, input.accountId, input.category, input.message, input.replyEmail, input.pageUrl, now)
    .run();

  const deliver = async () => {
    const [emailStatus, githubResult] = await Promise.all([
      sendFeedbackEmail(env, {
        feedbackId,
        signedIn: Boolean(input.accountId),
        category: input.category,
        message: input.message,
        replyEmail: input.replyEmail,
        pageUrl: input.pageUrl,
        now,
      }),
      createGithubFeedbackIssue(
        env,
        {
          feedbackId,
          signedIn: Boolean(input.accountId),
          category: input.category,
          message: input.message,
          hasReplyEmail: Boolean(input.replyEmail),
          pageUrl: input.pageUrl,
          now,
        },
        fetcher,
      ),
    ]);
    try {
      await env.HOSTED_DB.prepare(
        `UPDATE feedback SET email_status = ?, github_status = ?, github_issue_number = ? WHERE feedback_id = ?`,
      )
        .bind(emailStatus, githubResult.status, githubResult.issueNumber, feedbackId)
        .run();
    } catch {
      console.error("feedback status update failed", feedbackId);
    }
  };

  if (ctx?.waitUntil) {
    ctx.waitUntil(deliver());
  } else {
    await deliver();
  }
  return { feedbackId };
}

function renderFeedbackPage(
  options: {
    sent?: boolean;
    error?: string;
    category?: string;
    message?: string;
    email?: string;
    pageUrl?: string;
    status?: number;
  } = {},
) {
  const notice = options.sent
    ? `<p class="alert info" role="status">תודה! הפידבק נשמר במערכת והועבר לצוות.</p>`
    : "";
  const error = options.error ? `<p class="alert" role="alert">${escapeHtml(options.error)}</p>` : "";
  const categories: Array<[string, string]> = [
    ["", "כללי (לא חובה)"],
    ["bug", "דיווח על תקלה"],
    ["idea", "רעיון לשיפור"],
    ["other", "אחר"],
  ];
  const catOptions = categories
    .map(([value, label]) => `<option value="${value}"${(options.category ?? "") === value ? " selected" : ""}>${label}</option>`)
    .join("");
  return page(
    "שליחת פידבק - אישור הגעה פלוס",
    `<p class="lead">נתקלתם בבעיה, יש רעיון לשיפור או הערה? נשמח לשמוע.</p>
    ${notice}${error}
    <form method="post" action="/feedback" class="stack">
      <input type="hidden" name="pageUrl" value="${escapeHtml(options.pageUrl ?? "")}">
      <label>קטגוריה (לא חובה)
        <select name="category">${catOptions}</select>
      </label>
      <label>מה תרצו לשתף?
        <textarea name="message" required minlength="3" maxlength="2000" rows="5" placeholder="ספרו לנו מה עבד, מה נתקע או מה הייתם רוצים להוסיף">${escapeHtml(options.message ?? "")}</textarea>
      </label>
      <label>מייל לחזרה (לא חובה)
        <input name="email" type="email" dir="ltr" maxlength="120" value="${escapeHtml(options.email ?? "")}" placeholder="name@example.com">
      </label>
      <p class="muted small">הפידבק נשמר במערכת ונשלח לצוות. אם תזינו מייל לחזרה, הוא נשלח לצוות בלבד ואינו מפורסם בפומבי.</p>
      <button class="btn primary">שליחת פידבק</button>
    </form>
    <p class="muted small center"><a href="/">חזרה לדף הבית</a> · <a href="/privacy">פרטיות</a> · <a href="/terms">תנאי שימוש</a></p>`,
    options.status ?? 200,
    false,
    false,
    { bodyClass: "auth" },
  );
}

export async function feedbackRateLimited(env: FeedbackEnv, key: string) {
  if (!env.GUEST_LIMIT) return json({ error: "השירות אינו זמין כרגע" }, 503);
  try {
    if ((await env.GUEST_LIMIT.limit({ key })).success) return null;
    const res = json({ error: "נשלחו יותר מדי פניות בזמן קצר. נסו שוב בעוד דקה." }, 429);
    res.headers.set("Retry-After", "60");
    return res;
  } catch {
    return json({ error: "השירות אינו זמין כרגע" }, 503);
  }
}

export async function feedbackPage(
  request: Request,
  env: FeedbackEnv,
  accountId: string | null,
  clientKey: () => Promise<string>,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
  ctx?: ExecutionCtxLike,
) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const fromParam = sanitizePageUrl(url.searchParams.get("from"), env.HOSTED_ORIGIN);
    const referer = sanitizePageUrl(request.headers.get("referer"), env.HOSTED_ORIGIN);
    return renderFeedbackPage({
      sent: url.searchParams.get("sent") === "1",
      pageUrl: fromParam ?? referer ?? "/feedback",
    });
  }
  if (request.method !== "POST") return page("העמוד לא נמצא", "", 404);
  if (!env.HOSTED_ORIGIN || url.origin !== env.HOSTED_ORIGIN || request.headers.get("origin") !== env.HOSTED_ORIGIN) {
    return page("הבקשה נחסמה", "", 403);
  }
  const blocked = await feedbackRateLimited(env, "feedback:ip:" + await clientKey());
  if (blocked) {
    if (blocked.status === 429) {
      const res = page("יותר מדי ניסיונות", "<p>נסו שוב בעוד דקה.</p>", 429);
      res.headers.set("Retry-After", "60");
      return res;
    }
    return page("השירות אינו זמין כרגע", "", 503);
  }
  const form = await readForm(request, 16 * 1024);
  const raw = {
    category: form?.get("category") ?? "",
    message: form?.get("message") ?? "",
    email: form?.get("email") ?? "",
    pageUrl: form?.get("pageUrl") ?? "",
  };
  try {
    const parsed = parseFeedbackInput(raw, env.HOSTED_ORIGIN, sanitizePageUrl(request.headers.get("referer"), env.HOSTED_ORIGIN) ?? "/feedback");
    await submitFeedback(env, { ...parsed, accountId }, now, fetcher, ctx);
    return redirectTo("/feedback?sent=1");
  } catch (error) {
    if (error instanceof FeedbackError) {
      return renderFeedbackPage({
        error: error.message,
        category: String(raw.category ?? ""),
        message: String(raw.message ?? ""),
        email: String(raw.email ?? ""),
        pageUrl: String(raw.pageUrl ?? ""),
        status: error.status,
      });
    }
    console.error("feedback page error");
    return page("אירעה שגיאה", "<p>נסו שוב מאוחר יותר.</p>", 500);
  }
}

export async function publicFeedbackApi(
  request: Request,
  env: FeedbackEnv,
  accountId: string | null,
  clientKey: () => Promise<string>,
  now = Date.now(),
  fetcher: typeof fetch = fetch,
  ctx?: ExecutionCtxLike,
) {
  if (request.method !== "POST") return json({ error: "פעולה לא נתמכת" }, 405);
  const url = new URL(request.url);
  if (!env.HOSTED_ORIGIN || url.origin !== env.HOSTED_ORIGIN || request.headers.get("origin") !== env.HOSTED_ORIGIN) {
    return json({ error: "הבקשה נחסמה" }, 403);
  }
  const blocked = await feedbackRateLimited(env, "feedback:ip:" + await clientKey());
  if (blocked) return blocked;
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) {
    return json({ error: "נדרש JSON" }, 415);
  }
  const bytes = await readLimitedBody(request, 16 * 1024);
  if (!bytes) return json({ error: "הבקשה גדולה מדי" }, 413);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return json({ error: "JSON לא תקין" }, 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return json({ error: "נתונים לא תקינים" }, 400);
  }
  try {
    const parsed = parseFeedbackInput(raw as Record<string, unknown>, env.HOSTED_ORIGIN, sanitizePageUrl(request.headers.get("referer"), env.HOSTED_ORIGIN));
    const { feedbackId } = await submitFeedback(env, { ...parsed, accountId }, now, fetcher, ctx);
    return json({ ok: true, id: feedbackId }, 201);
  } catch (error) {
    if (error instanceof FeedbackError) return json({ error: error.message }, error.status);
    console.error("public feedback api error");
    return json({ error: "אירעה שגיאה. נסו שוב." }, 500);
  }
}
