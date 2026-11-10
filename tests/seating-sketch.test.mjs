import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialSketch, fitItem, validateSketch, chairPositions, moveSketchItems, resizeSketchTables, sketchItemLabel, linkSketchTable, unlinkSketchTable, syncSketchTableLabels, unlinkedSeatingTables, withoutTextItems} from '../lib/seating-sketch.ts';
test('retired text annotations are removed without changing the saved tables',()=>{
 const sketch=createInitialSketch();const saved={...sketch,items:[...sketch.items,{id:'note',kind:'text',label:'כניסה',seats:0,x:100,y:100,width:240,height:80,rotation:0,includeInPdf:true}]};
 const cleaned=withoutTextItems(saved);assert.ok(validateSketch(cleaned));assert.deepEqual(cleaned.items,sketch.items);
 assert.equal(withoutTextItems(sketch),sketch);
});
test('initial sketch includes the requested tables, service areas and two dance floors', () => {
  const sketch = createInitialSketch();
  assert.equal(validateSketch(sketch), true);
  assert.equal(sketch.items.length, 22);
  assert.equal(sketch.items.filter(i => i.kind === 'round' && i.seats === 12).length, 16);
  assert.deepEqual(sketch.items.filter(i => i.kind === 'banquet').map(i => i.seats), [24, 20]);
  assert.equal(sketch.items.reduce((n, i) => n + i.seats, 0), 236);
  assert.deepEqual(sketch.items.filter(i => i.kind === 'dance').map(i => i.label), ['רחבת גברים', 'רחבת נשים']);
  assert.equal(sketch.items.filter(i => i.kind === 'dj').length, 1);
  assert.equal(sketch.items.filter(i => i.kind === 'bar').length, 1);
  assert.equal(sketch.width / sketch.height, 297 / 210);
  for(const item of sketch.items.filter(i=>i.kind==='round'||i.kind==='banquet')){
    assert.equal(Math.min(item.width,item.height),85);
    assert.equal(item.rotation,45);
  }
});
test('moving and resizing keep each object in the editable canvas, including square tables', () => {
  const sketch = createInitialSketch();
  for (const item of sketch.items) {
    for (const patch of [{x:-900,y:-100}, {x:9999,y:9999}, {width:0,height:-1}, {width:9000,height:5000}]) {
      const fitted = fitItem({...item,...patch}, sketch);
      assert.equal(validateSketch({...sketch,items:[fitted]}), true);
      if (fitted.kind === 'round') assert.equal(fitted.width,fitted.height);
    }
  }
});
test('the save boundary rejects corrupt shapes, repeated IDs, invalid sizes and seat counts', () => {
  const sketch = createInitialSketch();
  for (const patch of [{x:NaN},{width:Infinity},{height:10},{rotation:360},{seats:1.5},{kind:'unknown'},{label:''}]) {
    assert.equal(validateSketch({...sketch,items:[{...sketch.items[0],...patch}]}), false);
  }
  assert.equal(validateSketch({...sketch,items:[sketch.items[0],sketch.items[0]]}), false);
  assert.equal(validateSketch(null), false);
});
test('chair counts follow capacity exactly and resize with each table', () => {
  const sketch = createInitialSketch();
  assert.equal(sketch.items.flatMap(chairPositions).length, 236);
  const table = sketch.items[0];
  const chairs = chairPositions(table);
  for (const angle of [0,90,180,270]) assert.equal(chairs.filter(c => c.rotation === angle).length, 3);
  for (const seats of [1,2,3,13,20,24,37,1000]) {
    const positions = chairPositions({...table,kind:'banquet',width:280,height:85,seats});
    assert.equal(positions.length, seats);
    assert.equal(new Set(positions.map(c=>`${c.x},${c.y}`)).size, seats);
    assert.ok(positions.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y)));
  }
  assert.notDeepEqual(chairPositions({...table,width:150,height:150}), chairs);
  assert.deepEqual(chairPositions(sketch.items.find(i=>i.kind==='dj')), []);
});

