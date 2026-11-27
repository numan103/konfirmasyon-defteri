import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// A cache-busted module must be re-requested at every hop. Bumping only the
// top-level entry point leaves older browsers on a stale import graph, which
// is how the anonymous quote fix kept reaching the authenticated API.
const expected = {
  'alfa-charts.html': { 'alfa-charts.mjs': 112 },
  'assets/alfa-charts.mjs': {
    'alfa-charts-data.mjs': 14,
    'alfa-watchlist.mjs': 14,
    'alfa-mtf.mjs': 4,
    'alfa-replay-data.mjs': 3,
    'alfa-public-studies.mjs': 10,
    'alfa-multichart.mjs': 9,
    'alfa-paper.mjs': 7,
    'alfa-research.mjs': 5,
    'alfa-research-model.mjs': 3
  },
  'assets/alfa-watchlist.mjs': {
    'alfa-charts-data.mjs': 14,
    'alfa-watchlist-model.mjs': 12
  },
  'assets/alfa-multichart.mjs': {
    'alfa-charts-data.mjs': 14,
    'alfa-watchlist-model.mjs': 12
  },
  'assets/alfa-lab.mjs': { 'alfa-excursions.mjs': 3 },
  'assets/alfa-paper.mjs': { 'alfa-lab.mjs': 4 },
  'assets/alfa-research.mjs': {
    'alfa-research-model.mjs': 3,
    'alfa-research-sync.mjs': 5,
    'alfa-research-transport.mjs': 3
  },
  'assets/alfa-research-sync.mjs': { 'alfa-research-model.mjs': 3 },
  'assets/alfa-research-transport.mjs': { 'alfa-research-model.mjs': 3 },
  'assets/alfa-watchlist-model.mjs': { 'alfa-charts-data.mjs': 14 },
  'assets/alfa-excursions.mjs': { 'alfa-charts-data.mjs': 14 },
  'assets/alfa-mtf.mjs': { 'alfa-charts-data.mjs': 14 },
  'assets/alfa-public-studies.mjs': { 'alfa-charts-data.mjs': 14 },
  'assets/alfa-replay-data.mjs': { 'alfa-charts-data.mjs': 14 }
};

const stale = [
  'alfa-charts.mjs?v=111', 'alfa-charts-data.mjs?v=13', 'alfa-charts-data.mjs?v=12',
  'alfa-watchlist.mjs?v=13', 'alfa-watchlist-model.mjs?v=11', 'alfa-watchlist-model.mjs?v=10',
  'alfa-excursions.mjs?v=2', 'alfa-lab.mjs?v=3', 'alfa-paper.mjs?v=6',
  'alfa-mtf.mjs?v=3', 'alfa-multichart.mjs?v=8', 'alfa-public-studies.mjs?v=9',
  'alfa-replay-data.mjs?v=2', 'alfa-research-model.mjs?v=2',
  'alfa-research.mjs?v=4', 'alfa-research-sync.mjs?v=4', 'alfa-research-transport.mjs?v=2'
];

test('anonymous quote modules are cache-busted at every import hop', () => {
  for (const [file, imports] of Object.entries(expected)) {
    const source = read(file);
    for (const [module, version] of Object.entries(imports)) {
      assert.ok(source.includes(`${module}?v=${version}`), `${file} must import ${module}?v=${version}`);
    }
  }
  const files = [...Object.keys(expected), 'assets/alfa-charts.mjs'];
  for (const file of [...new Set(files)]) {
    const source = read(file);
    for (const token of stale) assert.ok(!source.includes(token), `${file} still references stale ${token}`);
  }
});
