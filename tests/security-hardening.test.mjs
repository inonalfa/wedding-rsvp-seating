import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { workerFixture } from './helpers/worker-fixture.mjs';
import { eventConfig } from '../config/event.ts';
import { guestPurgeStatements } from '../lib/guest-retention.ts';
import { webhookBodySignature } from '../lib/webhook-signature.ts';
import { createHostedWorker } from '../hosted/worker.ts';
import { invitationKey, signInvitation } from '../hosted/invites.ts';
import { DatabaseSync } from 'node:sqlite';

function legacyToken() {
  const payload = Buffer.concat([Buffer.from([1, 0, 0, 2, 4]), Buffer.from('Legacy Guest')]);
  const tag = createHmac('sha256', Buffer.alloc(32, 7)).update(payload).digest().subarray(0, 8);
  return Buffer.concat([payload, tag]).toString('base64url');
}

test('a real event rejects an RSVP without a signed invite unless the operator opts out', async () => {
  const closed = workerFixture({ DEMO_MODE: '0', MAKE_WEBHOOK_URL: undefined });
  const open = workerFixture({ DEMO_MODE: '0', REQUIRE_INVITE_TOKEN: '0', MAKE_WEBHOOK_URL: undefined });
  try {
    const denied = await closed.request('/api/rsvp', { body: { fullName: 'אורח בלי קישור', attendance: 'yes', guestCount: 1 } });
    assert.equal(denied.status, 400);
    assert.match((await denied.json()).error, /קישור הזמנה אישי/);
    assert.equal(closed.sql.prepare('SELECT count(*) AS n FROM rsvp_responses').get().n, 0);
    const allowed = await open.request('/api/rsvp', { body: { fullName: 'אורח כללי', attendance: 'yes', guestCount: 2 } });
    assert.equal(allowed.status, 201, await allowed.clone().text());
    assert.equal(open.sql.prepare('SELECT full_name FROM rsvp_responses').get().full_name, 'אורח כללי');
  } finally {
    closed.sql.close();
    open.sql.close();
  }
});

test('legacy invitations expire from first use and an admin can revoke one invite', async () => {
  const f = workerFixture({ DEMO_MODE: '0' });
  const originalNow = Date.now;
  try {
    const token = legacyToken();
    assert.equal((await f.request('/api/invite?token=' + token, { method: 'GET' })).status, 200);
    const row = f.sql.prepare('SELECT expires_at FROM invite_controls').get();
    assert.ok(row.expires_at > Math.floor(originalNow() / 1000));
    Date.now = () => originalNow() + 90 * 24 * 60 * 60 * 1000 + 5000;
    assert.equal((await f.request('/api/invite?token=' + token, { method: 'GET' })).status, 404);
    Date.now = originalNow;

    const created = await f.request('/api/admin/invites', { headers: { Authorization: f.admin }, body: { firstName: 'נועה', sourceSheet: eventConfig.sheetNames[0] } });
    assert.equal(created.status, 201, await created.clone().text());
    const { inviteId, shortLink } = await created.json();
    const personal = shortLink.split('/').at(-1);
    const past = new Date(Date.now() - 60_000).toISOString();
    const expiry = await f.request('/api/admin/invites/control', { headers: { Authorization: f.admin }, body: { inviteId, expiresAt: past } });
    assert.equal(expiry.status, 200, await expiry.clone().text());
    assert.equal((await f.request('/api/invite?token=' + personal, { method: 'GET' })).status, 404);

    const again = await f.request('/api/admin/invites', { headers: { Authorization: f.admin }, body: { firstName: 'יואב', sourceSheet: eventConfig.sheetNames[0] } });
    const second = await again.json();
    f.sql.prepare('INSERT INTO rsvp_invite_resolutions (invite_id, canonical_id, reconciliation_id) VALUES (?, ?, ?)').run('alias-invite', second.inviteId, 'merge');
    const revoked = await f.request('/api/admin/invites/control', { headers: { Authorization: f.admin }, body: { inviteId: second.inviteId, revoke: true } });
    assert.equal(revoked.status, 200, await revoked.clone().text());
    assert.equal((await f.request('/api/invite?token=' + second.shortLink.split('/').at(-1), { method: 'GET' })).status, 404);
    assert.equal(f.sql.prepare('SELECT canonical_id FROM rsvp_invite_resolutions WHERE invite_id=?').get('alias-invite').canonical_id, null);
  } finally {
    Date.now = originalNow;
    f.sql.close();
  }
});

