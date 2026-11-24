import { SYMBOLS, REST_ORIGINS, isSpotSymbol, isFreeMarketRef, parseMarketRef, fetchMarketQuotes } from './alfa-charts-data.mjs?v=11';
import { spotMarkets, cleanWatchlist, parseWatchlistText, importPreview, tradingViewSymbolURL, foreignMarkets, WATCHLIST_LIMIT, IMPORT_BYTES,
  LEGACY_TV_LIST, FLAG_COLORS, GROUP_MODES, SORT_MODES, activeList, allWatchlistRefs, classifyWatchlistRef, filteredWatchlistRefs,
  groupWatchlistRefs, legacyWatchlistKeys, mergeLegacyWatchlist, migrateWatchlistDocument, normalizeWatchlistDocument,
  sortWatchlistRefs, watchlistGroupKey, watchlistKey, watchlistMigrationKey } from './alfa-watchlist-model.mjs?v=10';
import { chartDialog, icon, escapeHTML as esc } from './alfa-chart-ui.mjs?v=2';
const $ = id => document.getElementById(id);
const CATALOG_KEY = 'alfa-spot-catalog:v1';
const readJSON = value => { try { return JSON.parse(value || 'null'); } catch { return null; } };
export function formatMarketPrice(value, precision) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = Number.isInteger(precision) ? Math.max(0, Math.min(10, precision)) : n > 0 && n < 1 ? Math.min(10, Math.max(4, -Math.floor(Math.log10(n)) + 3)) : 2;
  return n.toLocaleString('tr-TR', { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
}
export class ChartWatchlist {
  constructor({ getOwner, getSelected, onSelect, onHover, getAccessToken, onStatus, getLegacyCloud }) {
    Object.assign(this, { getOwner, getSelected, onSelect, onHover, getAccessToken, onStatus, getLegacyCloud });
    this.abort = new AbortController(); this.quotes = new Map();
    this.markets = SYMBOLS.map(symbol => ({ symbol, base: symbol.replace('USDT', ''), quote: 'USDT', precision: 2 }));
    this.doc = normalizeWatchlistDocument(null, SYMBOLS); this.owner = null; this.migrationGeneration = 0; this.search = '';
    this.catalogState = 'loading'; this.account();
    $('symbol-search').onclick = () => this.openPicker();
    $('watch-add').onclick = () => this.openPicker();
    $('watch-import').onclick = () => this.openImport();
    $('watch-export').onclick = () => this.export();
    $('watch-share').onclick = () => this.share();
    $('watch-settings').onclick = () => this.openSettings();
    $('watch-list-add').onclick = () => this.openSettings();
    $('watch-list').onchange = e => this.setActiveList(e.target.value);
    $('watch-filter').oninput = e => { this.search = e.target.value; this.render(); };
    $('symbol').onchange = e => this.select(e.target.value);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refreshQuotes(); }, { signal: this.abort.signal });
    this.timer = setInterval(() => { if (!document.hidden) this.refreshQuotes(); }, 60000);
    this.start();
  }
  key() { return watchlistKey(this.owner); }
  get symbols() { return activeList(this.doc)?.symbols || []; }
  set symbols(value) {
    const list = activeList(this.doc);
    if (list) list.symbols = cleanWatchlist(value);
    this.doc.symbols = [...this.symbols];
  }
  get name() { return this.doc.name; }
  set name(value) { this.doc.name = String(value || '').trim().slice(0, 60) || 'İzleme listesi'; }
  get settings() { return this.doc.settings; }
  allSymbols() { return allWatchlistRefs(this.doc); }
  list(id) { return this.doc.lists.find(l => l.id === id) || null; }
  account() {
    const owner = String(this.getOwner?.() || 'guest');
    if (owner === this.owner) return;
    this.modal?.close(); this.modal = null; this.importController?.abort(); this.quoteController?.abort();
    this.owner = owner;
    const generation = ++this.migrationGeneration;
    // Keep the raw persisted value for migration. Normalizing with SYMBOLS is
    // only for immediate display; if nothing was saved, the legacy restore
    // must not inherit those four unedited default symbols.
    this.rawStored = readJSON(localStorage.getItem(this.key()));
    this.doc = normalizeWatchlistDocument(this.rawStored, SYMBOLS);
    this.search = ''; this.render();
    void this.migrateLegacy(owner, generation);
  }
  async migrateLegacy(owner, generation) {
    try {
      if (localStorage.getItem(watchlistMigrationKey(owner)) === '1') return;
      // Let the boot path finish before touching any async cloud client.
      await Promise.resolve();
      let cloud = null;
      // A cloud read failure must never block local legacy data.
      if (typeof this.getLegacyCloud === 'function') {
        try { cloud = await this.getLegacyCloud(owner); } catch { cloud = null; }
      }
      if (generation !== this.migrationGeneration || owner !== this.getOwner()) return;
      const keys = legacyWatchlistKeys(owner), sources = [], favorites = [];
      if (cloud && typeof cloud === 'object') {
        for (const k of keys.lists) if (cloud[k] != null) sources.push(cloud[k]);
        for (const k of keys.favorites) if (cloud[k] != null) favorites.push(cloud[k]);
      }
      for (const k of keys.lists) { const raw = localStorage.getItem(k); if (raw != null) sources.push(raw); }
      for (const k of keys.favorites) { const raw = localStorage.getItem(k); if (raw != null) favorites.push(raw); }
      const result = migrateWatchlistDocument({ owner, current: this.rawStored, sources, favorites });
      if (result.changed) this.doc = result.doc;
      if (!result.shouldMark || !this.save()) return;
      localStorage.setItem(watchlistMigrationKey(owner), '1');
      if (result.added.length) {
        this.render(); this.refreshQuotes();
        this.onStatus(`${result.added.length} eski sembol geri getirildi · listeler korundu`, 'ok');
      }
    } catch { /* A failed cloud read never overwrites local data; retry next boot. */ }
  }
  save() {
    if (this.owner !== this.getOwner()) { this.account(); return false; }
    try { localStorage.setItem(this.key(), JSON.stringify(this.doc)); }
    catch { this.onStatus('Liste kaydedilemedi; tarayıcı depolama alanını kontrol edin.', 'error'); return false; }
    return true;
  }
  info(ref) {
    const spot = this.markets.find(m => m.symbol === ref);
    if (spot) return { ...spot, venue: 'BINANCE', marketType: 'spot', label: `${spot.base}/${spot.quote} · Binance Spot`, chartable: true };
    try {
      const market = parseMarketRef(ref);
      return { symbol: ref, base: market.base, quote: market.quote, venue: market.venue, marketType: market.marketType,
        label: market.label, chartable: market.chartable, precision: undefined };
    } catch { return { symbol: ref, base: ref, quote: '', venue: '?', marketType: '', label: ref, chartable: false, precision: undefined }; }
  }
  async start() {
    await this.loadCatalog();
    if (this.abort.signal.aborted) return;
    this.render(); this.refreshQuotes();
    const shared = new URL(location.href).searchParams.get('watchlist');
    if (shared && shared.length <= 50000) this.openImport(shared);
  }
  async loadCatalog(force = false) {
    if (this.catalogPromise && !force) return this.catalogPromise;
    this.catalogPromise = (async () => {
      if (!force) try {
        const cached = JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null');
        if (cached?.at > Date.now() - 6 * 3600000 && Array.isArray(cached.markets)) {
          this.markets = spotMarkets({ symbols: cached.markets.map(m => ({ symbol: m.symbol, baseAsset: m.base, quoteAsset: m.quote, status: 'TRADING', isSpotTradingAllowed: true,
            filters: [{ filterType: 'PRICE_FILTER', tickSize: Number.isInteger(m.precision) ? String(10 ** -m.precision) : '.01' }] })) });
          this.catalogState = 'ready'; return;
        }
      } catch {}
      for (const origin of REST_ORIGINS) {
        try {
          const response = await fetch(origin + '/api/v3/exchangeInfo', { cache: 'no-store', signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(12000)]) });
          if (!response.ok) continue;
          this.markets = spotMarkets(await response.json()); this.catalogState = 'ready';
          try { localStorage.setItem(CATALOG_KEY, JSON.stringify({ at: Date.now(), markets: this.markets })); } catch {}
          return;
        } catch { if (this.abort.signal.aborted) return; }
      }
      this.catalogState = 'error';
    })();
    await this.catalogPromise;
    this.renderPicker?.();
  }
  valid(ref) {
    try { parseMarketRef(ref); } catch (e) { this.onStatus(e.message || 'Desteklenmeyen sembol', 'error'); return false; }
    if (isSpotSymbol(ref) && this.catalogState === 'ready' && !this.markets.some(m => m.symbol === ref)) {
      this.onStatus('Bu parite işleme açık Binance Spot kataloğunda yok.', 'error'); return false;
    }
    return true;
  }
  select(ref) { if (this.valid(ref)) { this.onSelect(ref); this.render(); } }
  add(ref) {
    if (this.allSymbols().includes(ref) && this.symbols.includes(ref)) return;
    if (this.allSymbols().length >= WATCHLIST_LIMIT) { this.onStatus('İzleme listesi en fazla 200 sembol içerebilir.', 'error'); return; }
    if (!this.valid(ref)) return;
    const list = activeList(this.doc);
    if (list && !list.symbols.includes(ref)) list.symbols.push(ref);
    this.doc.symbols = [...this.symbols];
    this.save(); this.render(); this.renderPicker?.(); this.refreshQuotes();
  }
  remove(symbol) { this.symbols = this.symbols.filter(s => s !== symbol); this.save(); this.render(); }
  setActiveList(id) {
    if (!this.list(id) || id === this.doc.activeListId) return;
    this.doc.activeListId = id; this.doc.symbols = [...this.symbols];
    this.save(); this.render(); this.openSettingsIfOpen?.();
  }
  toggleStar(ref) {
    const flag = this.doc.flags[ref] ||= {};
    if (flag.starred) delete flag.starred; else flag.starred = true;
    if (!Object.keys(flag).length) delete this.doc.flags[ref];
    this.save(); this.render();
  }
  cycleFlag(ref) {
    const flag = this.doc.flags[ref] ||= {}, current = FLAG_COLORS.indexOf(flag.color || '');
    const next = FLAG_COLORS[(current + 1) % FLAG_COLORS.length];
    if (next) flag.color = next; else delete flag.color;
    if (!Object.keys(flag).length) delete this.doc.flags[ref];
    this.save(); this.render();
  }
  rowHTML(ref, selected) {
    const info = this.info(ref), venue = esc(info.venue), kind = esc((info.marketType || '').toUpperCase() || 'Spot');
    const flag = this.doc.flags[ref] || {}, color = FLAG_COLORS.includes(flag.color) ? flag.color : '';
    const quote = this.settings.showQuotes ? `<span class="watch-quote"><span class="watch-price" data-watch-price="${esc(ref)}">—</span><small data-watch-change="${esc(ref)}">—</small></span>` : '';
    return `<div class="watch-item${this.settings.compact ? ' watch-compact' : ''}"><button type="button" class="watch-row" data-symbol="${esc(ref)}" aria-label="${esc(info.label)}" aria-pressed="${ref === selected}">
      <span class="coin-icon"${color ? ` style="--flag-color:${color}"` : ''}>${info.base === 'BTC' ? '₿' : esc(String(info.base || ref).slice(0, 1))}</span><span><strong>${esc(info.base || ref)}</strong><small>${esc(info.quote || info.marketType || '')} · ${venue}</small></span>
      ${quote}</button>
      ${this.settings.showFlags ? `<button type="button" class="watch-flag" data-watch-flag="${esc(ref)}"${color ? ` style="--flag-color:${color}"` : ''} aria-label="${esc(ref)} renk bayrağı" title="Renk bayrağı: ${color || 'yok'}">${icon('list')}</button>` : ''}
      <button type="button" class="watch-star${flag.starred ? ' on' : ''}" data-watch-star="${esc(ref)}" aria-pressed="${!!flag.starred}" aria-label="${esc(ref)} favorisi" title="Favori / klasik listelerde üste al">${icon('star')}</button>
      <button type="button" class="watch-remove" data-remove-symbol="${esc(ref)}" aria-label="${esc(ref)} listeden çıkar" title="Listeden çıkar · ${kind}">${icon('close')}</button></div>`;
  }
  render() {
    const selected = this.getSelected();
    const select = $('symbol'); select.replaceChildren();
    for (const ref of [...new Set([selected, ...this.allSymbols()])]) {
      try { parseMarketRef(ref); } catch { continue; }
      const o = document.createElement('option'); o.value = o.textContent = ref; select.append(o);
    }
    select.value = selected;
    const active = activeList(this.doc);
    $('watchlist-title').textContent = active?.name || this.name;
    $('watch-count').textContent = this.symbols.length;
    const listSelect = $('watch-list');
    if (listSelect) {
      listSelect.replaceChildren();
      for (const list of this.doc.lists) {
        const o = document.createElement('option'); o.value = list.id; o.textContent = `${list.name} · ${list.symbols.length}`; listSelect.append(o);
      }
      listSelect.value = this.doc.activeListId;
    }
    const filter = $('watch-filter');
    if (filter && document.activeElement !== filter) filter.value = this.search;
    const visible = sortWatchlistRefs(filteredWatchlistRefs(this.symbols, this.search), this.settings, this.quotes);
    const groups = this.settings.groupBy === 'none' ? [{ id: 'all', name: '', refs: visible }] : groupWatchlistRefs(visible, this.settings.groupBy);
    $('watch-rows').innerHTML = groups.map(group => {
      const key = watchlistGroupKey(group.id), collapsed = !!this.settings.collapsedGroups[key];
      const head = key === 'all' ? '' : `<button type="button" class="watch-group-head" data-watch-group="${esc(key)}" aria-expanded="${!collapsed}">${icon('chevron')}<strong>${esc(group.name)}</strong><small>${group.refs.length}</small></button>`;
      const rows = collapsed ? '' : group.refs.map(ref => this.rowHTML(ref, selected)).join('');
      return `<section class="watch-group${collapsed ? ' collapsed' : ''}" data-watch-group-section="${esc(key)}">${head}${rows}</section>`;
    }).join('') || '<p class="watch-empty">Bu listede eşleşen sembol yok.<br>+ ile sembol ekle veya liste içe aktar.</p>';
    $('watch-rows').querySelectorAll('[data-symbol]').forEach(b => {
      b.onclick = () => this.select(b.dataset.symbol);
      b.addEventListener('pointerenter', () => this.onHover?.(b.dataset.symbol));
      b.addEventListener('focus', () => this.onHover?.(b.dataset.symbol));
    });
    $('watch-rows').querySelectorAll('[data-remove-symbol]').forEach(b => b.onclick = () => this.remove(b.dataset.removeSymbol));
    $('watch-rows').querySelectorAll('[data-watch-star]').forEach(b => b.onclick = () => this.toggleStar(b.dataset.watchStar));
    $('watch-rows').querySelectorAll('[data-watch-flag]').forEach(b => b.onclick = () => this.cycleFlag(b.dataset.watchFlag));
    $('watch-rows').querySelectorAll('[data-watch-group]').forEach(b => b.onclick = () => {
      const key = b.dataset.watchGroup;
      if (this.settings.collapsedGroups[key]) delete this.settings.collapsedGroups[key];
      else this.settings.collapsedGroups[key] = true;
      this.save(); this.render();
    });
    this.paintQuotes();
  }
  updateQuote(symbol, price) {
    this.quotes.set(symbol, { ...this.quotes.get(symbol), price, at: Date.now() }); this.paintQuotes();
  }
  paintQuotes() {
    for (const symbol of this.allSymbols()) {
      const q = this.quotes.get(symbol), price = document.querySelector(`[data-watch-price="${symbol}"]`), change = document.querySelector(`[data-watch-change="${symbol}"]`);
      if (!q || !price) continue;
      price.textContent = formatMarketPrice(q.price, this.info(symbol).precision);
      price.title = new Date(q.at).toLocaleTimeString('tr-TR') + (Date.now() - q.at > 120000 ? ' · güncel olmayabilir' : '');
      if (change && Number.isFinite(q.change)) { change.textContent = `${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)}%`; change.style.color = q.change >= 0 ? '#68bba1' : '#ef6677'; change.title = 'Son 24 saat'; }
    }
  }
  async refreshQuotes() {
    this.quoteController?.abort();
    if (!this.symbols.length || this.abort.signal.aborted) return;
    const owner = this.owner, symbols = [...this.allSymbols()]; this.quoteController = new AbortController();
    const signal = AbortSignal.any([this.abort.signal, this.quoteController.signal, AbortSignal.timeout(12000)]);
    const spot = symbols.filter(isSpotSymbol), others = symbols.filter(s => !isSpotSymbol(s));
    if (spot.length) for (const origin of REST_ORIGINS) try {
      const r = await fetch(origin + '/api/v3/ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(spot)), { cache: 'no-store', signal });
      if (!r.ok) continue;
      const rows = await r.json(); if (!Array.isArray(rows) || owner !== this.owner) return;
      for (const row of rows) if (spot.includes(row.symbol) && Number.isFinite(Number(row.lastPrice)) && Number(row.lastPrice) > 0 && Number.isFinite(Number(row.priceChangePercent))) {
        this.quotes.set(row.symbol, { price: Number(row.lastPrice), change: Number(row.priceChangePercent), at: Math.min(Date.now(), Number(row.closeTime) || 0) });
      }
      this.paintQuotes(); break;
    } catch { if (signal.aborted) return; }
    if (!others.length || owner !== this.owner || signal.aborted) return;
    try {
      const needsAuth = others.some(ref => !isFreeMarketRef(ref));
      const token = needsAuth ? await this.getAccessToken() : '';
      for (let i = 0; i < others.length; i += 60) {
        const quotes = await fetchMarketQuotes(others.slice(i, i + 60), signal, fetch, token);
        if (owner !== this.owner || signal.aborted) return;
        for (const [ref, quote] of Object.entries(quotes)) this.quotes.set(ref, quote);
        this.paintQuotes();
      }
    } catch { /* One failed venue never clears prices already on screen. */ }
  }
  openPicker() {
    this.modal?.close();
    const modal = this.modal = chartDialog(`<div class="dialog-header"><div><h3>Sembol ekle</h3><p>Binance Spot · borsa, vadeli, forex, endeks ve kripto endeksleri</p></div><button id="symbols-close" class="icon-button" aria-label="Kapat">${icon('close')}</button></div>
      <label class="study-search">${icon('search')}<input id="symbol-query" placeholder="BTC, OKX:ETHUSDT.P, XAUUSD, CRYPTOCAP:TOTAL…" aria-label="Sembol ara"></label>
      <div class="symbol-filters"><label>Borsa <select id="symbol-venue"><option value="">Tümü</option>${['BINANCE', 'OKX', 'BYBIT', 'CME', 'CBOE', 'BIST', 'TVC', 'FX', 'FX_IDC', 'OANDA', 'FOREXCOM', 'FPMARKETS', 'CRYPTOCAP'].map(v => `<option>${v}</option>`).join('')}</select></label>
        <label>Karşılık <select id="symbol-quote"><option value="">Tümü</option><option>USDT</option><option>USDC</option><option>BTC</option><option>ETH</option><option>BNB</option><option>TRY</option><option>EUR</option></select></label><small id="catalog-status"></small><button id="catalog-retry" type="button">Yenile</button></div>
      <div id="symbol-results" class="symbol-results"></div><p class="menu-note">Farklı borsa ve vadeli semboller Spot ile değiştirilmez; kendi borsası ve piyasa türüyle listeye eklenir. ÜCRETSİZ etiketliler giriş yapmadan açılır; liste yalnızca bu cihazda, hesabına özel saklanır.</p>`, 'symbol-dialog');
    modal.overlay.setAttribute('aria-label', 'Sembol arama');
    modal.box.querySelector('#symbols-close').onclick = modal.close;
    this.renderPicker = () => {
      if (!modal.overlay.open) return;
      const q = modal.box.querySelector('#symbol-query').value.toUpperCase().replace(/[ /]/g, '').replace(/^BINANCE:/, '');
      const quote = modal.box.querySelector('#symbol-quote').value, venue = modal.box.querySelector('#symbol-venue').value;
      const spots = (!venue || venue === 'BINANCE') ? this.markets
        .filter(m => (!quote || m.quote === quote) && (!q || m.symbol.includes(q)))
        .map(m => ({ ref: m.symbol, base: m.base, quote: m.quote, venue: 'BINANCE', marketType: 'SPOT', chartable: true })) : [];
      const foreign = foreignMarkets().filter(m => (!venue || m.venue === venue) && (!quote || m.quote === quote) &&
        (!q || m.key.includes(q) || m.feedSymbol.toUpperCase().includes(q) || m.label.toUpperCase().includes(q)))
        .map(m => ({ ref: m.key, base: m.base, quote: m.quote, venue: m.venue, marketType: (m.marketType || '').toUpperCase(), chartable: m.chartable, free: isFreeMarketRef(m.ref) }));
      const results = [...spots, ...foreign].slice(0, 80);
      const status = modal.box.querySelector('#catalog-status');
      status.textContent = this.catalogState === 'loading' ? 'Binance kataloğu yükleniyor…' :
        this.catalogState === 'error' ? 'Binance kataloğuna ulaşılamadı; diğer borsalar yine eklenebilir.' : results.length + ' sembol';
      modal.box.querySelector('#symbol-results').innerHTML = results.map(m => {
        const ref = esc(m.ref), added = this.allSymbols().includes(m.ref);
        return `<div class="symbol-result"><button data-open-symbol="${ref}"><strong>${esc(m.base)} <small>${m.quote ? '/ ' + esc(m.quote) : ''}</small></strong>
          <small class="venue-badge">${esc(m.venue)} · ${esc(m.marketType || 'SPOT')}${m.chartable === false ? ' · CANLI' : ''}${m.free ? ' · ÜCRETSİZ' : ''}</small></button>
          <button data-add-symbol="${ref}" aria-label="${ref} listeye ekle" ${added ? 'disabled' : ''}>${icon(added ? 'check' : 'plus')}</button></div>`;
      }).join('') || '<p class="study-empty">Eşleşen sembol yok.</p>';
      modal.box.querySelectorAll('[data-add-symbol]').forEach(b => b.onclick = () => this.add(b.dataset.addSymbol));
      modal.box.querySelectorAll('[data-open-symbol]').forEach(b => {
      b.onclick = () => { this.add(b.dataset.openSymbol); this.select(b.dataset.openSymbol); modal.close(); };
      b.addEventListener('pointerenter', () => this.onHover?.(b.dataset.openSymbol));
      b.addEventListener('focus', () => this.onHover?.(b.dataset.openSymbol));
    });
    };
    modal.box.querySelector('#symbol-query').oninput = this.renderPicker;
    modal.box.querySelector('#symbol-quote').onchange = this.renderPicker;
    modal.box.querySelector('#symbol-venue').onchange = this.renderPicker;
    modal.box.querySelector('#catalog-retry').onclick = async () => { this.catalogState = 'loading'; this.renderPicker(); await this.loadCatalog(true); this.renderPicker(); };
    this.renderPicker(); modal.box.querySelector('#symbol-query').focus();
  }
  openImport(initial = '') {
    this.modal?.close();
    const owner = this.owner;
    const modal = this.modal = chartDialog(`<div class="dialog-header"><div><h3>İzleme listesi içe aktar</h3><p>TradingView TXT / CSV, semboller veya herkese açık liste linki</p></div><button id="import-close" class="icon-button" aria-label="Kapat">${icon('close')}</button></div>
      <label class="import-file">TXT / CSV dosyası seç<input id="watchlist-file" type="file" accept=".txt,.csv,text/plain,text/csv"></label>
      <label class="import-source-label" for="watchlist-source">Semboller veya link</label><textarea id="watchlist-source" rows="4" placeholder="BINANCE:BTCUSDT,OKX:XAUTUSDT,CBOE:VIX,CRYPTOCAP:TOTAL&#10;https://www.tradingview.com/watchlists/…/" spellcheck="false"></textarea>
      <p class="menu-note">Binance Spot, OKX/Bybit vadeli, forex, endeks ve kripto endeksleri kendi borsasıyla eklenir; atlanan listelerdeki semboller ücretsiz veriyle açılır. Özel TradingView listesi için TXT dışa aktar. Linkle alma, Alfa Charts izni olan hesabınla giriş yapmanı gerektirir. Şifre veya TradingView çerezi istenmez.</p>
      <div class="import-options"><label><input id="import-replace" type="checkbox"> Mevcut listeyi değiştir</label><button id="watchlist-preview" type="button">Önizle</button></div>
      <div id="import-result" class="import-result" role="status"></div><div class="settings-actions"><button id="watchlist-apply" class="apply" type="button" disabled>Listeye ekle</button></div>`, 'watchlist-import-dialog');
    modal.overlay.setAttribute('aria-label', 'TradingView izleme listesi içe aktar');
    modal.box.querySelector('#import-close').onclick = modal.close;
    const source = modal.box.querySelector('#watchlist-source'), result = modal.box.querySelector('#import-result'), apply = modal.box.querySelector('#watchlist-apply'), replace = modal.box.querySelector('#import-replace');
    source.value = initial;
    let entries = null, preview = null;
    const paint = () => {
      preview = entries && importPreview(entries, this.markets, replace.checked ? [] : this.allSymbols());
      apply.disabled = !preview?.added.length; apply.textContent = replace.checked ? 'Listeyi değiştir' : 'Listeye ekle';
      if (preview) result.innerHTML = `<strong>${preview.added.length} sembol ${replace.checked ? 'yeni listeye' : 'listene'} alınacak</strong><p>${preview.added.map(esc).join(', ') || 'Eklenebilir yeni sembol yok.'}</p>
        ${preview.skipped.length ? `<details><summary>${preview.skipped.length} kayıt atlandı · nedenlerini göster</summary>${preview.skipped.slice(0, 100).map(s => `<div>${esc(s.raw)} — ${esc(s.reason)}</div>`).join('')}</details>` : ''}`;
    };
    replace.onchange = paint;
    source.oninput = () => { entries = preview = null; apply.disabled = true; result.textContent = ''; };
    modal.box.querySelector('#watchlist-file').onchange = async e => {
      const file = e.target.files?.[0]; if (!file) return;
      if (file.size > IMPORT_BYTES) { result.textContent = 'Dosya en fazla 512 KB olabilir.'; return; }
      source.value = await file.text(); source.oninput();
    };
    modal.box.querySelector('#watchlist-preview').onclick = async e => {
      e.currentTarget.disabled = true; apply.disabled = true; result.textContent = 'Liste kontrol ediliyor…';
      try {
        let text = source.value.trim();
        if (/^https?:\/\//i.test(text)) {
          const single = tradingViewSymbolURL(text);
          if (single) text = single;
          else {
            const token = await this.getAccessToken();
            if (!token) throw new Error('Linkten alma için Alfa Charts hesabına giriş yap; istersen TXT dosyasıyla giriş yapmadan içe aktar.');
            this.importController?.abort(); this.importController = new AbortController();
            const r = await fetch('/api/access', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, cache: 'no-store',
              body: JSON.stringify({ op: 'chart-watchlist-import', url: text }), signal: this.importController.signal });
            const data = await r.json();
            if (!r.ok || !data.ok) throw new Error(({ bad_watchlist_url: 'Geçerli bir TradingView /watchlists/ linki gir.', charts_access_required: 'Bu hesabın Alfa Charts izni yok.', watchlist_rate_limit: 'Çok sık deneme yapıldı; bir dakika sonra tekrar dene.' })[data.error] ||
              'Herkese açık liste okunamadı. Liste özel veya TradingView erişilemiyor olabilir; TXT dışa aktarıp yükle.');
            if (!Array.isArray(data.symbols) || data.symbols.length > 2000) throw new Error('Geçersiz liste yanıtı.');
            text = data.symbols.join(',');
          }
        }
        if (owner !== this.getOwner() || !modal.overlay.open) return;
        entries = parseWatchlistText(text);
        // Non-Binance venues are valid even when the Binance catalogue is down.
        if (entries.some(e => !e.reason && isSpotSymbol(e.ref))) {
          await this.loadCatalog();
          if (this.catalogState !== 'ready') throw new Error('Binance Spot pariteleri için katalog gerekli. Sembol arama panelinden Yenile’yi deneyin.');
        }
        paint();
      } catch (err) { entries = preview = null; result.textContent = err.message; }
      finally { if (modal.overlay.open) modal.box.querySelector('#watchlist-preview').disabled = false; }
    };
    apply.onclick = () => {
      if (owner !== this.getOwner() || !preview?.added.length) return;
      const next = replace.checked ? preview.added : [...this.symbols, ...preview.added];
      if (replace.checked && !confirm('Mevcut izleme listesi önizlemedeki sembollerle değiştirilsin mi? Çizimler silinmez.')) return;
      this.symbols = cleanWatchlist(next); this.save(); this.render(); this.refreshQuotes(); modal.close();
      this.onStatus(preview.added.length + ' sembol içe aktarıldı', 'ok');
    };
    source.focus();
  }
  openSettings() {
    this.modal?.close();
    const modal = this.modal = chartDialog(`<div class="dialog-header"><div><h3>İzleme listesi ayarları</h3><p>Listeler, TV tarzı sınıflandırma ve görünüm · çizimler etkilenmez</p></div><button id="watch-settings-close" class="icon-button" aria-label="Kapat">${icon('close')}</button></div><div id="watch-settings-body"></div>`, 'watchlist-settings-dialog');
    modal.overlay.setAttribute('aria-label', 'İzleme listesi ayarları');
    const body = modal.box.querySelector('#watch-settings-body');
    modal.box.querySelector('#watch-settings-close').onclick = modal.close;
    modal.overlay.addEventListener('close', () => {
      if (this.modal === modal) this.openSettingsIfOpen = null;
    }, { once: true });
    let note = '', selectedId = null;
    const sortLabels = { custom: 'Özel sıra', name: 'Sembol adı', venue: 'Borsa', type: 'Piyasa türü', change: '24s değişim', price: 'Fiyat' };
    const groupLabels = { none: 'Gruplama yok', type: 'TV sınıflandırması', venue: 'Borsa', quote: 'Karşılık' };
    const options = (labels, selected) => Object.entries(labels).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
    const render = () => {
      const active = activeList(this.doc), selected = this.list(selectedId) || active;
      const ref = this.getSelected() || active?.symbols?.[0] || '';
      const info = this.info(ref), cls = classifyWatchlistRef(ref);
      body.innerHTML = `<section class="watch-settings-section"><h4>Listeler</h4>
        <div class="watch-settings-row"><label>Liste<select id="ws-list">${this.doc.lists.map(l => `<option value="${esc(l.id)}"${l.id === selected?.id ? ' selected' : ''}>${esc(l.name)} · ${l.symbols.length}</option>`).join('')}</select></label></div>
        <div class="watch-settings-row"><label>Ad<input id="ws-name" maxlength="60" value="${esc(selected?.name || '')}"></label><label>Renk<input id="ws-color" type="color" value="${esc(selected?.color || '#7da4ff')}"></label></div>
        <div class="watch-settings-buttons"><button id="ws-add" type="button">+ Liste ekle</button><button id="ws-save" class="apply" type="button">Ad / renge kaydet</button><button id="ws-delete" type="button">Listeyi sil</button></div>
        <button id="ws-restore" class="watch-restore" type="button">TV listesini ekle (${LEGACY_TV_LIST.length})</button></section>
        <section class="watch-settings-section"><h4>Sınıflandırma ve görünüm</h4>
        <div class="watch-settings-row"><label>Sırala<select id="ws-sort">${options(sortLabels, this.settings.sort)}</select></label><label>Yön<select id="ws-direction">${options({ asc: 'Artan', desc: 'Azalan' }, this.settings.direction)}</select></label><label>Grupla<select id="ws-group">${options(groupLabels, this.settings.groupBy)}</select></label></div>
        <div class="watch-settings-flags"><label><input id="ws-compact" type="checkbox"${this.settings.compact ? ' checked' : ''}> Sıkışık satırlar</label><label><input id="ws-flags" type="checkbox"${this.settings.showFlags ? ' checked' : ''}> Renk bayrakları</label><label><input id="ws-quotes" type="checkbox"${this.settings.showQuotes ? ' checked' : ''}> Fiyatlar</label></div>
        <p class="watch-classification"><strong>${esc(ref || 'Sembol yok')}</strong> · ${esc(cls.name)} · ${esc(info.venue)} · ${esc(info.marketType || 'spot')}</p>
        <button id="ws-add-selected" type="button">Seçili sembolü bu listeye ekle</button></section>
        <p class="watch-settings-status" role="status">${esc(note)}</p>`;
      const status = text => { note = text; body.querySelector('.watch-settings-status').textContent = text; };
      const commit = (message, rerender = true) => {
        if (!this.save()) return;
        this.render();
        if (message) status(message);
        if (rerender) render();
      };
      body.querySelector('#ws-list').onchange = e => { selectedId = e.target.value; render(); };
      body.querySelector('#ws-add').onclick = () => {
        const base = String(body.querySelector('#ws-name').value || 'Yeni liste').trim().slice(0, 60) || 'Yeni liste';
        const root = watchlistGroupKey(base);
        let id = root, n = 2;
        while (this.list(id)) id = `${root}-${n++}`.slice(0, 40);
        this.doc.lists.push({ id, name: base, symbols: [], color: body.querySelector('#ws-color').value || '#7da4ff', collapsed: false });
        this.doc.activeListId = id; this.doc.symbols = []; selectedId = id;
        commit(`${base} listesi eklendi.`);
      };
      body.querySelector('#ws-save').onclick = () => {
        if (!selected) return;
        selected.name = String(body.querySelector('#ws-name').value || '').trim().slice(0, 60) || selected.name;
        selected.color = body.querySelector('#ws-color').value || selected.color;
        commit('Liste adı ve rengi kaydedildi.');
      };
      body.querySelector('#ws-delete').onclick = () => {
        if (!selected || this.doc.lists.length < 2) { status('Son liste silinemez; adını değiştirebilirsin.'); return; }
        if (!confirm(`“${selected.name}” listesi silinecek. Çizimler ve diğer listeler korunacak.`)) return;
        this.doc.lists = this.doc.lists.filter(l => l.id !== selected.id);
        if (this.doc.activeListId === selected.id) {
          this.doc.activeListId = this.doc.lists[0].id;
          this.doc.symbols = [...activeList(this.doc).symbols];
          selectedId = this.doc.activeListId;
        }
        commit(`${selected.name} listesi silindi; çizimler korundu.`);
      };
      body.querySelector('#ws-restore').onclick = () => {
        const merged = mergeLegacyWatchlist(this.doc, LEGACY_TV_LIST);
        if (!merged.changed) { status('Klasik TradingView referanslarının tamamı zaten listelerinde.'); return; }
        this.doc = merged.doc;
        this.doc.activeListId = 'tv-classic';
        this.doc.symbols = [...activeList(this.doc).symbols]; selectedId = 'tv-classic';
        if (!this.save()) return;
        this.render(); this.refreshQuotes();
        note = `${merged.added.length} klasik referans eklendi; mevcut listeler korundu.`;
        render();
      };
      for (const [id, key] of [['ws-sort', 'sort'], ['ws-direction', 'direction'], ['ws-group', 'groupBy']]) {
        body.querySelector('#' + id).onchange = e => { this.settings[key] = e.target.value; commit('Görünüm ayarları kaydedildi.'); };
      }
      for (const [id, key] of [['ws-compact', 'compact'], ['ws-flags', 'showFlags'], ['ws-quotes', 'showQuotes']]) {
        body.querySelector('#' + id).onchange = e => { this.settings[key] = e.target.checked; commit('Görünüm ayarları kaydedildi.'); };
      }
      body.querySelector('#ws-add-selected').onclick = () => {
        if (!ref) { status('Önce grafikten bir sembol seç.'); return; }
        if (this.symbols.includes(ref)) { status('Bu sembol zaten açık listede.'); return; }
        this.add(ref);
        note = `${ref} bu listeye eklendi; sembol kimliği değiştirilmedi.`;
        this.render(); render();
      };
    };
    const syncFromSelector = () => { selectedId = this.doc.activeListId; render(); };
    this.openSettingsIfOpen = syncFromSelector;
    render();
  }
  export() {
    const refs = [...new Set(this.symbols.map(s => isSpotSymbol(s) ? 'BINANCE:' + s : s))];
    const blob = new Blob([refs.join(',')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'alfa-watchlist.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  sharedURL(refs) {
    const url = new URL('/alfa-charts.html', location.origin);
    url.searchParams.set('symbol', this.getSelected()); url.searchParams.set('watchlist', refs.join(','));
    return url.toString();
  }
  async share() {
    let refs = [...this.symbols], note = 'Liste bağlantısı kopyalandı; açan kişi önizleyip kendi listesine ekleyebilir.';
    if (this.sharedURL(refs).length > 50000) {
      while (refs.length > 1 && this.sharedURL(refs).length > 50000) refs = refs.slice(0, -1);
      note = `${refs.length}/${this.symbols.length} sembol bağlantıya sığdı; uzun liste için TXT dışa aktar.`;
    }
    try { await navigator.clipboard.writeText(this.sharedURL(refs)); this.onStatus(note, 'ok'); }
    catch { this.onStatus('Bağlantı kopyalanamadı; listeyi TXT olarak dışa aktarabilirsin.', 'error'); }
  }
  dispose() { this.abort.abort(); this.importController?.abort(); this.quoteController?.abort(); clearInterval(this.timer); this.modal?.close(); }
}
