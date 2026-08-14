const fs = require('fs');
const h = fs.readFileSync('index.html', 'utf8');
const grab = (start, end) => h.slice(h.indexOf(start), h.indexOf(end));

// stratNum / stratMetrics / stratScore / stratScoreClass / stratAutoMetrics / stratStatusMeta / stratMatch / stratTradesOf / stratYtId (saf fonksiyonlar)
let mSrc = grab('function stratNum(', '// ============ Eğitim İçeriği (Alfa Edu) ============');
let fn = new Function(mSrc + '\nreturn { stratNum, stratMetrics, stratScore, stratScoreClass, stratAutoMetrics, stratStatusMeta, stratMatch, stratTradesOf, stratYtId, stratDetectTopic, stratTopicMeta, anaAi, anaDetectTopic, anaTopicMeta, anaConcepts, anaDeepLocal, stratCleanForSpeech, butceNum, butceMoney, butceMonthKey, butceMonthShift, butceFilterMonth, butceTotals, butceGroup, butceGroupPct, butceDonutSegs, butceArcPath, butceBudgetLeft, butceUid };')();
const { stratNum, stratMetrics, stratScore, stratScoreClass, stratAutoMetrics, stratStatusMeta, stratMatch, stratTradesOf, stratYtId, stratDetectTopic, stratTopicMeta, anaAi, anaDetectTopic, anaTopicMeta, anaConcepts, anaDeepLocal, stratCleanForSpeech, butceNum, butceMoney, butceMonthKey, butceMonthShift, butceFilterMonth, butceTotals, butceGroup, butceGroupPct, butceDonutSegs, butceArcPath, butceBudgetLeft, butceUid } = fn;

const pass = [];
const fail = [];
const t = (name, cond) => { if (cond) pass.push(name); else fail.push(name); };

t('stratNum int', stratNum('12') === 12);
t('stratNum float', stratNum('3.5') === 3.5);
t('stratNum empty -> null', stratNum('') === null);
t('stratNum junk -> null', stratNum('abc') === null);

// otomatik metrikler: trade kayıtlarından
const sAuto = {
  btTrades: [{ id: 1, r: 2 }, { id: 2, r: -1 }],
  liveTrades: [{ id: 3, r: 1.5 }, { id: 4, r: -0.5 }, { id: 5, r: 3 }]
};
const btM = stratMetrics(sAuto.btTrades);
const liveM = stratMetrics(sAuto.liveTrades);
const auto = stratAutoMetrics(sAuto);
t('bt n = 2', btM.n === 2);
t('live n = 3', liveM.n === 3);
t('auto birlesik n = 5', auto.n === 5);
t('auto wr = 60', auto.wr === 60);
t('auto netR = 5', auto.netR === 5);
t('auto avg = 1', auto.avg === 1);
t('auto pf = 6.5/1.5', Math.abs(auto.pf - (6.5 / 1.5)) < 0.01);
// max DD: kümülatif 2,1,2.5,2,5 → peak 2'den sonra 1'e düşer (dd 1)
t('auto dd = 1', auto.dd === 1);

// drawdown örneği: -3 sonra -2 sonra +8
const sDD = { btTrades: [], liveTrades: [{ r: -3 }, { r: -2 }, { r: 8 }] };
t('auto dd negatif seri', stratAutoMetrics(sDD).dd === 5);

// tradesOf tür ayrımı
t('stratTradesOf bt', stratTradesOf(sAuto, 'bt').length === 2);
t('stratTradesOf live', stratTradesOf(sAuto, 'live').length === 3);
t('stratTradesOf bos', stratTradesOf({}, 'bt').length === 0);

// kompozit skor: güçlü strateji (canlı kayıtlar)
const strong = { liveTrades: [{ r: 2 }, { r: -1 }, { r: 1.5 }, { r: -0.5 }, { r: 3 }], status: 'aktif' };
const weak = { liveTrades: [{ r: -2 }, { r: -1 }], status: 'aktif' };
const strongSc = stratScore(strong);
const weakSc = stratScore(weak);
t('strong beats weak', strongSc > weakSc);
t('strong score high', strongSc >= 60);
t('weak score low', weakSc < 45);
console.log('strong score:', strongSc, '| weak score:', weakSc);

