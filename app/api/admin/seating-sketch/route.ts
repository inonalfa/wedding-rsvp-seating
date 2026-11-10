import { getAdminApiUser } from '@/lib/admin-auth';
import { getD1Binding } from '@/db';
import { createInitialSketch, validateSketch, upgradeSketch, syncSketchTableLabels, withoutTextItems, type SketchSeatingTable } from '@/lib/seating-sketch';
import { validatePlan } from '@/lib/seating-model';
const headers = { 'Cache-Control': 'private, no-store' };
async function loadTableLabels(): Promise<SketchSeatingTable[]> {
  const row = await getD1Binding().prepare('SELECT document FROM seating_plans WHERE id = 1').first<{ document: string }>();
  const plan = row ? JSON.parse(row.document) : { tables: [] };
  if (!validatePlan(plan)) throw new Error('Invalid seating plan');
  return plan.tables.map(({ id, number, name }) => ({ id, number, name })).sort((a, b) => a.number - b.number);
}
export async function GET() {
  const auth = await getAdminApiUser(); if (auth.response) return auth.response;
  try {
    const row = await getD1Binding().prepare('SELECT document, revision, updated_at FROM seating_sketches WHERE id = 1').first<{ document: string; revision: number; updated_at: string }>();
    const original = row ? JSON.parse(row.document) : createInitialSketch();
    const sketch = withoutTextItems(original);
    if (!validateSketch(sketch)) throw new Error('Invalid saved sketch');
    const upgraded = upgradeSketch(sketch), seatingTables = await loadTableLabels();
    const synced = syncSketchTableLabels(upgraded, seatingTables);
    if (!validateSketch(synced)) throw new Error('Invalid upgraded sketch');
    return Response.json({ sketch: synced, seatingTables, requiresSave: synced !== original, originalSketch: upgraded !== sketch ? { ...sketch, layoutVersion: 3 } : undefined, revision: row?.revision ?? 0, updatedAt: row?.updated_at ?? null }, { headers });
  } catch { return Response.json({ error: 'לא הצלחנו לטעון את הסקיצה. אפשר לנסות שוב.' }, { status: 503, headers }); }
}
export async function PUT(request: Request) {
  const auth = await getAdminApiUser(); if (auth.response) return auth.response;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'בקשה לא מורשית' }, { status: 403, headers });
  try {
    const text = await request.text();
    if (text.length > 150_000) return Response.json({ error: 'הסקיצה גדולה מדי' }, { status: 413, headers });
    let payload;
    try { payload = JSON.parse(text); } catch { return Response.json({ error: 'נתוני הסקיצה אינם תקינים' }, { status: 400, headers }); }
    if (!validateSketch(payload.sketch) || !Number.isSafeInteger(payload.revision) || payload.revision < 0) return Response.json({ error: 'יש לבדוק את המידות והפריטים בסקיצה' }, { status: 400, headers });
    const seatingTables = await loadTableLabels();
    const sketch = syncSketchTableLabels(payload.sketch, seatingTables);
    const now = new Date().toISOString(); const db = getD1Binding();
    const updated = payload.revision === 0
      ? await db.prepare('INSERT INTO seating_sketches (id, document, revision, updated_at) VALUES (1, ?, 1, ?) ON CONFLICT(id) DO NOTHING RETURNING revision').bind(JSON.stringify(sketch), now).first<{ revision: number }>()
      : await db.prepare('UPDATE seating_sketches SET document = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ? RETURNING revision').bind(JSON.stringify(sketch), now, payload.revision).first<{ revision: number }>();
    if (!updated) return Response.json({ error: 'הסקיצה השתנתה במכשיר אחר. יש לטעון את הסקיצה העדכנית לפני שמירה.', conflict: true }, { status: 409, headers });
    return Response.json({ sketch, seatingTables, revision: updated.revision, updatedAt: now }, { headers });
  } catch { return Response.json({ error: 'השמירה נכשלה. השינויים נשארו על המסך ואפשר לנסות שוב.' }, { status: 500, headers }); }
}
