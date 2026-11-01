import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  cleanNotionToken,
  notionDatabases,
  mapNotionTrade,
  notionSync
} from '../ayna-server/notion.mjs';
import notionSyncAction from '../ayna-server/actions/notion-sync.mjs';

const uid = '22222222-2222-4222-8222-222222222222';
const pageId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function notionPage(overrides = {}) {
  const properties = {
    Tarih: { type: 'date', date: { start: '2026-10-30' } },
    Pair: { type: 'select', select: { name: 'btc' } },
    Position: { type: 'select', select: { name: 'Short' } },
    Profit: { type: 'number', number: -1.5 },
    'Karar Kalitesi': { type: 'select', select: { name: 'Zorlama' } },
    Duygu: { type: 'multi_select', multi_select: [{ name: 'aceleci' }, { name: 'stres' }] },
    Not: { type: 'rich_text', rich_text: [{ plain_text: 'Stop sonrası ' }, { plain_text: 'tekrar girdim.' }] },
    'Trade #': { type: 'title', title: [{ plain_text: 'BTC-12' }] },
    'Trade Stratejisi': { type: 'select', select: { name: 'Breakout' } },
    'Entry Model': { type: 'select', select: { name: 'CVD' } }
  };
  return Object.assign({
    id: pageId,
    url: 'https://www.notion.so/page',
    created_time: '2026-10-30T09:00:00.000Z',
    properties
  }, overrides);
}

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(text) { this.body = JSON.parse(text); }
  };
}

function mockFetch(handler) {
  const calls = [];
  const old = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    return handler(String(url), options, calls);
  };
  return { calls, restore() { global.fetch = old; } };
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('trade mapping keeps the written note, emotions, plan flag and R', () => {
  const trade = mapNotionTrade(notionPage(), 'Kripto', uid);
  assert.equal(trade.user_id, uid);
  assert.equal(trade.source, 'notion');
  assert.equal(trade.source_id, pageId);
  assert.equal(trade.symbol, 'BTC');
  assert.equal(trade.direction, 'short');
  assert.equal(trade.local_date, '2026-10-30');
  assert.equal(trade.pnl, -1.5);
  assert.equal(trade.planned, false);
  assert.deepEqual(trade.emotions, ['aceleci', 'stres']);
  assert.equal(trade.note, 'Stop sonrası tekrar girdim.');
  assert.equal(trade.raw.market, 'Kripto');
  assert.equal(trade.raw.quality, 'Zorlama');
  assert.equal(trade.raw.trade_no, 'BTC-12');
  assert.equal(trade.raw.strategy, 'Breakout');
  assert.equal(trade.raw.entry_model, 'CVD');
});

test('trade mapping uses fallbacks, caps the note and skips pages without a date', () => {
  const page = notionPage({
    properties: {
      Tarih: { type: 'date', date: { start: '2026-10-31' } },
      Not: { type: 'rich_text', rich_text: [{ plain_text: 'x'.repeat(4000) }] },
      Profit: { type: 'rich_text', rich_text: [{ plain_text: '2,25' }] }
    }
  });
  const trade = mapNotionTrade(page, 'Fx', uid);
  assert.equal(trade.note.length, 2000);
  assert.equal(trade.pnl, 2.25);
  assert.equal(trade.planned, null);
  assert.equal(trade.direction, null);
  assert.equal(trade.symbol, null);
  const noDate = notionPage({ properties: { Pair: { select: { name: 'ETH' } } }, created_time: 'not-a-date' });
  assert.equal(mapNotionTrade(noDate, 'Kripto', uid), null);
});

test('database ids and tokens are validated instead of trusting the client', () => {
  assert.equal(cleanNotionToken('ntn_1234567890abcdefghij'), 'ntn_1234567890abcdefghij');
  assert.equal(cleanNotionToken('short'), null);
  assert.equal(cleanNotionToken('bad token with spaces'), null);
  assert.equal(cleanNotionToken(null), null);

  const dashed = notionDatabases({ kripto: '380f5619-53ab-8088-b5f9-ffd53a397de9', fx: '' });
  assert.deepEqual(dashed, [{ id: '380f561953ab8088b5f9ffd53a397de9', market: 'Kripto' }]);
  assert.equal(notionDatabases({ kripto: '../../etc/passwd' }), undefined);
  assert.equal(notionDatabases({ kripto: '', fx: '' }), null);
  assert.equal(notionDatabases('{"fx":"380f561953ab80938bdbfc07fcef2de1"}')[0].market, 'Fx');
});

