import { findCaller, loadCallsData } from '@/lib/calls-data';
import { callHeaders, invalidOrigin, recordCallAttempt, updateCallGuest } from '@/lib/calls-actions';
type Context={params:Promise<{token:string}>};
export async function GET(_request:Request,context:Context) {
  const {token}=await context.params;const caller=await findCaller(token);
  if(!caller)return Response.json({error:'הקישור אינו תקין או הוחלף. בקשו קישור חדש ממנהלי החתונה.'},{status:404,headers:callHeaders});
  try{return Response.json(await loadCallsData(false,caller),{headers:callHeaders});}
  catch{return Response.json({error:'טעינת הרשימה נכשלה. נסו שוב בעוד רגע.'},{status:503,headers:callHeaders});}
}
export async function POST(request:Request,context:Context) {
  if(invalidOrigin(request))return Response.json({error:'בקשה לא מורשית'},{status:403});
  const {token}=await context.params;const caller=await findCaller(token);
  if(!caller)return Response.json({error:'הקישור אינו תקין או הוחלף'},{status:404,headers:callHeaders});
  try {const text=await request.text();if(text.length>5000)return Response.json({error:'בקשה גדולה מדי'},{status:413});const payload=JSON.parse(text);if(payload.action==='record_call')return await recordCallAttempt(payload,caller);if(payload.action&&payload.action!=='update_guest')return Response.json({error:'אין הרשאה לפעולה הזו'},{status:403,headers:callHeaders});return await updateCallGuest(payload,caller);}
  catch{return Response.json({error:'לא הצלחנו לשמור. רעננו ונסו שוב.'},{status:503,headers:callHeaders});}
}
