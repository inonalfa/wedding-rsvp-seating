import type { D1Database } from "@cloudflare/workers-types";

/** Keep this list identical to the executable statements in scripts/purge-guest-data.sql. */
export const guestPurgeStatements = [
  "DELETE FROM call_attempts",
  "DELETE FROM call_tasks",
  "DELETE FROM call_agents",
  "DELETE FROM call_settings",
  "DELETE FROM invite_visits",
  "DELETE FROM adults_note_exclusions",
  "DELETE FROM rsvp_responses",
  "DELETE FROM rsvps",
  "DELETE FROM generated_invites",
  "DELETE FROM rsvp_reconciliations",
  "DELETE FROM rsvp_invite_resolutions",
  "DELETE FROM invite_controls",
  "DELETE FROM auth_lockouts",
  "DELETE FROM seating_sketches",
  "DELETE FROM seating_plans",
  "DELETE FROM seating_sources",
  "DELETE FROM public_rate_limits",
  "DELETE FROM webhook_nonces",
  "DROP TABLE IF EXISTS seating_sheet_sync",
];

export function retentionInstant(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Date.parse(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function runGuestRetention(db: D1Database, retentionAt: string | undefined, now = Date.now()) {
  const instant = retentionInstant(retentionAt);
  if (instant === null || now < instant) return { purged: false as const };
  for (const statement of guestPurgeStatements) await db.prepare(statement).run();
  return { purged: true as const };
}