test('notion sync queries each database, maps notes and upserts on the composite key', async () => {
  const seen = [];
  const mock = mockFetch((url, options) => {
    if (url.includes('/databases/') && !url.includes('/query')) {
      return json({ properties: { Tarih: { type: 'date' } } });
    }
    if (url.includes('/query')) {
      seen.push(JSON.parse(options.body));
      return json({ results: [notionPage()], has_more: false, next_cursor: null });
    }
    if (url.includes('/rest/v1/ayna_trades')) return new Response('', { status: 201 });
    return json({});
  });
  try {
    const result = await notionSync({ service: true }, uid, { token: 'ntn_1234567890abcdefghij', dbs: [{ id: 'db1', market: 'Kripto' }] });
    assert.equal(result.upserted, 1);
    assert.equal(result.withNotes, 1);
    assert.equal(result.firstDate, '2026-10-30');
    assert.equal(seen[0].sorts[0].property, 'Tarih');
    assert.equal(seen[0].sorts[0].direction, 'descending');
    const upsert = mock.calls.find((call) => call.url.includes('ayna_trades'));
    assert.ok(upsert.url.includes('on_conflict=user_id,source,source_id'));
    assert.equal(upsert.body[0].note, 'Stop sonrası tekrar girdim.');
    assert.equal(upsert.body[0].source, 'notion');
  } finally { mock.restore(); }
});

test('notion errors keep their status so the action can map them', async () => {
  const mock = mockFetch(() => new Response('nope', { status: 401 }));
  try {
    await assert.rejects(
      () => notionSync({ service: true }, uid, { token: 'ntn_1234567890abcdefghij', dbs: [{ id: 'db1', market: 'Kripto' }] }),
      (error) => error.status === 401
    );
  } finally { mock.restore(); }
});

test('the deployment Notion token is only used for a confirmed admin', async () => {
  const previous = process.env.NOTION_TOKEN;
  process.env.NOTION_TOKEN = 'ntn_1234567890abcdefghij';
  try {
    // A member without their own token must never borrow the owner's workspace.
    const member = fakeRes();
    await notionSyncAction({ res: member, auth: { service: true }, user: { id: uid, email: 'member@example.com', email_confirmed_at: '2026-01-01' }, body: {} });
    assert.equal(member.statusCode, 409);
    assert.equal(member.body.error, 'notion_not_connected');

    const unconfirmed = fakeRes();
    await notionSyncAction({ res: unconfirmed, auth: { service: true }, user: { id: uid, email: 'ahmetnuman20@gmail.com', email_confirmed_at: null }, body: {} });
    assert.equal(unconfirmed.statusCode, 409);

    const badToken = fakeRes();
    await notionSyncAction({ res: badToken, auth: { service: true }, user: { id: uid, email: 'ahmetnuman20@gmail.com', email_confirmed_at: '2026-01-01' }, body: { token: 'bad token' } });
    assert.equal(badToken.statusCode, 400);
  } finally {
    if (previous === undefined) delete process.env.NOTION_TOKEN; else process.env.NOTION_TOKEN = previous;
  }
});

test('admin fallback syncs and exposes no server token in the response', async () => {
  const previous = process.env.NOTION_TOKEN;
  process.env.NOTION_TOKEN = 'ntn_1234567890abcdefghij';
  const mock = mockFetch((url) => {
    if (url.includes('/databases/') && !url.includes('/query')) return json({ properties: {} });
    if (url.includes('/query')) return json({ results: [], has_more: false });
    if (url.includes('/rest/v1/ayna_profiles')) return json([]);
    return json([]);
  });
  try {
    const res = fakeRes();
    await notionSyncAction({ res, auth: { service: true }, user: { id: uid, email: 'ahmetnuman20@gmail.com', email_confirmed_at: '2026-01-01' }, body: {} });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.upserted, 0);
    assert.equal(JSON.stringify(res.body).includes('ntn_1234567890abcdefghij'), false);
  } finally {
    mock.restore();
    if (previous === undefined) delete process.env.NOTION_TOKEN; else process.env.NOTION_TOKEN = previous;
  }
});

test('notion failure codes stay actionable', async () => {
  const previous = process.env.NOTION_TOKEN;
  process.env.NOTION_TOKEN = 'ntn_1234567890abcdefghij';
  const mock = mockFetch(() => new Response('denied', { status: 401 }));
  try {
    const res = fakeRes();
    await notionSyncAction({ res, auth: { service: true }, user: { id: uid, email: 'ahmetnuman20@gmail.com', email_confirmed_at: '2026-01-01' }, body: {} });
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'notion_auth');
  } finally {
    mock.restore();
    if (previous === undefined) delete process.env.NOTION_TOKEN; else process.env.NOTION_TOKEN = previous;
  }
});

test('the site journal sync uses the schema composite conflict key', () => {
  const source = fs.readFileSync(new URL('../ayna-server/actions/sync.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('ayna_trades?on_conflict=user_id,source,source_id'));
  assert.ok(source.includes('ayna_expenses?on_conflict=user_id,source,source_id'));
});
