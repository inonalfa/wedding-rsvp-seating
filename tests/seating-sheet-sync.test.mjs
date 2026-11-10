import test from 'node:test';
import assert from 'node:assert/strict';
import {sheetSeats,pendingSheetSeats} from '../lib/seating-sheet-model.ts';
const row=(id,t)=>[null,null,null,null,null,null,null,null,id,null,null,null,null,null,null,null,null,null,null,t];
const ranges=[{range:"'מוזמנים דנה'!A1:T5",values:[[],row('a','2'),row('b',''),row('c','6')]},{range:"'מוזמנים יואב'!A1:T1",values:[[]]}];
test('numeric table values, new assignment, renumbering and removal',()=>{
 const plan={tables:[{id:'one',number:3,capacity:10,guests:['a','b']}]};
 const pending=pendingSheetSeats(sheetSeats(plan,ranges),{});
 assert.deepEqual(pending.map(r=>[r.inviteId,r.tableNumber]),[['a',3],['b',3],['c',null]]);
 const confirmed=Object.fromEntries(pending.map(r=>[r.key,r.tableNumber]));
 assert.equal(pendingSheetSeats(sheetSeats(plan,ranges),confirmed).length,0);
});
test('duplicate IDs block ambiguous sheet writes',()=>{
 const duplicate=structuredClone(ranges);duplicate[1].values.push(row('a',''));
 assert.throws(()=>sheetSeats({tables:[]},duplicate),/כפולים/);
});
