import { SYMBOLS, REST_ORIGINS, isMarketSymbol } from './alfa-charts-data.mjs?v=5';
import { spotMarkets, cleanWatchlist, parseWatchlistText, importPreview, tradingViewSymbolURL, WATCHLIST_LIMIT, IMPORT_BYTES } from './alfa-watchlist-model.mjs?v=1';
import { chartDialog, icon, escapeHTML as esc } from './alfa-chart-ui.mjs?v=2';
const $ = id => document.getElementById(id);
const CATALOG_KEY = 'alfa-spot-catalog:v1';
export function formatMarketPrice(value, precision) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = Number.isInteger(precision) ? Math.max(0, Math.min(10, precision)) : n > 0 && n < 1 ? Math.min(10, Math.max(4, -Math.floor(Math.log10(n)) + 3)) : 2;
  return n.toLocaleString('tr-TR', { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
}
export class ChartWatchlist {
  constructor({ getOwner, getSelected, onSelect, getAccessToken, onStatus }) {
    Object.assign(this, { getOwner, getSelected, onSelect, getAccessToken, onStatus });
    this.abort = new AbortController(); this.quotes = new Map();
    this.markets = SYMBOLS.map(symbol => ({ symbol, base: symbol.replace('USDT', ''), quote: 'USDT', precision: 2 }));
    this.catalogState = 'loading'; this.account();
    $('symbol-search').onclick = () => this.openPicker();
    $('watch-add').onclick = () => this.openPicker();
    $('watch-import').onclick = () => this.openImport();
    $('watch-export').onclick = () => this.export();
    $('watch-share').onclick = () => this.share();
    $('symbol').onchange = e => this.select(e.target.value);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refreshQuotes(); }, { signal: this.abort.signal });
    this.timer = setInterval(() => { if (!document.hidden) this.refreshQuotes(); }, 30000);
    this.start();
  }
  key() { return 'alfa-watchlist:v1:' + this.owner; }
  account() {
    const owner = this.getOwner();
    if (owner === this.owner) return;
    this.modal?.close(); this.modal = null; this.importController?.abort(); this.quoteController?.abort();
    this.owner = owner; this.name = 'İzleme listesi'; this.symbols = [...SYMBOLS];
    try {
      const raw = JSON.parse(localStorage.getItem(this.key()) || 'null');
      if (raw) { this.symbols = cleanWatchlist(raw.symbols, SYMBOLS); if (typeof raw.name === 'string') this.name = raw.name.slice(0, 60); }
    } catch {}
    this.render();
  }
  save() {
    if (this.owner !== this.getOwner()) { this.account(); return false; }
    try { localStorage.setItem(this.key(), JSON.stringify({ version: 1, name: this.name, symbols: this.symbols })); }
    catch { this.onStatus('Liste kaydedilemedi; tarayıcı depolama alanını kontrol edin.', 'error'); return false; }
    return true;
  }
  info(symbol) {
    return this.markets.find(m => m.symbol === symbol) || { symbol, base: symbol, quote: '', precision: undefined };
  }
  async start() {
    await this.loadCatalog();
    if (this.abort.signal.aborted) return;
    this.render(); this.refreshQuotes();
    const shared = new URL(location.href).searchParams.get('watchlist');
    if (shared && shared.length <= 7000) this.openImport(shared);
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
  select(symbol) {
    if (!isMarketSymbol(symbol) || this.catalogState === 'ready' && !this.markets.some(m => m.symbol === symbol)) {
      this.onStatus('Bu parite işleme açık Binance Spot kataloğunda yok.', 'error'); return;
    }
    this.onSelect(symbol); this.render();
  }
  add(symbol) {
    if (this.symbols.includes(symbol)) return;
    if (this.symbols.length >= WATCHLIST_LIMIT) { this.onStatus('İzleme listesi en fazla 200 parite içerebilir.', 'error'); return; }
    if (!this.markets.some(m => m.symbol === symbol)) return;
    this.symbols.push(symbol); this.save(); this.render(); this.renderPicker?.(); this.refreshQuotes();
  }
  remove(symbol) { this.symbols = this.symbols.filter(s => s !== symbol); this.save(); this.render(); }
  render() {
    const selected = this.getSelected();
    const select = $('symbol'); select.replaceChildren();
    for (const symbol of [...new Set([selected, ...this.symbols])]) {
      if (!isMarketSymbol(symbol)) continue;
      const o = document.createElement('option'); o.value = o.textContent = symbol; select.append(o);
    }
    select.value = selected;
    $('watchlist-title').textContent = this.name;
    $('watch-count').textContent = this.symbols.length;
    $('watch-rows').innerHTML = this.symbols.map(symbol => {
      const info = this.info(symbol);
      return `<div class="watch-item"><button type="button" class="watch-row" data-symbol="${symbol}" aria-label="${symbol}" aria-pressed="${symbol === selected}">
        <span class="coin-icon">${info.base === 'BTC' ? '₿' : esc(info.base.slice(0, 1))}</span><span><strong>${esc(info.base)}</strong><small>${esc(info.quote)} · SPOT</small></span>
        <span class="watch-quote"><span class="watch-price" data-watch-price="${symbol}">—</span><small data-watch-change="${symbol}">—</small></span></button>
        <button type="button" class="watch-remove" data-remove-symbol="${symbol}" aria-label="${symbol} listeden çıkar" title="Listeden çıkar">${icon('close')}</button></div>`;
    }).join('') || '<p class="watch-empty">Listen boş.<br>+ ile parite ekle veya liste içe aktar.</p>';
    $('watch-rows').querySelectorAll('[data-symbol]').forEach(b => b.onclick = () => this.select(b.dataset.symbol));
    $('watch-rows').querySelectorAll('[data-remove-symbol]').forEach(b => b.onclick = () => this.remove(b.dataset.removeSymbol));
    this.paintQuotes();
  }
  updateQuote(symbol, price) {
    this.quotes.set(symbol, { ...this.quotes.get(symbol), price, at: Date.now() }); this.paintQuotes();
  }
  paintQuotes() {
    for (const symbol of this.symbols) {
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
    const owner = this.owner, symbols = [...this.symbols]; this.quoteController = new AbortController();
    for (const origin of REST_ORIGINS) try {
      const r = await fetch(origin + '/api/v3/ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(symbols)), {
        cache: 'no-store', signal: AbortSignal.any([this.abort.signal, this.quoteController.signal, AbortSignal.timeout(10000)]) });
      if (!r.ok) continue;
      const rows = await r.json(); if (!Array.isArray(rows) || owner !== this.owner) return;
      for (const row of rows) if (symbols.includes(row.symbol) && Number.isFinite(Number(row.lastPrice)) && Number(row.lastPrice) > 0 && Number.isFinite(Number(row.priceChangePercent))) {
        this.quotes.set(row.symbol, { price: Number(row.lastPrice), change: Number(row.priceChangePercent), at: Math.min(Date.now(), Number(row.closeTime) || 0) });
      }
      this.paintQuotes(); return;
    } catch { if (this.quoteController.signal.aborted || this.abort.signal.aborted) return; }
  }
  openPicker() {
    this.modal?.close();
    const modal = this.modal = chartDialog(`<div class="dialog-header"><div><h3>Sembol ekle</h3><p>Binance Spot · İşleme açık pariteler</p></div><button id="symbols-close" class="icon-button" aria-label="Kapat">${icon('close')}</button></div>
      <label class="study-search">${icon('search')}<input id="symbol-query" placeholder="BTC, XRP, DOGE, ETHBTC…" aria-label="Parite ara"></label>
      <div class="symbol-filters"><label>Karşılık <select id="symbol-quote"><option value="">Tümü</option><option>USDT</option><option>USDC</option><option>BTC</option><option>ETH</option><option>BNB</option><option>TRY</option><option>EUR</option></select></label><small id="catalog-status"></small><button id="catalog-retry" type="button">Yenile</button></div>
      <div id="symbol-results" class="symbol-results"></div><p class="menu-note">Listen bu cihazda, hesabına özel kaydedilir. Vadeli, forex ve farklı borsa fiyatları Spot ile değiştirilmez.</p>`, 'symbol-dialog');
    modal.overlay.setAttribute('aria-label', 'Sembol arama');
    modal.box.querySelector('#symbols-close').onclick = modal.close;
    this.renderPicker = () => {
      if (!modal.overlay.open) return;
      const q = modal.box.querySelector('#symbol-query').value.toUpperCase().replace(/[ /]/g, ''), quote = modal.box.querySelector('#symbol-quote').value;
      const results = this.markets.filter(m => (!quote || m.quote === quote) && (!q || m.symbol.includes(q)));
      modal.box.querySelector('#catalog-status').textContent = this.catalogState === 'loading' ? 'Katalog yükleniyor…' : this.catalogState === 'error' ? 'Kataloğa ulaşılamadı; yeniden deneyin.' : results.length + ' parite';
      modal.box.querySelector('#symbol-results').innerHTML = results.slice(0, 60).map(m => `<div class="symbol-result"><button data-open-symbol="${m.symbol}"><strong>${esc(m.base)} <small>/ ${esc(m.quote)}</small></strong><small>BINANCE · SPOT</small></button>
        <button data-add-symbol="${m.symbol}" aria-label="${m.symbol} listeye ekle" ${this.symbols.includes(m.symbol) ? 'disabled' : ''}>${icon(this.symbols.includes(m.symbol) ? 'check' : 'plus')}</button></div>`).join('') || '<p class="study-empty">Eşleşen Spot parite yok.</p>';
      modal.box.querySelectorAll('[data-add-symbol]').forEach(b => b.onclick = () => this.add(b.dataset.addSymbol));
      modal.box.querySelectorAll('[data-open-symbol]').forEach(b => b.onclick = () => { this.add(b.dataset.openSymbol); this.select(b.dataset.openSymbol); modal.close(); });
    };
    modal.box.querySelector('#symbol-query').oninput = this.renderPicker;
    modal.box.querySelector('#symbol-quote').onchange = this.renderPicker;
    modal.box.querySelector('#catalog-retry').onclick = async () => { this.catalogState = 'loading'; this.renderPicker(); await this.loadCatalog(true); this.renderPicker(); };
    this.renderPicker(); modal.box.querySelector('#symbol-query').focus();
  }
  openImport(initial = '') {
    this.modal?.close();
    const owner = this.owner;
    const modal = this.modal = chartDialog(`<div class="dialog-header"><div><h3>İzleme listesi içe aktar</h3><p>TradingView TXT / CSV, semboller veya herkese açık liste linki</p></div><button id="import-close" class="icon-button" aria-label="Kapat">${icon('close')}</button></div>
      <label class="import-file">TXT / CSV dosyası seç<input id="watchlist-file" type="file" accept=".txt,.csv,text/plain,text/csv"></label>
      <label class="import-source-label" for="watchlist-source">Semboller veya link</label><textarea id="watchlist-source" rows="4" placeholder="BINANCE:BTCUSDT,BINANCE:XRPUSDT&#10;https://www.tradingview.com/watchlists/…/" spellcheck="false"></textarea>
      <p class="menu-note">Özel TradingView listesi için TXT dışa aktar. Linkle alma, Alfa Charts izni olan hesabınla giriş yapmanı gerektirir. Şifre veya TradingView çerezi istenmez.</p>
      <div class="import-options"><label><input id="import-replace" type="checkbox"> Mevcut listeyi değiştir</label><button id="watchlist-preview" type="button">Önizle</button></div>
      <div id="import-result" class="import-result" role="status"></div><div class="settings-actions"><button id="watchlist-apply" class="apply" type="button" disabled>Listeye ekle</button></div>`, 'watchlist-import-dialog');
    modal.overlay.setAttribute('aria-label', 'TradingView izleme listesi içe aktar');
    modal.box.querySelector('#import-close').onclick = modal.close;
    const source = modal.box.querySelector('#watchlist-source'), result = modal.box.querySelector('#import-result'), apply = modal.box.querySelector('#watchlist-apply'), replace = modal.box.querySelector('#import-replace');
    source.value = initial;
    let entries = null, preview = null;
    const paint = () => {
      preview = entries && importPreview(entries, this.markets, replace.checked ? [] : this.symbols);
      apply.disabled = !preview?.added.length; apply.textContent = replace.checked ? 'Listeyi değiştir' : 'Listeye ekle';
      if (preview) result.innerHTML = `<strong>${preview.added.length} parite ${replace.checked ? 'yeni listeye' : 'listene'} alınacak</strong><p>${preview.added.map(esc).join(', ') || 'Eklenebilir yeni parite yok.'}</p>
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
        await this.loadCatalog();
        if (this.catalogState !== 'ready') throw new Error('Önce Binance sembol kataloğunun yüklenmesi gerekiyor. Sembol arama panelinden Yenile’yi deneyin.');
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
        entries = parseWatchlistText(text); paint();
      } catch (err) { entries = preview = null; result.textContent = err.message; }
      finally { if (modal.overlay.open) modal.box.querySelector('#watchlist-preview').disabled = false; }
    };
    apply.onclick = () => {
      if (owner !== this.getOwner() || !preview?.added.length) return;
      const next = replace.checked ? preview.added : [...this.symbols, ...preview.added];
      if (replace.checked && !confirm('Mevcut izleme listesi önizlemedeki paritelerle değiştirilsin mi? Çizimler silinmez.')) return;
      this.symbols = cleanWatchlist(next); this.save(); this.render(); this.refreshQuotes(); modal.close();
      this.onStatus(preview.added.length + ' Spot parite içe aktarıldı', 'ok');
    };
    source.focus();
  }
  export() {
    const blob = new Blob([this.symbols.map(s => 'BINANCE:' + s).join(',')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'alfa-watchlist.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async share() {
    const url = new URL('/alfa-charts.html', location.origin);
    url.searchParams.set('symbol', this.getSelected()); url.searchParams.set('watchlist', this.symbols.join(','));
    try { await navigator.clipboard.writeText(url.toString()); this.onStatus('Liste bağlantısı kopyalandı; açan kişi önizleyip kendi listesine ekleyebilir.', 'ok'); }
    catch { this.onStatus('Bağlantı kopyalanamadı; listeyi TXT olarak dışa aktarabilirsin.', 'error'); }
  }
  dispose() { this.abort.abort(); this.importController?.abort(); this.quoteController?.abort(); clearInterval(this.timer); this.modal?.close(); }
}
