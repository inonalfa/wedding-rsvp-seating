import { eventConfig } from '@/lib/event-config';
import type { GeneratedInvite, InviteVisit, LegacyResponse, OverviewRow, RsvpResponse, Tab } from './AdminDashboard';

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: eventConfig.timeZone }).format(date);
}
function attendanceLabel(attendance: 'yes' | 'no' | null) {
  return attendance === 'yes' ? 'מגיעים' : attendance === 'no' ? 'לא מגיעים' : 'טרם השיבו';
}
function syncLabel(status: string) {
  return status === 'synced' ? 'סונכרן' : status === 'pending' ? 'ממתין לסנכרון' : status === 'not_configured' ? 'לא מוגדר' : status || '-';
}

type Props = {
  activeTab: Tab; setActiveTab: (tab: Tab) => void; search: string; setSearch: (search: string) => void;
  isRefreshing: boolean; refreshData: () => Promise<void>; overviewCount: number;
  responseCount: number; visitCount: number; inviteCount: number; legacyCount: number;
  overview: OverviewRow[]; responses: RsvpResponse[]; visits: InviteVisit[]; invites: GeneratedInvite[]; legacy: LegacyResponse[];
};
export default function AdminDataSection(props: Props) {
  const { activeTab, setActiveTab, search, setSearch, isRefreshing, refreshData, overviewCount, responseCount, visitCount, inviteCount, legacyCount, overview, responses, visits, invites, legacy } = props;
  const empty = (activeTab === 'overview' && !overview.length) || (activeTab === 'responses' && !responses.length) || (activeTab === 'visits' && !visits.length) || (activeTab === 'invites' && !invites.length) || (activeTab === 'legacy' && !legacy.length);
  return <section className="admin-data-section">
    <div className="admin-data-heading"><div><p className="admin-kicker">הדאטאבייס</p><h2>נתוני האורחים</h2></div><div className="admin-data-actions"><label className="admin-search"><span aria-hidden="true">⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="חיפוש לפי שם או מזהה" /></label><button type="button" onClick={() => void refreshData()} disabled={isRefreshing}>{isRefreshing ? 'מרענן...' : 'רענון נתונים'}</button></div></div>
    <div className="admin-tabs" role="tablist" aria-label="טבלאות נתונים">{([
      ['overview', 'תמונה מלאה', overviewCount], ['responses', 'אישורי הגעה', responseCount], ['visits', 'פתיחות', visitCount], ['invites', 'קישורים שנוצרו', inviteCount], ['legacy', 'נתונים ישנים', legacyCount],
    ] as Array<[Tab, string, number]>).map(([tab, label, count]) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{label}<span>{count}</span></button>)}</div>
    <div className="admin-table-wrap">
      {activeTab === 'overview' && <table><thead><tr><th>מוזמן</th><th>מיקום בגיליון</th><th>פתיחת קישור</th><th>אישור הגעה</th><th>השם שנשלח</th><th>סנכרון</th></tr></thead><tbody>{overview.map(row => <tr key={row.inviteId}><td><strong>{row.firstName || row.fullName || 'ללא שם'}</strong><code dir="ltr">{row.inviteId}</code></td><td>{row.sourceSheet}<small>{row.sourceRow ? `שורה מקורית ${row.sourceRow}` : 'מזהה קבוע'}</small></td><td><span className={`admin-status ${row.opened ? 'positive' : 'muted'}`}>{row.opened ? 'נפתח' : 'לא נפתח'}</span><small>{row.opened ? `${row.openCount} פתיחות · ${formatDate(row.firstOpenedAt)}` : 'אין פתיחה מתועדת'}</small></td><td><span className={`admin-status ${row.attendance === 'yes' ? 'positive' : row.attendance === 'no' ? 'negative' : 'muted'}`}>{attendanceLabel(row.attendance)}</span><small>{row.attendance === 'yes' ? `${row.guestCount} מגיעים` : row.message || '-'}</small></td><td>{row.fullName || '-'}</td><td><span className={`admin-status ${row.syncStatus === 'synced' ? 'positive' : 'muted'}`}>{syncLabel(row.syncStatus)}</span></td></tr>)}</tbody></table>}
      {activeTab === 'responses' && <table><thead><tr><th>ID</th><th>מוזמן</th><th>תשובה</th><th>הודעה</th><th>מקור</th><th>סנכרון</th><th>עודכן</th></tr></thead><tbody>{responses.map(row => <tr key={row.id}><td>{row.id}<code dir="ltr">{row.inviteId || '-'}</code></td><td><strong>{row.fullName}</strong><small>{row.firstName || row.invitedName || '-'}</small></td><td><span className={`admin-status ${row.attendance === 'yes' ? 'positive' : 'negative'}`}>{attendanceLabel(row.attendance)}</span><small>{row.attendance === 'yes' ? `${row.guestCount} משתתפים` : '0 משתתפים'}</small></td><td>{row.message || '-'}</td><td>{row.sourceSheet || '-'}<small>{row.sourceRow ? `שורה מקורית ${row.sourceRow}` : 'איתור לפי מזהה'}</small></td><td>{syncLabel(row.syncStatus)}<small>{row.syncError || ''}</small></td><td>{formatDate(row.updatedAt)}</td></tr>)}</tbody></table>}
      {activeTab === 'visits' && <table><thead><tr><th>ID</th><th>מוזמן</th><th>מזהה</th><th>מקור</th><th>פתיחה ראשונה</th><th>פתיחה אחרונה</th><th>כמות</th><th>סנכרון</th></tr></thead><tbody>{visits.map(row => <tr key={row.id}><td>{row.id}</td><td><strong>{row.firstName}</strong></td><td><code dir="ltr">{row.inviteId}</code></td><td>{row.sourceSheet}<small>{row.sourceRow ? `שורה מקורית ${row.sourceRow}` : 'איתור לפי מזהה'}</small></td><td>{formatDate(row.firstOpenedAt)}</td><td>{formatDate(row.lastOpenedAt)}</td><td>{row.openCount}</td><td>{syncLabel(row.syncStatus)}<small>{row.syncError || ''}</small></td></tr>)}</tbody></table>}
      {activeTab === 'invites' && <table><thead><tr><th>ID</th><th>מוזמן</th><th>מזהה</th><th>מקור</th><th>קישור</th><th>נוצר על ידי</th><th>עודכן</th></tr></thead><tbody>{invites.map(row => <tr key={row.id}><td>{row.id}</td><td><strong>{row.firstName}</strong></td><td><code dir="ltr">{row.inviteId}</code></td><td>{row.sourceSheet}<small>{row.sourceRow ? `שורה מקורית ${row.sourceRow}` : 'מזהה קבוע'}</small></td><td><a className="admin-table-link" href={row.shortLink} target="_blank" rel="noreferrer">פתיחת קישור ↗</a></td><td>{row.createdBy}</td><td>{formatDate(row.updatedAt)}</td></tr>)}</tbody></table>}
      {activeTab === 'legacy' && <table><thead><tr><th>ID</th><th>שם</th><th>טלפון</th><th>תשובה</th><th>אורחים</th><th>הודעה</th><th>נשלח</th><th>עודכן</th></tr></thead><tbody>{legacy.map(row => <tr key={row.id}><td>{row.id}</td><td><strong>{row.fullName}</strong></td><td dir="ltr">{row.phone}</td><td>{attendanceLabel(row.attendance)}</td><td>{row.guestCount}</td><td>{row.message || '-'}</td><td>{formatDate(row.submittedAt)}</td><td>{formatDate(row.updatedAt)}</td></tr>)}</tbody></table>}
      {empty && <div className="admin-empty-state"><span aria-hidden="true">◇</span><strong>אין נתונים להצגה</strong><p>{search ? 'לא נמצאו תוצאות לחיפוש הזה.' : 'הטבלה תתמלא כאשר יתקבלו נתונים.'}</p></div>}
    </div><p className="admin-data-footnote">דף זה מציג את הנתונים השמורים בדאטאבייס של האתר. רשימת המוזמנים המלאה, כולל מי שטרם פתח קישור, נשמרת ב-Google Sheets.</p>
  </section>;
}
