import {eventConfig} from './event-config';
import { getD1Binding } from '@/db';
import { resolveInviteId } from '@/lib/invite-resolution';
import { getWeddingRuntimeConfig } from "@/lib/runtime-config";

export type InviteDetails = {
  inviteId: string;
  firstName: string;
  fullName: string;
  maxGuests: number;
  sourceSheet: string;
  sourceRow: number | null;
};

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createShortInviteToken(details: InviteDetails): Promise<string> {
  const { inviteShortTokenSecret } = getWeddingRuntimeConfig();
  if (!inviteShortTokenSecret) throw new Error("Short invite token secret is unavailable");
  if (!isInviteDetails(details)) throw new Error("Invalid invite details");

  const sourceCode = details.sourceSheet === eventConfig.sheetNames[0]
    ? 0
    : details.sourceSheet === eventConfig.sheetNames[1]
      ? 1
      : -1;
  if (sourceCode < 0) throw new Error("Invalid invite source");

  const inviteIdBytes = new TextEncoder().encode(details.inviteId);
  const nameBytes = new TextEncoder().encode(details.firstName);
  if (inviteIdBytes.length < 3 || inviteIdBytes.length > 64) throw new Error("Invalid invite id");
  const ttl = Number(getWeddingRuntimeConfig().inviteTokenTtlSeconds ?? 90 * 24 * 60 * 60);
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 365 * 24 * 60 * 60) throw new Error("Invalid invitation TTL");
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const payload = new Uint8Array(8 + inviteIdBytes.length + nameBytes.length);
  payload[0] = 3;
  payload[1] = sourceCode;
  payload[2] = details.maxGuests;
  payload[3] = inviteIdBytes.length;
  new DataView(payload.buffer).setUint32(4, expires);
  payload.set(inviteIdBytes, 8);
  payload.set(nameBytes, 8 + inviteIdBytes.length);

  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64Url(inviteShortTokenSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  const packed = new Uint8Array(payload.length + 16);
  packed.set(payload);
  packed.set(signature.slice(0, 16), payload.length);
  return encodeBase64Url(packed);
}

