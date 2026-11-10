// Synthetic contact fixtures only; never use live guest data here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier==='./seating-model'&&context.parentURL?.endsWith('/lib/calls-model.ts')?specifier+'.ts':specifier,context);}});
const { DEFAULT_CALL_OPENING, renderCallOpening, israelDateKey, validFollowupDate, isFollowupScheduled, isWaitingForCall, isCoolingDown, parseCallGuests } = await import('../lib/calls-model.ts');
const { default:worker }=await import('../dist/server/index.js');
const ctx={waitUntil(){},passThroughOnException(){}};
const header=['קטגוריה','שם פרטי','שם משפחה','פלאפון','מספר מוזמנים','מקושר ל','','','','סטטוס הגעה','מספר מאשרים'];
const ranges=[{range:"'מוזמנים דנה'!A1:M5",values:[header,['משפחה','דנה','ישראלי','972500000000',3,'נועה','','','o-abcdef12','',''],['חברים','אורן','כהן','0500000003',2,'טל','','','o-ghijkl12','לא מגיעים',0]]},{range:"'מוזמנים יואב'!A1:M5",values:[header,['משפחה','רן','לוי','0500000004',2,'רוני','','','y-abcdef12','מאשרים',2]]}];
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 sql.prepare('INSERT INTO seating_sources (id,document,fetched_at) VALUES (1,?,?)').run(JSON.stringify(ranges),new Date().toISOString());
 const wrap=(query)=>{let args=[];return {bind(...v){args=v;return this;},async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args),success:true,meta:{}};},async raw(){const stmt=sql.prepare(query);stmt.setReturnArrays(true);return stmt.all(...args);},async run(){const r=sql.prepare(query).run(...args);return {results:[],success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}};};
 const env={AUTH_MODE:'sites',ADMIN_EMAILS:'admin@example.test',MAKE_WEBHOOK_URL:'https://webhook.test/rsvp',ASSETS:{fetch:async()=>new Response('',{status:404})},DB:{prepare:wrap,async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
 const request=(path='/api/admin/calls',method='GET',body,email='admin@example.test',origin='http://localhost')=>worker.fetch(new Request('http://localhost'+path,{method,headers:{...(email?{'oai-authenticated-user-email':email}:{}),origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,ctx);
 const action=async body=>{const r=await request('/api/admin/calls','POST',body);assert.equal(r.status,200,await r.clone().text());return r.json();};
 return {sql,env,request,action};
}
test('phone list parses linked contact, refusal, international phone and exact two-hour boundary',()=>{
 const guests=parseCallGuests(ranges);assert.equal(guests[0].linkedTo,'נועה');assert.equal(guests[0].phone,'0500000000');assert.equal(guests[1].attendance,'no');
 const end=Date.now()+7200000;const g={...guests[0],callStatus:'no_answer',retryAt:new Date(end).toISOString()};
 assert.equal(isWaitingForCall(g,end-1),false);assert.equal(isCoolingDown(g,end-1),true);assert.equal(isWaitingForCall(g,end),true);assert.equal(isWaitingForCall({...g,attendance:'yes'},end),false);assert.equal(isWaitingForCall(guests[1],end),false);
});
test('admin assignment, scoped public read and updates, no-answer isolation, RSVP sync, stale edits and revocation',async()=>{
 const f=fixture();const originalFetch=globalThis.fetch;const sent=[];globalThis.fetch=async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return new Response('Accepted');};
 try {
  assert.equal((await f.request('/api/admin/calls','GET',undefined,'')).status,401);
  assert.equal((await f.request('/api/admin/calls','GET',undefined,'other@example.test')).status,403);
  assert.equal((await f.request('/api/admin/calls','POST',{action:'create_caller',name:'טל'},'admin@example.test','https://bad.test')).status,403);
  let data=await (await f.request()).json();assert.equal(data.guests.length,1);globalThis.fetch=async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return new Response('Accepted');};
  const a=(await f.action({action:'create_caller',name:'נועה'})).caller;const b=(await f.action({action:'create_caller',name:'טל'})).caller;
  await f.action({action:'assign',inviteIds:['o-abcdef12'],callerId:a.id});
  const publicPath='/api/calls/'+a.shareToken;data=await (await f.request(publicPath,'GET',undefined,'')).json();assert.equal(data.guests.length,1);assert.equal(data.guests[0].name,'דנה ישראלי');assert.equal(data.callers.length,0);assert.doesNotMatch(JSON.stringify(data),new RegExp(b.shareToken));
  assert.equal((await f.request(publicPath,'POST',{inviteId:'o-ghijkl12',version:1,status:'yes',guestCount:1},'')).status,404);
  const before=f.sql.prepare('SELECT document FROM seating_sources').get().document;
  const noAnswer=await f.request(publicPath,'POST',{inviteId:'o-abcdef12',version:1,status:'no_answer'},'');assert.equal(noAnswer.status,200);const cool=await noAnswer.json();assert.ok(Math.abs(Date.parse(cool.retryAt)-Date.now()-7200000)<1000);
  assert.equal(sent.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM rsvp_responses').get().n,0);assert.equal(f.sql.prepare('SELECT document FROM seating_sources').get().document,before);
  data=await (await f.request(publicPath,'GET',undefined,'')).json();assert.equal(isWaitingForCall(data.guests[0]),false);
  f.sql.prepare('UPDATE call_tasks SET retry_at=? WHERE invite_id=?').run(new Date(Date.now()-1).toISOString(),'o-abcdef12');data=await (await f.request(publicPath,'GET',undefined,'')).json();assert.equal(isWaitingForCall(data.guests[0]),true);
  assert.equal((await f.request(publicPath,'POST',{inviteId:'o-abcdef12',version:2,status:'yes',guestCount:0},'')).status,400);
  const yes=await f.request(publicPath,'POST',{inviteId:'o-abcdef12',version:2,status:'yes',guestCount:2},'');assert.equal(yes.status,200);assert.equal((await yes.json()).synced,true);
  assert.equal(sent.length,1);assert.equal(sent[0].body.event,'rsvp.updated');assert.equal(sent[0].body.lookupColumn,'I');assert.equal(sent[0].body.attendanceHe,'מאשרים');assert.equal(sent[0].body.guestCount,2);
  const response=f.sql.prepare('SELECT attendance,guest_count,sync_status FROM rsvp_responses').get();assert.equal(response.attendance,'yes');assert.equal(response.guest_count,2);assert.equal(response.sync_status,'synced');
  data=await (await f.request(publicPath,'GET',undefined,'')).json();assert.equal(data.guests[0].attendance,'yes');assert.equal(isWaitingForCall(data.guests[0]),false);
  f.sql.prepare('UPDATE seating_sources SET document=?,fetched_at=?').run(JSON.stringify(ranges),new Date(Date.now()+1000).toISOString());
  const seating=await (await f.request('/api/admin/seating')).json();assert.equal(seating.guests.find(g=>g.id==='o-abcdef12').count,2);assert.equal(seating.guests.find(g=>g.id==='o-abcdef12').attendance,'yes');
  assert.equal((await f.request(publicPath,'POST',{inviteId:'o-abcdef12',version:2,status:'no'},'')).status,409);
  assert.equal((await f.request(publicPath,'POST',{inviteId:'o-abcdef12',version:3,status:'no_answer'},'')).status,409);
  await f.action({action:'assign',inviteIds:['o-abcdef12'],callerId:b.id});assert.equal((await f.request(publicPath,'POST',{inviteId:'o-abcdef12',version:3,status:'no'},'')).status,404);
  await f.action({action:'rotate_link',callerId:a.id});assert.equal((await f.request(publicPath,'GET',undefined,'')).status,404);
  const page=await f.request('/calls/'+b.shareToken,'GET',undefined,'');assert.equal(page.status,200);assert.match(await page.text(),/מחכים לשיחה/);
  assert.equal((await f.request('/admin/calls','GET',undefined,'')).status,307);
 } finally {globalThis.fetch=originalFetch;f.sql.close();}
});
test('failed external sync keeps confirmed RSVP visible and supports an explicit retry',async()=>{
 const f=fixture();const originalFetch=globalThis.fetch;let succeeds=false;globalThis.fetch=async()=>new Response('',{status:succeeds?200:503});
 try{
  const a=(await f.action({action:'create_caller',name:'מתקשר'})).caller;await f.action({action:'assign',inviteIds:['o-abcdef12'],callerId:a.id});const path='/api/calls/'+a.shareToken;
  const result=await f.request(path,'POST',{inviteId:'o-abcdef12',version:1,status:'yes',guestCount:2},'');assert.equal(result.status,200);assert.equal((await result.json()).synced,false);
  let data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.guests[0].attendance,'yes');assert.equal(data.guests[0].syncPending,true);
  succeeds=true;assert.equal((await (await f.request(path,'POST',{inviteId:'o-abcdef12',version:2,status:'yes',guestCount:2},'')).json()).synced,true);
  data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.guests[0].syncPending,false);
  const seating=await (await f.request('/api/admin/seating')).json();assert.equal(seating.guests.some(g=>g.id==='o-abcdef12'),true);
 }finally{globalThis.fetch=originalFetch;f.sql.close();}
});

test('opening script is editable only by admin and fills literal guest and caller names',async()=>{
 const f=fixture();
 try{
  let data=await (await f.request()).json();assert.equal(data.openingScript,DEFAULT_CALL_OPENING);assert.equal(data.scriptRevision,0);
  assert.equal(renderCallOpening(data.openingScript,'דנה','נועה'),'היי דנה מדבר/ת נועה, אני מתקשר/ת כדי לבדוק האם תגיעו לחתונה של דנה ויואב ואם כן כמה תהיו?');
  assert.equal(renderCallOpening('{{שם פרטי אורח}} / {{שם מתקשר}} / {{שם פרטי אורח}}','$&','טל'),'$& / טל / $&');
  const a=(await f.action({action:'create_caller',name:'נועה'})).caller;await f.action({action:'assign',inviteIds:['o-abcdef12'],callerId:a.id});const path='/api/calls/'+a.shareToken;
  assert.equal((await f.request(path,'POST',{action:'save_script',openingScript:'נוסח אסור',revision:0},'')).status,403);
  await f.action({action:'save_script',openingScript:'שלום {{שם פרטי אורח}}, כאן {{שם מתקשר}}. כמה תהיו?',revision:0});
  data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.scriptRevision,1);assert.equal(renderCallOpening(data.openingScript,data.guests[0].firstName,data.callerName),'שלום דנה, כאן נועה. כמה תהיו?');
  assert.equal((await f.request('/api/admin/calls','POST',{action:'save_script',openingScript:'ישן',revision:0})).status,409);
  assert.equal((await f.request('/api/admin/calls','POST',{action:'save_script',openingScript:' ',revision:1})).status,400);
 }finally{f.sql.close();}
});
test('dial history records date, time and actual caller, survives transfer and removal, and never changes RSVP',async()=>{
 const f=fixture();
 try{
  const a=(await f.action({action:'create_caller',name:'נועה'})).caller;const b=(await f.action({action:'create_caller',name:'טל'})).caller;
  await f.action({action:'assign',inviteIds:['o-abcdef12'],callerId:a.id});
  const path='/api/calls/'+a.shareToken;const attemptId=crypto.randomUUID();const payload={action:'record_call',inviteId:'o-abcdef12',attemptId};
  const source=f.sql.prepare('SELECT document FROM seating_sources').get().document;const task=f.sql.prepare('SELECT * FROM call_tasks').get();
  const first=await f.request(path,'POST',payload,'');assert.equal(first.status,200);const recorded=await first.json();assert.ok(Math.abs(Date.parse(recorded.clickedAt)-Date.now())<1000);
  assert.equal((await f.request(path,'POST',payload,'')).status,200);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM call_attempts').get().n,1);
  assert.equal((await f.request(path,'POST',{...payload,inviteId:'o-ghijkl12',attemptId:crypto.randomUUID()},'')).status,404);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM rsvp_responses').get().n,0);assert.deepEqual(f.sql.prepare('SELECT * FROM call_tasks').get(),task);assert.equal(f.sql.prepare('SELECT document FROM seating_sources').get().document,source);
  let data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.callHistory.length,1);assert.equal(data.callHistory[0].callerName,'נועה');assert.equal(data.callHistory[0].phone,'0500000000');
  assert.equal((await f.request(path,'POST',{action:'rename_caller',callerId:a.id,name:'שם אסור',originalName:'נועה'},'')).status,403);
  await f.action({action:'rename_caller',callerId:a.id,name:'נועה טוויזר',originalName:'נועה'});
  data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.callerName,'נועה טוויזר');assert.equal(data.callHistory[0].callerName,'נועה');assert.equal(data.guests.length,1);
  assert.equal((await f.request('/api/admin/calls','POST',{action:'rename_caller',callerId:a.id,name:' ',originalName:'נועה טוויזר'})).status,400);
  assert.equal((await f.request('/api/admin/calls','POST',{action:'rename_caller',callerId:a.id,name:'ישן',originalName:'נועה'})).status,409);
  await f.action({action:'assign',inviteIds:['o-abcdef12'],callerId:b.id});
  data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.guests.length,0);assert.equal(data.callHistory.length,0);
  assert.equal((await f.request(path,'POST',{...payload,attemptId:crypto.randomUUID()},'')).status,404);
  const bpath='/api/calls/'+b.shareToken;data=await (await f.request(bpath,'GET',undefined,'')).json();assert.equal(data.callHistory[0].callerName,'נועה');
  assert.equal((await f.request(bpath,'POST',{...payload,attemptId:crypto.randomUUID()},'')).status,200);
  await f.action({action:'assign',inviteIds:['o-abcdef12'],callerId:null});
  data=await (await f.request(bpath,'GET',undefined,'')).json();assert.equal(data.guests.length,0);assert.equal(data.callHistory.length,0);
  await f.action({...payload,attemptId:crypto.randomUUID()});data=await (await f.request()).json();assert.equal(data.callHistory.length,3);assert.equal(data.guests.find(g=>g.id==='o-abcdef12').callerId,null);assert.equal(data.guests.find(g=>g.id==='o-abcdef12').attendance,'pending');
  assert.equal(data.callHistory.filter(h=>h.callerName==='טל').length,1);assert.equal(data.callHistory.filter(h=>h.callerName==='admin@example.test').length,1);
 }finally{f.sql.close();}
});

