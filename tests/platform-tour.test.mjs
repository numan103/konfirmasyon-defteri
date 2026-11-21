import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const moduleSrc = fs.readFileSync(new URL('assets/platform-tour.mjs', root), 'utf8');
const tourCss = fs.readFileSync(new URL('assets/platform-tour.css', root), 'utf8');
const sw = fs.readFileSync(new URL('sw.js', root), 'utf8');
const vendorJs = fs.readFileSync(new URL('assets/vendor/driver/driver.js.mjs', root), 'utf8');
const vendorCss = fs.readFileSync(new URL('assets/vendor/driver/driver.css', root), 'utf8');
const license = fs.readFileSync(new URL('assets/vendor/driver/LICENSE', root), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'));

const tierMatch = html.match(/const PAGE_TIER = (\{[\s\S]*?\});/);
assert.ok(tierMatch, 'PAGE_TIER bulunamadı');
const PAGE_TIER = Function('return ' + tierMatch[1])();

test('Driver.js yerel dependency ve vendor dosyalarıyla geliyor', () => {
  assert.equal(pkg.dependencies['driver.js'], '^1.14.0');
  assert.ok(vendorJs.includes('driver-popover'), 'ESM dağıtımı eksik');
  assert.ok(vendorJs.includes('export{Rr as driver}'), 'driver exportu eksik');
  assert.ok(vendorCss.includes('.driver-popover'));
  assert.ok(license.includes('MIT License'));
  assert.ok(moduleSrc.includes("driver.js.mjs?v=2"));
  assert.ok(html.includes('/assets/vendor/driver/driver.css?v=2'));
  assert.ok(html.includes('/assets/platform-tour.css?v=2'));
  assert.ok(html.includes('/assets/platform-tour.mjs?v=2'));
});

test('karşılama mesajı ve butonları tam metinle mevcut', () => {
  const modal = html.slice(html.indexOf('<div class="pt-welcome'), html.indexOf('</body>'));
  for (const text of [
    "ALFA TRADERS'a Hoş Geldin!",
    'Grafiklerden işlem günlüğüne, portföy takibinden eğitimlere kadar platformu birlikte keşfedelim.',
    'Platformu Keşfet', 'Şimdi Değil'
  ]) assert.ok(modal.includes(text), text);
  assert.ok(modal.includes('id="platform-tour-welcome"'));
  assert.ok(modal.includes('aria-modal="true"'));
  assert.ok(moduleSrc.includes("ALFA TRADERS'a Hoş Geldin!"));
  assert.ok(moduleSrc.includes('Grafiklerden işlem günlüğüne, portföy takibinden eğitimlere kadar platformu birlikte keşfedelim.'));
});

test('tur yeniden başlatma düğmeleri landing, masaüstü ve mobil menüde', () => {
  for (const id of ['platform-tour-btn-landing', 'platform-tour-btn', 'platform-tour-btn-mobile']) {
    assert.ok(html.includes('id="' + id + '"'), id);
    assert.ok(new RegExp('id="' + id + '"[^>]*>Platform Turunu Başlat').test(html), id + ' metni');
  }
  assert.equal((html.match(/Platform Turunu Başlat/g) || []).length, 3);
  assert.ok(tourCss.includes('.pt-restart'));
  assert.ok(tourCss.includes('.pt-hidden'));
});

test('adım sırası, açıklamalar ve gerçek menü seçicileri sabit', () => {
  const expected = [
    ['home', 'Ana Sayfa', 'Piyasa haberleri ve günlük araçlar.', '#nav-home', '[data-mnav="home"]'],
    ['alfacharts', 'ALFA Charts', 'Canlı grafikler ve teknik analiz.', '#tab-alfacharts', '#mnav-alfacharts'],
    ['defter', 'İşlem Defteri', 'İşlemleri kaydetme ve checklist.', '#tab-defter', '#mnav-defter'],
    ['review', 'Review', 'İşlem performansını değerlendirme.', '#tab-review', '#mnav-review'],
    ['portfoy', 'Portföyüm', 'Kişisel portföy takibi.', '#tab-portfoy-mine', '#mnav-portfoy-mine'],
    ['eduplans', 'ALFA Edu', 'Eğitim içerikleri ve paketleri.', '#tab-eduplans', '[data-mnav="eduplans"]']
  ];
  let cursor = 0;
  for (const [id, title, desc, desktopSel, mobileSel] of expected) {
    const at = moduleSrc.indexOf("id: '" + id + "'", cursor);
    assert.ok(at > cursor, id + ' sırası');
    const block = moduleSrc.slice(at, moduleSrc.indexOf('  },', at));
    for (const text of [title, desc, desktopSel, mobileSel]) assert.ok(block.includes(text), id + ' / ' + text);
    cursor = at;
  }
});

test('Geri, İleri, Atla, Bitir ve koyu/altın tema stilleri', () => {
  for (const text of ["nextBtnText: 'İleri'", "prevBtnText: 'Geri'", "doneBtnText: 'Bitir'", "closeBtnLabel: 'Atla'"]) {
    assert.ok(moduleSrc.includes(text), text);
  }
  assert.ok(moduleSrc.includes("popover.closeButton.textContent = 'Atla'"));
  assert.ok(tourCss.includes('linear-gradient(135deg, #fbbf24, #f59e0b)'));
  assert.ok(tourCss.includes('--card, #161832'));
  assert.ok(tourCss.includes('html[data-theme="light"] .alfa-tour-popover'));
  assert.ok(tourCss.includes('@media (max-width: 680px)'));
  assert.ok(tourCss.includes('#platform-tour-btn-mobile'));
  assert.ok(tourCss.includes('body.pt-tour-active .driver-active-element'));
  assert.ok(moduleSrc.includes("document.body.classList.add('pt-tour-active')"));
});

test('tercihler localStorage üzerinde saklanıyor', () => {
  assert.ok(moduleSrc.includes("const STORAGE_KEY = 'alfa.platformTour.v1'"));
  assert.ok(moduleSrc.includes('localStorage.setItem(STORAGE_KEY, JSON.stringify(next))'));
  assert.ok(moduleSrc.includes("writePref({ seen: true, choice: 'dismissed' })"));
  assert.ok(moduleSrc.includes("writePref({ seen: true, choice: 'explore'"));
  assert.ok(moduleSrc.includes('writePref({ completed: true'));
  assert.ok(moduleSrc.includes('writePref({ skipped: true })'));
});

test('Driver yüklenemezse site normal kalır ve düğmeler gizlenir', () => {
  const init = moduleSrc.slice(moduleSrc.indexOf('async function init()'));
  assert.ok(init.includes('try {'));
  assert.ok(init.includes('await import(DRIVER_URL)'));
  assert.ok(init.includes('} catch (e) {'));
  assert.ok(init.includes('if (!driverFactory) {'));
  assert.ok(init.includes("forEach(btn => btn.classList.add('pt-hidden'))"));
});

test('landing kapatılıyor, mobil çekmece açılıp kapanıyor, mevcut rehber korunuyor', () => {
  assert.ok(moduleSrc.includes("document.body.classList.contains('landed')"));
  assert.ok(moduleSrc.includes("typeof hideLanding === 'function') hideLanding()"));
  assert.ok(moduleSrc.includes('suppressLanding()'));
  assert.ok(moduleSrc.includes('window.showLanding = function () {}'));
  assert.ok(moduleSrc.includes('restoreLanding()'));
  assert.ok(moduleSrc.includes('openMobileDrawer()'));
  assert.ok(moduleSrc.includes("getElementById('nav-mobile-close')"));
  assert.ok(html.includes('id="home-guide"'));
  assert.ok(html.includes('Başlangıç rehberi'));
  assert.ok(html.includes('id="nav-login"'));
  assert.ok(html.includes('id="nav-login-app"'));
  assert.ok(html.includes('id="hero-register"'));
  assert.ok(html.includes('id="hero-login"'));
});

test('cache/build kimliği yeni tur dosyaları için güncellendi', () => {
  assert.ok(sw.includes("const CACHE = 'alfa-v139-platform-tour'"));
  assert.ok(sw.includes("const BUILD_ID = 'b200-platform-tour'"));
  assert.ok(!sw.includes('alfa-v137-portfolio-form-light'));
});

// Modülü Node içinde, minimal DOM stub'larıyla yükleyip gerçek planSteps
// fonksiyonunu farklı roller ve viewport'larda çalıştırıyoruz.
function selectorExists(sel) {
  if (sel.startsWith('#')) return html.includes('id="' + sel.slice(1) + '"');
  return html.includes(sel.slice(1, -1));
}

function canOpenFor(role) {
  return page => {
    if (page === 'portfoy') return true; // siteCanOpen özel durumu
    const need = PAGE_TIER[page] || 'free';
    if (need === 'free') return !(page === 'eduplans' && role === 'admin'); // applyTierUi
    if (need === 'admin') return role === 'admin';
    return role === 'ref' || role === 'admin';
  };
}

const roleExpectations = {
  guest: ['home', 'portfoy', 'eduplans'],
  free: ['home', 'portfoy', 'eduplans'],
  ref: ['home', 'defter', 'review', 'portfoy', 'eduplans'],
  admin: ['home', 'alfacharts', 'defter', 'review', 'portfoy']
};

test('misafir, ücretsiz, referans ve admin için erişilebilir adımlar doğru', async () => {
  global.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener() {}, removeEventListener() {}
  };
  global.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {}, removeEventListener() {},
    body: { classList: { contains: () => false } }
  };
  global.localStorage = { getItem: () => null, setItem() {} };

  const apiMod = await import('../assets/platform-tour.mjs');
  const api = global.window.AlfaPlatformTour;
  assert.ok(api, 'window.AlfaPlatformTour tanımlanmalı');
  assert.equal(api.isAvailable(), false, 'Node içinde vendor import başarısız olmalı (fallback)');
  assert.deepEqual(api.stepIds, ['home', 'alfacharts', 'defter', 'review', 'portfoy', 'eduplans']);

  for (const mobile of [false, true]) {
    global.window.matchMedia = () => ({ matches: mobile });
    for (const [role, expected] of Object.entries(roleExpectations)) {
      const drop = {
        open: false,
        classList: {
          contains: () => drop.open,
          add: () => { drop.open = true; },
          remove: () => { drop.open = false; }
        }
      };
      // Varsayılan reveal (gerçek revealAncestors) kullanılıyor: masaüstünde
      // kapalı dropdown'ı açmalı, mobilde açmamalı.
      const planned = api.planSteps({
        mobile,
        canOpen: canOpenFor(role),
        resolve: (def, mob) => selectorExists(mob ? def.mobile : def.desktop)
          ? { id: def.id, closest: () => drop }
          : null,
        visible: () => true
      });
      assert.deepEqual(planned.map(p => p.def.id), expected, role + ' / ' + (mobile ? 'mobil' : 'masaüstü'));
      assert.equal(drop.open, !mobile, 'dropdown yalnızca masaüstünde geçici açılır');
    }
  }
});

test('görünmeyen butonların adımları atlanıyor', async () => {
  const api = global.window && global.window.AlfaPlatformTour;
  assert.ok(api, 'önceki test modülü yüklemeli');
  const planned = api.planSteps({
    mobile: false,
    canOpen: () => true,
    resolve: def => def.id === 'defter' ? null : { id: def.id },
    reveal: () => {},
    visible: el => el.id !== 'review'
  });
  assert.deepEqual(planned.map(p => p.def.id), ['home', 'alfacharts', 'portfoy', 'eduplans']);
});
