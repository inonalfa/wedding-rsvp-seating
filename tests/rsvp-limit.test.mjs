import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { workerFixture } from './helpers/worker-fixture.mjs';
function token() {
  const payload = Buffer.concat([Buffer.from([1, 0, 0, 2, 2]), Buffer.from('Demo Guest')]);
  const tag = createHmac('sha256', Buffer.alloc(32, 7)).update(payload).digest().subarray(0, 8);
  return Buffer.concat([payload, tag]).toString('base64url');
}
test('real Worker rejects RSVP above invite maxGuests before saving', async () => {
  const fixture = workerFixture({ MAKE_WEBHOOK_URL: undefined });
  try {
    for (const count of [3, 1000]) {
      const response = await fixture.request('/api/rsvp', { body: { fullName: 'Demo Guest', attendance: 'yes', guestCount: count, inviteToken: token() } });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /1 ל-2/);
    }
    assert.equal(fixture.sql.prepare('SELECT count(*) AS n FROM rsvp_responses').get().n, 0);
    const accepted = await fixture.request('/api/rsvp', { body: { fullName: 'Demo Guest', attendance: 'yes', guestCount: 2, inviteToken: token() } });
    assert.equal(accepted.status, 201);
    assert.equal(fixture.sql.prepare('SELECT guest_count FROM rsvp_responses').get().guest_count, 2);
    const decline = await fixture.request('/api/rsvp', { body: { fullName: 'Demo Guest', attendance: 'no', guestCount: 1000, inviteToken: token() } });
    assert.equal(decline.status, 201);
    assert.equal(fixture.sql.prepare('SELECT guest_count FROM rsvp_responses').get().guest_count, 0);
  } finally { fixture.sql.close(); }
});

test('demo RSVP stores only the signed fictional identity and rejects the open form', async () => {
  const fixture = workerFixture({ DEMO_MODE: '1', MAKE_WEBHOOK_URL: undefined });
  try {
    const open = await fixture.request('/api/rsvp', { body: { fullName: 'Real Person', attendance: 'yes', guestCount: 1 } });
    assert.equal(open.status, 400);
    const signed = await fixture.request('/api/rsvp', { body: { fullName: 'Real Person', attendance: 'yes', guestCount: 1, message: 'real note', inviteToken: token() } });
    assert.equal(signed.status, 201, await signed.clone().text());
    const stored = fixture.sql.prepare('SELECT full_name, message FROM rsvp_responses').get();
    assert.equal(stored.full_name, 'Demo Guest');
    assert.equal(stored.message, '');
  } finally { fixture.sql.close(); }
});
