// Sabah trader check-in'i. Yalnızca yerel kayıt; sunucuya veri gönderilmez.
const KEY = 'alfa-morning-checkin-v1';

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

const root = document.getElementById('morning-checkin');
if (root) {
  const card = document.getElementById('mc-card');
  const chip = document.getElementById('mc-chip');
  const chipLabel = document.getElementById('mc-chip-label');
  const form = document.getElementById('mc-form');
  const closeBtn = document.getElementById('mc-close');
  const laterBtn = document.getElementById('mc-later');
  const resetBtn = document.getElementById('mc-reset');

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

  form?.addEventListener('submit', event => {
    event.preventDefault();
    const values = [...form.querySelectorAll('input[name="mood"]:checked')].map(input => input.value);
    const record = { date: localDate(), at: new Date().toISOString(), values, done: true };
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
    showCard();
  });

  closeBtn?.addEventListener('click', hideAll);
  chip?.addEventListener('click', showCard);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !card.classList.contains('hidden')) hideAll();
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
    reset() { clear(); root.classList.remove('hidden'); showCard(); }
  };
}
