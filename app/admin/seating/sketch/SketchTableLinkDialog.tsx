'use client';
import { useEffect, useRef, useState } from 'react';
import { sketchItemLabel, type SeatingSketch, type SketchItem, type SketchSeatingTable } from '@/lib/seating-sketch';

export default function SketchTableLinkDialog({ item, sketch, tables, select, unlink, close }: {
  item: SketchItem; sketch: SeatingSketch; tables: SketchSeatingTable[];
  select: (table: SketchSeatingTable) => void; unlink: () => void; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const query = search.trim().toLocaleLowerCase('he');
  const visible = tables.filter(table => `${table.number} ${table.name ?? ''}`.toLocaleLowerCase('he').includes(query));
  return <dialog ref={dialog} className="sketch-link-dialog" aria-labelledby="sketch-link-title" onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <section dir="rtl">
      <h2 id="sketch-link-title">שיוך שולחן מסידורי ההושבה</h2>
      <p>השולחן בסקיצה: <b>{sketchItemLabel(item)}{item.name ? ` · ${item.name}` : ''}</b></p>
      <p>בחרו שולחן. המספר והשם יתעדכנו לפי סידורי ההושבה.</p>
      <input autoFocus type="search" aria-label="חיפוש שולחן לשיוך" placeholder="חיפוש לפי מספר או שם שולחן" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="sketch-link-options">
        {visible.map(table => {
          const other = sketch.items.find(i => i.id !== item.id && i.seatingTableId === table.id);
          return <button type="button" key={table.id} className="sketch-link-table" disabled={!!other} aria-pressed={item.seatingTableId === table.id} onClick={() => select(table)}>
            <strong>שולחן {table.number}{table.name ? ` · ${table.name}` : ''}</strong>
            <small>{other ? `כבר משויך בסקיצה: ${sketchItemLabel(other)}` : item.seatingTableId === table.id ? 'משויך לשולחן הזה' : 'זמין לשיוך'}</small>
          </button>;
        })}
        {!visible.length && <p>{tables.length ? 'לא נמצאו שולחנות בחיפוש הזה' : 'עדיין לא נוצרו שולחנות בסידורי ההושבה'}</p>}
      </div>
      <div className="sketch-link-dialog-actions">{item.seatingTableId && <button type="button" onClick={unlink}>ניתוק השיוך</button>}<button type="button" onClick={close}>סגירה</button></div>
    </section>
  </dialog>;
}
