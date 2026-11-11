import type { D1Database } from "@cloudflare/workers-types";
import { escapeHtml, page } from "./http";

export type UsageEnv = {
  HOSTED_DB: D1Database;
  HOSTED_OPERATOR_SUB?: string;
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
};
type Snapshot = { recorded_at: number; worker_requests: number; d1_reads: number; d1_writes: number; hosted_bytes: number; last_attempt_ok: number };
const limits = { worker_requests: 100_000, d1_reads: 5_000_000, d1_writes: 100_000, hosted_bytes: 500_000_000 };
const labels = { worker_requests: "בקשות Workers", d1_reads: "שורות D1 שנקראו", d1_writes: "שורות D1 שנכתבו", hosted_bytes: "אחסון במסד האירועים (בתים)" };
const metrics = Object.keys(limits) as (keyof typeof limits)[];
const day = (now: number) => new Date(now).toISOString().slice(0, 10);

export async function refreshUsage(env: UsageEnv, now: number, fetcher: typeof fetch = fetch) {
  const ok = await collectUsage(env, now, fetcher);
  if (!ok) {
    await env.HOSTED_DB.prepare(`UPDATE usage_snapshot SET last_attempt_at=?, last_attempt_ok=0
      WHERE id=1 AND COALESCE(last_attempt_at, recorded_at)<=?`).bind(now, now).run();
  }
  return ok;
}

async function collectUsage(env: UsageEnv, now: number, fetcher: typeof fetch) {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) return false;
  const query = `query HostedUsage($account: string!, $since: Time!, $until: Time!, $d1: ZoneWorkersRequestsFilter_InputObject) {
    viewer { accounts(filter: { accountTag: $account }) {
      workersInvocationsAdaptive(limit: 1, filter: { datetime_geq: $since, datetime_leq: $until }) { sum { requests } }
      d1QueriesAdaptiveGroups(limit: 1, filter: $d1) { sum { rowsRead rowsWritten } }
    } }
  }`;
  const since = day(now) + "T00:00:00Z";
  const until = new Date(now).toISOString();
  try {
    const response = await fetcher("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST", headers: { Authorization: "Bearer " + env.CF_ANALYTICS_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { account: env.CF_ACCOUNT_ID, since, until,
        d1: { datetimeHour_geq: since, datetimeHour_leq: until } } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const payload = await response.json() as {
      errors?: unknown[];
      data?: { viewer: { accounts: Array<{
        workersInvocationsAdaptive: { sum: { requests: number } }[];
        d1QueriesAdaptiveGroups: { sum: { rowsRead: number; rowsWritten: number } }[];
      }> } };
    };
    const accounts = payload.data?.viewer?.accounts;
    const account = Array.isArray(accounts) && accounts.length === 1 ? accounts[0] : null;
    if (payload.errors?.length || !account || !Array.isArray(account.workersInvocationsAdaptive) || !Array.isArray(account.d1QueriesAdaptiveGroups)) return false;
    if (account.workersInvocationsAdaptive.length !== 1 || account.d1QueriesAdaptiveGroups.length !== 1) return false;
    const workers = account.workersInvocationsAdaptive[0]?.sum?.requests;
    const d1 = account.d1QueriesAdaptiveGroups[0]?.sum;
    const result = await env.HOSTED_DB.prepare("SELECT id FROM usage_snapshot WHERE id=1").bind().run();
    const values = [workers, d1?.rowsRead, d1?.rowsWritten, result.meta.size_after];
    if (values.some(value => typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) return false;
    await env.HOSTED_DB.prepare(`INSERT INTO usage_snapshot
      (id, recorded_at, worker_requests, d1_reads, d1_writes, hosted_bytes, last_attempt_at, last_attempt_ok)
      VALUES (1, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET recorded_at=excluded.recorded_at, worker_requests=excluded.worker_requests,
      d1_reads=excluded.d1_reads, d1_writes=excluded.d1_writes, hosted_bytes=excluded.hosted_bytes,
        last_attempt_at=excluded.last_attempt_at, last_attempt_ok=1
      WHERE excluded.last_attempt_at >= COALESCE(usage_snapshot.last_attempt_at, usage_snapshot.recorded_at)`).bind(now, ...values, now).run();
    return true;
  } catch {
    return false;
  }
}

export function getUsage(db: D1Database) {
  return db.prepare("SELECT recorded_at, worker_requests, d1_reads, d1_writes, hosted_bytes, last_attempt_ok FROM usage_snapshot WHERE id=1")
    .bind().first<Snapshot>();
}
function freshness(snapshot: Snapshot | null, now: number) {
  return !!snapshot && snapshot.last_attempt_ok === 1 && now >= snapshot.recorded_at && now - snapshot.recorded_at < 2 * 3600_000 &&
    day(now) === day(snapshot.recorded_at);
}
export async function hasHeadroom(db: D1Database, now: number) {
  const snapshot = await getUsage(db);
  return !!snapshot && freshness(snapshot, now) && metrics.every(key => snapshot[key] < limits[key] * 0.6);
}
export async function usagePage(env: UsageEnv, ownerId: string, now: number) {
  const subject = await env.HOSTED_DB.prepare("SELECT provider_subject FROM accounts WHERE id=?").bind(ownerId)
    .first<{ provider_subject: string }>();
  if (!env.HOSTED_OPERATOR_SUB || subject?.provider_subject !== env.HOSTED_OPERATOR_SUB) return page("העמוד לא נמצא", "", 404);
  const snapshot = await getUsage(env.HOSTED_DB);
  const retained = await env.HOSTED_DB.prepare("SELECT COUNT(*) AS n FROM events").bind().first<{ n: number }>();
  const summary = snapshot ? `<p>נתוני חשבון משוערים, נכון ל-${escapeHtml(new Date(snapshot.recorded_at).toISOString())}.</p><ul>${metrics.map(key => {
    const percentage = Math.floor(snapshot[key] / limits[key] * 100);
    return `<li>${labels[key]}: ${snapshot[key]} מתוך ${limits[key]} (${percentage}%)${percentage >= 50 ? " · מתקרבים למכסה" : ""}</li>`;
  }).join("")}</ul>` : "<p>עדיין אין מדידת שימוש.</p>";
  const accepting = snapshot && freshness(snapshot, now) && metrics.every(key => snapshot[key] < limits[key] * 0.6);
  return page("שימוש ומכסות", `${summary}<p>אירועים שמורים: ${retained?.n ?? 0} מתוך 20.</p>
    <p>${accepting ? "מדידת השימוש מאפשרת קבלת אירועים חדשים." : "קבלת אירועים חדשים, ייבוא וסנכרון מושהים."}</p>
    <p>מכסות יומיות מתאפסות בחצות UTC. המדידה מתעכבת ואינה מדד חיוב; בדקו גם ב-Cloudflare Dashboard.</p>`);
}
