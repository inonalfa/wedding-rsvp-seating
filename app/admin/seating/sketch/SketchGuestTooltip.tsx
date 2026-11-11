import { sketchItemLabel, type SketchItem } from '@/lib/seating-sketch';
type Props = { item: SketchItem; names: string[] | undefined; namesLoaded: boolean; error: boolean; position: { x: number; y: number }; keep: () => void; close: () => void };
export default function SketchGuestTooltip({ item, names, namesLoaded, error, position, keep, close }: Props) {
  return <div id="sketch-guest-tooltip" role="tooltip" className="sketch-guest-tooltip" onPointerEnter={keep} onPointerLeave={close} dir="rtl" style={{ left: position.x, top: position.y }}>
    <strong>שולחן {sketchItemLabel(item)}{item.name ? ` · ${item.name}` : ''}</strong>
    {!item.seatingTableId ? <p>השולחן עדיין לא שויך לסידורי ההושבה</p> : error ? <p>טעינת השמות נכשלה. נסו ״רענון מסידורי ההושבה״.</p> : !namesLoaded ? <p>טוען שמות אורחים...</p> : !names ? <p>השולחן המקושר לא נמצא בסידורי ההושבה</p> : !names.length ? <p>עדיין לא שובצו אורחים לשולחן</p> : <ul>{names.map((name, index) => <li key={index}>{name}</li>)}</ul>}
  </div>;
}
