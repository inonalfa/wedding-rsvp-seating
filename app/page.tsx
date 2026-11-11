import HomePage from "./HomePage";
import { demoInviteDetails } from "@/lib/demo-data";
import { createShortInviteToken } from "@/lib/invite-token";
import { getWeddingRuntimeConfig } from "@/lib/runtime-config";

export default async function Page() {
  const config = getWeddingRuntimeConfig();
  if (!config.demoMode) return <HomePage />;

  const token = await createShortInviteToken(demoInviteDetails());
  return <HomePage demoLinks={{
    inviteHref: `/?invite=${encodeURIComponent(token)}#rsvp`,
    tableSearchPublic: !config.demoAuth,
  }} />;
}
