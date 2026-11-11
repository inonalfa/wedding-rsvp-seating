"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { eventConfig, eventDate } from "@/lib/event-config";
import AdminDataSection from "./AdminDataSection";
import { useAdminData } from "./useAdminData";

export type RsvpResponse = {
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

export type InviteVisit = {
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

export type GeneratedInvite = {
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

export type LegacyResponse = {
  id: number;
  fullName: string;
  phone: string;
  attendance: "yes" | "no";
  guestCount: number;
  message: string;
  submittedAt: string;
  updatedAt: string;
};

export type AdminData = {
  responses: RsvpResponse[];
  visits: InviteVisit[];
  invites: GeneratedInvite[];
  legacyResponses: LegacyResponse[];
  exclusions: { token: string; createdAt: string }[];
};

export type Tab = "overview" | "responses" | "visits" | "invites" | "legacy";

export type OverviewRow = {
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

  const { overviewRows, filteredOverview, filteredResponses, filteredVisits, filteredInvites, filteredLegacy, stats } = useAdminData(data, search);

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
          <Link className="admin-monogram" href="/" aria-label="חזרה לאתר">{eventConfig.monogram[0]} <i>&amp;</i> {eventConfig.monogram[1]}</Link>
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
          <p className="admin-kicker">{eventDate}</p>
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
              <select name="sourceSheet" defaultValue={eventConfig.sheetNames[0]} required>
                {eventConfig.sheetNames.map(name => <option key={name}>{name}</option>)}
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

      <AdminDataSection activeTab={activeTab} setActiveTab={setActiveTab} search={search} setSearch={setSearch}
        isRefreshing={isRefreshing} refreshData={refreshData} overviewCount={overviewRows.length}
        responseCount={data.responses.length} visitCount={data.visits.length} inviteCount={data.invites.length} legacyCount={data.legacyResponses.length}
        overview={filteredOverview} responses={filteredResponses} visits={filteredVisits} invites={filteredInvites} legacy={filteredLegacy} />
    </main>
  );
}
