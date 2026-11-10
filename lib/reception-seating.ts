import type {Guest,SeatingPlan} from './seating-model';
export function receptionTables(plan:SeatingPlan,guests:Guest[]){
 const byId=new Map(guests.map(g=>[g.id,g]));
 return plan.tables.map(t=>{
  let occupied=0,unknown=false;
  for(const id of t.guests){const guest=byId.get(id);if(!guest)continue;if(guest.count==null)unknown=true;else occupied+=guest.count;}
  return {id:t.id,number:t.number,name:t.name??'',capacity:t.capacity,occupied,available:unknown?null:Math.max(0,t.capacity-occupied)};
 }).sort((a,b)=>a.number-b.number);
}
export function assignReceptionGuest(plan:SeatingPlan,guests:Guest[],guestId:string,targetId:string|null,sourceId:string|null,expectedCount:number){
 const guest=guests.find(g=>g.id===guestId);
 if(!guest||guest.count==null||guest.count!==expectedCount)throw new Error('פרטי האורח השתנו. חפשו אותו מחדש לפני ההושבה.');
 const current=plan.tables.find(t=>t.guests.includes(guestId))?.id??null;
 if(current===targetId)return {plan,changed:false};
 if(current!==sourceId)throw new Error('השיבוץ של האורח השתנה במכשיר אחר. חפשו אותו מחדש.');
 if(targetId!==null){
  const table=receptionTables(plan,guests).find(t=>t.id===targetId);
  if(!table)throw new Error('השולחן כבר אינו קיים. רעננו את הרשימה.');
  if(table.available===null)throw new Error('חסרים נתוני כמות בשולחן הזה. יש לבדוק בסידורי ההושבה.');
  if(table.number!==2&&table.available<guest.count)throw new Error(`נותרו רק ${table.available} מקומות בשולחן. בחרו שולחן אחר.`);
 }
 return {changed:true,plan:{tables:plan.tables.map(t=>({...t,guests:[...t.guests.filter(id=>id!==guestId),...(t.id===targetId?[guestId]:[])]}))}};
}
