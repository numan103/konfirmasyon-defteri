import { chartDialog, icon, escapeHTML as esc } from './alfa-chart-ui.mjs?v=3';
import { parseHM, SESSION_BOX_DEFS } from './alfa-session-boxes-model.mjs?v=3';
import { PUBLIC_STUDY_DETAILS } from './alfa-market-data-public.mjs?v=3';

export const OVERLAY_CATALOG = [
  { id: 'volume', name: 'Hacim', category: 'Volume', description: 'Mumlara eşlik eden işlem hacmi', color: '#6fa8b0' },
  { id: 'sessions', name: 'Seans kutuları', category: 'Sessions', description: 'Asya, Londra, New York · özelleştirilebilir UTC saatleri', color: '#d5b16a' },
  { id: 'levels', name: 'Açılış ve önceki dönem seviyeleri', category: 'Sessions', description: 'Gün, hafta, ay açılışı ve önceki yüksek/düşükler', color: '#b29bd6' },
  { id: 'structure', name: 'Piyasa yapısı', category: 'Smart Money', description: 'Swing, HH/HL, BOS, CHoCH ve korunan seviyeler', color: '#71b9c0' },
  { id: 'fvg', name: 'FVG / IFVG', category: 'Smart Money', description: 'Fair Value Gap ve tersine dönen dengesizlik bölgeleri', color: '#7aafa0' },
  { id: 'mtf', name: 'Çoklu zaman dilimi · MTF', category: 'Smart Money', description: 'Üst periyot yapıları, swing ve FVG katmanları', color: '#86a9e1' },
  { id: 'oi', ...PUBLIC_STUDY_DETAILS.oi, category: 'Market Data', color: '#8ea7ff' },
  { id: 'longShort', name: 'Long / Short Oranı', category: 'Market Data', description: 'Binance Futures global hesap long/short oranı · anahtarsız', color: '#d5b16a' },
  { id: 'cvdSpot', name: 'CVD · Spot', category: 'Market Data', description: 'Binance Spot kapanış verisinden taker alım-satım kümülatif deltası', color: '#26c89c' },
  { id: 'cvdPerp', name: 'CVD · Perpetual', category: 'Market Data', description: 'Binance USD-M vadeli taker alım-satım kümülatif deltası', color: '#8ea7ff' },
  { id: 'marketDelta', name: 'Market Delta', category: 'Market Data', description: 'Mum başına taker alım - satım hacmi · ücretsiz', color: '#71b9c0' },
  { id: 'footprint', ...PUBLIC_STUDY_DETAILS.footprint, category: 'Market Data', color: '#7aafa0' },
  { id: 'heatmap', ...PUBLIC_STUDY_DETAILS.heatmap, category: 'Market Data', color: '#b29bd6' },
];
// Public microstructure studies render in their own panes; the heatmap is an
// overlay on the price pane and stays with the symbol legend instead.
const PUBLIC_PANE_IDS = new Set(['oi', 'longShort', 'cvdSpot', 'cvdPerp', 'marketDelta', 'footprint']);
const descriptions = {
  sma: 'Basit hareketli ortalama', ema: 'Üssel hareketli ortalama', wma: 'Ağırlıklı hareketli ortalama',
  vwma: 'Hacim ağırlıklı hareketli ortalama', vwap: 'Hacim ağırlıklı ortalama fiyat', bollinger: 'Ortalama ve standart sapma bantları',
  supertrend: 'ATR tabanlı trend takibi', rsi: 'Göreceli güç endeksi', macd: 'MACD, sinyal çizgisi ve histogram',
  stochastic: 'Stokastik K / D osilatörü', stochrsi: 'Stokastik RSI', atr: 'Ortalama gerçek aralık', adx: 'Trend gücü endeksi', obv: 'Dengelenmiş hacim',
};
const categories = [['all', 'Tüm indikatörler'], ['fav', 'Favoriler'], ['active', 'Grafikte'], ['Trend', 'Trend'],
  ['Momentum', 'Momentum'], ['Volatility', 'Volatilite'], ['Volume', 'Hacim'], ['Smart Money', 'Smart Money'],
  ['Market Data', 'Piyasa verisi'], ['Sessions', 'Seanslar & seviyeler']];
