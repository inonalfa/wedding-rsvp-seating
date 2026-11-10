import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const secret = () => randomBytes(32).toString('base64url');
const content = [
  '# Ephemeral credentials for an isolated fictional demo. Never commit this file.',
  'DEMO_MODE=1',
  'DEMO_AUTH=1',
  'AUTH_MODE=basic',
  'ADMIN_EMAILS=demo@example.test',
  `ADMIN_PASSWORD=${secret()}`,
  `STAFF_PASSWORD=${secret()}`,
  `INVITE_SHORT_TOKEN_SECRET=${secret()}`,
  `INVITE_TOKEN_SECRET=${secret()}`,
  '',
].join('\n');

try {
  await writeFile(new URL('../.dev.vars', import.meta.url), content, { flag: 'wx', mode: 0o600 });
  console.log('Created isolated demo configuration in .dev.vars. Read its credentials locally; do not share them.');
} catch (error) {
  if (error.code === 'EEXIST') {
    console.error('.dev.vars already exists. Use a fresh checkout for the demo; your existing configuration was preserved.');
    process.exitCode = 1;
  } else throw error;
}
