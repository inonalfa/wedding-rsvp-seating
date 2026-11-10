'use client';
import {useEffect,useRef,useState,type ReactNode,type PointerEvent} from 'react';
const REVEAL=76;
type Gesture={id:number;x:number;y:number;initial:number;offset:number;axis:'pending'|'x'|'y'};
export default function SwipeGuestCard({children,label,disabled,selected,onAction}:{children:ReactNode;label:string;disabled:boolean;selected:boolean;onAction:()=>void}){
 const [offset,setOffset]=useState(0),[dragging,setDragging]=useState(false);
 const gesture=useRef<Gesture|null>(null),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!offset)return;
  const close=(e:globalThis.PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOffset(0);};
  document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);
 },[offset]);
 function begin(e:PointerEvent<HTMLElement>){
  if(disabled||!e.isPrimary||e.button!==0)return;
  gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,initial:offset,offset,axis:'pending'};
 }
 function move(e:PointerEvent<HTMLElement>){
  const g=gesture.current;if(!g||g.id!==e.pointerId)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y;
  if(g.axis==='pending'){
   if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;
   g.axis=Math.abs(dx)>Math.abs(dy)*1.15?'x':'y';
   if(g.axis==='x'){e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);}
  }
  if(g.axis!=='x')return;
  g.offset=Math.max(-REVEAL,Math.min(REVEAL,g.initial+dx));setOffset(g.offset);
 }
 function end(e:PointerEvent<HTMLElement>,cancel=false){
  const g=gesture.current;if(!g||g.id!==e.pointerId)return;
  gesture.current=null;setDragging(false);
  setOffset(cancel?g.initial:g.axis==='x'?(Math.abs(g.offset)>=30?Math.sign(g.offset)*REVEAL:0):g.axis==='pending'?0:g.initial);
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 }
 const action=()=>{setOffset(0);onAction();};
 return <div ref={root} className="finder-swipe-card" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOffset(0);}}>
  <article role="group" tabIndex={disabled?-1:0} aria-label={`${label}. החליקו ימינה או שמאלה, או הקישו Enter לחשיפת הפעולה`} className={`finder-card finder-swipe-surface${selected?' finder-card-selected':''}${dragging?' is-dragging':''}`} style={{transform:`translateX(${disabled?0:offset}px)`}} onPointerDown={begin} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)} onLostPointerCapture={e=>{if(gesture.current)end(e,true);}} onPointerLeave={e=>{if(gesture.current?.axis==='pending')gesture.current=null;}} onKeyDown={e=>{
   if(disabled)return;
   if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setOffset(e.key==='ArrowLeft'?-REVEAL:REVEAL);}
   else if(e.key==='Enter'||e.key===' '){e.preventDefault();setOffset(v=>v?0:-REVEAL);}
   else if(e.key==='Escape'){e.preventDefault();setOffset(0);}
  }}>{children}</article>
  {([-1,1] as const).map(side=><button key={side} type="button" className={`finder-swipe-action finder-swipe-${side===1?'left':'right'}`} style={{visibility:offset*side>0&&!disabled?'visible':'hidden'}} disabled={disabled} tabIndex={offset*side>=30?0:-1} aria-hidden={offset*side<=0||disabled} aria-label={label} title={label} onClick={action}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10V4h10v6M3 10h12v5H3zM5 15v5m8-5v5M17 6h5m-2-2 2 2-2 2"/></svg></button>)}
 </div>;
}
