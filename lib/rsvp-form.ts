export type Attendance = "yes" | "no";
export type RsvpFields = { fullName: string; attendance: Attendance; guestCount: string; message: string };
export type RsvpErrors = Partial<Record<"fullName" | "guestCount", string>>;

export function rsvpGuestLimit(maxGuests?: number): number {
  return Number.isSafeInteger(maxGuests) && Number(maxGuests) > 0 ? Math.min(Number(maxGuests), 1_000) : 1_000;
}

export function validateRsvp(fields: RsvpFields, maxGuests?: number): RsvpErrors {
  const limit = rsvpGuestLimit(maxGuests);
  const errors: RsvpErrors = {};
  if (fields.fullName.trim().length < 2) errors.fullName = "איך לרשום אתכם? הזינו שם מלא כדי שנדע ממי האישור.";
  const count = Number(fields.guestCount);
  if (fields.attendance === "yes" && (!Number.isSafeInteger(count) || count < 1 || count > limit)) {
    errors.guestCount = `יש להזין מספר שלם של משתתפים, בין 1 ל-${limit}.`;
  }
  return errors;
}

export function rsvpPayload(fields: RsvpFields, token: string, website: string) {
  return {
    fullName: fields.fullName.trim(),
    attendance: fields.attendance,
    guestCount: fields.attendance === "yes" ? Number(fields.guestCount) : 0,
    message: fields.message.trim(),
    website,
    inviteToken: token,
  };
}
