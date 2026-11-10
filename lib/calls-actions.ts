import { getD1Binding } from '@/db';
import { getWeddingRuntimeConfig } from '@/lib/runtime-config';
import { findCallGuest } from '@/lib/calls-data';
import { saveCallRsvp } from '@/lib/rsvp-sync';
import { composeCallNotes, validFollowupDate, type Caller } from '@/lib/calls-model';
export const callHeaders = {'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
export function invalidOrigin(request:Request) {const origin=request.headers.get('origin');return !!origin&&origin!==new URL(request.url).origin;}
export async function updateCallGuest(payload:Record<string,unknown>,caller?:Caller) {
  if (typeof payload.inviteId!=='string'||!Number.isSafeInteger(payload.version)||!['yes','no','no_answer','follow_up'].includes(String(payload.status))) return Response.json({error:'פרטי העדכון אינם תקינים'},{status:400,headers:callHeaders});
  const guest=await findCallGuest(payload.inviteId,caller);
  if(!guest) return Response.json({error:'האורח אינו משויך לרשימה הזו'},{status:404,headers:callHeaders});
  const localOnly=payload.status==='no_answer'||payload.status==='follow_up';
  if(payload.status==='follow_up'&&!validFollowupDate(payload.followupDate))return Response.json({error:'יש לבחור תאריך תקין מהיום ואילך'},{status:400,headers:callHeaders});
  if(!localOnly&&((payload.notes!==undefined&&(typeof payload.notes!=='string'||payload.notes.length>2000))||(payload.vegetarian!==undefined&&typeof payload.vegetarian!=='boolean')))return Response.json({error:'יש להזין הערות עד 2000 תווים וסימון מנה צמחונית תקין'},{status:400,headers:callHeaders});
  const message=composeCallNotes(typeof payload.notes==='string'?payload.notes:guest.notes,payload.status==='yes'&&(typeof payload.vegetarian==='boolean'?payload.vegetarian:guest.vegetarian));
  const count=payload.status==='yes'?Number(payload.guestCount):0;
  if(payload.status==='yes'&&(!Number.isSafeInteger(count)||count<1||count>1000)) return Response.json({error:'יש להזין מספר אורחים בין 1 ל-1000'},{status:400,headers:callHeaders});
  if(localOnly&&guest.attendance!=='pending') return Response.json({error:'האורח כבר השיב להזמנה. רעננו את הרשימה.'},{status:409,headers:callHeaders});
  if(!localOnly&&guest.id.includes(':row:')) return Response.json({error:'חסר מזהה הזמנה בגיליון. יש ליצור קישור הזמנה לאורח לפני עדכון הגעה.'},{status:400,headers:callHeaders});
  if(!localOnly&&!getWeddingRuntimeConfig().makeWebhookUrl) return Response.json({error:'החיבור לעדכון אישורי ההגעה אינו זמין כרגע'},{status:503,headers:callHeaders});
  const now=new Date().toISOString(); const retryAt=payload.status==='no_answer'?new Date(Date.now()+2*60*60*1000).toISOString():payload.status==='follow_up'?String(payload.followupDate):null;
  const db=getD1Binding();
  // An unassigned admin update can create a task. Public callers require an existing assignment.
  if(!caller) await db.prepare('INSERT INTO call_tasks (invite_id,updated_at) VALUES (?,?) ON CONFLICT(invite_id) DO NOTHING').bind(guest.id,now).run();
  const saved=await db.prepare('UPDATE call_tasks SET call_status=?,retry_at=?,version=version+1,updated_at=? WHERE invite_id=? AND version=?'+(caller?' AND caller_id=?':'')+' RETURNING version')
    .bind(String(payload.status),retryAt,now,guest.id,Number(payload.version),...(caller?[caller.id]:[])).first<{version:number}>();
  if(!saved) return Response.json({error:'הרשומה עודכנה או הועברה למתקשר אחר. רעננו לפני עדכון נוסף.'},{status:409,headers:callHeaders});
  if(localOnly) return Response.json({ok:true,retryAt,version:saved.version},{headers:callHeaders});
  try {
    const result=await saveCallRsvp({inviteId:guest.id,firstName:guest.firstName,fullName:guest.name,phone:guest.phone,attendance:payload.status as 'yes'|'no',guestCount:count,sourceSheet:guest.sourceSheet,sourceRow:guest.sourceRow,message});
    return Response.json({ok:true,...result,version:saved.version},{headers:callHeaders});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:'שמירת האישור נכשלה. רעננו ונסו שוב.'},{status:503,headers:callHeaders});
  }
}

export async function recordCallAttempt(payload:Record<string,unknown>,caller?:Caller,adminName?:string) {
  if(typeof payload.inviteId!=='string'||typeof payload.attemptId!=='string'||!/^[-a-zA-Z0-9]{20,80}$/.test(payload.attemptId)) return Response.json({error:'פרטי החיוג אינם תקינים'},{status:400,headers:callHeaders});
  const guest=await findCallGuest(payload.inviteId,caller);
  if(!guest) return Response.json({error:'האורח אינו משויך לרשימה הזו'},{status:404,headers:callHeaders});
  if(!/^0\d{8,9}$/.test(guest.phone)) return Response.json({error:'אין לאורח מספר טלפון תקין'},{status:400,headers:callHeaders});
  const db=getD1Binding();const now=new Date().toISOString();
  // The current assignment is checked again in the insert, including during transfer.
  await (caller
    ? await db.prepare('INSERT INTO call_attempts (id,invite_id,caller_id,caller_name,phone,clicked_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM call_tasks WHERE invite_id=? AND caller_id=?) ON CONFLICT(id) DO NOTHING').bind(payload.attemptId,guest.id,caller.id,caller.name,guest.phone,now,guest.id,caller.id).run()
    : await db.prepare('INSERT INTO call_attempts (id,invite_id,caller_id,caller_name,phone,clicked_at) VALUES (?,?,NULL,?,?,?) ON CONFLICT(id) DO NOTHING').bind(payload.attemptId,guest.id,adminName??'מנהל/ת החתונה',guest.phone,now).run());
  const existing=await db.prepare('SELECT invite_id,caller_id,clicked_at FROM call_attempts WHERE id=?').bind(payload.attemptId).first<{invite_id:string;caller_id:string|null;clicked_at:string}>();
  if(!existing||existing.invite_id!==guest.id||existing.caller_id!==(caller?.id??null)) return Response.json({error:'שיוך האורח השתנה. רעננו לפני חיוג נוסף.'},{status:409,headers:callHeaders});
  return Response.json({ok:true,clickedAt:existing.clicked_at},{headers:callHeaders});
}