test('landscape upgrade preserves the custom arrangement, table identities, names and capacity once',async()=>{
 const {upgradeSketch}=await import('../lib/seating-sketch.ts');
 const old={width:1000,height:1350,items:[{id:'square',kind:'round',label:'שולחן 7',name:'משפחת החתן',seats:12,x:143,y:916,width:116,height:116,rotation:0},{id:'long',kind:'banquet',label:'אבירים 24',seats:24,x:220,y:940,width:280,height:85,rotation:0},{id:'dj',kind:'dj',label:'DJ',seats:0,x:65,y:775,width:130,height:170,rotation:0}]};
 const before=structuredClone(old),next=upgradeSketch(old);
 assert.deepEqual(old,before);assert.equal(next.width,1485);assert.equal(next.height,1050);assert.equal(next.layoutVersion,4);assert.ok(validateSketch(next));
 for(const [i,item] of next.items.entries()){const prior=old.items[i];assert.equal(item.id,prior.id);assert.equal(item.label,prior.label);assert.equal(item.name,prior.name);assert.equal(item.seats,prior.seats);assert.ok(Math.abs(item.x+item.width/2-(prior.y+prior.height/2)*1.1)<1e-8);assert.ok(Math.abs(item.y+item.height/2-(old.width-prior.x-prior.width/2)*1.05)<1e-8);}
 assert.equal(next.items[0].width,85);assert.equal(next.items[0].height,85);assert.equal(next.items[1].width,85);assert.equal(next.items[1].height,280);assert.equal(upgradeSketch(next),next);
 const resized={...next,items:next.items.map(i=>i.kind==='round'?{...i,width:140,height:140}:i)};assert.equal(upgradeSketch(resized),resized);
});
test('grid alignment uses the visible 25-unit grid, aligns centres and 45-degree rotations, and leaves service areas alone',async()=>{
 const {alignTablesToGrid,snapItemToGrid,SKETCH_GRID}=await import('../lib/seating-sketch.ts');const sketch=createInitialSketch();
 const changed={...sketch,items:sketch.items.map(i=>({...i,x:i.x+3,y:i.y+7,rotation:52}))};const aligned=alignTablesToGrid(changed);
 assert.ok(validateSketch(aligned));for(const [i,item] of aligned.items.entries())if(item.kind==='round'||item.kind==='banquet'){assert.equal((item.x+item.width/2)%SKETCH_GRID,0);assert.equal((item.y+item.height/2)%SKETCH_GRID,0);assert.equal(item.rotation,45);}else assert.deepEqual(item,changed.items[i]);
 const edge=snapItemToGrid({...sketch.items[0],x:-100,y:99999},sketch);assert.ok(validateSketch({...sketch,items:[edge]}));assert.deepEqual(alignTablesToGrid(aligned),aligned);
});
test('table names are optional, clearable and bounded independently of the printed label',()=>{
 const sketch=createInitialSketch();for(const name of ['', 'משפחה של דנה'])assert.ok(validateSketch({...sketch,items:[{...sketch.items[0],name}]}));for(const name of [42,null,'א'.repeat(81)])assert.equal(validateSketch({...sketch,items:[{...sketch.items[0],name}]}),false);
});
test('saved landscape sketches adopt A4 and table defaults once, preserving later manual edits',async()=>{
 const {upgradeSketch}=await import('../lib/seating-sketch.ts');
 const saved={layoutVersion:2,width:1350,height:1000,items:[{id:'s',kind:'round',label:'שולחן 8',name:'משפחה',seats:12,x:300,y:400,width:85,height:85,rotation:90},{id:'b',kind:'banquet',label:'אבירים',seats:24,x:800,y:200,width:280,height:85,rotation:0},{id:'dj',kind:'dj',label:'DJ',seats:0,x:600,y:800,width:170,height:130,rotation:0}]};
 const original=structuredClone(saved),next=upgradeSketch(saved);
 assert.deepEqual(saved,original);assert.ok(validateSketch(next));assert.equal(next.layoutVersion,4);assert.equal(next.width/next.height,297/210);
 assert.equal(next.items[0].width,85);assert.equal(next.items[0].height,85);assert.equal(next.items[1].width,280);assert.equal(next.items[1].height,85);
 for(const [i,item] of next.items.entries()){
  assert.equal(item.id,saved.items[i].id);assert.equal(item.name,saved.items[i].name);assert.equal(item.seats,saved.items[i].seats);
  assert.ok(Math.abs((item.x+item.width/2)/next.width-(saved.items[i].x+saved.items[i].width/2)/saved.width)<1e-8);
  assert.ok(Math.abs((item.y+item.height/2)/next.height-(saved.items[i].y+saved.items[i].height/2)/saved.height)<1e-8);
 }
 assert.equal(next.items[2].rotation,0);assert.equal(next.items[2].width,170);
 const edited={...next,items:next.items.map(i=>i.id==='s'?{...i,width:140,height:140,rotation:135}:i)};
 assert.equal(upgradeSketch(edited),edited);
});
test('rotated table corners stay within the canvas during edge moves and large resizes',()=>{
 const sketch=createInitialSketch();
 for(const rotation of [45,135,225,315])for(const patch of [{x:-900,y:-900},{x:9999,y:9999},{width:4000,height:4000}]){
  const item=fitItem({...sketch.items[0],rotation,...patch},sketch);assert.ok(validateSketch({...sketch,items:[item]}));
  const rad=rotation*Math.PI/180,halfX=(Math.abs(Math.cos(rad))*item.width+Math.abs(Math.sin(rad))*item.height)/2,halfY=(Math.abs(Math.sin(rad))*item.width+Math.abs(Math.cos(rad))*item.height)/2;
  const cx=item.x+item.width/2,cy=item.y+item.height/2;
  assert.ok(cx-halfX>=-1e-8&&cy-halfY>=-1e-8&&cx+halfX<=sketch.width+1e-8&&cy+halfY<=sketch.height+1e-8);
 }
});
test('group dragging preserves spacing and dimensions with grid snapping and shared edge limits',()=>{
 const sketch=createInitialSketch(),snapshot=structuredClone(sketch),ids=['round-1','round-2','banquet-20'];
 for(const [dx,dy,snap] of [[83,-23,false],[83,-23,true],[99999,-99999,true],[-99999,99999,false]]){
  const moved=moveSketchItems(sketch,ids,dx,dy,snap,'round-2');assert.ok(validateSketch(moved));
  const anchor=moved.items.find(i=>i.id==='round-2'),prior=sketch.items.find(i=>i.id==='round-2');
  for(const item of moved.items){const old=sketch.items.find(i=>i.id===item.id);
   if(!ids.includes(item.id)){assert.equal(item,old);continue;}
   assert.ok(Math.abs((item.x-old.x)-(anchor.x-prior.x))<1e-8);assert.ok(Math.abs((item.y-old.y)-(anchor.y-prior.y))<1e-8);
   assert.equal(item.width,old.width);assert.equal(item.height,old.height);assert.equal(item.rotation,old.rotation);
   const fitted=fitItem(item,moved);assert.ok(Math.abs(fitted.x-item.x)<1e-8&&Math.abs(fitted.y-item.y)<1e-8);
  }
  if(snap&&dx===83){assert.equal((anchor.x+anchor.width/2)%25,0);assert.equal((anchor.y+anchor.height/2)%25,0);}
 }
 assert.deepEqual(sketch,snapshot);assert.equal(moveSketchItems(sketch,[],2,3),sketch);
});
test('bulk sizing changes only selected tables, keeps their centres and capacities, and rejects impossible sizes atomically',()=>{
 const sketch=createInitialSketch(),snapshot=structuredClone(sketch),ids=['round-1','round-2','banquet-20','dj'];
 const next=resizeSketchTables(sketch,ids,140);assert.ok(validateSketch(next));
 for(const item of next.items){const prior=sketch.items.find(i=>i.id===item.id);
  if(!ids.includes(item.id)||item.kind==='dj'){assert.equal(item,prior);continue;}
  assert.equal(Math.min(item.width,item.height),140);if(item.kind==='round')assert.equal(item.width,item.height);
  else assert.equal(Math.max(item.width,item.height),Math.max(prior.width,prior.height));
  assert.equal(item.x+item.width/2,prior.x+prior.width/2);assert.equal(item.y+item.height/2,prior.y+prior.height/2);
  assert.equal(item.rotation,prior.rotation);assert.equal(item.seats,prior.seats);assert.equal(chairPositions(item).length,prior.seats);
 }
 for(const side of [0,47,NaN,2.5,1050])assert.throws(()=>resizeSketchTables(sketch,ids,side));
 assert.deepEqual(sketch,snapshot);
});
test('compact table labels omit the table prefix while service labels and saved labels remain intact',()=>{
 const sketch=createInitialSketch(),table=sketch.items[0];assert.equal(sketchItemLabel(table),'1');assert.equal(table.label,'שולחן 1');
 assert.equal(sketchItemLabel({...table,label:'12'}),'12');assert.equal(sketchItemLabel({...table,label:'אבירים 24'}),'אבירים 24');
 assert.equal(sketchItemLabel({...table,kind:'dj',label:'שולחן DJ'}),'שולחן DJ');
});
test('table links use stable IDs, prevent duplicate assignments, preserve geometry and return unlinked tables to the list',()=>{
 const sketch=createInitialSketch(),before=structuredClone(sketch),tables=[{id:'family',number:7,name:'משפחה'},{id:'friends',number:2,name:'חברים'}];
 assert.deepEqual(unlinkedSeatingTables(sketch,tables).map(t=>t.number),[2,7]);
 const next=linkSketchTable(sketch,'round-1',tables[0]),linked=next.items[0];assert.ok(validateSketch(next));
 assert.equal(linked.seatingTableId,'family');assert.equal(linked.label,'7');assert.equal(linked.name,'משפחה');
 for(const field of ['x','y','width','height','rotation','seats'])assert.equal(linked[field],sketch.items[0][field]);
 assert.deepEqual(unlinkedSeatingTables(next,tables).map(t=>t.id),['friends']);
 assert.throws(()=>linkSketchTable(next,'round-2',tables[0]));assert.throws(()=>linkSketchTable(next,'dj',tables[1]));
 const changed=linkSketchTable(next,'round-1',tables[1]);assert.deepEqual(unlinkedSeatingTables(changed,tables).map(t=>t.id),['family']);
 const detached=unlinkSketchTable(changed,'round-1');assert.equal(detached.items[0].seatingTableId,undefined);assert.equal(detached.items[0].label,'2');assert.equal(detached.items[0].name,'חברים');assert.equal(unlinkedSeatingTables(detached,tables).length,2);
 assert.deepEqual(sketch,before);
});
test('linked names and numbers follow the source without guessing replacements after deletion or renumbering',()=>{
 const sketch=linkSketchTable(createInitialSketch(),'round-1',{id:'a',number:7,name:'משפחה'});
 const next=syncSketchTableLabels(sketch,[{id:'a',number:42,name:''}]);assert.equal(next.items[0].label,'42');assert.equal(next.items[0].name,'');assert.equal(next.items[0].seatingTableId,'a');
 assert.equal(syncSketchTableLabels(next,[{id:'a',number:42}]),next);
 const other={id:'b',number:42,name:'אחר'};assert.equal(syncSketchTableLabels(next,[other]),next);assert.deepEqual(unlinkedSeatingTables(next,[other]),[other]);
 for(const seatingTableId of ['',42,'a'.repeat(101)])assert.equal(validateSketch({...next,items:[{...next.items[0],seatingTableId}]}),false);
 assert.equal(validateSketch({...next,items:[next.items[0],{...next.items[1],seatingTableId:'a'}]}),false);
 assert.equal(validateSketch({...next,items:[{...next.items[0],kind:'dj'}]}),false);
});

test('saved v3 layout shrinks tables once around their centres without altering equipment or assignments',async()=>{
 const {upgradeSketch}=await import('../lib/seating-sketch.ts');
 const original=createInitialSketch();
 const saved={...original,layoutVersion:3,items:original.items.map(item=>item.kind==='round'?{...item,width:100,height:100}:item)};
 const upgraded=upgradeSketch(saved);
 assert.equal(upgraded.layoutVersion,4);assert.ok(validateSketch(upgraded));
 for(let i=0;i<saved.items.length;i++){const before=saved.items[i],after=upgraded.items[i];
  assert.equal(after.id,before.id);assert.equal(after.label,before.label);assert.equal(after.seats,before.seats);
  if(before.kind==='round'){assert.equal(after.width,85);assert.equal(after.height,85);assert.equal(after.x+after.width/2,before.x+before.width/2);assert.equal(after.y+after.height/2,before.y+before.height/2);}
  else if(before.kind==='banquet')assert.equal(Math.min(after.width,after.height),85);
  else assert.deepEqual(after,before);
 }
 assert.equal(upgradeSketch(upgraded),upgraded);
});
