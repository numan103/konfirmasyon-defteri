// Portföyüm = Alfa Portföy'ün kullanıcıya özel kopyası.
// Kurallar: yeni API yok, sunucuya yazılmaz, başka üyenin verisi okunmaz,
// paylaşılan alfa_portfoy_public kaydına dokunulmaz. Her şey bu cihazda, hesaba özel.
const $ = id => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORS = ['#7b78f5', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#c084fc', '#fb923c', '#a3e635'];
// Canlı fiyatlar: sitede zaten kullanılan açık kaynaklar (yeni API/endpoint yok).
const PRICE_TTL = 60000;
const CG_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana', XRP: 'ripple', ADA: 'cardano',
  DOGE: 'dogecoin', AVAX: 'avalanche-2', LINK: 'chainlink', DOT: 'polkadot', MATIC: 'matic-network',
  LTC: 'litecoin', TRX: 'tron', TON: 'the-open-network', SHIB: 'shiba-inu', BCH: 'bitcoin-cash',
  UNI: 'uniswap', ATOM: 'cosmos', NEAR: 'near', APT: 'aptos', ARB: 'arbitrum', OP: 'optimism',
  SUI: 'sui', INJ: 'injective-protocol', FET: 'fetch-ai'
};
let priceTick = 0;
let priceBusy = false;
let state = null;
let formEditId = '';
let ideaEditId = '';
let sellTargetId = '';
let formSide = 'LONG';
let formMode = 'tutar';
let formType = 'kripto';
let chartRange = 'week';
let currentUid = '';

function user() {
  try { return AUTH.user || null; } catch (e) { return null; }
}
function uid() {
  const u = user();
  return u && u.id ? String(u.id) : '';
}
const indexKey = () => 'alfa_my_portfolios_' + uid();
const legacyKey = () => 'alfa_my_portfolio_' + uid();
const num = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const str = (v, max) => String(v == null ? '' : v).slice(0, max || 120).trim();
const now = () => new Date().toISOString();
const money = v => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(v)) + ' $';
const pctFmt = v => (v >= 0 ? '+' : '') + new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(num(v)) + ' %';
const dateFmt = d => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : '—'; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MAX_LEVERAGE = 1000;
function leverageValid(raw) {
  if (raw === null || raw === undefined) return true;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 && v <= MAX_LEVERAGE;
}
function leverageOf(p) {
  const raw = p && p.leverage;
  if (!leverageValid(raw)) return 1;
  return (raw === null || raw === undefined) ? 1 : Number(raw);
}
function marginFor(notional, leverage) {
  const lev = leverageValid(leverage) ? (leverage === null || leverage === undefined ? 1 : Number(leverage)) : 1;
  if (!(lev > 1)) return notional;
  return Math.round((notional / lev) * 100) / 100;
}
function reservedOf(p) {
  return marginFor(num(p && p.qty) * num(p && p.cost), p && p.leverage);
}
function newId(prefix) { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

function normSym(s) {
  let v = String(s || '').trim().toUpperCase().replace(/[_-\s/]/g, '');
  if (v.length > 4 && v.endsWith('USDT')) v = v.slice(0, -4);
  return v;
}
function priceStatus(text, kind) {
  const box = $('mp-price-status');
  if (box) { box.textContent = text || ''; box.dataset.state = kind || 'idle'; }
  const btn = $('mp-price-refresh');
  if (btn) btn.classList.toggle('busy', kind === 'loading');
}
function renderLiveViews() {
  renderSummary(); renderGrowth(); renderHedge(); renderPositions(); renderDonut(); renderChart();
}
async function refreshPrices(force) {
  if (priceBusy) return;
  const p = active();
  if (!uid() || !p) { priceStatus('Giriş yapınca canlı fiyat', 'idle'); return; }
  const cryptos = (p.positions || []).filter(x => x && x.symbol && (x.type || 'kripto') === 'kripto');
  if (!cryptos.length) { priceStatus('Kripto poz ekleyince canlı fiyat', 'idle'); return; }
  if (!force && Date.now() - priceTick < PRICE_TTL) return;
  const syms = [...new Set(cryptos.map(x => normSym(x.symbol)).filter(Boolean))];
  if (!syms.length) return;
  priceBusy = true;
  priceStatus('⟳ Canlı fiyatlar alınıyor…', 'loading');
  const quotes = {};
  try {
    // Sitede zaten kullanılan açık kaynaklar: Binance -> OKX -> CoinGecko.
    try {
      const q = encodeURIComponent('[' + syms.map(s => '"' + s + 'USDT"').join(',') + ']');
      const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbols=' + q);
      if (r && r.ok) {
        const j = await r.json();
        if (Array.isArray(j)) j.forEach(t => {
          const s = String(t.symbol || '').replace(/USDT$/, '');
          if (syms.indexOf(s) >= 0 && num(t.lastPrice) > 0) quotes[s] = num(t.lastPrice);
        });
      }
    } catch (e) { /* Binance yok */ }
    try {
      const missing = syms.filter(s => !(quotes[s] > 0));
      if (missing.length) {
        const r = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
        if (r && r.ok) {
          const j = await r.json();
          if (j && Array.isArray(j.data)) j.data.forEach(t => {
            const m = String(t.instId || '').match(/^([A-Z0-9]+)-USDT$/);
            if (m && missing.indexOf(m[1]) >= 0 && num(t.last) > 0) quotes[m[1]] = num(t.last);
          });
        }
      }
    } catch (e) { /* OKX yok */ }
    try {
      const cgMissing = syms.filter(s => !(quotes[s] > 0)).map(s => ({ s, id: CG_IDS[s] })).filter(x => x.id);
      if (cgMissing.length) {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(cgMissing.map(x => x.id).join(',')) + '&vs_currencies=usd');
        if (r && r.ok) {
          const j = await r.json();
          cgMissing.forEach(x => { if (j && j[x.id] && num(j[x.id].usd) > 0) quotes[x.s] = num(j[x.id].usd); });
        }
      }
    } catch (e) { /* CoinGecko yok */ }
  } finally {
    priceBusy = false;
  }
  // Canlı fiyat SADECE ekranda: yerel kayda, geçmişe veya paylaşılan portföye yazılmaz.
  if (active() !== p) return;
  let updated = 0;
  p.positions.forEach(pos => {
    if (!pos || (pos.type || 'kripto') !== 'kripto') return;
    const q = quotes[normSym(pos.symbol)];
    if (q > 0) { pos.price = q; updated++; }
  });
  priceTick = Date.now();
  renderLiveViews();
  priceStatus(updated > 0 ? '● CANLI · ' + updated + '/' + cryptos.length + ' fiyat' : 'Fiyat kaynağına ulaşılamadı', updated > 0 ? 'live' : 'off');
}
function panelVisible() {
  const panel = $('ap2-panel-mine');
  return !!panel && !panel.classList.contains('hidden');
}
function maybeRefresh() {
  if (document.hidden || !panelVisible()) return;
  refreshPrices(false);
}

