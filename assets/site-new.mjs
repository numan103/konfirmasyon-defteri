// Sağ üst "Yeni" rozeti — 1 haftalık ömür, özellik kayıt defterinden beslenir.
// Hangi özelliğin kaç gün "yeni" kalacağı assets/site-features.mjs'de.
const SF = window.ALFA_SITE_FEATURES || {
  FEATURES: [], NEW_DAYS: 7,
  findFeature: () => null, isNew: () => false,
  activeFeatures: () => [], activeIds: () => [],
};

const SEEN_KEY = 'alfa-whats-new-seen-v2';
const SYNC_KEY = 'alfa-features-sync-v2';

const panel = document.getElementById('whats-new-panel');
const buttons = [...document.querySelectorAll('.site-new-chip')];
const closeBtn = document.getElementById('wn-close');
const openCheckin = document.getElementById('wn-open-checkin');
const list = document.getElementById('wn-list');
const sub = document.getElementById('wn-sub');

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function seenIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch { return []; }
}

function applyBadges() {
  const nodes = document.querySelectorAll('[data-new-feature]');
  nodes.forEach(el => {
    const feature = SF.findFeature(el.getAttribute('data-new-feature'));
    const show = SF.isNew(feature);
    el.classList.toggle('expired', !show);
    el.hidden = !show;
    const link = typeof el.closest === 'function' ? el.closest('a') : null;
    if (link && typeof link.classList?.toggle === 'function') link.classList.toggle('has-new', show);
  });
}

function renderPanel() {
  if (!list) return;
  const items = SF.activeFeatures();
  list.innerHTML = items.map(f => {
    const safeUrl = esc(f.url || '#');
    return '<li><a href="' + safeUrl + '" data-nav>' +
      '<span class="wn-ico" aria-hidden="true">' + esc(f.icon || '✦') + '</span>' +
      '<div><b>' + esc(f.label) + '</b><span>' + esc(f.desc) + '</span></div></a></li>';
  }).join('');
  if (sub) sub.textContent = items.length
    ? 'Son 1 haftadaki yenilikler — hemen dene'
    : 'Şu an yeni özellik yok.';
}

function applyChip() {
  const ids = SF.activeIds();
  const seen = seenIds();
  const unread = ids.some(id => !seen.includes(id));
  buttons.forEach(btn => {
    btn.hidden = ids.length === 0;
    btn.classList.toggle('seen', !unread);
    const count = btn.querySelector('.wn-count');
    if (count) count.textContent = ids.length ? String(ids.length) : '';
    btn.setAttribute('aria-expanded', String(!!panel && !panel.classList.contains('hidden')));
  });
}

function markSeen() {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(SF.activeIds())); } catch { /* gizli mod */ }
  applyChip();
}

function refresh() {
  applyBadges();
  renderPanel();
  applyChip();
}

function setOpen(open) {
  if (!panel) return;
  if (open && SF.activeIds().length === 0) return;
  panel.classList.toggle('hidden', !open);
  buttons.forEach(btn => btn.setAttribute('aria-expanded', String(open)));
  if (open) markSeen();
}

buttons.forEach(btn => {
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(panel ? panel.classList.contains('hidden') : false);
  });
});

closeBtn?.addEventListener('click', () => setOpen(false));
document.addEventListener('click', event => {
  if (panel && !panel.classList.contains('hidden') && !event.target.closest('.whats-new-panel, .site-new-chip')) setOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && panel && !panel.classList.contains('hidden')) {
    setOpen(false);
    buttons[0]?.focus();
  }
});

openCheckin?.addEventListener('click', () => {
  setOpen(false);
  if (document.body.dataset.page === 'home') window.AlfaMorningCheckin?.maybeShow?.();
  else window.location.href = '?page=home';
});

// Yeni özellik listesi değiştiğinde sunucuya haber ver; sunucu Telegram'a tek mesaj atar.
async function announce() {
  const ids = SF.FEATURES.map(f => f.id);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); } catch { /* gizli mod */ }
  if (Array.isArray(saved) && saved.join(',') === ids.join(',')) return;
  try {
    const res = await fetch('/api/edu-shared?kind=site-features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: ids }),
    });
    if (res && res.ok) localStorage.setItem(SYNC_KEY, JSON.stringify(ids));
  } catch { /* /api yoksa sessizce geç */ }
}

if (typeof MutationObserver !== 'undefined' && document.body) {
  new MutationObserver(() => applyBadges()).observe(document.body, { childList: true, subtree: true });
}

refresh();
announce();

window.AlfaWhatsNew = {
  open: () => setOpen(true),
  close: () => setOpen(false),
  refresh,
  announce,
};
