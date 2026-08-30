const fs = require('fs');
const h = fs.readFileSync('index.html', 'utf8');
const a = h.indexOf('const SM_KEY =');
const b = h.indexOf('\nfunction bindAlfaPortfoy2()');
if (a < 0 || b < a) { console.log('SM block markers bad'); process.exit(1); }
const src = h.slice(a, b);

// ---- minimal DOM stubs ----
const store = {};
const els = {};
function fakeEl() {
  return {
    _html: '', _value: '', _files: null, style: {},
    classList: { toggle: () => {} }, addEventListener: () => {},
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set value(v) { this._value = v; }, get value() { return this._value; },
    focus: () => {}
  };
}
global.document = {
  getElementById(id) { if (!els[id]) els[id] = fakeEl(); return els[id]; },
  createElement(tag) { return { style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, toggle() {} }, click() {}, select() {}, width: 0, height: 0, getContext() { return null; } }; }
};
global.localStorage = { getItem(k) { return store[k] || null; }, setItem(k, v) { store[k] = v; }, removeItem(k) { delete store[k]; } };
global.navigator = { clipboard: { writeText() { return Promise.resolve(); } } };
global.confirm = () => true;
global.prompt = () => null;
global.stratToast = () => {};
global.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- load sm source ----
const fn = new Function(src + '\n;return { smGetData: () => smData, smLoad: smLoad, smSave: smSave, smNormalize: smNormalize, smSeedPresets: smSeedPresets, smEval: smEval, smBandText: smBandText, smShareText: smShareText, renderSosyal: renderSosyal, smTradesHtml: smTradesHtml, smChipsHtml: smChipsHtml, smStatsHtml: smStatsHtml, smTabsHtml: smTabsHtml, smCatConds: smCatConds, smLiveConds: smLiveConds, smEvalConds: smEvalConds, smUid: smUid, smCondShift: smCondShift, smEditStart: smEditStart, smEditSave: smEditSave, smCondDel: smCondDel, smCatName: smCatName, smCatEditSave: smCatEditSave, smTradeSetImg: smTradeSetImg, smTradeDelImg: smTradeDelImg, smTradeAdd: smTradeAdd, smRenderStageImg: smRenderStageImg };');
const sm = fn();
let bad = 0;
function check(name, cond) { console.log((cond ? 'OK   ' : 'MISS ') + name); if (!cond) bad++; }

sm.smLoad();
// seed presets per category
const counts = ['xalfa', 'apub', 'acourse'].map(id => sm.smCatConds(id).length);
check('seed 3 cats presets', counts[0] >= 8 && counts[1] >= 8 && counts[2] >= 8);

// active eval conds
check('eval conds > 0', sm.smEvalConds().length > 0);

// fake trade all ticks (KAÇIRMA)
const tids = sm.smEvalConds().map(c => c.id);
const tickTrade = { id: sm.smUid(), sym: 'BTC', dir: 'LONG', date: '2026-08-29', note: 'test', ticks: {} };
tids.forEach(id => { tickTrade.ticks[id] = true; });
const e1 = sm.smEval(tickTrade);
check('full ticks -> 100% KAÇIRMA band', e1.band && e1.band.t === 'KAÇIRMA' && e1.pct === 100);
check('full ticks -> pass(true th)', e1.pass === true);
check('per-cat bands all KAÇIRMA', ['xalfa', 'apub', 'acourse'].every(c => e1.per[c].band && e1.per[c].band.t === 'KAÇIRMA'));

// zero ticks -> KALDI
const zTrade = { ...tickTrade, id: sm.smUid(), ticks: {} };
const e2 = sm.smEval(zTrade);
check('zero ticks -> KALDI', e2.pct === 0 && e2.band.t === 'KALDI' && e2.pass === false);

// Eval function changes when ticks change
const pct1 = e1.pct;
check('pct stable', pct1 === 100);

// renderSosyal -> tabs include 3 cats
sm.renderSosyal();
check('tabs render 3 cats', ['X', 'Alfa Traders Public', 'Alfa Traders'].every(n => els['sm-tabs']._html.includes(n)));
check('chips render > 0', els['sm-cond-list']._html.includes('sm-chip'));
check('stats render', els['sm-stats']._html.includes('KAÇIRMA'));

