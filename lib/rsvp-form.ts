export type Attendance = "yes" | "no";
export type RsvpFields = { fullName: string; attendance: Attendance; guestCount: string; message: string };
export type RsvpErrors = Partial<Record<"fullName" | "guestCount", string>>;

export function validateRsvp(fields: RsvpFields): RsvpErrors {
  const errors: RsvpErrors = {};
  if (fields.fullName.trim().length < 2) errors.fullName = "איך לרשום אתכם? הזינו שם מלא כדי שנדע ממי האישור.";
  const count = Number(fields.guestCount);
  if (fields.attendance === "yes" && (!Number.isSafeInteger(count) || count < 1 || count > 1_000)) {
    errors.guestCount = "יש להזין מספר שלם של משתתפים, בין 1 ל-1,000.";
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
