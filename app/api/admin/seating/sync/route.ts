import {getAdminApiUser} from '@/lib/admin-auth';
import {getWeddingRuntimeConfig} from '@/lib/runtime-config';
import {syncSeatingSheets} from '@/lib/seating-sheet-sync';
import {claimWebhookRequest} from '@/lib/webhook-replay';
export async function POST(request:Request){
 const secret=getWeddingRuntimeConfig().seatingSyncSecret;
 const bearer=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]??'';
 const service=!!secret&&bearer.length===secret.length&&[...bearer].reduce((d,c,i)=>d|(c.charCodeAt(0)^secret.charCodeAt(i)),0)===0;
 if(!service){const auth=await getAdminApiUser();if(auth.response)return auth.response;const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'בקשה לא מורשית'},{status:403});}
 if(service){const denied=await claimWebhookRequest(request,'seating-sync');if(denied)return denied;}
 const refresh=new URL(request.url).searchParams.get('refresh')==='1';
 const result=await syncSeatingSheets(refresh,25);
 return Response.json(result,{status:result.error?503:200,headers:{'Cache-Control':'no-store'}});
}