function cleanPosition(p) {
  if (!p || typeof p !== 'object') return null;
  const symbol = str(p.symbol, 40);
  if (!symbol) return null;
  const qty = Math.max(0, num(p.qty)), cost = Math.max(0, num(p.cost));
  if (!qty || !cost) return null;
  const lev = leverageValid(p.leverage) ? (p.leverage == null || p.leverage === '' ? 1 : Number(p.leverage)) : 1;
  const rec = {
    id: str(p.id, 60) || newId('mp'), symbol,
    type: str(p.type, 24) || 'kripto',
    side: p.side === 'SHORT' ? 'SHORT' : 'LONG',
    qty, cost,
    price: Math.max(0, num(p.price) || cost),
    total: Math.max(0, num(p.total) || qty * cost),
    date: str(p.date, 10) || now().slice(0, 10),
    note: str(p.note, 120)
  };
  if (lev !== 1) rec.leverage = lev;
  return rec;
}
function cleanSell(s) {
  if (!s || typeof s !== 'object' || !str(s.symbol, 40)) return null;
  const rec = {
    id: str(s.id, 60) || newId('ms'), symbol: str(s.symbol, 40),
    qty: Math.max(0, num(s.qty)), price: Math.max(0, num(s.price)),
    profit: num(s.profit), note: str(s.note, 120), date: str(s.date, 10) || now().slice(0, 10)
  };
  if (leverageValid(s.leverage) && Number(s.leverage) > 1) rec.leverage = Number(s.leverage);
  return rec;
}
function cleanIdea(i) {
  if (!i || typeof i !== 'object' || !str(i.text, 2000)) return null;
  return {
    id: str(i.id, 60) || newId('mi'), symbol: str(i.symbol, 40),
    text: str(i.text, 2000), tags: Array.isArray(i.tags) ? i.tags.slice(0, 8).map(t => str(t, 24)).filter(Boolean) : [],
    date: str(i.date, 10) || now().slice(0, 10)
  };
}
function newPortfolio(name) {
  const at = now();
  return { id: newId('pf'), name: str(name, 40) || 'Portföyüm', startBalance: 1000,
    positions: [], sells: [], ideas: [], history: [{ t: Date.now(), v: 1000 }], createdAt: at, updatedAt: at };
}
function cleanPortfolio(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const p = newPortfolio(raw.name);
  p.id = str(raw.id, 60) || p.id;
  p.startBalance = Math.max(0, num(raw.startBalance) || 1000);
  p.positions = (Array.isArray(raw.positions) ? raw.positions : []).slice(0, 200).map(cleanPosition).filter(Boolean);
  p.sells = (Array.isArray(raw.sells) ? raw.sells : []).slice(0, 300).map(cleanSell).filter(Boolean);
  p.ideas = (Array.isArray(raw.ideas) ? raw.ideas : []).slice(0, 100).map(cleanIdea).filter(Boolean);
  p.history = (Array.isArray(raw.history) ? raw.history : []).slice(-400).map(h => ({ t: num(h.t) || Date.now(), v: num(h.v) })).filter(h => h.t && Number.isFinite(h.v));
  if (!p.history.length) p.history = [{ t: Date.now(), v: p.startBalance }];
  p.createdAt = str(raw.createdAt, 30) || p.createdAt;
  p.updatedAt = str(raw.updatedAt, 30) || p.updatedAt;
  return p;
}
function cleanState(raw) {
  if (!raw || typeof raw !== 'object' || !raw.items || typeof raw.items !== 'object') return null;
  const items = {};
  Object.keys(raw.items).slice(0, 50).forEach(k => { const p = cleanPortfolio(raw.items[k]); if (p) items[p.id] = p; });
  if (!Object.keys(items).length) return null;
  const active = items[str(raw.active, 60)] ? str(raw.active, 60) : Object.keys(items)[0];
  return { active, items };
}
function load() {
  if (!uid()) return { active: '', items: {} };
  try {
    const raw = localStorage.getItem(indexKey());
    const parsed = raw ? cleanState(JSON.parse(raw)) : null;
    if (parsed) return parsed;
  } catch (e) {}
  // Eski sürümün tek portföyünü taşı.
  try {
    const old = localStorage.getItem(legacyKey());
    if (old) {
      const d = JSON.parse(old);
      const p = cleanPortfolio({ id: 'main', name: 'Portföyüm', startBalance: d.startBalance,
        positions: d.positions, sells: d.sells, ideas: d.ideas, history: d.history });
      return { active: p.id, items: { [p.id]: p } };
    }
  } catch (e) {}
  const p = newPortfolio('Portföyüm');
  return { active: p.id, items: { [p.id]: p } };
}
function save() {
  if (!uid() || !state) return;
  try { localStorage.setItem(indexKey(), JSON.stringify(state)); } catch (e) { toast('Tarayıcı deposu dolu olabilir.'); }
}
function active() { return state && state.items[state.active] ? state.items[state.active] : null; }
function mutate(fn) {
  const p = active();
  if (!p || !uid()) return;
  fn(p);
  p.updatedAt = now();
  const s = stats(p);
  p.history.push({ t: Date.now(), v: s.equity });
  if (p.history.length > 400) p.history = p.history.slice(-400);
  save();
  render();
}
function pnlOf(p) {
  const live = num(p.price) || num(p.cost);
  return p.side === 'SHORT' ? num(p.qty) * (num(p.cost) - live) : num(p.qty) * (live - num(p.cost));
}
function stats(p) {
  const positions = (p.positions || []).slice();
  const longs = positions.filter(x => x.side !== 'SHORT');
  const invested = longs.reduce((s, x) => s + num(x.qty) * num(x.cost), 0);
  const unrealized = positions.reduce((s, x) => s + pnlOf(x), 0);
  const realized = (p.sells || []).reduce((s, x) => s + num(x.profit), 0);
  // Eski kayıtlarda nakit: başlangıç - uzun notional + satış hasilatı.
  // Kaldıraçlı kayıtlarda yalnızca marj blokelenir; kapanan işte K/Z eklenir.
  const reserved = positions.reduce((s, x) => s + (leverageOf(x) > 1 ? reservedOf(x) : (x.side !== 'SHORT' ? num(x.qty) * num(x.cost) : 0)), 0);
  const legacyProceeds = (p.sells || []).reduce((s, x) => s + (leverageOf(x) > 1 ? 0 : num(x.qty) * num(x.price)), 0);
  const leveredRealized = (p.sells || []).reduce((s, x) => s + (leverageOf(x) > 1 ? num(x.profit) : 0), 0);
  const start = num(p.startBalance) || 1000;
  return {
    positions, invested, unrealized, realized,
    cash: start - reserved + legacyProceeds + leveredRealized,
    equity: start + unrealized + realized,
    gain: unrealized + realized,
    pct: start > 0 ? ((unrealized + realized) / start) * 100 : 0,
    count: positions.length
  };
}
function valueAt(p, since) {
  const h = p.history || [];
  if (!h.length) return num(p.startBalance);
  const from = since ? h.filter(x => x.t >= since) : [];
  const use = from.length ? from : h;
  return num(use[0].v);
}
function seriesFor(p, range) {
  const h = (p.history || []).slice();
  if (range === 'all') return h;
  const days = range === 'week' ? 7 : range === 'month' ? 30 : 1;
  const since = Date.now() - days * 86400000;
  const filtered = h.filter(x => x.t >= since);
  return filtered.length > 1 ? filtered : h.slice(-2);
}

