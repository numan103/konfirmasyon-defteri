// Sabah trader check-in'i. Yalnızca yerel kayıt; sunucuya veri gönderilmez.
const KEY = 'alfa-morning-checkin-v1';
const CFG_KEY = 'alfa-morning-checkin-config-v1';
const GROUPS = ['Uyku', 'Duygu', 'Odak', 'Genel'];

const DEFAULT_ITEMS = [
  { id: 'slept-well', group: 'Uyku', label: 'İyi uyudum' },
  { id: 'tired', group: 'Uyku', label: 'Yorgun kalktım' },
  { id: 'angry', group: 'Duygu', label: 'Kızgınım' },
  { id: 'loss-pain', group: 'Duygu', label: 'Kayıp acısı yaşıyorum' },
  { id: 'motivated', group: 'Duygu', label: 'Motivasyonum yerinde' },
  { id: 'clear-after-win', group: 'Duygu', label: 'Kazanç sonrası berrak görüyorum' },
  { id: 'sees-opportunity', group: 'Odak', label: 'Fırsatı net görüyorum' },
];

function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function write(value) {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* gizli mod */ }
}
function clear() {
  try { localStorage.removeItem(KEY); } catch { /* gizli mod */ }
}
function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function loadConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    if (raw && Array.isArray(raw.items)) {
      const items = raw.items
        .filter(i => i && typeof i.label === 'string' && i.label.trim())
        .map(i => ({ id: String(i.id || 'custom-' + Math.random().toString(36).slice(2, 9)), group: GROUPS.includes(i.group) ? i.group : 'Genel', label: i.label.trim().slice(0, 90) }));
      if (items.length) return items;
    }
  } catch { /* bozuk kayıt */ }
  return DEFAULT_ITEMS.map(i => ({ ...i }));
}
function saveConfig(items) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify({ version: 1, items })); } catch { /* gizli mod */ }
}

