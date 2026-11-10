import { eventConfig, eventHosts } from '@/lib/event-config';
function escapeIcs(value: string) { return value.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
const utc = (value: string) => new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
export async function GET() {
  const lines = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Wedding RSVP//Event//HE','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    `UID:wedding-${eventConfig.date}@example.invalid`, `DTSTAMP:${utc(eventConfig.start)}`,
    `DTSTART:${utc(eventConfig.start)}`, `DTEND:${utc(eventConfig.end)}`,
    `SUMMARY:${escapeIcs(`החתונה של ${eventHosts}`)}`,
    `DESCRIPTION:${escapeIcs('קבלת פנים וחגיגה')}`,
    `LOCATION:${escapeIcs(`${eventConfig.venue}, ${eventConfig.address}`)}`,
    'END:VEVENT','END:VCALENDAR','',
  ];
  return new Response(lines.join('\r\n'),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename=wedding.ics','Cache-Control':'public, max-age=86400'}});
}
