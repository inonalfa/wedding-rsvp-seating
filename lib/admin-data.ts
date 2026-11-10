import { desc } from "drizzle-orm";
import { ensureRsvpSchema, getDb, getD1Binding } from "@/db";
import { adultsNoteExclusions, generatedInvites, inviteVisits, rsvpResponses, rsvps } from "@/db/schema";

export async function loadAdminData() {
  await ensureRsvpSchema();
  const db = getDb();
  const [responses, visits, invites, legacyResponses, exclusions] = await Promise.all([
    db.select().from(rsvpResponses).orderBy(desc(rsvpResponses.updatedAt)).limit(500),
    db.select().from(inviteVisits).orderBy(desc(inviteVisits.lastOpenedAt)).limit(500),
    db.select().from(generatedInvites).orderBy(desc(generatedInvites.updatedAt)).limit(500),
    db.select().from(rsvps).orderBy(desc(rsvps.updatedAt)).limit(500),
    db.select().from(adultsNoteExclusions).orderBy(desc(adultsNoteExclusions.createdAt)).limit(500),
  ]);

  const resolutions=(await getD1Binding().prepare('SELECT invite_id,canonical_id FROM rsvp_invite_resolutions').all<{invite_id:string;canonical_id:string|null}>()).results;
  const map=new Map(resolutions.map(r=>[r.invite_id,r.canonical_id]));
  const mergedVisits=new Map<string,typeof visits[number]>();
  for(const visit of visits){const canonical=map.has(visit.inviteId)?map.get(visit.inviteId):visit.inviteId;if(!canonical)continue;const existing=mergedVisits.get(canonical);const target=visits.find(v=>v.inviteId===canonical);const normalized={...visit,inviteId:canonical,firstName:target?.firstName??visit.firstName,sourceSheet:target?.sourceSheet??visit.sourceSheet,sourceRow:target?.sourceRow??visit.sourceRow};mergedVisits.set(canonical,existing?{...existing,openCount:existing.openCount+visit.openCount,firstOpenedAt:[existing.firstOpenedAt,visit.firstOpenedAt].sort()[0],lastOpenedAt:[existing.lastOpenedAt,visit.lastOpenedAt].sort().at(-1)!}:normalized);}
  return { responses:responses.filter(r=>!r.inviteId||!map.has(r.inviteId)), visits:[...mergedVisits.values()], invites:invites.filter(r=>!map.has(r.inviteId)), legacyResponses, exclusions };
}
