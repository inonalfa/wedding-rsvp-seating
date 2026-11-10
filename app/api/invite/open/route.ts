import { eq, sql } from "drizzle-orm";
import { ensureRsvpSchema, getDb } from "@/db";
import { inviteVisits } from "@/db/schema";
import { decodeInviteToken } from "@/lib/invite-token";
import { getWeddingRuntimeConfig } from "@/lib/runtime-config";
import { formatWebhookDateTime } from "@/lib/webhook-date";

type InviteOpenRequest = {
  inviteToken?: unknown;
};

function cleanToken(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 1600) : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InviteOpenRequest;
    const token = cleanToken(body.inviteToken);
    if (!token) return Response.json({ error: "קישור ההזמנה אינו תקין" }, { status: 400 });

    const invite = await decodeInviteToken(token);
    await ensureRsvpSchema();
    const db = getDb();
    const now = new Date().toISOString();

    await db
      .insert(inviteVisits)
      .values({
        inviteId: invite.inviteId,
        firstName: invite.firstName,
        sourceSheet: invite.sourceSheet,
        sourceRow: invite.sourceRow,
        firstOpenedAt: now,
        lastOpenedAt: now,
        openCount: 1,
        syncStatus: "pending",
        syncError: "",
      })
      .onConflictDoUpdate({
        target: inviteVisits.inviteId,
        set: {
          firstName: invite.firstName,
          sourceSheet: invite.sourceSheet,
          sourceRow: invite.sourceRow,
          lastOpenedAt: now,
          openCount: sql`${inviteVisits.openCount} + 1`,
          syncStatus: "pending",
          syncError: "",
        },
      });

    const [visit] = await db
      .select({
        firstOpenedAt: inviteVisits.firstOpenedAt,
        lastOpenedAt: inviteVisits.lastOpenedAt,
        openCount: inviteVisits.openCount,
      })
      .from(inviteVisits)
      .where(eq(inviteVisits.inviteId, invite.inviteId))
      .limit(1);
    if (!visit) throw new Error("Invite visit was not persisted");

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
            schemaVersion: 2,
            event: "invite.opened",
            inviteId: invite.inviteId,
            lookupColumn: "I",
            lookupValue: invite.inviteId,
            sourceSheet: invite.sourceSheet,
            rowNumber: invite.sourceRow,
            firstName: invite.firstName,
            opened: "כן",
            firstOpenedAt: formatWebhookDateTime(visit.firstOpenedAt),
            lastOpenedAt: formatWebhookDateTime(visit.lastOpenedAt),
            openCount: visit.openCount,
          }),
          signal: AbortSignal.timeout(5_000),
        });
        if (!webhookResponse.ok) throw new Error(`Webhook returned ${webhookResponse.status}`);
        syncStatus = "synced";
      } catch (error) {
        syncError = error instanceof Error ? error.message.slice(0, 250) : "Webhook failed";
      }
    }

    await db
      .update(inviteVisits)
      .set({ syncStatus, syncError })
      .where(eq(inviteVisits.inviteId, invite.inviteId));

    return Response.json({ ok: true, synced: syncStatus === "synced" }, { status: 201 });
  } catch (error) {
    console.error("Invite open tracking failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "לא הצלחנו לרשום את פתיחת ההזמנה" }, { status: 500 });
  }
}
