import test from 'node:test';
import assert from 'node:assert/strict';

test('Cloudflare Pages adapter returns Buffer image bytes as a real image response', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const dataUri = 'data:image/png;base64,' + png.toString('base64');
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalService = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-key';
  globalThis.fetch = async (url) => {
    assert.match(String(url), /alfa_landing_images/);
    return new Response(JSON.stringify([{ img: dataUri }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const { onRequest } = await import('../functions/api/edu-shared.js');
    const response = await onRequest({
      request: new Request('https://example.test/api/edu-shared?kind=landing&image=abc123'),
      env: {},
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^image\/png/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalService === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = originalService;
  }
});

test('Cloudflare Pages adapter forwards res.redirect with its Location header', async () => {
  const keys = ['NOTION_OAUTH_CLIENT_ID', 'NOTION_OAUTH_CLIENT_SECRET'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  try {
    const { onRequest } = await import('../functions/api/notion-callback.js');
    const response = await onRequest({
      request: new Request('https://example.test/api/notion-callback'),
      env: {},
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location'), /notion-error/);
    assert.equal(await response.text(), '');
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
