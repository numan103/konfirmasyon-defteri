import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../api/notion-callback.mjs';

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (value) => { res.body = value; return res; };
  res.writeHead = (code, headers) => {
    res.statusCode = code;
    Object.keys(headers || {}).forEach((k) => { res.headers[k.toLowerCase()] = headers[k]; });
  };
  res.end = () => {};
  res.redirect = (code, location) => { res.statusCode = code; res.headers.location = location; };
  return res;
}

async function withEnv(key, value, fn) {
  const previous = process.env[key];
  if (value == null) delete process.env[key];
  else process.env[key] = value;
  try { await fn(); } finally {
    if (previous == null) delete process.env[key];
    else process.env[key] = previous;
  }
}

const baseReq = { query: {}, headers: { host: 'alfa-trader.com', 'x-forwarded-proto': 'https' } };

test('OAuth redirect URI comes from NOTION_REDIRECT_URI when set', async () => {
  await withEnv('NOTION_OAUTH_CLIENT_ID', 'client-id', async () => {
    await withEnv('NOTION_REDIRECT_URI', 'https://example.com/api/notion-callback', async () => {
      const res = mockRes();
      await handler({ ...baseReq, query: { action: 'auth' } }, res);
      assert.equal(res.statusCode, 302);
      const location = res.headers.location;
      assert.ok(location.startsWith('https://api.notion.com/v1/oauth/authorize?'));
      assert.match(location, /redirect_uri=https%3A%2F%2Fexample\.com%2Fapi%2Fnotion-callback/);
    });
  });
});

test('OAuth redirect URI falls back to the request host instead of a hardcoded domain', async () => {
  await withEnv('NOTION_OAUTH_CLIENT_ID', 'client-id', async () => {
    await withEnv('NOTION_REDIRECT_URI', null, async () => {
      const res = mockRes();
      await handler({ query: { action: 'auth' }, headers: { host: 'preview.example.com', 'x-forwarded-proto': 'https' } }, res);
      assert.match(res.headers.location, /redirect_uri=https%3A%2F%2Fpreview\.example\.com%2Fapi%2Fnotion-callback/);
    });
  });
});

test('action=uri exposes the exact value without leaking the secret', async () => {
  await withEnv('NOTION_OAUTH_CLIENT_ID', 'client-id', async () => {
    await withEnv('NOTION_OAUTH_CLIENT_SECRET', 'super-secret', async () => {
      await withEnv('NOTION_REDIRECT_URI', null, async () => {
        const res = mockRes();
        await handler({ ...baseReq, query: { action: 'uri' } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.redirect_uri, 'https://alfa-trader.com/api/notion-callback');
        assert.equal(res.body.configured, true);
        assert.ok(!JSON.stringify(res.body).includes('super-secret'));
      });
    });
  });
});

test('site treats Notion as the only trade source', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('id="tab-data"'), 'Trade journal must not be a nav tab');
  assert.ok(!html.includes('id="mnav-data"'), 'Trade journal must not be a mobile nav link');
  assert.ok(!html.includes('id="df-add"'), 'No manual trade form on the site');
  assert.ok(!html.includes('id="data-csv-btn"'), 'No CSV import');
  assert.ok(!html.includes('id="data-import-defter"'), 'No checklist import');
  assert.ok(html.includes('data-notion-oauth'));
  assert.ok(html.includes('pg.data.notionFirst'));
});

test('Notion connection is manageable from Ayna settings', () => {
  const settings = fs.readFileSync(new URL('../ayna/ayna-settings.js', import.meta.url), 'utf8');
  assert.ok(settings.includes("_settingsNotion"));
  assert.ok(settings.includes('Ayna.notion.mountSettings'));
  const notion = fs.readFileSync(new URL('../ayna/ayna-notion.js', import.meta.url), 'utf8');
  assert.ok(notion.includes('mountSettings'));
  assert.ok(notion.includes('saveToken'));
  assert.ok(notion.includes('disconnect'));
  assert.ok(notion.includes("'/api/notion-callback?action=auth'"));
});
