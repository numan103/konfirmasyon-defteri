import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRevisionCache } from '../lib/revision-cache.mjs';
import { createWindowRowsCache } from '../lib/window-rows-cache.mjs';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('source cache coalesces requests, clones documents, and checks small revisions before downloading unchanged JSON', async () => {
  let now = 0, revision = 'one', reads = 0, probes = 0;
  const cache = createRevisionCache({ clock: () => now });
  const check = async () => { probes++; return revision; };
  const load = async () => { reads++; return { value: { nested: { title: revision } }, revision }; };
  const [a, b] = await Promise.all([cache.get('feed', check, load), cache.get('feed', check, load)]);
  assert.equal(reads, 1); a.nested.title = 'changed by caller'; assert.equal(b.nested.title, 'one');
  assert.equal((await cache.get('feed', check, load)).nested.title, 'one');
  now = 11000; await cache.get('feed', check, load);
  assert.equal(probes, 1); assert.equal(reads, 1);
  now = 22000; revision = 'two';
  assert.equal((await cache.get('feed', check, load)).nested.title, 'two'); assert.equal(reads, 2);
  cache.invalidate('feed'); await cache.get('feed', check, load); assert.equal(reads, 3);
  now = 400000; await cache.get('feed', check, load); assert.equal(reads, 4, 'bounded hard lifetime');
});
test('failed revision probes never return stale data as a successful fresh read', async () => {
  let now = 0; const cache = createRevisionCache({ clock: () => now });
  await cache.get('x', async () => 'r', async () => ({ value: [1], revision: 'r' }));
  now = 11000;
  await assert.rejects(cache.get('x', async () => { throw new Error('402'); }, async () => ({ value: [] })), /402/);
});
test('in-flight source reads cannot re-populate a cache invalidated by a write', async () => {
  let release, reads = 0;
  const cache = createRevisionCache();
  const first = cache.get('x', async () => null, async () => {
    reads++; await new Promise(r => { release = r; }); return { value: 'old', revision: 'one' };
  });
  cache.invalidate('x'); release(); await first;
  assert.equal(await cache.get('x', async () => 'two', async () => { reads++; return { value: 'new', revision: 'two' }; }), 'new');
  assert.equal(reads, 2);
});
function browserCache() {
  const context = vm.createContext({ Map, structuredClone, Date });
  vm.runInContext(read('assets/shared-documents.js'), context);
  return context.AlfaSharedDocuments;
}
test('browser shared-document cache isolates owners, deduplicates, validates RLS reads and notices new revisions', async () => {
  let now = 0, revision = 'one', denied = false, missing = false;
  const cache = browserCache().create({ clock: () => now }), calls = [];
  const client = { from(table) {
    assert.equal(table, 'alfanews'); let select;
    const q = { select(s) { select = s; return q; }, eq() { return q; }, async maybeSingle() {
      calls.push(select);
      if (denied) return { error: new Error('RLS denied') };
      if (missing) return { data: null };
      return { data: select === 'updated_at' ? { updated_at: revision } : { data: { title: revision }, updated_at: revision } };
    } }; return q;
  } };
  const [a, b] = await Promise.all([cache.read(client, 'a', 1), cache.read(client, 'a', 1)]);
  assert.equal(calls.length, 1); a.data.data.title = 'local change'; assert.equal(b.data.data.title, 'one');
  await cache.read(client, 'b', 1); assert.equal(calls.length, 2, 'different owner must read independently');
  now = 11000; await cache.read(client, 'a', 1); assert.equal(calls.at(-1), 'updated_at');
  revision = 'two'; now = 22000;
  assert.equal((await cache.read(client, 'a', 1)).data.data.title, 'two');
  cache.invalidate('a', 1); await cache.read(client, 'a', 1); assert.equal(calls.at(-1), 'data,updated_at');
  denied = true; now = 40000;
  await assert.rejects(cache.read(client, 'a', 1), /RLS denied/);
  denied = false; missing = true;
  assert.equal((await cache.read(client, 'a', 1)).data, null, 'deleted source must not resurrect cached data');
  await assert.rejects(cache.read(client, 'a', 999));
});
test('inactive News/Mentoring sections do not query Supabase at boot', async () => {
  const html = read('index.html');
  for (const [name, end] of [['loadNews', 'function magAuthor'], ['loadMentor', 'async function saveMentor']]) {
    const start = html.indexOf('async function ' + name + '('), stop = html.indexOf(end, start);
    let calls = 0;
    const context = vm.createContext({ currentPage: 'home', AUTH: { client: { from() { calls++; throw new Error('should not query'); } } } });
    vm.runInContext(html.slice(start, stop), context);
    assert.equal(await context[name](), false); assert.equal(calls, 0);
  }
  assert.match(html, /if \(name === 'news'\) openSharedPage/);
  assert.match(html, /if \(name === 'mentoring'\) openSharedPage/);
  assert.match(html, /if \(!beacon && document\.hidden\) return/);
  assert.match(html, /var ANA_FLUSH_MS = 60000/);
});
test('client polling stays above the free-plan egress floors', () => {
  const html = read('index.html');
  for (const pattern of [
    /setInterval\(panoPoll, 15000\)/,
    /setInterval\(statsHeartbeat, 60000\)/,
    /setInterval\(statsRefresh, 60000\)/,
    /setInterval\(statsFetchTotal, 120000\)/,
    /function initAutoReload\(\)[\s\S]{0,1000}\},\s*120000\);/,
  ]) assert.match(html, pattern);
  for (const pattern of [
    /setInterval\(panoPoll, 2500\)/,
    /setInterval\(statsHeartbeat, 30000\)/,
    /setInterval\(statsRefresh, 15000\)/,
    /setInterval\(statsFetchTotal, 30000\)/,
    /\}, 4000\);\s*\}\s*function startChatPoll/,
    /\}, 5000\);\s*\}\s*\/\/ Kapalı sohbet/,
  ]) assert.doesNotMatch(html, pattern);

  const charts = read('assets/alfa-charts.mjs');
  assert.match(charts, /setInterval\(tick, quoteOnly \? 60000 : 30000\)/);
  assert.match(charts, /lastReceipt > 60000\) reconnect\([^)]*\); \}, 10000\)/);
  const watchlist = read('assets/alfa-watchlist.mjs');
  assert.match(watchlist, /setInterval\([^\n]+refreshQuotes\(\); \}, 60000\)/);
  const studies = read('assets/alfa-public-studies.mjs');
  assert.match(studies, /Math\.min\(600, Math\.max\(60,/);
  const portfolio = read('assets/my-portfolio.mjs');
  assert.match(portfolio, /const PRICE_TTL = 60000/);
  const news = read('assets/economic-news.mjs');
  assert.match(news, /\}, 120000\);/);
});
test('projection migration is additive, RLS-invoker, and never moves/deletes source rows', () => {
  const sql = read('supabase/site/008_egress_projections.sql');
  assert.equal((sql.match(/security_invoker = true/g) || []).length, 3);
  assert.doesNotMatch(sql, /\b(delete|truncate|drop)\s+(from|table|view)/i);
  assert.match(sql, /begin;/); assert.match(sql, /commit;/);
  assert.match(sql, /left\(p->>'text', 220\)/);
  const landing = read('lib/landing.mjs'), contrib = read('api/contrib.mjs');
  assert.match(landing, /rest\/v1\/alfa_landing_preview/);
  assert.match(landing, /rest\/v1\/alfa_landing_images/);
  assert.match(contrib, /rest\/v1\/alfa_social_images/);
  assert.match(contrib, /req\.method === 'GET' \? readPublicShared\(AT_ROW\) : readShared\(AT_ROW\)/);
  assert.match(contrib, /updated_at: new Date\(\)\.toISOString\(\)/);
});
test('all classic inline scripts remain syntactically valid', () => {
  const html = read('index.html');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/src=|application\/ld\+json|type=["']module/.test(match[1]) || !match[2].trim()) continue;
    new vm.Script(match[2]);
  }
});
test('home teasers coalesce requests, cache confirmed empty results, and never download full feed on failure', async () => {
  const html = read('index.html'), start = html.indexOf('const HOME_CHANNEL_WINDOW_MS'), end = html.indexOf('function sortedData()', start);
  let calls = 0, full = 0, fail = false;
  const box = {};
  const ctx = vm.createContext({
    Date, alfaLoaded: false, alfaPosts: [], refUnlocked: () => false,
    document: { getElementById: () => box },
    loadAlfaTrading: async () => { full++; },
    fetch: async () => { calls++; return { ok: !fail, status: fail ? 503 : 200,
      json: async () => ({ channel: { trades: { latest: [] }, biases: { latest: [] } } }) }; }
  });
  vm.runInContext(html.slice(start, end), ctx);
  await Promise.all([ctx.loadHomeChannelPosts(), ctx.loadHomeChannelPosts()]);
  await ctx.loadHomeChannelPosts(); assert.equal(calls, 1, 'empty successful results also cached');
  fail = true; vm.runInContext('homeChannelCache.at = 0', ctx);
  await assert.rejects(ctx.loadHomeChannelPosts());
  await ctx.renderHomeChannel();
  assert.equal(full, 0); assert.match(box.textContent, /yüklenemiyor/);
});
test('incremental admin reports read only changed rows, retain unchanged rows, overlap timestamps and expire deletions', async () => {
  const since = '2026-11-01T00:00:00.000Z';
  let now = Date.parse('2026-11-15T12:00:00.000Z');
  const cache = createWindowRowsCache({ clock: () => now });
  const row = (id, time, value) => ({ id, updated_at: time, data: { value } });
  let db = [row('old', '2026-11-02T00:00:00.000Z', 1), row('recent', '2026-11-15T11:59:00.500Z', 2)];
  const filters = [];
  const load = async filter => { filters.push(filter); return { rows: structuredClone(db.filter(r => r.updated_at >= filter)) }; };
  assert.equal((await cache.read('7', since, load)).rows.length, 2);
  db[1] = row('recent', '2026-11-15T11:59:30.000Z', 3);
  const updated = await cache.read('7', since, load);
  assert.equal(filters[1], '2026-11-15T11:58:59.500Z');
  assert.equal(updated.rows.find(r => r.id === 'recent').data.value, 3);
  assert.equal(updated.rows.find(r => r.id === 'old').data.value, 1);
  updated.rows[0].data.value = 999;
  db = db.filter(r => r.id !== 'old');
  assert.equal((await cache.read('7', since, load)).rows.find(r => r.id === 'recent').data.value, 3);
  now += 301000;
  const refreshed = await cache.read('7', since, load);
  assert.equal(refreshed.rows.length, 1); assert.equal(filters.at(-1), since);
  cache.clear(); await cache.read('7', since, load); assert.equal(filters.at(-1), since);
});
test('incremental reports never disguise upstream errors, truncated baselines or invalid windows', async () => {
  const cache = createWindowRowsCache();
  const since = '2026-11-01T00:00:00.000Z', calls = [];
  const truncated = async filter => { calls.push(filter); return { rows: [{ id: 'x', updated_at: since, data: {} }], truncated: true }; };
  await cache.read('x', since, truncated); await cache.read('x', since, truncated);
  assert.deepEqual(calls, [since, since], 'truncated baseline cannot be used for incremental reads');
  const failure = await cache.read('x', since, async () => ({ error: 'read_402', rows: [] }));
  assert.equal(failure.error, 'read_402');
  await assert.rejects(cache.read('x', 'invalid', truncated), /invalid_report_window/);
  const html = read('api/analytics.mjs');
  assert.ok(html.indexOf("if (!user || !user.admin)") < html.indexOf('const out = await readVisitRows'));
  assert.match(html, /if \(pruned\) visitReads\.clear/);
});
