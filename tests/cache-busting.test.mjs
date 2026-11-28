import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// A cache-busted module must be re-requested at every hop. Bumping only the
// top-level entry point leaves older browsers on a stale import graph, which
// is how both the anonymous quote fix and the Binance direct-quote fix could
// keep reaching the broken path.
const expected = {
  'alfa-charts.html': { 'alfa-charts.css': 69, 'alfa-charts.mjs': 115 },
  'assets/alfa-charts.mjs': {
    'alfa-charts-data.mjs': 15,
    'alfa-drawings.mjs': 23,
    'alfa-watchlist.mjs': 16,
    'alfa-chart-studies.mjs': 16,
    'alfa-mtf.mjs': 5,
    'alfa-replay-data.mjs': 4,
    'alfa-public-studies.mjs': 11,
    'alfa-multichart.mjs': 10,
    'alfa-paper.mjs': 8,
    'alfa-research.mjs': 6,
    'alfa-research-model.mjs': 4
  },
  'assets/alfa-watchlist.mjs': {
    'alfa-charts-data.mjs': 15,
    'alfa-watchlist-model.mjs': 13
  },
  'assets/alfa-multichart.mjs': {
    'alfa-charts-data.mjs': 15,
    'alfa-watchlist-model.mjs': 13
  },
  'assets/alfa-lab.mjs': { 'alfa-excursions.mjs': 4 },
  'assets/alfa-paper.mjs': { 'alfa-lab.mjs': 5 },
  'assets/alfa-research.mjs': {
    'alfa-research-model.mjs': 4,
    'alfa-research-sync.mjs': 6,
    'alfa-research-transport.mjs': 4
  },
  'assets/alfa-research-sync.mjs': { 'alfa-research-model.mjs': 4 },
  'assets/alfa-research-transport.mjs': { 'alfa-research-model.mjs': 4 },
  'assets/alfa-watchlist-model.mjs': { 'alfa-charts-data.mjs': 15 },
  'assets/alfa-excursions.mjs': { 'alfa-charts-data.mjs': 15 },
  'assets/alfa-mtf.mjs': { 'alfa-charts-data.mjs': 15 },
  'assets/alfa-public-studies.mjs': { 'alfa-charts-data.mjs': 15 },
  'assets/alfa-replay-data.mjs': { 'alfa-charts-data.mjs': 15 }
};

const stale = [
  'alfa-charts.mjs?v=114', 'alfa-charts.mjs?v=113', 'alfa-charts.mjs?v=112', 'alfa-charts.mjs?v=111',
  'alfa-charts.css?v=68',
  'alfa-charts-data.mjs?v=14', 'alfa-charts-data.mjs?v=13', 'alfa-charts-data.mjs?v=12',
  'alfa-drawings.mjs?v=22', 'alfa-drawings.mjs?v=21', 'alfa-drawings.mjs?v=20',
  'alfa-chart-studies.mjs?v=15', 'alfa-chart-studies.mjs?v=14',
  'alfa-watchlist.mjs?v=15', 'alfa-watchlist.mjs?v=14', 'alfa-watchlist.mjs?v=13',
  'alfa-watchlist-model.mjs?v=12', 'alfa-watchlist-model.mjs?v=11', 'alfa-watchlist-model.mjs?v=10',
  'alfa-excursions.mjs?v=3', 'alfa-excursions.mjs?v=2',
  'alfa-lab.mjs?v=4', 'alfa-lab.mjs?v=3',
  'alfa-paper.mjs?v=7', 'alfa-paper.mjs?v=6',
  'alfa-mtf.mjs?v=4', 'alfa-mtf.mjs?v=3',
  'alfa-multichart.mjs?v=9', 'alfa-multichart.mjs?v=8',
  'alfa-public-studies.mjs?v=10', 'alfa-public-studies.mjs?v=9',
  'alfa-replay-data.mjs?v=3', 'alfa-replay-data.mjs?v=2',
  'alfa-research-model.mjs?v=3', 'alfa-research-model.mjs?v=2',
  'alfa-research.mjs?v=5', 'alfa-research.mjs?v=4',
  'alfa-research-sync.mjs?v=5', 'alfa-research-sync.mjs?v=4',
  'alfa-research-transport.mjs?v=3', 'alfa-research-transport.mjs?v=2'
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
