import type { D1Database } from "@cloudflare/workers-types";
import { getD1Binding } from "@/db";
import { getWeddingRuntimeConfig } from "@/lib/runtime-config";

const ready = new WeakMap<D1Database, Promise<void>>();
const maxTtl = 365 * 24 * 60 * 60;
export const defaultLegacyInviteTtlSeconds = 90 * 24 * 60 * 60;

export function legacyInviteTtlSeconds(raw: string | undefined) {
  if (raw === undefined || raw.trim() === "") return defaultLegacyInviteTtlSeconds;
  const ttl = Number(raw);
  if (!Number.isSafeInteger(ttl) || ttl < 0 || ttl > maxTtl) throw new Error("Invalid legacy invitation TTL");
  return ttl;
}

export async function ensureInviteControls(db = getD1Binding()) {
  const pending = ready.get(db) ?? db.prepare(`CREATE TABLE IF NOT EXISTS invite_controls (
      invite_id text PRIMARY KEY NOT NULL,
      expires_at integer,
      revoked_at text
    )`).run().then(() => undefined).catch((error: unknown) => {
    ready.delete(db);
    throw error;
  });
  ready.set(db, pending);
  return pending;
}

/** Stored expiry covers legacy links, which have no expiry in the token itself. */
export async function enforceInviteExpiry(inviteId: string, embeddedExpiry: number | null) {
  await ensureInviteControls();
  const db = getD1Binding();
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare("SELECT expires_at, revoked_at FROM invite_controls WHERE invite_id=?").bind(inviteId).first<{ expires_at: number | null; revoked_at: string | null }>();
  if (row?.revoked_at) throw new Error("הקישור הזה הוצא מרשימת ההזמנות");
  if (row?.expires_at != null && row.expires_at <= now) throw new Error("Invitation expired");
  if (embeddedExpiry !== null) return;
  const ttl = legacyInviteTtlSeconds(getWeddingRuntimeConfig().legacyInviteTtlSeconds);
  if (ttl === 0 || row) return;
  await db.prepare("INSERT INTO invite_controls (invite_id, expires_at, revoked_at) VALUES (?, ?, NULL) ON CONFLICT(invite_id) DO NOTHING").bind(inviteId, now + ttl).run();
  const stored = await db.prepare("SELECT expires_at FROM invite_controls WHERE invite_id=?").bind(inviteId).first<{ expires_at: number | null }>();
  if (stored?.expires_at != null && stored.expires_at <= now) throw new Error("Invitation expired");
}

const inviteIdPattern = /^[A-Za-z0-9_-]{3,64}$/;

export function validControlInviteId(value: unknown): value is string {
  return typeof value === "string" && inviteIdPattern.test(value);
}

export async function revokeInvite(inviteId: string) {
  await ensureInviteControls();
  const db = getD1Binding();
  const revokedAt = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO rsvp_invite_resolutions (invite_id, canonical_id, reconciliation_id)
      VALUES (?, NULL, 'manual-revocation')
      ON CONFLICT(invite_id) DO UPDATE SET canonical_id=NULL, reconciliation_id='manual-revocation'`).bind(inviteId),
    db.prepare(`UPDATE rsvp_invite_resolutions SET canonical_id=NULL, reconciliation_id='manual-revocation' WHERE canonical_id=?`).bind(inviteId),
    db.prepare(`INSERT INTO invite_controls (invite_id, expires_at, revoked_at) VALUES (?, NULL, ?)
      ON CONFLICT(invite_id) DO UPDATE SET revoked_at=excluded.revoked_at`).bind(inviteId, revokedAt),
  ]);
  return revokedAt;
}

export async function setInviteExpiry(inviteId: string, expiresAt: number | null) {
  await ensureInviteControls();
  await getD1Binding().prepare(`INSERT INTO invite_controls (invite_id, expires_at, revoked_at) VALUES (?, ?, NULL)
    ON CONFLICT(invite_id) DO UPDATE SET expires_at=excluded.expires_at`).bind(inviteId, expiresAt).run();
}
