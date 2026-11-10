import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createInitialSketch, moveSketchItems, resizeSketchTables, linkSketchTable } from '../lib/seating-sketch.ts';
const { default: worker } = await import('../dist/server/index.js');
const ctx = { waitUntil() {}, passThroughOnException() {} };
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0007_natural_riptide.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../drizzle/0008_workable_reptil.sql', import.meta.url), 'utf8'));
  const env = { AUTH_MODE: 'sites', ADMIN_EMAILS: 'admin@example.test', ASSETS: { fetch: async () => new Response('', { status: 404 }) }, DB: { prepare(query) { let args = []; return { bind(...values) { args = values; return this; }, async first() { return sql.prepare(query).get(...args) ?? null; } }; } } };
  const request = (method = 'GET', body, email = 'admin@example.test', origin = 'http://localhost') => worker.fetch(new Request('http://localhost/api/admin/seating-sketch', { method, headers: { ...(email ? { 'oai-authenticated-user-email': email } : {}), origin, 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env, ctx);
  return { sql, env, request };
}
test('sketch API saves and restores geometry and rejects stale revisions', async () => {
  const f = fixture();
  try {
    const initial = await (await f.request()).json();
    assert.equal(initial.revision, 0); assert.equal(initial.sketch.items.length, 22);
    initial.sketch.items[0].x = 125; initial.sketch.items[1].width = 140; initial.sketch.items[1].height = 140;
    const saved = await f.request('PUT', { sketch: initial.sketch, revision: 0 });
    assert.equal(saved.status, 200); assert.equal((await saved.json()).revision, 1);
    const restored = await (await f.request()).json();
    assert.deepEqual(restored.sketch, initial.sketch);
    const stale = await f.request('PUT', { sketch: createInitialSketch(), revision: 0 });
    assert.equal(stale.status, 409); assert.equal((await stale.json()).conflict, true);
    const updated = await f.request('PUT', { sketch: createInitialSketch(), revision: 1 });
    assert.equal(updated.status, 200); assert.equal((await updated.json()).revision, 2);
    assert.equal((await f.request('PUT', { sketch: initial.sketch, revision: 1 })).status, 409);
  } finally { f.sql.close(); }
});
test('sketch API and page require admin access and same-origin writes', async () => {
  const f = fixture();
  try {
    assert.equal((await f.request('GET', undefined, '')).status, 401);
    assert.equal((await f.request('GET', undefined, 'guest@example.test')).status, 403);
    assert.equal((await f.request('PUT', { sketch: createInitialSketch(), revision: 0 }, 'admin@example.test', 'http://elsewhere.test')).status, 403);
    assert.equal((await f.request('PUT', { sketch: { ...createInitialSketch(), items: [{ ...createInitialSketch().items[0], width: -10 }] }, revision: 0 })).status, 400);
    const response = await worker.fetch(new Request('http://localhost/admin/seating/sketch'), f.env, ctx);
    assert.equal(response.status, 307);
    assert.match(response.headers.get('location'), /signin-with-chatgpt.*return_to=/);
    const guest = await worker.fetch(new Request('http://localhost/admin/seating/sketch', { headers: { 'oai-authenticated-user-email': 'guest@example.test' } }), f.env, ctx);
    assert.match(await guest.text(), /אין הרשאת מנהל/);
    const admin = await worker.fetch(new Request('http://localhost/admin/seating/sketch', { headers: { 'oai-authenticated-user-email': 'admin@example.test' } }), f.env, ctx);
    assert.equal(admin.status, 200); assert.match(await admin.text(), /סקיצת האולם/);
  } finally { f.sql.close(); }
});

test('saved portrait sketches upgrade without resetting custom positions and names survive a save/reload',async()=>{
 const f=fixture();try{
  const portrait={width:1000,height:1350,items:[{id:'a',kind:'round',label:'שולחן 1',name:'משפחת הכלה',x:143,y:916,width:116,height:116,rotation:0,seats:12},{id:'b',kind:'banquet',label:'אבירים 20',x:535,y:940,width:230,height:85,rotation:0,seats:20}]};
  f.sql.prepare('INSERT INTO seating_sketches (id,document,revision,updated_at) VALUES (1,?,26,?)').run(JSON.stringify(portrait),'2026-10-15T11:00:42Z');
  const d=await (await f.request()).json();assert.equal(d.revision,26);assert.equal(d.requiresSave,true);assert.equal(d.sketch.width,1485);assert.equal(d.sketch.items[0].width,85);assert.equal(d.sketch.items[0].name,'משפחת הכלה');assert.equal(d.sketch.items[0].rotation,45);assert.equal(d.sketch.height,1050);assert.equal(d.originalSketch.layoutVersion,3);assert.equal(JSON.parse(f.sql.prepare('SELECT document FROM seating_sketches').get().document).width,1000);
  assert.equal((await f.request('PUT',{revision:26,sketch:d.sketch})).status,200);const next=await (await f.request()).json();assert.deepEqual(next.sketch,d.sketch);assert.equal(next.requiresSave,false);
  next.sketch.items[0].name='';assert.equal((await f.request('PUT',{revision:27,sketch:next.sketch})).status,200);assert.equal((await (await f.request()).json()).sketch.items[0].name,'');
 }finally{f.sql.close();}
});
test('bulk table sizing and a shared drag persist together and can be undone with the prior sketch',async()=>{
 const f=fixture();try{
  const initial=await (await f.request()).json(),ids=['round-1','round-2','banquet-20'];
  const next=moveSketchItems(resizeSketchTables(initial.sketch,ids,130),ids,75,-25,true,'round-1');
  assert.equal((await f.request('PUT',{sketch:next,revision:0})).status,200);
  const saved=await (await f.request()).json();assert.deepEqual(saved.sketch,next);assert.equal(saved.requiresSave,false);
  assert.equal((await f.request('PUT',{sketch:initial.sketch,revision:saved.revision})).status,200);
  assert.deepEqual((await (await f.request()).json()).sketch,initial.sketch);
 }finally{f.sql.close();}
});
test('sketch links persist, source labels win on stale saves, deletions remain explicit, and guest assignments stay untouched',async()=>{
 const f=fixture();try{
  const plan={tables:[{id:'family',number:7,name:'משפחה',capacity:10,guests:['guest-private']},{id:'friends',number:2,capacity:12,guests:[]}]};
  const savePlan=()=>f.sql.prepare('INSERT INTO seating_plans (id,document,revision,updated_at) VALUES (1,?,1,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document').run(JSON.stringify(plan),'2026-10-15T13:00:00Z');savePlan();
  const initial=await (await f.request()).json();assert.deepEqual(initial.seatingTables,[{id:'friends',number:2},{id:'family',number:7,name:'משפחה'}]);assert.ok(!JSON.stringify(initial).includes('guest-private'));
  const linked=linkSketchTable(initial.sketch,'round-1',plan.tables[0]);
  const first=await f.request('PUT',{sketch:linked,revision:0});assert.equal(first.status,200);assert.equal((await first.json()).sketch.items[0].seatingTableId,'family');
  plan.tables[0].number=42;plan.tables[0].name='שם מעודכן';savePlan();
  const refreshed=await (await f.request()).json();assert.equal(refreshed.requiresSave,true);assert.equal(refreshed.sketch.items[0].label,'42');assert.equal(refreshed.sketch.items[0].name,'שם מעודכן');
  const staleLabels=await f.request('PUT',{sketch:linked,revision:1});assert.equal(staleLabels.status,200);assert.equal((await staleLabels.json()).sketch.items[0].label,'42');
  const duplicate={...linked,items:linked.items.map(i=>i.id==='round-2'?{...i,seatingTableId:'family'}:i)};assert.equal((await f.request('PUT',{sketch:duplicate,revision:2})).status,400);
  const storedPlan=f.sql.prepare('SELECT document FROM seating_plans').get().document;assert.deepEqual(JSON.parse(storedPlan),plan);
  plan.tables.shift();savePlan();const deleted=await (await f.request()).json();assert.equal(deleted.sketch.items[0].seatingTableId,'family');assert.equal(deleted.sketch.items[0].label,'42');assert.equal(deleted.seatingTables.length,1);
 }finally{f.sql.close();}
});

test('standalone Basic auth injects an authenticated admin identity',async()=>{
 const f=fixture();try{delete f.env.AUTH_MODE;f.env.ADMIN_PASSWORD='independent-password';
 const request=password=>worker.fetch(new Request('https://example.test/api/admin/seating-sketch',{headers:{authorization:`Basic ${btoa(`admin:${password}`)}`,'oai-authenticated-user-email':'outsider@example.test'}}),f.env,ctx);
 assert.equal((await request('wrong')).status,401);const response=await request('independent-password');assert.equal(response.status,200);assert.equal((await response.json()).revision,0);
 }finally{f.sql.close();}
});
