import test from 'node:test';
import assert from 'node:assert/strict';
import { workerFixture } from './helpers/worker-fixture.mjs';
const fresh = (secret = 'test-sync-secret') => ({ Authorization: `Bearer ${secret}`, 'X-Webhook-Timestamp': String(Math.floor(Date.now() / 1000)), 'X-Webhook-Nonce': crypto.randomUUID() });

test('real Worker requires fresh, unique service requests and claims nonces atomically', async () => {
  const f = workerFixture();
  const send = headers => f.request('/api/admin/seating/sync', { headers });
  try {
    assert.equal((await send({ Authorization: 'Bearer test-sync-secret' })).status, 401);
    assert.equal((await send({ ...fresh(), 'X-Webhook-Timestamp': String(Math.floor(Date.now() / 1000) - 301) })).status, 401);
    assert.equal((await send({ ...fresh(), 'X-Webhook-Timestamp': String(Math.floor(Date.now() / 1000) + 301) })).status, 401);
    assert.equal((await send({ ...fresh(), 'X-Webhook-Nonce': 'short' })).status, 401);
    const headers = fresh();
    assert.equal((await send({ ...headers, Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await send(headers)).status, 200);
    assert.equal((await send(headers)).status, 409);
    const concurrent = fresh();
    const statuses = await Promise.all([send(concurrent), send(concurrent)]).then(results => results.map(r => r.status).sort());
    assert.deepEqual(statuses, [200, 409]);
    assert.equal((await send({ Authorization: f.admin })).status, 200, 'browser Basic auth does not need service headers');
  } finally { f.sql.close(); }
});

test('WhatsApp replay protection runs before RSVP writes and fails closed without storage', async () => {
  const f = workerFixture({ WHATSAPP_RSVP_SECRET: 'test-whatsapp' });
  try {
    const headers = fresh('test-whatsapp');
    const send = () => f.request('/api/rsvp/whatsapp', { headers, body: {} });
    assert.equal((await send()).status, 400); // Fresh authenticated request, invalid RSVP.
    assert.equal((await send()).status, 409);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM rsvp_responses').get().n, 0);
    f.sql.exec('DROP TABLE webhook_nonces');
    assert.equal((await f.request('/api/admin/seating/sync', { headers: fresh() })).status, 503);
  } finally { f.sql.close(); }
});
