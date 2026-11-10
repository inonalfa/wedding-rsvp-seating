import {eventConfig,eventHosts} from './event-config';
import { SHEETS, type SheetRange } from './seating-model';
export type CallGuest = { id: string; name: string; firstName: string; phone: string; linkedTo: string; side: string; sourceSheet: string; sourceRow: number; attendance: 'yes'|'no'|'pending'; count: number; callerId: string|null; callStatus: string|null; retryAt: string|null; version: number; syncPending: boolean; notes: string; vegetarian: boolean };
export type Caller = { id: string; name: string; shareToken?: string };
export type CallAttempt = { id: string; inviteId: string; callerName: string; phone: string; clickedAt: string };
export const DEFAULT_CALL_OPENING = `היי {{שם פרטי אורח}} מדבר/ת {{שם מתקשר}}, אני מתקשר/ת כדי לבדוק האם תגיעו לחתונה של ${eventHosts} ואם כן כמה תהיו?`;
export function renderCallOpening(script: string, firstName: string, callerName: string) {
  return script.replace(/{{\s*(שם פרטי אורח|שם מתקשר)\s*}}/g, (_,key:string)=>key==='שם פרטי אורח'?firstName:callerName);
}
export type CallsData = {openingScript: string; scriptRevision: number; callHistory: CallAttempt[]; guests: CallGuest[]; callers: Caller[]; callerName?: string; warning: string|null; fetchedAt: string|null };
const text = (v: unknown) => String(v ?? '').trim();
export function normalizedPhone(v: unknown) {
  let digits = text(v).replace(/\D/g, '');
  if (digits.startsWith('00972')) digits = digits.slice(2);
  if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  if (/^5\d{8}$/.test(digits)) digits = '0' + digits;
  return digits;
}
export function attendanceFromSheet(v: unknown): CallGuest['attendance'] {
  const status = text(v).toLowerCase();
  if (['מאשרים','מגיעים','מאשר','מאשרת','מגיע','מגיעה','yes'].includes(status)) return 'yes';
  if (['לא מגיעים','לא מגיע','לא מגיעה','no'].includes(status)) return 'no';
  return 'pending';
}
export function splitCallNotes(message: string) {
  const lines=message.split(/\r?\n/);
  return {notes:lines.filter(line=>line.trim()!=='מנה צמחונית').join('\n').trim(),vegetarian:lines.some(line=>line.trim()==='מנה צמחונית')};
}
export function composeCallNotes(notes: string, vegetarian: boolean) {
  return [splitCallNotes(notes).notes,vegetarian?'מנה צמחונית':''].filter(Boolean).join('\n');
}
export function parseCallGuests(ranges: SheetRange[]): CallGuest[] {
  const guests: CallGuest[] = []; const ids = new Set<string>();
  for (const sheet of SHEETS) {
    const range = ranges.find(r => r.range.startsWith(`'${sheet}'!`) || r.range.startsWith(`${sheet}!`));
    if (!range?.values?.length) throw new Error('חסרים נתונים בגיליונות המוזמנים');
    const header = range.values[0];
    if (text(header[1]) !== 'שם פרטי' || text(header[10]) !== 'מספר מאשרים') throw new Error('מבנה גיליון המוזמנים השתנה');
    const linkedColumn = header.findIndex(v => text(v) === 'מקושר ל');
    const notesColumn = header.findIndex(v => ['הערות','הערה'].includes(text(v)));
    for (let i = 1; i < range.values.length; i++) {
      const row = range.values[i]; const name = [text(row[1]),text(row[2])].filter(Boolean).join(' ');
      if (!name) continue;
      const stableId = text(row[8]); const id = stableId || `${sheet}:row:${i+1}`;
      if (ids.has(id)) throw new Error('נמצאו מזהי הזמנה כפולים בגיליון'); ids.add(id);
      const attendance = attendanceFromSheet(row[9]);
      const count = Number(attendance === 'yes' ? row[10] : row[4]);
      guests.push({...splitCallNotes(notesColumn<0?'':text(row[notesColumn])),id,name,firstName:text(row[1]),phone:normalizedPhone(row[3]),linkedTo:text(row[linkedColumn < 0 ? 5 : linkedColumn]),side:sheet === SHEETS[0]?eventConfig.hosts[0]:eventConfig.hosts[1],sourceSheet:sheet,sourceRow:i+1,attendance,count:Number.isSafeInteger(count)&&count>0?count:1,callerId:null,callStatus:null,retryAt:null,version:0,syncPending:false});
    }
  }
  return guests;
}
export function isWaitingForCall(guest: CallGuest, now = Date.now()) {
  return guest.attendance === 'pending' && !isCoolingDown(guest,now) && !isFollowupScheduled(guest,now);
}
export function isCoolingDown(guest: CallGuest, now = Date.now()) {
  return guest.attendance === 'pending' && guest.callStatus === 'no_answer' && !!guest.retryAt && Date.parse(guest.retryAt) > now;
}

export function israelDateKey(now = Date.now()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:eventConfig.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value??'';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validFollowupDate(value:unknown, now = Date.now()): value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<israelDateKey(now))return false;
  const timestamp=Date.parse(value+'T12:00:00Z');
  return Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value;
}
export function isFollowupScheduled(guest:CallGuest, now = Date.now()) {
  return guest.attendance==='pending'&&guest.callStatus==='follow_up'&&!!guest.retryAt&&guest.retryAt>israelDateKey(now);
}
