import {eventConfig} from '@/lib/event-config';
import { sql } from "drizzle-orm";
import { ensureRsvpSchema, getDb } from "@/db";
import { generatedInvites } from "@/db/schema";
import { getAdminApiUser } from "@/lib/admin-auth";
import { createShortInviteToken, createStableInviteId, type InviteDetails } from "@/lib/invite-token";

type CreateInviteRequest = {
  firstName?: unknown;
  sourceSheet?: unknown;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  const authorization = await getAdminApiUser();
  if (authorization.response) return authorization.response;

  const requestOrigin = request.headers.get("Origin");
  const siteOrigin = new URL(request.url).origin;
  if (requestOrigin && requestOrigin !== siteOrigin) {
    return Response.json({ error: "בקשה ממקור לא מורשה" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as CreateInviteRequest;
    const firstName = cleanText(body.firstName, 80);
    const sourceSheet = cleanText(body.sourceSheet, 40);
    if (firstName.length < 2) {
      return Response.json({ error: "יש להזין שם פרטי" }, { status: 400 });
    }
    if (sourceSheet !== eventConfig.sheetNames[0] && sourceSheet !== eventConfig.sheetNames[1]) {
      return Response.json({ error: "יש לבחור לשונית תקינה" }, { status: 400 });
    }
    const inviteId = createStableInviteId(sourceSheet);
    const details: InviteDetails = {
      inviteId,
      firstName,
      fullName: firstName,
      maxGuests: 0,
      sourceSheet,
      sourceRow: null,
    };
    const token = await createShortInviteToken(details);
    const shortLink = `${siteOrigin}/i/${token}`;
    const now = new Date().toISOString();

    await ensureRsvpSchema();
    const db = getDb();
    const values = {
      inviteId,
      firstName,
      maxGuests: 0,
      sourceSheet,
      shortLink,
      createdBy: authorization.user.email,
      updatedAt: now,
    };
    await db
      .insert(generatedInvites)
      .values(values)
      .onConflictDoUpdate({
        target: generatedInvites.inviteId,
        set: { ...values, updatedAt: sql`CURRENT_TIMESTAMP` },
      });

    return Response.json({ ok: true, inviteId, shortLink }, { status: 201 });
  } catch (error) {
    console.error("Admin invite creation failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "לא הצלחנו ליצור את הקישור" }, { status: 500 });
  }
}
