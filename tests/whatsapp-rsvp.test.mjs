import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
const { default:worker }=await import('../dist/server/index.js');
const ctx={waitUntil(){},passThroughOnException(){}};
const ranges=[];
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 sql.prepare('INSERT INTO seating_sources (id,document,fetched_at) VALUES (1,?,?)').run(JSON.stringify(ranges),new Date().toISOString());
 const wrap=(query)=>{let args=[];return {bind(...v){args=v;return this;},async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args),success:true,meta:{}};},async raw(){const stmt=sql.prepare(query);stmt.setReturnArrays(true);return stmt.all(...args);},async run(){const r=sql.prepare(query).run(...args);return {results:[],success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}};};
 const env={AUTH_MODE:'sites',WHATSAPP_RSVP_SECRET:'test-webhook',INVITE_SHORT_TOKEN_SECRET:Buffer.alloc(32,7).toString('base64url'),ADMIN_EMAILS:'admin@example.test',MAKE_WEBHOOK_URL:'https://webhook.test/rsvp',ASSETS:{fetch:async()=>new Response('',{status:404})},DB:{prepare:wrap,async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}}};
 const request=(path='/api/admin/calls',method='GET',body,email='admin@example.test',origin='http://localhost')=>worker.fetch(new Request('http://localhost'+path,{method,headers:{...(email?{'oai-authenticated-user-email':email}:{}),origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,ctx);
 const action=async body=>{const r=await request('/api/admin/calls','POST',body);assert.equal(r.status,200,await r.clone().text());return r.json();};
 return {sql,env,request,action};
}

function token(row=123,name='אמיר'){
 const payload=Buffer.concat([Buffer.from([1,0,row>>8,row&255,1]),Buffer.from(name)]);
 return Buffer.concat([payload,createHmac('sha256',Buffer.alloc(32,7)).update(payload).digest().subarray(0,8)]).toString('base64url');
}
function post(f,body,secret='test-webhook'){
 return worker.fetch(new Request('http://localhost/api/rsvp/whatsapp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify(body)}),f.env,ctx);
}
const sheets=(signed=token(),id='dana-0123')=>[{range:"'מוזמנים דנה'!D2:I269",values:[['050-0000006','1','',signed,'',id]]}];
test('legacy WhatsApp RSVP saves and syncs using a signed token even without generated_invites',async()=>{
 const f=fixture();await f.request('/api/calendar');const old=globalThis.fetch,sent=[];globalThis.fetch=async(u,o)=>{sent.push(JSON.parse(o.body));return new Response('Accepted');};
 try{
  const r=await post(f,{phone:'972500000006',attendance:'yes',guestCount:'2',sheets:sheets()});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).synced,true);
  const saved=f.sql.prepare('SELECT * FROM rsvp_responses').get();assert.equal(saved.invite_id,'dana-0123');assert.equal(saved.guest_count,2);assert.equal(saved.source_row,2);assert.equal(sent.length,1);assert.equal(sent[0].lookupValue,'dana-0123');
  const no=await post(f,{phone:'0500000006',attendance:'no',guestCount:0,sheets:sheets()});assert.equal(no.status,200);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM rsvp_responses').get().n,1);assert.equal(f.sql.prepare('SELECT guest_count FROM rsvp_responses').get().guest_count,0);
 }finally{globalThis.fetch=old;f.sql.close();}
});
test('generated invites continue to sync without requiring a legacy token',async()=>{
 const f=fixture();await f.request('/api/calendar');const old=globalThis.fetch;globalThis.fetch=async()=>new Response('Accepted');
 try{f.sql.prepare('INSERT INTO generated_invites (invite_id,first_name,source_sheet,short_link,created_by,max_guests) VALUES (?,?,?,?,?,0)').run('o-abcdef12','דנה','מוזמנים דנה','https://example.test/i/test','admin');const r=await post(f,{inviteId:'o-abcdef12',attendance:'yes',guestCount:1});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).synced,true);}finally{globalThis.fetch=old;f.sql.close();}
});
test('unauthorized, ambiguous, invalid-signature and wrong-invite requests do not save or sync',async()=>{
 const f=fixture();await f.request('/api/calendar');const old=globalThis.fetch;let sent=0;globalThis.fetch=async()=>{sent++;return new Response('Accepted');};
 try{
 const payload={phone:'0500000006',attendance:'yes',guestCount:1,sheets:sheets()};
 assert.equal((await post(f,payload,'wrong')).status,401);
 assert.equal((await post(f,{...payload,sheets:sheets(token(124))})).status,404);
 assert.equal((await post(f,{...payload,sheets:sheets('invalid-token')})).status,404);
 const ambiguous=sheets();ambiguous[0].values.push(['0500000006','1','',token(124),'','dana-0124']);assert.equal((await post(f,{...payload,sheets:ambiguous})).status,409);
 assert.equal(sent,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM rsvp_responses').get().n,0);
 }finally{globalThis.fetch=old;f.sql.close();}
});
