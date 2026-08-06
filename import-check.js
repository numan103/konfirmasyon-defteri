
  (function () {
    var saved = null;
    try { saved = localStorage.getItem('alfa-theme'); } catch (e) {}
    var initial = 'dark';
    if (saved === 'light') initial = 'light';
    if (location.search.indexOf('light=1') !== -1) initial = 'light';
    document.documentElement.setAttribute('data-theme', initial);
    function applyTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      var checked = t === 'light' ? 'true' : 'false';
      document.querySelectorAll('.theme-toggle, .theme-toggle-d').forEach(function (b) {
        b.setAttribute('aria-checked', checked);
      });
    }
    document.addEventListener('DOMContentLoaded', function () {
      var btns = document.querySelectorAll('.theme-toggle, .theme-toggle-d');
      if (!btns.length) return;
      btns.forEach(function (btn) {
        btn.setAttribute('aria-checked', initial === 'light' ? 'true' : 'false');
        btn.addEventListener('click', function () {
          var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
          try { localStorage.setItem('alfa-theme', cur); } catch (e) {}
          applyTheme(cur);
        });
      });
    });
  })();
  

    (function () {
      function num(s) { var v = parseFloat(s); return isNaN(v) ? null : v; }
      function fmtP(v) {
        if (v === null) return 'â€”';
        if (v >= 100000) return v.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
        if (v >= 1000) return v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
        return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
      }
      function fmtC(v) { if (v === null) return ''; var s = v >= 0 ? '+' : ''; return s + v.toFixed(2) + '%'; }
      var ITEMS = [];
      function pushItem(s, p, c) { if (p !== null && !isNaN(p)) ITEMS.push({ s: s, p: p, c: c }); }
      function render() {
        var tape = document.getElementById('tv-bar-tape');
        if (!tape || !ITEMS.length) return;
        var one = ITEMS.map(function (t) {
          var cHtml = '';
          if (t.c !== null) {
            var cls = t.c >= 0 ? 'up' : 'dn';
            var arrow = t.c >= 0 ? 'â–²' : 'â–¼';
            cHtml = '<span class="c ' + cls + '">' + arrow + ' ' + fmtC(t.c) + '</span>';
          }
          return '<span class="tv-tk"><span class="s">' + t.s + '</span><span class="p">' + fmtP(t.p) + '</span>' + cHtml + '</span>';
        }).join('');
        tape.innerHTML = '<div class="marquee">' + one + one + '</div>';
      }
      async function load() {
        ITEMS = [];
        try {
          var res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22,%22ETHUSDT%22,%22SOLUSDT%22%5D');
          var arr = await res.json();
          if (Array.isArray(arr)) arr.forEach(function (t) {
            var map = { BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL' };
            if (map[t.symbol]) pushItem(map[t.symbol], num(t.lastPrice), num(t.priceChangePercent));
          });
        } catch (e) { /* Binance baÅŸarÄ±sÄ±z â€” OKX dene */ }
        if (ITEMS.length < 3) {
          try {
            var okx = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
            var oj = await okx.json();
            if (oj && oj.data) oj.data.forEach(function (t) {
              var map = { 'BTC-USDT': 'BTC', 'ETH-USDT': 'ETH', 'SOL-USDT': 'SOL' };
              if (map[t.instId]) {
                var last = num(t.last), open = num(t.open24h);
                pushItem(map[t.instId], last, (last !== null && open) ? ((last - open) / open) * 100 : null);
              }
            });
          } catch (e) { /* OKX de baÅŸarÄ±sÄ±z */ }
        }
        try {
          var fx = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=EUR,JPY,TRY');
          var fxj = await fx.json();
          if (fxj && fxj.rates) {
            var r = fxj.rates;
            pushItem('EUR', r.EUR ? 1 / r.EUR : null, null);
            pushItem('JPY', num(r.JPY), null);
            pushItem('TRY', num(r.TRY), null);
          }
        } catch (e) { /* FX yok */ }
        try {
          var gx = await fetch('https://api.gold-api.com/price/XAU');
          var gj = await gx.json();
          if (gj && gj.price) pushItem('XAU', num(gj.price), null);
        } catch (e) { /* AltÄ±n yok */ }
        try {
          var gs = await fetch('https://api.gold-api.com/price/XAG');
          var sj = await gs.json();
          if (sj && sj.price) pushItem('XAG', num(sj.price), null);
        } catch (e) { /* GÃ¼mÃ¼ÅŸ yok */ }
        render();
      }
      window.loadHomeTape = load;
      function boot() {
        load();
        setInterval(load, 60000);
        var sIn = document.getElementById('tv-search-in');
        if (sIn) {
          var SUGGEST = [
            { p: 'BYBIT:BTCUSDT.P', l: 'BTCUSDT.P', x: 'Bybit' },
            { p: 'BITSTAMP:BTCUSD', l: 'BTCUSD', x: 'Bitstamp' },
            { p: 'BYBIT:ETHUSDT.P', l: 'ETHUSDT.P', x: 'Bybit' },
            { p: 'BITSTAMP:ETHUSD', l: 'ETHUSD', x: 'Bitstamp' },
            { p: 'BYBIT:SOLUSDT.P', l: 'SOLUSDT.P', x: 'Bybit' },
            { p: 'COINBASE:SOLUSD', l: 'SOLUSD', x: 'Coinbase' },
            { p: 'OANDA:XAUUSD', l: 'XAUUSD', x: 'OANDA' },
            { p: 'OANDA:XAGUSD', l: 'XAGUSD', x: 'OANDA' },
            { p: 'OANDA:EURUSD', l: 'EURUSD', x: 'OANDA' },
            { p: 'OANDA:USDJPY', l: 'USDJPY', x: 'OANDA' },
            { p: 'OANDA:USDTRY', l: 'USDTRY', x: 'OANDA' },
            { p: 'BIST:XU100', l: 'XU100', x: 'BIST' }
          ];
          var sugBox = document.getElementById('tv-sug');
          function openSym(v) {
            v = (v || '').trim();
            if (!v) return;
            var sym = v.toUpperCase().replace(/\/USDT\.P$/, 'USDT.P').replace(/\/USDT$/, 'USD').replace(/\/USD$/, 'USD');
            if (sym.indexOf(':') === -1 && !/[0-9]/.test(sym)) sym = 'BITSTAMP:' + sym;
            if (window.loadTVChart) window.loadTVChart(sym);
            var lg = document.getElementById('tab-trading');
            if (lg) lg.click();
          }
          function hideSug() { if (sugBox) sugBox.classList.remove('on'); }
          function renderSug() {
            if (!sugBox) return;
            var q = (sIn.value || '').trim().toUpperCase();
            if (q.length < 1) { hideSug(); return; }
            var hits = SUGGEST.filter(function (s) { return s.l.indexOf(q) !== -1 || s.x.toUpperCase().indexOf(q) !== -1; }).slice(0, 8);
            sugBox.innerHTML = '';
            if (!hits.length) { hideSug(); return; }
            hits.forEach(function (h) {
              var it = document.createElement('div');
              it.className = 'tv-sug-item';
              it.innerHTML = '<span class="s-lbl">' + h.l + '</span><span class="s-ex">' + h.x + '</span>';
              it.addEventListener('click', function () {
                sIn.value = h.l;
                hideSug();
                openSym(h.p);
              });
              sugBox.appendChild(it);
            });
            sugBox.classList.add('on');
          }
          sIn.addEventListener('input', renderSug);
          sIn.addEventListener('focus', renderSug);
          sIn.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
              var first = sugBox && sugBox.querySelector('.tv-sug-item');
              if (first) { first.click(); return; }
              openSym(sIn.value);
            }
            if (e.key === 'Escape') hideSug();
          });
          document.addEventListener('click', function (e) {
            if (sugBox && !sugBox.contains(e.target) && e.target !== sIn) hideSug();
          });
        }
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
      else boot();
    })();
    

    (function () {
      window._tvSym = null;
      function loadTVChart(sym) {
        var box = document.getElementById('tv-chart-box');
        if (!box) return;
        window._tvSym = sym || 'BITSTAMP:BTCUSD';
        var isLight = document.documentElement.getAttribute('data-theme') === 'light';
        box.innerHTML = '';
        var s = document.createElement('script');
        s.type = 'text/javascript';
        s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        s.async = true;
        s.textContent = JSON.stringify({
          autosize: true,
          symbol: sym || 'BITSTAMP:BTCUSD',
          interval: '60',
          timezone: 'Europe/Istanbul',
          theme: isLight ? 'light' : 'dark',
          style: '1',
          locale: 'tr',
          backgroundColor: isLight ? 'rgba(255,255,255,1)' : 'rgba(12,13,27,1)',
          gridColor: isLight ? 'rgba(230,232,240,1)' : 'rgba(38,42,78,0.5)',
          allow_symbol_change: true,
          hide_side_toolbar: false,
          details: true,
          hotlist: true,
          withdateranges: true,
          studies: ['Volume@tv-basicstudies']
        });
        box.appendChild(s);
        if (typeof renderWatchlist === 'function') renderWatchlist();
      }
      window.loadTVChart = loadTVChart;
      var WL_KEY = 'alfa-watchlist';
      function wlParse(v) { try { var a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
      function wlLabel(sym) { return sym.indexOf(':') >= 0 ? sym.split(':')[1] : sym; }
      async function renderWatchlist() {
        var box = document.getElementById('wl-items');
        if (!box) return;
        var empty = document.getElementById('wl-empty');
        var list = wlParse(await store.get(WL_KEY));
        box.innerHTML = '';
        if (!list.length) { if (empty) empty.style.display = ''; return; }
        if (empty) empty.style.display = 'none';
        list.forEach(function (sym) {
          var chip = document.createElement('span');
          chip.className = 'wl-chip' + (window._tvSym === sym ? ' on' : '');
          chip.innerHTML = wlLabel(sym) + '<button type="button" class="rm" title="KaldÄ±r">âœ•</button>';
          chip.addEventListener('click', function (ev) {
            if (ev.target.classList.contains('rm')) { removeFromWatchlist(sym); return; }
            if (window.loadTVChart) window.loadTVChart(sym);
          });
          box.appendChild(chip);
        });
      }
      async function addToWatchlist(sym) {
        if (!sym) return;
        var list = wlParse(await store.get(WL_KEY));
        if (list.indexOf(sym) === -1) list.push(sym);
        await store.set(WL_KEY, JSON.stringify(list));
        renderWatchlist();
      }
      async function removeFromWatchlist(sym) {
        var list = wlParse(await store.get(WL_KEY)).filter(function (s) { return s !== sym; });
        await store.set(WL_KEY, JSON.stringify(list));
        renderWatchlist();
      }
      window.renderWatchlist = renderWatchlist;
      function boot() {
        loadTVChart();
        var tg = document.getElementById('themeToggle');
        var tgM = document.getElementById('themeToggleM');
        if (tg) tg.addEventListener('click', function () { setTimeout(loadTVChart, 350); });
        if (tgM) tgM.addEventListener('click', function () { setTimeout(loadTVChart, 350); });
        var addBtn = document.getElementById('wl-add');
        if (addBtn) addBtn.addEventListener('click', function () { addToWatchlist(window._tvSym); });
        renderWatchlist();
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
      else boot();
    })();
    

    (function () {
      var ta = document.getElementById('tv-notes-ta');
      if (!ta) return;
      try { ta.value = localStorage.getItem('alfa-tv-notes') || ''; } catch (e) {}
      ta.addEventListener('input', function () { try { localStorage.setItem('alfa-tv-notes', ta.value); } catch (e) {} });
    })();
    

    (function () {
      var calData = [];
      var calImp = 1;
      function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function impCls(impact) { return String(impact || '').toLowerCase(); }
      function calDayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
      function fmtTime(ts) { var d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
      function dayLabel(ts) {
        var d = new Date(ts), now = new Date();
        var same = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
        var names = ['Pazar', 'Pazartesi', 'SalÄ±', 'Ã‡arÅŸamba', 'PerÅŸembe', 'Cuma', 'Cumartesi'];
        return (same ? 'BugÃ¼n Â· ' : '') + names[d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
      }
      function sortEvents(a, b) { return (a._ts || 0) - (b._ts || 0); }
      function renderCal() {
        var list = document.getElementById('cal-list');
        var status = document.getElementById('cal-status');
        if (!list) return;
        if (!calData.length) { list.innerHTML = '<div class="cal-empty">ğŸ“… Bu hafta iÃ§in veri bulunamadÄ±.</div>'; return; }
        var filtered = calData.filter(function (e) { return calImp === 2 || e.impact === 'high'; }).slice().sort(sortEvents);
        var groups = {};
        filtered.forEach(function (e) { var k = calDayKey(e._ts); (groups[k] = groups[k] || []).push(e); });
        var html = '';
        Object.keys(groups).sort().forEach(function (k) {
          var evs = groups[k];
          html += '<div class="cal-day"><div class="cal-day-head">' + esc(dayLabel(evs[0]._ts)) + '</div>';
          evs.forEach(function (e) {
            var badge = '';
            if (e.impact === 'high') badge = '<span class="cal-imp high">YÃ¼ksek</span>';
            else if (e.impact === 'medium') badge = '<span class="cal-imp medium">Orta</span>';
            else badge = '<span class="cal-imp low">DÃ¼ÅŸÃ¼k</span>';
            html += '<div class="cal-row">' +
              '<span class="cal-time">' + fmtTime(e._ts) + '</span>' +
              '<span class="cal-flag">' + esc(e.country) + '</span>' +
              '<span class="cal-title">' + esc(e.title) + '</span>' +
              badge +
              '<span class="cal-fp">' + (e.forecast ? 'Beklenti: ' + esc(e.forecast) : '') + '</span>' +
              '<span class="cal-fp prev">' + (e.previous ? 'Ã–nceki: ' + esc(e.previous) : '') + '</span>' +
              '</div>';
          });
          html += '</div>';
        });
        list.innerHTML = html;
        if (status) status.textContent = filtered.length + ' etkinlik';
      }
      function loadCal() {
        var list = document.getElementById('cal-list');
        var status = document.getElementById('cal-status');
        if (list) list.innerHTML = '<div class="cal-empty">â³ Takvim yÃ¼kleniyorâ€¦</div>';
        if (status) status.textContent = '';
        fetch('/api/eco-cal').then(function (r) { return r.json(); }).then(function (j) {
          if (j && j.ok && Array.isArray(j.items)) {
            calData = j.items.map(function (e) {
              var ts = e.date ? new Date(e.date).getTime() : 0;
              return { title: e.title, country: e.country, impact: impCls(e.impact), forecast: e.forecast, previous: e.previous, _ts: ts };
            }).filter(function (e) { return e._ts > 0 && e.title; });
          } else {
            calData = [];
            if (status) status.textContent = 'âš  ' + ((j && j.error) || 'Veri alÄ±namadÄ±');
          }
          renderCal();
        }).catch(function () {
          calData = [];
          if (status) status.textContent = 'âš  Takvim yÃ¼klenemedi (aÄŸ hatasÄ±)';
          if (list) list.innerHTML = '<div class="cal-empty">Takvim yÃ¼klenemedi. BaÄŸlantÄ±nÄ± kontrol et.</div>';
        });
      }
      window.loadCal = loadCal;
      document.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('#cal-imp-seg button') : null;
        if (b) {
          calImp = Number(b.getAttribute('data-imp'));
          document.querySelectorAll('#cal-imp-seg button').forEach(function (x) { x.classList.toggle('on-gold', x === b); });
          renderCal();
          return;
        }
        var rf = ev.target.closest ? ev.target.closest('#cal-refresh') : null;
        if (rf) { loadCal(); }
      });
    })();
    

const STORAGE_KEY = 'konfirmasyon-defteri-v3';
// ===== Ä°letiÅŸim / sosyal baÄŸlantÄ±lar (tek yerden dÃ¼zenle) =====
const SOCIAL = {
  telegram: 'https://t.me/alfatradersweb',
  x: 'https://x.com/traderahmet_',
  youtube: 'https://www.youtube.com/@cryptotraderahmet',
  referral: 'https://partner.bybit.com/b/cryptoahmet',
  referralOkx: 'https://www.okx.com/join/CRYPTOAHMET',
};
function applySocial() {
  const set = (ids, url) => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (url) { el.href = url; el.style.display = ''; }
      else { el.style.display = 'none'; }
    });
  };
  /* Landing equity curve â€” aylÄ±k noktalar + hover tooltip */
  (function () {
    const wrap = document.getElementById('hseq-wrap');
    if (!wrap) return;
    const svg = document.getElementById('hseq-svg');
    const ptsEl = document.getElementById('hseq-pts');
    if (!svg || !ptsEl || svg.dataset.ready) return;
    svg.dataset.ready = '1';
    const MONTHS = ['Oca', 'Åub', 'Mar', 'Nis', 'May', 'Haz', 'Tem'];
    const VALS = [-8, 10, 25, 19, 31, 50, 52];
    const W = 400, H = 128, LX = 14, RX = 386, TOP = 20, BOT = 114;
    const min = Math.min(...VALS), max = Math.max(...VALS), rng = (max - min) || 1;
    const X = i => LX + i * ((RX - LX) / (VALS.length - 1));
    const Y = v => BOT - ((v - min) / rng) * (BOT - TOP);
    const path = VALS.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join('');
    const line = VALS.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
    const g1 = (BOT - (BOT - TOP) / 3).toFixed(1), g2 = (BOT - (BOT - TOP) * 2 / 3).toFixed(1);
    svg.innerHTML =
      '<defs>' +
      '<linearGradient id="hseq-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ade80" stop-opacity=".5"/><stop offset="1" stop-color="#4ade80" stop-opacity="0"/></linearGradient>' +
      '<filter id="hseq-g" x="-20%" y="-20%" width="140%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="3.4" flood-color="#4ade80" flood-opacity=".85"/></filter>' +
      '</defs>' +
      '<g class="hs-grid" stroke="rgba(255,255,255,.08)" stroke-width="1">' +
      '<line x1="' + LX + '" y1="' + g1 + '" x2="' + RX + '" y2="' + g1 + '"/>' +
      '<line x1="' + LX + '" y1="' + g2 + '" x2="' + RX + '" y2="' + g2 + '"/>' +
      '</g>' +
      '<path d="' + path + 'L' + RX.toFixed(1) + ',' + BOT + 'L' + LX.toFixed(1) + ',' + BOT + 'Z" fill="url(#hseq-a)"/>' +
      '<polyline points="' + line + '" fill="none" stroke="#4ade80" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#hseq-g)"/>';
    let p = '';
    VALS.forEach((v, i) => {
      p += '<div class="hseq-pt" data-m="' + MONTHS[i] + '" data-v="' + v + '" style="left:' + (X(i) / W * 100).toFixed(2) + '%;top:' + (Y(v) / H * 100).toFixed(2) + '%"><span class="hseq-dot"></span><span class="hseq-lbl">' + MONTHS[i] + '</span></div>';
    });
    ptsEl.innerHTML = p;
    const tip = document.createElement('div');
    tip.id = 'hseq-tip';
    ptsEl.appendChild(tip);
    const fmt = v => (v >= 0 ? '+' : '') + v + 'R';
    ptsEl.addEventListener('mousemove', ev => {
      const g = ev.target.closest('.hseq-pt');
      if (!g) { tip.style.display = 'none'; return; }
      tip.innerHTML = '<b>' + g.dataset.m + '</b> Â· ' + fmt(parseInt(g.dataset.v, 10));
      const pr = wrap.getBoundingClientRect(), gr = g.getBoundingClientRect();
      tip.style.display = 'block';
      tip.style.left = (gr.left - pr.left + gr.width / 2) + 'px';
      tip.style.top = (gr.top - pr.top) + 'px';
    });
    ptsEl.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  })();
  /* Ãœst fiyat ÅŸeridi â€” sÃ¼rÃ¼kleyerek sola/saÄŸa kaydÄ±r */
  (function () {
    const tape = document.getElementById('tv-bar-tape');
    if (!tape) return;
    let startX = null, base = 0, dragging = false;
    const mq = () => tape.querySelector('.marquee');
    const max = () => { const m = mq(); return m ? Math.max(0, m.scrollWidth - tape.clientWidth) : 0; };
    const clamp = x => Math.max(-max(), Math.min(0, x));
    const cur = () => {
      const m = mq();
      if (!m) return 0;
      const t = getComputedStyle(m).transform;
      if (t && t !== 'none') { const mm = t.match(/matrix\((-?[\d.]+),/); if (mm) return parseFloat(mm[1]); }
      return 0;
    };
    const setX = x => { const m = mq(); if (m) m.style.transform = 'translateX(' + x + 'px)'; };
    tape.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startX = e.clientX;
      base = cur();
      dragging = true;
      tape.classList.add('dragging');
      const m = mq();
      if (m) { m.style.animation = 'none'; m.style.willChange = 'transform'; setX(base); }
      try { tape.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    tape.addEventListener('pointermove', e => {
      if (!dragging || startX === null) return;
      setX(clamp(base + (e.clientX - startX)));
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      startX = null;
      tape.classList.remove('dragging');
    };
    tape.addEventListener('pointerup', end);
    tape.addEventListener('pointercancel', end);
    tape.addEventListener('mouseleave', () => {
      if (dragging) return;
      const m = mq();
      if (m) { m.style.animation = ''; m.style.transform = ''; m.style.willChange = ''; }
    });
  })();
  set(['nc-tg', 'nc-tg-m', 'lps-tg', 'lp-comm-tg'], SOCIAL.telegram);
  set(['nc-x', 'nc-x-m', 'lps-x'], SOCIAL.x);
  set(['nc-yt', 'nc-yt-m', 'lps-yt'], SOCIAL.youtube);
  ['bas-ref-link', 'bas-ref-okx'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const key = id === 'bas-ref-link' ? 'referral' : 'referralOkx';
    if (SOCIAL[key]) { el.href = SOCIAL[key]; el.style.display = ''; }
    else { el.style.display = 'none'; }
  });
}
if (typeof document !== 'undefined') {
  if (document.readyState !== 'loading') applySocial();
  else document.addEventListener('DOMContentLoaded', applySocial);
}
// 12â€“17 Temmuz arasÄ± artifact verisinin gÃ¶mÃ¼lÃ¼ yedeÄŸi â€” yalnÄ±zca depo boÅŸsa yÃ¼klenir
const SEED = {"exported": "2026-07-18T13:07:40.649Z", "config": {"pairs": {"BTC": {"thresholds": {"aplus": 70, "b": 50}, "criteria": [{"name": "Spot CVD iÅŸlem yÃ¶nÃ¼nde", "cat": "veri", "l": 8, "s": 8}, {"name": "Open Interest iÅŸlem yÃ¶nÃ¼nde", "cat": "veri", "l": 6, "s": 6}, {"name": "Long & Shorts Ratio iÅŸlem yÃ¶nÃ¼nde", "cat": "veri", "l": 5, "s": 5}, {"name": "Futures CVD iÅŸlem yÃ¶nÃ¼nde", "cat": "veri", "l": 6, "s": 6}, {"name": "Bid & Ask Delta iÅŸlem yÃ¶nÃ¼nde", "cat": "veri", "l": 4, "s": 4}, {"name": "Orderbook kÃ¼melenmesi destekliyor", "cat": "veri", "l": 2, "s": 2}, {"name": "Ä°ÅŸlem trend yÃ¶nÃ¼nde", "cat": "teknik", "l": 10, "s": 10}, {"name": "Key levelda", "cat": "teknik", "l": 10, "s": 10}, {"name": "ManipÃ¼lasyon gerÃ§ekleÅŸti", "cat": "teknik", "l": 8, "s": 8}, {"name": "Bias flip", "cat": "teknik", "l": 3, "s": 3}, {"name": "PlanlanmÄ±ÅŸ entry", "cat": "pozisyon", "l": 31, "s": 31}, {"name": "16:30 sonrasÄ±", "cat": "pozisyon", "l": 3, "s": 3}, {"name": "TP/SL paylaÅŸÄ±mdan Ã¶nce girildi", "cat": "pozisyon", "l": 4, "s": 4}, {"name": "Uykusuz / yorgunum", "cat": "duygu", "l": -8, "s": -8}, {"name": "Stresliyim (trade dÄ±ÅŸÄ± kaynak)", "cat": "duygu", "l": -6, "s": -6}, {"name": "AÅŸÄ±rÄ± yoÄŸun / bÃ¶lÃ¼nmÃ¼ÅŸ dikkat", "cat": "duygu", "l": -6, "s": -6}, {"name": "Az Ã¶nce stop oldum â€” revenge penceresi", "cat": "duygu", "l": -12, "s": -12}, {"name": "FOMO â€” hareket kaÃ§Ä±yor hissi", "cat": "duygu", "l": -12, "s": -12}, {"name": "PnL paylaÅŸtÄ±m / coÅŸku halindeyim", "cat": "duygu", "l": -8, "s": -8}]}, "XAU": {"thresholds": {"aplus": 70, "b": 50}, "criteria": [{"name": "Spot CVD iÅŸlem yÃ¶nÃ¼nde", "cat": "veri", "l": 8, "s": 8}, {"name": "Open Interest iÅŸlem yÃ¶nÃ¼nde", "cat": "veri", "l": 6, "s": 6}, {"name": "Long & Shorts Ratio iÅŸlem yÃ¶nÃ¼nde", "cat": "veri", "l": 5, "s": 5}, {"name": "Futures CVD iÅŸlem yÃ¶nÃ¼nde", "cat": "veri", "l": 6, "s": 6}, {"name": "Bid & Ask Delta iÅŸlem yÃ¶nÃ¼nde", "cat": "veri", "l": 4, "s": 4}, {"name": "Orderbook kÃ¼melenmesi destekliyor", "cat": "veri", "l": 2, "s": 2}, {"name": "Ä°ÅŸlem trend yÃ¶nÃ¼nde", "cat": "teknik", "l": 10, "s": 10}, {"name": "Key levelda", "cat": "teknik", "l": 10, "s": 10}, {"name": "ManipÃ¼lasyon gerÃ§ekleÅŸti", "cat": "teknik", "l": 8, "s": 8}, {"name": "Bias flip", "cat": "teknik", "l": 3, "s": 3}, {"name": "PlanlanmÄ±ÅŸ entry", "cat": "pozisyon", "l": 31, "s": 31}, {"name": "16:30 sonrasÄ±", "cat": "pozisyon", "l": 3, "s": 3}, {"name": "TP/SL paylaÅŸÄ±mdan Ã¶nce girildi", "cat": "pozisyon", "l": 4, "s": 4}, {"name": "Uykusuz / yorgunum", "cat": "duygu", "l": -8, "s": -8}, {"name": "Stresliyim (trade dÄ±ÅŸÄ± kaynak)", "cat": "duygu", "l": -6, "s": -6}, {"name": "AÅŸÄ±rÄ± yoÄŸun / bÃ¶lÃ¼nmÃ¼ÅŸ dikkat", "cat": "duygu", "l": -6, "s": -6}, {"name": "Az Ã¶nce stop oldum â€” revenge penceresi", "cat": "duygu", "l": -12, "s": -12}, {"name": "FOMO â€” hareket kaÃ§Ä±yor hissi", "cat": "duygu", "l": -12, "s": -12}, {"name": "PnL paylaÅŸtÄ±m / coÅŸku halindeyim", "cat": "duygu", "l": -8, "s": -8}]}}, "strategies": ["Breaker", "Breaker Traps", "LHPB", "Monday Manipulation", "Asia Range", "IFVG", "0.382", "Friday Manipulation"], "matrix": {"Paz": {"London": "B", "NY": "B"}, "Pzt": {"London": "A+", "NY": "B"}, "Sal": {"London": "A+", "NY": "A+"}, "Ã‡ar": {"London": "A+", "NY": "A+"}, "Per": {"London": "A+", "NY": "A+"}, "Cum": {"London": "A+", "NY": "A+"}, "Cmt": {"London": "A+", "NY": "A+"}}, "migr2": true, "migr3": true, "migr4": true}, "trades": [{"id":1785301800000,"date":"28/07","time":"21:30","pair":"BTC","dir":"LONG","score":0,"verdict":"A+","crits":[],"miss":[],"mood":0,"day":"Sal","sess":"London","cell":"","cap":false,"strat":"Monday Manipulation","sent":"","r":"0","override":true}, {"id":1785204240000,"date":"27/07","time":"14:04","pair":"BTC","dir":"LONG","score":86,"verdict":"B","crits":[{"n":"Spot CVD iÅŸlem yÃ¶nÃ¼nde","p":8},{"n":"Open Interest iÅŸlem yÃ¶nÃ¼nde","p":6},{"n":"Long & Shorts Ratio iÅŸlem yÃ¶nÃ¼nde","p":5},{"n":"Futures CVD iÅŸlem yÃ¶nÃ¼nde","p":6},{"n":"Bid & Ask Delta iÅŸlem yÃ¶nÃ¼nde","p":4},{"n":"Orderbook kÃ¼melenmesi destekliyor","p":2},{"n":"Ä°ÅŸlem trend yÃ¶nÃ¼nde","p":10},{"n":"Key levelda","p":10},{"n":"PlanlanmÄ±ÅŸ entry","p":31},{"n":"TP/SL paylaÅŸÄ±mdan Ã¶nce girildi","p":4}],"miss":["ManipÃ¼lasyon gerÃ§ekleÅŸti","Bias flip","16:30 sonrasÄ±","Uykusuz / yorgunum","Stresliyim (trade dÄ±ÅŸÄ± kaynak)","AÅŸÄ±rÄ± yoÄŸun / bÃ¶lÃ¼nmÃ¼ÅŸ dikkat","Az Ã¶nce stop oldum â€” revenge penceresi","FOMO â€” hareket kaÃ§Ä±yor hissi","PnL paylaÅŸtÄ±m / coÅŸku halindeyim"],"mood":0,"day":"Pzt","sess":"London","cell":"B","cap":false,"strat":"IFVG","sent":"","r":"-0.33"}, {"id": 1785138660000, "date": "22/07", "time": "19:51", "pair": "BTC", "dir": "LONG", "score": 100, "verdict": "A+", "crits": [{"n": "Spot CVD iÅŸlem yÃ¶nÃ¼nde", "p": 8}, {"n": "Open Interest iÅŸlem yÃ¶nÃ¼nde", "p": 6}, {"n": "Long & Shorts Ratio iÅŸlem yÃ¶nÃ¼nde", "p": 5}, {"n": "Futures CVD iÅŸlem yÃ¶nÃ¼nde", "p": 6}, {"n": "Bid & Ask Delta iÅŸlem yÃ¶nÃ¼nde", "p": 4}, {"n": "Orderbook kÃ¼melenmesi destekliyor", "p": 2}, {"n": "Ä°ÅŸlem trend yÃ¶nÃ¼nde", "p": 10}, {"n": "Key levelda", "p": 10}, {"n": "ManipÃ¼lasyon gerÃ§ekleÅŸti", "p": 8}, {"n": "PlanlanmÄ±ÅŸ entry", "p": 31}, {"n": "16:30 sonrasÄ±", "p": 3}, {"n": "TP/SL paylaÅŸÄ±mdan Ã¶nce girildi", "p": 4}], "miss": ["Bias flip", "Uykusuz / yorgunum", "Stresliyim (trade dÄ±ÅŸÄ± kaynak)", "AÅŸÄ±rÄ± yoÄŸun / bÃ¶lÃ¼nmÃ¼ÅŸ dikkat", "Az Ã¶nce stop oldum â€” revenge penceresi", "FOMO â€” hareket kaÃ§Ä±yor hissi", "PnL paylaÅŸtÄ±m / coÅŸku halindeyim"], "mood": 0, "day": "Ã‡ar", "sess": "NY", "cell": "A+", "cap": false, "strat": "0.382", "sent": "SHORT", "r": "-1"}, {"id": 1784305032899, "date": "17/07", "time": "19:17", "pair": "BTC", "dir": "SHORT", "score": 75, "verdict": "A+", "crits": [{"n": "Spot CVD iÅŸlem yÃ¶nÃ¼nde", "p": 8}, {"n": "Open Interest iÅŸlem yÃ¶nÃ¼nde", "p": 6}, {"n": "Long & Shorts Ratio iÅŸlem yÃ¶nÃ¼nde", "p": 5}, {"n": "Futures CVD iÅŸlem yÃ¶nÃ¼nde", "p": 6}, {"n": "Bid & Ask Delta iÅŸlem yÃ¶nÃ¼nde", "p": 4}, {"n": "ManipÃ¼lasyon gerÃ§ekleÅŸti", "p": 8}, {"n": "PlanlanmÄ±ÅŸ entry", "p": 31}, {"n": "16:30 sonrasÄ±", "p": 3}, {"n": "TP/SL paylaÅŸÄ±mdan Ã¶nce girildi", "p": 4}], "miss": ["Orderbook kÃ¼melenmesi destekliyor", "Ä°ÅŸlem trend yÃ¶nÃ¼nde", "Key levelda", "Bias flip", "Uykusuz / yorgunum", "Stresliyim (trade dÄ±ÅŸÄ± kaynak)", "AÅŸÄ±rÄ± yoÄŸun / bÃ¶lÃ¼nmÃ¼ÅŸ dikkat", "Az Ã¶nce stop oldum â€” revenge penceresi", "FOMO â€” hareket kaÃ§Ä±yor hissi", "PnL paylaÅŸtÄ±m / coÅŸku halindeyim"], "mood": 0, "day": "Cum", "sess": "NY", "cell": "A+", "cap": false, "strat": "Friday Manipulation", "r": "-1"}, {"id": 1784227494999, "date": "16/07", "time": "21:44", "pair": "BTC", "dir": "SHORT", "score": 87, "verdict": "A+", "crits": [{"n": "Spot CVD iÅŸlem yÃ¶nÃ¼nde", "p": 8}, {"n": "Open Interest iÅŸlem yÃ¶nÃ¼nde", "p": 6}, {"n": "Long & Shorts Ratio iÅŸlem yÃ¶nÃ¼nde", "p": 5}, {"n": "Futures CVD iÅŸlem yÃ¶nÃ¼nde", "p": 6}, {"n": "Bid & Ask Delta iÅŸlem yÃ¶nÃ¼nde", "p": 4}, {"n": "Orderbook kÃ¼melenmesi destekliyor", "p": 2}, {"n": "Key levelda", "p": 10}, {"n": "ManipÃ¼lasyon gerÃ§ekleÅŸti", "p": 8}, {"n": "PlanlanmÄ±ÅŸ entry", "p": 31}, {"n": "16:30 sonrasÄ±", "p": 3}, {"n": "TP/SL paylaÅŸÄ±mdan Ã¶nce girildi", "p": 4}], "miss": ["Ä°ÅŸlem trend yÃ¶nÃ¼nde", "Bias flip", "Uykusuz / yorgunum", "Stresliyim (trade dÄ±ÅŸÄ± kaynak)", "AÅŸÄ±rÄ± yoÄŸun / bÃ¶lÃ¼nmÃ¼ÅŸ dikkat", "Az Ã¶nce stop oldum â€” revenge penceresi", "FOMO â€” hareket kaÃ§Ä±yor hissi", "PnL paylaÅŸtÄ±m / coÅŸku halindeyim"], "mood": 0, "day": "Per", "sess": "NY", "cell": "A+", "cap": false, "strat": "Breaker", "r": ""}, {"id": 1784016989916, "date": "14/07", "time": "11:16", "pair": "BTC", "dir": "SHORT", "score": 65, "verdict": "B", "crits": [{"n": "Spot CVD iÅŸlem yÃ¶nÃ¼nde", "p": 8}, {"n": "Open Interest iÅŸlem yÃ¶nÃ¼nde", "p": 6}, {"n": "Futures CVD iÅŸlem yÃ¶nÃ¼nde", "p": 6}, {"n": "Key levelda", "p": 10}, {"n": "PlanlanmÄ±ÅŸ entry", "p": 31}, {"n": "TP/SL paylaÅŸÄ±mdan Ã¶nce girildi", "p": 4}], "miss": ["Long & Shorts Ratio iÅŸlem yÃ¶nÃ¼nde", "Bid & Ask Delta iÅŸlem yÃ¶nÃ¼nde", "Orderbook kÃ¼melenmesi destekliyor", "Ä°ÅŸlem trend yÃ¶nÃ¼nde", "ManipÃ¼lasyon gerÃ§ekleÅŸti", "Bias flip", "16:30 sonrasÄ±", "Uykusuz / yorgunum", "Stresliyim (trade dÄ±ÅŸÄ± kaynak)", "AÅŸÄ±rÄ± yoÄŸun / bÃ¶lÃ¼nmÃ¼ÅŸ dikkat", "Az Ã¶nce stop oldum â€” revenge penceresi", "FOMO â€” hareket kaÃ§Ä±yor hissi", "PnL paylaÅŸtÄ±m / coÅŸku halindeyim"], "mood": 0, "day": "Sal", "sess": "London", "cell": "A+", "cap": false, "strat": "Asia Range", "r": "-0.3"}, {"id": 1783955071586, "date": "13/07", "time": "18:04", "pair": "BTC", "dir": "SHORT", "score": 73, "verdict": "B", "crits": [{"n": "Spot CVD dÃ¼ÅŸÃ¼yor", "p": 8}, {"n": "Open Interest yÃ¼ksek / artÄ±yor", "p": 7}, {"n": "Futures CVD iÅŸlem yÃ¶nÃ¼nde", "p": 6}, {"n": "Bid & Ask Delta iÅŸlem yÃ¶nÃ¼nde", "p": 5}, {"n": "Key levelda", "p": 11}, {"n": "PlanlanmÄ±ÅŸ entry", "p": 30}, {"n": "TP/SL paylaÅŸÄ±mdan Ã¶nce girildi", "p": 6}], "miss": ["Spot CVD yÃ¼kseliyor", "Long & Shorts Ratio aÅŸÄ±rÄ± long", "Orderbook kÃ¼melenmesi destekliyor", "Ä°ÅŸlem trend yÃ¶nÃ¼nde", "ManipÃ¼lasyon gerÃ§ekleÅŸti", "Bias flip", "16:30 sonrasÄ±", "Uykusuz / yorgunum", "Stresliyim (trade dÄ±ÅŸÄ± kaynak)", "AÅŸÄ±rÄ± yoÄŸun / bÃ¶lÃ¼nmÃ¼ÅŸ dikkat", "Az Ã¶nce stop oldum â€” revenge penceresi", "FOMO â€” hareket kaÃ§Ä±yor hissi", "PnL paylaÅŸtÄ±m / coÅŸku halindeyim"], "r": "-0.15", "override": true, "strat": "Sunday Market Structure "}, {"id": 1783882244056, "date": "12/07", "time": "21:50", "pair": "BTC", "dir": "SHORT", "score": 82, "verdict": "B", "crits": ["Spot CVD dÃ¼ÅŸÃ¼yor", "Long & Shorts Ratio aÅŸÄ±rÄ± long", "Futures CVD iÅŸlem yÃ¶nÃ¼nde", "Bid & Ask Delta iÅŸlem yÃ¶nÃ¼nde", "Key levelda", "ManipÃ¼lasyon gerÃ§ekleÅŸti", "PlanlanmÄ±ÅŸ entry", "TP/SL paylaÅŸÄ±mdan Ã¶nce girildi"], "r": "1.2", "override": true, "strat": "Monday Morning Manipulation"}], "dailyPlans": {"2026-07-27":{"bias":"BULLISH","pair":"BTC","sabah":"","senaryo":"fiyatÄ±n trend yÃ¶nlÃ¼ en azÄ±ndan 65.8k'ya kadar yÃ¼kseleceÄŸini dÃ¼ÅŸÃ¼nÃ¼yorum.","anti":"fiyat haftayÄ± yÃ¼kseliÅŸle aÃ§tÄ± Ã¶nce late longcularÄ± avlayÄ±p sonra yÃ¼kseltebilir.","setup":"IFVG","gunsonu":""},"2026-07-28":{"bias":"BULLISH","pair":"BTC","sabah":"","senaryo":"","anti":"","setup":"Monday Manipulation","gunsonu":"saat 21:30 civarÄ±nda hala yÃ¼kselemeyen fiyat dÃ¼ÅŸer diye iÅŸlemi kapattÄ±m yarÄ±n fiyat dÃ¼ÅŸmÃ¼ÅŸtÃ¼."},"2026-07-12": {"bias": "BEARISH", "pair": "BTC", "sabah": "abd iranÄ± vurabilir ", "senaryo": "fiyat en azÄ±ndan bi 61k civarÄ±na gitmesi gerektiÄŸini dÃ¼ÅŸÃ¼nÃ¼yorum. EÄŸer fiyat 65k Ã¼stÃ¼ne Ã§Ä±karsa bozulur", "anti": "ÅŸuanda markette hala hacim yok likiditie alÄ±mÄ± yapÄ±lmÄ±ÅŸ gibi geldi ama aslÄ±nda gelmedi, orayÄ± bir hacimle manipÃ¼le edebilir ve stop olabilirsin.", "setup": "", "gunsonu": "plana uydum tek yaptÄ±ÄŸÄ±m hata 2R da tp girmemekti, iÅŸlem tam hedefe giderken ufak bi pips ile geri dÃ¶ndÃ¼ hala bekliyorum ayrÄ±ca iyi yaptÄ±ÄŸÄ±m ÅŸey erken entry stop atmamaktÄ± gece aÃ§Ä±lÄ±ÅŸÄ±yla fiyat yukarÄ±yÄ± avlamÄ±ÅŸ ve dÃ¼ÅŸmÃ¼ÅŸ. "}, "2026-07-13": {"bias": "BEARISH", "pair": "BTC", "sabah": "iran her an saldÄ±rabilir manipÃ¼lasyon saatleri sabah 13:46", "senaryo": "4h pin bar bÄ±raktÄ±k Ã¼stÃ¼nÃ¼ avladÄ±k fiyat aÅŸaÄŸÄ± doÄŸru dÃ¼ÅŸtÃ¼ demekki gÃ¼Ã§sÃ¼z gÃ¶rÃ¼nÃ¼yor. \n\n63.5k Ã¼stÃ¼nde kapatÄ±rsa bu dÃ¼ÅŸÃ¼ncem bozulur. ", "anti": "AÅŸaÄŸÄ± dÃ¼ÅŸtÃ¼ shortlayalÄ±m diyen early shortÃ§ularÄ± avlamak isteyip tekrar 63.250'yi avlayabilirler ny aÃ§Ä±lÄ±ÅŸÄ±yla ama neden bunu yapsÄ±nlar. ", "setup": "", "gunsonu": "fiyat hedefine ulaÅŸtÄ± high avalamadan eÄŸer dar stoplu iÅŸlem aÃ§saydÄ±m minimum 0.9r poz vardÄ± ama asÄ±l target aÅŸaÄŸÄ± aÃ§Ä±k likidite olduÄŸu iÃ§in aÃ§Ä±k HL yaptÄ±ktan sonra geri dÃ¶ndÃ¼ 0.5r'dan poz dÃ¶ndÃ¼. Bu arada riskim 0.3r pzt sabah olduÄŸu iÃ§in riskli zaman dilimi."}, "2026-07-14": {"bias": "BULLISH", "pair": "BTC", "sabah": "15:30'da tÃ¼fe var. ", "senaryo": "fiyatÄ±n 61.5k civarÄ±na dÃ¼ÅŸeceÄŸini dÃ¼ÅŸÃ¼nÃ¼yorum. YÃ¼kselecekse bile en azÄ±ndan 62.2k dan yÃ¼kselmeli (VAL) \n\n\nFiyat 62.9k Ã¼stÃ¼nde saatlik kapanÄ±ÅŸ yaparsa bias bozulur.\n\n\nsaat 16:11 ÅŸuan fiyat yukarÄ±yÄ± avladÄ±, hem sr bÃ¶lgesine geri Ã§ekilip daha sonra yukarÄ±daki likiditeleri avlayabilir veriler beni doÄŸruluyor. \n\nEÄŸer fiyat 62.7k altÄ±nda 1h kapanÄ±ÅŸlar yaparsa uza. ", "anti": "fiyat iÃ§ yapÄ±da deÄŸiÅŸim gerÃ§ekleÅŸtirdi, o sebeple Ã¶nce monday high alabilir. \n\nsaat:16:18Fiyat haberle yÃ¼kseldi bu yÃ¼zden tam tersi yÃ¶nlÃ¼ dÃ¼ÅŸebilir ters bir haberle", "setup": "ya 16:30 dan sonraki harekete gÃ¶re girersin ya da fiyatÄ±n 61.5k sonrasÄ± yapacaÄŸÄ± harekete bakarsÄ±n. \n\n\n16:18Fiyat 63k'daki sr bÃ¶lgesine geri Ã§ekilirse 0.382 iÅŸlemini alÄ±rsÄ±n.", "gunsonu": "iÅŸlem 1.78RR verdiÄŸi iÃ§in ve aleyhime ilerlediÄŸi iÃ§in iÅŸlemden Ã§Ä±kÄ±p tekrar 2RR olacak ÅŸekilde girdim. \n\nHaber geldi fiyat bi anda stop oldu iÅŸlemler. "}, "2026-07-16": {"bias": "BEARISH", "pair": "BTC", "sabah": "haber yok fiyat bearish", "senaryo": "fiyat yukarÄ±yÄ± avladÄ± market yapÄ±sÄ± deÄŸiÅŸti hedefler aÅŸaÄŸÄ±sÄ± \n\nfiyat 65.6k Ã¼stÃ¼ kapatÄ±rsa", "anti": "herkes buradan short dÃ¼ÅŸÃ¼nÃ¼yor, range Ã§ok bariz trend bullish orderbook seviyeleri var.", "setup": "breaker+range", "gunsonu": "plana uydum genel olarak, sadece 2. iÅŸlem intraday alÄ±nabilirdi 2R veriyordu riski artÄ±rmamak iÃ§in almadÄ±m ama tp oldu."}, "2026-07-17": {"bias": "BEARISH", "pair": "BTC", "sabah": "", "senaryo": "fiyat 63.3k manipÃ¼le edip altÄ±nda kapanÄ±ÅŸlar yaparsa cuma 18:00'dan sonra shortla. ", "anti": "fiyatta hacim artÄ±yor, Ã§oÄŸu kiÅŸi shortta range iÃ§in fiyatÄ± yÃ¼kseltebilirler. ", "setup": "cuma akÅŸamÄ± 18:00 civarÄ± manipÃ¼lasyonu tradele.", "gunsonu": "evet manipÃ¼lasyonu bekledim ve ifvg ile iÅŸleme dahil oldum ama stop oldum."}, "2026-07-22": {"bias": "BULLISH", "pair": "BTC", "sabah": "Olumlu bir haber gelebilir", "senaryo": "Fiyat eÄŸer 65.7k civarÄ± 2 adet kÃ¶tÃ¼ mum atarsa dÃ¼ÅŸebilir", "anti": "Impulsive entry almak isteyen beni ve htf ciddi bir direnÃ§ noktasÄ±nda olduÄŸu iÃ§in efloud beni stoplayabilir", "setup": "Breaker / 0.382", "gunsonu": ""}}};
const CATS = { veri: 'Veri', teknik: 'Teknik', pozisyon: 'Pozisyon', duygu: 'Duygu' };

// ============ Kimlik + Bulut YapÄ±landÄ±rmasÄ± (Supabase) ============
// AÅŸaÄŸÄ±daki iki deÄŸeri kendi Supabase projenden alÄ±p yapÄ±ÅŸtÄ±r.
// BoÅŸ bÄ±rakÄ±lÄ±rsa uygulama eskisi gibi YALNIZCA bu cihazda (yerel) Ã§alÄ±ÅŸÄ±r â€” hiÃ§bir ÅŸey bozulmaz.
const SUPABASE_URL = 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';

const AUTH = {
  client: null,
  user: null,      // giriÅŸ yapÄ±lÄ±nca Supabase kullanÄ±cÄ± nesnesi
  cloud: {},       // bu kullanÄ±cÄ±nÄ±n tÃ¼m anahtar->deÄŸer haritasÄ± (bellek iÃ§i ayna)
  ns: '',          // localStorage iÃ§in kullanÄ±cÄ±ya Ã¶zel Ã¶nek
  syncTimer: null
};
const AUTH_ENABLED = /^https?:\/\//.test(SUPABASE_URL)
  && SUPABASE_ANON_KEY.length > 20
  && typeof window !== 'undefined' && window.supabase && window.supabase.createClient;

function scheduleCloudSync() {
  if (!AUTH.user) return;
  clearTimeout(AUTH.syncTimer);
  AUTH.syncTimer = setTimeout(pushCloud, 700);
}
async function pushCloud() {
  if (!AUTH.user || !AUTH.client) return;
  try {
    await AUTH.client.from('journals').upsert({
      user_id: AUTH.user.id,
      data: AUTH.cloud,
      updated_at: new Date().toISOString()
    });
  } catch (e) { /* Ã§evrimdÄ±ÅŸÄ± olabilir; yerel ayna korunur */ }
}

// Depolama katmanÄ±:
//  - GiriÅŸ yapÄ±lmÄ±ÅŸsa  -> veriler AUTH.cloud haritasÄ±nda tutulur ve Supabase'e senkronlanÄ±r (cihazlar arasÄ±).
//  - GiriÅŸ yoksa       -> eski davranÄ±ÅŸ: window.storage (Claude) ya da localStorage (bu cihaz).
const store = {
  async get(k) {
    if (AUTH.user) {
      if (k in AUTH.cloud) return AUTH.cloud[k];
      try { const v = localStorage.getItem(AUTH.ns + k); if (v !== null) return v; } catch (e) {}
      return null;
    }
    if (window.storage && window.storage.get) {
      try { const r = await window.storage.get(k); return r && r.value ? r.value : null; }
      catch (e) { /* anahtar yok ya da eriÅŸilemedi */ }
    }
    try { return localStorage.getItem(k); } catch (e) { return null; }
  },
  async set(k, v) {
    if (AUTH.user) {
      AUTH.cloud[k] = v;
      try { localStorage.setItem(AUTH.ns + k, v); } catch (e) { /* ayna dolabilir */ }
      scheduleCloudSync();
      return true;
    }
    let ok = false;
    if (window.storage && window.storage.set) {
      try { await window.storage.set(k, v); ok = true; } catch (e) { /* devam */ }
    }
    if (!ok) { try { localStorage.setItem(k, v); ok = true; } catch (e) { /* hafÄ±zada kalÄ±r */ } }
    return ok;
  },
  async list(prefix) {
    if (AUTH.user) return Object.keys(AUTH.cloud).filter(k => k.indexOf(prefix) === 0);
    if (window.storage && window.storage.list) {
      try { const r = await window.storage.list(prefix); return (r && r.keys) ? r.keys : []; }
      catch (e) { /* devam */ }
    }
    try { return Object.keys(localStorage).filter(k => k.indexOf(prefix) === 0); }
    catch (e) { return []; }
  }
};

function defaultPair() {
  return {
    thresholds: { aplus: 70, b: 50 },
    criteria: [
      { name: 'Spot CVD iÅŸlem yÃ¶nÃ¼nde', cat: 'veri', l: 8, s: 8 },
      { name: 'Open Interest iÅŸlem yÃ¶nÃ¼nde', cat: 'veri', l: 6, s: 6 },
      { name: 'Long & Shorts Ratio iÅŸlem yÃ¶nÃ¼nde', cat: 'veri', l: 5, s: 5 },
      { name: 'Futures CVD iÅŸlem yÃ¶nÃ¼nde', cat: 'veri', l: 6, s: 6 },
      { name: 'Bid & Ask Delta iÅŸlem yÃ¶nÃ¼nde', cat: 'veri', l: 4, s: 4 },
      { name: 'Orderbook kÃ¼melenmesi destekliyor', cat: 'veri', l: 2, s: 2 },
      { name: 'Ä°ÅŸlem trend yÃ¶nÃ¼nde', cat: 'teknik', l: 10, s: 10 },
      { name: 'Key levelda', cat: 'teknik', l: 10, s: 10 },
      { name: 'ManipÃ¼lasyon gerÃ§ekleÅŸti', cat: 'teknik', l: 8, s: 8 },
      { name: 'Bias flip', cat: 'teknik', l: 3, s: 3 },
      { name: 'PlanlanmÄ±ÅŸ entry', cat: 'pozisyon', l: 31, s: 31 },
      { name: '16:30 sonrasÄ±', cat: 'pozisyon', l: 3, s: 3 },
      { name: 'TP/SL paylaÅŸÄ±mdan Ã¶nce girildi', cat: 'pozisyon', l: 4, s: 4 },
      { name: 'Uykusuz / yorgunum', cat: 'duygu', l: -8, s: -8 },
      { name: 'Stresliyim (trade dÄ±ÅŸÄ± kaynak)', cat: 'duygu', l: -6, s: -6 },
      { name: 'AÅŸÄ±rÄ± yoÄŸun / bÃ¶lÃ¼nmÃ¼ÅŸ dikkat', cat: 'duygu', l: -6, s: -6 },
      { name: 'Az Ã¶nce stop oldum â€” revenge penceresi', cat: 'duygu', l: -12, s: -12 },
      { name: 'FOMO â€” hareket kaÃ§Ä±yor hissi', cat: 'duygu', l: -12, s: -12 }
    ]
  };
}

function defaultXauPair() {
  return {
    thresholds: { aplus: 70, b: 50 },
    criteria: [
      // VERÄ° â€” gold'da orderflow konfluensi yok; sadece kÄ±rmÄ±zÄ± haber cezasÄ±
      { name: 'KÄ±rmÄ±zÄ± haber var / yaklaÅŸÄ±yor', cat: 'veri', l: -15, s: -15 },
      // TEKNÄ°K â€” gold'un Ã§ekirdeÄŸi burada (7 kalem toplamÄ± = 70, tam A+ eÅŸiÄŸi)
      { name: 'ManipÃ¼lasyon kesin', cat: 'teknik', l: 14, s: 14 },
      { name: 'Likidite alÄ±ndÄ±', cat: 'teknik', l: 14, s: 14 },
      { name: 'Daily / 4H OTE bÃ¶lgesinde', cat: 'teknik', l: 10, s: 10 },
      { name: 'Daily / 4H arz-talep bÃ¶lgesinde', cat: 'teknik', l: 10, s: 10 },
      { name: 'YapÄ± net', cat: 'teknik', l: 8, s: 8 },
      { name: 'GÃ¼nlÃ¼k / 4H / 1H mum uyumlu', cat: 'teknik', l: 8, s: 8 },
      { name: 'ManipÃ¼lasyon saatinde', cat: 'teknik', l: 6, s: 6 },
      // POZÄ°SYON â€” planlÄ± giriÅŸ otoritesi + iki ceza
      { name: 'Entry sabah yazÄ±lan Daily Bias planÄ±ndan geliyor (seans iÃ§inde Ã¼retilmedi)', cat: 'pozisyon', l: 20, s: 20 },
      { name: 'PeÅŸ peÅŸe 2. kez aynÄ± bÃ¶lgeden giriyorum', cat: 'pozisyon', l: -12, s: -12 },
      { name: 'Daily plana zÄ±t iÅŸlem', cat: 'pozisyon', l: -15, s: -15 },
      // DUYGU â€” cezalar (kilit)
      { name: 'Uykusuz / yorgunum', cat: 'duygu', l: -8, s: -8 },
      { name: 'Stresliyim (trade dÄ±ÅŸÄ± kaynak)', cat: 'duygu', l: -6, s: -6 },
      { name: 'Az Ã¶nce stop oldum â€” revenge penceresi', cat: 'duygu', l: -12, s: -12 },
      { name: 'FOMO â€” hareket kaÃ§Ä±yor hissi', cat: 'duygu', l: -12, s: -12 }
    ]
  };
}

let config = { pairs: { BTC: defaultPair(), XAU: defaultXauPair() } };
let pair = 'BTC';
let direction = 'LONG';
let checked = new Set();

const DAYS = ['Paz', 'Pzt', 'Sal', 'Ã‡ar', 'Per', 'Cum', 'Cmt'];
const SESSIONS = ['London', 'NY'];
let session = 'London';
let strat = '';

// ============ Yapay Zeka Profili (izole â€” kullanÄ±cÄ± config'ine dokunmaz) ============
const AI_PROFILE_KEY = 'defter-ai-profile-v1';
let aiProfile = null;   // { market, experience, strategy, emotions[], problem, interest, gold, lastPair, criteria[], thresholds, strategies[], pos[], summary }
let aiActive = false;
let aiPrevPair = 'BTC';

function aiGold() { return !!(aiActive && aiProfile && aiProfile.gold); }

async function loadAiProfile() {
  try {
    const raw = await store.get(AI_PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.criteria)) { aiProfile = p; aiActive = false; }
    }
  } catch (e) { /* boÅŸ baÅŸla */ }
}
async function saveAiProfile() {
  if (!aiProfile) return;
  try { await store.set(AI_PROFILE_KEY, JSON.stringify(aiProfile)); } catch (e) { /* izole */ }
}
function applyAiProfile() {
  if (!aiProfile) return;
  aiPrevPair = pair;
  aiActive = true;
  pair = aiProfile.gold ? 'XAU' : 'BTC';
  checked = new Set(); sent = ''; posChecked = new Set(); intent = ''; mood = 0;
  const mr = document.getElementById('mood-range'); if (mr) mr.value = 0;
  renderAiBanner();
  renderPairs(); renderCriteria(); render(); renderSent(); renderPos(); applyPairPanels(); renderMatrix();
  if (typeof renderMood === 'function') renderMood();
  if (typeof renderIntent === 'function') renderIntent();
  const pf = document.getElementById('d-pair'); if (pf) pf.value = pair;
  if (document.getElementById('editor').classList.contains('open')) renderEditor();
}
function exitAiProfile() {
  if (!aiActive) return;
  aiActive = false;
  pair = aiPrevPair;
  checked = new Set(); sent = ''; posChecked = new Set(); intent = ''; mood = 0;
  const mr = document.getElementById('mood-range'); if (mr) mr.value = 0;
  renderAiBanner();
  renderPairs(); renderCriteria(); render(); renderSent(); renderPos(); applyPairPanels(); renderMatrix();
  if (typeof renderMood === 'function') renderMood();
  if (typeof renderIntent === 'function') renderIntent();
  const pf = document.getElementById('d-pair'); if (pf) pf.value = pair;
  if (document.getElementById('editor').classList.contains('open')) renderEditor();
}
function renderAiBanner() {
  const b = document.getElementById('ai-banner');
  if (!b) return;
  const name = document.getElementById('ai-banner-name');
  if (aiActive && aiProfile) {
    b.classList.remove('hidden');
    const emos = (aiProfile.emotions && aiProfile.emotions.length)
      ? ' Â· ' + aiProfile.emotions.join(', ') : '';
    name.textContent = (aiProfile.gold ? 'AltÄ±n (XAU)' : 'Kripto') + ' profili' +
      (aiProfile.strategy ? ' Â· ' + aiProfile.strategy : '') + emos;
  } else {
    b.classList.add('hidden');
  }
}

function pairDays(p) {
  const isGold = p === 'XAU' || p.indexOf('XAU') !== -1 || p.indexOf('GOLD') !== -1;
  return isGold ? ['Pzt', 'Sal', 'Ã‡ar', 'Per', 'Cum'] : ['Pzt', 'Sal', 'Ã‡ar', 'Per', 'Cum', 'Cmt', 'Paz'];
}
function pairSessions(p) {
  const isGold = p === 'XAU' || p.indexOf('XAU') !== -1 || p.indexOf('GOLD') !== -1;
  return isGold ? ['â€”'] : ['London', 'NY'];
}
function defaultStrategiesFor(p) {
  const isGold = p === 'XAU' || p.indexOf('XAU') !== -1 || p.indexOf('GOLD') !== -1;
  return isGold
    ? ['Breaker', 'Breaker Traps', 'LHPB/LLPB', 'IFVG']
    : ['Breaker', 'LHPB', 'Monday Manipulation', 'Asia Range', 'IFVG', '0.382'];
}
function defaultStrategies() { return defaultStrategiesFor('BTC'); }
function defaultMatrixFor(p) {
  const m = {};
  pairDays(p).forEach(d => {
    m[d] = {};
    pairSessions(p).forEach(sess => {
      // gold: pazartesi tavanÄ± B (A+ olamaz); geri kalan A+
      m[d][sess] = (p !== 'BTC' && d === 'Pzt') ? 'B' : 'A+';
    });
  });
  return m;
}
function defaultMatrix() { return defaultMatrixFor('BTC'); }
function stratsFor(p) {
  if (aiActive && aiProfile && Array.isArray(aiProfile.strategies) && aiProfile.strategies.length) return aiProfile.strategies;
  if (!config.stratByPair) config.stratByPair = {};
  if (!Array.isArray(config.stratByPair[p])) config.stratByPair[p] = defaultStrategiesFor(p).slice();
  return config.stratByPair[p];
}
function matrixFor(p) {
  if (!config.matrixByPair) config.matrixByPair = {};
  if (!config.matrixByPair[p]) config.matrixByPair[p] = defaultMatrixFor(p);
  // eksik gÃ¼n/seans tamamla
  pairDays(p).forEach(d => {
    if (!config.matrixByPair[p][d]) config.matrixByPair[p][d] = {};
    pairSessions(p).forEach(sess => {
      if (!config.matrixByPair[p][d][sess]) {
        config.matrixByPair[p][d][sess] = (p !== 'BTC' && d === 'Pzt') ? 'B' : 'A+';
      }
    });
  });
  return config.matrixByPair[p];
}
function ensureConfigShape() {
  if (!Array.isArray(config.strategies)) config.strategies = defaultStrategies();
  if (!config.matrix) config.matrix = defaultMatrix();
  if (!config.migr2) {
    const old = ['WOS', 'Breaker Trap v2', 'Contrarian Short'];
    config.strategies = config.strategies.filter(s => !old.includes(s));
    config.matrix = defaultMatrix();
    config.migr2 = true;
  }
  if (!config.migr3) {
    // hazÄ±r strateji listesi Ã¶ne eklenir, kullanÄ±cÄ±nÄ±n kendi ekledikleri korunur
    const mine = defaultStrategies();
    const extras = config.strategies.filter(s => !mine.includes(s));
    config.strategies = mine.concat(extras);
    config.migr3 = true;
  }
  if (!config.migr4) {
    // kriter varsayÄ±lanlarÄ± otomatik yenilenir; kullanÄ±cÄ±nÄ±n kendi eklediÄŸi satÄ±rlar korunur
    const oldNames = [
      'Spot CVD yÃ¼kseliyor', 'Spot CVD dÃ¼ÅŸÃ¼yor', 'Open Interest yÃ¼ksek / artÄ±yor',
      'Long & Shorts Ratio aÅŸÄ±rÄ± long'
    ];
    Object.keys(config.pairs).forEach(p => {
      const defs = defaultPair().criteria;
      const known = new Set(defs.map(c => c.name).concat(oldNames));
      const customs = (config.pairs[p].criteria || []).filter(c => c && c.name && !known.has(c.name));
      const th = config.pairs[p].thresholds || { aplus: 70, b: 50 };
      config.pairs[p] = { thresholds: th, criteria: defs.concat(customs) };
    });
    config.migr4 = true;
  }
  if (!config.migr5) {
    // XAU (ve GOLD adlÄ± pairler) kripto kriterlerinden altÄ±na Ã¶zel sete geÃ§irilir;
    // kullanÄ±cÄ±nÄ±n kendi eklediÄŸi satÄ±rlar korunur
    const cryptoNames = new Set(defaultPair().criteria.map(c => c.name));
    const xauNames = new Set(defaultXauPair().criteria.map(c => c.name));
    Object.keys(config.pairs).forEach(p => {
      if (p !== 'XAU' && p.indexOf('GOLD') === -1 && p.indexOf('XAU') === -1) return;
      const defs = defaultXauPair().criteria;
      const customs = (config.pairs[p].criteria || [])
        .filter(c => c && c.name && !cryptoNames.has(c.name) && !xauNames.has(c.name));
      const th = config.pairs[p].thresholds || { aplus: 70, b: 50 };
      config.pairs[p] = { thresholds: th, criteria: defs.concat(customs) };
    });
    config.migr5 = true;
  }
  if (!config.migr6) {
    // Breaker Traps stratejisi emekli edildi â€” chip listesinden dÃ¼ÅŸer, eski iÅŸlem kayÄ±tlarÄ± etkilenmez
    config.strategies = (config.strategies || []).filter(s => s !== 'Breaker Traps');
    config.migr6 = true;
  }
  if (!config.migr7) {
    // Duygu paneli kilit moduna geÃ§ti; 'PnL paylaÅŸtÄ±m' pozisyon-esnasÄ± paneline taÅŸÄ±ndÄ±
    Object.keys(config.pairs).forEach(p => {
      config.pairs[p].criteria = (config.pairs[p].criteria || [])
        .filter(c => c.name !== 'PnL paylaÅŸtÄ±m / coÅŸku halindeyim');
    });
    config.migr7 = true;
  }
  if (!config.migr8) {
    // XAU profili yeniden tasarlandÄ± (gold-spesifik teknik + ceza seti); kullanÄ±cÄ±nÄ±n kendi eklediÄŸi satÄ±rlar korunur
    const oldXauNames = new Set([
      'DXY iÅŸlem yÃ¶nÃ¼nÃ¼ destekliyor', 'Futures CVD iÅŸlem yÃ¶nÃ¼nde', 'Open Interest iÅŸlem yÃ¶nÃ¼nde',
      'Takvim temiz â€” kÄ±rmÄ±zÄ± haber yok / geÃ§ti', 'Ä°ÅŸlem HTF trend yÃ¶nÃ¼nde', 'HTF key levelda (H4 / Daily)',
      'Likidite sÃ¼pÃ¼rÃ¼ldÃ¼ (stop hunt / manipÃ¼lasyon)', 'LHPB/LLPB kapanÄ±ÅŸ teyidi geldi',
      'Order Ã¶nceden yerleÅŸtirildi â€” tipi ve seviyesi kontrol edildi', 'London / NY kill zone iÃ§inde',
      'Rejim DeÄŸiÅŸim Testi geÃ§ti (Kural VIII â€” LONG ÅŸartÄ±)'
    ]);
    const newXauNames = new Set(defaultXauPair().criteria.map(c => c.name));
    Object.keys(config.pairs).forEach(p => {
      if (p !== 'XAU' && p.indexOf('XAU') === -1 && p.indexOf('GOLD') === -1) return;
      const customs = (config.pairs[p].criteria || [])
        .filter(c => c && c.name && !oldXauNames.has(c.name) && !newXauNames.has(c.name));
      const th = config.pairs[p].thresholds || { aplus: 70, b: 50 };
      config.pairs[p] = { thresholds: th, criteria: defaultXauPair().criteria.concat(customs) };
    });
    config.migr8 = true;
  }
  if (!config.migr9) {
    // strateji & matris pariteye Ã¶zel hale geldi; eski ortak deÄŸerler BTC'ye taÅŸÄ±nÄ±r, XAU kendi setine kurulur
    config.stratByPair = config.stratByPair || {};
    config.matrixByPair = config.matrixByPair || {};
    if (Array.isArray(config.strategies)) {
      const mine = defaultStrategiesFor('BTC');
      const extras = config.strategies.filter(x => !mine.includes(x));
      config.stratByPair.BTC = mine.concat(extras);
    }
    if (config.matrix) config.matrixByPair.BTC = config.matrix;
    Object.keys(config.pairs).forEach(p => {
      if (p === 'BTC') return;
      config.stratByPair[p] = defaultStrategiesFor(p).slice();
      config.matrixByPair[p] = defaultMatrixFor(p);
    });
    config.migr9 = true;
  }
  if (!config.migr10) {
    // Gold teknik setine OTE + arz-talep kalemleri eklendi, teknik puanlar yeniden dengelendi (7 kalem = 70)
    const newTech = {
      'ManipÃ¼lasyon kesin': 12, 'Likidite alÄ±ndÄ±': 12, 'YapÄ± net': 10,
      'Daily / 4H OTE bÃ¶lgesinde': 10, 'Daily / 4H arz-talep bÃ¶lgesinde': 10,
      'GÃ¼nlÃ¼k / 4H / 1H mum bakÄ±ldÄ±': 8, 'ManipÃ¼lasyon saatinde': 8
    };
    const goldDefNames = new Set(defaultXauPair().criteria.map(c => c.name));
    Object.keys(config.pairs).forEach(p => {
      if (p !== 'XAU' && p.indexOf('XAU') === -1 && p.indexOf('GOLD') === -1) return;
      const crit = config.pairs[p].criteria || [];
      // mevcut teknik kalemlerin puanÄ±nÄ± gÃ¼ncelle
      crit.forEach(c => { if (c.cat === 'teknik' && newTech[c.name] !== undefined) { c.l = newTech[c.name]; c.s = newTech[c.name]; } });
      // eksik yeni teknik kalemleri, son teknik kalemin ardÄ±na ekle
      ['Daily / 4H OTE bÃ¶lgesinde', 'Daily / 4H arz-talep bÃ¶lgesinde'].forEach(nm => {
        if (!crit.some(c => c.name === nm)) {
          let lastTech = -1;
          crit.forEach((c, i) => { if (c.cat === 'teknik') lastTech = i; });
          const row = { name: nm, cat: 'teknik', l: newTech[nm], s: newTech[nm] };
          if (lastTech >= 0) crit.splice(lastTech + 1, 0, row); else crit.push(row);
        }
      });
      config.pairs[p].criteria = crit;
    });
    config.migr10 = true;
  }
  if (!config.migr11) {
    const newTech = {
      'ManipÃ¼lasyon kesin': 14, 'Likidite alÄ±ndÄ±': 14,
      'Daily / 4H OTE bÃ¶lgesinde': 10, 'Daily / 4H arz-talep bÃ¶lgesinde': 10,
      'YapÄ± net': 8, 'GÃ¼nlÃ¼k / 4H / 1H mum uyumlu': 8, 'ManipÃ¼lasyon saatinde': 6
    };
    const dropEmo = new Set(['Ã–nceki iÅŸlemi kaÃ§Ä±rdÄ±m â€” telafi hissi var', 'BugÃ¼n aynÄ± bias ile 2. kez giriyorum']);
    Object.keys(config.pairs).forEach(p => {
      if (p !== 'XAU' && p.indexOf('XAU') === -1 && p.indexOf('GOLD') === -1) return;
      let crit = config.pairs[p].criteria || [];
      // mum kriterini yeniden adlandÄ±r
      crit.forEach(c => { if (c.name === 'GÃ¼nlÃ¼k / 4H / 1H mum bakÄ±ldÄ±') c.name = 'GÃ¼nlÃ¼k / 4H / 1H mum uyumlu'; });
      // teknik puanlarÄ± gÃ¼ncelle
      crit.forEach(c => { if (c.cat === 'teknik' && newTech[c.name] !== undefined) { c.l = newTech[c.name]; c.s = newTech[c.name]; } });
      // iki duygu kalemini Ã§Ä±kar
      crit = crit.filter(c => !dropEmo.has(c.name));
      config.pairs[p].criteria = crit;
    });
    // gold strateji listesinden 0.382 ve Monday Manipulation Ã§Ä±kar
    if (config.stratByPair) {
      Object.keys(config.stratByPair).forEach(p => {
        if (p !== 'XAU' && p.indexOf('XAU') === -1 && p.indexOf('GOLD') === -1) return;
        config.stratByPair[p] = (config.stratByPair[p] || []).filter(s => s !== '0.382' && s !== 'Monday Manipulation');
      });
    }
    config.migr11 = true;
  }
  Object.keys(config.pairs || { BTC: 1 }).forEach(p => { stratsFor(p); matrixFor(p); });
  if (config.matrix) DAYS.forEach(d => {
    if (!config.matrix[d]) config.matrix[d] = { London: 'A+', NY: 'A+' };
    SESSIONS.forEach(s => { if (!config.matrix[d][s]) config.matrix[d][s] = 'A+'; });
    delete config.matrix[d].Asya;
  });
}
function todayName() { return DAYS[new Date().getDay()]; }
let selDay = 'Pzt';
function curSessions() { return pairSessions(pair); }
function curDays() { return pairDays(pair); }
function currentCell() {
  const mx = matrixFor(pair);
  const sess = curSessions().length === 1 ? curSessions()[0] : session;
  if (!mx[selDay] || mx[selDay][sess] === undefined) return 'A+';
  return mx[selDay][sess];
}
function autoSession() {
  const d = new Date(); const m = d.getHours() * 60 + d.getMinutes();
  return m < 990 ? 'London' : 'NY'; // 16:30 Ã¶ncesi London, sonrasÄ± NY
}

function cfg() {
  if (aiActive && aiProfile && Array.isArray(aiProfile.criteria)) return aiProfile;
  return config.pairs[pair];
}
function zoneColor(pct, lit) {
  const a = cfg().thresholds.aplus, b = cfg().thresholds.b;
  if (pct >= a) return lit ? '#34d399' : '#e4f3ea';
  if (pct >= b) return lit ? '#d97706' : '#f7ecd9';
  return lit ? '#f87171' : '#f6e2e2';
}
function renderGauge(score) {
  const arc = document.getElementById('donut-arc');
  if (arc) {
    const s = Math.max(0, Math.min(100, score));
    arc.style.setProperty('--p', s);
    arc.style.setProperty('--arc-c', zoneColor(s, true));
  }
}
function ptsFor(c) { return direction === 'LONG' ? Number(c.l) || 0 : Number(c.s) || 0; }

let mood = 0;
let sent = ''; // '' | 'LONG' | 'SHORT' â€” kalabalÄ±ÄŸÄ±n yÃ¶nÃ¼
let intent = ''; // '' | 'setup' | 'emo' â€” giriÅŸ niyeti
const SENT_PTS = 6;

function renderIntent() {
  const bs = document.getElementById('intent-setup');
  const be = document.getElementById('intent-emo');
  bs.className = intent === 'setup' ? 'on-good' : '';
  be.className = intent === 'emo' ? 'on-bad' : '';
}

function sentPts() {
  const isGold = pair === 'XAU' || pair.indexOf('XAU') !== -1 || pair.indexOf('GOLD') !== -1;
  if (isGold || !sent) return 0;
  return sent === direction ? -SENT_PTS : SENT_PTS;
}
// â€”â€”â€” Pozisyon EsnasÄ±nda: mÃ¼dahale filtresi â€”â€”â€”
// valid=true satÄ±rlar plan gereÄŸi Ã§Ä±kÄ±ÅŸ sebebidir; diÄŸerleri dÃ¼rtÃ¼dÃ¼r, kapatma gerekÃ§esi deÄŸildir
const POS_ITEMS_BTC = [
  { name: 'Ä°nvalidasyon gerÃ§ekleÅŸti â€” senaryo bozuldu', valid: true },
  { name: 'Planda yazÄ±lÄ± haber riski geldi / yaklaÅŸÄ±yor', valid: true },
  { name: 'Fiyat istediÄŸim gibi gitmiyor (invalidasyon yok)', valid: false },
  { name: 'PnL paylaÅŸtÄ±m', valid: false },
  { name: "TP'nin ucundan geri dÃ¶ndÃ¼ â€” kapat dÃ¼rtÃ¼sÃ¼", valid: false },
  { name: "Breakeven'a Ã§ekme dÃ¼rtÃ¼sÃ¼", valid: false },
  { name: 'Her muma tepki veriyorum â€” ekrandan kalk', valid: false }
];
// Gold: soru formatlÄ± kontrol listesi â€” invalidasyon Ã§Ä±kÄ±ÅŸ sebebi, gerisi "doÄŸru yaptÄ±n mÄ±" denetimi
const POS_ITEMS_XAU = [
  { name: 'Ä°nvalidasyon gerÃ§ekleÅŸti mi?', valid: true },
  { name: 'TP doÄŸru ÅŸekilde mi uzatÄ±ldÄ±?', valid: false },
  { name: 'Murphy yasasÄ± doÄŸru hesaplandÄ± mÄ±?', valid: false },
  { name: 'Geceye bÄ±rakÄ±lan iÅŸlem mantÄ±klÄ± mÄ±?', valid: false },
  { name: 'TP ucundan dÃ¶nen iÅŸlem kapandÄ± mÄ±?', valid: false }
];
function posItems() {
  if (aiActive && aiProfile && Array.isArray(aiProfile.pos) && aiProfile.pos.length) return aiProfile.pos;
  const isGold = pair === 'XAU' || pair.indexOf('XAU') !== -1 || pair.indexOf('GOLD') !== -1;
  if (!config.posByPair) config.posByPair = {};
  if (!Array.isArray(config.posByPair[pair])) {
    const seed = isGold ? POS_ITEMS_XAU : POS_ITEMS_BTC;
    config.posByPair[pair] = seed.map(x => ({ name: x.name, valid: x.valid }));
  }
  return config.posByPair[pair];
}

function openPosEditor() {
  const body = document.getElementById('note-popup-body');
  const popup = document.getElementById('note-popup');
  const items = posItems();
  const box = document.createElement('div');
  const h = document.createElement('h2');
  h.textContent = 'Pozisyon EsnasÄ±nda â€” DÃ¼zenle';
  box.appendChild(h);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.style.cssText = 'margin:0 0 12px;';
  hint.textContent = 'CÃ¼mleyi deÄŸiÅŸtir, Ã‡IKIÅ (plan gereÄŸi kapatma sebebi) / DÃœRTÃœ (hissi kapatma gerekÃ§esi) seÃ§, Ã— ile sil ya da en alta yeni ekle. Kaydedince panel anÄ±nda gÃ¼ncellenir.';
  box.appendChild(hint);
  const rows = document.createElement('div');
  rows.id = 'pe-rows';
  const addRow = (it) => {
    const row = document.createElement('div'); row.className = 'pe-row';
    const inp = document.createElement('input'); inp.value = it.name; inp.placeholder = 'Kural cÃ¼mlesi';
    inp.addEventListener('input', () => { it.name = inp.value; });
    const sel = document.createElement('select');
    const o1 = document.createElement('option'); o1.value = 'cikis'; o1.textContent = 'Ã‡IKIÅ';
    const o2 = document.createElement('option'); o2.value = 'durtu'; o2.textContent = 'DÃœRTÃœ';
    sel.appendChild(o1); sel.appendChild(o2);
    sel.value = it.valid ? 'cikis' : 'durtu';
    sel.addEventListener('change', () => { it.valid = sel.value === 'cikis'; });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'pe-del'; del.textContent = 'Ã—'; del.title = 'Sil';
    del.addEventListener('click', () => { const i = items.indexOf(it); if (i > -1) items.splice(i, 1); row.remove(); });
    row.appendChild(inp); row.appendChild(sel); row.appendChild(del);
    rows.appendChild(row);
  };
  items.forEach(addRow);
  box.appendChild(rows);
  const add = document.createElement('button'); add.type = 'button'; add.className = 'btn pe-add'; add.textContent = '+ Yeni ekle';
  add.addEventListener('click', () => { const it = { name: '', valid: false }; items.push(it); addRow(it); });
  box.appendChild(add);
  const acts = document.createElement('div'); acts.className = 'actions';
  acts.style.cssText = 'justify-content:flex-start;margin-top:14px;';
  const save = document.createElement('button'); save.type = 'button'; save.className = 'btn solid'; save.textContent = 'Kaydet';
  save.addEventListener('click', () => {
    items.forEach(it => { it.name = String(it.name || '').trim(); });
    for (let i = items.length - 1; i >= 0; i--) { if (!items[i].name) items.splice(i, 1); }
    posChecked = new Set();
    saveConfig(); renderPos();
    closeNotePopup();
  });
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn'; cancel.textContent = 'VazgeÃ§';
  cancel.addEventListener('click', closeNotePopup);
  acts.appendChild(save); acts.appendChild(cancel);
  box.appendChild(acts);
  body.innerHTML = '';
  body.appendChild(box);
  const content = popup.querySelector('.note-popup-content');
  if (content) content.classList.add('wide');
  popup.classList.remove('hidden');
}

// ============ Yapay Zeka ile Checklist ============
const AI_EMOS = [
  { v: 'fomo', lbl: 'FOMO' },
  { v: 'revenge', lbl: 'Revenge' },
  { v: 'impatience', lbl: 'SabÄ±rsÄ±zlÄ±k' },
  { v: 'fear', lbl: 'Korku / Ã‡ekinme' },
  { v: 'overconfidence', lbl: 'AÅŸÄ±rÄ± Ã¶zgÃ¼ven' },
  { v: 'distracted', lbl: 'Dikkat daÄŸÄ±nÄ±klÄ±ÄŸÄ±' },
  { v: 'overtrading', lbl: 'AÅŸÄ±rÄ± iÅŸlem' }
];
const AI_CONCEPTS = [
  { v: 'ICT', lbl: 'ICT / SMC' },
  { v: 'PA', lbl: 'Price Action' },
  { v: 'IND', lbl: 'Ä°ndikatÃ¶rler' },
  { v: 'OF', lbl: 'Orderflow' },
  { v: 'ONC', lbl: 'On-chain' },
  { v: 'KLASIK', lbl: 'Klasik / Fib' }
];
let aiEmoDraft = [];
let aiConceptDraft = [];

function renderAiConcepts() {
  const box = document.getElementById('ai-concepts');
  if (!box) return;
  box.innerHTML = '';
  AI_CONCEPTS.forEach(e => {
    const c = document.createElement('span');
    c.className = 'chip' + (aiConceptDraft.includes(e.v) ? ' on' : '');
    c.textContent = e.lbl;
    c.setAttribute('role', 'button');
    c.addEventListener('click', () => {
      if (aiConceptDraft.includes(e.v)) aiConceptDraft = aiConceptDraft.filter(x => x !== e.v);
      else aiConceptDraft.push(e.v);
      renderAiConcepts();
    });
    box.appendChild(c);
  });
}

function renderAiEmos() {
  const box = document.getElementById('ai-emos');
  if (!box) return;
  box.innerHTML = '';
  AI_EMOS.forEach(e => {
    const c = document.createElement('span');
    c.className = 'chip' + (aiEmoDraft.includes(e.v) ? ' on' : '');
    c.textContent = e.lbl;
    c.setAttribute('role', 'button');
    c.addEventListener('click', () => {
      if (aiEmoDraft.includes(e.v)) aiEmoDraft = aiEmoDraft.filter(x => x !== e.v);
      else aiEmoDraft.push(e.v);
  renderAiEmos();
  renderAiConcepts();
    });
    box.appendChild(c);
  });
}

function aiProfileFromForm() {
  return {
    market: document.getElementById('ai-market').value,
    experience: document.getElementById('ai-exp').value,
    style: document.getElementById('ai-style').value,
    risk: document.getElementById('ai-rtf').value,
    concepts: aiConceptDraft.slice(),
    strategy: document.getElementById('ai-strat').value.trim(),
    emotions: aiEmoDraft.slice(),
    problem: document.getElementById('ai-problem').value.trim(),
    interest: document.getElementById('ai-interest').value.trim()
  };
}

function fallbackAiProfile(form) {
  const market = String(form.market || 'kripto').toLowerCase();
  const gold = market.indexOf('xau') !== -1 || market.indexOf('gold') !== -1;
  const fx = market.indexOf('fx') !== -1 || market.indexOf('endeks') !== -1;
  const beginner = String(form.experience || '').indexOf('yeni') !== -1;
  const style = String(form.style || 'intraday').toLowerCase();
  const rtf = String(form.risk || 'orta').toLowerCase();
  const concepts = (Array.isArray(form.concepts) ? form.concepts : []).map(String);
  const has = (v) => concepts.indexOf(v) !== -1;
  const emoPts = { fomo: 12, revenge: 12, impatience: 10, fear: 8, overconfidence: 10, distracted: 8, overtrading: 10 };
  const emoChipLbl = { fomo: 'FOMO â€” hareket kaÃ§Ä±yor hissi', revenge: 'Az Ã¶nce stop oldum â€” revenge penceresi', impatience: 'SabÄ±rsÄ±zlÄ±k â€” setup eksikken girme dÃ¼rtÃ¼sÃ¼', fear: 'Korku / Ã§ekinme â€” plana raÄŸmen girememe', overconfidence: 'AÅŸÄ±rÄ± Ã¶zgÃ¼ven â€” risk bÃ¼yÃ¼tme dÃ¼rtÃ¼sÃ¼', distracted: 'Dikkat daÄŸÄ±nÄ±klÄ±ÄŸÄ± / bÃ¶lÃ¼nmÃ¼ÅŸ odak', overtrading: 'AÅŸÄ±rÄ± iÅŸlem â€” boÅŸ ekran dÃ¼rtÃ¼sÃ¼' };
  const criteria = [];
  const add = (c) => { if (!criteria.some(x => x.name === c.name)) criteria.push(c); };

  // ---------- VERÄ° ----------
  if (gold) {
    add({ name: 'KÄ±rmÄ±zÄ± haber var / yaklaÅŸÄ±yor (merkez bankasÄ±, ABD verileri)', cat: 'veri', l: -15, s: -15 });
    add({ name: 'DXY (dolar endeksi) iÅŸlem yÃ¶nÃ¼yle uyumlu', cat: 'veri', l: 6, s: 6 });
    add({ name: 'Veri takvimi sakin â€” sÃ¼rpriz riski dÃ¼ÅŸÃ¼k', cat: 'veri', l: 5, s: 5 });
  } else if (fx) {
    add({ name: 'Pariteyi etkileyen haber / merkez bankasÄ± sakin', cat: 'veri', l: -12, s: -12 });
    add({ name: 'Dolar endeksi / ilgili Ã§apraz trend yÃ¶nÃ¼nde', cat: 'veri', l: 5, s: 5 });
    add({ name: 'Likidite penceresi (London/NY aÃ§Ä±lÄ±ÅŸÄ±) uygun', cat: 'veri', l: 4, s: 4 });
  } else {
    add({ name: 'BTC genel trendi iÅŸlem yÃ¶nÃ¼nde (H1/gÃ¼nlÃ¼k)', cat: 'veri', l: 7, s: 7 });
    add({ name: 'Kripto-aktif haber riski yok (CPI/FED/ETF olayÄ±)', cat: 'veri', l: 5, s: 5 });
    if (has('OF')) {
      add({ name: 'Spot CVD iÅŸlem yÃ¶nÃ¼nde', cat: 'veri', l: 6, s: 6 });
      add({ name: 'Futures CVD iÅŸlem yÃ¶nÃ¼nde', cat: 'veri', l: 5, s: 5 });
      add({ name: 'Open Interest aÅŸÄ±rÄ± kalabalÄ±k deÄŸil / yÃ¶nÃ¼ destekliyor', cat: 'veri', l: 4, s: 4 });
      add({ name: 'Funding normal â€” aÅŸÄ±rÄ± long/short birikmiÅŸ deÄŸil', cat: 'veri', l: 4, s: 4 });
      add({ name: 'Orderbook kÃ¼melenmesi entry alanÄ±nÄ± destekliyor', cat: 'veri', l: 3, s: 3 });
    } else if (has('ONC')) {
      add({ name: 'Whale / bÃ¼yÃ¼k akÄ±ÅŸ iÅŸlem yÃ¶nÃ¼nde', cat: 'veri', l: 5, s: 5 });
      add({ name: 'Funding / OI aÅŸÄ±rÄ± kalabalÄ±k deÄŸil', cat: 'veri', l: 5, s: 5 });
      add({ name: 'Exchange rezervlerinde anomali yok', cat: 'veri', l: 3, s: 3 });
    } else {
      add({ name: 'Hacim artÄ±ÅŸÄ± yÃ¶nÃ¼ doÄŸruluyor', cat: 'veri', l: 5, s: 5 });
      add({ name: 'Funding / OI normal â€” aÅŸÄ±rÄ± kalabalÄ±k deÄŸil', cat: 'veri', l: 4, s: 4 });
    }
  }

  // ---------- TEKNÄ°K ----------
  if (has('ICT')) {
    add({ name: 'Likidite / eÅŸikler alÄ±ndÄ± (sweep) â€” tuzak temizlendi', cat: 'teknik', l: 11, s: 11 });
    add({ name: 'ManipÃ¼lasyon gerÃ§ekleÅŸti â€” fiyat Ã¶nce yanlÄ±ÅŸ yÃ¶ne gitti', cat: 'teknik', l: 9, s: 9 });
    add({ name: 'OTE bÃ¶lgesinde reaksiyon bekleniyor', cat: 'teknik', l: 8, s: 8 });
    add({ name: 'Daily bias ile uyumlu', cat: 'teknik', l: 7, s: 7 });
    add({ name: 'Order block / FVG alanÄ±na denk geliyor', cat: 'teknik', l: 7, s: 7 });
    add({ name: 'BOS / CHoCH ile yapÄ± doÄŸrulandÄ±', cat: 'teknik', l: 6, s: 6 });
    add({ name: 'Killzone (Asian/London/NY) saatine uygun', cat: 'teknik', l: 5, s: 5 });
  }
  if (has('PA')) {
    add({ name: 'Ana destek / direnÃ§ seviyesinde', cat: 'teknik', l: 8, s: 8 });
    add({ name: 'Trend yÃ¶nÃ¼ne doÄŸru tepki mumu (engulfing/pin)', cat: 'teknik', l: 6, s: 6 });
    add({ name: 'GÃ¼nlÃ¼k / 4H / 1H mum yapÄ±larÄ± uyumlu', cat: 'teknik', l: 6, s: 6 });
  }
  if (has('IND')) {
    add({ name: 'EMA / VWAP yÃ¶nÃ¼ iÅŸlemle uyumlu', cat: 'teknik', l: 5, s: 5 });
    add({ name: 'RSI aÅŸÄ±rÄ± alÄ±m / satÄ±mda deÄŸil', cat: 'teknik', l: 4, s: 4 });
    add({ name: 'MACD / osilatÃ¶r teyidi var', cat: 'teknik', l: 3, s: 3 });
  }
  if (has('KLASIK') || (!has('ICT') && !has('PA') && !has('IND'))) {
    add({ name: 'S/R ya da fib bÃ¶lgesinde', cat: 'teknik', l: 7, s: 7 });
    add({ name: 'YapÄ± net (HH/HL veya LH/LL)', cat: 'teknik', l: 6, s: 6 });
    add({ name: 'Trend yÃ¶nÃ¼ iÅŸlem yÃ¶nÃ¼nde', cat: 'teknik', l: 5, s: 5 });
    add({ name: 'Key seviyede denge â€” ilk deneme deÄŸil, tepki var', cat: 'teknik', l: 4, s: 4 });
  }
  if (!criteria.some(c => c.cat === 'teknik')) {
    add({ name: 'YapÄ± net ve key seviyede', cat: 'teknik', l: 8, s: 8 });
  }

  // ---------- POZÄ°SYON ----------
  add({ name: 'Bu setup planda yazÄ±lÄ±ydÄ± â€” canlÄ± icat deÄŸil', cat: 'pozisyon', l: 16, s: 16 });
  add({ name: 'RR en az 1:3 (kÃ¼Ã§Ã¼k risk, bÃ¼yÃ¼k TP)', cat: 'pozisyon', l: 9, s: 9 });
  add({ name: 'Risk oranÄ± Ã¶nceden yazÄ±ldÄ± (risk/bakiye)', cat: 'pozisyon', l: 8, s: 8 });
  add({ name: 'SL anlamlÄ± seviyenin Ã¶tesinde â€” stop bilinÃ§li kondu', cat: 'pozisyon', l: 7, s: 7 });
  add({ name: 'GiriÅŸ tetikleyicisi net â€” â€œbu seviye gÃ¶rÃ¼lÃ¼rse girerimâ€', cat: 'pozisyon', l: 7, s: 7 });
  if (rtf === 'dÃ¼ÅŸÃ¼k') add({ name: 'Parti bÃ¼yÃ¼klÃ¼ÄŸÃ¼ normalin altÄ±nda (dÃ¼ÅŸÃ¼k risk modu)', cat: 'pozisyon', l: 6, s: 6 });
  if (rtf === 'yÃ¼ksek') add({ name: 'Risk payÄ± agresif modda bile bÃ¼yÃ¼tÃ¼lmedi', cat: 'pozisyon', l: 6, s: 6 });
  if (style === 'swing' || style === 'mix') add({ name: 'Geceye / hafta sonuna kalma kararÄ± mantÄ±klÄ±', cat: 'pozisyon', l: 5, s: 5 });
  if (beginner) add({ name: 'Risk masadan Ã¶nce yazÄ±ldÄ± â€” ekran aÃ§Ä±lmadan', cat: 'pozisyon', l: 9, s: 9 });

  // ---------- DUYGU (negatif kilit) ----------
  (form.emotions || []).forEach(v => {
    const lbl = emoChipLbl[v];
    const pts = emoPts[v] || 8;
    if (lbl) add({ name: lbl, cat: 'duygu', l: -pts, s: -pts });
  });
  add({ name: 'Uykusuz / yorgunum', cat: 'duygu', l: -8, s: -8 });
  add({ name: 'GÃ¼nÃ¼n hedefi doldu â€” ekstra iÅŸlem dÃ¼rtÃ¼sÃ¼', cat: 'duygu', l: -8, s: -8 });
  if (String(form.problem || '').indexOf('stop') !== -1) {
    add({ name: 'Stop dÃ¼ÅŸÃ¼nÃ¼yorum â€” plan yoksa hareket yok', cat: 'duygu', l: -10, s: -10 });
  }

  // ---------- STRATEJÄ°LER ----------
  const strategies = String(form.strategy || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  const defaults = [];
  if (has('ICT')) defaults.push('Breaker', 'IFVG', 'OTE', 'Sweep & Reclaim');
  if (has('PA')) defaults.push('S/R Bounce', 'Trend Follow');
  if (has('IND')) defaults.push('EMA Pullback', 'VWAP Reclaim');
  if (has('OF')) defaults.push('CVD Diverjans', 'Liquidity Grab');
  if (has('ONC')) defaults.push('Funding + Whale Flow');
  if (gold) defaults.push('Breaker', 'LHPB/LLPB', 'IFVG');
  if (!has('ICT') && !has('PA') && !has('IND') && !has('OF') && !has('ONC') && !gold) defaults.push('Breaker', 'LHPB', 'IFVG');
  defaults.forEach(s => { if (!strategies.includes(s)) strategies.push(s); });

  // ---------- POZÄ°SYON KURALLARI ----------
  const pos = [];
  if (has('ICT')) pos.push({ name: 'Ä°nvalidasyon: OTE reaksiyonu almadÄ± â€” senaryo bozuldu', valid: true });
  else pos.push({ name: 'Ä°nvalidasyon gerÃ§ekleÅŸti â€” senaryo bozuldu', valid: true });
  pos.push({ name: 'Planda yazÄ±lÄ± haber riski geldi / yaklaÅŸÄ±yor', valid: true });
  pos.push({ name: 'Fiyat istediÄŸim gibi gitmiyor (invalidasyon yok)', valid: false });
  pos.push({ name: 'PnL paylaÅŸtÄ±m', valid: false });
  pos.push({ name: 'TPâ€™nin ucundan geri dÃ¶ndÃ¼ â€” kapat dÃ¼rtÃ¼sÃ¼', valid: false });
  pos.push({ name: 'Her muma tepki veriyorum â€” ekrandan kalk', valid: false });
  if (beginner) pos.push({ name: 'Belirsizlikte plana dÃ¶n â€” akÅŸamki yazÄ±ya bak', valid: false });

  const posTot = criteria.filter(c => c.cat === 'pozisyon').reduce((a, c) => a + c.l, 0);
  const sum = 'Profiline gÃ¶re hazÄ±rlandÄ±: ' +
    (gold ? 'altÄ±n (XAU) iÃ§in haber+DXY+likidite aÄŸÄ±rlÄ±klÄ±' : fx ? 'FX iÃ§in haber+trend+seviye aÄŸÄ±rlÄ±klÄ±' : 'kripto iÃ§in BTC trendi + ' + (has('OF') ? 'orderflow' : has('ONC') ? 'onchain' : 'hacim') + ' aÄŸÄ±rlÄ±klÄ±') +
    ' â€” ' + criteria.length + ' kriter' +
    ((form.emotions && form.emotions.length) ? ', ' + form.emotions.length + ' duygusal kilit maddesi' : '') +
    (has('ICT') ? ', ICT/SMC lensi' : '') +
    ', stil: ' + (style === 'scalp' ? 'scalp' : style === 'swing' ? 'swing' : style === 'mix' ? 'karÄ±ÅŸÄ±k' : 'gÃ¼n iÃ§i') +
    '. EÅŸikler 70/50; uygulayÄ±p checklist\'e geÃ§ebilirsin.';
  return { criteria, thresholds: { aplus: 70, b: 50 }, strategies, pos, summary: sum };
}

async function generateAi() {
  const status = document.getElementById('ai-status');
  const resBox = document.getElementById('ai-result');
  if (!status || !resBox) return;
  const form = aiProfileFromForm();
  if (!form.strategy && form.emotions.length === 0 && !form.problem) {
    status.textContent = 'En az strateji, duygusal zayÄ±flÄ±k ya da problem yaz â€” boÅŸ profil Ã¶neriyi anlamsÄ±zlaÅŸtÄ±rÄ±r.';
    return;
  }
  status.textContent = 'ğŸ¤– DÃ¼ÅŸÃ¼nÃ¼yorumâ€¦';
  resBox.innerHTML = '';
  let profile = null;
  let viaAi = false;
  try {
    const resp = await fetch('/api/ai-checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: form })
    });
    const data = await resp.json();
    if (data && data.ok && data.profile && Array.isArray(data.profile.criteria)) {
      profile = data.profile; viaAi = true;
    } else if (data && data.profile && Array.isArray(data.profile.criteria)) {
      profile = data.profile; viaAi = false;
    } else {
      throw new Error('yanÄ±t boÅŸ');
    }
  } catch (e) {
    profile = fallbackAiProfile(form); viaAi = false;
  }
  profile.market = form.market;
  profile.experience = form.experience;
  profile.style = form.style;
  profile.risk = form.risk;
  profile.concepts = form.concepts.slice();
  profile.strategy = form.strategy;
  profile.emotions = form.emotions.slice();
  profile.problem = form.problem;
  profile.interest = form.interest;
  profile.gold = String(form.market).toLowerCase() !== 'kripto';
  profile.lastPair = pair;
  profile.usedAi = viaAi;
  aiProfile = profile;
  status.textContent = viaAi ? 'Ã–neri hazÄ±r âœ“ (yapay zeka)' : 'Ã–neri hazÄ±r âœ“ (hazÄ±r ÅŸablon â€” AI anahtarÄ± yok, sunucu ÅŸablonu kullanÄ±ldÄ±)';
  renderAiResult(profile, viaAi);
}

function renderAiResult(profile, viaAi) {
  const resBox = document.getElementById('ai-result');
  resBox.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'ai-r-box';
  const sum = document.createElement('div');
  sum.className = 'ai-r-sum';
  sum.textContent = profile.summary || 'Profiline gÃ¶re checklist hazÄ±r.';
  box.appendChild(sum);
  const meta = document.createElement('div');
  meta.className = 'ai-r-meta';
  const metaParts = [];
  const mk = String(profile.market || 'kripto').toLowerCase();
  metaParts.push(mk.indexOf('xau') !== -1 ? 'AltÄ±n (XAU)' : mk.indexOf('fx') !== -1 ? 'FX / Endeks' : 'Kripto');
  const st = String(profile.style || '');
  if (st) metaParts.push({ scalp: 'Scalp', intraday: 'GÃ¼n iÃ§i', swing: 'Swing', mix: 'KarÄ±ÅŸÄ±k' }[st] || st);
  const rt = String(profile.risk || '');
  if (rt) metaParts.push('Risk: ' + rt);
  if (Array.isArray(profile.concepts) && profile.concepts.length) {
    const CL = { ICT: 'ICT/SMC', PA: 'Price Action', IND: 'Ä°ndikatÃ¶rler', OF: 'Orderflow', ONC: 'On-chain', KLASIK: 'Klasik/Fib' };
    metaParts.push(profile.concepts.map(v => CL[v] || v).join(' Â· '));
  }
  meta.textContent = metaParts.join('  Â·  ');
  box.appendChild(meta);
  const catsWrap = document.createElement('div');
  catsWrap.className = 'ai-r-cats';
  const CAT_LBL = { veri: 'Veri', teknik: 'Teknik', pozisyon: 'Pozisyon', duygu: 'Duygu (kilit)' };
  Object.keys(CAT_LBL).forEach(cat => {
    const items = profile.criteria.filter(c => c.cat === cat);
    if (!items.length) return;
    const h = document.createElement('div'); h.className = 'ai-r-cat'; h.textContent = CAT_LBL[cat];
    catsWrap.appendChild(h);
    items.forEach(c => {
      const row = document.createElement('div'); row.className = 'ai-r-row';
      const nm = document.createElement('span'); nm.textContent = c.name; nm.style.cssText = 'flex:1;';
      const pt = document.createElement('span'); pt.className = 'ai-r-pts' + (c.l < 0 ? ' neg' : '');
      pt.textContent = (c.l > 0 ? '+' : '') + c.l;
      row.appendChild(nm); row.appendChild(pt);
      catsWrap.appendChild(row);
    });
  });
  const stratRow = document.createElement('div'); stratRow.className = 'ai-r-row';
  stratRow.innerHTML = '<span style="flex:1;font-weight:700;">Stratejiler</span><span style="font-size:11.5px;color:var(--text-2);">' + esc((profile.strategies || []).join(', ')) + '</span>';
  catsWrap.appendChild(stratRow);
  box.appendChild(catsWrap);
  const acts = document.createElement('div'); acts.className = 'actions';
  acts.style.cssText = 'justify-content:flex-start;margin-top:14px;';
  const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'btn solid'; apply.textContent = 'âœ… Uygula ve Checklist\'e BaÅŸla';
  apply.addEventListener('click', () => {
    saveAiProfile();
    applyAiProfile();
    showPage('defter');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  acts.appendChild(apply);
  box.appendChild(acts);
  resBox.appendChild(box);
}

function bindAiPanel() {
  const head = document.getElementById('ai-head');
  const wrap = document.getElementById('ai-wrap');
  const body = document.getElementById('ai-body');
  if (head && wrap && body) {
    const toggle = () => {
      const open = wrap.classList.toggle('open');
      body.style.display = open ? '' : 'none';
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  }
  renderAiEmos();
  const gen = document.getElementById('ai-gen');
  if (gen) gen.addEventListener('click', generateAi);
  const exit = document.getElementById('ai-exit');
  if (exit) exit.addEventListener('click', () => { exitAiProfile(); });
  const posEdit = document.getElementById('pos-edit');
  if (posEdit) posEdit.addEventListener('click', openPosEditor);
}
let posChecked = new Set();

function renderPos() {
  const box = document.getElementById('list-pos');
  box.innerHTML = '';
  const items = posItems();
  items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'crit' + (posChecked.has(i) ? (it.valid ? ' on pos' : ' on neg') : '');
    row.setAttribute('role', 'checkbox');
    row.setAttribute('aria-checked', posChecked.has(i));
    row.setAttribute('tabindex', '0');
    const b = document.createElement('span'); b.className = 'box'; b.textContent = 'âœ“';
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = it.name;
    const pt = document.createElement('span'); pt.className = 'pts'; pt.textContent = it.valid ? 'Ã‡IKIÅ' : 'DÃœRTÃœ';
    row.appendChild(b); row.appendChild(nm); row.appendChild(pt);
    const toggle = () => { posChecked.has(i) ? posChecked.delete(i) : posChecked.add(i); renderPos(); };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    box.appendChild(row);
  });
  const anyValid = items.some((it, i) => it.valid && posChecked.has(i));
  const anyImpulse = items.some((it, i) => !it.valid && posChecked.has(i));
  const v = document.getElementById('pos-verdict');
  const n = document.getElementById('n-pos');
  if (anyValid) {
    v.textContent = 'Ä°ÅLEMÄ° KAPAT â€” plan gereÄŸi Ã§Ä±kÄ±ÅŸ. Bu mÃ¼dahale deÄŸil, uygulamadÄ±r.';
    v.className = 'sent-note plus'; n.textContent = 'KAPAT';
  } else if (anyImpulse) {
    v.textContent = 'KAPATMA â€” invalidasyon yok, bu his sinyal deÄŸil. Elini klavyeden Ã§ek; dÃ¼rtÃ¼yÃ¼ Notion MÃ¼dahale kolonuna logla.';
    v.className = 'sent-note minus'; n.textContent = 'DOKUNMA';
  } else {
    v.textContent = 'Pozisyondayken bir dÃ¼rtÃ¼ geldiÄŸinde Ã¶nce buraya iÅŸaretle â€” kapatma kararÄ± klavyeden Ã¶nce buradan geÃ§sin.';
    v.className = 'sent-note'; n.textContent = '';
  }
}

function renderSent() {
  const bl = document.getElementById('sent-long');
  const bs = document.getElementById('sent-short');
  bl.className = sent === 'LONG' ? 'on-l' : '';
  bs.className = sent === 'SHORT' ? 'on-s' : '';
  const note = document.getElementById('sent-note');
  const n = document.getElementById('n-sent');
  const p = sentPts();
  if (!sent) {
    note.textContent = 'KalabalÄ±k nerede? SeÃ§im yapmazsan skora etkisi yok.';
    note.className = 'sent-note'; n.textContent = '';
  } else if (p > 0) {
    note.textContent = 'KalabalÄ±k karÅŸÄ±nda â€” ters bias konfluensi: +' + SENT_PTS;
    note.className = 'sent-note plus'; n.textContent = '+' + SENT_PTS;
  } else {
    note.textContent = 'KalabalÄ±kla aynÄ± yÃ¶ndesin â€” likidite sensin: âˆ’' + SENT_PTS;
    note.className = 'sent-note minus'; n.textContent = 'âˆ’' + SENT_PTS;
  }
}
function moodLabel(v) {
  if (v <= -7) return ['KORKU', 'ms-ext'];
  if (v <= -3) return ['TEDÄ°RGÄ°N', 'ms-fear'];
  if (v <= 2) return ['NÃ–TR', 'ms-neut'];
  if (v <= 6) return ['Ä°ÅTAHLI', 'ms-greed'];
  return ['COÅKU', 'ms-ext'];
}
function renderMood() {
  const [lbl, cls] = moodLabel(mood);
  const st = document.getElementById('mood-state');
  st.textContent = lbl + ' Â· ' + (mood > 0 ? '+' : '') + mood;
  st.className = 'mood-state ' + cls;
  const pe = document.getElementById('mood-pen');
  const neutral = Math.abs(mood) <= 2;
  pe.textContent = neutral ? 'nÃ¶tr bÃ¶lge âœ“' : 'nÃ¶tr deÄŸilsin â€” girmeden Ã¶nce nÃ¶trleÅŸmeyi bekle';
  pe.className = 'mood-pen' + (neutral ? '' : ' on');
}

function computeScore() {
  let sum = sentPts();
  cfg().criteria.forEach((c, i) => {
    if (c.cat === 'duygu') return; // duygu puan deÄŸil kilittir
    if (checked.has(i)) sum += ptsFor(c);
  });
  return Math.max(0, Math.min(100, sum));
}
function emoLocked() {
  let locked = false;
  cfg().criteria.forEach((c, i) => { if (c.cat === 'duygu' && checked.has(i)) locked = true; });
  return locked;
}
function intentLocked() { return intent === 'emo'; }
function entryLocked() { return emoLocked() || intentLocked(); }

function renderChips() {
  const sessions = curSessions();
  const sessWrap = document.getElementById('sess-wrap') || document.getElementById('sess-chips').parentElement;
  const sc = document.getElementById('sess-chips');
  sc.innerHTML = '';
  const noSess = sessions.length === 1 && sessions[0] === 'â€”';
  if (sessWrap) sessWrap.style.display = noSess ? 'none' : '';
  if (noSess) { session = 'â€”'; }
  else {
    if (!sessions.includes(session)) session = sessions[0];
    sessions.forEach(s => {
      const c = document.createElement('span');
      c.className = 'chip' + (session === s ? ' on' : '');
      c.textContent = s;
      c.addEventListener('click', () => { session = s; render(); });
      sc.appendChild(c);
    });
  }

  const days = curDays();
  if (!days.includes(selDay)) selDay = days.includes(todayName()) ? todayName() : days[0];
  const dc = document.getElementById('day-chips');
  dc.innerHTML = '';
  days.forEach(d => {
    const c = document.createElement('span');
    c.className = 'chip' + (selDay === d ? ' on' : '');
    c.textContent = d;
    c.addEventListener('click', () => { selDay = d; render(); });
    dc.appendChild(c);
  });

  const st = document.getElementById('strat-chips');
  st.innerHTML = '';
  const strategies = stratsFor(pair);
  if (strategies.length === 0) {
    const ph = document.createElement('span');
    ph.style.cssText = 'font-size:12px;color:var(--text-3);align-self:center;';
    ph.textContent = 'HenÃ¼z strateji yok â€” + ile ekle';
    st.appendChild(ph);
  }
  strategies.forEach(s => {
    const c = document.createElement('span');
    c.className = 'chip' + (strat === s ? ' on' : '');
    const lbl = document.createElement('span'); lbl.textContent = s;
    c.appendChild(lbl);
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'chip-rm'; rm.textContent = 'âœ•'; rm.title = 'Stratejiyi sil';
    rm.setAttribute('aria-label', s + ' stratejisini sil');
    rm.addEventListener('click', ev => {
      ev.stopPropagation();
      const arr = stratsFor(pair);
      const idx = arr.indexOf(s);
      if (idx > -1) arr.splice(idx, 1);
      if (strat === s) strat = '';
      saveConfig(); renderChips(); render();
    });
    c.appendChild(rm);
    c.addEventListener('click', () => { strat = (strat === s ? '' : s); renderChips(); });
    st.appendChild(c);
  });
  const add = document.createElement('span');
  add.className = 'chip add'; add.textContent = '+';
  add.setAttribute('role', 'button'); add.setAttribute('aria-label', 'Yeni strateji ekle');
  add.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.className = 'chip-input'; inp.placeholder = 'Strateji adÄ±';
    const commit = () => {
      const name = inp.value.trim();
      if (name && !stratsFor(pair).includes(name)) {
        stratsFor(pair).push(name);
        strat = name;
        saveConfig();
      }
      renderChips();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') renderChips(); });
    inp.addEventListener('blur', commit);
    st.replaceChild(inp, add);
    inp.focus();
  });
  st.appendChild(add);
}

function renderMatrix() {
  const g = document.getElementById('mx-grid');
  const sessions = curSessions();
  const mx = matrixFor(pair);
  const noSess = sessions.length === 1 && sessions[0] === 'â€”';
  g.style.gridTemplateColumns = '64px repeat(' + sessions.length + ', 1fr)';
  g.innerHTML = '<span></span>' + sessions.map(s => '<span class="mx-h">' + (noSess ? 'Tavan' : s) + '</span>').join('');
  const gold = pair !== 'BTC';
  const order = gold ? ['Pzt', 'Sal', 'Ã‡ar', 'Per', 'Cum'] : ['Pzt', 'Sal', 'Ã‡ar', 'Per', 'Cum', 'Cmt', 'Paz'];
  order.forEach(d => {
    const dl = document.createElement('span');
    dl.className = 'mx-d'; dl.textContent = d;
    g.appendChild(dl);
    sessions.forEach(s => {
      const sel = document.createElement('select');
      // gold pazartesi: A+ seÃ§ilemez
      const opts = (gold && d === 'Pzt') ? ['B', 'YOK'] : ['A+', 'B', 'YOK'];
      opts.forEach(v => {
        const o = document.createElement('option');
        o.value = v; o.textContent = v;
        if (mx[d][s] === v) o.selected = true;
        sel.appendChild(o);
      });
      const paint = () => {
        sel.className = 'mx-' + (sel.value === 'A+' ? 'a' : sel.value === 'B' ? 'b' : 'y');
      };
      paint();
      sel.addEventListener('change', () => {
        mx[d][s] = sel.value;
        paint(); render(); saveConfig();
      });
      g.appendChild(sel);
    });
  });
}

let pendingDel = null;
function deletePair(p) {
  const keys = Object.keys(config.pairs);
  if (keys.length <= 1) return;
  if (pendingDel !== p) {
    // ilk tÄ±k: onay bekle
    pendingDel = p;
    renderPairs();
    setTimeout(() => { if (pendingDel === p) { pendingDel = null; renderPairs(); } }, 4000);
    return;
  }
  // ikinci tÄ±k: sil
  pendingDel = null;
  delete config.pairs[p];
  if (config.stratByPair) delete config.stratByPair[p];
  if (config.matrixByPair) delete config.matrixByPair[p];
  if (pair === p) pair = Object.keys(config.pairs)[0];
  checked = new Set();
  saveConfig();
  renderPairs(); renderCriteria(); render(); renderMatrix(); applyPairPanels(); renderSent(); renderPos();
  if (document.getElementById('editor').classList.contains('open')) renderEditor();
}

function renderPairs() {
  const seg = document.getElementById('pair-seg');
  seg.innerHTML = '';
  if (aiActive && aiProfile) {
    const b = document.createElement('button');
    b.className = 'pair-tab on-gold';
    const lbl = document.createElement('span');
    lbl.textContent = 'AI Â· ' + (aiProfile.gold ? 'XAU' : 'BTC');
    b.appendChild(lbl);
    seg.appendChild(b);
    return;
  }
  const multi = Object.keys(config.pairs).length > 1;
  Object.keys(config.pairs).forEach(p => {
    const b = document.createElement('button');
    b.className = 'pair-tab' + (p === pair ? ' on-gold' : '');
    const lbl = document.createElement('span');
    lbl.textContent = p;
    lbl.addEventListener('click', () => switchPair(p));
    b.appendChild(lbl);
    if (multi) {
      const x = document.createElement('span');
      const armed = pendingDel === p;
      x.className = 'pair-x' + (armed ? ' armed' : '');
      x.textContent = armed ? 'sil?' : 'Ã—';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', p + ' paritesini sil');
      x.addEventListener('click', e => { e.stopPropagation(); deletePair(p); });
      b.appendChild(x);
    }
    seg.appendChild(b);
  });
  const add = document.createElement('button');
  add.className = 'addp'; add.textContent = '+';
  add.setAttribute('aria-label', 'Yeni pair ekle');
  add.addEventListener('click', () => {
    document.getElementById('pair-add').classList.toggle('open');
    document.getElementById('pair-name').focus();
  });
  seg.appendChild(add);
}

function render() {
  const s = computeScore();
  const { aplus: a, b } = cfg().thresholds;
  const numEl = document.getElementById('donut-num');
  if (numEl) numEl.innerHTML = Math.round(s) + '<small>%</small>';
  const dirEl = document.getElementById('donut-dir');
  if (dirEl) dirEl.textContent = (aiActive ? 'AI Â· ' : '') + pair + ' Â· ' + direction;
  const sa = document.getElementById('stat-aplus'); if (sa) sa.textContent = a;
  const sb = document.getElementById('stat-b'); if (sb) sb.textContent = b;
  const sc = document.getElementById('stat-cnt');
  if (sc) {
    let on = 0, tot = 0;
    cfg().criteria.forEach((c, i) => { if (c.cat === 'duygu') return; tot++; if (checked.has(i)) on++; });
    sc.textContent = on + '/' + tot;
  }
  renderGauge(s);

  const v = document.getElementById('verdict'), risk = document.getElementById('risk-line');
  const cell = currentCell();
  const gold = pair !== 'BTC';
  const sessLabel = (curSessions().length === 1) ? '' : ' ' + session;
  const base = s >= a ? 'A+' : s >= b ? 'B' : 'YOK';
  const vd = verdictOf(s, cfg().thresholds);
  const goldMon = gold && selDay === 'Pzt';
  if (vd === 'A+') {
    v.textContent = 'A+ SETUP â€” TAM RÄ°SK'; v.className = 'v-a';
    risk.textContent = gold ? 'Risk: 0.5R (gold sabit).' : 'Risk: 1R';
  }
  else if (vd === 'B') {
    v.textContent = 'B SETUP â€” TEMKÄ°NLÄ°'; v.className = 'v-b';
    if (goldMon) {
      risk.textContent = 'Pazartesi (gold): A+ olamaz Â· 0.5R Â· GÃœNDE TEK Ä°ÅLEM.';
    } else if (gold) {
      risk.textContent = 'Risk: 0.5R (gold sabit).';
    } else {
      risk.textContent = (base === 'A+' && cell === 'B')
        ? 'GÃ¼n/Seans kalitesi: ' + selDay + sessLabel + ' = B â†’ skor A+ olsa da max B Â· 0.3R.'
        : 'Risk: 0.3R Â· KÃ¼Ã§Ã¼k gir ya da hiÃ§ girme.';
    }
  }
  else {
    if (intentLocked()) {
      v.textContent = 'DUYGU Ä°LE GÄ°RÄ°Å â€” Ä°ÅLEM YASAK'; v.className = 'v-no';
      risk.textContent = 'GiriÅŸte "Duygumu" seÃ§tin. Setup tradelemiyorsan iÅŸlem alÄ±nmaz. Niyetini "Setup\'Ä±" yap ya da bu iÅŸlemi geÃ§.';
    } else if (emoLocked()) {
      v.textContent = 'DUYGU KÄ°LÄ°DÄ° â€” Ä°ÅLEM YASAK'; v.className = 'v-no';
      risk.textContent = 'Ä°ÅŸaretli duygu varken skor kaÃ§ olursa olsun iÅŸlem alÄ±nmaz. Ã–nce nÃ¶trleÅŸ, sonra tekrar skorla.';
    } else {
      v.textContent = 'ANLAÅMA YOK'; v.className = 'v-no';
      risk.textContent = (cell === 'YOK')
        ? 'Bu dilim iÅŸleme kapalÄ±: ' + selDay + sessLabel + ' = YOK.'
        : 'EÅŸik altÄ± â€” bu masadan kalkÄ±yoruz.';
    }
  }
  renderChips();
  document.body.classList.toggle('emo-locked', entryLocked());
  const elock = document.getElementById('emo-lock');
  if (elock) elock.textContent = intentLocked() ? 'DUYGU Ä°LE GÄ°RÄ°Å â€” KÄ°LÄ°TLÄ°' : 'SÄ°STEM KÄ°LÄ°TLÄ°';

  document.getElementById('btn-long').className = direction === 'LONG' ? 'on-long' : '';
  document.getElementById('btn-short').className = direction === 'SHORT' ? 'on-short' : '';
  renderPairs();
}

const EMO_SHORT = {
  'Uykusuz / yorgunum': 'Uykusuz',
  'Stresliyim (trade dÄ±ÅŸÄ± kaynak)': 'Stresli',
  'AÅŸÄ±rÄ± yoÄŸun / bÃ¶lÃ¼nmÃ¼ÅŸ dikkat': 'DaÄŸÄ±nÄ±k',
  'Az Ã¶nce stop oldum â€” revenge penceresi': 'Revenge',
  'FOMO â€” hareket kaÃ§Ä±yor hissi': 'FOMO',
  'Ã–nceki iÅŸlemi kaÃ§Ä±rdÄ±m â€” telafi hissi var': 'Telafi',
  'BugÃ¼n aynÄ± bias ile 2. kez giriyorum': '2. giriÅŸ'
};
function emoShort(name) {
  if (EMO_SHORT[name]) return EMO_SHORT[name];
  const w = name.split(/[\s\/â€”(,]+/)[0];
  return w.length > 12 ? w.slice(0, 12) : w;
}

// ---- SatÄ±r iÃ§i kategori dÃ¼zenleyici ----
let editCat = null;
function updateCatEditBtns() {
  ['veri', 'teknik', 'pozisyon', 'duygu'].forEach(cat => {
    const btn = document.getElementById('catedit-' + cat);
    if (!btn) return;
    const on = editCat === cat;
    btn.textContent = on ? 'âœ“ Bitti' : 'âœ DÃ¼zenle';
    btn.classList.toggle('on', on);
  });
}
function toggleCatEdit(cat) {
  const wasOpen = editCat;
  if (wasOpen) {
    // AÃ§Ä±k dÃ¼zenlemeyi kapat: boÅŸ isimli kriterleri at + kaydet
    cfg().criteria = cfg().criteria.filter(c => c.name.trim() !== '');
    saveConfig();
  }
  editCat = (wasOpen === cat) ? null : cat;
  checked = new Set();
  renderCriteria(); render();
}
function renderCatEditor(cat, box) {
  box.innerHTML = '';
  const hint = document.createElement('div');
  hint.className = 'cat-edit-hint';
  hint.textContent = 'AdÄ± yaz Â· saÄŸdaki kutu = puan (Ã¶nem) Â· Ã— ile sil Â· en altta yeni ekle. DeÄŸiÅŸiklikler hesabÄ±na kaydolur.';
  box.appendChild(hint);
  cfg().criteria.forEach(c => {
    if (c.cat !== cat) return;
    const row = document.createElement('div');
    row.className = 'crit-edit';
    const name = document.createElement('input');
    name.type = 'text'; name.className = 'ce-name'; name.value = c.name; name.placeholder = 'Kriter adÄ±';
    name.addEventListener('input', () => { c.name = name.value; });
    name.addEventListener('change', saveConfig);
    const pt = document.createElement('input');
    pt.type = 'number'; pt.className = 'ce-pt'; pt.step = '1'; pt.title = 'Puan'; pt.value = c.l;
    pt.addEventListener('input', () => { const v = Number(pt.value) || 0; c.l = v; c.s = v; render(); });
    pt.addEventListener('change', saveConfig);
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'ce-del'; del.textContent = 'Ã—'; del.title = 'Sil';
    del.addEventListener('click', () => {
      const idx = cfg().criteria.indexOf(c);
      if (idx > -1) cfg().criteria.splice(idx, 1);
      checked = new Set();
      saveConfig(); renderCriteria(); render();
    });
    row.appendChild(name); row.appendChild(pt); row.appendChild(del);
    box.appendChild(row);
  });
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'ce-add'; add.textContent = '+ Kriter ekle';
  add.addEventListener('click', () => {
    cfg().criteria.push({ name: '', cat, l: 5, s: 5 });
    renderCriteria();
    const inputs = box.querySelectorAll('.ce-name');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  box.appendChild(add);
}

function renderCriteria() {
  const lists = { veri: [], teknik: [], pozisyon: [], duygu: [] };
  cfg().criteria.forEach((c, i) => {
    if (ptsFor(c) === 0) return; // bu yÃ¶n iÃ§in anlamsÄ±z kriterler gizlenir
    (lists[c.cat] || lists.teknik).push([c, i]);
  });
  Object.keys(lists).forEach(cat => {
    const box = document.getElementById('list-' + cat);
    box.innerHTML = '';
    if (editCat === cat) {
      renderCatEditor(cat, box);
      const nb = document.getElementById('n-' + cat); if (nb) nb.textContent = '';
      return;
    }
    let n = 0;
    if (cat === 'duygu') {
      lists.duygu.forEach(([c, i]) => {
        if (checked.has(i)) n++;
        const chip = document.createElement('button');
        chip.className = 'emo-chip' + (checked.has(i) ? ' on' : '');
        chip.type = 'button';
        chip.title = c.name;
        chip.setAttribute('aria-pressed', checked.has(i));
        const tk = document.createElement('span'); tk.className = 'tick'; tk.textContent = checked.has(i) ? 'âœ“' : 'â—‹';
        const lb = document.createElement('span'); lb.textContent = emoShort(c.name);
        chip.appendChild(tk); chip.appendChild(lb);
        chip.addEventListener('click', () => {
          checked.has(i) ? checked.delete(i) : checked.add(i); renderCriteria(); render();
        });
        box.appendChild(chip);
      });
      document.getElementById('n-duygu').textContent = n > 0 ? 'KÄ°LÄ°T' : '';
      return;
    }
    lists[cat].forEach(([c, i]) => {
      const pts = ptsFor(c);
      if (checked.has(i)) n++;
      const row = document.createElement('div');
      row.className = 'crit' + (checked.has(i) ? (pts >= 0 ? ' on pos' : ' on neg') : '');
      row.setAttribute('role', 'checkbox');
      row.setAttribute('aria-checked', checked.has(i));
      row.setAttribute('tabindex', '0');
      const b = document.createElement('span'); b.className = 'box'; b.textContent = 'âœ“';
      const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = c.name;
      const pt = document.createElement('span'); pt.className = 'pts';
      pt.textContent = (pts > 0 ? '+' : '') + pts;
      row.appendChild(b); row.appendChild(nm); row.appendChild(pt);
      const toggle = () => { checked.has(i) ? checked.delete(i) : checked.add(i); renderCriteria(); render(); };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
      box.appendChild(row);
    });
    document.getElementById('n-' + cat).textContent =
      lists[cat].length === 0 ? 'â€”' : n + '/' + lists[cat].length;
  });
  updateCatEditBtns();
}

function startDrag(e, row) {
  e.preventDefault();
  const list = document.getElementById('edit-list');
  row.classList.add('dragging');
  row.setPointerCapture && e.target.setPointerCapture(e.pointerId);

  const move = ev => {
    const y = ev.clientY;
    const others = [...list.querySelectorAll('.edit-row')].filter(r => r !== row);
    for (const other of others) {
      const rect = other.getBoundingClientRect();
      if (y > rect.top && y < rect.bottom) {
        if (y < rect.top + rect.height / 2) list.insertBefore(row, other);
        else list.insertBefore(row, other.nextSibling);
        break;
      }
    }
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    row.classList.remove('dragging');
    cfg().criteria = [...list.querySelectorAll('.edit-row')].map(r => r._crit);
    checked = new Set();
    renderEditor(); renderCriteria(); render();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
}

function renderEditor() {
  document.getElementById('edit-pair-lbl').textContent = pair;
  document.getElementById('btn-delpair').disabled = Object.keys(config.pairs).length <= 1;
  const list = document.getElementById('edit-list');
  list.innerHTML = '';
  cfg().criteria.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'edit-row';
    const name = document.createElement('input');
    name.type = 'text'; name.value = c.name; name.placeholder = 'GÃ¶zlem';
    name.addEventListener('input', () => { c.name = name.value; });
    const sel = document.createElement('select');
    Object.keys(CATS).forEach(k => {
      const o = document.createElement('option'); o.value = k; o.textContent = CATS[k];
      if (c.cat === k) o.selected = true; sel.appendChild(o);
    });
    sel.addEventListener('change', () => { c.cat = sel.value; });
    const l = document.createElement('input');
    l.type = 'number'; l.step = '1'; l.value = c.l; l.setAttribute('aria-label', 'Long puanÄ±');
    l.addEventListener('input', () => { c.l = Number(l.value) || 0; });
    const sIn = document.createElement('input');
    sIn.type = 'number'; sIn.step = '1'; sIn.value = c.s; sIn.setAttribute('aria-label', 'Short puanÄ±');
    sIn.addEventListener('input', () => { c.s = Number(sIn.value) || 0; });
    const handle = document.createElement('span');
    handle.className = 'handle'; handle.textContent = 'â ¿';
    handle.setAttribute('aria-label', 'SÃ¼rÃ¼kleyerek taÅŸÄ±');
    handle.addEventListener('pointerdown', e => startDrag(e, row));
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = 'Ã—'; del.setAttribute('aria-label', 'Sil');
    del.addEventListener('click', () => {
      cfg().criteria.splice(i, 1); checked = new Set();
      renderEditor(); renderCriteria(); render();
    });
    row._crit = c;
    row.appendChild(handle); row.appendChild(name); row.appendChild(sel); row.appendChild(l); row.appendChild(sIn); row.appendChild(del);
    list.appendChild(row);
  });
  document.getElementById('th-a').value = cfg().thresholds.aplus;
  document.getElementById('th-b').value = cfg().thresholds.b;
}

async function saveConfig() {
  if (aiActive && aiProfile) {
    await saveAiProfile();
    const note = document.getElementById('save-note');
    if (note) { note.textContent = 'AI profiline iÅŸlendi â€” kendi ayarlarÄ±n deÄŸiÅŸmedi.'; setTimeout(() => { note.textContent = ''; }, 4000); }
    return;
  }
  const note = document.getElementById('save-note');
  const ok = await store.set(STORAGE_KEY, JSON.stringify(config));
  note.textContent = ok ? 'Deftere iÅŸlendi.' : 'KayÄ±t yapÄ±lamadÄ±; bu oturumda geÃ§erli.';
  setTimeout(() => { note.textContent = ''; }, 4000);
}
async function loadConfig() {
  try {
    const val = await store.get(STORAGE_KEY);
    if (val) {
      const p = JSON.parse(val);
      if (p && p.pairs && Object.keys(p.pairs).length > 0) {
        config = p;
        pair = Object.keys(p.pairs)[0];
      }
    }
  } catch (e) { /* ilk aÃ§Ä±lÄ±ÅŸ */ }
}

function switchPair(p) {
  pair = p; checked = new Set();
  sent = ''; posChecked = new Set();
  intent = ''; mood = 0;
  const mr = document.getElementById('mood-range'); if (mr) mr.value = 0;
  if (typeof renderMood === 'function') renderMood();
  if (typeof renderIntent === 'function') renderIntent();
  renderCriteria(); render(); renderSent(); renderPos(); applyPairPanels(); renderMatrix();
  // paritenin pair alanÄ±nÄ± otomatik doldur, sonra o paritenin planÄ±nÄ± yÃ¼kle
  const pf = document.getElementById('d-pair'); if (pf) pf.value = p;
  loadDaily();
  if (document.getElementById('editor').classList.contains('open')) renderEditor();
}

function applyPairPanels() {
  const isGold = pair === 'XAU' || pair.indexOf('XAU') !== -1 || pair.indexOf('GOLD') !== -1;
  const sp = document.getElementById('sent-panel');
  if (sp) sp.style.display = isGold ? 'none' : '';
}

function addPair() {
  const inp = document.getElementById('pair-name');
  const name = inp.value.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, 12);
  if (!name) return;
  if (!config.pairs[name]) {
    config.pairs[name] = JSON.parse(JSON.stringify(cfg()));
  }
  inp.value = '';
  document.getElementById('pair-add').classList.remove('open');
  switchPair(name);
  saveConfig();
}

const DAILY_PREFIX = 'defter-daily:';
let dailyBias = '';

function dailyKey() {
  const date = document.getElementById('d-date').value;
  // BTC: eski tarih-bazlÄ± anahtar (geriye dÃ¶nÃ¼k uyum). DiÄŸer pariteler: pair ekli anahtar.
  return pair === 'BTC' ? DAILY_PREFIX + date : DAILY_PREFIX + date + ':' + pair;
}
function setBias(b) {
  dailyBias = b;
  document.getElementById('d-bull').className = b === 'BULLISH' ? 'on-bull' : '';
  document.getElementById('d-bear').className = b === 'BEARISH' ? 'on-bear' : '';
}
function collectDaily() {
  return {
    bias: dailyBias,
    pair: document.getElementById('d-pair').value,
    sabah: document.getElementById('d-sabah').value,
    senaryo: document.getElementById('d-senaryo').value,
    anti: document.getElementById('d-anti').value,
    gunsonu: document.getElementById('d-gunsonu').value
  };
}
function fillDaily(d) {
  setBias(d && d.bias || '');
  document.getElementById('d-pair').value = (d && d.pair) || pair;
  document.getElementById('d-sabah').value = d && d.sabah || '';
  document.getElementById('d-senaryo').value = d && d.senaryo || '';
  document.getElementById('d-anti').value = d && d.anti || '';
  document.getElementById('d-gunsonu').value = d && d.gunsonu || '';
}
async function loadDaily() {
  const status = document.getElementById('daily-status');
  try {
    const val = await store.get(dailyKey());
    if (val) { fillDaily(JSON.parse(val)); status.textContent = 'kayÄ±tlÄ±'; }
    else { fillDaily(null); status.textContent = 'boÅŸ'; }
  } catch (e) { fillDaily(null); status.textContent = 'boÅŸ'; }
}
async function saveDaily() {
  const note = document.getElementById('daily-note');
  const ok = await store.set(dailyKey(), JSON.stringify(collectDaily()));
  note.textContent = ok ? 'Plan deftere iÅŸlendi.' : 'KayÄ±t yapÄ±lamadÄ±; bu oturumda geÃ§erli.';
  if (ok) document.getElementById('daily-status').textContent = 'kayÄ±tlÄ±';
  setTimeout(() => { note.textContent = ''; }, 4000);
}

const TRADES_KEY = 'defter-trades-v1';
let trades = [];

function verdictOf(score, th) {
  if (entryLocked()) return 'YOK';
  let base = score >= th.aplus ? 'A+' : score >= th.b ? 'B' : 'YOK';
  const cell = currentCell();
  if (cell === 'YOK') return 'YOK';
  if (cell === 'B' && base === 'A+') return 'B';
  return base;
}
async function loadTrades() {
  try {
    const val = await store.get(TRADES_KEY);
    if (val) { const t = JSON.parse(val); if (Array.isArray(t)) trades = t; }
  } catch (e) { /* ilk aÃ§Ä±lÄ±ÅŸ */ }
}
async function saveTrades() {
  try { await store.set(TRADES_KEY, JSON.stringify(trades)); }
  catch (e) { console.error('saveTrades hatasÄ±:', e); }
}

// â€”â€”â€” Ders Defteri â€”â€”â€”
const LESSONS_KEY = 'defter-lessons-v1';
let lessonsData = { lessons: [], log: {} };

function lsToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
async function loadLessons() {
  try {
    const raw = await store.get(LESSONS_KEY);
    if (raw) { lessonsData = JSON.parse(raw); }
  } catch (e) { /* boÅŸ baÅŸla */ }
  if (!Array.isArray(lessonsData.lessons)) lessonsData.lessons = [];
  if (!lessonsData.log || typeof lessonsData.log !== 'object') lessonsData.log = {};
  if (lessonsData.lessons.length === 0) {
    // baÅŸlangÄ±Ã§ dersleri
    const base = Date.now();
    lessonsData.lessons.push({
      id: base, text: 'Kural ihlalinin acÄ± verici bir bedeli olsun â€” ihlal asla bedava kalmasÄ±n.',
      src: 'Alex G', added: lsToday(), active: false
    });
    lessonsData.lessons.push({
      id: base + 1, text: '2 ardÄ±ÅŸÄ±k stop sonrasÄ±: yalnÄ±zca A+ & HTF bÃ¶lge ya da kesin pattern; risk tam boy, gerisi pas. (Durma deÄŸil, filtreyi sÄ±k.)',
      src: 'Recovery', added: lsToday(), active: true
    });
    lessonsData.lessons.push({
      id: base + 2, text: 'Pazartesi 21:00\'da fiyat rÃ¶lantideyse ve dÃ¼ÅŸmediyse, o gÃ¼n manipÃ¼lasyon gelmez â€” zorlama.',
      src: 'Pzt gÃ¶zlemi', added: lsToday(), active: true
    });
    await saveLessons();
  }
  showDailyQuote();
}
async function saveLessons() { await store.set(LESSONS_KEY, JSON.stringify(lessonsData)); }

function lsAdherence(id) {
  const days = Object.keys(lessonsData.log).sort().slice(-14);
  let y = 0, t = 0;
  days.forEach(d => {
    const v = lessonsData.log[d] && lessonsData.log[d][id];
    if (v === true) { y++; t++; } else if (v === false) { t++; }
  });
  return t === 0 ? null : Math.round((y / t) * 100);
}

function renderLessons() {
  const actives = lessonsData.lessons.filter(l => l.active);
  const today = lsToday();
  const tw = document.getElementById('ls-today');
  tw.innerHTML = '';
  if (actives.length === 0) {
    tw.innerHTML = '<p class="hint" style="margin:0;">Takipte ders yok â€” arÅŸivden â­ ile en fazla 3 ders seÃ§.</p>';
  }
  actives.forEach(l => {
    const v = lessonsData.log[today] ? lessonsData.log[today][l.id] : undefined;
    const row = document.createElement('div'); row.className = 'ls-row';
    const tx = document.createElement('div'); tx.className = 'txt';
    tx.textContent = l.text;
    if (l.src) { const sp = document.createElement('span'); sp.className = 'src'; sp.textContent = 'Â· ' + l.src; tx.appendChild(sp); }
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = 'BugÃ¼n uyguladÄ±n mÄ±?';
    tx.appendChild(meta);
    const yes = document.createElement('button'); yes.className = 'yes' + (v === true ? ' on' : ''); yes.textContent = 'âœ“ Evet';
    const no = document.createElement('button'); no.className = 'no' + (v === false ? ' on' : ''); no.textContent = 'âœ— HayÄ±r';
    const mark = async val => {
      if (!lessonsData.log[today]) lessonsData.log[today] = {};
      lessonsData.log[today][l.id] = (lessonsData.log[today][l.id] === val ? undefined : val);
      if (lessonsData.log[today][l.id] === undefined) delete lessonsData.log[today][l.id];
      await saveLessons(); renderLessons();
    };
    yes.addEventListener('click', () => mark(true));
    no.addEventListener('click', () => mark(false));
    row.appendChild(tx); row.appendChild(yes); row.appendChild(no);
    tw.appendChild(row);
  });

  const lw = document.getElementById('ls-list');
  lw.innerHTML = '';
  const sorted = lessonsData.lessons.slice().filter(l => !l.active).sort((a, b) => b.id - a.id);
  if (sorted.length === 0) {
    lw.innerHTML = '<p class="hint" style="margin:0;">ArÅŸiv boÅŸ â€” takipten Ã§Ä±kardÄ±ÄŸÄ±n ya da henÃ¼z takibe almadÄ±ÄŸÄ±n dersler burada birikir.</p>';
  }
  sorted.forEach(l => {
    const row = document.createElement('div'); row.className = 'ls-row';
    const tx = document.createElement('div'); tx.className = 'txt';
    tx.textContent = l.text;
    if (l.src) { const sp = document.createElement('span'); sp.className = 'src'; sp.textContent = 'Â· ' + l.src; tx.appendChild(sp); }
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = l.added || '';
    tx.appendChild(meta);
    const adh = lsAdherence(l.id);
    if (l.active && adh !== null) {
      const a = document.createElement('span');
      a.className = 'adh ' + (adh >= 70 ? 'g' : adh >= 40 ? 'a' : 'r');
      a.textContent = '%' + adh;
      row.appendChild(tx); row.appendChild(a);
    } else { row.appendChild(tx); }
    const star = document.createElement('button');
    star.className = 'star' + (l.active ? ' on' : '');
    star.textContent = l.active ? 'â­ Takipte' : 'â˜† Takibe al';
    star.addEventListener('click', async () => {
      if (!l.active && lessonsData.lessons.filter(x => x.active).length >= 3) {
        star.textContent = 'Ã–nce birini mezun et'; setTimeout(renderLessons, 1600); return;
      }
      l.active = !l.active; await saveLessons(); renderLessons();
    });
    const del = document.createElement('button'); del.textContent = 'Ã—';
    del.setAttribute('aria-label', 'Dersi sil');
    del.addEventListener('click', async () => {
      lessonsData.lessons = lessonsData.lessons.filter(x => x.id !== l.id);
      await saveLessons(); renderLessons();
    });
    row.appendChild(star); row.appendChild(del);
    lw.appendChild(row);
  });
  document.getElementById('ls-count').textContent =
    lessonsData.lessons.length + ' ders Â· ' + actives.length + '/3 takipte';
}

async function addLesson() {
  const t = document.getElementById('ls-text');
  const s = document.getElementById('ls-src');
  const text = (t.value || '').trim();
  if (!text) { t.focus(); return; }
  const activeCount = lessonsData.lessons.filter(x => x.active).length;
  lessonsData.lessons.push({
    id: Date.now(), text: text, src: (s.value || '').trim(),
    added: lsToday(), active: activeCount < 3
  });
  t.value = ''; s.value = '';
  await saveLessons(); renderLessons();
}

// â€”â€”â€” PaylaÅŸÄ±m KartÄ± â€”â€”â€”
const SH_COL = { 'A+': '#22c55e', 'B': '#f59e0b', 'YOK': '#ef4444' };
let shData = null;

function shRound(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function shSpaced(ctx, text, x, y, sp) {
  let cx = x;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
  return cx - x - sp;
}
function shSpacedW(ctx, text, sp) {
  let w = 0;
  for (const ch of text) { w += ctx.measureText(ch).width + sp; }
  return w - sp;
}
function shClip(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(t + 'â€¦').width > max) t = t.slice(0, -1);
  return t + 'â€¦';
}
function shWrap(ctx, text, max, maxLines) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > max && line) {
      lines.push(line); line = w;
      if (lines.length === maxLines) break;
    } else { line = test; }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    // son satÄ±rÄ± kÄ±rp
    let last = lines[maxLines - 1];
    const consumed = lines.join(' ');
    if (consumed.length < String(text).replace(/\s+/g, ' ').trim().length) {
      lines[maxLines - 1] = shClip(ctx, last + ' â€¦', max);
    }
  }
  return lines;
}

function currentShareData() {
  const sc = computeScore();
  const vd = verdictOf(sc, cfg().thresholds);
  const names = [];
  cfg().criteria.forEach((c, i) => {
    if (checked.has(i) && c.cat !== 'duygu' && ptsFor(c) > 0) names.push(c.name);
  });
  const d = new Date();
  const p2 = n => String(n).padStart(2, '0');
  return {
    pair: pair, dir: direction, score: Math.round(sc), verdict: vd,
    day: selDay, sess: session, strat: strat, sent: sent, crits: names,
    r: '', emoBlock: entryLocked(),
    bias: dailyBias || '',
    senaryo: (document.getElementById('d-senaryo').value || '').trim(),
    anti: (document.getElementById('d-anti').value || '').trim(),
    when: p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.' + d.getFullYear() + '  ' + p2(d.getHours()) + ':' + p2(d.getMinutes())
  };
}
function tradeShareData(t) {
  return {
    pair: t.pair, dir: t.dir, score: t.score, verdict: t.verdict,
    day: t.day || '', sess: t.sess || '', strat: t.strat || '', sent: t.sent || '',
    crits: critNames(t), r: t.r || '', emoBlock: !!t.emoBlock,
    bias: '', senaryo: '', anti: '', _tradeDate: t.date || '',
    when: t.date + '  ' + t.time
  };
}
// iÅŸlem tarihinden (GG/AA) o gÃ¼nÃ¼n plan anahtarÄ±nÄ± bul ve planÄ± karta ekle
async function attachPlanToShare(data) {
  if (!data._tradeDate) return;
  const parts = data._tradeDate.split('/');
  if (parts.length !== 2) return;
  const dd = parts[0].padStart(2, '0'), mm = parts[1].padStart(2, '0');
  const base = DAILY_PREFIX + '2026-' + mm + '-' + dd;
  const tp = data.pair || 'BTC';
  const key = tp === 'BTC' ? base : base + ':' + tp;
  try {
    const raw = await store.get(key);
    if (raw) {
      const p = JSON.parse(raw);
      data.bias = p.bias || '';
      data.senaryo = (p.senaryo || '').trim();
      data.anti = (p.anti || '').trim();
    }
  } catch (e) { /* plan yoksa boÅŸ kalÄ±r */ }
}

function drawShareCard() {
  const d = shData; if (!d) return;
  const showC = document.getElementById('sh-crits').checked;
  const showR = document.getElementById('sh-r').checked && d.r !== '' && !isNaN(Number(d.r));
  const showS = document.getElementById('sh-sent').checked && !!d.sent;
  const showPbox = document.getElementById('sh-plan');
  const showP = showPbox && showPbox.checked && ((d.senaryo && d.senaryo.length) || (d.anti && d.anti.length) || (d.bias && d.bias.length));
  const tag = (document.getElementById('sh-tag').value || 'ALFA TRADERS').toUpperCase();

  const acc = d.emoBlock ? SH_COL['YOK'] : (SH_COL[d.verdict] || SH_COL['YOK']);
  const crits = showC ? d.crits.slice(0, 11) : [];
  const extra = showC ? Math.max(0, d.crits.length - crits.length) : 0;

  const W = 1080, M = 84;
  // plan satÄ±rlarÄ±nÄ± Ã¶nden Ã¶lÃ§ (yÃ¼kseklik iÃ§in)
  let planBlocks = [];
  if (showP) {
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = '500 25px Inter, sans-serif';
    const tw2 = W - M * 2 - 40;
    if (d.senaryo) planBlocks.push({ label: 'SENARYO', lines: shWrap(meas, d.senaryo, tw2, 3) });
    if (d.anti) planBlocks.push({ label: 'ANTÄ° SENARYO', lines: shWrap(meas, d.anti, tw2, 3) });
  }
  let planH = 0;
  if (showP) {
    planH = 24; // Ã¼st boÅŸluk
    planBlocks.forEach(b => { planH += 34 + b.lines.length * 34 + 12; });
  }

  let H = 940;
  if (showC) H += 70 + crits.length * 50 + (extra ? 46 : 0);
  if (showS) H += 54;
  if (showR) H += 74;
  if (d.emoBlock) H += 96;
  H += planH;

  const cv = document.getElementById('sh-canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.textBaseline = 'alphabetic';

  c.fillStyle = '#12141c'; c.fillRect(0, 0, W, H);
  c.fillStyle = acc; c.fillRect(0, 0, W, 8);

  // baÅŸlÄ±k
  c.fillStyle = '#6d7488'; c.font = '600 24px Inter, sans-serif';
  shSpaced(c, 'KONFÄ°RMASYON DEFTERÄ°', M, 112, 4);
  c.font = '500 24px Inter, sans-serif'; c.textAlign = 'right';
  c.fillText(d.when, W - M, 112); c.textAlign = 'left';
  c.strokeStyle = '#232735'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(M, 146); c.lineTo(W - M, 146); c.stroke();

  // kadran
  const cx = W / 2, cy = 400, R = 158, LW = 30;
  c.lineWidth = LW; c.lineCap = 'round';
  c.strokeStyle = '#232735';
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  const frac = Math.max(0, Math.min(100, d.score)) / 100;
  if (frac > 0) {
    c.strokeStyle = acc;
    c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.stroke();
  }
  c.textAlign = 'center';
  c.fillStyle = '#ffffff'; c.font = '800 128px Inter, sans-serif';
  c.fillText(d.score + '%', cx, cy + 30);
  c.fillStyle = '#6d7488'; c.font = '700 22px Inter, sans-serif';
  const lw = shSpacedW(c, 'KONFLUENS SKORU', 5);
  shSpaced(c, 'KONFLUENS SKORU', cx - lw / 2, cy + 82, 5);
  c.textAlign = 'left';

  let y = 640;

  // karar rozeti
  const vtxt = d.emoBlock ? 'DUYGU KÄ°LÄ°DÄ° â€” Ä°ÅLEM YASAK'
    : d.verdict === 'A+' ? 'A+ SETUP Â· TAM RÄ°SK'
    : d.verdict === 'B' ? 'B SETUP Â· TEMKÄ°NLÄ°' : 'ANLAÅMA YOK';
  c.font = '700 34px Inter, sans-serif';
  const pw = c.measureText(vtxt).width + 76;
  c.globalAlpha = 0.14; c.fillStyle = acc;
  shRound(c, cx - pw / 2, y - 50, pw, 74, 37); c.fill(); c.globalAlpha = 1;
  c.fillStyle = acc; c.textAlign = 'center';
  c.fillText(vtxt, cx, y);
  c.textAlign = 'left';
  y += 78;

  // meta Ã§ipleri
  const chips = [d.pair + ' Â· ' + d.dir];
  if (d.bias) chips.push(d.bias);
  if (d.day && d.sess) chips.push(d.day + ' Â· ' + d.sess);
  if (d.strat && d.strat.trim() !== '') chips.push(d.strat.trim());
  c.font = '600 26px Inter, sans-serif';
  let tw = 0; const cwArr = chips.map(t => { const w = c.measureText(t).width + 44; tw += w + 12; return w; });
  let x = cx - (tw - 12) / 2;
  chips.forEach((t, i) => {
    c.fillStyle = '#1b1e29'; shRound(c, x, y - 34, cwArr[i], 54, 27); c.fill();
    c.fillStyle = i === 0 ? (d.dir === 'LONG' ? '#22c55e' : '#ef4444') : '#aab1c6';
    c.textAlign = 'center'; c.fillText(t, x + cwArr[i] / 2, y); c.textAlign = 'left';
    x += cwArr[i] + 12;
  });
  y += 74;

  if (d.emoBlock) {
    c.fillStyle = '#2a1416'; shRound(c, M, y - 40, W - M * 2, 72, 14); c.fill();
    c.fillStyle = '#ef4444'; c.font = '700 26px Inter, sans-serif'; c.textAlign = 'center';
    c.fillText('Duygu kilidi aktifken skor geÃ§ersizdir.', cx, y + 4);
    c.textAlign = 'left'; y += 96;
  }

  if (showS) {
    const contra = d.sent !== d.dir;
    c.font = '600 26px Inter, sans-serif'; c.textAlign = 'center';
    c.fillStyle = contra ? '#22c55e' : '#ef4444';
    c.fillText('KalabalÄ±k ' + d.sent + ' Â· ' + (contra ? 'ters bias konfluensi' : 'kalabalÄ±kla aynÄ± yÃ¶n'), cx, y);
    c.textAlign = 'left'; y += 54;
  }

  if (showR) {
    const rv = Number(d.r);
    c.fillStyle = rv >= 0 ? '#22c55e' : '#ef4444';
    c.font = '800 46px Inter, sans-serif'; c.textAlign = 'center';
    c.fillText((rv > 0 ? '+' : '') + rv + 'R', cx, y + 10);
    c.textAlign = 'left'; y += 74;
  }

  if (showC) {
    c.fillStyle = '#6d7488'; c.font = '700 22px Inter, sans-serif';
    shSpaced(c, 'KONFLUENS', M, y, 5);
    y += 46;
    c.font = '500 27px Inter, sans-serif';
    crits.forEach(n => {
      c.fillStyle = acc; c.font = '700 26px Inter, sans-serif';
      c.fillText('âœ“', M, y);
      c.fillStyle = '#dfe3ee'; c.font = '500 27px Inter, sans-serif';
      c.fillText(shClip(c, n, W - M * 2 - 46), M + 42, y);
      y += 50;
    });
    if (extra) {
      c.fillStyle = '#6d7488'; c.font = '500 25px Inter, sans-serif';
      c.fillText('+' + extra + ' kriter daha', M + 42, y); y += 46;
    }
  }

  if (showP && planBlocks.length) {
    y += 8;
    c.strokeStyle = '#232735'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(M, y - 16); c.lineTo(W - M, y - 16); c.stroke();
    planBlocks.forEach(b => {
      c.fillStyle = b.label === 'ANTÄ° SENARYO' ? '#ef8c8c' : '#8ab4f8';
      c.font = '700 20px Inter, sans-serif';
      shSpaced(c, b.label, M, y + 8, 4);
      y += 34;
      c.fillStyle = '#cbd0dd'; c.font = '500 25px Inter, sans-serif';
      b.lines.forEach(ln => { c.fillText(ln, M + 20, y + 4); y += 34; });
      y += 12;
    });
  }

  // alt bar
  c.strokeStyle = '#232735'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(M, H - 96); c.lineTo(W - M, H - 96); c.stroke();
  c.fillStyle = '#8b92a8'; c.font = '700 24px Inter, sans-serif';
  shSpaced(c, tag, M, H - 46, 4);
  c.fillStyle = '#4d5364'; c.font = '500 22px Inter, sans-serif'; c.textAlign = 'right';
  c.fillText('sÃ¼reÃ§ Â· skor Â· disiplin', W - M, H - 46); c.textAlign = 'left';

  try { document.getElementById('sh-img').src = cv.toDataURL('image/png'); } catch (e) { /* yoksay */ }
}

function shBlob() {
  return new Promise(res => document.getElementById('sh-canvas').toBlob(res, 'image/png'));
}
function shNote(msg) {
  const n = document.getElementById('sh-note');
  n.textContent = msg; setTimeout(() => { if (n.textContent === msg) n.textContent = ''; }, 4000);
}
function shName() {
  return 'alfa-' + (shData ? shData.pair.toLowerCase() + '-' + shData.dir.toLowerCase() : 'setup') + '.png';
}
async function shShare() {
  try {
    const b = await shBlob();
    const f = new File([b], shName(), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f] });
    } else {
      const tip = document.getElementById('sh-tip');
      tip.style.background = 'var(--amber-soft)';
      tip.innerHTML = 'Sistem paylaÅŸÄ±mÄ± bu ortamda kapalÄ±. <b>GÃ¶rsele uzun bas â†’ PaylaÅŸ</b> ya da Ä°ndir kullan. UygulamayÄ± ayrÄ± sekmede (GitHub Pages / indirilmiÅŸ dosya) aÃ§arsan bu buton da Ã§alÄ±ÅŸÄ±r.';
      shNote('Bu ortamda sistem paylaÅŸÄ±mÄ± kapalÄ± â€” uzun basma yolunu kullan.');
    }
  } catch (e) { if (e && e.name !== 'AbortError') shNote('PaylaÅŸÄ±lamadÄ± â€” gÃ¶rsele uzun bas ya da Ä°ndir kullan.'); }
}
async function shDownload() {
  const b = await shBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = shName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function shCopy() {
  // 1. deneme: sÃ¶z (promise) ile ClipboardItem â€” kullanÄ±cÄ± hareketi korunur (Safari/Chrome)
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': shBlob() })]);
      shNote('GÃ¶rsel panoya kopyalandÄ± â€” sohbete yapÄ±ÅŸtÄ±rabilirsin.');
      return;
    }
  } catch (e) { /* 2. denemeye geÃ§ */ }
  // 2. deneme: blob hazÄ±rlayÄ±p yaz
  try {
    const b = await shBlob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
    shNote('GÃ¶rsel panoya kopyalandÄ± â€” sohbete yapÄ±ÅŸtÄ±rabilirsin.');
    return;
  } catch (e) { /* 3. yola geÃ§ */ }
  // 3. yol: pano bu ortamda kapalÄ± â€” uzun basma yÃ¶nlendirmesi
  const tip = document.getElementById('sh-tip');
  tip.style.background = 'var(--amber-soft)';
  tip.innerHTML = 'Pano bu ortamda kapalÄ± (uygulama Ã§erÃ§eve iÃ§inde Ã§alÄ±ÅŸÄ±yor). <b>GÃ¶rsele uzun bas â†’ GÃ¶rseli kopyala / PaylaÅŸ</b>, ya da Ä°ndir de galerinden gÃ¶nder.';
  shNote('Panoya yazma izni yok â€” yukarÄ±daki yolu kullan.');
}
function openShare(data) {
  shData = data;
  const rBox = document.getElementById('sh-r');
  const has = data.r !== '' && !isNaN(Number(data.r));
  rBox.disabled = !has; if (!has) rBox.checked = false;
  const sBox = document.getElementById('sh-sent');
  sBox.disabled = !data.sent;
  const tip = document.getElementById('sh-tip');
  tip.style.background = '';
  tip.innerHTML = 'GÃ¶rsele <b>uzun bas</b> â†’ â€œGÃ¶rseli kopyalaâ€ ya da â€œPaylaÅŸâ€. En kestirme yol bu.';
  const sendBtn = document.getElementById('sh-send');
  const canShare = !!(navigator.share && navigator.canShare);
  sendBtn.style.opacity = canShare ? '1' : '0.5';
  sendBtn.title = canShare ? '' : 'Bu ortamda kapalÄ± olabilir';
  document.getElementById('share-modal').classList.add('open');
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawShareCard);
  drawShareCard();
}

async function exportBackup() {
  const dump = { app: 'konfirmasyon-defteri', ver: 1, exported: new Date().toISOString(), keys: {} };
  const collect = async k => {
    const v = await store.get(k);
    if (v !== null && v !== undefined) dump.keys[k] = v;
  };
  await collect(STORAGE_KEY);
  await collect(TRADES_KEY);
  await collect(LESSONS_KEY);
  const dailyKeys = await store.list(DAILY_PREFIX);
  for (const k of dailyKeys) await collect(k);
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'konfirmasyon-defteri-yedek-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  const note = document.getElementById('save-note');
  note.textContent = 'Yedek indirildi (' + Object.keys(dump.keys).length + ' kayÄ±t).';
  setTimeout(() => { note.textContent = ''; }, 5000);
}

async function applyDump(dump) {
  // Yeni format: { keys: {...} } â€” eski format: { config, trades, dailyPlans }
  let n = 0;
  if (dump && dump.keys && typeof dump.keys === 'object') {
    for (const k of Object.keys(dump.keys)) {
      if (k !== STORAGE_KEY && k !== TRADES_KEY && k !== LESSONS_KEY && k.indexOf(DAILY_PREFIX) !== 0) continue;
      await store.set(k, dump.keys[k]); n++;
    }
    return n;
  }
  if (dump && (dump.config || dump.trades || dump.dailyPlans)) {
    if (dump.config) { await store.set(STORAGE_KEY, JSON.stringify(dump.config)); n++; }
    if (Array.isArray(dump.trades)) { await store.set(TRADES_KEY, JSON.stringify(dump.trades)); n++; }
    if (dump.dailyPlans && typeof dump.dailyPlans === 'object') {
      for (const d of Object.keys(dump.dailyPlans)) {
        await store.set(DAILY_PREFIX + d, JSON.stringify(dump.dailyPlans[d])); n++;
      }
    }
    return n;
  }
  throw new Error('format');
}

async function mergeSeed() {
  const note = document.getElementById('save-note');
  if (typeof SEED === 'undefined' || !SEED) { note.textContent = 'GÃ¶mÃ¼lÃ¼ kayÄ±t yok.'; return; }
  let added = 0;
  // gÃ¼nlÃ¼k planlar â€” sadece o tarih yoksa ekle
  const plans = (SEED.dailyPlans && typeof SEED.dailyPlans === 'object') ? SEED.dailyPlans : {};
  for (const d of Object.keys(plans)) {
    const key = DAILY_PREFIX + d;
    const existing = await store.get(key);
    if (!existing) { await store.set(key, JSON.stringify(plans[d])); added++; }
  }
  // iÅŸlemler â€” aynÄ± id yoksa ekle
  const seedTrades = Array.isArray(SEED.trades) ? SEED.trades : [];
  const haveIds = new Set(trades.map(t => t.id));
  let tradeAdded = 0;
  seedTrades.forEach(t => { if (!haveIds.has(t.id)) { trades.push(t); haveIds.add(t.id); tradeAdded++; } });
  if (tradeAdded) {
    trades.sort((a, b) => (b.id || 0) - (a.id || 0));
    await saveTrades(); renderTrades();
  }
  added += tradeAdded;
  await loadDaily();
  note.textContent = added ? ('Eklendi: ' + tradeAdded + ' iÅŸlem, ' + (added - tradeAdded) + ' plan. Mevcut kayÄ±tlara dokunulmadÄ±.')
                           : 'Zaten gÃ¼ncel â€” eklenecek eksik kayÄ±t yok.';
  setTimeout(() => { note.textContent = ''; }, 6000);
}

async function seedIfEmpty() {
  if (typeof SEED === 'undefined' || !SEED) return;
  try {
    const hasCfg = await store.get(STORAGE_KEY);
    const hasTrades = await store.get(TRADES_KEY);
    if (hasCfg || hasTrades) return; // dolu depoya asla dokunma
    await applyDump(SEED);
  } catch (e) { /* seed baÅŸarÄ±sÄ±zsa boÅŸ baÅŸla */ }
}

async function importBackup(file) {
  const note = document.getElementById('save-note');
  try {
    const text = await file.text();
    const dump = JSON.parse(text);
    const n = await applyDump(dump);
    await loadConfig(); ensureConfigShape(); await loadTrades();
    await loadLessons(); renderLessons();
    checked = new Set();
    renderCriteria(); render(); renderMatrix(); renderTrades(); loadDaily();
    if (document.getElementById('editor').classList.contains('open')) renderEditor();
    note.textContent = 'Yedek yÃ¼klendi (' + n + ' kayÄ±t geri geldi).';
  } catch (e) {
    note.textContent = 'Yedek okunamadÄ± â€” dosya bu uygulamanÄ±n yedeÄŸi mi?';
  }
  setTimeout(() => { note.textContent = ''; }, 5000);
}
let openTrades = new Set();

// ---- Ä°ÅŸlem ekleri: fotoÄŸraf (Ctrl+V / dosya / sÃ¼rÃ¼kle-bÄ±rak) ----
let ekImgs = [];
function ekRender() {
  const box = document.getElementById('d-ek-imgs');
  if (!box) return;
  const hint = document.getElementById('d-ek-hint');
  if (hint) hint.style.display = ekImgs.length ? 'none' : '';
  box.querySelectorAll('.thmb').forEach(x => x.remove());
  ekImgs.forEach((u, i) => {
    const d = document.createElement('div'); d.className = 'thmb';
    const img = document.createElement('img'); img.src = u; img.alt = 'iÅŸlem gÃ¶rseli ' + (i + 1); img.title = 'BÃ¼yÃ¼t';
    img.addEventListener('click', e => { e.stopPropagation(); if (typeof magZoom === 'function') magZoom(u); });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = 'Ã—'; del.title = 'GÃ¶rseli kaldÄ±r';
    del.addEventListener('click', e => { e.stopPropagation(); ekImgs.splice(i, 1); ekRender(); });
    d.appendChild(img); d.appendChild(del);
    box.appendChild(d);
  });
}
function ekAddFiles(fileList) {
  const list = Array.from(fileList || []).filter(f => f && f.type && f.type.indexOf('image/') === 0);
  if (!list.length) return false;
  list.forEach(f => { const r = new FileReader(); r.onload = ev => { ekImgs.push(ev.target.result); ekRender(); }; r.readAsDataURL(f); });
  return true;
}
function pickImageFiles(e) {
  const out = [];
  const items = e.clipboardData && e.clipboardData.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      const f = it.getAsFile ? it.getAsFile() : null;
      if (f && f.type && f.type.indexOf('image/') === 0) out.push(f);
    }
  }
  if (!out.length && e.clipboardData && e.clipboardData.files) {
    for (let i = 0; i < e.clipboardData.files.length; i++) {
      const f = e.clipboardData.files[i];
      if (f && f.type && f.type.indexOf('image/') === 0) out.push(f);
    }
  }
  return out;
}
function ekClear() {
  ekImgs = [];
  const t = document.getElementById('d-eknot'); if (t) t.value = '';
  ekRender();
}
function ekBind() {
  const box = document.getElementById('d-ek-imgs');
  if (!box) return;
  const pick = () => { const f = document.getElementById('d-ek-file'); if (f) f.click(); };
  box.addEventListener('paste', e => {
    const files = pickImageFiles(e);
    if (!files.length) { const n = document.getElementById('daily-note'); if (n) n.textContent = 'Panoda gÃ¶rsel bulunamadÄ±.'; return; }
    e.preventDefault();
    ekAddFiles(files);
  });
  box.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
  });
  document.addEventListener('paste', e => {
    if (e.defaultPrevented) return;
    const ed = e.target && e.target.closest ? e.target.closest('.td-ek-editor') : null;
    if (!ed) return;
    const files = pickImageFiles(e);
    if (!files.length) return;
    e.preventDefault();
    if (ed && ed._addFiles) ed._addFiles(files);
  });
  box.addEventListener('click', () => box.focus());
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('focus'); });
  box.addEventListener('dragleave', () => box.classList.remove('focus'));
  box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('focus'); ekAddFiles(e.dataTransfer.files); });
  document.getElementById('d-ek-file').addEventListener('change', e => { ekAddFiles(e.target.files); e.target.value = ''; });
  document.getElementById('d-ek-btn').addEventListener('click', e => { e.stopPropagation(); pick(); });
  document.getElementById('d-ek-clear').addEventListener('click', ekClear);
  ekRender();
}

async function logTrade() {
  const note = document.getElementById('daily-note');
  try {
  if (intentLocked()) {
    note.textContent = 'Ä°ÅŸlem aÃ§Ä±lamaz â€” giriÅŸte "Duygumu" seÃ§ili. Setup tradelemiyorsan bu iÅŸlemi geÃ§.';
    note.style.color = 'var(--red)';
    setTimeout(() => { note.style.color = ''; }, 6000);
    return;
  }
  const s = computeScore();
  const crits = [], miss = [];
  cfg().criteria.forEach((c, i) => {
    if (checked.has(i)) crits.push({ n: c.name, p: ptsFor(c) });
    else miss.push(c.name);
  });
  const now = new Date();

  // tarih kutusu: boÅŸsa bugÃ¼n, doluysa GG/AA
  let date = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  let day = selDay;
  const di = document.getElementById('trade-date');
  const raw = (di.value || '').trim();
  if (raw) {
    if (!/^\d{1,2}\/\d{1,2}$/.test(raw)) {
      note.textContent = 'Tarih biÃ§imi GG/AA olmalÄ± (Ã¶r. 22/07) â€” ya da boÅŸ bÄ±rak, bugÃ¼nÃ¼ alsÄ±n.';
      setTimeout(() => { note.textContent = ''; }, 5000);
      di.focus(); return;
    }
    const [d, m] = raw.split('/');
    date = d.padStart(2, '0') + '/' + m.padStart(2, '0');
    const jsDay = new Date(2026, parseInt(m, 10) - 1, parseInt(d, 10)).getDay();
    const dayMap = ['Paz', 'Pzt', 'Sal', 'Ã‡ar', 'Per', 'Cum', 'Cmt'];
    if (!isNaN(jsDay)) day = dayMap[jsDay];
  }

  // Gold pazartesi: gÃ¼nde tek iÅŸlem. AynÄ± gÃ¼n ikinci gold iÅŸlemi uyarÄ± ister.
  const isGold = pair === 'XAU' || pair.indexOf('XAU') !== -1 || pair.indexOf('GOLD') !== -1;
  if (isGold && day === 'Pzt') {
    const sameDay = trades.filter(t => {
      const tg = t.pair === 'XAU' || (t.pair || '').indexOf('XAU') !== -1 || (t.pair || '').indexOf('GOLD') !== -1;
      return tg && t.date === date;
    }).length;
    if (sameDay >= 1 && !window.__mondayOverride) {
      window.__mondayOverride = true;
      note.textContent = 'DUR â€” gold pazartesi kuralÄ±: gÃ¼nde tek iÅŸlem. Bu ikinci iÅŸlem. Yine de kaydetmek iÃ§in tekrar bas.';
      note.style.color = 'var(--red)';
      setTimeout(() => { note.style.color = ''; window.__mondayOverride = false; }, 8000);
      return;
    }
    window.__mondayOverride = false;
  }
  const ekNote = (document.getElementById('d-eknot').value || '').trim();
  trades.unshift({
    id: now.getTime(),
    date: date,
    time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    pair: pair, dir: direction,
    score: Math.round(s),
    verdict: verdictOf(s, cfg().thresholds),
    crits: crits, miss: miss, mood: mood, day: day, sess: session, cell: currentCell(),
    cap: (s >= cfg().thresholds.aplus && currentCell() !== 'A+'), strat: strat, sent: sent,
    emoBlock: emoLocked(), intent: intent, stars: 0, r: '',
    sabah: document.getElementById('d-sabah').value,
    senaryo: document.getElementById('d-senaryo').value,
    anti: document.getElementById('d-anti').value,
    gunsonu: document.getElementById('d-gunsonu').value,
    note: ekNote,
    images: ekImgs.slice()
  });
  saveTrades(); renderTrades();
  di.value = '';
  // Trade GÃ¼nlÃ¼ÄŸÃ¼'ne de anÄ±nda aktar (not + gÃ¶rsellerle)
  let jEntry = null;
  try {
    await loadData();
    if (!Array.isArray(dataTrades)) dataTrades = [];
    const [dd, mm] = date.split('/');
    const fullDate = (dd && mm) ? ('2026-' + mm + '-' + dd) : '';
    jEntry = {
      id: now.getTime() + 0.0001,
      ts: now.getTime(),
      date: fullDate,
      pair: pair, dir: direction,
      r: 0, strat: strat, model: '',
      note: ekNote,
      images: ekImgs.slice(),
      _from: 'checklist'
    };
    dataTrades.unshift(jEntry);
    await saveData();
  } catch (e) { console.error('Trade GÃ¼nlÃ¼ÄŸÃ¼ aktarma hatasÄ±:', e); }
  ekClear();
  note.textContent = 'Ä°ÅŸlem kaydedildi â€” Trade GÃ¼nlÃ¼ÄŸÃ¼ + Notion\'a da eklendi.';
  setTimeout(() => { note.textContent = ''; }, 4000);
  // Notion'a senkron et
  const nt = trades[0];
  const noteText = [nt.sabah ? 'Sabah: ' + nt.sabah : '', nt.senaryo ? 'Senaryo: ' + nt.senaryo : '', nt.anti ? 'Anti: ' + nt.anti : '', nt.gunsonu ? 'GÃ¼n Sonu: ' + nt.gunsonu : '', nt.note ? 'Not: ' + nt.note : ''].filter(Boolean).join('\n');
  const ntrade = { id: nt.id, ts: nt.id, date: nt.date, pair: nt.pair, dir: nt.dir, r: nt.r, strat: nt.strat, note: noteText || '', stars: nt.stars, notionId: nt.notionId || undefined, images: nt.images || [] };
  fetch('/api/notion-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ntrade) })
    .then(r => r.json().catch(() => ({})))
    .then(j => {
      const rr = Array.isArray(j.results) ? j.results[0] : null;
      if (rr && rr.ok && rr.notionId && !nt.notionId) {
        nt.notionId = rr.notionId;
        saveTrades();
        if (jEntry) { jEntry.notionId = rr.notionId; saveData(); }
      }
    })
    .catch(() => {});
  } catch (e) {
    console.error('logTrade hatasÄ±:', e);
    note.textContent = 'Ä°ÅŸlem kaydedilemedi: ' + e.message;
    note.style.color = 'var(--red)';
    setTimeout(() => { note.textContent = ''; }, 6000);
  }
}

function critNames(t) {
  return (t.crits || []).map(c => typeof c === 'string' ? c : c.n);
}

let tradeFilter = 'all';
function tradeDateObj(t) {
  // t.date "GG/AA" â†’ 2026 yÄ±lÄ± varsayÄ±mÄ±yla Date
  const p = (t.date || '').split('/');
  if (p.length !== 2) return null;
  const d = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (isNaN(d) || isNaN(m)) return null;
  return new Date(2026, m - 1, d);
}
function passesFilter(t) {
  if (tradeFilter === 'all') return true;
  if (tradeFilter === 'pair') return t.pair === pair;
  const td = tradeDateObj(t);
  if (!td) return false;
  const now = new Date();
  if (tradeFilter === 'today') {
    return td.getDate() === now.getDate() && td.getMonth() === now.getMonth();
  }
  if (tradeFilter === 'month') {
    return td.getMonth() === now.getMonth();
  }
  if (tradeFilter === 'week') {
    // haftanÄ±n pazartesisi
    const day = (now.getDay() + 6) % 7; // Pzt=0
    const monday = new Date(now); monday.setDate(now.getDate() - day); monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    return td >= monday && td <= sunday;
  }
  return true;
}

function renderTrades() {
  const list = document.getElementById('trade-list');
  const stats = document.getElementById('trade-stats');
  document.getElementById('trade-count').textContent = trades.length;
  list.innerHTML = '';

  const shown = trades.filter(passesFilter);
  const withR = shown.filter(t => t.r !== '' && !isNaN(Number(t.r)));
  if (withR.length > 0) {
    const grp = {};
    withR.forEach(t => {
      if (!grp[t.verdict]) grp[t.verdict] = { n: 0, sum: 0 };
      grp[t.verdict].n++; grp[t.verdict].sum += Number(t.r);
    });
    const parts = Object.keys(grp).map(v => {
      const g = grp[v];
      return '<b>' + v + '</b> (' + g.n + ' iÅŸlem): toplam ' + g.sum.toFixed(2) + 'R, ort ' + (g.sum / g.n).toFixed(2) + 'R';
    });
    stats.innerHTML = 'Skor Ã— sonuÃ§: ' + parts.join(' Â· ');
  } else {
    stats.textContent = shown.length > 0
      ? 'SonuÃ§lanan iÅŸlemlerin R deÄŸerini gir â€” skor dilimlerinin gerÃ§ek performansÄ± burada birikecek.'
      : (trades.length > 0 ? 'Bu filtrede iÅŸlem yok.' : 'HenÃ¼z kayÄ±t yok. Kriterleri tikleyip "Ä°ÅŸlemi Kaydet" de.');
  }

  shown.slice(0, 60).forEach(t => {
    const row = document.createElement('div');
    row.className = 'trade-row';
    const when = document.createElement('span');
    when.className = 'when'; when.textContent = t.date + ' ' + t.time;
    when.title = 'Tarihi dÃ¼zenlemek iÃ§in tÄ±kla';
    when.style.cursor = 'pointer';
    when.addEventListener('click', async e => {
      e.stopPropagation();
      const cur = t.date || '';
      const inp = prompt('Ä°ÅŸlem tarihi (GG/AA):', cur);
      if (inp === null) return;
      const v = inp.trim();
      if (!/^\d{1,2}\/\d{1,2}$/.test(v)) { alert('BiÃ§im GG/AA olmalÄ±, Ã¶r. 22/07'); return; }
      const [d, m] = v.split('/');
      t.date = d.padStart(2, '0') + '/' + m.padStart(2, '0');
      // gÃ¼n-seans hÃ¼cresini de tarihe gÃ¶re gÃ¼ncelle
      const jsDay = new Date(2026, parseInt(m, 10) - 1, parseInt(d, 10)).getDay();
      const dayMap = ['Paz', 'Pzt', 'Sal', 'Ã‡ar', 'Per', 'Cum', 'Cmt'];
      if (!isNaN(jsDay)) t.day = dayMap[jsDay];
      await saveTrades(); renderTrades();
    });
    const pd = document.createElement('span');
    pd.className = 'pd ' + (t.dir === 'LONG' ? 'dl' : 'ds');
    pd.textContent = t.pair + ' ' + t.dir;
    const sc = document.createElement('span');
    sc.className = 'sc ' + (t.verdict === 'A+' ? 'a' : t.verdict === 'B' ? 'b' : 'no');
    sc.innerHTML = '%' + t.score + ' Â· ' + t.verdict + (t.override ? ' <span class="ov">âœ</span>' : '');
    const crits = document.createElement('span');
    crits.className = 'crits';
    crits.textContent = critNames(t).length + ' kriter ' + (openTrades.has(t.id) ? 'â–´' : 'â–¾');
    let stratChip = null;
    if (t.strat && t.strat.trim() !== '') {
      stratChip = document.createElement('span');
      stratChip.className = 'strat';
      stratChip.textContent = t.strat;
    }
    let ekBadge = null;
    if ((t.note && t.note.trim()) || (t.images && t.images.length)) {
      ekBadge = document.createElement('span');
      ekBadge.className = 'ek-badge';
      ekBadge.textContent = 'ğŸ“· ' + (t.images && t.images.length ? t.images.length : 0);
      ekBadge.title = 'Not / gÃ¶rsel eklendi';
    }
    const rwrap = document.createElement('span');
    rwrap.className = 'rwrap';
    const rlbl = document.createElement('span'); rlbl.textContent = 'R';
    const rin = document.createElement('input');
    rin.className = 'rin'; rin.type = 'number'; rin.step = '0.05'; rin.placeholder = 'â€”';
    rin.value = t.r;
    rin.setAttribute('aria-label', 'SonuÃ§ (R)');
    rin.addEventListener('click', e => e.stopPropagation());
    rin.addEventListener('change', () => {
      t.r = rin.value;
      saveTrades(); renderTrades();
      const nt = { id: t.id, ts: t.id, date: t.date, pair: t.pair, dir: t.dir, r: t.r, strat: t.strat, note: t.note || '', stars: t.stars, notionId: t.notionId || undefined, images: t.images || [] };
      fetch('/api/notion-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nt) }).catch(() => {});
    });
    rwrap.appendChild(rlbl); rwrap.appendChild(rin);
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = 'Ã—'; del.setAttribute('aria-label', 'KaydÄ± sil');
    del.addEventListener('click', e => {
      e.stopPropagation();
      trades = trades.filter(x => x.id !== t.id);
      saveTrades(); renderTrades();
    });

    const detail = document.createElement('div');
    detail.className = 'trade-detail';
    if (typeof t.mood === 'number') {
      const [mlbl] = moodLabel(t.mood);
      const mi = document.createElement('div');
      mi.className = 'td-item ' + (Math.abs(t.mood) <= 2 ? 'yes' : 'no');
      mi.innerHTML = '<span class="mk">â—ˆ</span><span></span>';
      mi.children[1].textContent = 'Duygu ibresi: ' + mlbl + ' (' + (t.mood > 0 ? '+' : '') + t.mood + ')';
      detail.appendChild(mi);
    }
    if (t.sess) {
      const si = document.createElement('div');
      si.className = 'td-item yes';
      si.innerHTML = '<span class="mk">â—‰</span><span></span>';
      si.children[1].textContent = 'Seans: ' + (t.day ? t.day + ' ' : '') + t.sess + (t.cell ? ' Â· hÃ¼cre kalitesi: ' + t.cell : '');
      detail.appendChild(si);
    }
    if (t.sent) {
      const se = document.createElement('div');
      const contra = t.sent !== t.dir;
      se.className = 'td-item ' + (contra ? 'yes' : 'no');
      se.innerHTML = '<span class="mk">â‡„</span><span></span>';
      se.children[1].textContent = 'DuyarlÄ±lÄ±k: Ã§oÄŸunluk ' + t.sent + ' â€” ' + (contra ? 'ters bias konfluensi (+' + SENT_PTS + ')' : 'kalabalÄ±kla aynÄ± yÃ¶n (âˆ’' + SENT_PTS + ')');
      detail.appendChild(se);
    }
    if (t.cap) {
      const ci = document.createElement('div');
      ci.className = 'td-item no';
      ci.innerHTML = '<span class="mk">â—·</span><span></span>';
      ci.children[1].textContent = 'GÃ¼n/Seans kuralÄ± uygulandÄ±: skor A+ bÃ¶lgesinde, karar hÃ¼cre kalitesiyle sÄ±nÄ±rlandÄ±.';
      detail.appendChild(ci);
    }
    (t.crits || []).forEach(c => {
      const name = typeof c === 'string' ? c : c.n;
      const pts = typeof c === 'string' ? null : c.p;
      const it = document.createElement('div');
      it.className = 'td-item yes';
      it.innerHTML = '<span class="mk">âœ“</span><span></span>' + (pts !== null ? '<span class="tp"></span>' : '');
      it.children[1].textContent = name;
      if (pts !== null) it.children[2].textContent = (pts > 0 ? '+' : '') + pts;
      detail.appendChild(it);
    });
    (t.miss || []).forEach(name => {
      const it = document.createElement('div');
      it.className = 'td-item no';
      it.innerHTML = '<span class="mk">â—‹</span><span></span>';
      it.children[1].textContent = name;
      detail.appendChild(it);
    });

    const form = document.createElement('div');
    form.className = 'td-form';
    form.addEventListener('click', e => e.stopPropagation());
    const vlbl = document.createElement('label'); vlbl.textContent = 'Karar';
    const vsel = document.createElement('select');
    ['A+', 'B', 'YOK'].forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      if (t.verdict === v) o.selected = true;
      vsel.appendChild(o);
    });
    vsel.addEventListener('change', () => {
      t.verdict = vsel.value;
      t.override = true;
      saveTrades(); renderTrades();
    });
    const slbl = document.createElement('label'); slbl.textContent = 'Strateji';
    const sinp = document.createElement('input');
    sinp.type = 'text'; sinp.placeholder = 'Ã¶r. Breaker Trap v2, WOS, Contrarian Short...';
    sinp.value = t.strat || '';
    sinp.addEventListener('change', () => {
      t.strat = sinp.value;
      saveTrades(); renderTrades();
    });
    form.appendChild(vlbl); form.appendChild(vsel);
    form.appendChild(slbl); form.appendChild(sinp);
    detail.appendChild(form);

    // AkÅŸam: karar/sÃ¼reÃ§ yÄ±ldÄ±zÄ± (serbest, 1-5)
    const starWrap = document.createElement('div');
    // GÃ¼nlÃ¼k plan notlarÄ±
    if (t.sabah || t.senaryo || t.anti || t.gunsonu) {
      const planDiv = document.createElement('div');
      planDiv.style.cssText = 'border-top:1px solid var(--border);margin-top:10px;padding-top:10px;';
      planDiv.addEventListener('click', e => e.stopPropagation());
      if (t.sabah) { const r = document.createElement('div'); r.className = 'td-item yes'; r.innerHTML = '<span class="mk">â˜€</span><span></span>'; r.children[1].textContent = t.sabah; planDiv.appendChild(r); }
      if (t.senaryo) { const r = document.createElement('div'); r.className = 'td-item yes'; r.innerHTML = '<span class="mk">â†’</span><span></span>'; r.children[1].textContent = 'Senaryo: ' + t.senaryo; planDiv.appendChild(r); }
      if (t.anti) { const r = document.createElement('div'); r.className = 'td-item yes'; r.innerHTML = '<span class="mk">â†</span><span></span>'; r.children[1].textContent = 'Anti: ' + t.anti; planDiv.appendChild(r); }
      if (t.gunsonu) { const r = document.createElement('div'); r.className = 'td-item yes'; r.innerHTML = '<span class="mk">â—·</span><span></span>'; r.children[1].textContent = 'GÃ¼n sonu: ' + t.gunsonu; planDiv.appendChild(r); }
      starWrap.insertAdjacentElement('beforebegin', planDiv);
    }
    starWrap.className = 'td-stars';
    starWrap.addEventListener('click', e => e.stopPropagation());
    const sl = document.createElement('span'); sl.className = 'sl'; sl.textContent = 'Karar';
    const srow = document.createElement('div'); srow.className = 'star-row';
    const cap = document.createElement('span'); cap.className = 'star-cap';
    const STAR_CAP = { 0: 'akÅŸam doldur', 1: 'kÃ¶tÃ¼ karar Â· kÃ¶tÃ¼ sÃ¼reÃ§', 2: 'zayÄ±f', 3: 'idare eder', 4: 'iyi', 5: 'iyi karar Â· iyi sÃ¼reÃ§' };
    const paintStars = () => {
      const val = t.stars || 0;
      [...srow.children].forEach((b, i) => { b.className = i < val ? 'lit' : ''; b.textContent = i < val ? 'â˜…' : 'â˜†'; });
      cap.textContent = STAR_CAP[val];
    };
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.setAttribute('aria-label', i + ' yÄ±ldÄ±z');
      b.addEventListener('click', () => {
        t.stars = (t.stars === i ? 0 : i); // aynÄ±ya basÄ±nca sÄ±fÄ±rla
        saveTrades(); paintStars();
      });
      srow.appendChild(b);
    }
    paintStars();
    starWrap.appendChild(sl); starWrap.appendChild(srow); starWrap.appendChild(cap);

    // giriÅŸ niyeti rozeti (varsa)
    if (t.intent) {
      const ib = document.createElement('span');
      ib.className = 'star-cap';
      ib.style.marginLeft = 'auto';
      ib.style.fontWeight = '700';
      ib.style.color = t.intent === 'setup' ? 'var(--green)' : 'var(--red)';
      ib.textContent = t.intent === 'setup' ? "GiriÅŸte: Setup'Ä±" : 'GiriÅŸte: Duygumu';
      starWrap.appendChild(ib);
    }
    detail.appendChild(starWrap);

    // Ä°ÅŸlem ekleri editÃ¶rÃ¼ â€” not + fotoÄŸraf (Trade GÃ¼nlÃ¼ÄŸÃ¼ + Notion senkronu)
    const ekEditor = document.createElement('div');
    ekEditor.className = 'td-ek-editor';
    ekEditor.addEventListener('click', e => e.stopPropagation());
    ekEditor._imgs = (t.images || []).slice();
    const ekNoteEl = document.createElement('textarea');
    ekNoteEl.className = 'td-ek-note';
    ekNoteEl.placeholder = 'Ä°ÅŸlem notu â€” kaydedince Trade GÃ¼nlÃ¼ÄŸÃ¼ + Notion\'a gider.';
    ekNoteEl.value = t.note || '';
    const ekBox = document.createElement('div');
    ekBox.className = 'td-ek-box';
    ekBox.tabIndex = 0;
    ekBox.setAttribute('title', 'TÄ±kla â†’ dosya seÃ§ Â· Ctrl+V ile yapÄ±ÅŸtÄ±r Â· sÃ¼rÃ¼kle-bÄ±rak');
    const ekHintEl = document.createElement('span');
    ekHintEl.className = 'hint';
    ekHintEl.textContent = 'ğŸ“· FotoÄŸraf: Ctrl+V ile yapÄ±ÅŸtÄ±r ya da "GÃ¶rsel ekle" butonuyla dosya seÃ§.';
    ekBox.appendChild(ekHintEl);
    const paintThumbs = () => {
      ekBox.querySelectorAll('.thmb').forEach(x => x.remove());
      ekHintEl.style.display = ekEditor._imgs.length ? 'none' : '';
      ekEditor._imgs.forEach((u, i) => {
        const d = document.createElement('div'); d.className = 'thmb';
        const img = document.createElement('img'); img.src = u; img.alt = 'iÅŸlem gÃ¶rseli ' + (i + 1); img.title = 'BÃ¼yÃ¼t';
        img.addEventListener('click', e => { e.stopPropagation(); if (typeof magZoom === 'function') magZoom(u); });
        const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = 'Ã—'; del.title = 'GÃ¶rseli kaldÄ±r';
        del.addEventListener('click', e => { e.stopPropagation(); ekEditor._imgs.splice(i, 1); paintThumbs(); });
        d.appendChild(img); d.appendChild(del);
        ekBox.appendChild(d);
      });
    };
    ekEditor._addFiles = fileList => {
      const list = Array.from(fileList || []).filter(f => f && f.type && f.type.indexOf('image/') === 0);
      if (!list.length) return false;
      list.forEach(f => {
        const r = new FileReader();
        r.onload = ev => { ekEditor._imgs.push(ev.target.result); paintThumbs(); ekStatus.textContent = 'GÃ¶rsel eklendi â€” kaydetmek iÃ§in "Notu Kaydet".'; };
        r.readAsDataURL(f);
      });
      return true;
    };
    ekEditor.addEventListener('paste', e => {
      const files = pickImageFiles(e);
      if (!files.length) return;
      e.preventDefault();
      ekEditor._addFiles(files);
    });
    paintThumbs();
    const ekActs = document.createElement('div');
    ekActs.className = 'td-ek-acts';
    const ekAddBtn = document.createElement('button');
    ekAddBtn.type = 'button'; ekAddBtn.className = 'btn'; ekAddBtn.textContent = 'ğŸ“ GÃ¶rsel ekle';
    const ekFile = document.createElement('input');
    ekFile.type = 'file'; ekFile.accept = 'image/*'; ekFile.multiple = true; ekFile.style.display = 'none';
    const ekSaveBtn = document.createElement('button');
    ekSaveBtn.type = 'button'; ekSaveBtn.className = 'btn solid'; ekSaveBtn.textContent = 'Notu Kaydet';
    const ekStatus = document.createElement('span');
    ekStatus.className = 'td-ek-status';
    const ekJournalBtn = document.createElement('button');
    ekJournalBtn.type = 'button'; ekJournalBtn.className = 'btn'; ekJournalBtn.textContent = 'GÃ¼nlÃ¼ÄŸe kaydet';
    ekActs.appendChild(ekAddBtn); ekActs.appendChild(ekFile); ekActs.appendChild(ekSaveBtn); ekActs.appendChild(ekJournalBtn); ekActs.appendChild(ekStatus);
    ekAddBtn.addEventListener('click', e => { e.stopPropagation(); ekFile.click(); });
    ekFile.addEventListener('change', () => { ekEditor._addFiles(ekFile.files); ekFile.value = ''; });
    ekBox.addEventListener('click', () => ekBox.focus());
    ekBox.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ekFile.click(); }
    });
    ekBox.addEventListener('dragover', e => { e.preventDefault(); ekBox.classList.add('focus'); });
    ekBox.addEventListener('dragleave', () => ekBox.classList.remove('focus'));
    ekBox.addEventListener('drop', e => { e.preventDefault(); ekBox.classList.remove('focus'); ekEditor._addFiles(e.dataTransfer.files); });
    const ekSync = async (createIfMissing) => {
      t.note = ekNoteEl.value.trim();
      t.images = ekEditor._imgs.slice();
      saveTrades();
      let jj = null, created = false;
      try {
        const res = await dfSaveTradeToJournal(t, createIfMissing);
        jj = res.jj; created = res.created;
      } catch (err) { console.error('Trade GÃ¼nlÃ¼ÄŸÃ¼ senkron hatasÄ±:', err); }
      try { await dfSyncTradeNotion(t, jj); } catch (err) { console.error('Notion senkron hatasÄ±:', err); }
      renderTrades();
      const dn = document.getElementById('daily-note');
      if (dn) {
        dn.textContent = created ? 'Trade GÃ¼nlÃ¼ÄŸÃ¼ne kaydedildi (not + fotoÄŸraf).' : 'Not kaydedildi â€” Trade GÃ¼nlÃ¼ÄŸÃ¼ + Notion gÃ¼ncellendi.';
        setTimeout(() => { dn.textContent = ''; }, 4000);
      }
    };
    ekSaveBtn.addEventListener('click', e => { e.stopPropagation(); ekSync(false); });
    ekJournalBtn.addEventListener('click', e => { e.stopPropagation(); ekSync(true); });
    ekEditor.appendChild(ekNoteEl); ekEditor.appendChild(ekBox); ekEditor.appendChild(ekActs);
    detail.appendChild(ekEditor);

    if (openTrades.has(t.id)) row.classList.add('open');
    row.addEventListener('click', () => {
      if (openTrades.has(t.id)) openTrades.delete(t.id); else openTrades.add(t.id);
      row.classList.toggle('open');
      crits.textContent = critNames(t).length + ' kriter ' + (row.classList.contains('open') ? 'â–´' : 'â–¾');
    });

    const shb = document.createElement('button');
    shb.className = 'del'; shb.textContent = 'â¤´'; shb.setAttribute('aria-label', 'Bu iÅŸlemi gÃ¶rsel olarak paylaÅŸ');
    shb.addEventListener('click', async e => {
      e.stopPropagation();
      const data = tradeShareData(t);
      await attachPlanToShare(data);
      openShare(data);
    });

    row.appendChild(when); row.appendChild(pd); row.appendChild(sc);
    if (stratChip) row.appendChild(stratChip);
    if (ekBadge) row.appendChild(ekBadge);
    row.appendChild(crits); row.appendChild(rwrap); row.appendChild(shb); row.appendChild(del);
    row.appendChild(detail);
    list.appendChild(row);
  });

  renderAnalysis();
}

function renderAnalysis() {
  const list = document.getElementById('an-list');
  const hint = document.getElementById('an-hint');
  const count = document.getElementById('an-count');
  list.innerHTML = '';

  const withR = trades.filter(t => t.r !== '' && !isNaN(Number(t.r)));
  count.textContent = withR.length + ' sonuÃ§lu iÅŸlem';
  if (withR.length < 5) {
    hint.textContent = 'Kriter bazlÄ± analiz iÃ§in en az 5 sonuÃ§lu (R girilmiÅŸ) iÅŸlem gerekli. KayÄ±tlar biriktikÃ§e her kriterin "varken / yokken" ortalama R farkÄ± burada gÃ¶rÃ¼necek â€” hangi konfirmasyonun gerÃ§ekten Ã§alÄ±ÅŸtÄ±ÄŸÄ±nÄ± bu tablo sÃ¶yleyecek.';
    return;
  }
  hint.textContent = 'Fark = kriter iÅŸaretliyken ort R âˆ’ iÅŸaretli deÄŸilken ort R. Pozitif fark: kriter edge katÄ±yor. 5\'ten az Ã¶rnekli satÄ±rlara gÃ¼venme, "az Ã¶rnek" rozetine dikkat.';

  const names = new Set();
  withR.forEach(t => critNames(t).forEach(n => names.add(n)));

  const stats = [];
  names.forEach(n => {
    const withC = withR.filter(t => critNames(t).includes(n));
    const withoutC = withR.filter(t => !critNames(t).includes(n));
    if (withC.length === 0) return;
    const avgW = withC.reduce((s, t) => s + Number(t.r), 0) / withC.length;
    const avgWo = withoutC.length > 0 ? withoutC.reduce((s, t) => s + Number(t.r), 0) / withoutC.length : null;
    stats.push({ n, cnt: withC.length, avgW, avgWo, diff: avgWo === null ? null : avgW - avgWo });
  });
  stats.sort((a, b) => (b.diff === null ? -Infinity : b.diff) - (a.diff === null ? -Infinity : a.diff));

  stats.forEach(s => {
    const row = document.createElement('div');
    row.className = 'an-row';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = s.n;
    const st = document.createElement('span'); st.className = 'st';
    st.textContent = s.cnt + ' iÅŸlemde âœ“ Â· varken ort ' + s.avgW.toFixed(2) + 'R' +
      (s.avgWo === null ? '' : ' Â· yokken ort ' + s.avgWo.toFixed(2) + 'R');
    const df = document.createElement('span');
    if (s.diff === null) { df.className = 'df neu'; df.textContent = 'â€”'; }
    else {
      df.className = 'df ' + (s.diff > 0.05 ? 'pos' : s.diff < -0.05 ? 'neg' : 'neu');
      df.textContent = (s.diff > 0 ? '+' : '') + s.diff.toFixed(2) + 'R';
    }
    row.appendChild(nm); row.appendChild(st); row.appendChild(df);
    if (s.cnt < 5) {
      const few = document.createElement('span');
      few.className = 'few'; few.textContent = 'az Ã¶rnek';
      row.appendChild(few);
    }
    list.appendChild(row);
  });
}

async function exportData() {
  const dailies = {};
  try {
    const keys = await store.list(DAILY_PREFIX);
    for (const k of keys) {
      try { const v = await store.get(k); if (v) dailies[k.replace(DAILY_PREFIX, '')] = JSON.parse(v); }
      catch (e) { /* atla */ }
    }
  } catch (e) { /* atla */ }
  const payload = {
    exported: new Date().toISOString(),
    config: config,
    trades: trades,
    dailyPlans: dailies
  };
  const box = document.getElementById('export-box');
  box.value = JSON.stringify(payload, null, 1);
  box.style.display = 'block';
  document.getElementById('export-note').style.display = 'block';
  document.getElementById('btn-copy').style.display = 'inline-block';
  box.focus(); box.select();
}

function init() {
  ensureConfigShape();
  session = autoSession();
  selDay = todayName();
  const today = new Date();
  const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const dateInp = document.getElementById('d-date');
  dateInp.value = iso;
  dateInp.addEventListener('change', loadDaily);
  document.getElementById('d-bull').addEventListener('click', () => setBias(dailyBias === 'BULLISH' ? '' : 'BULLISH'));
  document.getElementById('d-bear').addEventListener('click', () => setBias(dailyBias === 'BEARISH' ? '' : 'BEARISH'));
  document.getElementById('d-save').addEventListener('click', saveDaily);
  document.getElementById('d-clear').addEventListener('click', () => { fillDaily(null); });
  document.getElementById('d-pair').addEventListener('focus', function () {
    if (!this.value) this.value = pair;
  });
  loadDaily();

  document.getElementById('mood-range').addEventListener('input', e => {
    mood = Number(e.target.value) || 0;
    renderMood(); render();
  });
  renderMood();

  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-copy').addEventListener('click', () => {
    const box = document.getElementById('export-box');
    box.focus(); box.select();
    try { navigator.clipboard.writeText(box.value); } catch (e) { document.execCommand && document.execCommand('copy'); }
    document.getElementById('export-note').textContent = 'KopyalandÄ± âœ“ â€” ÅŸimdi Claude\'a yapÄ±ÅŸtÄ±r.';
  });

  document.getElementById('btn-logtrade').addEventListener('click', logTrade);
  ekBind();
  const anHead = document.getElementById('an-head');
  if (anHead) anHead.addEventListener('click', () => {
    const body = document.getElementById('an-body');
    const open = body.style.display === 'none';
    body.style.display = open ? '' : 'none';
    anHead.classList.toggle('open', open);
  });
  const lsArch = document.getElementById('ls-arch-head');
  if (lsArch) lsArch.addEventListener('click', () => {
    const body = document.getElementById('ls-list');
    const open = body.style.display === 'none';
    body.style.display = open ? '' : 'none';
    lsArch.classList.toggle('open', open);
  });
  document.querySelectorAll('#trade-filter .tf').forEach(b => {
    b.addEventListener('click', () => {
      tradeFilter = b.getAttribute('data-f');
      document.querySelectorAll('#trade-filter .tf').forEach(x => x.classList.toggle('on', x === b));
      renderTrades();
    });
  });
  document.getElementById('btn-share').addEventListener('click', () => openShare(currentShareData()));
  document.getElementById('sh-close').addEventListener('click', () => document.getElementById('share-modal').classList.remove('open'));
  document.getElementById('share-modal').addEventListener('click', e => {
    if (e.target.id === 'share-modal') document.getElementById('share-modal').classList.remove('open');
  });
  ['sh-crits', 'sh-plan', 'sh-r', 'sh-sent'].forEach(id => document.getElementById(id).addEventListener('change', drawShareCard));
  document.getElementById('sh-tag').addEventListener('input', drawShareCard);
  document.getElementById('sh-send').addEventListener('click', shShare);
  document.getElementById('sh-dl').addEventListener('click', shDownload);
  document.getElementById('sh-copy').addEventListener('click', shCopy);
  loadTrades().then(renderTrades).catch(renderTrades);
  loadLessons().then(renderLessons).catch(renderLessons);
  document.getElementById('ls-btn-add').addEventListener('click', addLesson);
  document.getElementById('ls-text').addEventListener('keydown', e => { if (e.key === 'Enter') addLesson(); });

  document.getElementById('btn-long').addEventListener('click', () => { direction = 'LONG'; renderCriteria(); renderSent(); render(); });
  document.getElementById('btn-short').addEventListener('click', () => { direction = 'SHORT'; renderCriteria(); renderSent(); render(); });
  document.getElementById('sent-long').addEventListener('click', () => {
    sent = (sent === 'LONG' ? '' : 'LONG'); renderSent(); render();
  });
  document.getElementById('sent-short').addEventListener('click', () => {
    sent = (sent === 'SHORT' ? '' : 'SHORT'); renderSent(); render();
  });
  renderSent();
  renderPos();
  applyPairPanels();
  document.getElementById('intent-setup').addEventListener('click', () => {
    intent = (intent === 'setup' ? '' : 'setup'); renderIntent(); render();
  });
  document.getElementById('intent-emo').addEventListener('click', () => {
    intent = (intent === 'emo' ? '' : 'emo'); renderIntent(); render();
  });
  renderIntent();
  document.getElementById('btn-reset').addEventListener('click', () => {
    checked = new Set();
    mood = 0; document.getElementById('mood-range').value = 0; renderMood();
    sent = ''; renderSent();
    posChecked = new Set(); renderPos();
    intent = ''; renderIntent();
    strat = '';
    selDay = todayName();
    renderCriteria(); render();
  });
  document.getElementById('pair-confirm').addEventListener('click', addPair);
  document.getElementById('pair-name').addEventListener('keydown', e => { if (e.key === 'Enter') addPair(); });
  document.getElementById('pair-cancel').addEventListener('click', () => {
    document.getElementById('pair-add').classList.remove('open');
    document.getElementById('pair-name').value = '';
  });
  document.getElementById('btn-edit').addEventListener('click', () => {
    const ed = document.getElementById('editor');
    ed.classList.toggle('open');
    if (ed.classList.contains('open')) { renderEditor(); renderMatrix(); }
  });
  document.getElementById('btn-add').addEventListener('click', () => {
    cfg().criteria.push({ name: '', cat: 'teknik', l: 0, s: 0 });
    renderEditor();
  });
  document.getElementById('th-a').addEventListener('input', e => { cfg().thresholds.aplus = Number(e.target.value) || 70; render(); });
  document.getElementById('th-b').addEventListener('input', e => { cfg().thresholds.b = Number(e.target.value) || 50; render(); });
  document.getElementById('btn-save').addEventListener('click', () => {
    cfg().criteria = cfg().criteria.filter(c => c.name.trim() !== '');
    renderEditor(); renderCriteria(); render(); saveConfig();
  });
  document.getElementById('btn-defaults').addEventListener('click', () => {
    const isGold = pair === 'XAU' || pair.indexOf('XAU') !== -1 || pair.indexOf('GOLD') !== -1;
    config.pairs[pair] = isGold ? defaultXauPair() : defaultPair();
    checked = new Set();
    renderEditor(); renderCriteria(); render(); saveConfig();
  });
  ['veri', 'teknik', 'pozisyon', 'duygu'].forEach(cat => {
    const btn = document.getElementById('catedit-' + cat);
    if (btn) btn.addEventListener('click', () => toggleCatEdit(cat));
  });
  bindAiPanel();
  renderAiBanner();
  bindDataPage();
  bindNewsPage();
  bindDataPage();
  bindEgitimPage();
  bindPanoPage();
  bindIndicatorsPage();
  bindAdminChat();
  bindOnchainPage();
  bindCalcPage();
  bindReviewPage();
  document.getElementById('btn-backup').addEventListener('click', exportBackup);
  document.getElementById('btn-mergeseed').addEventListener('click', mergeSeed);
  document.getElementById('btn-restore').addEventListener('click', () => document.getElementById('restore-file').click());
  document.getElementById('restore-file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) importBackup(f);
    e.target.value = '';
  });
  document.getElementById('btn-delpair').addEventListener('click', () => {
    deletePair(pair);
  });
  renderCriteria(); render();
  // Nav dropdown â€” hover (desktop) & click toggle (mobile)
  document.querySelectorAll('.nav-drop').forEach(d => {
    const btn = d.querySelector('.drop-btn');
    let hoverTimer;
    const isMobile = () => window.innerWidth <= 680;
    d.addEventListener('mouseenter', () => { if (!isMobile()) { clearTimeout(hoverTimer); d.classList.add('open'); } });
    d.addEventListener('mouseleave', () => { if (!isMobile()) { hoverTimer = setTimeout(() => d.classList.remove('open'), 100); } });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (isMobile()) {
        document.querySelectorAll('.nav-drop.open').forEach(o => { if (o !== d) o.classList.remove('open'); });
        d.classList.toggle('open');
      }
    });
    d.addEventListener('click', (e) => { if (isMobile() && e.target === d) d.classList.remove('open'); });
    d.querySelectorAll('.drop-menu .nav-link').forEach(l => {
      l.addEventListener('click', () => d.classList.remove('open'));
    });
  });
  // Mobil hamburger menÃ¼ (kenar Ã§ekmecesi)
  const mnavBtn = document.getElementById('nav-mobile-btn');
  const mnav = document.getElementById('nav-mobile');
  const mnavBack = document.getElementById('nav-mobile-backdrop');
  const mnavCloseBtn = document.getElementById('nav-mobile-close');
  function closeMobileNav() {
    if (mnav) mnav.classList.remove('open');
    if (mnavBack) mnavBack.classList.remove('open');
    if (mnavBtn) mnavBtn.setAttribute('aria-expanded', 'false');
  }
  if (mnavBtn && mnav) {
    mnavBtn.addEventListener('click', () => {
      const open = mnav.classList.toggle('open');
      if (mnavBack) mnavBack.classList.toggle('open', open);
      mnavBtn.setAttribute('aria-expanded', String(open));
    });
    if (mnavCloseBtn) mnavCloseBtn.addEventListener('click', closeMobileNav);
    if (mnavBack) mnavBack.addEventListener('click', closeMobileNav);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobileNav(); });
    window.addEventListener('resize', () => { if (window.innerWidth > 680) closeMobileNav(); });
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-close]')) closeMobileNav(); });
  }
  // Global nav link handling (SPA intercept, saÄŸ tÄ±k aÃ§ma)
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      const href = el.getAttribute('href');
      if (!href) return;
      const m = href.match(/[?&]page=(\w+)/);
      if (m) { showPage(m[1]); closeMobileNav(); }
    });
  });
  // Sayfa yÃ¼klendiÄŸinde ?page= parametresini oku
  const pm = window.location.search.match(/[?&]page=(\w+)/);
  if (pm) showPage(pm[1]);
}
function dnum(v) { return isNaN(parseFloat(v)) ? 0 : parseFloat(v); }
// ============ Data Takibi ============
const DATA_KEY = 'defter-data-v1';
let dataTrades = [];
let dfDir = 'LONG';
let currentPage = 'home';
try {
  const lp = localStorage.getItem('df-last-page');
  if (lp && ['home','defter','data','review','news','egitim','indicators','onchain','calendar','basvuru','chat-admin','calc'].indexOf(lp) >= 0) currentPage = lp;
} catch (e) {}
setInitialPage();
const NEWS_KEY = 'alfanews-shared-v1';
const ADMIN_EMAIL = 'ahmetnuman20@gmail.com';
// AlfaNews â€” paylaÅŸÄ±mlÄ± dergi (sabit kapak + iÃ§indekiler + analiz sayfalarÄ±)
let magData = { issueNo: 1, entries: [] };
let magIndex = 0;
let magSaveTimer = null;

function magIsAdmin() {
  try { return (typeof AUTH !== 'undefined' && AUTH.user) ? ((AUTH.user.email || '').toLowerCase() === ADMIN_EMAIL) : true; }
  catch (e) { return true; }
}
async function loadNews() {
  let d = null;
  try {
    if (typeof AUTH !== 'undefined' && AUTH.client) {
      const res = await AUTH.client.from('alfanews').select('data').eq('id', 1).maybeSingle();
      if (res && res.data && res.data.data) d = res.data.data;
    }
  } catch (e) { /* tablo yok / Ã§evrimdÄ±ÅŸÄ± */ }
  if (!d) { try { const raw = await store.get(NEWS_KEY); d = raw ? JSON.parse(raw) : null; } catch (e) { d = null; } }
  if (!d || typeof d !== 'object') d = {};
  magData = d;
  if (typeof magData.issueNo !== 'number') magData.issueNo = 1;
  if (!Array.isArray(magData.entries)) magData.entries = [];
  magData.entries.forEach(e => {
    if (!Array.isArray(e.images)) e.images = [];
    if (!Array.isArray(e.embeds)) e.embeds = [];
    if (typeof e.title !== 'string') e.title = '';
    if (typeof e.body !== 'string') e.body = '';
  });
  // Analist listesi (roster)
  if (!Array.isArray(magData.authors)) magData.authors = [];
  if (typeof magData.rosterVer !== 'number') magData.rosterVer = magData.authorsSeeded ? 1 : 0;
  if (magData.rosterVer < 2) {
    magData.authors = [
      { id: rid(), name: 'Trader Ahmet', specialty: 'BTC & Gold', photo: '' },
      { id: rid(), name: 'Fjor', specialty: 'Totaller & DXY & FX Pairs', photo: '' },
      { id: rid(), name: 'Trader Endy', specialty: 'Onchain Verileri', photo: '' },
      { id: rid(), name: 'Trader FE LU', specialty: 'Key Areas', photo: '' },
    ];
    magData.rosterVer = 2; magData.authorsSeeded = true;
  }
  magData.authors.forEach(a => { if (typeof a.specialty !== 'string') a.specialty = ''; if (typeof a.photo !== 'string') a.photo = ''; });
  // eski serbest yazÄ±lan isim/foto -> roster'a taÅŸÄ±
  magData.entries.forEach(e => {
    if (!e.authorId && e.authorName) {
      let a = magData.authors.find(x => (x.name || '').toLowerCase() === e.authorName.toLowerCase());
      if (!a) { a = { id: rid(), name: e.authorName, photo: e.authorPhoto || '' }; magData.authors.push(a); }
      e.authorId = a.id;
    }
    delete e.authorName; delete e.authorPhoto;
  });
}
function magAuthor(id) { return magData.authors.find(a => a.id === id) || null; }
async function saveNews() {
  const json = JSON.stringify(magData);
  try { await store.set(NEWS_KEY, json); } catch (e) { /* yerel */ }
  if (magIsAdmin()) {
    try { if (typeof AUTH !== 'undefined' && AUTH.client && AUTH.user) await AUTH.client.from('alfanews').upsert({ id: 1, data: magData, updated_at: new Date().toISOString() }); } catch (e) { /* tablo yok */ }
  }
}
function magSaveT() { clearTimeout(magSaveTimer); magSaveTimer = setTimeout(() => saveNews(), 600); }
function magCount() { return 2 + magData.entries.length; }
function magWeek() {
  const t = new Date(); const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const f = d => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  return f(mon) + ' â€“ ' + f(sun);
}

function magInput(val, ph, cls, oninput) {
  const el = document.createElement('input'); el.type = 'text'; el.className = 'mag-in ' + (cls || ''); el.value = val || ''; if (ph) el.placeholder = ph;
  el.addEventListener('input', () => { oninput(el.value); magSaveT(); });
  return el;
}
function magArea(val, ph, oninput) {
  const el = document.createElement('textarea'); el.className = 'mag-in mag-area'; el.value = val || ''; if (ph) el.placeholder = ph;
  el.addEventListener('input', () => { oninput(el.value); magSaveT(); });
  return el;
}

function magBuildCover() {
  const page = document.createElement('div'); page.className = 'mag-page mag-cover3';
  const inner = document.createElement('div'); inner.className = 'mag-inner';
  if (magData.coverBg) { const bg = document.createElement('div'); bg.className = 'cv-bg'; bg.style.backgroundImage = 'url("' + String(magData.coverBg).replace(/"/g, '') + '")'; inner.appendChild(bg); }
  const pad = document.createElement('div'); pad.className = 'mag-pad';
  pad.innerHTML =
    '<div class="cv-top"><span class="cv-oa">ALFA TRADERS</span><span class="cv-issue">SayÄ± ' + (magData.issueNo || 1) + '</span></div>' +
    '<div class="cv-logo"><svg viewBox="0 0 32 32" fill="none"><path d="M5.5 26.5 16 5.5l10.5 21" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/><path d="M7 23c6-1 12-5 18-11" stroke="#c5c1ff" stroke-width="2.2" stroke-linecap="round"/></svg></div>' +
    '<h1 class="cv-title">AlfaNews</h1>' +
    '<div class="cv-sub">HaftalÄ±k Piyasa Dergisi</div>' +
    '<div class="cv-cats"><span>Makroekonomi</span><span>Bitcoin &amp; Kripto</span><span>Forex</span><span>Teknik Analiz</span></div>' +
    '<div class="cv-foot"><div class="cv-date">' + magWeek() + '</div><div class="cv-turn">Oku â†’</div></div>';
  inner.appendChild(pad);
  // Analist avatarlarÄ± â€” saÄŸ alt kÃ¶ÅŸede yay dizilimi
  const list = (magData.authors || []).slice(0, 6);
  if (list.length) {
    const cl = document.createElement('div'); cl.className = 'cv-analysts';
    const n = list.length, R = 62, cx = 150, cy = 150;
    list.forEach((a, idx) => {
      const av = document.createElement('div'); av.className = 'cv-an'; av.title = (a.name || '') + (a.specialty ? (' Â· ' + a.specialty) : '');
      if (a.photo) av.style.backgroundImage = 'url("' + String(a.photo).replace(/"/g, '') + '")';
      else { av.classList.add('empty'); av.textContent = (a.name || '?').trim().charAt(0).toUpperCase(); }
      const t = n > 1 ? idx / (n - 1) : 0.5;
      const ang = Math.PI + (Math.PI * 0.5) * t;
      av.style.left = (cx + R * Math.cos(ang)) + 'px';
      av.style.top = (cy + R * Math.sin(ang)) + 'px';
      cl.appendChild(av);
    });
    inner.appendChild(cl);
  }
  if (magIsAdmin()) {
    const up = document.createElement('label'); up.className = 'cv-bgup'; up.textContent = magData.coverBg ? 'âŸ³ Kapak gÃ¶rseli' : 'ï¼‹ Kapak arka plan gÃ¶rseli';
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.style.display = 'none';
    fi.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = async () => { magData.coverBg = r.result; await saveNews(); renderNews(); }; r.readAsDataURL(f); e.target.value = ''; });
    up.appendChild(fi); inner.appendChild(up);
  }
  page.appendChild(inner); return page;
}
function magBuildToc() {
  const page = document.createElement('div'); page.className = 'mag-page mag-toc3';
  const inner = document.createElement('div'); inner.className = 'mag-inner';
  const pad = document.createElement('div'); pad.className = 'mag-pad';
  const h = document.createElement('div'); h.className = 'toc-kicker'; h.textContent = 'Bu SayÄ±da'; pad.appendChild(h);
  const h2 = document.createElement('h2'); h2.className = 'toc-h'; h2.textContent = 'Ä°Ã§indekiler'; pad.appendChild(h2);
  if (!magData.entries.length) {
    const e = document.createElement('div'); e.className = 'toc-empty'; e.textContent = magIsAdmin() ? 'HenÃ¼z analiz yok. Ãœstteki â€œ+ Analiz ekleâ€ ile baÅŸla.' : 'Bu sayÄ± hazÄ±rlanÄ±yor.'; pad.appendChild(e);
  }
  magData.entries.forEach((en, i) => {
    const it = document.createElement('button'); it.className = 'toc-item'; it.type = 'button';
    it.innerHTML = '<b>' + String(i + 1).padStart(2, '0') + '</b><span class="tt">' + magEsc(en.title || 'Analiz') + '<small>' + magEsc(en.authorName || '') + '</small></span><span class="pg">sf ' + (i + 3) + '</span>';
    it.addEventListener('click', () => magGoTo(i + 2));
    pad.appendChild(it);
  });
  inner.appendChild(pad); page.appendChild(inner); return page;
}
function magEsc(v) { const d = document.createElement('div'); d.textContent = String(v == null ? '' : v); return d.innerHTML; }

function magAddImg(en, url) { if (!url) return; en.images.push(url); saveNews().then(renderNews); }
function magIsTV(url) { return /tradingview\.com/i.test(String(url || '')); }
function magSymbolFromTV(url) {
  let m;
  m = String(url || '').match(/tradingview\.com\/widgetembed\/[^]*?symbol=([^&]+)/i); if (m) return decodeURIComponent(m[1]);
  m = String(url || '').match(/tradingview\.com\/symbols\/([^/?#]+)/i); if (m) return decodeURIComponent(m[1]);
  m = String(url || '').match(/[?&]symbol=([^&]+)/i); if (m) return decodeURIComponent(m[1]);
  return '';
}
function magTVEmbedUrl(url) {
  if (/widgetembed/i.test(String(url || ''))) return url;
  const sym = magSymbolFromTV(url) || 'BTCUSDT';
  return 'https://www.tradingview.com/widgetembed/?symbol=' + encodeURIComponent(sym) + '&interval=60&theme=dark&style=1&locale=tr&hide_side_toolbar=0&allow_symbol_change=1&autosize=1';
}
function magAddLink(en, url) {
  if (!url) return;
  if (!Array.isArray(en.embeds)) en.embeds = [];
  if (magIsTV(url)) { en.embeds.push(magTVEmbedUrl(url)); saveNews().then(renderNews); return; }
  en.images.push(url); saveNews().then(renderNews);
}
function magFilesToEntry(en, files) {
  const list = Array.from(files || []).filter(f => f.type && f.type.indexOf('image/') === 0);
  if (!list.length) return;
  const res = new Array(list.length); let pend = list.length;
  list.forEach((f, k) => { const r = new FileReader(); r.onload = async () => { res[k] = r.result; pend--; if (pend === 0) { res.forEach(x => { if (x) en.images.push(x); }); await saveNews(); renderNews(); } }; r.readAsDataURL(f); });
}
function magPasteToEntry(en, ev) {
  const cd = ev.clipboardData || window.clipboardData; if (!cd) return;
  const items = cd.items ? Array.from(cd.items) : [];
  const imgItem = items.find(it => it.type && it.type.indexOf('image/') === 0);
  if (imgItem) { ev.preventDefault(); const f = imgItem.getAsFile(); if (f) magFilesToEntry(en, [f]); return; }
  const txt = cd.getData ? cd.getData('text') : '';
  if (txt && /^https?:\/\//.test(txt.trim())) { ev.preventDefault(); magAddLink(en, txt.trim()); }
}
function magBuildEntry(en, i, admin) {
  const page = document.createElement('div'); page.className = 'mag-page mag-entry';
  const inner = document.createElement('div'); inner.className = 'mag-inner';
  const pad = document.createElement('div'); pad.className = 'mag-pad';
  // baÅŸlÄ±k satÄ±rÄ±
  const head = document.createElement('div'); head.className = 'e-head';
  const kick = document.createElement('span'); kick.className = 'e-kicker'; kick.textContent = 'ANALÄ°Z Â· sf ' + (i + 3); head.appendChild(kick);
  if (admin) {
    const tools = document.createElement('span'); tools.className = 'e-tools';
    const up = document.createElement('button'); up.type = 'button'; up.textContent = 'â€¹'; up.title = 'Ã–ne al'; up.disabled = i === 0; up.addEventListener('click', () => magMoveEntry(i, i - 1)); tools.appendChild(up);
    const dn = document.createElement('button'); dn.type = 'button'; dn.textContent = 'â€º'; dn.title = 'Geri al'; dn.disabled = i === magData.entries.length - 1; dn.addEventListener('click', () => magMoveEntry(i, i + 1)); tools.appendChild(dn);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = 'Ã— Sil'; del.addEventListener('click', () => magDelEntry(i)); tools.appendChild(del);
    head.appendChild(tools);
  }
  pad.appendChild(head);
  // baÅŸlÄ±k
  if (admin) pad.appendChild(magInput(en.title, 'Analiz baÅŸlÄ±ÄŸÄ± (Ã¶r. BTC HaftalÄ±k GÃ¶rÃ¼nÃ¼m)', 'e-title-in', v => en.title = v));
  else { const t = document.createElement('h2'); t.className = 'e-title'; t.textContent = en.title || 'Analiz'; pad.appendChild(t); }
  // gÃ¶rseller + grafik embedleri
  const imgs = document.createElement('div'); imgs.className = 'e-imgs';
  (en.images || []).forEach((url, k) => {
    const wrap = document.createElement('div'); wrap.className = 'e-imgwrap';
    const img = document.createElement('img'); img.className = 'e-img'; img.src = url; img.alt = 'Analiz gÃ¶rseli'; img.loading = 'lazy';
    img.addEventListener('click', () => magZoom(url));
    wrap.appendChild(img);
    if (admin) { const x = document.createElement('button'); x.type = 'button'; x.className = 'e-imgdel'; x.textContent = 'Ã—'; x.title = 'GÃ¶rseli kaldÄ±r'; x.addEventListener('click', e => { e.stopPropagation(); en.images.splice(k, 1); saveNews(); renderNews(); }); wrap.appendChild(x); }
    imgs.appendChild(wrap);
  });
  (en.embeds || []).forEach((url, k) => {
    const wrap = document.createElement('div'); wrap.className = 'e-embedwrap';
    const fr = document.createElement('iframe'); fr.className = 'e-embed'; fr.src = url; fr.loading = 'lazy'; fr.setAttribute('allowfullscreen', ''); fr.setAttribute('scrolling', 'no'); fr.setAttribute('frameborder', '0');
    wrap.appendChild(fr);
    if (admin) { const x = document.createElement('button'); x.type = 'button'; x.className = 'e-imgdel'; x.textContent = 'Ã—'; x.title = 'GrafiÄŸi kaldÄ±r'; x.addEventListener('click', e => { e.stopPropagation(); en.embeds.splice(k, 1); saveNews(); renderNews(); }); wrap.appendChild(x); }
    imgs.appendChild(wrap);
  });
  pad.appendChild(imgs);
  if (admin) {
    const dz = document.createElement('div'); dz.className = 'e-dz'; dz.tabIndex = 0;
    dz.innerHTML = '<div class="e-dz-t">ï¼‹ GÃ¶rsel ekle</div><div class="e-dz-s">Ã‡ift tÄ±kla yÃ¼kle Â· tÄ±kla + Ctrl+V yapÄ±ÅŸtÄ±r Â· sÃ¼rÃ¼kle-bÄ±rak Â· ya da linki aÅŸaÄŸÄ± yapÄ±ÅŸtÄ±r</div>';
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true; fi.style.display = 'none';
    fi.addEventListener('change', e => { magFilesToEntry(en, e.target.files); e.target.value = ''; });
    dz.appendChild(fi);
    dz.addEventListener('dblclick', () => fi.click());
    dz.addEventListener('paste', e => magPasteToEntry(en, e));
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer) { if (e.dataTransfer.files && e.dataTransfer.files.length) magFilesToEntry(en, e.dataTransfer.files); else { const u = e.dataTransfer.getData('text'); if (u) magAddLink(en, u.trim()); } } });
    pad.appendChild(dz);
    const addRow = document.createElement('div'); addRow.className = 'e-addimg';
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'mag-in'; inp.placeholder = 'TradingView / gÃ¶rsel baÄŸlantÄ±sÄ± (https://â€¦)';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'mag-btn sm'; btn.textContent = '+ Ekle';
    const add = () => { const u = inp.value.trim(); if (!u) return; inp.value = ''; magAddLink(en, u); };
    btn.addEventListener('click', add); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    inp.addEventListener('paste', e => magPasteToEntry(en, e));
    addRow.appendChild(inp); addRow.appendChild(btn); pad.appendChild(addRow);
  }
  // metin
  if (admin) pad.appendChild(magArea(en.body, 'Analiz metni: bias, seviyeler, iki yÃ¶nlÃ¼ senaryo, risklerâ€¦', v => en.body = v));
  else { const b = document.createElement('div'); b.className = 'e-body'; b.textContent = en.body || ''; pad.appendChild(b); }
  // kÃ¼nye (analisti yapan)
  const by = document.createElement('div'); by.className = 'mag-byline';
  const author = magAuthor(en.authorId);
  const av = document.createElement('div'); av.className = 'b-av';
  if (author && author.photo) { av.style.backgroundImage = 'url("' + author.photo.replace(/"/g, '') + '")'; }
  else { av.textContent = (author && author.name) ? author.name.trim().charAt(0).toUpperCase() : '?'; }
  by.appendChild(av);
  if (admin) {
    const col = document.createElement('div'); col.className = 'b-edit';
    const sel = document.createElement('select'); sel.className = 'mag-in';
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'â€” Analist seÃ§ â€”'; sel.appendChild(o0);
    magData.authors.forEach(a => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.name || '(isimsiz)'; if (a.id === en.authorId) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', async () => { en.authorId = sel.value; await saveNews(); renderNews(); });
    col.appendChild(sel);
    by.appendChild(col);
  } else {
    const box = document.createElement('div');
    const nm = document.createElement('div'); nm.className = 'b-name'; nm.textContent = author ? (author.name || 'Alfa Traders') : 'Alfa Traders'; box.appendChild(nm);
    const rl = document.createElement('div'); rl.className = 'b-role'; rl.textContent = (author && author.specialty) ? author.specialty : 'Analist'; box.appendChild(rl);
    by.appendChild(box);
    by.classList.add('byview');
  }
  pad.appendChild(by);
  inner.appendChild(pad); page.appendChild(inner); return page;
}

let magRosterOpen = false;
function renderRoster() {
  const box = document.getElementById('mag-roster'); if (!box) return;
  const show = magRosterOpen && magIsAdmin();
  box.classList.toggle('hidden', !show);
  box.innerHTML = '';
  if (!show) return;
  const h = document.createElement('div'); h.className = 'mr-h'; h.textContent = 'Analistler â€” isim + fotoÄŸraf baÄŸlantÄ±sÄ± (her analizde buradan seÃ§ilir)'; box.appendChild(h);
  magData.authors.forEach((a, i) => {
    const row = document.createElement('div'); row.className = 'mr-row';
    const nm = document.createElement('input'); nm.type = 'text'; nm.className = 'mag-in mr-name'; nm.value = a.name || ''; nm.placeholder = 'Ä°sim';
    nm.addEventListener('input', () => { a.name = nm.value; magSaveT(); });
    const sp = document.createElement('input'); sp.type = 'text'; sp.className = 'mag-in mr-spec'; sp.value = a.specialty || ''; sp.placeholder = 'UzmanlÄ±k (Ã¶r. BTC & Gold)';
    sp.addEventListener('input', () => { a.specialty = sp.value; magSaveT(); });
    const ph = document.createElement('input'); ph.type = 'text'; ph.className = 'mag-in mr-photo'; ph.value = a.photo || ''; ph.placeholder = 'Foto baÄŸlantÄ±sÄ± (ya da ğŸ“· yÃ¼kle)';
    ph.addEventListener('input', () => { a.photo = ph.value; magSaveT(); });
    const up = document.createElement('label'); up.className = 'mr-up'; up.title = 'FotoÄŸraf yÃ¼kle'; up.textContent = 'ğŸ“·';
    const upi = document.createElement('input'); upi.type = 'file'; upi.accept = 'image/*'; upi.style.display = 'none';
    upi.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = async () => { a.photo = r.result; await saveNews(); renderNews(); }; r.readAsDataURL(f); e.target.value = ''; });
    up.appendChild(upi);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'mr-del'; del.textContent = 'Ã—'; del.title = 'Analisti sil';
    del.addEventListener('click', async () => { if (!confirm('â€œ' + (a.name || 'Analist') + 'â€ silinsin mi?')) return; magData.authors.splice(i, 1); magData.entries.forEach(e => { if (e.authorId === a.id) e.authorId = ''; }); await saveNews(); renderNews(); });
    row.appendChild(nm); row.appendChild(sp); row.appendChild(ph); row.appendChild(up); row.appendChild(del);
    box.appendChild(row);
  });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'mag-btn ghost sm mr-add'; add.textContent = '+ Analist ekle';
  add.addEventListener('click', async () => { magData.authors.push({ id: rid(), name: '', photo: '' }); await saveNews(); renderNews(); });
  box.appendChild(add);
}

function renderNews() {
  const stage = document.getElementById('mag-stage'); if (!stage) return;
  if (!magData || !Array.isArray(magData.entries)) magData = { issueNo: 1, entries: [], authors: [] };
  if (!Array.isArray(magData.authors)) magData.authors = [];
  const admin = magIsAdmin();
  const tools = document.getElementById('mag-tools'); if (tools) tools.style.display = admin ? '' : 'none';
  renderRoster();
  const badge = document.getElementById('mag-adminbadge'); if (badge) badge.style.display = admin ? '' : 'none';
  const n = magCount();
  stage.innerHTML = '';
  stage.appendChild(magBuildCover());
  stage.appendChild(magBuildToc());
  magData.entries.forEach((e, i) => stage.appendChild(magBuildEntry(e, i, admin)));
  Array.from(stage.children).forEach((el, i) => el.style.zIndex = (n - i));
  const dots = document.getElementById('mag-dots'); dots.innerHTML = '';
  for (let i = 0; i < n; i++) { const d = document.createElement('button'); d.className = 'mag-dot2'; d.type = 'button'; d.setAttribute('aria-label', 'Sayfa ' + (i + 1)); d.addEventListener('click', () => magGoTo(i)); dots.appendChild(d); }
  if (magIndex >= n) magIndex = Math.max(0, n - 1);
  magApply();
}
function magApply() {
  const stage = document.getElementById('mag-stage'); if (!stage) return;
  const n = magCount();
  Array.from(stage.children).forEach((el, i) => el.classList.toggle('turned', i < magIndex));
  const c = document.getElementById('mag-counter'); if (c) c.textContent = (magIndex + 1) + ' / ' + n;
  document.querySelectorAll('#mag-dots .mag-dot2').forEach((d, i) => d.classList.toggle('on', i === magIndex));
  const p = document.getElementById('mag-prev'), nx = document.getElementById('mag-next');
  if (p) p.disabled = magIndex <= 0; if (nx) nx.disabled = magIndex >= n - 1;
  const cur = stage.children[magIndex]; if (cur) { const inr = cur.querySelector('.mag-inner'); if (inr) inr.scrollTop = 0; }
}
function magGoTo(i) { const n = magCount(); i = Math.max(0, Math.min(n - 1, i)); if (i === magIndex) return; magIndex = i; magApply(); }
function magNext() { magGoTo(magIndex + 1); }
function magPrev() { magGoTo(magIndex - 1); }

async function magAddEntry() {
  magData.entries.push({ id: rid(), title: '', images: [], embeds: [], body: '', authorName: '', authorPhoto: '' });
  magIndex = magCount() - 1; await saveNews(); renderNews();
}
async function magDelEntry(i) { if (!confirm('Bu analiz sayfasÄ± silinsin mi?')) return; magData.entries.splice(i, 1); if (magIndex >= magCount()) magIndex = Math.max(0, magCount() - 1); await saveNews(); renderNews(); }
async function magMoveEntry(from, to) { if (to < 0 || to >= magData.entries.length) return; const a = magData.entries; const it = a.splice(from, 1)[0]; a.splice(to, 0, it); magIndex = to + 2; await saveNews(); renderNews(); }

function magZoom(url) { const z = document.getElementById('mag-zoom'); const im = document.getElementById('mag-zoom-img'); if (!z || !im) return; im.src = url; z.classList.add('open'); }
function magZoomClose() { const z = document.getElementById('mag-zoom'); if (z) { z.classList.remove('open'); const im = document.getElementById('mag-zoom-img'); if (im) im.src = ''; } }

function bindNewsPage() {
  const g = id => document.getElementById(id);
  const nx = g('mag-next'), pv = g('mag-prev'); if (nx) nx.addEventListener('click', magNext); if (pv) pv.addEventListener('click', magPrev);
  const addb = g('mag-addentry'); if (addb) addb.addEventListener('click', magAddEntry);
  const aub = g('mag-authors'); if (aub) aub.addEventListener('click', () => { magRosterOpen = !magRosterOpen; aub.classList.toggle('on', magRosterOpen); renderRoster(); });
  const z = g('mag-zoom'); if (z) z.addEventListener('click', magZoomClose);
  const vp = g('mag-viewport');
  if (vp) {
    let sx = null;
    vp.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('button,a,label,input,textarea,.e-img')) { sx = null; return; } sx = e.clientX; });
    vp.addEventListener('pointerup', e => { if (sx === null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 45) { if (dx < 0) magNext(); else magPrev(); } });
    vp.addEventListener('pointercancel', () => { sx = null; });
  }
  document.addEventListener('keydown', e => {
    if (currentPage !== 'news') return;
    if (e.key === 'Escape') { magZoomClose(); return; }
    const ae = document.activeElement; if (ae && (ae.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); magNext(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); magPrev(); }
  });
}
async function loadData() {
  try { const raw = await store.get(DATA_KEY); dataTrades = raw ? JSON.parse(raw) : []; }
  catch (e) { dataTrades = []; }
  if (!Array.isArray(dataTrades)) dataTrades = [];
}
async function saveData() { await store.set(DATA_KEY, JSON.stringify(dataTrades)); }

function setInitialPage() {
  const pages = ['home', 'trading', 'defter', 'data', 'review', 'news', 'egitim', 'indicators', 'onchain', 'rutin', 'calendar', 'basvuru', 'chat-admin', 'calc'];
  pages.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.toggle('hidden', p !== currentPage);
    const tb = document.getElementById('tab-' + p);
    if (tb) tb.classList.toggle('on', p === currentPage);
  });
  document.body.dataset.page = currentPage;
}

function showPage(name, skipAnim) {
  currentPage = name;
  document.body.dataset.page = name;
  const pages = ['home', 'trading', 'defter', 'data', 'review', 'news', 'egitim', 'pano', 'indicators', 'onchain', 'rutin', 'calendar', 'basvuru', 'chat-admin', 'calc', 'topluluk'];
  pages.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.toggle('hidden', name !== p);
    const tb = document.getElementById('tab-' + p);
    if (tb) tb.classList.toggle('on', name === p);
  });
  document.querySelectorAll('[data-mnav]').forEach(el => el.classList.toggle('on', el.getAttribute('data-mnav') === name));
  // highlight parent dropdown when child active, close all dropdowns
  document.querySelectorAll('.nav-drop').forEach(d => {
    d.classList.toggle('on', !!d.querySelector('.nav-link.on'));
    d.classList.remove('open');
  });
  const shown = document.getElementById('page-' + name);
  if (shown && !skipAnim) { shown.classList.remove('page-anim'); void shown.offsetWidth; shown.classList.add('page-anim'); }
  try { localStorage.setItem('df-last-page', name); } catch (e) {}
  document.getElementById('home-ticker').style.display = name === 'home' ? '' : 'none';
  const tvBar = document.querySelector('.tv-bar');
  if (tvBar) tvBar.style.display = name === 'home' ? '' : 'none';
  if (name === 'data') renderData();
  if (name === 'review') renderReview();
  if (name === 'rutin') renderRutin();
  if (name === 'news') renderNews();
  if (name === 'egitim') renderEgitim();
  if (name === 'pano') { panoLoad(); }
  if (name === 'topluluk') { loadTgFeed(); }
  if (name === 'indicators') renderIndicators();
  if (name === 'calendar') { if (window.loadCal) loadCal(); }
  if (name === 'basvuru') renderFeed();
  if (name === 'chat-admin') { renderAdminChat(); startAdminChatPoll(); }
}

function sortedData() { return dataTrades.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0)); }

let dfFilter = 'all';
function dfTs(t) { return t.ts || (t.date ? new Date(String(t.date).slice(0, 10) + 'T12:00:00').getTime() : 0) || 0; }
function dfPassesFilter(t) {
  if (dfFilter === 'all') return true;
  const ts = dfTs(t);
  if (!ts) return false;
  const d = new Date(ts), now = new Date();
  if (dfFilter === 'today') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }
  if (dfFilter === 'month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  if (dfFilter === 'week') {
    const day = (now.getDay() + 6) % 7; // Pzt=0
    const monday = new Date(now); monday.setDate(now.getDate() - day); monday.setHours(0, 0, 0, 0);
    return ts >= monday.getTime();
  }
  return true;
}
function fmtDfDate(d) {
  if (!d) return 'â€”';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '/' + m[2] + '/' + m[1].slice(2);
  return String(d);
}
function dfDateLabel(t) {
  if (t.date) return fmtDfDate(t.date);
  const ts = dfTs(t);
  if (ts) {
    const d = new Date(ts);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2);
  }
  return 'â€”';
}

function renderData() {
  const rows = sortedData().reverse().filter(dfPassesFilter);
  const n = rows.length;
  const totR = rows.reduce((s, t) => s + dnum(t.r), 0);
  const wins = rows.filter(t => dnum(t.r) > 0).length;
  const wr = n ? Math.round(wins / n * 100) : 0;
  const avg = n ? totR / n : 0;
  const kpis = document.getElementById('data-kpis');
  kpis.innerHTML = '';
  const addK = (lbl, val, cls, sub) => {
    const d = document.createElement('div'); d.className = 'kpi';
    d.innerHTML = '<div class="k-lbl">' + lbl + '</div><div class="k-val ' + (cls || '') + '">' + val + '</div>' + (sub ? '<div class="k-sub">' + sub + '</div>' : '');
    kpis.appendChild(d);
  };
  addK('Toplam iÅŸlem', n, '', wins + ' kazanan');
  addK('Toplam R', (totR > 0 ? '+' : '') + totR.toFixed(2) + 'R', totR >= 0 ? 'pos' : 'neg', '');
  addK('Win rate', wr + '%', '', wins + '/' + n);
  addK('Ortalama R', (avg > 0 ? '+' : '') + avg.toFixed(2) + 'R', avg >= 0 ? 'pos' : 'neg', 'iÅŸlem baÅŸÄ±na');

  // Pagination
  const totalPages = Math.max(1, Math.ceil(n / DF_PP));
  if (dfDataPage > totalPages) dfDataPage = totalPages;
  const start = (dfDataPage - 1) * DF_PP;
  const pageRows = rows.slice(start, start + DF_PP);

  function renderPageNav(containerId) {
    const c = document.getElementById(containerId);
    if (!c) return;
    c.innerHTML = '';
    if (totalPages <= 1) return;
    for (let i = 1; i <= totalPages; i++) {
      const b = document.createElement('button'); b.className = 'df-pg' + (i === dfDataPage ? ' on' : ''); b.textContent = i;
      b.onclick = () => { dfDataPage = i; renderData(); };
      c.appendChild(b);
    }
  }
  renderPageNav('df-pages');
  renderPageNav('df-pages-bottom');
  renderPendingR();

  const tb = document.getElementById('data-table');
  tb.innerHTML = '';
  const head = document.createElement('div'); head.className = 'data-row head';
  head.innerHTML = '<span style="font-size:9px;">Tarih</span><span>Parite / YÃ¶n</span><span>Strateji</span><span>Entry Model</span><span style="text-align:right;">R</span><span></span><span></span>';
  tb.appendChild(head);

  pageRows.forEach(t => {
    const r = dnum(t.r);
    const row = document.createElement('div'); row.className = 'data-row';
    row.innerHTML =
      '<span style="font-size:10px;color:var(--text-3);">' + dfDateLabel(t) + '</span>' +
      '<span class="dr-pair">' + esc(t.pair || 'â€”') + ' <span class="dr-dir ' + (t.dir || '').toLowerCase() + '">' + esc(t.dir || '') + '</span></span>' +
      '<span style="font-size:11px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc((t.strat||'').slice(0,14) || 'â€”') + '</span>' +
      '<span style="font-size:11px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc((t.model||'').slice(0,18) || 'â€”') + '</span>';
    const rwrap = document.createElement('span');
    rwrap.style.textAlign = 'right';
    const rin = document.createElement('input');
    rin.className = 'rin'; rin.type = 'number'; rin.step = '0.01'; rin.placeholder = 'â€”';
    rin.value = t.r !== '' && t.r != null && !isNaN(t.r) ? Number(t.r) : '';
    rin.setAttribute('aria-label', 'SonuÃ§ (R)');
    rin.addEventListener('click', e => e.stopPropagation());
    rin.addEventListener('change', async () => {
      t.r = rin.value;
      await saveData(); renderData();
      syncDataTradeNotion(t);
    });
    rwrap.appendChild(rin);
    row.appendChild(rwrap);
    const eb = document.createElement('button'); eb.className = 'dr-editb'; eb.textContent = 'âœ'; eb.title = 'DÃ¼zenle';
    eb.addEventListener('click', e => { e.stopPropagation(); row.classList.toggle('edit-open'); });
    row.appendChild(eb);
    const del = document.createElement('button'); del.className = 'dr-del'; del.type = 'button'; del.textContent = 'Ã—';
    del.addEventListener('click', async (e) => { e.stopPropagation(); if (!confirm('Bu iÅŸlemi sil?')) return; dataTrades = dataTrades.filter(x => x.id !== t.id); await saveData(); renderData(); });
    row.appendChild(del);

    const body = document.createElement('div'); body.className = 'dr-body';
    const bhtml = [];
    if (t.images && t.images.length) bhtml.push('<div class="dr-imgs">' + t.images.map(u => '<img src="' + u + '" onclick="event.stopPropagation();magZoom(this.src)">').join('') + '</div>');
    if (t.note) bhtml.push('<div class="dr-note">' + esc(t.note) + '</div>');
    if (t.criteria) {
      bhtml.push('<div class="dr-crit-bars">');
      const cl = { setup:'Setup', entry:'Entry', exit:'Exit', risk:'Risk', psycho:'Psi' };
      Object.keys(cl).forEach(k => {
        const v = t.criteria[k] || 0;
        bhtml.push('<div class="dr-crit-bar"><span>' + cl[k] + ' ' + v + '</span><div class="bar"><div class="fill" style="width:' + (v/10*100) + '%"></div></div></div>');
      });
      bhtml.push('</div>');
    }
    body.innerHTML = bhtml.join('');
    row.appendChild(body);

    const edit = document.createElement('div'); edit.className = 'dr-edit';
    edit.innerHTML = buildDrEditHtml(t);
    bindDrEdit(edit, t, row);
    row.appendChild(edit);

    row.addEventListener('click', e => {
      if (e.target.closest('input,button,textarea,select,.dr-imgs img')) return;
      row.classList.toggle('edit-open');
    });
    tb.appendChild(row);
  });
  document.getElementById('data-count').textContent = n ? (n + ' iÅŸlem Â· sayfa ' + dfDataPage + '/' + totalPages) : (dfFilter !== 'all' ? 'Bu filtrede iÅŸlem yok.' : 'HenÃ¼z iÅŸlem yok.');
}

async function syncDataTradeNotion(t) {
  const parts = [];
  if (t.note) parts.push(t.note);
  if (t.model) parts.push('Entry Model: ' + t.model);
  const payload = { id: t.id, ts: t.ts || Date.now(), date: t.date || '', pair: t.pair || '', dir: t.dir || '', r: dnum(t.r) || 0, strat: t.strat || '', model: t.model || '', note: parts.join(' Â· '), stars: 0, notionId: t.notionId || undefined, images: t.images || [] };
  try {
    const resp = await fetch('/api/notion-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await resp.json();
    const rr = Array.isArray(j.results) ? j.results[0] : null;
    if (rr && rr.ok && rr.notionId && !t.notionId) {
      t.notionId = rr.notionId;
      await saveData();
    }
  } catch (e) {}
}

function buildDrEditHtml(t) {
  const dirOpt = ['LONG','SHORT'].map(d => '<option value="' + d + '"' + (t.dir === d ? ' selected' : '') + '>' + d + '</option>').join('');
  const imgs = (t.images || []).map((u, i) => '<div class="thmb"><img src="' + u + '"><button type="button" class="x" data-i="' + i + '">Ã—</button></div>').join('');
  return '' +
    '<div class="row">' +
      '<label>Tarih<input type="date" class="e-date" value="' + (t.date || '') + '"></label>' +
      '<label>Parite<input type="text" class="e-pair" value="' + esc(t.pair || '') + '"></label>' +
      '<label>YÃ¶n<select class="e-dir">' + dirOpt + '</select></label>' +
      '<label>SonuÃ§ (R)<input type="number" step="0.01" class="e-r" value="' + (t.r !== '' && t.r != null ? t.r : '') + '"></label>' +
    '</div>' +
    '<div class="row">' +
      '<label>Strateji<input type="text" class="e-strat" value="' + esc(t.strat || '') + '"></label>' +
      '<label>Entry Model<input type="text" class="e-model" value="' + esc(t.model || '') + '"></label>' +
    '</div>' +
    '<label>Not<textarea class="e-note">' + esc(t.note || '') + '</textarea></label>' +
    (imgs ? '<div class="dr-edit-imgs">' + imgs + '</div>' : '') +
    '<div class="acts">' +
      '<button type="button" class="dr-add-img" title="Resim ekle â€” tÄ±kla seÃ§, sonra Ctrl+V ile de yapÄ±ÅŸtÄ±rabilirsin">+</button>' +
      '<input type="file" accept="image/*" multiple class="e-files" style="display:none;">' +
      '<button type="button" class="btn solid e-save">Kaydet</button>' +
    '</div>';
}

function readFilesToTrade(t, fileList, onDone) {
  const files = Array.from(fileList || []).filter(x => x.type && x.type.startsWith('image/'));
  if (!files.length) { if (onDone) onDone(); return; }
  if (!Array.isArray(t.images)) t.images = [];
  let pend = files.length;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      t.images.push(ev.target.result);
      pend--;
      if (pend === 0 && onDone) onDone();
    };
    reader.readAsDataURL(file);
  });
}

function bindDrEdit(edit, t, row) {
  edit.addEventListener('click', e => e.stopPropagation());
  const q = s => edit.querySelector(s);
  q('.e-save').addEventListener('click', async () => {
    const newDate = q('.e-date').value;
    if (newDate) { t.date = newDate; t.ts = Date.parse(newDate); }
    t.pair = (q('.e-pair').value || '').trim().toUpperCase();
    t.dir = q('.e-dir').value;
    t.r = q('.e-r').value;
    t.strat = (q('.e-strat').value || '').trim();
    t.model = (q('.e-model').value || '').trim();
    t.note = (q('.e-note').value || '').trim();
    await saveData(); renderData();
    syncDataTradeNotion(t);
  });
  const addBtn = q('.dr-add-img');
  if (addBtn) addBtn.addEventListener('click', e => { e.preventDefault(); q('.e-files').click(); });
  edit.addEventListener('paste', e => {
    const items = Array.from((e.clipboardData || {}).items || []);
    const imgs = items.filter(i => i.type && i.type.startsWith('image/'));
    if (!imgs.length) return;
    e.preventDefault();
    readFilesToTrade(t, imgs.map(i => i.getAsFile()), async () => { await saveData(); renderData(); });
  });
  q('.e-files').addEventListener('change', async () => {
    readFilesToTrade(t, q('.e-files').files, async () => { await saveData(); renderData(); });
    q('.e-files').value = '';
  });
  edit.querySelectorAll('.thmb .x').forEach(b => {
    b.addEventListener('click', async () => {
      const i = parseInt(b.getAttribute('data-i'), 10);
      (t.images || []).splice(i, 1);
      await saveData(); renderData();
    });
  });
}

function showNotePopup(t) {
  const body = document.getElementById('note-popup-body');
  const popup = document.getElementById('note-popup');
  const pair = t.pair || 'â€”';
  const dir = t.dir || '';
  const date = t.date || 'â€”';
  const r = dnum(t.r);
  const note = (t.note || '').trim();
  const strat = (t.strat || '').trim();
  const market = t.market || '';
  const source = t._source || 'manuel';
  body.innerHTML =
    '<div class="np-header"><span class="np-pair">' + pair + '</span><span class="np-dir ' + dir.toLowerCase() + '">' + dir + '</span></div>' +
    '<div class="np-meta">' +
      '<span><strong>Tarih:</strong> ' + date + '</span>' +
      '<span><strong>R:</strong> <span class="' + (r >= 0 ? 'pos' : 'neg') + '">' + (r > 0 ? '+' : '') + r.toFixed(2) + '</span></span>' +
      (strat ? '<span><strong>Strateji:</strong> ' + strat + '</span>' : '') +
      (market ? '<span><strong>Market:</strong> ' + market + '</span>' : '') +
      '<span><strong>Kaynak:</strong> ' + (source === 'Notion' ? 'Notion senkron' : 'Manuel') + '</span>' +
    '</div>' +
    (note ? '<div class="np-note"><strong>Not:</strong><p>' + note.replace(/\n/g, '<br>') + '</p></div>' : '<div class="np-note" style="color:var(--text-3);font-style:italic;">Not eklenmemiÅŸ.</div>');
  popup.classList.remove('hidden');
}
function closeNotePopup() {
  document.getElementById('note-popup').classList.add('hidden');
}
document.addEventListener('click', e => {
  const p = document.getElementById('note-popup');
  if (p && e.target.closest('#note-popup-close, #note-popup-close-btn, .note-popup-overlay')) closeNotePopup();
  if (p && !e.target.closest('.note-popup-content') && !e.target.closest('.data-row.has-note') && !e.target.closest('#pos-edit') && p.classList.contains('hidden') === false) closeNotePopup();
});

function drawEquity(rows) {
  const cv = document.getElementById('data-chart');
  const wrap = document.getElementById('data-chart-wrap');
  if (!cv || !wrap) return;
  const W = wrap.clientWidth || 600, H = 210;
  const dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  if (!rows.length) return;
  let cum = 0; const pts = [0]; rows.forEach(t => { cum += dnum(t.r); pts.push(cum); });
  const min = Math.min(0, ...pts), max = Math.max(0, ...pts);
  const pad = 12, range = (max - min) || 1;
  const x = i => pad + (W - 2 * pad) * (i / (pts.length - 1 || 1));
  const y = v => (H - pad) - (H - 2 * pad) * ((v - min) / range);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted-2').trim() || '#3a3f63'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, y(0)); ctx.lineTo(W - pad, y(0)); ctx.stroke();
  const up = pts[pts.length - 1] >= 0;
  const col = up ? '#34d399' : '#f87171';
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, up ? 'rgba(22,163,74,0.20)' : 'rgba(220,38,38,0.20)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.moveTo(x(0), y(pts[0]));
  pts.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(x(pts.length - 1), y(0)); ctx.lineTo(x(0), y(0)); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); pts.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x(pts.length - 1), y(pts[pts.length - 1]), 3.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
}

let dfImages = [];
let dfDataPage = 1;
const DF_PP = 20;
function dfAddImg(dataUrl) {
  dfImages.push(dataUrl);
  const p = document.getElementById('df-img-previews');
  const d = document.createElement('div'); d.className = 'thmb';
  d.innerHTML = '<img src="' + dataUrl + '"><button class="del" data-i="' + (dfImages.length - 1) + '">Ã—</button>';
  d.querySelector('.del').onclick = () => { dfImages.splice(parseInt(d.querySelector('.del').dataset.i), 1); renderDfPreviews(); };
  p.appendChild(d);
}
function renderDfPreviews() {
  const p = document.getElementById('df-img-previews');
  if (!p) return;
  p.innerHTML = '';
  dfImages.forEach((url, i) => {
    const d = document.createElement('div'); d.className = 'thmb';
    d.innerHTML = '<img src="' + url + '"><button class="del" data-i="' + i + '">Ã—</button>';
    d.querySelector('.del').onclick = () => { dfImages.splice(i, 1); renderDfPreviews(); };
    p.appendChild(d);
  });
}
async function addDataTrade() {
  const g = id => document.getElementById(id);
  const pair = (g('df-pair').value || '').trim().toUpperCase();
  const rVal = g('df-r').value;
  if (!pair || rVal === '') { g('data-note').textContent = 'LÃ¼tfen parite ve R deÄŸerini gir.'; return; }
  const dateVal = g('df-date').value;
  const ts = dateVal ? Date.parse(dateVal) : Date.now();
  const model = (g('df-model').value || '').trim();
  dataTrades.push({
    id: Date.now() + Math.random(), ts,
    date: dateVal || '',
    pair, dir: dfDir,
    r: dnum(rVal),
    strat: (g('df-strat').value || '').trim(),
    model,
    criteria: {
      setup: parseInt(g('df-c-setup').value) || 4,
      entry: parseInt(g('df-c-entry').value) || 5,
      exit: parseInt(g('df-c-exit').value) || 5,
      risk: parseInt(g('df-c-risk').value) || 5,
      psycho: parseInt(g('df-c-psycho').value) || 5
    },
    note: (g('df-note').value || '').trim(),
    images: dfImages.slice()
  });
  await saveData();
  g('df-date').value = ''; g('df-pair').value = ''; g('df-r').value = ''; g('df-strat').value = ''; g('df-model').value = ''; g('df-note').value = '';
  document.querySelectorAll('.crit-range').forEach(r => { r.value = 4; r.dispatchEvent(new Event('input')); });
  dfImages = []; renderDfPreviews();
  dfDataPage = 1;
  g('data-note').textContent = 'âœ… Ä°ÅŸlem kaydedildi â€” Notion\'a da senkron ediliyor.';
  renderData();
  const last = dataTrades[dataTrades.length - 1];
  const noteParts = [];
  if (last.note) noteParts.push(last.note);
  if (last.model) noteParts.push('Entry Model: ' + last.model);
  const ntrade = { id: last.id, ts: last.ts, date: last.date || '', pair: last.pair, dir: last.dir, r: last.r, strat: last.strat, model: last.model, note: noteParts.join(' Â· '), stars: 0 };
  try {
    const resp = await fetch('/api/notion-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ntrade) });
    const j = await resp.json();
    const rr = Array.isArray(j.results) ? j.results[0] : null;
    if (rr && rr.ok && rr.notionId) { last.notionId = rr.notionId; await saveData(); }
  } catch (e) { /* senkron Ã§evrimdÄ±ÅŸÄ± olabilir */ }
}

function dfNormDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return '2026-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return s;
}

async function dfSaveTradeToJournal(t, createIfMissing) {
  await loadData();
  if (!Array.isArray(dataTrades)) dataTrades = [];
  let jj = null;
  for (const x of dataTrades) {
    if (x.ts && x.ts === t.id) { jj = x; if (x.notionId) break; }
  }
  let created = false;
  if (!jj && createIfMissing) {
    const s = String(t.date || '').trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
    const fullDate = m ? ('2026-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0')) : (s || '');
    jj = {
      id: Date.now() + Math.random(),
      ts: t.id,
      date: fullDate,
      pair: t.pair || '',
      dir: t.dir || 'LONG',
      r: dnum(t.r),
      pnl: null,
      strat: t.strat || '',
      model: t.model || '',
      note: t.note || '',
      images: (t.images || []).slice(),
      notionId: t.notionId || undefined,
      _from: 'checklist'
    };
    dataTrades.unshift(jj);
    created = true;
  }
  if (jj) {
    jj.note = t.note || '';
    jj.images = (t.images || []).slice();
    if (t.notionId) jj.notionId = t.notionId;
    await saveData();
  }
  return { jj, created };
}

async function dfSyncTradeNotion(t, jj) {
  const noteText = [t.sabah ? 'Sabah: ' + t.sabah : '', t.senaryo ? 'Senaryo: ' + t.senaryo : '', t.anti ? 'Anti: ' + t.anti : '', t.gunsonu ? 'GÃ¼n Sonu: ' + t.gunsonu : '', t.note ? 'Not: ' + t.note : ''].filter(Boolean).join('\n');
  const pl = { id: t.id, ts: t.id, date: t.date, pair: t.pair, dir: t.dir, r: t.r, strat: t.strat, note: noteText || '', stars: t.stars, notionId: t.notionId || undefined, images: (t.images || []).slice() };
  const resp = await fetch('/api/notion-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pl) });
  const j = await resp.json();
  const rr = Array.isArray(j.results) ? j.results[0] : null;
  if (rr && rr.ok && rr.notionId && !t.notionId) {
    t.notionId = rr.notionId;
    saveTrades();
    if (jj) { jj.notionId = rr.notionId; await saveData(); }
  }
}

async function importFromDefter() {
  const note = document.getElementById('data-note');
  if (!Array.isArray(dataTrades)) dataTrades = [];
  if (!Array.isArray(trades) || !trades.length) { note.textContent = 'Deftere kayÄ±tlÄ± iÅŸlem yok.'; return; }

  // Defterdeki aynÄ± id'li kopya satÄ±rlarÄ± tekilleÅŸtir
  const seenIds = new Set();
  const uniqueTrades = [];
  trades.forEach(t => {
    if (!t || t.id == null || seenIds.has(t.id)) return;
    seenIds.add(t.id);
    uniqueTrades.push(t);
  });

  const existTs = new Set(dataTrades.map(t => t.ts));
  // AynÄ± iÅŸlemin gÃ¼nlÃ¼kte zaten olup olmadÄ±ÄŸÄ±nÄ± da kontrol et (farklÄ± tarih biÃ§imiyle gelmiÅŸ olsa bile)
  const existKey = new Set(dataTrades.map(t => (t.pair || '').toUpperCase() + '|' + dfNormDate(t.date) + '|' + (t.dir || '') + '|' + dnum(t.r)));
  let added = 0;
  uniqueTrades.forEach(t => {
    if (existTs.has(t.id)) return;
    const k = (t.pair || '').toUpperCase() + '|' + dfNormDate(t.date) + '|' + (t.dir || 'LONG') + '|' + dnum(t.r);
    if (existKey.has(k)) return;
    existTs.add(t.id);
    existKey.add(k);
    dataTrades.push({ id: Date.now() + Math.random() + added, ts: t.id, date: t.date || '', pair: t.pair || '', dir: t.dir || 'LONG', r: dnum(t.r), pnl: null, strat: t.strat || '', note: t.note || '', images: (t.images || []).slice() });
    added++;
  });

  // GÃ¼nlÃ¼kteki mevcut tekrarlarÄ± temizle (aynÄ± ts/id birden fazla kez geÃ§iyorsa biri kalÄ±r)
  const seen = new Set();
  dataTrades = dataTrades.filter(t => {
    const k = t && t.ts != null ? 'ts:' + t.ts : (t && t.id != null ? 'id:' + t.id : '');
    if (!k) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  await saveData(); renderData();
  note.textContent = added ? (added + ' iÅŸlem defterden aktarÄ±ldÄ±, tekrarlar temizlendi.') : 'Zaten gÃ¼ncel â€” aktarÄ±lacak yeni iÅŸlem yok.';
}

function csvDisp(s) { const d = new Date(Date.parse(s)); if (isNaN(d.getTime())) return String(s).slice(0, 10); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); }
function mergeCsvPartials(rows) {
  const groups = {};
  rows.forEach(t => {
    const key = (t.pair||'')+'|'+(t.date||'')+'|'+(t.dir||'');
    if (!groups[key]) { groups[key] = Object.assign({}, t, { _mergeCount: 1 }); }
    else {
      groups[key].r += t.r;
      if (t.pnl != null) groups[key].pnl = (groups[key].pnl || 0) + t.pnl;
      groups[key]._mergeCount++;
    }
  });
  const merged = Object.values(groups);
  const total = rows.length, after = merged.length;
  return { merged, mergedCount: total - after, total };
}
function importCsv(file) {
  const note = document.getElementById('data-note');
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const text = String(reader.result || '');
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length < 2) throw new Error('boÅŸ');
      const delim = ((lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length) ? ';' : (lines[0].indexOf('\t') > -1 ? '\t' : ',');
      const header = lines[0].split(delim).map(h => h.trim().toLowerCase());
      const find = (...keys) => header.findIndex(h => keys.some(k => h.indexOf(k) > -1));
      const iDate = find('date', 'tarih', 'time', 'zaman');
      const iSym = find('symbol', 'pair', 'parite', 'enstr', 'item');
      const iType = find('type', 'side', 'yÃ¶n', 'direction', 'position', 'iÅŸlem');
      const iProfit = find('profit', 'pnl', 'kar', 'kazanÃ§', 'net');
      const iR = find('rr', 'r multiple', 'risk');
      let added = [];
      for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(delim).map(x => x.trim().replace(/^"|"$/g, ''));
        const rawDate = iDate > -1 ? c[iDate] : '';
        const ts = rawDate ? (Date.parse(rawDate) || (Date.now() + i)) : (Date.now() + i);
        const typ = (iType > -1 ? c[iType] : '').toLowerCase();
        const dir = /sell|short/.test(typ) ? 'SHORT' : 'LONG';
        const pnl = iProfit > -1 ? dnum((c[iProfit] || '').replace(/[^0-9.\-,]/g, '').replace(',', '.')) : null;
        const rr = iR > -1 ? dnum(c[iR]) : 0;
        added.push({ id: Date.now() + Math.random() + i, ts, date: rawDate ? csvDisp(rawDate) : '', pair: (iSym > -1 ? c[iSym] : '').toUpperCase(), dir, r: rr, pnl, strat: '', note: 'CSV' });
      }
      // AynÄ± pair+date+dir olan kÄ±smi pozlarÄ± otomatik birleÅŸtir (kaldÄ±raÃ§ yetmediÄŸi iÃ§in bÃ¶lÃ¼nen pozlar)
      const { merged, mergedCount, total } = mergeCsvPartials(added);
      // Mevcut veriyle de Ã§akÄ±ÅŸma kontrolÃ¼ (r dahil)
      const existKey = new Set(dataTrades.map(t => (t.pair||'')+'|'+(t.date||'')+'|'+(t.dir||'')+'|'+dnum(t.r)));
      let actuallyAdded = 0;
      merged.forEach(t => {
        const key = (t.pair||'')+'|'+(t.date||'')+'|'+(t.dir||'')+'|'+dnum(t.r);
        if (existKey.has(key)) return;
        existKey.add(key);
        dataTrades.push(t);
        actuallyAdded++;
      });
      await saveData(); renderData();
      const parts = [];
      parts.push(total + ' satÄ±r okundu');
      if (mergedCount > 0) parts.push(mergedCount + ' kÄ±smi poz birleÅŸtirildi');
      parts.push(actuallyAdded + ' yeni iÅŸlem eklendi');
      note.textContent = parts.join(' Â· ');
    } catch (e) {
      note.textContent = 'CSV okunamadÄ± â€” sÃ¼tun baÅŸlÄ±klarÄ± (date, symbol, type, profit) olan bir dosya dene.';
    }
  };
  reader.readAsText(file);
}

function getNotionDbIds() {
  const k = typeof store !== 'undefined' ? store : null;
  let kid = '', fid = '', wid = '';
  try { kid = localStorage.getItem('ndb_kripto') || ''; } catch (e) {}
  try { fid = localStorage.getItem('ndb_fx') || ''; } catch (e) {}
  try { wid = localStorage.getItem('ndb_week') || ''; } catch (e) {}
  if (typeof AUTH !== 'undefined' && AUTH.cloud) {
    if (AUTH.cloud.ndb_kripto) kid = AUTH.cloud.ndb_kripto;
    if (AUTH.cloud.ndb_fx) fid = AUTH.cloud.ndb_fx;
    if (AUTH.cloud.ndb_week) wid = AUTH.cloud.ndb_week;
  }
  return { kripto: kid.trim(), fx: fid.trim(), week: wid.trim() };
}
function saveNotionDbIds(kripto, fx, week) {
  if (typeof AUTH !== 'undefined' && AUTH.cloud) { AUTH.cloud.ndb_kripto = kripto; AUTH.cloud.ndb_fx = fx; AUTH.cloud.ndb_week = week; scheduleCloudSync(); }
  try { localStorage.setItem('ndb_kripto', kripto); } catch (e) {}
  try { localStorage.setItem('ndb_fx', fx); } catch (e) {}
  try { localStorage.setItem('ndb_week', week); } catch (e) {}
}

async function importFromNotion() {
  const note = document.getElementById('data-note');
  const btn = document.getElementById('data-notion');
  note.textContent = 'Notion\'dan Ã§ekiliyorâ€¦';
  if (btn) btn.disabled = true;
  const nt = getNotionToken();
  const dbs = getNotionDbIds();
  let url = '/api/notion-trades' + (nt ? '?token=' + encodeURIComponent(nt) : '');
  if (dbs.kripto || dbs.fx) {
    url += (nt ? '&' : '?') + 'dbs=' + encodeURIComponent(JSON.stringify(dbs));
  }
  try {
    const r = await fetch(url);
    let j = {};
    try { j = await r.json(); } catch (e) { throw new Error('Sunucu yanÄ±tÄ± okunamadÄ± (arka uÃ§ yÃ¼klÃ¼ mÃ¼?)'); }
    if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
    const incoming = Array.isArray(j.trades) ? j.trades : [];
    const byId = new Map();
    dataTrades.forEach(t => { if (t.notionId) byId.set(t.notionId, t); });
    let added = 0, updated = 0;
    incoming.forEach(t => {
      const exist = t.notionId ? byId.get(t.notionId) : null;
      if (exist) {
        if (t.date) exist.date = t.date;
        if (t.pair) exist.pair = String(t.pair).toUpperCase();
        if (t.dir) exist.dir = t.dir;
        if (t.r != null) exist.r = dnum(t.r);
        if (t.strat) exist.strat = t.strat;
        if (t.model) exist.model = t.model;
        if (t.note) exist.note = t.note;
        updated++;
      } else {
        const dup = dataTrades.find(x => (x.pair||'') === (t.pair||'').toUpperCase() && (x.date||'') === (t.date||'') && (x.dir||'') === (t.dir||'') && dnum(x.r) === dnum(t.r));
        if (dup) return;
        dataTrades.push({
          id: Date.now() + Math.random() + added,
          notionId: t.notionId || null,
          ts: t.ts || (Date.now() + added),
          date: t.date || '',
          pair: (t.pair || '').toUpperCase(), dir: t.dir || 'LONG',
          r: dnum(t.r), pnl: null, strat: t.strat || '', model: t.model || '', note: t.note || '', _source: 'Notion'
        });
        added++;
      }
    });
    await saveData(); renderData();
    const parts = [];
    if (added) parts.push(added + ' yeni eklendi');
    if (updated) parts.push(updated + ' gÃ¼ncellendi');
    note.textContent = parts.length ? parts.join(' Â· ') + ' â€” Notion senkronu tamam.' : 'Zaten gÃ¼ncel â€” Ã§ekilecek yeni kayÄ±t yok.';
  } catch (e) {
    note.textContent = 'Notion\'dan Ã§ekilemedi: ' + ((e && e.message) || e);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function getNotionToken() {
  try { const v = localStorage.getItem('notion_oauth_token'); if (v && v.length > 20) return v; } catch (e) {}
  if (typeof AUTH !== 'undefined' && AUTH.cloud && AUTH.cloud.notion_oauth_token) return AUTH.cloud.notion_oauth_token;
  return null;
}
function setNotionToken(token) {
  if (typeof AUTH !== 'undefined' && AUTH.cloud) { AUTH.cloud.notion_oauth_token = token; scheduleCloudSync(); }
  try { localStorage.setItem('notion_oauth_token', token); } catch (e) {}
}
function handleNotionHash() {
  try {
    const h = window.location.hash;
    if (h.startsWith('#notion-token=')) {
      const token = decodeURIComponent(h.slice(14));
      setNotionToken(token);
      window.location.hash = '';
      const note = document.getElementById('data-note');
      if (note) note.textContent = 'âœ… Notion hesabÄ±n baÄŸlandÄ±! Veriler Ã§ekiliyorâ€¦';
      setTimeout(importFromNotion, 500);
    } else if (h.startsWith('#notion-error=')) {
      const err = decodeURIComponent(h.slice(14));
      window.location.hash = '';
      const note = document.getElementById('data-note');
      if (note) note.textContent = 'âŒ Notion baÄŸlantÄ± hatasÄ±: ' + err;
    }
  } catch (e) { /* hash hatasÄ± */ }
}

function bindDataPage() {
  const g = id => document.getElementById(id);
  const nb = g('data-notion'); if (nb) nb.addEventListener('click', importFromNotion);
  const no = g('data-notion-oauth');
  if (no) no.addEventListener('click', () => {
    const state = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user.id : '';
    window.location.href = '/api/notion-auth' + (state ? '?state=' + encodeURIComponent(state) : '');
  });
  // Notion DB ID yÃ¼kleme
  (function loadNdb() {
    const dbs = getNotionDbIds();
    const ki = g('ndb-kripto'); if (ki) ki.value = dbs.kripto;
    const fi = g('ndb-fx'); if (fi) fi.value = dbs.fx;
    const wi = g('ndb-week'); if (wi) wi.value = dbs.week;
  })();
  const ns = g('ndb-save');
  if (ns) ns.addEventListener('click', () => {
    const ki = g('ndb-kripto'), fi = g('ndb-fx'), wi = g('ndb-week');
    saveNotionDbIds(ki ? ki.value.trim() : '', fi ? fi.value.trim() : '', wi ? wi.value.trim() : '');
    const nn = g('ndb-note');
    if (nn) { nn.textContent = 'âœ… Database ID\'ler kaydedildi.'; setTimeout(() => { nn.textContent = ''; }, 2000); }
  });
  g('df-long').addEventListener('click', () => { dfDir = 'LONG'; g('df-long').classList.add('on'); g('df-short').classList.remove('on'); });
  g('df-short').addEventListener('click', () => { dfDir = 'SHORT'; g('df-short').classList.add('on'); g('df-long').classList.remove('on'); });
  g('df-add').addEventListener('click', addDataTrade);
  document.querySelectorAll('#data-filter .tf').forEach(b => {
    b.addEventListener('click', () => {
      dfFilter = b.getAttribute('data-f');
      document.querySelectorAll('#data-filter .tf').forEach(x => x.classList.toggle('on', x === b));
      dfDataPage = 1;
      renderData();
    });
  });
  g('data-import-defter').addEventListener('click', importFromDefter);
  g('data-clear').addEventListener('click', async () => {
    if (!dataTrades.length) return;
    if (!confirm('Data Takibi\'ndeki tÃ¼m iÅŸlemler silinecek. Emin misin? (Konfirmasyon Defteri etkilenmez)')) return;
    dataTrades = [];
    await saveData(); renderData();
    document.getElementById('data-note').textContent = 'TÃ¼m iÅŸlemler silindi.';
  });

  g('data-csv-btn').addEventListener('click', () => g('data-csv-file').click());
  g('data-csv-file').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) importCsv(f); e.target.value = ''; });
  // Kriter slider canlÄ± gÃ¶sterim
  document.querySelectorAll('.crit-range').forEach(r => {
    r.addEventListener('input', () => {
      const v = document.getElementById(r.id + '-v');
      if (v) v.textContent = r.value;
    });
  });
  // Resim sÃ¼rÃ¼kle/bÄ±rak
  const dropArea = g('df-img-drop');
  if (dropArea) {
    dropArea.addEventListener('click', () => g('df-img-file').click());
    dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('drag'); });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag'));
    dropArea.addEventListener('drop', e => {
      e.preventDefault(); dropArea.classList.remove('drag');
      Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(f => {
        const reader = new FileReader();
        reader.onload = ev => dfAddImg(ev.target.result);
        reader.readAsDataURL(f);
      });
    });
    g('df-img-file').addEventListener('change', e => {
      Array.from(e.target.files).forEach(f => {
        const reader = new FileReader();
        reader.onload = ev => dfAddImg(ev.target.result);
        reader.readAsDataURL(f);
      });
      e.target.value = '';
    });
  }
  // Ctrl+V resim yapÄ±ÅŸtÄ±r
  document.addEventListener('paste', e => {
    if (currentPage !== 'data' || document.querySelector('.data-row.edit-open')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    Array.from(items).filter(item => item.type.startsWith('image/')).forEach(item => {
      const blob = item.getAsFile();
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = ev => dfAddImg(ev.target.result);
      reader.readAsDataURL(blob);
    });
  });
  // AI Trading Coach analiz
  const aiBtn = document.getElementById('data-ai-btn');
  if (aiBtn) {
    aiBtn.addEventListener('click', async () => {
      const focus = document.getElementById('data-ai-focus').value;
      let rows = sortedData();
      const allRows = rows;
      if (focus === 'wins') rows = rows.filter(t => dnum(t.r) > 0);
      else if (focus === 'losses') rows = rows.filter(t => dnum(t.r) <= 0);
      else if (focus === 'recent') rows = rows.slice(-20);
      else if (focus === 'strat') rows = allRows; // hepsini al, strat bazlÄ± yap

      const n = rows.length;
      if (!n) { document.getElementById('data-ai-msgs').innerHTML = '<div class="ai-coach-placeholder">SeÃ§ilen filtrelere uygun iÅŸlem bulunamadÄ±.</div>'; return; }

      // Ä°statistik hesapla
      const rVals = rows.map(t => dnum(t.r));
      const sumR = rVals.reduce((a, b) => a + b, 0);
      const avgR = sumR / n;
      const wins = rVals.filter(r => r > 0).length;
      const losses = rVals.filter(r => r <= 0).length;
      const wr = wins / n * 100;
      const posR = rVals.filter(r => r > 0);
      const negR = rVals.filter(r => r <= 0);
      const avgWin = posR.length ? posR.reduce((a, b) => a + b, 0) / posR.length : 0;
      const avgLoss = negR.length ? negR.reduce((a, b) => a + b, 0) / negR.length : 0;
      const profitFactor = Math.abs(avgLoss) > 0 ? (avgWin * wins) / (Math.abs(avgLoss) * losses) : (avgWin > 0 ? 999 : 0);
      const variance = rVals.reduce((s, v) => s + (v - avgR) ** 2, 0) / n;
      const stdDev = Math.sqrt(variance);
      const sharpe = stdDev > 0 ? avgR / stdDev * Math.sqrt(252) : 0; // gÃ¼nlÃ¼k deÄŸil ama oranlama

      // Maksimum drawdown
      let cum = 0, peak = 0, maxDd = 0;
      rVals.forEach(r => { cum += r; if (cum > peak) peak = cum; const dd = (peak - cum) / (Math.abs(peak) || 1); if (dd > maxDd) maxDd = dd; });

      // Strateji bazÄ±nda
      const strats = {};
      rows.forEach(t => {
        const s = (t.strat || 'BelirtilmemiÅŸ').trim();
        if (!strats[s]) strats[s] = { count: 0, wins: 0, sumR: 0, notes: [] };
        strats[s].count++;
        strats[s].sumR += dnum(t.r);
        if (dnum(t.r) > 0) strats[s].wins++;
        if (t.note) strats[s].notes.push(t.note);
      });
      const stratSummary = Object.entries(strats).map(([s, d]) =>
        `${s}: ${d.count} iÅŸlem, WR ${(d.wins/d.count*100).toFixed(0)}%, toplam R ${d.sumR.toFixed(2)}, notlar: ${d.notes.length ? d.notes.join(' | ') : 'yok'}`
      ).join('\n');

      // Kriter ortalamalarÄ±
      const critAvg = {};
      if (rows.some(t => t.criteria)) {
        ['setup','entry','exit','risk','psycho'].forEach(k => {
          const vals = rows.filter(t => t.criteria && t.criteria[k] > 0).map(t => t.criteria[k]);
          critAvg[k] = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 'â€”';
        });
      }

      // Consecutive wins/losses
      let maxConW = 0, maxConL = 0, curW = 0, curL = 0;
      rVals.forEach(r => {
        if (r > 0) { curW++; curL = 0; if (curW > maxConW) maxConW = curW; }
        else { curL++; curW = 0; if (curL > maxConL) maxConL = curL; }
      });

      // Son iÅŸlem notlarÄ± (son 10)
      const recentNotes = rows.slice(-10).filter(t => t.note).map(t => `[${t.pair}] ${t.note}`).join('\n');

      const statsBlock =
        `ğŸ“Š TEMEL Ä°STATÄ°STÄ°KLER
Toplam Ä°ÅŸlem: ${n}
Win Rate: ${wr.toFixed(1)}% (${wins}W / ${losses}L)
Toplam R: ${sumR.toFixed(2)}
Ortalama R: ${avgR.toFixed(2)}
Ortalama KazanÃ§: ${avgWin.toFixed(2)}R
Ortalama KayÄ±p: ${avgLoss.toFixed(2)}R
Profit Factor: ${profitFactor.toFixed(2)}
Standart Sapma: ${stdDev.toFixed(2)}
Sharpe OranÄ± (yÄ±llÄ±k.): ${sharpe.toFixed(2)}
Maksimum Drawdown: ${(maxDd * 100).toFixed(1)}%
En Uzun KazanÃ§ Serisi: ${maxConW}
En Uzun KayÄ±p Serisi: ${maxConL}

ğŸ“‹ STRATEJÄ° BAZINDA PERFORMANS
${stratSummary || 'Strateji bilgisi yok.'}

${Object.keys(critAvg).length ? `ğŸ“ KRÄ°TER ORTALAMALARI (1-10)
Setup: ${critAvg.setup || 'â€”'} | Entry: ${critAvg.entry || 'â€”'} | Exit: ${critAvg.exit || 'â€”'} | Risk: ${critAvg.risk || 'â€”'} | Psikoloji: ${critAvg.psycho || 'â€”'}` : ''}

${recentNotes ? `ğŸ“ Ä°ÅLEM NOTLARI (son 10)
${recentNotes}` : 'Not bulunamadÄ±.'}

YukarÄ±daki verilere gÃ¶re bana bir trading coach gibi analiz ver:
1. Genel performans deÄŸerlendirmesi
2. ZayÄ±f yÃ¶nlerim ve iyileÅŸtirme alanlarÄ±
3. GÃ¼Ã§lÃ¼ yÃ¶nlerim
4. Strateji bazÄ±nda hangisi daha iyi gidiyor, neden?
5. Varyans ve risk yÃ¶netimi deÄŸerlendirmesi
6. Somut Ã¶neriler (bir sonraki hafta iÃ§in)`;

      const msgDiv = document.getElementById('data-ai-msgs');
      msgDiv.innerHTML = '<div class="ai-coach-placeholder">ğŸ¤” Analiz ediliyor...</div>';
      try {
        const resp = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Bir trading coach gibi davran. Ä°ÅŸlem verilerim ÅŸu:\n\n${statsBlock}` }) });
        const data = await resp.json();
        const reply = data.reply || 'Cevap alÄ±namadÄ±.';
        // Format response with coach styling
        const formatted = reply.replace(/^(\d+\.\s+\*\*.*)/gm, '<div class="ai-coach-section"><h4>$1</h4>').replace(/(\*\*.*\*\*)/g, '<strong>$1</strong>');
        msgDiv.innerHTML = '<div class="ai-coach-msg" style="max-height:none;margin:0;">' + esc(reply).replace(/\n/g, '<br>') + '</div>';
      } catch(e) {
        msgDiv.innerHTML = '<div style="color:var(--red);padding:12px;">Analiz hatasÄ±: ' + esc(e.message) + '</div>';
      }
    });
  }
}

// ============ HaftalÄ±k DeÄŸerlendirme ============
const REVIEW_KEY = 'defter-reviews-v1';
const REVIEW_CFG_KEY = 'defter-review-cfg-v1';
let reviews = {};
let reviewCfg = null;
let reviewWeek = null;
let reviewSaveTimer = null;
let reviewMode = 'week';
let reviewMonth = null;

function rid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function defaultReviewCfg() {
  return {
    sections: [
      { id: 's1', title: 'Bu hafta nasÄ±l geÃ§ti?' },
      { id: 's2', title: 'Kripto' },
      { id: 's3', title: 'FX' },
      { id: 's4', title: 'Hatalar' },
      { id: 's5', title: 'DeÄŸiÅŸtirmen gereken ilk hatan' },
      { id: 's6', title: 'Ã–ÄŸrenilenler' },
      { id: 's7', title: 'YapÄ±lacaklar' },
      { id: 's8', title: "Edge'ini Ã¶ldÃ¼ren ÅŸeyler" }
    ],
    metrics: [
      { id: 'm1', title: 'KurallarÄ±ma uydum' },
      { id: 'm2', title: 'Duygusal durum' },
      { id: 'm3', title: 'Disiplin' }
    ]
  };
}
async function loadReviews() {
  try { const a = await store.get(REVIEW_KEY); reviews = a ? JSON.parse(a) : {}; } catch (e) { reviews = {}; }
  if (!reviews || typeof reviews !== 'object') reviews = {};
  try { const b = await store.get(REVIEW_CFG_KEY); reviewCfg = b ? JSON.parse(b) : defaultReviewCfg(); } catch (e) { reviewCfg = defaultReviewCfg(); }
  if (!reviewCfg || !Array.isArray(reviewCfg.sections)) reviewCfg = defaultReviewCfg();
  if (!Array.isArray(reviewCfg.metrics)) reviewCfg.metrics = defaultReviewCfg().metrics;
  reviewWeek = mondayOf(new Date());
}
function scheduleSaveReviews() { clearTimeout(reviewSaveTimer); reviewSaveTimer = setTimeout(saveReviews, 600); }
async function saveReviews() { await store.set(REVIEW_KEY, JSON.stringify(reviews)); }
async function saveReviewCfg() { await store.set(REVIEW_CFG_KEY, JSON.stringify(reviewCfg)); }

function mondayOf(d) { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); x.setHours(0, 0, 0, 0); return x; }
function weekKeyOf(d) { const m = mondayOf(d); return m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0') + '-' + String(m.getDate()).padStart(2, '0'); }
function weekLabel(d) {
  const mon = ['Oca', 'Åub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'AÄŸu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const m = mondayOf(d), e = new Date(m); e.setDate(e.getDate() + 6);
  return m.getDate() + ' ' + mon[m.getMonth()] + ' â€“ ' + e.getDate() + ' ' + mon[e.getMonth()] + ' ' + e.getFullYear();
}
function ensureWeek(wk) {
  if (!reviews[wk]) reviews[wk] = { notes: {}, bars: {}, rr: {} };
  if (!reviews[wk].notes) reviews[wk].notes = {};
  if (!reviews[wk].bars) reviews[wk].bars = {};
  if (!reviews[wk].rr) reviews[wk].rr = {};
  return reviews[wk];
}
function updateRRcum() {
  const keys = Object.keys(reviews).filter(k => {
    const r = reviews[k] && reviews[k].rr;
    return r && (r.kripto != null || r.fx != null);
  }).sort();
  let cK = 0, cF = 0;
  const sK = [0], sF = [0], sT = [0];
  keys.forEach(k => {
    const r = reviews[k].rr || {};
    cK += dnum(r.kripto); cF += dnum(r.fx);
    sK.push(cK); sF.push(cF); sT.push(cK + cF);
  });
  const setCum = (id, v) => {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = (v > 0 ? '+' : '') + v.toFixed(2) + 'R';
    el.className = 't-val ' + (v >= 0 ? 'pos' : 'neg');
  };
  setCum('rr-krip-cum', cK); setCum('rr-fx-cum', cF); setCum('rr-tot-cum', cK + cF);
  const hasData = keys.length > 0;
  const empty = document.getElementById('rv-empty'); if (empty) empty.style.display = hasData ? 'none' : 'block';
  const wrap = document.getElementById('rv-chart-wrap'); if (wrap) wrap.style.display = hasData ? 'block' : 'none';
  if (hasData) drawReviewChart([sT, sK, sF]);
}

function drawReviewChart(series) {
  const cv = document.getElementById('rv-chart');
  const wrap = document.getElementById('rv-chart-wrap');
  if (!cv || !wrap) return;
  const W = wrap.clientWidth || 600, H = 220;
  const dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const all = series.reduce((a, s) => a.concat(s), []);
  const min = Math.min(0, ...all), max = Math.max(0, ...all);
  const pad = 12, range = (max - min) || 1, n = series[0].length;
  const x = i => pad + (W - 2 * pad) * (i / (n - 1 || 1));
  const y = v => (H - pad) - (H - 2 * pad) * ((v - min) / range);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted-2').trim() || '#3a3f63'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, y(0)); ctx.lineTo(W - pad, y(0)); ctx.stroke();
  const colors = ['#5b5bd6', '#f59e0b', '#0ea5e9']; // Toplam, Kripto, FX
  const widths = [2.6, 2, 2];
  const tot = series[0];
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(91,91,214,0.16)'); grad.addColorStop(1, 'rgba(91,91,214,0)');
  ctx.beginPath(); ctx.moveTo(x(0), y(tot[0]));
  tot.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(x(n - 1), y(0)); ctx.lineTo(x(0), y(0)); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  series.forEach((s, idx) => {
    ctx.beginPath(); s.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.strokeStyle = colors[idx]; ctx.lineWidth = widths[idx]; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x(n - 1), y(s[n - 1]), idx === 0 ? 3.6 : 3, 0, Math.PI * 2); ctx.fillStyle = colors[idx]; ctx.fill();
  });
}

function renderReview() {
  if (!reviewCfg) reviewCfg = defaultReviewCfg();
  if (!reviewWeek) reviewWeek = mondayOf(new Date());
  if (!reviewMonth) reviewMonth = new Date(reviewWeek.getFullYear(), reviewWeek.getMonth(), 1);
  const modeWeek = document.getElementById('rv-mode-week');
  const modeMonth = document.getElementById('rv-mode-month');
  if (modeWeek) modeWeek.classList.toggle('on-gold', reviewMode === 'week');
  if (modeMonth) modeMonth.classList.toggle('on-gold', reviewMode === 'month');
  const rvToday = document.getElementById('rv-today');
  if (rvToday) rvToday.textContent = reviewMode === 'month' ? 'Bu ay' : 'Bu hafta';
  const rvIn = document.querySelector('.rv-inputs');
  if (rvIn) rvIn.style.display = reviewMode === 'month' ? 'none' : '';
  if (reviewMode === 'month') renderReviewMonth();
  else renderReviewWeek();
}

function monthKeyOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function monthLabel(d) {
  const mon = ['Oca', 'Åub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'AÄŸu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return mon[d.getMonth()] + ' ' + d.getFullYear();
}
function weeksOfMonth(d) {
  const key = monthKeyOf(d);
  return Object.keys(reviews).filter(k => k.indexOf(key) === 0).sort();
}

function renderReviewMonth() {
  const wk = monthKeyOf(reviewMonth);
  document.getElementById('rv-week').textContent = monthLabel(reviewMonth);
  const weekKeys = weeksOfMonth(reviewMonth);
  let cK = 0, cF = 0;
  weekKeys.forEach(k => {
    const r = (reviews[k] && reviews[k].rr) || {};
    cK += dnum(r.kripto); cF += dnum(r.fx);
  });
  const setCum = (id, v) => {
    const el = document.getElementById(id); if (!el) return;
    el.textContent = (v > 0 ? '+' : '') + v.toFixed(2) + 'R';
    el.className = 't-val ' + (v >= 0 ? 'pos' : 'neg');
  };
  setCum('rr-krip-cum', cK); setCum('rr-fx-cum', cF); setCum('rr-tot-cum', cK + cF);
  const empty = document.getElementById('rv-empty'); if (empty) empty.style.display = 'none';
  const wrap = document.getElementById('rv-chart-wrap'); if (wrap) wrap.style.display = 'none';

  // Ay KPI kartlarÄ±
  const perf = document.querySelector('.rv-perf');
  let kpiBox = document.getElementById('rv-mkpis');
  if (!kpiBox && perf) {
    kpiBox = document.createElement('div'); kpiBox.id = 'rv-mkpis'; kpiBox.className = 'rv-month-kpi';
    perf.appendChild(kpiBox);
  }
  if (kpiBox) {
    kpiBox.innerHTML = '';
    const nWeeks = weekKeys.length;
    const tradesInMonth = (Array.isArray(dataTrades) ? dataTrades : []).filter(t => {
      const ts = dfTs(t); if (!ts) return false;
      const d = new Date(ts);
      return monthKeyOf(d) === wk;
    });
    const totR = tradesInMonth.reduce((s, t) => s + dnum(t.r), 0);
    const wins = tradesInMonth.filter(t => dnum(t.r) > 0).length;
    const mk = (lbl, val, cls) => {
      const d = document.createElement('div'); d.className = 'rv-mkpi';
      d.innerHTML = '<div class="mk-lbl">' + lbl + '</div><div class="mk-val ' + (cls || '') + '">' + val + '</div>';
      kpiBox.appendChild(d);
    };
    mk('DeÄŸerlendirilen hafta', nWeeks + ' hafta');
    mk('HaftalÄ±k Toplam RR', (cK + cF > 0 ? '+' : '') + (cK + cF).toFixed(2) + 'R', cK + cF >= 0 ? 'pos' : 'neg');
    mk('Trade GÃ¼nlÃ¼ÄŸÃ¼ R', (totR > 0 ? '+' : '') + totR.toFixed(2) + 'R', totR >= 0 ? 'pos' : 'neg');
    mk('Win rate', tradesInMonth.length ? Math.round(wins / tradesInMonth.length * 100) + '%' : 'â€”');
  }

  // Metrikler â€” ortalama
  const mBox = document.getElementById('rv-metrics');
  mBox.innerHTML = '';
  reviewCfg.metrics.forEach(m => {
    let sum = 0, cnt = 0;
    weekKeys.forEach(k => { const v = reviews[k] && reviews[k].bars && reviews[k].bars[m.id]; if (v != null) { sum += Number(v); cnt++; } });
    const avg = cnt ? Math.round(sum / cnt) : null;
    const wrap = document.createElement('div'); wrap.className = 'rv-metric';
    const head = document.createElement('div'); head.className = 'rv-mhead';
    const lbl = document.createElement('span'); lbl.className = 'rv-mlabel'; lbl.textContent = m.title;
    const valSpan = document.createElement('span'); valSpan.className = 'rv-mval';
    valSpan.textContent = avg === null ? 'â€”' : avg + '%' + (cnt ? ' (' + cnt + ' hafta)' : '');
    head.appendChild(lbl); head.appendChild(valSpan);
    const bar = document.createElement('div'); bar.className = 'rv-bar';
    const fill = document.createElement('div'); fill.className = 'rv-bar-fill';
    fill.style.width = (avg === null ? 0 : avg) + '%'; bar.appendChild(fill);
    wrap.appendChild(head); wrap.appendChild(bar);
    mBox.appendChild(wrap);
  });

  // BÃ¶lÃ¼mler â€” birleÅŸtirilmiÅŸ notlar + Ã§Ä±karÄ±lan dersler otomatik
  const sBox = document.getElementById('rv-sections');
  sBox.innerHTML = '';
  reviewCfg.sections.forEach(sec => {
    const parts = [];
    weekKeys.forEach(k => {
      const v = reviews[k] && reviews[k].notes && reviews[k].notes[sec.id];
      if (v && v.trim()) parts.push('â–¸ ' + weekLabel(new Date(k + 'T00:00:00')) + '\n' + v.trim());
    });
    const isOgren = /Ã¶ÄŸren|ogren|ders|lesson/i.test(sec.title);
    if (isOgren) {
      const lessons = (Array.isArray(lessonsData && lessonsData.lessons) ? lessonsData.lessons : [])
        .filter(l => l && l.added && String(l.added).indexOf(wk) === 0);
      if (lessons.length) {
        parts.push('â–¸ Ã‡Ä±karÄ±lan dersler (otomatik â€” Ders Defteri):\n' + lessons.map(l => 'â€¢ ' + l.text).join('\n'));
      }
    }
    const wrap = document.createElement('div'); wrap.className = 'rv-section';
    const head = document.createElement('div'); head.className = 'rv-shead';
    const title = document.createElement('span'); title.className = 'rv-stitle'; title.textContent = sec.title;
    head.appendChild(title);
    const ta = document.createElement('div'); ta.className = 'rv-ta';
    ta.style.cssText = 'white-space:pre-wrap;';
    ta.textContent = parts.length ? parts.join('\n\n') : (isOgren ? 'Bu ay Ã§Ä±karÄ±lan ders yok.' : 'Bu ay bu bÃ¶lÃ¼me not girilmemiÅŸ.');
    wrap.appendChild(head); wrap.appendChild(ta);
    sBox.appendChild(wrap);
  });

  // Trade gÃ¼nlÃ¼ÄŸÃ¼ equity
  const rows = sortedData();
  const cv = document.getElementById('rv-eq-chart');
  const wrap2 = document.getElementById('rv-eq-wrap');
  document.getElementById('rv-eq-total').textContent = rows.length ? rows.reduce((s, t) => s + dnum(t.r), 0).toFixed(2) + ' R' : '';
  if (cv && wrap2 && rows.length) {
    const W = wrap2.clientWidth || 600, H = 160;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.cssText = 'width:' + W + 'px;height:' + H + 'px;display:block;';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    let cum = 0; const pts = [0]; rows.forEach(t => { cum += dnum(t.r); pts.push(cum); });
    const min = Math.min(0, ...pts), max = Math.max(0, ...pts);
    const pad = 12, range = (max - min) || 1;
    const x = i => pad + (W - 2 * pad) * (i / (pts.length - 1 || 1));
    const y = v => (H - pad) - (H - 2 * pad) * ((v - min) / range);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted-2').trim() || '#3a3f63'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y(0)); ctx.lineTo(W - pad, y(0)); ctx.stroke();
    const up = pts[pts.length - 1] >= 0;
    const col = up ? '#34d399' : '#f87171';
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, up ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.moveTo(x(0), y(pts[0])); pts.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(pts.length - 1), y(0)); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x(0), y(pts[0])); pts.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = col; ctx.font = '600 12px Inter,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((pts[pts.length - 1] > 0 ? '+' : '') + pts[pts.length - 1].toFixed(2) + 'R', W - pad, y(pts[pts.length - 1]) - 6);
  } else if (cv) { cv.style.display = 'none'; }
}

function renderReviewWeek() {
  if (!reviewCfg) reviewCfg = defaultReviewCfg();
  if (!reviewWeek) reviewWeek = mondayOf(new Date());
  const mk = document.getElementById('rv-mkpis'); if (mk) mk.remove();
  const wk = weekKeyOf(reviewWeek);
  document.getElementById('rv-week').textContent = weekLabel(reviewWeek);
  const data = reviews[wk] || { notes: {}, bars: {}, rr: {} };
  const rr = (data.rr && typeof data.rr === 'object') ? data.rr : {};
  const kIn = document.getElementById('rr-krip-in'); if (kIn) kIn.value = (rr.kripto != null) ? rr.kripto : '';
  const fIn = document.getElementById('rr-fx-in'); if (fIn) fIn.value = (rr.fx != null) ? rr.fx : '';
  updateRRcum();

  const mBox = document.getElementById('rv-metrics');
  mBox.innerHTML = '';
  reviewCfg.metrics.forEach(m => {
    const val = (data.bars && data.bars[m.id] != null) ? data.bars[m.id] : 50;
    const wrap = document.createElement('div'); wrap.className = 'rv-metric';
    const head = document.createElement('div'); head.className = 'rv-mhead';
    const lbl = document.createElement('input'); lbl.className = 'rv-mlabel'; lbl.value = m.title; lbl.placeholder = 'Ã–lÃ§Ã¼t adÄ±';
    lbl.addEventListener('input', () => { m.title = lbl.value; });
    lbl.addEventListener('change', saveReviewCfg);
    const valSpan = document.createElement('span'); valSpan.className = 'rv-mval'; valSpan.textContent = val + '%';
    const del = document.createElement('button'); del.className = 'rv-del'; del.type = 'button'; del.textContent = 'Ã—'; del.title = 'Sil';
    del.addEventListener('click', () => { reviewCfg.metrics = reviewCfg.metrics.filter(x => x.id !== m.id); saveReviewCfg(); renderReview(); });
    head.appendChild(lbl); head.appendChild(valSpan); head.appendChild(del);
    const bar = document.createElement('div'); bar.className = 'rv-bar';
    const fill = document.createElement('div'); fill.className = 'rv-bar-fill'; fill.style.width = val + '%'; bar.appendChild(fill);
    const range = document.createElement('input'); range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '5'; range.value = val; range.className = 'rv-range';
    range.addEventListener('input', () => { valSpan.textContent = range.value + '%'; fill.style.width = range.value + '%'; ensureWeek(wk).bars[m.id] = Number(range.value); scheduleSaveReviews(); });
    wrap.appendChild(head); wrap.appendChild(bar); wrap.appendChild(range);
    mBox.appendChild(wrap);
  });

  const sBox = document.getElementById('rv-sections');
  sBox.innerHTML = '';
  reviewCfg.sections.forEach(sec => {
    const val = (data.notes && data.notes[sec.id]) || '';
    const wrap = document.createElement('div'); wrap.className = 'rv-section';
    const head = document.createElement('div'); head.className = 'rv-shead';
    const title = document.createElement('input'); title.className = 'rv-stitle'; title.value = sec.title; title.placeholder = 'BÃ¶lÃ¼m baÅŸlÄ±ÄŸÄ±';
    title.addEventListener('input', () => { sec.title = title.value; });
    title.addEventListener('change', saveReviewCfg);
    const del = document.createElement('button'); del.className = 'rv-del'; del.type = 'button'; del.textContent = 'Ã—'; del.title = 'Sil';
    del.addEventListener('click', () => { reviewCfg.sections = reviewCfg.sections.filter(x => x.id !== sec.id); saveReviewCfg(); renderReview(); });
    head.appendChild(title); head.appendChild(del);
    const ta = document.createElement('textarea'); ta.className = 'rv-ta'; ta.value = val; ta.placeholder = 'Bu hafta iÃ§in notlarÄ±nâ€¦';
    ta.addEventListener('input', () => { ensureWeek(wk).notes[sec.id] = ta.value; scheduleSaveReviews(); });
    wrap.appendChild(head); wrap.appendChild(ta);
    sBox.appendChild(wrap);
  });
  // Data trades equity chart
  const rows = sortedData();
  const cv = document.getElementById('rv-eq-chart');
  const wrap = document.getElementById('rv-eq-wrap');
  document.getElementById('rv-eq-total').textContent = rows.length ? rows.reduce((s,t) => s + dnum(t.r), 0).toFixed(2) + ' R' : '';
  if (cv && wrap && rows.length) {
    const W = wrap.clientWidth || 600, H = 160;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.cssText = 'width:'+W+'px;height:'+H+'px;display:block;';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    let cum = 0; const pts = [0]; rows.forEach(t => { cum += dnum(t.r); pts.push(cum); });
    const min = Math.min(0, ...pts), max = Math.max(0, ...pts);
    const pad = 12, range = (max - min) || 1;
    const x = i => pad + (W - 2 * pad) * (i / (pts.length - 1 || 1));
    const y = v => (H - pad) - (H - 2 * pad) * ((v - min) / range);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted-2').trim() || '#3a3f63'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, y(0)); ctx.lineTo(W - pad, y(0)); ctx.stroke();
    const up = pts[pts.length - 1] >= 0;
    const col = up ? '#34d399' : '#f87171';
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, up ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.moveTo(x(0), y(pts[0]));
    pts.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(pts.length - 1), y(0)); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x(0), y(pts[0]));
    pts.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
    // Son deÄŸer etiketi
    ctx.fillStyle = col; ctx.font = '600 12px Inter,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText((pts[pts.length-1] > 0 ? '+' : '') + pts[pts.length-1].toFixed(2) + 'R', W - pad, y(pts[pts.length-1]) - 6);
  } else if (cv) { cv.style.display = 'none'; }
}

function bindReviewPage() {
  const g = id => document.getElementById(id);
  const navStep = () => {
    if (reviewMode === 'month') {
      reviewMonth = new Date(reviewMonth.getFullYear(), reviewMonth.getMonth() + 1, 1);
    } else {
      reviewWeek = new Date(reviewWeek.getTime() - 7 * 864e5);
    }
    renderReview();
  };
  const navStepFwd = () => {
    if (reviewMode === 'month') {
      reviewMonth = new Date(reviewMonth.getFullYear(), reviewMonth.getMonth() + 1, 1);
    } else {
      reviewWeek = new Date(reviewWeek.getTime() + 7 * 864e5);
    }
    renderReview();
  };
  g('rv-prev').addEventListener('click', navStep);
  g('rv-next').addEventListener('click', navStepFwd);
  g('rv-today').addEventListener('click', () => {
    if (reviewMode === 'month') { reviewMonth = new Date(); }
    else { reviewWeek = mondayOf(new Date()); }
    renderReview();
  });
  const mw = g('rv-mode-week'); if (mw) mw.addEventListener('click', () => { reviewMode = 'week'; renderReview(); });
  const mm = g('rv-mode-month'); if (mm) mm.addEventListener('click', () => { reviewMode = 'month'; renderReview(); });
  g('rv-add-section').addEventListener('click', () => { reviewCfg.sections.push({ id: rid(), title: '' }); saveReviewCfg(); renderReview(); });
  g('rv-add-metric').addEventListener('click', () => { reviewCfg.metrics.push({ id: rid(), title: 'Yeni Ã¶lÃ§Ã¼t' }); saveReviewCfg(); renderReview(); });
  const npush = g('rv-npush'); if (npush) npush.addEventListener('click', syncWeekToNotion);
  const npull = g('rv-npull'); if (npull) npull.addEventListener('click', pullWeeksFromNotion);
  const saveRR = (which, val) => {
    const wk = weekKeyOf(reviewWeek);
    ensureWeek(wk).rr[which] = (val === '') ? null : dnum(val);
    scheduleSaveReviews(); updateRRcum();
  };
  g('rr-krip-in').addEventListener('input', e => saveRR('kripto', e.target.value));
  g('rr-fx-in').addEventListener('input', e => saveRR('fx', e.target.value));
  window.addEventListener('resize', () => { if (currentPage === 'review') { updateRRcum(); renderReview(); } });
}

async function syncWeekToNotion() {
  const status = document.getElementById('rv-nstatus');
  if (!status) return;
  const dbId = getNotionDbIds().week;
  if (!dbId) {
    status.textContent = 'Ã–nce haftalÄ±k DB ID gerekli: Trade GÃ¼nlÃ¼ÄŸÃ¼ â†’ âš™ Notion Database AyarlarÄ±.';
    status.style.color = 'var(--red)';
    return;
  }
  const wk = weekKeyOf(reviewWeek);
  const data = ensureWeek(wk);
  const rr = data.rr || {};
  const sections = reviewCfg.sections
    .filter(s => s.title)
    .map(s => ({ title: s.title, text: (data.notes && data.notes[s.id]) || '' }));
  const metrics = reviewCfg.metrics
    .filter(m => m.title)
    .map(m => ({ title: m.title, val: (data.bars && data.bars[m.id] != null) ? data.bars[m.id] : 50 }));
  status.textContent = 'Notion\'a yazÄ±lÄ±yorâ€¦';
  status.style.color = '';
  try {
    const resp = await fetch('/api/notion-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'push', dbId, week: wk, rr: { kripto: rr.kripto, fx: rr.fx }, sections, metrics })
    });
    const j = await resp.json();
    if (j.ok) status.textContent = 'âœ… ' + wk + ' senkronlandÄ±' + (j.created ? ' (yeni sayfa)' : ' (gÃ¼ncellendi)');
    else status.textContent = 'âš  ' + (j.error || 'Senkron hatasÄ±') + ' â€” DB ID / yetki kontrol et.';
    status.style.color = j.ok ? 'var(--green)' : 'var(--red)';
  } catch (e) {
    status.textContent = 'âš  Sunucuya ulaÅŸÄ±lamadÄ±.';
    status.style.color = 'var(--red)';
  }
}

async function pullWeeksFromNotion() {
  const status = document.getElementById('rv-nstatus');
  if (!status) return;
  const dbId = getNotionDbIds().week;
  if (!dbId) {
    status.textContent = 'Ã–nce haftalÄ±k DB ID gerekli: Trade GÃ¼nlÃ¼ÄŸÃ¼ â†’ âš™ Notion Database AyarlarÄ±.';
    status.style.color = 'var(--red)';
    return;
  }
  status.textContent = 'Notion\'dan Ã§ekiliyorâ€¦';
  status.style.color = '';
  try {
    const resp = await fetch('/api/notion-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pull', dbId })
    });
    const j = await resp.json();
    if (!j.ok || !j.weeks) throw new Error(j.error || 'Ã‡ekme hatasÄ±');
    const weeks = j.weeks;
    let n = 0;
    Object.keys(weeks).forEach(k => {
      const d = ensureWeek(k);
      const w = weeks[k];
      if (w.rr && (w.rr.kripto != null || w.rr.fx != null)) {
        d.rr = d.rr || {};
        if (w.rr.kripto != null) d.rr.kripto = w.rr.kripto;
        if (w.rr.fx != null) d.rr.fx = w.rr.fx;
      }
      if (w.bars && typeof w.bars === 'object') {
        d.bars = d.bars || {};
        Object.keys(w.bars).forEach(title => {
          const sec = reviewCfg.metrics.find(m => m.title === title);
          if (sec) d.bars[sec.id] = w.bars[title];
        });
      }
      if (w.sections && typeof w.sections === 'object') {
        d.notes = d.notes || {};
        Object.keys(w.sections).forEach(title => {
          const sec = reviewCfg.sections.find(s => s.title === title);
          if (sec) d.notes[sec.id] = w.sections[title];
        });
      }
      n++;
    });
    await saveReviews();
    updateRRcum();
    renderReview();
    status.textContent = 'âœ… ' + n + ' hafta iÃ§e aktarÄ±ldÄ±.';
    status.style.color = 'var(--green)';
  } catch (e) {
    status.textContent = 'âš  ' + (e.message || 'Ã‡ekme hatasÄ±');
    status.style.color = 'var(--red)';
  }
}

// ============ EÄŸitim Ä°Ã§eriÄŸi (Alfa Edu) ============
const EGITIM_KEY = 'defter-egitim-v1';
const EG_SECTIONS = { teknik: 'Teknik Analiz', temel: 'Temel Analiz', psikoloji: 'Trade Psikolojisi', islem: 'Ä°ÅŸlem & Backtest', onchain: 'Onchain Analizi' };
const EG_LEVELS = ['temel', 'orta', 'ileri'];
const EG_SEED_PLAYLIST = 'PLSvAYYLAIh0PKVsqa7LqR6R1oU_qn8DEe';
const EG_SEED_VER = 5;
const EG_SEED = {};
let egitimData = { sections: {}, sel: {}, selVid: {}, seedVer: 0 };
let egSec = 'teknik';
let egLevel = 'temel';
let egShared = null;
let egSaveTimer = null;
let egForm = { mode: null, topicId: null, vidId: null };
let egPendingDelSec = null;
function egDefaultSecMeta() { return Object.keys(EG_SECTIONS).map(id => ({ id, title: EG_SECTIONS[id] })); }
function egSecMeta() {
  const m = egitimData && egitimData.secMeta;
  if (m && Array.isArray(m) && m.length) return m;
  return egDefaultSecMeta();
}
function egMoveTopic(t, dir) {
  const all = egitimData.sections[egSec];
  if (!all || !all.length) return false;
  const vis = egTopics();
  const vi = vis.indexOf(t);
  if (vi < 0) return false;
  const tgt = vis[vi + dir];
  if (!tgt) return false;
  const ai = all.indexOf(t), bi = all.indexOf(tgt);
  if (ai < 0 || bi < 0) return false;
  [all[ai], all[bi]] = [all[bi], all[ai]];
  return true;
}

async function loadEgitim() {
  // shared API ana kaynak, localStorage yedek
  let sharedData = null;
  try {
    const r = await fetch('/api/edu-shared');
    if (r.ok) sharedData = await r.json();
  } catch (e) { /* */ }
  const isAdmin = AUTH.user && (AUTH.user.email || '').toLowerCase() === ADMIN_EMAIL;
  // Eski namespace'siz localStorage verisini de dene (admin giriÅŸ yapÄ±nca kayboluyor)
  let rawLocal = await store.get(EGITIM_KEY);
  if (!rawLocal) { try { rawLocal = localStorage.getItem(EGITIM_KEY); } catch (e) {} }
  // KullanÄ±cÄ±nÄ±n kendi seÃ§imlerini (sel/selVid) korumak iÃ§in Ã¶nce local'den al
  let localSel = {}, localSelVid = {};
  if (rawLocal) { try { const p = JSON.parse(rawLocal); localSel = p.sel || {}; localSelVid = p.selVid || {}; } catch (e) {} }
  const sharedHasContent = sharedData && sharedData.sections && Object.values(sharedData.sections).some(arr => arr && arr.length > 0);
  if (sharedHasContent && !isAdmin) {
    // Admin deÄŸilse: shared verisi local'in Ã¼stÃ¼ne yazsÄ±n (silinenler de gitsin)
    egitimData = JSON.parse(JSON.stringify(sharedData));
    egitimData.sel = localSel;
    egitimData.selVid = localSelVid;
    // KullanÄ±cÄ±nÄ±n KENDÄ° iÅŸaretlerini (v.done) ve notlarÄ±nÄ± (t.note) shared veriye geri yÃ¼kle
    // (bu veriler hesaba Ã¶zel saklanÄ±r; ortak iÃ§erikle karÄ±ÅŸmaz)
    if (rawLocal) {
      try {
        const p = JSON.parse(rawLocal);
        const psecs = p.sections || {};
        Object.keys(psecs).forEach(sec => {
          (psecs[sec] || []).forEach(lt => {
            const t = (egitimData.sections[sec] || []).find(x => x.id === lt.id);
            if (!t) return;
            if (lt.note != null) t.note = lt.note;
            (lt.videos || []).forEach(lv => {
              const v = (t.videos || []).find(x => x.id === lv.id);
              if (v && lv.done) v.done = true;
            });
          });
        });
      } catch (e) { /* yerel veri bozuksa yok say */ }
    }
  } else {
    try {
      if (rawLocal) egitimData = JSON.parse(rawLocal);
    } catch (e) { /* */ }
    if (!egitimData || typeof egitimData !== 'object') egitimData = {};
    if (!egitimData.sections || typeof egitimData.sections !== 'object') egitimData.sections = {};
    if (!egitimData.sel || typeof egitimData.sel !== 'object') egitimData.sel = {};
    if (!egitimData.selVid || typeof egitimData.selVid !== 'object') egitimData.selVid = {};
    // shared'dan gelen konularÄ± local'e ekle (yoksa)
    if (sharedData && sharedData.sections) {
      const secIds = Array.from(new Set([...egDefaultSecMeta().map(s => s.id), ...Object.keys(sharedData.sections)]));
      secIds.forEach(sec => {
        const arr = sharedData.sections[sec] || [];
        if (!Array.isArray(egitimData.sections[sec])) egitimData.sections[sec] = [];
        const localIds = new Set(egitimData.sections[sec].map(t => t.id));
        arr.forEach(t => {
          if (!localIds.has(t.id)) {
            if (sec === 'teknik' && !t.level) t.level = 'temel';
            egitimData.sections[sec].push(t);
          }
        });
      });
    }
  }
  if (!egitimData.sel || typeof egitimData.sel !== 'object') egitimData.sel = {};
  if (!egitimData.selVid || typeof egitimData.selVid !== 'object') egitimData.selVid = {};
  if (!egitimData.secMeta || !Array.isArray(egitimData.secMeta) || !egitimData.secMeta.length) egitimData.secMeta = egDefaultSecMeta();
  // Adminse veriyi shared'a ata (hem ilk seferde hem de her yÃ¼klemede)
  if (isAdmin && Object.values(egitimData.sections).some(arr => arr && arr.length > 0)) {
    try {
      await saveEgitim();
    } catch (e) { console.error('Edu shared sync hatasÄ±:', e); }
  }
}
async function saveEgitim() {
  await store.set(EGITIM_KEY, JSON.stringify(egitimData));
  // Sadece admin shared'a yazsÄ±n, herkes okusun
  if (AUTH.user && (AUTH.user.email || '').toLowerCase() === ADMIN_EMAIL) {
    try {
      const payload = { sections: {}, secMeta: egSecMeta().map(s => ({ id: s.id, title: s.title })) };
      let topicCount = 0, videoCount = 0;
      egSecMeta().forEach(sec => {
        // Temiz kopya: kiÅŸiye Ã¶zel not/done alanlarÄ± HERKESE yayÄ±nlanmasÄ±n
        const list = (egitimData.sections[sec.id] || [])
          .filter(t => t.title || t.videos?.length)
          .map(t => ({
            id: t.id,
            title: t.title || '',
            level: (sec.id === 'teknik' && t.level) || undefined,
            videos: (t.videos || []).map(v => ({ id: v.id, title: v.title || '', url: v.url || '' })),
          }));
        payload.sections[sec.id] = list;
        topicCount += list.length;
        list.forEach(t => { videoCount += (t.videos || []).filter(v => v.url).length; });
      });
      const res = await fetch('/api/edu-shared', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) { egShared = JSON.parse(JSON.stringify(payload)); return { ok: true, topics: topicCount, videos: videoCount }; }
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
      return { ok: false, error: msg };
    } catch (e) { return { ok: false, error: (e && e.message) || 'aÄŸ hatasÄ±' }; }
  }
  return { ok: true, local: true };
}

// --- YouTube yardÄ±mcÄ±larÄ± ---
function ytId(url) {
  if (!url) return '';
  const s = String(url).trim();
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /(?:youtube\.com\/live\/)([\w-]{11})/,
  ];
  for (const re of patterns) { const m = s.match(re); if (m) return m[1]; }
  if (/^[\w-]{11}$/.test(s)) return s;
  return '';
}
function ytListId(url) {
  if (!url) return '';
  const m = String(url).match(/[?&]list=([\w-]+)/);
  return m ? m[1] : '';
}
function miroId(url) {
  if (!url) return '';
  const m = String(url).match(/miro\.com\/app\/(?:board|live-embed)\/([^\/?#]+)/);
  return m ? m[1] : '';
}
function egKind(v) {
  if (ytId(v.url)) return 'video';
  if (ytListId(v.url)) return 'playlist';
  if (miroId(v.url)) return 'miro';
  return 'invalid';
}
function egEmbedSrc(v) {
  const vid = ytId(v.url);
  if (vid) { const lst = ytListId(v.url); return 'https://www.youtube-nocookie.com/embed/' + vid + (lst ? ('?list=' + lst) : ''); }
  const pid = ytListId(v.url);
  if (pid) return 'https://www.youtube-nocookie.com/embed/videoseries?list=' + pid;
  const mid = miroId(v.url);
  if (mid) return 'https://miro.com/app/live-embed/' + mid + '?autoplay=true';
  return '';
}
function egWatchHref(v) {
  const vid = ytId(v.url);
  if (vid) return 'https://www.youtube.com/watch?v=' + vid;
  const pid = ytListId(v.url);
  if (pid) return 'https://www.youtube.com/playlist?list=' + pid;
  const mid = miroId(v.url);
  if (mid) return 'https://miro.com/app/board/' + mid;
  return v.url || '#';
}

function egTopics() {
  const all = egitimData.sections[egSec] || [];
  if (egSec !== 'teknik' || egLevel === 'all') return all;
  return all.filter(t => t.level === egLevel);
}
function egCurTopic() {
  const list = egTopics();
  if (!list.length) return null;
  let sel = list.find(t => t.id === egitimData.sel[egSec]);
  if (!sel) { sel = list[0]; egitimData.sel[egSec] = sel.id; }
  return sel;
}
function egCurVid(topic) {
  if (!topic || !topic.videos || !topic.videos.length) return null;
  let v = topic.videos.find(x => x.id === egitimData.selVid[topic.id]);
  if (!v) { v = topic.videos[0]; egitimData.selVid[topic.id] = v.id; }
  return v;
}

function renderEgitim() {
  const canEdit = magIsAdmin();
  // ---- BÃ¶lÃ¼m sekmeleri (dinamik; ekle/sil sadece admin) ----
  const seg = document.getElementById('eg-sec-seg');
  seg.innerHTML = '';
  egSecMeta().forEach(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pair-tab' + (s.id === egSec ? ' on-gold' : '');
    b.setAttribute('data-sec', s.id);
    const lbl = document.createElement('span');
    lbl.textContent = s.title;
    lbl.addEventListener('click', () => { egSec = s.id; egLevel = 'temel'; egPendingDelSec = null; egCloseForm(); renderEgitim(); });
    b.appendChild(lbl);
    if (canEdit) {
      const armed = egPendingDelSec === s.id;
      const x = document.createElement('span');
      x.className = 'pair-x' + (armed ? ' armed' : '');
      x.textContent = armed ? 'sil?' : 'Ã—';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', s.title + ' bÃ¶lÃ¼mÃ¼nÃ¼ sil');
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        if (egPendingDelSec !== s.id) { egPendingDelSec = s.id; renderEgitim(); return; }
        egPendingDelSec = null;
        const meta = egSecMeta().filter(m => m.id !== s.id);
        if (!meta.length) return;
        if (!confirm('â€œ' + s.title + 'â€ bÃ¶lÃ¼mÃ¼ ve iÃ§indeki tÃ¼m konular silinsin mi?')) return;
        egitimData.secMeta = meta;
        delete egitimData.sections[s.id];
        delete egitimData.sel[s.id];
        if (egSec === s.id) { egSec = meta[0].id; egLevel = 'temel'; }
        saveEgitim().then(renderEgitim);
      });
      b.appendChild(x);
    }
    seg.appendChild(b);
  });
  if (canEdit) {
    const add = document.createElement('button');
    add.className = 'addp'; add.textContent = '+';
    add.setAttribute('aria-label', 'Yeni bÃ¶lÃ¼m ekle');
    add.title = 'Yeni bÃ¶lÃ¼m ekle';
    add.addEventListener('click', () => {
      if (document.getElementById('eg-add-form').classList.contains('hidden')) egOpenForm('sec-add', null, null); else egCloseForm();
    });
    seg.appendChild(add);
  }
  const levelSeg = document.getElementById('eg-level-seg');
  if (levelSeg) levelSeg.style.display = egSec === 'teknik' ? 'flex' : 'none';
  document.querySelectorAll('#eg-level-seg button').forEach(b => {
    b.classList.toggle('on-gold', b.getAttribute('data-level') === egLevel);
  });
  const topics = egTopics();
  const cur = egCurTopic();
  // DÃ¼zenleme sadece admin: + Konu, kalem, + Video ekle
  const addTopicBtn = document.getElementById('eg-add-topic');
  if (addTopicBtn) addTopicBtn.style.display = canEdit ? '' : 'none';
  const topicEditBtn = document.getElementById('eg-topic-edit');
  if (topicEditBtn) topicEditBtn.style.display = canEdit ? '' : 'none';
  const addVidBtn = document.getElementById('eg-add-vid');
  if (addVidBtn) addVidBtn.style.display = canEdit ? '' : 'none';
  // ---- Sol: konular ----
  const listBox = document.getElementById('eg-list');
  listBox.innerHTML = '';
  topics.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'eg-item' + (cur && t.id === cur.id ? ' on' : '');
    // yukarÄ±/aÅŸaÄŸÄ± taÅŸÄ±ma (sadece admin, satÄ±rÄ±n en solunda)
    if (canEdit) {
      const up = document.createElement('button'); up.className = 'eg-item-move'; up.type = 'button'; up.textContent = 'â–²'; up.title = 'Konuyu yukarÄ± taÅŸÄ±';
      up.addEventListener('click', async (e) => { e.stopPropagation(); if (egMoveTopic(t, -1)) { await saveEgitim(); renderEgitim(); } });
      row.appendChild(up);
      const dn = document.createElement('button'); dn.className = 'eg-item-move'; dn.type = 'button'; dn.textContent = 'â–¼'; dn.title = 'Konuyu aÅŸaÄŸÄ± taÅŸÄ±';
      dn.addEventListener('click', async (e) => { e.stopPropagation(); if (egMoveTopic(t, 1)) { await saveEgitim(); renderEgitim(); } });
      row.appendChild(dn);
    }
    const idx = document.createElement('span'); idx.className = 'eg-item-idx'; idx.textContent = (i + 1);
    row.appendChild(idx);
    const tt = document.createElement('span'); tt.className = 'eg-item-t'; tt.textContent = t.title || '(baÅŸlÄ±ksÄ±z)';
    row.appendChild(tt);
    if (egSec === 'teknik' && t.level) {
      const lb = document.createElement('span'); lb.className = 'eg-level-badge ' + t.level; lb.textContent = t.level === 'temel' ? 'T' : t.level === 'orta' ? 'O' : 'Ä°'; lb.title = t.level === 'temel' ? 'Temel' : t.level === 'orta' ? 'Orta' : 'Ä°leri';
      row.appendChild(lb);
    }
    const total = (t.videos || []).length;
    const done = (t.videos || []).filter(v => v.done).length;
    const cnt = document.createElement('span');
    cnt.className = 'eg-count' + (total && done === total ? ' all' : (done ? ' done' : ''));
    cnt.textContent = (total && done === total) ? ('âœ“ ' + total) : (done + '/' + total);
    cnt.title = total + ' Ã¶ÄŸe, ' + done + ' tamamlandÄ±';
    row.appendChild(cnt);
    const edit = document.createElement('button'); edit.className = 'eg-item-edit'; edit.type = 'button';
    edit.textContent = 'âœ'; edit.title = 'Konu adÄ±nÄ± dÃ¼zenle';
    edit.addEventListener('click', (e) => { e.stopPropagation(); egOpenForm('topic-edit', { topicId: t.id }, { title: t.title, level: t.level }); });
    if (canEdit) row.appendChild(edit);
    const del = document.createElement('button'); del.className = 'eg-item-del'; del.type = 'button';
    del.textContent = 'Ã—'; del.title = 'Konuyu sil';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('â€œ' + (t.title || 'Bu konu') + 'â€ ve iÃ§indeki videolar silinsin mi?')) return;
      egitimData.sections[egSec] = egitimData.sections[egSec].filter(x => x.id !== t.id);
      if (egitimData.sel[egSec] === t.id) egitimData.sel[egSec] = null;
      await saveEgitim(); renderEgitim();
    });
    if (canEdit) row.appendChild(del);
    row.addEventListener('click', async () => {
      if (egitimData.sel[egSec] === t.id) return;
      egitimData.sel[egSec] = t.id; await saveEgitim(); renderEgitim();
    });
    listBox.appendChild(row);
  });
  document.getElementById('eg-empty').textContent = canEdit ? 'Bu bÃ¶lÃ¼mde konu yok. "+ Konu" ile ekle.' : 'Bu bÃ¶lÃ¼mde henÃ¼z konu yok.';
  document.getElementById('eg-empty').style.display = topics.length ? 'none' : 'block';
  // bÃ¶lÃ¼m ilerlemesi (izlenen / toplam)
  let secTot = 0, secDone = 0;
  topics.forEach(t => (t.videos || []).forEach(v => { secTot++; if (v.done) secDone++; }));
  document.getElementById('eg-progress').innerHTML = secTot ? ('Tamamlanan <b>' + secDone + '</b>/' + secTot) : '';
  // ---- SaÄŸ: oynatÄ±cÄ± ----
  const wrap = document.getElementById('eg-player-wrap');
  const empty = document.getElementById('eg-player-empty');
  if (!cur) { wrap.style.display = 'none'; empty.style.display = 'block'; return; }
  wrap.style.display = 'block'; empty.style.display = 'none';
  const vids = cur.videos || [];
  const curVid = egCurVid(cur);
  // embed
  const embed = document.getElementById('eg-embed');
  embed.innerHTML = '';
  const src = curVid ? egEmbedSrc(curVid) : '';
  if (src) {
    const ifr = document.createElement('iframe');
    ifr.src = src; ifr.title = (curVid.title || cur.title || 'video');
    ifr.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    ifr.setAttribute('allowfullscreen', '');
    embed.classList.toggle('eg-miro', egKind(curVid) === 'miro');
    embed.appendChild(ifr);
  } else {
    embed.classList.remove('eg-miro');
    const ph = document.createElement('div'); ph.className = 'eg-embed-ph';
    const txt = document.createElement('div'); txt.className = 'eg-ph-txt';
    txt.textContent = vids.length ? 'Bu videoya henÃ¼z YouTube baÄŸlantÄ±sÄ± eklenmedi.' : 'Bu konuda henÃ¼z video yok.';
    ph.appendChild(txt);
    if (canEdit) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn solid';
      if (vids.length && curVid) { btn.textContent = 'ï¼‹ BaÄŸlantÄ± ekle'; btn.addEventListener('click', () => egOpenForm('video-edit', { topicId: cur.id, vidId: curVid.id }, { title: curVid.title, url: curVid.url })); }
      else { btn.textContent = 'ï¼‹ Video ekle'; btn.addEventListener('click', () => egOpenForm('video-add', { topicId: cur.id }, null)); }
      ph.appendChild(btn);
    }
    embed.appendChild(ph);
  }
  // baÅŸlÄ±k = konu adÄ±
  document.getElementById('eg-now-title').textContent = cur.title || '(baÅŸlÄ±ksÄ±z)';
  const link = document.getElementById('eg-now-link');
  if (curVid && src) { link.style.display = ''; link.href = egWatchHref(curVid); link.textContent = egKind(curVid) === 'miro' ? "Panoyu Miro'da aÃ§ â†—" : (egKind(curVid) === 'playlist' ? "Oynatma listesini YouTube'da aÃ§ â†—" : "YouTube'da aÃ§ â†—"); }
  else { link.style.display = 'none'; }
  // Ä°zledim butonu (mevcut video)
  const doneBtn = document.getElementById('eg-done');
  if (curVid) {
    doneBtn.style.display = '';
    doneBtn.classList.toggle('on', !!curVid.done);
    const isMiro = egKind(curVid) === 'miro';
    document.getElementById('eg-done-txt').textContent = curVid.done ? (isMiro ? 'âœ“ Ã‡alÄ±ÅŸÄ±ldÄ±' : 'âœ“ Ä°zlendi') : (isMiro ? 'Ã‡alÄ±ÅŸtÄ±m' : 'Ä°zledim');
  } else { doneBtn.style.display = 'none'; }
  // videolar alt-listesi
  const vlist = document.getElementById('eg-vid-list');
  vlist.innerHTML = '';
  if (!vids.length) {
    const e = document.createElement('div'); e.className = 'eg-vid-empty'; e.textContent = 'HenÃ¼z video yok â€” â€œ+ Video ekleâ€ ile baÄŸla.';
    vlist.appendChild(e);
  }
  vids.forEach((v, i) => {
    const kind = egKind(v);
    const row = document.createElement('div');
    row.className = 'eg-vid-row' + (curVid && v.id === curVid.id ? ' on' : '') + (v.done ? ' done' : '');
    const chk = document.createElement('button'); chk.className = 'eg-check' + (v.done ? ' on' : ''); chk.type = 'button';
    chk.textContent = 'âœ“'; chk.title = v.done ? (kind === 'miro' ? 'Ã‡alÄ±ÅŸÄ±ldÄ± â€” geri al' : 'Ä°zlendi â€” geri al') : (kind === 'miro' ? 'Ã‡alÄ±ÅŸÄ±ldÄ± olarak iÅŸaretle' : 'Ä°zlendi olarak iÅŸaretle');
    chk.addEventListener('click', async (e) => { e.stopPropagation(); v.done = !v.done; await saveEgitim(); renderEgitim(); });
    const idx = document.createElement('span'); idx.className = 'eg-vid-idx'; idx.textContent = (i + 1);
    row.appendChild(idx);
    const t = document.createElement('span'); t.className = 'eg-vid-t'; t.textContent = v.title || '(baÅŸlÄ±ksÄ±z)';
    row.appendChild(t);
    if (kind === 'playlist') { const tag = document.createElement('span'); tag.className = 'eg-item-tag'; tag.textContent = 'Liste'; row.appendChild(tag); }
    else if (kind === 'miro') { const tag = document.createElement('span'); tag.className = 'eg-item-tag'; tag.textContent = 'Pano'; row.appendChild(tag); }
    else if (kind === 'invalid') { const tag = document.createElement('span'); tag.className = 'eg-item-tag muted'; tag.textContent = 'Link yok'; row.appendChild(tag); }
    // yukarÄ±/aÅŸaÄŸÄ± taÅŸÄ±ma (sadece admin)
    const up = document.createElement('button'); up.className = 'eg-vid-move'; up.type = 'button'; up.textContent = 'â–²'; up.title = 'YukarÄ± taÅŸÄ±';
    up.addEventListener('click', async (e) => { e.stopPropagation(); if (i === 0) return; [cur.videos[i - 1], cur.videos[i]] = [cur.videos[i], cur.videos[i - 1]]; await saveEgitim(); renderEgitim(); });
    const dn = document.createElement('button'); dn.className = 'eg-vid-move'; dn.type = 'button'; dn.textContent = 'â–¼'; dn.title = 'AÅŸaÄŸÄ± taÅŸÄ±';
    dn.addEventListener('click', async (e) => { e.stopPropagation(); if (i === vids.length - 1) return; [cur.videos[i], cur.videos[i + 1]] = [cur.videos[i + 1], cur.videos[i]]; await saveEgitim(); renderEgitim(); });
    const edit = document.createElement('button'); edit.className = 'eg-vid-edit'; edit.type = 'button'; edit.textContent = 'âœ'; edit.title = 'Videoyu dÃ¼zenle';
    edit.addEventListener('click', (e) => { e.stopPropagation(); egOpenForm('video-edit', { topicId: cur.id, vidId: v.id }, { title: v.title, url: v.url }); });
    const del = document.createElement('button'); del.className = 'eg-vid-del'; del.type = 'button'; del.textContent = 'Ã—'; del.title = 'Videoyu sil';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      cur.videos = cur.videos.filter(x => x.id !== v.id);
      if (egitimData.selVid[cur.id] === v.id) egitimData.selVid[cur.id] = null;
      await saveEgitim(); renderEgitim();
    });
    if (canEdit) {
      row.appendChild(up); row.appendChild(dn); row.appendChild(edit); row.appendChild(del);
    }
    // izlendi iÅŸareti en saÄŸda
    row.appendChild(chk);
    row.addEventListener('click', async () => {
      if (egitimData.selVid[cur.id] === v.id) return;
      egitimData.selVid[cur.id] = v.id; await saveEgitim(); renderEgitim();
    });
    vlist.appendChild(row);
  });
  // not (konu bazlÄ±)
  document.getElementById('eg-notes').value = cur.note || '';
}

function egOpenForm(mode, ids, prefill) {
  if (!magIsAdmin()) return;
  const g = id => document.getElementById(id);
  egForm = { mode: mode, topicId: (ids && ids.topicId) || null, vidId: (ids && ids.vidId) || null };
  const isVideo = (mode === 'video-add' || mode === 'video-edit');
  const isSec = (mode === 'sec-add');
  g('eg-in-title').value = (prefill && prefill.title) || '';
  g('eg-in-url').value = (prefill && prefill.url) || '';
  g('eg-in-url').style.display = isVideo ? '' : 'none';
  g('eg-in-err').textContent = '';
  const titles = { 'topic-add': 'Yeni konu', 'topic-edit': 'Konu adÄ±nÄ± dÃ¼zenle', 'video-add': 'Video ekle', 'video-edit': 'Videoyu dÃ¼zenle', 'sec-add': 'Yeni bÃ¶lÃ¼m' };
  g('eg-form-title').textContent = titles[mode] || 'DÃ¼zenle';
  g('eg-in-title').setAttribute('placeholder', isVideo ? 'Video baÅŸlÄ±ÄŸÄ± (Ã¶r. Market YapÄ±sÄ± -1)' : isSec ? 'BÃ¶lÃ¼m baÅŸlÄ±ÄŸÄ± (Ã¶r. Onchain Analizi)' : 'Konu baÅŸlÄ±ÄŸÄ± (Ã¶r. Market YapÄ±sÄ±)');
  // Seviye seÃ§ici (sadece teknik bÃ¶lÃ¼mÃ¼nde konu ekleme/dÃ¼zenleme)
  const lp = g('eg-level-picker');
  const isTopicMode = (mode === 'topic-add' || mode === 'topic-edit');
  if (lp) {
    lp.style.display = (egSec === 'teknik' && isTopicMode) ? 'block' : 'none';
    if (egSec === 'teknik' && isTopicMode) {
      const curLevel = (prefill && prefill.level) || egLevel || 'temel';
      lp.querySelectorAll('[data-lv]').forEach(b => b.classList.toggle('on-gold', b.getAttribute('data-lv') === curLevel));
    }
  }
  g('eg-add-form').classList.remove('hidden');
  g('eg-in-title').focus();
}
function egCloseForm() { egForm = { mode: null, topicId: null, vidId: null }; document.getElementById('eg-add-form').classList.add('hidden'); }

function panoRoomId() {
  const el = document.getElementById('pano-room');
  const r = (el ? el.value : 'alfa').trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return r || 'alfa';
}

// â”€â”€ Pano motoru (canvas) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PANO_KEY = 'alfa-pano-canvas-v1';
let panoInited = false;
let panoTool = 'select';
let panoColor = '#e11d48';
let panoSize = 5;
let panoObjs = [];
let panoView = { x: 0, y: 0, z: 1 };
let panoDrag = null;
let panoSel = null;
let panoSelMany = [];
let panoMarquee = null;
let panoLoadedRoom = null;
let panoSaveT = null;
let panoStatusT = null;
let panoPendingSave = false;
let panoInteracting = false;
let panoUndo = [];
let panoRedo = [];
let panoLastTextPt = { x: 0, y: 0 };
let panoFill = false;
let panoClip = null;
let panoRectCache = null;
let panoRaf = 0;

function panoScheduleDraw() {
  if (panoRaf) return;
  panoRaf = requestAnimationFrame(() => { panoRaf = 0; panoDraw(); });
}

function panoUid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }

const panoImgCache = new Map();
function panoGetImage(o) {
  let im = panoImgCache.get(o.src);
  if (!im) { im = new Image(); im.onload = () => panoScheduleDraw(); im.src = o.src; panoImgCache.set(o.src, im); }
  return im;
}
function panoInsertImageURL(url) {
  const im = new Image();
  im.onload = () => {
    panoImgCache.set(url, im);
    const c = panoCanvas();
    if (!c) return;
    const maxW = 560, maxH = 420;
    let w = im.naturalWidth, h = im.naturalHeight;
    const k = Math.min(1, maxW / w, maxH / h);
    w = Math.max(40, Math.round(w * k));
    h = Math.max(30, Math.round(h * k));
    const cx = (c.clientWidth / 2 - panoView.x) / panoView.z;
    const cy = (c.clientHeight / 2 - panoView.y) / panoView.z;
    const o = { id: panoUid(), type: 'image', x: cx - w / 2, y: cy - h / 2, w, h, src: url };
    panoRemember();
    panoObjs.push(o);
    panoSel = panoObjs.length - 1;
    panoCommit();
  };
  im.src = url;
}

function panoCanvas() { return document.getElementById('pano-canvas'); }
function panoCtx() { const c = panoCanvas(); return c ? c.getContext('2d') : null; }

function panoZoomLbl() { const l = document.getElementById('pano-zoom-lbl'); if (l) l.textContent = Math.round(panoView.z * 100) + '%'; }

function panoResetView() {
  panoView = { x: 0, y: 0, z: 1 };
  panoZoomLbl();
  panoDraw();
}

function panoFitView() {
  if (!panoObjs.length) { panoResetView(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  panoObjs.forEach(o => {
    const b = panoBounds(o);
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
  });
  const c = panoCanvas();
  if (!c) return;
  const cw = c.clientWidth, ch = c.clientHeight;
  const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
  const z = Math.min(1, Math.max(0.2, Math.min(cw / bw, ch / bh) * 0.9));
  panoView = { x: cw / 2 - (minX + bw / 2) * z, y: ch / 2 - (minY + bh / 2) * z, z };
  panoZoomLbl();
  panoDraw();
}

function panoBounds(o) {
  if (o.type === 'pen') {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    (o.points || []).forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
    if (!isFinite(minX)) return { x: o.x || 0, y: o.y || 0, w: 1, h: 1 };
    return { x: minX, y: minY, w: maxX - minX || 1, h: maxY - minY || 1 };
  }
  if (o.type === 'line') return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1) || 1, h: Math.abs(o.y2 - o.y1) || 1 };
  if (o.type === 'text') {
    const ctx = panoCtx();
    const f = (o.size || 5) * 4;
    ctx.save(); ctx.font = f + 'px Inter, sans-serif';
    const w = ctx.measureText(o.text || '').width;
    const lines = (o.text || '').split('\n');
    ctx.restore();
    let mw = 0; lines.forEach(l => { const c2 = panoCtx(); c2.save(); c2.font = f + 'px Inter, sans-serif'; mw = Math.max(mw, c2.measureText(l).width); c2.restore(); });
    return { x: o.x, y: o.y, w: mw || 10, h: lines.length * f * 1.3 };
  }
  return { x: o.x || 0, y: o.y || 0, w: o.w || 1, h: o.h || 1 };
}

function panoHitTest(pt) {
  for (let i = panoObjs.length - 1; i >= 0; i--) {
    const o = panoObjs[i];
    const b = panoBounds(o);
    const pad = Math.max(4, (o.size || 2) / panoView.z);
    if (pt.x >= b.x - pad && pt.x <= b.x + b.w + pad && pt.y >= b.y - pad && pt.y <= b.y + b.h + pad) return i;
  }
  return -1;
}

function panoDraw() {
  const c = panoCanvas(), ctx = panoCtx();
  if (!c || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = c.clientWidth, ch = c.clientHeight;
  if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  ctx.translate(panoView.x, panoView.y);
  ctx.scale(panoView.z, panoView.z);

  panoObjs.forEach((o, idx) => {
    if (o.type === 'pen') {
      ctx.strokeStyle = o.color || '#111';
      ctx.lineWidth = (o.size || 2);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      (o.points || []).forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();
    } else if (o.type === 'line') {
      ctx.strokeStyle = o.color || '#111';
      ctx.lineWidth = o.size || 2;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
    } else if (o.type === 'rect') {
      ctx.strokeStyle = o.color || '#111';
      ctx.lineWidth = o.size || 2;
      if (o.fill) { const fx = Math.min(o.x, o.x + o.w), fy = Math.min(o.y, o.y + o.h), fw = Math.abs(o.w), fh = Math.abs(o.h); ctx.fillStyle = o.color || '#111'; ctx.globalAlpha = 0.16; ctx.fillRect(fx, fy, fw, fh); ctx.globalAlpha = 1; }
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    } else if (o.type === 'ellipse') {
      ctx.strokeStyle = o.color || '#111';
      ctx.lineWidth = o.size || 2;
      ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.abs(o.w / 2), Math.abs(o.h / 2), 0, 0, Math.PI * 2);
      if (o.fill) { ctx.fillStyle = o.color || '#111'; ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.stroke();
    } else if (o.type === 'image') {
      const im = panoGetImage(o);
      if (im && im.complete && im.naturalWidth) ctx.drawImage(im, o.x, o.y, o.w, o.h);
    } else if (o.type === 'text') {
      ctx.fillStyle = o.color || '#111';
      ctx.font = ((o.size || 5) * 4) + 'px Inter, sans-serif';
      ctx.textBaseline = 'top';
      let ly = o.y;
      (o.text || '').split('\n').forEach(l => { ctx.fillText(l, o.x, ly); ly += (o.size || 5) * 4 * 1.3; });
    }
    if (idx === panoSel || (panoSelMany && panoSelMany.indexOf(idx) !== -1)) {
      const b = panoBounds(o);
      ctx.save();
      ctx.strokeStyle = '#7b78f5'; ctx.lineWidth = 1.2 / panoView.z; ctx.setLineDash([4 / panoView.z, 3 / panoView.z]);
      ctx.strokeRect(b.x - 3 / panoView.z, b.y - 3 / panoView.z, b.w + 6 / panoView.z, b.h + 6 / panoView.z);
      ctx.restore();
      if ((o.type === 'image' || o.type === 'rect' || o.type === 'ellipse' || o.type === 'text') && idx === panoSel) {
        const hs = 5 / panoView.z;
        ctx.save();
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#7b78f5'; ctx.lineWidth = 1.4 / panoView.z;
        ctx.fillRect(b.x + b.w - hs, b.y + b.h - hs, hs * 2, hs * 2);
        ctx.strokeRect(b.x + b.w - hs, b.y + b.h - hs, hs * 2, hs * 2);
        ctx.restore();
      }
    }
  });
  if (panoMarquee) {
    const mx = Math.min(panoMarquee.x0, panoMarquee.x1);
    const my = Math.min(panoMarquee.y0, panoMarquee.y1);
    const mw = Math.abs(panoMarquee.x1 - panoMarquee.x0);
    const mh = Math.abs(panoMarquee.y1 - panoMarquee.y0);
    ctx.save();
    ctx.fillStyle = 'rgba(123,120,245,0.10)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#7b78f5';
    ctx.lineWidth = 1.2 / panoView.z;
    ctx.setLineDash([4 / panoView.z, 3 / panoView.z]);
    ctx.strokeRect(mx, my, mw, mh);
    ctx.restore();
  }
  ctx.restore();
}

function panoScreenToWorld(e) {
  const c = panoCanvas();
  const r = panoRectCache || c.getBoundingClientRect();
  return { x: (e.clientX - r.left - panoView.x) / panoView.z, y: (e.clientY - r.top - panoView.y) / panoView.z };
}

function panoWorldToScreen(pt) {
  return { x: panoView.x + pt.x * panoView.z, y: panoView.y + pt.y * panoView.z };
}

function panoRefreshRect() {
  const c = panoCanvas();
  if (c) panoRectCache = c.getBoundingClientRect();
}

function panoClampToolbar() {
  const hdr = document.getElementById('pano-hdr');
  const wrap = document.getElementById('pano-canvas-wrap');
  if (!hdr || !wrap || hdr.style.left === '') return;
  const hr = hdr.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  if (wr.width < 10 || wr.height < 10) return;
  let l = parseInt(hdr.style.left, 10) || 10;
  let t = parseInt(hdr.style.top, 10) || 10;
  l = Math.max(6, Math.min(l, wr.width - hr.width - 6));
  t = Math.max(6, Math.min(t, wr.height - hr.height - 6));
  hdr.style.left = l + 'px'; hdr.style.top = t + 'px'; hdr.style.right = 'auto';
}

function panoRemember() {
  panoUndo.push(JSON.parse(JSON.stringify(panoObjs)));
  if (panoUndo.length > 100) panoUndo.shift();
  panoRedo = [];
}

function panoCommit() {
  panoDraw();
  panoScheduleSave();
}

function panoScheduleSave() {
  panoPendingSave = true;
  clearTimeout(panoSaveT);
  panoSaveT = setTimeout(panoSave, 700);
}

async function panoSave() {
  const r = panoRoomId();
  try { localStorage.setItem(PANO_KEY + ':' + r, JSON.stringify(panoObjs)); } catch (e) {}
  const st = document.getElementById('pano-save-status');
  try {
    const res = await fetch('/api/contrib?store=pano&room=' + encodeURIComponent(r), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: panoObjs }),
    });
    const d = await res.json();
    if (st) { st.textContent = (d && d.ok) ? 'kaydedildi âœ“' : 'yerel kaydedildi'; st.classList.add('show'); }
  } catch (e) {
    if (st) { st.textContent = 'yerel kaydedildi'; st.classList.add('show'); }
  }
  panoPendingSave = false;
  if (st) { clearTimeout(panoStatusT); panoStatusT = setTimeout(() => st.classList.remove('show'), 1600); }
}

async function panoPoll() {
  if (panoPendingSave || panoInteracting) return;
  if (!document.body || document.body.dataset.page !== 'pano') return;
  const r = panoRoomId();
  try {
    const res = await fetch('/api/contrib?store=pano&room=' + encodeURIComponent(r), { cache: 'no-store' });
    const d = await res.json();
    if (panoPendingSave || panoInteracting) return;
    if (!d || !d.ok || !Array.isArray(d.data)) return;
    if (JSON.stringify(panoObjs) === JSON.stringify(d.data)) return;
    panoObjs = d.data;
    panoLoadedRoom = r;
    panoSel = null; panoSelMany = []; panoMarquee = null;
    panoDraw();
    try { localStorage.setItem(PANO_KEY + ':' + r, JSON.stringify(panoObjs)); } catch (e) {}
  } catch (e) {}
}

async function panoLoadBoard() {
  const r = panoRoomId();
  try { localStorage.setItem('alfa-pano-room', r); } catch (e) {}
  try {
    const local = JSON.parse(localStorage.getItem(PANO_KEY + ':' + r) || 'null');
    if (Array.isArray(local)) { panoObjs = local; panoDraw(); }
  } catch (e) {}
  try {
    const res = await fetch('/api/contrib?store=pano&room=' + encodeURIComponent(r), { cache: 'no-store' });
    const d = await res.json();
    if (d && d.ok && Array.isArray(d.data) && d.data.length) {
      panoObjs = d.data;
      panoLoadedRoom = r;
      panoDraw();
      try { localStorage.setItem(PANO_KEY + ':' + r, JSON.stringify(panoObjs)); } catch (e) {}
    }
  } catch (e) {}
}

function panoInit() {
  if (panoInited) return;
  panoInited = true;
  const c = panoCanvas();
  if (!c) return;

  const resize = () => { panoRefreshRect(); panoDraw(); panoClampToolbar(); };
  if (window.ResizeObserver) new ResizeObserver(resize).observe(c);
  window.addEventListener('resize', resize);

  // sÃ¼rÃ¼klenebilir araÃ§ Ã§ubuÄŸu (TradingView tarzÄ±)
  const hdr = document.getElementById('pano-hdr');
  const dragH = document.getElementById('pano-drag');
  if (hdr && dragH) {
    try {
      const p = JSON.parse(localStorage.getItem('alfa-pano-toolbar') || 'null');
      if (p && typeof p.top === 'number' && typeof p.left === 'number') { hdr.style.left = p.left + 'px'; hdr.style.top = p.top + 'px'; hdr.style.right = 'auto'; }
    } catch (e) {}
    dragH.addEventListener('pointerdown', e => {
      e.preventDefault();
      dragH.setPointerCapture(e.pointerId);
      const hr = hdr.getBoundingClientRect();
      const wr = c.parentElement.getBoundingClientRect();
      const ox = e.clientX - hr.left, oy = e.clientY - hr.top;
      const move = ev => {
        let nx = ev.clientX - wr.left - ox;
        let ny = ev.clientY - wr.top - oy;
        nx = Math.max(6, Math.min(nx, wr.width - hr.width - 6));
        ny = Math.max(6, Math.min(ny, wr.height - hr.height - 6));
        hdr.style.left = nx + 'px'; hdr.style.top = ny + 'px'; hdr.style.right = 'auto';
      };
      const up = () => {
        dragH.removeEventListener('pointermove', move);
        dragH.removeEventListener('pointerup', up);
        try { localStorage.setItem('alfa-pano-toolbar', JSON.stringify({ left: parseInt(hdr.style.left, 10) || 10, top: parseInt(hdr.style.top, 10) || 10 })); } catch (e) {}
      };
      dragH.addEventListener('pointermove', move);
      dragH.addEventListener('pointerup', up);
    });
  }

  // araÃ§ Ã§ubuÄŸu
  document.querySelectorAll('#pano-tools .pt').forEach(b => {
    b.addEventListener('click', () => {
      panoTool = b.dataset.tool;
      document.querySelectorAll('#pano-tools .pt').forEach(x => x.classList.toggle('active', x === b));
      c.dataset.tool = panoTool;
      if (panoTool !== 'text') panoCloseEditor();
    });
  });
  const col = document.getElementById('pano-color');
  if (col) col.addEventListener('input', () => { panoColor = col.value; });
  const sz = document.getElementById('pano-size');
  if (sz) sz.addEventListener('change', () => { panoSize = Number(sz.value); });

  // zoom kontrolleri
  const zin = document.getElementById('pano-zin');
  if (zin) zin.addEventListener('click', () => { const c2 = panoCanvas(); panoView.z = Math.min(6, panoView.z * 1.25); panoView.x = c2.clientWidth / 2 - (c2.clientWidth / 2 - panoView.x) * 1.25; panoView.y = c2.clientHeight / 2 - (c2.clientHeight / 2 - panoView.y) * 1.25; panoZoomLbl(); panoDraw(); });
  const zout = document.getElementById('pano-zout');
  if (zout) zout.addEventListener('click', () => { const c2 = panoCanvas(); panoView.z = Math.max(0.15, panoView.z / 1.25); panoView.x = c2.clientWidth / 2 - (c2.clientWidth / 2 - panoView.x) / 1.25; panoView.y = c2.clientHeight / 2 - (c2.clientHeight / 2 - panoView.y) / 1.25; panoZoomLbl(); panoDraw(); });
  const zf = document.getElementById('pano-zfit');
  if (zf) zf.addEventListener('click', panoFitView);
  const cl = document.getElementById('pano-clear');
  if (cl) cl.addEventListener('click', () => { if (panoObjs.length && confirm('Panoyu temizle?')) { panoRemember(); panoObjs = []; panoSel = null; panoCommit(); } });

  // ekstra araÃ§lar
  const bu = id => document.getElementById(id);
  const undoBtn = bu('pano-undo');
  if (undoBtn) undoBtn.addEventListener('click', panoUndoDo);
  const redoBtn = bu('pano-redo');
  if (redoBtn) redoBtn.addEventListener('click', panoRedoDo);
  const dupBtn = bu('pano-dup');
  if (dupBtn) dupBtn.addEventListener('click', panoDuplicateSel);
  const delBtn = bu('pano-del');
  if (delBtn) delBtn.addEventListener('click', panoDeleteSel);
  const fillBtn = bu('pano-fill');
  if (fillBtn) fillBtn.addEventListener('click', () => { panoFill = !panoFill; fillBtn.classList.toggle('active', panoFill); });
  const imgBtn = bu('pano-img');
  if (imgBtn) {
    const fIn = document.createElement('input');
    fIn.type = 'file';
    fIn.accept = 'image/*';
    fIn.multiple = true;
    fIn.style.display = 'none';
    c.parentElement.appendChild(fIn);
    imgBtn.addEventListener('click', () => fIn.click());
    fIn.addEventListener('change', () => {
      for (const f of Array.from(fIn.files || [])) {
        if (f.type && f.type.indexOf('image') === 0) {
          const rd = new FileReader();
          rd.onload = () => panoInsertImageURL(rd.result);
          rd.readAsDataURL(f);
        }
      }
      fIn.value = '';
    });
  }
  const fsBtn = bu('pano-fs');
  if (fsBtn) fsBtn.addEventListener('click', () => {
    const w = document.getElementById('pano-canvas-wrap');
    if (!w) return;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); }
    else { w.requestFullscreen().catch(() => {}); }
  });

  c.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = c.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nz = Math.min(6, Math.max(0.15, panoView.z * factor));
    const k = nz / panoView.z;
    panoView.x = mx - (mx - panoView.x) * k;
    panoView.y = my - (my - panoView.y) * k;
    panoView.z = nz;
    panoZoomLbl();
    panoDraw();
  }, { passive: false });

  // metin editÃ¶rÃ¼
  const editor = document.createElement('div');
  editor.className = 'pano-editor';
  editor.contentEditable = true;
  editor.style.display = 'none';
  editor.addEventListener('mousedown', e => e.stopPropagation());
  c.parentElement.appendChild(editor);
  window.panoEditor = editor;

  // klavye kÄ±sayollarÄ±
  c.addEventListener('keydown', e => {
    if (e.key === 'v') { panoSetTool('select'); return; }
    if (e.key === 'p') { panoSetTool('pen'); return; }
    if (e.key === 'l') { panoSetTool('line'); return; }
    if (e.key === 'r') { panoSetTool('rect'); return; }
    if (e.key === 'o') { panoSetTool('ellipse'); return; }
    if (e.key === 't') { panoSetTool('text'); return; }
    if (e.key === 'e') { panoSetTool('eraser'); return; }
    if (e.key === 'h') { panoSetTool('hand'); return; }
    if (e.key === 'f') { panoFill = !panoFill; const fb = document.getElementById('pano-fill'); if (fb) fb.classList.toggle('active', panoFill); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); panoUndoDo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); panoRedoDo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); panoDuplicateSel(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); panoCopySel(); return; }
    if (e.key.startsWith('Arrow') && panoSel != null && !panoEditorEditable()) {
      e.preventDefault();
      const o = panoObjs[panoSel];
      const d = e.shiftKey ? 20 : 5;
      const dx = e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0;
      const dy = e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0;
      if (o.type === 'pen') o.points = o.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      else if (o.type === 'line') { o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy; }
      else { o.x += dx; o.y += dy; }
      panoCommit();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { if ((panoSel != null || panoSelMany.length) && !panoEditorEditable()) { e.preventDefault(); panoDeleteSel(); } }
  });
  c.tabIndex = 0;

  // gÃ¶rsel yapÄ±ÅŸtÄ±r (Ctrl+V clipboard gÃ¶rseli) ve sÃ¼rÃ¼kle-bÄ±rak
  c.addEventListener('paste', e => {
    const items = e.clipboardData && e.clipboardData.items;
    let imgFile = null;
    if (items) for (const it of items) { if (it.kind === 'file' && it.type && it.type.indexOf('image') === 0) { imgFile = it.getAsFile(); break; } }
    if (imgFile) {
      e.preventDefault();
      const rd = new FileReader();
      rd.onload = () => panoInsertImageURL(rd.result);
      rd.readAsDataURL(imgFile);
    } else if (panoClip) {
      panoPasteSel();
    }
  });
  c.addEventListener('dragover', e => { e.preventDefault(); });
  c.addEventListener('drop', e => {
    e.preventDefault();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    for (const f of files) {
      if (f.type && f.type.indexOf('image') === 0) {
        const rd = new FileReader();
        rd.onload = () => panoInsertImageURL(rd.result);
        rd.readAsDataURL(f);
      }
    }
  });

  // pointer olaylarÄ±
  let spaceDown = false;
  window.addEventListener('keydown', e => {
    if (e.code !== 'Space' || document.body.dataset.page !== 'pano') return;
    const ae = document.activeElement;
    if (ae && (ae.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) return;
    if (panoEditorEditable()) return;
    spaceDown = true; e.preventDefault(); c.dataset.space = '1';
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; c.dataset.space = ''; } });

  let down = false, moved = false, startPt = null, startView = null, dragSelIdx = -1, dragSelStart = null, drawObj = null, eraseLast = null, resizeSelIdx = -1, resizeStart = null, resizeStartRect = null;

  function panoEditorEditable() { const ed = window.panoEditor; return ed && ed.style.display !== 'none' && document.activeElement === ed; }

  c.addEventListener('pointerdown', e => {
    e.preventDefault();
    c.focus();
    if (window.panoEditor && window.panoEditor.style.display !== 'none') return;
    try { c.setPointerCapture(e.pointerId); } catch (err) {}
    panoRefreshRect();
    down = true; moved = false; panoInteracting = true;
    startPt = panoScreenToWorld(e);
    const useHand = panoTool === 'hand' || spaceDown || e.button === 1;
    if (useHand) {
      startView = { x: panoView.x, y: panoView.y, cx: e.clientX, cy: e.clientY };
      c.classList.add('panning');
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      panoSel = null; panoSelMany = [];
      panoMarquee = { x0: startPt.x, y0: startPt.y, x1: startPt.x, y1: startPt.y };
      panoDraw();
      return;
    }
    if (panoTool === 'select') {
      const idx = panoHitTest(startPt);
      if (idx >= 0) {
        panoSel = idx;
        panoSelMany = [];
        if (o.type === 'image' || o.type === 'rect' || o.type === 'ellipse' || o.type === 'text') {
          const b = panoBounds(o);
          const hs = 8 / panoView.z;
          if (startPt.x >= b.x + b.w - hs && startPt.x <= b.x + b.w + hs && startPt.y >= b.y + b.h - hs && startPt.y <= b.y + b.h + hs) {
            resizeSelIdx = idx; resizeStart = { x: startPt.x, y: startPt.y };
            resizeStartRect = { x: b.x, y: b.y, w: b.w, h: b.h, size: o.size };
            panoRemember();
            panoDraw();
            return;
          }
        }
        dragSelIdx = idx; dragSelStart = { x: startPt.x, y: startPt.y }; panoRemember(); panoDraw();
      }
      else { panoSel = null; panoSelMany = []; panoDraw(); }
      return;
    }
    if (panoTool === 'eraser') {
      const idx = panoHitTest(startPt);
      if (idx >= 0) { panoRemember(); panoObjs.splice(idx, 1); panoSel = null; panoCommit(); }
      eraseLast = startPt;
      return;
    }
    if (panoTool === 'pen') {
      drawObj = { id: panoUid(), type: 'pen', points: [{ x: startPt.x, y: startPt.y }], color: panoColor, size: panoSize };
      panoRemember();
      panoObjs.push(drawObj);
      panoSel = null;
      panoDraw();
      return;
    }
    if (panoTool === 'text') {
      panoOpenTextEditor(startPt);
      return;
    }
    // ÅŸekiller
    drawObj = { id: panoUid(), type: panoTool, color: panoColor, size: panoSize, fill: panoFill, x: startPt.x, y: startPt.y, w: 0, h: 0 };
    if (panoTool === 'line') { drawObj.x1 = startPt.x; drawObj.y1 = startPt.y; drawObj.x2 = startPt.x; drawObj.y2 = startPt.y; }
    panoRemember();
    panoObjs.push(drawObj);
    panoSel = null;
    panoDraw();
  });

  c.addEventListener('pointermove', e => {
    if (!down) return;
    e.preventDefault();
    const pt = panoScreenToWorld(e);
    const dist = Math.hypot(pt.x - startPt.x, pt.y - startPt.y);
    if (dist > 2) moved = true;
    if (panoMarquee) {
      panoMarquee.x1 = pt.x; panoMarquee.y1 = pt.y;
      const bx = Math.min(panoMarquee.x0, panoMarquee.x1);
      const by = Math.min(panoMarquee.y0, panoMarquee.y1);
      const bw = Math.abs(panoMarquee.x1 - panoMarquee.x0);
      const bh = Math.abs(panoMarquee.y1 - panoMarquee.y0);
      panoSelMany = [];
      panoObjs.forEach((o, i) => {
        const b = panoBounds(o);
        if (b.x >= bx && b.x + b.w <= bx + bw && b.y >= by && b.y + b.h <= by + bh) panoSelMany.push(i);
      });
      panoScheduleDraw();
      return;
    }
    if (c.classList.contains('panning') && startView) {
      panoView.x = startView.x + (e.clientX - startView.cx);
      panoView.y = startView.y + (e.clientY - startView.cy);
      panoScheduleDraw();
      return;
    }
    if (resizeSelIdx >= 0 && resizeStart && resizeStartRect) {
      const o = panoObjs[resizeSelIdx];
      const dx = pt.x - resizeStart.x, dy = pt.y - resizeStart.y;
      if (o.type === 'image') {
        const nw = resizeStartRect.w + dx;
        if (nw >= 24) { o.w = nw; o.h = resizeStartRect.h * (nw / resizeStartRect.w); }
      } else if (o.type === 'rect' || o.type === 'ellipse') {
        o.w = Math.max(4, resizeStartRect.w + dx);
        o.h = Math.max(4, resizeStartRect.h + dy);
      } else if (o.type === 'text') {
        const k = Math.max(0.5, Math.min(8, (resizeStartRect.w + dx) / Math.max(1, resizeStartRect.w)));
        o.size = Math.max(0.5, (resizeStartRect.size || 5) * k);
      }
      panoScheduleDraw();
      return;
    }
    if (dragSelIdx >= 0) {
      const dx = pt.x - startPt.x, dy = pt.y - startPt.y;
      const o = panoObjs[dragSelIdx];
      if (o.type === 'pen') o.points = o.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      else if (o.type === 'line') { o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy; }
      else { o.x += dx; o.y += dy; }
      startPt = pt;
      panoScheduleDraw();
      return;
    }
    if (drawObj) {
      if (drawObj.type === 'pen') { drawObj.points.push({ x: pt.x, y: pt.y }); }
      else if (drawObj.type === 'line') { drawObj.x2 = pt.x; drawObj.y2 = pt.y; }
      else { drawObj.w = pt.x - drawObj.x; drawObj.h = pt.y - drawObj.y; }
      panoScheduleDraw();
      return;
    }
    if (panoTool === 'eraser' && eraseLast) {
      const idx = panoHitTest(pt);
      if (idx >= 0) { panoRemember(); panoObjs.splice(idx, 1); panoSel = null; panoCommit(); }
    }
  });

  const finish = (e) => {
    if (!down) return;
    down = false;
    panoInteracting = false;
    c.classList.remove('panning');
    if (panoMarquee) { panoMarquee = null; panoDraw(); }
    const wasMove = moved;
    const wasDraw = !!drawObj;
    if (wasDraw) {
      // kÃ¼Ã§Ã¼k ÅŸekil ise yine de bÄ±rak
      if (drawObj.type !== 'pen') {
        if (Math.abs(drawObj.w) < 3 && Math.abs(drawObj.h) < 3) {
          const i = panoObjs.indexOf(drawObj);
          if (i >= 0) panoObjs.splice(i, 1);
        } else {
          if (drawObj.w < 0) { drawObj.x += drawObj.w; drawObj.w = -drawObj.w; }
          if (drawObj.h < 0) { drawObj.y += drawObj.h; drawObj.h = -drawObj.h; }
          panoSel = panoObjs.indexOf(drawObj);
        }
      }
      panoCommit();
    } else if (resizeSelIdx >= 0) {
      panoCommit();
    } else if (dragSelIdx >= 0 && wasMove) {
      panoCommit();
    }
    drawObj = null; dragSelIdx = -1; eraseLast = null; resizeSelIdx = -1; resizeStart = null; resizeStartRect = null;
  };
  c.addEventListener('pointerup', finish);
  c.addEventListener('pointercancel', finish);
  c.addEventListener('pointerleave', () => { if (c.classList.contains('panning')) finish({}); });

  setInterval(panoPoll, 2500);
}

function panoSetTool(t) {
  panoTool = t;
  document.querySelectorAll('#pano-tools .pt').forEach(x => x.classList.toggle('active', x.dataset.tool === t));
  const c = panoCanvas();
  if (c) { c.dataset.tool = t; }
  if (t !== 'text') panoCloseEditor();
}

function panoDeleteSel() {
  if (panoSelMany.length) {
    panoRemember();
    const s = new Set(panoSelMany);
    panoObjs = panoObjs.filter((o, i) => !s.has(i));
    panoSel = null; panoSelMany = [];
    panoCommit();
    return;
  }
  if (panoSel == null) return;
  panoRemember();
  panoObjs.splice(panoSel, 1);
  panoSel = null;
  panoCommit();
}

function panoDuplicateSel() {
  if (panoSel == null) return;
  const o = JSON.parse(JSON.stringify(panoObjs[panoSel]));
  o.id = panoUid();
  if (o.type === 'pen') o.points = o.points.map(p => ({ x: p.x + 24, y: p.y + 24 }));
  else if (o.type === 'line') { o.x1 += 24; o.y1 += 24; o.x2 += 24; o.y2 += 24; }
  else { o.x += 24; o.y += 24; }
  panoRemember();
  panoObjs.push(o);
  panoSel = panoObjs.length - 1;
  panoCommit();
}

function panoCopySel() {
  if (panoSel == null) return;
  panoClip = JSON.parse(JSON.stringify(panoObjs[panoSel]));
}

function panoPasteSel() {
  if (!panoClip) return;
  const o = JSON.parse(JSON.stringify(panoClip));
  o.id = panoUid();
  if (o.type === 'pen') o.points = o.points.map(p => ({ x: p.x + 24, y: p.y + 24 }));
  else if (o.type === 'line') { o.x1 += 24; o.y1 += 24; o.x2 += 24; o.y2 += 24; }
  else { o.x += 24; o.y += 24; }
  panoRemember();
  panoObjs.push(o);
  panoSel = panoObjs.length - 1;
  panoCommit();
}

function panoOpenTextEditor(pt) {
  const c = panoCanvas(), ed = window.panoEditor;
  if (!c || !ed) return;
  panoLastTextPt = pt;
  const sp = panoWorldToScreen(pt);
  ed.textContent = '';
  ed.style.cssText = 'position:absolute;left:' + sp.x + 'px;top:' + sp.y + 'px;display:block;';
  ed.style.fontSize = (panoSize * 4) + 'px';
  ed.style.color = panoColor;
  ed.style.minWidth = '40px';
  panoInteracting = true;
  ed.focus();
  ed.onblur = () => panoCommitText(pt);
  ed.addEventListener('keydown', function h(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ed.blur(); }
    if (e.key === 'Escape') { panoInteracting = false; ed.onblur = null; ed.style.display = 'none'; }
  });
}

function panoCommitText(pt) {
  const ed = window.panoEditor;
  if (!ed) return;
  panoInteracting = false;
  const txt = (ed.textContent || '').replace(/\u200b/g, '').trim();
  ed.style.display = 'none';
  if (txt) {
    panoRemember();
    panoObjs.push({ id: panoUid(), type: 'text', x: pt.x, y: pt.y, text: txt, color: panoColor, size: panoSize });
    panoSel = panoObjs.length - 1;
    panoCommit();
  }
}

function panoCloseEditor() {
  const ed = window.panoEditor;
  if (ed && ed.style.display !== 'none') panoCommitText(panoLastTextPt || { x: 0, y: 0 });
}

function panoUndoDo() {
  if (!panoUndo.length) return;
  panoRedo.push(JSON.parse(JSON.stringify(panoObjs)));
  panoObjs = panoUndo.pop();
  panoSel = null;
  panoCommit();
}

function panoRedoDo() {
  if (!panoRedo.length) return;
  panoUndo.push(JSON.parse(JSON.stringify(panoObjs)));
  panoObjs = panoRedo.pop();
  panoSel = null;
  panoCommit();
}

function panoLoad() {
  panoInit();
  const r = panoRoomId();
  if (panoLoadedRoom === r) return;
  panoLoadBoard();
}
function panoApply() {
  const r = panoRoomId();
  try { localStorage.setItem('alfa-pano-room', r); } catch (e) {}
  const el = document.getElementById('pano-room');
  if (el) el.value = r;
  panoLoadedRoom = null;
  panoLoad();
}
function bindPanoPage() {
  const g = id => document.getElementById(id);
  const el = g('pano-room');
  if (el) {
    const saved = localStorage.getItem('alfa-pano-room');
    if (saved) el.value = saved;
    el.addEventListener('keydown', e => { if (e.key === 'Enter') panoApply(); });
  }
  const a = g('pano-apply');
  if (a) a.addEventListener('click', panoApply);
  panoInit();
}

// â”€â”€ Topluluk â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function loadTgFeed() {
  const wrap = document.getElementById('tg-embed-wrap');
  const empty = document.getElementById('tg-feed-empty');
  const ifr = document.getElementById('tg-embed');
  if (!ifr || !empty) return;
  empty.style.display = 'flex';
  ifr.addEventListener('load', () => { empty.style.display = 'none'; }, { once: true });
  setTimeout(() => { empty.style.display = 'none'; }, 12000);
  ifr.onerror = () => {
    if (empty) { empty.style.display = 'flex'; empty.textContent = 'Telegram yÃ¼klenemedi â€” '; const a = document.createElement('a'); a.href = 'https://t.me/alfatraderspublic'; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.cssText = 'color:var(--pc);font-weight:700;text-decoration:none;'; a.textContent = 'kanalÄ± aÃ§ â†—'; empty.appendChild(a); }
  };
  ifr.src = '/api/tg?embed=1&t=' + Date.now();
}

function egFlashSaved() {
  const s = document.getElementById('eg-notes-status');
  if (!s) return;
  s.textContent = 'kaydedildi âœ“'; s.classList.add('show');
  clearTimeout(egFlashSaved._t);
  egFlashSaved._t = setTimeout(() => s.classList.remove('show'), 1400);
}

function bindEgitimPage() {
  const g = id => document.getElementById(id);
  document.querySelectorAll('#eg-level-seg button').forEach(b => {
    b.addEventListener('click', () => { egLevel = b.getAttribute('data-level'); renderEgitim(); });
  });
  // konu ekle
  g('eg-add-topic').addEventListener('click', () => {
    if (g('eg-add-form').classList.contains('hidden')) egOpenForm('topic-add', null, null); else egCloseForm();
  });
  // Seviye seÃ§ici tÄ±klama (form iÃ§inde)
  document.querySelectorAll('#eg-level-picker [data-lv]').forEach(b => {
    b.addEventListener('click', () => {
      b.parentElement.querySelectorAll('[data-lv]').forEach(x => x.classList.toggle('on-gold', x === b));
    });
  });
  // Ä°zledim / bitirdim iÅŸareti (mevcut video)
  g('eg-done').addEventListener('click', async () => {
    const t = egCurTopic(); if (!t) return;
    const v = egCurVid(t); if (!v) return;
    v.done = !v.done;
    await saveEgitim(); renderEgitim();
    if (v.done) {
      const btn = g('eg-done'); btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
      const ch = g('eg-cheer'); ch.classList.remove('show'); void ch.offsetWidth; ch.classList.add('show');
    }
  });
  // konu adÄ± dÃ¼zenle (oynatÄ±cÄ± Ã¼stÃ¼ndeki kalem)
  g('eg-topic-edit').addEventListener('click', () => { const t = egCurTopic(); if (t) egOpenForm('topic-edit', { topicId: t.id }, { title: t.title, level: t.level }); });
  // video ekle (oynatÄ±cÄ± iÃ§indeki buton)
  g('eg-add-vid').addEventListener('click', () => { const t = egCurTopic(); if (t) egOpenForm('video-add', { topicId: t.id }, null); });
  // form kaydet
  g('eg-in-cancel').addEventListener('click', () => egCloseForm());
  g('eg-in-save').addEventListener('click', async () => {
    if (!magIsAdmin()) { egCloseForm(); return; }
    const title = g('eg-in-title').value.trim();
    const url = g('eg-in-url').value.trim();
    const mode = egForm.mode;
    const isVideo = (mode === 'video-add' || mode === 'video-edit');
    if (isVideo && url && !ytId(url) && !ytListId(url) && !miroId(url)) {
      g('eg-in-err').textContent = 'GeÃ§erli bir YouTube video / oynatma listesi ya da Miro pano baÄŸlantÄ±sÄ± gir (ya da boÅŸ bÄ±rak).';
      return;
    }
    const secList = egitimData.sections[egSec];
    // Seviye seÃ§ici (teknik bÃ¶lÃ¼mÃ¼)
    let pickedLevel = 'temel';
    const lvBtn = document.querySelector('#eg-level-picker [data-lv].on-gold');
    if (lvBtn) pickedLevel = lvBtn.getAttribute('data-lv');
    if (mode === 'sec-add') {
      const meta = egSecMeta();
      const id = rid();
      egitimData.secMeta = meta.concat([{ id, title: title || 'Yeni BÃ¶lÃ¼m' }]);
      if (!egitimData.sections[id]) egitimData.sections[id] = [];
      egSec = id; egLevel = 'temel'; egPendingDelSec = null;
    } else if (mode === 'topic-add') {
      const t = { id: rid(), title: title || 'Konu', note: '', videos: [], level: (egSec === 'teknik' ? pickedLevel : 'temel') };
      secList.push(t); egitimData.sel[egSec] = t.id;
    } else if (mode === 'topic-edit') {
      const t = secList.find(x => x.id === egForm.topicId); if (t) { t.title = title || t.title || 'Konu'; if (egSec === 'teknik') t.level = pickedLevel; }
    } else if (mode === 'video-add') {
      const t = secList.find(x => x.id === egForm.topicId);
      if (t) { const v = { id: rid(), title: title || (miroId(url) ? 'Miro Panosu' : (ytListId(url) && !ytId(url) ? 'Oynatma listesi' : 'Video')), url: url }; t.videos.push(v); egitimData.selVid[t.id] = v.id; egitimData.sel[egSec] = t.id; }
    } else if (mode === 'video-edit') {
      const t = secList.find(x => x.id === egForm.topicId);
      const v = t && t.videos.find(x => x.id === egForm.vidId);
      if (v) { v.title = title || v.title || 'Video'; v.url = url; egitimData.selVid[t.id] = v.id; }
    }
    await saveEgitim(); egCloseForm(); renderEgitim();
  });
  g('eg-in-url').addEventListener('keydown', e => { if (e.key === 'Enter') g('eg-in-save').click(); });
  g('eg-in-title').addEventListener('keydown', e => { if (e.key === 'Enter' && g('eg-in-url').style.display === 'none') g('eg-in-save').click(); });
  // not â€” yazdÄ±kÃ§a konuya kaydet (debounce)
  g('eg-notes').addEventListener('input', e => {
    const t = egCurTopic(); if (!t) return;
    t.note = e.target.value;
    clearTimeout(egSaveTimer);
    egSaveTimer = setTimeout(async () => { await saveEgitim(); egFlashSaved(); }, 600);
  });
  // not alanÄ±ndan ayrÄ±lÄ±nca hemen kaydet (sayfa kapanmadan Ã¶nce kaÃ§masÄ±n)
  g('eg-notes').addEventListener('blur', () => {
    clearTimeout(egSaveTimer);
    saveEgitim().then(() => egFlashSaved()).catch(() => {});
  });
}

// ============ Ä°ndikatÃ¶rler ============
const INDICATORS = [
  {
    id: 'aggr-workspace',
    name: 'Aggr Trade â€” BTC CVD + Spot/Perp Delta + CB Premium',
    tagline: 'aggr.trade iÃ§in hazÄ±r workspace â€” BTC spot CVD, aggregate perp delta, Coinbase Premium ve daha fazlasÄ± tek ekranda.',
    sections: [
      { type: 'html', content: '<p><strong>Aggr Trade</strong> â€” gerÃ§ek zamanlÄ± CVD, delta ve premium verilerini tek workspace\'te toplayan Ã¼cretsiz bir platform. AÅŸaÄŸÄ±daki dosyayÄ± indirip aggr.trade\'e yÃ¼kleyerek kullanabilirsiniz.</p>' },
      { type: 'html', content: '<h3>ğŸ“¥ Workspace\'i Ä°ndir</h3><p><a href="/workspace-btc-cvd.json" download style="display:inline-block;background:var(--pc);color:#fff;padding:10px 20px;border-radius:10px;font-weight:600;text-decoration:none;">ğŸ“¥ BTC Workspace JSON\'u Ä°ndir</a></p>' },
      { type: 'html', content: '<h3>ğŸ“– KullanÄ±m</h3><ol><li><a href="https://aggr.trade" target="_blank" rel="noopener noreferrer">aggr.trade</a> sitesine gidin</li><li>SaÄŸ Ã¼stteki menÃ¼den <strong>Workspace â†’ Import</strong> seÃ§eneÄŸine tÄ±klayÄ±n</li><li>Ä°ndirdiÄŸiniz JSON dosyasÄ±nÄ± seÃ§in</li><li>Workspace otomatik yÃ¼klenecek. BTC CVD, Spot Delta, Perp Delta ve CB Premium panellerini gÃ¶receksiniz.</li></ol>' },
      { type: 'html', content: '<h3>ğŸ“Š Panel Ä°Ã§eriÄŸi</h3><ul><li><strong>Coinbase CVD</strong> â€” Coinbase agresif alÄ±ÅŸ-satÄ±ÅŸ hacim farkÄ±</li><li><strong>Binance Spot CVD</strong> â€” Binance spot agresif alÄ±ÅŸ-satÄ±ÅŸ hacim farkÄ±</li><li><strong>Binance Futures CVD</strong> â€” Binance futures agresif alÄ±ÅŸ-satÄ±ÅŸ hacim farkÄ±</li><li><strong>Aggregate Spot Delta</strong> â€” TÃ¼m borsalarÄ±n spot delta toplamÄ±</li><li><strong>Aggregate Perp Delta</strong> â€” TÃ¼m borsalarÄ±n perpetual delta toplamÄ±</li><li><strong>Coinbase Premium</strong> â€” Coinbase ile Binance spot arasÄ± fiyat farkÄ±</li></ul>' },
    ],
  },
  {
    id: 'alfa-levels',
    name: 'Alfa Levels',
    tagline: 'Dinamik destek/direnÃ§ seviyeleri â€” likidite bÃ¶lgeleri, order bloklarÄ± ve iÃ§ yapÄ±.',
    sections: [
      { type: 'html', content: '<p><strong>Alfa Levels</strong> â€” Intraday ve swing iÃ§in Ã¶nemli bÃ¶lgeleri gÃ¶steren indikatÃ¶r.</p>' },
      { type: 'html', content: '<h3>ğŸ“ BileÅŸenler</h3><ul><li>Intraday ve Swing important areas</li><li>Tom Dante\'s ATR</li><li>EMA/SMA vs. trend following</li><li>Daily Open</li><li>Weekly Open</li><li>NYMO</li><li>Asia Low / High</li><li>Monday Range</li><li>Monthly Open</li><li>Yearly Open</li><li>Previous Monthly Open</li></ul>' },
      { type: 'html', content: '<h3>ğŸ”— TradingView</h3><p><a href="https://tr.tradingview.com/script/AK4RibWy/" target="_blank" rel="noopener noreferrer" style="color:var(--pc);font-weight:600;">Alfa Levels â€” TradingView&apos;de aÃ§</a></p>' },
      { type: 'html', content: '<h3>ğŸ“– KullanÄ±m Videosu</h3><p style="color:var(--text-3);font-style:italic;">Video henÃ¼z eklenmedi â€” yakÄ±nda.</p>' },
      { type: 'html', content: '<h3>ğŸ“Š Backtest</h3><p style="color:var(--text-3);font-style:italic;">Backtest sonuÃ§larÄ± henÃ¼z eklenmedi.</p>' },
    ],
  },
  {
    id: 'alfa-flow',
    name: 'Flow (Alfa Flow)',
    tagline: 'Spot CVD + Delta divergence â€” emir akÄ±ÅŸÄ±ndaki gizli dÃ¶nÃ¼ÅŸleri yakala.',
    sections: [
      { type: 'html', content: '<p><strong>Alfa Flow</strong>, spot Cumulative Volume Delta (CVD) ve futures delta divergencelarÄ±nÄ± analiz ederek piyasadaki gizli arz/talep dengesizliÄŸini tespit eder. Fiyat bir yÃ¶ne giderken akÄ±ÅŸ tersini sÃ¶ylÃ¼yorsa, dÃ¶nÃ¼ÅŸ yakÄ±ndÄ±r.</p>' },
      { type: 'html', content: '<h3>ğŸ” NasÄ±l Ã‡alÄ±ÅŸÄ±r</h3><ul><li><strong>Spot CVD</strong>: Borsadaki alÄ±cÄ±-satÄ±cÄ± hacim farkÄ±. CVD yÃ¼kseliyorsa agresif alÄ±m var (bullish), dÃ¼ÅŸÃ¼yorsa agresif satÄ±m var (bearish)</li><li><strong>Delta Divergence</strong>: Fiyat yeni bir tepe yaparken CVD tepe yapmÄ±yorsa = bearish divergence. Tam tersi = bullish divergence.</li><li><strong>AkÄ±ÅŸ Konfluensi</strong>: Alfa Levelsâ€™daki bir bÃ¶lge + CVD divergenceâ€™Ä± aynÄ± anda iÅŸaret ediyorsa iÅŸlem kalitesi yÃ¼kselir.</li></ul>' },
      { type: 'html', content: '<h3>ğŸ“– KullanÄ±m</h3><ol><li>Grafikte Spot CVD indikatÃ¶rÃ¼nÃ¼ aÃ§ (TradingViewâ€™da â€œCVDâ€ veya â€œCumulative Volume Deltaâ€)</li><li>Fiyat bir likidite bÃ¶lgesine yaklaÅŸÄ±rken CVDâ€™ye bak: divergence var mÄ±?</li><li>Divergence + Alfa Levels konfluensi = yÃ¼ksek kaliteli setup</li><li>Divergence yoksa veya akÄ±ÅŸ fiyatla aynÄ± yÃ¶ndeyse iÅŸlemi ele â€” akÄ±ÅŸa ters trade daha gÃ¼venlidir</li></ol>' },
      { type: 'html', content: '<h3>ğŸ¥ Video</h3><p style="color:var(--text-3);font-style:italic;">Video henÃ¼z eklenmedi â€” yakÄ±nda.</p>' },
      { type: 'html', content: '<h3>ğŸ“Š Backtest</h3><p style="color:var(--text-3);font-style:italic;">Backtest sonuÃ§larÄ± henÃ¼z eklenmedi.</p>' },
    ],
  },
];

function renderIndicators() {
  const el = document.getElementById('ind-ind-list');
  if (!el) return;
  el.innerHTML = '';
  INDICATORS.forEach(ind => {
    const card = document.createElement('div');
    card.style = 'background:var(--bg-2);border-radius:14px;padding:20px;margin-bottom:20px;';
    card.innerHTML = '<h2 style="margin:0 0 4px;">' + ind.name + '</h2><p style="margin:0 0 16px;color:var(--text-2);">' + ind.tagline + '</p>';
    const body = document.createElement('div');
    ind.sections.forEach(s => {
      const d = document.createElement('div');
      if (s.type === 'html') d.innerHTML = s.content;
      else d.textContent = s.content || '';
      d.style = 'margin-bottom:14px;font-size:14px;line-height:1.65;';
      body.appendChild(d);
    });
    card.appendChild(body);
    el.appendChild(card);
  });
}

function bindIndicatorsPage() {
  const g = id => document.getElementById(id);
}

function bindOnchainPage() {
  const g = id => document.getElementById(id);
}
function bindCalcPage() {
  const g = id => document.getElementById(id);
  ['accountBalance', 'riskValue', 'entryPrice', 'slPrice'].forEach(id => {
    const el = g(id);
    if (el) el.addEventListener('input', updateCalc);
  });
  ['riskType', 'instrument', 'leverage'].forEach(id => {
    const el = g(id);
    if (el) el.addEventListener('change', updateCalc);
  });
  updateCalc();
}
function updateCalc() {
  const g = id => document.getElementById(id);
  const balance = dnum(g('accountBalance') && g('accountBalance').value);
  const riskType = g('riskType') ? g('riskType').value : 'percent';
  const riskVal = dnum(g('riskValue') && g('riskValue').value);
  const entry = dnum(g('entryPrice') && g('entryPrice').value);
  const sl = dnum(g('slPrice') && g('slPrice').value);
  const lev = dnum(g('leverage') && g('leverage').value) || 1;
  const instSel = g('instrument');
  let pip = 0.0001, contract = 100000, symbol = '';
  if (instSel) {
    const opt = instSel.options[instSel.selectedIndex];
    pip = parseFloat(opt.getAttribute('data-pip')) || 0.0001;
    contract = parseFloat(opt.getAttribute('data-contract')) || 100000;
    symbol = instSel.value;
  }
  if (riskType === 'percent') {
    g('riskValueLabel').textContent = 'Risk OranÄ± (%)';
    g('riskValue').setAttribute('max', '100');
  } else {
    g('riskValueLabel').textContent = 'Risk MiktarÄ± ($)';
    g('riskValue').removeAttribute('max');
  }
  const riskAmount = riskType === 'percent' ? balance * riskVal / 100 : riskVal;
  const pipDist = entry > 0 ? Math.abs(entry - sl) / pip : 0;
  const quoteUsd = !/JPY|CAD/.test(symbol);
  const pipValueLot = quoteUsd ? contract * pip : entry > 0 ? (contract * pip) / entry : 0;
  const lot = pipDist > 0 && pipValueLot > 0 ? riskAmount / (pipDist * pipValueLot) : 0;
  const notional = entry > 0 ? lot * contract * (quoteUsd ? entry : 1 / entry) : 0;
  const margin = notional / lev;
  g('resRiskAmount').textContent = '$' + riskAmount.toFixed(2);
  g('resPipDistance').textContent = pipDist.toFixed(1) + ' Pips';
  g('resStandardLot').textContent = lot.toFixed(2);
  g('resMiniLot').textContent = (lot / 0.1).toFixed(1);
  g('resMicroLot').textContent = (lot / 0.01).toFixed(1);
  g('resNotionalValue').textContent = '$' + notional.toFixed(2);
  g('resMarginRequired').textContent = '$' + margin.toFixed(2);
  g('resPipValue').textContent = '$' + pipValueLot.toFixed(2);
}
function bindAdminChat() {
  const g = id => document.getElementById(id);
  g('ca-send').addEventListener('click', () => {
    const input = g('ca-input');
    const text = input.value.trim();
    if (!text || !caSelectedSid) return;
    input.value = '';
    caReadSessions.add(caSelectedSid);
    fetch(CHAT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: caSelectedSid, role: 'admin', text }) })
      .then(() => renderAdminChat())
      .catch(() => {});
  });
  g('ca-input').addEventListener('keydown', e => { if (e.key === 'Enter') g('ca-send').click(); });
}

// ============ AÃ§Ä±lÄ±ÅŸ + GiriÅŸ/KayÄ±t akÄ±ÅŸÄ± ============
let APP_BOOTED = false;
async function bootApp(opts) {
  if (APP_BOOTED) return;
  APP_BOOTED = true;
  if (opts && opts.seed) { try { await seedIfEmpty(); } catch (e) { /* boÅŸ baÅŸla */ } }
  try { await loadConfig(); } catch (e) { /* devam */ }
  try { await loadAiProfile(); } catch (e) { /* devam */ }
  try { await loadData(); } catch (e) { /* devam */ }
  try { await loadNews(); } catch (e) { /* devam */ }
  try { await loadReviews(); } catch (e) { /* devam */ }
  try { await loadEgitim(); } catch (e) { /* devam */ }
  try { init(); } catch (e) { /* devam */ }
  showPage(currentPage);
}

async function refreshAppData() {
  try { await loadConfig(); } catch (e) { /* devam */ }
  try { await loadData(); } catch (e) { /* devam */ }
  try { await loadNews(); } catch (e) { /* devam */ }
  try { await loadReviews(); } catch (e) { /* devam */ }
  try { await loadEgitim(); } catch (e) { /* devam */ }
  try { await loadTrades(); renderTrades(); } catch (e) { /* devam */ }
  try { await loadLessons(); renderLessons(); } catch (e) { /* devam */ }
  try { if (typeof loadDaily === 'function') loadDaily(); } catch (e) { /* devam */ }
  try { if (typeof render === 'function') render(); } catch (e) { /* devam */ }
  try { if (typeof renderRRcum === 'function') renderRRcum(); } catch (e) { /* devam */ }
  showPage(currentPage, true);
}

function showGate() { document.getElementById('auth-gate').classList.add('open'); }
function hideGate() { document.getElementById('auth-gate').classList.remove('open'); }
function showLanding() { document.body.classList.add('landed'); document.getElementById('landing').classList.add('open'); }
function hideLanding() { document.body.classList.remove('landed'); document.getElementById('landing').classList.remove('open'); }

function migrateLegacyLocal() {
  // Bu tarayÄ±cÄ±da hesapsÄ±z kullanÄ±lmÄ±ÅŸ eski verileri (varsa) yeni hesaba taÅŸÄ±.
  try {
    Object.keys(localStorage).forEach(k => {
      const keep = (k === STORAGE_KEY || k === TRADES_KEY || k === LESSONS_KEY || k === DATA_KEY || k === NEWS_KEY || k === REVIEW_KEY || k === REVIEW_CFG_KEY || k === EGITIM_KEY || k.indexOf(DAILY_PREFIX) === 0);
      if (keep && !(k in AUTH.cloud)) AUTH.cloud[k] = localStorage.getItem(k);
    });
  } catch (e) { /* eriÅŸilemedi */ }
}

async function onAuthed(user) {
  AUTH.user = user;
  AUTH.ns = 'u:' + user.id + ':';
  // Buluttan bu kullanÄ±cÄ±nÄ±n verisini Ã§ek
  let data = null;
  try {
    const res = await AUTH.client.from('journals').select('data').eq('user_id', user.id).maybeSingle();
    if (res && res.data && res.data.data && typeof res.data.data === 'object') data = res.data.data;
  } catch (e) { /* Ã§evrimdÄ±ÅŸÄ± â€” yerel aynadan devam */ }
  if (!data) {
    data = {};
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.indexOf(AUTH.ns) === 0) data[k.slice(AUTH.ns.length)] = localStorage.getItem(k);
      });
    } catch (e) { /* yok */ }
  }
  AUTH.cloud = data;
  // Ä°lk kez ve boÅŸsa: bu cihazdaki eski (hesapsÄ±z) verileri hesaba taÅŸÄ±
  if (Object.keys(AUTH.cloud).length === 0) migrateLegacyLocal();

  const nm = (user.user_metadata && user.user_metadata.name) || (user.email || '').split('@')[0];
  document.getElementById('user-name').textContent = nm;
  document.getElementById('user-badge').classList.remove('hidden');
  const nlAppBtn = document.getElementById('nav-login-app');
  if (nlAppBtn) nlAppBtn.style.display = 'none';
  // Admin kontrolÃ¼: sadece admin gÃ¶rebilir
  const isAdmin = (user.email || '').toLowerCase() === ADMIN_EMAIL;
  const adminTab = document.getElementById('tab-chat-admin');
  if (adminTab) adminTab.style.display = isAdmin ? '' : 'none';
  hideGate();
  hideLanding();
  const wrap = document.querySelector('.wrap');
  if (wrap) wrap.classList.remove('hidden');
  await refreshAppData();
  scheduleCloudSync();
  handleNotionHash();
}

function authError(err) {
  const m = (err && err.message) ? err.message : '';
  if (/Invalid login/i.test(m)) return 'E-posta veya ÅŸifre hatalÄ±.';
  if (/already registered/i.test(m)) return 'Bu e-posta zaten kayÄ±tlÄ±. GiriÅŸ yapmayÄ± dene.';
  if (/Email not confirmed/i.test(m)) return 'E-postan henÃ¼z onaylanmamÄ±ÅŸ. Gelen kutunu kontrol et.';
  if (/least 6/i.test(m)) return 'Åifre en az 6 karakter olmalÄ±.';
  if (/rate limit|too many/i.test(m)) return 'Ã‡ok fazla deneme oldu, biraz bekle.';
  return m || 'Bir hata oldu, tekrar dene.';
}

function bootAuth() {
  AUTH.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  let mode = 'login';
  // Åifre sÄ±fÄ±rlama baÄŸlantÄ±sÄ±yla mÄ± gelindi? (URL'de recovery iÅŸareti)
  let recovering = /type=recovery/.test(window.location.hash) || /type=recovery/.test(window.location.search);
  const msg = (t, cls) => { const el = $('au-msg'); el.textContent = t; el.className = 'auth-msg' + (cls ? ' ' + cls : ''); };
  // "Beni hatÄ±rla" â€” giriÅŸ bilgilerini bu cihazda sakla, form aÃ§Ä±lÄ±nca doldur
  const REM_KEY = 'alfa-login-rem';
  const saveRemember = (email, pass, remember) => {
    try {
      if (remember) localStorage.setItem(REM_KEY, JSON.stringify({ email, pass }));
      else localStorage.removeItem(REM_KEY);
    } catch (e) {}
  };
  const rememberPrefill = () => {
    try {
      const raw = localStorage.getItem(REM_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.email) $('au-email').value = d.email;
      if (d.pass) $('au-pass').value = d.pass;
      const chk = document.getElementById('au-remember');
      if (chk) chk.checked = true;
    } catch (e) {}
  };
  // Modlar: login | register | reset (sÄ±fÄ±rlama isteÄŸi) | newpass (yeni ÅŸifre belirle)
  const setMode = m => {
    mode = m;
    const isLogin = m === 'login', isReg = m === 'register', isReset = m === 'reset', isNew = m === 'newpass';
    $('tab-login').classList.toggle('on', isLogin);
    $('tab-register').classList.toggle('on', isReg);
    document.querySelector('.auth-tabs').classList.toggle('hidden', isReset || isNew);
    $('f-name').classList.toggle('hidden', !isReg);
    $('f-email').classList.toggle('hidden', isNew);   // yeni ÅŸifre modunda e-posta yok
    $('f-pass').classList.toggle('hidden', isReset);  // sÄ±fÄ±rlama isteÄŸinde ÅŸifre yok
    $('forgot-link').classList.toggle('hidden', !isLogin);
    $('back-login').classList.toggle('hidden', !isReset);
    if ($('f-remember')) $('f-remember').classList.toggle('hidden', !isLogin);
    $('au-submit').textContent = isReg ? 'KayÄ±t ol' : isReset ? 'SÄ±fÄ±rlama baÄŸlantÄ±sÄ± gÃ¶nder' : isNew ? 'Åifreyi gÃ¼ncelle' : 'GiriÅŸ yap';
    $('au-pass').setAttribute('autocomplete', (isReg || isNew) ? 'new-password' : 'current-password');
    $('au-pass').setAttribute('placeholder', isNew ? 'Yeni ÅŸifre (en az 6 karakter)' : 'En az 6 karakter');
    if (isLogin) rememberPrefill();
    msg('', '');
  };
  $('tab-login').addEventListener('click', () => setMode('login'));
  $('tab-register').addEventListener('click', () => setMode('register'));
  $('forgot-link').addEventListener('click', () => setMode('reset'));
  $('back-login').addEventListener('click', () => setMode('login'));
  // TanÄ±tÄ±m sayfasÄ± -> giriÅŸ penceresi
  const openAuth = m => { showGate(); setMode(m); };
  $('nav-login').addEventListener('click', () => openAuth('login'));
  const nlAppBtn2 = document.getElementById('nav-login-app');
  if (nlAppBtn2) nlAppBtn2.addEventListener('click', () => openAuth('login'));
  $('hero-login').addEventListener('click', () => openAuth('login'));
  $('hero-register').addEventListener('click', () => openAuth('register'));
  $('cta-register').addEventListener('click', () => openAuth('register'));
  $('auth-close').addEventListener('click', () => { hideGate(); });
  $('btn-logout').addEventListener('click', async () => {
    try { await pushCloud(); } catch (e) {}
    try { await AUTH.client.auth.signOut(); } catch (e) {}
    location.reload();
  });
  // Åifre sÄ±fÄ±rlama baÄŸlantÄ±sÄ±na tÄ±klayÄ±nca Supabase bu olayÄ± tetikler
  AUTH.client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      recovering = true;
      showGate(); setMode('newpass');
    }
  });
  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('au-email').value.trim();
    const pass = $('au-pass').value;
    const name = $('au-name').value.trim();
    $('au-submit').disabled = true;
    const safety = setTimeout(() => { $('au-submit').disabled = false; }, 20000);
    try {
      if (mode === 'reset') {
        if (!email) { msg('E-postanÄ± yaz.', 'err'); return; }
        const redirectTo = window.location.origin + window.location.pathname;
        const { error } = await AUTH.client.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        msg('SÄ±fÄ±rlama baÄŸlantÄ±sÄ± e-postana gÃ¶nderildi. Gelen kutunu (ve spam) kontrol et.', 'ok');
      } else if (mode === 'newpass') {
        if (pass.length < 6) { msg('Yeni ÅŸifre en az 6 karakter olmalÄ±.', 'err'); return; }
        const { error } = await AUTH.client.auth.updateUser({ password: pass });
        if (error) throw error;
        recovering = false;
        try { history.replaceState(null, '', window.location.pathname); } catch (e2) {}
        msg('Åifren gÃ¼ncellendi, giriÅŸ yapÄ±lÄ±yorâ€¦', 'ok');
        const { data } = await AUTH.client.auth.getUser();
        if (data && data.user) await onAuthed(data.user);
      } else if (mode === 'register') {
        if (!email || pass.length < 6) { msg('E-posta ve en az 6 karakterli ÅŸifre gerekli.', 'err'); return; }
        if (!name) { msg('LÃ¼tfen isminizi yazÄ±n.', 'err'); return; }
        const { data, error } = await AUTH.client.auth.signUp({ email, password: pass, options: { data: { name } } });
        if (error) throw error;
        if (data && data.session && data.user) { saveRemember(email, pass, true); await onAuthed(data.user); return; }
        msg('KayÄ±t alÄ±ndÄ±. E-posta onayÄ± gerekiyorsa gelen kutunu kontrol et, sonra giriÅŸ yap.', 'ok');
        setMode('login');
      } else {
        if (!email || pass.length < 6) { msg('E-posta ve en az 6 karakterli ÅŸifre gerekli.', 'err'); return; }
        const rem = document.getElementById('au-remember');
        const remember = !rem || rem.checked;
        const keep = remember ? window.localStorage : window.sessionStorage;
        const drop = remember ? window.sessionStorage : window.localStorage;
        try { Object.keys(drop).filter(k => k.indexOf('sb-') === 0).forEach(k => drop.removeItem(k)); } catch (e3) {}
        if (!remember) {
          AUTH.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: keep, autoRefreshToken: true, detectSessionInUrl: false } });
        }
        const { data, error } = await AUTH.client.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        saveRemember(email, pass, remember);
        await onAuthed(data.user);
      }
    } catch (err) {
      msg(authError(err), 'err');
      if (mode === 'login' && $('au-pass')) {
        $('au-pass').value = '';
        try { $('au-pass').focus({ preventScroll: true }); } catch (e2) {}
      }
    } finally {
      clearTimeout(safety);
      $('au-submit').disabled = false;
    }
  });
  // Mevcut oturum var mÄ±? SÄ±fÄ±rlama akÄ±ÅŸÄ±ndaysak yeni ÅŸifre ekranÄ±nÄ± gÃ¶ster.
  AUTH.client.auth.getSession()
    .then(({ data }) => {
      if (recovering) { showGate(); setMode('newpass'); return; }
      if (data && data.session && data.session.user) onAuthed(data.session.user);
      else showLanding();
    })
    .catch(() => { if (recovering) { showGate(); setMode('newpass'); } else showLanding(); });
}

if (AUTH_ENABLED) {
  bootApp({ seed: false });
  bootAuth();
} else {
  // Yerel mod (anahtar yok): eski davranÄ±ÅŸ â€” kimse giriÅŸ yapmadan Ã§alÄ±ÅŸÄ±r.
  document.body.classList.remove('landed');
  const nlAppBtn3 = document.getElementById('nav-login-app');
  if (nlAppBtn3) nlAppBtn3.style.display = 'none';
  seedIfEmpty().then(loadConfig).then(loadData).then(loadReviews).then(loadEgitim).then(loadNews).then(init)
    .then(() => showPage(currentPage)).catch(() => showPage(currentPage));
  // OAuth olmayan modda da hash kontrolÃ¼
  setTimeout(handleNotionHash, 1000);
}
// ============ KÃ¼mÃ¼latif PnL GrafiÄŸi (R cinsinden) ============
(function () {
  // 2026 aylÄ±k kÃ¼mÃ¼latif R â€” Ocak dip, Åub-Mar toparlanma, Nis dÃ¼ÅŸÃ¼ÅŸ,
  // May-Haz gÃ¼Ã§lÃ¼ yÃ¼kseliÅŸ, Tem yatay â†’ toplam +52R
  const MONTHS = ['Oca', 'Åub', 'Mar', 'Nis', 'May', 'Haz', 'Tem'];
  const CUM    = [ -8,    10,    25,    19,    31,    50,    52  ];
  const TOTAL  = CUM[CUM.length - 1];
  let started = false;

  // SVG Ã§izim alanÄ± (viewBox 320Ã—132)
  const PADX = 6, TOP = 12, BOT = 120;
  const minV = Math.min(...CUM), maxV = Math.max(...CUM);
  const range = (maxV - minV) || 1;
  const X = i => PADX + i * ((320 - PADX * 2) / (CUM.length - 1));
  const Y = v => BOT - ((v - minV) / range) * (BOT - TOP);

  function fmt(n) {
    return (n >= 0 ? '+' : '') + n.toFixed(1) + 'R';
  }

  function buildPaths() {
    let line = '';
    CUM.forEach((v, i) => { line += (i === 0 ? 'M' : 'L') + X(i).toFixed(1) + ',' + Y(v).toFixed(1) + ' '; });
    const area = line + 'L' + X(CUM.length - 1).toFixed(1) + ',' + BOT + ' L' + X(0).toFixed(1) + ',' + BOT + ' Z';
    return { line: line.trim(), area };
  }

  function drawMonths() {
    const box = document.getElementById('cum-months');
    if (!box || box.children.length) return;
    MONTHS.forEach(m => { const s = document.createElement('span'); s.textContent = m; box.appendChild(s); });
  }

  function startChart() {
    if (started) return;
    const svg = document.getElementById('cum-svg');
    const valEl = document.getElementById('cum-pnl-val');
    if (!svg || !valEl) return;
    started = true;

    drawMonths();
    const { line, area } = buildPaths();
    const lineEl = document.getElementById('cum-line');
    const areaEl = document.getElementById('cum-area');
    const zeroEl = document.getElementById('cum-zero');
    const dotEl  = document.getElementById('cum-dot-end');

    // sÄ±fÄ±r Ã§izgisi
    const yz = Y(0);
    zeroEl.setAttribute('y1', yz); zeroEl.setAttribute('y2', yz);

    lineEl.setAttribute('d', line);
    areaEl.setAttribute('d', area);
    dotEl.setAttribute('cx', X(CUM.length - 1));
    dotEl.setAttribute('cy', Y(TOTAL));

    // Ã§izgiyi soldan saÄŸa Ã§iz (stroke-dashoffset)
    const len = lineEl.getTotalLength();
    lineEl.style.strokeDasharray = len;
    lineEl.style.strokeDashoffset = len;
    // reflow
    void lineEl.getBoundingClientRect();
    const DUR = 1600;
    lineEl.style.transition = 'stroke-dashoffset ' + DUR + 'ms cubic-bezier(.22,.61,.36,1)';
    lineEl.style.strokeDashoffset = '0';
    document.getElementById('cum-chart').classList.add('drawn');
    setTimeout(() => dotEl.classList.add('on'), DUR - 200);

    // deÄŸeri 0 â†’ TOTAL say
    const t0 = performance.now();
    function ramp(now) {
      const p = Math.min((now - t0) / DUR, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      valEl.textContent = fmt(TOTAL * ease);
      if (p < 1) requestAnimationFrame(ramp);
      else valEl.textContent = fmt(TOTAL);
    }
    requestAnimationFrame(ramp);
  }

  // page-basvuru gÃ¶rÃ¼nÃ¼r olunca baÅŸlat
  const obs = new MutationObserver(() => {
    const pg = document.getElementById('page-basvuru');
    if (pg && !pg.classList.contains('hidden')) startChart();
  });
  const pg = document.getElementById('page-basvuru');
  if (pg) obs.observe(pg, { attributes: true, attributeFilter: ['class'] });
  if (pg && !pg.classList.contains('hidden')) startChart();
})();

// ============ Ana Sayfa Anketi (localStorage) ============
(function () {
  const KEY = 'alfa-survey-v1';
  const card = document.getElementById('home-survey');
  if (!card) return;
  // Zaten cevaplanmÄ±ÅŸ/atlanmÄ±ÅŸsa hiÃ§ gÃ¶sterme
  if (localStorage.getItem(KEY)) return;
  card.hidden = false;

  const answers = {};
  const sendBtn = document.getElementById('hs-send');
  const hint = document.getElementById('hs-hint');
  const qCount = card.querySelectorAll('.hs-q').length;

  // Ã–neri eÅŸlemesi â€” cevaba gÃ¶re en uygun bÃ¶lÃ¼m
  const REC = {
    zorluk: {
      disiplin:  { t: 'Alfa-Check List', p: 'defter' },
      risk:      { t: 'Trade GÃ¼nlÃ¼ÄŸÃ¼', p: 'data' },
      teknik:    { t: 'Alfa Edu', p: 'egitim' },
      psikoloji: { t: 'Alfa Edu â€” Psikoloji', p: 'egitim' },
      strateji:  { t: 'HaftalÄ±k DeÄŸerlendirme', p: 'review' },
    },
    ihtiyac: {
      egitim:    { t: 'Alfa Edu', p: 'egitim' },
      topluluk:  { t: 'Alfa Ol', p: 'basvuru' },
      araclar:   { t: 'Ä°ndikatÃ¶rler', p: 'indicators' },
      mentorluk: { t: 'Alfa Ol', p: 'basvuru' },
    },
  };

  card.querySelectorAll('.hs-opts button').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.closest('.hs-q').getAttribute('data-q');
      btn.closest('.hs-opts').querySelectorAll('button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      answers[q] = btn.getAttribute('data-v');
      const done = Object.keys(answers).length;
      sendBtn.disabled = done < qCount;
      hint.textContent = done < qCount ? (qCount - done) + ' soru kaldÄ±' : 'HazÄ±r!';
    });
  });

  document.getElementById('hs-skip').addEventListener('click', () => {
    localStorage.setItem(KEY, JSON.stringify({ skipped: true, ts: Date.now() }));
    card.hidden = true;
  });

  sendBtn.addEventListener('click', () => {
    if (Object.keys(answers).length < qCount) return;
    localStorage.setItem(KEY, JSON.stringify({ answers, ts: Date.now() }));
    // Ã–neri linkleri oluÅŸtur
    const recs = [];
    const seen = new Set();
    [REC.zorluk[answers.zorluk], REC.ihtiyac[answers.ihtiyac]].forEach(r => {
      if (r && !seen.has(r.p)) { seen.add(r.p); recs.push(r); }
    });
    const linksBox = document.getElementById('hs-done-links');
    linksBox.innerHTML = '';
    recs.forEach(r => {
      const a = document.createElement('a');
      a.href = '?page=' + r.p; a.textContent = r.t + ' â†’';
      a.addEventListener('click', e => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (typeof showPage === 'function') showPage(r.p);
      });
      linksBox.appendChild(a);
    });
    document.getElementById('hs-done-msg').textContent = recs.length
      ? 'CevaplarÄ±na gÃ¶re ÅŸunlarla baÅŸlamanÄ± Ã¶neriyoruz:'
      : 'CevaplarÄ±n kaydedildi â€” sana en uygun iÃ§erikleri hazÄ±rlÄ±yoruz.';
    card.querySelector('.hs-body').hidden = true;
    card.querySelector('.hs-foot').hidden = true;
    document.getElementById('hs-done').hidden = false;
  });
})();

// ============ Alfa Trader Ol â€” Topluluk AkÄ±ÅŸÄ± ============
const BAS_FEED_KEY = 'alfa-feed-v1';
let basFeed = [];
function loadFeed() {
  try { const d = localStorage.getItem(BAS_FEED_KEY); if (d) basFeed = JSON.parse(d); } catch (e) { basFeed = []; }
  if (!basFeed.length) {
    basFeed = [
      { id: 'f1', type: 'announce', title: 'Alfa Traders TopluluÄŸuna HoÅŸ Geldiniz', content: 'BurasÄ± hayat boyu Ã¶ÄŸrenme ve disiplinli trading ortamÄ±. Ä°ÅŸlemlerimizi, analizlerimizi ve bilgi birikimimizi paylaÅŸÄ±yoruz. Referans linki ile katÄ±l, ekibin parÃ§asÄ± ol.', author: 'Alfa Ekibi', date: new Date().toISOString(), pin: true },
      { id: 'f2', type: 'trade', title: 'BTC Long â€” TP +2.8R', content: '4H likidite alÄ±mÄ± + CVD divergance + Orderbook desteÄŸi. Entry: 68450, TP1: 69100 (%50), TP2: 69800 (%50), SL: 67900.', author: 'traderahmet', date: new Date(Date.now() - 864e5).toISOString(), pin: false },
      { id: 'f3', type: 'topic', title: 'HaftalÄ±k Piyasa DeÄŸerlendirmesi', content: 'BTC bu hafta 67-69k aralÄ±ÄŸÄ±nda sÄ±kÄ±ÅŸtÄ±. 70k Ã¼zerinde hacimli kapanÄ±ÅŸ alÄ±rsak yeni ATH denemesi beklerim. Altcoinlerde ETH ve SOL relative strength gÃ¶steriyor.', author: 'traderahmet', date: new Date(Date.now() - 2 * 864e5).toISOString(), pin: false },
      { id: 'f4', type: 'edu', title: 'CVD Divergance NasÄ±l Okunur?', content: 'Fiyat yeni dip yaparken Spot CVD yÃ¼kseliyorsa = bullish divergence. AlÃ§alan trendde CVD Ã¶nden dÃ¶nÃ¼ÅŸ sinyali verir. Daily timeframe en gÃ¼venilir sinyali verir.', author: 'Alfa Edu', date: new Date(Date.now() - 3 * 864e5).toISOString(), pin: false },
    ];
    saveFeed();
  }
}
function saveFeed() {
  try { localStorage.setItem(BAS_FEED_KEY, JSON.stringify(basFeed)); } catch (e) {}
}
function renderFeed() {
  const list = document.getElementById('bas-feed-list');
  if (list) {
    const sorted = [...basFeed].sort((a, b) => {
      if (a.pin && !b.pin) return -1;
      if (!a.pin && b.pin) return 1;
      return new Date(b.date) - new Date(a.date);
    });
    if (!sorted.length) {
      list.innerHTML = '<div class="bas-empty">HenÃ¼z paylaÅŸÄ±m yok. Ä°lk paylaÅŸÄ±mÄ± sen yap!</div>';
    } else {
      const LABELS = { trade: 'Ä°ÅŸlem', topic: 'Konu', edu: 'EÄŸitim', announce: 'Duyuru' };
      list.innerHTML = sorted.map(p => {
        const cs = p.comments || [];
        const cmtHtml = cs.length ? cs.map(c => '<div class="bas-cmt"><span class="ca">' + esc(c.author || 'Alfa Trader') + '</span> ' + esc(c.text) + ' <span class="cd">' + fmtDate(c.date) + '</span></div>').join('') : '<div class="bas-cmt-empty">Yorum yok.</div>';
        return '<div class="bas-post">' +
          '<div class="bas-post-head">' +
            '<span class="badge ' + p.type + '">' + (LABELS[p.type] || p.type) + '</span>' +
            '<span class="date">' + fmtDate(p.date) + '</span>' +
            (p.pin ? '<span class="pin">ğŸ“Œ</span>' : '') +
          '</div>' +
          '<h4>' + esc(p.title) + '</h4>' +
          '<div class="content">' + esc(p.content) + '</div>' +
          '<div class="author">â€” ' + esc(p.author || 'Anonim') + '</div>' +
          '<div class="bas-post-acts">' +
            '<button class="like' + (p.likedByMe ? ' on' : '') + '" onclick="toggleFeedLike(\'' + p.id + '\')">' + (p.likedByMe ? 'â¤ï¸' : 'ğŸ¤') + ' ' + (p.likes || 0) + '</button>' +
            '<button class="cmt" onclick="toggleFeedComments(\'' + p.id + '\')">ğŸ’¬ ' + cs.length + '</button>' +
          '</div>' +
          '<div class="bas-comments" id="feed-comments-' + p.id + '">' +
            '<div class="bas-cmt-list">' + cmtHtml + '</div>' +
            '<div class="bas-cmt-in"><input id="fc-in-' + p.id + '" placeholder="Yorum yazâ€¦"><button onclick="addFeedComment(\'' + p.id + '\')">GÃ¶nder</button></div>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }
  const pick = document.getElementById('feed-trade-pick');
  if (pick) {
    const cur = pick.value;
    const dt = (Array.isArray(dataTrades) ? dataTrades : []).slice(0, 50);
    pick.innerHTML = '<option value="">â€” GÃ¼nlÃ¼ÄŸÃ¼nden iÅŸlem kartÄ± yap â€”</option>' + dt.map((t, i) => '<option value="' + i + '">' + (t.date || '?') + ' ' + (t.pair || '') + ' ' + (t.dir || '') + ' Â· ' + (t.r != null && t.r !== '' ? t.r + 'R' : 'R?') + '</option>').join('');
    if (cur !== '') pick.value = cur;
  }
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 864e5;
  if (diff < 1) return 'BugÃ¼n';
  if (diff < 2) return 'DÃ¼n';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function toggleAddPost() {
  const w = document.getElementById('bas-add-wrap');
  const btn = document.getElementById('feed-add-btn');
  if (!w) return;
  const open = !w.classList.contains('open');
  w.classList.toggle('open', open);
  if (btn) btn.textContent = open ? 'Ä°ptal' : '+ PaylaÅŸ';
}
function addFeedPost() {
  const type = document.getElementById('feed-type').value;
  const title = document.getElementById('feed-title').value.trim();
  const content = document.getElementById('feed-content').value.trim();
  const author = document.getElementById('feed-author').value.trim() || 'Alfa Trader';
  const pin = document.getElementById('feed-pin').checked;
  if (!title || !content) { alert('BaÅŸlÄ±k ve iÃ§erik zorunlu.'); return; }
  basFeed.push({ id: 'f' + Date.now(), type, title, content, author, date: new Date().toISOString(), pin });
  saveFeed(); renderFeed();
  document.getElementById('feed-title').value = '';
  document.getElementById('feed-content').value = '';
  document.getElementById('feed-author').value = '';
  document.getElementById('feed-pin').checked = false;
  toggleAddPost();
}
// ============ Deneyimli Alfa Trader â€” Form â†’ Google Sheets ============
// ğŸ“Œ Buraya Google Apps Script Web App URL'ni ekle:
const BAS_GS_URL = 'https://script.google.com/macros/s/AKfycbxemXXvOyEW6tqwPv2ib6MQx9BeStGjbjtY_1rQU7cPWttLuzEP3-v4M_cPR1hIHZ0/exec';
function submitSeniorForm() {
  const btn = document.getElementById('sf-submit');
  const result = document.getElementById('sf-result');
  const name = document.getElementById('sf-name').value.trim();
  const tg = document.getElementById('sf-tg').value.trim();
  const x = document.getElementById('sf-x').value.trim();
  const exp = document.getElementById('sf-exp').value;
  const market = document.getElementById('sf-market').value;
  const freq = document.getElementById('sf-freq').value;
  const method = document.getElementById('sf-method').value;
  const level = document.getElementById('sf-level').value;
  const pnl = document.getElementById('sf-pnl').value;
  const pnl2 = document.getElementById('sf-pnl2').value.trim();
  const payout = document.getElementById('sf-payout').value.trim();
  const lasttrade = document.getElementById('sf-lasttrade').value.trim();
  const why = document.getElementById('sf-why').value.trim();
  if (!name || !tg || !exp || !market || !freq || !method || !level || !pnl || !why) { result.textContent = 'Ad, Telegram, tecrÃ¼be, piyasa, sÄ±klÄ±k, analiz, seviye, son 6 ay ve neden zorunlu.'; result.style.display = 'block'; return; }
  // ---- Public Alfa Edu (giriÅŸ gerektirmez) ----
  (function () {
    let pubSec = 'teknik';
    let pubData = { sections: {} };
    let pubSel = {};
    let pubSelVid = {};
    let loaded = false;

    async function loadPubEdu() {
      try {
        const r = await fetch('/api/edu-shared');
        if (r.ok) { const d = await r.json(); if (d && d.sections) pubData = d; }
      } catch (e) { /* */ }
      loaded = true;
    }

    function pubTopics() {
      return (pubData.sections[pubSec] || []).filter(t => (t.videos || []).some(v => v.url));
    }

    function pubSecMeta() {
      const m = pubData && pubData.secMeta;
      if (m && Array.isArray(m) && m.length) return m;
      return Object.keys(EG_SECTIONS).map(id => ({ id, title: EG_SECTIONS[id] }));
    }

    function renderPubEdu() {
      const topics = pubTopics();
      const pseg = document.getElementById('pub-eg-sec-seg');
      pseg.innerHTML = '';
      const meta = pubSecMeta();
      if (!meta.some(s => s.id === pubSec)) pubSec = meta.length ? meta[0].id : 'teknik';
      meta.forEach(s => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = s.id === pubSec ? 'on-gold' : '';
        b.setAttribute('data-sec', s.id);
        b.textContent = s.title;
        b.addEventListener('click', () => { pubSec = s.id; renderPubEdu(); });
        pseg.appendChild(b);
      });
      const listBox = document.getElementById('pub-eg-list');
      listBox.innerHTML = '';
      topics.forEach((t, i) => {
        const vids = (t.videos || []).filter(v => v.url);
        if (!vids.length) return;
        const row = document.createElement('div');
        row.className = 'eg-item' + (t.id === pubSel[pubSec] ? ' on' : '');
        const idx = document.createElement('span'); idx.className = 'eg-item-idx'; idx.textContent = i + 1;
        const tt = document.createElement('span'); tt.className = 'eg-item-t'; tt.textContent = t.title || '(baÅŸlÄ±ksÄ±z)';
        const cnt = document.createElement('span'); cnt.className = 'eg-count' + (vids.length ? ' has' : ''); cnt.textContent = vids.length;
        row.appendChild(idx); row.appendChild(tt); row.appendChild(cnt);
        row.addEventListener('click', () => { pubSel[pubSec] = t.id; renderPubEdu(); });
        listBox.appendChild(row);
      });
      document.getElementById('pub-eg-empty').style.display = topics.length ? 'none' : 'block';
      const cur = topics.find(t => t.id === pubSel[pubSec]) || topics[0];
      const wrap = document.getElementById('pub-eg-player-wrap');
      const empty = document.getElementById('pub-eg-player-empty');
      if (!cur) { wrap.style.display = 'none'; empty.style.display = 'block'; return; }
      if (cur.id !== pubSel[pubSec]) pubSel[pubSec] = cur.id;
      wrap.style.display = 'block'; empty.style.display = 'none';
      const vids = (cur.videos || []).filter(v => v.url);
      const curVid = vids.find(v => v.id === pubSelVid[cur.id]) || vids[0];
      if (curVid && curVid.id !== pubSelVid[cur.id]) pubSelVid[cur.id] = curVid.id;
      const embed = document.getElementById('pub-eg-embed');
      embed.innerHTML = '';
      const src = curVid ? egEmbedSrc(curVid) : '';
      if (src) {
        const ifr = document.createElement('iframe');
        ifr.src = src; ifr.title = curVid.title || cur.title || 'video';
        ifr.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
        ifr.setAttribute('allowfullscreen', '');
        embed.classList.toggle('eg-miro', egKind(curVid) === 'miro');
        embed.appendChild(ifr);
      }
      document.getElementById('pub-eg-now-title').textContent = cur.title || '(baÅŸlÄ±ksÄ±z)';
      const link = document.getElementById('pub-eg-now-link');
      if (curVid && src) { link.style.display = ''; link.href = egWatchHref(curVid); link.textContent = egKind(curVid) === 'miro' ? "Panoyu Miro'da aÃ§ â†—" : (egKind(curVid) === 'playlist' ? "Oynatma listesini YouTube'da aÃ§ â†—" : "YouTube'da aÃ§ â†—"); }
      else { link.style.display = 'none'; }
      const vidList = document.getElementById('pub-eg-vid-list');
      vidList.innerHTML = '';
      vids.forEach((v, vi) => {
        const row = document.createElement('div');
        row.className = 'eg-vid-row' + (curVid && v.id === curVid.id ? ' on' : '');
        const idx2 = document.createElement('span'); idx2.className = 'eg-vid-idx'; idx2.textContent = vi + 1;
        const vt = document.createElement('span'); vt.className = 'eg-vid-t'; vt.textContent = v.title || 'Video';
        row.appendChild(idx2); row.appendChild(vt);
        row.addEventListener('click', () => { pubSelVid[cur.id] = v.id; renderPubEdu(); });
        vidList.appendChild(row);
      });
    }

    function openPubEdu() {
      document.getElementById('public-edu').classList.add('open');
      document.body.style.overflow = 'hidden';
      if (!loaded) { loadPubEdu().then(renderPubEdu); } else { renderPubEdu(); }
    }

    function closePubEdu() {
      document.getElementById('public-edu').classList.remove('open');
      document.body.style.overflow = '';
    }

    const lpEduBtn = document.getElementById('lp-edu-btn');
    if (lpEduBtn) lpEduBtn.addEventListener('click', openPubEdu);
    document.getElementById('pub-edu-close').addEventListener('click', closePubEdu);
    document.getElementById('pub-edu-register').addEventListener('click', () => {
      closePubEdu();
      const regBtn = document.getElementById('hero-register');
      if (regBtn) regBtn.click();
    });
  })();

  if (!BAS_GS_URL) { result.textContent = 'Google Sheets baÄŸlantÄ±sÄ± henÃ¼z ayarlanmadÄ±.'; result.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'GÃ¶nderiliyor...';
  result.style.display = 'none';
  const payload = { name, tg, x, exp, market, freq, method, level, pnl, pnl2, payout, lasttrade, why, date: new Date().toISOString() };
  fetch(BAS_GS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then(() => { result.textContent = 'âœ… BaÅŸvurun alÄ±ndÄ±! Seni takip edeceÄŸiz.'; result.style.display = 'block'; result.style.color = '#22c55e'; document.getElementById('senior-form').querySelectorAll('input, select, textarea').forEach(el => el.value = ''); })
    .catch(() => { result.textContent = 'GÃ¶nderme hatasÄ±. Tekrar dene.'; result.style.display = 'block'; result.style.color = '#ef4444'; })
    .finally(() => { btn.disabled = false; btn.textContent = 'BaÅŸvur â†’'; });
}


// ============ Junior UID KayÄ±t ============
function submitJuniorUid() {
  const uid = document.getElementById('junior-uid').value.trim();
  const r = document.getElementById('junior-result');
  if (!uid) { r.textContent = 'UID girmelisin.'; r.style.display = 'block'; r.style.color = '#ef4444'; return; }
  if (!BAS_GS_URL) { r.textContent = 'Sistem baÄŸlantÄ±sÄ± hazÄ±r deÄŸil.'; r.style.display = 'block'; r.style.color = '#ef4444'; return; }
  r.style.display = 'none';
  fetch(BAS_GS_URL, { method: 'POST', mode: 'no-cors', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ type: 'junior', uid, date: new Date().toISOString() }) })
    .then(() => { r.textContent = 'âœ… HoÅŸ geldin! Topluluk akÄ±ÅŸÄ±na gÃ¶z atabilirsin.'; r.style.display = 'block'; r.style.color = '#22c55e'; document.getElementById('junior-uid').value = ''; })
    .catch(() => { r.textContent = 'Hata oluÅŸtu, tekrar dene.'; r.style.display = 'block'; r.style.color = '#ef4444'; });
}
// ============ Chat Widget ============
const CHAT_KEY = 'alfa-chat-v3';
const CHAT_API = '/api/chat-admin';
let chatHistory = [];
let chatFallbackCount = 0;
let chatLiveRequested = false;
function chatSid() {
  let s = localStorage.getItem('alfa-chat-sid');
  if (!s) { s = Date.now().toString(36) + Math.random().toString(36).slice(2,9); localStorage.setItem('alfa-chat-sid', s); }
  return s;
}
function loadChat() {
  try {
    const d = localStorage.getItem(CHAT_KEY);
    if (d) {
      chatHistory = JSON.parse(d);
      const last = chatHistory[chatHistory.length - 1];
      if (last && last.time && (Date.now() - new Date(last.time).getTime() > 1800000)) {
        chatHistory = [];
      }
    } else { chatHistory = []; }
  } catch(e) { chatHistory = []; }
  chatFallbackCount = 0;
  chatLiveRequested = false;
}
function saveChat() { try { localStorage.setItem(CHAT_KEY, JSON.stringify(chatHistory)); } catch(e) {} }
function toggleChat() {
  const p = document.getElementById('chat-popup');
  if (!p) return;
  const isOpen = p.classList.contains('open');
  if (isOpen) { closeChat(); return; }
  p.classList.add('open');
  document.getElementById('chat-btn').textContent = 'âœ•';
  renderChat();
  setTimeout(() => document.getElementById('chat-input').focus(), 100);
}
function closeChat() {
  document.getElementById('chat-popup').classList.remove('open');
  document.getElementById('chat-btn').textContent = 'ğŸ’¬';
}
function chatEndSession() {
  if (chatLiveRequested) {
    if (!confirm('CanlÄ± desteÄŸi sonlandÄ±r? KonuÅŸma geÃ§miÅŸin silinir.')) return;
  } else if (!chatHistory.length) {
    return;
  } else {
    if (!confirm('Sohbet geÃ§miÅŸini temizle? TÃ¼m konuÅŸma silinir.')) return;
  }
  chatHistory = [];
  chatFallbackCount = 0;
  chatLiveRequested = false;
  saveChat();
  renderChat();
}
function renderChat() {
  const body = document.getElementById('chat-body');
  if (!body) return;
  if (!chatHistory.length && !chatLiveRequested) {
    body.innerHTML =
      `<div class="chat-options"><div class="co-title">ğŸ‘‹ Alfa Traders'a hoÅŸ geldin! NasÄ±l yardÄ±mcÄ± olabilirim?</div><div class="co-btn" onclick="chatStartAI()">ğŸ¤– Yapay ZekÃ¢ ile HÄ±zlÄ± Ã‡Ã¶zÃ¼m</div><div class="co-btn co-live" onclick="chatStartLive()">ğŸ‘¤ CanlÄ± Bir KiÅŸiyle KonuÅŸ</div></div>`;
    body.scrollTop = body.scrollHeight;
    return;
  }
  const liveBtn = chatFallbackCount >= 2 && !chatLiveRequested ? `<div class="chat-live-btn" onclick="requestLiveSupport()">ğŸ‘¤ CanlÄ± Destek</div>` : '';
  body.innerHTML = chatHistory.map(m => `<div class="chat-msg ${m.role}">${esc(m.text)}</div>`).join('') + liveBtn;
  body.scrollTop = body.scrollHeight;
}
function chatStartAI() {
  chatHistory = [
    { role: 'bot', text: 'Harika! Sana nasÄ±l yardÄ±mcÄ± olabilirim? Sorunu yaz, hemen cevaplayayÄ±m.', time: new Date().toISOString() },
  ];
  saveChat(); renderChat();
  setTimeout(() => document.getElementById('chat-input').focus(), 100);
}
function chatStartLive() {
  requestLiveSupport();
}
function requestLiveSupport() {
  const body = document.getElementById('chat-body');
  const saved = getChatUserInfo();
  body.innerHTML = `<div class="chat-live-form"><div class="clf-title">ğŸ‘¤ CanlÄ± destek iÃ§in bilgilerin:</div><input type="text" id="clf-firstname" placeholder="AdÄ±n" value="${esc(saved.firstName)}" /><input type="text" id="clf-lastname" placeholder="SoyadÄ±n" value="${esc(saved.lastName)}" /><input type="email" id="clf-email" placeholder="E-posta" value="${esc(saved.email)}" /><button class="clf-btn" onclick="submitLiveSupport()">BaÄŸlan</button></div>`;
  body.scrollTop = body.scrollHeight;
}
function caDelete(sid) {
  if (!confirm('Bu konuÅŸmayÄ± tamamen sil? TÃ¼m mesajlar kalÄ±cÄ± olarak gider.')) return;
  // Ã–nce yerelden sil, sonra API'a bildir
  if (caSelectedSid === sid) { caSelectedSid = null; document.getElementById('ca-msgs').innerHTML = ''; document.getElementById('ca-reply-box').classList.add('hidden'); }
  caAllMsgs = caAllMsgs.filter(m => m.sessionId !== sid);
  caReadSessions.delete(sid);
  updateChatBadge();
  renderAdminChat();
  fetch(CHAT_API, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid }) }).catch(() => {});
}
function getChatUserInfo() {
  try { return JSON.parse(localStorage.getItem('alfa-chat-user')) || { firstName:'', lastName:'', email:'' }; } catch(e) { return { firstName:'', lastName:'', email:'' }; }
}
function saveChatUserInfo(firstName, lastName, email) {
  try { localStorage.setItem('alfa-chat-user', JSON.stringify({ firstName, lastName, email })); } catch(e) {}
}
function submitLiveSupport() {
  const firstName = document.getElementById('clf-firstname').value.trim();
  const lastName = document.getElementById('clf-lastname').value.trim();
  const email = document.getElementById('clf-email').value.trim();
  if (!firstName || !lastName) { alert('LÃ¼tfen adÄ±nÄ± ve soyadÄ±nÄ± gir.'); return; }
  saveChatUserInfo(firstName, lastName, email);
  chatLiveRequested = true;
  const fullName = firstName + ' ' + lastName;
  const msg = 'ğŸ‘¤ CanlÄ± destek istiyorum.\nÄ°sim: ' + fullName + '\nE-posta: ' + (email || 'belirtilmedi');
  chatHistory.push({ role: 'user', text: msg, time: new Date().toISOString() });
  chatHistory.push({ role: 'admin', text: 'ğŸ“ CanlÄ± destek talebin alÄ±ndÄ±. En kÄ±sa sÃ¼rede sana dÃ¶nÃ¼ÅŸ yapacaÄŸÄ±z.', time: new Date().toISOString() });
  saveChat(); renderChat();
  const sid = chatSid();
  fetch(CHAT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, role: 'user', name: fullName, text: 'CanlÄ± destek talebi - ' + fullName + (email ? ' (' + email + ')' : '') }) }).catch(() => {});
}
const AI_URL = '/api/ai';
function sendChatMsg() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  chatHistory.push({ role: 'user', text, time: new Date().toISOString() });
  // KullanÄ±cÄ± canlÄ± destek istiyorsa direkt butonu gÃ¶ster (AI yanÄ±tÄ±nÄ± bekleme)
  if (/canlÄ± destek|mÃ¼ÅŸteri temsilcisi|gerÃ§ek kiÅŸi|biriyle gÃ¶rÃ¼ÅŸ|temsilci|operatÃ¶r|yetkili|insanla konuÅŸ/i.test(text) && !chatLiveRequested) {
    chatFallbackCount = Math.max(chatFallbackCount, 2);
  }
  saveChat(); renderChat();
  // Sadece canlÄ± destek aktifken admin API'Ä±na gÃ¶nder
  if (chatLiveRequested) {
    const sid = chatSid();
    fetch(CHAT_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, role: 'user', text }) }).catch(() => {});
  }
  if (BAS_GS_URL) {
    fetch(BAS_GS_URL, { method: 'POST', mode: 'no-cors', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ type: 'chat', message: text, date: new Date().toISOString() }) }).catch(() => {});
  }
  const thinkId = Date.now();
  chatHistory.push({ role: 'bot', text: 'ğŸ¤” DÃ¼ÅŸÃ¼nÃ¼yorum...', _id: thinkId });
  saveChat(); renderChat();
  fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) })
    .then(r => r.json())
    .then(data => {
      let reply = data.reply || getAutoReply(text);
      const isFallback = !data.reply || getAutoReply(text).includes('cevap veremedi');
      if (isFallback) chatFallbackCount++;
      // Buton zaten gÃ¶sterilecekse gereksiz yere tekrar mesaj ekleme
      const idx = chatHistory.findIndex(m => m._id === thinkId);
      if (idx !== -1) { chatHistory[idx] = { role: 'bot', text: reply }; }
      else { chatHistory.push({ role: 'bot', text: reply }); }
      saveChat(); renderChat();
    })
    .catch(() => {
      const reply = getAutoReply(text);
      chatFallbackCount++;
      // Buton zaten gÃ¶sterilecekse gereksiz yere tekrar mesaj ekleme
      const idx = chatHistory.findIndex(m => m._id === thinkId);
      if (idx !== -1) { chatHistory[idx] = { role: 'bot', text: reply }; }
      saveChat(); renderChat();
    });
}
let chatPoll = null;
function startChatPoll() {
  clearInterval(chatPoll);
  chatPoll = setInterval(() => {
    const p = document.getElementById('chat-popup');
    if (!p || !p.classList.contains('open')) return;
    const sid = chatSid();
    fetch(CHAT_API + '?t=' + Date.now()).then(r => r.json()).then(msgs => {
      const myMsgs = msgs.filter(m => m.sessionId === sid);
      // Session silinmiÅŸse (admin tarafÄ±ndan) local history'i temizle
      if (!myMsgs.length && chatHistory.some(h => h.role === 'admin')) {
        chatHistory = []; saveChat(); renderChat(); return;
      }
      const adminMsgs = myMsgs.filter(m => m.role === 'admin');
      let added = false;
      adminMsgs.forEach(m => {
        if (!chatHistory.some(h => h.time === m.time && h.role === 'admin')) {
          chatHistory.push({ role: 'admin', text: m.text, time: m.time }); added = true;
        }
      });
      if (added) { saveChat(); renderChat(); }
    }).catch(() => {});
  }, 4000);
}
startChatPoll();
function getAutoReply(t) {
  const s = t.toLowerCase();
  if (/merhaba|selam|hey|iyi gÃ¼nler/i.test(s)) return 'Merhaba! ğŸ‘‹ NasÄ±l yardÄ±mcÄ± olabilirim?';
  if (/kayÄ±t|kaydol|nasÄ±l.*katÄ±l|referans|Ã¼ye/i.test(s)) return 'Bybit veya OKX referans linklerinden birini kullanarak kaydolabilirsin. UID\'ni girip topluluÄŸa katÄ±labilirsin.';
  if (/eÄŸitim|edu|Ã¶ÄŸren|video|ders|kurs/i.test(s)) return 'ğŸ“š Ana menÃ¼de "Alfa Edu" bÃ¶lÃ¼mÃ¼ne bak â€” teknik analiz, temel analiz, psikoloji ve onchain dersleri var.';
  if (/topluluk|grup|telegram|sohbet/i.test(s)) return 'ğŸ’¬ Telegram: https://t.me/alfatradersweb';
  if (/iÅŸlem|trade|analiz|piyasa|grafik/i.test(s)) return 'Topluluk akÄ±ÅŸÄ±nda iÅŸlem ve analiz paylaÅŸÄ±mlarÄ±nÄ± bulabilirsin.';
  return 'ğŸ¤– Cevap veremedim.';
}
// ============ Admin Chat Paneli (WhatsApp benzeri) ============
let caAllMsgs = [];
let caSelectedSid = null;
let caPollTimer = null;
let caReadSessions = new Set();
let caLastCount = 0;

function updateChatBadge() {
  const badge = document.getElementById('chat-unread-badge');
  const badgeM = document.getElementById('chat-unread-badge-m');
  if (!badge && !badgeM) return;
  const sessions = {};
  caAllMsgs.forEach(m => {
    if (!sessions[m.sessionId]) sessions[m.sessionId] = [];
    sessions[m.sessionId].push(m);
  });
  let unread = 0;
  Object.keys(sessions).forEach(sid => {
    if (caReadSessions.has(sid)) return;
    const msgs = sessions[sid];
    if (msgs.some(m => m.role === 'user')) unread++;
  });
  const show = unread > 0;
  const text = unread > 9 ? '9+' : unread;
  [badge, badgeM].forEach(b => {
    if (!b) return;
    if (show) { b.textContent = text; b.classList.remove('hidden'); }
    else { b.classList.add('hidden'); }
  });
}

function renderAdminChat() {
  fetch(CHAT_API + '?t=' + Date.now()).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(msgs => {
    const newCount = (msgs || []).length;
    const changed = newCount !== caLastCount;
    caAllMsgs = msgs || [];
    caLastCount = newCount;
    updateChatBadge();
    const list = document.getElementById('ca-list');
    const msgsDiv = document.getElementById('ca-msgs');
    const empty = document.getElementById('ca-empty');
    const replyBox = document.getElementById('ca-reply-box');
    if (!list) return;
    // DeÄŸiÅŸiklik yoksa sadece badge gÃ¼ncelle
    if (!changed && caSelectedSid) { if (replyBox) replyBox.classList.remove('hidden'); return; }
    const sessions = {};
    caAllMsgs.forEach(m => {
      if (!sessions[m.sessionId]) sessions[m.sessionId] = [];
      sessions[m.sessionId].push(m);
    });
    const sids = Object.keys(sessions);
    if (!sids.length) {
      list.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:20px;text-align:center;">HenÃ¼z mesaj yok.</div>';
      if (msgsDiv) msgsDiv.innerHTML = ''; empty.style.display = 'block'; replyBox.classList.add('hidden');
      return;
    }
    empty.style.display = 'none';
    // Sol liste
    list.innerHTML = sids.map(sid => {
      const ms = sessions[sid];
      const last = ms[ms.length - 1];
      const unread = !caReadSessions.has(sid) && ms.some(m => m.role === 'user');
      const preview = last.text.substring(0, 30) + (last.text.length > 30 ? '...' : '');
      const time = new Date(last.time).toLocaleString('tr-TR', {hour:'2-digit',minute:'2-digit'});
      // KullanÄ±cÄ± adÄ±nÄ± bul: name field'Ä± varsa kullan, yoksa ilk mesajdan Ã§Ä±kar
      const firstMsg = sessions[sid].find(m => m.role === 'user');
      const userName = last.name || (firstMsg && firstMsg.name) || (firstMsg && firstMsg.text.match(/CanlÄ± destek talebi - (.+?)(?:$|\s*\()/)?.[1]) || sid.substring(0, 6);
      return `<div class="ca-item${caSelectedSid === sid ? ' on' : ''}" data-sid="${sid}"><div onclick="caSelect('${sid}')" style="flex:1;cursor:pointer;">${esc(userName)}${unread ? '<span class="ca-badge">!</span>' : ''}<div class="ca-meta">${esc(preview)} Â· ${time}</div></div><span class="ca-del" onclick="event.stopPropagation();caDelete('${sid}')" title="KonuÅŸmayÄ± kapat">âœ•</span></div>`;
    }).join('');
    // Ä°lk seferde son konuÅŸmayÄ± seÃ§
    if (!caSelectedSid || !sessions[caSelectedSid]) caSelectedSid = sids[sids.length - 1];
    showSessionMsgs(sessions, replyBox, msgsDiv);
  }).catch(() => {});
}
function showSessionMsgs(sessions, replyBox, msgsDiv) {
  if (!caSelectedSid || !sessions || !sessions[caSelectedSid]) return;
  caReadSessions.add(caSelectedSid);
  const ms = sessions[caSelectedSid];
  msgsDiv.innerHTML = ms.map(m => `<div class="ca-msg ${m.role === 'user' ? 'u' : 'a'}"><div class="ca-meta">${m.role === 'user' ? 'KullanÄ±cÄ±' : 'Admin'} Â· ${new Date(m.time).toLocaleString('tr-TR', {hour:'2-digit',minute:'2-digit'})}</div><div>${esc(m.text)}</div></div>`).join('');
  msgsDiv.scrollTop = msgsDiv.scrollHeight;
  replyBox.classList.remove('hidden');
  updateChatBadge();
}
function caSelect(sid) {
  caSelectedSid = sid;
  caReadSessions.add(sid);
  document.querySelectorAll('.ca-item').forEach(c => c.classList.toggle('on', c.dataset.sid === sid));
  const sessions = {}; caAllMsgs.forEach(m => { if (!sessions[m.sessionId]) sessions[m.sessionId] = []; sessions[m.sessionId].push(m); });
  showSessionMsgs(sessions, document.getElementById('ca-reply-box'), document.getElementById('ca-msgs'));
}
function startAdminChatPoll() {
  clearInterval(caPollTimer);
  caPollTimer = setInterval(() => {
    const p = document.getElementById('page-chat-admin');
    if (!p || p.classList.contains('hidden')) return;
    renderAdminChat();
  }, 5000);
}
// Nav'da bildirim rozetini gÃ¼ncelle (her 8 sn'de bir)
setInterval(() => {
  fetch(CHAT_API + '?t=' + Date.now()).then(r => r.json()).then(msgs => {
    caAllMsgs = msgs || [];
    updateChatBadge();
  }).catch(() => {});
}, 8000);
// ============ GÃ¼nÃ¼n SÃ¶zÃ¼ Ticker (Ders Defteri'nden) ============
function showDailyQuote() {
  const el = document.getElementById('ticker-text');
  const au = document.getElementById('ticker-author');
  if (!el) return;
  let text = '', author = '';
  const active = lessonsData?.lessons?.filter(l => l.active) || [];
  if (active.length > 0) {
    // Ders Defteri'ndeki aktif derslerden rastgele birini seÃ§
    const pick = active[Math.floor(Math.random() * active.length)];
    text = pick.text; author = pick.src || 'Ders Defteri';
  } else {
    // HiÃ§ aktif ders yoksa fallback
    text = 'Ders Defteri\'ne bir not ekle, burada gÃ¶rÃ¼nsÃ¼n.';
    author = 'Alfa Traders';
  }
  el.textContent = '\u201c' + text + '\u201d';
  if (au) au.textContent = '\u2014 ' + author;
}
showDailyQuote();
loadChat();
loadFeed();
document.addEventListener('DOMContentLoaded', renderFeed);
setTimeout(renderFeed, 100);

// ============ R Sonucu Bekleyen Ä°ÅŸlemler ============
function renderPendingR() {
  const list = document.getElementById('pending-r-list');
  const cnt = document.getElementById('pending-r-count');
  const pending = (Array.isArray(trades) ? trades : []).filter(t => t.r === '' || t.r === null || t.r === undefined);
  if (cnt) cnt.textContent = pending.length;
  if (!list) return;
  if (!pending.length) {
    list.innerHTML = '<div class="hint" style="padding:6px 0;">Bekleyen R sonucu yok â€” hepsi girilmiÅŸ. ğŸ‰</div>';
    return;
  }
  list.innerHTML = pending.map(t => {
    const id = 'pr-' + t.id;
    return '<div class="pr-row" style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">' +
      '<span style="font-size:11px;color:var(--text-3);min-width:64px;">' + esc(t.date || '?') + '</span>' +
      '<b>' + esc(t.pair || '') + '</b> <span class="dr-dir ' + String(t.dir || 'long').toLowerCase() + '">' + esc(t.dir || '') + '</span>' +
      '<span style="font-size:11px;color:var(--text-3);flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc((t.strat || '').slice(0, 22)) + ' Â· ' + esc((t.note || '').slice(0, 40)) + '</span>' +
      '<span style="display:flex;gap:6px;align-items:center;"><input type="number" step="0.01" id="' + id + '" placeholder="R" style="width:74px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">' +
      '<button class="btn solid" data-pr="' + t.id + '">Kaydet</button></span>' +
      '</div>';
  }).join('');
  list.querySelectorAll('[data-pr]').forEach(b => {
    b.addEventListener('click', async () => {
      const inp = document.getElementById('pr-' + b.getAttribute('data-pr'));
      if (!inp) return;
      const v = parseFloat(inp.value);
      if (isNaN(v)) { alert('GeÃ§erli bir R deÄŸeri gir (Ã¶r. 1.5, -0.3)'); return; }
      const tr = (Array.isArray(trades) ? trades : []).find(x => String(x.id) === String(b.getAttribute('data-pr')));
      if (!tr) return;
      tr.r = v;
      saveTrades();
      try {
        const res = await dfSaveTradeToJournal(tr, true);
        if (res.jj) { res.jj.r = v; await saveData(); }
        await dfSyncTradeNotion(tr, res.jj);
      } catch (e) { console.error('R senkron hatasÄ±:', e); }
      renderPendingR();
      renderTrades();
      renderData();
    });
  });
}

// ============ GÃ¼nlÃ¼k Rutin ============
const RUTIN_PREFIX = 'rutin-daily:';
const RUTIN_TASKS = ['Grafikleri aÃ§, gÃ¼nÃ¼n seviyelerini iÅŸaretle', 'Haber takvimini kontrol et', 'GÃ¼nlÃ¼k trade planÄ±nÄ± yaz', 'Risk bÃ¼tÃ§esini belirle (gÃ¼nlÃ¼k max kayÄ±p)', 'Psikoloji / duygu durumunu not et'];
let rutinDate = '';
let rutinData = { sabah: { tasks: {}, plan: '' }, aksam: { ozet: '', uyum: null, ders: '' } };
let rutinBound = false;
function rutinIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function rutinKey() { return RUTIN_PREFIX + rutinDate; }
function rutinDone(r) {
  if (!r) return false;
  const planOk = !!(r.sabah && r.sabah.plan && String(r.sabah.plan).trim().length > 2);
  const ozetOk = !!(r.aksam && r.aksam.ozet && String(r.aksam.ozet).trim().length > 2);
  return planOk && ozetOk;
}
async function loadRutin() {
  const dt = document.getElementById('rutin-date');
  if (dt) rutinDate = dt.value || rutinIso(new Date());
  rutinData = { sabah: { tasks: {}, plan: '' }, aksam: { ozet: '', uyum: null, ders: '' } };
  try {
    const v = await store.get(rutinKey());
    if (v) {
      const p = JSON.parse(v);
      if (p && typeof p === 'object') {
        rutinData.sabah = Object.assign(rutinData.sabah, p.sabah || {});
        rutinData.aksam = Object.assign(rutinData.aksam, p.aksam || {});
      }
    }
  } catch (e) {}
}
async function renderRutin() {
  await loadRutin();
  const dt = document.getElementById('rutin-date');
  if (dt && dt.value !== rutinDate) dt.value = rutinDate;
  const tasks = document.getElementById('rutin-tasks');
  if (tasks) {
    tasks.innerHTML = RUTIN_TASKS.map((t, i) => '<label class="rutin-task' + (rutinData.sabah.tasks[i] ? ' done' : '') + '"><input type="checkbox" data-ti="' + i + '"' + (rutinData.sabah.tasks[i] ? ' checked' : '') + '> ' + esc(t) + '</label>').join('');
    tasks.querySelectorAll('input[data-ti]').forEach(cb => cb.addEventListener('change', () => { rutinData.sabah.tasks[Number(cb.dataset.ti)] = cb.checked; cb.parentElement.classList.toggle('done', cb.checked); }));
  }
  const plan = document.getElementById('rutin-plan'); if (plan) plan.value = rutinData.sabah.plan || '';
  const ozet = document.getElementById('rutin-ozet'); if (ozet) ozet.value = rutinData.aksam.ozet || '';
  const uyum = document.getElementById('rutin-uyum');
  if (uyum) { uyum.value = rutinData.aksam.uyum != null ? rutinData.aksam.uyum : 0; const uv = document.getElementById('rutin-uyum-v'); if (uv) uv.textContent = uyum.value + '%'; }
  const ders = document.getElementById('rutin-ders'); if (ders) ders.value = rutinData.aksam.ders || '';
  const sabahSt = document.getElementById('rutin-sabah-status');
  if (sabahSt) sabahSt.textContent = rutinData.sabah.plan && rutinData.sabah.plan.trim() ? 'Â· dolu âœ“' : '';
  const aksamSt = document.getElementById('rutin-aksam-status');
  if (aksamSt) aksamSt.textContent = rutinData.aksam.ozet && rutinData.aksam.ozet.trim() ? 'Â· dolu âœ“' : '';
  renderRutinStats();
  bindRutin();
}
async function renderRutinStats() {
  const box = document.getElementById('rutin-stats');
  if (!box) return;
  const streak = await rutinStreak();
  const adh = await rutinWeekAdh();
  box.innerHTML = '<div class="data-kpis">' +
    '<div class="kpi"><div class="k-lbl">Disiplin serisi</div><div class="k-val">' + streak + ' gÃ¼n</div><div class="k-sub">peÅŸ peÅŸe tamamlanan rutin</div></div>' +
    '<div class="kpi"><div class="k-lbl">Bu hafta uyum</div><div class="k-val">' + adh + '%</div><div class="k-sub">akÅŸam uyum ortalamasÄ±</div></div>' +
    '</div>';
}
async function rutinStreak() {
  let streak = 0;
  const d = new Date();
  const cur = await store.get(RUTIN_PREFIX + rutinIso(d));
  const todayDone = cur ? rutinDone(JSON.parse(cur)) : false;
  if (!todayDone) d.setDate(d.getDate() - 1);
  while (true) {
    const v = await store.get(RUTIN_PREFIX + rutinIso(d));
    if (!v || !rutinDone(JSON.parse(v))) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
async function rutinWeekAdh() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setDate(now.getDate() - day); mon.setHours(0, 0, 0, 0);
  let sum = 0, n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const v = await store.get(RUTIN_PREFIX + rutinIso(d));
    if (v) {
      try { const p = JSON.parse(v); if (p && p.aksam && p.aksam.uyum != null) { sum += Number(p.aksam.uyum) || 0; n++; } } catch (e) {}
    }
  }
  return n ? Math.round(sum / n) : 0;
}
function bindRutin() {
  if (rutinBound) return;
  rutinBound = true;
  const dt = document.getElementById('rutin-date');
  if (dt) dt.addEventListener('change', () => { renderRutin(); });
  const uyum = document.getElementById('rutin-uyum');
  if (uyum) uyum.addEventListener('input', () => { const uv = document.getElementById('rutin-uyum-v'); if (uv) uv.textContent = uyum.value + '%'; });
  const save = document.getElementById('rutin-save');
  if (save) save.addEventListener('click', async () => {
    rutinData.sabah.plan = document.getElementById('rutin-plan').value;
    rutinData.aksam.ozet = document.getElementById('rutin-ozet').value;
    rutinData.aksam.uyum = Number(document.getElementById('rutin-uyum').value) || 0;
    rutinData.aksam.ders = document.getElementById('rutin-ders').value;
    await store.set(rutinKey(), JSON.stringify(rutinData));
    const note = document.getElementById('rutin-note');
    if (note) { note.textContent = 'Rutin kaydedildi âœ“'; setTimeout(() => { note.textContent = ''; }, 3000); }
    renderRutinStats();
  });
  const clear = document.getElementById('rutin-clear');
  if (clear) clear.addEventListener('click', () => {
    if (!confirm('BugÃ¼nÃ¼n rutinini temizle?')) return;
    rutinData = { sabah: { tasks: {}, plan: '' }, aksam: { ozet: '', uyum: null, ders: '' } };
    store.set(rutinKey(), JSON.stringify(rutinData));
    renderRutin();
  });
  const nf = document.getElementById('rutin-notif');
  if (nf) nf.addEventListener('click', async () => {
    const ok = await enableNotif();
    if (nf) nf.textContent = ok ? 'ğŸ”” Bildirimler aÃ§Ä±k' : 'ğŸ”• Bildirim engellendi';
    const note = document.getElementById('rutin-note');
    if (note) { note.textContent = ok ? 'Bildirimler aÃ§Ä±ldÄ± â€” uygulama aÃ§Ä±kken hatÄ±rlatÄ±r.' : 'Ä°zin verilmedi â€” tarayÄ±cÄ± ayarlarÄ±ndan aÃ§abilirsin.'; setTimeout(() => { note.textContent = ''; }, 5000); }
  });
}

// ============ Feed SosyalleÅŸtirme ============
function toggleFeedLike(id) {
  const p = basFeed.find(x => x.id === id); if (!p) return;
  p.likes = (p.likes || 0) + (p.likedByMe ? -1 : 1);
  p.likedByMe = !p.likedByMe;
  saveFeed(); renderFeed();
}
function toggleFeedComments(id) {
  const el = document.getElementById('feed-comments-' + id);
  if (el) el.classList.toggle('open');
}
function addFeedComment(id) {
  const inp = document.getElementById('fc-in-' + id);
  if (!inp) return;
  const v = (inp.value || '').trim(); if (!v) return;
  const p = basFeed.find(x => x.id === id); if (!p) return;
  p.comments = p.comments || [];
  p.comments.push({ author: (document.getElementById('feed-author') ? document.getElementById('feed-author').value.trim() : '') || 'Alfa Trader', text: v, date: new Date().toISOString() });
  inp.value = '';
  saveFeed(); renderFeed();
}
function fillFeedFromTrade() {
  const pick = document.getElementById('feed-trade-pick');
  const ti = document.getElementById('feed-title');
  const tc = document.getElementById('feed-content');
  if (!pick || !ti || !tc) return;
  const idx = Number(pick.value);
  const dt = (Array.isArray(dataTrades) ? dataTrades : []);
  if (isNaN(idx) || !dt[idx]) return;
  const t = dt[idx];
  ti.value = (t.pair || '') + ' ' + (t.dir || '') + (t.r != null && t.r !== '' ? ' â€” ' + t.r + 'R' : '');
  tc.value = (t.strat ? 'Strateji: ' + t.strat + '\n' : '') + (t.model ? 'Entry Model: ' + t.model + '\n' : '') + (t.note ? t.note : '') + '\n(Trade GÃ¼nlÃ¼ÄŸÃ¼nden)';
  document.getElementById('feed-type').value = 'trade';
}

// ============ PWA & Bildirimler ============
let notifOn = false;
function registerSw() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}
function notifSupported() { return 'Notification' in window && 'serviceWorker' in navigator; }
async function enableNotif() {
  if (!notifSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    notifOn = perm === 'granted';
    try { localStorage.setItem('alfa-notif', notifOn ? '1' : '0'); } catch (e) {}
    return notifOn;
  } catch (e) { return false; }
}
async function notifNow(title, body, url) {
  if (!notifOn || !notifSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body: body || '', icon: '/favicon.png', badge: '/favicon.png', tag: 'alfa-' + Date.now(), data: { url: url || '/' } });
  } catch (e) {}
}
function startNotifLoop() {
  setInterval(() => {
    if (!notifOn) return;
    const d = new Date();
    const hm = d.getHours() * 60 + d.getMinutes();
    const SABAH = 9 * 60 + 30, AKSAM = 21 * 60;
    if (hm === SABAH && !sessionStorage.getItem('nt-sabah')) { sessionStorage.setItem('nt-sabah', '1'); notifNow('â˜€ï¸ Sabah rutini', 'BugÃ¼nÃ¼n planÄ±nÄ± yaz â€” grafikler, haber takvimi, risk bÃ¼tÃ§esi.'); }
    if (hm === AKSAM && !sessionStorage.getItem('nt-aksam')) { sessionStorage.setItem('nt-aksam', '1'); notifNow('ğŸŒ™ AkÅŸam Ã¶zeti', 'PlanÄ±na uydun mu? BugÃ¼nÃ¼n Ã¶zetini doldur.'); }
  }, 60000);
}
async function notifPendingR() {
  if (!notifOn) return;
  if (sessionStorage.getItem('nt-pend')) return;
  const pend = (Array.isArray(trades) ? trades : []).filter(t => t.r === '' || t.r === null || t.r === undefined).length;
  if (pend > 0) {
    sessionStorage.setItem('nt-pend', '1');
    notifNow('â³ ' + pend + ' iÅŸlemin R sonucu bekliyor', 'Trade GÃ¼nlÃ¼ÄŸÃ¼ sayfasÄ±ndaki panelden hÄ±zlÄ±ca girebilirsin.', '/?page=data');
  }
}
try { notifOn = localStorage.getItem('alfa-notif') === '1'; } catch (e) {}
registerSw();
startNotifLoop();
setTimeout(notifPendingR, 6000);
