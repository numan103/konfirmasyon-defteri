/* Alfa Traders — Driver.js ile interaktif platform tanıtım rehberi.
   Driver yüklenemezse karşılama/tur devre dışı kalır, site normal çalışır. */

const STORAGE_KEY = 'alfa.platformTour.v1';
const DRIVER_URL = '/assets/vendor/driver/driver.js.mjs?v=2';
const MOBILE_QUERY = '(max-width: 680px)';

const WELCOME = {
  title: "ALFA TRADERS'a Hoş Geldin!",
  text: 'Grafiklerden işlem günlüğüne, portföy takibinden eğitimlere kadar platformu birlikte keşfedelim.'
};

// Sıra sabit; erişimi olmayan / görünmeyen adımlar çalışma zamanında elenir.
const STEPS = [
  {
    id: 'home', page: 'home', title: 'Ana Sayfa',
    description: 'Piyasa haberleri ve günlük araçlar.',
    desktop: '#nav-home', mobile: '[data-mnav="home"]', side: 'bottom'
  },
  {
    id: 'alfacharts', page: 'alfacharts', title: 'ALFA Charts',
    description: 'Canlı grafikler ve teknik analiz.',
    desktop: '#tab-alfacharts', mobile: '#mnav-alfacharts', side: 'bottom'
  },
  {
    id: 'defter', page: 'defter', title: 'İşlem Defteri',
    description: 'İşlemleri kaydetme ve checklist.',
    desktop: '#tab-defter', mobile: '#mnav-defter', side: 'bottom'
  },
  {
    id: 'review', page: 'review', title: 'Review',
    description: 'İşlem performansını değerlendirme.',
    desktop: '#tab-review', mobile: '#mnav-review', side: 'bottom'
  },
  {
    id: 'portfoy', page: 'portfoy', title: 'Portföyüm',
    description: 'Kişisel portföy takibi.',
    desktop: '#tab-portfoy-mine', mobile: '#mnav-portfoy-mine', side: 'bottom'
  },
  {
    id: 'eduplans', page: 'eduplans', title: 'ALFA Edu',
    description: 'Eğitim içerikleri ve paketleri.',
    desktop: '#tab-eduplans', mobile: '[data-mnav="eduplans"]', side: 'bottom'
  }
];

let driverFactory = null;
let tour = null;
let tourState = 'idle';
let touchedDropdowns = [];
let openedMobileNav = false;
let welcomeCloseHandler = null;
let originalShowLanding = null;

function readPref() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      return {
        seen: parsed.seen === true,
        choice: typeof parsed.choice === 'string' ? parsed.choice : null,
        completed: parsed.completed === true,
        skipped: parsed.skipped === true,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
      };
    }
  } catch (e) { /* localStorage kapalı olabilir */ }
  return { seen: false, choice: null, completed: false, skipped: false, updatedAt: null };
}

function writePref(patch) {
  const next = Object.assign(readPref(), patch, { updatedAt: new Date().toISOString() });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
  return next;
}

function isMobile() {
  return !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
}

function resolveElement(def, mobile = isMobile()) {
  try { return document.querySelector(mobile ? def.mobile : def.desktop); }
  catch (e) { return null; }
}

// Masaüstünde açılır menü kapalıyken bağlantı görünmez; tur için geçici aç.
function revealAncestors(el, mobile = isMobile()) {
  if (mobile || !el || !el.closest) return;
  const drop = el.closest('.nav-drop');
  if (drop && !drop.classList.contains('open')) {
    drop.classList.add('open');
    touchedDropdowns.push(drop);
  }
}

function isVisible(el) {
  if (!el) return false;
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function canOpenPage(page) {
  if (typeof siteCanOpen !== 'function') return true;
  try { return siteCanOpen(page) !== false; } catch (e) { return true; }
}

function waitForAccess() {
  if (typeof SITE !== 'undefined' && SITE && SITE.loaded) return Promise.resolve();
  return new Promise(resolve => {
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      try {
        if ((typeof SITE !== 'undefined' && SITE && SITE.loaded) || tries >= 60) {
          clearInterval(id);
          resolve();
        }
      } catch (e) { clearInterval(id); resolve(); }
    }, 100);
  });
}

function openMobileDrawer() {
  const drawer = document.getElementById('nav-mobile');
  if (!drawer || drawer.classList.contains('open')) return false;
  const btn = document.getElementById('nav-mobile-btn');
  if (!btn) return false;
  btn.click();
  return drawer.classList.contains('open');
}

// Misafir oturum kontrolü geç tamamlanırsa showLanding() landing'i yeniden
// açabilir; tur boyunca bu çağrıyı geçici olarak susturuyoruz.
function suppressLanding() {
  if (originalShowLanding || typeof window.showLanding !== 'function') return;
  originalShowLanding = window.showLanding;
  window.showLanding = function () {};
}

function restoreLanding() {
  if (!originalShowLanding) return;
  window.showLanding = originalShowLanding;
  originalShowLanding = null;
}

function cleanup() {
  document.body.classList.remove('pt-tour-active');
  try {
    document.querySelectorAll('.alfa-tour-highlight').forEach(el => el.classList.remove('alfa-tour-highlight'));
  } catch (e) {}
  touchedDropdowns.forEach(d => d.classList.remove('open'));
  touchedDropdowns = [];
  if (openedMobileNav) {
    const closeBtn = document.getElementById('nav-mobile-close');
    if (closeBtn) closeBtn.click();
    openedMobileNav = false;
  }
  restoreLanding();
}

