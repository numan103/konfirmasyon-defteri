import { mentorCategory, mentorDescription } from './mentor-feed-model.mjs?v=1';
import { renderMentorCurve, signedR } from './mentor-curve.mjs?v=3';
const API = '/api/ai?mentorTrades=1';
const page = document.getElementById('page-alfatrading');
const root = document.createElement('section'); root.className = 'mentor-trades'; root.hidden = true;
page?.insertBefore(root, page.querySelector('.at-filters') || page.querySelector('#at-feed') || null);
let owner = '', generation = 0, loading = false, lastLoad = 0, index = 0, urls = [];
let category = 'all', coin = '', observers = [], imageQueue = [], inFlight = 0;
const labels = { all: 'Tümü', trade: 'İşlemler', bias: 'Bias görüşleri', result: 'Sonuçlar', post: 'Analiz / Onchain' };
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const btn = (text, action) => { const n = el('button', text, 'btn'); n.type = 'button'; n.onclick = action; return n; };
function userId() { try { return AUTH.user?.id || ''; } catch { return ''; } }
function active() { return !!userId() && document.body.dataset.page === 'alfatrading' && !document.body.classList.contains('landed'); }
function clear() {
  generation++; root.replaceChildren(); root.hidden = true;
  for (const url of urls) URL.revokeObjectURL(url);
  urls = []; loading = false; lastLoad = 0;
  for (const observer of observers) observer.disconnect();
  observers = []; imageQueue = [];
  document.querySelectorAll('dialog.mentor-image-dialog').forEach(dialog => { dialog.close(); dialog.remove(); });
}
function pumpImages() {
  while (inFlight < 2 && imageQueue.length) {
    const job = imageQueue.shift(); inFlight++;
    job().finally(() => { inFlight--; pumpImages(); });
  }
}
function lazyImage(figure, record, i, valid) {
  const placeholder = el('p', 'Fotoğraf görüntülendiğinde yüklenecek…');
  const caption = el('figcaption', i ? 'İlk işlem görseli' : 'Paylaşım görseli'); figure.append(placeholder, caption);
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    const job = async () => {
      if (!valid()) return;
      placeholder.textContent = 'Fotoğraf yükleniyor…';
      try {
        const response = await window.siteFetch(API + '&image=' + encodeURIComponent(record.id) + '&index=' + i, { cache: 'no-store' });
        if (!response.ok) throw new Error();
        const blob = await response.blob(); if (!valid()) return;
        const url = URL.createObjectURL(blob); urls.push(url);
        const img = el('img'); img.src = url; img.alt = record.coin + (i ? ' ilk işlem grafiği' : ' paylaşım grafiği'); img.decoding = 'async';
        const button = btn('', () => {
          const dialog = el('dialog', undefined, 'mentor-image-dialog'), full = el('img');
          full.src = url; full.alt = img.alt;
          dialog.append(btn('Kapat', () => dialog.close()), full); dialog.addEventListener('close', () => dialog.remove());
          document.body.appendChild(dialog); dialog.showModal();
        });
        button.className = 'mentor-image-open'; button.setAttribute('aria-label', record.coin + ' grafiğini büyüt'); button.appendChild(img);
        placeholder.replaceWith(button);
      } catch {
        if (!valid()) return;
        const retry = btn('Tekrar dene', () => { if (valid()) { imageQueue.push(job); pumpImages(); } });
        placeholder.replaceChildren(document.createTextNode('Fotoğraf alınamadı. '), retry);
      }
    };
    imageQueue.push(job); pumpImages();
  }, { rootMargin: '120px' });
  observers.push(observer); observer.observe(figure);
}
async function request(body, suffix = '') {
  const response = await window.siteFetch(API + suffix, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  if (!response.ok) throw new Error('İstek tamamlanamadı (' + response.status + ').');
  const data = await response.json();
  if (!data.ok) throw new Error('İşlem tamamlanamadı.');
  return data;
}
async function load(force = false) {
  if (!active() || loading || (!force && Date.now() - lastLoad < 60000)) return;
  clear(); root.hidden = false; loading = true;
  const run = generation, uid = userId();
  const valid = () => run === generation && uid === userId() && active();
  const head = el('div', undefined, 'mentor-trades-head');
  const title = el('div');
  title.append(el('span', 'MENTORSHIP', 'mentor-trades-kicker'), el('h2', 'Trader Ahmet · İşlem Akışı'));
  head.append(title, btn('Yenile', () => load(true)));
  root.append(head, el('p', 'İşlem = aktif pozisyon · Bias = yön görüşü · Analiz / Onchain = zincir ve grafik yorumu · Sonuç = kapanmış R. R değerleri paylaşılan sonuçlardır; bağımsız doğrulanmış getiri veya kazanç garantisi değildir.', 'mentor-trades-note'));
  const status = el('p', 'Yükleniyor…'); status.setAttribute('role', 'status'); root.appendChild(status);
  try {
    const data = await request(null, '&page=' + index + '&category=' + category + '&coin=' + encodeURIComponent(coin));
    if (!valid()) return;
    const premium = data.access !== 'results';
    const admin = typeof SITE !== 'undefined' && !!SITE.admin && !!window.siteIsAdmin?.();
    document.body.dataset.mentorAccess = premium ? 'premium' : 'results';
    // Kümülatif eğri giriş/kayıt yüzeyinde; premium üye ve admin işlem akışında görmez.
    if (data.summary && !premium && !admin) { const curve = el('div', undefined, 'mentor-curve'); renderMentorCurve(curve, data.summary); root.appendChild(curve); }
    const filters = el('div', undefined, 'mentor-trades-filters');
    for (const [kind, label] of Object.entries(labels)) {
      const button = btn(label + (data.counts?.[kind] != null ? ' · ' + data.counts[kind] : ''), () => { category = kind; index = 0; load(true); });
      button.setAttribute('aria-pressed', String(category === kind)); button.disabled = !premium && !['all','result'].includes(kind);
      filters.appendChild(button);
    }
    if (premium) {
      const input = el('input'); input.placeholder = 'Sembol ara'; input.value = coin; input.setAttribute('aria-label', 'Mentorship sembol ara');
      const apply = () => { coin = input.value.trim().toUpperCase().slice(0,20); index = 0; load(true); };
      input.onkeydown = event => { if (event.key === 'Enter') apply(); };
      filters.append(input, btn('Ara', apply));
    } else {
      const upsell = el('a', 'Aktif işlemler, biaslar ve grafikler için premium’u aç →'); upsell.href = '?page=erisim'; upsell.className = 'mentor-preview-cta'; upsell.dataset.nav = ''; root.appendChild(upsell);
    }
    root.appendChild(filters);
    status.textContent = data.records.length ? '' : 'Bu kategoride henüz paylaşım yok.';
    const grid = el('div', undefined, 'mentor-trades-grid'); root.appendChild(grid);
    for (const record of data.records) {
      const card = el('article', undefined, 'mentor-trade'); card.dataset.mentorTrade = record.id;
      const top = el('div', undefined, 'mentor-trade-title');
      const kind = mentorCategory(record);
      const name = el('div'); name.append(el('h3', record.coin), el('span', kind === 'result' ? 'Sonuç' : labels[kind], 'mentor-category'));
      top.append(name, kind === 'result' ? el('strong', signedR(record.r), record.r >= 0 ? 'positive' : 'negative') : el('span', kind === 'trade' ? 'Aktif' : 'Premium', 'mentor-category'));
      card.append(top, el('small', new Date(record.date * 1000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) + ' · TSİ'));
      if (record.needsReview) card.appendChild(el('p', 'İlk işlem eşleşmesi teyit bekliyor. Bu sonuç otomatik olarak başka bir işleme bağlanmadı.', 'mentor-trade-review'));
      const description = premium ? mentorDescription(record) : '';
      if (description) card.appendChild(el('p', description, 'mentor-trade-text'));
      const media = el('div', undefined, 'mentor-trade-media'); card.appendChild(media);
      for (let i = 0; premium && i < Math.min(2, record.imageCount || 0); i++) {
        const figure = el('figure');
        if (i) {
          const details = el('details'); details.append(el('summary', 'İlk işlem görselini göster'), figure); media.appendChild(details);
        } else media.appendChild(figure);
        lazyImage(figure, record, i, valid);
      }
      const link = el('a', 'Telegram kaynağı ↗');
      // Only exact allowlisted source URLs are navigable.
      if (premium && /^https:\/\/t\.me\/alfakasim\/6\/\d+$/.test(record.link)) { link.href = record.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.appendChild(link); }
      grid.appendChild(card);
    }
    const pager = el('div', undefined, 'mentor-trades-head');
    const prev = btn('← Önceki', () => { index--; load(true); }); prev.disabled = index === 0;
    const next = btn('Sonraki →', () => { index++; load(true); }); next.disabled = !data.more;
    pager.append(prev, el('small', 'Liste sayfası ' + (index + 1) + (premium || admin ? ' · Kümülatif eğri giriş ekranında gösterilir.' : ' · Eğri tüm aktarılan teyitli sonuçları kapsar.')), next);
    root.appendChild(pager);
    if (typeof SITE !== 'undefined' && SITE.admin && window.siteIsAdmin?.()) {
      const controls = el('div', undefined, 'mentor-trades-admin');
      const feedback = el('p'); feedback.setAttribute('role', 'status');
      const connect = btn('Bot bağlantısını doğrula / etkinleştir', async () => {
        connect.disabled = true; feedback.textContent = 'Kontrol ediliyor…';
        try {
          const out = await request({ op: 'connect' });
          if (valid()) feedback.textContent = out.readable ? 'Bot bağlı. Yeni sonuçlar ve düzenlemeler alınabilir.' : 'Botun gruptaki okuma yetkisini kontrol et.';
        } catch { if (valid()) feedback.textContent = 'Bağlantı kurulamadı. Botun Mentorship grubunda yönetici olduğunu ve sunucu ayarlarını kontrol et.'; }
        finally { connect.disabled = false; }
      });
      const input = el('input'); input.placeholder = 'Mentorship sonuç mesajı bağlantısı'; input.setAttribute('aria-label', input.placeholder);
      const importButton = btn('Geçmiş mesajı aktar', async () => {
        const match = input.value.trim().match(/^https:\/\/t\.me\/alfakasim\/6\/(\d+)$/);
        if (!match) { feedback.textContent = 'Yalnızca alfakasim / 6 başlığındaki sonuç bağlantısını gir.'; return; }
        importButton.disabled = true;
        try {
          const out = await request({ op: 'import', ids: [Number(match[1])] });
          if (valid()) feedback.textContent = out.results[0]?.count ? 'Aktarıldı. Yenile ile görüntüle.' : 'Yazar, başlık veya R sonucu doğrulanamadığı için aktarılmadı.';
        } catch { if (valid()) feedback.textContent = 'Aktarım tamamlanamadı; yeniden deneyebilirsin.'; }
        finally { importButton.disabled = false; }
      });
      controls.append(connect, input, importButton, feedback); root.appendChild(controls);
    }
    lastLoad = Date.now();
  } catch {
    if (valid()) status.textContent = 'Mentorship akışı alınamadı. Girişini ve onaylı üyeliğini kontrol edip tekrar dene.';
  } finally { if (run === generation) loading = false; }
}
function context() {
  const uid = userId() + ':' + (typeof SITE !== 'undefined' ? SITE.tier + ':' + SITE.admin : '');
  if (owner !== uid) { owner = uid; index = 0; category = 'all'; clear(); }
  if (!active()) { clear(); return; }
  load();
}
if (page) {
  new MutationObserver(context).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-page'] });
  window.addEventListener('focus', context);
  window.addEventListener('pagehide', clear);
  window.AlfaMentorTrades = { refreshContext: context };
  context();
}
