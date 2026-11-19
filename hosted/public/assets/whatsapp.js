// WhatsApp click-to-chat links. Shared by the owner app and the tests.

/** Digits for wa.me: "+972..." and "00972..." keep their country code, a local "05..." becomes "9725...". */
export function waDigits(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (raw.startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}

export function waLink(phone, text) {
  return "https://wa.me/" + waDigits(phone) + "?text=" + encodeURIComponent(text);
}
