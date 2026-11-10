import {eventConfig} from './event-config';
import type {SeatingPlan,SheetRange} from './seating-model';
export type SheetSeat={key:string;inviteId:string;sourceSheet:string;tableNumber:number|null;observed:number|null};
export type SeatSnapshot=Record<string,number|null>;
export function sheetSeats(plan:SeatingPlan,ranges:SheetRange[]):SheetSeat[]{
 const assigned=new Map(plan.tables.flatMap(t=>t.guests.map(id=>[id,t.number] as const)));
 const result:SheetSeat[]=[],seen=new Set<string>();
 for(const sourceSheet of eventConfig.sheetNames){
  const range=ranges.find(r=>r.range.startsWith(`'${sourceSheet}'!`)||r.range.startsWith(`${sourceSheet}!`));
  if(!range?.values?.length)throw new Error('חסרים נתונים מאחד הגיליונות');
  for(const row of range.values.slice(1)){
   const inviteId=String(row[8]??'').trim();if(!inviteId)continue;
   if(seen.has(inviteId))throw new Error('נמצאו מזהי הזמנה כפולים. הסנכרון נעצר.');seen.add(inviteId);
   const raw=String(row[19]??'').trim(),observed=raw?(Number.isFinite(Number(raw))?Number(raw):-1):null;
   result.push({key:sourceSheet+':'+inviteId,inviteId,sourceSheet,tableNumber:assigned.get(inviteId)??null,observed});
  }
 }
 return result;
}
export function pendingSheetSeats(rows:SheetSeat[],snapshot:SeatSnapshot){
 return rows.filter(row=>(Object.hasOwn(snapshot,row.key)?snapshot[row.key]:row.observed)!==row.tableNumber);
}
