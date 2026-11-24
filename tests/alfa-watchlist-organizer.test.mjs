import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_TV_LIST, WATCHLIST_LIMIT, allWatchlistRefs, classifyWatchlistRef, filteredWatchlistRefs,
  groupWatchlistRefs, legacyWatchlistKeys, migrateWatchlistDocument, normalizeWatchlistDocument,
  sortWatchlistRefs, watchlistKey, watchlistMigrationKey, watchlistRefsFromDocument
} from '../assets/alfa-watchlist-model.mjs';
import { isFreeMarketRef, parseMarketRef } from '../assets/alfa-charts-data.mjs';

test('legacy seed restores the exact 44 venue refs without rewriting their identity', () => {
  assert.equal(LEGACY_TV_LIST.length, 44);
  const result = migrateWatchlistDocument({ owner: 'guest', current: null, sources: [] });
  assert.equal(result.reason, 'seeded');
  assert.equal(result.changed, true);
  assert.deepEqual(result.added, [...LEGACY_TV_LIST]);
  assert.deepEqual(allWatchlistRefs(result.doc), [...LEGACY_TV_LIST]);
  assert.equal(result.doc.activeListId, 'tv-classic');
  for (const ref of ['CME:BTC1!', 'FX_IDC:XAUTRYG', 'CRYPTOCAP:BTC.D', 'BINANCE:BTCUSDT.P', 'BINANCE:ETHBTC',
    'OKX:XAUTUSDT', 'FX:XAUUSD', 'OKX:HBARUSDT.P', 'OKX:RENDERUSDT']) {
    assert.ok(result.added.includes(ref), ref);
    assert.equal(parseMarketRef(ref).key === 'BTCUSDT' && ref !== 'BTCUSDT', false);
  }
});

test('class boot migration from unedited defaults restores exactly 44 refs, not 48', () => {
  const defaults = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];
  // The class renders normalized defaults first, but migration must inspect
  // the raw storage so the untouched seed is not persisted as a second list.
  const raw = null;
  const rendered = normalizeWatchlistDocument(raw, defaults);
  assert.deepEqual(rendered.symbols, defaults);
  const result = migrateWatchlistDocument({ owner: 'guest', current: raw, sources: [], defaults });
  assert.equal(result.reason, 'seeded');
  assert.deepEqual(result.added, [...LEGACY_TV_LIST]);
  assert.deepEqual(allWatchlistRefs(result.doc), [...LEGACY_TV_LIST]);
  assert.deepEqual(result.doc.lists.map(l => l.id), ['tv-classic']);
  assert.equal(result.doc.activeListId, 'tv-classic');
  assert.deepEqual(result.doc.symbols, [...LEGACY_TV_LIST]);
  const pristine = migrateWatchlistDocument({ owner: 'guest', current: { version: 2, name: 'İzleme listesi', symbols: defaults }, sources: [], defaults });
  assert.equal(pristine.reason, 'seeded');
  assert.deepEqual(allWatchlistRefs(pristine.doc), [...LEGACY_TV_LIST]);
  assert.deepEqual(pristine.doc.lists.map(l => l.id), ['tv-classic']);
});

test('migration merges missing legacy refs into custom lists and never removes saved symbols', () => {
  const current = { version: 1, name: 'Benim listem', symbols: ['BTCUSDT', 'XRPUSDT'] };
  const result = migrateWatchlistDocument({
    owner: 'guest', current, sources: [JSON.stringify(['FX:XAUUSD', 'OKX:BTCUSDT.P', 'BTCUSDT'])]
  });
  assert.equal(result.reason, 'merged');
  assert.deepEqual(result.added, ['FX:XAUUSD', 'OKX:BTCUSDT.P']);
  assert.deepEqual(result.doc.lists.find(l => l.id === 'main').symbols, ['BTCUSDT', 'XRPUSDT']);
  assert.deepEqual(result.doc.lists.find(l => l.id === 'tv-classic').symbols, ['FX:XAUUSD', 'OKX:BTCUSDT.P']);
  assert.equal(result.doc.activeListId, 'main');
  assert.deepEqual(allWatchlistRefs(result.doc), ['BTCUSDT', 'XRPUSDT', 'FX:XAUUSD', 'OKX:BTCUSDT.P']);
  assert.deepEqual(current.symbols, ['BTCUSDT', 'XRPUSDT']);
});

test('source priority keeps user edits and skips a complete restore without changing symbols', () => {
  const result = migrateWatchlistDocument({
    owner: 'user-42', current: null,
    sources: [JSON.stringify(['FX:EURUSD']), JSON.stringify(LEGACY_TV_LIST)],
    legacyList: ['BTCUSDT']
  });
  assert.deepEqual(result.added, ['FX:EURUSD']);
  assert.equal(result.doc.lists.find(l => l.id === result.doc.activeListId).symbols.length, 1);
  const complete = migrateWatchlistDocument({ owner: 'guest', current: result.doc, sources: [JSON.stringify(['FX:EURUSD'])] });
  assert.equal(complete.changed, false);
  assert.equal(complete.reason, 'complete');
  assert.equal(complete.shouldMark, true);
  assert.deepEqual(allWatchlistRefs(complete.doc), ['FX:EURUSD']);
});

