import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const demoConfig = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
function demoPassword(name: string) {
  const value = demoConfig.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim();
  if (!value) throw new Error(`Missing ${name}; run npm run demo:setup in an isolated checkout.`);
  return value;
}
const adminPassword = demoPassword('ADMIN_PASSWORD');
const staffPassword = demoPassword('STAFF_PASSWORD');

test('fictional invite, RSVP, admin seating, Hebrew search and PDF export', async ({ browser, baseURL }, testInfo) => {
  const options = { baseURL, viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' as const };
  const admin = await browser.newContext({ ...options, httpCredentials: { username: 'admin', password: adminPassword } });
  const guest = await browser.newContext(options);
  const staff = await browser.newContext({ ...options, httpCredentials: { username: 'admin', password: staffPassword } });
  const capture = (page: Page, name: string) => page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' });
  try {
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin');
    await expect(adminPage.getByRole('heading', { name: 'מרכז השליטה של החתונה' })).toBeVisible();

    const inviteResponse = await admin.request.post('/api/admin/invites', {
      data: { firstName: 'דנה בדיקה', sourceSheet: 'מוזמנים דנה' },
      headers: { Origin: baseURL! },
    });
    expect(inviteResponse.status(), await inviteResponse.text()).toBe(201);
    const { shortLink } = await inviteResponse.json() as { shortLink: string };

    const guestPage = await guest.newPage();
    await guestPage.goto(shortLink);
    await expect(guestPage.locator('#guest-name')).toHaveValue('דנה בדיקה');
    await capture(guestPage, '01-invitation');
    await guestPage.locator('#guest-count').fill('2');
    await guestPage.getByRole('button', { name: 'מאשרים ומתחילים להתרגש' }).click();
    await expect(guestPage.getByRole('heading', { name: 'יש! נתראה ברחבה.' })).toBeVisible();
    await capture(guestPage, '02-rsvp');

    // Keep repeated local runs deterministic without touching any real data.
    const seatingResponse = await admin.request.get('/api/admin/seating');
    expect(seatingResponse.ok()).toBeTruthy();
    const current = await seatingResponse.json() as { plan: { tables: { guests: string[] }[] }; revision: number };
    const plan = { tables: current.plan.tables.map(table => ({ ...table, guests: table.guests.filter(id => id !== 'demo-a-3') })) };
    const resetResponse = await admin.request.put('/api/admin/seating', { data: { plan, revision: current.revision }, headers: { Origin: baseURL! } });
    expect(resetResponse.ok()).toBeTruthy();

    await adminPage.goto('/admin/seating');
    await adminPage.getByRole('searchbox', { name: 'חיפוש מוזמנים' }).fill('מיה');
    await adminPage.getByRole('button', { name: /שיבוץ מיה ברק לשולחן 1/ }).click();
    await adminPage.getByRole('button', { name: 'שמירה עכשיו' }).click();
    await expect(adminPage.getByText(/סידור ההושבה נשמר/).first()).toBeVisible();
    await adminPage.getByRole('searchbox', { name: 'חיפוש מוזמנים' }).fill('');
    await capture(adminPage, '03-seating');

    const staffPage = await staff.newPage();
    await staffPage.goto('/find-table');
    const searchResponsePromise = staffPage.waitForResponse(response => response.url().endsWith('/api/find-table') && response.request().method() === 'POST');
    await staffPage.getByRole('searchbox').fill('מיה');
    const searchResponse = await searchResponsePromise;
    expect(searchResponse.status(), await searchResponse.text()).toBe(200);
    await expect(staffPage.getByText('מיה ברק')).toBeVisible();
    const guestCard = staffPage.getByRole('group', { name: /מיה ברק/ });
    await expect(guestCard.locator('.finder-number strong')).toHaveText('1');
    await capture(staffPage, '04-search');

    await adminPage.goto('/admin/seating/sketch');
    await expect(adminPage.getByRole('heading', { name: 'סקיצת האולם' })).toBeVisible();
    const downloadPromise = adminPage.waitForEvent('download');
    await adminPage.getByRole('button', { name: 'ייצוא ל-PDF' }).click();
    const download = await downloadPromise;
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    await capture(adminPage, '05-sketch');
  } finally {
    await Promise.all([admin.close(), guest.close(), staff.close()]);
  }
});
