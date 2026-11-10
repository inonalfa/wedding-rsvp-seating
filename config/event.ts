/** Fictional example. Replace these values before using the project for an event. */
export type EventConfig = {
  hosts: readonly [string, string];
  monogram: readonly [string, string];
  date: string;
  start: string;
  end: string;
  timeZone: string;
  venue: string;
  address: string;
  contactEmail: string;
  previewGuestName: string;
  parents: readonly [string, string];
  sheetNames: readonly [string, string];
  inviteIdPrefixes: readonly [string, string];
  legacyInviteSides: readonly [string, string];
  seating: { standardCapacity: number; reservedTableNumber: number; allowReservedTableOverflow: boolean };
};

export const eventConfig = {
  hosts: ['דנה', 'יואב'],
  monogram: ['D', 'Y'],
  date: '2027-06-10',
  start: '2027-06-10T19:30:00+03:00',
  end: '2027-06-11T01:00:00+03:00',
  timeZone: 'Asia/Jerusalem',
  venue: 'גן האירועים',
  address: 'תל אביב',
  contactEmail: 'organizers@example.com',
  previewGuestName: 'דנה ישראלי',
  parents: ['משפחת הכלה', 'משפחת החתן'],
  sheetNames: ['מוזמנים דנה', 'מוזמנים יואב'],
  inviteIdPrefixes: ['o', 'y'],
  legacyInviteSides: ['dana', 'yoav'],
  seating: { standardCapacity: 12, reservedTableNumber: 2, allowReservedTableOverflow: true },
} as const satisfies EventConfig;
