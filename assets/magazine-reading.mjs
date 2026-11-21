import { isEducationArticle } from './magazine-articles.mjs?v=2';
import { speechControls } from './article-speech.mjs?v=1';
import { pdfViewer } from './edu-pdf.mjs?v=1';
// Kesintisiz okuma ana sayfadan kaldırıldı. Bu modül yalnızca Alfa Edu eğitim yazılarını okutur.
const node = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
const ROOT_ID = 'edu-magazine-reading';
let selectedId = null, expanded = false, loading = null, fetchedAt = 0;
let records = [];

function render(force = false) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const list = records.filter(isEducationArticle).slice().sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const signature = JSON.stringify(list.map(e => [e.id, e.title, e.body, e.images, e.pdf, e.pdfName]));
  if (!force && root.dataset.signature === signature) return;
  root.dataset.signature = signature; root.replaceChildren(); root.hidden = !list.length;
  if (!list.length) return;
  const entry = list.find(e => e.id === selectedId) || list[0]; selectedId = entry.id;
  root.append(node('span', 'ALFA EDU · DERGİDEN EĞİTİM YAZILARI', 'daily-kicker'));
  const picker = document.createElement('select'); picker.setAttribute('aria-label', 'Okunacak yazıyı seç');
  for (const item of list) { const opt = node('option', item.title); opt.value = item.id; picker.append(opt); }
  picker.value = entry.id; picker.onchange = () => { selectedId = picker.value; expanded = false; render(true); };
  root.append(picker, node('h2', entry.title));
  const meta = node('p', 'Trader Ahmet · ' + new Date(entry.publishedAt).toLocaleDateString('tr-TR') + ' · ' + Math.max(1, Math.ceil(String(entry.body || '').split(/\s+/).length / 180)) + ' dk okuma', 'hint');
  root.append(meta, speechControls(entry.body, entry.title));
  if (entry.sourceParts?.length > 1) root.append(node('p', 'Uzun paylaşımın ' + entry.sourceParts.length + ' parçası tek yazıda birleştirildi.', 'hint'));
  const toggle = node('button', expanded ? 'Yazıyı daralt ↑' : 'Tamamını burada oku ↓', 'btn solid'); toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(expanded));
  root.append(toggle);
  const article = node('article', null, 'article-prose');
  function paintArticle() {
    article.replaceChildren();
    if (expanded) {
      for (const url of entry.images || []) {
        const image = document.createElement('img'); image.src = url; image.alt = entry.title + ' · görsel'; image.loading = 'lazy'; article.append(image);
      }
      for (const paragraph of String(entry.body || '').split(/\n\s*\n/)) article.append(node('p', paragraph));
      const pdf = pdfViewer(entry.pdf); if (pdf) article.append(pdf);
    } else article.append(node('p', String(entry.body || '').slice(0, 420) + (String(entry.body || '').length > 420 ? '…' : '')));
  }
  toggle.onclick = () => {
    expanded = !expanded; toggle.textContent = expanded ? 'Yazıyı daralt ↑' : 'Tamamını burada oku ↓';
    toggle.setAttribute('aria-expanded', String(expanded)); paintArticle();
  };
  paintArticle();
  root.append(article);
}

async function loadEdu() {
  if (Date.now() - fetchedAt < 60000) return render();
  if (loading) return loading;
  loading = (async () => {
    const root = document.getElementById(ROOT_ID);
    try {
      const r = await fetch('/api/edu-shared?kind=news', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const data = await r.json();
      if (!r.ok || !data.ok || !data.data) throw new Error('unavailable');
      records = data.data.entries || []; fetchedAt = Date.now(); render();
    } catch { if (root && !records.length) { root.hidden = false; root.textContent = 'Eğitim yazıları yüklenemedi. Sayfayı yenileyip tekrar dene.'; } }
  })().finally(() => { loading = null; });
  return loading;
}

window.MagazineReading = {
  async openEdu(id) {
    if (typeof showPage === 'function') showPage('egitim');
    await loadEdu(); selectedId = id; expanded = true; render(true);
    document.getElementById(ROOT_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  loadEdu
};
if (document.body.dataset.page === 'egitim') loadEdu();
if (document.body.dataset.page === 'news' && typeof renderNews === 'function') renderNews();
new MutationObserver(() => { if (document.body.dataset.page === 'egitim') loadEdu(); }).observe(document.body, { attributes: true, attributeFilter: ['data-page'] });
