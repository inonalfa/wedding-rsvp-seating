import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const {default:worker}=await import('../dist/server/index.js');
test('sheet sync confirms writes, handles concurrent moves, clears seats and retries failures',async()=>{
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const header=['קטגוריה','שם פרטי','שם משפחה','פלאפון','מספר מוזמנים','מקושר ל','ID לקישור','קישור אישי קצר','מזהה הזמנה','סטטוס הגעה','מספר מאשרים'];header[19]='מספר שולחן';
 const row=id=>['חברים',id,'בדיקה','0500000000',1,'','','',id,'מאשרים',1];
 const ranges=[{range:"'מוזמנים דנה'!A1:T3",values:[header,row('a'),row('b')]},{range:"'מוזמנים יואב'!A1:T1",values:[header]}];
 const plan=n=>({tables:[{id:'table',number:n,capacity:10,guests:['a','b']}]});
 sql.prepare('INSERT INTO seating_sources VALUES(1,?,?)').run(JSON.stringify(ranges),new Date().toISOString());
 sql.prepare('INSERT INTO seating_plans VALUES(1,?,1,?)').run(JSON.stringify({tables:[{id:'table',number:2,capacity:10,guests:['a']}]}),new Date().toISOString());
 const DB={prepare(query){let args=[];return{bind(...a){args=a;return this;},async first(){return sql.prepare(query).get(...args)??null;},async all(){return{results:sql.prepare(query).all(...args)};},async run(){return sql.prepare(query).run(...args);}};},async batch(s){return Promise.all(s.map(x=>x.run()));}};
 const env={AUTH_MODE:'sites',DB,ADMIN_EMAILS:'admin@example.test',SEATING_SYNC_SECRET:'service-test',MAKE_WEBHOOK_URL:'https://make.test/write',SEATING_SHEETS_WEBHOOK_URL:'https://make.test/read',ASSETS:{fetch:async()=>new Response('',{status:404})}};
 const ctx={waitUntil(){},passThroughOnException(){}};
 const request=(path,body,auth='service')=>worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{'content-type':'application/json',...(auth==='service'?{authorization:'Bearer service-test','X-Webhook-Timestamp':String(Math.floor(Date.now()/1000)),'X-Webhook-Nonce':crypto.randomUUID()}:{})},body:JSON.stringify(body??{})}),env,ctx);
 const save=(p,revision)=>worker.fetch(new Request('http://localhost/api/admin/seating',{method:'PUT',headers:{'content-type':'application/json','oai-authenticated-user-email':'admin@example.test'},body:JSON.stringify({plan:p,revision})}),env,ctx);
 await worker.fetch(new Request('http://localhost/api/calendar'),env,ctx);
 const original=globalThis.fetch,writes=[];let fail=false,plain=false,hold=null,entered=null;
 globalThis.fetch=async(url,options)=>{
  if(String(url)==='https://make.test/read')return Response.json({valueRanges:ranges});
  if(String(url)!=='https://make.test/write')throw new Error('Unexpected outbound request');
  const payload=JSON.parse(options.body);assert.equal(payload.event,'seating.updated');
  if(hold){const wait=hold;hold=null;entered();await wait;}
  if(fail)throw new Error('temporary outage');
  if(plain)return new Response('Accepted');
  writes.push(payload);ranges[0].values.find(r=>r[8]===payload.inviteId)[19]=payload.tableNumber;
  return Response.json({ok:true,event:'seating.updated'});
 };
 try{
  assert.equal((await request('/api/admin/seating/sync',{},'none')).status,401);
  let r=await(await request('/api/admin/seating/sync?refresh=1')).json();assert.equal(r.synced,1);assert.equal(r.pending,0);assert.equal(writes[0].tableNumber,2);
  r=await(await request('/api/admin/seating/sync')).json();assert.equal(r.synced,0,'no duplicate writes');
  let release;hold=new Promise(resolve=>release=resolve);const started=new Promise(resolve=>entered=resolve);
  const first=save(plan(3),1);await started;
  const concurrent=await save(plan(4),2);assert.equal(concurrent.status,200);assert.equal((await concurrent.json()).sheetSync.busy,true);
  release();assert.equal((await first).status,200);assert.equal(ranges[0].values[1][19],4);assert.equal(ranges[0].values[2][19],4,'latest plan wins after overlapping saves');
  r=await(await save({tables:[]},3)).json();assert.equal(r.sheetSync.pending,0);assert.equal(ranges[0].values[1][19],'');assert.equal(ranges[0].values[2][19],'');
  fail=true;r=await(await save(plan(5),4)).json();assert.ok(r.sheetSync.error);assert.equal(r.revision,5,'the saved seating plan survives sync failure');
  fail=false;plain=true;r=await(await request('/api/admin/seating/sync')).json();assert.ok(r.error,'Accepted is not a write confirmation');
  plain=false;r=await(await request('/api/admin/seating/sync')).json();assert.equal(r.pending,0);assert.equal(ranges[0].values[1][19],5);assert.equal(ranges[0].values[2][19],5);
  assert.equal(ranges[0].values[1][9],'מאשרים');assert.equal(sql.prepare('SELECT count(*) AS n FROM rsvp_responses').get().n,0);
 }finally{globalThis.fetch=original;sql.close();}
});
