import { decodeInviteToken } from "@/lib/invite-token";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adultsNoteExclusions } from "@/db/schema";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token || token.length > 1600) {
    return Response.json({ error: "קישור ההזמנה אינו תקין" }, { status: 400 });
  }

  try {
    const invite = await decodeInviteToken(token);
    const excluded = await getDb().select({ token: adultsNoteExclusions.token }).from(adultsNoteExclusions).where(eq(adultsNoteExclusions.token, token)).limit(1);
    return Response.json({ ...invite, hideAdultsNote: excluded.length > 0 }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: "קישור ההזמנה אינו תקין" }, { status: 404 });
  }
}
