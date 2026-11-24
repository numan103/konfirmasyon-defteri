import test from 'node:test';
import assert from 'node:assert/strict';
import { indicatorPaneHeight } from '../assets/alfa-indicators.mjs';
import { isPaneStudy, studyChipClass } from '../assets/alfa-chart-studies.mjs';

test('legend marks only native oscillator rows as double-click pane targets', () => {
  const rsi = { id: 'rsi', name: 'RSI', visible: true, collapsed: false, pane: 'oscillator',
    item: { def: { pane: 'oscillator' } } };
  const fvg = { id: 'fvg', name: 'FVG / IFVG', visible: true, collapsed: false };

  assert.equal(isPaneStudy(rsi), true);
  assert.equal(isPaneStudy(fvg), false);
  assert.match(studyChipClass(rsi), /\bstudy-chip\b/);
  assert.match(studyChipClass(rsi), /\bis-pane-study\b/);
  assert.doesNotMatch(studyChipClass(rsi), /\bis-hidden\b/);
  assert.doesNotMatch(studyChipClass(rsi), /\bis-collapsed\b/);
  assert.match(studyChipClass({ ...rsi, visible: false }, true), /\bis-hidden\b/);
  assert.match(studyChipClass({ ...rsi, collapsed: true }), /\bis-collapsed\b/);
  assert.doesNotMatch(studyChipClass(fvg), /is-pane-study/);
});

test('oscillator pane collapses to a ribbon and stays bounded when expanded', () => {
  assert.equal(indicatorPaneHeight(700, true), 30);
  assert.equal(indicatorPaneHeight(700, false), 150);
  assert.equal(indicatorPaneHeight(250, false), 80);
  assert.equal(indicatorPaneHeight(400, false), 88);
});