test('follow-up calendar dates return to the queue at Israeli midnight and reject invalid or past dates',()=>{
 const g={...parseCallGuests(ranges)[0],callStatus:'follow_up',retryAt:'2026-10-08'};
 const before=Date.parse('2026-10-07T20:59:59Z'),after=Date.parse('2026-10-07T21:00:00Z');
 assert.equal(israelDateKey(before),'2026-10-07');assert.equal(israelDateKey(after),'2026-10-08');
 assert.equal(isFollowupScheduled(g,before),true);assert.equal(isWaitingForCall(g,before),false);assert.equal(isCoolingDown(g,before),false);
 assert.equal(isFollowupScheduled(g,after),false);assert.equal(isWaitingForCall(g,after),true);
 assert.equal(isWaitingForCall({...g,attendance:'no'},after),false);assert.equal(isWaitingForCall({...g,attendance:'yes'},after),false);
 assert.equal(validFollowupDate('2026-10-08',after),true);assert.equal(validFollowupDate('2026-10-07',after),false);
 assert.equal(validFollowupDate('2027-02-30',after),false);assert.equal(validFollowupDate('2027-13-01',after),false);assert.equal(validFollowupDate('',after),false);
});
test('public follow-up is scoped and local, can be rescheduled, and works without a Sheets write connection',async()=>{
 const f=fixture();
 try{
  f.env.MAKE_WEBHOOK_URL=undefined;
  const a=(await f.action({action:'create_caller',name:'מתקשר'})).caller;await f.action({action:'assign',inviteIds:['o-abcdef12'],callerId:a.id});const path='/api/calls/'+a.shareToken;
  const date=israelDateKey(Date.now()+86400000);const date2=israelDateKey(Date.now()+2*86400000);
  const snapshot=f.sql.prepare('SELECT document FROM seating_sources').get().document;
  const payload={inviteId:'o-abcdef12',status:'follow_up',version:1,followupDate:date};
  assert.equal((await f.request(path,'POST',{...payload,followupDate:'2020-01-01'},'')).status,400);
  assert.equal((await f.request(path,'POST',{...payload,followupDate:'2099-02-30'},'')).status,400);
  assert.equal((await f.request(path,'POST',{...payload,inviteId:'o-ghijkl12'},'')).status,404);
  assert.equal((await f.request(path,'POST',payload,'')).status,200);
  let data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.guests[0].callStatus,'follow_up');assert.equal(data.guests[0].retryAt,date);assert.equal(isWaitingForCall(data.guests[0]),false);assert.equal(isFollowupScheduled(data.guests[0]),true);
  assert.equal(f.sql.prepare('SELECT document FROM seating_sources').get().document,snapshot);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM rsvp_responses').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM call_attempts').get().n,0);
  assert.equal((await f.request(path,'POST',{...payload,followupDate:date2},'')).status,409);
  assert.equal((await f.request(path,'POST',{...payload,version:2,followupDate:date2},'')).status,200);
  data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.guests[0].retryAt,date2);
  f.sql.prepare('UPDATE call_tasks SET retry_at=? WHERE invite_id=?').run(israelDateKey(),'o-abcdef12');data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(isWaitingForCall(data.guests[0]),true);
 }finally{f.sql.close();}
});

