import { isEducationArticle } from './magazine-articles.mjs?v=1';
import { speechControls } from './article-speech.mjs?v=1';
import { pdfViewer } from './edu-pdf.mjs?v=1';
const node = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
const selected = { home: null, edu: null }, expanded = { home: false, edu: false };
let eduLoading = null;
const records = { home: [], edu: [] };
let eduFetchedAt = 0;
function render(scope, entries, force = false) {
  const root = document.getElementById(scope === 'home' ? 'home-mag-article-reader' : 'edu-magazine-reading');
  if (!root) return;
  const list = (entries || []).filter(e => scope !== 'edu' || isEducationArticle(e)).slice().sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  records[scope] = list;
  const signature = JSON.stringify(list.map(e => [e.id, e.title, e.body, e.images, e.pdf, e.pdfLink, e.pdfName]));
  if (!force && root.dataset.signature === signature) return;
  root.dataset.signature = signature; root.replaceChildren(); root.hidden = !list.length;
  if (!list.length) return;
  const entry = list.find(e => e.id === selected[scope]) || list[0]; selected[scope] = entry.id;
  root.append(node('span', scope === 'edu' ? 'ALFA EDU · DERGİDEN EĞİTİM YAZILARI' : 'KESİNTİSİZ OKUMA · ALFA DERGİ', 'daily-kicker'));
  const picker = document.createElement('select'); picker.setAttribute('aria-label', 'Okunacak yazıyı seç');
  for (const item of list) { const opt = node('option', item.title); opt.value = item.id; picker.append(opt); }
  picker.value = entry.id; picker.onchange = () => { selected[scope] = picker.value; expanded[scope] = false; render(scope, records[scope], true); };
  root.append(picker, node('h2', entry.title));
  const meta = node('p', 'Trader Ahmet · ' + new Date(entry.publishedAt).toLocaleDateString('tr-TR') + ' · ' + Math.max(1, Math.ceil(String(entry.body || '').split(/\s+/).length / 180)) + ' dk okuma', 'hint');
  root.append(meta, speechControls(entry.body, entry.title));
  if (entry.sourceParts?.length > 1) root.append(node('p', 'Telegram’daki ' + entry.sourceParts.length + ' parça, tek yazıda birleştirildi.', 'hint'));
  if (entry.pdfLink && !entry.pdf) {
    const pdfLink = node('a', '📄 ' + (entry.pdfName || 'Eğitim PDF’si') + ' · Telegram’da aç ↗', 'btn');
    pdfLink.href = entry.pdfLink; pdfLink.target = '_blank'; pdfLink.rel = 'noopener noreferrer';
    root.append(pdfLink);
  }
  const toggle = node('button', expanded[scope] ? 'Yazıyı daralt ↑' : 'Tamamını burada oku ↓', 'btn solid'); toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(expanded[scope]));
  root.append(toggle);
  const article = node('article', null, 'article-prose');
  function paintArticle() {
  article.replaceChildren();
  if (expanded[scope]) {
    for (const url of entry.images || []) {
      const image = document.createElement('img'); image.src = url; image.alt = entry.title + ' · görsel'; image.loading = 'lazy'; article.append(image);
    }
    for (const paragraph of String(entry.body || '').split(/\n\s*\n/)) article.append(node('p', paragraph));
    const pdf = pdfViewer(entry.pdf); if (pdf) article.append(pdf);
    if (/^https:\/\/t\.me\/alfakasim\/977\/\d+$/.test(entry.sourceLink || '')) {
      const link = node('a', 'Telegram’daki kaynağı aç ↗'); link.href = entry.sourceLink; link.target = '_blank'; link.rel = 'noopener noreferrer'; article.append(link);
    }
  } else article.append(node('p', String(entry.body || '').slice(0, 420) + (String(entry.body || '').length > 420 ? '…' : '')));
  }
  toggle.onclick = () => {
    expanded[scope] = !expanded[scope]; toggle.textContent = expanded[scope] ? 'Yazıyı daralt ↑' : 'Tamamını burada oku ↓';
    toggle.setAttribute('aria-expanded', String(expanded[scope])); paintArticle();
  };
  paintArticle();
  root.append(article);
}
async function loadEdu() {
  if (Date.now() - eduFetchedAt < 60000) return render('edu', records.edu);
  if (eduLoading) return eduLoading;
  eduLoading = (async () => {
    const root = document.getElementById('edu-magazine-reading');
    try {
      const r = await fetch('/api/edu-shared?kind=news', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const data = await r.json();
      if (!r.ok || !data.ok || !data.data) throw new Error('unavailable');
      eduFetchedAt = Date.now(); render('edu', data.data.entries || []);
    } catch { if (root && !records.edu.length) { root.hidden = false; root.textContent = 'Eğitim yazıları yüklenemedi. Sayfayı yenileyip tekrar dene.'; } }
  })().finally(() => { eduLoading = null; });
  return eduLoading;
}
window.MagazineReading = {
  renderHome(entries) { render('home', entries); },
  async openHome(id) {
    if (!records.home.some(e => e.id === id) && typeof window.loadHomeMagazine === 'function') { const data = await window.loadHomeMagazine(); records.home = data?.entries || []; }
    selected.home = id; expanded.home = true; render('home', records.home, true); document.getElementById('home-mag-article-reader')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  async openEdu(id) { if (typeof showPage === 'function') showPage('egitim'); await loadEdu(); selected.edu = id; expanded.edu = true; render('edu', records.edu, true); document.getElementById('edu-magazine-reading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  loadEdu
};
if (typeof homeMagData !== 'undefined' && homeMagData) render('home', homeMagData.entries);
if (document.body.dataset.page === 'egitim') loadEdu();
if (document.body.dataset.page === 'news' && typeof renderNews === 'function') renderNews();
new MutationObserver(() => { if (document.body.dataset.page === 'egitim') loadEdu(); }).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
