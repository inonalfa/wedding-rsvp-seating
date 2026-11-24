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
  await page.route(origin + "/auth/login", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const headers = response.headers();
    const auth = new URL(headers.location);
    expect(auth.origin + auth.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    const callback = new URL(auth.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", auth.searchParams.get("state")!);
    callback.searchParams.set("code", subject + ":" + auth.searchParams.get("nonce"));
    await route.fulfill({ response, headers: { ...headers, location: callback.href } });
  });
  await page.goto(origin + "/auth/login");
  await expect(page.locator("[name=cf-turnstile-response]")).toHaveCount(0);
  await expect(page.locator(".cf-turnstile")).toHaveCount(0);
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await page.getByRole("button", { name: "המשך עם Google" }).click();
  await expect(page).toHaveURL(origin + "/app");
}

const inDays = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

async function createEvent(page: Page, a: string, b: string) {
  await expect(page.getByRole("heading", { name: /ספרו לנו על האירוע/ })).toBeVisible();
  await page.getByLabel("שם הכלה / בן הזוג").fill(a);
  await page.getByLabel("שם החתן / בת הזוג").fill(b);
  await page.getByLabel("תאריך האירוע").fill(inDays(7));
  await page.getByLabel("מקום האירוע").fill("גן פיקטיבי");
  await page.getByRole("button", { name: "יצירת האירוע" }).click();
  await expect(page.getByRole("heading", { name: "פרטי האירוע" })).toBeVisible();
}

test("hosted couple signs up, adds guests, shares, receives RSVP, seats and prints in isolation", async ({ page, browser }) => {
  await signIn(page, "owner-a");
  await createEvent(page, "נועה", "עידו");
  await page.getByRole("link", { name: "מוזמנים", exact: true }).click();
  await page.getByLabel("שם", { exact: true }).fill("נועה בדיקה");
  await page.getByLabel("כמות", { exact: true }).fill("2");
  await page.getByRole("button", { name: "הוספה" }).click();
  await expect(page.getByRole("cell", { name: /נועה בדיקה/ })).toBeVisible();
  await page.getByRole("link", { name: "שליחה", exact: true }).click();
  const [guest] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "פתיחה" }).click()]);
  await challenge(guest);
  await guest.reload();
  await expect(guest.getByRole("heading", { name: /נועה/ })).toBeVisible();
  await expect(guest.locator("[name=cf-turnstile-response]")).toHaveCount(1);
  await guest.getByLabel("כמות מגיעים").selectOption("2");
  await guest.getByLabel(/ברכה או הערה/).fill("מזל טוב מהבדיקה");
  await guest.getByRole("button", { name: "מאשרים הגעה" }).click();
  await expect(guest.getByRole("status")).toContainText("התשובה נשמרה");

  await page.getByRole("link", { name: "סקירה", exact: true }).click();
  await page.reload();
  await expect(page.getByText("מזל טוב מהבדיקה")).toBeVisible();
  await page.getByRole("link", { name: "הושבה", exact: true }).click();
  await page.getByRole("button", { name: "הוספת שולחנות" }).first().click();
  await page.locator("dialog").getByRole("button", { name: "הוספה" }).click();
  await page.getByRole("button", { name: /נועה בדיקה/ }).click();
  await page.locator("dialog select").selectOption({ label: "שולחן 1 (12 פנויים)" });
  await page.locator("dialog").getByRole("button", { name: "שיבוץ" }).click();
  await expect(page.locator(".seat-table").getByText("נועה בדיקה")).toBeVisible();
  await guest.reload();
  await expect(guest.getByText("השולחן שלכם: 1")).toBeVisible();
  await guest.close();

  const eventId = await page.evaluate(async () => (await (await fetch("/api/app/state")).json()).event.id);
  const eventUrl = origin + "/events/" + eventId;
  await page.goto(eventUrl + "/seating/print");
  await expect(page.getByText("נועה בדיקה (2)")).toBeVisible();
  expect((await page.pdf()).subarray(0, 5).toString()).toBe("%PDF-");

  const other = await browser.newPage();
  await signIn(other, "owner-b");
  const denied = await other.goto(eventUrl);
  expect(denied?.status()).toBe(404);
  await other.goto(origin + "/app");
  await expect(other.getByRole("heading", { name: /ספרו לנו על האירוע/ })).toBeVisible();
  await expect(other.getByText("נועה בדיקה")).toHaveCount(0);
  await other.close();
});

test("demo keeps data in the browser and moves it into a new Google account", async ({ page }) => {
  await challenge(page);
  await page.goto(origin);
  await page.getByRole("navigation", { name: "תפריט ראשי" }).getByRole("link", { name: "הדגמה" }).click();
  await createEvent(page, "מאיה", "עומר");
  expect(await page.evaluate(() => localStorage.getItem("wedding-demo-v1"))).toContain("מאיה");
  await page.getByRole("link", { name: "מוזמנים", exact: true }).click();
  await page.getByRole("button", { name: "הדבקה מאקסל / ייבוא" }).click();
  await page.locator("dialog textarea").fill("שם\tכמות\tטלפון\tקבוצה\nמשפחת אבן\t4\t0523334444\tמשפחה\nגלית\t1\t\tעבודה");
  await page.getByRole("button", { name: "המשך" }).click();
  await page.getByRole("button", { name: "הוספת 2 מוזמנים" }).click();
  await expect(page.getByRole("cell", { name: /משפחת אבן/ })).toBeVisible();

  await page.getByRole("button", { name: "הדגמה" }).click();
  await page.getByRole("link", { name: "יצירת חשבון ושמירת הנתונים" }).click();
  await expect(page.getByRole("heading", { name: "יצירת חשבון" })).toBeVisible();
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await signIn(page, "owner-c");
  await expect(page.getByRole("heading", { name: "מצאנו נתונים מההדגמה" })).toBeVisible();
  await page.getByRole("button", { name: "העברה לחשבון" }).click();
  await expect(page.getByRole("heading", { name: "מאיה & עומר" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("wedding-demo-v1"))).toBeNull();
  await page.getByRole("link", { name: "מוזמנים", exact: true }).click();
  await expect(page.getByRole("cell", { name: /משפחת אבן/ })).toBeVisible();
  await page.goto(origin + "/privacy");
  await expect(page.getByRole("heading", { name: "מדיניות פרטיות" })).toBeVisible();
});