test('declined guests are absent from admin and public lists and history, including a new decline before Sheets sync',async()=>{
 const f=fixture();const originalFetch=globalThis.fetch;
 try{
  let data=await (await f.request()).json();assert.equal(data.guests.length,1);assert.equal(data.guests.some(g=>g.id==='o-ghijkl12'),false);
  globalThis.fetch=async()=>new Response('',{status:503});
  const a=(await f.action({action:'create_caller',name:'מתקשר'})).caller;await f.action({action:'assign',inviteIds:['o-abcdef12'],callerId:a.id});
  f.sql.prepare('INSERT INTO call_tasks (invite_id,caller_id,updated_at) VALUES (?,?,?)').run('o-ghijkl12',a.id,new Date().toISOString());
  f.sql.prepare('INSERT INTO call_attempts (id,invite_id,caller_id,caller_name,phone,clicked_at) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),'o-ghijkl12',a.id,a.name,'0500000003',new Date().toISOString());
  const path='/api/calls/'+a.shareToken;data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.guests.length,1);assert.equal(data.callHistory.length,0);assert.doesNotMatch(JSON.stringify(data),/אורן|0500000003/);
  const result=await f.request(path,'POST',{inviteId:'o-abcdef12',version:1,status:'no'},'');assert.equal(result.status,200);assert.equal((await result.json()).synced,false);
  data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.guests.length,0);assert.equal(data.callHistory.length,0);
  data=await (await f.request()).json();assert.equal(data.guests.length,0);
  assert.equal(f.sql.prepare('SELECT attendance,sync_status FROM rsvp_responses WHERE invite_id=?').get('o-abcdef12').attendance,'no');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM call_attempts').get().n,1);
  // A scoped retry remains possible even after the guest leaves the displayed list.
  globalThis.fetch=async()=>new Response('Accepted');assert.equal((await (await f.request(path,'POST',{inviteId:'o-abcdef12',version:2,status:'no'},'')).json()).synced,true);
  data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.guests.length,0);
 }finally{globalThis.fetch=originalFetch;f.sql.close();}
});

