import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('legacy Vercel short links are mirrored by Cloudflare _redirects', () => {
  const legacy = JSON.parse(read('vercel.json'));
  const redirects = (legacy.redirects || []).filter(r => !r.permanent);
  assert.ok(redirects.length > 0);
  const cloudflare = read('_redirects').split(/\r?\n/)
    .map(line => line.trim().replace(/(\d+)!$/, '$1')).filter(Boolean);
  for (const { source, destination } of redirects) {
    const expected = `${source} ${destination} 302`;
    assert.ok(cloudflare.includes(expected), `Cloudflare _redirects eksik: ${expected}`);
  }
});

test('Cloudflare wrappers do not depend on Vercel runtime files', () => {
  const dir = path.join(root, 'functions', 'api');
  const wrappers = fs.readdirSync(dir).filter(name => name.endsWith('.js')).sort();
  assert.equal(wrappers.length, 12, 'Hobby 12-function limit must stay exact');
  for (const name of wrappers) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.doesNotMatch(source, /@vercel|middleware\.js|vercel\.json/,
      `${name} hâlâ Vercel runtime'ına bağlı`);
    assert.match(source, /export async function onRequest/);
    const envCopy = source.indexOf('process.env[k] = v;');
    const importAt = source.indexOf('await import(');
    assert.ok(envCopy > -1 && importAt > envCopy,
      `${name} import'u context.env kopyasından önce yapıyor`);
  }
});

test('API no-store headers survive the migration', () => {
  const headers = read('_headers');
  assert.match(headers, /\/api\/\*[\s\S]*Cache-Control: private, no-store/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  const ai = read('functions/api/ai.js');
  assert.match(ai, /readOnlyHeaders|setHeader|statusCode/);
});

test('scheduled jobs call the Cloudflare custom domain, not the legacy Vercel host', () => {
  const workflow = read('.github/workflows/news-poll.yml');
  assert.match(workflow, /https:\/\/alfa-trader\.com\/api\/ai\?news=1/);
  assert.match(workflow, /https:\/\/alfa-trader\.com\/api\/ai\?calendar=1/);
  const macro = read('supabase/site/003_macro_schedule.sql') + read('supabase/site/004_macro_events.sql');
  assert.match(macro, /url := 'https:\/\/alfa-trader\.com\/api\/ai\?macro=1&action=run'/);
  assert.match(macro, /https:\/\/alfa-trader\.com\/api\/ai\?macro=1&action=agenda/);
  assert.match(macro, /https:\/\/alfa-trader\.com\/api\/ai\?macro=1&action=events/);
  assert.doesNotMatch(workflow + macro, /vercel\.app/);
});

test('migration documentation records the canonical layout and the real limits', () => {
  const doc = read('docs/vercel-to-cloudflare.md');
  for (const token of [
    'alfa-trader.com',
    'wrangler.cmd pages deploy',
    'nodejs_compat',
    'SUPABASE_SERVICE_ROLE',
    'BLOB_READ_WRITE_TOKEN',
    'middleware.js',
    '_redirects',
    '12/12',
    'zvnjslmptwmnuhftgqsr',
    '401',
  ]) assert.ok(doc.includes(token), `migration doc missing ${token}`);

  const overview = read('docs/site-overview.md');
  assert.match(overview, /Cloudflare Pages/);
  assert.doesNotMatch(overview, /Vercel üzerinde/);

  const supabaseReadme = read('supabase/site/README.md');
  assert.match(supabaseReadme, /Cloudflare Pages/);
  assert.match(supabaseReadme, /_redirects/);
  assert.doesNotMatch(supabaseReadme, /vercel\.json` redirect/);
});

test('feature flags are multiplexed through the existing ai wrapper', () => {
  const ai = read('api/ai.mjs');
  for (const flag of [
    'telegram-webhook', 'influencer', 'coinalyze', 'orderbook',
    'mentorNews', 'macro', 'cron',
  ]) assert.ok(
    ai.includes(`req.query?.${flag}`) || ai.includes(`'${flag}'`),
    `api/ai.mjs must multiplex ${flag}`,
  );

  const legacyAuthKey = read('assets/alfa-charts.mjs');
  assert.match(legacyAuthKey, /sb-zvnjslmptwmnuhftgqsr-auth-token/,
    'legacy localStorage key must remain for user data continuity');
});
