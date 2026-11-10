import { eventConfig, reservedTableNumber } from '@/lib/event-config';
import { tableOccupancy, type Guest, type SeatingPlan } from '@/lib/seating-model';

export default function SeatingSummary({ guests, plan }: { guests: Guest[]; plan: SeatingPlan }) {
  const assigned = new Set(plan.tables.flatMap(table => table.guests));
  const waiting = guests.filter(guest => !assigned.has(guest.id));
  const confirmed = waiting.filter(guest => guest.attendance === 'yes');
  const count = (rows: Guest[]) => rows.reduce((sum, guest) => sum + (guest.count ?? 0), 0);
  const unknown = guests.filter(guest => guest.count === null).length;
  const confirmedUnknown = confirmed.filter(guest => guest.count === null).length;
  const estimated = count(confirmed.filter(guest => guest.estimated));
  const totalSeats = plan.tables.reduce((sum, table) => sum + (table.number === reservedTableNumber ? table.capacity : eventConfig.seating.standardCapacity), 0);
  const freeSeats = plan.tables.reduce((sum, table) => sum + Math.max(0, table.capacity - tableOccupancy(table, guests)), 0);

  return <section className="seating-stats" aria-label="סיכום ההושבה">
    <article><span>סה״כ מקומות</span><strong>{totalSeats}</strong><small>{eventConfig.seating.standardCapacity} לכל שולחן · שולחן {reservedTableNumber} לפי הקיבולת שלו</small></article>
    <article><span>כבר שובצו</span><strong>{count(guests) - count(waiting)}</strong><small>ב-{plan.tables.length} שולחנות</small></article>
    <article><span>ממתינים לשיבוץ</span><strong>{count(waiting)}</strong><small>{waiting.length} הזמנות{unknown > 0 ? ` · ${unknown} ללא כמות` : ''}</small></article>
    <article><span>אישרו וטרם שובצו</span><strong>{count(confirmed)}</strong><small>{confirmed.length} הזמנות{estimated > 0 ? ` · מתוכם ${estimated} משוערים` : ''}{confirmedUnknown > 0 ? ` · ${confirmedUnknown} ללא כמות` : ''}</small></article>
    <article><span>מקומות פנויים</span><strong>{freeSeats}</strong><small>בכל השולחנות בסידור</small></article>
    <article><span>סה״כ שולחנות</span><strong>{plan.tables.length}</strong><small>כל השולחנות בסידור</small></article>
  </section>;
}
