import test from 'node:test';
import assert from 'node:assert/strict';
import { workerFixture } from './helpers/worker-fixture.mjs';
test('real Worker routing accepts browser Basic and service Bearer for seating sync', async () => {
  const f = workerFixture();
  try {
    const browser = await f.request('/api/admin/seating/sync', { headers: { Authorization: f.admin, 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'cors' } });
    assert.equal(browser.status, 200, 'browser admin must reach the sync handler');
    assert.equal((await browser.json()).pending, 0);
    assert.equal((await f.request('/api/admin/seating/sync', { headers: { Authorization: 'Bearer test-sync-secret' } })).status, 200);
    for (const headers of [{}, { Authorization: 'Bearer wrong' }, { Authorization: `Basic ${btoa('admin:wrong')}` }, { 'oai-authenticated-user-email': 'admin@example.test' }]) assert.equal((await f.request('/api/admin/seating/sync', { headers })).status, 401);
  } finally { f.sql.close(); }
});