// share text contains band + cats
const txt = sm.smShareText(tickTrade);
check('share text has band', txt.includes('KAÇIRMA') && txt.includes('X'));
check('share text has ✓ items', txt.includes('[✓]'));

// category rename persists (X default -> custom name)
sm.smGetData().active = 'xalfa';
sm.smGetData().catNames = { xalfa: 'Tek X' };
sm.smSave();
sm.renderSosyal();
check('cat rename renders', els['sm-tabs']._html.includes('Tek X') && !els['sm-tabs']._html.includes('X & Alfa Traders'));
check('cat rename in share', sm.smShareText(tickTrade).includes('Tek X'));
const nameRaw = JSON.parse(store['defter-sosyalmetre-v2'] || 'null');
check('catNames persisted', nameRaw && nameRaw.catNames && nameRaw.catNames.xalfa === 'Tek X');
delete sm.smGetData().catNames;

// trade image attach / remove / normalize
const itid = sm.smUid();
const it = { id: itid, sym: 'ETH', dir: 'LONG', date: '2026-08-30', note: '', ticks: {} };
sm.smGetData().trades.unshift(it);
sm.smTradeSetImg(itid, 'data:image/jpeg;base64,AAA');
check('attach img', sm.smGetData().trades[0].img.indexOf('data:image') === 0);
check('row renders img view', sm.smTradesHtml().includes('data-imgview'));
const it2 = sm.smNormalize({ cats: {}, catNames: {}, trades: [{ id: itid, sym: 'ETH', dir: 'LONG', date: '2026-08-30', note: '', img: 'data:image/png;base64,BBB', ticks: {} }] });
check('normalize keeps img', it2.trades[0].img === 'data:image/png;base64,BBB');
sm.smTradeDelImg(itid);
check('remove img', !sm.smGetData().trades[0].img);

// threshold 50
sm.smSave(); // persist current smData into store
store['defter-sosyalmetre-v2'] = JSON.stringify(Object.assign(JSON.parse(store['defter-sosyalmetre-v2'] || 'null') || {}, { th: '50' }));
sm.smLoad();
const half = tids.filter((_, i) => i % 2 === 0).reduce((m, id) => { m[id] = true; return m; }, {});
const e3 = sm.smEval({ ...tickTrade, id: sm.smUid(), ticks: half });
check('th=50 pass on half ticks', e3.need === Math.ceil(e3.total * 0.5) && e3.pass === true);

// tmp sim for edit/move/delete
sm.smGetData().active = 'acourse';
sm.renderSosyal();
check('live == eval conds count', sm.smLiveConds('acourse').length === sm.smEvalConds().filter(c => c.cat === 'acourse').length);
const before = sm.smLiveConds('acourse').map(c => c.text);
sm.smCondShift(1, sm.smLiveConds('acourse')[0].id);
check('move down swaps order', sm.smLiveConds('acourse')[0].text === before[1] && sm.smLiveConds('acourse')[1].text === before[0]);
const liveBefore = sm.smLiveConds('acourse').length;
sm.smCondDel(sm.smLiveConds('acourse')[0].id);
check('delete reduces live', sm.smLiveConds('acourse').length === liveBefore - 1);
check('deleted not counted in eval', sm.smEvalConds().filter(c => c.cat === 'acourse').length === liveBefore - 1);
const editTarget = sm.smLiveConds('acourse')[0];
sm.smEditStart(editTarget.id);
els['sm-edit-input'] = fakeEl();
els['sm-edit-input']._value = 'Düzenlenmiş şart';
sm.smEditSave();
check('edit saved text', sm.smLiveConds('acourse')[0].text === 'Düzenlenmiş şart');
const storeBackup = store['defter-sosyalmetre-v2'];
sm.smLoad();
check('persist survives reload', sm.smLiveConds('acourse').some(c => c.text === 'Düzenlenmiş şart') && sm.smLiveConds('acourse').length === liveBefore - 1);
check('seed skips renamed preset by orig', sm.smEvalConds().filter(c => c.cat === 'acourse').length === liveBefore - 1);
store['defter-sosyalmetre-v2'] = storeBackup;

console.log(bad ? 'SIM FAILED' : 'SIM ALL OK');
process.exit(bad ? 1 : 0);
