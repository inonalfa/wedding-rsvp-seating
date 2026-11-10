"use client";
import { eventConfig, eventHosts, eventWazeUrl } from "@/lib/event-config";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { rsvpPayload, rsvpGuestLimit, validateRsvp, type Attendance, type RsvpErrors } from "@/lib/rsvp-form";
import { Icon } from "./wedding-icons";


export const wazeUrl = eventWazeUrl;

export type InviteDetails = { inviteId: string; firstName: string; fullName: string; token: string; maxGuests: number; hideAdultsNote?: boolean };
export type InviteStatus = "loading" | "ready" | "general" | "error";

export default function RSVPForm({ invite, inviteStatus, retryInvite, onSaved }: {
  invite: InviteDetails | null;
  inviteStatus: InviteStatus;
  retryInvite: () => void;
  onSaved: () => void;
}) {
  const [attendance, setAttendance] = useState<Attendance>("yes");
  const [fullName, setFullName] = useState("");
  const [guestCount, setGuestCount] = useState("2");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errors, setErrors] = useState<RsvpErrors>({});
  const [errorMessage, setErrorMessage] = useState("");
  const nameTouched = useRef(false);
  const busy = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const countRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const unavailable = inviteStatus === "loading" || inviteStatus === "error";
  const guestLimit = rsvpGuestLimit(invite?.maxGuests);
  const currentCount = Number.isSafeInteger(Number(guestCount)) && Number(guestCount) >= 1 ? Number(guestCount) : 1;

  useEffect(() => {
    if (invite && !nameTouched.current) setFullName(invite.fullName);
  }, [invite]);

  useEffect(() => {
    setGuestCount(previous => Number(previous) > guestLimit ? String(guestLimit) : previous);
  }, [guestLimit]);

  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (status === "success") resultRef.current?.focus({ preventScroll: true });
  }, [status]);

  function adjustCount(delta: number) {
    const next = Math.min(guestLimit, Math.max(1, currentCount + delta));
    if (Number.isSafeInteger(next)) setGuestCount(String(next));
    setErrors(previous => ({ ...previous, guestCount: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || unavailable) return;
    const fields = { fullName, attendance, guestCount, message };
    const nextErrors = validateRsvp(fields, invite?.maxGuests);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      if (nextErrors.fullName) nameRef.current?.focus();
      else countRef.current?.focus();
      return;
    }

    busy.current = true;
    setStatus("sending");
    setErrorMessage("");
    const data = new FormData(event.currentTarget);
    const requestController = new AbortController();
    controller.current = requestController;
    const timeout = window.setTimeout(() => requestController.abort(), 20_000);

    try {
      const response = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rsvpPayload(fields, invite?.token ?? "", String(data.get("website") ?? ""))),
        signal: requestController.signal,
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "לא הצלחנו לשמור את האישור כרגע. אפשר לנסות שוב.");
      setStatus("success");
      onSaved();
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error && error.name !== "AbortError" && !(error instanceof TypeError)
        ? error.message
        : "החיבור התעכב ולא הצלחנו לוודא שהאישור נשמר. הפרטים עדיין כאן, אפשר לנסות שוב או לעדכן אותנו בוואטסאפ.");
    } finally {
      window.clearTimeout(timeout);
      busy.current = false;
      controller.current = null;
    }
  }

  if (status === "success") {
    return <div className="success-state" ref={resultRef} tabIndex={-1} aria-labelledby="success-title">
      {attendance === "yes" && <div className="celebration" aria-hidden="true">{Array.from({ length: 20 }, (_, index) => <i key={index} style={{ "--x": `${(index * 37) % 100}%`, "--delay": `${(index % 5) * .11}s`, "--turn": `${index * 63}deg`, "--drift": `${(index % 2 ? -1 : 1) * (25 + index * 3)}px` } as CSSProperties} />)}</div>}
      <span className="success-mark"><Icon name={attendance === "yes" ? "check" : "heart"} /></span>
      <p className="eyebrow">התשובה שלכם נשמרה</p>
      <h3 id="success-title">{attendance === "yes" ? "יש! נתראה ברחבה." : "אתם איתנו בלב."}</h3>
      <p className="success-description">{attendance === "yes" ? "איזה כיף שתהיו חלק מהערב שלנו. אנחנו כבר מחכים לחגוג איתכם." : "תודה שעדכנתם אותנו. שולחים חיבוק גדול ומקווים לחגוג יחד בקרוב."}</p>
      <div className="confirmation-details">
        <div><span>על שם</span><strong>{fullName.trim()}</strong></div>
        <div><span>{attendance === "yes" ? "מספר משתתפים" : "התשובה שלכם"}</span><strong>{attendance === "yes" ? guestCount : "לא נוכל להגיע"}</strong></div>
      </div>
      {attendance === "yes" && <div className="success-actions"><a href="/api/calendar"><Icon name="calendar" /> הוספה ליומן</a><a href={wazeUrl} target="_blank" rel="noreferrer"><Icon name="pin" /> ניווט לאולם</a></div>}
      <button className="text-button" type="button" onClick={() => { setStatus("idle"); window.requestAnimationFrame(() => nameRef.current?.focus({ preventScroll: true })); }}><Icon name="refresh" /> עדכון התשובה</button>
    </div>;
  }

  return <form className="rsvp-form" onSubmit={handleSubmit} noValidate aria-busy={status === "sending" || inviteStatus === "loading"}>
    {inviteStatus === "loading" && <p className="invite-loading" role="status"><span className="spinner" aria-hidden="true" /> רגע, פותחים את ההזמנה שלכם...</p>}
    {inviteStatus === "error" && <div className="form-error" role="alert"><strong>ההזמנה האישית לא נטענה</strong><p>אפשר לנסות שוב. אם זה לא מסתדר, אנחנו כאן בוואטסאפ.</p><div className="error-actions"><button type="button" onClick={retryInvite}><Icon name="refresh" /> ניסיון נוסף</button><a href={`mailto:${eventConfig.contactEmail}`}><Icon name="message" /> יצירת קשר עם המארגנים</a></div></div>}
    <fieldset className="form-fields" disabled={status === "sending" || unavailable}>
      <legend className="sr-only">פרטי אישור ההגעה</legend>
      <fieldset className="attendance-field">
        <legend className="field-label">מגיעים לחגוג איתנו?</legend>
        <div className="attendance-toggle">
          <label className={`attendance-choice ${attendance === "yes" ? "selected" : ""}`}><input type="radio" name="attendance" value="yes" checked={attendance === "yes"} onChange={() => setAttendance("yes")} /><span className="radio-mark"><Icon name="check" /></span><span>ברור שמגיעים</span><Icon name="heart" /></label>
          <label className={`attendance-choice ${attendance === "no" ? "selected" : ""}`}><input type="radio" name="attendance" value="no" checked={attendance === "no"} onChange={() => { setAttendance("no"); setErrors(previous => ({ ...previous, guestCount: undefined })); }} /><span className="radio-mark"><Icon name="check" /></span><span>לצערנו לא נוכל</span></label>
        </div>
      </fieldset>

      <div className="form-field"><label className="field-label" htmlFor="guest-name">שם מלא</label><input id="guest-name" ref={nameRef} name="fullName" type="text" autoComplete="name" placeholder="איך לרשום אתכם?" value={fullName} onChange={event => { nameTouched.current = true; setFullName(event.target.value); setErrors(previous => ({ ...previous, fullName: undefined })); }} maxLength={80} required aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? "name-error" : undefined} />{errors.fullName && <p className="field-error" id="name-error">{errors.fullName}</p>}</div>

      {attendance === "yes" && <div className="guest-field"><div className="guest-stepper-row"><div><label className="field-label" htmlFor="guest-count">כמה מכם מגיעים?</label><p id="guest-help">כולל אתכם, כמובן</p></div><div className="guest-stepper"><button type="button" aria-label="הפחתת משתתף" onClick={() => adjustCount(-1)} disabled={currentCount === 1}><Icon name="minus" /></button><input id="guest-count" ref={countRef} name="guestCount" type="number" inputMode="numeric" min={1} max={guestLimit} step={1} value={guestCount} onChange={event => { setGuestCount(event.target.value); setErrors(previous => ({ ...previous, guestCount: undefined })); }} aria-invalid={Boolean(errors.guestCount)} aria-describedby={errors.guestCount ? "guest-help guest-error" : "guest-help"} required /><button type="button" aria-label="הוספת משתתף" disabled={currentCount >= guestLimit} onClick={() => adjustCount(1)}><Icon name="plus" /></button></div></div>{errors.guestCount && <p className="field-error" id="guest-error">{errors.guestCount}</p>}</div>}

      <div className="form-field"><label className="field-label" htmlFor="guest-message">משהו שתרצו שנדע? <span className="optional-label">לא חובה</span></label><textarea id="guest-message" name="message" rows={3} maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder="רגישות למזון, ברכה קטנה או כל דבר אחר..." /></div>
      <label className="honeypot" aria-hidden="true">אתר<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
    </fieldset>

    {status === "error" && <div className="form-error" role="alert"><strong>האישור עדיין לא הושלם</strong><p>{errorMessage}</p><a href={`mailto:${eventConfig.contactEmail}`}><Icon name="message" /> יצירת קשר <Icon name="external" /></a></div>}
    <button className="submit-button" type="submit" disabled={status === "sending" || unavailable}><span>{status === "sending" ? "שומרים את התשובה שלכם..." : attendance === "yes" ? "מאשרים ומתחילים להתרגש" : "שליחת התשובה שלנו"}</span><span className="button-icon">{status === "sending" ? <span className="spinner" /> : <Icon name="arrow" />}</span></button>
    <p className="privacy-note">הפרטים יישמרו אצל {eventHosts} לצורכי האירוע בלבד</p>
  </form>;
}
