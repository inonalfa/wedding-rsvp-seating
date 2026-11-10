import { getD1Binding } from '@/db';
import { loadSeatingData } from '@/lib/seating-data';
import { parseCallGuests, composeCallNotes } from '@/lib/calls-model';
const columns = {
  rsvp_responses: ['id','invite_id','first_name','invited_name','full_name','phone','attendance','guest_count','max_guests','message','source_sheet','source_row','sync_status','sync_error','submitted_at','updated_at'],
  rsvps: ['id','full_name','phone','attendance','guest_count','message','submitted_at','updated_at'],
  call_tasks: ['invite_id','caller_id','call_status','retry_at','version','updated_at'],
  rsvp_invite_resolutions: ['invite_id','canonical_id','reconciliation_id'],
};
type Row = Record<string, string|number|null>;
export type Decision = {table:'rsvp_responses'|'rsvps';id:number;action:'exclude'|'merge';targetId?:string};
async function snapshot() {
 const db=getD1Binding();
 const source=await db.prepare('SELECT document,fetched_at FROM seating_sources WHERE id=1').first<{document:string;fetched_at:string}>();
 if(!source||Date.now()-Date.parse(source.fetched_at)>120_000)throw new Error('יש לרענן את נתוני השיטס לפני הסנכרון');
 const tables={} as Record<keyof typeof columns,Row[]>;
 for(const table of Object.keys(columns) as (keyof typeof columns)[]) tables[table]=(await db.prepare(`SELECT ${columns[table].join(',')} FROM ${table} ORDER BY ${columns[table][0]}`).all<Row>()).results;
 const guests=parseCallGuests(JSON.parse(source.document));
 for(const g of guests)if(g.attendance!=='pending'&&(g.id.includes(':row:')||g.attendance==='yes'&&(!Number.isSafeInteger(g.count)||g.count<1)))throw new Error('חסר מזהה או מספר מאשרים תקין בשיטס');
 // parseCallGuests falls back to the invited count. An actual confirmation must be explicit.
 for(const range of JSON.parse(source.document))for(const row of (range.values??[]).slice(1))if(String(row[9]??'').trim()==='מאשרים'&&(!String(row[10]??'').trim()||!Number.isSafeInteger(Number(row[10]))||Number(row[10])<1))throw new Error('יש אישור הגעה ללא מספר מאשרים בשיטס. נדרשת הכרעה לפני הסנכרון.');
 const document=JSON.stringify({source,tables});
 const revision=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(document)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 return {source,tables,guests,revision};
}
export async function previewReconciliation(refresh=true) {
 if(refresh){const source=await loadSeatingData(true);if(source.warning)throw new Error('הרענון מהשיטס נכשל. לא יבוצע סנכרון מנתונים ישנים.');}
 const state=await snapshot();const ids=new Set(state.guests.map(g=>g.id));
 const unknown=state.tables.rsvp_responses.filter(r=>!r.invite_id||!ids.has(String(r.invite_id))).map(r=>({table:'rsvp_responses' as const,id:Number(r.id),name:r.full_name,inviteId:r.invite_id,attendance:r.attendance,count:r.guest_count}));
 const legacy=state.tables.rsvps.map(r=>({table:'rsvps' as const,id:Number(r.id),name:r.full_name,inviteId:null,attendance:r.attendance,count:r.guest_count}));
 return {revision:state.revision,fetchedAt:state.source.fetched_at,totals:{coming:state.guests.filter(g=>g.attendance==='yes').length,people:state.guests.reduce((s,g)=>s+(g.attendance==='yes'?g.count:0),0),declined:state.guests.filter(g=>g.attendance==='no').length},unknown:[...unknown,...legacy],targets:state.guests.map(g=>({id:g.id,name:g.name,sheet:g.sourceSheet,attendance:g.attendance})),missingIds:state.guests.filter(g=>g.id.includes(':row:')).map(g=>g.name)};
}
export async function applyReconciliation(revision:string,decisions:Decision[],actor:string) {
 const state=await snapshot();if(revision!==state.revision)throw new Error('הנתונים השתנו מאז הבדיקה. יש לרענן ולבדוק שוב.');
 const db=getD1Binding(),now=new Date().toISOString(),id=crypto.randomUUID();const byId=new Map(state.guests.map(g=>[g.id,g]));const seen=new Set<string>();
 for(const d of decisions){if(!['rsvp_responses','rsvps'].includes(d.table)||!Number.isSafeInteger(d.id)||!['exclude','merge'].includes(d.action)||seen.has(d.table+':'+d.id))throw new Error('החלטה לא תקינה');seen.add(d.table+':'+d.id);const r=state.tables[d.table].find(r=>r.id===d.id);if(!r||d.table==='rsvp_responses'&&r.invite_id&&byId.has(String(r.invite_id)))throw new Error('ניתן להכריע רק ברשומה ללא התאמה בשיטס');if(d.action==='merge'&&(!r.invite_id||!d.targetId||!byId.has(d.targetId)||d.table!=='rsvp_responses'||state.tables.rsvp_invite_resolutions.some(r=>r.invite_id===d.targetId)))throw new Error('יש לבחור מזהה יעד תקין מהשיטס');}
 // An atomic SQL guard checks the complete live records, not only their timestamps.
 const guards=['(SELECT document FROM seating_sources WHERE id=1)=?'];const binds:unknown[]=[state.source.document];
 for(const table of Object.keys(columns) as (keyof typeof columns)[]){const c=columns[table];guards.push(`(SELECT json_group_array(json_object(${c.map(k=>`'${k}',${k}`).join(',')})) FROM (SELECT ${c.join(',')} FROM ${table} ORDER BY ${c[0]}))=?`);binds.push(JSON.stringify(state.tables[table]));}
 const statements=[db.prepare(`INSERT INTO rsvp_reconciliations (id,actor,before_document,source_document,decisions_document,created_at) VALUES (?,?,CASE WHEN ${guards.join(' AND ')} THEN ? ELSE NULL END,?,?,?)`).bind(id,actor,...binds,JSON.stringify(state.tables),state.source.document,JSON.stringify(decisions),now)];
 const resolved=new Set<number>();
 for(const d of decisions){const r=state.tables[d.table].find(r=>r.id===d.id)!;resolved.add(d.table==='rsvp_responses'?d.id:-d.id);if(r.invite_id)statements.push(db.prepare('INSERT INTO rsvp_invite_resolutions (invite_id,canonical_id,reconciliation_id) VALUES (?,?,?) ON CONFLICT(invite_id) DO UPDATE SET canonical_id=excluded.canonical_id,reconciliation_id=excluded.reconciliation_id').bind(r.invite_id,d.action==='merge'?d.targetId:null,id));statements.push(db.prepare(`DELETE FROM ${d.table} WHERE id=?`).bind(d.id));}
 let updated=0,imported=0,pending=0;
 for(const g of state.guests){const r=state.tables.rsvp_responses.find(r=>r.invite_id===g.id);if(g.attendance==='pending'){if(r){statements.push(db.prepare('DELETE FROM rsvp_responses WHERE id=?').bind(r.id));pending++;}continue;}
  if(!r){statements.push(db.prepare("INSERT INTO rsvp_responses (invite_id,first_name,invited_name,full_name,phone,attendance,guest_count,max_guests,message,source_sheet,source_row,sync_status,sync_error,updated_at) VALUES (?,?,?,?,?,?,?,0,?,?,?,'synced','',?)").bind(g.id,g.firstName,g.name,g.name,g.phone||null,g.attendance,g.attendance==='yes'?g.count:0,composeCallNotes(g.notes,g.vegetarian),g.sourceSheet,g.sourceRow,now));imported++;}
  else if(r.attendance!==g.attendance||Number(r.guest_count)!==(g.attendance==='yes'?g.count:0)||r.sync_status!=='synced'){statements.push(db.prepare("UPDATE rsvp_responses SET attendance=?,guest_count=?,source_sheet=?,source_row=?,sync_status='synced',sync_error='',updated_at=? WHERE id=?").bind(g.attendance,g.attendance==='yes'?g.count:0,g.sourceSheet,g.sourceRow,now,r.id));updated++;}
  const t=state.tables.call_tasks.find(t=>t.invite_id===g.id);if(t&&(t.call_status==='yes'||t.call_status==='no')&&(t.call_status!==g.attendance||r?.attendance!==g.attendance||Number(r?.guest_count)!==g.count))statements.push(db.prepare('UPDATE call_tasks SET call_status=?,retry_at=NULL,version=version+1,updated_at=? WHERE invite_id=?').bind(g.attendance,now,g.id));
 }
 // Approval local states on pending Sheet guests must stop forcing an old RSVP.
 for(const g of state.guests.filter(g=>g.attendance==='pending')){const t=state.tables.call_tasks.find(t=>t.invite_id===g.id);if(t&&(t.call_status==='yes'||t.call_status==='no'))statements.push(db.prepare('UPDATE call_tasks SET call_status=NULL,retry_at=NULL,version=version+1,updated_at=? WHERE invite_id=?').bind(now,g.id));}
 await db.batch(statements);
 return {ok:true,reconciliationId:id,updated,imported,returnedToPending:pending,resolved:decisions.length,unresolved:state.tables.rsvp_responses.filter(r=>!resolved.has(Number(r.id))&&(!r.invite_id||!byId.has(String(r.invite_id)))).map(r=>({id:r.id,name:r.full_name,count:r.guest_count,attendance:r.attendance}))};
}