async function decodeShortInviteToken(token: string, secret: string): Promise<InviteDetails> {
  const packed = decodeBase64Url(token);
  const tagLength = packed[0] === 3 ? 16 : 8;
  if (packed.length < 15) throw new Error("Malformed short invite token");

  const payload = packed.slice(0, -tagLength);
  const suppliedTag = packed.slice(-tagLength);
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64Url(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedSignature = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  let difference = 0;
  for (let index = 0; index < tagLength; index += 1) {
    difference |= suppliedTag[index] ^ expectedSignature[index];
  }
  if (difference !== 0) throw new Error("Invalid short invite signature");

  const version = payload[0];
  const sourceCode = payload[1];
  if (sourceCode !== 0 && sourceCode !== 1) throw new Error("Invalid short invite payload");

  if (version === 1) {
    const sourceRow = (payload[2] << 8) | payload[3];
    const maxGuests = payload[4];
    const firstName = new TextDecoder("utf-8", { fatal: true }).decode(payload.slice(5)).trim();
    if (sourceRow < 2 || maxGuests < 1 || maxGuests > 20 || !firstName || firstName.length > 80) {
      throw new Error("Invalid short invite payload");
    }
    const side = eventConfig.legacyInviteSides[sourceCode];
    return {
      inviteId: `${side}-${String(sourceRow).padStart(4, "0")}`,
      firstName,
      fullName: firstName,
      maxGuests,
      sourceSheet: sourceCode === 0 ? eventConfig.sheetNames[0] : eventConfig.sheetNames[1],
      sourceRow,
    };
  }

  if (version === 2 || version === 3) {
    const headerLength = version === 3 ? 8 : 4;
    if (version === 3 && (payload.length < 9 || new DataView(payload.buffer).getUint32(4) <= Math.floor(Date.now() / 1000))) throw new Error("Invitation expired");
    const maxGuests = payload[2];
    const inviteIdLength = payload[3];
    if (inviteIdLength < 3 || inviteIdLength > 64 || headerLength + inviteIdLength >= payload.length) {
      throw new Error("Invalid short invite payload");
    }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const inviteId = decoder.decode(payload.slice(headerLength, headerLength + inviteIdLength)).trim();
    const firstName = decoder.decode(payload.slice(headerLength + inviteIdLength)).trim();
    if (
      !(eventConfig.inviteIdPrefixes.some(prefix => inviteId.startsWith(`${prefix}-`) && /^[A-Za-z0-9_-]{6,32}$/.test(inviteId.slice(prefix.length + 1))) ||
        (getWeddingRuntimeConfig().demoMode && /^demo-[ab]-[1-3]$/.test(inviteId))) ||
      maxGuests < 0 ||
      maxGuests > 20 ||
      !firstName ||
      firstName.length > 80
    ) {
      throw new Error("Invalid short invite payload");
    }
    return {
      inviteId,
      firstName,
      fullName: firstName,
      maxGuests,
      sourceSheet: sourceCode === 0 ? eventConfig.sheetNames[0] : eventConfig.sheetNames[1],
      sourceRow: null,
    };
  }

  throw new Error("Unsupported short invite token version");
}

export function createStableInviteId(sourceSheet: string) {
  const prefix = sourceSheet === eventConfig.sheetNames[0]
    ? eventConfig.inviteIdPrefixes[0]
    : sourceSheet === eventConfig.sheetNames[1]
      ? eventConfig.inviteIdPrefixes[1]
      : "";
  if (!prefix) throw new Error("Invalid invite source");
  const randomBytes = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}-${encodeBase64Url(randomBytes)}`;
}

function isInviteDetails(value: unknown): value is InviteDetails {
  if (!value || typeof value !== "object") return false;
  const invite = value as Record<string, unknown>;
  return (
    typeof invite.inviteId === "string" &&
    typeof invite.firstName === "string" &&
    typeof invite.fullName === "string" &&
    Number.isInteger(invite.maxGuests) &&
    Number(invite.maxGuests) >= 0 &&
    Number(invite.maxGuests) <= 20 &&
    typeof invite.sourceSheet === "string" &&
    (invite.sourceRow === null ||
      (Number.isInteger(invite.sourceRow) && Number(invite.sourceRow) >= 2))
  );
}

async function decodeOriginalInviteToken(token: string): Promise<InviteDetails> {
  const { inviteTokenSecret, inviteShortTokenSecret } = getWeddingRuntimeConfig();

  if (!inviteTokenSecret && !inviteShortTokenSecret && token === "preview") {
    return {
      inviteId: "preview-invite",
      firstName: eventConfig.previewGuestName.split(' ')[0],
      fullName: eventConfig.previewGuestName,
      maxGuests: 3,
      sourceSheet: eventConfig.sheetNames[0],
      sourceRow: 2,
    };
  }

  if (!token.includes(".")) {
    if (!inviteShortTokenSecret) throw new Error("Short invite token secret is unavailable");
    return decodeShortInviteToken(token, inviteShortTokenSecret);
  }

  if (!inviteTokenSecret) throw new Error("Invite token secret is unavailable");
  const [ivPart, cipherPart] = token.split(".");
  if (!ivPart || !cipherPart) throw new Error("Malformed invite token");

  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64Url(inviteTokenSecret),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(ivPart) },
    key,
    decodeBase64Url(cipherPart),
  );
  const invite = JSON.parse(new TextDecoder().decode(decrypted)) as unknown;
  if (!isInviteDetails(invite)) throw new Error("Invalid invite payload");
  return invite;
}

export async function decodeInviteToken(token:string):Promise<InviteDetails> {
 const deadline=getWeddingRuntimeConfig().inviteTokensExpireAt;
 if(deadline && (!Number.isFinite(Date.parse(deadline)) || Date.now()>=Date.parse(deadline)))throw new Error('Invitations expired');
 const details=await decodeOriginalInviteToken(token);
 if(token==='preview')return details;
 const canonicalId=await resolveInviteId(details.inviteId);
 if(canonicalId===details.inviteId)return details;
 const source=await getD1Binding().prepare('SELECT document FROM seating_sources WHERE id=1').first<{document:string}>();
 for(const range of source?JSON.parse(source.document):[])for(const [index,row] of (range.values??[]).entries())if(index>0&&String(row[8]??'').trim()===canonicalId){const sourceSheet=range.range.startsWith(`'${eventConfig.sheetNames[1]}'!`)||range.range.startsWith(`${eventConfig.sheetNames[1]}!`)?eventConfig.sheetNames[1]:eventConfig.sheetNames[0];return {...details,inviteId:canonicalId,firstName:String(row[1]??'').trim(),fullName:[row[1],row[2]].filter(Boolean).join(' '),sourceSheet,sourceRow:index+1};}
 throw new Error('לא נמצאה ההזמנה שאליה אוחד הקישור');
}