test('call notes and vegetarian meals persist, sync, remain editable and survive retries',async()=>{
 const f=fixture();const originalFetch=globalThis.fetch;const sent=[];
 try{
  // Existing Sheet notes must be retained when an older client omits the new fields.
  const source=structuredClone(ranges);source[0].values[0].push('הערות');source[0].values[1].push('להתקשר בערב');
  f.sql.prepare('UPDATE seating_sources SET document=?').run(JSON.stringify(source));
  let data=await (await f.request()).json();assert.equal(data.guests[0].notes,'להתקשר בערב');
  globalThis.fetch=async(url,options)=>{sent.push(JSON.parse(options.body));return new Response('Accepted');};
  const a=(await f.action({action:'create_caller',name:'מתקשר'})).caller;await f.action({action:'assign',inviteIds:['o-abcdef12'],callerId:a.id});const path='/api/calls/'+a.shareToken;
  const payload={inviteId:'o-abcdef12',version:1,status:'yes',guestCount:2,notes:'יגיעו עם הילדה',vegetarian:true};
  assert.equal((await f.request(path,'POST',{...payload,notes:123},'')).status,400);
  assert.equal((await f.request(path,'POST',{...payload,vegetarian:'yes'},'')).status,400);
  assert.equal((await f.request(path,'POST',{...payload,notes:'א'.repeat(2001)},'')).status,400);
  assert.equal((await f.request(path,'POST',{...payload,inviteId:'o-ghijkl12'},'')).status,404);
  assert.equal((await f.request(path,'POST',payload,'')).status,200);
  assert.equal(sent.at(-1).message,'יגיעו עם הילדה\nמנה צמחונית');
  assert.equal(f.sql.prepare('SELECT message FROM rsvp_responses').get().message,sent.at(-1).message);
  data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.guests[0].notes,'יגיעו עם הילדה');assert.equal(data.guests[0].vegetarian,true);
  assert.equal((await f.request(path,'POST',{inviteId:payload.inviteId,version:2,status:'yes',guestCount:2},'')).status,200);
  assert.equal(sent.at(-1).message,'יגיעו עם הילדה\nמנה צמחונית');
  assert.equal((await f.request(path,'POST',{...payload,version:3,vegetarian:false},'')).status,200);
  assert.equal(sent.at(-1).message,'יגיעו עם הילדה');
  assert.equal((await f.request(path,'POST',{...payload,version:4,status:'no',notes:'לא יוכלו להגיע',vegetarian:true},'')).status,200);
  assert.equal(sent.at(-1).message,'לא יוכלו להגיע');assert.equal(sent.at(-1).attendance,'no');
  data=await (await f.request(path,'GET',undefined,'')).json();assert.equal(data.guests.length,0);
  assert.equal((await f.request(path,'POST',{inviteId:payload.inviteId,version:5,status:'no'},'')).status,200);
  assert.equal(sent.at(-1).message,'לא יוכלו להגיע');
 }finally{globalThis.fetch=originalFetch;f.sql.close();}
});

