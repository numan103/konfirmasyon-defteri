import { signedR } from './mentor-curve.mjs?v=2';
const API = '/api/ai?mentorTrades=1';
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const runs = new WeakMap(), owned = new WeakMap();

function clear(host) {
  for (const url of owned.get(host) || []) URL.revokeObjectURL(url);
  owned.set(host, []); runs.set(host, (runs.get(host) || 0) + 1);
  host.querySelector('.mentor-ba')?.remove();
}
async function paint(host, run, id, index, holder, label) {
  try {
    const response = await window.siteFetch(API + '&image=' + encodeURIComponent(id) + '&index=' + index, { cache: 'no-store' });
    if (!response.ok) throw new Error('image_unavailable');
    const blob = await response.blob();
    if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) throw new Error('image_unavailable');
    const url = URL.createObjectURL(blob);
    if (runs.get(host) !== run || !holder.isConnected) { URL.revokeObjectURL(url); return; }
    owned.get(host).push(url);
    const image = el('img'); image.src = url; image.alt = label; image.loading = 'lazy'; image.decoding = 'async';
    holder.replaceChildren(image);
  } catch {
    if (runs.get(host) === run) holder.replaceChildren(el('span', 'Görsel alınamadı', 'mentor-ba-missing'));
  }
}
export function renderMentorBeforeAfter(host, records) {
  if (!host) return;
  clear(host);
  const pairs = (Array.isArray(records) ? records : [])
    .filter(record => record && /^mentortrade_[a-f0-9]{64}$/.test(record.id) && Number(record.imageCount) >= 2 &&
      Number.isFinite(record.r) && Number.isFinite(record.date))
    .slice().reverse().slice(0, 8);
  if (!pairs.length) return;
  const run = runs.get(host), section = el('section', undefined, 'mentor-ba');
  section.append(el('span', 'ALFA TOOL · ÖNCE / SONRA', 'mentor-ba-kicker'));
  section.append(el('h4', 'Görsel işlem sonuçları', 'mentor-ba-title'));
  section.append(el('p', 'Teyitli sonuçlar Alfa Tool ile işlem kanalından aktarıldı. Harici bağlantı yok.', 'mentor-trades-note'));
  const grid = el('div', undefined, 'mentor-ba-grid');
  for (const record of pairs) {
    const card = el('article', undefined, 'mentor-ba-card');
    const top = el('div', undefined, 'mentor-ba-top');
    const label = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short' }).format(new Date(record.date * 1000));
    top.append(el('b', record.coin), el('strong', signedR(record.r), record.r >= 0 ? 'positive' : 'negative'), el('small', label));
    card.appendChild(top);
    const pair = el('div', undefined, 'mentor-ba-pair');
    for (const [index, caption] of [[1, 'ÖNCE · İlk grafik'], [0, 'SONRA · Sonuç']]) {
      const figure = el('figure', undefined, 'mentor-ba-shot');
      const frame = el('div', undefined, 'mentor-ba-frame');
      frame.appendChild(el('span', 'Görsel yükleniyor…', 'mentor-ba-loading'));
      figure.append(frame, el('figcaption', caption));
      pair.appendChild(figure);
      paint(host, run, record.id, index, frame, record.coin + ' ' + caption);
    }
    card.appendChild(pair); grid.appendChild(card);
  }
  section.appendChild(grid); host.appendChild(section);
}
