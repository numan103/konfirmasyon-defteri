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
  const safeImage = value => typeof value === 'string' && /^\/api\/edu-shared\?kind=landing&image=[a-zA-Z0-9_-]+$/.test(value);
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
  let lightbox;
  function showPreview(post, trigger) {
    if (!lightbox) {
      const dialog = el('dialog', null, 'lp-preview-dialog');
      dialog.setAttribute('aria-labelledby', 'lp-preview-dialog-title');
      const bar = el('div', null, 'lp-preview-dialog-bar');
      const title = el('h3', '', 'lp-preview-dialog-title');
      title.id = 'lp-preview-dialog-title';
      const controls = el('div', null, 'lp-preview-dialog-controls');
      const minus = el('button', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Uzaklaştır');
      const plus = el('button', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Yakınlaştır');
      const reset = el('button', 'Sığdır'); reset.type = 'button';
      const close = el('button', '✕'); close.type = 'button'; close.setAttribute('aria-label', 'Önizlemeyi kapat');
      controls.append(minus, plus, reset, close);
      bar.append(title, controls);
      const viewport = el('div', null, 'lp-preview-dialog-viewport');
      const image = el('img'); image.referrerPolicy = 'no-referrer';
      const caption = el('p', '', 'lp-preview-dialog-caption');
      const message = el('p', '', 'lp-preview-dialog-message');
      viewport.append(image);
      dialog.append(bar, caption, viewport, message);
      document.body.append(dialog);
      let zoom = 1;
      const setZoom = value => {
        zoom = Math.max(1, Math.min(4, value));
        image.style.width = zoom * 100 + '%';
        image.style.height = zoom === 1 ? '100%' : 'auto';
        image.style.cursor = zoom === 1 ? 'zoom-in' : 'zoom-out';
        minus.disabled = zoom === 1;
        plus.disabled = zoom === 4;
        reset.textContent = zoom === 1 ? 'Sığdır' : Math.round(zoom * 100) + '%';
        reset.setAttribute('aria-label', 'Görseli sığdır; mevcut yakınlaştırma yüzde ' + Math.round(zoom * 100));
      };
      minus.addEventListener('click', () => setZoom(zoom - .5));
      plus.addEventListener('click', () => setZoom(zoom + .5));
      reset.addEventListener('click', () => { setZoom(1); viewport.scrollTo(0, 0); });
      image.addEventListener('click', () => setZoom(zoom === 1 ? 2 : 1));
      image.addEventListener('error', () => {
        message.textContent = 'Görsel şu an alınamıyor. Paylaşımın kısa açıklaması yukarıda; daha sonra tekrar deneyebilirsin.';
        viewport.hidden = true;
        [minus, plus, reset].forEach(control => { control.hidden = true; });
      });
      image.addEventListener('load', () => { message.textContent = 'Görsele tıklayarak veya + / − ile yakınlaştır. Yakınlaştırınca kaydırarak incele.'; });
      close.addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener('keydown', event => {
        if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(zoom + .5); }
        if (event.key === '-') { event.preventDefault(); setZoom(zoom - .5); }
      });
      dialog.addEventListener('close', () => { lightbox.trigger?.focus(); });
      lightbox = { dialog, title, image, caption, message, viewport, setZoom, controls: [minus, plus, reset] };
    }
    lightbox.trigger = trigger;
    lightbox.title.textContent = post.title || 'Kanal paylaşımı';
    lightbox.caption.textContent = stamp(post.date) + (post.excerpt ? ' · ' + post.excerpt : '');
    const hasImage = safeImage(post.image);
    lightbox.viewport.hidden = !hasImage;
    lightbox.controls.forEach(control => { control.hidden = !hasImage; });
    lightbox.setZoom(1);
    lightbox.image.alt = post.title || 'Paylaşılan grafik';
    lightbox.message.textContent = hasImage ? 'Grafik yükleniyor…' : 'Bu paylaşımda grafik bulunmuyor.';
    if (hasImage) lightbox.image.src = post.image;
    else lightbox.image.removeAttribute('src');
    if (!lightbox.dialog.open) lightbox.dialog.showModal();
    lightbox.viewport.scrollTo(0, 0);
  }
  function renderPost(host, group, status, kind) {
    const posts = Array.isArray(group?.latest) ? group.latest : [];
    const post = posts[0];
    if (!post) return state(host, status === 'unavailable' ? 'Kanal paylaşımı şu an alınamıyor.' : kind === 'trade' ? 'Son 7 günde işlem paylaşımı yok. Eski işlemler bu haftanın verisi gibi gösterilmez.' : 'Son 7 günde bias veya analiz paylaşımı yok.');
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
    host.replaceChildren(el('span', 'Son 7 gün · ' + number(group.count) + (kind === 'trade' ? ' işlem paylaşımı' : ' bias / analiz paylaşımı'), 'lp-live-label'), tags, el('h5', post.title || (kind === 'trade' ? 'İşlem paylaşımı' : 'Bias & analiz paylaşımı'), 'lp-post-title'), el('p', stamp(post.date), 'lp-live-caption'));
    if (safeImage(post.image)) {
      const link = el('button', null, 'lp-post-image-link');
      link.type = 'button';
      link.setAttribute('aria-label', 'Grafiği büyüt: ' + (post.title || 'Kanal paylaşımı'));
      link.addEventListener('click', () => showPreview(post, link));
      const image = el('img');
      image.className = 'lp-post-image';
      image.src = post.image;
      image.alt = post.title || 'Yöneticinin paylaştığı grafik';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => { image.remove(); link.append(el('span', 'Grafik alınamadı · Paylaşımı aç')); }, { once: true });
      link.append(image);
      host.append(link);
      host.append(el('span', 'Grafiğe dokun · büyüt ve incele', 'lp-live-label'));
    }
    if (!safeImage(post.image)) {
      if (post.excerpt) host.append(el('p', post.excerpt, 'lp-post-excerpt'));
      const open = el('button', 'Önizlemeyi aç ⤢', 'lp-live-post-link lp-post-open');
      open.type = 'button';
      open.addEventListener('click', () => showPreview(post, open));
      host.append(open);
    }
    if (posts.length > 1) {
      const list = el('div', null, 'lp-week-posts');
      list.setAttribute('aria-label', 'Son 7 günün paylaşımları');
      posts.slice(1).forEach(item => {
        const button = el('button', null, 'lp-week-post');
        button.type = 'button';
        button.append(el('span', item.title || 'Kanal paylaşımı'), el('small', date(item.date) + (item.image ? ' · ⤢' : '')));
        button.addEventListener('click', () => showPreview(item, button));
        list.append(button);
      });
      host.append(list);
    }
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
