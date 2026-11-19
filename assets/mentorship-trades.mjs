const API = '/api/ai?mentorTrades=1';
const page = document.getElementById('page-alfatrading');
const root = document.createElement('section'); root.className = 'mentor-trades'; root.hidden = true;
page?.insertBefore(root, page.querySelector('.at-filters'));
let owner = '', generation = 0, loading = false, lastLoad = 0, index = 0, urls = [];
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const btn = (text, action) => { const n = el('button', text, 'btn'); n.type = 'button'; n.onclick = action; return n; };
function userId() { try { return AUTH.user?.id || ''; } catch { return ''; } }
function active() { return !!userId() && document.body.dataset.page === 'alfatrading' && !document.body.classList.contains('landed'); }
function clear() {
  generation++; root.replaceChildren(); root.hidden = true;
  for (const url of urls) URL.revokeObjectURL(url);
  urls = []; loading = false; lastLoad = 0;
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
  title.append(el('span', 'MENTORSHIP · PREMIUM', 'mentor-trades-kicker'), el('h2', 'Trader Ahmet · İşlem Sonuçları'));
  head.append(title, btn('Yenile', () => load(true)));
  root.append(head, el('p', 'Telegram’daki bağlantılı işlem ve sonuç paylaşımları. R değerleri paylaşılan sonuçlardır; bağımsız olarak doğrulanmış getiri veya kazanç garantisi değildir.', 'mentor-trades-note'));
  const status = el('p', 'Yükleniyor…'); status.setAttribute('role', 'status'); root.appendChild(status);
  try {
    const data = await request(null, '&page=' + index);
    if (!valid()) return;
    status.textContent = data.records.length ? '' : 'Henüz aktarılmış işlem sonucu yok.';
    const grid = el('div', undefined, 'mentor-trades-grid'); root.appendChild(grid);
    for (const record of data.records) {
      const card = el('article', undefined, 'mentor-trade'); card.dataset.mentorTrade = record.id;
      const top = el('div', undefined, 'mentor-trade-title');
      top.append(el('h3', record.coin), el('strong', (record.r > 0 ? '+' : '') + record.r + 'R', record.r >= 0 ? 'positive' : 'negative'));
      card.append(top, el('small', new Date(record.date * 1000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) + ' · TSİ'));
      if (record.needsReview) card.appendChild(el('p', 'İlk işlem eşleşmesi teyit bekliyor. Bu sonuç otomatik olarak başka bir işleme bağlanmadı.', 'mentor-trade-review'));
      if (record.rootText) card.appendChild(el('p', record.rootText, 'mentor-trade-text'));
      if (record.text && record.text !== record.rootText) card.appendChild(el('p', record.text, 'mentor-trade-text'));
      const media = el('div', undefined, 'mentor-trade-media'); card.appendChild(media);
      if (!record.hasImage) media.appendChild(el('small', 'Bu kayıtta erişilebilir fotoğraf bulunamadı.'));
      for (let i = 0; i < Math.min(2, record.imageCount || 0); i++) {
        const figure = el('figure'), note = el('figcaption', i === 0 ? 'Sonuç / işlem görseli' : 'İlk işlem görseli');
        const placeholder = el('p', 'Fotoğraf yükleniyor…'); figure.append(placeholder, note); media.appendChild(figure);
        const imageURL = API + '&image=' + encodeURIComponent(record.id) + '&index=' + i;
        // Fetch through authenticated API. Never put bot URLs or premium media
        // in localStorage, public OG endpoints, Telegram previews or shared feeds.
        window.siteFetch(imageURL, { cache: 'no-store' }).then(async response => {
          if (!response.ok) throw new Error();
          const blob = await response.blob();
          if (!valid()) return;
          const url = URL.createObjectURL(blob); urls.push(url);
          const img = el('img'); img.src = url; img.alt = record.coin + (i ? ' ilk işlem grafiği' : ' işlem sonucu grafiği');
          img.loading = 'lazy'; placeholder.replaceWith(img);
        }).catch(() => { if (valid()) placeholder.textContent = 'Fotoğraf alınamadı. Telegram kaynağından açabilirsin.'; });
      }
      const link = el('a', 'Telegram kaynağı ↗');
      // Only exact allowlisted source URLs are navigable.
      if (/^https:\/\/t\.me\/alfakasim\/6\/\d+$/.test(record.link)) { link.href = record.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.appendChild(link); }
      grid.appendChild(card);
    }
    const pager = el('div', undefined, 'mentor-trades-head');
    const prev = btn('← Önceki', () => { index--; load(true); }); prev.disabled = index === 0;
    const next = btn('Sonraki →', () => { index++; load(true); }); next.disabled = !data.more;
    pager.append(prev, el('small', 'Sayfa ' + (index + 1) + ' · Özetler yalnızca bu sayfadaki kayıtlardır.'), next);
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
  const uid = userId();
  if (owner !== uid) { owner = uid; index = 0; clear(); }
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