const labels = { period: 'Periyot', source: 'Fiyat kaynağı', color: 'Çizgi rengi', mult: 'Çarpan', fast: 'Hızlı periyot', slow: 'Yavaş periyot',
  signal: 'Sinyal periyodu', k: '%K periyodu', d: '%D periyodu', smooth: 'Yumuşatma', rsiPeriod: 'RSI periyodu',
  stochPeriod: 'Stokastik periyodu', kSmooth: '%K yumuşatma', dSmooth: '%D yumuşatma', left: 'Sol swing mumları', right: 'Sağ swing mumları',
  displacement: 'Güçlü hareket filtresi', dispMin: 'Minimum gövde oranı', equalTol: 'Eşitlik toleransı',
  showSwings: 'Swing işaretleri', showHHHL: 'HH / HL / LH / LL', showBOS: 'BOS kırılımları', showCHoCH: 'CHoCH dönüşleri',
  showProtected: 'Korunan seviyeler', maxProtected: 'Maksimum korunan seviye', minGap: 'Minimum fiyat boşluğu', atrFilter: 'ATR filtresi',
  maxRegions: 'Maksimum bölge', showBull: 'Yükseliş bölgeleri', showBear: 'Düşüş bölgeleri', showIfvg: 'IFVG bölgeleri', showMitigated: 'Dolmuş / geçersiz bölgeleri de göster', extend: 'Bölgeleri sağa uzat',
  opacity: 'Dolgu opaklığı', showFvg: 'FVG bölgeleri', showMS: 'Piyasa yapısı', showIFVG: 'IFVG bölgeleri', confirmedOnly: 'Yalnızca kapanmış HTF mumları',
  period: 'Veri periyodu', market: 'Piyasa', levels: 'Emir defteri seviyesi', refresh: 'Yenileme (sn)',
  bidColor: 'Alış likiditesi', askColor: 'Satış likiditesi' };
const periodOptions = [['auto', 'Otomatik · grafiğe uygun'], ['5m', '5 dk'], ['15m', '15 dk'], ['30m', '30 dk'],
  ['1h', '1 sa'], ['2h', '2 sa'], ['4h', '4 sa'], ['6h', '6 sa'], ['12h', '12 sa'], ['1d', '1 gün']];
const marketOptions = [['auto', 'Grafikteki piyasa'], ['spot', 'Binance Spot'], ['perp', 'Binance Vadeli']];
const schemas = {
  structure: ['left', 'right', 'mode', 'displacement', 'dispMin', 'showSwings', 'showHHHL', 'showBOS', 'showCHoCH', 'showProtected', 'maxProtected'],
  fvg: ['minGap', 'atrFilter', 'displacement', 'dispMin', 'mitigation', 'maxRegions', 'showBull', 'showBear', 'showIfvg', 'showMitigated', 'extend', 'opacity'],
  mtf: ['showSwings', 'showFvg', 'showBOS', 'showCHoCH', 'showProtected', 'showIFVG', 'confirmedOnly', 'extend'],
  oi: ['period', 'color', 'refresh'],
  longShort: ['period', 'color', 'refresh'],
  cvdSpot: ['color', 'refresh'],
  cvdPerp: ['color', 'refresh'],
  marketDelta: ['market', 'color', 'refresh'],
  footprint: ['market', 'color', 'refresh'],
  heatmap: ['market', 'levels', 'bidColor', 'askColor', 'refresh'],
};
export function defaultStudyState() {
  return Object.fromEntries(OVERLAY_CATALOG.map(d => [d.id, { added: d.id === 'volume', visible: true, collapsed: false }]));
}
export function normalizeStudyState(raw) {
  const out = defaultStudyState();
  for (const def of OVERLAY_CATALOG) {
    const v = raw?.[def.id];
    // Keep old stored entries byte-compatible: only add `collapsed` when the
    // saved record actually carries it.
    if (v && typeof v.added === 'boolean') out[def.id] = { added: v.added, visible: v.visible !== false,
      ...(Object.hasOwn(v, 'collapsed') ? { collapsed: !!v.collapsed } : {}) };
  }
  return out;
}
// Only native oscillator studies own a pane; their legend row is the TV-style
// double-click target for tucking the pane back under the price chart.
export function isPaneStudy(d) {
  return d?.item?.def?.pane === 'oscillator' || d?.pane === 'oscillator';
}
export function studyChipClass(d, clean = false) {
  return ['study-chip', (!d.visible || clean) ? 'is-hidden' : '', d.collapsed ? 'is-collapsed' : '',
    isPaneStudy(d) ? 'is-pane-study' : ''].filter(Boolean).join(' ');
}
export function studyLegendParams(params = {}) {
  return Object.entries(params).filter(([key, value]) =>
    (typeof value === 'number' && Number.isFinite(value)) || key === 'source')
    .map(([key, value]) => `${key}=${value}`).join(', ');
}
export function studyLegendValues(series, cursor = null) {
  return series.map(s => {
    try {
      const row = cursor ? cursor.seriesData?.get(s) : s.data().at(-1);
      return typeof row?.value === 'number' && Number.isFinite(row.value)
        ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 8 }).format(row.value) : '—';
    } catch { return '—'; }
  }).join(' · ') || '—';
}
const activeIds = studies => studies.active().map(d => d.id);
function storedArray(key, fallback = []) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); if (Array.isArray(v)) return v.filter(x => typeof x === 'string'); } catch {}
  return fallback;
}

