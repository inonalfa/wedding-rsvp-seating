import { eq } from "drizzle-orm";
import { ensureRsvpSchema, getDb } from "@/db";
import { generatedInvites, rsvpResponses } from "@/db/schema";
import { getWeddingRuntimeConfig } from "@/lib/runtime-config";
import { decodeInviteToken } from "@/lib/invite-token";

import { rsvpGuestLimit } from "@/lib/rsvp-form";

import { claimWebhookRequest } from "@/lib/webhook-replay";

type WhatsappRsvp = {
  inviteId?: unknown;
  attendance?: unknown;
  guestCount?: unknown;
  phone?: unknown;
  messageId?: unknown;
  sheets?: unknown;
};

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
}

function matchingInviteIds(payload: WhatsappRsvp): string[] {
  const phone = normalizePhone(payload.phone);
  if (!/^05\d{8}$/.test(phone) || !Array.isArray(payload.sheets)) return [];
  const found: string[] = [];
  for (const sheet of payload.sheets) {
    if (!sheet || typeof sheet !== "object" || !Array.isArray((sheet as { values?: unknown }).values)) continue;
    for (const row of (sheet as { values: unknown[] }).values) {
      if (!Array.isArray(row) || normalizePhone(row[0]) !== phone) continue;
      const id = row[5]; // D:I: phone in D, invite ID in I.
      if (typeof id === "string" && id.trim()) found.push(id.trim());
    }
  }
  return [...new Set(found)];
}

async function resolveLegacyInvite(payload: WhatsappRsvp, inviteId: string) {
  if (!Array.isArray(payload.sheets)) return null;
  const phone = normalizePhone(payload.phone);
  for (const sheet of payload.sheets) {
    if (!sheet || !Array.isArray(sheet.values)) continue;
    for (const [index, row] of sheet.values.entries()) {
      if (!Array.isArray(row) || normalizePhone(row[0]) !== phone || String(row[5] ?? '').trim() !== inviteId) continue;
      const token = typeof row[3] === 'string' ? row[3].trim() : '';
      if (!token || token.length > 1600) continue;
      try {
        const invite = await decodeInviteToken(token);
        if (invite.inviteId !== inviteId) continue;
        // A legacy token embeds the original row. Rows can move; use the current range.
        const range = typeof sheet.range === 'string' ? sheet.range : '';
        const match = range.match(/^'?(.+?)'?!\$?D\$?(\d+):/);
        if (!match || match[1] !== invite.sourceSheet) continue;
        return { ...invite, sourceRow: Number(match[2]) + index };
      } catch {
        // An invalid or mismatched signature cannot identify an invitation.
      }
    }
  }
  return null;
}

function equalSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function POST(request: Request) {
  const secret = getWeddingRuntimeConfig().whatsappRsvpSecret;
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!secret || !equalSecret(bearer, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const denied = await claimWebhookRequest(request, "whatsapp-rsvp");
  if (denied) return denied;

  let payload: WhatsappRsvp;
  try {
    const text = await request.text();
    if (text.length > 300_000) return Response.json({ error: "Payload too large" }, { status: 413 });
    payload = JSON.parse(text) as WhatsappRsvp;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid payload');
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const candidates = matchingInviteIds(payload);
  if (payload.sheets !== undefined && candidates.length !== 1) {
    return Response.json({ error: candidates.length ? "Ambiguous phone" : "Phone not found" }, { status: 409 });
  }
  const inviteId = candidates[0] ?? (typeof payload.inviteId === "string" ? payload.inviteId.trim() : "");
  const attendance = payload.attendance;
  const guestCount = attendance === "no" ? 0 : Number(payload.guestCount);
  if (!inviteId || inviteId.length > 160 || (attendance !== "yes" && attendance !== "no") ||
      !Number.isSafeInteger(guestCount) || (attendance === "yes" && (guestCount < 1 || guestCount > 1_000))) {
    return Response.json({ error: "Invalid RSVP" }, { status: 400 });
  }
  const validAttendance: "yes" | "no" = attendance;

  try {
    await ensureRsvpSchema();
    const db = getDb();
    const [generatedInvite] = await db.select().from(generatedInvites)
      .where(eq(generatedInvites.inviteId, inviteId)).limit(1);
    const invite = generatedInvite ?? await resolveLegacyInvite(payload, inviteId);
    if (!invite) return Response.json({ error: "Unknown invite" }, { status: 404 });

    const limit = rsvpGuestLimit(invite.maxGuests);
    if (attendance === "yes" && guestCount > limit) return Response.json({ error: `Guest count must be between 1 and ${limit}` }, { status: 400 });

    const phone = normalizePhone(payload.phone).slice(0, 20);
    const [existing] = await db.select().from(rsvpResponses)
      .where(eq(rsvpResponses.inviteId, inviteId)).limit(1);
    const now = new Date().toISOString();
    const values = {
      inviteId,
      firstName: invite.firstName,
      invitedName: invite.firstName,
      fullName: existing?.fullName || invite.firstName,
      phone: existing?.phone || phone || null,
      attendance: validAttendance,
      guestCount,
      maxGuests: invite.maxGuests,
      message: existing?.message || "",
      sourceSheet: invite.sourceSheet,
      sourceRow: invite.sourceRow,
      syncStatus: "pending" as const,
      syncError: "",
      updatedAt: now,
    };
    await db.insert(rsvpResponses).values(values).onConflictDoUpdate({
      target: rsvpResponses.inviteId,
      set: values,
    });

    // The WhatsApp reply is already sent by Make. This webhook only syncs the sheet.
    const { makeWebhookUrl } = getWeddingRuntimeConfig();
    let syncStatus: "synced" | "pending" | "not_configured" = makeWebhookUrl ? "pending" : "not_configured";
    let syncError = "";
    if (makeWebhookUrl) {
      try {
        const response = await fetch(makeWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schemaVersion: 3, event: "rsvp.updated", source: "whatsapp",
            inviteId, lookupColumn: "I", lookupValue: inviteId,
            sourceSheet: invite.sourceSheet, rowNumber: invite.sourceRow,
            firstName: invite.firstName, invitedName: invite.firstName,
            submittedName: values.fullName, attendance,
            attendanceHe: attendance === "yes" ? "מאשרים" : "לא מגיעים",
            guestCount, maxGuests: invite.maxGuests, message: values.message,
            submittedAt: now,
          }),
          signal: AbortSignal.timeout(7_000),
        });
        if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
        syncStatus = "synced";
      } catch (error) {
        syncError = error instanceof Error ? error.message.slice(0, 250) : "Webhook failed";
      }
    }
    await db.update(rsvpResponses).set({ syncStatus, syncError })
      .where(eq(rsvpResponses.inviteId, inviteId));
    return Response.json({ ok: true, inviteId, attendance, guestCount, synced: syncStatus === "synced" });
  } catch (error) {
    console.error("WhatsApp RSVP update failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Could not save RSVP" }, { status: 500 });
  }
}
