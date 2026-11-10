import {getD1Binding} from '@/db';
import {getWeddingRuntimeConfig} from '@/lib/runtime-config';
import {loadSeatingData} from '@/lib/seating-data';
import {validatePlan,type SeatingPlan,type SheetRange} from '@/lib/seating-model';
import {sheetSeats,pendingSheetSeats,type SeatSnapshot} from '@/lib/seating-sheet-model';

export type SheetSyncResult={synced:number;pending:number;busy?:boolean;error?:string};
export async function syncSeatingSheets(refresh=false,limit=25):Promise<SheetSyncResult>{
 const db=getD1Binding(),url=getWeddingRuntimeConfig().makeWebhookUrl;
 if(!url)return {synced:0,pending:-1,error:'חיבור הסנכרון לגיליונות אינו מוגדר'};
 const token=crypto.randomUUID();let locked=false,synced=0;
 try{
  await db.prepare("CREATE TABLE IF NOT EXISTS seating_sheet_sync (id INTEGER PRIMARY KEY, snapshot TEXT NOT NULL DEFAULT '{}', lease_token TEXT NOT NULL DEFAULT '', lease_until INTEGER NOT NULL DEFAULT 0)").run();
  await db.prepare('INSERT OR IGNORE INTO seating_sheet_sync (id) VALUES (1)').run();
  const lock=await db.prepare('UPDATE seating_sheet_sync SET lease_token=?,lease_until=? WHERE id=1 AND lease_until<? RETURNING snapshot').bind(token,Date.now()+90_000,Date.now()).first<{snapshot:string}>();
  if(!lock)return {synced:0,pending:-1,busy:true};locked=true;
  if(refresh){const data=await loadSeatingData(true);if(data.warning)throw new Error('הרענון מהגיליונות נכשל. נסו שוב.');}
  const source=await db.prepare('SELECT document FROM seating_sources WHERE id=1').first<{document:string}>();
  const ranges:SheetRange[]=source?JSON.parse(source.document):[];
  let snapshot:SeatSnapshot=JSON.parse(lock.snapshot);
  const readRows=async()=>{
   const saved=await db.prepare('SELECT document FROM seating_plans WHERE id=1').first<{document:string}>();
   if(!saved)throw new Error('טרם נשמר סידור הושבה');
   const plan:SeatingPlan=JSON.parse(saved.document);if(!validatePlan(plan))throw new Error('סידור ההושבה אינו תקין');
   return sheetSeats(plan,ranges);
  };
  if(refresh){snapshot={};for(const row of await readRows())snapshot[row.key]=row.observed;}
  while(synced<limit){
   const pending=pendingSheetSeats(await readRows(),snapshot);
   if(!pending.length){await db.prepare('UPDATE seating_sheet_sync SET snapshot=? WHERE id=1 AND lease_token=?').bind(JSON.stringify(snapshot),token).run();return {synced,pending:0};}
   await db.prepare('UPDATE seating_sheet_sync SET lease_until=? WHERE id=1 AND lease_token=?').bind(Date.now()+90_000,token).run();
   const batch=pending.slice(0,Math.min(5,limit-synced));
   const results=await Promise.allSettled(batch.map(async row=>{
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schemaVersion:1,event:'seating.updated',inviteId:row.inviteId,sourceSheet:row.sourceSheet,tableNumber:row.tableNumber??''}),signal:AbortSignal.timeout(15_000)});
    if(!response.ok)throw new Error('Sheet update failed');
    const ack=await response.json() as {ok?:boolean;event?:string};
    if(ack.ok!==true||ack.event!=='seating.updated')throw new Error('Sheet update not confirmed');
    return row;
   }));
   let failed=false;
   for(const result of results){if(result.status==='fulfilled'){snapshot[result.value.key]=result.value.tableNumber;synced++;}else failed=true;}
   await db.prepare('UPDATE seating_sheet_sync SET snapshot=? WHERE id=1 AND lease_token=?').bind(JSON.stringify(snapshot),token).run();
   if(failed)return {synced,pending:pendingSheetSeats(await readRows(),snapshot).length,error:'חלק ממספרי השולחנות טרם סונכרנו. הסנכרון ינסה שוב ברענון הבא.'};
  }
  return {synced,pending:pendingSheetSeats(await readRows(),snapshot).length};
 }catch(e){console.error('Seating sheet sync failed',e instanceof Error?e.message:'unknown');return {synced,pending:-1,error:e instanceof Error?e.message:'סנכרון הגיליונות נכשל'};}
 finally{if(locked)await db.prepare("UPDATE seating_sheet_sync SET lease_token='',lease_until=0 WHERE id=1 AND lease_token=?").bind(token).run().catch(()=>console.error('Could not release sheet sync lease'));}
}
