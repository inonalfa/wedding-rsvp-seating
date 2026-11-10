'use client';
import { useCallback, useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { eventConfig, eventDate, eventHosts } from '@/lib/event-config';
import type { Guest, SeatingPlan } from '@/lib/seating-model';
import { createInitialSketch, fitItem, chairPositions, kindLabels, alignTablesToGrid, SKETCH_GRID, DEFAULT_TABLE_SIDE, DEFAULT_TABLE_ROTATION, isSketchTable, sketchItemLabel, moveSketchItems, resizeSketchTables, type SeatingSketch, type SketchItem, type SketchKind, linkSketchTable, unlinkSketchTable, syncSketchTableLabels, unlinkedSeatingTables, type SketchSeatingTable } from '@/lib/seating-sketch';
import { downloadSketchPdf } from '@/lib/sketch-pdf';
import SketchTableLinkDialog from './SketchTableLinkDialog';
type Saved = { sketch: SeatingSketch; revision: number; updatedAt: string | null };
type Gesture = { id: string; ids: string[]; mode: 'move' | 'resize'; startX: number; startY: number; scale: number; original: SketchItem; before: SeatingSketch };
const timestamp = (v: string) => new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }).format(new Date(v));
export default function SketchPlanner() {
  const [sketch, setSketch] = useState<SeatingSketch>(createInitialSketch);
  const sketchRef = useRef(sketch);
  const [data, setData] = useState<Saved | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [groupSide, setGroupSide] = useState(String(DEFAULT_TABLE_SIDE));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(850);
  const [snap, setSnap] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [includeTableNames, setIncludeTableNames] = useState(false);
  const [seatingTables, setSeatingTables] = useState<SketchSeatingTable[]>([]);
  const [guestNames, setGuestNames] = useState<Record<string, string[]> | null>(null);
  const hoverClose = useRef<ReturnType<typeof setTimeout> | null>(null);
  function keepHover() {if(hoverClose.current)clearTimeout(hoverClose.current);}
  function closeHover() {keepHover();hoverClose.current=setTimeout(() => setHover(null),180);}
  useEffect(() => () => {if(hoverClose.current)clearTimeout(hoverClose.current);},[]);
  const [guestError, setGuestError] = useState(false);
  const [hover, setHover] = useState<{id:string; x:number; y:number} | null>(null);
  const [showGuestNames, setShowGuestNames] = useState(true);
  async function loadGuestNames() {
    setGuestError(false); setGuestNames(null);
    try {
      const response = await fetch('/api/admin/seating', {cache:'no-store'});
      if (!response.ok) throw new Error('Unable to load guests');
      const data = await response.json() as {guests:Guest[]; plan:SeatingPlan};
      const names = new Map(data.guests.map(g => [g.id,g.name]));
      setGuestNames(Object.fromEntries(data.plan.tables.map(t => [t.id,t.guests.map(id => names.get(id) ?? 'אורח שאינו מופיע ברשימה העדכנית')])));
    } catch {setGuestError(true);}
  }
  function showGuests(item:SketchItem, element:HTMLElement) {
    keepHover();
    if (!isSketchTable(item) || gesture.current) return;
    const r=element.getBoundingClientRect();
    setHover({id:item.id,x:Math.max(12,Math.min(r.right+12,window.innerWidth-292)),y:Math.max(12,Math.min(r.top,window.innerHeight-332))});
  }
  const [linkItemId, setLinkItemId] = useState('');
  const [showUnlinked, setShowUnlinked] = useState(true);
  const [refreshingTables, setRefreshingTables] = useState(false);
  const [newKind, setNewKind] = useState<SketchKind>('round');
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const saveLock = useRef(false);
  const version = useRef(0);
  const past = useRef<SeatingSketch[]>([]); const future = useRef<SeatingSketch[]>([]);
  const [, setHistoryVersion] = useState(0);
  const scale = Math.min(1, (viewportWidth - 36) / sketch.width) * zoom;
  const selectedItems = sketch.items.filter(i => selected.includes(i.id));
  const active = selectedItems.length === 1 ? selectedItems[0] : undefined;
  const selectedTables = selectedItems.filter(isSketchTable);
  const ready = !!data && !loading;
  const linkItem = sketch.items.find(item => item.id === linkItemId);
  const remainingTables = unlinkedSeatingTables(sketch, seatingTables);
  const missingLinkedTables = sketch.items.filter(item => item.seatingTableId && !seatingTables.some(table => table.id === item.seatingTableId));
  async function load() {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/admin/seating-sketch', { cache: 'no-store' });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'הטעינה נכשלה');
      sketchRef.current = d.sketch; setSketch(d.sketch); setData(d); setDirty(!!d.requiresSave); setConflict(false); setPaused(false); setSelected([]); setSeatingTables(d.seatingTables ?? []); setLinkItemId('');
      version.current++; past.current = d.originalSketch ? [d.originalSketch] : []; future.current = []; setHistoryVersion(v => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'הטעינה נכשלה'); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); void loadGuestNames(); }, []);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => setViewportWidth(entries[0].contentRect.width));
    observer.observe(viewport.current); return () => observer.disconnect();
  }, [ready]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    setSelected(ids => { const valid = ids.filter(id => sketch.items.some(item => item.id === id)); return valid.length === ids.length ? ids : valid; });
  }, [sketch.items]);
  function choose(item: SketchItem, additive = false) {
    if (!additive || !isSketchTable(item)) { setSelected([item.id]); return; }
    setSelected(ids => {
      const tables = ids.filter(id => sketchRef.current.items.some(i => i.id === id && isSketchTable(i)));
      return tables.includes(item.id) ? tables.filter(id => id !== item.id) : [...tables, item.id];
    });
  }
  function openTableLink(item: SketchItem) {
    if (!ready || !isSketchTable(item)) return;
    if (gesture.current) finish(true);
    setSelected([item.id]); setLinkItemId(item.id);
  }
  function assignTable(table: SketchSeatingTable) {
    try { apply(linkSketchTable(sketchRef.current, linkItemId, table)); setLinkItemId(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'השיוך נכשל'); }
  }
  function detachTable(id: string) { apply(unlinkSketchTable(sketchRef.current, id)); setLinkItemId(''); }
  async function refreshTables() {
    setRefreshingTables(true); void loadGuestNames();
    try {
      const response = await fetch('/api/admin/seating-sketch', { cache: 'no-store' });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'טעינת השולחנות נכשלה');
      setSeatingTables(result.seatingTables); apply(syncSketchTableLabels(sketchRef.current, result.seatingTables));
    } catch (e) { setError(e instanceof Error ? e.message : 'טעינת השולחנות נכשלה'); }
    finally { setRefreshingTables(false); }
  }
  function resizeGroup(e: React.FormEvent) {
    e.preventDefault();
    try { apply(resizeSketchTables(sketchRef.current, selectedTables.map(i => i.id), Number(groupSide))); }
    catch (e) { setError(e instanceof Error ? e.message : 'שינוי הגודל נכשל'); }
  }
  function remember(previous: SeatingSketch) {
    past.current = [...past.current.slice(-39), previous]; future.current = []; setHistoryVersion(v => v + 1);
  }
  function apply(next: SeatingSketch, history = true) {
    if (JSON.stringify(next) === JSON.stringify(sketchRef.current)) return;
    if (history) remember(sketchRef.current);
    sketchRef.current = next; setSketch(next); version.current++; setDirty(true); setPaused(false);
    if (!conflict) setError('');
  }
  function update(id: string, patch: Partial<SketchItem>, history = true) {
    const current = sketchRef.current;
    apply({ ...current, items: current.items.map(i => i.id === id ? fitItem({ ...i, ...patch }, current) : i) }, history);
  }
  const save = useCallback(async () => {
    if (!data || saveLock.current || conflict || gesture.current) return;
    saveLock.current = true; setSaving(true); setError('');
    const submitted = sketchRef.current; const submittedVersion = version.current;
    try {
      const r = await fetch('/api/admin/seating-sketch', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sketch: submitted, revision: data.revision }) });
      const d = await r.json(); if (!r.ok) { setConflict(!!d.conflict); throw new Error(d.error || 'השמירה נכשלה'); }
      const labels = d.seatingTables ?? seatingTables;
      const current = syncSketchTableLabels(sketchRef.current, labels);
      sketchRef.current = current; setSketch(current); setSeatingTables(labels);
      setData({ sketch: d.sketch ?? submitted, revision: d.revision, updatedAt: d.updatedAt });
      setDirty(version.current !== submittedVersion); setPaused(false);
    } catch (e) { setPaused(true); setError(e instanceof Error ? e.message : 'השמירה נכשלה'); }
    finally { saveLock.current = false; setSaving(false); }
  }, [data, conflict, seatingTables]);
  useEffect(() => {
    if (!dirty || !ready || saving || conflict || paused || interacting) return;
    const timer = window.setTimeout(() => { void save(); }, 2500); return () => window.clearTimeout(timer);
  }, [sketch, dirty, ready, saving, conflict, paused, interacting, save]);
  function start(e: PointerEvent<HTMLDivElement | HTMLButtonElement>, item: SketchItem, mode: Gesture['mode']) {
    if (!ready || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (mode === 'move' && (e.shiftKey || e.ctrlKey || e.metaKey) && isSketchTable(item)) { choose(item, true); return; }
    const ids = mode === 'move' && selected.includes(item.id) ? selectedItems.map(i => i.id) : [item.id];
    if (!selected.includes(item.id)) setSelected([item.id]);
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { id: item.id, ids, mode, startX: e.clientX, startY: e.clientY, scale, original: item, before: sketchRef.current };
    setInteracting(true);
  }
  function move(e: PointerEvent<HTMLDivElement | HTMLButtonElement>) {
    const g = gesture.current; if (!g) return;
    const dx = (e.clientX - g.startX) / g.scale, dy = (e.clientY - g.startY) / g.scale;
    const rounded = (n: number) => Math.round(n);
    if (g.mode === 'move') { apply(moveSketchItems(g.before, g.ids, rounded(dx), rounded(dy), snap, g.id), false); }
    else {
      const rad = g.original.rotation * Math.PI / 180;
      const localX = dx * Math.cos(rad) + dy * Math.sin(rad), localY = -dx * Math.sin(rad) + dy * Math.cos(rad);
      const width = rounded(g.original.width + localX), height = rounded(g.original.height + localY);
      update(g.id, g.original.kind === 'round' ? { width: Math.min(width, height), height: Math.min(width, height) } : { width, height }, false);
    }
  }
  function finish(cancel = false) {
    const g = gesture.current; if (!g) return;
    if (cancel) apply(g.before, false);
    else if (JSON.stringify(g.before) !== JSON.stringify(sketchRef.current)) remember(g.before);
    gesture.current = null; setInteracting(false);
  }
  function keyboard(e: KeyboardEvent<HTMLDivElement>, item: SketchItem) {
    if (e.target !== e.currentTarget || !ready) return;
    const direction: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (isSketchTable(item) && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); openTableLink(item); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(item, e.shiftKey || e.ctrlKey || e.metaKey); }
    if (direction[e.key]) {
      e.preventDefault(); const [x, y] = direction[e.key], step = snap ? SKETCH_GRID : e.shiftKey ? 10 : 1;
      const ids = selected.includes(item.id) ? selectedItems.map(i => i.id) : [item.id];
      if (!selected.includes(item.id)) setSelected([item.id]);
      apply(moveSketchItems(sketchRef.current, ids, x * step, y * step));
    }
    if (e.key === 'Escape') setSelected([]);
  }
  function undo(redo = false) {
    const source = redo ? future : past, destination = redo ? past : future;
    const next = source.current.pop(); if (!next) return;
    destination.current.push(sketchRef.current); apply(next, false); setHistoryVersion(v => v + 1);
  }
  function add() {
    if (sketch.items.length >= 150) return;
    const n = sketch.items.filter(i => i.kind === newKind).length + 1;
    const item: SketchItem = { id: crypto.randomUUID(), kind: newKind, label: newKind === 'round' ? String(n) : `${kindLabels[newKind]} ${n}`, x: sketch.width / 2 - 90, y: sketch.height / 2 - 60, width: newKind === 'round' ? DEFAULT_TABLE_SIDE : newKind === 'dance' ? 300 : 200, height: newKind === 'round' || newKind === 'banquet' ? DEFAULT_TABLE_SIDE : newKind === 'dance' ? 200 : 90, rotation: newKind === 'round' || newKind === 'banquet' ? DEFAULT_TABLE_ROTATION : 0, seats: newKind === 'round' ? 12 : newKind === 'banquet' ? 24 : 0 };
    apply({ ...sketch, items: [...sketch.items, fitItem(item, sketch)] }); setSelected([item.id]);
  }
  function leave(e: React.MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm('יש שינויים שטרם נשמרו. לצאת בלי לשמור?')) e.preventDefault();
  }
  async function exportPdf() { setExporting(true); setError(''); try { await downloadSketchPdf(sketchRef.current, { includeTableNames }); } catch(e) { setError(e instanceof Error ? e.message : 'ייצוא הקובץ נכשל'); } finally { setExporting(false); } }
  const hoveredItem = sketch.items.find(item => item.id === hover?.id);
  const hoveredNames = hoveredItem?.seatingTableId ? guestNames?.[hoveredItem.seatingTableId] : undefined;
  const tables = sketch.items.filter(i => i.kind === 'round' || i.kind === 'banquet');
  const numberField = (name: string, key: 'x' | 'y' | 'width' | 'height' | 'seats', min: number, max: number) => active && <label>{name}<input type="number" min={min} max={max} step="1" value={active[key]} onChange={e => { if (!e.target.value || !Number.isFinite(e.target.valueAsNumber)) return; const v = Math.max(min, Math.min(max, Math.round(e.target.valueAsNumber))); update(active.id, active.kind === 'round' && (key === 'width' || key === 'height') ? { width: v, height: v } : { [key]: v }); }} /></label>;
  return <main className="seating-shell sketch-shell" dir="rtl">
    <header className="seating-topbar"><Link href="/admin" onClick={leave}>{eventConfig.monogram[0]} <i>&amp;</i> {eventConfig.monogram[1]} <span>ניהול החתונה</span></Link><span>{eventDate}</span></header>
    <section className="seating-heading"><div><p className="seating-eyebrow">{eventHosts}</p><h1>סקיצת האולם</h1><p>גוררים למיקום הרצוי. לבחירה קבוצתית סמנו שולחנות ברשימה או לחצו עליהם עם Shift.</p></div><div className="seating-actions"><label className="sketch-pdf-option"><input type="checkbox" checked={includeTableNames} disabled={exporting} onChange={e => setIncludeTableNames(e.target.checked)} /> כולל שמות שולחנות ב-PDF</label><button disabled={!ready || interacting || exporting} onClick={() => void exportPdf()}>{exporting ? 'מייצא...' : 'ייצוא ל-PDF'}</button><Link className="sketch-link" href="/admin/seating" onClick={leave}>סידורי הושבה</Link><button className="seating-primary" disabled={!ready || !dirty || saving || conflict || interacting} onClick={() => void save()}>{saving ? 'שומר...' : paused ? 'ניסיון שמירה נוסף' : 'שמירה עכשיו'}</button></div></section>
    <div className="seating-save-line" role="status"><span>{loading ? 'טוען את הסקיצה...' : saving ? 'שומר את הסקיצה...' : dirty ? paused || conflict ? 'השינויים טרם נשמרו' : 'השינויים יישמרו אוטומטית בעוד רגע' : data?.updatedAt ? `הסקיצה נשמרה ב-${timestamp(data.updatedAt)}` : 'הבסיס מוכן לעריכה'}</span><span>{tables.length} שולחנות · {tables.reduce((n, i) => n + i.seats, 0)} מקומות</span></div>
    {error && <div className="seating-alert" role="alert">{error}{(!data || conflict) && <button disabled={loading} onClick={() => { if (!dirty || window.confirm('לטעון מחדש? השינויים שלא נשמרו יוחלפו בסקיצה השמורה.')) void load(); }}>טעינה מחדש</button>}</div>}
    {ready && <div className="sketch-workspace">
      <section className="sketch-board-panel" aria-label="עורך סקיצת האולם">
        <div className="sketch-toolbar"><label className="sketch-snap"><input type="checkbox" checked={showGuestNames} onChange={e => {setShowGuestNames(e.target.checked);setHover(null);}} /> שמות אורחים במעבר עכבר</label><div className="sketch-toolbar-group"><button onClick={() => undo()} disabled={!past.current.length || interacting} aria-label="ביטול השינוי האחרון">ביטול</button><button onClick={() => undo(true)} disabled={!future.current.length || interacting}>ביצוע מחדש</button></div><div className="sketch-toolbar-group"><button onClick={() => setZoom(z => Math.max(.75, +(z - .25).toFixed(2)))} disabled={zoom <= .75} aria-label="הקטנת תצוגה">−</button><button onClick={() => setZoom(1)} title="התאמה לרוחב">{Math.round(zoom * 100)}%</button><button onClick={() => setZoom(z => Math.min(3, +(z + .25).toFixed(2)))} disabled={zoom >= 3} aria-label="הגדלת תצוגה">+</button></div><label className="sketch-snap"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} /> הצמדה לגריד</label><button disabled={interacting || saving} onClick={() => apply(alignTablesToGrid(sketchRef.current))}>יישור כל השולחנות לגריד</button><button disabled={interacting} onClick={() => setSelected(tables.map(i => i.id))}>בחירת כל השולחנות</button>{selectedItems.length > 0 && <button disabled={interacting} onClick={() => setSelected([])}>ניקוי בחירה ({selectedItems.length})</button>}</div>
        <div className="sketch-viewport" ref={viewport} dir="ltr" onScroll={() => setHover(null)}><div className="sketch-stage-space" style={{ width: sketch.width * scale, height: sketch.height * scale }}><div className="sketch-stage" style={{ width: sketch.width, height: sketch.height, transform: `scale(${scale})` }} onPointerDown={e => { if (e.target === e.currentTarget) setSelected([]); }}>
          {sketch.items.map(item => <div key={item.id} role="button" tabIndex={0} aria-describedby={showGuestNames && hover?.id===item.id && !interacting ? "sketch-guest-tooltip" : undefined} onPointerEnter={e => {if(e.pointerType!=="touch")showGuests(item,e.currentTarget);}} onPointerLeave={closeHover} onFocus={e => showGuests(item,e.currentTarget)} onBlur={() => setHover(null)} aria-pressed={selected.includes(item.id)} aria-label={`${item.label}${item.name ? `, ${item.name}` : ''}${item.seats ? `, ${item.seats} מקומות` : ''}. ניתן להזיז עם מקשי החצים`} className={`sketch-item sketch-${item.kind}${selected.includes(item.id) ? ' is-selected' : ''}`} style={{ left: item.x, top: item.y, width: item.width, height: item.height, transform: `rotate(${item.rotation}deg)`, zIndex: selected.includes(item.id) ? 30 : item.kind === 'dance' ? 1 : 5 }} onClick={e => { if (e.detail === 0) choose(item, e.shiftKey || e.ctrlKey || e.metaKey); }} onKeyDown={e => {if(e.key === "Escape")setHover(null);else keyboard(e, item);}} onContextMenu={e => { if (isSketchTable(item)) { e.preventDefault(); openTableLink(item); } }} onPointerDown={e => {setHover(null);start(e, item, 'move');}} onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish()}>
            {(item.kind === 'round' || item.kind === 'banquet') && chairPositions(item).map((chair, index) => <span key={index} className="sketch-chair" aria-hidden="true" style={{ left: `calc(${chair.x - 9}px - var(--table-border))`, top: `calc(${chair.y - 8}px - var(--table-border))`, transform: `rotate(${chair.rotation}deg)` }} />)}
            <div className="sketch-item-label" dir="rtl"><strong>{sketchItemLabel(item)}</strong>{item.name && <small className="sketch-table-name" title={item.name}>{item.name}</small>}</div>
            {selectedItems.length === 1 && selected.includes(item.id) && <button className="sketch-resize" tabIndex={-1} aria-label={`שינוי גודל ${item.label}`} title="גרירה לשינוי גודל" onPointerDown={e => start(e, item, 'resize')} onPointerMove={e => { e.stopPropagation(); move(e); }} onPointerUp={e => { e.stopPropagation(); finish(); }} onPointerCancel={e => { e.stopPropagation(); finish(true); }}>↘</button>}
          </div>)}
        </div></div></div>
        <div className="sketch-board-note"><span>A4 לרוחב · הגריד מיישר את מרכזי השולחנות. המידות ללא קנה מידה פיזי.</span><span>הסקיצה נשמרת בנפרד משיבוץ האורחים.</span></div>
      </section>
      <aside className="sketch-inspector">
        <section className="sketch-properties"><h2>{selectedTables.length > 1 ? `עריכת ${selectedTables.length} שולחנות` : active ? 'עריכת רכיב' : 'בחירת רכיב'}</h2>{active ? <>
          <p className="sketch-kind">{kindLabels[active.kind]}</p>
          {isSketchTable(active) && <div className="sketch-link-controls"><button type="button" onClick={() => openTableLink(active)}>{active.seatingTableId ? 'שינוי שיוך מסידורי ההושבה' : 'שיוך מסידורי ההושבה'}</button>{active.seatingTableId && <><small>{seatingTables.some(t => t.id === active.seatingTableId) ? 'המספר והשם מתעדכנים מסידורי ההושבה.' : 'השולחן המשויך כבר לא קיים בסידורי ההושבה.'}</small><button type="button" onClick={() => detachTable(active.id)}>ניתוק השיוך</button></>}</div>}
          <label>{active.kind === 'round' || active.kind === 'banquet' ? 'מספר / כותרת השולחן (יופיע ב-PDF)' : 'כותרת'}<input type="text" maxLength={80} disabled={!!active.seatingTableId} value={active.label} onChange={e => { if (e.target.value.trim()) update(active.id, { label: e.target.value }); }} /></label>
          {(active.kind === 'round' || active.kind === 'banquet') && <label>שם השולחן (אפשר לכלול ב-PDF)<input type="text" maxLength={80} disabled={!!active.seatingTableId} value={active.name ?? ''} placeholder="למשל: משפחת החתן" onChange={e => update(active.id, { name: e.target.value })} /></label>}
          <div className="sketch-field-pair">{numberField(active.kind === 'round' ? 'אורך צלע' : 'רוחב', 'width', 48, sketch.width)}{active.kind !== 'round' && numberField('גובה', 'height', 48, sketch.height)}</div>
          <div className="sketch-field-pair">{numberField('מיקום אופקי', 'x', 0, sketch.width - active.width)}{numberField('מיקום אנכי', 'y', 0, sketch.height - active.height)}</div>
          <label>סיבוב (מעלות)<input type="number" min="0" max="359" step="45" value={active.rotation} onChange={e => { if (e.target.value && Number.isFinite(e.target.valueAsNumber)) update(active.id, { rotation: ((Math.round(e.target.valueAsNumber) % 360) + 360) % 360 }); }} /></label>
          <button onClick={() => update(active.id, { rotation: (active.rotation + 45) % 360 })}>סיבוב ב־45°</button>
          {(active.kind === 'round' || active.kind === 'banquet') && numberField('מספר מקומות', 'seats', 1, 1000)}
          <button className="sketch-delete" onClick={() => { if (window.confirm(`למחוק את ${active.label} מהסקיצה?`)) { apply({ ...sketch, items: sketch.items.filter(i => i.id !== active.id) }); setSelected([]); } }}>מחיקה מהסקיצה</button>
        </> : selectedTables.length > 1 ? <form className="sketch-group-edit" onSubmit={resizeGroup}>
          <p>גררו אחד מהשולחנות המסומנים כדי להזיז את הקבוצה יחד. אפשר גם להשתמש במקשי החצים.</p>
          <label>אורך צלע / רוחב אבירים<input type="number" min="48" max={Math.min(sketch.width, sketch.height)} step="1" required value={groupSide} onChange={e => setGroupSide(e.target.value)} /></label>
          <button type="submit" className="seating-primary" disabled={interacting || !groupSide}>החלת הגודל על {selectedTables.length} שולחנות</button>
          <small>שולחנות ריבועיים משתנים בשתי הצלעות. בשולחנות אבירים משתנה הרוחב.</small>
        </form> : <p>בחרו רכיב בסקיצה. לבחירת כמה שולחנות סמנו אותם ברשימה או השתמשו ב־Shift ולחיצה, ואז גררו אחד מהם.</p>}</section>
        <section className="sketch-unlinked"><h2><button type="button" aria-expanded={showUnlinked} aria-controls="sketch-unlinked-list" onClick={() => setShowUnlinked(v => !v)}>שולחנות שטרם שויכו לסקיצה ({remainingTables.length})</button></h2><button type="button" disabled={refreshingTables || interacting} onClick={() => void refreshTables()}>{refreshingTables ? 'מרענן...' : 'רענון מסידורי ההושבה'}</button>{showUnlinked && <div id="sketch-unlinked-list"><p>לשיוך, לחצו קליק ימני על שולחן בסקיצה או בחרו ״שיוך מסידורי ההושבה״ בעריכת השולחן.</p>{remainingTables.length ? <ul>{remainingTables.map(table => <li key={table.id}><strong>שולחן {table.number}</strong>{table.name && <span>{table.name}</span>}</li>)}</ul> : <p>{seatingTables.length ? 'כל השולחנות מסידורי ההושבה שויכו לסקיצה.' : 'עדיין לא נוצרו שולחנות בסידורי ההושבה.'}</p>}</div>}{missingLinkedTables.length > 0 && <p className="sketch-link-warning">{missingLinkedTables.length} שיוכים מפנים לשולחנות שנמחקו. בחרו את השולחן בסקיצה כדי לשנות או לנתק את השיוך.</p>}</section>
        <section className="sketch-add"><h2>הוספת רכיב</h2><label>סוג רכיב<select value={newKind} onChange={e => setNewKind(e.target.value as SketchKind)}>{Object.entries(kindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button onClick={add} disabled={sketch.items.length >= 150}>+ הוספה לסקיצה</button></section>
        <section className="sketch-item-list"><h2>רכיבי האולם <span>{sketch.items.length}</span></h2><div>{sketch.items.map(i => <div key={i.id} className="sketch-item-row">{isSketchTable(i) && <label className="sketch-group-check"><input type="checkbox" aria-label={`בחירת ${i.label}${i.name ? `, ${i.name}` : ''} לעריכה קבוצתית`} checked={selected.includes(i.id)} disabled={interacting} onChange={() => choose(i, true)} /></label>}<button aria-pressed={selected.includes(i.id)} disabled={interacting} onClick={e => choose(i, e.shiftKey || e.ctrlKey || e.metaKey)}><span className={`sketch-key sketch-key-${i.kind}`} /><span>{i.label}{i.name && <small className="sketch-list-name">{i.name}</small>}</span>{i.seats > 0 && <small>{i.seats}</small>}</button></div>)}</div></section>
        <button className="sketch-reset" onClick={() => { if (window.confirm('להחזיר את הסקיצה לבסיס הראשוני? אפשר לבטל את הפעולה לפני היציאה מהעמוד.')) { apply(createInitialSketch()); setSelected([]); } }}>חזרה לסקיצה הראשונית</button>
      </aside>
    </div>}
    {showGuestNames && hover && hoveredItem && !interacting && !linkItem && <div id="sketch-guest-tooltip" role="tooltip" className="sketch-guest-tooltip" onPointerEnter={keepHover} onPointerLeave={closeHover} dir="rtl" style={{left:hover.x,top:hover.y}}><strong>שולחן {sketchItemLabel(hoveredItem)}{hoveredItem.name ? ` · ${hoveredItem.name}` : ''}</strong>{!hoveredItem.seatingTableId ? <p>השולחן עדיין לא שויך לסידורי ההושבה</p> : guestError ? <p>טעינת השמות נכשלה. נסו ״רענון מסידורי ההושבה״.</p> : !guestNames ? <p>טוען שמות אורחים...</p> : !hoveredNames ? <p>השולחן המקושר לא נמצא בסידורי ההושבה</p> : !hoveredNames.length ? <p>עדיין לא שובצו אורחים לשולחן</p> : <ul>{hoveredNames.map((name,i) => <li key={i}>{name}</li>)}</ul>}</div>}
    {linkItem && <SketchTableLinkDialog item={linkItem} sketch={sketch} tables={seatingTables} select={assignTable} unlink={() => detachTable(linkItem.id)} close={() => setLinkItemId('')} />}
    {loading && <div className="seating-loading" role="status">טוען את סקיצת האולם...</div>}
  </main>;
}
