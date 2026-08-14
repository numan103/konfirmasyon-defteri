(function () {
      function num(s) { var v = parseFloat(s); return isNaN(v) ? null : v; }
      function fmtP(v) {
        if (v === null) return '—';
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
            var arrow = t.c >= 0 ? '▲' : '▼';
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
        } catch (e) { /* Binance başarısız — OKX dene */ }
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
          } catch (e) { /* OKX de başarısız */ }
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
        } catch (e) { /* Altın yok */ }
        try {
          var gs = await fetch('https://api.gold-api.com/price/XAG');
          var sj = await gs.json();
          if (sj && sj.price) pushItem('XAG', num(sj.price), null);
        } catch (e) { /* Gümüş yok */ }
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