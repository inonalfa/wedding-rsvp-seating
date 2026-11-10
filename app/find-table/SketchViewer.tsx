'use client';
import {useEffect,useRef,useState} from 'react';
import {chairPositions,sketchItemLabel,type SeatingSketch} from '@/lib/seating-sketch';
export default function SketchViewer(){
 const [open,setOpen]=useState(false),[sketch,setSketch]=useState<SeatingSketch|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0),[zoom,setZoom]=useState(1);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  if(!open)return;
  dialog.current?.showModal();
  const controller=new AbortController();setLoading(true);setError('');
  async function load(){
   try{const r=await fetch('/api/find-table/sketch',{cache:'no-store',signal:controller.signal});const d=await r.json();if(!r.ok)throw new Error(d.error);if(!controller.signal.aborted)setSketch(d.sketch);}
   catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'טעינת הסקיצה נכשלה');}
   finally{if(!controller.signal.aborted)setLoading(false);}
  }
  void load();return()=>controller.abort();
 },[open,retry]);
 return <><button className="finder-sketch-button" type="button" aria-label="הצגת סקיצת האולם" title="הצגת סקיצת האולם" onClick={()=>{setSketch(null);setZoom(1);setOpen(true);}}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="3" width="19" height="18" rx="2"/><path d="M8.5 3v18M8.5 9h13M15 9v12"/><circle cx="5.5" cy="7" r=".8" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r=".8" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r=".8" fill="currentColor" stroke="none"/></svg></button>
 {open&&<dialog ref={dialog} className="finder-sketch-dialog" dir="rtl" aria-labelledby="finder-sketch-title" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}>
  <header><h2 id="finder-sketch-title">סקיצת האולם</h2><button type="button" onClick={()=>setOpen(false)} aria-label="סגירת הסקיצה">סגירה ×</button></header>
  <div className="finder-sketch-toolbar"><button type="button" disabled={loading} onClick={()=>setRetry(v=>v+1)}>רענון סקיצה</button><button type="button" disabled={zoom===1} onClick={()=>setZoom(z=>Math.max(1,z-.5))} aria-label="הקטנת הסקיצה">−</button><button type="button" onClick={()=>setZoom(1)}>התאמה למסך</button><button type="button" disabled={zoom===4} onClick={()=>setZoom(z=>Math.min(4,z+.5))} aria-label="הגדלת הסקיצה">+</button></div>
  {loading&&<p role="status">טוען את הסקיצה העדכנית...</p>}{error&&<p role="alert">{error}</p>}
  {sketch&&<div className="finder-sketch-scroll" dir="ltr"><svg style={{width:zoom*100+'%'}} viewBox={`0 0 ${sketch.width} ${sketch.height}`} role="img" aria-label="מפת האולם עם מספרי ושמות השולחנות">
   <rect width={sketch.width} height={sketch.height} fill="#fafaf5"/>
   {sketch.items.map(item=><g key={item.id} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.width/2} ${item.height/2})`}>
    <title>{sketchItemLabel(item)}{item.name?' · '+item.name:''}</title>
    {chairPositions(item).map((chair,i)=><rect key={i} x={chair.x-5} y={chair.y-5} width="10" height="10" rx="2" fill="#d9e3d5"/>)}
    <rect width={item.width} height={item.height} rx={item.kind==='round'?0:5} fill={item.kind==='dance'?'#f3f1e6':item.kind==='bar'||item.kind==='banquet'?'#f7ecd5':'#e8efe3'} stroke="#537957" strokeWidth="2" strokeDasharray={item.kind==='dance'?'8 6':undefined}/>
    <foreignObject x="4" y="4" width={item.width-8} height={item.height-8}><div className="finder-sketch-label" dir="rtl"><strong>{sketchItemLabel(item)}</strong>{item.name&&<span>{item.name}</span>}</div></foreignObject>
   </g>)}
  </svg></div>}
 </dialog>}</>;
}