// trade kayıtları skoru güçlendirir (5 işlem, net +5)
const withTrades = { liveTrades: [{ r: 2 }, { r: -1 }, { r: 1.5 }, { r: -0.5 }, { r: 3 }], status: 'aktif' };
t('auto trades boost score', stratScore(withTrades) > stratScore({ ...withTrades, liveTrades: [] }));

// eleme cezası
const strongElim = { ...strong, status: 'elendi' };
t('elendi caps at 25', stratScore(strongElim) <= 25);

// pasif indirimi
const strongPass = { ...strong, status: 'pasif' };
t('pasif reduced', stratScore(strongPass) < stratScore(strong));

// status sınıfı
t('score class neu', stratScoreClass(67) === 'neu');
t('score class good', stratScoreClass(80) === 'good');
t('score class bad', stratScoreClass(weakSc) === 'bad');

// durum döngüsü
const next = stratStatusMeta('aktif').next;
t('status next aktif->izleniyor', next === 'izleniyor');
t('status label aktif', stratStatusMeta('aktif').label.indexOf('Aktif') >= 0);

// Trade Günlüğü eşleştirme
t('match exact (case-ins)', stratMatch({ strat: 'Breaker' }, 'breaker'));
t('match substring', stratMatch({ strat: 'Breaker Block 1H' }, 'breaker'));
t('match reverse prefix', stratMatch({ strat: 'breaker' }, 'Breaker 1H'));
t('no match bos', !stratMatch({ strat: '' }, 'breaker'));
t('no match farkli', !stratMatch({ strat: 'Momentum' }, 'breaker'));
t('match note icerik', stratMatch({ note: 'breaker yapısı kuruldu, tepeden giriş' }, 'breaker'));
t('match model icerik', stratMatch({ model: '0.382 geri çekilme' }, '0.382'));
t('no match bos note', !stratMatch({ note: 'farklı bir not burada' }, 'breaker'));
t('no match kisa isim', !stratMatch({ note: 'bu uzun bir metin ama eşleşme yok' }, 'x'));