// One catalogue and one set of lifecycle controls for native indicators and overlays.
export class ChartStudies {
  constructor({ indicators, catalog, managers, onChange }) {
    Object.assign(this, { indicators, managers, onChange });
    this.catalog = [...catalog.map(d => ({ ...d, description: descriptions[d.id] })), ...OVERLAY_CATALOG];
    this.state = defaultStudyState(); this.clean = false;
    this.favorites = storedArray('alfa-ind-fav:v1', ['ema', 'rsi', 'sessions', 'fvg']);
    managers.sessions.onSettings = () => this.openSettings('sessions');
    managers.sessions.onToggle = id => {
      if (!this.state.sessions.added) managers.sessions.config.enabled = Object.fromEntries(SESSION_BOX_DEFS.map(d => [d.id, d.id === id]));
      this.add('sessions'); managers.sessions.saveConfig();
    };
    this.applyVisibility(); this.sync();
  }
  toJSON() { return structuredClone(this.state); }
  apply(raw) { this.state = normalizeStudyState(raw); this.applyVisibility(); this.sync(); }
  applyVisibility() {
    this.indicators.setSuppressed(this.clean);
    for (const def of OVERLAY_CATALOG) {
      const enabled = this.state[def.id].added && this.state[def.id].visible && !this.clean;
      if (!!this.managers[def.id].enabled !== enabled) this.managers[def.id].setEnabled(enabled);
    }
    for (const id of PUBLIC_PANE_IDS) this.managers[id]?.setCollapsed?.(!!this.state[id]?.collapsed);
  }
  setClean(value) { this.clean = !!value; this.applyVisibility(); this.sync(); }
  persist() { this.sync(); this.onChange?.(); }
  active() {
    return [
      ...this.indicators.items.map(item => ({ id: item.id, type: item.type, name: item.def.name,
        subtitle: item.params.period ? `${item.params.period} · ${(item.params.source || 'close').toUpperCase()}` : descriptions[item.type],
        visible: item.visible, collapsed: !!item.collapsed, color: item.params.color, pane: item.def.pane, item })),
      ...OVERLAY_CATALOG.filter(d => this.state[d.id].added).map(d => ({
        ...d, subtitle: d.description, visible: this.state[d.id].visible, collapsed: !!this.state[d.id].collapsed,
        pane: PUBLIC_PANE_IDS.has(d.id) ? 'oscillator' : 'main', status: this.managers[d.id].status
      })),
    ];
  }
  add(type) {
    try {
      if (this.state[type]) { this.state[type] = { added: true, visible: true, collapsed: false }; this.applyVisibility(); }
      else this.indicators.add(type);
      this.persist();
      this.announce(`${this.catalog.find(d => d.id === type)?.name || type} grafiğe eklendi`);
    } catch (error) { this.announce(error.message); }
  }
  remove(id) {
    if (this.state[id]) { this.state[id].added = false; this.applyVisibility(); }
    else this.indicators.remove(id);
    this.persist();
  }
  toggle(id) {
    if (this.state[id]) { this.state[id].visible = !this.state[id].visible; this.applyVisibility(); }
    else {
      const item = this.indicators.items.find(i => i.id === id);
      if (item) this.indicators.setVisible(id, !item.visible);
    }
    this.persist();
  }
  setCollapsed(id, collapsed) {
    const item = this.indicators.items.find(i => i.id === id);
    if (item) this.indicators.setCollapsed(id, collapsed);
    else if (this.state[id]) {
      this.state[id].collapsed = !!collapsed;
      this.managers[id]?.setCollapsed?.(!!collapsed);
    }
    this.persist();
  }
  // Chart-level double-click tucks every lower pane; a second one restores
  // them. Overlays on the price pane are deliberately left alone.
  toggleLowerPanes(collapsed = null) {
    const panes = this.active().filter(d => isPaneStudy(d) && d.visible);
    if (!panes.length) return false;
    const next = collapsed == null ? panes.some(d => !d.collapsed) : !!collapsed;
    for (const d of panes) this.setCollapsed(d.id, next);
    return next;
  }
  sync() {
    const active = this.active(), legend = document.getElementById('study-legend');
    const count = document.getElementById('study-count'); if (count) count.textContent = active.length;
    if (legend) {
      const cards = active.map(d => {
        const hint = isPaneStudy(d) ? ` title="${esc(d.name)} alt panelini çift tıkla: ${d.collapsed ? 'genişlet' : 'göm'}"` : '';
        return `<div class="${studyChipClass(d, this.clean)}" data-study-chip="${esc(d.id)}"${hint}>
        <div class="study-chip-head">
          <span class="study-dot" style="background:${esc(d.color)}"></span>
          <span class="study-chip-name">${esc(d.name)}</span>
          ${d.item ? `<small class="study-chip-params">${esc(studyLegendParams(d.item.params))}</small><span class="study-chip-values" data-study-values="${esc(d.id)}"></span>` : ''}
          ${d.subtitle ? `<small class="study-chip-meta">${esc(d.subtitle)}</small>` : ''}
          ${this.statusHTML(d)}
        </div>
        <div class="study-chip-foot">
          <button data-study-eye="${esc(d.id)}" title="${esc(d.name)} göster/gizle" aria-label="${esc(d.name)} göster/gizle">${icon(d.visible ? 'eye' : 'eyeOff')}</button>
          ${d.id === 'volume' ? '' : `<button data-study-settings="${esc(d.id)}" title="${esc(d.name)} ayarları" aria-label="${esc(d.name)} ayarları">${icon('settings')}</button>`}
          <button data-study-collapse="${esc(d.id)}" aria-pressed="${!!d.collapsed}" title="${d.collapsed ? 'Genişlet' : 'Küçült'}" aria-label="${esc(d.name)} ${d.collapsed ? 'genişlet' : 'küçült'}">${icon(d.collapsed ? 'expand' : 'minimize')}</button>
          <button data-study-remove="${esc(d.id)}" title="${esc(d.name)} kaldır" aria-label="${esc(d.name)} kaldır">${icon('close')}</button>
        </div>
        </div>`;
      }).join('');
      const actions = active.length ? `<div class="study-legend-actions">
        <button data-study-manage type="button" title="İndikatörleri yönet" aria-label="İndikatörleri yönet">${icon('settings')}</button>
        <button data-study-collapse-all type="button" title="Tümünü küçült">${icon('minimize')}</button>
        <button data-study-expand-all type="button" title="Tümünü genişlet">${icon('expand')}</button>
        <button data-study-remove-all type="button" title="Tümünü kaldır">${icon('close')}</button>
      </div>` : '';
      legend.innerHTML = cards + actions;
      this.wireActive(legend);
      this.updateValues();
    }
    if (this.modal?.box.querySelector('#ind-list')) this.renderList();
  }
  updateValues(cursor = this.legendCursor || null) {
    this.legendCursor = cursor?.time != null ? cursor : null;
    const items = new Map(this.indicators.items.map(item => [item.id, item]));
    document.querySelectorAll('[data-study-values]').forEach(node => {
      const item = items.get(node.dataset.studyValues);
      node.textContent = item ? studyLegendValues(item.series, this.legendCursor) : '—';
    });
  }
  wireActive(root) {
    root.querySelectorAll('[data-study-eye]').forEach(b => b.onclick = () => this.toggle(b.dataset.studyEye));
    root.querySelectorAll('[data-study-remove]').forEach(b => b.onclick = () => this.remove(b.dataset.studyRemove));
    root.querySelectorAll('[data-study-settings]').forEach(b => b.onclick = () => this.openSettings(b.dataset.studySettings));
    root.querySelectorAll('[data-study-collapse]').forEach(b => b.onclick = () => this.setCollapsed(b.dataset.studyCollapse, !this.active().find(d => d.id === b.dataset.studyCollapse)?.collapsed));
    // TradingView-style tuck-away: double-click the oscillator's legend row,
    // not its buttons, to sink the pane into a thin ribbon at the chart bottom.
    root.querySelectorAll('.study-chip.is-pane-study').forEach(chip => chip.addEventListener('dblclick', e => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      this.setCollapsed(chip.dataset.studyChip, !chip.classList.contains('is-collapsed'));
    }));
    root.querySelectorAll('[data-study-retry]').forEach(b => b.onclick = () => this.managers[b.dataset.studyRetry]?.retry?.());
    root.querySelector('[data-study-manage]')?.addEventListener('click', () => this.open());
    root.querySelector('[data-study-collapse-all]')?.addEventListener('click', () => { for (const id of activeIds(this)) this.setCollapsed(id, true); });
    root.querySelector('[data-study-expand-all]')?.addEventListener('click', () => { for (const id of activeIds(this)) this.setCollapsed(id, false); });
    root.querySelector('[data-study-remove-all]')?.addEventListener('click', () => {
      const ids = activeIds(this);
      if (!ids.length || !confirm('Grafikteki tüm indikatörler kaldırılsın mı? Çizimlerin etkilenmez.')) return;
      for (const id of ids) this.remove(id);
    });
  }
  statusHTML(d) {
    if (!d.status?.message || !d.visible || this.clean) return '';
    const retry = ['error', 'empty'].includes(d.status.state);
    return `<small class="study-data-status" data-study-status="${esc(d.id)}" data-state="${esc(d.status.state)}" role="status" title="${esc(d.status.message)}">${esc(d.status.message)}</small>
      ${retry ? `<button data-study-retry="${esc(d.id)}" aria-label="${esc(d.name)} verisini yeniden dene" title="Veriyi yeniden dene">↻</button>` : ''}`;
  }
  announce(text) {
    const el = this.modal?.box.querySelector('#study-announcement'); if (el) el.textContent = text;
  }
  open(category = 'all') {
    if (this.modal?.overlay.open) { this.modal.box.querySelector('#ind-search')?.focus(); return; }
    this.category = category;
    this.modal = chartDialog('', 'studies-dialog');
    this.modal.overlay.setAttribute('aria-label', 'İndikatörler ve analiz katmanları');
    this.showBrowser();
  }
  showBrowser() {
    const { box, close } = this.modal;
    box.innerHTML = `<header class="dialog-header"><div><h3>İndikatörler</h3><p>Tüm göstergeler ve analiz katmanları tek yerde.</p></div><button id="ind-close" class="icon-button" aria-label="İndikatör panelini kapat">${icon('close')}</button></header>
      <label class="study-search">${icon('search')}<input id="ind-search" placeholder="İndikatör ara · EMA, RSI, FVG, seans…" aria-label="İndikatör ara"></label>
      <div class="study-browser"><nav class="study-categories" aria-label="İndikatör kategorileri">${categories.map(([id, name]) => `<button data-cat="${id}" aria-pressed="${this.category === id}">${name}</button>`).join('')}</nav><div class="study-results"><div id="ind-list"></div></div></div>
      <footer class="study-footer"><small id="study-announcement" role="status">Eklediğin göstergeleri grafik başlığından da yönetebilirsin.</small><button id="remove-all-studies">Tümünü kaldır</button></footer>`;
    box.querySelector('#ind-close').onclick = close;
    box.querySelector('#ind-search').oninput = () => this.renderList();
    box.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      this.category = b.dataset.cat;
      box.querySelectorAll('[data-cat]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      this.renderList();
    });
    box.querySelector('#remove-all-studies').onclick = () => {
      if (!this.active().length || !confirm('Grafikteki tüm indikatörler kaldırılsın mı? Çizimleriniz etkilenmez.')) return;
      this.indicators.clear();
      for (const d of OVERLAY_CATALOG) this.state[d.id].added = false;
      this.applyVisibility(); this.persist();
    };
    this.renderList(); box.querySelector('#ind-search').focus();
  }
  renderList() {
    const box = this.modal?.box, list = box?.querySelector('#ind-list'); if (!list) return;
    const q = box.querySelector('#ind-search').value.trim().toLocaleLowerCase('tr-TR');
    const matches = d => `${d.name} ${d.description || ''} ${d.id}`.toLocaleLowerCase('tr-TR').includes(q);
    if (this.category === 'active') {
      const rows = this.active().filter(matches);
      list.innerHTML = '<div class="study-table-heading">GRAFİKTEKİ GÖSTERGELER</div>' + (rows.map(d => `<article class="study-row" data-active-study="${esc(d.id)}">
        <span class="study-dot" style="background:${esc(d.color)}"></span><div class="study-row-info"><strong>${esc(d.name)}${!d.visible ? ' · gizli' : ''}</strong><small>${esc(d.subtitle)}</small>${this.statusHTML(d)}</div>
        <div class="study-row-actions"><button data-study-eye="${esc(d.id)}" aria-label="${esc(d.name)} göster/gizle" title="Göster/gizle">${icon(d.visible ? 'eye' : 'eyeOff')}</button>
        ${d.id === 'volume' ? '' : `<button data-study-settings="${esc(d.id)}" aria-label="${esc(d.name)} ayarları" title="Ayarlar">${icon('settings')}</button>`}
        <button data-study-remove="${esc(d.id)}" aria-label="${esc(d.name)} kaldır" title="Kaldır">${icon('close')}</button></div></article>`).join('') || '<div class="study-empty">Grafikte indikatör yok.<br>Tüm indikatörler sekmesinden ekleyebilirsin.</div>');
      this.wireActive(list); return;
    }
    const items = this.catalog.filter(d => (this.category === 'all' || (this.category === 'fav' ? this.favorites.includes(d.id) : d.category === this.category)) && matches(d));
    list.innerHTML = '<div class="study-table-heading">GÖSTERGE ADI / AÇIKLAMA</div>' + (items.map(d => {
      const installed = this.state[d.id]?.added;
      return `<article class="study-row"><button class="study-star" data-fav="${d.id}" aria-label="${esc(d.name)} favori" aria-pressed="${this.favorites.includes(d.id)}">${icon('star')}</button>
        <div class="study-row-info"><strong>${esc(d.name)}${d.pane === 'oscillator' ? '<small class="pane-tag">Alt panel</small>' : ''}</strong><small>${esc(d.description)}</small></div>
        ${installed && d.id !== 'volume' ? `<div class="study-row-actions"><button data-study-settings="${d.id}" aria-label="${esc(d.name)} ayarları" title="Ayarlar">${icon('settings')}</button></div>` : ''}
        <button class="study-add" data-add="${d.id}" aria-label="${esc(d.name)} ${installed ? 'göster' : 'ekle'}">${icon(installed ? 'check' : 'plus')}${installed ? 'Grafikte' : 'Ekle'}</button></article>`;
    }).join('') || '<div class="study-empty">Sonuç bulunamadı.<br>Başka bir isim veya kategori dene.</div>');
    list.querySelectorAll('[data-add]').forEach(b => b.onclick = () => this.add(b.dataset.add));
    list.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => {
      const id = b.dataset.fav;
      this.favorites = this.favorites.includes(id) ? this.favorites.filter(x => x !== id) : [...this.favorites, id];
      try { localStorage.setItem('alfa-ind-fav:v1', JSON.stringify(this.favorites)); } catch {}
      this.renderList();
    });
    this.wireActive(list);
  }
  openSettings(id) {
    if (!this.modal?.overlay.open) this.open('active');
    const item = this.indicators.items.find(i => i.id === id);
    const def = item?.def || this.catalog.find(d => d.id === id);
    if (!def) return;
    const manager = this.managers[id], cfg = item ? { ...item.params } : structuredClone(manager.config || {});
    const fields = item ? Object.keys(item.params) : schemas[id] || [];
    const periodOwner = item ? item.type : id;
    const input = key => {
      const value = cfg[key] ?? manager?.defaultConfig?.()[key];
      let control;
      if (key === 'source') control = `<select data-k="${key}">${['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'].map(v => `<option ${value === v ? 'selected' : ''} value="${v}">${v.toUpperCase()}</option>`).join('')}</select>`;
      else if (key === 'period' && this.state[periodOwner]) control = `<select data-k="${key}">${periodOptions.map(([v, n]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
      else if (key === 'market' && ['marketDelta', 'footprint', 'heatmap'].includes(periodOwner)) control = `<select data-k="${key}">${marketOptions.map(([v, n]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
      else if (key === 'mode' || key === 'mitigation') {
        const opts = key === 'mode' ? [['close', 'Kapanış'], ['wick', 'Fitil']] : [['wick', 'Fitil'], ['body', 'Mum gövdesi'], ['half', 'Yarı dolum'], ['full', 'Tam dolum']];
        control = `<select data-k="${key}">${opts.map(([v, n]) => `<option value="${v}" ${value === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
      } else if (typeof value === 'boolean') control = `<input data-k="${key}" type="checkbox" ${value ? 'checked' : ''}>`;
      else if (key === 'color') control = `<input data-k="${key}" type="color" value="${esc(value)}">`;
      else control = `<input data-k="${key}" type="number" step="any" min="0" max="${['opacity', 'dispMin'].includes(key) ? 1 : 5000}" value="${esc(value)}" required>`;
      return `<label class="setting-row"><span>${esc(labels[key] || (key === 'mode' ? 'Kırılım onayı' : 'Bölge dolum ölçütü'))}</span>${control}</label>`;
    };
    let html = fields.map(input).join('');
    if (schemas[id] && ['oi', 'longShort', 'cvdSpot', 'cvdPerp', 'marketDelta', 'footprint', 'heatmap'].includes(id)) {
      html = '<p>Bu gösterge anahtarsız Binance verisi kullanır. Yalnızca Binance Spot / Vadeli sembollerde çalışır; diğer borsa referansları dönüştürülmez.</p>' + html;
    }
    if (PUBLIC_STUDY_DETAILS[id]) {
      html = `<aside class="chart-scope-note" data-study-scope="${esc(id)}" role="note"><strong>Verinin kapsamı</strong><p>${esc(PUBLIC_STUDY_DETAILS[id].scope)}</p></aside>` + html;
    }
    if (id === 'mtf') html = `<fieldset><legend>Üst zaman dilimleri</legend>${['15m', '30m', '1h', '4h', '1d', '1w'].map(tf => `<label><input type="checkbox" data-htf="${tf}" ${(cfg.htf || []).includes(tf) ? 'checked' : ''}> ${tf.toUpperCase()}</label>`).join(' ')}</fieldset>` + html;
    if (id === 'levels') {
      const names = { DO: 'Gün açılışı', WO: 'Hafta açılışı', MO: 'Ay açılışı', NYMO: 'New York gece yarısı', PDH: 'Önceki gün yüksek', PDL: 'Önceki gün düşük',
        PWH: 'Önceki hafta yüksek', PWL: 'Önceki hafta düşük', PMH: 'Önceki ay yüksek', PML: 'Önceki ay düşük', asia: 'Asya H/L/O', london: 'Londra H/L/O', ny: 'New York H/L/O' };
      html = '<p>Saat sınırları kayıtlı seviye ayarlarını kullanır. Fiyat ekseni etiketlerini Görünüm menüsünden açabilirsin.</p>' +
        Object.entries(names).map(([k, name]) => `<label class="setting-row">${name}<input type="checkbox" data-level="${k}" ${cfg.show?.[k] !== false ? 'checked' : ''}></label>`).join('');
    }
    if (id === 'sessions') {
      html = '<p>UTC saatleri. Düzenlenen saatler UTC’ye sabitlenir; borsa saati seçeneğinde yaz/kış saati otomatik izlenir. Gece yarısını aşan aralıklar desteklenir.</p>' +
        SESSION_BOX_DEFS.map(d => {
          const win = manager.utcWindow(d);
          return `<fieldset><legend>${d.name}</legend><label><input data-session-show="${d.id}" type="checkbox" ${cfg.enabled[d.id] !== false ? 'checked' : ''}> Seansı göster</label>
            <div class="session-time-row"><label><span><input data-pin="${d.id}" type="checkbox" ${win.pinned ? 'checked' : ''}> Sabit UTC</span><small>Kapalıysa borsa saati</small></label>
            <label>Başlangıç<input type="time" data-start="${d.id}" value="${win.start}" required></label><label>Bitiş<input type="time" data-end="${d.id}" value="${win.end}" required></label></div></fieldset>`;
        }).join('') + `<label class="setting-row">Gösterilecek gün<input data-days type="number" min="1" max="30" value="${Number(cfg.days) || 5}" required></label>`;
    }
    const box = this.modal.box;
    box.innerHTML = `<header class="dialog-header"><div><h3>${esc(def.name)}</h3><p>Gösterge ayarları</p></div><button class="icon-button" id="settings-close" aria-label="Ayarları kapat">${icon('close')}</button></header>
      <form class="study-settings">${html}<p class="settings-error" role="status"></p><div class="settings-actions"><button type="button" id="is-cancel">Geri</button><button type="submit" class="apply" id="is-apply">Uygula</button></div></form>`;
    box.querySelector('#settings-close').onclick = () => this.modal.close();
    box.querySelector('#is-cancel').onclick = () => this.showBrowser();
    box.querySelectorAll('[data-start],[data-end]').forEach(el => el.oninput = () => { box.querySelector(`[data-pin="${el.dataset.start || el.dataset.end}"]`).checked = true; });
    box.querySelector('form').onsubmit = e => {
      e.preventDefault();
      try {
        box.querySelectorAll('[data-k]').forEach(el => {
          const key = el.dataset.k;
          const value = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
          if (el.type === 'number' && (!Number.isFinite(value) || value < 0 || value > Number(el.max) ||
            ((item || ['left', 'right', 'maxProtected', 'maxRegions'].includes(key)) && (!(value > 0) || (!['mult'].includes(key) && !Number.isInteger(value)))))) throw new Error('Periyot ve sınırlar için geçerli, pozitif bir sayı girin.');
          cfg[key] = value;
        });
        if (id === 'levels') box.querySelectorAll('[data-level]').forEach(el => { cfg.show[el.dataset.level] = el.checked; });
        if (id === 'mtf') {
          cfg.htf = [...box.querySelectorAll('[data-htf]:checked')].map(el => el.dataset.htf);
          if (!cfg.htf.length) throw new Error('En az bir üst zaman dilimi seçin.');
        }
        if (id === 'sessions') {
          cfg.utc = {};
          for (const d of SESSION_BOX_DEFS) {
            cfg.enabled[d.id] = box.querySelector(`[data-session-show="${d.id}"]`).checked;
            if (!box.querySelector(`[data-pin="${d.id}"]`).checked) continue;
            const start = box.querySelector(`[data-start="${d.id}"]`).value, end = box.querySelector(`[data-end="${d.id}"]`).value;
            if (!parseHM(start) || !parseHM(end) || start === end) throw new Error('Başlangıç ve bitiş saatleri geçerli ve farklı olmalı.');
            cfg.utc[d.id] = { start, end };
          }
          cfg.days = Number(box.querySelector('[data-days]').value);
          if (!(cfg.days >= 1 && cfg.days <= 30 && Number.isInteger(cfg.days))) throw new Error('Gün sayısı 1–30 arasında olmalı.');
        }
        if (item) this.indicators.updateParams(item.id, cfg);
        else {
          manager.updateConfig ? manager.updateConfig(cfg) : (manager.config = cfg);
          this.state[id] = { added: true, visible: true, collapsed: false };
          if (id === 'sessions') { manager.saveConfig(); manager.buildUI(); manager.render(); }
          this.applyVisibility();
        }
        this.persist(); this.showBrowser();
      } catch (error) { box.querySelector('.settings-error').textContent = error.message; }
    };
  }
}
