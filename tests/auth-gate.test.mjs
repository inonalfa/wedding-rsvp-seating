import test from 'node:test';
import assert from 'node:assert/strict';
const { default: worker } = await import('../dist/server/index.js');
const ctx={waitUntil(){},passThroughOnException(){}};
const env={ADMIN_PASSWORD:'long-admin-secret',STAFF_PASSWORD:'different-staff-secret',ADMIN_EMAILS:'admin@example.test',ASSETS:{fetch:async()=>new Response('',{status:404})}};
const fetchPath=(path,headers={})=>worker.fetch(new Request(`https://example.test${path}`,{headers}),env,ctx);
test('standalone protected routes reject spoofed identity and wrong credentials',async()=>{
 for(const path of ['/admin','/api/admin/data','/find-table','/api/find-table']){
  const response=await fetchPath(path,{'oai-authenticated-user-email':'admin@example.test'});
  assert.equal(response.status,401,path);assert.match(response.headers.get('www-authenticate')||'',/^Basic /);
 }
 assert.equal((await fetchPath('/api/admin/data',{authorization:`Basic ${btoa('admin:wrong')}`})).status,401);
 assert.equal((await fetchPath('/api/find-table',{authorization:`Basic ${btoa('admin:long-admin-secret')}`})).status,401);
});
test('missing production passwords fail closed',async()=>{
 assert.equal((await worker.fetch(new Request('https://example.test/admin'),{...env,ADMIN_PASSWORD:undefined},ctx)).status,401);
 assert.equal((await worker.fetch(new Request('https://example.test/find-table'),{...env,STAFF_PASSWORD:undefined},ctx)).status,401);
});
