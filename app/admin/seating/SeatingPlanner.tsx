'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { compactTableNumbers, searchSeatingGuests, tableOccupancy, tableMajoritySide, tableAttendanceSummary, sortedTableGuests, type TableGuestSort, type Guest, type SeatingPlan, type SeatingTable } from '@/lib/seating-model';
type Data = { guests: Guest[]; plan: SeatingPlan; revision: number; fetchedAt: string | null; updatedAt: string | null; warning: string | null };
const tableLabel = (t:SeatingTable) => `שולחן ${t.number}${t.name ? ` · ${t.name}` : ''}`;
const time = (v: string | null) => v ? new Intl.DateTimeFormat('he-IL', {dateStyle:'short',timeStyle:'short',timeZone:'Asia/Jerusalem'}).format(new Date(v)) : '';
function Modal({children, labelledBy, close}:{children:React.ReactNode;labelledBy:string;close:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} className="seating-modal" aria-labelledby={labelledBy} onCancel={close}>{children}</dialog>;
}
export default function SeatingPlanner() {
  const [data,setData] = useState<Data | null>(null); const [plan,setPlan] = useState<SeatingPlan>({tables:[]});
  const [sheetPending,setSheetPending]=useState(false);
  const [busy,setBusy] = useState(false); const [saving,setSaving] = useState(false); const [dirty,setDirty] = useState(false);
  const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const [conflict,setConflict] = useState(false);
  const [search,setSearch] = useState(''); const [side,setSide] = useState('all'); const [status,setStatus] = useState('all');
  const [tableCapacityFilter,setTableCapacityFilter] = useState('all'); const [tableSideFilter,setTableSideFilter] = useState('all');
  const [selected,setSelected] = useState(''); const [editId,setEditId] = useState<string | null>(null); const [number,setNumber] = useState(''); const [capacity,setCapacity] = useState('10'); const [tableName,setTableName] = useState('');
  const [moveGuest,setMoveGuest] = useState<string | null>(null); const [moveTarget,setMoveTarget] = useState('');
  const [tableGuestSort,setTableGuestSort] = useState<Record<string,TableGuestSort>>({});
  const guestRows = useRef(new Map<string,HTMLDivElement>());
  const draggedGuest = useRef<string | null>(null); const [dragging,setDragging] = useState<string | null>(null); const [dropTarget,setDropTarget] = useState<string | null>(null);
  const [deleteId,setDeleteId] = useState<string | null>(null); const lock = useRef(false); const editVersion = useRef(0); const [autoSavePaused,setAutoSavePaused] = useState(false);
  const load = useCallback(async (refresh=false, replace=true) => {
    setBusy(true); setError(''); setNotice('');
    try { const r = await fetch(`/api/admin/seating${refresh?'?refresh=1':''}`, {cache:'no-store'}); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'הטעינה נכשלה');
      if (replace) {editVersion.current++;setPlan(d.plan);setData(d);setDirty(false);setConflict(false);setAutoSavePaused(false);} else setData(old=>old?{...old,guests:d.guests,fetchedAt:d.fetchedAt,warning:d.warning}:d);
      if(d.sheetSync?.error)setError(d.sheetSync.error);else setSheetPending(d.sheetSync?.pending!==0);
      if (d.plan.tables.length) setSelected(current => current || d.plan.tables[0].id);
    } catch(e) {setError(e instanceof Error ? e.message:'הטעינה נכשלה');} finally {setBusy(false);}
  }, []);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!dirty)return; const h=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',h);return()=>window.removeEventListener('beforeunload',h);},[dirty]);
  function change(next:SeatingPlan) {editVersion.current++;setPlan(next);setDirty(true);setNotice('');setError('');setAutoSavePaused(false);}
  const save = useCallback(async () => {
    if (!data || lock.current || conflict) return; const savedVersion=editVersion.current; lock.current=true; setSaving(true);setError('');setNotice('');setAutoSavePaused(false);
    try {const r=await fetch('/api/admin/seating',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,revision:data.revision})}); const d=await r.json();if(!r.ok){setConflict(!!d.conflict);throw new Error(d.error);}
      setSheetPending(!d.sheetSync?.error&&d.sheetSync?.pending!==0);setData(old=>old?{...old,plan,revision:d.revision,updatedAt:d.updatedAt}:old);const newerChanges=editVersion.current!==savedVersion;setDirty(newerChanges);setConflict(false);if(d.sheetSync?.error)setError('סידור ההושבה נשמר. '+d.sheetSync.error);else if(!newerChanges)setNotice(d.sheetSync?.pending===0?'סידור ההושבה נשמר ומספרי השולחנות סונכרנו לגיליונות':'סידור ההושבה נשמר. סנכרון הגיליונות בתהליך.');
    }catch(e){setAutoSavePaused(true);setError(e instanceof Error?e.message:'השמירה נכשלה');}finally{lock.current=false;setSaving(false);}
  }, [data, plan, conflict]);
  const syncSheets = useCallback(async (refresh=true) => {
    if(busy||saving||dirty)return;setBusy(true);setSheetPending(false);setError('');setNotice('מסנכרן מספרי שולחנות...');
    try{let total=0;
      for(let i=0;i<100;i++){
        const response=await fetch('/api/admin/seating/sync'+(refresh?'?refresh=1':''),{method:'POST'});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'הסנכרון נכשל');
        total+=result.synced;refresh=false;
        if(result.busy){setSheetPending(true);setNotice('סנכרון נוסף כבר מתבצע. ניתן לרענן בעוד רגע.');return;}
        if(result.pending===0){setNotice(`מספרי השולחנות מסונכרנים לגיליונות. עודכנו ${total} הזמנות.`);return;}
        setNotice(`מסנכרן... עודכנו ${total} הזמנות, ${result.pending} ממתינות.`);
      }
      throw new Error('הסנכרון טרם הסתיים. לחצו שוב להמשך.');
    }catch(e){setNotice('');setError(e instanceof Error?e.message:'הסנכרון נכשל');}finally{setBusy(false);}
  }, [busy, saving, dirty]);
  useEffect(()=>{if(!sheetPending||busy||saving||dirty)return;const timer=setTimeout(()=>void syncSheets(false),1500);return()=>clearTimeout(timer);},[sheetPending,busy,saving,dirty,syncSheets]);
  useEffect(()=>{
    if(!dirty||!data||saving||busy||conflict||autoSavePaused)return;
    const timer=window.setTimeout(()=>{void save();},2500);
    return()=>window.clearTimeout(timer);
  },[dirty,data,saving,busy,conflict,autoSavePaused,save]);
  const guests=data?.guests??[]; const guestMap=new Map(guests.map(g=>[g.id,g]));
  const assigned=new Set(plan.tables.flatMap(t=>t.guests));
  const unseated=guests.filter(g=>!assigned.has(g.id));
  const searchActive=Boolean(search.trim());
  const searchResults=useMemo(()=>searchSeatingGuests(data?.guests??[],plan,search,side,status),[data?.guests,plan,search,side,status]);
  const visible=searchResults.unseated;
  const matchedGuestIds=new Set(searchResults.seated.map(result=>result.guest.id));
  const matchedTableIds=new Set(searchResults.seated.map(result=>result.table.id));
  useEffect(()=>{
    // Reveal matches inside each table's scrollable list without moving the page while typing.
    const revealed=new Set<string>();
    for(const {guest,table} of searchResults.seated){
      if(revealed.has(table.id))continue;
      const row=guestRows.current.get(guest.id),list=row?.parentElement;
      if(row&&list){list.scrollTop=Math.max(0,row.offsetTop-(list.clientHeight-row.clientHeight)/2);revealed.add(table.id);}
    }
  },[searchResults]);
  function showGuest(id:string){
    const row=guestRows.current.get(id);
    if(!row)return;
    row.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
    row.focus({preventScroll:true});
  }
  const total=guests.reduce((s,g)=>s+(g.count??0),0); const seated=guests.filter(g=>assigned.has(g.id)).reduce((s,g)=>s+(g.count??0),0);
  const totalSeats=plan.tables.reduce((sum,t)=>sum+(t.number===2?t.capacity:12),0);
  const unknown=guests.filter(g=>g.count===null).length;
  const confirmedUnseated=unseated.filter(g=>g.attendance==='yes');
  const confirmedUnseatedCount=confirmedUnseated.reduce((sum,g)=>sum+(g.count??0),0);
  const confirmedUnseatedEstimated=confirmedUnseated.filter(g=>g.estimated&&g.count!==null).reduce((sum,g)=>sum+(g.count??0),0);
  const confirmedUnseatedUnknown=confirmedUnseated.filter(g=>g.count===null).length;
  const availableSeats=plan.tables.reduce((sum,t)=>sum+Math.max(0,t.capacity-t.guests.reduce((occupied,id)=>occupied+(guestMap.get(id)?.count??0),0)),0);
  const overflow=plan.tables.filter(t=>t.number!==2&&tableOccupancy(t,guests)>t.capacity);
  const tableFiltersActive=tableCapacityFilter!=='all'||tableSideFilter!=='all';
  const visibleTables=plan.tables.filter(t=>{
    if(matchedTableIds.has(t.id))return true;
    const occupied=tableOccupancy(t,guests);
    return (tableCapacityFilter==='all'||(tableCapacityFilter==='notFull'&&occupied<t.capacity)||(tableCapacityFilter==='overTen'&&occupied>10))
      &&(tableSideFilter==='all'||tableMajoritySide(t,guests)===tableSideFilter);
  }).sort((a,b)=>Number(matchedTableIds.has(b.id))-Number(matchedTableIds.has(a.id))||a.number-b.number);
  const target=plan.tables.find(t=>t.id===selected);
  const compactedPlan=compactTableNumbers(plan);
  const numberChanges=plan.tables.filter((t,i)=>t.number!==compactedPlan.tables[i].number);
  function compactNumbers(){
    if(!numberChanges.length)return;
    const summary=numberChanges.map(t=>t.number+' ← '+compactedPlan.tables.find(next=>next.id===t.id)!.number).join('\n');
    if(window.confirm('לצמצם את מספרי השולחנות? שולחן 2 יישאר ללא שינוי.\nהשמות והאורחים יישארו בשולחנות שלהם.\n\nמספר קודם ← מספר חדש\n'+summary))change(compactedPlan);
  }
  function openTable(t?:SeatingTable){setEditId(t?.id??'new');setNumber(String(t?.number??Math.max(0,...plan.tables.map(t=>t.number))+1));setCapacity(String(t?.capacity??10));setTableName(t?.name??'');setError('');}
  function submitTable(e:React.FormEvent){e.preventDefault();const n=Number(number),c=Number(capacity);if(!Number.isSafeInteger(n)||n<1||n>9999||!Number.isSafeInteger(c)||c<1||c>1000||plan.tables.some(t=>t.number===n&&t.id!==editId)){setError('מספר השולחן חייב להיות ייחודי והקיבולת חייבת להיות מספר חיובי');return;}
    if(editId==='new'){const t={id:crypto.randomUUID(),number:n,name:tableName.trim(),capacity:c,guests:[]};change({tables:[...plan.tables,t]});setSelected(t.id);}else change({tables:plan.tables.map(t=>t.id===editId?{...t,number:n,name:tableName.trim(),capacity:c}:t)});setEditId(null);
  }
  function assign(id:string,tableId:string){const guest=guestMap.get(id),t=plan.tables.find(t=>t.id===tableId);if(!guest||!t||t.guests.includes(id))return;
    if(guest.count===null){setError('לא הוגדרה כמות להזמנה הזו. יש לעדכן את הכמות בגיליון ולרענן.');return;}
    if(t.number!==2&&tableOccupancy(t,guests)+(t.guests.includes(id)?0:guest.count)>t.capacity){setError(`אין מספיק מקומות בשולחן ${t.number} עבור ${guest.name}. אפשר לשנות את הקיבולת או לבחור שולחן אחר.`);return;}
    change({tables:plan.tables.map(t=>({...t,guests:[...t.guests.filter(g=>g!==id),...(t.id===tableId?[id]:[])]}))});setMoveGuest(null);
  }
  function remove(id:string){change({tables:plan.tables.map(t=>({...t,guests:t.guests.filter(g=>g!==id)}))});}
  const disabled=busy||saving;
  function startDrag(e:React.DragEvent<HTMLElement>,g:Guest){
    if(disabled||g.count===null||(e.target as HTMLElement).closest('button')){e.preventDefault();return;}
    draggedGuest.current=g.id;setDragging(g.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-seating-guest',g.id);e.dataTransfer.setData('text/plain',g.name);
  }
  function endDrag(){draggedGuest.current=null;setDragging(null);setDropTarget(null);}
  function dragOver(e:React.DragEvent<HTMLElement>,t:SeatingTable){
    if(disabled||!draggedGuest.current)return;e.preventDefault();e.dataTransfer.dropEffect='move';setDropTarget(t.id);
  }
  function dropGuest(e:React.DragEvent<HTMLElement>,t:SeatingTable){
    e.preventDefault();e.stopPropagation();const id=draggedGuest.current;
    endDrag();if(disabled||!id||e.dataTransfer.getData('application/x-seating-guest')!==id)return;
    assign(id,t.id);
  }
  return <main className="seating-shell" dir="rtl">
    <header className="seating-topbar"><Link href="/admin" onClick={e=>{if(dirty&&!window.confirm('יש שינויים שלא נשמרו. לצאת בלי לשמור?'))e.preventDefault();}}>D <i>&amp;</i> Y <span>ניהול החתונה</span></Link><span>10.06.2027</span></header>
    <section className="seating-heading"><div><p className="seating-eyebrow">דנה ויואב</p><h1>סידורי הושבה</h1><p>כל הזמנה משובצת יחד, לפי מספר האורחים שלה. ניתן לגרור אורחים אל שולחן או בין שולחנות.</p></div><div className="seating-actions"><a className="seating-sketch-link" href="/find-table" target="_blank" rel="noopener noreferrer">חיפוש שולחן לאורחים ↗</a><Link className="seating-sketch-link" href="/admin/seating/sketch" onClick={e=>{if(dirty&&!window.confirm("יש שינויים שלא נשמרו. לצאת בלי לשמור?"))e.preventDefault();}}>סקיצת האולם</Link><button disabled={disabled||!data||!numberChanges.length||conflict} onClick={compactNumbers}>צמצום מספור שולחנות</button><button disabled={disabled||!data} onClick={()=>load(true,!dirty)}>רענון מהגיליונות</button><button disabled={disabled||dirty||!data} onClick={()=>void syncSheets()}>סנכרון מספרי שולחנות</button><button className="seating-primary" disabled={disabled||!dirty||conflict} onClick={save}>{saving?'שומר...':autoSavePaused?'ניסיון שמירה נוסף':'שמירה עכשיו'}</button></div></section>
    <div className="seating-save-line" role="status">{saving?'שומר שינויים...':dirty?(autoSavePaused||conflict?'השינויים טרם נשמרו. נדרשת פעולה לפי ההודעה.':'השינויים יישמרו אוטומטית בעוד רגע'):data?.updatedAt?`נשמר ב-${time(data.updatedAt)}`:'שמירה אוטומטית פעילה'}{data?.fetchedAt&&<span>נתוני מוזמנים: {time(data.fetchedAt)}</span>}</div>
    {error&&<div className="seating-alert" role="alert">{error}{conflict&&<button onClick={()=>{if(window.confirm('לטעון את הסידור העדכני? השינויים המקומיים שלא נשמרו יוחלפו.'))void load(false,true);}}>טעינת הסידור העדכני</button>}{!data&&<button disabled={busy} onClick={()=>load()}>ניסיון נוסף</button>}</div>}
    {notice&&<div className="seating-success" role="status">{notice}</div>}{data?.warning&&<div className="seating-alert">{data.warning}</div>}
    {overflow.length>0&&<div className="seating-alert">חריגה מהקיבולת בשולחנות {overflow.map(t=>t.number).join(', ')}. יש להעביר הזמנות או להגדיל את הקיבולת.</div>}
    <section className="seating-stats" aria-label="סיכום ההושבה"><article><span>סה״כ מקומות</span><strong>{totalSeats}</strong><small>12 לכל שולחן · שולחן 2 לפי הקיבולת שלו</small></article><article><span>כבר שובצו</span><strong>{seated}</strong><small>ב-{plan.tables.length} שולחנות</small></article><article><span>ממתינים לשיבוץ</span><strong>{total-seated}</strong><small>{unseated.length} הזמנות{unknown>0?` · ${unknown} ללא כמות`:''}</small></article><article><span>אישרו וטרם שובצו</span><strong>{confirmedUnseatedCount}</strong><small>{confirmedUnseated.length} הזמנות{confirmedUnseatedEstimated>0?` · מתוכם ${confirmedUnseatedEstimated} משוערים`:''}{confirmedUnseatedUnknown>0?` · ${confirmedUnseatedUnknown} ללא כמות`:''}</small></article><article><span>מקומות פנויים</span><strong>{availableSeats}</strong><small>בכל השולחנות בסידור</small></article><article><span>סה״כ שולחנות</span><strong>{plan.tables.length}</strong><small>כל השולחנות בסידור</small></article></section>
    {busy&&!data?<div className="seating-loading" role="status">טוען מוזמנים משני הגיליונות...</div>:data&&<div className="seating-workspace">
      <aside className="seating-guests"><div className="seating-panel-heading"><h2>ממתינים לשיבוץ</h2><span>{visible.length} הזמנות</span></div>
        <input type="search" aria-label="חיפוש מוזמנים" aria-describedby="seating-search-hint" placeholder="חיפוש שם, קבוצה או קרבה" value={search} onChange={e=>setSearch(e.target.value)}/>
        <p id="seating-search-hint" className="seating-search-hint">חיפוש בכל האורחים, כולל אורחים שכבר שובצו.</p>
        {searchActive&&<div className="seating-search-summary"><span role="status">נמצאו {visible.length+searchResults.seated.length} הזמנות: {searchResults.seated.length} משובצות, {visible.length} ממתינות</span><button type="button" className="seating-text-button" onClick={()=>setSearch('')}>ניקוי חיפוש</button></div>}
        <div className="seating-filters"><select aria-label="הצד המזמין" value={side} onChange={e=>setSide(e.target.value)}><option value="all">שני הצדדים</option><option>דנה</option><option>יואב</option></select><select aria-label="סטטוס הגעה" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">כל הסטטוסים</option><option value="yes">אישרו הגעה</option><option value="pending">טרם אישרו</option></select></div>
        <label className="seating-target">הוספה לשולחן<select value={target?.id??''} onChange={e=>setSelected(e.target.value)} disabled={!plan.tables.length}><option value="" disabled>בחרו שולחן</option>{plan.tables.slice().sort((a,b)=>a.number-b.number).map(t=><option key={t.id} value={t.id}>{tableLabel(t)} · {t.number===2?'ניתן לשבץ מעבר לקיבולת':Math.max(0,t.capacity-tableOccupancy(t,guests))+' מקומות פנויים'}</option>)}</select></label>
        <div className="seating-guest-list">
          {searchResults.seated.length>0&&<section aria-label="תוצאות חיפוש שכבר שובצו"><h3 className="seating-search-heading">כבר שובצו</h3>{searchResults.seated.map(({guest,table})=><button key={guest.id} type="button" className="seating-search-result" aria-label={`הצגת ${guest.name} בשולחן ${table.number}`} onClick={()=>showGuest(guest.id)}><span><strong>{guest.name}</strong><small>{tableLabel(table)}</small><small>{guest.side} · {guest.count??'?'} אורחים</small></span><span className="seating-search-jump">הצגה בשולחן ←</span></button>)}</section>}
          {searchActive&&visible.length>0&&<h3 className="seating-search-heading">ממתינים לשיבוץ</h3>}
          {visible.length===0?(searchResults.seated.length===0&&<p className="seating-empty">{searchActive?'לא נמצאו מוזמנים בסיואב הזה':unseated.length===0?'כל ההזמנות שובצו':'לא נמצאו מוזמנים בסיואב הזה'}</p>):visible.map(g=><article key={g.id} draggable={!disabled&&g.count!==null} onDragStart={e=>startDrag(e,g)} onDragEnd={endDrag} className={`seating-guest ${g.attendance==='yes'?'is-confirmed':''} ${dragging===g.id?'is-dragging':''}`}><div><strong>{g.name}</strong><small>{g.side}{g.category?` · ${g.category}`:''}</small>{g.linkedTo&&<small>מקושר ל: {g.linkedTo}</small>}<span className={`seating-badge ${g.attendance==='yes'?'confirmed':'pending'}`}>{g.attendance==='yes'?'אישרו הגעה':'טרם אישרו'}{g.estimated&&g.attendance==='yes'?' · כמות משוערת':''}</span></div><div className="seating-guest-quantity"><b>{g.count??'?'}</b><small>{g.estimated?'משוערים':'מאושרים'}</small><button disabled={disabled||!target||g.count===null} aria-label={`שיבוץ ${g.name} לשולחן ${target?.number??''}`} onClick={()=>assign(g.id,selected)}>שיבוץ</button></div></article>)}</div>
      </aside>
      <section className="seating-tables"><div className="seating-panel-heading"><div><h2>השולחנות שלנו</h2><p>ברירת מחדל: 10 מקומות. ניתן לשנות לכל שולחן.</p></div><button className="seating-primary" disabled={disabled} onClick={()=>openTable()}>+ הוספת שולחן</button></div>
      <div className="seating-table-filters"><label>תפוסת שולחן<select value={tableCapacityFilter} onChange={e=>setTableCapacityFilter(e.target.value)}><option value="all">כל השולחנות</option><option value="notFull">שולחנות לא מלאים</option><option value="overTen">יותר מ־10 אורחים</option></select></label><label>רוב האורחים<select value={tableSideFilter} onChange={e=>setTableSideFilter(e.target.value)}><option value="all">שני הצדדים</option><option value="דנה">שולחנות של דנה</option><option value="יואב">שולחנות של יואב</option><option value="mixed">שולחנות מעורבים (חלוקה שווה)</option></select></label><span className="seating-table-filter-count" role="status">{visibleTables.length} מתוך {plan.tables.length} שולחנות</span>{tableFiltersActive&&<button className="seating-text-button" onClick={()=>{setTableCapacityFilter('all');setTableSideFilter('all');}}>ניקוי סיואב</button>}</div>
      {tableFiltersActive&&matchedTableIds.size>0&&<p className="seating-search-hint">שולחנות עם תוצאות חיפוש מוצגים בראש הרשימה, גם אם אינם תואמים לסיואב השולחנות.</p>}
      {plan.tables.length===0?<div className="seating-empty-tables"><span className="seating-table-symbol" aria-hidden="true">10</span><h3>מתחילים בשולחן הראשון</h3><p>מוסיפים שולחן, בוחרים אותו ומשבצים הזמנות מהרשימה.</p><button onClick={()=>openTable()} className="seating-primary">הוספת שולחן</button></div>:visibleTables.length===0?<div className="seating-empty-tables"><h3>אין שולחנות שמתאימים לסיואב</h3><p>אפשר לשנות את המסננים או להציג את כל השולחנות.</p><button onClick={()=>{setTableCapacityFilter('all');setTableSideFilter('all');}}>הצגת כל השולחנות</button></div>:<div className="seating-table-grid">{visibleTables.map(t=>{const occupied=tableOccupancy(t,guests),over=t.number!==2&&occupied>t.capacity,majority=tableMajoritySide(t,guests),attendance=tableAttendanceSummary(t,guests),sort=tableGuestSort[t.id]??'confirmedFirst',tableGuests=sortedTableGuests(t,guests,sort);return <article key={t.id} onDragOver={e=>dragOver(e,t)} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDropTarget(null);}} onDrop={e=>dropGuest(e,t)} className={`seating-table ${selected===t.id?'selected':''} ${over?'overfull':''} ${dropTarget===t.id?'is-drop-target':''} ${matchedTableIds.has(t.id)?'has-search-match':''}`}><div className="seating-table-heading" onClick={()=>setSelected(t.id)}><button type="button" className="seating-table-number" disabled={disabled} aria-label={`עריכת ${tableLabel(t)}`} title="עריכת השולחן" onClick={e=>{e.stopPropagation();openTable(t);}}><svg className="seating-occupancy-ring" viewBox="0 0 80 80" role="img" aria-label={`תפוסת שולחן ${t.number}: ${occupied} מתוך ${t.capacity}`}><circle className="seating-ring-track" cx="40" cy="40" r="37"/><circle className="seating-ring-fill" style={{stroke:`hsl(${Math.min(1,occupied/t.capacity)*120} 48% 42%)`}} cx="40" cy="40" r="37" pathLength="100" strokeDasharray="100" strokeDashoffset={100-Math.min(100,occupied/t.capacity*100)}/></svg><span>שולחן</span><strong>{t.number}</strong></button><button type="button" className="seating-table-select" aria-label={`בחירת ${tableLabel(t)} לשיבוץ`} aria-pressed={selected===t.id} onClick={()=>setSelected(t.id)}><span className="seating-capacity">{t.name&&<span className="seating-table-name" title={t.name}>{t.name}</span>}<strong>{occupied} / {t.capacity}</strong>{over&&<span>חריגה של {occupied-t.capacity}</span>}<span className="seating-table-side">{majority==='empty'?'ללא אורחים':majority==='mixed'?'מעורב · חלוקה שווה':`רוב האורחים של ${majority}`}</span></span></button><div className="seating-table-controls" onClick={e=>e.stopPropagation()}><div className="seating-table-attendance" aria-label={`אישורי הגעה ומיון בשולחן ${t.number}`}><button type="button" className="seating-badge confirmed" aria-pressed={sort==='confirmedFirst'} aria-label={`מיון לפי אישרו בשולחן ${t.number}, ${attendance.confirmed} אורחים`} title="אישרו תחילה. לחיצה נוספת מחזירה לסדר השיבוץ" onClick={()=>setTableGuestSort(old=>({...old,[t.id]:sort==='confirmedFirst'?'original':'confirmedFirst'}))}><b>{attendance.confirmed}</b> אישרו</button><button type="button" className="seating-badge pending" aria-pressed={sort==='pendingFirst'} aria-label={`מיון לפי טרם אישרו בשולחן ${t.number}, ${attendance.pending} אורחים, כמות משוערת`} title="טרם אישרו תחילה (כמות משוערת). לחיצה נוספת מחזירה לסדר השיבוץ" onClick={()=>setTableGuestSort(old=>({...old,[t.id]:sort==='pendingFirst'?'original':'pendingFirst'}))}><b>{attendance.pending}</b> טרם</button></div></div></div>
        <div className="seating-table-guests">{tableGuests.length===0?<p className="seating-empty">בחרו את השולחן והוסיפו מוזמנים מהרשימה.</p>:tableGuests.map(g=>{const id=g.id;return <div key={id} ref={node=>{if(node)guestRows.current.set(id,node);else guestRows.current.delete(id);}} tabIndex={matchedGuestIds.has(id)?-1:undefined} draggable={!disabled&&g.count!==null} onDragStart={e=>startDrag(e,g)} onDragEnd={endDrag} className={`seating-seated-guest ${g.attendance==='yes'?'is-confirmed':''} ${dragging===g.id?'is-dragging':''} ${matchedGuestIds.has(id)?'is-search-match':''}`}><div><strong>{g.name}</strong><small>{g.side} · {g.attendance==='yes'?'אישרו הגעה':'טרם אישרו'}{g.estimated?' · כמות משוערת':''}</small></div><b>{g.count??'?'}</b><button disabled={disabled} aria-label={`העברת ${g.name}`} onClick={()=>{setError('');setMoveGuest(id);setMoveTarget('');}}>העברה</button><button disabled={disabled} className="seating-remove" aria-label={`הסרת ${g.name} מהשולחן`} onClick={()=>remove(id)}>×</button></div>;})}</div>
        </article>;})}</div>}
      </section></div>}
    {editId&&<Modal labelledBy="table-dialog-title" close={()=>setEditId(null)}><form onSubmit={submitTable}><h2 id="table-dialog-title">{editId==='new'?'הוספת שולחן':'עריכת שולחן'}</h2><label>מספר שולחן<input autoFocus type="number" min="1" max="9999" required readOnly={plan.tables.find(t=>t.id===editId)?.number===2} title={plan.tables.find(t=>t.id===editId)?.number===2?'שולחן 2 נשאר תמיד במספר זה':undefined} value={number} onChange={e=>setNumber(e.target.value)}/></label><label>שם שולחן (לא חובה)<input type="text" maxLength={80} placeholder="למשל: משפחת הכלה" value={tableName} onChange={e=>setTableName(e.target.value)}/></label><label>מספר מקומות<input type="number" min="1" max="1000" required value={capacity} onChange={e=>setCapacity(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<div className="seating-actions">{editId!=='new'&&<button type="button" className="seating-delete-table" disabled={disabled} onClick={()=>{setDeleteId(editId);setEditId(null);}}>מחיקת שולחן</button>}<button type="button" onClick={()=>setEditId(null)}>ביטול</button><button className="seating-primary" type="submit" disabled={disabled}>{editId==='new'?'הוספה':'עדכון'}</button></div></form></Modal>}
    {moveGuest&&<Modal labelledBy="move-title" close={()=>setMoveGuest(null)}><form onSubmit={e=>{e.preventDefault();assign(moveGuest,moveTarget);}}><h2 id="move-title">העברת {guestMap.get(moveGuest)?.name}</h2><label>לשולחן<select autoFocus required value={moveTarget} onChange={e=>setMoveTarget(e.target.value)}><option value="" disabled>בחרו שולחן</option>{plan.tables.filter(t=>!t.guests.includes(moveGuest)).map(t=><option key={t.id} value={t.id}>{tableLabel(t)} · {t.number===2?'ניתן לשבץ מעבר לקיבולת':Math.max(0,t.capacity-tableOccupancy(t,guests))+' מקומות פנויים'}</option>)}</select></label>{error&&<p role="alert">{error}</p>}<div className="seating-actions"><button type="button" onClick={()=>setMoveGuest(null)}>ביטול</button><button type="submit" className="seating-primary">העברה</button></div></form></Modal>}
    {deleteId&&<Modal labelledBy="delete-title" close={()=>setDeleteId(null)}><div><h2 id="delete-title">מחיקת שולחן {plan.tables.find(t=>t.id===deleteId)?.number}?</h2><p>כל ההזמנות בשולחן יחזרו לרשימת הממתינים לשיבוץ.</p><div className="seating-actions"><button onClick={()=>setDeleteId(null)}>ביטול</button><button className="seating-primary" onClick={()=>{change({tables:plan.tables.filter(t=>t.id!==deleteId)});if(selected===deleteId)setSelected(plan.tables.find(t=>t.id!==deleteId)?.id??'');setDeleteId(null);}}>מחיקת השולחן</button></div></div></Modal>}
  </main>;
}
