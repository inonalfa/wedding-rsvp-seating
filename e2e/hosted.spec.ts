import { expect, test, type Page } from "@playwright/test";

const origin = "http://127.0.0.1:4174";

async function challenge(page: Page) {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js", route => route.fulfill({
    contentType: "text/javascript",
    body: `const mount = () => {
      for (const widget of document.querySelectorAll(".cf-turnstile")) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "cf-turnstile-response";
        input.value = widget.dataset.action + ":" + crypto.randomUUID();
        widget.appendChild(input);
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();`,
  }));
}

async function signIn(page: Page, subject: string) {
  await challenge(page);
  await page.route("https://accounts.google.com/o/oauth2/v2/auth?**", route => {
    const auth = new URL(route.request().url());
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    const callback = new URL(auth.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", auth.searchParams.get("state")!);
    callback.searchParams.set("code", subject + ":" + auth.searchParams.get("nonce"));
    return route.fulfill({ status: 302, headers: { Location: callback.href } });
  });
  await page.goto(origin);
  await page.getByRole("link", { name: "התחברות באמצעות Google" }).click();
  await expect(page.locator("[name=cf-turnstile-response]")).toHaveCount(1);
  await page.getByRole("button", { name: "המשך עם Google" }).click();
  await expect(page.getByRole("heading", { name: "האירועים שלי" })).toBeVisible();
}

test("hosted couple signs up, imports, shares, receives RSVP, seats and prints in isolation", async ({ page, browser }) => {
  await signIn(page, "owner-a");
  await page.getByLabel("שם האירוע").fill("אירוע בדיקה פיקטיבי");
  await page.getByLabel("תאריך", { exact: true }).fill(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "יצירת אירוע" }).click();
  await expect(page.getByRole("heading", { name: "אירוע בדיקה פיקטיבי" })).toBeVisible();
  const eventUrl = page.url();
  await page.getByLabel("קובץ מוזמנים").setInputFiles({
    name: "fictional.csv", mimeType: "text/csv", buffer: Buffer.from("name,max_guests\nנועה בדיקה,2"),
  });
  await page.getByRole("button", { name: "ייבוא מוזמנים" }).click();
  await page.getByRole("link", { name: "קישור להזמנה", exact: true }).click();
  const invite = await page.getByLabel("קישור להזמנה").inputValue();
  await expect(page.getByRole("link", { name: "שיתוף בוואטסאפ" })).toHaveAttribute("href", /^https:\/\/wa\.me\//);

  const guest = await browser.newPage();
  await challenge(guest);
  await guest.goto(invite);
  await expect(guest.locator("[name=cf-turnstile-response]")).toHaveCount(1);
  await guest.getByLabel("כמות מגיעים").selectOption("2");
  await guest.getByRole("button", { name: "מאשרים הגעה" }).click();
  await expect(guest.getByRole("status")).toContainText("התשובה נשמרה");
  await page.goto(eventUrl);
  await expect(page.getByText("אישרו: 2")).toBeVisible();
  await page.getByRole("link", { name: "סידורי הושבה" }).click();
  await page.getByLabel("מספר שולחן").fill("1");
  await page.getByRole("button", { name: "הוספת שולחן" }).click();
  await page.getByLabel(/נועה בדיקה/).selectOption({ label: "שולחן 1" });
  await page.getByRole("button", { name: "שמירת שיבוץ" }).click();
  await guest.reload();
  await expect(guest.getByText("השולחן שלכם: 1")).toBeVisible();
  await guest.close();
  await page.getByRole("link", { name: "גרסה להדפסה ולשמירה כ-PDF" }).click();
  await expect(page.getByText("נועה בדיקה (2)")).toBeVisible();
  expect((await page.pdf()).subarray(0, 5).toString()).toBe("%PDF-");

  const other = await browser.newPage();
  await signIn(other, "owner-b");
  const denied = await other.goto(eventUrl);
  expect(denied?.status()).toBe(404);
  await expect(other.getByText("נועה בדיקה")).toHaveCount(0);
  await other.close();
});
