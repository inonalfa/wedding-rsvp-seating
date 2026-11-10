import { getAdminApiUser } from '@/lib/admin-auth';
import { getD1Binding } from '@/db';
import { loadSeatingData } from '@/lib/seating-data';
import { validatePlan } from '@/lib/seating-model';
import {syncSeatingSheets} from '@/lib/seating-sheet-sync';
const headers = {'Cache-Control': 'private, no-store'};
export async function GET(request: Request) {
  const auth = await getAdminApiUser(); if (auth.response) return auth.response;
  try { const data=await loadSeatingData(new URL(request.url).searchParams.get('refresh') === '1'); const sheetSync=await syncSeatingSheets(false,5); return Response.json({...data,sheetSync}, {headers}); }
  catch (e) { return Response.json({error: e instanceof Error ? e.message : 'טעינת ההושבה נכשלה'}, {status: 503, headers}); }
}
export async function PUT(request: Request) {
  const auth = await getAdminApiUser(); if (auth.response) return auth.response;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return Response.json({error: 'בקשה לא מורשית'}, {status: 403});
  try {
    const text = await request.text(); if (text.length > 300_000) return Response.json({error: 'סידור גדול מדי'}, {status: 413});
    const payload = JSON.parse(text);
    if (!validatePlan(payload.plan) || !Number.isSafeInteger(payload.revision) || payload.revision < 0) return Response.json({error: 'יש לבדוק שמספרי השולחנות ייחודיים ושהקיבולת תקינה'}, {status: 400});
    const db = getD1Binding(); const now = new Date().toISOString();
    const updated = payload.revision === 0
      ? await db.prepare('INSERT INTO seating_plans (id, document, revision, updated_at) VALUES (1, ?, 1, ?) ON CONFLICT(id) DO NOTHING RETURNING revision').bind(JSON.stringify(payload.plan), now).first<{revision: number}>()
      : await db.prepare('UPDATE seating_plans SET document = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ? RETURNING revision').bind(JSON.stringify(payload.plan), now, payload.revision).first<{revision: number}>();
    if (!updated) return Response.json({error: 'סידור ההושבה עודכן ממכשיר אחר. טענו את הסידור העדכני לפני השמירה.', conflict: true}, {status: 409, headers});
    const sheetSync=await syncSeatingSheets();
    return Response.json({revision: updated.revision, updatedAt: now,sheetSync}, {headers});
  } catch { return Response.json({error: 'השמירה נכשלה. השינויים עדיין מוצגים כאן ואפשר לנסות שוב.'}, {status: 500, headers}); }
}
