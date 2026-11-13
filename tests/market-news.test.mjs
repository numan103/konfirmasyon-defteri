import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  scoreNews, isTargetRelevant, isHighImpact, isHardEvent, newsEventKey,
  pickNewsToSend, istanbulDateKey, formatNewsMessage,
} from '../lib/market-news.mjs';

const item = (title, description = '') => ({ source: 'Test', title, description, pubDate: new Date().toUTCString() });

test('generic tech and preview headlines never reach the BTC/gold feed', () => {
  const noise = [
    item('US Dollar Rises Early Friday Ahead of PPI, Federal Reserve Appearances'),
    item('Nvidia has shed nearly $500 billion in market value this week. It is still a $4 trillion AI behemoth.'),
    item('How a sex scandal at Nvidia is putting pressure on the White House'),
    item('Outlook outage continues as Microsoft flags encouraging recovery progress'),
    item('Microsoft stock slumps on outage that includes the Copilot tool it has been heavily promoting'),
    item('Russian crude production rebounds after Trump diesel deal, IEA says as oil markets return to surplus'),
    item('Tesla earnings beat expectations as layoffs continue'),
  ];
  for (const n of noise) {
    assert.equal(scoreNews(n), 0, n.title);
    assert.equal(isTargetRelevant(n), false, n.title);
  }
});

test('news that really moves BTC or gold scores high', () => {
  const btc = item('Bitcoin drops 6% to $68,700, eyes $67,000 support');
  const gold = item('Geopolitical complexities drive a surge in real interest rates; Federal Reserve officials highlight inflation concerns, putting pressure on gold prices.');
  const fed = item('Fed cuts rates by 25 basis points as inflation cools');
  assert.ok(scoreNews(btc) >= 4);
  assert.ok(scoreNews(gold) >= 4);
  assert.ok(scoreNews(fed) >= 3);
  assert.equal(isHighImpact(btc), true);
  assert.equal(isHighImpact(gold), true);
});

test('same event is deduped across different headlines', () => {
  const a = item('Bitcoin drops 6% to $68,700, eyes $67,000 support');
  const b = item('Why Is Bitcoin Crashing? 5 Pressures That Pushed BTC Below $69,000');
  const etf = item('Spot Bitcoin ETF approval sends BTC above $70,000');
  const gold = item('Gold surges to record high as dollar weakens');
  assert.equal(newsEventKey(a), newsEventKey(b));
  assert.notEqual(newsEventKey(a), newsEventKey(etf));
  assert.match(newsEventKey(gold), /^gold:/);
});

test('daily cap allows at most two alerts and resets next day', () => {
  const btc = item('Bitcoin drops 6% to $68,700');
  const gold = item('Gold surges to record high as dollar weakens');
  const fed = item('Fed cuts rates by 25 basis points');
  const today = istanbulDateKey();
  const items = [btc, gold, fed];

  assert.equal(pickNewsToSend(items, { day: today, events: [] }, 2, today), btc);
  assert.equal(pickNewsToSend(items, { day: today, events: [newsEventKey(btc)] }, 2, today), gold);
  assert.equal(pickNewsToSend(items, { day: today, events: [newsEventKey(btc), newsEventKey(gold)] }, 2, today), null);
  assert.equal(pickNewsToSend(items, { day: '2026-01-01', events: ['btc:selloff', 'gold:rally'] }, 2, today), btc);
  assert.equal(pickNewsToSend([btc], { day: today, events: [newsEventKey(btc)] }, 2, today), null);
});

test('Istanbul day boundary is used for the daily cap', () => {
  assert.equal(istanbulDateKey(new Date('2026-11-12T20:59:00Z')), '2026-11-12');
  assert.equal(istanbulDateKey(new Date('2026-11-12T21:30:00Z')), '2026-11-13');
});

test('hard macro releases are recognised and outrank price commentary', () => {
  const ppi = item('US PPI Slows Sharply to 0.3%, but Underlying Price Pressures Stay Firm');
  const wholesale = item('Wholesale inflation rose in October to highest annual rate in nearly four years');
  const cpi = item('CPI rises 0.4% in October as core inflation stays hot');
  const nfp = item('Nonfarm payrolls fall by 12,000; unemployment rate holds at 4.1%');
  const fomc = item('Fed holds rates steady, signals one more hike');
  const preview = item('S&P 500 Futures Gain With Focus on U.S. PPI Data and Fed Speak');
  const goldComment = item('Gold Price Today: $3,888 Friday on PPI Day After a 13-Month Low');

  for (const hard of [ppi, wholesale, cpi, nfp, fomc]) {
    assert.equal(isHardEvent(hard), true, hard.title);
    assert.ok(isTargetRelevant(hard), hard.title);
  }
  assert.equal(isHardEvent(preview), false, preview.title);
  assert.equal(isHardEvent(goldComment), false, goldComment.title);
});

test('cooldown defaults to 10 minutes and hard events sort first', () => {
  const src = fs.readFileSync(new URL('../lib/market-news.mjs', import.meta.url), 'utf8');
  assert.match(src, /NEWS_COOLDOWN_MIN \|\| 10/);
  assert.match(src, /const hard = Number\(isHardEvent\(b\)\) - Number\(isHardEvent\(a\)\);/);
  assert.match(src, /HARD_EVENT_RES/);
  assert.match(src, /wholesale \(inflation\|prices\?\)/);
});

test('news message shows at most two headlines and names BTC/gold', () => {
  const items = [
    item('Bitcoin drops 6% to $68,700'),
    item('Gold surges to record high'),
    item('Fed cuts rates by 25 basis points'),
  ];
  const text = formatNewsMessage(items, 'Etki: NEGATIF');
  assert.match(text, /BTC & Altın Önemli Haber/);
  assert.match(text, /Bitcoin drops/);
  assert.match(text, /Gold surges/);
  assert.doesNotMatch(text, /Fed cuts rates/);
});

test('handler enforces the daily cap and sends one event per alert', () => {
  const src = fs.readFileSync(new URL('../lib/market-news.mjs', import.meta.url), 'utf8');
  assert.match(src, /NEWS_DAILY_MAX/);
  assert.match(src, /skipped: 'daily_cap'/);
  assert.match(src, /pickNewsToSend\(/);
  assert.match(src, /analyzeNews\(\[picked\]\)/);
  assert.match(src, /formatNewsMessage\(\[picked\], analysis\)/);
  assert.match(src, /saveState\(seen, now, today, events\)/);
  assert.match(src, /x-github-oidc-token/);
  assert.match(src, /verifyGithubOidc/);
  assert.match(src, /market-news poll/);
});
