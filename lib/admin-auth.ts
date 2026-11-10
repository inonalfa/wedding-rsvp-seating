import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";
import { getWeddingRuntimeConfig } from "@/lib/runtime-config";

export function isAdminEmail(email: string) {
  const { adminEmails, demoMode } = getWeddingRuntimeConfig();
  if (demoMode && email === "demo@example.test") return true;
  const allowed = (adminEmails ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export async function getAdminApiUser(): Promise<
  | { user: ChatGPTUser; response?: never }
  | { user?: never; response: Response }
> {
  const user = await getChatGPTUser();
  if (!user) {
    return { response: Response.json({ error: "נדרשת התחברות" }, { status: 401 }) };
  }
  if (!isAdminEmail(user.email)) {
    return { response: Response.json({ error: "אין הרשאת מנהל" }, { status: 403 }) };
  }
  return { user };
}
