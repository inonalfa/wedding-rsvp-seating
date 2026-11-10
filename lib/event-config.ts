/** Fictional example event. Replace with your own details. */
export const eventConfig = {
  hosts: ['דנה', 'יואב'] as const,
  date: '2027-06-10',
  start: '2027-06-10T19:30:00+03:00',
  end: '2027-06-11T01:00:00+03:00',
  timeZone: 'Asia/Jerusalem',
  venue: 'גן האירועים',
  address: 'תל אביב',
  parents: ['משפחת הכלה', 'משפחת החתן'] as const,
  sheetNames: ['מוזמנים דנה', 'מוזמנים יואב'] as const,
  specialTableNumber: 2,
} as const;
export const eventHosts = eventConfig.hosts.join(' ו');
export const eventDate = eventConfig.date.split('-').reverse().join('.');
export const eventDateSpaced = eventDate.split('.').join(' . ');
export const eventMonth = new Intl.DateTimeFormat('en-US',{month:'long',timeZone:eventConfig.timeZone}).format(new Date(eventConfig.start)).toUpperCase();
export const eventWeekday = new Intl.DateTimeFormat('he-IL',{weekday:'long',timeZone:eventConfig.timeZone}).format(new Date(eventConfig.start));
export const eventMapUrl = `https://www.google.com/maps?q=${encodeURIComponent(eventConfig.address)}&output=embed`;
export const eventWazeUrl = `https://waze.com/ul?q=${encodeURIComponent(eventConfig.address)}&navigate=yes`;
