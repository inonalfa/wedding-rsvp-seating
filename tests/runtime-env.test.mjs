import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('environment examples document every Worker scalar variable with a comment', () => {
  const worker = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
  const expected = [...new Set([...worker.matchAll(/env\.([A-Z][A-Z_]+)/g)].map(match => match[1]))].filter(key => !['DB', 'ASSETS', 'IMAGES'].includes(key)).sort();
  for (const filename of ['.dev.vars.example', '.env.example']) {
    const lines = readFileSync(new URL('../' + filename, import.meta.url), 'utf8').split('\n');
    const keys = [];
    lines.forEach((line, index) => {
      const match = line.match(/^([A-Z][A-Z_]+)=/);
      if (match) { keys.push(match[1]); assert.match(lines[index - 1], /^# .+/, match[1] + ' needs a one-line comment'); }
    });
    assert.deepEqual(keys.sort(), expected, filename);
  }
});
