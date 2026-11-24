import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { OVERLAY_CATALOG, normalizeStudyState } from '../assets/alfa-chart-studies.mjs';
import { PUBLIC_STUDY_NAMES, normalizePublicStudyConfig } from '../assets/alfa-public-studies.mjs';
import { PUBLIC_STUDY_DETAILS, PUBLIC_MARKET_SOURCES } from '../assets/alfa-market-data-public.mjs';

test('alarm scope is permanent guidance outside the replaceable permission hint', () => {
  const code = fs.readFileSync(new URL('../assets/alfa-charts.mjs', import.meta.url), 'utf8');
  const note = code.slice(code.indexOf('<aside id="alarm-scope"'), code.indexOf('<form id="alarm-form"'));
  assert.match(note, /role="note"/);
  assert.match(note, /yalnızca seçili sembol/);
  assert.match(note, /Sekme\/cihaz kapalıyken/);
  assert.match(note, /Replay sırasında çalışmaz/);
  assert.match(note, /arka plandaki sekmeyi duraklatabilir/);
  assert.match(note, /7\/24 sunucu alarmı değildir/);
  assert.match(note, /Telegram ve webhook/);
  assert.match(code, /id="alarm-form"[^>]*aria-describedby="alarm-scope"/);
  assert.doesNotMatch(code, /\$\('alarm-scope'\)\.textContent|querySelector\('#alarm-scope'\)\.textContent/);
  assert.doesNotMatch(code, /ses ve Telegram çalışmaya devam eder/);
});

test('catalogue and runtime names share honest footprint and liquidity metadata', () => {
  for (const id of ['footprint', 'heatmap']) {
    const item = OVERLAY_CATALOG.find(item => item.id === id), details = PUBLIC_STUDY_DETAILS[id];
    assert.equal(item.name, details.name);
    assert.equal(PUBLIC_STUDY_NAMES[id], details.name);
    assert.equal(item.description, details.description);
    assert.ok(Object.isFrozen(details));
  }
  assert.match(PUBLIC_STUDY_DETAILS.footprint.name, /özeti/);
  assert.match(PUBLIC_STUDY_DETAILS.footprint.description, /fiyat kademeli bid\/ask footprint değildir/);
  assert.match(PUBLIC_STUDY_DETAILS.footprint.scope, /imbalance hücreleri gösterilmez/);
  assert.match(PUBLIC_STUDY_DETAILS.heatmap.name, /anlık emir defteri/);
  assert.match(PUBLIC_STUDY_DETAILS.heatmap.scope, /tarihsel ısı haritası veya kesintisiz veri akışı değildir/);
});

test('active flow study source labels describe klines rather than unused aggTrades adapters', () => {
  for (const id of ['cvdSpot', 'cvdPerp', 'marketDelta', 'footprint']) {
    assert.match(PUBLIC_MARKET_SOURCES[id], /klines taker hacmi/);
    assert.doesNotMatch(PUBLIC_MARKET_SOURCES[id], /aggTrades/);
  }
  assert.match(PUBLIC_MARKET_SOURCES.heatmap, /anlık görüntüsü/);
});

test('old study IDs and settings remain byte-compatible after display-name changes', () => {
  const state = { footprint: { added: true, visible: false }, heatmap: { added: true, visible: true } };
  const before = structuredClone(state), normalized = normalizeStudyState(state);
  assert.deepEqual(normalized.footprint, state.footprint);
  assert.deepEqual(normalized.heatmap, state.heatmap);
  assert.deepEqual(state, before);
  const footprint = { market: 'perp', color: '#123456', refresh: 120 };
  const heatmap = { market: 'spot', levels: 30, refresh: 180, bidColor: '#123456', askColor: '#654321' };
  assert.deepEqual(normalizePublicStudyConfig('footprint', footprint), footprint);
  assert.deepEqual(normalizePublicStudyConfig('heatmap', heatmap), heatmap);
});