// YouTube id çıkarımı
t('yt watch', stratYtId('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
t('yt youtu.be', stratYtId('https://youtu.be/dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
t('yt shorts', stratYtId('https://www.youtube.com/shorts/dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
t('yt invalid', stratYtId('https://x.com') === null);

// konu tespiti (AI-benzeri sınıflandırıcı)
t('topic likidite', stratDetectTopic('likidite toplayıp stop avı yapıyor, sweep').id === 'likidite');
t('topic trend', stratDetectTopic('trend takip ve momentum kırılımı').id === 'trend');
t('topic risk', stratDetectTopic('stop loss çok sıkı, risk yönetimi önemli').id === 'risk');
t('topic psikoloji', stratDetectTopic('sabır ve disiplin, korkuya kapılma').id === 'psikoloji');
t('topic coklu arguman', stratDetectTopic('kırılım yok', 'iç bar dış bar').id === 'kiralim');
t('topic bos -> genel', stratDetectTopic('').id === 'genel');
t('topic meta fallback', stratTopicMeta('yok-boyle').name.indexOf('Genel') >= 0);
t('topic meta risk', stratTopicMeta('risk').name.indexOf('Risk') >= 0);

// Analiz Köşesi çıkarımı (piyasa konuları)
const a1 = anaAi('BTC $67.5k direnci önemli, 4H long bakıyorum');
t('ana coin BTC', a1.coins.indexOf('BTC') >= 0);
t('ana dir long', a1.dir === 'long');
t('ana tf 4H', a1.tf === '4H');
t('ana seviye', a1.sev.length > 0);
t('ana topic btc', a1.topicId === 'btc');
const a2 = anaAi('SOL fiyatı yukarı kırılım bekliyor, 15m');
t('ana coin SOL', a2.coins.indexOf('SOL') >= 0);
t('ana dir long', a2.dir === 'long');
t('ana bos', anaAi('').coins.length === 0 && anaAi('').dir === '');
const a3 = anaAi('ETH 3500 üstünde stop avı olursa long splash');
t('ana dir splash long', a3.dir === 'long');
t('ana what dolu', a3.what.length > 0);
const a5 = anaAi('ETHBTC paritesi sıkışıyor, 1-2-3 yapısı');
t('ana topic ethbtc', a5.topicId === 'ethbtc');
const a6 = anaAi('BTC.D düşüyor, ETH güçleniyor');
t('ana topic btcd', a6.topicId === 'btcd');
const a7 = anaAi('TOTAL ve USDT.D yükseliyor, altcoinler zayıf');
t('ana topic total', a7.topicId === 'total');
t('ana coins inst', a7.coins.indexOf('TOTAL') >= 0 && a7.coins.indexOf('USDT.D') >= 0);
t('ana topic fallback', anaTopicMeta('yok').name.indexOf('Genel') >= 0);

// Derin analiz motoru (yerel)
const d1 = anaDeepLocal('BTC 67.5k direnç, likidite avı sonrası yukarı kırılım, 4H long');
t('deep felsefe baslik', d1.deep.indexOf('📌') >= 0);
t('deep yaklasim baslik', d1.deep.indexOf('🧭') >= 0);
t('deep konsept baslik', d1.deep.indexOf('🧩') >= 0);
t('deep seviye baslik', d1.deep.indexOf('📍') >= 0);
t('deep senaryo baslik', d1.deep.indexOf('🎯') >= 0);
t('deep coin btc', d1.what.indexOf('BTC') >= 0);
t('deep bos metin', anaDeepLocal('').deep.length > 0);
t('concept liq', anaConcepts('likidite avı + sweep').some(c => c.id === 'liq'));
t('concept bos', anaConcepts('BOS kırılımı ve CHoCH').some(c => c.id === 'bos'));
t('concept ob', anaConcepts('order block desteğinden alım').some(c => c.id === 'ob'));
t('concept fvg', anaConcepts('FVG imbalance dolu').some(c => c.id === 'fvg'));
t('ana concepts tasindi', anaAi('likidite avı sonrası kırılım').concepts.length >= 2);
t('speak emoji temiz', stratCleanForSpeech('📌 Felsefe test 🧭').indexOf('📌') < 0);
t('speak yeni satir', stratCleanForSpeech('a\n\nb') === 'a b');
t('speak cizgi', stratCleanForSpeech('hedef — direnç').indexOf('—') < 0);
// --- Alfa Defter (Bütçe) ---
t('butce num', butceNum('x') === 0 && butceNum(12.5) === 12.5 && butceNum('3.5') === 3.5);
t('butce monthkey', butceMonthKey('2026-08-05') === '2026-08');
t('butce monthkey date', butceMonthKey(new Date(2026, 7, 15)) === '2026-08');
t('butce shift', butceMonthShift('2026-01-15', -1) === '2025-12');
const bt = [
  { id: '1', type: 'gelir', cat: 'maas', date: '2026-08-05', amount: 10000 },
  { id: '2', type: 'gider', cat: 'gida', date: '2026-08-06', amount: 500 },
  { id: '3', type: 'gider', cat: 'kira', date: '2026-08-07', amount: 2500 },
  { id: '4', type: 'gider', cat: 'gida', date: '2026-07-20', amount: 999 }
];
t('butce totals', butceTotals(butceFilterMonth(bt, '2026-08')).gelir === 10000 && butceTotals(butceFilterMonth(bt, '2026-08')).gider === 3000 && butceTotals(butceFilterMonth(bt, '2026-08')).net === 7000);
t('butce group', butceGroup(butceFilterMonth(bt, '2026-08')).length === 2 && butceGroup(butceFilterMonth(bt, '2026-08')).some(g => g.id === 'gida' && g.total === 500));
t('butce grouppct', Math.round(butceGroupPct(butceGroup(butceFilterMonth(bt, '2026-08'))).reduce((s, g) => s + g.pct, 0)) === 100);
t('butce donut segs', butceDonutSegs([{ id: 'a', total: 1 }, { id: 'b', total: 3 }], 4).length === 2 && butceDonutSegs([{ id: 'a', total: 1 }, { id: 'b', total: 3 }], 4)[1].start === 90);
t('butce arc path', butceArcPath(100, 100, 86, 52, 0, 90).indexOf('M') === 0);
t('butce arc full', (butceArcPath(100, 100, 86, 52, 0, 360).match(/M/g) || []).length === 2);
t('butce budget', butceBudgetLeft(butceFilterMonth(bt, '2026-08'), '2026-08', 4000).left === 1000 && butceBudgetLeft(butceFilterMonth(bt, '2026-08'), '2026-08', 2000).pct === 100);
t('butce uid', butceUid().length > 4);

console.log(pass.length + ' passed, ' + fail.length + ' failed');
if (fail.length) { console.log('FAILED:', fail.join(', ')); process.exit(1); }
