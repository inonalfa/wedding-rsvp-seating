import { getD1Binding } from '@/db';
import { loadSeatingData } from '@/lib/seating-data';
import { DEFAULT_CALL_OPENING, parseCallGuests, splitCallNotes, type CallsData, type Caller, type CallGuest } from '@/lib/calls-model';
export async function hashCallToken(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function createCallToken() {return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function findCaller(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return getD1Binding().prepare('SELECT id,name FROM call_agents WHERE token_hash=? AND active=1').bind(await hashCallToken(token)).first<Caller>();
}
export async function loadCallsData(refresh=false, caller?: Caller, includeDeclined=false): Promise<CallsData> {
  const source = await loadSeatingData(refresh); const db = getD1Binding();
  const cached = await db.prepare('SELECT document FROM seating_sources WHERE id=1').first<{document:string}>();
  const guests = parseCallGuests(cached?JSON.parse(cached.document):[]);
  const [tasks, responses, agents, settings, history] = await Promise.all([
    db.prepare('SELECT invite_id,caller_id,call_status,retry_at,version FROM call_tasks').all<{invite_id:string;caller_id:string|null;call_status:string|null;retry_at:string|null;version:number}>(),
    db.prepare('SELECT invite_id,attendance,guest_count,message,sync_status,updated_at FROM rsvp_responses WHERE invite_id IS NOT NULL').all<{invite_id:string;attendance:'yes'|'no';guest_count:number;message:string;sync_status:string;updated_at:string}>(),
    caller?Promise.resolve({results:[]}):db.prepare('SELECT id,name,share_token FROM call_agents WHERE active=1 ORDER BY created_at').all<{id:string;name:string;share_token:string}>(),
    db.prepare('SELECT opening_script,revision FROM call_settings WHERE id=1').first<{opening_script:string;revision:number}>(),
    (caller
      ? db.prepare('SELECT h.id,h.invite_id,h.caller_name,h.phone,h.clicked_at FROM call_attempts h JOIN call_tasks t ON t.invite_id=h.invite_id WHERE t.caller_id=? ORDER BY h.clicked_at DESC').bind(caller.id)
      : db.prepare('SELECT id,invite_id,caller_name,phone,clicked_at FROM call_attempts ORDER BY clicked_at DESC')
    ).all<{id:string;invite_id:string;caller_name:string;phone:string;clicked_at:string}>(),
  ]);
  const taskMap=new Map(tasks.results.map(t=>[t.invite_id,t]));const responseMap=new Map(responses.results.map(r=>[r.invite_id,r]));
  const rows = guests.map(g=>{
    const t=taskMap.get(g.id);const r=responseMap.get(g.id);
    if(t){g.callerId=t.caller_id;g.callStatus=t.call_status;g.retryAt=t.retry_at;g.version=t.version;}
    if(r && (r.sync_status!=='synced' || t?.call_status==='yes' || t?.call_status==='no' || Date.parse(r.updated_at.replace(' ','T')+(r.updated_at.includes('T')?'':'Z'))>=Date.parse(source.fetchedAt??'1970-01-01'))) {g.attendance=r.attendance;g.count=r.guest_count;Object.assign(g,splitCallNotes(r.message));}
    g.syncPending=!!r && r.sync_status!=='synced';return g;
  }).filter(g=>(includeDeclined||g.attendance!=='no')&&(caller?g.callerId===caller.id:g.attendance!=='yes'||taskMap.has(g.id)));
  const visibleIds=new Set(rows.map(g=>g.id));
  return {openingScript:settings?.opening_script??DEFAULT_CALL_OPENING,scriptRevision:settings?.revision??0,callHistory:history.results.filter(h=>visibleIds.has(h.invite_id)).map(h=>({id:h.id,inviteId:h.invite_id,callerName:h.caller_name,phone:h.phone,clickedAt:h.clicked_at})),guests:rows,callers:agents.results.map(a=>({id:a.id,name:a.name,shareToken:a.share_token})),callerName:caller?.name,warning:source.warning,fetchedAt:source.fetchedAt};
}
export async function findCallGuest(id: string, caller?: Caller): Promise<CallGuest|null> {return (await loadCallsData(false,caller,true)).guests.find(g=>g.id===id)??null;}