test('document normalization accepts arrays and v1/v2 objects and preserves venue strings', () => {
  assert.deepEqual(normalizeWatchlistDocument(['BTCUSDT', 'OKX:USDTTRY', '<script>']).symbols, ['BTCUSDT', 'OKX:USDTTRY']);
  const doc = normalizeWatchlistDocument({ version: 1, name: 'Eski', symbols: ['BINANCE:BTCUSDT.P', 'FX_IDC:XAUTRYG'] });
  assert.equal(doc.version, 2);
  assert.equal(doc.name, 'Eski');
  assert.deepEqual(doc.symbols, ['BINANCE:BTCUSDT.P', 'FX_IDC:XAUTRYG']);
  assert.deepEqual(watchlistRefsFromDocument({ version: 2, name: 'Yeni', symbols: ['FX:XAUUSD'] }), ['FX:XAUUSD']);
  assert.deepEqual(watchlistRefsFromDocument(['BTCUSDT', 'CRYPTOCAP:TOTAL']), ['BTCUSDT', 'CRYPTOCAP:TOTAL']);
  assert.deepEqual(watchlistRefsFromDocument({
    symbols: ['BTCUSDT'], lists: [{ id: 'fx', name: 'FX', symbols: ['FX:EURUSD', 'OANDA:USDJPY'] }]
  }), ['BTCUSDT', 'FX:EURUSD', 'OANDA:USDJPY']);
  assert.equal(watchlistKey('user-42'), 'alfa-watchlist:v1:user-42');
  assert.equal(watchlistKey('guest'), 'alfa-watchlist:v1:guest');
  assert.equal(watchlistMigrationKey('u7'), 'alfa-watchlist:tv-migrated:v1:u7');
  assert.deepEqual(legacyWatchlistKeys('u7').lists, ['u:u7:alfa-watchlist', 'alfa-watchlist']);
  assert.deepEqual(legacyWatchlistKeys('guest').lists, ['alfa-watchlist']);
});

test('TV-style settings stay bounded and old favorites become starred classification flags', () => {
  const result = migrateWatchlistDocument({
    owner: 'user-42', current: null, sources: [],
    favorites: JSON.stringify(['FX:XAUUSD', 'CRYPTOCAP:TOTAL', '<script>'])
  });
  assert.deepEqual(allWatchlistRefs(result.doc).length, 44);
  assert.equal(result.doc.flags['FX:XAUUSD'].starred, true);
  assert.equal(result.doc.flags['CRYPTOCAP:TOTAL'].starred, true);
  assert.equal(result.doc.flags['BTCUSDT'], undefined);
  const raw = { settings: { sort: '<script>', direction: 'sideways', groupBy: 'coin', compact: true,
    showFlags: false, showQuotes: false, collapsedGroups: { forex: 1, '<img>': true } },
  flags: { FX: { color: 'red' }, 'FX:XAUUSD': { color: '#123456', note: '<b>altın</b>', starred: false } } };
  const doc = normalizeWatchlistDocument({ ...raw, symbols: ['FX:XAUUSD'] });
  assert.deepEqual(doc.settings, { sort: 'custom', direction: 'asc', groupBy: 'none', compact: true,
    showFlags: false, showQuotes: false, collapsedGroups: { forex: true } });
  assert.deepEqual(doc.flags['FX:XAUUSD'], { color: '#123456', note: '<b>altın</b>' });
  assert.equal(doc.flags.FX, undefined);
});

test('classification is display-only and grouped by venue/market without forcing coin categories', () => {
  const refs = ['BTCUSDT', 'OKX:BTCUSDT.P', 'FX:EURUSD', 'CRYPTOCAP:TOTAL', 'CBOE:VIX'];
  assert.deepEqual(groupWatchlistRefs(refs).map(g => g.id), ['crypto-spot', 'crypto-perp', 'forex', 'crypto-index', 'index']);
  assert.equal(classifyWatchlistRef('OKX:WIFUSDT').id, 'crypto-spot');
  assert.equal(classifyWatchlistRef('FX_IDC:XAUTRYG').id, 'forex');
  assert.deepEqual(groupWatchlistRefs(['BTCUSDT'])[0].refs, ['BTCUSDT']);
  assert.deepEqual(filteredWatchlistRefs(refs, 'xau'), []);
  assert.deepEqual(filteredWatchlistRefs(refs, 'eur'), ['FX:EURUSD']);
  assert.deepEqual(filteredWatchlistRefs(refs, 'crypto'), ['CRYPTOCAP:TOTAL']);
  const quotes = new Map([['BTCUSDT', { change: -2, price: 60000 }], ['FX:EURUSD', { change: 4, price: 1.1 }]]);
  assert.deepEqual(sortWatchlistRefs(refs, { sort: 'change', direction: 'desc' }, quotes).slice(0, 2), ['FX:EURUSD', 'BTCUSDT']);
  assert.deepEqual(sortWatchlistRefs(refs, { sort: 'custom' }), refs);
});

test('restored FX and crypto refs keep their public/gated data classification', () => {
  for (const ref of ['FX:EURUSD', 'FX:GBPUSD', 'CRYPTOCAP:TOTAL', 'OKX:XAUTUSDT', 'CME:BTC1!']) {
    assert.equal(isFreeMarketRef(ref), true, ref);
  }
  assert.equal(isFreeMarketRef('BTCUSDT'), false);
  assert.equal(isFreeMarketRef('BINANCE:BTCUSDT'), false);
  assert.equal(isFreeMarketRef('OKX:UNLISTED'), false);
  assert.ok(LEGACY_TV_LIST.length <= WATCHLIST_LIMIT);
  assert.ok(LEGACY_TV_LIST.every(ref => parseMarketRef(ref).key));
});
