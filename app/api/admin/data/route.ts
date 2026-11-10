import { getAdminApiUser } from "@/lib/admin-auth";
import { loadAdminData } from "@/lib/admin-data";

export async function GET() {
  const authorization = await getAdminApiUser();
  if (authorization.response) return authorization.response;
  const data = await loadAdminData();
  return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