function el(tag, text, cls) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
function svgEl(tag, attrs) {
  const n = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs || {}).forEach(k => n.setAttribute(k, attrs[k]));
  return n;
}
function toast(text) {
  const box = $('mp-toast');
  if (!box) return;
  box.textContent = text;
  box.classList.add('open');
  setTimeout(() => box.classList.remove('open'), 2400);
}
function sumCell(label, value, accent, sub) {
  const box = el('div', undefined, 'ap2-sum-sm');
  box.dataset.accent = accent || 'pc';
  box.append(el('div', label, 'ap2-sum-sm-lbl'), el('div', value, 'ap2-sum-sm-val'));
  if (sub) box.appendChild(el('div', sub, 'ap2-sum-sm-sub'));
  return box;
}
function growthCell(label, value, delta) {
  const box = el('div', undefined, 'ap2-growth-cell');
  const b = el('b', value, delta > 0 ? 'pos' : delta < 0 ? 'neg' : '');
  box.append(el('span', label), b);
  return box;
}

function renderSelector() {
  const sel = $('mp-select');
  if (!sel) return;
  sel.replaceChildren();
  const ids = Object.keys(state.items);
  ids.forEach(id => {
    const opt = el('option', state.items[id].name, '');
    opt.value = id;
    if (id === state.active) opt.selected = true;
    sel.appendChild(opt);
  });
  if (!ids.length) { const opt = el('option', 'Portföy yok'); opt.value = ''; sel.appendChild(opt); }
}
function renderHeader() {
  const p = active();
  const signed = !!uid();
  if ($('mp-login')) $('mp-login').classList.toggle('hidden', signed);
  if ($('mp-add')) $('mp-add').disabled = !signed;
  if ($('mp-idea-add')) $('mp-idea-add').disabled = !signed;
  if ($('mp-title')) $('mp-title').textContent = p ? '💼 ' + p.name : '💼 Portföyüm';
  if ($('mp-sub')) $('mp-sub').textContent = p
    ? `Alfa Portföy'ün kendi hesabına özel kopyası · ${p.positions.length} pozisyon · kripto fiyatları canlı · veriler sadece bu cihazda.`
    : 'Giriş yapınca kendi portföyünü oluşturabilirsin.';
}
function renderSummary() {
  const host = $('mp-summary-area');
  if (!host) return;
  const p = active();
  if (!p) { host.replaceChildren(); return; }
  const s = stats(p);
  const row = el('div', undefined, 'ap2-sum-row');
  row.append(
    sumCell('Portföy toplamı', money(s.equity), 'pc', s.count + ' açık pozisyon'),
    sumCell('Toplam kâr / zarar', (s.gain >= 0 ? '+' : '') + money(s.gain), s.gain >= 0 ? 'green' : 'red', gerçekleşenLabel(s)),
    sumCell('Toplam getiri', pctFmt(s.pct), s.pct >= 0 ? 'green' : 'red', 'başlangıca göre'),
    sumCell('Yatırılan', money(s.invested), 'pc', 'açık uzun pozisyonlar'),
    sumCell('Nakit (tahmini)', money(s.cash), s.cash >= 0 ? 'green' : 'red', 'serbest bakiye')
  );
  host.replaceChildren(row);
}
function gerçekleşenLabel(s) {
  return 'gerçekleşen ' + (s.realized >= 0 ? '+' : '') + money(s.realized);
}
function renderGrowth() {
  const host = $('mp-growth');
  if (!host || !active()) { if (host) host.replaceChildren(); return; }
  const p = active(), s = stats(p), v = s.equity;
  const rows = [['Bugün', valueAt(p, Date.now() - 86400000)], ['7 Gün', valueAt(p, Date.now() - 7 * 86400000)],
    ['30 Gün', valueAt(p, Date.now() - 30 * 86400000)], ['Tümü', num(p.startBalance)]];
  host.replaceChildren(...rows.map(([label, base]) => growthCell(label, money(v - base), v - base)));
}
function renderHedge() {
  const host = $('mp-hedge-strip');
  if (!host) return;
  host.replaceChildren();
  const p = active();
  if (!p) return;
  const shorts = p.positions.filter(x => x.side === 'SHORT');
  const longTotal = p.positions.filter(x => x.side !== 'SHORT').reduce((s, x) => s + num(x.qty) * num(x.price || x.cost), 0);
  shorts.slice(0, 8).forEach(x => {
    const notional = num(x.qty) * num(x.price || x.cost);
    const ratio = longTotal > 0 ? Math.round((notional / longTotal) * 100) : 0;
    const chip = el('span', undefined, 'ap2-hedge-chip' + (ratio >= 100 ? ' full' : ''));
    chip.append(el('span', '🛡 ' + x.symbol), el('span', (ratio >= 100 ? '✓ ' : '') + '%' + ratio, 'net'));
    host.appendChild(chip);
  });
}
function positionCard(p, pos) {
  const card = el('article', undefined, 'ap2-card');
  const top = el('div', undefined, 'ap2-card-top');
  const sym = el('div', undefined, 'ap2-card-sym');
  sym.append(el('span', pos.symbol), el('span', pos.type || 'kripto', 'ap2-card-type-badge' + (pos.side === 'SHORT' ? ' mp-short' : '')));
  const actions = el('div', undefined, 'ap2-card-actions');
  [['✎', 'Düzenle', 'mpEdit', 'edit'], ['💰', 'Sat', 'mpSell', 'sell'],
    ['🛡', pos.side === 'SHORT' ? 'Uzuna çevir' : 'Hedge yap', 'mpFlip', 'flip'],
    ['🗑', 'Sil', 'mpDel', 'del']].forEach(([icon, title, key, cls]) => {
    const b = el('button', icon, 'act-' + cls);
    b.type = 'button'; b.title = title; b.dataset[key] = pos.id;
    actions.appendChild(b);
  });
  top.append(sym, actions);
  const prices = el('div', undefined, 'ap2-card-prices');
  const live = num(pos.price) || num(pos.cost);
  [['Giriş', money(pos.cost)], ['Güncel', money(live)], ['Değer', money(num(pos.qty) * live)]].forEach(([l, v]) => {
    const box = el('div', undefined, 'ap2-card-price-box');
    box.append(el('div', l, 'ap2-card-price-lbl'), el('div', v, 'ap2-card-price-val'));
    prices.appendChild(box);
  });
  const gain = pnlOf(pos), gainPct = num(pos.cost) > 0 ? (gain / (num(pos.qty) * num(pos.cost))) * 100 : 0;
  const cls = gain > 0 ? 'pos' : gain < 0 ? 'neg' : 'zero';
  const pnl = el('div', undefined, 'ap2-card-pnl ' + cls);
  const pv = el('div', (gain >= 0 ? '+' : '') + money(gain), 'ap2-card-pnl-val ' + cls);
  const pp = el('div', (gainPct >= 0 ? '+' : '') + new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(gainPct) + ' %  ' + pos.side, 'mp-card-pct ' + cls);
  pnl.append(pv, pp);
  const meta = el('div', dateFmt(pos.date) + ' · ' + new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 8 }).format(pos.qty) + ' adet', 'ap2-card-meta');
  if (leverageOf(pos) > 1) {
    const badge = el('span', '⚙ ' + leverageOf(pos) + 'x · ' + money(reservedOf(pos)) + ' marj · ' + money(num(pos.qty) * num(pos.cost)) + ' notional', 'ap2-lev-badge');
    meta.appendChild(document.createTextNode(' · '));
    meta.appendChild(badge);
  }
  card.append(top, prices, pnl, meta);
  if (pos.note) card.appendChild(el('div', '📝 ' + pos.note, 'ap2-card-meta'));
  const target = el('div', undefined, 'ap2-card-target');
  const bar = el('div', undefined, 'ap2-card-target-bar');
  const fill = el('div', undefined, 'ap2-card-target-fill');
  fill.style.width = clamp(Math.abs(gainPct), 2, 100) + '%';
  fill.style.background = gain >= 0 ? 'var(--green)' : 'var(--red)';
  bar.appendChild(fill);
  const labels = el('div', undefined, 'ap2-card-target-labels');
  labels.append(el('span', 'Giriş ' + money(pos.cost)), el('span', 'Güncel ' + money(live)));
  target.append(bar, labels);
  card.appendChild(target);
  return card;
}
function renderPositions() {
  const host = $('mp-grid');
  if (!host) return;
  host.replaceChildren();
  const p = active();
  if (!p) return;
  const q = str($('mp-search')?.value, 80).toLocaleLowerCase('tr-TR');
  const shown = p.positions.filter(x => !q || x.symbol.toLocaleLowerCase('tr-TR').includes(q) || x.note.toLocaleLowerCase('tr-TR').includes(q));
  if (!shown.length) { host.appendChild(el('div', q ? 'Aramayla eşleşen pozisyon yok.' : 'Henüz pozisyon yok — sağ üstteki ＋ Yeni Enstrüman ile başla.', 'ap2-grid-empty')); }
  else shown.forEach(pos => host.appendChild(positionCard(p, pos)));
  if ($('mp-empty')) $('mp-empty').classList.toggle('hidden', !!p.positions.length || !uid());
}
function renderIdeas() {
  const list = $('mp-idea-list'), emptyBox = $('mp-idea-empty');
  if (!list) return;
  list.replaceChildren();
  const p = active();
  const ideas = p ? p.ideas : [];
  if (emptyBox) emptyBox.classList.toggle('hidden', ideas.length > 0);
  ideas.forEach(idea => {
    const card = el('div', undefined, 'ap2-idea-card');
    const head = el('div', undefined, 'ap2-idea-head');
    head.append(el('div', idea.symbol || 'Genel', 'ap2-idea-sym'), el('div', dateFmt(idea.date), 'ap2-idea-date'));
    const actions = el('div', undefined, 'ap2-idea-actions');
    const edit = el('button', '✎', ''); edit.type = 'button'; edit.title = 'Düzenle'; edit.dataset.mpIdeaEdit = idea.id;
    const del = el('button', '🗑', ''); del.type = 'button'; del.title = 'Sil'; del.dataset.mpIdeaDel = idea.id;
    actions.append(edit, del);
    head.appendChild(actions);
    card.append(head, el('div', idea.text, 'ap2-idea-body'));
    if (idea.tags.length) {
      const tags = el('div', undefined, 'ap2-idea-tags');
      idea.tags.forEach(t => tags.appendChild(el('span', t, 'ap2-idea-tag')));
      card.appendChild(tags);
    }
    list.appendChild(card);
  });
}
function renderDonut() {
  const svg = $('mp-donut-svg'), legend = $('mp-donut-legend'), center = $('mp-donut-center');
  if (!svg || !legend) return;
  svg.replaceChildren(); legend.replaceChildren();
  const p = active();
  const parts = p ? p.positions.map(x => ({ name: x.symbol, value: num(x.qty) * (num(x.price) || num(x.cost)), color: '' })) : [];
  const total = parts.reduce((s, x) => s + x.value, 0);
  if (center) center.textContent = total > 0 ? money(total) : '—';
  if (!total) { legend.appendChild(el('div', 'Dağılım için pozisyon ekle.', 'mp-muted')); return; }
  let offset = 0;
  const radius = 70, circumference = 2 * Math.PI * radius;
  parts.slice(0, 12).forEach((part, i) => {
    part.color = COLORS[i % COLORS.length];
    const ratio = part.value / total;
    const circle = svgEl('circle', { cx: 100, cy: 100, r: radius, fill: 'none', stroke: part.color, 'stroke-width': 22,
      'stroke-dasharray': (ratio * circumference).toFixed(2) + ' ' + circumference.toFixed(2),
      'stroke-dashoffset': (-offset * circumference).toFixed(2), transform: 'rotate(-90 100 100)' });
    svg.appendChild(circle);
    offset += ratio;
    const row = el('div', undefined, 'ap2-donut-legend-row');
    const dot = el('span', undefined, 'ap2-donut-legend-dot'); dot.style.background = part.color;
    row.append(dot, el('span', part.name, 'ap2-donut-legend-name'), el('span', money(part.value), 'ap2-donut-legend-val'),
      el('span', '%' + new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(ratio * 100), 'ap2-donut-legend-pct'));
    legend.appendChild(row);
  });
}
function renderChart() {
  const svg = $('mp-chart-svg');
  if (!svg) return;
  svg.replaceChildren();
  const p = active();
  if (!p) return;
  const data = seriesFor(p, chartRange);
  const vals = data.map(x => num(x.v));
  const cur = stats(p).equity;
  const change = $('mp-chart-change');
  if (change) {
    const base = vals.length ? vals[0] : num(p.startBalance);
    const diff = cur - base;
    change.textContent = (diff >= 0 ? '+' : '') + money(diff);
    change.style.color = diff >= 0 ? 'var(--green)' : 'var(--red)';
  }
  const startEl = $('mp-chart-start'), durEl = $('mp-chart-duration'), cumEl = $('mp-chart-cum');
  if (startEl) startEl.textContent = money(num(p.startBalance));
  if (durEl) durEl.textContent = data.length ? Math.max(1, Math.round((Date.now() - data[0].t) / 86400000)) + ' gün' : '—';
  if (cumEl) { const c = cur - num(p.startBalance); cumEl.textContent = (c >= 0 ? '+' : '') + money(c); cumEl.style.color = c >= 0 ? 'var(--green)' : 'var(--red)'; }
  if (data.length < 2) return;
  const min = Math.min(...vals, cur) * 0.995, max = Math.max(...vals, cur) * 1.005;
  const span = max - min || 1;
  const points = data.map((x, i) => [4 + (i / (data.length - 1)) * 272, 132 - ((num(x.v) - min) / span) * 124]);
  points.push([276, 132 - ((cur - min) / span) * 124]);
  svg.appendChild(svgEl('polyline', { points: points.map(pt => pt.join(',')).join(' '), fill: 'none', stroke: 'var(--pc)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const area = 'M' + points[0][0] + ',140 L' + points.map(pt => pt.join(',')).join(' L') + ' L276,140 Z';
  svg.appendChild(svgEl('path', { d: area, fill: 'var(--pc-soft)', opacity: .5, stroke: 'none' }));
}
function renderTrades() {
  const box = $('mp-trades'), body = $('mp-trades-body'), total = $('mp-trades-total');
  if (!box || !body) return;
  const p = active();
  const sells = p ? p.sells.slice().reverse() : [];
  box.classList.toggle('hidden', !sells.length);
  if (total) total.textContent = sells.length + ' işlem';
  body.replaceChildren();
  sells.slice(0, 40).forEach(s => {
    const row = el('div', undefined, 'ap2-sell-row');
    const icon = el('div', '💰', 'ap2-trade-icon'); icon.style.background = 'var(--pc)';
    const info = el('div', undefined, 'ap2-trade-info');
    info.append(el('div', s.symbol, 'ap2-trade-sym'), el('div', dateFmt(s.date) + ' · ' + s.qty + ' adet · ' + money(s.price), 'ap2-trade-dates'));
    if (s.note) info.appendChild(el('div', s.note, 'ap2-trade-dates'));
    const amt = el('div', undefined, 'ap2-sell-val ' + (s.profit >= 0 ? 'pos' : 'neg'));
    amt.append(el('span', money(s.qty * s.price)), el('span', (s.profit >= 0 ? '+' : '') + money(s.profit) + ' K/Z', 'ap2-sell-pf'));
    row.append(icon, info, amt);
    body.appendChild(row);
  });
}
function renderMonthly() {
  const body = $('mp-monthly-body'), thisBox = $('mp-monthly-this');
  if (!body) return;
  const p = active();
  const map = {};
  (p ? p.sells : []).forEach(s => { const key = str(s.date, 7).slice(0, 7); if (!key) return; map[key] = (map[key] || 0) + num(s.profit); });
  const keys = Object.keys(map).sort().reverse().slice(0, 12);
  body.replaceChildren();
  if (!keys.length) body.appendChild(el('div', 'Henüz gerçekleşen işlem yok.', 'ap2-monthly-empty'));
  const max = Math.max(1, ...keys.map(k => Math.abs(map[k])));
  keys.forEach(k => {
    const row = el('div', undefined, 'ap2-monthly-row');
    const radar = el('div', undefined, 'ap2-monthly-radar');
    const fill = el('div', undefined, 'ap2-monthly-radar-fill');
    fill.style.width = (Math.abs(map[k]) / max) * 100 + '%';
    fill.style.background = map[k] >= 0 ? 'var(--green)' : 'var(--red)';
    radar.appendChild(fill);
    row.append(el('span', k, 'ap2-monthly-m'), radar,
      el('span', (map[k] >= 0 ? '+' : '') + money(map[k]), 'ap2-monthly-val ' + (map[k] >= 0 ? 'pos' : 'neg')));
    body.appendChild(row);
  });
  const cur = new Date().toISOString().slice(0, 7);
  if (thisBox) {
    const v = map[cur] || 0;
    thisBox.textContent = (v >= 0 ? '+' : '') + money(v);
    thisBox.className = 'ap2-monthly-this ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
  }
}
function renderSettings() {
  const p = active();
  if ($('mp-set-name')) $('mp-set-name').value = p ? p.name : '';
  if ($('mp-set-balance')) $('mp-set-balance').value = p ? String(p.startBalance) : '1000';
}
function render() {
  if (!state) state = load();
  currentUid = uid();
  const signed = !!currentUid;
  const app = $('mp-app');
  if (app) app.classList.toggle('mp-locked', !signed);
  renderSelector(); renderHeader();
  renderSummary(); renderGrowth(); renderHedge(); renderPositions(); renderIdeas();
  renderDonut(); renderChart(); renderTrades(); renderMonthly(); renderSettings();
}

function markActive(which) {
  const mine = which === 'mine';
  [['tab-portfoy-alpha', 'mnav-portfoy-alpha'], ['tab-portfoy-mine', 'mnav-portfoy-mine']].forEach((pair, i) => {
    const on = mine ? i === 1 : i === 0;
    pair.forEach(id => { const node = $(id); if (node) node.classList.toggle('on', on); });
  });
  const drop = $('navdrop-portfoy'); if (drop) drop.classList.add('on');
  const top = $('tab-portfoy'); if (top) top.classList.add('on');
}
function activate(which) {
  const mine = which === 'mine';
  $('ap2-tab-alpha')?.classList.toggle('on', !mine);
  $('ap2-tab-mine')?.classList.toggle('on', mine);
  $('ap2-tab-alpha')?.setAttribute('aria-selected', String(!mine));
  $('ap2-tab-mine')?.setAttribute('aria-selected', String(mine));
  $('ap2-panel-alpha')?.classList.toggle('hidden', mine);
  $('ap2-panel-mine')?.classList.toggle('hidden', !mine);
  markActive(mine ? 'mine' : 'alpha');
  if (mine) {
    // Kişisel panel premium kilidinden etkilenmez; eski gating stillerini temizle.
    const page = $('page-portfoy'); if (page) page.classList.remove('ap2-viewer');
    const layout = $('mp-layout'); if (layout) layout.style.display = '';
    const actions = $('mp-app')?.querySelector('.ap2-hd-actions'); if (actions) actions.style.display = '';
    render();
    refreshPrices(true);
  } else if (typeof window.renderAlfaPortfoy2 === 'function') {
    // Paylaşılan panele dönünce erişim kilidini yeniden uygula.
    window.renderAlfaPortfoy2();
  }
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('portfoyTab') !== (mine ? 'mine' : 'alpha')) {
      u.searchParams.set('portfoyTab', mine ? 'mine' : 'alpha');
      history.replaceState(null, '', u);
    }
  } catch (e) {}
}

function closeForms() {
  ['mp-form', 'mp-sell-form', 'mp-idea-form'].forEach(id => $(id)?.classList.add('hidden'));
  ['mp-f-err', 'mp-sell-err', 'mp-idea-err'].forEach(id => { if ($(id)) $(id).textContent = ''; });
  formEditId = ''; ideaEditId = ''; sellTargetId = '';
}
function mpFormLeverage() {
  const el = $('mp-f-leverage');
  const raw = el && el.value !== '' ? String(el.value).trim() : '1';
  if (raw === '') return 0;
  return leverageValid(raw) ? Number(raw) : 0;
}
function setMpLeveragePreset(v) {
  const inp = $('mp-f-leverage');
  if (inp) inp.value = v;
  const row = $('mp-f-lev-presets');
  if (row) row.querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.mplev) === Number(v)));
  previewForm();
}
function setMpAmountLabel(mode) {
  const lbl = $('mp-f-amount-lbl');
  if (lbl) lbl.textContent = mode === 'marj' ? 'Marj tutarı ($)' : 'Notional tutar ($)';
}
function openPositionForm(pos) {
  if (!uid()) return;
  closeForms();
  formEditId = pos ? pos.id : '';
  formSide = pos ? pos.side : 'LONG';
  formType = pos ? (pos.type || 'kripto') : 'kripto';
  $('mp-f-sym').value = pos ? pos.symbol : '';
  $('mp-f-date').value = pos ? pos.date : new Date().toISOString().slice(0, 10);
  $('mp-f-amount').value = pos ? String(num(pos.qty) * num(pos.cost)) : '';
  $('mp-f-qty-field').value = pos ? String(pos.qty) : '';
  $('mp-f-cost').value = pos ? String(pos.cost) : '';
  $('mp-f-price').value = pos ? String(pos.price) : '';
  $('mp-f-note').value = pos ? pos.note : '';
  if ($('mp-f-leverage')) $('mp-f-leverage').value = pos ? leverageOf(pos) : 1;
  setMpLeveragePreset(pos ? leverageOf(pos) : 1);
  $('mp-form-title').textContent = pos ? 'Enstrümanı Düzenle' : 'Yeni Enstrüman';
  $('mp-f-side').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mpside === formSide));
  $('mp-f-type').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mptype === formType));
  formMode = 'tutar';
  $('mp-f-mode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mpmode === 'tutar'));
  $('mp-f-amount-box').classList.remove('hidden');
  $('mp-f-qty-box').classList.add('hidden');
  setMpAmountLabel('tutar');
  previewForm();
  $('mp-form').classList.remove('hidden');
}
function previewForm() {
  const box = $('mp-f-preview');
  if (!box) return;
  const amount = num($('mp-f-amount').value), qtyField = num($('mp-f-qty-field').value);
  const cost = num($('mp-f-cost').value);
  const lev = mpFormLeverage();
  const qty = formMode === 'adet' ? qtyField : (formMode === 'marj' ? (lev > 0 ? amount * lev : 0) : amount) / (cost || 1);
  const total = formMode === 'adet' ? qtyField * cost : formMode === 'marj' ? (lev > 0 ? amount * lev : 0) : amount;
  const margin = lev > 0 ? marginFor(total, lev) : 0;
  const live = num($('mp-f-price').value) || cost;
  const gain = formSide === 'SHORT' ? qty * (cost - live) : qty * (live - cost);
  const parts = [];
  if (!lev) parts.push('⚠ Kaldıraç 0.01 ile ' + MAX_LEVERAGE + ' arasında olmalı.');
  if (qty > 0 && total > 0) {
    parts.push(new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 8 }).format(qty) + ' adet');
    parts.push('notional ' + money(total));
    parts.push(lev + 'x · marj ' + money(margin));
    if (formMode === 'marj') parts.push(money(amount) + ' × ' + lev + 'x');
    parts.push('tahmini K/Z ' + (gain >= 0 ? '+' : '') + money(gain));
    const st = stats(active() || { positions: [], sells: [], startBalance: 0 });
    parts.push('serbest nakit ' + money(st.cash - margin));
  }
  box.textContent = parts.length ? parts.join(' · ') : 'Bilgileri girince özet burada görünür.';
}
function savePositionForm() {
  const err = $('mp-f-err');
  const symbol = str($('mp-f-sym').value, 40);
  const amount = num($('mp-f-amount').value), qtyField = num($('mp-f-qty-field').value);
  const cost = num($('mp-f-cost').value);
  if (!symbol || cost <= 0 || (formMode === 'adet' ? qtyField <= 0 : amount <= 0)) {
    err.textContent = 'Sembol, tutar/marj/adet ve giriş fiyatı zorunlu.'; return;
  }
  const lev = mpFormLeverage();
  if (!lev) { err.textContent = 'Kaldıraç 0.01 ile ' + MAX_LEVERAGE + ' arasında olmalı.'; return; }
  const qty = formMode === 'adet' ? qtyField : (formMode === 'marj' ? amount * lev : amount) / cost;
  const total = formMode === 'adet' ? qtyField * cost : formMode === 'marj' ? amount * lev : amount;
  const price = num($('mp-f-price').value) || cost;
  mutate(p => {
    const rec = cleanPosition({ id: formEditId || newId('mp'), symbol, type: formType, side: formSide,
      qty, cost, price, total, leverage: lev, date: $('mp-f-date').value, note: $('mp-f-note').value });
    const i = p.positions.findIndex(x => x.id === formEditId);
    if (i >= 0) { p.positions[i] = rec; return; }
    // Aynı sembol/yön/kaldıraçlı short tekrar eklenirse ağırlıklı ortalama yap.
    const merge = lev > 1 && formSide === 'SHORT'
      ? p.positions.find(x => x.side === 'SHORT' && x.symbol.toUpperCase() === symbol.toUpperCase() && leverageOf(x) === lev) : null;
    if (merge) {
      const oldQty = num(merge.qty), oldNotional = oldQty * num(merge.cost);
      const newQty = oldQty + qty;
      merge.cost = newQty > 0 ? (oldNotional + total) / newQty : merge.cost;
      merge.qty = newQty;
      merge.total = newQty * merge.cost;
      merge.date = rec.date < merge.date ? rec.date : merge.date;
      merge.note = [merge.note, rec.note].filter(Boolean).join(' | ');
    } else p.positions.unshift(rec);
  });
  closeForms(); toast(formEditId ? 'Pozisyon güncellendi.' : 'Pozisyon eklendi.');
}
function openSellForm(id) {
  const p = active();
  const pos = p && p.positions.find(x => x.id === id);
  if (!pos) return;
  closeForms(); sellTargetId = id;
  $('mp-sell-sym').textContent = pos.symbol + ' · ' + pos.side;
  $('mp-sell-info').textContent = num(pos.qty) + ' adet açık · giriş ' + money(pos.cost);
  $('mp-sell-qty').value = String(pos.qty);
  $('mp-sell-price').value = String(pos.price);
  $('mp-sell-note').value = '';
  updateSellAmount();
  $('mp-sell-form').classList.remove('hidden');
}
function updateSellAmount() { const a = num($('mp-sell-qty').value) * num($('mp-sell-price').value); if ($('mp-sell-amount')) $('mp-sell-amount').textContent = money(a); }
function confirmSell() {
  const err = $('mp-sell-err');
  const qty = num($('mp-sell-qty').value), price = num($('mp-sell-price').value);
  if (qty <= 0 || price <= 0) { err.textContent = 'Miktar ve satış fiyatı zorunlu.'; return; }
  const p = active(), pos = p && p.positions.find(x => x.id === sellTargetId);
  if (!pos) { closeForms(); return; }
  if (qty > num(pos.qty) + 1e-9) { err.textContent = 'Açık miktardan fazla satamazsın.'; return; }
  const perUnit = pos.side === 'SHORT' ? num(pos.cost) - price : price - num(pos.cost);
  const profit = perUnit * qty;
  mutate(portfolio => {
    const target = portfolio.positions.find(x => x.id === sellTargetId);
    target.qty = Math.max(0, num(target.qty) - qty);
    target.total = num(target.qty) * num(target.cost);
    if (target.qty <= 1e-9) portfolio.positions = portfolio.positions.filter(x => x.id !== sellTargetId);
    portfolio.sells.unshift(cleanSell({ id: newId('ms'), symbol: target.symbol, qty, price, profit,
      leverage: leverageOf(target) > 1 ? leverageOf(target) : undefined,
      note: $('mp-sell-note').value, date: new Date().toISOString().slice(0, 10) }));
  });
  closeForms(); toast('Satış kaydedildi.');
}
function openIdeaForm(idea) {
  if (!uid()) return;
  closeForms(); ideaEditId = idea ? idea.id : '';
  $('mp-idea-sym').value = idea ? idea.symbol : '';
  $('mp-idea-text').value = idea ? idea.text : '';
  $('mp-idea-tags').value = idea ? idea.tags.join(', ') : '';
  $('mp-idea-form-title').textContent = idea ? 'Değerlendirmeyi Düzenle' : 'Yeni Değerlendirme';
  $('mp-idea-form').classList.remove('hidden');
}
function saveIdea() {
  const err = $('mp-idea-err');
  const text = str($('mp-idea-text').value, 2000);
  if (!text) { err.textContent = 'Değerlendirme yazmalısın.'; return; }
  mutate(p => {
    const rec = cleanIdea({ id: ideaEditId || newId('mi'), symbol: $('mp-idea-sym').value, text,
      tags: str($('mp-idea-tags').value, 120).split(',').map(t => t.trim()).filter(Boolean), date: new Date().toISOString().slice(0, 10) });
    const i = p.ideas.findIndex(x => x.id === ideaEditId);
    if (i >= 0) p.ideas[i] = rec; else p.ideas.unshift(rec);
  });
  closeForms(); toast('Not kaydedildi.');
}
function promptName(defaultName) {
  const name = window.prompt('Portföyün adı nedir?', defaultName || 'Portföyüm');
  return name ? str(name, 40) : '';
}

