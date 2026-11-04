(function () {
  'use strict';
  const portfolio = document.getElementById('lp-live-portfolio');
  const trades = document.getElementById('lp-live-trades');
  const posts = document.getElementById('lp-live-posts');
  if (!portfolio || !trades || !posts) return;
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
  function line(label, value) {
    const row = el('div');
    row.append(el('span', label), el('b', value));
    return row;
  }
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
  function renderTrades(t, status, fetchedAt) {
    if (!t || !finite(t.totalR) || !finite(t.count)) return state(trades, status === 'empty' ? 'Henüz tarihli ve R sonucu girilmiş işlem yok.' : 'İşlem sonuçları şu an alınamıyor.');
    trades.replaceChildren(el('span', 'Kayıtlı işlemlerin toplamı', 'lp-live-label'), el('strong', signed(t.totalR) + 'R', 'lp-live-return ' + (t.totalR >= 0 ? 'positive' : 'negative')));
    trades.append(el('p', date(t.from) + ' – ' + date(t.to), 'lp-live-caption'));
    trades.append(el('p', number(t.count) + ' işlem · ' + t.wins + ' kazanç · ' + t.losses + ' kayıp · ' + t.breakeven + ' başabaş', 'lp-live-caption'), el('span', 'Son 3 kayıt · işlem tarihi', 'lp-live-label'));
    const latest = el('div', null, 'lp-sig-rows');
    for (const item of Array.isArray(t.latest) ? t.latest.slice(0, 3) : []) {
      if (!finite(item.r)) continue;
      const row = line(date(item.date) + ' · ' + item.market, signed(item.r) + 'R');
      row.lastChild.className = item.r >= 0 ? 'positive' : 'negative';
      latest.append(row);
    }
    trades.append(latest, el('p', 'Kripto · Fx · arşiv dahil. R sonucu boş kayıtlar hariç. Güncelleme: ' + stamp(fetchedAt), 'lp-live-caption'));
  }
  async function load() {
    try {
      const response = await fetch('/api/edu-shared?kind=landing', { signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      renderPortfolio(data.portfolio, data.status?.portfolio);
      renderTrades(data.trades, data.status?.trades, data.fetchedAt);
    } catch (_) {
      state(portfolio, 'Portföy verisi şu an alınamıyor.');
      state(trades, 'İşlem sonuçları şu an alınamıyor.');
    }
  }
  async function loadPosts() {
    try {
      const response = await fetch('/api/tg', { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      const post = Array.isArray(data) && data.find(p => typeof p.text === 'string' && p.text.trim());
      if (!post) return state(posts, 'Henüz herkese açık metin paylaşımı yok.');
      posts.replaceChildren(el('p', post.text.slice(0, 260) + (post.text.length > 260 ? '…' : ''), 'lp-live-post'), el('p', date(post.date), 'lp-live-caption'));
      if (typeof post.link === 'string' && /^https:\/\/t\.me\/[a-zA-Z0-9_]+\/\d+$/.test(post.link)) {
        const link = el('a', 'Paylaşımın tamamını oku ↗', 'lp-live-post-link');
        link.href = post.link;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        posts.append(link);
      }
    } catch (_) { state(posts, 'Kanal paylaşımı şu an alınamıyor.'); }
  }
  // No polling or browser portfolio state: only the server's public projections.
  load();
  loadPosts();
})();
