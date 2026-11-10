import { getD1Binding } from '@/db';
import { getWeddingRuntimeConfig } from '@/lib/runtime-config';
import { parseGuests, type SheetRange, type SeatingPlan } from '@/lib/seating-model';
import {demoGuestRanges,demoSeatingPlan} from '@/lib/demo-data';

export async function loadSeatingData(refresh = false) {
  const db = getD1Binding();
  const cached = await db.prepare('SELECT document, fetched_at FROM seating_sources WHERE id = 1').first<{document: string; fetched_at: string}>();
  const demoMode=!!getWeddingRuntimeConfig().demoMode;
  let ranges: SheetRange[] = cached ? JSON.parse(cached.document) : [];
  let fetchedAt = cached?.fetched_at ?? null;
  let warning: string | null = null;
  if (demoMode || refresh || !cached || Date.now() - Date.parse(cached.fetched_at) > 300_000) {
    try {
      if (demoMode) ranges = demoGuestRanges();
      else {
      const url = getWeddingRuntimeConfig().seatingSheetsWebhookUrl;
      if (!url) throw new Error('missing source');
      const response = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}', signal: AbortSignal.timeout(25_000) });
      if (!response.ok) throw new Error('source unavailable');
      const body = await response.json() as {valueRanges?: SheetRange[]};
      if (!Array.isArray(body.valueRanges)) throw new Error('invalid source');
      parseGuests(body.valueRanges);
      ranges = body.valueRanges;
      }
      fetchedAt = new Date().toISOString();
      await db.prepare('INSERT INTO seating_sources (id, document, fetched_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document, fetched_at = excluded.fetched_at').bind(JSON.stringify(ranges), fetchedAt).run();
    } catch (error) {
      console.error('Seating source refresh failed', error instanceof Error ? error.message : 'unknown');
      if (!cached) throw new Error('לא הצלחנו לטעון את המוזמנים מהגיליונות. נסו לרענן בעוד רגע.');
      warning = 'הרענון מהגיליונות נכשל. מוצגים הנתונים מהעדכון האחרון; סידורי ההושבה נשמרו.';
    }
  }
  // Local responses cover the interval before Make updates the Sheets read source.
  const local = await db.prepare("SELECT r.invite_id, r.attendance, r.guest_count, r.updated_at, r.sync_status, t.call_status FROM rsvp_responses r LEFT JOIN call_tasks t ON t.invite_id=r.invite_id WHERE r.invite_id IS NOT NULL").all<{invite_id:string;attendance:string;guest_count:number;updated_at:string;sync_status:string;call_status:string|null}>();
  const responses = new Map(local.results.map(r=>[r.invite_id,r]));
  const effectiveRanges = structuredClone(ranges);
  for (const range of effectiveRanges) for (const [i,row] of (range.values??[]).entries()) {
    if (i===0) continue; const r=responses.get(String(row[8]??'').trim());
    if(r && (r.sync_status !== 'synced' || r.call_status==='yes' || r.call_status==='no' || Date.parse(r.updated_at.replace(' ','T')+(r.updated_at.includes('T')?'':'Z'))>=Date.parse(fetchedAt??'1970-01-01'))) {row[9]=r.attendance==='yes'?'מאשרים':'לא מגיעים';row[10]=r.guest_count;}
  }
  const guests = parseGuests(effectiveRanges);
  let saved = await db.prepare('SELECT document, revision, updated_at FROM seating_plans WHERE id = 1').first<{document: string; revision: number; updated_at: string}>();
  if (demoMode && saved && !(JSON.parse(saved.document) as SeatingPlan).tables.every(table=>table.id.startsWith('demo-table-'))) throw new Error('Demo mode requires an isolated database');
  if (demoMode && !saved) {
    await db.prepare('INSERT INTO seating_plans (id, document, revision, updated_at) VALUES (1, ?, 1, ?) ON CONFLICT(id) DO NOTHING').bind(JSON.stringify(demoSeatingPlan()),new Date().toISOString()).run();
    saved=await db.prepare('SELECT document, revision, updated_at FROM seating_plans WHERE id = 1').first<{document:string;revision:number;updated_at:string}>();
  }
  return { guests, plan: saved ? JSON.parse(saved.document) as SeatingPlan : {tables: []}, revision: saved?.revision ?? 0, updatedAt: saved?.updated_at ?? null, fetchedAt, warning };
}
