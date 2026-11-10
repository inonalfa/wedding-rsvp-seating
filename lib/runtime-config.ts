import { requestContext } from './request-context';
export type WeddingRuntimeConfig = {
  inviteTokenTtlSeconds?: string;
  inviteTokensExpireAt?: string;
  seatingTokenEpoch?: string;
  inviteTokenSecret?: string;
  inviteShortTokenSecret?: string;
  makeWebhookUrl?: string;
  adminEmails?: string;
  seatingSheetsWebhookUrl?: string;
  whatsappRsvpSecret?: string;
  seatingSyncSecret?: string;
  demoMode?: boolean;
  authMode?: string;
};

export function getWeddingRuntimeConfig(): WeddingRuntimeConfig {
  return requestContext.getStore()?.config ?? {};
}
