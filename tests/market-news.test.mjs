import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  scoreNews, isTargetRelevant, isHighImpact, isHardEvent, newsEventKey,
  pickNewsToSend, istanbulDateKey, formatNewsMessage,
  dataReportKey, extractMacroFacts, hasClearMarketImpact, combinedEffect,
  buildFactAnalysis, normalizeEffectLine, validateAnalysis,
  newsSlotAt, nextNewsWindow, istanbulClock, newsSendHours,
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
    item('Gold Price Today: $3,888 Friday on PPI Day After a 13-Month Low, Bull $3,963, Bear $3,800'),
    item('[MARKET ANALYSIS] Fixed bearish and at fresh WTD lows into US PPI'),
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

test('admin onizleme yalnizca yonetici DM ine gonderir', () => {
  const src = fs.readFileSync(new URL('../lib/market-news.mjs', import.meta.url), 'utf8');
  assert.match(src, /adminPreview/);
  assert.match(src, /TG_ADMIN_CHAT_ID/);
  assert.match(src, /gruba gönderilmedi/);
  assert.match(src, /!force && !dryRun && !adminPreview && !slot/);
  assert.match(src, /!force && !adminPreview && sentToday >= DAILY_MAX/);
});

// --- Makro tutarlilik: ayni veri raporu, gercek yon, uydurma engeli ---

const nightCooler = item('Crypto market sees brief relief after cooler US PPI data');
const nightYields = item('10-year Treasury yield moves to 5.17% as traders weigh producer price report');

test('iki farkli PPI basligi ayni gun tek olay sayilir (data:ppi)', () => {
  assert.equal(dataReportKey(nightCooler.title), 'ppi');
  assert.equal(dataReportKey(nightYields.title), 'ppi');
  assert.equal(newsEventKey(nightCooler), 'data:ppi');
  assert.equal(newsEventKey(nightYields), 'data:ppi');
  const today = istanbulDateKey();
  // Ilk PPI gonderildiyse ayni gun ikinci PPI basligi secilmez.
  assert.equal(
    pickNewsToSend([nightCooler, nightYields], { day: today, events: ['data:ppi'] }, 2, today),
    null
  );
});

test('cooler PPI pozitif, 5.17% tahvil getirisi negatif okunur', () => {
  const cool = extractMacroFacts(nightCooler);
  assert.equal(cool.driver, 'ppi');
  assert.equal(cool.driverDirection, 'positive');
  assert.equal(cool.btc, 'positive');
  assert.equal(cool.gold, 'positive');
  assert.equal(combinedEffect(cool), 'POZITIF');

  const yields = extractMacroFacts(nightYields);
  assert.equal(yields.driver, 'yields');
  assert.equal(yields.driverDirection, 'negative');
  assert.equal(yields.metric, 5.17);
  assert.equal(yields.btc, 'negative');
  assert.equal(yields.gold, 'negative');
  assert.equal(combinedEffect(yields), 'NEGATIF');

  const hot = extractMacroFacts(item('US PPI Inflation Hits 6.5% as Bitcoin Struggles Below $70K'));
  assert.equal(hot.driver, 'ppi');
  assert.equal(hot.driverDirection, 'negative');
  assert.equal(combinedEffect(hot), 'NEGATIF');
});

test('yon belirtmeyen veri raporu bildirim olarak secilmez', () => {
  const undecided = item('Producer price report watched as traders await Fed signals');
  assert.equal(hasClearMarketImpact(undecided), false);
  const today = istanbulDateKey();
  assert.equal(
    pickNewsToSend([undecided, nightCooler], { day: today, events: [] }, 2, today),
    nightCooler
  );
});

test('AI baslikta olmayan "PPI yukselisi" yazarsa analiz reddedilir', () => {
  const facts = extractMacroFacts(nightCooler);
  const invented =
    'Etki: POZITIF\n' +
    'BTC: PPI yükselişi faiz beklentilerini artırsa da kripto rahatladı.\n' +
    'Altın: Düşük veri altını destekler.\n' +
    'Neden: PPI yükselişi doları güçlendirdi.';
  const bad = validateAnalysis(invented, facts);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'contradiction');

  const wrongEffect = invented.replace('Etki: POZITIF', 'Etki: NEGATIF');
  assert.equal(validateAnalysis(wrongEffect, facts).reason, 'effect_mismatch');
});

