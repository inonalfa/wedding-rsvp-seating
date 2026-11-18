export type ImportedGuest = { name: string; maxGuests: number };

/** Accept UTF-8 CSV with a required name,max_guests header and RFC 4180-style quotes. */
export function parseGuestCsv(text: string): ImportedGuest[] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "";
  let state: "plain" | "quoted" | "closed" = "plain";
  function pushField() {
    row.push(field);
    if (row.length > 2) throw new Error("יותר מדי עמודות");
    field = "";
    state = "plain";
  }
  function pushRow() {
    pushField();
    if (row.length !== 1 || row[0] !== "") rows.push(row);
    if (rows.length > 301) throw new Error("יותר מ-300 הזמנות");
    row = [];
  }
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (state === "quoted") {
      if (c !== '"') field += c;
      else if (input[i + 1] === '"') { field += '"'; i++; }
      else state = "closed";
    } else if (c === ",") pushField();
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      pushRow();
    } else if (state === "closed") throw new Error("מרכאות לא תקינות");
    else if (c === '"') {
      if (field !== "") throw new Error("מרכאות לא תקינות");
      state = "quoted";
    } else field += c;
    if (field.length > 100) throw new Error("שדה ארוך מדי");
  }
  if (state === "quoted") throw new Error("מרכאות לא סגורות");
  if (field || row.length || state === "closed") pushRow();
  const header = rows.shift();
  if (header?.join(",") !== "name,max_guests") throw new Error("הכותרת חייבת להיות name,max_guests");
  if (!rows.length) throw new Error("אין אורחים לייבוא");
  const guests = rows.map(([value, count], i) => {
    const name = value.trim();
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name) || !/^(?:[1-9]|1[0-9]|20)$/.test(count?.trim() ?? "")) {
      throw new Error(`שם או מספר מוזמנים לא תקין ברשומה ${i + 1}`);
    }
    return { name, maxGuests: Number(count) };
  });
  if (guests.reduce((sum, g) => sum + g.maxGuests, 0) > 500) throw new Error("יותר מ-500 מוזמנים");
  return guests;
}
