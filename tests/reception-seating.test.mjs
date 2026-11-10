import test from 'node:test';
import assert from 'node:assert/strict';
import {receptionTables,assignReceptionGuest} from '../lib/reception-seating.ts';
const guests=[{id:'couple',name:'זוג',count:2},{id:'solo',name:'יחיד',count:1},{id:'unknown',name:'כמות לא ידועה',count:null}];
const plan={tables:[{id:'a',number:1,name:'חברים',capacity:3,guests:['solo']},{id:'b',number:2,capacity:1,guests:[]}]};
test('capacity counts people, not invitation rows',()=>{assert.equal(receptionTables(plan,guests)[0].available,2);const result=assignReceptionGuest(plan,guests,'couple','a',null,2);assert.equal(receptionTables(result.plan,guests)[0].available,0);assert.deepEqual(plan.tables[0].guests,['solo']);});
test('full table, changed guest count and unknown count do not allow unsafe placement',()=>{assert.throws(()=>assignReceptionGuest({tables:plan.tables.map(t=>t.id==='b'?{...t,number:3}:t)},guests,'couple','b',null,2),/נותרו רק/);assert.throws(()=>assignReceptionGuest(plan,guests,'couple','a',null,1),/השתנו/);assert.throws(()=>assignReceptionGuest(plan,guests,'unknown','a',null,1),/השתנו/);assert.equal(receptionTables({tables:[{...plan.tables[0],guests:['unknown']}]},guests)[0].available,null);});
test('moving and undo restore exact assignments without duplicating guest',()=>{const moved=assignReceptionGuest(plan,guests,'solo','b','a',1);assert.deepEqual(moved.plan.tables.map(t=>t.guests),[[],['solo']]);const undone=assignReceptionGuest(moved.plan,guests,'solo','a','b',1);assert.deepEqual(undone.plan,plan);assert.equal(assignReceptionGuest(moved.plan,guests,'solo','b','a',1).changed,false);assert.throws(()=>assignReceptionGuest(moved.plan,guests,'solo','a',null,1),/השיבוץ/);});
test('undo new seating returns guest to unassigned',()=>{const next=assignReceptionGuest(plan,guests,'couple','a',null,2);assert.deepEqual(assignReceptionGuest(next.plan,guests,'couple',null,'a',2).plan,plan);});

test('table 2 allows overflow while preserving its capacity',()=>{
 const result=assignReceptionGuest(plan,guests,'couple','b',null,2);
 assert.equal(result.plan.tables[1].capacity,1);
 assert.deepEqual(result.plan.tables[1].guests,['couple']);
 assert.equal(receptionTables(result.plan,guests)[1].available,0);
});
