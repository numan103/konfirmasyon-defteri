import { chartDialog, icon, escapeHTML as esc } from './alfa-chart-ui.mjs?v=5';
import { TIMEFRAMES, isMarketSymbol, parseMarketRef } from './alfa-charts-data.mjs?v=14';
import { readEnvelope, normalizePayload, createEchoLedger, createMessageGate, rememberCommand, isRecentEcho } from './alfa-multichart-sync.mjs?v=2';
import { watchlistRefsFromDocument } from './alfa-watchlist-model.mjs?v=12';
import { WorkspacePersistence } from './alfa-workspace-persistence.mjs?v=1';

const $ = id => document.getElementById(id);
const LAYOUTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16];
const LAYOUT_GRID = {
  1: [1, 1], 2: [2, 1], 3: [3, 1], 4: [2, 2], 5: [3, 2], 6: [3, 2],
  7: [4, 2], 8: [4, 2], 9: [3, 3], 10: [4, 3], 12: [4, 3], 14: [4, 4], 16: [4, 4]
};
const CAPACITY = Object.fromEntries(LAYOUTS.map(count => [count, count]));
const validInterval = value => Object.values(TIMEFRAMES).includes(value);
const syncDefaults = { symbol: false, crosshair: true, range: true, interval: false };
const AUTH_KEY = 'sb-fssrtlpjqbavzomynwmg-auth-token';
const LEGACY_AUTH_KEY = 'sb-zvnjslmptwmnuhftgqsr-auth-token';
function initialOwner() { try {
  const raw = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY)
    || localStorage.getItem(LEGACY_AUTH_KEY) || sessionStorage.getItem(LEGACY_AUTH_KEY);
  return JSON.parse(raw || 'null')?.user?.id || 'guest';
} catch { return 'guest'; } }

export function normalizeWorkspace(raw) {
  if (!raw || !CAPACITY[raw.layout] || !Array.isArray(raw.panes) || !raw.panes.length || raw.panes.length > 16) return null;
  const ids = new Set(), panes = [];
  for (const pane of raw.panes) {
    if (!Number.isSafeInteger(pane?.id) || pane.id < 1 || pane.id > 1000000 || ids.has(pane.id) || !validInterval(pane.interval)) return null;
    try {
      panes.push({ id: pane.id, symbol: parseMarketRef(pane.symbol).key, interval: pane.interval });
      ids.add(pane.id);
    } catch { return null; }
  }
  return { panes, active: ids.has(raw.active) ? raw.active : panes[0].id, layout: Number(raw.layout), open: !!raw.open,
    sync: Object.fromEntries(Object.entries(syncDefaults).map(([key, fallback]) => [key, typeof raw.sync?.[key] === 'boolean' ? raw.sync[key] : fallback])) };
}

