import { getAdminApiUser } from "@/lib/admin-auth";
import { revokeInvite, setInviteExpiry, validControlInviteId } from "@/lib/invite-access";

type ControlRequest = {
  inviteId?: unknown;
  revoke?: unknown;
  expiresAt?: unknown;
};

export async function POST(request: Request) {
  const authorization = await getAdminApiUser();
  if (authorization.response) return authorization.response;
  const requestOrigin = request.headers.get("Origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return Response.json({ error: "בקשה ממקור לא מורשה" }, { status: 403 });
  }

  let body: ControlRequest;
  try {
    body = await request.json() as ControlRequest;
  } catch {
    return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (!validControlInviteId(body.inviteId)) {
    return Response.json({ error: "מזהה ההזמנה אינו תקין" }, { status: 400 });
  }
  const revoke = body.revoke === true;
  const hasExpiry = Object.prototype.hasOwnProperty.call(body, "expiresAt");
  if (!revoke && !hasExpiry) return Response.json({ error: "בחרו ביטול או תאריך תוקף" }, { status: 400 });

  let expiresAt: number | null = null;
  if (hasExpiry && body.expiresAt !== null) {
    if (typeof body.expiresAt !== "string") return Response.json({ error: "תאריך התוקף אינו תקין" }, { status: 400 });
    const parsed = Date.parse(body.expiresAt);
    const now = Date.now();
    if (!Number.isFinite(parsed) || parsed < now - 86_400_000 * 365 * 5 || parsed > now + 86_400_000 * 365 * 10) {
      return Response.json({ error: "תאריך התוקף אינו תקין" }, { status: 400 });
    }
    expiresAt = Math.floor(parsed / 1000);
  }

  try {
    const revokedAt = revoke ? await revokeInvite(body.inviteId) : null;
    if (hasExpiry) await setInviteExpiry(body.inviteId, body.expiresAt === null ? null : expiresAt);
    return Response.json({ ok: true, inviteId: body.inviteId, revokedAt, expiresAt: hasExpiry ? expiresAt : undefined });
  } catch (error) {
    console.error("Invite control failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "לא הצלחנו לעדכן את הקישור" }, { status: 500 });
  }
}
