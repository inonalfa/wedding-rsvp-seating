// Fictional demo data for the landing page. No real people. Names do not overlap the /demo fixtures.
export type Attendance = "yes" | "no" | "pending";
export type DemoGuest = { id: string; name: string; group: string; max: number; rsvp: Attendance; count: number; table: string | null; note: string };
export type DemoTable = { id: string; name: string; label: string; cap: number };

export const COUPLE = { a: "מאיה", b: "עומר", date: "2027-06-17", dateLong: "17 ביוני 2027", weekday: "יום חמישי", short: "17.06.2027", reception: "19:00", ceremony: "20:00", venue: "גן לדוגמה" } as const;

/** The guest who answers in the RSVP demo (section 3). */
export const RSVP_GUEST_ID = "g7";

export const TABLES: readonly DemoTable[] = Object.freeze([
  { id: "t1", name: "שולחן 1", label: "משפחה", cap: 10 },
  { id: "t2", name: "שולחן 2", label: "חברים", cap: 8 },
  { id: "t3", name: "שולחן 3", label: "עבודה", cap: 6 },
  { id: "t4", name: "שולחן 4", label: "ליד הרחבה", cap: 4 },
]);

export const GUESTS: readonly DemoGuest[] = Object.freeze(([
  { id: "g1", name: "רוני ואלון גבאי", group: "חברים", max: 2, rsvp: "yes", count: 2, table: "t2", note: "" },
  { id: "g2", name: "סבתא אסתר", group: "משפחה", max: 1, rsvp: "yes", count: 1, table: "t1", note: "מחכה לרקוד!" },
  { id: "g9", name: "משפחת נחום", group: "משפחה", max: 4, rsvp: "yes", count: 4, table: "t1", note: "" },
  { id: "g10", name: "תום ונעמה", group: "חברים", max: 2, rsvp: "yes", count: 2, table: "t2", note: "" },
  { id: "g11", name: "אבי ושירה", group: "חברים", max: 2, rsvp: "yes", count: 2, table: "t4", note: "" },
  { id: "g3", name: "משפחת אזולאי", group: "משפחה", max: 5, rsvp: "yes", count: 5, table: null, note: "" },
  { id: "g6", name: "דודה מרים ודוד שמעון", group: "משפחה", max: 2, rsvp: "yes", count: 2, table: null, note: "" },
  { id: "g12", name: "הדר מהסטודיו", group: "עבודה", max: 1, rsvp: "yes", count: 1, table: null, note: "" },
  { id: "g5", name: "שקד ועידו", group: "חברים", max: 2, rsvp: "no", count: 0, table: null, note: "נהיה בטיול, מזל טוב ענק" },
  { id: "g4", name: "ליאור בן דוד", group: "עבודה", max: 2, rsvp: "pending", count: 0, table: null, note: "" },
  { id: "g7", name: "יעל ברק", group: "חברים", max: 6, rsvp: "pending", count: 0, table: null, note: "" },
  { id: "g8", name: "צוות הסטודיו", group: "עבודה", max: 5, rsvp: "pending", count: 0, table: null, note: "" },
] as DemoGuest[]).map(g => Object.freeze(g)));

/** Most recent answers first (ids). */
export const RECENT: readonly string[] = Object.freeze(["g12", "g5", "g2", "g3"]);

export function counts(guests: readonly DemoGuest[]) {
  let yes = 0, no = 0, pending = 0, seated = 0;
  for (const g of guests) {
    if (g.rsvp === "yes") yes += g.count;
    else if (g.rsvp === "no") no++;
    else pending++;
    if (g.table && g.rsvp === "yes") seated += g.count;
  }
  return { invited: guests.length, yes, no, pending, seated };
}

export function used(tableId: string, guests: readonly DemoGuest[]) {
  return guests.reduce((sum, g) => sum + (g.table === tableId && g.rsvp === "yes" ? g.count : 0), 0);
}
