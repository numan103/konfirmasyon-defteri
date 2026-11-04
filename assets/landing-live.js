(function () {
  'use strict';
  const portfolio = document.getElementById('lp-live-portfolio');
  const trades = document.getElementById('lp-live-trades');
  const bias = document.getElementById('lp-live-bias');
  if (!portfolio || !trades || !bias) return;
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const date = value => {
    const d = new Date(value || '');
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Tarih belirtilmemiş';
  };
  const number = n => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n);
  const stamp = value => typeof value === 'string' && value.includes('T') && Number.isFinite(Date.parse(value))
    ? date(value) + ' ' + new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : date(value);
  const signed = n => (n > 0 ? '+' : '') + number(n);
  function el(tag, text, cls) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function state(host, text) { host.replaceChildren(el('p', text, 'lp-live-state')); }
  function renderPortfolio(p, status) {
    if (!p || !finite(p.returnPct)) return state(portfolio, status === 'empty' ? 'Henüz yayınlanabilir portföy kaydı yok.' : 'Portföy verisi şu an alınamıyor.');
    const sign = p.returnPct >= 0 ? 'positive' : 'negative';
    const caption = el('span', 'Başlangıçtan bugüne · Getiri', 'lp-live-label');
    const pct = el('strong', signed(p.returnPct) + '%', 'lp-live-return ' + sign);
    const freshness = el('p', (p.live ? 'Güncel fiyatlarla değerleme' : 'Son kayıtlı fiyatlarla değerleme') + ' · ' + stamp(p.asOf), 'lp-live-caption');
    portfolio.replaceChildren(caption, pct, freshness);
    const points = Array.isArray(p.series) ? p.series.filter(x => finite(x.pct) && Number.isFinite(Date.parse(x.date))) : [];
    if (points.length >= 2) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 400 115');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Kayıtlı portföy getiri yüzdesi: ' + date(points[0].date) + ' – ' + date(points.at(-1).date));
      svg.classList.add('lp-live-chart');
      const values = points.map(x => x.pct);
      const min = Math.min(...values), max = Math.max(...values);
      const range = max - min || 1;
      const coords = values.map((v, i) => [8 + i / (values.length - 1) * 384, 102 - (v - min) / range * 88]);
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', coords.map((v, i) => (i ? 'L' : 'M') + v.map(n => n.toFixed(2)).join(',')).join(' '));
      path.setAttribute('fill', 'none');
      // The line color reflects the chart period, not just the headline total return.
      path.setAttribute('stroke', values.at(-1) >= values[0] ? '#5eead4' : '#fca5a5');
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
      portfolio.append(svg);
      const rangeLabel = el('div', null, 'lp-live-range');
      rangeLabel.append(el('span', date(points[0].date)), el('span', date(points.at(-1).date)));
      portfolio.append(rangeLabel);
      portfolio.append(el('p', 'Kayıtlı değerlemeler · başlangıç bakiyesine göre % · ' + number(min) + '% / ' + number(max) + '% aralığı', 'lp-live-caption'));
    } else {
      portfolio.append(el('p', 'Grafik için en az iki tarihli değerleme gerekiyor.', 'lp-live-state'));
    }
    portfolio.append(el('p', 'Portföy kaydı: ' + stamp(p.recordedAt), 'lp-live-caption'));
  }
  function renderPost(host, group, status, kind) {
    const post = group?.latest?.[0];
    if (!post) return state(host, status === 'unavailable' ? 'Kanal paylaşımı şu an alınamıyor.' : kind === 'trade' ? 'Henüz yayınlanmış işlem paylaşımı yok.' : 'Henüz yayınlanmış bias veya analiz yok.');
    const tags = el('div', null, 'lp-sig-meta');
    tags.append(el('span', kind === 'trade' ? 'İşlem Kanalı' : 'Bias & analiz'));
    if (post.coin) tags.append(el('span', post.coin));
    const direction = { long: 'LONG', short: 'SHORT', notr: 'NÖTR' }[post.direction];
    if (direction) {
      const tag = el('span', direction);
      tag.lang = 'en';
      tags.append(tag);
    }
    const statusLabel = { aktif: 'Aktif', tp: 'TP geldi', sl: 'SL', iptal: 'İptal' }[post.status];
    if (statusLabel) tags.append(el('span', statusLabel));
    host.replaceChildren(tags, el('h5', post.title || (kind === 'trade' ? 'İşlem paylaşımı' : 'Bias & analiz paylaşımı'), 'lp-post-title'), el('p', stamp(post.date), 'lp-live-caption'));
    const href = '?page=alfatrading&post=' + encodeURIComponent(post.id);
    if (typeof post.image === 'string' && (/^https:\/\//.test(post.image) || /^data:image\/(png|jpeg|webp|gif);base64,/.test(post.image))) {
      const link = el('a', null, 'lp-post-image-link');
      link.href = href;
      link.setAttribute('aria-label', 'Paylaşımı aç: ' + (post.title || 'Kanal paylaşımı'));
      const image = el('img');
      image.className = 'lp-post-image';
      image.src = post.image;
      image.alt = post.title || 'Yöneticinin paylaştığı grafik';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => link.remove(), { once: true });
      link.append(image);
      host.append(link);
    }
    if (post.excerpt) host.append(el('p', post.excerpt, 'lp-post-excerpt'));
    const open = el('a', 'Paylaşımı incele →', 'lp-live-post-link lp-post-open');
    open.href = href;
    host.append(open);
    host.append(el('p', number(group.count) + (kind === 'trade' ? ' işlem paylaşımı · kaynak: İşlem Kanalı' : ' bias / analiz paylaşımı · kaynak: İşlem Kanalı'), 'lp-live-caption'));
  }
  async function load() {
    try {
      const response = await fetch('/api/edu-shared?kind=landing', { signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      renderPortfolio(data.portfolio, data.status?.portfolio);
      renderPost(trades, data.channel?.trades, data.status?.channel, 'trade');
      renderPost(bias, data.channel?.biases, data.status?.channel, 'bias');
    } catch (_) {
      state(portfolio, 'Portföy verisi şu an alınamıyor.');
      state(trades, 'İşlem paylaşımı şu an alınamıyor.');
      state(bias, 'Bias paylaşımı şu an alınamıyor.');
    }
  }
  // No polling or browser portfolio state: only the server's public projections.
  load();
})();
