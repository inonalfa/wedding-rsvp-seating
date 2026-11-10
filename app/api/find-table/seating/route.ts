import {ensureRsvpSchema,getD1Binding} from '@/db';
import {loadSeatingData} from '@/lib/seating-data';
import {validatePlan} from '@/lib/seating-model';
import {receptionTables,assignReceptionGuest} from '@/lib/reception-seating';
import {readSeatTicket,seatTicket} from '@/lib/reception-token';
import {syncSeatingSheets} from '@/lib/seating-sheet-sync';
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
export async function GET(){
 try{await ensureRsvpSchema();const data=await loadSeatingData();const sheetSync=await syncSeatingSheets(false,5);return Response.json({tables:receptionTables(data.plan,data.guests),revision:data.revision,stale:!!data.warning,sheetSync},{headers});}
 catch{return Response.json({error:'לא הצלחנו לטעון את המקומות הפנויים. נסו לרענן.'},{status:503,headers});}
}
export async function POST(request:Request){
 // This public reception page deliberately permits narrowly scoped seating actions.
 // Search issues signed guest capabilities; clients cannot replace the whole plan,
 // alter RSVP counts or use the capability for any admin operation.
 const origin=request.headers.get('origin');
 if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return Response.json({error:'בקשה לא מורשית'},{status:403,headers});
 try{
  const body=await request.text();if(body.length>4000)return Response.json({error:'בקשה גדולה מדי'},{status:400,headers});
  const payload=JSON.parse(body);
  if(!Number.isSafeInteger(payload.revision)||payload.revision<0||!['seat','undo'].includes(payload.action))return Response.json({error:'פרטי ההושבה אינם תקינים'},{status:400,headers});
  const ticket=await readSeatTicket(payload.ticket);
  const undo=Object.prototype.hasOwnProperty.call(ticket,'undoTarget');
  if((payload.action==='undo')!==undo)return Response.json({error:'פעולת הושבה לא תקינה'},{status:403,headers});
  const targetId=undo?ticket.undoTarget!:payload.tableId;
  if(targetId!==null&&(typeof targetId!=='string'||!targetId||targetId.length>100)||(!undo&&targetId===null))return Response.json({error:'יש לבחור שולחן'},{status:400,headers});
  await ensureRsvpSchema();const data=await loadSeatingData();
  if(data.warning)return Response.json({error:'לא ניתן לשמור כשנתוני האורחים אינם מעודכנים. נסו לרענן בעוד רגע.'},{status:503,headers});
  if(!validatePlan(data.plan))throw new Error('סידור ההושבה אינו תקין');
  const next=assignReceptionGuest(data.plan,data.guests,ticket.guestId,targetId,ticket.sourceId,ticket.count);
  if(next.changed&&payload.revision!==data.revision)return Response.json({error:'המקומות הפנויים עודכנו במכשיר אחר. בדקו את הרשימה המעודכנת ונסו שוב.'},{status:409,headers});
  let revision=data.revision;
  if(next.changed){
   const saved=await getD1Binding().prepare('UPDATE seating_plans SET document=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=? RETURNING revision').bind(JSON.stringify(next.plan),new Date().toISOString(),data.revision).first<{revision:number}>();
   if(!saved)return Response.json({error:'סידור ההושבה השתנה בזמן השמירה. רעננו ונסו שוב.'},{status:409,headers});revision=saved.revision;
  }
  const sheetSync=await syncSeatingSheets();
  const guest=data.guests.find(g=>g.id===ticket.guestId)!;
  return Response.json({ok:true,sheetSync,name:guest.name,count:guest.count,tableNumber:next.plan.tables.find(t=>t.id===targetId)?.number??null,tables:receptionTables(next.plan,data.guests),revision,undoTicket:!undo?await seatTicket(ticket.guestId,ticket.count,targetId,ticket.sourceId):null},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'לא הצלחנו לשמור את ההושבה. נסו שוב.'},{status:400,headers});}
}