const root = document.getElementById('morning-checkin');
if (root) {
  const card = document.getElementById('mc-card');
  const chip = document.getElementById('mc-chip');
  const chipLabel = document.getElementById('mc-chip-label');
  const form = document.getElementById('mc-form');
  const groups = document.getElementById('mc-groups');
  const closeBtn = document.getElementById('mc-close');
  const laterBtn = document.getElementById('mc-later');
  const resetBtn = document.getElementById('mc-reset');
  const editBtn = document.getElementById('mc-edit');
  const editor = document.getElementById('mc-editor');
  const editorList = document.getElementById('mc-editor-list');
  const editorHint = document.getElementById('mc-editor-hint');
  const addBtn = document.getElementById('mc-add-item');
  const doneBtn = document.getElementById('mc-editor-done');
  const resetCfgBtn = document.getElementById('mc-config-reset');

  let config = loadConfig();

  const showCard = () => {
    card.classList.remove('hidden');
    chip.classList.add('hidden');
    card.querySelector('.mc-save')?.focus();
  };
  const showChip = () => {
    card.classList.add('hidden');
    chip.classList.remove('hidden');
  };
  const hideAll = () => {
    card.classList.add('hidden');
    chip.classList.add('hidden');
  };
  const syncChip = record => {
    const n = Array.isArray(record?.values) ? record.values.length : 0;
    chipLabel.textContent = n ? `Ruh hali: ${n} tik` : 'Ruh hali';
  };

  function renderItems() {
    if (!groups) return;
    groups.innerHTML = GROUPS.map(group => {
      const items = config.filter(i => i.group === group);
      if (!items.length) return '';
      const chips = items.map(i => `<label class="mc-chip"><input type="checkbox" name="mood" value="${esc(i.id)}"><span>${esc(i.label)}</span></label>`).join('');
      return `<fieldset class="mc-group"><legend>${esc(group)}</legend><div class="mc-chips">${chips}</div></fieldset>`;
    }).join('');
  }

  function renderEditor() {
    if (!editorList) return;
    editorList.innerHTML = config.map((item, index) => `<div class="mc-edit-row" data-index="${index}" data-id="${esc(item.id)}">
      <input class="mc-edit-label" type="text" maxlength="90" value="${esc(item.label)}" aria-label="Soru metni">
      <select class="mc-edit-group" aria-label="Grup">${GROUPS.map(g => `<option value="${esc(g)}"${g === item.group ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select>
      <button type="button" class="mc-edit-remove" aria-label="Soruyu kaldır">×</button>
    </div>`).join('');
    if (editorHint) editorHint.textContent = `${config.length} soru · istediğini ekle veya çıkar`;
  }

  const openEditor = () => {
    renderEditor();
    editor?.classList.remove('hidden');
    if (form) form.classList.add('hidden');
  };
  const closeEditor = () => {
    editor?.classList.add('hidden');
    form?.classList.remove('hidden');
  };

  function maybeShow() {
    if (document.body.dataset.page !== 'home') {
      root.classList.add('hidden');
      hideAll();
      return;
    }
    const record = read();
    const today = localDate();
    if (!record || record.date !== today || (!record.done && !record.dismissed)) {
      root.classList.remove('hidden');
      showCard();
      return;
    }
    root.classList.remove('hidden');
    syncChip(record);
    showChip();
  }

  renderItems();

  form?.addEventListener('submit', event => {
    event.preventDefault();
    const values = [...form.querySelectorAll('input[name="mood"]:checked')].map(input => input.value);
    const labels = values.map(id => config.find(i => i.id === id)?.label || '').filter(Boolean);
    const record = { date: localDate(), at: new Date().toISOString(), values, labels, done: true };
    write(record);
    try { window.dispatchEvent(new CustomEvent('moodCheckin', { detail: record })); } catch { /* olay desteklenmiyor */ }
    syncChip(record);
    showChip();
  });

  laterBtn?.addEventListener('click', () => {
    write({ date: localDate(), dismissed: true });
    syncChip(null);
    showChip();
  });

  resetBtn?.addEventListener('click', () => {
    clear();
    root.classList.remove('hidden');
    closeEditor();
    renderItems();
    showCard();
  });

  editBtn?.addEventListener('click', openEditor);
  doneBtn?.addEventListener('click', () => {
    const rows = [...(editorList?.querySelectorAll('.mc-edit-row') || [])];
    const items = rows.map(row => ({
      id: String(row.dataset.id || config[Number(row.dataset.index)]?.id || 'custom-' + Math.random().toString(36).slice(2, 9)),
      label: (row.querySelector('.mc-edit-label')?.value || '').trim().slice(0, 90),
      group: row.querySelector('.mc-edit-group')?.value || 'Genel',
    })).filter(i => i.label);
    if (!items.length) {
      if (editorHint) editorHint.textContent = 'En az bir soru bırakmalısın.';
      return;
    }
    config = items;
    saveConfig(config);
    renderItems();
    closeEditor();
  });
  addBtn?.addEventListener('click', () => {
    if (!editorList) return;
    const row = document.createElement('div');
    row.className = 'mc-edit-row';
    row.dataset.index = String(editorList.children.length);
    row.dataset.id = 'custom-' + Math.random().toString(36).slice(2, 9);
    row.innerHTML = `<input class="mc-edit-label" type="text" maxlength="90" placeholder="Örn. Bugün risk iştahım nasıl?" aria-label="Soru metni">
      <select class="mc-edit-group" aria-label="Grup">${GROUPS.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select>
      <button type="button" class="mc-edit-remove" aria-label="Soruyu kaldır">×</button>`;
    editorList.appendChild(row);
    row.querySelector('.mc-edit-label')?.focus();
  });
  editorList?.addEventListener('click', event => {
    const btn = event.target.closest('.mc-edit-remove');
    if (!btn) return;
    const rows = [...editorList.querySelectorAll('.mc-edit-row')];
    if (rows.length <= 1) {
      if (editorHint) editorHint.textContent = 'En az bir soru bırakmalısın.';
      return;
    }
    btn.closest('.mc-edit-row')?.remove();
  });
  resetCfgBtn?.addEventListener('click', () => {
    config = DEFAULT_ITEMS.map(i => ({ ...i }));
    saveConfig(config);
    renderItems();
    renderEditor();
  });

  closeBtn?.addEventListener('click', hideAll);
  chip?.addEventListener('click', showCard);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (editor && !editor.classList.contains('hidden')) closeEditor();
      else if (!card.classList.contains('hidden')) hideAll();
    }
  });

  let lastPage = null;
  function onPageChange() {
    const page = document.body.dataset.page;
    if (page === lastPage) return;
    lastPage = page;
    maybeShow();
  }
  onPageChange();
  new MutationObserver(onPageChange).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });

  window.AlfaMorningCheckin = {
    maybeShow,
    get: read,
    getConfig() { return config.map(i => ({ ...i })); },
    setConfig(items) {
      if (!Array.isArray(items) || !items.length) return false;
      config = items.map(i => ({ id: String(i.id || 'custom-' + Math.random().toString(36).slice(2, 9)), group: GROUPS.includes(i.group) ? i.group : 'Genel', label: String(i.label || '').slice(0, 90) })).filter(i => i.label);
      saveConfig(config);
      renderItems();
      return config;
    },
    reset() { clear(); root.classList.remove('hidden'); closeEditor(); renderItems(); showCard(); }
  };
}