test('legacy expiry can be disabled', async () => {
  const f = workerFixture({ LEGACY_INVITE_TTL_SECONDS: '0' });
  const originalNow = Date.now;
  try {
    const token = legacyToken();
    assert.equal((await f.request('/api/invite?token=' + token, { method: 'GET' })).status, 200);
    Date.now = () => originalNow() + 400 * 24 * 60 * 60 * 1000;
    assert.equal((await f.request('/api/invite?token=' + token, { method: 'GET' })).status, 200);
  } finally {
    Date.now = originalNow;
    f.sql.close();
  }
});

test('basic auth requires https, distinct passwords, and locks repeated failures', async () => {
  const strong = workerFixture({ DEMO_MODE: '0', STAFF_PASSWORD: 'another-staff-secret' });
  try {
    const http = await strong.request('/admin', { method: 'GET', headers: { Authorization: strong.admin } });
    assert.equal(http.status, 200);
    const insecure = await strong.env && await import('../dist/server/index.js');
    const blocked = await insecure.default.fetch(new Request('http://example.test/admin', { headers: { Authorization: strong.admin } }), strong.env, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(blocked.status, 403);
    const weak = { ...strong.env, ADMIN_PASSWORD: 'short-pass', STAFF_PASSWORD: 'another-staff-secret' };
    assert.equal((await insecure.default.fetch(new Request('https://example.test/admin'), weak, { waitUntil() {}, passThroughOnException() {} })).status, 503);
    const same = { ...strong.env, ADMIN_PASSWORD: 'same-long-password', STAFF_PASSWORD: 'same-long-password' };
    assert.equal((await insecure.default.fetch(new Request('https://example.test/find-table'), same, { waitUntil() {}, passThroughOnException() {} })).status, 503);

    const wrong = `Basic ${btoa('admin:wrong-password-value')}`;
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const failed = await insecure.default.fetch(new Request('https://example.test/admin', { headers: { Authorization: wrong } }), strong.env, ctx);
      assert.equal(failed.status, attempt < 7 ? 401 : 429);
    }
    const locked = await insecure.default.fetch(new Request('https://example.test/admin', { headers: { Authorization: strong.admin } }), strong.env, ctx);
    assert.equal(locked.status, 429);
    strong.sql.prepare('UPDATE auth_lockouts SET locked_until=0').run();
    assert.equal((await insecure.default.fetch(new Request('https://example.test/admin', { headers: { Authorization: strong.admin } }), strong.env, { waitUntil() {}, passThroughOnException() {} })).status, 200);

    const sites = { ...strong.env, AUTH_MODE: 'sites' };
    const refused = await insecure.default.fetch(new Request('https://example.test/admin', { headers: { 'oai-authenticated-user-email': 'admin@example.test' } }), sites, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(refused.status, 503);
    const trusted = { ...sites, SITES_DISPATCH_SECRET: 'dispatch-secret-value' };
    const missing = await insecure.default.fetch(new Request('https://example.test/admin'), trusted, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(missing.status, 401);
    const accepted = await insecure.default.fetch(new Request('https://example.test/api/admin/data', { headers: { 'x-sites-dispatch': 'dispatch-secret-value', 'oai-authenticated-user-email': 'admin@example.test' } }), trusted, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(accepted.status, 200, await accepted.clone().text());
    const warned = await insecure.default.fetch(new Request('https://example.test/admin', { headers: { 'oai-authenticated-user-email': 'admin@example.test' } }), { ...strong.env, AUTH_MODE: 'sites', DEMO_MODE: '1' }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(warned.headers.get('x-auth-warning'), 'AUTH_MODE=sites trusts identity headers without a dispatch secret');
  } finally {
    strong.sql.close();
  }
});

test('webhook HMAC stays optional until required and then covers the raw body', async () => {
  const f = workerFixture({ WEBHOOK_HMAC_REQUIRED: '1' });
  try {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomUUID();
    const body = {};
    const raw = JSON.stringify(body);
    const headers = { Authorization: 'Bearer test-sync-secret', 'X-Webhook-Timestamp': timestamp, 'X-Webhook-Nonce': nonce };
    assert.equal((await f.request('/api/admin/seating/sync', { headers })).status, 401);
    const signature = await webhookBodySignature('test-sync-secret', timestamp, nonce, raw);
    assert.equal((await f.request('/api/admin/seating/sync', { headers: { ...headers, 'X-Webhook-Signature': 'v1=tampered' } })).status, 401);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM webhook_nonces').get().n, 0);
    assert.equal((await f.request('/api/admin/seating/sync', { headers: { ...headers, 'X-Webhook-Signature': signature }, body })).status, 200);
  } finally {
    f.sql.close();
  }
});

test('guest retention runs only after the configured instant and matches the manual script', async () => {
  const script = readFileSync(new URL('../scripts/purge-guest-data.sql', import.meta.url), 'utf8');
  const statements = script.split('\n').map(line => line.trim()).filter(line => line.startsWith('DELETE ') || line.startsWith('DROP ')).map(line => line.replace(/;$/, ''));
  assert.deepEqual(statements, guestPurgeStatements);
  const f = workerFixture({ GUEST_DATA_RETENTION_AT: '2999-01-01T00:00:00Z' });
  const { default: worker } = await import('../dist/server/index.js');
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  try {
    f.sql.prepare('INSERT INTO invite_controls (invite_id, expires_at, revoked_at) VALUES (?, ?, NULL)').run('demo-invite', 1);
    f.sql.prepare('INSERT INTO auth_lockouts (key, failures, locked_until) VALUES (?, 1, 0)').run('abc');
    await worker.scheduled({}, f.env, ctx);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM seating_sources').get().n, 1);
    f.env.GUEST_DATA_RETENTION_AT = 'not-a-date';
    await worker.scheduled({}, f.env, ctx);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM seating_sources').get().n, 1);
    f.env.GUEST_DATA_RETENTION_AT = '2000-01-01T00:00:00Z';
    await worker.scheduled({}, f.env, ctx);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM seating_sources').get().n, 0);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM invite_controls').get().n, 0);
    assert.equal(f.sql.prepare('SELECT count(*) AS n FROM auth_lockouts').get().n, 0);
    await worker.scheduled({}, f.env, ctx);
  } finally {
    f.sql.close();
  }
});

test('hosted invites can be revoked per guest and a public origin must be https', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  const migrations = new URL('../hosted/migrations/', import.meta.url);
  for (const name of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(name, migrations), 'utf8'));
  const now = Date.now();
  const owner = 'owner-account';
  const eventId = '10000000-0000-4000-8000-000000000001';
  const guestId = '30000000-0000-4000-8000-000000000003';
  sql.prepare('INSERT INTO accounts VALUES (?, ?, ?)').run(owner, owner, now);
  sql.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(createHash('sha256').update('a'.repeat(43)).digest('base64url'), owner, now + 86_400_000);
  sql.prepare('INSERT INTO events (event_id, owner_id, title, event_date, time_zone, purge_at) VALUES (?, ?, ?, ?, ?, ?)').run(eventId, owner, 'חתונה', '2027-06-10', 'Asia/Jerusalem', now + 86_400_000);
  sql.prepare('INSERT INTO guests (event_id, guest_id, name, max_guests) VALUES (?, ?, ?, ?)').run(eventId, guestId, 'נועה', 2);
  const db = {
    prepare(query) {
      return { bind(...values) {
        return {
          async first() { return sql.prepare(query).get(...values) ?? null; },
          async all() { return { results: sql.prepare(query).all(...values) }; },
          async run() { return { meta: sql.prepare(query).run(...values) }; },
        };
      } };
    },
    async batch() { throw new Error('unused'); },
  };
  const origin = 'https://weddings.example.test';
  const secret = Buffer.alloc(32, 7).toString('base64url');
  const env = {
    HOSTED_DB: db, HOSTED_ORIGIN: origin, HOSTED_INVITE_SECRET: secret,
    LOGIN_LIMIT: { limit: async () => ({ success: true }) },
    OWNER_LIMIT: { limit: async () => ({ success: true }) },
    RECOVERY_LIMIT: { limit: async () => ({ success: true }) },
    GUEST_LIMIT: { limit: async () => ({ success: true }) },
    CLIENT_LIMIT: { limit: async () => ({ success: true }) },
  };
  const worker = createHostedWorker();
  const cookie = '__Host-hosted_session=' + 'a'.repeat(43);
  try {
    const token = await signInvitation(await invitationKey(secret), eventId, guestId, 1, now);
    const open = await worker.fetch(new Request(origin + '/invite/' + token), env);
    assert.equal(open.status, 200);
    const revoked = await worker.fetch(new Request(origin + `/events/${eventId}/invites/${guestId}/revoke`, {
      method: 'POST', headers: { origin, cookie },
    }), env);
    assert.equal(revoked.status, 303);
    assert.equal((await worker.fetch(new Request(origin + '/invite/' + token), env)).status, 404);
    const fresh = await signInvitation(await invitationKey(secret), eventId, guestId, 2, now);
    assert.equal((await worker.fetch(new Request(origin + '/invite/' + fresh), env)).status, 200);
    const unsafe = createHostedWorker();
    assert.equal((await unsafe.fetch(new Request('https://weddings.example.test/'), { ...env, HOSTED_ORIGIN: 'http://weddings.example.test' })).status, 503);
    assert.equal((await unsafe.fetch(new Request('http://127.0.0.1:4174/health'), { ...env, HOSTED_ORIGIN: 'http://127.0.0.1:4174' })).status, 200);
  } finally {
    sql.close();
  }
});
