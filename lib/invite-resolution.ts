import { getD1Binding } from '@/db';
export async function resolveInviteId(inviteId:string) {
 const db=getD1Binding();const resolution=await db.prepare('SELECT canonical_id FROM rsvp_invite_resolutions WHERE invite_id=?').bind(inviteId).first<{canonical_id:string|null}>();
 if(!resolution)return inviteId;
 if(!resolution.canonical_id)throw new Error('הקישור הזה הוצא מרשימת ההזמנות');
 return resolution.canonical_id;
}
