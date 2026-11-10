export type SearchGuest = {id:string; name:string; phone?:string; guestNumber?:string};
export function normalizeName(value:string) {
  const finals:Record<string,string>={'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'};
  return value.normalize('NFKD').toLowerCase().replace(/[\u0591-\u05c7]/g,'').replace(/[ךםןףץ]/g,c=>finals[c]).replace(/["'׳״`]/g,'').replace(/[^a-zא-ת0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
export function normalizePhone(value:string) {let n=value.replace(/\D/g,''); if(n.startsWith('00972'))n='0'+n.slice(5);else if(n.startsWith('972'))n='0'+n.slice(3);return n;}
const keys="qwertyuiopasdfghjkl;zxcvbnm,./";
const heb ="/׳קראטוןםפשדגכעיחלךףזסבהנמצתץ.";
function fromKeyboard(s:string){return [...s.toLowerCase()].map(c=>keys.includes(c)?heb[keys.indexOf(c)]:c).join('');}
function distance(a:string,b:string){
 const d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 for(let i=0;i<=a.length;i++)d[i][0]=i; for(let j=0;j<=b.length;j++)d[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++) {d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+Number(a[i-1]!==b[j-1]));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);}
 return d[a.length][b.length];
}
function spelling(s:string){return s.replace(/[וי]/g,'').replace(/א/g,'ע').replace(/ט/g,'ת').replace(/כ/g,'ח');}
function tokenScore(q:string,n:string){if(q===n)return 100;if(n.startsWith(q))return 90;if(q.length>=3&&n.includes(q))return 82;const d=distance(q,n);if(q.length>=3&&d<=(q.length>=6?2:1))return 79-d*8;if(q.length>=3&&spelling(q).length>=2&&spelling(q)===spelling(n))return 65;return 0;}
function nameScore(query:string,name:string){
 if(query===name)return 120;
 if(query.replace(/ /g,'')===name.replace(/ /g,''))return 110;
 const qs=query.split(' '),ns=name.split(' ');if(qs.length>ns.length)return 0;
 // Match distinct name tokens so repeating a term cannot create a false full-name match.
 const assign=(i:number,used:Set<number>):number=>{if(i===qs.length)return 0;let best=-10000;ns.forEach((n,j)=>{if(used.has(j))return;const s=tokenScore(qs[i],n);if(!s)return;best=Math.max(best,s+assign(i+1,new Set([...used,j])));});return best;};
 const score=assign(0,new Set());return score>0?score/qs.length:0;
}
export function searchGuests(guests:SearchGuest[],raw:string){
 const q=normalizeName(raw);if(q.length<2||raw.length>100)return [];
 if(/^[\d\s+().-]+$/.test(raw)) {const phone=normalizePhone(raw),number=raw.trim();return guests.filter(g=>(phone.length>=9&&normalizePhone(g.phone??'')===phone)||(g.guestNumber&&g.guestNumber===number)).map(guest=>({guest,score:120,approximate:false}));}
 const queries=[q];if(/[a-z]/i.test(raw))queries.push(normalizeName(fromKeyboard(raw)));
 return guests.map(guest=>{const score=Math.max(...queries.map(v=>nameScore(v,normalizeName(guest.name))));return {guest,score,approximate:score<82};}).filter(r=>r.score>=60).sort((a,b)=>b.score-a.score||a.guest.name.localeCompare(b.guest.name,'he'));
}