// Saf gerçek planlama: erişim + görünürlük filtreleri burada uygulanır.
// Testler farklı roller/viewport için bu fonksiyonu özel ctx ile çağırabilir.
function planSteps(ctx = {}) {
  const mobile = typeof ctx.mobile === 'boolean' ? ctx.mobile : isMobile();
  const canOpen = ctx.canOpen || canOpenPage;
  const resolve = ctx.resolve || resolveElement;
  const reveal = ctx.reveal || revealAncestors;
  const visible = ctx.visible || isVisible;
  const planned = [];
  for (const def of STEPS) {
    if (!canOpen(def.page)) continue;
    const el = resolve(def, mobile);
    if (!el) continue;
    reveal(el, mobile);
    if (!visible(el)) continue;
    planned.push({ def, element: el });
  }
  return planned;
}

function buildSteps() {
  const mobile = isMobile();
  return planSteps({ mobile }).map(({ def, element }) => ({
    element,
    popover: {
      title: def.title,
      description: def.description,
      side: mobile ? 'left' : def.side,
      align: 'start'
    }
  }));
}

async function start() {
  if (!driverFactory || (tour && tour.isActive && tour.isActive())) return;
  await waitForAccess();
  suppressLanding();

  // Landing açıksa uygulama menüsü gizlidir; turu göstermek için kapat.
  try {
    if (document.body.classList.contains('landed') && typeof hideLanding === 'function') hideLanding();
  } catch (e) {}

  if (isMobile()) openedMobileNav = openMobileDrawer();

  const steps = buildSteps();
  if (!steps.length) { cleanup(); return; }

  tourState = 'running';
  document.body.classList.add('pt-tour-active');
  writePref({ seen: true, choice: 'explore', skipped: false });

  tour = driverFactory({
    steps,
    animate: true,
    duration: 350,
    smoothScroll: true,
    overlayColor: '#05060f',
    overlayOpacity: 0.72,
    stagePadding: 7,
    stageRadius: 10,
    allowKeyboardControl: true,
    popoverClass: 'alfa-tour-popover',
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'İleri',
    prevBtnText: 'Geri',
    doneBtnText: 'Bitir',
    closeBtnLabel: 'Atla',
    onPopoverRender: popover => {
      if (popover && popover.closeButton) {
        popover.closeButton.textContent = 'Atla';
        popover.closeButton.setAttribute('aria-label', 'Atla');
      }
    },
    onHighlighted: el => {
      if (el && el.classList) el.classList.add('alfa-tour-highlight');
    },
    onDeselected: el => {
      if (el && el.classList) el.classList.remove('alfa-tour-highlight');
    },
    onDoneClick: () => {
      tourState = 'completed';
      writePref({ completed: true, skipped: false, lastStep: steps.length });
      if (tour) tour.destroy();
    },
    onCloseClick: () => {
      tourState = 'skipped';
      writePref({ skipped: true });
      if (tour) tour.destroy();
    },
    onDestroyed: () => {
      if (tourState === 'running') writePref({ skipped: true });
      cleanup();
      tourState = 'idle';
    }
  });
  tour.drive(0);
}

function closeWelcome() {
  const modal = document.getElementById('platform-tour-welcome');
  if (!modal) return;
  modal.classList.add('pt-hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (welcomeCloseHandler) {
    document.removeEventListener('keydown', welcomeCloseHandler, true);
    welcomeCloseHandler = null;
  }
}

function openWelcome() {
  const modal = document.getElementById('platform-tour-welcome');
  if (!modal || !driverFactory || !modal.classList.contains('pt-hidden')) return;
  if (document.querySelector('#auth-gate.open')) return; // giriş/kayıt akışına karışma
  modal.classList.remove('pt-hidden');
  modal.removeAttribute('aria-hidden');
  const startBtn = document.getElementById('pt-welcome-start');
  if (startBtn) startBtn.focus();
  welcomeCloseHandler = e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    writePref({ seen: true, choice: 'dismissed' });
    closeWelcome();
  };
  document.addEventListener('keydown', welcomeCloseHandler, true);
}

function bindButtons() {
  const buttons = document.querySelectorAll('.pt-restart');
  buttons.forEach(btn => {
    btn.classList.remove('pt-hidden');
    btn.addEventListener('click', () => { closeWelcome(); start(); });
  });

  const startBtn = document.getElementById('pt-welcome-start');
  if (startBtn) startBtn.addEventListener('click', () => {
    writePref({ seen: true, choice: 'explore', skipped: false });
    closeWelcome();
    start();
  });
  const dismissBtn = document.getElementById('pt-welcome-dismiss');
  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    writePref({ seen: true, choice: 'dismissed' });
    closeWelcome();
  });
}

async function init() {
  try {
    const mod = await import(DRIVER_URL);
    driverFactory = mod && typeof mod.driver === 'function' ? mod.driver : null;
  } catch (e) {
    driverFactory = null;
  }

  if (!driverFactory) {
    document.querySelectorAll('.pt-restart').forEach(btn => btn.classList.add('pt-hidden'));
    const modal = document.getElementById('platform-tour-welcome');
    if (modal) modal.classList.add('pt-hidden');
    return;
  }

  bindButtons();
  if (!readPref().seen) {
    setTimeout(() => { if (!tour) openWelcome(); }, 700);
  }
}

window.AlfaPlatformTour = Object.freeze({
  start,
  getPreference: readPref,
  openWelcome,
  isAvailable: () => !!driverFactory,
  stepIds: STEPS.map(s => s.id),
  steps: STEPS,
  welcome: WELCOME,
  planSteps
});

init();