test('Sheet reconciliation imports missing answers, corrects counts, resolves only chosen orphans and keeps a restorable snapshot',async()=>{
 const f=fixture(),originalFetch=globalThis.fetch;let fetches=0;
 try{
  const source=structuredClone(ranges);source[0].values[1][9]='מאשרים';source[0].values[1][10]=2;
  source[1].values.push(['חברים','טל','לוי','0500000005',1,'','','','y-tallll12','']);
  f.env.SEATING_SHEETS_WEBHOOK_URL='https://webhook.test/read';f.env.INVITE_SHORT_TOKEN_SECRET='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  globalThis.fetch=async()=>{fetches++;return Response.json({valueRanges:source});};
  const add=(inviteId,name,count)=>f.sql.prepare("INSERT INTO rsvp_responses (invite_id,first_name,invited_name,full_name,attendance,guest_count,source_sheet,sync_status) VALUES (?,?,?,?,'yes',?,'מוזמנים דנה','synced')").run(inviteId,name,name,name,count);
  add('o-abcdef12','דנה',5);add('o-oldtest1','בדיקה',2);add('o-unknown1','דנה',2);add('o-alias001','רן',2);add('y-tallll12','טל',1);
  const testId=Number(f.sql.prepare('SELECT id FROM rsvp_responses WHERE invite_id=?').get('o-oldtest1').id),aliasId=Number(f.sql.prepare('SELECT id FROM rsvp_responses WHERE invite_id=?').get('o-alias001').id);
  f.sql.prepare("INSERT INTO rsvps (full_name,phone,attendance,guest_count) VALUES ('בדיקה','0500000001','yes',2)").run();
  assert.equal((await f.request('/api/admin/reconcile','GET',undefined,'')).status,401);
  assert.equal((await f.request('/api/admin/reconcile','GET',undefined,'other@test')).status,403);
  let r=await f.request('/api/admin/reconcile');assert.equal(r.status,200,await r.clone().text());let p=await r.json();assert.equal(p.totals.coming,2);assert.equal(p.totals.people,4);assert.equal(p.unknown.length,4);
  const decisions=[{table:'rsvp_responses',id:testId,action:'exclude'},{table:'rsvp_responses',id:aliasId,action:'merge',targetId:'y-abcdef12'},{table:'rsvps',id:1,action:'exclude'}];
  assert.equal((await f.request('/api/admin/reconcile','POST',{revision:p.revision,decisions},'admin@example.test','https://bad.test')).status,403);
  assert.equal((await f.request('/api/admin/reconcile','POST',{revision:p.revision,decisions:[{table:'rsvp_responses',id:1,action:'exclude'}]})).status,409);
  f.sql.prepare('UPDATE rsvp_responses SET guest_count=6 WHERE invite_id=?').run('o-abcdef12');
  assert.equal((await f.request('/api/admin/reconcile','POST',{revision:p.revision,decisions})).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM rsvp_reconciliations').get().n,0);
  p=await (await f.request('/api/admin/reconcile')).json();const callsBefore=fetches;
  r=await f.request('/api/admin/reconcile','POST',{revision:p.revision,decisions});assert.equal(r.status,200,await r.clone().text());const done=await r.json();assert.equal(done.updated,1);assert.equal(done.imported,2);assert.equal(done.returnedToPending,1);assert.equal(done.unresolved.length,1);assert.equal(done.unresolved[0].name,'דנה');assert.equal(fetches,callsBefore);
  assert.equal(f.sql.prepare('SELECT guest_count FROM rsvp_responses WHERE invite_id=?').get('o-abcdef12').guest_count,2);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM rsvp_responses WHERE invite_id=?').get('o-oldtest1').n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM rsvps').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM rsvp_responses WHERE invite_id=?').get('y-tallll12').n,0);
  const backup=JSON.parse(f.sql.prepare('SELECT before_document FROM rsvp_reconciliations').get().before_document);assert.equal(backup.rsvp_responses.length,5);assert.equal(backup.rsvps.length,1);
  // The old signed link resolves to the real invite with its correct Sheet metadata.
  const old=(await f.action({action:'create_caller',name:'מתקשר'})).caller;assert.ok(old.id);
  const inv=await (await f.request('/api/admin/invites','POST',{firstName:'רן',sourceSheet:'מוזמנים דנה'})).json();const token=inv.shortLink.split('/').at(-1);
  f.sql.prepare('INSERT INTO rsvp_invite_resolutions (invite_id,canonical_id,reconciliation_id) VALUES (?,?,?)').run(inv.inviteId,'y-abcdef12',done.reconciliationId);
  const decoded=await (await f.request('/api/invite?token='+token,'GET',undefined,'')).json();assert.equal(decoded.inviteId,'y-abcdef12',JSON.stringify({decoded,inv}));assert.equal(decoded.sourceSheet,'מוזמנים יואב');
 }finally{globalThis.fetch=originalFetch;f.sql.close();}
});
