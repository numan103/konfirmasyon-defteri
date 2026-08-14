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
          chip.innerHTML = wlLabel(sym) + '<button type="button" class="rm" title="Kaldır">✕</button>';
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