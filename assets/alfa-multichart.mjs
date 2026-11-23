import { chartDialog, icon, escapeHTML as esc } from './alfa-chart-ui.mjs?v=2';
import { isMarketSymbol, parseMarketRef } from './alfa-charts-data.mjs?v=10';

const $ = id => document.getElementById(id);
const CAPACITY = { 1: 1, 2: 2, 4: 4, 6: 6 };
const LAYOUTS = [1, 2, 4, 6];
let owner = 'guest';
try {
  const raw = localStorage.getItem('sb-zvnjslmptwmnuhftgqsr-auth-token') || sessionStorage.getItem('sb-zvnjslmptwmnuhftgqsr-auth-token');
  owner = JSON.parse(raw || 'null')?.user?.id || 'guest';
} catch {}
const STORE = 'alfa-chart-tabs:v1:' + owner;

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    const panes = Array.isArray(raw?.panes) ? raw.panes.filter(p => p && isMarketSymbol(String(p.symbol || '')).valueOf() === true)
      .map((p, i) => ({ id: Number(p.id) || i + 1, symbol: parseMarketRef(String(p.symbol).toUpperCase()).key })).slice(0, 6) : [];
    return {
      panes: panes.length ? panes : [],
      active: Number(raw?.active) || panes[0]?.id || 1,
      layout: CAPACITY[raw?.layout] ? Number(raw.layout) : 1,
      open: !!raw?.open
    };
  } catch { return { panes: [], active: 1, layout: 1, open: false }; }
}

function watchlistSymbols() {
  try {
    const rows = JSON.parse(localStorage.getItem('alfa-watchlist:v1:' + owner) || '[]');
    return Array.isArray(rows) ? rows.map(r => typeof r === 'string' ? r : r?.symbol).filter(s => s && isMarketSymbol(String(s))) : [];
  } catch { return []; }
}

