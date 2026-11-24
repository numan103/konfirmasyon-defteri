import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runInfluencerProbe } from '../lib/influencer-order-probe.mjs';
import { INF_PACKAGE_PRICES } from '../api/ai.mjs';

const denied = () => new Response(JSON.stringify({ code: '42501', message: 'permission denied for table influencer_orders' }), { status: 401 });
const prices = () => Response.json({
  ok: true, prices: INF_PACKAGE_PRICES, currency: 'USDT', network: 'TRC20', fx: null,
}, { headers: { 'Cache-Control': 'private, no-store' } });

function harness(overrides = {}) {
  const calls = [];
  const fixtures = { prices, denied, ...overrides };
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    const u = new URL(url);
    if (u.origin === 'https://site.example' && u.pathname === '/api/ai') return fixtures.prices();
    if (u.hostname === 'new.supabase.co' && u.pathname === '/rest/v1/influencer_orders') return fixtures.denied();
    throw new Error('unexpected fetch ' + url);
  };
  return { calls, run: extra => runInfluencerProbe({ fetchImpl, supabaseUrl: 'https://new.supabase.co', siteUrl: 'https://site.example/', ...extra }) };
}

test('live probe confirms fixed prices and service-only order table on the new project', async () => {
  const { calls, run } = harness();
  const result = await run();
  assert.equal(result.ok, true, JSON.stringify(result.checks));
  assert.deepEqual(result.checks.map(c => c.name), ['project_ref', 'fixed_prices', 'orders_service_only']);
  assert.ok(calls.every(c => !c.url.includes('zvnjslmptwmnuhftgqsr')));
  assert.match(calls[0].url, /influencer=1&op=prices/);
  assert.ok(calls[0].options.signal, 'price probe must be bounded by a timeout');
});

test('legacy project, wrong prices or readable orders fail closed', async () => {
  const legacy = await harness().run({ supabaseUrl: 'https://zvnjslmptwmnuhftgqsr.supabase.co' });
  assert.equal(legacy.ok, false);
  assert.equal(legacy.checks.length, 1);

  const wrongPrice = await harness({ prices: () => Response.json({ ok: true, prices: { video: 1 }, currency: 'USDT', network: 'TRC20' }, { headers: { 'Cache-Control': 'private, no-store' } }) }).run();
  assert.equal(wrongPrice.checks.find(c => c.name === 'fixed_prices').ok, false);

  const leaked = await harness({ denied: () => Response.json([{ id: 'secret' }]) }).run();
  assert.equal(leaked.checks.find(c => c.name === 'orders_service_only').ok, false);

  const publicCache = await harness({ prices: () => Response.json({ ok: true, prices: INF_PACKAGE_PRICES, currency: 'USDT', network: 'TRC20' }, { headers: { 'Cache-Control': 'public' } }) }).run();
  assert.equal(publicCache.checks.find(c => c.name === 'fixed_prices').ok, false);
});

test('order migration keeps RLS on and grants writes only to service_role', () => {
  const sql = fs.readFileSync(new URL('../supabase/site/015_influencer_orders.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.influencer_orders/i);
  assert.match(sql, /txid text not null unique/i);
  assert.match(sql, /status text not null default 'pending'/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.influencer_orders from anon, authenticated/i);
  assert.match(sql, /grant all on public\.influencer_orders to service_role/i);
  assert.doesNotMatch(sql, /grant [^\n]*to anon/i);
  const doc = fs.readFileSync(new URL('../docs/influencer-content.md', import.meta.url), 'utf8');
  assert.match(doc, /node scripts\/verify-influencer-orders\.mjs/);
  assert.match(doc, /priceUsdt/);
});
