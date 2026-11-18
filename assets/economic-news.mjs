import { todayEvents, istanbulTime } from './economic-news-model.mjs?v=1';

const panel = document.getElementById('economic-news');
if (panel) {
  const trigger = panel.querySelector('#economic-news-trigger');
  const popup = panel.querySelector('#economic-news-popover');
  const list = panel.querySelector('[data-econ-list]');
  const status = panel.querySelector('[data-econ-status]');
  const summary = panel.querySelector('[data-econ-summary]');
  const filter = panel.querySelector('[data-econ-high]');
  const host = panel.querySelector('[data-econ-widget]');
  const widgetStatus = panel.querySelector('[data-econ-widget-status]');
  let items = [], loadedAt = 0, pending = null, widgetPromise = null, widgetGeneration = 0;
  let closeTimer, pinned = false;
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
    const generation = ++widgetGeneration;
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
        if (generation !== widgetGeneration || popup.hidden) return;
        const widget = element('tv-economic-calendar');
        widget.setAttribute('countries', 'us,eu,gb,ca,au,nz,jp,ch,cn,tr');
        if (filter.checked) widget.setAttribute('high-importance-only', '');
        const theme = document.documentElement.dataset.theme || document.body.dataset.theme || '';
        widget.setAttribute('theme', theme === 'light' || document.body.classList.contains('light') ? 'light' : 'dark');
        host.replaceChildren(widget);
        widgetStatus.textContent = tr('Kaynak: TradingView. Gerçekleşen / beklenti / önceki değerler sağlayıcıdan gelir; gecikme olabilir. Saat dilimi sonuç takviminin kendi ayarındadır.', 'Source: TradingView. Actual / forecast / previous values come from the provider and may be delayed. The results calendar has its own timezone setting.');
      } catch {
        if (generation !== widgetGeneration) return;
        widgetPromise = null;
        host.hidden = true;
        widgetStatus.textContent = tr('Sonuç takvimi yüklenemedi veya engellendi. Yenile ile tekrar dene; ajandadaki beklenti sonuç değildir.', 'Results calendar unavailable or blocked. Try Refresh; agenda forecasts are not actual results.');
        host.replaceChildren();
      }
    })();
    return widgetPromise;
  }
  function setOpen(open, returnFocus = false) {
    clearTimeout(closeTimer);
    popup.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) { load(); mountWidget(); }
    else {
      pinned = false;
      widgetGeneration++; widgetPromise = null;
      host.replaceChildren(); // Do not leave a provider iframe running while closed.
      if (returnFocus) trigger.focus();
    }
  }
  trigger.addEventListener('click', () => {
    if (popup.hidden) { pinned = true; setOpen(true); }
    else setOpen(false);
  });
  panel.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse' || !matchMedia('(hover: hover)').matches) return;
    clearTimeout(closeTimer);
    if (popup.hidden) setOpen(true);
  });
  panel.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'mouse') return;
    closeTimer = setTimeout(() => {
      if (!pinned && !popup.contains(document.activeElement)) setOpen(false);
    }, 220);
  });
  panel.querySelector('[data-econ-close]').addEventListener('click', () => setOpen(false, true));
  document.addEventListener('pointerdown', event => {
    if (!popup.hidden && !panel.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !popup.hidden) { event.preventDefault(); setOpen(false, true); }
  });
  filter.addEventListener('change', () => {
    paint();
    const widget = host.querySelector('tv-economic-calendar');
    if (widget) widget.toggleAttribute('high-importance-only', filter.checked);
  });
  panel.querySelector('[data-econ-refresh]').addEventListener('click', () => {
    load(true); widgetGeneration++; widgetPromise = null; mountWidget();
  });
  // No polling while collapsed, hidden, in another tab, or on the landing page.
  setInterval(() => {
    if (!popup.hidden && !document.hidden && panel.getClientRects().length) load();
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !popup.hidden && panel.getClientRects().length) load();
  });
  const observer = new MutationObserver(() => {
    if (!panel.getClientRects().length && !popup.hidden) setOpen(false);
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-page'] });
  const preferences = new MutationObserver(() => {
    paint();
    const widget = host.querySelector('tv-economic-calendar');
    if (widget) widget.setAttribute('theme', document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  });
  preferences.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'lang'] });
  // On small screens use a real navbar slot, not a fixed button over Login.
  const mobileLayout = matchMedia('(max-width: 680px)');
  const originalParent = panel.parentNode, originalNext = panel.nextSibling;
  function placeTrigger() {
    const menu = document.getElementById('nav-mobile-btn');
    if (mobileLayout.matches && menu) menu.before(panel);
    else originalParent.insertBefore(panel, originalNext);
  }
  mobileLayout.addEventListener('change', placeTrigger);
  placeTrigger();
  paint();
  // Always start closed, including when an older version saved an open preference.
  popup.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
}
