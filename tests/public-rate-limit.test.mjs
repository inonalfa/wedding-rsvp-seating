import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const { default: worker } = await import('../dist/server/index.js');
const context = { waitUntil() {}, passThroughOnException() {} };

function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  }
  const db = {
    prepare(query) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return sql.prepare(query).get(...args) ?? null; },
        async run() { sql.prepare(query).run(...args); return { results: [], success: true }; },
      };
    },
    async batch(statements) { for (const statement of statements) await statement.run(); return []; },
  };
  const env = { DB: db, DEMO_MODE: '1', ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
  const post = (ip, body = '{}') => worker.fetch(new Request('https://example.test/api/rsvp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip }, body,
  }), env, context);
  return { sql, post };
}

test('public RSVP limits repeated requests per address and validates JSON', async () => {
  const { sql, post } = fixture();
  try {
    for (let index = 0; index < 20; index++) assert.equal((await post('203.0.113.1', '{')).status, 400);
    const limited = await post('203.0.113.1', '{');
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('Retry-After')) > 0);
    assert.equal((await post('203.0.113.2', '{')).status, 400);
    const key = sql.prepare('SELECT key FROM public_rate_limits LIMIT 1').get().key;
    assert.match(key, /^[a-f0-9]{64}$/);
  } finally { sql.close(); }
});

test('RSVP rejects unbounded guest counts before persistence', async () => {
  const { sql, post } = fixture();
  try {
    const response = await post('203.0.113.3', JSON.stringify({ fullName: 'דנה ישראלי', attendance: 'yes', guestCount: 1001 }));
    assert.equal(response.status, 400);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM rsvp_responses').get().n, 0);
  } finally { sql.close(); }
});
