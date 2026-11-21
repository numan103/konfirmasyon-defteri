// Kişisel portföy: yalnızca oturum sahibinin tarayıcısında saklanır. Sunucuya yazmaz,
// başka üyelerin verisini okumaz, paylaşılan Alfa Portföy kaydına dokunmaz.
const tabAlpha = document.getElementById('ap2-tab-alpha');
const tabMine = document.getElementById('ap2-tab-mine');
const panelAlpha = document.getElementById('ap2-panel-alpha');
const panelMine = document.getElementById('ap2-panel-mine');
const list = document.getElementById('mp-list');
const empty = document.getElementById('mp-empty');
const summary = document.getElementById('mp-summary');
const form = document.getElementById('mp-form');
const err = document.getElementById('mp-f-err');
const login = document.getElementById('mp-login');
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const num = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const money = v => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(v)) + ' $';
let uid = '', side = 'LONG', editId = '';

function currentUser() { try { return AUTH.user?.id || ''; } catch { return ''; } }
function storageKey() { return 'alfa_my_portfolio_' + uid; }
function blank() { return { startBalance: 1000, positions: [] }; }
function clean(p) {
  return p && typeof p === 'object' && typeof p.id === 'string' && typeof p.symbol === 'string' && p.symbol
    ? { id: p.id, symbol: p.symbol.slice(0, 40), type: String(p.type || '').slice(0, 24),
        side: p.side === 'SHORT' ? 'SHORT' : 'LONG', qty: Math.max(0, num(p.qty)),
        cost: Math.max(0, num(p.cost)), price: Math.max(0, num(p.price)), date: String(p.date || '').slice(0, 10),
        note: String(p.note || '').slice(0, 120) }
    : null;
}
function load() {
  const next = currentUser();
  if (next !== uid) { uid = next; editId = ''; closeForm(); }
  if (!uid) return blank();
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return blank();
    const data = JSON.parse(raw);
    const positions = Array.isArray(data.positions) ? data.positions.slice(0, 200).map(clean).filter(Boolean) : [];
    const startBalance = num(data.startBalance) > 0 ? num(data.startBalance) : 1000;
    return { startBalance, positions };
  } catch { return blank(); }
}
function save(data) { if (!uid) return; try { localStorage.setItem(storageKey(), JSON.stringify(data)); } catch (e) {} }
function pnlOf(p) {
  const entry = p.qty * p.cost, current = p.qty * (p.price || p.cost);
  return p.side === 'SHORT' ? entry - current : current - entry;
}
function render() {
  if (!list) return;
  const data = load();
  if (login) login.classList.toggle('hidden', !!uid);
  const positions = data.positions;
  const invested = positions.reduce((s, p) => s + p.qty * p.cost, 0);
  const pnl = positions.reduce((s, p) => s + pnlOf(p), 0);
  const pct = invested > 0 ? (pnl / invested) * 100 : 0;
  if (summary) {
    summary.replaceChildren();
    const cells = [
      ['Pozisyon', String(positions.length), ''],
      ['Yatırılan', money(invested), ''],
      ['Kâr / Zarar', (pnl >= 0 ? '+' : '') + money(pnl), pnl >= 0 ? 'green' : 'red'],
      ['Nakit (tahmini)', money(data.startBalance - invested), '']
    ];
    cells.forEach(([label, value, cls]) => {
      const box = el('div'); box.append(el('small', label), el('strong', value, cls)); summary.appendChild(box);
    });
    const rate = el('div'); rate.append(el('small', 'Getiri'), el('strong', (pct >= 0 ? '+' : '') + new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(pct) + ' %', pct >= 0 ? 'green' : 'red'));
    summary.appendChild(rate);
  }
  list.replaceChildren();
  positions.forEach((p, index) => {
    const card = el('article', undefined, 'mp-card');
    const top = el('div', undefined, 'mp-card-top');
    top.append(el('b', p.symbol), el('span', p.type || '—'), el('em', p.side === 'SHORT' ? 'KISA' : 'UZUN'));
    const grid = el('div', undefined, 'mp-grid');
    const value = p.qty * (p.price || p.cost), gain = pnlOf(p);
    [['Miktar', new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 8 }).format(p.qty)],
      ['Giriş', money(p.cost)], ['Güncel', money(p.price || p.cost)],
      ['Değer', money(value)], ['K / Z', (gain >= 0 ? '+' : '') + money(gain), gain >= 0 ? 'green' : 'red'],
      ['Tarih', p.date || '—']].forEach(([label, val, cls]) => {
      const cell = el('div'); cell.append(el('small', label), el('strong', val, cls)); grid.appendChild(cell);
    });
    card.append(top, grid);
    if (p.note) card.appendChild(el('p', p.note, 'mp-card-note'));
    const actions = el('div', undefined, 'mp-card-actions');
    const edit = el('button', 'Düzenle', 'btn'); edit.type = 'button'; edit.dataset.mpEdit = String(index);
    const del = el('button', 'Sil', 'btn ghost'); del.type = 'button'; del.dataset.mpDel = String(index);
    actions.append(edit, del); card.appendChild(actions); list.appendChild(card);
  });
  if (empty) empty.classList.toggle('hidden', positions.length > 0 || !uid);
}
function closeForm() {
  if (!form) return;
  form.classList.add('hidden'); editId = ''; side = 'LONG';
  if (err) err.textContent = '';
  form.querySelectorAll('input').forEach(input => { input.value = ''; });
  form.querySelectorAll('[data-mpside]').forEach(b => b.classList.toggle('on', b.dataset.mpside === 'LONG'));
  const title = document.getElementById('mp-form-title'); if (title) title.textContent = 'Yeni Pozisyon';
}
function openForm(position) {
  if (!uid || !form) return;
  closeForm();
  if (position) {
    editId = position.id;
    document.getElementById('mp-f-symbol').value = position.symbol;
    document.getElementById('mp-f-type').value = position.type || '';
    document.getElementById('mp-f-qty').value = position.qty || '';
    document.getElementById('mp-f-cost').value = position.cost || '';
    document.getElementById('mp-f-price').value = position.price || '';
    document.getElementById('mp-f-date').value = position.date || '';
    document.getElementById('mp-f-note').value = position.note || '';
    side = position.side === 'SHORT' ? 'SHORT' : 'LONG';
    form.querySelectorAll('[data-mpside]').forEach(b => b.classList.toggle('on', b.dataset.mpside === side));
    const title = document.getElementById('mp-form-title'); if (title) title.textContent = 'Pozisyonu Düzenle';
  } else {
    document.getElementById('mp-f-date').value = new Date().toISOString().slice(0, 10);
  }
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function bind() {
  tabAlpha?.addEventListener('click', () => activate('alpha'));
  tabMine?.addEventListener('click', () => activate('mine'));
  document.getElementById('mp-add')?.addEventListener('click', () => openForm(null));
  document.getElementById('mp-form-cancel')?.addEventListener('click', closeForm);
  document.getElementById('mp-f-cancel2')?.addEventListener('click', closeForm);
  document.getElementById('mp-login-btn')?.addEventListener('click', () => {
    if (typeof showGate === 'function') showGate();
    else if (typeof showPage === 'function') showPage('erisim');
  });
  form?.querySelectorAll('[data-mpside]').forEach(b => b.addEventListener('click', () => {
    side = b.dataset.mpside === 'SHORT' ? 'SHORT' : 'LONG';
    form.querySelectorAll('[data-mpside]').forEach(x => x.classList.toggle('on', x === b));
  }));
  document.getElementById('mp-f-save')?.addEventListener('click', () => {
    if (!uid) return;
    const symbol = document.getElementById('mp-f-symbol').value.trim();
    const qty = num(document.getElementById('mp-f-qty').value);
    const cost = num(document.getElementById('mp-f-cost').value);
    if (!symbol || qty <= 0 || cost <= 0) { err.textContent = 'Sembol, miktar ve giriş fiyatı zorunlu.'; return; }
    const data = load();
    const record = clean({ id: editId || ('mp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)),
      symbol, type: document.getElementById('mp-f-type').value, side, qty, cost,
      price: num(document.getElementById('mp-f-price').value), date: document.getElementById('mp-f-date').value,
      note: document.getElementById('mp-f-note').value });
    const index = data.positions.findIndex(p => p.id === editId);
    if (index >= 0) data.positions[index] = record; else data.positions.unshift(record);
    save(data); closeForm(); render();
  });
  list?.addEventListener('click', event => {
    const edit = event.target.closest('[data-mp-edit]'), del = event.target.closest('[data-mp-del]');
    if (!edit && !del) return;
    const data = load(), index = Number((edit || del).dataset.mpEdit ?? del.dataset.mpDel);
    const position = data.positions[index];
    if (!position) return;
    if (edit) { openForm(position); return; }
    if (!window.confirm('“' + position.symbol + '” pozisyonu silinsin mi?')) return;
    data.positions.splice(index, 1); save(data); render();
  });
}
function activate(which) {
  const mine = which === 'mine';
  tabAlpha?.classList.toggle('on', !mine); tabMine?.classList.toggle('on', mine);
  tabAlpha?.setAttribute('aria-selected', String(!mine)); tabMine?.setAttribute('aria-selected', String(mine));
  panelAlpha?.classList.toggle('hidden', mine); panelMine?.classList.toggle('hidden', !mine);
  if (mine) render();
}
bind();
try { if (new URLSearchParams(location.search).get('portfoyTab') === 'mine') activate('mine'); } catch (e) {}
window.AlfaMyPortfolio = { activate, refresh: render };
