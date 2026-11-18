import { eventConfig } from './event-config';
import type { SheetRange, SeatingPlan } from './seating-model';
import type { InviteDetails } from './invite-token';
const header = ['קטגוריה','שם פרטי','שם משפחה','פלאפון','מספר מוזמנים','מקושר ל','מספר אורח','קישור אישי קצר','מזהה הזמנה','סטטוס הגעה','מספר מאשרים','הערות','','','','','','','','מספר שולחן'];
function row(category: string, first: string, last: string, id: string, number: number, count: number, confirmed: boolean, table: number | null): unknown[] {
  const values: unknown[] = Array(20).fill('');
  Object.assign(values, { 0: category, 1: first, 2: last, 4: count, 6: number, 8: id, 9: confirmed ? 'מאשרים' : '', 10: confirmed ? count : '', 19: table ?? '' });
  return values;
}
/** Entirely fictional records; use a separate D1 database for demo mode. */
export function demoGuestRanges(): SheetRange[] {
  return [
    { range: `'${eventConfig.sheetNames[0]}'!A1:T4`, values: [header,row('משפחה','נועה','לוי','demo-a-1',1,2,true,1),row('חברים','איתי','כהן','demo-a-2',2,3,true,2),row('עבודה','מיה','ברק','demo-a-3',3,1,false,null)] },
    { range: `'${eventConfig.sheetNames[1]}'!A1:T4`, values: [header,row('משפחה','רוני','שלום','demo-b-1',4,2,true,1),row('חברים','טל','רז','demo-b-2',5,2,true,2),row('עבודה','אור','רון','demo-b-3',6,1,false,null)] },
  ];
}
/** The fictional invitation exposed by the public demo homepage. */
export function demoInviteDetails(): InviteDetails {
  return {
    inviteId: 'demo-a-1',
    firstName: 'נועה',
    fullName: 'נועה לוי',
    maxGuests: 2,
    sourceSheet: eventConfig.sheetNames[0],
    sourceRow: 2,
  };
}
export function demoSeatingPlan(): SeatingPlan { return { tables: [
  {id:'demo-table-1',number:1,name:'משפחה',capacity:eventConfig.seating.standardCapacity,guests:['demo-a-1','demo-b-1']},
  {id:'demo-table-2',number:2,name:'חברים',capacity:eventConfig.seating.standardCapacity,guests:['demo-a-2','demo-b-2']},
  {id:'demo-table-3',number:3,name:'עבודה',capacity:eventConfig.seating.standardCapacity,guests:[]},
] }; }