function localId(prefix) {
  let token;
  try { token = crypto?.randomUUID?.(); } catch {}
  return `${prefix}-${token || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function loadState(STORE) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    const panes = Array.isArray(raw?.panes) ? raw.panes.filter(p => p && isMarketSymbol(String(p.symbol || '')).valueOf() === true)
      .map((p, i) => ({ id: Number(p.id) || i + 1, symbol: parseMarketRef(String(p.symbol).toUpperCase()).key,
        ...(validInterval(p.interval) ? { interval: p.interval } : {}) })).slice(0, 16) : [];
    return {
      panes: panes.length ? panes : [],
      active: Number(raw?.active) || panes[0]?.id || 1,
      layout: CAPACITY[raw?.layout] ? Number(raw.layout) : 1,
      open: !!raw?.open,
      sync: Object.fromEntries(Object.entries(syncDefaults).map(([key, fallback]) => [key,
        typeof raw?.sync?.[key] === 'boolean' ? raw.sync[key] : fallback]))
    };
  } catch { return { panes: [], active: 1, layout: 1, open: false, sync: { ...syncDefaults } }; }
}

function watchlistSymbols(owner) {
  const refs = new Set();
  try {
    const raw = JSON.parse(localStorage.getItem('alfa-watchlist:v1:' + owner) || 'null');
    for (const ref of watchlistRefsFromDocument(raw)) refs.add(ref);
  } catch {}
  if (!refs.size) {
    const legacyKeys = owner === 'guest' ? ['alfa-watchlist'] : [`u:${owner}:alfa-watchlist`, 'alfa-watchlist'];
    for (const key of legacyKeys) {
      try {
        const rows = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(rows)) for (const ref of rows) if (typeof ref === 'string') refs.add(ref);
      } catch {}
    }
  }
  return [...refs].filter(ref => {
    try { parseMarketRef(ref); return true; } catch { return false; }
  }).slice(0, 200);
}

export function initMultiChart({ getSymbol, getInterval, setSymbol, onStatus, applyMainSync, getMainSyncState, getOwner = initialOwner, cloudStore, onWorkspaceStatus = onStatus } = {}) {
  let owner = getOwner(), STORE = 'alfa-chart-tabs:v1:' + owner;
  const hasStored = () => { try { return !!localStorage.getItem(STORE); } catch { return false; } };
  const hadLocal = hasStored();
  let contextHadLocal = hadLocal;
  const state = loadState(STORE);
  let persistence = null, applyingWorkspace = false;
  const params = new URLSearchParams(location.search);
  const debug = params.has('debug') ? '&debug=1' : '';
  const session = localId('mc');
  const parentInstance = localId('parent');
  const frames = new Map();
  const recentCommands = new Map();
  const mainEchoes = createEchoLedger({ windowMs: 1500 });
  const mainEchoUntil = new Map();
  let renderedKey = '', lastInterval = getInterval(), nextId = Math.max(0, ...state.panes.map(p => p.id)) + 1;
  let suppressNotify = 0, lastMainRange = null, lastMainCrosshair = null, lastAppliedFromPane = null;
  let targetOverride = null, excludePane = null;

  if (!state.panes.length) state.panes.push({ id: nextId++, symbol: getSymbol() });
  for (const pane of state.panes) pane.interval ||= getInterval();
  const capacity = () => CAPACITY[state.layout] || 1;
  const save = () => {
    try { localStorage.setItem(STORE, JSON.stringify(state)); }
    catch { onStatus?.('Grafik düzeni yerelde kaydedilemedi', 'error'); return; }
    if (!applyingWorkspace && persistence) { contextHadLocal = true; persistence.changed(state); }
  };
  const activePane = () => state.panes.find(p => p.id === state.active) || state.panes[0];
  const paneKey = () => state.panes.map(p => `${p.id}:${p.symbol}:${p.interval}`).join('|') + '|' + state.layout;

  function postToPane(id, envelope) {
    const rec = frames.get(id);
    if (!rec?.win) return;
    try {
      rec.win.postMessage(envelope, location.origin);
      rec.synced = true;
      rememberCommand(recentCommands, id, envelope.type, envelope.payload);
    } catch {}
  }

  const gate = createMessageGate({
    session, instance: parentInstance, paneId: 0,
    post: envelope => {
      if (targetOverride != null) { postToPane(targetOverride, envelope); return; }
      for (const [id] of frames) if (id !== excludePane) postToPane(id, envelope);
    }
  });

  function currentStatePayload(paneId = null) {
    let seed = {};
    try { seed = getMainSyncState?.() || {}; } catch {}
    const pane = paneId == null ? null : state.panes.find(p => p.id === paneId);
    const payload = { symbol: pane?.symbol || getSymbol(), interval: pane?.interval || getInterval() };
    const range = lastMainRange || seed.range;
    const crosshair = lastMainCrosshair || seed.crosshair;
    if (range && state.sync.range) payload.range = range;
    if (crosshair && state.sync.crosshair) payload.crosshair = crosshair;
    return payload;
  }

  function sendStateToPane(id, replyTo = 0) {
    targetOverride = id;
    try { return gate.send('state', currentStatePayload(id), { replyTo, force: true }); }
    finally { targetOverride = null; }
  }

  function broadcast(type, payload, { exclude = null, replyTo = 0 } = {}) {
    excludePane = exclude;
    try { return gate.send(type, payload, { replyTo }); }
    finally { excludePane = null; }
  }

  // Called by the parent chart's native crosshair/visible-range subscriptions.
  function syncFromMain(type, payload) {
    // Applying a remote value to the main chart can fire a native LRC callback
    // with chart-adjusted geometry. Suppress that specific type briefly; the
    // semantic ledger below catches later echoes of the original payload.
    if ((mainEchoUntil.get(type) || 0) > Date.now()) return;
    const clean = normalizePayload(type, payload);
    if (!clean) return;
    // A value just applied from a pane may surface later as a native LRC
    // callback. Suppress by semantic fingerprint, not by a fragile timer.
    if (mainEchoes.matches(type, clean)) return;
    if (type === 'range') lastMainRange = clean;
    if (type === 'crosshair') lastMainCrosshair = clean;
    if (state.open && state.sync[type]) broadcast(type, clean);
  }

  function applyPaneSymbol(paneId, rawSymbol) {
    let key;
    try { key = parseMarketRef(String(rawSymbol).toUpperCase()).key; } catch { return; }
    const pane = state.panes.find(p => p.id === paneId);
    if (!pane) return;
    if (state.sync.symbol) {
      for (const peer of state.panes) {
        if (peer.id === paneId) continue;
        peer.symbol = key;
        targetOverride = peer.id;
        try { gate.send('symbol', { symbol: key }, { force: true }); }
        finally { targetOverride = null; }
      }
    }
    if (pane.symbol !== key) {
      pane.symbol = key;
      // Update only the reporting pane. A full renderMulti(true) would destroy
      // the iframe that just sent the symbol and start a reload loop.
      const cell = document.querySelector(`#multi-grid .multi-cell[data-pane-id="${paneId}"]`);
      if (cell) {
        const label = cell.querySelector('.multi-cell-head span');
        if (label) label.textContent = key;
      }
      renderedKey = paneKey();
      save();
    }
    if (state.active !== paneId) { state.active = paneId; save(); }
    renderedKey = paneKey();
    save(); renderTabs(); refreshPaneControls();
    gridActiveClasses();
    suppressNotify++;
    try { setSymbol?.(key); } finally { suppressNotify--; }
    lastAppliedFromPane = { type: 'symbol', paneId, payload: { symbol: key }, at: Date.now() };
  }

  function applyFromPane(message) {
    lastAppliedFromPane = { type: message.type, paneId: message.paneId, payload: message.payload, at: Date.now() };
    if (message.type === 'crosshair' || message.type === 'range') {
      if (!state.sync[message.type]) return;
      mainEchoes.remember(message.type, message.payload);
      mainEchoUntil.set(message.type, Date.now() + 150);
      try { applyMainSync?.({ type: message.type, payload: message.payload }); } catch {}
      broadcast(message.type, message.payload, { exclude: message.paneId, replyTo: message.seq });
    } else if (message.type === 'symbol') {
      applyPaneSymbol(message.paneId, message.payload.symbol);
    } else if (message.type === 'interval') {
      setPaneInterval(message.paneId, message.payload.interval);
    }
  }

  function frameWindow(paneId) {
    return document.querySelector(`#multi-grid .multi-cell[data-pane-id="${paneId}"] iframe`)?.contentWindow || null;
  }
  function findFrameRecord(source) {
    for (const item of frames.values()) if (item.win === source) return item;
    // Navigating an iframe can replace its contentWindow object before the
    // load event arrives; re-bind by the pane's current iframe element.
    for (const item of frames.values()) {
      if (frameWindow(item.paneId) === source) { item.win = source; return item; }
    }
    return null;
  }
  function onPaneMessage(event) {
    const rec = findFrameRecord(event.source);
    const allowed = new Set([...frames.values()].map(item => frameWindow(item.paneId) || item.win));
    const message = readEnvelope(event.data, {
      origin: event.origin, expectedOrigin: location.origin,
      allowedSources: allowed, source: event.source, session
    });
    if (!message || !rec || message.paneId !== rec.paneId) return;
    if (gate.isReply(message) || isRecentEcho(message, recentCommands)) return;
    if (message.seq === 1) {
      // seq 1 always marks a freshly booted pane document, even if the pane
      // reuses an instance label after its iframe was navigated.
      rec.instance = message.instance;
      rec.lastSeq = 1;
    } else {
      if (rec.instance && message.instance !== rec.instance) return;
      if (message.seq <= rec.lastSeq) return;
      rec.instance = message.instance;
      rec.lastSeq = message.seq;
    }
    if (message.type === 'hello') {
      rec.ready = true;
      sendStateToPane(rec.paneId, message.seq);
      return;
    }
    // The state command is the real handshake acknowledgement. A late iframe
    // load event can reset `ready` after an early hello, so do not gate on it.
    if (!rec.synced) return;
    applyFromPane(message);
  }

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
    return `/alfa-charts.html?embed=1&symbol=${encodeURIComponent(pane.symbol)}&interval=${encodeURIComponent(pane.interval || getInterval())}${debug}&mcid=${encodeURIComponent(session)}&pane=${pane.id}`;
  }

  function gridActiveClasses() {
    const grid = $('multi-grid');
    if (!grid) return;
    grid.querySelectorAll('.multi-cell').forEach(cell => cell.classList.toggle('active', Number(cell.dataset.paneId) === state.active));
  }

  function renderMulti(force = false) {
    const grid = $('multi-grid'), tabs = $('multi-tabs');
    if (!grid || !tabs) return;
    const key = paneKey();
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
    paintLayoutButtons();
    const [cols, rows] = LAYOUT_GRID[state.layout] || [1, 1];
    grid.dataset.layout = String(state.layout);
    grid.style.setProperty('--mc-cols', cols);
    grid.style.setProperty('--mc-rows', rows);
    if (!force && key === renderedKey) {
      gridActiveClasses();
      return;
    }
    renderedKey = key;
    frames.clear();
    const cells = [];
    for (let i = 0; i < capacity(); i++) {
      const pane = state.panes[i];
      if (!pane) {
        cells.push(`<div class="multi-cell empty"><button type="button" data-add-cell>${icon('plus')} Grafik ekle</button></div>`);
        continue;
      }
      cells.push(`<div class="multi-cell${pane.id === state.active ? ' active' : ''}" data-pane-id="${pane.id}">
        <div class="multi-cell-head"><span>${esc(pane.symbol)}</span><select data-pane-interval="${pane.id}" aria-label="${esc(pane.symbol)} zaman dilimi">${Object.entries(TIMEFRAMES).map(([label, value]) => `<option value="${value}"${value === pane.interval ? ' selected' : ''}>${label}</option>`).join('')}</select><button type="button" data-focus-pane="${pane.id}" aria-label="Bu grafiğe geç">Odakla</button></div>
        <iframe title="${esc(pane.symbol)} grafiği" src="${esc(iframeURL(pane))}" loading="lazy" referrerpolicy="no-referrer"></iframe>
      </div>`);
    }
    grid.innerHTML = cells.join('');
    grid.querySelectorAll('.multi-cell[data-pane-id] iframe').forEach(el => {
      const paneId = Number(el.closest('.multi-cell').dataset.paneId);
      frames.set(paneId, { paneId, win: el.contentWindow, instance: '', lastSeq: 0, ready: false, synced: false });
      el.addEventListener('load', () => {
        const rec = frames.get(paneId);
        if (!rec) return;
        rec.win = el.contentWindow;
        // Every load is a fresh pane document (initial boot or iframe
        // navigation after a symbol change). Reset handshake state so a stale
        // seq ledger cannot silence its hello, then seed it with current state.
        rec.instance = ''; rec.lastSeq = 0; rec.ready = false; rec.synced = false;
        sendStateToPane(paneId);
      });
    });
    grid.querySelectorAll('[data-focus-pane]').forEach(b => b.onclick = () => activate(Number(b.dataset.focusPane)));
    grid.querySelectorAll('[data-pane-interval]').forEach(select => select.onchange = () => setPaneInterval(Number(select.dataset.paneInterval), select.value));
    grid.querySelectorAll('[data-add-cell]').forEach(b => b.onclick = () => openAddDialog());
    grid.querySelectorAll('.multi-cell[data-pane-id]').forEach(cell => cell.onclick = () => activate(Number(cell.dataset.paneId)));
  }

  function activate(id) {
    state.active = Number(id); save(); renderTabs(); renderMulti();
    const frame = $('multi-grid')?.querySelector(`.multi-cell[data-pane-id="${state.active}"] iframe`);
    frame?.focus();
  }

  function removePane(id) {
    frames.delete(Number(id));
    if (state.panes.length === 1) {
      state.panes = [{ id: state.panes[0].id, symbol: getSymbol(), interval: getInterval() }];
      state.active = state.panes[0].id;
    } else {
      state.panes = state.panes.filter(p => p.id !== id);
      if (state.active === id) state.active = state.panes[0].id;
    }
    save(); renderTabs(); renderMulti(true);
    onStatus?.('Grafik sekmesi kapatıldı', 'ok');
  }

  function addPane(symbol, interval = getInterval()) {
    if (!validInterval(interval)) return false;
    let ref;
    try { ref = parseMarketRef(String(symbol).toUpperCase()); } catch { return false; }
    const existing = state.panes.find(p => p.symbol === ref.key && p.interval === interval);
    if (existing) { activate(existing.id); return true; }
    if (state.panes.length >= capacity()) {
      const next = LAYOUTS.find(l => l > state.panes.length);
      if (!next) { onStatus?.('En fazla 16 grafik açılabilir', 'error'); return false; }
      state.layout = next;
    }
    const pane = { id: nextId++, symbol: ref.key, interval };
    state.panes.push(pane); state.active = pane.id; save(); renderTabs(); renderMulti(true);
    onStatus?.(`${ref.key} grafiği eklendi`, 'ok');
    return true;
  }

  function openAddDialog() {
    const symbols = [...new Set([getSymbol(), ...watchlistSymbols(owner)])].slice(0, 60);
    const modal = chartDialog(`<div class="dialog-header"><div><h3>Yeni grafik</h3><p>Aynı çalışma alanında yan yana veya ızgara düzeninde açılır</p></div><button id="multi-add-close" class="icon-button" aria-label="Kapat">${icon('close')}</button></div>
      <form id="multi-add-form" class="multi-add-form">
        <label>Sembol <input id="multi-add-symbol" name="symbol" list="multi-symbols" maxlength="100" autocomplete="off" required></label>
        <label>Zaman dilimi <select name="interval">${Object.entries(TIMEFRAMES).map(([label, value]) => `<option value="${value}"${value === getInterval() ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
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
      if (addPane(raw, new FormData(event.currentTarget).get('interval'))) modal.close();
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
    if (button) {
      button.setAttribute('aria-pressed', String(state.open));
      button.setAttribute('aria-label', state.open ? 'Tek grafik düzenine geç' : 'Çoklu grafik düzenine geç');
      button.setAttribute('title', state.open ? 'Tek grafik (1)' : 'Çoklu grafik (1–16)');
    }
    if (state.open) renderMulti(true);
    else setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
  }

  function notifySymbol(symbol, interval) {
    const intervalChanged = interval != null && interval !== lastInterval;
    if (intervalChanged) lastInterval = interval;
    if (suppressNotify) return;
    let key;
    try { key = parseMarketRef(String(symbol).toUpperCase()).key; } catch { return; }
    if (state.open) {
      const pane = activePane();
      if (intervalChanged) setPaneInterval(pane.id, interval);
      if (pane.symbol !== key || state.sync.symbol) {
        const targets = state.sync.symbol ? state.panes : [pane];
        for (const target of targets) {
          target.symbol = key;
          targetOverride = target.id;
          try { gate.send('symbol', { symbol: key }, { force: true }); }
          finally { targetOverride = null; }
        }
        save(); renderTabs();
        // Keep live iframe documents, their views and drawing anchors intact.
        renderedKey = paneKey();
        renderMulti();
        refreshPaneControls();
      }
      return;
    }
    const ref = state.panes.find(p => p.symbol === key);
    if (ref) {
      if (ref.id !== state.active) { state.active = ref.id; save(); renderTabs(); }
      if (intervalChanged) { ref.interval = interval; save(); renderMulti(true); }
      else renderMulti();
      return;
    }
    if (!isMarketSymbol(String(symbol || ''))) return;
    const pane = { id: nextId++, symbol: key, interval };
    if (state.panes.length >= 6) state.panes.shift();
    state.panes.push(pane); state.active = pane.id; save(); renderTabs(); renderMulti(true);
  }

  function refreshPaneControls() {
    for (const pane of state.panes) {
      const cell = document.querySelector(`#multi-grid .multi-cell[data-pane-id="${pane.id}"]`);
      const label = cell?.querySelector('.multi-cell-head span');
      if (label) label.textContent = pane.symbol;
      const select = cell?.querySelector('[data-pane-interval]');
      if (select) select.value = pane.interval;
    }
  }

  function setPaneInterval(id, interval) {
    if (!validInterval(interval)) return false;
    const pane = state.panes.find(p => p.id === id);
    if (!pane) return false;
    const targets = state.sync.interval ? state.panes : [pane];
    for (const target of targets) {
      target.interval = interval;
      targetOverride = target.id;
      try { gate.send('interval', { interval }, { force: true }); }
      finally { targetOverride = null; }
    }
    renderedKey = paneKey();
    save(); refreshPaneControls();
    return true;
  }

  function setSync(type, enabled) {
    if (!(type in syncDefaults)) return false;
    state.sync[type] = !!enabled;
    save();
    document.querySelectorAll('[data-multi-sync]').forEach(input => { input.checked = state.sync[input.dataset.multiSync]; });
    return true;
  }

  function applyWorkspace(workspace) {
    const clean = normalizeWorkspace(workspace);
    if (!clean) throw Error('Geçersiz grafik düzeni');
    // Fail before mutating the current UI if a remote restore cannot be saved.
    localStorage.setItem(STORE, JSON.stringify(clean));
    applyingWorkspace = true;
    try {
      Object.assign(state, clean);
      nextId = Math.max(...state.panes.map(p => p.id)) + 1;
      renderedKey = '';
      setOpen(state.open); renderTabs();
      document.querySelectorAll('[data-multi-sync]').forEach(input => { input.checked = state.sync[input.dataset.multiSync]; });
    } finally { applyingWorkspace = false; }
  }
  function startPersistence(hasLocal) {
    persistence?.start(owner, state, hasLocal).catch(() => onWorkspaceStatus?.('Bulut düzeni okunamadı · yerel kayıt korundu', 'error'));
  }
  function account() {
    const next = getOwner();
    if (next !== owner) {
      persistence?.dispose();
      owner = next; STORE = 'alfa-chart-tabs:v1:' + owner;
      const hasLocal = hasStored(), restored = loadState(STORE);
      contextHadLocal = hasLocal;
      if (!restored.panes.length) restored.panes.push({ id: 1, symbol: getSymbol(), interval: getInterval() });
      for (const pane of restored.panes) pane.interval ||= getInterval();
      applyWorkspace(restored);
      startPersistence(hasLocal);
    } else if (persistence && !persistence.ready) startPersistence(contextHadLocal);
  }

  function paintLayoutButtons() {
    document.querySelectorAll('.layout-buttons [data-layout]').forEach(b =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.layout) === state.layout)));
  }
  function renderLayoutButtons() {
    const host = document.querySelector('.layout-buttons');
    if (!host) return;
    host.innerHTML = LAYOUTS.map(count => {
      const [cols, rows] = LAYOUT_GRID[count];
      return `<button type="button" data-layout="${count}" title="${count} grafik düzeni" aria-label="${count} grafik düzeni" aria-pressed="${count === state.layout}" style="--cols:${cols};--rows:${rows}"><span class="layout-grid" aria-hidden="true">${'<i></i>'.repeat(count)}</span><span class="layout-count">${count}</span></button>`;
    }).join('');
    host.querySelectorAll('[data-layout]').forEach(b => b.onclick = () => applyLayout(Number(b.dataset.layout)));
  }
  function applyLayout(count) {
    if (!CAPACITY[count]) return;
    state.layout = count;
    paintLayoutButtons();
    setOpen(true);
    onStatus?.(`${count} grafik düzeni açıldı`, 'ok');
  }
  renderLayoutButtons();
  $('multi-toggle')?.addEventListener('click', () => setOpen(!state.open));
  $('multi-exit')?.addEventListener('click', () => setOpen(false));
  $('multi-add')?.addEventListener('click', () => openAddDialog());
  window.addEventListener('message', onPaneMessage);
  // Clicks inside iframe documents do not bubble into the parent.
  window.addEventListener('blur', () => setTimeout(() => {
    const frame = document.activeElement;
    const id = Number(frame?.closest?.('.multi-cell')?.dataset.paneId);
    if (id && state.open) activate(id);
  }, 0));
  document.querySelectorAll('[data-multi-sync]').forEach(input => {
    input.checked = state.sync[input.dataset.multiSync];
    input.onchange = () => setSync(input.dataset.multiSync, input.checked);
  });
  setOpen(state.open);
  renderTabs();
  if (cloudStore) {
    persistence = new WorkspacePersistence({
      store: cloudStore, normalize: normalizeWorkspace, apply: applyWorkspace, onStatus: onWorkspaceStatus,
      onConflict: blocked => { const button = $('workspace-conflict'); if (button) button.hidden = !blocked; }
    });
    $('workspace-conflict')?.addEventListener('click', () => persistence.resolve());
    window.addEventListener('online', () => {
      if (persistence.ready) persistence.flush(); else startPersistence(contextHadLocal);
    });
    window.addEventListener('pagehide', () => persistence.dispose(), { once: true });
    startPersistence(hadLocal);
  }
  return {
    addPane, removePane, activate, notifySymbol, setOpen, syncFromMain, setPaneInterval, setSync, account,
    get state() { return state; },
    get syncState() {
      return {
        session, parentInstance,
        frames: [...frames.entries()].map(([id, rec]) => ({ id, ready: rec.ready, synced: rec.synced, instance: rec.instance, lastSeq: rec.lastSeq })),
        lastAppliedFromPane
      };
    }
  };
}
