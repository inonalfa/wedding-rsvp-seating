import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerFixture } from './helpers/worker-fixture.mjs';
test('guest purge clears every migrated application table and runtime seating snapshot', () => {
  const f = workerFixture();
  try {
    f.sql.exec("CREATE TABLE seating_sheet_sync (id INTEGER PRIMARY KEY, snapshot TEXT); INSERT INTO seating_sheet_sync VALUES (1, 'synthetic snapshot')");
    assert.ok(f.sql.prepare('SELECT count(*) AS n FROM seating_sources').get().n);
    f.sql.exec(readFileSync(new URL('../scripts/purge-guest-data.sql', import.meta.url), 'utf8'));
    const tables = f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    assert.ok(tables.length >= 16);
    for (const { name } of tables) assert.equal(f.sql.prepare(`SELECT count(*) AS n FROM "${name}"`).get().n, 0, name);
    assert.equal(f.sql.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='seating_sheet_sync'").get().n, 0);
    f.sql.exec(readFileSync(new URL('../scripts/purge-guest-data.sql', import.meta.url), 'utf8')); // Repeatable.
  } finally { f.sql.close(); }
});