test('kural tabanli yedek analiz dogru yonde ve tek Etki satiri uretir', () => {
  const facts = extractMacroFacts(nightCooler);
  const fallback = buildFactAnalysis(nightCooler, facts);
  assert.match(fallback, /^Etki: POZITIF$/m);
  assert.match(fallback, /^BTC: /m);
  assert.match(fallback, /^Altın: /m);
  assert.match(fallback, /^Neden: /m);
  assert.doesNotMatch(fallback, /yüksel/i);

  const text = formatNewsMessage([nightCooler], 'Etki: POZITIF / POZITIF\nBTC: x\nAltın: y\nNeden: z');
  assert.match(text, /Etki: POZITIF\nBTC: x/);
  assert.doesNotMatch(text, /POZITIF \/ POZITIF/);
  assert.equal(normalizeEffectLine('Etki: NEGATIF / NEGATIF\nBTC: x'), 'Etki: NEGATIF\nBTC: x');
});

test('eksik satirli AI cevabi kabul edilmez', () => {
  const facts = extractMacroFacts(nightCooler);
  assert.equal(validateAnalysis('Etki: POZITIF\nBTC: x', facts).reason, 'missing_sections');
  assert.equal(validateAnalysis('', facts).reason, 'empty');
});

// --- Gonderim saatleri: 09:00 ve 15:00 oncesi, gece yok ---

test('gonderim penceresi 09:00 ve 15:00, gece kapali', () => {
  delete process.env.NEWS_SEND_HOURS;
  delete process.env.NEWS_WINDOW_MIN;
  try {
    assert.deepEqual(newsSendHours(), [9, 15]);

    const morning = newsSlotAt(new Date('2026-11-14T06:00:00Z')); // 09:00 TSİ
    assert.equal(morning.hour, 9);
    assert.equal(morning.key, '2026-11-14:09');

    // 09:59 hala sabah penceresi, 10:00 disarida.
    assert.equal(newsSlotAt(new Date('2026-11-14T06:59:00Z')).hour, 9);
    assert.equal(newsSlotAt(new Date('2026-11-14T07:00:00Z')), null);

    const afternoon = newsSlotAt(new Date('2026-11-14T12:00:00Z')); // 15:00 TSİ
    assert.equal(afternoon.hour, 15);
    assert.equal(afternoon.key, '2026-11-14:15');
    assert.equal(newsSlotAt(new Date('2026-11-14T13:00:00Z')), null); // 16:00

    // 00:00 TSİ (gece) ve 03:00 TSİ kapali.
    assert.equal(newsSlotAt(new Date('2026-11-14T21:00:00Z')), null);
    assert.equal(istanbulClock(new Date('2026-11-14T21:00:00Z')).hour, 0);
  } finally {
    delete process.env.NEWS_SEND_HOURS;
    delete process.env.NEWS_WINDOW_MIN;
  }
});

test('sonraki pencere dogru bildirilir', () => {
  delete process.env.NEWS_SEND_HOURS;
  try {
    const later = nextNewsWindow(new Date('2026-11-14T07:00:00Z')); // 10:00 TSİ
    assert.equal(later.label, '15:00');
    assert.equal(later.inMinutes, 300);
    assert.equal(later.tomorrow, false);

    const nextDay = nextNewsWindow(new Date('2026-11-14T21:00:00Z')); // 00:00 TSİ
    assert.equal(nextDay.label, '09:00');
    assert.equal(nextDay.inMinutes, 540);
    assert.equal(nextDay.tomorrow, false); // gece yarisini gecti, 09:00 ayni gun

    const tomorrow = nextNewsWindow(new Date('2026-11-14T20:00:00Z')); // 23:00 TSİ
    assert.equal(tomorrow.label, '09:00');
    assert.equal(tomorrow.inMinutes, 600);
    assert.equal(tomorrow.tomorrow, true);
  } finally {
    delete process.env.NEWS_SEND_HOURS;
  }
});

test('saatler env ile degistirilebilir', () => {
  process.env.NEWS_SEND_HOURS = '10,16';
  try {
    assert.deepEqual(newsSendHours(), [10, 16]);
    assert.equal(newsSlotAt(new Date('2026-11-14T07:00:00Z')).hour, 10); // 10:00 TSİ
    assert.equal(newsSlotAt(new Date('2026-11-14T06:00:00Z')), null); // 09:00 artik kapali
  } finally {
    delete process.env.NEWS_SEND_HOURS;
  }
});

test('pencere disi ve ayni pencere ikinci mesaji engellenir', () => {
  const src = fs.readFileSync(new URL('../lib/market-news.mjs', import.meta.url), 'utf8');
  assert.match(src, /skipped: 'outside_window'/);
  assert.match(src, /skipped: 'slot_already_sent'/);
  assert.match(src, /newsSlotAt\(new Date\(collected\.lastSentAt\)\)/);
  assert.match(src, /lastSlot\.key === slot\.key/);
});
