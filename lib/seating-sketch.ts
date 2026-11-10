import type { SeatingTable } from './seating-model';
// The saved 'round' key now represents square tables; keep it to preserve existing sketches.
export type SketchKind = 'round' | 'banquet' | 'dj' | 'bar' | 'dance';
export type SketchItem = { id: string; kind: SketchKind; label: string; name?: string; seatingTableId?: string; x: number; y: number; width: number; height: number; rotation: number; seats: number };
export type SketchSeatingTable = Pick<SeatingTable, 'id' | 'number' | 'name'>;
export type SeatingSketch = { width: number; height: number; layoutVersion?: 2 | 3 | 4; items: SketchItem[] };
export const SKETCH_GRID = 25;
export const DEFAULT_TABLE_SIDE = 85;
export const DEFAULT_TABLE_ROTATION = 45;
export const SKETCH_WIDTH = 1485;
export const SKETCH_HEIGHT = 1050;
export const kindLabels: Record<SketchKind, string> = { round: 'שולחן ריבועי', banquet: 'שולחן אבירים', dj: 'עמדת DJ', bar: 'בר', dance: 'רחבת ריקודים' };
export const isSketchTable = (item: SketchItem) => item.kind === 'round' || item.kind === 'banquet';
// Text annotations were briefly supported. Ignore saved annotations when reading older documents.
export function withoutTextItems(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !Array.isArray((value as SeatingSketch).items)) return value;
  const sketch = value as SeatingSketch;
  const items = sketch.items.filter(item => (item?.kind as string) !== 'text');
  return items.length === sketch.items.length ? sketch : { ...sketch, items };
}
export function sketchItemLabel(item: SketchItem) {
  return isSketchTable(item) ? item.label.replace(/^שולחן\s+/, '') : item.label;
}
export function linkSketchTable(sketch: SeatingSketch, itemId: string, table: SketchSeatingTable): SeatingSketch {
  const item = sketch.items.find(i => i.id === itemId);
  if (!item || !isSketchTable(item)) throw new Error('יש לבחור שולחן בסקיצה');
  if (sketch.items.some(i => i.id !== itemId && i.seatingTableId === table.id)) throw new Error(`שולחן ${table.number} כבר משויך לשולחן אחר בסקיצה`);
  return { ...sketch, items: sketch.items.map(i => i.id === itemId ? { ...i, seatingTableId: table.id, label: String(table.number), name: table.name ?? '' } : i) };
}
export function unlinkSketchTable(sketch: SeatingSketch, itemId: string): SeatingSketch {
  return { ...sketch, items: sketch.items.map(i => { if (i.id !== itemId || !i.seatingTableId) return i; const item = { ...i }; delete item.seatingTableId; return item; }) };
}
export function syncSketchTableLabels(sketch: SeatingSketch, tables: SketchSeatingTable[]): SeatingSketch {
  const map = new Map(tables.map(table => [table.id, table])); let changed = false;
  const items = sketch.items.map(item => {
    const table = item.seatingTableId ? map.get(item.seatingTableId) : undefined;
    if (!table || (item.label === String(table.number) && (item.name ?? '') === (table.name ?? ''))) return item;
    changed = true; return { ...item, label: String(table.number), name: table.name ?? '' };
  });
  return changed ? { ...sketch, items } : sketch;
}
export function unlinkedSeatingTables(sketch: SeatingSketch, tables: SketchSeatingTable[]): SketchSeatingTable[] {
  const linked = new Set(sketch.items.flatMap(item => item.seatingTableId ? [item.seatingTableId] : []));
  return tables.filter(table => !linked.has(table.id)).sort((a, b) => a.number - b.number);
}
// Clamp one shared translation so the spacing within a group never changes at an edge.
export function moveSketchItems(sketch: SeatingSketch, ids: string[], dx: number, dy: number, snap = false, anchorId = ids[0]): SeatingSketch {
  const chosen = new Set(ids), items = sketch.items.filter(item => chosen.has(item.id));
  if (!items.length || !Number.isFinite(dx) || !Number.isFinite(dy)) return sketch;
  const anchor = items.find(item => item.id === anchorId) ?? items[0];
  if (snap) {
    dx = Math.round((anchor.x + anchor.width / 2 + dx) / SKETCH_GRID) * SKETCH_GRID - anchor.x - anchor.width / 2;
    dy = Math.round((anchor.y + anchor.height / 2 + dy) / SKETCH_GRID) * SKETCH_GRID - anchor.y - anchor.height / 2;
  }
  let minX = -Infinity, maxX = Infinity, minY = -Infinity, maxY = Infinity;
  for (const item of items) {
    const rad = item.rotation * Math.PI / 180, cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    const insetX = Math.max(0, (item.width * cos + item.height * sin - item.width) / 2);
    const insetY = Math.max(0, (item.width * sin + item.height * cos - item.height) / 2);
    minX = Math.max(minX, insetX - item.x); maxX = Math.min(maxX, sketch.width - item.width - insetX - item.x);
    minY = Math.max(minY, insetY - item.y); maxY = Math.min(maxY, sketch.height - item.height - insetY - item.y);
  }
  if (minX > maxX || minY > maxY) return sketch;
  dx = Math.max(minX, Math.min(maxX, dx)); dy = Math.max(minY, Math.min(maxY, dy));
  if (!dx && !dy) return sketch;
  return { ...sketch, items: sketch.items.map(item => chosen.has(item.id) ? { ...item, x: item.x + dx, y: item.y + dy } : item) };
}
export function resizeSketchTables(sketch: SeatingSketch, ids: string[], side: number): SeatingSketch {
  if (!Number.isSafeInteger(side) || side < 48 || side > Math.min(sketch.width, sketch.height)) throw new Error('יש לבחור אורך צלע תקין בין 48 לגודל הסקיצה');
  const chosen = new Set(ids);
  return { ...sketch, items: sketch.items.map(item => {
    if (!chosen.has(item.id) || !isSketchTable(item)) return item;
    const width = item.kind === 'round' || item.width <= item.height ? side : item.width;
    const height = item.kind === 'round' || item.height <= item.width ? side : item.height;
    const fitted = fitItem({ ...item, width, height, x: item.x + (item.width - width) / 2, y: item.y + (item.height - height) / 2 }, sketch);
    if (Math.abs(fitted.width - width) > .001 || Math.abs(fitted.height - height) > .001) throw new Error('הגודל שנבחר לא מתאים לגבולות הסקיצה. יש לבחור אורך צלע קטן יותר');
    return fitted;
  }) };
}
export function createInitialSketch(): SeatingSketch {
  const items: SketchItem[] = Array.from({ length: 16 }, (_, i) => ({ id: `round-${i + 1}`, kind: 'round', label: `שולחן ${i + 1}`, seats: 12, x: 95 + (i % 4) * 230, y: 65 + Math.floor(i / 4) * 165, width: DEFAULT_TABLE_SIDE, height: DEFAULT_TABLE_SIDE, rotation: 0 }));
  items.push(
    { id: 'dj', kind: 'dj', label: 'עמדת DJ', seats: 0, x: 65, y: 775, width: 130, height: 170, rotation: 0 },
    { id: 'bar', kind: 'bar', label: 'בר', seats: 0, x: 780, y: 775, width: 155, height: 140, rotation: 0 },
    { id: 'banquet-24', kind: 'banquet', label: 'אבירים 24', seats: 24, x: 220, y: 940, width: 280, height: 85, rotation: 0 },
    { id: 'banquet-20', kind: 'banquet', label: 'אבירים 20', seats: 20, x: 535, y: 940, width: 230, height: 85, rotation: 0 },
    { id: 'dance-men', kind: 'dance', label: 'רחבת גברים', seats: 0, x: 55, y: 1085, width: 430, height: 205, rotation: 0 },
    { id: 'dance-women', kind: 'dance', label: 'רחבת נשים', seats: 0, x: 515, y: 1085, width: 430, height: 205, rotation: 0 },
  );
  return upgradeSketch({ width: 1000, height: 1350, items });
}
// Upgrade once, keeping each object's centre and the user's arrangement together.
export function upgradeSketch(sketch: SeatingSketch): SeatingSketch {
  if (sketch.layoutVersion === 4) return sketch;
  if (sketch.layoutVersion === 3) {
    // Resize each saved table once around its centre. Long tables keep their long edge.
    const resized = resizeSketchTables(sketch, sketch.items.filter(isSketchTable).map(item => item.id), DEFAULT_TABLE_SIDE);
    return { ...resized, layoutVersion: 4 };
  }
  const previous = sketch.layoutVersion === 2 ? sketch : landscapeSketch(sketch);
  const result: SeatingSketch = { ...previous, width: SKETCH_WIDTH, height: SKETCH_HEIGHT, layoutVersion: 3, items: [] };
  result.items = previous.items.map(item => {
    const table = item.kind === 'round' || item.kind === 'banquet';
    const width = item.kind === 'round' ? DEFAULT_TABLE_SIDE : item.kind === 'banquet' && item.width <= item.height ? DEFAULT_TABLE_SIDE : item.width;
    const height = item.kind === 'round' ? DEFAULT_TABLE_SIDE : item.kind === 'banquet' && item.height <= item.width ? DEFAULT_TABLE_SIDE : item.height;
    return fitItem({ ...item, width, height, rotation: table ? DEFAULT_TABLE_ROTATION : item.rotation,
      x: (item.x + item.width / 2) * result.width / previous.width - width / 2,
      y: (item.y + item.height / 2) * result.height / previous.height - height / 2 }, result);
  });
  return upgradeSketch(result);
}
function landscapeSketch(sketch: SeatingSketch): SeatingSketch {
  const landscape = sketch.width < sketch.height;
  const result: SeatingSketch = { ...sketch, width: landscape ? sketch.height : sketch.width, height: landscape ? sketch.width : sketch.height, layoutVersion: 2, items: [] };
  const banquetSides = sketch.items.filter(i => i.kind === 'banquet').map(i => Math.min(i.width, i.height));
  const side = Math.max(48, banquetSides.length ? Math.min(...banquetSides) : 85);
  result.items = sketch.items.map(item => {
    const cx = item.x + item.width / 2, cy = item.y + item.height / 2;
    const width = item.kind === 'round' ? Math.min(item.width, item.height, side) : landscape ? item.height : item.width;
    const height = item.kind === 'round' ? width : landscape ? item.width : item.height;
    return fitItem({ ...item, width, height, x: (landscape ? cy : cx) - width / 2, y: (landscape ? sketch.width - cx : cy) - height / 2 }, result);
  });
  return result;
}
export function snapItemToGrid(item: SketchItem, sketch: SeatingSketch, step = SKETCH_GRID): SketchItem {
  const grid = Number.isFinite(step) && step > 0 ? step : SKETCH_GRID;
  return fitItem({ ...item, x: Math.round((item.x + item.width / 2) / grid) * grid - item.width / 2, y: Math.round((item.y + item.height / 2) / grid) * grid - item.height / 2 }, sketch);
}
export function alignTablesToGrid(sketch: SeatingSketch): SeatingSketch {
  return { ...sketch, items: sketch.items.map(item => item.kind === 'round' || item.kind === 'banquet' ? snapItemToGrid({ ...item, rotation: (Math.round(item.rotation / 45) * 45) % 360 }, sketch) : item) };
}
export function fitItem(item: SketchItem, sketch: SeatingSketch): SketchItem {
  const sideLength = Math.max(48, Math.min(sketch.width, sketch.height, item.width, item.height));
  let width = item.kind === 'round' ? sideLength : Math.max(48, Math.min(sketch.width, item.width));
  let height = item.kind === 'round' ? sideLength : Math.max(48, Math.min(sketch.height, item.height));
  const radians = item.rotation * Math.PI / 180, cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
  const minimumBounds = 48 * (cos + sin);
  const scale = Math.max(0, Math.min(1,
    (sketch.width - minimumBounds) / ((width - 48) * cos + (height - 48) * sin || 1),
    (sketch.height - minimumBounds) / ((width - 48) * sin + (height - 48) * cos || 1)));
  width = 48 + (width - 48) * scale; height = 48 + (height - 48) * scale;
  const insetX = Math.max(0, (width * cos + height * sin - width) / 2);
  const insetY = Math.max(0, (width * sin + height * cos - height) / 2);
  return { ...item, width, height, x: Math.max(insetX, Math.min(sketch.width - width - insetX, item.x)), y: Math.max(insetY, Math.min(sketch.height - height - insetY, item.y)) };
}
export function chairPositions(item: SketchItem): { x: number; y: number; rotation: number }[] {
  if ((item.kind !== 'round' && item.kind !== 'banquet') || item.seats < 1) return [];
  const lengths = [item.width, item.height, item.width, item.height];
  const perimeter = lengths.reduce((sum, n) => sum + n, 0);
  const quotas = lengths.map(length => item.seats * length / perimeter);
  const counts = quotas.map(Math.floor);
  const order = quotas.map((quota, side) => ({ side, remainder: quota - counts[side] })).sort((a, b) => b.remainder - a.remainder);
  const remaining = item.seats - counts.reduce((sum, n) => sum + n, 0);
  for (let i = 0; i < remaining; i++) counts[order[i].side]++;
  return counts.flatMap((count, side) => Array.from({ length: count }, (_, i) => {
    const offset = lengths[side] * (i + 1) / (count + 1);
    if (side === 0) return { x: offset, y: -8, rotation: 0 };
    if (side === 1) return { x: item.width + 8, y: offset, rotation: 90 };
    if (side === 2) return { x: offset, y: item.height + 8, rotation: 180 };
    return { x: -8, y: offset, rotation: 270 };
  }));
}
export function validateSketch(value: unknown): value is SeatingSketch {
  if (!value || typeof value !== 'object') return false;
  const v = value as SeatingSketch;
  if (v.layoutVersion !== undefined && v.layoutVersion !== 2 && v.layoutVersion !== 3 && v.layoutVersion !== 4) return false;
  if (!Number.isFinite(v.width) || v.width < 400 || v.width > 4000 || !Number.isFinite(v.height) || v.height < 400 || v.height > 4000 || !Array.isArray(v.items) || v.items.length > 150) return false;
  const ids = new Set<string>(); const linkedTables = new Set<string>();
  for (const i of v.items) {
    if (i && i.name !== undefined && (typeof i.name !== 'string' || i.name.length > 80)) return false;
    if (i && i.seatingTableId !== undefined) {
      if (typeof i.seatingTableId !== 'string' || !i.seatingTableId || i.seatingTableId.length > 100 || !isSketchTable(i) || linkedTables.has(i.seatingTableId)) return false;
      linkedTables.add(i.seatingTableId);
    }
    if (!i || typeof i.id !== 'string' || !i.id || i.id.length > 100 || ids.has(i.id) || !Object.hasOwn(kindLabels, i.kind) || typeof i.label !== 'string' || i.label.length < 1 || i.label.length > 80 || ![i.x, i.y, i.width, i.height, i.rotation].every(Number.isFinite) || i.width < 48 || i.height < 48 || i.x < 0 || i.y < 0 || i.x + i.width > v.width + .01 || i.y + i.height > v.height + .01 || i.rotation < 0 || i.rotation >= 360 || !Number.isSafeInteger(i.seats) || i.seats < 0 || i.seats > 1000) return false;
    ids.add(i.id);
  }
  return true;
}