function bind() {
  $('ap2-tab-alpha')?.addEventListener('click', () => activate('alpha'));
  $('ap2-tab-mine')?.addEventListener('click', () => activate('mine'));
  $('mp-price-refresh')?.addEventListener('click', () => refreshPrices(true));
  $('mp-login-btn')?.addEventListener('click', () => { try { showGate(); } catch (e) { try { showPage('erisim'); } catch (e2) {} } });
  $('mp-select')?.addEventListener('change', e => { state.active = e.target.value; save(); render(); });
  $('mp-new')?.addEventListener('click', () => {
    if (!uid()) return;
    const name = promptName('Yeni Portföy');
    if (!name) return;
    const p = newPortfolio(name);
    state.items[p.id] = p; state.active = p.id; save(); render(); toast('Portföy oluşturuldu.');
  });
  $('mp-rename')?.addEventListener('click', () => {
    const p = active(); if (!p || !uid()) return;
    const name = promptName(p.name);
    if (!name) return;
    mutate(portfolio => { portfolio.name = name; });
    toast('Ad güncellendi.');
  });
  $('mp-delete')?.addEventListener('click', () => {
    const p = active(); if (!p || !uid()) return;
    if (Object.keys(state.items).length <= 1) { mutate(portfolio => { portfolio.positions = []; portfolio.sells = []; portfolio.ideas = []; }); toast('Portföy sıfırlandı.'); return; }
    if (!window.confirm('“' + p.name + '” portföyü silinsin mi?')) return;
    delete state.items[p.id];
    state.active = Object.keys(state.items)[0]; save(); render(); toast('Portföy silindi.');
  });
  $('mp-settings')?.addEventListener('click', () => $('mp-settings-panel')?.classList.toggle('hidden'));
  $('mp-set-save')?.addEventListener('click', () => {
    const p = active(); if (!p) return;
    const name = str($('mp-set-name').value, 40) || p.name;
    const balance = Math.max(0, num($('mp-set-balance').value) || p.startBalance);
    mutate(portfolio => { portfolio.name = name; portfolio.startBalance = balance; });
    toast('Ayarlar kaydedildi.');
  });
  $('mp-set-export')?.addEventListener('click', () => {
    const p = active(); if (!p) return;
    try {
      const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = p.name.replace(/[^\w\- ]+/g, '') + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { toast('Yedek alınamadı.'); }
  });
  $('mp-set-reset')?.addEventListener('click', () => {
    const p = active(); if (!p || !window.confirm('Bu portföyün tüm verileri silinsin mi?')) return;
    mutate(portfolio => { portfolio.positions = []; portfolio.sells = []; portfolio.ideas = []; portfolio.history = [{ t: Date.now(), v: num(portfolio.startBalance) }]; });
    toast('Portföy sıfırlandı.');
  });
  $('mp-monthly-head')?.addEventListener('click', () => {
    $('mp-monthly')?.classList.toggle('open');
    $('mp-monthly-body')?.classList.toggle('hidden');
  });
  $('mp-chart-range')?.addEventListener('click', e => {
    const b = e.target.closest('[data-mpr]'); if (!b) return;
    chartRange = b.dataset.mpr;
    $('mp-chart-range').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    renderChart();
  });
  $('mp-add')?.addEventListener('click', () => openPositionForm(null));
  $('mp-form-cancel')?.addEventListener('click', closeForms);
  $('mp-f-cancel2')?.addEventListener('click', closeForms);
  $('mp-f-save')?.addEventListener('click', savePositionForm);
  $('mp-f-sym')?.addEventListener('input', e => {
    const v = e.target.value.trim().toUpperCase();
    $('mp-f-chips').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mpsym === v));
    previewForm();
  });
  $('mp-f-chips')?.addEventListener('click', e => {
    const b = e.target.closest('[data-mpsym]'); if (!b) return;
    $('mp-f-sym').value = b.dataset.mpsym;
    $('mp-f-chips').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    previewForm();
  });
  $('mp-f-type')?.addEventListener('click', e => {
    const b = e.target.closest('[data-mptype]'); if (!b) return;
    formType = b.dataset.mptype;
    $('mp-f-type').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
  $('mp-f-side')?.addEventListener('click', e => {
    const b = e.target.closest('[data-mpside]'); if (!b) return;
    formSide = b.dataset.mpside === 'SHORT' ? 'SHORT' : 'LONG';
    $('mp-f-side').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    previewForm();
  });
  $('mp-f-mode')?.addEventListener('click', e => {
    const b = e.target.closest('[data-mpmode]'); if (!b) return;
    formMode = b.dataset.mpmode === 'adet' ? 'adet' : b.dataset.mpmode === 'marj' ? 'marj' : 'tutar';
    $('mp-f-mode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    $('mp-f-amount-box').classList.toggle('hidden', formMode === 'adet');
    $('mp-f-qty-box').classList.toggle('hidden', formMode !== 'adet');
    setMpAmountLabel(formMode);
    previewForm();
  });
  $('mp-f-lev-presets')?.addEventListener('click', e => {
    const b = e.target.closest('button[data-mplev]'); if (b) setMpLeveragePreset(b.dataset.mplev);
  });
  ['mp-f-amount', 'mp-f-qty-field', 'mp-f-cost', 'mp-f-price', 'mp-f-leverage'].forEach(id => $(id)?.addEventListener('input', previewForm));
  $('mp-sell-cancel')?.addEventListener('click', closeForms);
  $('mp-sell-cancel2')?.addEventListener('click', closeForms);
  $('mp-sell-confirm')?.addEventListener('click', confirmSell);
  ['mp-sell-qty', 'mp-sell-price'].forEach(id => $(id)?.addEventListener('input', updateSellAmount));
  $('mp-grid')?.addEventListener('click', e => {
    const p = active(); if (!p) return;
    const edit = e.target.closest('[data-mp-edit]'), sell = e.target.closest('[data-mp-sell]'),
      flip = e.target.closest('[data-mp-flip]'), del = e.target.closest('[data-mp-del]');
    const id = (edit || sell || flip || del)?.dataset;
    const posId = edit?.dataset.mpEdit || sell?.dataset.mpSell || flip?.dataset.mpFlip || del?.dataset.mpDel;
    const pos = p.positions.find(x => x.id === posId);
    if (!pos) return;
    if (edit) return openPositionForm(pos);
    if (sell) return openSellForm(pos.id);
    if (flip) { mutate(portfolio => { const x = portfolio.positions.find(y => y.id === pos.id); if (x) x.side = x.side === 'SHORT' ? 'LONG' : 'SHORT'; }); return; }
    if (del && window.confirm('“' + pos.symbol + '” pozisyonu silinsin mi?')) {
      mutate(portfolio => { portfolio.positions = portfolio.positions.filter(x => x.id !== pos.id); });
    }
  });
  $('mp-idea-add')?.addEventListener('click', () => openIdeaForm(null));
  $('mp-idea-cancel')?.addEventListener('click', closeForms);
  $('mp-idea-cancel2')?.addEventListener('click', closeForms);
  $('mp-idea-save')?.addEventListener('click', saveIdea);
  $('mp-idea-list')?.addEventListener('click', e => {
    const p = active(); if (!p) return;
    const edit = e.target.closest('[data-mp-idea-edit]'), del = e.target.closest('[data-mp-idea-del]');
    const id = edit?.dataset.mpIdeaEdit || del?.dataset.mpIdeaDel;
    const idea = p.ideas.find(x => x.id === id);
    if (!idea) return;
    if (edit) return openIdeaForm(idea);
    if (del && window.confirm('Bu değerlendirme silinsin mi?')) {
      mutate(portfolio => { portfolio.ideas = portfolio.ideas.filter(x => x.id !== id); });
    }
  });
  $('mp-search')?.addEventListener('input', renderPositions);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (uid() !== currentUid) { state = load(); render(); }
    maybeRefresh();
  });
  setInterval(maybeRefresh, PRICE_TTL);
}

bind();
state = load();
render();
try { if (new URLSearchParams(location.search).get('portfoyTab') === 'mine') activate('mine'); else markActive('alpha'); } catch (e) { markActive('alpha'); }
window.AlfaMyPortfolio = { activate, refresh: render, markActive, refreshPrices, normSym };
