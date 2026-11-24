import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every API handler has a Cloudflare Pages wrapper with the matching import', () => {
  const handlers = fs.readdirSync(path.join(root, 'api')).filter(name => name.endsWith('.mjs')).sort();
  assert.ok(handlers.length > 0);
  for (const name of handlers) {
    const wrapper = path.join(root, 'functions', 'api', name.replace(/\.mjs$/, '.js'));
    assert.ok(fs.existsSync(wrapper), `${name} eksik Cloudflare wrapper'ı: functions/api/${name.replace(/\.mjs$/, '.js')}`);
    const source = fs.readFileSync(wrapper, 'utf8');
    assert.ok(source.includes(`await import('../../api/${name}')`),
      `${name} wrapper'ı handler'ı context.env kopyalandıktan sonra import etmiyor`);
    assert.ok(!/^import handler/m.test(source), `${name} wrapper'ı handler'ı hâlâ modül yüklenirken import ediyor`);
    assert.match(source, /export async function onRequest/);
    const envCopy = source.indexOf('process.env[k] = v;');
    assert.ok(envCopy > -1 && envCopy < source.indexOf(`await import('../../api/${name}')`),
      `${name} wrapper'ında env kopyası import'tan önce gelmiyor`);
  }
});

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

test('Cloudflare /api/ai serves mentorship trades as JSON, not the static HTML page', async () => {
  const { onRequest } = await import('../functions/api/ai.js');
  const response = await onRequest({
    request: new Request('https://example.test/api/ai?mentorTrades=1'),
    env: {},
  });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(response.headers.get('vary'), /Authorization/);
  assert.deepEqual(JSON.parse(await response.text()), { ok: false, error: 'unauthorized' });
});

test('Cloudflare config declares Node compatibility for crypto and binary API routes', () => {
  const config = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
  assert.match(config, /^compatibility_date = "\d{4}-\d{2}-\d{2}"$/m);
  assert.match(config, /^compatibility_flags = \["nodejs_compat"\]$/m);
});

test('Cloudflare /api/tg is a real function wrapper', async () => {
  const source = fs.readFileSync(path.join(root, 'functions', 'api', 'tg.js'), 'utf8');
  assert.match(source, /await import\('\.\.\/\.\.\/api\/tg\.mjs'\)/);
  assert.match(source, /ArrayBuffer\.isView\(data\)/);
});

test('handler config is read from context.env only, before the module is imported', () => {
  const wrapperUrl = pathToFileURL(path.join(root, 'functions', 'api', 'contrib.js')).href;
  const script = `const captured = [];
globalThis.fetch = async (url) => {
  captured.push(String(url));
  return new Response(JSON.stringify([{ updated_at: '2026-01-01T00:00:00+00:00', data: { posts: [] } }]), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
const { onRequest } = await import(${JSON.stringify(wrapperUrl)});
const response = await onRequest({
  request: new Request('https://example.test/api/contrib?store=alfatrading'),
  env: { SUPABASE_URL: 'https://env-only.supabase.co', SUPABASE_PUBLISHABLE: 'env-only-key' },
});
console.log(JSON.stringify({ status: response.status, urls: captured }));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, SUPABASE_URL: '', SUPABASE_PUBLISHABLE: '', SUPABASE_SERVICE_ROLE: '' },
  });
  assert.equal(child.status, 0, child.stderr);
  const out = JSON.parse(child.stdout.trim().split('\n').at(-1));
  assert.equal(out.status, 200);
  assert.ok(out.urls.length > 0, 'the request must reach Supabase through the wrapper');
  assert.ok(out.urls.every(url => url.startsWith('https://env-only.supabase.co/rest/v1/')),
    'module-level Supabase config must come from context.env, not process startup: ' + JSON.stringify(out.urls));
});
