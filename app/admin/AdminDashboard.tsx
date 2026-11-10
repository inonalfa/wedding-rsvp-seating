"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

type RsvpResponse = {
  id: number;
  inviteId: string | null;
  firstName: string;
  invitedName: string;
  fullName: string;
  phone: string | null;
  attendance: "yes" | "no";
  guestCount: number;
  maxGuests: number;
  message: string;
  sourceSheet: string | null;
  sourceRow: number | null;
  syncStatus: "pending" | "synced" | "not_configured";
  syncError: string;
  submittedAt: string;
  updatedAt: string;
};

type InviteVisit = {
  id: number;
  inviteId: string;
  firstName: string;
  sourceSheet: string;
  sourceRow: number | null;
  firstOpenedAt: string;
  lastOpenedAt: string;
  openCount: number;
  syncStatus: "pending" | "synced" | "not_configured";
  syncError: string;
};

type GeneratedInvite = {
  id: number;
  inviteId: string;
  firstName: string;
  maxGuests: number;
  sourceSheet: string;
  sourceRow: number | null;
  shortLink: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type LegacyResponse = {
  id: number;
  fullName: string;
  phone: string;
  attendance: "yes" | "no";
  guestCount: number;
  message: string;
  submittedAt: string;
  updatedAt: string;
};

type AdminData = {
  responses: RsvpResponse[];
  visits: InviteVisit[];
  invites: GeneratedInvite[];
  legacyResponses: LegacyResponse[];
  exclusions: { token: string; createdAt: string }[];
};

type Tab = "overview" | "responses" | "visits" | "invites" | "legacy";

type OverviewRow = {
  inviteId: string;
  firstName: string;
  sourceSheet: string;
  sourceRow: number | null;
  maxGuests: number | null;
  opened: boolean;
  openCount: number;
  firstOpenedAt: string;
  attendance: "yes" | "no" | null;
  guestCount: number | null;
  fullName: string;
  message: string;
  syncStatus: string;
  link: string;
  updatedAt: string;
};


function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

function attendanceLabel(attendance: "yes" | "no" | null) {
  if (attendance === "yes") return "מגיעים";
  if (attendance === "no") return "לא מגיעים";
  return "טרם השיבו";
}

function syncLabel(status: string) {
  if (status === "synced") return "סונכרן";
  if (status === "pending") return "ממתין לסנכרון";
  if (status === "not_configured") return "לא מוגדר";
  return status || "-";
}

function includesSearch(values: Array<string | number | null | undefined>, search: string) {
  const query = search.trim().toLocaleLowerCase("he");
  if (!query) return true;
  return values.some((value) => String(value ?? "").toLocaleLowerCase("he").includes(query));
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function AdminDashboard({
  initialData,
  adminName,
  adminEmail,
  signOutPath,
}: {
  initialData: AdminData;
  adminName: string;
  adminEmail: string;
  signOutPath: string;
}) {
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [createStatus, setCreateStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [createError, setCreateError] = useState("");
  const [newInvite, setNewInvite] = useState<{ inviteId: string; shortLink: string } | null>(null);
  const [copied, setCopied] = useState<"link" | "id" | null>(null);
  const [exclusionInput, setExclusionInput] = useState("");
  const [exclusionPending, setExclusionPending] = useState(false);
  const [exclusionError, setExclusionError] = useState("");

  const overviewRows = useMemo(() => {
    const rows = new Map<string, OverviewRow>();
    for (const invite of data.invites) {
      rows.set(invite.inviteId, {
        inviteId: invite.inviteId,
        firstName: invite.firstName,
        sourceSheet: invite.sourceSheet,
        sourceRow: invite.sourceRow,
        maxGuests: invite.maxGuests,
        opened: false,
        openCount: 0,
        firstOpenedAt: "",
        attendance: null,
        guestCount: null,
        fullName: "",
        message: "",
        syncStatus: "",
        link: invite.shortLink,
        updatedAt: invite.updatedAt,
      });
    }
    for (const visit of data.visits) {
      const current = rows.get(visit.inviteId);
      rows.set(visit.inviteId, {
        inviteId: visit.inviteId,
        firstName: current?.firstName || visit.firstName,
        sourceSheet: current?.sourceSheet || visit.sourceSheet,
        sourceRow: current?.sourceRow ?? visit.sourceRow,
        maxGuests: current?.maxGuests ?? null,
        opened: true,
        openCount: visit.openCount,
        firstOpenedAt: visit.firstOpenedAt,
        attendance: current?.attendance ?? null,
        guestCount: current?.guestCount ?? null,
        fullName: current?.fullName || "",
        message: current?.message || "",
        syncStatus: visit.syncStatus,
        link: current?.link || "",
        updatedAt: visit.lastOpenedAt,
      });
    }
    for (const response of data.responses) {
      const key = response.inviteId || `response:${response.id}`;
      const current = rows.get(key);
      rows.set(key, {
        inviteId: response.inviteId || "ללא מזהה",
        firstName: current?.firstName || response.firstName || response.invitedName || response.fullName,
        sourceSheet: current?.sourceSheet || response.sourceSheet || "-",
        sourceRow: current?.sourceRow ?? response.sourceRow,
        maxGuests: current?.maxGuests ?? response.maxGuests,
        opened: current?.opened ?? false,
        openCount: current?.openCount ?? 0,
        firstOpenedAt: current?.firstOpenedAt || "",
        attendance: response.attendance,
        guestCount: response.guestCount,
        fullName: response.fullName,
        message: response.message,
        syncStatus: response.syncStatus,
        link: current?.link || "",
        updatedAt: response.updatedAt,
      });
    }
    return [...rows.values()].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [data]);

  const filteredOverview = overviewRows.filter((row) =>
    includesSearch([row.firstName, row.fullName, row.inviteId, row.sourceSheet, row.sourceRow], search),
  );
  const filteredResponses = data.responses.filter((row) =>
    includesSearch([row.firstName, row.fullName, row.inviteId, row.sourceSheet, row.sourceRow, row.message], search),
  );
  const filteredVisits = data.visits.filter((row) =>
    includesSearch([row.firstName, row.inviteId, row.sourceSheet, row.sourceRow], search),
  );
  const filteredInvites = data.invites.filter((row) =>
    includesSearch([row.firstName, row.inviteId, row.sourceSheet, row.sourceRow], search),
  );
  const filteredLegacy = data.legacyResponses.filter((row) =>
    includesSearch([row.fullName, row.phone, row.message], search),
  );

  const stats = useMemo(() => ({
    coming: data.responses.filter((row) => row.attendance === "yes").length,
    guests: data.responses.reduce((sum, row) => sum + (row.attendance === "yes" ? row.guestCount : 0), 0),
    declined: data.responses.filter((row) => row.attendance === "no").length,
    opened: data.visits.length,
  }), [data]);

  async function refreshData() {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/data", { cache: "no-store" });
      if (!response.ok) throw new Error("לא הצלחנו לרענן את הנתונים");
      setData((await response.json()) as AdminData);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleCreateInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateStatus("sending");
    setCreateError("");
    setNewInvite(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"),
          sourceSheet: form.get("sourceSheet"),
        }),
      });
      const result = (await response.json()) as { inviteId?: string; shortLink?: string; error?: string };
      if (!response.ok || !result.inviteId || !result.shortLink) {
        throw new Error(result.error || "לא הצלחנו ליצור את הקישור");
      }
      setNewInvite({ inviteId: result.inviteId, shortLink: result.shortLink });
      setCreateStatus("success");
      await refreshData();
    } catch (error) {
      setCreateStatus("error");
      setCreateError(error instanceof Error ? error.message : "לא הצלחנו ליצור את הקישור");
    }
  }

  async function handleCopy(value: string, kind: "link" | "id") {
    await copyText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
  }

  async function changeExclusion(method: "POST" | "DELETE", token: string) {
    setExclusionPending(true);
    setExclusionError("");
    try {
      const response = await fetch("/api/admin/adults-note-exclusions", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "לא הצלחנו לשמור את השינוי");
      await refreshData();
      if (method === "POST") setExclusionInput("");
    } catch (error) {
      setExclusionError(error instanceof Error ? error.message : "לא הצלחנו לשמור את השינוי");
    } finally {
      setExclusionPending(false);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <Link className="admin-monogram" href="/" aria-label="חזרה לאתר">D <i>&amp;</i> Y</Link>
          <span className="admin-divider" />
          <span>ניהול אישורי הגעה</span>
        </div>
        <div className="admin-account">
          <nav className="admin-page-links" aria-label="כלי תכנון החתונה"><Link href="/admin/reconcile">סנכרון מהשיטס</Link><Link href="/admin/calls">ניהול שיחות</Link><Link href="/admin/seating">סידורי הושבה</Link><Link href="/admin/seating/sketch">סקיצת האולם</Link></nav>
          <span>{adminName}</span>
          <small>{adminEmail}</small>
          <a href={signOutPath}>{signOutPath === "/" ? "חזרה לאתר" : "התנתקות"}</a>
        </div>
      </header>

      <section className="admin-hero">
        <div>
          <p className="admin-kicker">10.06.2027</p>
          <h1>מרכז השליטה של החתונה</h1>
          <p>יוצרים קישורים אישיים, עוקבים אחרי פתיחות ורואים את כל אישורי ההגעה במקום אחד.</p>
        </div>
      </section>

      <section className="admin-stats" aria-label="נתונים מרכזיים">
        <article><span>אישרו הגעה</span><strong>{stats.coming}</strong><small>משיבים</small></article>
        <article><span>סה״כ מגיעים</span><strong>{stats.guests}</strong><small>אורחים</small></article>
        <article><span>לא יגיעו</span><strong>{stats.declined}</strong><small>משיבים</small></article>
        <article><span>פתחו קישור</span><strong>{stats.opened}</strong><small>הזמנות ייחודיות</small></article>
      </section>

      <section className="admin-workspace">
        <article className="admin-create-card">
          <div className="admin-card-heading">
            <span className="admin-step-number">01</span>
            <div><p className="admin-kicker">מוזמן חדש</p><h2>יצירת קישור אישי</h2></div>
          </div>
          <p className="admin-card-intro">מוסיפים את המוזמן לגיליון ויוצרים עבורו מזהה קבוע. כל מוזמן יוכל לבחור בעצמו כמה משתתפים מגיעים, ללא מכסה שהוגדרה מראש.</p>
          <form className="admin-create-form" onSubmit={handleCreateInvite}>
            <label className="admin-field admin-field-wide">
              <span>שם פרטי שיופיע באתר</span>
              <input name="firstName" type="text" placeholder="לדוגמה: מאיה" minLength={2} maxLength={80} required />
            </label>
            <label className="admin-field">
              <span>לשונית בגיליון</span>
              <select name="sourceSheet" defaultValue="מוזמנים דנה" required>
                <option>מוזמנים דנה</option>
                <option>מוזמנים יואב</option>
              </select>
            </label>
            <button className="admin-create-button" type="submit" disabled={createStatus === "sending"}>
              {createStatus === "sending" ? "יוצר קישור..." : "יצירת קישור קצר"}<span aria-hidden="true">←</span>
            </button>
          </form>
          {createStatus === "error" && <p className="admin-form-error" role="alert">{createError}</p>}
          {newInvite && (
            <div className="admin-created-result" role="status">
              <div className="admin-result-title"><span aria-hidden="true">✓</span><strong>הקישור מוכן</strong></div>
              <div className="admin-result-row">
                <div><small>עמודה H - קישור</small><code dir="ltr">{newInvite.shortLink}</code></div>
                <button type="button" onClick={() => handleCopy(newInvite.shortLink, "link")}>{copied === "link" ? "הועתק" : "העתקה"}</button>
              </div>
              <div className="admin-result-row">
                <div><small>עמודה I - מזהה</small><code dir="ltr">{newInvite.inviteId}</code></div>
                <button type="button" onClick={() => handleCopy(newInvite.inviteId, "id")}>{copied === "id" ? "הועתק" : "העתקה"}</button>
              </div>
              <p>יש להדביק את הקישור בעמודה H ואת המזהה בעמודה I באותה שורה בגיליון.</p>
            </div>
          )}
        </article>

        <aside className="admin-guide-card">
          <p className="admin-kicker">תהליך נכון</p>
          <h2>ממוזמן חדש לקישור מוכן</h2>
          <ol>
            <li><span>1</span><div><strong>מוסיפים שורה בגיליון</strong><small>ממלאים את פרטי המוזמן ללא הגבלת משתתפים.</small></div></li>
            <li><span>2</span><div><strong>יוצרים כאן את הקישור</strong><small>מזינים שם פרטי ובוחרים את הלשונית.</small></div></li>
            <li><span>3</span><div><strong>מדביקים H ו-I</strong><small>הקישור בעמודה H והמזהה בעמודה I.</small></div></li>
            <li><span>4</span><div><strong>שולחים ועוקבים</strong><small>פתיחות ואישורים יופיעו למטה ויסונכרנו דרך Make.</small></div></li>
          </ol>
          <div className="admin-security-note"><span aria-hidden="true">●</span><p><strong>המידע מאובטח</strong><br />העמוד זמין רק לחשבון המנהל שאושר מראש.</p></div>
        </aside>
      </section>

      <section className="admin-exclusions" aria-labelledby="exclusions-title">
        <div className="admin-card-heading"><span className="admin-step-number">02</span><div><p className="admin-kicker">התאמה להזמנה</p><h2 id="exclusions-title">החרגת הודעת מבוגרים בלבד</h2></div></div>
        <p className="admin-card-intro">בקישורים שברשימה הזו, ההודעה על אירוע למבוגרים בלבד לא תופיע. אפשר להדביק קישור אישי מלא או את המזהה שבסופו.</p>
        <form className="admin-exclusion-form" onSubmit={event => { event.preventDefault(); void changeExclusion("POST", exclusionInput); }}>
          <label className="admin-field"><span>קישור אישי או מזהה הקישור</span><input dir="ltr" value={exclusionInput} onChange={event => setExclusionInput(event.target.value)} placeholder="https://.../i/..." required /></label>
          <button className="admin-create-button" type="submit" disabled={exclusionPending || !exclusionInput.trim()}>{exclusionPending ? "שומר..." : "הוספה לרשימה"}</button>
        </form>
        {exclusionError && <p className="admin-form-error" role="alert">{exclusionError}</p>}
        <div className="admin-exclusion-list" aria-live="polite">
          <h3>קישורים מוחרגים ({data.exclusions.length})</h3>
          {data.exclusions.length === 0 ? <p>אין עדיין קישורים מוחרגים.</p> : data.exclusions.map(row => <div className="admin-exclusion-row" key={row.token}><code dir="ltr" title={row.token}>{row.token}</code><button type="button" disabled={exclusionPending} onClick={() => void changeExclusion("DELETE", row.token)} aria-label={`הסרת המזהה ${row.token} מהרשימה`}>הסרה</button></div>)}
        </div>
      </section>

      <section className="admin-data-section">
        <div className="admin-data-heading">
          <div><p className="admin-kicker">הדאטאבייס</p><h2>נתוני האורחים</h2></div>
          <div className="admin-data-actions">
            <label className="admin-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש לפי שם או מזהה" /></label>
            <button type="button" onClick={refreshData} disabled={isRefreshing}>{isRefreshing ? "מרענן..." : "רענון נתונים"}</button>
          </div>
        </div>

        <div className="admin-tabs" role="tablist" aria-label="טבלאות נתונים">
          {([
            ["overview", "תמונה מלאה", overviewRows.length],
            ["responses", "אישורי הגעה", data.responses.length],
            ["visits", "פתיחות", data.visits.length],
            ["invites", "קישורים שנוצרו", data.invites.length],
            ["legacy", "נתונים ישנים", data.legacyResponses.length],
          ] as Array<[Tab, string, number]>).map(([tab, label, count]) => (
            <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{label}<span>{count}</span></button>
          ))}
        </div>

        <div className="admin-table-wrap">
          {activeTab === "overview" && (
            <table><thead><tr><th>מוזמן</th><th>מיקום בגיליון</th><th>פתיחת קישור</th><th>אישור הגעה</th><th>השם שנשלח</th><th>סנכרון</th></tr></thead>
              <tbody>{filteredOverview.map((row) => <tr key={row.inviteId}>
                <td><strong>{row.firstName || row.fullName || "ללא שם"}</strong><code dir="ltr">{row.inviteId}</code></td>
                <td>{row.sourceSheet}<small>{row.sourceRow ? `שורה מקורית ${row.sourceRow}` : "מזהה קבוע"}</small></td>
                <td><span className={`admin-status ${row.opened ? "positive" : "muted"}`}>{row.opened ? "נפתח" : "לא נפתח"}</span><small>{row.opened ? `${row.openCount} פתיחות · ${formatDate(row.firstOpenedAt)}` : "אין פתיחה מתועדת"}</small></td>
                <td><span className={`admin-status ${row.attendance === "yes" ? "positive" : row.attendance === "no" ? "negative" : "muted"}`}>{attendanceLabel(row.attendance)}</span><small>{row.attendance === "yes" ? `${row.guestCount} מגיעים` : row.message || "-"}</small></td>
                <td>{row.fullName || "-"}</td>
                <td><span className={`admin-status ${row.syncStatus === "synced" ? "positive" : "muted"}`}>{syncLabel(row.syncStatus)}</span></td>
              </tr>)}</tbody></table>
          )}

          {activeTab === "responses" && (
            <table><thead><tr><th>ID</th><th>מוזמן</th><th>תשובה</th><th>הודעה</th><th>מקור</th><th>סנכרון</th><th>עודכן</th></tr></thead>
              <tbody>{filteredResponses.map((row) => <tr key={row.id}><td>{row.id}<code dir="ltr">{row.inviteId || "-"}</code></td><td><strong>{row.fullName}</strong><small>{row.firstName || row.invitedName || "-"}</small></td><td><span className={`admin-status ${row.attendance === "yes" ? "positive" : "negative"}`}>{attendanceLabel(row.attendance)}</span><small>{row.attendance === "yes" ? `${row.guestCount} משתתפים` : "0 משתתפים"}</small></td><td>{row.message || "-"}</td><td>{row.sourceSheet || "-"}<small>{row.sourceRow ? `שורה מקורית ${row.sourceRow}` : "איתור לפי מזהה"}</small></td><td>{syncLabel(row.syncStatus)}<small>{row.syncError || ""}</small></td><td>{formatDate(row.updatedAt)}</td></tr>)}</tbody></table>
          )}

          {activeTab === "visits" && (
            <table><thead><tr><th>ID</th><th>מוזמן</th><th>מזהה</th><th>מקור</th><th>פתיחה ראשונה</th><th>פתיחה אחרונה</th><th>כמות</th><th>סנכרון</th></tr></thead>
              <tbody>{filteredVisits.map((row) => <tr key={row.id}><td>{row.id}</td><td><strong>{row.firstName}</strong></td><td><code dir="ltr">{row.inviteId}</code></td><td>{row.sourceSheet}<small>{row.sourceRow ? `שורה מקורית ${row.sourceRow}` : "איתור לפי מזהה"}</small></td><td>{formatDate(row.firstOpenedAt)}</td><td>{formatDate(row.lastOpenedAt)}</td><td>{row.openCount}</td><td>{syncLabel(row.syncStatus)}<small>{row.syncError || ""}</small></td></tr>)}</tbody></table>
          )}

          {activeTab === "invites" && (
            <table><thead><tr><th>ID</th><th>מוזמן</th><th>מזהה</th><th>מקור</th><th>קישור</th><th>נוצר על ידי</th><th>עודכן</th></tr></thead>
              <tbody>{filteredInvites.map((row) => <tr key={row.id}><td>{row.id}</td><td><strong>{row.firstName}</strong></td><td><code dir="ltr">{row.inviteId}</code></td><td>{row.sourceSheet}<small>{row.sourceRow ? `שורה מקורית ${row.sourceRow}` : "מזהה קבוע"}</small></td><td><a className="admin-table-link" href={row.shortLink} target="_blank" rel="noreferrer">פתיחת קישור ↗</a></td><td>{row.createdBy}</td><td>{formatDate(row.updatedAt)}</td></tr>)}</tbody></table>
          )}

          {activeTab === "legacy" && (
            <table><thead><tr><th>ID</th><th>שם</th><th>טלפון</th><th>תשובה</th><th>אורחים</th><th>הודעה</th><th>נשלח</th><th>עודכן</th></tr></thead>
              <tbody>{filteredLegacy.map((row) => <tr key={row.id}><td>{row.id}</td><td><strong>{row.fullName}</strong></td><td dir="ltr">{row.phone}</td><td>{attendanceLabel(row.attendance)}</td><td>{row.guestCount}</td><td>{row.message || "-"}</td><td>{formatDate(row.submittedAt)}</td><td>{formatDate(row.updatedAt)}</td></tr>)}</tbody></table>
          )}

          {((activeTab === "overview" && filteredOverview.length === 0) ||
            (activeTab === "responses" && filteredResponses.length === 0) ||
            (activeTab === "visits" && filteredVisits.length === 0) ||
            (activeTab === "invites" && filteredInvites.length === 0) ||
            (activeTab === "legacy" && filteredLegacy.length === 0)) && (
            <div className="admin-empty-state"><span aria-hidden="true">◇</span><strong>אין נתונים להצגה</strong><p>{search ? "לא נמצאו תוצאות לחיפוש הזה." : "הטבלה תתמלא כאשר יתקבלו נתונים."}</p></div>
          )}
        </div>
        <p className="admin-data-footnote">דף זה מציג את הנתונים השמורים בדאטאבייס של האתר. רשימת המוזמנים המלאה, כולל מי שטרם פתח קישור, נשמרת ב-Google Sheets.</p>
      </section>
    </main>
  );
}
