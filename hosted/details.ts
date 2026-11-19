/** Invitation details a couple can edit. Stored as validated JSON in events.details. */
export type EventDetails = {
  hostA: string;
  hostB: string;
  receptionTime: string;
  ceremonyTime: string;
  venue: string;
  address: string;
  message: string;
  familyA: string;
  familyB: string;
  contactPhone: string;
  theme: "garden" | "night" | "blush";
  hideTableOnInvite?: boolean;
};

export const emptyDetails: EventDetails = {
  hostA: "", hostB: "", receptionTime: "19:30", ceremonyTime: "20:30", venue: "", address: "",
  message: "", familyA: "", familyB: "", contactPhone: "", theme: "garden",
};

const limits: Record<keyof Omit<EventDetails, "theme" | "hideTableOnInvite">, number> = {
  hostA: 40, hostB: 40, receptionTime: 5, ceremonyTime: 5, venue: 80, address: 140,
  message: 600, familyA: 80, familyB: 80, contactPhone: 20,
};
const control = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export class DetailsError extends Error {}

function clean(value: unknown, max: number, field: string) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new DetailsError("שדה לא תקין: " + field);
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (text.length > max || control.test(text)) throw new DetailsError("שדה ארוך מדי או לא תקין: " + field);
  return text;
}

/** Accepts partial input and returns a complete, normalized record. */
export function parseDetails(input: unknown, base: EventDetails = emptyDetails): EventDetails {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DetailsError("פרטי אירוע לא תקינים");
  const source = input as Record<string, unknown>;
  const result: EventDetails = { ...emptyDetails, ...base };
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    if (key in source) result[key] = clean(source[key], limits[key], key);
  }
  for (const key of ["receptionTime", "ceremonyTime"] as const) {
    if (result[key] && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result[key])) throw new DetailsError("שעה לא תקינה");
  }
  if (result.contactPhone && !/^[+\d][\d\s-]{5,19}$/.test(result.contactPhone)) throw new DetailsError("מספר טלפון לא תקין");
  if ("theme" in source) {
    if (source.theme !== "garden" && source.theme !== "night" && source.theme !== "blush") throw new DetailsError("עיצוב לא תקין");
    result.theme = source.theme;
  }
  if ("hideTableOnInvite" in source) result.hideTableOnInvite = source.hideTableOnInvite === true;
  return result;
}

export function readDetails(json: string | null | undefined): EventDetails {
  try {
    return parseDetails(JSON.parse(json || "{}"));
  } catch {
    return { ...emptyDetails };
  }
}

export function validTitle(value: unknown) {
  const title = typeof value === "string" ? value.trim() : "";
  return title && title.length <= 100 && !control.test(title) ? title : null;
}

/** Normalizes an Israeli or international phone number for wa.me links; returns "" when unusable. */
export function normalizePhone(value: unknown) {
  if (typeof value !== "string") return "";
  const digits = value.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (!/^\+?\d{7,15}$/.test(digits)) throw new DetailsError("מספר טלפון לא תקין");
  return digits;
}
