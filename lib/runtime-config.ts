import { requestContext } from './request-context';
export type WeddingRuntimeConfig = {
  inviteTokenTtlSeconds?: string;
  inviteTokensExpireAt?: string;
  legacyInviteTtlSeconds?: string;
  seatingTokenEpoch?: string;
  inviteTokenSecret?: string;
  inviteShortTokenSecret?: string;
  makeWebhookUrl?: string;
  makeWebhookHmacSecret?: string;
  adminEmails?: string;
  seatingSheetsWebhookUrl?: string;
  whatsappRsvpSecret?: string;
  seatingSyncSecret?: string;
  demoMode?: boolean;
  demoAuth?: boolean;
  authMode?: string;
  requireInviteToken?: string;
  webhookHmacRequired?: boolean;
};

export function getWeddingRuntimeConfig(): WeddingRuntimeConfig {
  return requestContext.getStore()?.config ?? {};
}