export function initMultiChart({ getSymbol, getInterval, setSymbol, onStatus } = {}) {
  const state = loadState();
  const debug = new URLSearchParams(location.search).has('debug') ? '&debug=1' : '';
  let renderedKey = '', lastInterval = getInterval(), nextId = Math.max(0, ...state.panes.map(p => p.id)) + 1;
  if (!state.panes.length) state.panes.push({ id: nextId++, symbol: getSymbol() });
  const capacity = () => CAPACITY[state.layout] || 1;
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} };
  const activePane = () => state.panes.find(p => p.id === state.active) || state.panes[0];

  function renderTabs() {
    const host = $('chart-tabs');
    if (!host) return;
    host.innerHTML = state.panes.map(p =>
      `<button type="button" class="chart-tab${p.id === state.active ? ' active' : ''}" data-tab-id="${p.id}" title="${esc(p.symbol)} grafini aç">${esc(p.symbol)}<span class="chart-tab-x" data-close-tab="${p.id}" aria-label="${esc(p.symbol)} sekmesini kapat">×</span></button>`
    ).join('') + '<button type="button" id="chart-tab-add" class="chart-tab-add" title="Yeni grafik sekmesi">+ Grafik</button>';
    host.querySelectorAll('[data-tab-id]').forEach(b => b.onclick = event => {
      if (event.target.closest('[data-close-tab]')) return;
      const pane = state.panes.find(p => p.id === Number(b.dataset.tabId));
      if (!pane) return;
      state.active = pane.id; save(); renderTabs(); renderMulti();
      if (!state.open && pane.symbol !== getSymbol()) setSymbol?.(pane.symbol);
    });
    host.querySelectorAll('[data-close-tab]').forEach(b => b.onclick = event => {
      event.stopPropagation(); removePane(Number(b.dataset.closeTab));
    });
    const add = $('chart-tab-add');
    if (add) add.onclick = () => openAddDialog();
  }

  function iframeURL(pane) {
    return `/alfa-charts.html?embed=1&symbol=${encodeURIComponent(pane.symbol)}&interval=${encodeURIComponent(getInterval())}${debug}`;
  }

  function renderMulti(force = false) {
    const grid = $('multi-grid'), tabs = $('multi-tabs');
    if (!grid || !tabs) return;
    const key = state.panes.map(p => `${p.id}:${p.symbol}`).join('|') + '|' + state.layout + '|' + getInterval();
    tabs.innerHTML = state.panes.map((p, i) =>
      `<button type="button" class="chart-tab${p.id === state.active ? ' active' : ''}" data-pane-id="${p.id}"><small>${i + 1}</small>${esc(p.symbol)}<span class="chart-tab-x" data-close-pane="${p.id}" aria-label="${esc(p.symbol)} grafiğini kapat">×</span></button>`
    ).join('');
    tabs.querySelectorAll('[data-pane-id]').forEach(b => b.onclick = event => {
      if (event.target.closest('[data-close-pane]')) return;
      activate(Number(b.dataset.paneId));
    });
    tabs.querySelectorAll('[data-close-pane]').forEach(b => b.onclick = event => {
      event.stopPropagation(); removePane(Number(b.dataset.closePane));
    });
    document.querySelectorAll('[data-layout]').forEach(b => {
      const active = Number(b.dataset.layout) === state.layout;
      b.setAttribute('aria-pressed', String(active));
    });
    grid.dataset.layout = String(state.layout);
    if (!force && key === renderedKey) {
      grid.querySelectorAll('.multi-cell').forEach(cell => cell.classList.toggle('active', Number(cell.dataset.paneId) === state.active));
      return;
    }
    renderedKey = key;
    const cells = [];
    for (let i = 0; i < capacity(); i++) {
      const pane = state.panes[i];
      if (!pane) {
        cells.push(`<div class="multi-cell empty"><button type="button" data-add-cell>${icon('plus')} Grafik ekle</button></div>`);
        continue;
      }
      cells.push(`<div class="multi-cell${pane.id === state.active ? ' active' : ''}" data-pane-id="${pane.id}">
        <div class="multi-cell-head"><span>${esc(pane.symbol)}</span><button type="button" data-focus-pane="${pane.id}" aria-label="Bu grafiğe geç">Odakla</button></div>
        <iframe title="${esc(pane.symbol)} grafiği" src="${esc(iframeURL(pane))}" loading="lazy" referrerpolicy="no-referrer"></iframe>
      </div>`);
    }
    grid.innerHTML = cells.join('');
    grid.querySelectorAll('[data-focus-pane]').forEach(b => b.onclick = () => activate(Number(b.dataset.focusPane)));
    grid.querySelectorAll('[data-add-cell]').forEach(b => b.onclick = () => openAddDialog());
    grid.querySelectorAll('.multi-cell[data-pane-id]').forEach(cell => cell.onclick = () => activate(Number(cell.dataset.paneId)));
  }

  function activate(id) {
    state.active = Number(id); save(); renderTabs(); renderMulti();
    const frame = $('multi-grid')?.querySelector(`.multi-cell[data-pane-id="${state.active}"] iframe`);
    frame?.focus();
  }

  function removePane(id) {
    if (state.panes.length === 1) {
      state.panes = [{ id: state.panes[0].id, symbol: getSymbol() }];
      state.active = state.panes[0].id;
    } else {
      state.panes = state.panes.filter(p => p.id !== id);
      if (state.active === id) state.active = state.panes[0].id;
    }
    save(); renderTabs(); renderMulti(true);
    onStatus?.('Grafik sekmesi kapatıldı', 'ok');
  }

  function addPane(symbol) {
    let ref;
    try { ref = parseMarketRef(String(symbol).toUpperCase()); } catch { return false; }
    const existing = state.panes.find(p => p.symbol === ref.key);
    if (existing) { activate(existing.id); return true; }
    if (state.panes.length >= capacity()) {
      const next = LAYOUTS.find(l => l > state.panes.length) || 6;
      if (next === state.layout) { onStatus?.('En fazla 6 grafik açılabilir', 'error'); return false; }
      state.layout = next;
    }
    const pane = { id: nextId++, symbol: ref.key };
    state.panes.push(pane); state.active = pane.id; save(); renderTabs(); renderMulti(true);
    onStatus?.(`${ref.key} grafiği eklendi`, 'ok');
    return true;
  }

  function openAddDialog() {
    const symbols = [...new Set([getSymbol(), ...watchlistSymbols()])].slice(0, 60);
    const modal = chartDialog(`<div class="dialog-header"><div><h3>Yeni grafik</h3><p>Aynı çalışma alanında yan yana veya ızgara düzeninde açılır</p></div><button id="multi-add-close" class="icon-button" aria-label="Kapat">${icon('close')}</button></div>
      <form id="multi-add-form" class="multi-add-form">
        <label>Sembol <input id="multi-add-symbol" name="symbol" list="multi-symbols" maxlength="100" autocomplete="off" required></label>
        <datalist id="multi-symbols">${symbols.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>
        <div class="multi-add-quick">${symbols.slice(0, 12).map(s => `<button type="button" data-quick-symbol="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        <p class="settings-error" id="multi-add-error" role="alert"></p>
        <div class="settings-actions"><button id="multi-add-cancel" type="button">Vazgeç</button><button class="apply" type="submit">Grafiği aç</button></div>
      </form>`);
    modal.box.querySelector('#multi-add-close').onclick = modal.close;
    modal.box.querySelector('#multi-add-cancel').onclick = modal.close;
    modal.box.querySelectorAll('[data-quick-symbol]').forEach(b => b.onclick = () => {
      modal.box.querySelector('#multi-add-symbol').value = b.dataset.quickSymbol;
    });
    modal.box.querySelector('#multi-add-form').addEventListener('submit', event => {
      event.preventDefault();
      const raw = String(new FormData(event.currentTarget).get('symbol') || '').toUpperCase().trim();
      if (addPane(raw)) modal.close();
      else modal.box.querySelector('#multi-add-error').textContent = 'Geçerli bir piyasa sembolü gir (örn. ETHUSDT veya OKX:BTCUSDT.P).';
    });
    modal.box.querySelector('#multi-add-symbol').focus();
  }

  function setOpen(next) {
    state.open = !!next; save();
    document.body.classList.toggle('multi-open', state.open);
    const single = $('chart-panel-single'), multi = $('multi-chart');
    if (single) single.hidden = state.open;
    if (multi) multi.hidden = !state.open;
    const button = $('multi-toggle');
    if (button) { button.setAttribute('aria-pressed', String(state.open)); button.textContent = state.open ? 'Tek grafik' : 'Çoklu grafik'; }
    if (state.open) renderMulti(true);
    else setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
  }

  function notifySymbol(symbol, interval) {
    const intervalChanged = interval != null && interval !== lastInterval;
    if (intervalChanged) lastInterval = interval;
    const ref = state.panes.find(p => p.symbol === symbol);
    if (ref) {
      if (ref.id !== state.active) { state.active = ref.id; save(); renderTabs(); }
      if (intervalChanged) renderMulti(true);
      else renderMulti();
      return;
    }
    if (!isMarketSymbol(String(symbol || ''))) return;
    const pane = { id: nextId++, symbol };
    if (state.panes.length >= 6) state.panes.shift();
    state.panes.push(pane); state.active = pane.id; save(); renderTabs(); renderMulti(true);
  }

  document.querySelectorAll('.layout-buttons [data-layout]').forEach(b => b.onclick = () => {
    state.layout = Number(b.dataset.layout) || 1;
    setOpen(true);
  });
  $('multi-toggle')?.addEventListener('click', () => setOpen(!state.open));
  $('multi-exit')?.addEventListener('click', () => setOpen(false));
  $('multi-add')?.addEventListener('click', () => openAddDialog());
  setOpen(state.open);
  renderTabs();
  return { addPane, removePane, activate, notifySymbol, setOpen, get state() { return state; } };
}
