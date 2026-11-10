'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import SwipeGuestCard from './SwipeGuestCard';
import SketchViewer from './SketchViewer';
import { eventConfig, eventDate, eventHosts, allowsTableOverflow } from '@/lib/event-config';
type Result={name:string;tableNumber:number|null;tableName:string;approximate:boolean;count:number|null;estimated:boolean;ticket:string|null};
type Table={id:string;number:number;name:string;capacity:number;occupied:number;available:number|null};
type Availability={tables:Table[];revision:number;stale?:boolean};
type Saved={message:string;undoTicket:string|null};
export default function FindTable(){
 const [query,setQuery]=useState(''),[results,setResults]=useState<Result[]>([]),[state,setState]=useState('idle'),[error,setError]=useState(''),[more,setMore]=useState(false),[stale,setStale]=useState(false),[retry,setRetry]=useState(0);
 const [open,setOpen]=useState(false),[availability,setAvailability]=useState<Availability|null>(null),[tableError,setTableError]=useState(''),[tablesLoading,setTablesLoading]=useState(false),[selected,setSelected]=useState<Result|null>(null),[pendingTable,setPendingTable]=useState<Table|null>(null),[saving,setSaving]=useState(false),[saved,setSaved]=useState<Saved|null>(null);
 const input=useRef<HTMLInputElement>(null),accordion=useRef<HTMLDivElement>(null),saveLock=useRef(false),loadNumber=useRef(0);
 const refreshTables=useCallback(async()=>{
  const n=++loadNumber.current;setTablesLoading(true);setTableError('');
  try{const r=await fetch('/api/find-table/seating',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error);if(n===loadNumber.current){setAvailability(d);if(d.sheetSync?.error)setTableError(d.sheetSync.error);}}
  catch(e){if(n===loadNumber.current){setAvailability(null);setTableError(e instanceof Error?e.message:'טעינת השולחנות נכשלה');}}
  finally{if(n===loadNumber.current)setTablesLoading(false);}
 },[]);
 useEffect(()=>{
  if(!open)return;
  void refreshTables();
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!saveLock.current)void refreshTables();},20000);
  return()=>clearInterval(timer);
 },[open,refreshTables]);
 useEffect(()=>{
  const controller=new AbortController();setResults([]);setMore(false);setStale(false);setError('');
  if(query.trim().length<2){setState('idle');return ()=>controller.abort();}
  setState('loading');
  const timer=setTimeout(async()=>{try{const r=await fetch('/api/find-table',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:query.trim()}),signal:controller.signal});const data=await r.json();if(!r.ok)throw new Error(data.error);if(controller.signal.aborted)return;setResults(data.results);setMore(data.more);setStale(data.stale);setState('done');}catch(e){if(controller.signal.aborted)return;setError(e instanceof Error?e.message:'לא הצלחנו לחפש כרגע');setState('error');}},300);
  return ()=>{clearTimeout(timer);controller.abort();};
 },[query,retry]);
 function chooseGuest(guest:Result){setSelected(guest);setPendingTable(null);setOpen(true);setSaved(null);if(open)void refreshTables();requestAnimationFrame(()=>accordion.current?.scrollIntoView({behavior:'smooth',block:'nearest'}));}
 async function saveSeat(table?:Table,undoTicket?:string){
  if(saveLock.current||!availability||(!undoTicket&&(!selected?.ticket||!table)))return;
  saveLock.current=true;setSaving(true);setTableError('');++loadNumber.current;setTablesLoading(false);
  try{
   const r=await fetch('/api/find-table/seating',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:undoTicket?'undo':'seat',ticket:undoTicket??selected!.ticket,tableId:table?.id,revision:availability.revision})});
   const d=await r.json();if(!r.ok)throw new Error(d.error||'השמירה נכשלה');
   setAvailability({tables:d.tables,revision:d.revision});setSaved({message:undoTicket?'ההושבה האחרונה בוטלה. השיבוץ הקודם שוחזר.':`${d.name} · ${d.count} ${d.count===1?'אורח':'אורחים'} שובצו לשולחן ${d.tableNumber}`,undoTicket:d.undoTicket});
   if(d.sheetSync?.error)setTableError(d.sheetSync.error);setSelected(null);setPendingTable(null);setRetry(v=>v+1);
  }catch(e){
   const message=e instanceof Error?e.message:'השמירה לא אושרה. רעננו ובדקו לפני ניסיון נוסף.';
   await refreshTables();setTableError(message);setPendingTable(null);setRetry(v=>v+1);
  }finally{saveLock.current=false;setSaving(false);}
 }
 const free=availability?.tables.filter(t=>t.available!==null&&(t.available>0||allowsTableOverflow(t.number)))??[];
 const uncertain=availability?.tables.filter(t=>t.available===null).length??0;
 return <main className="finder finder-reception"><header className="finder-brand"><SketchViewer/><span aria-hidden="true">{eventConfig.monogram[0]} <i>&</i> {eventConfig.monogram[1]}</span><p>{eventHosts} <b>·</b> {eventDate}</p></header><section className="finder-content" aria-label="חיפוש אורחים והושבה"><form onSubmit={e=>{e.preventDefault();input.current?.blur();}} role="search"><label htmlFor="guest-search">שם האורח או מספר הטלפון</label><div className="finder-input"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input ref={input} id="guest-search" type="search" dir="auto" autoComplete="off" maxLength={100} enterKeyHint="search" placeholder="למשל, ישראל ישראלי" value={query} disabled={saving} onChange={e=>{setQuery(e.target.value);setSelected(null);setPendingTable(null);}} aria-describedby="finder-hint"/>{query&&<button type="button" aria-label="ניקוי החיפוש" disabled={saving} onClick={()=>{setQuery('');setSelected(null);setPendingTable(null);input.current?.focus();}}>×</button>}</div><p id="finder-hint" className="finder-hint">אפשר גם שם חלקי או מספר אורח. בחיפוש טלפון, הזינו מספר מלא.</p></form>
 <div className="finder-results" aria-live="polite" aria-busy={state==='loading'}>
 {state==='loading'&&<p className="finder-empty"><span className="finder-spinner"/> מחפשים...</p>}
 {state==='error'&&<div className="finder-message"><p>{error}</p><button onClick={()=>setRetry(v=>v+1)}>ננסה שוב</button></div>}
 {state==='done'&&!results.length&&<div className="finder-message"><h2>לא נמצאה התאמה</h2><p>נסו שם משפחה, שם נוסף בהזמנה או מספר טלפון מלא.</p></div>}
 {state==='done'&&results.length>0&&<><p className="finder-result-label">{results.length===1?'תוצאת החיפוש':'נמצאו כמה התאמות - בחרו את האורח הנכון'}</p><p className="finder-swipe-hint">החליקו כרטיס ימינה או שמאלה לפעולות הושבה</p>{results.map((r,i)=><SwipeGuestCard key={`${r.name}-${i}`} selected={!!r.ticket&&selected?.ticket===r.ticket} disabled={saving||!r.ticket||stale} label={`${r.tableNumber===null?'בחירת שולחן':'העברה לשולחן אחר'} עבור ${r.name}`} onAction={()=>chooseGuest(r)}><div className="finder-guest"><h2>{r.name}</h2>{r.approximate&&<small>שם דומה לחיפוש - ודאו שזה האורח הנכון</small>}{r.tableName&&<p>{r.tableName}</p>}<p>{r.count!==null?`${r.count} ${r.count===1?'אורח':'אורחים'} בהזמנה${r.estimated?' · כמות משוערת':''}`:'חסר מספר אורחים בהזמנה'}</p>{r.tableNumber===null&&<p>עדיין לא שובץ לשולחן</p>}</div>{r.tableNumber!==null&&<div className="finder-number"><span>שולחן</span><strong>{r.tableNumber}</strong></div>}</SwipeGuestCard>)}{more&&<p className="finder-hint">יש התאמות נוספות. הוסיפו שם משפחה או חפשו לפי טלפון.</p>}{stale&&<p className="finder-hint">נתוני האורחים לא התעדכנו. יש לרענן לפני הושבה חדשה.</p>}</>}
 </div>
 <div ref={accordion} className="finder-availability"><div className="finder-accordion-header"><button type="button" className="finder-accordion-toggle" aria-expanded={open} aria-controls="available-tables" onClick={()=>setOpen(v=>!v)}><span>שולחנות לא מלאים{availability&&<small>{free.length} שולחנות · {free.reduce((sum,t)=>sum+t.available!,0)} מקומות פנויים</small>}</span><span aria-hidden="true" className={open?'is-open':''}>⌄</span></button><button type="button" className={`finder-refresh-icon${tablesLoading?' is-loading':''}`} disabled={tablesLoading||saving} aria-label={tablesLoading?'מרענן שולחנות':'רענון שולחנות'} title="רענון שולחנות" onClick={()=>void refreshTables()}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17"/></svg></button></div>{!open&&tableError&&<p role="alert" className="finder-seat-error">{tableError}</p>}
 {open&&<div id="available-tables" className="finder-accordion-body"><div className="finder-availability-top"><span>מתעדכן אוטומטית</span></div>
 {saved&&<div className="finder-saved" role="status"><p>{saved.message}</p>{saved.undoTicket&&<button disabled={saving||tablesLoading||!availability} onClick={()=>void saveSeat(undefined,saved.undoTicket!)}>ביטול ההושבה האחרונה</button>}</div>}
 {selected?<div className="finder-selection"><div><strong>{selected.name}</strong><span>{selected.count} {selected.count===1?'אורח':'אורחים'}{selected.tableNumber!==null?` · כרגע בשולחן ${selected.tableNumber}`:''}</span>{selected.estimated&&<small>הכמות לפי ההזמנה, טרם אושרה. ודאו שהיא נכונה לפני השיבוץ.</small>}</div><button aria-label="ביטול בחירת אורח" disabled={saving} onClick={()=>{setSelected(null);setPendingTable(null);}}>×</button></div>:<p className="finder-hint">חפשו אורח למעלה, החליקו את הכרטיס ולחצו על אייקון ההושבה כדי לבחור שולחן.</p>}
 {tableError&&<p role="alert" className="finder-seat-error">{tableError}</p>}
 {availability?.stale&&<p role="alert" className="finder-seat-error">נתוני האורחים אינם מעודכנים. השיבוץ ייפתח לאחר רענון מוצלח.</p>}
 {!availability&&tablesLoading&&<p className="finder-hint">טוען מקומות פנויים...</p>}
 {availability&&!free.length&&<p className="finder-hint">אין כרגע שולחנות עם מקומות פנויים שניתן לחשב.</p>}
 {free.map(t=>{const enough=selected?.count!=null&&(allowsTableOverflow(t.number)||t.available!>=selected.count);const same=selected?.tableNumber===t.number;const disabled=saving||tablesLoading||!!availability?.stale||!selected||!enough||same;return <div className="finder-free-table" key={t.id}><div className="finder-free-row"><div className="finder-free-name"><strong>שולחן {t.number}</strong>{t.name&&<span>{t.name}</span>}<small>{t.occupied} / {t.capacity} מקומות משובצים</small></div><div className="finder-free-actions"><span className="finder-free-count">{allowsTableOverflow(t.number)?'ניתן לשבץ מעבר לקיבולת':t.available+' פנויים'}</span><button className="finder-seat-button" disabled={disabled} onClick={()=>setPendingTable(t)}>{same?'משובץ כאן':selected&&!enough?'אין מספיק מקום':'הושבה כאן'}</button></div></div>{pendingTable?.id===t.id&&selected&&<div className="finder-seat-confirm"><p>{selected.tableNumber!==null?`להעביר את ${selected.name} משולחן ${selected.tableNumber}`:`לשבץ את ${selected.name}`} לשולחן {t.number}? <strong>{selected.count} {selected.count===1?'מקום':'מקומות'}</strong></p><div><button className="finder-seat-button finder-seat-primary" disabled={disabled} onClick={()=>void saveSeat(t)}>{saving?'שומר...':'אישור הושבה'}</button><button className="finder-seat-cancel" disabled={saving} onClick={()=>setPendingTable(null)}>ביטול</button></div></div>}</div>;})}
 {uncertain>0&&<p className="finder-hint">ב־{uncertain} שולחנות חסרים נתוני כמות. בדקו אותם במסך סידורי ההושבה.</p>}
 </div>}
 </div></section></main>;
}
