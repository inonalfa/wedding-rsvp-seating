import test from 'node:test';
import assert from 'node:assert/strict';
import {compactTableNumbers,parseGuests,validatePlan,tableOccupancy,searchSeatingGuests} from '../lib/seating-model.ts';
const header=['קטגוריה','שם פרטי','שם משפחה','פלאפון','מספר מוזמנים','','','','','סטטוס הגעה','מספר מאשרים'];
function row(id,status,expected,actual){return ['משפחה',id,'בדיקת יחידה','',expected,'','','',id,status,actual];}
function ranges(rows){return [{range:"'מוזמנים דנה'!A1:M5",values:[header,...rows]},{range:"'מוזמנים יואב'!A1:M5",values:[header,row('yoav','',2,'')]}];}
test('confirmed count wins, pending uses estimate, declining guests are absent',()=>{
 const guests=parseGuests(ranges([row('yes','מאשרים',5,3),row('pending','',4,''),row('declined','לא מגיעים',6,0),row('missing','מאשרים',2,'')]));
 assert.deepEqual(guests.map(g=>[g.id,g.count,g.estimated]),[['yes',3,false],['pending',4,true],['missing',2,true],['yoav',2,true]]);
 assert.equal(tableOccupancy({id:'t',number:1,capacity:10,guests:['yes','pending','declined']},guests),7);
});
test('refresh updates occupancy while group assignments retain their identity',()=>{
 const table={id:'t',number:1,capacity:10,guests:['a']};
 assert.equal(tableOccupancy(table,parseGuests(ranges([row('a','',4,'')]))),4);
 assert.equal(tableOccupancy(table,parseGuests(ranges([row('a','מאשרים',4,2)]))),2);
 assert.equal(tableOccupancy(table,parseGuests(ranges([row('a','לא מגיעים',4,0)]))),0);
});
test('unknown quantity is explicit and ambiguous duplicate IDs stop a refresh',()=>{
 assert.equal(parseGuests(ranges([row('missing','',0,'')]))[0].count,null);
 assert.throws(()=>parseGuests(ranges([row('same','',1,''),row('same','',2,'')])));
 assert.throws(()=>parseGuests([]));
});
test('plan rejects duplicate guests, duplicate table numbers, invalid capacities',()=>{
 const t={id:'one',number:1,capacity:10,guests:['a']};
 assert.equal(validatePlan({tables:[t]}),true);
 assert.equal(validatePlan({tables:[t,{id:'two',number:2,capacity:10,guests:['a']}]}),false);
 assert.equal(validatePlan({tables:[t,{id:'two',number:1,capacity:10,guests:[]}]}),false);
 assert.equal(validatePlan({tables:[{...t,capacity:0}]}),false);
});

const searchGuests=[
 {id:'seated',name:'דנה כהן',side:'דנה',category:'משפחה',linkedTo:'רונית',attendance:'yes',count:2,estimated:false,sourceRow:2},
 {id:'waiting',name:'דנה לוי',side:'יואב',category:'חברים',linkedTo:'אלון',attendance:'pending',count:3,estimated:true,sourceRow:3},
 {id:'same-name',name:'דנה כהן',side:'יואב',category:'עבודה',linkedTo:'אלון',attendance:'yes',count:1,estimated:false,sourceRow:4},
];
const searchPlan={tables:[
 {id:'t1',number:12,name:'משפחה',capacity:10,guests:['seated']},
 {id:'t2',number:4,capacity:10,guests:['same-name']},
]};
test('guest search finds seated and waiting guests and preserves distinct guests with the same name',()=>{
 const snapshot=JSON.stringify({searchGuests,searchPlan});
 const found=searchSeatingGuests(searchGuests,searchPlan,' דנה ');
 assert.deepEqual(found.unseated.map(g=>g.id),['waiting']);
 assert.deepEqual(found.seated.map(({guest,table})=>[guest.id,table.number]),[['seated',12],['same-name',4]]);
 assert.equal(JSON.stringify({searchGuests,searchPlan}),snapshot);
 assert.deepEqual(searchSeatingGuests(searchGuests,searchPlan,'לוי').unseated.map(g=>g.id),['waiting']);
 assert.deepEqual(searchSeatingGuests(searchGuests,searchPlan,'כהן   דנה').seated.map(r=>r.guest.id),['seated','same-name']);
 assert.deepEqual(searchSeatingGuests(searchGuests,searchPlan,'לא קיים'),{unseated:[],seated:[]});
});
test('search clearing restores the waiting list, and side, attendance and existing relation searches still work',()=>{
 assert.deepEqual(searchSeatingGuests(searchGuests,searchPlan,'   '),{unseated:[searchGuests[1]],seated:[]});
 assert.deepEqual(searchSeatingGuests(searchGuests,searchPlan,'דנה','יואב','pending'),{unseated:[searchGuests[1]],seated:[]});
 assert.deepEqual(searchSeatingGuests(searchGuests,searchPlan,'רונית').seated.map(r=>r.guest.id),['seated']);
 assert.deepEqual(searchSeatingGuests(searchGuests,searchPlan,'עבודה').seated.map(r=>r.guest.id),['same-name']);
});
test('search locations follow assignment, transfer and removal without stale table references',()=>{
 const assigned={tables:searchPlan.tables.map(t=>({...t,guests:t.id==='t1'?[...t.guests,'waiting']:t.guests}))};
 assert.equal(searchSeatingGuests(searchGuests,assigned,'לוי').seated[0].table.number,12);
 const transferred={tables:assigned.tables.map(t=>({...t,guests:t.id==='t2'?[...t.guests,'waiting']:t.guests.filter(id=>id!=='waiting')}))};
 assert.equal(searchSeatingGuests(searchGuests,transferred,'לוי').seated[0].table.number,4);
 assert.deepEqual(searchSeatingGuests(searchGuests,searchPlan,'לוי').unseated.map(g=>g.id),['waiting']);
});

test('compact numbering preserves table 2, IDs, capacities, guests and display order',()=>{
 const plan={tables:[{id:'last',number:9,capacity:12,guests:['a']},{id:'family',number:2,capacity:24,guests:['b']},{id:'first',number:5,capacity:12,guests:[]}]};
 const result=compactTableNumbers(plan);
 assert.deepEqual(result.tables.map(t=>t.number),[3,2,1]);
 const withoutNumber = table => Object.fromEntries(Object.entries(table).filter(([key]) => key !== 'number'));
 assert.deepEqual(result.tables.map(withoutNumber),plan.tables.map(withoutNumber));
 assert.deepEqual(plan.tables.map(t=>t.number),[9,2,5]);
 assert.deepEqual(compactTableNumbers(result),result);
 assert.deepEqual(compactTableNumbers({tables:[]}),{tables:[]});
 assert.equal(compactTableNumbers({tables:[plan.tables[1]]}).tables[0].number,2);
 assert.deepEqual(compactTableNumbers({tables:[plan.tables[0],plan.tables[2]]}).tables.map(t=>t.number),[2,1]);
});
