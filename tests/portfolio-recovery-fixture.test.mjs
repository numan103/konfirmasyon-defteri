import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = new URL('../tests/browser/fixtures/portfolio-recovered.snapshot.json', import.meta.url);
const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));

test('portfolio recovery browser fixture stays synthetic and recovery-shaped', () => {
  assert.match(snapshot.note, /Synthetic/i, 'the committed fixture must never contain real user data');
  assert.equal(snapshot.v, 2);
  assert.ok(snapshot.positions.some(p => p.type === 'altin' && p.id.startsWith('gold_xau_')));
  assert.ok(snapshot.sells.length > 0);
  assert.ok(snapshot.sells.every(s => s.buyDate && s.date), 'every sale shows a purchase -> sale date range');
  assert.ok(Array.isArray(snapshot.history));
});

test('portfolio recovery fixture keeps the exact realized-profit regression value', () => {
  const realized = snapshot.sells.reduce((sum, sale) => {
    const raw = sale.pnl ?? sale.profit;
    const value = Number(raw);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  assert.ok(Math.abs(realized - 268.576777025) < 1e-8);
});
