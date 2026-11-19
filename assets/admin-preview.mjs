import { mentorDescription } from './mentor-feed-model.mjs?v=1';
// An inert, opaque-origin snapshot. Never boot auth or the app inside the frame.
export function previewCanOpen(tiers, page, role) {
  if (role === 'landing') return false;
  if (page === 'portfoy') return true;
  const need = tiers[page];
  return need === 'free' || (need === 'ref' && role === 'premium');
}
export function resultProjection(records) {
  return (Array.isArray(records) ? records : [])
    .filter(r => Number.isFinite(r.r) && Number.isFinite(r.date) && typeof r.coin === 'string')
    .map(r => ({ coin: r.coin, r: r.r, date: r.date }));
}
const labels = { landing: 'Giriş sayfası', free: 'Yeni üye', premium: 'Premium üye' };
function admin() {
  try { return !!(AUTH.user?.id && SITE.admin === true && window.siteIsAdmin?.()); } catch { return false; }
}
const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
let dialog, frame, roleSelect, pageSelect, status, source, generation = 0;
const tiers = () => typeof PAGE_TIER !== 'undefined' ? PAGE_TIER : {};
function close() {
  generation++;
  if (frame) frame.srcdoc = '';
  dialog?.close();
}
function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,base,iframe,object,embed,meta,link:not([rel="stylesheet"]),audio,video,source').forEach(n => n.remove());
  for (const n of doc.querySelectorAll('*')) {
    const nav = n.getAttribute('href')?.match(/^\?page=([\w-]+)$/)?.[1];
    if (nav) n.setAttribute('data-preview-page', nav);
    for (const a of [...n.attributes]) {
      if (/^on/i.test(a.name) || ['srcdoc','action','formaction','target','ping','srcset'].includes(a.name)) n.removeAttribute(a.name);
    }
    if (n.hasAttribute('href') && !n.matches('link[rel="stylesheet"]')) n.removeAttribute('href');
    if (n.hasAttribute('src') || n.matches('link[href]')) {
      const attr = n.hasAttribute('src') ? 'src' : 'href';
      try {
        const url = new URL(n.getAttribute(attr), location.origin);
        if (url.origin !== location.origin || !url.pathname.startsWith('/assets/')) n.removeAttribute(attr);
        else n.setAttribute(attr, url.href);
      } catch { n.removeAttribute(attr); }
    }
    if (n.matches('input,textarea,select,button')) n.disabled = true;
    if (n.matches('input,textarea')) { n.value = ''; n.removeAttribute('value'); n.textContent = ''; }
  }
  // These must never be copied from the live administrator DOM.
  doc.querySelectorAll('#auth-gate,dialog,#acc-admin-panel,#inf-admin,#home-sec-admin,#home-diary-link,#ch-admin-controls').forEach(n => n.remove());
  const base = doc.createElement('base'); base.href = location.origin + '/'; doc.head.prepend(base);
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = `default-src 'none'; script-src 'none'; connect-src 'none'; style-src 'unsafe-inline' ${location.origin} https://fonts.googleapis.com; font-src ${location.origin} https://fonts.gstatic.com; img-src ${location.origin} data:; frame-src 'none'; form-action 'none'; base-uri ${location.origin}`;
  doc.head.prepend(csp);
  const style = doc.createElement('style');
  style.textContent = 'a,button,input,select,textarea{pointer-events:none!important}html{scroll-behavior:auto!important}.preview-note{padding:16px;margin:16px 0;border:1px dashed #687395;border-radius:12px;color:var(--text);background:var(--card);font-size:13px;line-height:1.7}';
  doc.head.append(style);
  return doc;
}
function note(doc, target, text) {
  const n = doc.createElement('p'); n.className = 'preview-note'; n.textContent = text; target?.prepend(n);
}
async function render() {
  const run = ++generation, role = roleSelect.value, page = pageSelect.value;
  frame.srcdoc = '';
  if (!admin()) { close(); return; }
  status.textContent = 'Önizleme hazırlanıyor…';
  try {
    if (!source) {
      const response = await fetch('/', { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('source');
      source = await response.text();
    }
    if (run !== generation || !admin()) return;
    const doc = sanitize(source), premium = role === 'premium';
    doc.body.classList.toggle('landed', role === 'landing');
    doc.getElementById('landing')?.classList.toggle('open', role === 'landing');
    doc.body.dataset.page = page;
    doc.querySelectorAll('[id^="page-"]').forEach(n => n.classList.toggle('hidden', n.id !== 'page-' + page || role === 'landing'));
    for (const a of doc.querySelectorAll('[data-nav],[data-mnav],.home-card,[data-preview-page]')) {
      const raw = a.getAttribute('data-mnav') || a.id.replace(/^(tab|mnav)-/, '');
      const target = a.getAttribute('data-preview-page') || raw;
      if (tiers()[target]) a.style.display = previewCanOpen(tiers(), target, role) ? '' : 'none';
    }
    doc.querySelectorAll('[data-ref-only],#home-sec-premium').forEach(n => { n.style.display = premium ? '' : 'none'; });
    doc.querySelectorAll('.home-premium,#tier-banner').forEach(n => { n.style.display = premium ? 'none' : ''; });
    doc.querySelectorAll('.nav-drop').forEach(n => {
      const links = [...n.querySelectorAll('.drop-menu .nav-link')];
      const privateMenu = ['app.trader','app.news'].includes(n.querySelector('.drop-btn')?.getAttribute('data-i18n'));
      if ((!premium && privateMenu) || (links.length && links.every(a => a.style.display === 'none'))) n.style.display = 'none';
    });
    doc.querySelectorAll('[data-preview-page]').forEach(n => n.classList.toggle('active', n.getAttribute('data-preview-page') === page));
    const login = doc.getElementById('nav-login-app'); if (login) login.style.display = 'none';
    const ticker = doc.getElementById('ticker-text'); if (ticker) ticker.textContent = 'Canlı veri bu önizlemede yüklenmez.';
    doc.querySelectorAll('.mnav-group').forEach(n => {
      let next = n.nextElementSibling, visible = false;
      while (next && !next.classList.contains('mnav-group')) {
        if (next.classList.contains('mnav-link') && next.style.display !== 'none') visible = true;
        next = next.nextElementSibling;
      }
      if (!visible) n.style.display = 'none';
    });
    for (const id of ['tab-erisim','mnav-erisim']) { const n = doc.getElementById(id); if (n) n.style.display = premium ? 'none' : ''; }
    const name = doc.getElementById('user-name'); if (name) name.textContent = premium ? 'Örnek premium üye' : 'Örnek yeni üye';
    doc.getElementById('user-badge')?.classList.remove('hidden');
    const badge = doc.getElementById('home-status'); if (badge) badge.textContent = premium ? 'Premium' : 'Ücretsiz';
    const sub = doc.querySelector('.home-sub');
    if (sub) sub.textContent = premium ? 'Premium erişim açık — tüm araçlar kullanılabilir.' : 'Temel araçlar ve paylaşılan portföy özeti. Premium, borsanı bağlayınca ücretsiz açılır.';
    const target = doc.getElementById('page-' + page);
    if (role !== 'landing') {
      note(doc, target, 'Salt okunur tasarım önizlemesi. Kişisel kayıtlar, ders hakları, ödeme/başvuru durumları ve etkileşimli araçlar yüklenmez. Bu ekran gerçek kullanıcı oturumu veya uçtan uca yetki testi değildir.');
      if (page === 'alfatrading') {
        // Free mode requests ONLY the server's results endpoint and projects again.
        const response = await window.siteFetch('/api/ai?mentorTrades=1' + (premium ? '' : '&results=1'), { cache: 'no-store' });
        if (!response.ok) throw new Error('feed');
        const data = await response.json();
        const host = doc.createElement('section'); host.className = 'mentor-trades';
        target?.querySelectorAll('.at-filters,#at-list,.at-list,#at-feed').forEach(n => n.remove());
        doc.body.dataset.mentorAccess = premium ? 'premium' : 'results';
        const records = premium ? (Array.isArray(data.records) ? data.records : []) : resultProjection(data.records);
        let imageBudget = 8;
        for (const r of records) {
          if (run !== generation || !admin()) return;
          const card = doc.createElement('article'); card.className = 'mentor-trade';
          const title = doc.createElement('h3'); title.textContent = r.coin + (Number.isFinite(r.r) ? ' · ' + (r.r > 0 ? '+' : '') + r.r + 'R' : '');
          const date = doc.createElement('small'); date.textContent = new Date(r.date * 1000).toLocaleString('tr-TR');
          card.append(title, date);
          if (premium) {
            const description = doc.createElement('p'); description.textContent = mentorDescription(r); description.className = 'mentor-trade-text'; card.append(description);
            for (let i = 0; i < Math.min(2, r.imageCount || 0); i++) {
              if (run !== generation || !admin()) return;
              if (imageBudget <= 0) { note(doc, card, 'Önizlemede ilk 8 grafik yüklenir. Diğer görseller gerçek premium akışta açılır.'); break; }
              imageBudget--;
              try {
                const image = await window.siteFetch('/api/ai?mentorTrades=1&image=' + encodeURIComponent(r.id) + '&index=' + i, { cache: 'no-store' });
                if (!image.ok || !/^image\/(jpeg|png|webp)$/.test(image.headers.get('content-type')?.split(';')[0] || '')) throw new Error('image');
                const blob = await image.blob();
                if (blob.size > 8 * 1024 * 1024) throw new Error('size');
                const url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
                const img = doc.createElement('img'); img.src = url; img.alt = r.coin + ' paylaşım grafiği'; img.style.maxWidth = '100%'; card.append(img);
              } catch { note(doc, card, 'Grafik yüklenemedi.'); }
            }
          }
          host.append(card);
        }
        if (!records.length) note(doc, host, 'Görüntülenecek paylaşım yok.');
        target?.append(host);
      }
    }
    if (run !== generation || !admin() || !dialog.open) return;
    frame.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
    status.textContent = labels[role] + ' · Gerçek hesabın değişmedi. Sayfayı üstteki listeden seç.';
  } catch {
    if (run === generation) status.textContent = 'Önizleme yüklenemedi. Kapatıp tekrar dene; admin oturumun değişmedi.';
  }
}
function populatePages() {
  const previous = pageSelect.value;
  pageSelect.replaceChildren();
  for (const page of Object.keys(tiers()).filter(p => previewCanOpen(tiers(), p, roleSelect.value))) {
    const text = document.getElementById('tab-' + page)?.textContent?.trim() || document.getElementById('mnav-' + page)?.textContent?.trim() || page;
    const option = el('option', text); option.value = page; pageSelect.append(option);
  }
  pageSelect.disabled = roleSelect.value === 'landing';
  pageSelect.value = [...pageSelect.options].some(o => o.value === previous) ? previous : 'home';
}
function open() {
  if (!admin()) return;
  if (!dialog) {
    dialog = el('dialog'); dialog.className = 'admin-preview'; dialog.setAttribute('aria-label', 'Görünüm önizleme');
    const head = el('header'), title = el('strong', 'Görünüm önizleme');
    roleSelect = el('select'); roleSelect.setAttribute('aria-label', 'Üye görünümü');
    for (const [value, label] of Object.entries(labels)) { const option = el('option', label); option.value = value; roleSelect.append(option); }
    pageSelect = el('select'); pageSelect.setAttribute('aria-label', 'Önizleme sayfası');
    const exit = el('button', 'Yöneticiye dön ×'); exit.type = 'button'; exit.onclick = close;
    head.append(title, roleSelect, pageSelect, exit);
    status = el('p'); status.setAttribute('role','status');
    frame = el('iframe'); frame.title = 'Salt okunur site görünümü'; frame.setAttribute('sandbox', ''); frame.referrerPolicy = 'no-referrer';
    dialog.append(head, status, frame); document.body.append(dialog);
    dialog.addEventListener('close', () => { generation++; frame.srcdoc = ''; });
    roleSelect.onchange = () => { populatePages(); render(); };
    pageSelect.onchange = render;
  }
  populatePages(); dialog.showModal(); render();
}
function sync() {
  const host = document.querySelector('#acc-admin-panel .acc-crm-head-actions') || document.getElementById('acc-admin-refresh')?.parentElement;
  let button = document.getElementById('admin-preview-open');
  if (!button && host) {
    button = el('button', '👁 Görünüm önizleme'); button.id = 'admin-preview-open'; button.className = 'btn'; button.type = 'button'; button.onclick = open; host.prepend(button);
  }
  if (button) button.hidden = !admin();
  if (!admin() && dialog?.open) close();
}
new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class','data-page'] });
window.addEventListener('focus', sync);
window.addEventListener('pagehide', close);
sync();
