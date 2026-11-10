import {eventConfig} from './event-config';
export type Guest = { id: string; name: string; side: string; category: string; linkedTo: string; attendance: 'yes' | 'pending'; count: number | null; estimated: boolean; sourceRow: number };
export type SeatingTable = { id: string; number: number; name?: string; capacity: number; guests: string[] };
export type SeatingPlan = { tables: SeatingTable[] };
export function searchSeatingGuests(guests: Guest[], plan: SeatingPlan, query: string, side = 'all', status = 'all') {
  const terms = query.trim().toLocaleLowerCase('he').split(/\s+/).filter(Boolean);
  const tables = new Map(plan.tables.flatMap(table => table.guests.map(id => [id, table] as const)));
  const unseated: Guest[] = [];
  const seated: { guest: Guest; table: SeatingTable }[] = [];
  for (const guest of guests) {
    if ((side !== 'all' && guest.side !== side) || (status !== 'all' && guest.attendance !== status)) continue;
    const searchable = [guest.name, guest.category, guest.linkedTo].join(' ').toLocaleLowerCase('he');
    if (!terms.every(term => searchable.includes(term))) continue;
    const table = tables.get(guest.id);
    if (!table) unseated.push(guest);
    else if (terms.length) seated.push({ guest, table });
  }
  return { unseated, seated };
}
export type SheetRange = { range: string; values?: unknown[][] };
export const SHEETS = eventConfig.sheetNames;
function text(value: unknown) { return String(value ?? '').trim(); }
function count(value: unknown): number | null { const n = Number(text(value)); return Number.isSafeInteger(n) && n > 0 && n <= 1000 ? n : null; }
export function parseGuests(ranges: SheetRange[]): Guest[] {
  const guests: Guest[] = []; const ids = new Set<string>();
  for (const sheet of SHEETS) {
    const range = ranges.find(r => r.range.startsWith(`'${sheet}'!`) || r.range.startsWith(`${sheet}!`));
    if (!range?.values?.length) throw new Error('חסרים נתונים מאחד מגיליונות המוזמנים');
    const header = range.values[0];
    if (text(header[1]) !== 'שם פרטי' || text(header[4]) !== 'מספר מוזמנים' || text(header[10]) !== 'מספר מאשרים') throw new Error('מבנה גיליון המוזמנים השתנה');
    for (let i = 1; i < range.values.length; i++) {
      const row = range.values[i]; const name = [text(row[1]), text(row[2])].filter(Boolean).join(' ');
      if (!name) continue;
      const status = text(row[9]);
      if (['לא מגיעים', 'לא מגיע', 'לא מגיעה', 'no'].includes(status)) continue;
      const id = text(row[8]) || `${sheet}:${text(row[6]) || text(row[3]).replace(/\D/g, '') || name}`;
      if (ids.has(id)) throw new Error('נמצאו מזהי הזמנה כפולים בגיליון. יש לתקן אותם לפני הרענון.');
      ids.add(id);
      const confirmed = ['מאשרים', 'מגיעים', 'מאשר', 'מאשרת', 'yes'].includes(status);
      const actual = confirmed ? count(row[10]) : null;
      guests.push({ id, name, side: sheet === SHEETS[0] ? eventConfig.hosts[0] : eventConfig.hosts[1], category: text(row[0]), linkedTo: text(row[5]), attendance: confirmed ? 'yes' : 'pending', count: actual ?? count(row[4]), estimated: actual === null, sourceRow: i + 1 });
    }
  }
  return guests;
}
export function validatePlan(value: unknown): value is SeatingPlan {
  if (!value || typeof value !== 'object' || !('tables' in value) || !Array.isArray(value.tables) || value.tables.length > 300) return false;
  const ids = new Set<string>(); const numbers = new Set<number>(); const assigned = new Set<string>();
  for (const table of value.tables) {
    if (!table || typeof table.id !== 'string' || table.id.length > 100 || !table.id || ids.has(table.id) || !Number.isSafeInteger(table.number) || table.number < 1 || table.number > 9999 || numbers.has(table.number) || !Number.isSafeInteger(table.capacity) || table.capacity < 1 || table.capacity > 1000 || !Array.isArray(table.guests) || table.guests.length > 1000) return false;
    if (table.name !== undefined && (typeof table.name !== 'string' || table.name.length > 80)) return false;
    ids.add(table.id); numbers.add(table.number);
    for (const id of table.guests) { if (typeof id !== 'string' || !id || id.length > 300 || assigned.has(id)) return false; assigned.add(id); }
  }
  return true;
}
export function tableOccupancy(table: SeatingTable, guests: Guest[]) {
  const map = new Map(guests.map(g => [g.id, g]));
  return table.guests.reduce((sum, id) => sum + (map.get(id)?.count ?? 0), 0);
}

export function tableMajoritySide(table: SeatingTable, guests: Guest[]): 'דנה' | 'יואב' | 'mixed' | 'empty' {
  const map = new Map(guests.map(g => [g.id, g]));
  let dana = 0, yoav = 0;
  for (const id of table.guests) {
    const guest = map.get(id);
    if (guest?.side === 'דנה') dana += guest.count ?? 0;
    if (guest?.side === 'יואב') yoav += guest.count ?? 0;
  }
  if (dana + yoav === 0) return 'empty';
  return dana === yoav ? 'mixed' : dana > yoav ? 'דנה' : 'יואב';
}

export type TableGuestSort = 'original' | 'confirmedFirst' | 'pendingFirst';
export function tableAttendanceSummary(table: SeatingTable, guests: Guest[]) {
  const map = new Map(guests.map(g => [g.id, g]));
  let confirmed = 0, pending = 0;
  for (const id of table.guests) {
    const guest = map.get(id);
    if (guest?.attendance === 'yes') confirmed += guest.count ?? 0;
    if (guest?.attendance === 'pending') pending += guest.count ?? 0;
  }
  return { confirmed, pending };
}
export function sortedTableGuests(table: SeatingTable, guests: Guest[], order: TableGuestSort): Guest[] {
  const map = new Map(guests.map(g => [g.id, g]));
  const rows = table.guests.flatMap(id => { const g = map.get(id); return g ? [g] : []; });
  if (order === 'original') return rows;
  const first = order === 'confirmedFirst' ? 'yes' : 'pending';
  return rows.sort((a,b) => Number(b.attendance === first) - Number(a.attendance === first));
}


// Keep stable table IDs and assignments, and reserve the existing family table's number.
export function compactTableNumbers(plan: SeatingPlan): SeatingPlan {
  const fixed = plan.tables.find(t => t.number === 2);
  let number = 1;
  const numbers = new Map<string, number>();
  for (const table of [...plan.tables].sort((a,b) => a.number-b.number)) {
    if (table.id === fixed?.id) { numbers.set(table.id, 2); continue; }
    if (fixed && number === 2) number++;
    numbers.set(table.id, number++);
  }
  return { tables: plan.tables.map(table => ({ ...table, number: numbers.get(table.id)! })) };
}
