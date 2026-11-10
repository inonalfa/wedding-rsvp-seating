import {getWeddingRuntimeConfig} from '@/lib/runtime-config';
type Ticket={scope:'reception-seat-v1';guestId:string;count:number;sourceId:string|null;expires:number;undoTarget?:string|null};
const encode=(a:Uint8Array)=>btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(){const c=getWeddingRuntimeConfig();const secret=c.inviteShortTokenSecret||c.inviteTokenSecret;if(!secret)throw new Error('Seating signing key unavailable');return crypto.subtle.importKey('raw',new TextEncoder().encode(`reception-seat-v1:${secret}`),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function seatTicket(guestId:string,count:number,sourceId:string|null,undoTarget?:string|null){
 const payload:Ticket={scope:'reception-seat-v1',guestId,count,sourceId,expires:Date.now()+30*60*1000,...(undoTarget!==undefined?{undoTarget}:{})};
 const body=encode(new TextEncoder().encode(JSON.stringify(payload)));
 return body+'.'+encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(),new TextEncoder().encode(body))));
}
export async function readSeatTicket(token:unknown){
 try{
  if(typeof token!=='string'||token.length>2000)throw 0;
  const parts=token.split('.');if(parts.length!==2)throw 0;
  if(!await crypto.subtle.verify('HMAC',await key(),decode(parts[1]),new TextEncoder().encode(parts[0])))throw 0;
  const value=JSON.parse(new TextDecoder().decode(decode(parts[0]))) as Ticket;
  if(value.scope!=='reception-seat-v1'||!value.guestId||!Number.isSafeInteger(value.count)||value.count<1||value.expires<Date.now())throw 0;
  return value;
 }catch{throw new Error('תוקף פעולת ההושבה פג. חפשו את האורח מחדש.');}
}
