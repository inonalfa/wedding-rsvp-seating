import { eq, sql } from "drizzle-orm";
import { ensureRsvpSchema, getDb } from "@/db";
import { rsvpResponses } from "@/db/schema";
import { decodeInviteToken, type InviteDetails } from "@/lib/invite-token";
import { getWeddingRuntimeConfig } from "@/lib/runtime-config";
import { formatWebhookDateTime } from "@/lib/webhook-date";

type RSVPRequest = {
  fullName?: unknown;
  attendance?: unknown;
  guestCount?: unknown;
  message?: unknown;
  website?: unknown;
  inviteToken?: unknown;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function resolveInvite(value: unknown): Promise<InviteDetails | null> {
  const token = cleanText(value, 1600);
  if (!token) return null;
  return decodeInviteToken(token);
}

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 4_000) return Response.json({ error: "הבקשה גדולה מדי" }, { status: 413 });
    let payload: RSVPRequest;
    try { payload = JSON.parse(text) as RSVPRequest; }
    catch { return Response.json({ error: "בקשה לא תקינה" }, { status: 400 }); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
    if (typeof payload.website === "string" && payload.website.trim()) {
      return Response.json({ ok: true }, { status: 201 });
    }

    let invite: InviteDetails | null = null;
    try {
      invite = await resolveInvite(payload.inviteToken);
    } catch {
      return Response.json({ error: "קישור ההזמנה אינו תקין" }, { status: 400 });
    }

    const fullName = cleanText(payload.fullName, 80);
    const attendance: "yes" | "no" | null = payload.attendance === "yes" || payload.attendance === "no"
      ? payload.attendance
      : null;
    const message = cleanText(payload.message, 500);
    const requestedCount = Number(payload.guestCount);
    const guestCount = attendance === "yes" ? requestedCount : 0;

    if (fullName.length < 2) {
      return Response.json({ error: "יש להזין שם מלא" }, { status: 400 });
    }
    if (!attendance) {
      return Response.json({ error: "יש לבחור אם אתם מגיעים" }, { status: 400 });
    }
    if (
      attendance === "yes" &&
      (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 1_000)
    ) {
      return Response.json({ error: "מספר המשתתפים אינו תקין" }, { status: 400 });
    }

    await ensureRsvpSchema();
    const db = getDb();
    const now = new Date().toISOString();
    const responseValues = {
      inviteId: invite?.inviteId ?? null,
      firstName: invite?.firstName ?? "",
      invitedName: invite?.fullName ?? "",
      fullName,
      attendance,
      guestCount,
      maxGuests: invite?.maxGuests ?? 0,
      message,
      sourceSheet: invite?.sourceSheet ?? null,
      sourceRow: invite?.sourceRow ?? null,
      syncStatus: "pending" as const,
      syncError: "",
      updatedAt: now,
    };

    let insertedResponseId: number | null = null;
    if (invite) {
      await db
        .insert(rsvpResponses)
        .values(responseValues)
        .onConflictDoUpdate({
          target: rsvpResponses.inviteId,
          set: responseValues,
        });
    } else {
      const [inserted] = await db
        .insert(rsvpResponses)
        .values(responseValues)
        .returning({ id: rsvpResponses.id });
      insertedResponseId = inserted?.id ?? null;
      if (insertedResponseId === null) throw new Error("RSVP insert returned no ID");
    }

    const { makeWebhookUrl } = getWeddingRuntimeConfig();
    let syncStatus: "synced" | "pending" | "not_configured" = makeWebhookUrl
      ? "pending"
      : "not_configured";
    let syncError = "";

    if (makeWebhookUrl) {
      try {
        const webhookResponse = await fetch(makeWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schemaVersion: 3,
            event: "rsvp.updated",
            inviteId: invite?.inviteId ?? null,
            lookupColumn: invite ? "I" : null,
            lookupValue: invite?.inviteId ?? null,
            sourceSheet: invite?.sourceSheet ?? null,
            rowNumber: invite?.sourceRow ?? null,
            firstName: invite?.firstName ?? null,
            invitedName: invite?.fullName ?? null,
            submittedName: fullName,
            attendance,
            attendanceHe: attendance === "yes" ? "מאשרים" : "לא מגיעים",
            guestCount,
            maxGuests: null,
            message,
            submittedAt: formatWebhookDateTime(now),
          }),
          signal: AbortSignal.timeout(7_000),
        });
        if (!webhookResponse.ok) {
          throw new Error(`Webhook returned ${webhookResponse.status}`);
        }
        syncStatus = "synced";
      } catch (error) {
        syncError = error instanceof Error ? error.message.slice(0, 250) : "Webhook failed";
      }
    }

    const match = invite
      ? eq(rsvpResponses.inviteId, invite.inviteId)
      : eq(rsvpResponses.id, insertedResponseId!);
    await db
      .update(rsvpResponses)
      .set({ syncStatus, syncError, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(match);

    return Response.json({ ok: true, synced: syncStatus === "synced" }, { status: 201 });
  } catch (error) {
    console.error("RSVP submission failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json(
      { error: "לא הצלחנו לשמור את האישור כרגע. נסו שוב בעוד רגע." },
      { status: 500 },
    );
  }
}
