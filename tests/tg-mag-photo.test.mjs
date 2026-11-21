import test from 'node:test';
import assert from 'node:assert/strict';

const KEYS = ['TG_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE', 'SUPABASE_PUBLISHABLE'];
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

async function load(env) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const mod = await import('../api/tg.mjs?mag-photo=' + Math.random());
  return mod.default;
}

function res() {
  const headers = {};
  return {
    headers,
    setHeader(k, v) { headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

test('magazine photo proxy accepts Telegram octet-stream JPEG by sniffing bytes', async t => {
  const fileId = 'octet_stream_photo_' + Date.now();
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.includes('/rest/v1/alfanews')) return { ok: true, json: async () => [{ data: { entries: [{ photoIds: [fileId] }] } }] };
    if (u.includes('/getFile')) return { ok: true, json: async () => ({ ok: true, result: { file_path: 'photos/x.jpg' } }) };
    if (u.includes('/file/bot')) return { ok: true, headers: { get: () => 'application/octet-stream' }, arrayBuffer: async () => jpeg };
    throw new Error('unexpected fetch ' + u);
  };
  const handler = await load({ TG_BOT_TOKEN: 'token', SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE: 'svc' });
  const out = res();
  await handler({ method: 'GET', query: { magPhoto: fileId }, headers: {} }, out);
  assert.equal(out.code, 200);
  assert.equal(out.headers['Content-Type'], 'image/jpeg');
  assert.deepEqual(out.body, jpeg);
});

test('magazine photo proxy still rejects non-image bytes from an allowed file id', async t => {
  const fileId = 'not_an_image_' + Date.now();
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.includes('/rest/v1/alfanews')) return { ok: true, json: async () => [{ data: { entries: [{ photoIds: [fileId] }] } }] };
    if (u.includes('/getFile')) return { ok: true, json: async () => ({ ok: true, result: { file_path: 'photos/x.bin' } }) };
    if (u.includes('/file/bot')) return { ok: true, headers: { get: () => 'application/octet-stream' }, arrayBuffer: async () => Buffer.from('not an image') };
    throw new Error('unexpected fetch ' + u);
  };
  const handler = await load({ TG_BOT_TOKEN: 'token', SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE: 'svc' });
  const out = res();
  await handler({ method: 'GET', query: { magPhoto: fileId }, headers: {} }, out);
  assert.equal(out.code, 415);
  assert.equal(out.body.error, 'unsupported_media');
});
