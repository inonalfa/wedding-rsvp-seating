import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adultsNoteExclusions } from "@/db/schema";
import { getAdminApiUser } from "@/lib/admin-auth";
import { decodeInviteToken } from "@/lib/invite-token";

function sameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function parseToken(value: unknown, siteOrigin: string) {
  if (typeof value !== "string") return "";
  const input = value.trim();
  if (!input) return "";
  try {
    const url = new URL(input);
    if (url.origin !== siteOrigin) return "";
    const segment = url.pathname.match(/^\/i\/([^/]+)\/?$/)?.[1];
    return (segment ? decodeURIComponent(segment) : url.searchParams.get("invite") || "").trim();
  } catch {
    return input;
  }
}

export async function POST(request: Request) {
  const authorization = await getAdminApiUser();
  if (authorization.response) return authorization.response;
  if (!sameOrigin(request)) return Response.json({ error: "בקשה ממקור לא מורשה" }, { status: 403 });
  try {
    const token = parseToken((await request.json() as { token?: unknown }).token, new URL(request.url).origin);
    if (!token || token.length > 1600) return Response.json({ error: "יש להזין מזהה תקין מסוף קישור ההזמנה" }, { status: 400 });
    await decodeInviteToken(token);
    await getDb().insert(adultsNoteExclusions).values({ token }).onConflictDoNothing();
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
    console.error("Adults note exclusion failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "לא הצלחנו להוסיף את המזהה. בדקו שהקישור תקין ונסו שוב." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const authorization = await getAdminApiUser();
  if (authorization.response) return authorization.response;
  if (!sameOrigin(request)) return Response.json({ error: "בקשה ממקור לא מורשה" }, { status: 403 });
  try {
    const token = (await request.json() as { token?: unknown }).token;
    if (typeof token !== "string" || !token || token.length > 1600) return Response.json({ error: "מזהה לא תקין" }, { status: 400 });
    await getDb().delete(adultsNoteExclusions).where(eq(adultsNoteExclusions.token, token));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Adults note exclusion removal failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "לא הצלחנו להסיר את המזהה" }, { status: 500 });
  }
}
