// Sağ üst "Yeni" rozeti — güncellemeleri herkese gösterir, sunucuya veri göndermez.
const SEEN_KEY = 'alfa-whats-new-seen-v1';
const panel = document.getElementById('whats-new-panel');
const buttons = [...document.querySelectorAll('.site-new-chip')];
const closeBtn = document.getElementById('wn-close');
const openCheckin = document.getElementById('wn-open-checkin');

function markSeen() {
  buttons.forEach(b => b.classList.add('seen'));
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* gizli mod */ }
}

function setOpen(open) {
  if (!panel) return;
  panel.classList.toggle('hidden', !open);
  buttons.forEach(b => b.setAttribute('aria-expanded', String(open)));
  if (open) markSeen();
}

try {
  if (localStorage.getItem(SEEN_KEY) === '1') buttons.forEach(b => b.classList.add('seen'));
} catch { /* gizli mod */ }

buttons.forEach(btn => {
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(panel?.classList.contains('hidden'));
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

window.AlfaWhatsNew = { open: () => setOpen(true), close: () => setOpen(false) };
