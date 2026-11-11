import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const config = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
const password = (name: string) => config.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim() || '';
const banner = 'הדגמה - נתונים פיקטיביים בלבד';

test('mobile fictional invitation and Hebrew table search media', async ({ browser, baseURL }, testInfo) => {
  const mobile = { baseURL, viewport: { width: 390, height: 844 }, locale: 'he-IL', reducedMotion: 'reduce' as const };
  const admin = await browser.newContext({ ...mobile, httpCredentials: { username: 'admin', password: password('ADMIN_PASSWORD') } });
  const guest = await browser.newContext(mobile);
  const staff = await browser.newContext({ ...mobile, httpCredentials: { username: 'admin', password: password('STAFF_PASSWORD') } });
  try {
    const response = await admin.request.post('/api/admin/invites', { data: { firstName: 'דנה בדיקה', sourceSheet: 'מוזמנים דנה' }, headers: { Origin: baseURL! } });
    expect(response.status(), await response.text()).toBe(201);
    const { shortLink } = await response.json() as { shortLink: string };
    const guestPage = await guest.newPage();
    await guestPage.goto(shortLink);
    await expect(guestPage.getByRole('note', { name: 'סביבת הדגמה' })).toContainText(banner);
    await expect(guestPage.locator('#guest-name')).toHaveValue('דנה בדיקה');
    await guestPage.screenshot({ path: testInfo.outputPath('mobile-invite.png'), fullPage: true, animations: 'disabled' });

    const staffPage = await staff.newPage();
    await staffPage.goto('/find-table');
    await expect(staffPage.getByRole('note', { name: 'סביבת הדגמה' })).toContainText(banner);
    const search = staffPage.getByRole('searchbox');
    await search.fill('מיה');
    await expect(staffPage.getByText('מיה ברק')).toBeVisible();
    await staffPage.screenshot({ path: testInfo.outputPath('mobile-table-search.png'), fullPage: true, animations: 'disabled' });
  } finally { await Promise.all([admin.close(), guest.close(), staff.close()]); }
});
