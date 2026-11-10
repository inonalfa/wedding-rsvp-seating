import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier==='./seating-sketch'&&context.parentURL?.endsWith('/sketch-pdf.ts'))return next(specifier+'.ts',context);return next(specifier,context);}});
const {drawSketchForPdf,jpegToLandscapePdf,sketchImageSize}=await import('../lib/sketch-pdf.ts');
const {createInitialSketch}=await import('../lib/seating-sketch.ts');
test('PDF drawing omits private table names while retaining table numbers and service labels without seat captions',()=>{
 const sketch=createInitialSketch();const texts=[];const ctx=new Proxy({measureText:v=>({width:v.length*8}),fillText:v=>texts.push(v)},{get:(target,key)=>key in target?target[key]:()=>{}});
 drawSketchForPdf(ctx,sketch);const baseline=[...texts];texts.length=0;drawSketchForPdf(ctx,{...sketch,items:sketch.items.map(i=>({...i,name:'פרטי משפחת כהן PRIVATE'}))});assert.deepEqual(texts,baseline);assert.ok(texts.includes('1'));assert.ok(!texts.some(v=>/^שולחן\s|^\d+ מקומות$/.test(v)));assert.ok(texts.includes('עמדת DJ'));assert.ok(texts.includes('רחבת נשים'));assert.ok(!texts.some(v=>v.includes('PRIVATE')));
});
test('direct PDF download data has one landscape A4 page and valid byte offsets around binary JPEG data',()=>{
 const jpeg=Uint8Array.from([255,216,0,128,255,0,255,217]);const bytes=jpegToLandscapePdf(jpeg,2860,2300),buffer=Buffer.from(bytes);const text=buffer.toString('latin1');assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/\/MediaBox \[0 0 841\.89 595\.28\]/);assert.match(text,/\/Count 1/);assert.match(text,/\/DCTDecode \/Length 8/);assert.ok(buffer.includes(Buffer.from(jpeg)));
 const start=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(buffer.subarray(start,start+4).toString(),'xref');const offsets=text.slice(start).split('\n').slice(3,8).map(row=>Number(row.slice(0,10)));offsets.forEach((offset,i)=>assert.equal(buffer.subarray(offset,offset+7).toString(),`${i+1} 0 obj`));
 const sketch=createInitialSketch(),size=sketchImageSize(sketch);assert.ok(size.width>sketch.width);assert.ok(size.height>sketch.height);
});
test('PDF table names are opt-in, service names stay excluded, and named labels fit inside their table',()=>{
 const sketch=createInitialSketch();sketch.items[0].name='משפחת הכלה';sketch.items.find(i=>i.kind==='dj').name='SERVICE_PRIVATE';
 const texts=[];const ctx=new Proxy({measureText:v=>({width:v.length*8}),fillText:(text,x,y)=>texts.push({text,x,y})},{get:(target,key)=>key in target?target[key]:()=>{}});
 drawSketchForPdf(ctx,sketch,{includeTableNames:false});assert.ok(!texts.some(t=>t.text.includes('משפחת')));texts.length=0;
 drawSketchForPdf(ctx,sketch,{includeTableNames:true});assert.ok(texts.some(t=>t.text.includes('משפחת')));assert.ok(texts.some(t=>t.text.includes('הכלה')));assert.ok(!texts.some(t=>t.text.includes('SERVICE_PRIVATE')));
 const nameRows=texts.filter(t=>t.text.includes('משפחת')||t.text.includes('הכלה'));assert.ok(nameRows.every(t=>t.y>4&&t.y<sketch.items[0].height-4));
 assert.equal(sketch.items[0].name,'משפחת הכלה');
});
