const fs = require('fs');
const h = fs.readFileSync('index.html', 'utf8');
const mk = [
  ['old_removed', !h.includes('AP2_SOS_PIN_KEY') && !h.includes('ap2-sos-open') && !h.includes('id="ap2-sos"')],
  ['page', h.includes('id="page-sosyalmetre"') && h.includes('id="tab-sosyalmetre"') && h.includes('renderSosyal')],
  ['route', h.includes("'sosyalmetre'") && h.includes("name === 'sosyalmetre'")],
  ['tabs', h.includes('sm-tabs') && h.includes('data-cat') && h.includes('SM_CATS') && h.includes('SM_PRESETS')],
  ['checklist', h.includes('sm-cond-list') && h.includes('smChipsHtml') && h.includes('data-tog') && h.includes('sm-allon')],
  ['trades', h.includes('sm-trade-list') && h.includes('smTradeAdd') && h.includes('smTick') && h.includes('smEval')],
  ['bands', h.includes('smBandText') && h.includes('KAÇIRMA') && h.includes('TEMKİN') && h.includes('sm-b-yellow')],
  ['share', h.includes('sm-share-card') && h.includes('smShare') && h.includes('smCopy') && h.includes('smShareText')],
  ['img', h.includes('smImg') && h.includes('data-timg') && h.includes('toDataURL') && h.includes('1080')],
  ['save', h.includes('smExport') && h.includes('smImportFile') && h.includes('smReset') && h.includes('sm-stats')],
  ['sellmeta', h.includes('cost: _entryCost') && h.includes('profit: _profit') && h.includes('days: _days')],
  ['growth', h.includes('id="ap2-growth"') && h.includes('totalInvested')],
  ['form', h.includes('ap2-f-mode') && h.includes('ap2FormCalc')],
  ['deposit', !h.includes('#ap2-deposit') && !h.includes('ap2Deposit')],
  ['notarget', !h.includes('ap2-f-target') && !h.includes('ap2-rebal') && !h.includes('ap2RebalCalc')],
  ['pricefix', h.includes("const AP2_CG_IDS") && h.includes("LTC: 'litecoin'") && h.includes('data-sym="LTC"') && h.includes('fiyat yüklenemedi')],
  ['gaps', h.includes('stroke:var(--card);stroke-width:3')],
  ['smCss', h.includes('.sm-wrap {') && h.includes('.sm-tabs') && h.includes('.sm-band {') && h.includes('.sm-chip {') && h.includes('.sm-stats {')],
  ['edit', h.includes('data-act') && h.includes('smCondShift') && h.includes('smEditStart') && h.includes('smEditSave') && h.includes('smCondDel') && h.includes('.sm-chip-act') && h.includes('.sm-cond-edit') && h.includes('gone: v.gone === true') && h.includes('smLiveConds')],
  ['cleanhead', !h.includes('bd-backup') && !h.includes('bd-restore') && !h.includes('bd-blur') && !h.includes('bd-add') && !h.includes('butceBackup') && !h.includes('butceRestoreFile')],
  ['rename', h.includes('data-bdt="defter">\u{1F4D2} Gelir Gider') && h.includes('data-bdt="portfoy">\u{1F4BC} Portföyüm')],
  ['smPrivate', h.includes("name === 'sosyalmetre' && !amAllowed()") && h.includes('id="mnav-sosyalmetre"') && h.includes("const smTab = document.getElementById('tab-sosyalmetre')") && h.includes("if (smTab) smTab.style.display = isAdmin ? '' : 'none';")],
  ['rules', h.includes('\u{1F9FE} Kural Listesi') && !h.includes('Şart Bankası')],
  ['catEdit', h.includes("{ id: 'xalfa', icon: '\u{1D54F}', name: 'X' }") && h.includes('function smCatName') && h.includes('function smCatEditSave') && h.includes('sm-cat-edit-input')],
  ['imgNotes', h.includes('sm-img-paste') && h.includes('smAttachFor') && h.includes('smImgView') && h.includes('smTradeSetImg') && h.includes('data-imgdel') && h.includes("addEventListener('paste'")],
  ['ap2hedge', h.includes('data-ap2hedge') && h.includes('function ap2OpenHedge') && h.includes('function ap2HedgeStrip') && h.includes('function ap2HedgeInfo') && h.includes('id="ap2-hedge-strip"') && h.includes('ap2-f-side') && h.includes('data-ap2side')],
  ['ap2short', h.includes('function ap2PnlOf') && h.includes("p.side === 'SHORT' ? 'SHORT' : 'LONG'") && h.includes('const _profit = ap2PnlOf(pos.side, sellQty * _entryCost, amount);') && h.includes('🛡 Karşı Pozisyon (hedge)')],
  ['ap2limit', h.includes('function ap2IsPending') && h.includes('function ap2Fillable') && h.includes('function ap2FillsCheck') && h.includes('data-ap2fill') && h.includes('ap2-card-pend') && h.includes('BEKLEYEN EM')],
  ['ap2hist', h.includes('const AP2_CG_IDS') && h.includes('function ap2HistUrl') && h.includes('async function ap2FetchHist') && h.includes('function ap2ShowHistConfirm') && h.includes('function ap2CommitPosition') && h.includes('id="ap2-hist-keep"') && h.includes('pos.hist') && h.includes('AP2_HIST_TOL')],
  ['ap2ui', h.includes('id="ap2-search"') && h.includes('class="ap2-hd"') && h.includes('class="ap2-btn-primary"') && h.includes('act-hedge') && h.includes('act-del') && h.includes('.ap2-sell-pf') && h.includes('ap2SearchTerm') && h.includes('ap2-grid-empty')],
  ['uyap', h.includes('id="page-uyap"') && h.includes('id="tab-uyap"') && h.includes('function renderUyap') && h.includes('UYAP_KEY') && h.includes('function uyapSaveForm') && h.includes('uyap-img-drop')],
  ['uyap_autolink', h.includes('uyap-f-url') && h.includes('function uyapFetchOg') && h.includes('uyapFetchOgImg') && h.includes('allorigins')],
  ['uyap_notes', h.includes('id="uyap-notes-panel"') && h.includes('function uyapRenderNotes') && h.includes('function uyapNoteSave') && h.includes('uyap-note-tag') && h.includes("uyapData.notes")]
];
let ok = true;
for (const [k, v] of mk) { console.log((v ? 'OK   ' : 'MISS ') + 'sosyalmetre/' + k); if (!v) ok = false; }
console.log(ok ? 'ALL LOCAL MARKERS OK' : 'MISSING');
process.exit(ok ? 0 : 1);