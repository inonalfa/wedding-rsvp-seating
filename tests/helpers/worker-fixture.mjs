import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { eventConfig } from '../../config/event.ts';
const { default: worker } = await import('../../dist/server/index.js');
export function workerFixture(overrides = {}) {
  const sql = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), 'utf8'));
  const DB = {
    prepare(query) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return sql.prepare(query).get(...args) ?? null; },
        async all() { return { results: sql.prepare(query).all(...args), success: true, meta: {} }; },
        async raw() { const statement = sql.prepare(query); statement.setReturnArrays(true); return statement.all(...args); },
        async run() { const result = sql.prepare(query).run(...args); return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const ranges = eventConfig.sheetNames.map(name => ({ range: `'${name}'!A1:T1`, values: [[]] }));
  sql.prepare('INSERT INTO seating_sources VALUES (1,?,?)').run(JSON.stringify(ranges), new Date().toISOString());
  sql.prepare('INSERT INTO seating_plans VALUES (1,?,1,?)').run(JSON.stringify({ tables: [] }), new Date().toISOString());
  const env = { DB, ADMIN_PASSWORD: 'test-admin-password', ADMIN_EMAILS: 'admin@example.test', SEATING_SYNC_SECRET: 'test-sync-secret', MAKE_WEBHOOK_URL: 'https://webhook.example.test', INVITE_SHORT_TOKEN_SECRET: Buffer.alloc(32, 7).toString('base64url'), ASSETS: { fetch: async () => new Response('', { status: 404 }) }, ...overrides };
  const request = (path, { method = 'POST', body, headers = {} } = {}) => worker.fetch(new Request(`https://example.test${path}`, {
    method, headers: { Origin: 'https://example.test', 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, { waitUntil() {}, passThroughOnException() {} });
  return { sql, env, request, admin: `Basic ${btoa('admin:test-admin-password')}` };
}
