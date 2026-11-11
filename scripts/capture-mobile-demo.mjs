import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const baseURL = process.env.DEMO_BASE_URL || 'http://127.0.0.1:4173';
const config = await readFile(new URL('../.dev.vars', import.meta.url), 'utf8');
const variable = name => {
  const value = config.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim();
  if (!value) throw new Error(`Missing ${name}; run npm run demo:setup first.`);
  return value;
};
await mkdir(new URL('../docs/media/', import.meta.url), { recursive: true });
const systemChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ headless: true, executablePath: systemChromium });
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'he-IL', reducedMotion: 'reduce' };
const admin = await browser.newContext({ ...mobile, httpCredentials: { username: 'admin', password: variable('ADMIN_PASSWORD') } });
const guest = await browser.newContext(mobile);
const staff = await browser.newContext({ ...mobile, httpCredentials: { username: 'admin', password: variable('STAFF_PASSWORD') } });
try {
  const invite = await admin.request.post(`${baseURL}/api/admin/invites`, { data: { firstName: 'דנה בדיקה', sourceSheet: 'מוזמנים דנה' }, headers: { Origin: baseURL } });
  if (!invite.ok()) throw new Error(`Invite creation failed: ${invite.status()} ${await invite.text()}`);
  const { shortLink } = await invite.json();
  const guestPage = await guest.newPage();
  await guestPage.goto(shortLink);
  await guestPage.locator('#guest-name').waitFor();
  await guestPage.screenshot({ path: new URL('../docs/media/mobile-invite.png', import.meta.url).pathname, fullPage: true });

  const staffPage = await staff.newPage();
  await staffPage.goto(`${baseURL}/find-table`);
  await staffPage.getByRole('searchbox').fill('מיה');
  await staffPage.getByText('מיה ברק').waitFor();
  await staffPage.screenshot({ path: new URL('../docs/media/mobile-table-search.png', import.meta.url).pathname, fullPage: true });
} finally {
  await Promise.all([admin.close(), guest.close(), staff.close()]);
  await browser.close();
}
