import { getD1Binding } from '@/db';
import { getWeddingRuntimeConfig } from '@/lib/runtime-config';
import { formatWebhookDateTime } from '@/lib/webhook-date';
export type RsvpUpdate = { inviteId: string; firstName: string; fullName: string; phone: string; attendance: 'yes'|'no'; guestCount: number; sourceSheet: string; sourceRow: number; message: string };
export async function saveCallRsvp(update: RsvpUpdate) {
  const db = getD1Binding(); const now = new Date().toISOString();
  const webhook = getWeddingRuntimeConfig().makeWebhookUrl;
  if (!webhook) throw new Error('החיבור לעדכון אישורי ההגעה אינו זמין כרגע. נסו שוב מאוחר יותר.');
  await db.prepare(`INSERT INTO rsvp_responses (invite_id, first_name, invited_name, full_name, phone, attendance, guest_count, max_guests, source_sheet, source_row, message, sync_status, sync_error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'pending', '', ?)
    ON CONFLICT(invite_id) DO UPDATE SET first_name=excluded.first_name, invited_name=excluded.invited_name, full_name=excluded.full_name, phone=excluded.phone, attendance=excluded.attendance, guest_count=excluded.guest_count, source_sheet=excluded.source_sheet, source_row=excluded.source_row, message=excluded.message, sync_status='pending', sync_error='', updated_at=excluded.updated_at`)
    .bind(update.inviteId,update.firstName,update.fullName,update.fullName,update.phone,update.attendance,update.guestCount,update.sourceSheet,update.sourceRow,update.message,now).run();
  const saved = await db.prepare('SELECT message FROM rsvp_responses WHERE invite_id=?').bind(update.inviteId).first<{message:string}>();
  let synced = false; let syncError = '';
  try {
    const response = await fetch(webhook, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      schemaVersion:3,event:'rsvp.updated',source:'phone',inviteId:update.inviteId,lookupColumn:'I',lookupValue:update.inviteId,
      sourceSheet:update.sourceSheet,rowNumber:update.sourceRow,firstName:update.firstName,invitedName:update.fullName,submittedName:update.fullName,
      attendance:update.attendance,attendanceHe:update.attendance==='yes'?'מאשרים':'לא מגיעים',guestCount:update.guestCount,maxGuests:null,
      message:saved?.message??'',submittedAt:formatWebhookDateTime(now),
    }),signal:AbortSignal.timeout(7_000)});
    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
    synced = true;
  } catch (error) {syncError=error instanceof Error?error.message.slice(0,250):'Webhook failed';}
  await db.prepare('UPDATE rsvp_responses SET sync_status=?,sync_error=? WHERE invite_id=? AND updated_at=?').bind(synced?'synced':'pending',syncError,update.inviteId,now).run();
  return {synced};
}
