import test from 'node:test';
import assert from 'node:assert/strict';
import { workerFixture } from './helpers/worker-fixture.mjs';
import { eventConfig } from '../config/event.ts';
import { seatTicket, readSeatTicket } from '../lib/reception-token.ts';
import { requestContext } from '../lib/request-context.ts';
import { createHmac } from 'node:crypto';

function legacyInviteToken(maxGuests = 2) {
  const payload = Buffer.concat([Buffer.from([1, 0, 0, 2, maxGuests]), Buffer.from('Demo Legacy Guest')]);
  const tag = createHmac('sha256', Buffer.alloc(32, 7)).update(payload).digest().subarray(0, 8);
  return Buffer.concat([payload, tag]).toString('base64url');
}

test('new invitations use v3 signatures, expire, and respect individual revocation', async () => {
  const f = workerFixture({ INVITE_TOKEN_TTL_SECONDS: '60' });
  const originalNow = Date.now;
  try {
    const created = await f.request('/api/admin/invites', { headers: { Authorization: f.admin }, body: { firstName: 'Demo Guest', sourceSheet: eventConfig.sheetNames[0] } });
    assert.equal(created.status, 201, await created.clone().text());
    const { shortLink, inviteId } = await created.json();
    const token = shortLink.split('/').at(-1);
    assert.equal(Buffer.from(token, 'base64url')[0], 3);
    const get = () => f.request('/api/invite?token=' + token, { method: 'GET' });
    assert.equal((await get()).status, 200);
    Date.now = () => originalNow() + 61_000;
    assert.equal((await get()).status, 404);
    Date.now = originalNow;
    f.sql.prepare('INSERT INTO rsvp_invite_resolutions (invite_id,canonical_id,reconciliation_id) VALUES (?,NULL,?)').run(inviteId, 'manual-revocation');
    assert.equal((await get()).status, 404);
  } finally { Date.now = originalNow; f.sql.close(); }
});

test('an event-wide deadline accepts valid legacy and v3 invitations before it and rejects both after it', async () => {
  const f = workerFixture({ INVITE_TOKENS_EXPIRE_AT: '2100-01-01T00:00:00Z' });
  try {
    const created = await f.request('/api/admin/invites', { headers: { Authorization: f.admin }, body: { firstName: 'Demo V3 Guest', sourceSheet: eventConfig.sheetNames[0] } });
    assert.equal(created.status, 201, await created.clone().text());
    const v3 = (await created.json()).shortLink.split('/').at(-1);
    const legacy = legacyInviteToken();

    for (const token of [legacy, v3]) {
      assert.equal((await f.request('/api/invite?token=' + token, { method: 'GET' })).status, 200, 'valid control token');
    }

    f.env.INVITE_TOKENS_EXPIRE_AT = '2000-01-01T00:00:00Z';
    for (const token of [legacy, v3]) {
      assert.equal((await f.request('/api/invite?token=' + token, { method: 'GET' })).status, 404, 'same token after deadline');
    }
  } finally { f.sql.close(); }
});

test('an invalid event-wide invitation deadline fails closed for a valid legacy invitation', async () => {
  const f = workerFixture({ INVITE_TOKENS_EXPIRE_AT: 'invalid' });
  try { assert.equal((await f.request('/api/invite?token=' + legacyInviteToken(), { method: 'GET' })).status, 404); }
  finally { f.sql.close(); }
});

test('seating cards expire exactly at their deadline and can be revoked by epoch', async () => {
  const config = { inviteShortTokenSecret: 'synthetic-test-key', seatingTokenEpoch: '1' };
  const originalNow = Date.now;
  await requestContext.run({ config }, async () => {
    try {
      const token = await seatTicket('demo-guest', 1, null);
      assert.equal((await readSeatTicket(token)).guestId, 'demo-guest');
      config.seatingTokenEpoch = '2';
      await assert.rejects(readSeatTicket(token));
      config.seatingTokenEpoch = '1';
      const expires = (await readSeatTicket(token)).expires;
      Date.now = () => expires;
      await assert.rejects(readSeatTicket(token));
    } finally { Date.now = originalNow; }
  });
});
