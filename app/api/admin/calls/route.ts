import { getAdminApiUser } from '@/lib/admin-auth';
import { getD1Binding } from '@/db';
import { loadCallsData, createCallToken, hashCallToken } from '@/lib/calls-data';
import { callHeaders, invalidOrigin, recordCallAttempt, updateCallGuest } from '@/lib/calls-actions';
export async function GET(request:Request) {
  const auth=await getAdminApiUser();if(auth.response)return auth.response;
  try{return Response.json(await loadCallsData(new URL(request.url).searchParams.get('refresh')==='1'),{headers:callHeaders});}
  catch(e){return Response.json({error:e instanceof Error?e.message:'טעינת רשימת השיחות נכשלה'},{status:503,headers:callHeaders});}
}
export async function POST(request:Request) {
  const auth=await getAdminApiUser();if(auth.response)return auth.response;
  if(invalidOrigin(request))return Response.json({error:'בקשה לא מורשית'},{status:403});
  try {
    const body=await request.text();if(body.length>100_000)return Response.json({error:'בקשה גדולה מדי'},{status:413});
    const payload=JSON.parse(body);const db=getD1Binding();const now=new Date().toISOString();
    if(payload.action==='record_call') return await recordCallAttempt(payload,undefined,auth.user.fullName||auth.user.email);
    if(payload.action==='save_script') {
      const script=typeof payload.openingScript==='string'?payload.openingScript.trim():'';
      if(!script||script.length>3000||!Number.isSafeInteger(payload.revision)||payload.revision<0)return Response.json({error:'יש להזין נוסח פתיחה עד 3000 תווים'},{status:400,headers:callHeaders});
      const row=payload.revision===0
        ? await db.prepare('INSERT INTO call_settings (id,opening_script,revision,updated_at) VALUES (1,?,1,?) ON CONFLICT(id) DO NOTHING RETURNING revision').bind(script,now).first<{revision:number}>()
        : await db.prepare('UPDATE call_settings SET opening_script=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=? RETURNING revision').bind(script,now,payload.revision).first<{revision:number}>();
      if(!row)return Response.json({error:'הנוסח עודכן ממכשיר אחר. רעננו ונסו שוב.'},{status:409,headers:callHeaders});
      return Response.json({ok:true,revision:row.revision},{headers:callHeaders});
    }
    if(payload.action==='create_caller') {
      const name=typeof payload.name==='string'?payload.name.trim():'';
      if(!name||name.length>80)return Response.json({error:'יש להזין שם מתקשר עד 80 תווים'},{status:400});
      const id=crypto.randomUUID();const token=createCallToken();
      await db.prepare('INSERT INTO call_agents (id,name,share_token,token_hash,created_at) VALUES (?,?,?,?,?)').bind(id,name,token,await hashCallToken(token),now).run();
      return Response.json({ok:true,caller:{id,name,shareToken:token}},{headers:callHeaders});
    }
    if(payload.action==='rename_caller') {
      const name=typeof payload.name==='string'?payload.name.trim():'';
      if(!name||name.length>80||typeof payload.originalName!=='string'||typeof payload.callerId!=='string')return Response.json({error:'יש להזין שם מתקשר עד 80 תווים'},{status:400,headers:callHeaders});
      const row=await db.prepare('UPDATE call_agents SET name=? WHERE id=? AND name=? AND active=1 RETURNING id,name').bind(name,payload.callerId,payload.originalName).first<{id:string;name:string}>();
      if(!row)return Response.json({error:'פרטי המתקשר השתנו. רעננו לפני עריכה נוספת.'},{status:409,headers:callHeaders});
      return Response.json({ok:true,caller:row},{headers:callHeaders});
    }
    if(payload.action==='rotate_link') {
      const token=createCallToken();
      const row=await db.prepare('UPDATE call_agents SET share_token=?,token_hash=? WHERE id=? AND active=1 RETURNING id').bind(token,await hashCallToken(token),String(payload.callerId??'')).first();
      if(!row)return Response.json({error:'המתקשר לא נמצא'},{status:404});
      return Response.json({ok:true},{headers:callHeaders});
    }
    if(payload.action==='assign') {
      if(!Array.isArray(payload.inviteIds)||!payload.inviteIds.length||payload.inviteIds.length>1000)return Response.json({error:'יש לבחור אורחים לשיוך'},{status:400});
      const callerId=payload.callerId===null?null:String(payload.callerId??'');
      if(callerId && !await db.prepare('SELECT id FROM call_agents WHERE id=? AND active=1').bind(callerId).first())return Response.json({error:'המתקשר לא נמצא'},{status:400});
      const guests=new Set((await loadCallsData()).guests.map(g=>g.id));const ids=[...new Set(payload.inviteIds)] as string[];
      if(ids.some(id=>typeof id!=='string'||!guests.has(id)))return Response.json({error:'חלק מהאורחים אינם ברשימה. רעננו ונסו שוב.'},{status:400});
      for(let i=0;i<ids.length;i+=80) await db.batch(ids.slice(i,i+80).map(id=>db.prepare('INSERT INTO call_tasks (invite_id,caller_id,updated_at,version) VALUES (?,?,?,1) ON CONFLICT(invite_id) DO UPDATE SET caller_id=excluded.caller_id,updated_at=excluded.updated_at,version=call_tasks.version+1').bind(id,callerId,now)));
      return Response.json({ok:true},{headers:callHeaders});
    }
    if(payload.action==='update_guest')return await updateCallGuest(payload);
    return Response.json({error:'פעולה לא תקינה'},{status:400});
  }catch(e){console.error('Calls admin action failed',e instanceof Error?e.message:'Unknown');return Response.json({error:'לא הצלחנו לשמור. רעננו ונסו שוב.'},{status:503,headers:callHeaders});}
}
