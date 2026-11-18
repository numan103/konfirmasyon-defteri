import { todayEvents, istanbulTime } from './economic-news-model.mjs?v=1';

const panel = document.getElementById('economic-news');
if (panel) {
  const list = panel.querySelector('[data-econ-list]');
  const status = panel.querySelector('[data-econ-status]');
  const summary = panel.querySelector('[data-econ-summary]');
  const filter = panel.querySelector('[data-econ-high]');
  const host = panel.querySelector('[data-econ-widget]');
  const widgetStatus = panel.querySelector('[data-econ-widget-status]');
  let items = [], loadedAt = 0, pending = null, widgetPromise = null;
  const en = () => window.LANG === 'en';
  const tr = (a, b) => en() ? b : a;
  function element(tag, text, cls) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function paint() {
    const events = todayEvents(items, { highOnly: filter.checked });
    list.replaceChildren();
    for (const event of events) {
      const row = element('article', undefined, 'econ-news-row');
      const time = element('time', istanbulTime(event.at)); time.dateTime = new Date(event.at).toISOString();
      const body = element('div');
      body.appendChild(element('strong', event.titleTr || event.title));
      body.appendChild(element('span', event.titleTr ? event.title : tr('Türkçe çeviri henüz yok', 'Turkish translation unavailable'), 'econ-news-original'));
      const meta = element('div', undefined, 'econ-news-meta');
      meta.append(element('span', event.country),
        element('span', { high: tr('★★★ Yüksek', '★★★ High'), medium: tr('★★ Orta', '★★ Medium'), low: tr('★ Düşük', '★ Low') }[event.impact] || '—', 'econ-news-impact'),
        element('span', tr('Beklenti: ', 'Forecast: ') + (event.forecast || '—')),
        element('span', tr('Önceki: ', 'Previous: ') + (event.previous || '—')));
      body.appendChild(meta); row.append(time, body); list.appendChild(row);
    }
    if (!events.length && loadedAt) list.appendChild(element('p', tr('Bugün bu filtrede planlanmış veri yok.', 'No scheduled events today for this filter.'), 'econ-news-note'));
    const next = events.find(event => event.at > Date.now());
    summary.textContent = loadedAt ? tr('Bugün: ', 'Today: ') + events.length + (next ? ' · ' + istanbulTime(next.at) + ' ' + next.country + ' · ' + (next.titleTr || next.title) : '') : tr('Ajanda · Beklenti · Gerçekleşen', 'Agenda · Forecast · Actual');
  }
  async function load(force = false) {
    if (pending) return pending;
    if (!force && Date.now() - loadedAt < 300000) { paint(); return; }
    status.textContent = tr('Takvim yükleniyor…', 'Loading calendar…');
    pending = (async () => {
      try {
        const response = await fetch('/api/eco-cal', { signal: AbortSignal.timeout(20000) });
        const data = await response.json();
        if (!response.ok || !data.ok || !Array.isArray(data.items)) throw new Error('calendar_unavailable');
        items = data.items; loadedAt = Date.now(); paint();
        status.classList.remove('econ-news-error');
        status.textContent = tr('Son alım ', 'Fetched ') + istanbulTime(loadedAt) + tr(' TSİ · Ajanda 5 dk arayla yenilenir', ' TRT · Agenda refreshes every 5 min');
      } catch {
        if (loadedAt) paint();
        status.classList.add('econ-news-error');
        status.textContent = tr('Ajanda alınamadı. ', 'Agenda unavailable. ') + (loadedAt ? tr('Önceki alım: ', 'Previous fetch: ') + istanbulTime(loadedAt) + ' TSİ' : tr('Yenile ile tekrar dene.', 'Try Refresh.'));
        if (!loadedAt) list.replaceChildren(element('p', tr('Kaynak erişilemiyor; boş takvim olarak gösterilmiyor.', 'Source unavailable; this does not mean there are no events.'), 'econ-news-note'));
      } finally { pending = null; }
    })();
    return pending;
  }
  async function mountWidget() {
    if (widgetPromise) return widgetPromise;
    host.hidden = false;
    widgetPromise = (async () => {
      try {
        if (!customElements.get('tv-economic-calendar')) {
          // Official embed only; no scraping, proxying or extracting provider data.
          let timer;
          try {
            await Promise.race([
              import('https://widgets.tradingview-widget.com/w/tr/tv-economic-calendar.js'),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('widget_timeout')), 15000); }),
            ]);
          } finally { clearTimeout(timer); }
        }
        const widget = element('tv-economic-calendar');
        widget.setAttribute('countries', 'us,eu,gb,ca,au,nz,jp,ch,cn,tr');
        if (filter.checked) widget.setAttribute('high-importance-only', '');
        const theme = document.documentElement.dataset.theme || document.body.dataset.theme || '';
        widget.setAttribute('theme', theme === 'light' || document.body.classList.contains('light') ? 'light' : 'dark');
        host.replaceChildren(widget);
        widgetStatus.textContent = tr('Kaynak: TradingView. Gerçekleşen / beklenti / önceki değerler sağlayıcıdan gelir; gecikme olabilir. Saat dilimi sonuç takviminin kendi ayarındadır.', 'Source: TradingView. Actual / forecast / previous values come from the provider and may be delayed. The results calendar has its own timezone setting.');
      } catch {
        widgetPromise = null;
        host.hidden = true;
        widgetStatus.textContent = tr('Sonuç takvimi yüklenemedi veya engellendi. Yenile ile tekrar dene; ajandadaki beklenti sonuç değildir.', 'Results calendar unavailable or blocked. Try Refresh; agenda forecasts are not actual results.');
        host.replaceChildren();
      }
    })();
    return widgetPromise;
  }
  panel.addEventListener('toggle', () => {
    try { localStorage.setItem('alfa-economic-news-open', panel.open ? '1' : '0'); } catch {}
    if (panel.open && panel.getClientRects().length && !document.hidden) { load(); mountWidget(); }
  });
  filter.addEventListener('change', () => {
    paint();
    const widget = host.querySelector('tv-economic-calendar');
    if (widget) widget.toggleAttribute('high-importance-only', filter.checked);
  });
  panel.querySelector('[data-econ-refresh]').addEventListener('click', () => {
    load(true); widgetPromise = null; mountWidget();
  });
  // No polling while collapsed, hidden, in another tab, or on the landing page.
  setInterval(() => {
    if (panel.open && !document.hidden && panel.getClientRects().length) load();
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && panel.open && panel.getClientRects().length) load();
  });
  let wasVisible = false;
  const observer = new MutationObserver(() => {
    const visible = !!panel.getClientRects().length;
    if (visible && !wasVisible && panel.open) { load(); mountWidget(); }
    wasVisible = visible;
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-page'] });
  const preferences = new MutationObserver(() => {
    paint();
    const widget = host.querySelector('tv-economic-calendar');
    if (widget) widget.setAttribute('theme', document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  });
  preferences.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'lang'] });
  paint();
  try { panel.open = localStorage.getItem('alfa-economic-news-open') !== '0'; } catch { panel.open = true; }
}
