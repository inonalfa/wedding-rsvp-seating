import {getD1Binding,ensureRsvpSchema} from '@/db';
import {loadSeatingData} from '@/lib/seating-data';
import {seatTicket} from '@/lib/reception-token';
import {searchGuests} from '@/lib/guest-search';
import type {SheetRange} from '@/lib/seating-model';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
export async function POST(request:Request){
 try {
  const body=await request.text();if(body.length>500)return Response.json({error:'החיפוש ארוך מדי'},{status:400,headers});
  const {query}=JSON.parse(body);if(typeof query!=='string'||query.length>100)return Response.json({error:'חיפוש לא תקין'},{status:400,headers});
  if(query.trim().length<2)return Response.json({results:[],more:false},{headers});
  await ensureRsvpSchema();
  const {guests,plan,warning}=await loadSeatingData();
  const cached=await getD1Binding().prepare('SELECT document FROM seating_sources WHERE id=1').first<{document:string}>();
  const ranges:SheetRange[]=cached?JSON.parse(cached.document):[];
  const searchable=guests.map(g=>{const range=ranges.find(r=>r.range.startsWith(`'מוזמנים ${g.side}'!`)||r.range.startsWith(`מוזמנים ${g.side}!`));const row=range?.values?.[g.sourceRow-1];return {...g,phone:String(row?.[3]??''),guestNumber:String(row?.[6]??'').trim()};});
  const matches=searchGuests(searchable,query);
  const tables=new Map(plan.tables.flatMap(t=>t.guests.map(id=>[id,t] as const)));
  // Keep search relevance within each group, but show unseated guests first.
  matches.sort((a,b)=>Number(tables.has(a.guest.id))-Number(tables.has(b.guest.id)));
  return Response.json({results:await Promise.all(matches.slice(0,8).map(async ({guest,approximate})=>{const table=tables.get(guest.id);const details=guests.find(g=>g.id===guest.id)!;return {name:guest.name,tableNumber:table?.number??null,tableName:table?.name??'',approximate,count:details.count,estimated:details.estimated,ticket:details.count?await seatTicket(guest.id,details.count,table?.id??null):null};})),more:matches.length>8,stale:!!warning},{headers});
 }catch {return Response.json({error:'לא הצלחנו לחפש כרגע. נסו שוב בעוד רגע.'},{status:503,headers});}
}
