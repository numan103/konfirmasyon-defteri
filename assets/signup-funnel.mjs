// Alfa Traders — ücretsiz kayıt hunisi ölçümü (gizlilik güvenli).
// Mevcut /api/analytics tıklama akışını kullanır; e-posta, şifre, token veya
// kullanıcı kimliği göndermez. Yalnızca sabit adım adları yazılır.
//
// Yeni oturum başına en fazla 5 olay üretilir; aynı adım tekrar tekrar sayılmaz.
// Adımlar: landing_cta → auth_open → signup_submit → confirm_click → first_login

const FUNNEL_KEY = 'at_signup_funnel_v1';
const LOGIN_KEY = 'at_signup_funnel_login_v1';
const STEPS = {
  landing_cta: 'Kayıt CTA',
  auth_open: 'Giriş penceresi açıldı',
  signup_submit: 'Kayıt formu gönderildi',
  confirm_click: 'Onay bağlantısı açıldı',
  first_login: 'İlk giriş',
};

const seen = new Set();
try {
  const saved = sessionStorage.getItem(FUNNEL_KEY);
  if (saved) JSON.parse(saved).forEach((step) => { if (STEPS[step]) seen.add(step); });
} catch (e) {}

function record(step) {
  const label = STEPS[step];
  const track = window.anaTrack;
  if (!label || seen.has(step) || !track || !Array.isArray(track.clicks)) return;
  seen.add(step);
  try { sessionStorage.setItem(FUNNEL_KEY, JSON.stringify([...seen])); } catch (e) {}
  track.clicks.push({
    t: new Date().toISOString(),
    kind: 'cta',
    label: label,
    url: 'funnel:' + step,
    page: track.curPage || '',
  });
  if (track.clicks.length > 60) track.clicks = track.clicks.slice(-60);
  try { window.anaFlushSoon?.(); } catch (e) {}
}

// Kayıt CTA'sı ve kayıt formu gönderimi.
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return;
  if (target.closest('#hero-register, [data-growth-register], #cta-register, .growth-primary')) {
    record('landing_cta');
  }
  if (target.closest('#au-submit')) {
    const registering = document.querySelector('#tab-register.on, #f-name:not(.hidden)');
    if (registering) record('signup_submit');
  }
}, true);

// Auth penceresi açıldığında (hero CTA, nav, modal tab fark etmez).
const gate = document.getElementById('auth-gate');
if (gate) {
  const check = () => { if (gate.classList.contains('open')) record('auth_open'); };
  check();
  if (typeof MutationObserver === 'function') {
    new MutationObserver(check).observe(gate, { attributes: true, attributeFilter: ['class'] });
  }
}

// E-posta onay bağlantısıyla dönüş. URL/token okunmaz, yalnızca sabit adım yazılır.
try {
  const url = new URL(location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const type = (url.searchParams.get('type') || hashParams.get('type') || '').toLowerCase();
  const verifyPath = /\/auth\/v1\/(verify|callback)/.test(url.pathname);
  const authParam = ['token_hash', 'token', 'code', 'access_token']
    .some((key) => url.searchParams.has(key) || hashParams.has(key));
  if ((verifyPath || authParam) && (!type || ['signup', 'email', 'invite', 'magiclink'].includes(type))) {
    record('confirm_click');
  }
} catch (e) {}

// Kayıt akışı başlamışsa ilk oturum açılmasını işaretle.
try {
  if (typeof AUTH !== 'undefined' && AUTH?.client?.auth?.onAuthStateChange) {
    AUTH.client.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_IN') return;
      if (!seen.has('signup_submit') && !seen.has('confirm_click')) return;
      let already = false;
      try {
        already = !!sessionStorage.getItem(LOGIN_KEY);
        if (!already) sessionStorage.setItem(LOGIN_KEY, '1');
      } catch (e) { already = true; }
      if (!already) record('first_login');
    });
  }
} catch (e) {}
