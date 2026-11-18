import { getWeddingRuntimeConfig, type WeddingRuntimeConfig } from "@/lib/runtime-config";

/** Real events require a signed invite unless the operator explicitly opts out. */
export function personalInviteRequired(config: WeddingRuntimeConfig = getWeddingRuntimeConfig()) {
  const flag = config.requireInviteToken?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  return true;
}
