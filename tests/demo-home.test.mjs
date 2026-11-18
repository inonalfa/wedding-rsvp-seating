import assert from 'node:assert/strict';
import test from 'node:test';
import { workerFixture } from './helpers/worker-fixture.mjs';

async function homepage(fixture) {
  return fixture.request('/', { method: 'GET', headers: { Accept: 'text/html' } });
}

test('Try the demo box renders only in demo mode', async () => {
  const normal = workerFixture();
  const demo = workerFixture({ DEMO_MODE: '1', DEMO_AUTH: '1' });
  try {
    const normalHtml = await (await homepage(normal)).text();
    assert.doesNotMatch(normalHtml, /נסו את המערכת/);

    const demoHtml = await (await homepage(demo)).text();
    assert.match(demoHtml, /נסו את המערכת/);
    assert.match(demoHtml, /ניהול - הסיסמה זמינה לפי בקשה/);
    assert.match(demoHtml, /חיפוש השולחן מוגן בסיסמת צוות/);
  } finally {
    normal.sql.close();
    demo.sql.close();
  }
});

test('runtime-signed fictional demo invitation resolves successfully', async () => {
  const fixture = workerFixture({ DEMO_MODE: '1', DEMO_AUTH: '1' });
  try {
    const html = await (await homepage(fixture)).text();
    const href = html.match(/href="\/\?invite=([^"&]+)#rsvp"/)?.[1];
    assert.ok(href, 'demo invitation link was not rendered');
    const token = decodeURIComponent(href);
    const invitation = await fixture.request(`/api/invite?token=${encodeURIComponent(token)}`, { method: 'GET' });
    assert.equal(invitation.status, 200, await invitation.clone().text());
    const body = await invitation.json();
    assert.equal(body.inviteId, 'demo-a-1');
    assert.equal(body.fullName, 'נועה');
  } finally {
    fixture.sql.close();
  }
});
