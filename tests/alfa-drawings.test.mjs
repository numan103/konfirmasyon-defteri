import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LEVELS, TOOLS, fibPrice, positionStats, makeDrawing, validDrawing, validateDocument, DrawingHistory,
  emptyDocument, timeToLogical, logicalToTime, logicalToPixel, pixelToLogical, clone } from '../assets/alfa-drawings-model.mjs';
import { DrawingStore } from '../assets/alfa-drawings-store.mjs';
const a = { time: 1700000000, price: 60000 }, b = { time: 1700036000, price: 65000 };
const docWith = (...drawings) => ({ ...emptyDocument(), drawings });
test('Fibonacci retraces from second anchor, including exact 0.382 mathematics in both directions', () => {
  assert.deepEqual(LEVELS, [0, .236, .382, .5, .618, .705, .786, 1]);
  assert.equal(fibPrice(60000, 65000, .382), 63090);
  assert.equal(fibPrice(65000, 60000, .382), 61910);
  assert.equal(fibPrice(60000, 65000, .382, true), 61910);
  assert.equal(fibPrice(60000, 65000, 0), 65000);
  assert.equal(fibPrice(60000, 65000, 1), 60000);
});
test('all drawing types create valid timestamp/price data without pixels', () => {
  for (const type of Object.keys(TOOLS).filter(t => !['cursor', 'delete'].includes(t))) {
    const d = makeDrawing(type, ['text', 'label', 'horizontal', 'vertical'].includes(type) ? [a] : [a, b]);
    assert.equal(validDrawing(d), true, type);
    assert.deepEqual(Object.keys(d.points[0]).sort(), ['price', 'time']);
    assert.equal(validateDocument(docWith(d)).drawings.length, 1);
  }
});
for (const type of ['long', 'short']) {
  test(`${type} default 2.5R, price risk, TP and moving stop recalculate correctly`, () => {
    const d = makeDrawing(type, [a, { ...b, price: 59000 }]);
    const sign = type === 'long' ? 1 : -1;
    assert.equal(d.points[1].price, 60000 - sign * 1000);
    assert.equal(d.target, 60000 + sign * 2500);
    assert.equal(positionStats(d).rr, 2.5);
    assert.equal(positionStats(d).riskPercent, 1000 / 60000 * 100);
    assert.equal(positionStats(d).gainPercent, 2500 / 60000 * 100);
    d.points[1].price = 60000 - sign * 500;
    assert.equal(positionStats(d).rr, 5);
    d.points[0].price = 60000 + sign * 500;
    assert.equal(positionStats(d).rr, 2);
    d.target = 60000 + sign * 1500;
    assert.equal(positionStats(d).rr, 1);
    d.points[1].price = d.points[0].price;
    assert.equal(validDrawing(d), false);
  });
}
test('time projection round trips through irregular bars and extrapolation without snapping anchor timestamps', () => {
  const bars = [{ time: 1000 }, { time: 1060 }, { time: 1300 }];
  for (const time of [900, 1000, 1033.25, 1100, 1300, 1500]) {
    assert.ok(Math.abs(logicalToTime(timeToLogical(time, bars, 60), bars, 60) - time) < 1e-8);
  }
  const point = { time: 1712345678, price: 64222.5 };
  const bars1h = [{ time: 1712340000 }, { time: 1712343600 }, { time: 1712347200 }];
  const bars4h = [{ time: 1712332800 }, { time: 1712347200 }];
  for (const [series, step] of [[bars1h, 3600], [bars4h, 14400]]) {
    assert.equal(logicalToTime(timeToLogical(point.time, series, step), series, step), point.time);
  }
  assert.equal(timeToLogical(1000, [], 60), null);
});
test('fractional/timeframe anchor projections work with integer-only LWC 5.0.9 coordinate API', () => {
  const native = i => Number.isInteger(i) ? i * 8.25 - 7000 : 0;
  for (const logical of [-10.25, 0, 20.345, 973.5, 1020.5]) {
    const px = logicalToPixel(logical, native);
    assert.equal(px, logical * 8.25 - 7000);
    assert.ok(Math.abs(pixelToLogical(px, native) - logical) < 1e-9);
  }
  assert.equal(logicalToPixel(.5, () => null), null);
  assert.equal(pixelToLogical(1, () => 0), null);
});
test('undo/redo isolates documents, restores edits/hide/lock/delete and truncates redo on new change', () => {
  const h = new DrawingHistory(), d = makeDrawing('trend', [a, b]);
  h.commit(docWith(d));
  let next = clone(h.doc); next.drawings[0].hidden = true; next.drawings[0].locked = true; h.commit(next);
  assert.equal(h.undo(), true); assert.equal(h.doc.drawings[0].hidden, false);
  assert.equal(h.redo(), true); assert.equal(h.doc.drawings[0].locked, true);
  h.commit(emptyDocument()); h.undo(); assert.equal(h.doc.drawings.length, 1);
  h.undo(); h.commit(docWith(makeDrawing('text', [a]))); assert.equal(h.redo(), false);
  assert.equal(d.hidden, false);
});
test('malformed drawings, invalid levels, duplicate IDs and oversized text are rejected', () => {
  const fib = makeDrawing('fibonacci', [a, b]);
  for (const mutate of [
    d => d.points[0].price = NaN, d => d.points[0].time = -1,
    d => d.levels = [], d => d.levels = [Infinity], d => d.width = 100, d => d.color = 'url(evil)'
  ]) { const d = clone(fib); mutate(d); assert.throws(() => validateDocument(docWith(d))); }
  assert.throws(() => validateDocument(docWith(fib, fib)));
  const text = makeDrawing('text', [a]); text.text = 'x'.repeat(501);
  assert.equal(validDrawing(text), false);
  const position = makeDrawing('long', [a, b]);
  position.target = Infinity; assert.equal(validDrawing(position), false);
  position.target = NaN; assert.equal(validDrawing(position), false);
  const malformed = clone(fib); malformed.points[0] = null;
  assert.equal(validDrawing(malformed), false);
  const badTemplate = docWith(fib); badTemplate.templates.push({ name: 'bad', style: { type: 'text', text: 'override' } });
  assert.throws(() => validateDocument(badTemplate));
});
test('Fibonacci templates survive document serialization, styles and reversal included', () => {
  const d = makeDrawing('fibonacci', [a, b]), doc = docWith(d);
  doc.templates.push({ name: 'Alfa', style: { levels: [0, .382, .705, 1], color: '#ffffff', width: 3, reversed: true, showPrices: false } });
  const loaded = validateDocument(JSON.parse(JSON.stringify(doc)));
  const second = makeDrawing('fibonacci', [a, b], loaded.templates[0].style);
  assert.equal(second.reversed, true); assert.equal(second.width, 3); assert.equal(second.levels[1], .382);
});
test('guest persistence survives reload and is isolated by account and symbol', async () => {
  const memory = new Map();
  globalThis.localStorage = { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v) };
  const store = new DrawingStore(() => {}, () => {});
  const btc = await store.load('BTCUSDT'); store.save(btc, docWith(makeDrawing('horizontal', [a])));
  const eth = await store.load('ETHUSDT'); assert.equal(eth.doc.drawings.length, 0);
  const reloaded = new DrawingStore(() => {}, () => {});
  assert.equal((await reloaded.load('BTCUSDT')).doc.drawings[0].points[0].price, 60000);
  const owner = { owner: 'another-user', symbol: 'BTCUSDT' };
  assert.equal(store.read(owner), null);
  assert.equal(await store.load('BTCUSDT'), btc, 'same context reused to avoid revision races');
  store.dispose(); reloaded.dispose();
});
test('cloud adapter uses authenticated row filters, optimistic revisions and refuses overwrite on conflict', async () => {
  const memory = new Map(); globalThis.localStorage = { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v) };
  const calls = [], statuses = [];
  const store = new DrawingStore(() => {}, (_ctx, s) => statuses.push(s));
  store.user = { id: 'user-a' };
  let row = null, conflict = false;
  const client = {
    from(table) {
      assert.equal(table, 'chart_drawings');
      const q = { mode: 'read', filters: [] };
      const query = {
        select() { return query; },
        eq(k, v) { q.filters.push([k, v]); return query; },
        insert(r) { q.mode = 'insert'; q.row = r; return query; },
        update(r) { q.mode = 'update'; q.row = r; return query; },
        async maybeSingle() {
          calls.push(q);
          if (q.mode === 'read') return { data: row && { document: row.document, revision: row.revision } };
          if (conflict) return { data: null };
          row = q.row; return { data: { revision: row.revision } };
        }
      };
      return query;
    }
  };
  store.client = client;
  const ctx = await store.load('BTCUSDT');
  store.save(ctx, docWith(makeDrawing('horizontal', [a]))); clearTimeout(ctx.timer); await store.flush(ctx);
  assert.equal(row.user_id, 'user-a'); assert.equal(row.symbol, 'BTCUSDT'); assert.equal(ctx.revision, 1);
  const next = clone(ctx.doc); next.drawings[0].points[0].price = 61000;
  conflict = true; store.save(ctx, next); clearTimeout(ctx.timer); await store.flush(ctx);
  assert.equal(ctx.blocked, true); assert.equal(row.document.drawings[0].points[0].price, 60000);
  assert.ok(calls.at(-1).filters.some(([k, v]) => k === 'revision' && v === 1));
  assert.ok(calls.at(-1).filters.some(([k, v]) => k === 'user_id' && v === 'user-a'));
  assert.equal(store.read(ctx).dirty, true);
  store.dispose();
});
test('schema enforces account isolation; Phase 1 transport remains independent', () => {
  const sql = fs.readFileSync(new URL('../supabase/site/007_chart_drawings.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/); assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.match(sql, /primary key \(user_id, symbol\)/);
  const engine = fs.readFileSync(new URL('../assets/alfa-drawings.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /new WebSocket|api\/v3|createChart/);
});
test('overlapping cloud loads share one request; a temporary outage can safely retry', async () => {
  const memory = new Map(); globalThis.localStorage = { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v) };
  let requestCount = 0, release, fail = true;
  const store = new DrawingStore(() => {}, () => {}); store.user = { id: 'owner' };
  store.client = { from() {
    const query = { select() { return query; }, eq() { return query; },
      async maybeSingle() { requestCount++; if (requestCount === 1) await new Promise(r => { release = r; }); return fail ? { error: new Error('offline') } : { data: null }; } };
    return query;
  } };
  const first = store.load('BTCUSDT'), second = store.load('BTCUSDT');
  release();
  const [ctx, other] = await Promise.all([first, second]);
  assert.equal(ctx, other); assert.equal(requestCount, 1); assert.equal(ctx.blocked, true);
  store.save(ctx, docWith(makeDrawing('text', [a])));
  assert.equal(store.read(ctx).dirty, true);
  fail = false; await store.retry(ctx); clearTimeout(ctx.timer);
  assert.equal(ctx.blocked, false); assert.equal(ctx.doc.drawings.length, 1);
  store.dispose();
});
