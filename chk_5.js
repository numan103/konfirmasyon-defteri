const STORAGE_KEY = 'konfirmasyon-defteri-v3';
// ===== İletişim / sosyal bağlantılar (tek yerden düzenle) =====
const SOCIAL = {
  telegram: 'https://t.me/alfatradersweb',
  x: 'https://x.com/traderahmet_',
  youtube: 'https://www.youtube.com/@cryptotraderahmet',
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
  /* Landing equity curve — aylık noktalar + hover tooltip */
  (function () {
    const wrap = document.getElementById('hseq-wrap');
    if (!wrap) return;
    const svg = document.getElementById('hseq-svg');
    const ptsEl = document.getElementById('hseq-pts');
    if (!svg || !ptsEl || svg.dataset.ready) return;
    svg.dataset.ready = '1';
    const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem'];
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
      tip.innerHTML = '<b>' + g.dataset.m + '</b> · ' + fmt(parseInt(g.dataset.v, 10));
      const pr = wrap.getBoundingClientRect(), gr = g.getBoundingClientRect();
      tip.style.display = 'block';
      tip.style.left = (gr.left - pr.left + gr.width / 2) + 'px';
      tip.style.top = (gr.top - pr.top) + 'px';
    });
    ptsEl.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  })();
  /* Üst fiyat şeridi — sürükleyerek sola/sağa kaydır */
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
  set(['nc-tg', 'nc-tg-m', 'lps-tg', 'lp-comm-tg', 'bas-ask-tg'], SOCIAL.telegram);
  set(['nc-x', 'nc-x-m', 'lps-x', 'bas-ask-x'], SOCIAL.x);
  set(['nc-yt', 'nc-yt-m', 'lps-yt'], SOCIAL.youtube);
}
if (typeof document !== 'undefined') {
  if (document.readyState !== 'loading') applySocial();
  else document.addEventListener('DOMContentLoaded', applySocial);
}
// 12–17 Temmuz arası artifact verisinin gömülü yedeği — yalnızca depo boşsa yüklenir
const SEED = {"exported": "2026-07-18T13:07:40.649Z", "config": {"pairs": {"BTC": {"thresholds": {"aplus": 70, "b": 50}, "criteria": [{"name": "Spot CVD işlem yönünde", "cat": "veri", "l": 8, "s": 8}, {"name": "Open Interest işlem yönünde", "cat": "veri", "l": 6, "s": 6}, {"name": "Long & Shorts Ratio işlem yönünde", "cat": "veri", "l": 5, "s": 5}, {"name": "Futures CVD işlem yönünde", "cat": "veri", "l": 6, "s": 6}, {"name": "Bid & Ask Delta işlem yönünde", "cat": "veri", "l": 4, "s": 4}, {"name": "Orderbook kümelenmesi destekliyor", "cat": "veri", "l": 2, "s": 2}, {"name": "İşlem trend yönünde", "cat": "teknik", "l": 10, "s": 10}, {"name": "Key levelda", "cat": "teknik", "l": 10, "s": 10}, {"name": "Manipülasyon gerçekleşti", "cat": "teknik", "l": 8, "s": 8}, {"name": "Bias flip", "cat": "teknik", "l": 3, "s": 3}, {"name": "Planlanmış entry", "cat": "pozisyon", "l": 31, "s": 31}, {"name": "16:30 sonrası", "cat": "pozisyon", "l": 3, "s": 3}, {"name": "TP/SL paylaşımdan önce girildi", "cat": "pozisyon", "l": 4, "s": 4}, {"name": "Uykusuz / yorgunum", "cat": "duygu", "l": -8, "s": -8}, {"name": "Stresliyim (trade dışı kaynak)", "cat": "duygu", "l": -6, "s": -6}, {"name": "Aşırı yoğun / bölünmüş dikkat", "cat": "duygu", "l": -6, "s": -6}, {"name": "Az önce stop oldum — revenge penceresi", "cat": "duygu", "l": -12, "s": -12}, {"name": "FOMO — hareket kaçıyor hissi", "cat": "duygu", "l": -12, "s": -12}, {"name": "PnL paylaştım / coşku halindeyim", "cat": "duygu", "l": -8, "s": -8}]}, "XAU": {"thresholds": {"aplus": 70, "b": 50}, "criteria": [{"name": "Spot CVD işlem yönünde", "cat": "veri", "l": 8, "s": 8}, {"name": "Open Interest işlem yönünde", "cat": "veri", "l": 6, "s": 6}, {"name": "Long & Shorts Ratio işlem yönünde", "cat": "veri", "l": 5, "s": 5}, {"name": "Futures CVD işlem yönünde", "cat": "veri", "l": 6, "s": 6}, {"name": "Bid & Ask Delta işlem yönünde", "cat": "veri", "l": 4, "s": 4}, {"name": "Orderbook kümelenmesi destekliyor", "cat": "veri", "l": 2, "s": 2}, {"name": "İşlem trend yönünde", "cat": "teknik", "l": 10, "s": 10}, {"name": "Key levelda", "cat": "teknik", "l": 10, "s": 10}, {"name": "Manipülasyon gerçekleşti", "cat": "teknik", "l": 8, "s": 8}, {"name": "Bias flip", "cat": "teknik", "l": 3, "s": 3}, {"name": "Planlanmış entry", "cat": "pozisyon", "l": 31, "s": 31}, {"name": "16:30 sonrası", "cat": "pozisyon", "l": 3, "s": 3}, {"name": "TP/SL paylaşımdan önce girildi", "cat": "pozisyon", "l": 4, "s": 4}, {"name": "Uykusuz / yorgunum", "cat": "duygu", "l": -8, "s": -8}, {"name": "Stresliyim (trade dışı kaynak)", "cat": "duygu", "l": -6, "s": -6}, {"name": "Aşırı yoğun / bölünmüş dikkat", "cat": "duygu", "l": -6, "s": -6}, {"name": "Az önce stop oldum — revenge penceresi", "cat": "duygu", "l": -12, "s": -12}, {"name": "FOMO — hareket kaçıyor hissi", "cat": "duygu", "l": -12, "s": -12}, {"name": "PnL paylaştım / coşku halindeyim", "cat": "duygu", "l": -8, "s": -8}]}}, "strategies": ["Breaker", "Breaker Traps", "LHPB", "Monday Manipulation", "Asia Range", "IFVG", "0.382", "Friday Manipulation"], "matrix": {"Paz": {"London": "B", "NY": "B"}, "Pzt": {"London": "A+", "NY": "B"}, "Sal": {"London": "A+", "NY": "A+"}, "Çar": {"London": "A+", "NY": "A+"}, "Per": {"London": "A+", "NY": "A+"}, "Cum": {"London": "A+", "NY": "A+"}, "Cmt": {"London": "A+", "NY": "A+"}}, "migr2": true, "migr3": true, "migr4": true}, "trades": [{"id":1785301800000,"date":"28/07","time":"21:30","pair":"BTC","dir":"LONG","score":0,"verdict":"A+","crits":[],"miss":[],"mood":0,"day":"Sal","sess":"London","cell":"","cap":false,"strat":"Monday Manipulation","sent":"","r":"0","override":true}, {"id":1785204240000,"date":"27/07","time":"14:04","pair":"BTC","dir":"LONG","score":86,"verdict":"B","crits":[{"n":"Spot CVD işlem yönünde","p":8},{"n":"Open Interest işlem yönünde","p":6},{"n":"Long & Shorts Ratio işlem yönünde","p":5},{"n":"Futures CVD işlem yönünde","p":6},{"n":"Bid & Ask Delta işlem yönünde","p":4},{"n":"Orderbook kümelenmesi destekliyor","p":2},{"n":"İşlem trend yönünde","p":10},{"n":"Key levelda","p":10},{"n":"Planlanmış entry","p":31},{"n":"TP/SL paylaşımdan önce girildi","p":4}],"miss":["Manipülasyon gerçekleşti","Bias flip","16:30 sonrası","Uykusuz / yorgunum","Stresliyim (trade dışı kaynak)","Aşırı yoğun / bölünmüş dikkat","Az önce stop oldum — revenge penceresi","FOMO — hareket kaçıyor hissi","PnL paylaştım / coşku halindeyim"],"mood":0,"day":"Pzt","sess":"London","cell":"B","cap":false,"strat":"IFVG","sent":"","r":"-0.33"}, {"id": 1785138660000, "date": "22/07", "time": "19:51", "pair": "BTC", "dir": "LONG", "score": 100, "verdict": "A+", "crits": [{"n": "Spot CVD işlem yönünde", "p": 8}, {"n": "Open Interest işlem yönünde", "p": 6}, {"n": "Long & Shorts Ratio işlem yönünde", "p": 5}, {"n": "Futures CVD işlem yönünde", "p": 6}, {"n": "Bid & Ask Delta işlem yönünde", "p": 4}, {"n": "Orderbook kümelenmesi destekliyor", "p": 2}, {"n": "İşlem trend yönünde", "p": 10}, {"n": "Key levelda", "p": 10}, {"n": "Manipülasyon gerçekleşti", "p": 8}, {"n": "Planlanmış entry", "p": 31}, {"n": "16:30 sonrası", "p": 3}, {"n": "TP/SL paylaşımdan önce girildi", "p": 4}], "miss": ["Bias flip", "Uykusuz / yorgunum", "Stresliyim (trade dışı kaynak)", "Aşırı yoğun / bölünmüş dikkat", "Az önce stop oldum — revenge penceresi", "FOMO — hareket kaçıyor hissi", "PnL paylaştım / coşku halindeyim"], "mood": 0, "day": "Çar", "sess": "NY", "cell": "A+", "cap": false, "strat": "0.382", "sent": "SHORT", "r": "-1"}, {"id": 1784305032899, "date": "17/07", "time": "19:17", "pair": "BTC", "dir": "SHORT", "score": 75, "verdict": "A+", "crits": [{"n": "Spot CVD işlem yönünde", "p": 8}, {"n": "Open Interest işlem yönünde", "p": 6}, {"n": "Long & Shorts Ratio işlem yönünde", "p": 5}, {"n": "Futures CVD işlem yönünde", "p": 6}, {"n": "Bid & Ask Delta işlem yönünde", "p": 4}, {"n": "Manipülasyon gerçekleşti", "p": 8}, {"n": "Planlanmış entry", "p": 31}, {"n": "16:30 sonrası", "p": 3}, {"n": "TP/SL paylaşımdan önce girildi", "p": 4}], "miss": ["Orderbook kümelenmesi destekliyor", "İşlem trend yönünde", "Key levelda", "Bias flip", "Uykusuz / yorgunum", "Stresliyim (trade dışı kaynak)", "Aşırı yoğun / bölünmüş dikkat", "Az önce stop oldum — revenge penceresi", "FOMO — hareket kaçıyor hissi", "PnL paylaştım / coşku halindeyim"], "mood": 0, "day": "Cum", "sess": "NY", "cell": "A+", "cap": false, "strat": "Friday Manipulation", "r": "-1"}, {"id": 1784227494999, "date": "16/07", "time": "21:44", "pair": "BTC", "dir": "SHORT", "score": 87, "verdict": "A+", "crits": [{"n": "Spot CVD işlem yönünde", "p": 8}, {"n": "Open Interest işlem yönünde", "p": 6}, {"n": "Long & Shorts Ratio işlem yönünde", "p": 5}, {"n": "Futures CVD işlem yönünde", "p": 6}, {"n": "Bid & Ask Delta işlem yönünde", "p": 4}, {"n": "Orderbook kümelenmesi destekliyor", "p": 2}, {"n": "Key levelda", "p": 10}, {"n": "Manipülasyon gerçekleşti", "p": 8}, {"n": "Planlanmış entry", "p": 31}, {"n": "16:30 sonrası", "p": 3}, {"n": "TP/SL paylaşımdan önce girildi", "p": 4}], "miss": ["İşlem trend yönünde", "Bias flip", "Uykusuz / yorgunum", "Stresliyim (trade dışı kaynak)", "Aşırı yoğun / bölünmüş dikkat", "Az önce stop oldum — revenge penceresi", "FOMO — hareket kaçıyor hissi", "PnL paylaştım / coşku halindeyim"], "mood": 0, "day": "Per", "sess": "NY", "cell": "A+", "cap": false, "strat": "Breaker", "r": ""}, {"id": 1784016989916, "date": "14/07", "time": "11:16", "pair": "BTC", "dir": "SHORT", "score": 65, "verdict": "B", "crits": [{"n": "Spot CVD işlem yönünde", "p": 8}, {"n": "Open Interest işlem yönünde", "p": 6}, {"n": "Futures CVD işlem yönünde", "p": 6}, {"n": "Key levelda", "p": 10}, {"n": "Planlanmış entry", "p": 31}, {"n": "TP/SL paylaşımdan önce girildi", "p": 4}], "miss": ["Long & Shorts Ratio işlem yönünde", "Bid & Ask Delta işlem yönünde", "Orderbook kümelenmesi destekliyor", "İşlem trend yönünde", "Manipülasyon gerçekleşti", "Bias flip", "16:30 sonrası", "Uykusuz / yorgunum", "Stresliyim (trade dışı kaynak)", "Aşırı yoğun / bölünmüş dikkat", "Az önce stop oldum — revenge penceresi", "FOMO — hareket kaçıyor hissi", "PnL paylaştım / coşku halindeyim"], "mood": 0, "day": "Sal", "sess": "London", "cell": "A+", "cap": false, "strat": "Asia Range", "r": "-0.3"}, {"id": 1783955071586, "date": "13/07", "time": "18:04", "pair": "BTC", "dir": "SHORT", "score": 73, "verdict": "B", "crits": [{"n": "Spot CVD düşüyor", "p": 8}, {"n": "Open Interest yüksek / artıyor", "p": 7}, {"n": "Futures CVD işlem yönünde", "p": 6}, {"n": "Bid & Ask Delta işlem yönünde", "p": 5}, {"n": "Key levelda", "p": 11}, {"n": "Planlanmış entry", "p": 30}, {"n": "TP/SL paylaşımdan önce girildi", "p": 6}], "miss": ["Spot CVD yükseliyor", "Long & Shorts Ratio aşırı long", "Orderbook kümelenmesi destekliyor", "İşlem trend yönünde", "Manipülasyon gerçekleşti", "Bias flip", "16:30 sonrası", "Uykusuz / yorgunum", "Stresliyim (trade dışı kaynak)", "Aşırı yoğun / bölünmüş dikkat", "Az önce stop oldum — revenge penceresi", "FOMO — hareket kaçıyor hissi", "PnL paylaştım / coşku halindeyim"], "r": "-0.15", "override": true, "strat": "Sunday Market Structure "}, {"id": 1783882244056, "date": "12/07", "time": "21:50", "pair": "BTC", "dir": "SHORT", "score": 82, "verdict": "B", "crits": ["Spot CVD düşüyor", "Long & Shorts Ratio aşırı long", "Futures CVD işlem yönünde", "Bid & Ask Delta işlem yönünde", "Key levelda", "Manipülasyon gerçekleşti", "Planlanmış entry", "TP/SL paylaşımdan önce girildi"], "r": "1.2", "override": true, "strat": "Monday Morning Manipulation"}], "dailyPlans": {"2026-07-27":{"bias":"BULLISH","pair":"BTC","sabah":"","senaryo":"fiyatın trend yönlü en azından 65.8k'ya kadar yükseleceğini düşünüyorum.","anti":"fiyat haftayı yükselişle açtı önce late longcuları avlayıp sonra yükseltebilir.","setup":"IFVG","gunsonu":""},"2026-07-28":{"bias":"BULLISH","pair":"BTC","sabah":"","senaryo":"","anti":"","setup":"Monday Manipulation","gunsonu":"saat 21:30 civarında hala yükselemeyen fiyat düşer diye işlemi kapattım yarın fiyat düşmüştü."},"2026-07-12": {"bias": "BEARISH", "pair": "BTC", "sabah": "abd iranı vurabilir ", "senaryo": "fiyat en azından bi 61k civarına gitmesi gerektiğini düşünüyorum. Eğer fiyat 65k üstüne çıkarsa bozulur", "anti": "şuanda markette hala hacim yok likiditie alımı yapılmış gibi geldi ama aslında gelmedi, orayı bir hacimle manipüle edebilir ve stop olabilirsin.", "setup": "", "gunsonu": "plana uydum tek yaptığım hata 2R da tp girmemekti, işlem tam hedefe giderken ufak bi pips ile geri döndü hala bekliyorum ayrıca iyi yaptığım şey erken entry stop atmamaktı gece açılışıyla fiyat yukarıyı avlamış ve düşmüş. "}, "2026-07-13": {"bias": "BEARISH", "pair": "BTC", "sabah": "iran her an saldırabilir manipülasyon saatleri sabah 13:46", "senaryo": "4h pin bar bıraktık üstünü avladık fiyat aşağı doğru düştü demekki güçsüz görünüyor. \n\n63.5k üstünde kapatırsa bu düşüncem bozulur. ", "anti": "Aşağı düştü shortlayalım diyen early shortçuları avlamak isteyip tekrar 63.250'yi avlayabilirler ny açılışıyla ama neden bunu yapsınlar. ", "setup": "", "gunsonu": "fiyat hedefine ulaştı high avalamadan eğer dar stoplu işlem açsaydım minimum 0.9r poz vardı ama asıl target aşağı açık likidite olduğu için açık HL yaptıktan sonra geri döndü 0.5r'dan poz döndü. Bu arada riskim 0.3r pzt sabah olduğu için riskli zaman dilimi."}, "2026-07-14": {"bias": "BULLISH", "pair": "BTC", "sabah": "15:30'da tüfe var. ", "senaryo": "fiyatın 61.5k civarına düşeceğini düşünüyorum. Yükselecekse bile en azından 62.2k dan yükselmeli (VAL) \n\n\nFiyat 62.9k üstünde saatlik kapanış yaparsa bias bozulur.\n\n\nsaat 16:11 şuan fiyat yukarıyı avladı, hem sr bölgesine geri çekilip daha sonra yukarıdaki likiditeleri avlayabilir veriler beni doğruluyor. \n\nEğer fiyat 62.7k altında 1h kapanışlar yaparsa uza. ", "anti": "fiyat iç yapıda değişim gerçekleştirdi, o sebeple önce monday high alabilir. \n\nsaat:16:18Fiyat haberle yükseldi bu yüzden tam tersi yönlü düşebilir ters bir haberle", "setup": "ya 16:30 dan sonraki harekete göre girersin ya da fiyatın 61.5k sonrası yapacağı harekete bakarsın. \n\n\n16:18Fiyat 63k'daki sr bölgesine geri çekilirse 0.382 işlemini alırsın.", "gunsonu": "işlem 1.78RR verdiği için ve aleyhime ilerlediği için işlemden çıkıp tekrar 2RR olacak şekilde girdim. \n\nHaber geldi fiyat bi anda stop oldu işlemler. "}, "2026-07-16": {"bias": "BEARISH", "pair": "BTC", "sabah": "haber yok fiyat bearish", "senaryo": "fiyat yukarıyı avladı market yapısı değişti hedefler aşağısı \n\nfiyat 65.6k üstü kapatırsa", "anti": "herkes buradan short düşünüyor, range çok bariz trend bullish orderbook seviyeleri var.", "setup": "breaker+range", "gunsonu": "plana uydum genel olarak, sadece 2. işlem intraday alınabilirdi 2R veriyordu riski artırmamak için almadım ama tp oldu."}, "2026-07-17": {"bias": "BEARISH", "pair": "BTC", "sabah": "", "senaryo": "fiyat 63.3k manipüle edip altında kapanışlar yaparsa cuma 18:00'dan sonra shortla. ", "anti": "fiyatta hacim artıyor, çoğu kişi shortta range için fiyatı yükseltebilirler. ", "setup": "cuma akşamı 18:00 civarı manipülasyonu tradele.", "gunsonu": "evet manipülasyonu bekledim ve ifvg ile işleme dahil oldum ama stop oldum."}, "2026-07-22": {"bias": "BULLISH", "pair": "BTC", "sabah": "Olumlu bir haber gelebilir", "senaryo": "Fiyat eğer 65.7k civarı 2 adet kötü mum atarsa düşebilir", "anti": "Impulsive entry almak isteyen beni ve htf ciddi bir direnç noktasında olduğu için efloud beni stoplayabilir", "setup": "Breaker / 0.382", "gunsonu": ""}}};
const CATS = { veri: 'Veri', teknik: 'Teknik', pozisyon: 'Pozisyon', duygu: 'Duygu' };

// ============ Kimlik + Bulut Yapılandırması (Supabase) ============
// Aşağıdaki iki değeri kendi Supabase projenden alıp yapıştır.
// Boş bırakılırsa uygulama eskisi gibi YALNIZCA bu cihazda (yerel) çalışır — hiçbir şey bozulmaz.
const SUPABASE_URL = 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';

const AUTH = {
  client: null,
  user: null,      // giriş yapılınca Supabase kullanıcı nesnesi
  cloud: {},       // bu kullanıcının tüm anahtar->değer haritası (bellek içi ayna)
  ns: '',          // localStorage için kullanıcıya özel önek
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
  } catch (e) { /* çevrimdışı olabilir; yerel ayna korunur */ }
}

// Depolama katmanı:
//  - Giriş yapılmışsa  -> veriler AUTH.cloud haritasında tutulur ve Supabase'e senkronlanır (cihazlar arası).
//  - Giriş yoksa       -> eski davranış: window.storage (Claude) ya da localStorage (bu cihaz).
const store = {
  async get(k) {
    if (AUTH.user) {
      if (k in AUTH.cloud) return AUTH.cloud[k];
      try {
        let v = localStorage.getItem(AUTH.ns + k);
        if (v === null) v = localStorage.getItem(k);
        if (v !== null) return v;
      } catch (e) {}
      return null;
    }
    if (window.storage && window.storage.get) {
      try { const r = await window.storage.get(k); return r && r.value ? r.value : null; }
      catch (e) { /* anahtar yok ya da erişilemedi */ }
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
    if (!ok) { try { localStorage.setItem(k, v); ok = true; } catch (e) { /* hafızada kalır */ } }
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
      { name: 'Spot CVD işlem yönünde', cat: 'veri', l: 8, s: 8 },
      { name: 'Open Interest işlem yönünde', cat: 'veri', l: 6, s: 6 },
      { name: 'Long & Shorts Ratio işlem yönünde', cat: 'veri', l: 5, s: 5 },
      { name: 'Futures CVD işlem yönünde', cat: 'veri', l: 6, s: 6 },
      { name: 'Bid & Ask Delta işlem yönünde', cat: 'veri', l: 4, s: 4 },
      { name: 'Orderbook kümelenmesi destekliyor', cat: 'veri', l: 2, s: 2 },
      { name: 'İşlem trend yönünde', cat: 'teknik', l: 10, s: 10 },
      { name: 'Key levelda', cat: 'teknik', l: 10, s: 10 },
      { name: 'Manipülasyon gerçekleşti', cat: 'teknik', l: 8, s: 8 },
      { name: 'Bias flip', cat: 'teknik', l: 3, s: 3 },
      { name: 'Planlanmış entry', cat: 'pozisyon', l: 31, s: 31 },
      { name: '16:30 sonrası', cat: 'pozisyon', l: 3, s: 3 },
      { name: 'TP/SL paylaşımdan önce girildi', cat: 'pozisyon', l: 4, s: 4 },
      { name: 'Uykusuz / yorgunum', cat: 'duygu', l: -8, s: -8 },
      { name: 'Stresliyim (trade dışı kaynak)', cat: 'duygu', l: -6, s: -6 },
      { name: 'Aşırı yoğun / bölünmüş dikkat', cat: 'duygu', l: -6, s: -6 },
      { name: 'Az önce stop oldum — revenge penceresi', cat: 'duygu', l: -12, s: -12 },
      { name: 'FOMO — hareket kaçıyor hissi', cat: 'duygu', l: -12, s: -12 }
    ]
  };
}

function defaultXauPair() {
  return {
    thresholds: { aplus: 70, b: 50 },
    criteria: [
      // VERİ — gold'da orderflow konfluensi yok; sadece kırmızı haber cezası
      { name: 'Kırmızı haber var / yaklaşıyor', cat: 'veri', l: -15, s: -15 },
      // TEKNİK — gold'un çekirdeği burada (7 kalem toplamı = 70, tam A+ eşiği)
      { name: 'Manipülasyon kesin', cat: 'teknik', l: 14, s: 14 },
      { name: 'Likidite alındı', cat: 'teknik', l: 14, s: 14 },
      { name: 'Daily / 4H OTE bölgesinde', cat: 'teknik', l: 10, s: 10 },
      { name: 'Daily / 4H arz-talep bölgesinde', cat: 'teknik', l: 10, s: 10 },
      { name: 'Yapı net', cat: 'teknik', l: 8, s: 8 },
      { name: 'Günlük / 4H / 1H mum uyumlu', cat: 'teknik', l: 8, s: 8 },
      { name: 'Manipülasyon saatinde', cat: 'teknik', l: 6, s: 6 },
      // POZİSYON — planlı giriş otoritesi + iki ceza
      { name: 'Entry sabah yazılan Daily Bias planından geliyor (seans içinde üretilmedi)', cat: 'pozisyon', l: 20, s: 20 },
      { name: 'Peş peşe 2. kez aynı bölgeden giriyorum', cat: 'pozisyon', l: -12, s: -12 },
      { name: 'Daily plana zıt işlem', cat: 'pozisyon', l: -15, s: -15 },
      // DUYGU — cezalar (kilit)
      { name: 'Uykusuz / yorgunum', cat: 'duygu', l: -8, s: -8 },
      { name: 'Stresliyim (trade dışı kaynak)', cat: 'duygu', l: -6, s: -6 },
      { name: 'Az önce stop oldum — revenge penceresi', cat: 'duygu', l: -12, s: -12 },
      { name: 'FOMO — hareket kaçıyor hissi', cat: 'duygu', l: -12, s: -12 }
    ]
  };
}

let config = { pairs: { BTC: defaultPair(), XAU: defaultXauPair() } };
let pair = 'BTC';
let direction = 'LONG';
let checked = new Set();

const DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const SESSIONS = ['London', 'NY'];
let session = 'London';
let strat = '';
let model = '';

// ============ Yapay Zeka Profili (izole — kullanıcı config'ine dokunmaz) ============
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
  } catch (e) { /* boş başla */ }
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
      ? ' · ' + aiProfile.emotions.join(', ') : '';
    name.textContent = (aiProfile.gold ? 'Altın (XAU)' : 'Kripto') + ' profili' +
      (aiProfile.strategy ? ' · ' + aiProfile.strategy : '') + emos +
      (aiProfile.note ? ' · 📝 ' + aiProfile.note : '');
  } else {
    b.classList.add('hidden');
  }
}

function pairDays(p) {
  const isGold = p === 'XAU' || p.indexOf('XAU') !== -1 || p.indexOf('GOLD') !== -1;
  return isGold ? ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'] : ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
}
function pairSessions(p) {
  const isGold = p === 'XAU' || p.indexOf('XAU') !== -1 || p.indexOf('GOLD') !== -1;
  return isGold ? ['—'] : ['London', 'NY'];
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
      // gold: pazartesi tavanı B (A+ olamaz); geri kalan A+
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
  const base = config.stratByPair[p].slice();
  const removed = new Set(config.stratRemoved || []);
  if (Array.isArray(config.stratGlobal) && config.stratGlobal.length) {
    config.stratGlobal.forEach(s => { if (s && !base.includes(s) && !removed.has(s)) base.push(s); });
  }
  return base;
}
function defaultModelsFor() {
  return ['H1 FVG + M15 iBOS', 'M15 BOS + FVG', 'Liquidity Grab + Reversal', 'IFVG', 'H4 POI + M15 MSS'];
}
function modelsFor(p) {
  if (!config.modelsByPair) config.modelsByPair = {};
  if (!Array.isArray(config.modelsByPair[p])) config.modelsByPair[p] = defaultModelsFor();
  const base = config.modelsByPair[p].slice();
  const removed = new Set(config.modelRemoved || []);
  if (Array.isArray(config.modelGlobal) && config.modelGlobal.length) {
    config.modelGlobal.forEach(m => { if (m && !base.includes(m) && !removed.has(m)) base.push(m); });
  }
  return base;
}
// Notion'dan strateji ve entry model seçeneklerini getirip listeye sürekli birleştirir
async function loadNotionOptions() {
  try {
    const res = await fetch('/api/notion-trades?mode=options');
    const j = await res.json().catch(() => ({}));
    if (!j || (!Array.isArray(j.strategies) && !Array.isArray(j.models))) return;
    let changed = false;
    if (Array.isArray(j.strategies)) {
      if (!config.stratGlobal) config.stratGlobal = [];
      j.strategies.forEach(s => { if (s && !config.stratGlobal.includes(s)) { config.stratGlobal.push(s); changed = true; } });
    }
    if (Array.isArray(j.models)) {
      if (!config.modelGlobal) config.modelGlobal = [];
      j.models.forEach(m => { if (m && !config.modelGlobal.includes(m)) { config.modelGlobal.push(m); changed = true; } });
    }
    if (changed) { saveConfig(); renderChips(); }
  } catch (e) {}
}
function matrixFor(p) {
  if (!config.matrixByPair) config.matrixByPair = {};
  if (!config.matrixByPair[p]) config.matrixByPair[p] = defaultMatrixFor(p);
  // eksik gün/seans tamamla
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
    // hazır strateji listesi öne eklenir, kullanıcının kendi ekledikleri korunur
    const mine = defaultStrategies();
    const extras = config.strategies.filter(s => !mine.includes(s));
    config.strategies = mine.concat(extras);
    config.migr3 = true;
  }
  if (!config.migr4) {
    // kriter varsayılanları otomatik yenilenir; kullanıcının kendi eklediği satırlar korunur
    const oldNames = [
      'Spot CVD yükseliyor', 'Spot CVD düşüyor', 'Open Interest yüksek / artıyor',
      'Long & Shorts Ratio aşırı long'
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
    // XAU (ve GOLD adlı pairler) kripto kriterlerinden altına özel sete geçirilir;
    // kullanıcının kendi eklediği satırlar korunur
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
    // Breaker Traps stratejisi emekli edildi — chip listesinden düşer, eski işlem kayıtları etkilenmez
    config.strategies = (config.strategies || []).filter(s => s !== 'Breaker Traps');
    config.migr6 = true;
  }
  if (!config.migr7) {
    // Duygu paneli kilit moduna geçti; 'PnL paylaştım' pozisyon-esnası paneline taşındı
    Object.keys(config.pairs).forEach(p => {
      config.pairs[p].criteria = (config.pairs[p].criteria || [])
        .filter(c => c.name !== 'PnL paylaştım / coşku halindeyim');
    });
    config.migr7 = true;
  }
  if (!config.migr8) {
    // XAU profili yeniden tasarlandı (gold-spesifik teknik + ceza seti); kullanıcının kendi eklediği satırlar korunur
    const oldXauNames = new Set([
      'DXY işlem yönünü destekliyor', 'Futures CVD işlem yönünde', 'Open Interest işlem yönünde',
      'Takvim temiz — kırmızı haber yok / geçti', 'İşlem HTF trend yönünde', 'HTF key levelda (H4 / Daily)',
      'Likidite süpürüldü (stop hunt / manipülasyon)', 'LHPB/LLPB kapanış teyidi geldi',
      'Order önceden yerleştirildi — tipi ve seviyesi kontrol edildi', 'London / NY kill zone içinde',
      'Rejim Değişim Testi geçti (Kural VIII — LONG şartı)'
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
    // strateji & matris pariteye özel hale geldi; eski ortak değerler BTC'ye taşınır, XAU kendi setine kurulur
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
      'Manipülasyon kesin': 12, 'Likidite alındı': 12, 'Yapı net': 10,
      'Daily / 4H OTE bölgesinde': 10, 'Daily / 4H arz-talep bölgesinde': 10,
      'Günlük / 4H / 1H mum bakıldı': 8, 'Manipülasyon saatinde': 8
    };
    const goldDefNames = new Set(defaultXauPair().criteria.map(c => c.name));
    Object.keys(config.pairs).forEach(p => {
      if (p !== 'XAU' && p.indexOf('XAU') === -1 && p.indexOf('GOLD') === -1) return;
      const crit = config.pairs[p].criteria || [];
      // mevcut teknik kalemlerin puanını güncelle
      crit.forEach(c => { if (c.cat === 'teknik' && newTech[c.name] !== undefined) { c.l = newTech[c.name]; c.s = newTech[c.name]; } });
      // eksik yeni teknik kalemleri, son teknik kalemin ardına ekle
      ['Daily / 4H OTE bölgesinde', 'Daily / 4H arz-talep bölgesinde'].forEach(nm => {
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
      'Manipülasyon kesin': 14, 'Likidite alındı': 14,
      'Daily / 4H OTE bölgesinde': 10, 'Daily / 4H arz-talep bölgesinde': 10,
      'Yapı net': 8, 'Günlük / 4H / 1H mum uyumlu': 8, 'Manipülasyon saatinde': 6
    };
    const dropEmo = new Set(['Önceki işlemi kaçırdım — telafi hissi var', 'Bugün aynı bias ile 2. kez giriyorum']);
    Object.keys(config.pairs).forEach(p => {
      if (p !== 'XAU' && p.indexOf('XAU') === -1 && p.indexOf('GOLD') === -1) return;
      let crit = config.pairs[p].criteria || [];
      // mum kriterini yeniden adlandır
      crit.forEach(c => { if (c.name === 'Günlük / 4H / 1H mum bakıldı') c.name = 'Günlük / 4H / 1H mum uyumlu'; });
      // teknik puanları güncelle
      crit.forEach(c => { if (c.cat === 'teknik' && newTech[c.name] !== undefined) { c.l = newTech[c.name]; c.s = newTech[c.name]; } });
      // iki duygu kalemini çıkar
      crit = crit.filter(c => !dropEmo.has(c.name));
      config.pairs[p].criteria = crit;
    });
    // gold strateji listesinden 0.382 ve Monday Manipulation çıkar
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
  return m < 990 ? 'London' : 'NY'; // 16:30 öncesi London, sonrası NY
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
let sent = ''; // '' | 'LONG' | 'SHORT' — kalabalığın yönü
let intent = ''; // '' | 'setup' | 'emo' — giriş niyeti
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
// ——— Pozisyon Esnasında: müdahale filtresi ———
// valid=true satırlar plan gereği çıkış sebebidir; diğerleri dürtüdür, kapatma gerekçesi değildir
const POS_ITEMS_BTC = [
  { name: 'İnvalidasyon gerçekleşti — senaryo bozuldu', valid: true },
  { name: 'Planda yazılı haber riski geldi / yaklaşıyor', valid: true },
  { name: 'Fiyat istediğim gibi gitmiyor (invalidasyon yok)', valid: false },
  { name: 'PnL paylaştım', valid: false },
  { name: "TP'nin ucundan geri döndü — kapat dürtüsü", valid: false },
  { name: "Breakeven'a çekme dürtüsü", valid: false },
  { name: 'Her muma tepki veriyorum — ekrandan kalk', valid: false }
];
// Gold: soru formatlı kontrol listesi — invalidasyon çıkış sebebi, gerisi "doğru yaptın mı" denetimi
const POS_ITEMS_XAU = [
  { name: 'İnvalidasyon gerçekleşti mi?', valid: true },
  { name: 'TP doğru şekilde mi uzatıldı?', valid: false },
  { name: 'Murphy yasası doğru hesaplandı mı?', valid: false },
  { name: 'Geceye bırakılan işlem mantıklı mı?', valid: false },
  { name: 'TP ucundan dönen işlem kapandı mı?', valid: false }
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
  h.textContent = 'Pozisyon Esnasında — Düzenle';
  box.appendChild(h);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.style.cssText = 'margin:0 0 12px;';
  hint.textContent = 'Cümleyi değiştir, ÇIKIŞ (plan gereği kapatma sebebi) / DÜRTÜ (hissi kapatma gerekçesi) seç, × ile sil ya da en alta yeni ekle. Kaydedince panel anında güncellenir.';
  box.appendChild(hint);
  const rows = document.createElement('div');
  rows.id = 'pe-rows';
  const addRow = (it) => {
    const row = document.createElement('div'); row.className = 'pe-row';
    const inp = document.createElement('input'); inp.value = it.name; inp.placeholder = 'Kural cümlesi';
    inp.addEventListener('input', () => { it.name = inp.value; });
    const sel = document.createElement('select');
    const o1 = document.createElement('option'); o1.value = 'cikis'; o1.textContent = 'ÇIKIŞ';
    const o2 = document.createElement('option'); o2.value = 'durtu'; o2.textContent = 'DÜRTÜ';
    sel.appendChild(o1); sel.appendChild(o2);
    sel.value = it.valid ? 'cikis' : 'durtu';
    sel.addEventListener('change', () => { it.valid = sel.value === 'cikis'; });
    const del = document.createElement('button'); del.type = 'button'; del.className = 'pe-del'; del.textContent = '×'; del.title = 'Sil';
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
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn'; cancel.textContent = 'Vazgeç';
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
  { v: 'impatience', lbl: 'Sabırsızlık' },
  { v: 'fear', lbl: 'Korku / Çekinme' },
  { v: 'overconfidence', lbl: 'Aşırı özgüven' },
  { v: 'distracted', lbl: 'Dikkat dağınıklığı' },
  { v: 'overtrading', lbl: 'Aşırı işlem' }
];
const AI_CONCEPTS = [
  { v: 'ICT', lbl: 'ICT / SMC' },
  { v: 'PA', lbl: 'Price Action' },
  { v: 'IND', lbl: 'İndikatörler' },
  { v: 'OF', lbl: 'Orderflow' },
  { v: 'ONC', lbl: 'On-chain' },
  { v: 'KLASIK', lbl: 'Klasik / Fib' }
];
const AI_PROBLEMS = [
  { v: 'stop', lbl: 'Stop çekmiyorum' },
  { v: 'early', lbl: 'Erken giriş' },
  { v: 'late', lbl: 'Geç giriş' },
  { v: 'overtrade', lbl: 'Aşırı işlem' },
  { v: 'revenge', lbl: 'İntikam trade’i' },
  { v: 'riskbig', lbl: 'Risk büyütme' },
  { v: 'tpclose', lbl: 'Erken kapatma' },
  { v: 'news', lbl: 'Haber anında girme' },
  { v: 'focus', lbl: 'Odak kaybı' }
];
let aiEmoDraft = [];
let aiConceptDraft = [];
let aiProblemDraft = [];

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

function renderAiProblems() {
  const box = document.getElementById('ai-problems');
  if (!box) return;
  box.innerHTML = '';
  AI_PROBLEMS.forEach(e => {
    const c = document.createElement('span');
    c.className = 'chip' + (aiProblemDraft.includes(e.v) ? ' on' : '');
    c.textContent = e.lbl;
    c.setAttribute('role', 'button');
    c.addEventListener('click', () => {
      if (aiProblemDraft.includes(e.v)) aiProblemDraft = aiProblemDraft.filter(x => x !== e.v);
      else aiProblemDraft.push(e.v);
      renderAiProblems();
    });
    box.appendChild(c);
  });
}

function aiProfileFromForm() {
  return {
    market: document.getElementById('ai-market').value,
    experience: document.getElementById('ai-exp').value,
    style: document.getElementById('ai-style').value,
    concepts: aiConceptDraft.slice(),
    strategy: document.getElementById('ai-strat').value.trim(),
    emotions: aiEmoDraft.slice(),
    problem: aiProblemDraft.slice()
  };
}

function aiMarketInfo(m) {
  const s = String(m || 'kripto').toLowerCase();
  return {
    gold: s.indexOf('xau') !== -1 || s.indexOf('altin') !== -1 || s.indexOf('altın') !== -1,
    silver: s.indexOf('xag') !== -1 || s.indexOf('gümüş') !== -1 || s.indexOf('gumus') !== -1,
    dxy: s.indexOf('dxy') !== -1,
    fx: s.indexOf('fx') !== -1 || s.indexOf('eurusd') !== -1 || s.indexOf('gbpusd') !== -1,
    endeks: s.indexOf('endeks') !== -1 || s.indexOf('nas') !== -1 || s.indexOf('spx') !== -1 || s.indexOf('dow') !== -1,
    emtia: s.indexOf('emtia') !== -1 || s.indexOf('petrol') !== -1 || s.indexOf('oil') !== -1 || s.indexOf('gaz') !== -1,
    futures: s.indexOf('futures') !== -1 || s.indexOf('perpetual') !== -1 || s.indexOf('vadeli') !== -1
  };
}

function fallbackAiProfile(form, feedback) {
  const mk = aiMarketInfo(form.market);
  const gold = mk.gold, silver = mk.silver, dxy = mk.dxy, fx = mk.fx, endeks = mk.endeks, emtia = mk.emtia, futures = mk.futures;
  const precious = gold || silver;
  const beginner = String(form.experience || '').indexOf('yeni') !== -1;
  const style = String(form.style || 'intraday').toLowerCase();
  const concepts = (Array.isArray(form.concepts) ? form.concepts : []).map(String);
  const has = (v) => concepts.indexOf(v) !== -1;
  const emoPts = { fomo: 12, revenge: 12, impatience: 10, fear: 8, overconfidence: 10, distracted: 8, overtrading: 10 };
  const emoChipLbl = { fomo: 'FOMO — hareket kaçıyor hissi', revenge: 'Az önce stop oldum — revenge penceresi', impatience: 'Sabırsızlık — setup eksikken girme dürtüsü', fear: 'Korku / çekinme — plana rağmen girememe', overconfidence: 'Aşırı özgüven — risk büyütme dürtüsü', distracted: 'Dikkat dağınıklığı / bölünmüş odak', overtrading: 'Aşırı işlem — boş ekran dürtüsü' };
  const probLbl = {
    stop: 'Stop çekmiyorum / geç koyuyorum', revenge: 'İntikam penceresi — kaybın üstüne basıyorum', early: 'Erken giriyorum — sinyali beklemeden',
    late: 'Geç giriyorum — fırsatı kaçırıyorum', overtrade: 'Aşırı işlem — boş ekran dürtüsü', riskbig: 'Kazandıkça riski büyütüyorum',
    tpclose: 'TP’ye yaklaşınca erkenden kapatıyorum', news: 'Haber anında işlem açıyorum', focus: 'Odak kaybı — ekranı terk ediyorum'
  };
  const criteria = [];
  const add = (c) => { if (!criteria.some(x => x.name === c.name)) criteria.push(c); };

  // ---------- VERİ ----------
  if (precious) {
    add({ name: 'Kırmızı haber var / yaklaşıyor (merkez bankası, ABD verileri)', cat: 'veri', l: -15, s: -15 });
    add({ name: 'DXY (dolar endeksi) işlem yönüyle uyumlu', cat: 'veri', l: 6, s: 6 });
    add({ name: 'Veri takvimi sakin — sürpriz riski düşük', cat: 'veri', l: 5, s: 5 });
    add({ name: 'London/NY likidite penceresi (seans açılışı) uygun', cat: 'veri', l: 4, s: 4 });
    if (silver) add({ name: 'Altın (XAU) ile korelasyon / eş yönlülük net', cat: 'veri', l: 4, s: 4 });
    else add({ name: 'Asya seansı birikimi / ara seviyeler temiz', cat: 'veri', l: 3, s: 3 });
  } else if (dxy) {
    add({ name: 'ABD faiz beklentisi / enflasyon verisi gündemde değil', cat: 'veri', l: -12, s: -12 });
    add({ name: 'Güvenli liman akışı işlem yönünde', cat: 'veri', l: 5, s: 5 });
    add({ name: 'Piyasa risk iştahı aşırı uçta değil (DXY için)', cat: 'veri', l: 4, s: 4 });
    add({ name: 'Seans aralığı (London/NY açılışı) uygun', cat: 'veri', l: 4, s: 4 });
    add({ name: 'Haber öncesi DXY pozisyonu / kaçınma kararı net', cat: 'veri', l: 3, s: 3 });
    add({ name: 'Paralel varlıklar (altın, EUR/USD) DXY ile uyumlu', cat: 'veri', l: 3, s: 3 });
  } else if (fx) {
    add({ name: 'Pariteyi etkileyen haber / merkez bankası sakin', cat: 'veri', l: -12, s: -12 });
    add({ name: 'Dolar endeksi / ilgili çapraz trend yönünde', cat: 'veri', l: 5, s: 5 });
    add({ name: 'Likidite penceresi (London/NY açılışı) uygun', cat: 'veri', l: 4, s: 4 });
    add({ name: 'EUR/USD ile DXY korelasyonu işlemle uyumlu', cat: 'veri', l: 3, s: 3 });
    add({ name: 'Parite yapısı (H1 trend) işlem yönünde', cat: 'veri', l: 3, s: 3 });
    add({ name: 'Spread / swap normal — sakin saatte işlem değil', cat: 'veri', l: 3, s: 3 });
  } else if (endeks) {
    add({ name: 'Futures açılışı / vade hareketi işlem yönünde', cat: 'veri', l: -12, s: -12 });
    add({ name: 'Faiz beklentisi / makro haber sakin', cat: 'veri', l: 5, s: 5 });
    add({ name: 'Endeks hacmi işlem yönünü destekliyor', cat: 'veri', l: 4, s: 4 });
    add({ name: 'Risk iştahı (korelasyonlu varlıklar) uyumlu', cat: 'veri', l: 3, s: 3 });
    add({ name: 'Futures-spot farkı (basis) normal', cat: 'veri', l: 3, s: 3 });
    add({ name: 'NY açılışı (15:30) / saat aralığı uygun', cat: 'veri', l: 3, s: 3 });
  } else if (emtia) {
    add({ name: 'Arz-talep haberi yok / stok verisi (API/EIA) sakin', cat: 'veri', l: -12, s: -12 });
    add({ name: 'Dolar (DXY) işlem yönüyle uyumlu', cat: 'veri', l: 5, s: 5 });
    add({ name: 'Seans aralığı (London/NY) uygun', cat: 'veri', l: 4, s: 4 });
    add({ name: 'Stok verisi saati (API/EIA) biliniyor — haber anında değil', cat: 'veri', l: 4, s: 4 });
    add({ name: 'Korelasyonlu varlıklar (enerji sektörü) uyumlu', cat: 'veri', l: 3, s: 3 });
  } else {
    add({ name: 'BTC genel trendi işlem yönünde (H1/günlük)', cat: 'veri', l: 7, s: 7 });
    add({ name: 'Kripto-aktif haber riski yok (CPI/FED/ETF olayı)', cat: 'veri', l: 5, s: 5 });
    if (futures || has('OF')) {
      add({ name: 'Funding normal — aşırı long/short birikmiş değil', cat: 'veri', l: 5, s: 5 });
      add({ name: 'Open Interest sıcaklığı / liquidations yönü net', cat: 'veri', l: 4, s: 4 });
      add({ name: 'Spot + Futures CVD işlem yönünde', cat: 'veri', l: 4, s: 4 });
    } else if (has('ONC')) {
      add({ name: 'Whale / büyük akış işlem yönünde', cat: 'veri', l: 5, s: 5 });
      add({ name: 'Exchange rezervlerinde anomali yok', cat: 'veri', l: 3, s: 3 });
    } else {
      add({ name: 'Hacim artışı yönü doğruluyor', cat: 'veri', l: 5, s: 5 });
      add({ name: 'Funding / OI normal — aşırı kalabalık değil', cat: 'veri', l: 4, s: 4 });
    }
    if (has('OF')) add({ name: 'Orderbook kümelenmesi entry alanını destekliyor', cat: 'veri', l: 3, s: 3 });
  }

  // ---------- TEKNİK ----------
  if (has('ICT')) {
    add({ name: 'Likidite / eşikler alındı (sweep) — tuzak temizlendi', cat: 'teknik', l: 11, s: 11 });
    add({ name: 'OTE bölgesinde reaksiyon bekleniyor', cat: 'teknik', l: 8, s: 8 });
    add({ name: 'Daily bias ile uyumlu', cat: 'teknik', l: 7, s: 7 });
    add({ name: 'Order block / FVG alanına denk geliyor', cat: 'teknik', l: 7, s: 7 });
    add({ name: 'BOS / CHoCH ile yapı doğrulandı', cat: 'teknik', l: 6, s: 6 });
    add({ name: 'Killzone (Asian/London/NY) saatine uygun', cat: 'teknik', l: 5, s: 5 });
  }
  if (has('PA')) {
    add({ name: 'Ana destek / direnç seviyesinde', cat: 'teknik', l: 8, s: 8 });
    add({ name: 'Trend yönüne doğru tepki mumu (engulfing/pin)', cat: 'teknik', l: 6, s: 6 });
    add({ name: 'Günlük / 4H / 1H mum yapıları uyumlu', cat: 'teknik', l: 6, s: 6 });
  }
  if (has('IND')) {
    add({ name: 'EMA / VWAP yönü işlemle uyumlu', cat: 'teknik', l: 5, s: 5 });
    add({ name: 'RSI aşırı alım / satımda değil', cat: 'teknik', l: 4, s: 4 });
    add({ name: 'MACD / osilatör teyidi var', cat: 'teknik', l: 3, s: 3 });
  }
  if (has('KLASIK') || (!has('ICT') && !has('PA') && !has('IND'))) {
    add({ name: 'S/R ya da fib bölgesinde', cat: 'teknik', l: 7, s: 7 });
    add({ name: 'Yapı net (HH/HL veya LH/LL)', cat: 'teknik', l: 6, s: 6 });
    add({ name: 'Trend yönü işlem yönünde', cat: 'teknik', l: 5, s: 5 });
    add({ name: 'Key seviyede denge — ilk deneme değil, tepki var', cat: 'teknik', l: 4, s: 4 });
  }
  if (!criteria.some(c => c.cat === 'teknik')) {
    add({ name: 'Yapı net ve key seviyede', cat: 'teknik', l: 8, s: 8 });
  }

  // ---------- POZİSYON ----------
  add({ name: 'Bu setup planda yazılıydı — canlı icat değil', cat: 'pozisyon', l: 16, s: 16 });
  add({ name: 'RR en az 1:3 (küçük risk, büyük TP)', cat: 'pozisyon', l: 9, s: 9 });
  add({ name: 'Risk oranı önceden yazıldı (risk/bakiye)', cat: 'pozisyon', l: 8, s: 8 });
  add({ name: 'SL anlamlı seviyenin ötesinde — stop bilinçli kondu', cat: 'pozisyon', l: 7, s: 7 });
  add({ name: 'Giriş tetikleyicisi net — “bu seviye görülürse girerim”', cat: 'pozisyon', l: 7, s: 7 });
  if (style === 'swing' || style === 'mix') add({ name: 'Geceye / hafta sonuna kalma kararı mantıklı', cat: 'pozisyon', l: 5, s: 5 });
  if (beginner) add({ name: 'Risk masadan önce yazıldı — ekran açılmadan', cat: 'pozisyon', l: 9, s: 9 });

  // ---------- DUYGU (negatif kilit) ----------
  (form.emotions || []).forEach(v => {
    const lbl = emoChipLbl[v];
    const pts = emoPts[v] || 8;
    if (lbl) add({ name: lbl, cat: 'duygu', l: -pts, s: -pts });
  });
  const probs = Array.isArray(form.problem) ? form.problem : [];
  probs.forEach(v => {
    const lbl = probLbl[v];
    if (lbl) add({ name: lbl, cat: 'duygu', l: -10, s: -10 });
  });
  add({ name: 'Uykusuz / yorgunum', cat: 'duygu', l: -8, s: -8 });
  add({ name: 'Günün hedefi doldu — ekstra işlem dürtüsü', cat: 'duygu', l: -8, s: -8 });
  if (probs.indexOf('stop') !== -1) {
    add({ name: 'Stop düşünüyorum — plan yoksa hareket yok', cat: 'duygu', l: -10, s: -10 });
  }

  // ---------- STRATEJİLER ----------
  const strategies = String(form.strategy || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  const defaults = [];
  if (has('ICT')) defaults.push('Breaker', 'IFVG', 'OTE', 'Sweep & Reclaim');
  if (has('PA')) defaults.push('S/R Bounce', 'Trend Follow');
  if (has('IND')) defaults.push('EMA Pullback', 'VWAP Reclaim');
  if (has('OF')) defaults.push('CVD Diverjans', 'Liquidity Grab');
  if (has('ONC')) defaults.push('Funding + Whale Flow');
  if (precious) defaults.push('Breaker', 'LHPB/LLPB', 'IFVG');
  if (dxy) defaults.push('Range Reclaim', 'Trend Continuation');
  if (fx) defaults.push('Breakout + Retest', 'London Session');
  if (endeks) defaults.push('Opening Range Break', 'VWAP Reclaim');
  if (emtia) defaults.push('News Range', 'S/R Bounce');
  if (futures && !precious && !dxy && !fx && !endeks && !emtia) defaults.push('Funding + CVD', 'Liquidation Sweep');
  if (!has('ICT') && !has('PA') && !has('IND') && !has('OF') && !has('ONC') && !precious && !dxy && !fx && !endeks && !emtia) defaults.push('Breaker', 'LHPB', 'IFVG');
  defaults.forEach(s => { if (!strategies.includes(s)) strategies.push(s); });

  // ---------- POZİSYON KURALLARI ----------
  const pos = [];
  if (has('ICT')) pos.push({ name: 'İnvalidasyon: OTE reaksiyonu almadı — senaryo bozuldu', valid: true });
  else pos.push({ name: 'İnvalidasyon gerçekleşti — senaryo bozuldu', valid: true });
  pos.push({ name: 'Planda yazılı haber riski geldi / yaklaşıyor', valid: true });
  pos.push({ name: 'Fiyat istediğim gibi gitmiyor (invalidasyon yok)', valid: false });
  pos.push({ name: 'PnL paylaştım', valid: false });
  pos.push({ name: 'TP’nin ucundan geri döndü — kapat dürtüsü', valid: false });
  pos.push({ name: 'Her muma tepki veriyorum — ekrandan kalk', valid: false });
  if (beginner) pos.push({ name: 'Belirsizlikte plana dön — akşamki yazıya bak', valid: false });

  const capCat = (cat, n) => {
    const arr = criteria.filter(c => c.cat === cat);
    if (arr.length <= n) return;
    const names = new Set(arr.slice(0, n).map(c => c.name));
    for (let i = criteria.length - 1; i >= 0; i--) {
      if (criteria[i].cat === cat && !names.has(criteria[i].name)) criteria.splice(i, 1);
      if (criteria.filter(c => c.cat === cat).length <= n) break;
    }
  };
  capCat('veri', 6); capCat('teknik', 6); capCat('pozisyon', 6); capCat('duygu', 6);

  const marketLbl = precious ? (gold ? 'altın (XAU)' : 'gümüş (XAG)') : dxy ? 'DXY' : fx ? 'FX' : endeks ? 'endeks' : emtia ? 'emtia' : futures ? 'kripto (futures)' : 'kripto';
  const dataLens = precious ? 'haber+DXY+likidite' : dxy ? 'faiz beklentisi+risk iştahı' : fx ? 'haber+trend+seviye' : endeks ? 'vade+açılış+risk iştahı' : emtia ? 'arz-talep+dolar+seans' : futures ? 'funding+OI+CVD' : has('OF') ? 'orderflow' : has('ONC') ? 'onchain' : 'BTC trendi+hacim';
  let sum = 'Profiline göre hazırlandı: ' + marketLbl + ' için ' + dataLens +
    ' ağırlıklı — ' + criteria.length + ' odak kriter' +
    ((form.emotions && form.emotions.length) ? ', ' + form.emotions.length + ' duygusal kilit maddesi' : '') +
    (has('ICT') ? ', ICT/SMC lensi' : '') +
    ', stil: ' + (style === 'scalp' ? 'scalp' : style === 'swing' ? 'swing' : style === 'mix' ? 'karışık' : 'gün içi') +
    '. Eşikler 70/50; uygulayıp checklist\'e geçebilirsin.';
  if (feedback) sum = 'Dönütünle güncellendi: ' + feedback + ' — ' + sum;
  return { criteria, thresholds: { aplus: 70, b: 50 }, strategies, pos, summary: sum };
}

async function generateAi(feedback) {
  const status = document.getElementById('ai-status');
  const resBox = document.getElementById('ai-result');
  if (!status || !resBox) return;
  const form = aiProfileFromForm();
  if (!form.strategy && form.emotions.length === 0 && form.problem.length === 0) {
    status.textContent = t('pg.defter.aiEmptyProfile');
    return;
  }
  status.textContent = t('chat.thinking');
  resBox.innerHTML = '';
  let profile = null;
  let viaAi = false;
  try {
    const resp = await fetch('/api/ai-checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: form, feedback: feedback || undefined, prev: aiProfile })
    });
    const data = await resp.json();
    if (data && data.profile && Array.isArray(data.profile.criteria)) {
      profile = data.profile;
      viaAi = !!(data.ok && data.usedAi);
    } else {
      throw new Error('yanıt boş');
    }
  } catch (e) {
    profile = fallbackAiProfile(form, feedback); viaAi = false;
  }
  profile.market = form.market;
  profile.experience = form.experience;
  profile.style = form.style;
  profile.concepts = form.concepts.slice();
  profile.strategy = form.strategy;
  profile.emotions = form.emotions.slice();
  profile.problem = form.problem.slice();
  profile.feedback = feedback || '';
  profile.gold = ['xau', 'xag', 'dxy', 'fx', 'endeks', 'emtia'].indexOf(String(form.market).toLowerCase()) !== -1;
  profile.lastPair = pair;
  profile.usedAi = viaAi;
  aiProfile = profile;
  status.textContent = viaAi ? 'Öneri hazır ✓ (yapay zeka)' : 'Öneri hazır ✓ (hazır şablon — AI anahtarı yok, sunucu şablonu kullanıldı)';
  renderAiResult(profile, viaAi);
}

function renderAiResult(profile, viaAi) {
  const resBox = document.getElementById('ai-result');
  resBox.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'ai-r-box';
  const sum = document.createElement('div');
  sum.className = 'ai-r-sum';
  sum.textContent = profile.summary || 'Profiline göre checklist hazır.';
  box.appendChild(sum);
  const meta = document.createElement('div');
  meta.className = 'ai-r-meta';
  const metaParts = [];
  const MKT_LBL = { kripto: 'Kripto (Spot)', 'kripto-futures': 'Kripto (Futures)', xau: 'Altın (XAU)', xag: 'Gümüş (XAG)', dxy: 'Dolar Endeksi (DXY)', fx: 'FX Majör', endeks: 'Endeksler', emtia: 'Emtia' };
  const mk = String(profile.market || 'kripto').toLowerCase();
  metaParts.push(MKT_LBL[mk] || (mk.indexOf('xau') !== -1 ? 'Altın (XAU)' : mk.indexOf('xag') !== -1 ? 'Gümüş (XAG)' : 'Kripto'));
  const st = String(profile.style || '');
  if (st) metaParts.push({ scalp: 'Scalp', intraday: 'Gün içi', swing: 'Swing', mix: 'Karışık' }[st] || st);
  if (Array.isArray(profile.concepts) && profile.concepts.length) {
    const CL = { ICT: 'ICT/SMC', PA: 'Price Action', IND: 'İndikatörler', OF: 'Orderflow', ONC: 'On-chain', KLASIK: 'Klasik/Fib' };
    metaParts.push(profile.concepts.map(v => CL[v] || v).join(' · '));
  }
  meta.textContent = metaParts.join('  ·  ');
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
  const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'btn solid'; apply.textContent = '✅ Uygula ve Checklist\'e Başla';
  apply.addEventListener('click', () => {
    saveAiProfile();
    applyAiProfile();
    showPage('defter');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  acts.appendChild(apply);
  box.appendChild(acts);

  // ---- AI ile çalışmaya devam: dönütle yeniden üretim + teknik not ----
  const fb = document.createElement('div'); fb.className = 'ai-fb';
  const fbHead = document.createElement('div'); fbHead.className = 'ai-fb-head';
  fbHead.innerHTML = '🤖 AI ile çalışmaya devam';
  fb.appendChild(fbHead);
  const fbSub = document.createElement('div'); fbSub.className = 'ai-fb-sub';
  fbSub.textContent = 'Öneri tamam mı, yoksa dönütünle yeniden mi üretelim?';
  fb.appendChild(fbSub);
  const fbModes = document.createElement('div'); fbModes.className = 'ai-fb-modes';
  const FB_MODES = [
    { v: 'beg', lbl: '😕 Beğenmedim — baştan üret' },
    { v: 'strong', lbl: '💪 Bu tarafı güçlendir' },
    { v: 'weak', lbl: '🩹 Bu taraf zayıf kaldı' }
  ];
  let fbMode = '';
  FB_MODES.forEach(m => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (fbMode === m.v ? ' on' : '');
    b.textContent = m.lbl;
    b.addEventListener('click', () => {
      fbMode = fbMode === m.v ? '' : m.v;
      fbModes.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
      if (fbMode) b.classList.add('on');
    });
    fbModes.appendChild(b);
  });
  fb.appendChild(fbModes);
  const fbNote = document.createElement('textarea');
  fbNote.rows = 2;
  fbNote.maxLength = 400;
  fbNote.placeholder = 'Geri bildirim notun (opsiyonel): hangi kriterleri güçlendirelim, hangi taraf sana zayıf geldi?';
  fbNote.className = 'ai-fb-note';
  fb.appendChild(fbNote);
  const fbTech = document.createElement('input');
  fbTech.type = 'text';
  fbTech.placeholder = '📝 Teknik tarafa not (checklist\'e yazılır, sonra değiştirebilirsin)';
  fbTech.className = 'ai-fb-tech';
  fbTech.value = profile.note || '';
  fbTech.addEventListener('input', () => {
    aiProfile.note = fbTech.value;
    saveAiProfile();
    renderAiBanner();
  });
  fb.appendChild(fbTech);
  const fbRow = document.createElement('div'); fbRow.className = 'actions';
  fbRow.style.cssText = 'justify-content:flex-start;margin-top:10px;';
  const redo = document.createElement('button'); redo.type = 'button'; redo.className = 'btn solid';
  redo.textContent = '🔄 Dönütle Tekrar Üret';
  redo.addEventListener('click', () => {
    const parts = [];
    if (fbMode) parts.push(FB_MODES.find(m => m.v === fbMode).lbl);
    if (fbNote.value.trim()) parts.push(fbNote.value.trim());
    const msg = parts.join(' — ');
    if (!msg) { fbNote.placeholder = 'Dönüt için önce bir şey yaz ya da bir mod seç.'; return; }
    fbNote.placeholder = 'Geri bildirim notun (opsiyonel): hangi kriterleri güçlendirelim, hangi taraf sana zayıf geldi?';
    generateAi(msg);
  });
  fbRow.appendChild(redo);
  fb.appendChild(fbRow);
  box.appendChild(fb);

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
  renderAiProblems();
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
    const b = document.createElement('span'); b.className = 'box'; b.textContent = '✓';
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = it.name;
    const pt = document.createElement('span'); pt.className = 'pts'; pt.textContent = it.valid ? 'ÇIKIŞ' : 'DÜRTÜ';
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
    v.textContent = 'İŞLEMİ KAPAT — plan gereği çıkış. Bu müdahale değil, uygulamadır.';
    v.className = 'sent-note plus'; n.textContent = 'KAPAT';
  } else if (anyImpulse) {
    v.textContent = 'KAPATMA — invalidasyon yok, bu his sinyal değil. Elini klavyeden çek; dürtüyü Notion Müdahale kolonuna logla.';
    v.className = 'sent-note minus'; n.textContent = 'DOKUNMA';
  } else {
    v.textContent = 'Pozisyondayken bir dürtü geldiğinde önce buraya işaretle — kapatma kararı klavyeden önce buradan geçsin.';
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
    note.textContent = 'Kalabalık nerede? Seçim yapmazsan skora etkisi yok.';
    note.className = 'sent-note'; n.textContent = '';
  } else if (p > 0) {
    note.textContent = 'Kalabalık karşında — ters bias konfluensi: +' + SENT_PTS;
    note.className = 'sent-note plus'; n.textContent = '+' + SENT_PTS;
  } else {
    note.textContent = 'Kalabalıkla aynı yöndesin — likidite sensin: −' + SENT_PTS;
    note.className = 'sent-note minus'; n.textContent = '−' + SENT_PTS;
  }
}
function moodLabel(v) {
  if (v <= -7) return ['KORKU', 'ms-ext'];
  if (v <= -3) return ['TEDİRGİN', 'ms-fear'];
  if (v <= 2) return ['NÖTR', 'ms-neut'];
  if (v <= 6) return ['İŞTAHLI', 'ms-greed'];
  return ['COŞKU', 'ms-ext'];
}
function renderMood() {
  const [lbl, cls] = moodLabel(mood);
  const st = document.getElementById('mood-state');
  st.textContent = lbl + ' · ' + (mood > 0 ? '+' : '') + mood;
  st.className = 'mood-state ' + cls;
  const pe = document.getElementById('mood-pen');
  const neutral = Math.abs(mood) <= 2;
  pe.textContent = neutral ? 'nötr bölge ✓' : 'nötr değilsin — girmeden önce nötrleşmeyi bekle';
  pe.className = 'mood-pen' + (neutral ? '' : ' on');
}

function computeScore() {
  let sum = sentPts();
  cfg().criteria.forEach((c, i) => {
    if (c.cat === 'duygu') return; // duygu puan değil kilittir
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
  const noSess = sessions.length === 1 && sessions[0] === '—';
  if (sessWrap) sessWrap.style.display = noSess ? 'none' : '';
  if (noSess) { session = '—'; }
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

  stratsFor(pair);
  const stArr = config.stratByPair[pair];
  renderChipPicker('strat-chips', stratsFor(pair), 'strateji', {
    value: strat,
    set: v => { strat = v; renderChips(); },
    add: name => { if (name && !stArr.includes(name)) { stArr.push(name); saveConfig(); } },
    remove: name => {
      const i = stArr.indexOf(name); if (i > -1) stArr.splice(i, 1);
      if (Array.isArray(config.stratGlobal)) { const g = config.stratGlobal.indexOf(name); if (g > -1) config.stratGlobal.splice(g, 1); }
      if (!config.stratRemoved) config.stratRemoved = [];
      if (name && !config.stratRemoved.includes(name)) config.stratRemoved.push(name);
      if (strat === name) strat = '';
      saveConfig();
    }
  });
  modelsFor(pair);
  const mdArr = config.modelsByPair[pair];
  renderChipPicker('model-chips', modelsFor(pair), 'entry model', {
    value: model,
    set: v => { model = v; renderChips(); },
    add: name => { if (name && !mdArr.includes(name)) { mdArr.push(name); saveConfig(); } },
    remove: name => {
      const i = mdArr.indexOf(name); if (i > -1) mdArr.splice(i, 1);
      if (Array.isArray(config.modelGlobal)) { const g = config.modelGlobal.indexOf(name); if (g > -1) config.modelGlobal.splice(g, 1); }
      if (!config.modelRemoved) config.modelRemoved = [];
      if (name && !config.modelRemoved.includes(name)) config.modelRemoved.push(name);
      if (model === name) model = '';
      saveConfig();
    }
  });
}

function renderChipPicker(id, arr, label, opts) {
  const wrap = document.getElementById(id);
  wrap.innerHTML = '';
  const p = document.createElement('div');
  p.className = 'picker';
  if (opts.value) p.classList.add('on');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'picker-btn' + (opts.value ? ' on' : '');
  btn.innerHTML = '<span class="pb-val">' + escapeHtml(opts.value || ('Seç…')) + '</span><span class="pb-caret">▾</span>';
  btn.addEventListener('click', () => { wrap.querySelectorAll('.picker').forEach(o => { if (o !== p) o.classList.remove('open'); }); p.classList.toggle('open'); });
  p.appendChild(btn);
  const drop = document.createElement('div');
  drop.className = 'picker-drop';
  if (arr.length === 0) {
    const e = document.createElement('div');
    e.className = 'pd-empty';
    e.textContent = 'Henüz yok — aşağıdan ekle';
    drop.appendChild(e);
  }
  arr.forEach((s, i) => {
    const it = document.createElement('div');
    it.className = 'pd-item' + (opts.value === s ? ' on' : '');
    const lb = document.createElement('span');
    lb.textContent = s;
    lb.addEventListener('click', () => opts.set(opts.value === s ? '' : s));
    it.appendChild(lb);
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'pd-x'; rm.textContent = '✕';
    rm.title = 'Sil'; rm.setAttribute('aria-label', 'sil');
    rm.addEventListener('click', () => {
      if (opts.remove) opts.remove(s);
      else {
        arr.splice(i, 1);
        if (opts.value === s) opts.set('');
      }
      renderChips();
      // Silmeden sonra listeyi açık tut — art arda silinebilsin
      const fresh = document.getElementById(id);
      if (fresh) {
        const p2 = fresh.querySelector('.picker');
        if (p2) p2.classList.add('open');
      }
    });
    it.appendChild(rm);
    drop.appendChild(it);
  });
  const addRow = document.createElement('div');
  addRow.className = 'pd-add';
  const inp = document.createElement('input');
  inp.className = 'pd-input';
  inp.placeholder = 'Yeni ' + label;
  const sv = document.createElement('button');
  sv.type = 'button'; sv.className = 'pd-save'; sv.textContent = '+';
  const commit = () => {
    const name = inp.value.trim();
    if (name) {
      if (opts.add) opts.add(name);
      else if (!arr.includes(name)) { arr.push(name); saveConfig(); }
      opts.set(name);
    }
  };
  sv.addEventListener('click', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { commit(); }
    if (e.key === 'Escape') p.classList.remove('open');
  });
  inp.addEventListener('blur', () => {
    if (inp.value.trim()) commit();
    renderChips();
  });
  addRow.appendChild(inp);
  addRow.appendChild(sv);
  drop.appendChild(addRow);
  p.appendChild(drop);
  wrap.appendChild(p);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderMatrix() {
  const g = document.getElementById('mx-grid');
  const sessions = curSessions();
  const mx = matrixFor(pair);
  const noSess = sessions.length === 1 && sessions[0] === '—';
  g.style.gridTemplateColumns = '64px repeat(' + sessions.length + ', 1fr)';
  g.innerHTML = '<span></span>' + sessions.map(s => '<span class="mx-h">' + (noSess ? 'Tavan' : s) + '</span>').join('');
  const gold = pair !== 'BTC';
  const order = gold ? ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'] : ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  order.forEach(d => {
    const dl = document.createElement('span');
    dl.className = 'mx-d'; dl.textContent = d;
    g.appendChild(dl);
    sessions.forEach(s => {
      const sel = document.createElement('select');
      // gold pazartesi: A+ seçilemez
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
    // ilk tık: onay bekle
    pendingDel = p;
    renderPairs();
    setTimeout(() => { if (pendingDel === p) { pendingDel = null; renderPairs(); } }, 4000);
    return;
  }
  // ikinci tık: sil
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
    lbl.textContent = 'AI · ' + (aiProfile.gold ? 'XAU' : 'BTC');
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
      x.textContent = armed ? 'sil?' : '×';
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
  if (dirEl) dirEl.textContent = (aiActive ? 'AI · ' : '') + pair + ' · ' + direction;
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
    v.textContent = 'A+ SETUP — TAM RİSK'; v.className = 'v-a';
    risk.textContent = gold ? 'Risk: 0.5R (gold sabit).' : 'Risk: 1R';
  }
  else if (vd === 'B') {
    v.textContent = 'B SETUP — TEMKİNLİ'; v.className = 'v-b';
    if (goldMon) {
      risk.textContent = 'Pazartesi (gold): A+ olamaz · 0.5R · GÜNDE TEK İŞLEM.';
    } else if (gold) {
      risk.textContent = 'Risk: 0.5R (gold sabit).';
    } else {
      risk.textContent = (base === 'A+' && cell === 'B')
        ? 'Gün/Seans kalitesi: ' + selDay + sessLabel + ' = B → skor A+ olsa da max B · 0.3R.'
        : 'Risk: 0.3R · Küçük gir ya da hiç girme.';
    }
  }
  else {
    if (intentLocked()) {
      v.textContent = 'DUYGU İLE GİRİŞ — İŞLEM YASAK'; v.className = 'v-no';
      risk.textContent = 'Girişte "Duygumu" seçtin. Setup tradelemiyorsan işlem alınmaz. Niyetini "Setup\'ı" yap ya da bu işlemi geç.';
    } else if (emoLocked()) {
      v.textContent = 'DUYGU KİLİDİ — İŞLEM YASAK'; v.className = 'v-no';
      risk.textContent = 'İşaretli duygu varken skor kaç olursa olsun işlem alınmaz. Önce nötrleş, sonra tekrar skorla.';
    } else {
      v.textContent = 'ANLAŞMA YOK'; v.className = 'v-no';
      risk.textContent = (cell === 'YOK')
        ? 'Bu dilim işleme kapalı: ' + selDay + sessLabel + ' = YOK.'
        : 'Eşik altı — bu masadan kalkıyoruz.';
    }
  }
  renderChips();
  document.body.classList.toggle('emo-locked', entryLocked());
  const elock = document.getElementById('emo-lock');
  if (elock) elock.textContent = intentLocked() ? 'DUYGU İLE GİRİŞ — KİLİTLİ' : 'SİSTEM KİLİTLİ';

  document.getElementById('btn-long').className = direction === 'LONG' ? 'on-long' : '';
  document.getElementById('btn-short').className = direction === 'SHORT' ? 'on-short' : '';
  renderPairs();
}

const EMO_SHORT = {
  'Uykusuz / yorgunum': 'Uykusuz',
  'Stresliyim (trade dışı kaynak)': 'Stresli',
  'Aşırı yoğun / bölünmüş dikkat': 'Dağınık',
  'Az önce stop oldum — revenge penceresi': 'Revenge',
  'FOMO — hareket kaçıyor hissi': 'FOMO',
  'Önceki işlemi kaçırdım — telafi hissi var': 'Telafi',
  'Bugün aynı bias ile 2. kez giriyorum': '2. giriş'
};
function emoShort(name) {
  if (EMO_SHORT[name]) return EMO_SHORT[name];
  const w = name.split(/[\s\/—(,]+/)[0];
  return w.length > 12 ? w.slice(0, 12) : w;
}

// ---- Satır içi kategori düzenleyici ----
let editCat = null;
function updateCatEditBtns() {
  ['veri', 'teknik', 'pozisyon', 'duygu'].forEach(cat => {
    const btn = document.getElementById('catedit-' + cat);
    if (!btn) return;
    const on = editCat === cat;
    btn.textContent = on ? '✓ Bitti' : '✎ Düzenle';
    btn.classList.toggle('on', on);
  });
}
function toggleCatEdit(cat) {
  const wasOpen = editCat;
  if (wasOpen) {
    // Açık düzenlemeyi kapat: boş isimli kriterleri at + kaydet
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
  hint.textContent = 'Adı yaz · sağdaki kutu = puan (önem) · × ile sil · en altta yeni ekle. Değişiklikler hesabına kaydolur.';
  box.appendChild(hint);
  cfg().criteria.forEach(c => {
    if (c.cat !== cat) return;
    const row = document.createElement('div');
    row.className = 'crit-edit';
    const name = document.createElement('input');
    name.type = 'text'; name.className = 'ce-name'; name.value = c.name; name.placeholder = 'Kriter adı';
    name.addEventListener('input', () => { c.name = name.value; });
    name.addEventListener('change', saveConfig);
    const pt = document.createElement('input');
    pt.type = 'number'; pt.className = 'ce-pt'; pt.step = '1'; pt.title = 'Puan'; pt.value = c.l;
    pt.addEventListener('input', () => { const v = Number(pt.value) || 0; c.l = v; c.s = v; render(); });
    pt.addEventListener('change', saveConfig);
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'ce-del'; del.textContent = '×'; del.title = 'Sil';
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
    if (ptsFor(c) === 0) return; // bu yön için anlamsız kriterler gizlenir
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
        const tk = document.createElement('span'); tk.className = 'tick'; tk.textContent = checked.has(i) ? '✓' : '○';
        const lb = document.createElement('span'); lb.textContent = emoShort(c.name);
        chip.appendChild(tk); chip.appendChild(lb);
        chip.addEventListener('click', () => {
          checked.has(i) ? checked.delete(i) : checked.add(i); renderCriteria(); render();
        });
        box.appendChild(chip);
      });
      document.getElementById('n-duygu').textContent = n > 0 ? 'KİLİT' : '';
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
      const b = document.createElement('span'); b.className = 'box'; b.textContent = '✓';
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
      lists[cat].length === 0 ? '—' : n + '/' + lists[cat].length;
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
    name.type = 'text'; name.value = c.name; name.placeholder = 'Gözlem';
    name.addEventListener('input', () => { c.name = name.value; });
    const sel = document.createElement('select');
    Object.keys(CATS).forEach(k => {
      const o = document.createElement('option'); o.value = k; o.textContent = CATS[k];
      if (c.cat === k) o.selected = true; sel.appendChild(o);
    });
    sel.addEventListener('change', () => { c.cat = sel.value; });
    const l = document.createElement('input');
    l.type = 'number'; l.step = '1'; l.value = c.l; l.setAttribute('aria-label', 'Long puanı');
    l.addEventListener('input', () => { c.l = Number(l.value) || 0; });
    const sIn = document.createElement('input');
    sIn.type = 'number'; sIn.step = '1'; sIn.value = c.s; sIn.setAttribute('aria-label', 'Short puanı');
    sIn.addEventListener('input', () => { c.s = Number(sIn.value) || 0; });
    const handle = document.createElement('span');
    handle.className = 'handle'; handle.textContent = '⠿';
    handle.setAttribute('aria-label', 'Sürükleyerek taşı');
    handle.addEventListener('pointerdown', e => startDrag(e, row));
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '×'; del.setAttribute('aria-label', 'Sil');
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
    if (note) { note.textContent = 'AI profiline işlendi — kendi ayarların değişmedi.'; setTimeout(() => { note.textContent = ''; }, 4000); }
    return;
  }
  const note = document.getElementById('save-note');
  const ok = await store.set(STORAGE_KEY, JSON.stringify(config));
  note.textContent = ok ? 'Deftere işlendi.' : 'Kayıt yapılamadı; bu oturumda geçerli.';
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
  } catch (e) { /* ilk açılış */ }
}

function switchPair(p) {
  pair = p; checked = new Set();
  sent = ''; posChecked = new Set();
  intent = ''; mood = 0;
  const mr = document.getElementById('mood-range'); if (mr) mr.value = 0;
  if (typeof renderMood === 'function') renderMood();
  if (typeof renderIntent === 'function') renderIntent();
  renderCriteria(); render(); renderSent(); renderPos(); applyPairPanels(); renderMatrix();
  // paritenin pair alanını otomatik doldur, sonra o paritenin planını yükle
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
  // BTC: eski tarih-bazlı anahtar (geriye dönük uyum). Diğer pariteler: pair ekli anahtar.
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
    if (val) { fillDaily(JSON.parse(val)); status.textContent = 'kayıtlı'; }
    else { fillDaily(null); status.textContent = 'boş'; }
  } catch (e) { fillDaily(null); status.textContent = 'boş'; }
}
async function saveDaily() {
  const note = document.getElementById('daily-note');
  const ok = await store.set(dailyKey(), JSON.stringify(collectDaily()));
  note.textContent = ok ? 'Plan deftere işlendi.' : 'Kayıt yapılamadı; bu oturumda geçerli.';
  if (ok) document.getElementById('daily-status').textContent = 'kayıtlı';
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
  } catch (e) { /* ilk açılış */ }
}
async function saveTrades() {
  try { await store.set(TRADES_KEY, JSON.stringify(trades)); }
  catch (e) { console.error('saveTrades hatası:', e); }
}

// ——— Ders Defteri ———
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
  } catch (e) { /* boş başla */ }
  if (!Array.isArray(lessonsData.lessons)) lessonsData.lessons = [];
  if (!lessonsData.log || typeof lessonsData.log !== 'object') lessonsData.log = {};
  if (lessonsData.lessons.length === 0) {
    // başlangıç dersleri
    const base = Date.now();
    lessonsData.lessons.push({
      id: base, text: 'Kural ihlalinin acı verici bir bedeli olsun — ihlal asla bedava kalmasın.',
      src: 'Alex G', added: lsToday(), active: false
    });
    lessonsData.lessons.push({
      id: base + 1, text: '2 ardışık stop sonrası: yalnızca A+ & HTF bölge ya da kesin pattern; risk tam boy, gerisi pas. (Durma değil, filtreyi sık.)',
      src: 'Recovery', added: lsToday(), active: true
    });
    lessonsData.lessons.push({
      id: base + 2, text: 'Pazartesi 21:00\'da fiyat rölantideyse ve düşmediyse, o gün manipülasyon gelmez — zorlama.',
      src: 'Pzt gözlemi', added: lsToday(), active: true
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
    tw.innerHTML = '<p class="hint" style="margin:0;">Takipte ders yok — arşivden ⭐ ile en fazla 3 ders seç.</p>';
  }
  actives.forEach(l => {
    const v = lessonsData.log[today] ? lessonsData.log[today][l.id] : undefined;
    const row = document.createElement('div'); row.className = 'ls-row';
    const tx = document.createElement('div'); tx.className = 'txt';
    tx.textContent = l.text;
    if (l.src) { const sp = document.createElement('span'); sp.className = 'src'; sp.textContent = '· ' + l.src; tx.appendChild(sp); }
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = 'Bugün uyguladın mı?';
    tx.appendChild(meta);
    const yes = document.createElement('button'); yes.className = 'yes' + (v === true ? ' on' : ''); yes.textContent = '✓ Evet';
    const no = document.createElement('button'); no.className = 'no' + (v === false ? ' on' : ''); no.textContent = '✗ Hayır';
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
    lw.innerHTML = '<p class="hint" style="margin:0;">Arşiv boş — takipten çıkardığın ya da henüz takibe almadığın dersler burada birikir.</p>';
  }
  sorted.forEach(l => {
    const row = document.createElement('div'); row.className = 'ls-row';
    const tx = document.createElement('div'); tx.className = 'txt';
    tx.textContent = l.text;
    if (l.src) { const sp = document.createElement('span'); sp.className = 'src'; sp.textContent = '· ' + l.src; tx.appendChild(sp); }
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
    star.textContent = l.active ? '⭐ Takipte' : '☆ Takibe al';
    star.addEventListener('click', async () => {
      if (!l.active && lessonsData.lessons.filter(x => x.active).length >= 3) {
        star.textContent = 'Önce birini mezun et'; setTimeout(renderLessons, 1600); return;
      }
      l.active = !l.active; await saveLessons(); renderLessons();
    });
    const del = document.createElement('button'); del.textContent = '×';
    del.setAttribute('aria-label', 'Dersi sil');
    del.addEventListener('click', async () => {
      lessonsData.lessons = lessonsData.lessons.filter(x => x.id !== l.id);
      await saveLessons(); renderLessons();
    });
    row.appendChild(star); row.appendChild(del);
    lw.appendChild(row);
  });
  document.getElementById('ls-count').textContent =
    lessonsData.lessons.length + ' ders · ' + actives.length + '/3 takipte';
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

// ——— Paylaşım Kartı ———
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
  while (t.length > 3 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
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
    // son satırı kırp
    let last = lines[maxLines - 1];
    const consumed = lines.join(' ');
    if (consumed.length < String(text).replace(/\s+/g, ' ').trim().length) {
      lines[maxLines - 1] = shClip(ctx, last + ' …', max);
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
// işlem tarihinden (GG/AA) o günün plan anahtarını bul ve planı karta ekle
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
  } catch (e) { /* plan yoksa boş kalır */ }
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
  // plan satırlarını önden ölç (yükseklik için)
  let planBlocks = [];
  if (showP) {
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = '500 25px Inter, sans-serif';
    const tw2 = W - M * 2 - 40;
    if (d.senaryo) planBlocks.push({ label: 'SENARYO', lines: shWrap(meas, d.senaryo, tw2, 3) });
    if (d.anti) planBlocks.push({ label: 'ANTİ SENARYO', lines: shWrap(meas, d.anti, tw2, 3) });
  }
  let planH = 0;
  if (showP) {
    planH = 24; // üst boşluk
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

  // başlık
  c.fillStyle = '#6d7488'; c.font = '600 24px Inter, sans-serif';
  shSpaced(c, 'KONFİRMASYON DEFTERİ', M, 112, 4);
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
  const vtxt = d.emoBlock ? 'DUYGU KİLİDİ — İŞLEM YASAK'
    : d.verdict === 'A+' ? 'A+ SETUP · TAM RİSK'
    : d.verdict === 'B' ? 'B SETUP · TEMKİNLİ' : 'ANLAŞMA YOK';
  c.font = '700 34px Inter, sans-serif';
  const pw = c.measureText(vtxt).width + 76;
  c.globalAlpha = 0.14; c.fillStyle = acc;
  shRound(c, cx - pw / 2, y - 50, pw, 74, 37); c.fill(); c.globalAlpha = 1;
  c.fillStyle = acc; c.textAlign = 'center';
  c.fillText(vtxt, cx, y);
  c.textAlign = 'left';
  y += 78;

  // meta çipleri
  const chips = [d.pair + ' · ' + d.dir];
  if (d.bias) chips.push(d.bias);
  if (d.day && d.sess) chips.push(d.day + ' · ' + d.sess);
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
    c.fillText('Duygu kilidi aktifken skor geçersizdir.', cx, y + 4);
    c.textAlign = 'left'; y += 96;
  }

  if (showS) {
    const contra = d.sent !== d.dir;
    c.font = '600 26px Inter, sans-serif'; c.textAlign = 'center';
    c.fillStyle = contra ? '#22c55e' : '#ef4444';
    c.fillText('Kalabalık ' + d.sent + ' · ' + (contra ? 'ters bias konfluensi' : 'kalabalıkla aynı yön'), cx, y);
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
      c.fillText('✓', M, y);
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
      c.fillStyle = b.label === 'ANTİ SENARYO' ? '#ef8c8c' : '#8ab4f8';
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
  c.fillText('süreç · skor · disiplin', W - M, H - 46); c.textAlign = 'left';

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
      tip.innerHTML = 'Sistem paylaşımı bu ortamda kapalı. <b>Görsele uzun bas → Paylaş</b> ya da İndir kullan. Uygulamayı ayrı sekmede (GitHub Pages / indirilmiş dosya) açarsan bu buton da çalışır.';
      shNote('Bu ortamda sistem paylaşımı kapalı — uzun basma yolunu kullan.');
    }
  } catch (e) { if (e && e.name !== 'AbortError') shNote('Paylaşılamadı — görsele uzun bas ya da İndir kullan.'); }
}
async function shDownload() {
  const b = await shBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = shName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function shCopy() {
  // 1. deneme: söz (promise) ile ClipboardItem — kullanıcı hareketi korunur (Safari/Chrome)
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': shBlob() })]);
      shNote('Görsel panoya kopyalandı — sohbete yapıştırabilirsin.');
      return;
    }
  } catch (e) { /* 2. denemeye geç */ }
  // 2. deneme: blob hazırlayıp yaz
  try {
    const b = await shBlob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
    shNote('Görsel panoya kopyalandı — sohbete yapıştırabilirsin.');
    return;
  } catch (e) { /* 3. yola geç */ }
  // 3. yol: pano bu ortamda kapalı — uzun basma yönlendirmesi
  const tip = document.getElementById('sh-tip');
  tip.style.background = 'var(--amber-soft)';
  tip.innerHTML = 'Pano bu ortamda kapalı (uygulama çerçeve içinde çalışıyor). <b>Görsele uzun bas → Görseli kopyala / Paylaş</b>, ya da İndir de galerinden gönder.';
  shNote('Panoya yazma izni yok — yukarıdaki yolu kullan.');
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
  tip.innerHTML = 'Görsele <b>uzun bas</b> → “Görseli kopyala” ya da “Paylaş”. En kestirme yol bu.';
  const sendBtn = document.getElementById('sh-send');
  const canShare = !!(navigator.share && navigator.canShare);
  sendBtn.style.opacity = canShare ? '1' : '0.5';
  sendBtn.title = canShare ? '' : 'Bu ortamda kapalı olabilir';
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
  note.textContent = 'Yedek indirildi (' + Object.keys(dump.keys).length + ' kayıt).';
  setTimeout(() => { note.textContent = ''; }, 5000);
}

async function applyDump(dump) {
  // Yeni format: { keys: {...} } — eski format: { config, trades, dailyPlans }
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
  if (typeof SEED === 'undefined' || !SEED) { note.textContent = 'Gömülü kayıt yok.'; return; }
  let added = 0;
  // günlük planlar — sadece o tarih yoksa ekle
  const plans = (SEED.dailyPlans && typeof SEED.dailyPlans === 'object') ? SEED.dailyPlans : {};
  for (const d of Object.keys(plans)) {
    const key = DAILY_PREFIX + d;
    const existing = await store.get(key);
    if (!existing) { await store.set(key, JSON.stringify(plans[d])); added++; }
  }
  // işlemler — aynı id yoksa ekle
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
  note.textContent = added ? ('Eklendi: ' + tradeAdded + ' işlem, ' + (added - tradeAdded) + ' plan. Mevcut kayıtlara dokunulmadı.')
                           : 'Zaten güncel — eklenecek eksik kayıt yok.';
  setTimeout(() => { note.textContent = ''; }, 6000);
}

async function seedIfEmpty() {
  if (typeof SEED === 'undefined' || !SEED) return;
  try {
    const hasCfg = await store.get(STORAGE_KEY);
    const hasTrades = await store.get(TRADES_KEY);
    if (hasCfg || hasTrades) return; // dolu depoya asla dokunma
    await applyDump(SEED);
  } catch (e) { /* seed başarısızsa boş başla */ }
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
    note.textContent = 'Yedek yüklendi (' + n + ' kayıt geri geldi).';
  } catch (e) {
    note.textContent = 'Yedek okunamadı — dosya bu uygulamanın yedeği mi?';
  }
  setTimeout(() => { note.textContent = ''; }, 5000);
}
let openTrades = new Set();

let dtOpenTrade = null;
let dtRowFocus = null;
const dtAnnexMap = new Map();
// Satırın sağındaki küçük görselleri güncelle (tam render yok — odak bozulmaz)
function dtRenderRowThumbs(t) {
  const annex = dtAnnexMap.get(t.id);
  if (!annex) return;
  const box = annex.querySelector('.tr-thumbs');
  if (!box) return;
  box.innerHTML = '';
  (t.images || []).forEach((u, idx) => {
    const w = document.createElement('div'); w.style.cssText = 'position:relative;';
    const img = document.createElement('img'); img.src = u;
    img.title = 'Büyütmek için tıkla';
    img.addEventListener('click', e => { e.stopPropagation(); magZoom(u); });
    w.appendChild(img);
    const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = '×'; rm.title = 'Görseli kaldır';
    rm.style.cssText = 'position:absolute;top:-5px;right:-5px;width:16px;height:16px;border-radius:50%;background:var(--red);color:#fff;border:none;font-size:10px;line-height:1;cursor:pointer;';
    rm.addEventListener('click', e => {
      e.stopPropagation();
      (t.images || []).splice(idx, 1);
      saveTrades(); syncDefterToJournal(t); dtRenderRowThumbs(t);
    });
    w.appendChild(rm);
    box.appendChild(w);
  });
}
// Check List işlemini Trade Günlüğü'ne otomatik ekler/günceller (ts = defter işlem id)
async function syncDefterToJournal(t) {
  if (typeof dataTrades === 'undefined' || !Array.isArray(dataTrades)) return;
  const existing = dataTrades.find(x => x.ts === t.id);
  const payload = {
    date: t.date || '', pair: t.pair || '', dir: t.dir || 'LONG',
    r: dnum(t.r), pnl: null, strat: t.strat || '', model: t.model || '',
    note: t.note || '', images: (t.images || []).slice()
  };
  let cur;
  if (existing) {
    existing.date = payload.date; existing.pair = payload.pair; existing.dir = payload.dir;
    existing.r = payload.r; existing.strat = payload.strat; existing.model = payload.model;
    if (payload.note) existing.note = payload.note;
    if (payload.images.length) existing.images = payload.images;
    cur = existing;
    await saveData();
  } else {
    cur = Object.assign({ id: Date.now() + Math.random(), ts: t.id, criteria: { setup: 5, entry: 5, exit: 5, risk: 5, psycho: 5 } }, payload);
    dataTrades.push(cur);
    await saveData();
  }
  if (typeof renderData === 'function') renderData();
  // Notion'a da yansıt: not, foto, entry model ve strateji dahil
  const noteText = [
    t.sabah ? 'Sabah: ' + t.sabah : '',
    t.senaryo ? 'Senaryo: ' + t.senaryo : '',
    t.anti ? 'Anti: ' + t.anti : '',
    t.gunsonu ? 'Gün Sonu: ' + t.gunsonu : '',
    cur.note ? 'Not: ' + cur.note : ''
  ].filter(Boolean).join('\n');
  const nt = {
    id: cur.id, ts: cur.id, date: cur.date || '', pair: cur.pair || '', dir: cur.dir || '',
    r: cur.r, strat: cur.strat || '', model: cur.model || '',
    note: noteText, images: cur.images || [], stars: cur.stars || 0,
    notionId: cur.notionId || undefined, syncedImages: cur.imgSynced || []
  };
  fetch('/api/notion-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nt) })
    .then(r => r.json().catch(() => ({})))
    .then(j => {
      const rr = Array.isArray(j.results) ? j.results[0] : null;
      if (rr && rr.ok && rr.notionId && !cur.notionId) { cur.notionId = rr.notionId; }
      if (rr && rr.ok && Array.isArray(rr.syncedImages)) { cur.imgSynced = rr.syncedImages; }
      if (rr && rr.ok) saveData();
    })
    .catch(() => {});
}

function logTrade() {
  const note = document.getElementById('daily-note');
  try {
  if (intentLocked()) {
    note.textContent = 'İşlem açılamaz — girişte "Duygumu" seçili. Setup tradelemiyorsan bu işlemi geç.';
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

  // tarih kutusu: boşsa bugün, doluysa GG/AA
  let date = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  let day = selDay;
  const di = document.getElementById('trade-date');
  const raw = (di.value || '').trim();
  if (raw) {
    if (!/^\d{1,2}\/\d{1,2}$/.test(raw)) {
      note.textContent = 'Tarih biçimi GG/AA olmalı (ör. 22/07) — ya da boş bırak, bugünü alsın.';
      setTimeout(() => { note.textContent = ''; }, 5000);
      di.focus(); return;
    }
    const [d, m] = raw.split('/');
    date = d.padStart(2, '0') + '/' + m.padStart(2, '0');
    const jsDay = new Date(2026, parseInt(m, 10) - 1, parseInt(d, 10)).getDay();
    const dayMap = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    if (!isNaN(jsDay)) day = dayMap[jsDay];
  }

  // Gold pazartesi: günde tek işlem. Aynı gün ikinci gold işlemi uyarı ister.
  const isGold = pair === 'XAU' || pair.indexOf('XAU') !== -1 || pair.indexOf('GOLD') !== -1;
  if (isGold && day === 'Pzt') {
    const sameDay = trades.filter(t => {
      const tg = t.pair === 'XAU' || (t.pair || '').indexOf('XAU') !== -1 || (t.pair || '').indexOf('GOLD') !== -1;
      return tg && t.date === date;
    }).length;
    if (sameDay >= 1 && !window.__mondayOverride) {
      window.__mondayOverride = true;
      note.textContent = 'DUR — gold pazartesi kuralı: günde tek işlem. Bu ikinci işlem. Yine de kaydetmek için tekrar bas.';
      note.style.color = 'var(--red)';
      setTimeout(() => { note.style.color = ''; window.__mondayOverride = false; }, 8000);
      return;
    }
    window.__mondayOverride = false;
  }
  trades.unshift({
    id: now.getTime(),
    date: date,
    time: now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    pair: pair, dir: direction,
    score: Math.round(s),
    verdict: verdictOf(s, cfg().thresholds),
    crits: crits, miss: miss, mood: mood, day: day, sess: session, cell: currentCell(),
    cap: (s >= cfg().thresholds.aplus && currentCell() !== 'A+'), strat: strat, model: model, sent: sent,
    emoBlock: emoLocked(), intent: intent, stars: 0, r: '',
    sabah: document.getElementById('d-sabah').value,
    senaryo: document.getElementById('d-senaryo').value,
    anti: document.getElementById('d-anti').value,
    gunsonu: document.getElementById('d-gunsonu').value,
    note: '',
    images: []
  });
  saveTrades(); renderTrades();
  di.value = '';
  note.textContent = 'İşlem kaydedildi — Trade Günlüğü\'ne otomatik eklendi. Sonucu belli olunca R kolonunu doldur.';
  setTimeout(() => { note.textContent = ''; }, 4000);
  // Trade Günlüğü'ne otomatik aktar + Notion'a senkron (not, foto, strateji, model dahil)
  const nt = trades[0];
  syncDefterToJournal(nt);
  } catch (e) {
    console.error('logTrade hatası:', e);
    note.textContent = 'İşlem kaydedilemedi: ' + e.message;
    note.style.color = 'var(--red)';
    setTimeout(() => { note.textContent = ''; }, 6000);
  }
}

function critNames(t) {
  return (t.crits || []).map(c => typeof c === 'string' ? c : c.n);
}

let tradeFilter = 'all';
function tradeDateObj(t) {
  // t.date "GG/AA" → 2026 yılı varsayımıyla Date
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
    // haftanın pazartesisi
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
      return '<b>' + v + '</b> (' + g.n + ' işlem): toplam ' + g.sum.toFixed(2) + 'R, ort ' + (g.sum / g.n).toFixed(2) + 'R';
    });
    stats.innerHTML = 'Skor × sonuç: ' + parts.join(' · ');
  } else {
    stats.textContent = shown.length > 0
      ? 'Sonuçlanan işlemlerin R değerini gir — skor dilimlerinin gerçek performansı burada birikecek.'
      : (trades.length > 0 ? 'Bu filtrede işlem yok.' : 'Henüz kayıt yok. Kriterleri tikleyip "İşlemi Kaydet" de.');
  }

  shown.slice(0, 60).forEach(t => {
    const row = document.createElement('div');
    row.className = 'trade-row';
    const when = document.createElement('span');
    when.className = 'when'; when.textContent = t.date + ' ' + t.time;
    when.title = 'Tarihi düzenlemek için tıkla';
    when.style.cursor = 'pointer';
    when.addEventListener('click', async e => {
      e.stopPropagation();
      const cur = t.date || '';
      const inp = prompt('İşlem tarihi (GG/AA):', cur);
      if (inp === null) return;
      const v = inp.trim();
      if (!/^\d{1,2}\/\d{1,2}$/.test(v)) { alert('Biçim GG/AA olmalı, ör. 22/07'); return; }
      const [d, m] = v.split('/');
      t.date = d.padStart(2, '0') + '/' + m.padStart(2, '0');
      // gün-seans hücresini de tarihe göre güncelle
      const jsDay = new Date(2026, parseInt(m, 10) - 1, parseInt(d, 10)).getDay();
      const dayMap = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
      if (!isNaN(jsDay)) t.day = dayMap[jsDay];
      await saveTrades(); renderTrades();
    });
    const pd = document.createElement('span');
    pd.className = 'pd ' + (t.dir === 'LONG' ? 'dl' : 'ds');
    pd.textContent = t.pair + ' ' + t.dir;
    const sc = document.createElement('span');
    sc.className = 'sc ' + (t.verdict === 'A+' ? 'a' : t.verdict === 'B' ? 'b' : 'no');
    sc.innerHTML = '%' + t.score + ' · ' + t.verdict + (t.override ? ' <span class="ov">✎</span>' : '');
    const crits = document.createElement('span');
    crits.className = 'crits';
    crits.textContent = critNames(t).length + ' kriter ' + (openTrades.has(t.id) ? '▴' : '▾');
    let stratChip = null;
    if (t.strat && t.strat.trim() !== '') {
      stratChip = document.createElement('span');
      stratChip.className = 'strat';
      stratChip.textContent = t.strat;
    }
    const rwrap = document.createElement('span');
    rwrap.className = 'rwrap';
    const rlbl = document.createElement('span'); rlbl.textContent = 'R';
    const rin = document.createElement('input');
    rin.className = 'rin'; rin.type = 'number'; rin.step = '0.05'; rin.placeholder = '—';
    rin.value = t.r;
    rin.setAttribute('aria-label', 'Sonuç (R)');
    rin.addEventListener('click', e => e.stopPropagation());
    rin.addEventListener('change', () => {
      t.r = rin.value;
      saveTrades(); renderTrades();
      syncDefterToJournal(t);
    });
    rwrap.appendChild(rlbl); rwrap.appendChild(rin);
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '×'; del.setAttribute('aria-label', 'Kaydı sil');
    del.addEventListener('click', e => {
      e.stopPropagation();
      trades = trades.filter(x => x.id !== t.id);
      saveTrades(); renderTrades();
      // Trade Günlüğü'ndeki eşini de kaldır
      if (typeof dataTrades !== 'undefined' && Array.isArray(dataTrades)) {
        const before = dataTrades.length;
        dataTrades = dataTrades.filter(x => x.ts !== t.id);
        if (dataTrades.length !== before) { saveData(); renderData(); }
      }
    });

    const detail = document.createElement('div');
    detail.className = 'trade-detail';
    if (typeof t.mood === 'number') {
      const [mlbl] = moodLabel(t.mood);
      const mi = document.createElement('div');
      mi.className = 'td-item ' + (Math.abs(t.mood) <= 2 ? 'yes' : 'no');
      mi.innerHTML = '<span class="mk">◈</span><span></span>';
      mi.children[1].textContent = 'Duygu ibresi: ' + mlbl + ' (' + (t.mood > 0 ? '+' : '') + t.mood + ')';
      detail.appendChild(mi);
    }
    if (t.sess) {
      const si = document.createElement('div');
      si.className = 'td-item yes';
      si.innerHTML = '<span class="mk">◉</span><span></span>';
      si.children[1].textContent = 'Seans: ' + (t.day ? t.day + ' ' : '') + t.sess + (t.cell ? ' · hücre kalitesi: ' + t.cell : '');
      detail.appendChild(si);
    }
    if (t.sent) {
      const se = document.createElement('div');
      const contra = t.sent !== t.dir;
      se.className = 'td-item ' + (contra ? 'yes' : 'no');
      se.innerHTML = '<span class="mk">⇄</span><span></span>';
      se.children[1].textContent = 'Duyarlılık: çoğunluk ' + t.sent + ' — ' + (contra ? 'ters bias konfluensi (+' + SENT_PTS + ')' : 'kalabalıkla aynı yön (−' + SENT_PTS + ')');
      detail.appendChild(se);
    }
    if (t.cap) {
      const ci = document.createElement('div');
      ci.className = 'td-item no';
      ci.innerHTML = '<span class="mk">◷</span><span></span>';
      ci.children[1].textContent = 'Gün/Seans kuralı uygulandı: skor A+ bölgesinde, karar hücre kalitesiyle sınırlandı.';
      detail.appendChild(ci);
    }
    (t.crits || []).forEach(c => {
      const name = typeof c === 'string' ? c : c.n;
      const pts = typeof c === 'string' ? null : c.p;
      const it = document.createElement('div');
      it.className = 'td-item yes';
      it.innerHTML = '<span class="mk">✓</span><span></span>' + (pts !== null ? '<span class="tp"></span>' : '');
      it.children[1].textContent = name;
      if (pts !== null) it.children[2].textContent = (pts > 0 ? '+' : '') + pts;
      detail.appendChild(it);
    });
    (t.miss || []).forEach(name => {
      const it = document.createElement('div');
      it.className = 'td-item no';
      it.innerHTML = '<span class="mk">○</span><span></span>';
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
    sinp.type = 'text'; sinp.placeholder = 'ör. Breaker Trap v2, WOS, Contrarian Short...';
    sinp.value = t.strat || '';
    sinp.addEventListener('change', () => {
      t.strat = sinp.value;
      saveTrades(); renderTrades();
      syncDefterToJournal(t);
    });
    form.appendChild(vlbl); form.appendChild(vsel);
    form.appendChild(slbl); form.appendChild(sinp);
    detail.appendChild(form);

    // Akşam: karar/süreç yıldızı (serbest, 1-5)
    const starWrap = document.createElement('div');
    // Günlük plan notları
    if (t.sabah || t.senaryo || t.anti || t.gunsonu) {
      const planDiv = document.createElement('div');
      planDiv.style.cssText = 'border-top:1px solid var(--border);margin-top:10px;padding-top:10px;';
      planDiv.addEventListener('click', e => e.stopPropagation());
      if (t.sabah) { const r = document.createElement('div'); r.className = 'td-item yes'; r.innerHTML = '<span class="mk">☀</span><span></span>'; r.children[1].textContent = t.sabah; planDiv.appendChild(r); }
      if (t.senaryo) { const r = document.createElement('div'); r.className = 'td-item yes'; r.innerHTML = '<span class="mk">→</span><span></span>'; r.children[1].textContent = 'Senaryo: ' + t.senaryo; planDiv.appendChild(r); }
      if (t.anti) { const r = document.createElement('div'); r.className = 'td-item yes'; r.innerHTML = '<span class="mk">←</span><span></span>'; r.children[1].textContent = 'Anti: ' + t.anti; planDiv.appendChild(r); }
      if (t.gunsonu) { const r = document.createElement('div'); r.className = 'td-item yes'; r.innerHTML = '<span class="mk">◷</span><span></span>'; r.children[1].textContent = 'Gün sonu: ' + t.gunsonu; planDiv.appendChild(r); }
      starWrap.insertAdjacentElement('beforebegin', planDiv);
    }
    starWrap.className = 'td-stars';
    starWrap.addEventListener('click', e => e.stopPropagation());
    const sl = document.createElement('span'); sl.className = 'sl'; sl.textContent = 'Karar';
    const srow = document.createElement('div'); srow.className = 'star-row';
    const cap = document.createElement('span'); cap.className = 'star-cap';
    const STAR_CAP = { 0: 'akşam doldur', 1: 'kötü karar · kötü süreç', 2: 'zayıf', 3: 'idare eder', 4: 'iyi', 5: 'iyi karar · iyi süreç' };
    const paintStars = () => {
      const val = t.stars || 0;
      [...srow.children].forEach((b, i) => { b.className = i < val ? 'lit' : ''; b.textContent = i < val ? '★' : '☆'; });
      cap.textContent = STAR_CAP[val];
    };
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.setAttribute('aria-label', i + ' yıldız');
      b.addEventListener('click', () => {
        t.stars = (t.stars === i ? 0 : i); // aynıya basınca sıfırla
        saveTrades(); paintStars();
      });
      srow.appendChild(b);
    }
    paintStars();
    starWrap.appendChild(sl); starWrap.appendChild(srow); starWrap.appendChild(cap);

    // giriş niyeti rozeti (varsa)
    if (t.intent) {
      const ib = document.createElement('span');
      ib.className = 'star-cap';
      ib.style.marginLeft = 'auto';
      ib.style.fontWeight = '700';
      ib.style.color = t.intent === 'setup' ? 'var(--green)' : 'var(--red)';
      ib.textContent = t.intent === 'setup' ? "Girişte: Setup'ı" : 'Girişte: Duygumu';
      starWrap.appendChild(ib);
    }
    detail.appendChild(starWrap);

    if (openTrades.has(t.id)) row.classList.add('open');
    row.addEventListener('click', () => {
      if (openTrades.has(t.id)) openTrades.delete(t.id); else openTrades.add(t.id);
      row.classList.toggle('open');
      dtOpenTrade = row.classList.contains('open') ? t : null;
      crits.textContent = critNames(t).length + ' kriter ' + (row.classList.contains('open') ? '▴' : '▾');
    });

    const shb = document.createElement('button');
    shb.className = 'del'; shb.textContent = '⤴'; shb.setAttribute('aria-label', 'Bu işlemi görsel olarak paylaş');
    shb.addEventListener('click', async e => {
      e.stopPropagation();
      const data = tradeShareData(t);
      await attachPlanToShare(data);
      openShare(data);
    });

    row.appendChild(when); row.appendChild(pd); row.appendChild(sc);
    if (stratChip) row.appendChild(stratChip);
    row.appendChild(crits);

    // Ortada: not — satıra özel, aşağı doğru açılabilir (resize)
    const noteWrap = document.createElement('div');
    noteWrap.className = 'tr-note-wrap';
    const trNote = document.createElement('textarea');
    trNote.className = 'tr-note'; trNote.rows = 1;
    trNote.placeholder = 'Not';
    trNote.value = t.note || '';
    trNote.addEventListener('input', () => { t.note = trNote.value; saveTrades(); });
    trNote.addEventListener('change', () => { t.note = trNote.value; saveTrades(); syncDefterToJournal(t); });
    trNote.addEventListener('focus', () => { dtRowFocus = t; });
    trNote.addEventListener('click', e => e.stopPropagation());
    noteWrap.appendChild(trNote);

    // Sağda: fotoğraf alanı — kutuya tek tık Ctrl+V hazır, çift tık PC'den yükle, sürükle-bırak da var
    const photo = document.createElement('div');
    photo.className = 'tr-photo';
    const trThumbs = document.createElement('div');
    trThumbs.className = 'tr-thumbs';
    const photoBox = document.createElement('div');
    photoBox.className = 'tr-photo-box';
    photoBox.title = "Tek tık → Ctrl+V ile yapıştır · Çift tık → PC'den yükle";
    photoBox.textContent = '🖼️';
    const trFile = document.createElement('input');
    trFile.type = 'file'; trFile.accept = 'image/*'; trFile.multiple = true; trFile.style.display = 'none';
    const trAddImg = dataUrl => {
      if (!dataUrl) return;
      if (!Array.isArray(t.images)) t.images = [];
      if (t.images.includes(dataUrl)) return; // çift kayıt önleme
      t.images.push(dataUrl);
      saveTrades(); syncDefterToJournal(t); dtRenderRowThumbs(t);
    };
    photoBox.addEventListener('click', e => {
      e.stopPropagation(); dtRowFocus = t;
      photoBox.classList.add('armed');
      photoBox.textContent = 'Ctrl+V';
      clearTimeout(photoBox._t);
      photoBox._t = setTimeout(() => { photoBox.classList.remove('armed'); photoBox.textContent = '🖼️'; }, 1500);
    });
    photoBox.addEventListener('dblclick', e => {
      e.stopPropagation(); dtRowFocus = t; trFile.click();
    });
    trFile.addEventListener('change', e => {
      Array.from(e.target.files).forEach(f => {
        const r = new FileReader(); r.onload = ev => trAddImg(ev.target.result); r.readAsDataURL(f);
      });
      trFile.value = '';
    });
    photo.appendChild(trThumbs);
    photo.appendChild(photoBox);
    photo.appendChild(trFile);
    photo.addEventListener('click', e => e.stopPropagation());
    photo.addEventListener('focusin', () => { dtRowFocus = t; });
    photo.addEventListener('dragover', e => { e.preventDefault(); photo.classList.add('drag'); });
    photo.addEventListener('dragleave', () => photo.classList.remove('drag'));
    photo.addEventListener('drop', e => {
      e.preventDefault(); photo.classList.remove('drag');
      Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(f => {
        const r = new FileReader(); r.onload = ev => trAddImg(ev.target.result); r.readAsDataURL(f);
      });
    });
    dtAnnexMap.set(t.id, photo);
    dtRenderRowThumbs(t);

    // R en sağda
    row.appendChild(noteWrap); row.appendChild(photo); row.appendChild(rwrap); row.appendChild(shb); row.appendChild(del);

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
  count.textContent = withR.length + ' sonuçlu işlem';
  if (withR.length < 5) {
    hint.textContent = 'Kriter bazlı analiz için en az 5 sonuçlu (R girilmiş) işlem gerekli. Kayıtlar biriktikçe her kriterin "varken / yokken" ortalama R farkı burada görünecek — hangi konfirmasyonun gerçekten çalıştığını bu tablo söyleyecek.';
    return;
  }
  hint.textContent = 'Fark = kriter işaretliyken ort R − işaretli değilken ort R. Pozitif fark: kriter edge katıyor. 5\'ten az örnekli satırlara güvenme, "az örnek" rozetine dikkat.';

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
    st.textContent = s.cnt + ' işlemde ✓ · varken ort ' + s.avgW.toFixed(2) + 'R' +
      (s.avgWo === null ? '' : ' · yokken ort ' + s.avgWo.toFixed(2) + 'R');
    const df = document.createElement('span');
    if (s.diff === null) { df.className = 'df neu'; df.textContent = '—'; }
    else {
      df.className = 'df ' + (s.diff > 0.05 ? 'pos' : s.diff < -0.05 ? 'neg' : 'neu');
      df.textContent = (s.diff > 0 ? '+' : '') + s.diff.toFixed(2) + 'R';
    }
    row.appendChild(nm); row.appendChild(st); row.appendChild(df);
    if (s.cnt < 5) {
      const few = document.createElement('span');
      few.className = 'few'; few.textContent = 'az örnek';
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
    document.getElementById('export-note').textContent = 'Kopyalandı ✓ — şimdi Claude\'a yapıştır.';
  });

  document.getElementById('btn-logtrade').addEventListener('click', logTrade);
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
    model = '';
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
  bindStrategiesPage();
  bindAnalizPage();
  bindChannelsPage();
  mtInit();
  bindPanoPage();
  bindIndicatorsPage();
  bindAdminChat();
  bindOnchainPage();
  bindCalcPage();
  bindDesignerPage();
  bindAlfaTrading();
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
  // Nav dropdown — hover (desktop) & click toggle (mobile)
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
  // Açılır seçiciler: dışarı tıklayınca kapat
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.picker')) {
      document.querySelectorAll('.picker.open').forEach(o => o.classList.remove('open'));
    }
  });
  // Notion'dan strateji & entry model seçeneklerini getir (async, hata sessiz)
  loadNotionOptions();
  // Mobil hamburger menü (kenar çekmecesi)
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
  // Global nav link handling (SPA intercept, sağ tık açma)
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
  // Sayfa yüklendiğinde ?page= parametresini oku
  const pm = window.location.search.match(/[?&]page=(\w+)/);
  if (pm) showPage(pm[1]);
  // Eğitim kanalı derin bağlantısı: ?page=egitim&ch=<id>&sec=<id>&t=<id>&v=<id> ya da kısa ?go=<code>
  const qs = new URLSearchParams(window.location.search);
  const go = qs.get('go');
  if (go) {
    chDeep = { short: go };
    if (!pm || pm[1] !== 'egitim') showPage('egitim');
  } else if (pm && pm[1] === 'egitim') {
    const chId = qs.get('ch');
    if (chId) {
      chDeep = { ch: chId, sec: qs.get('sec') || null, t: qs.get('t') || null, v: qs.get('v') || null };
    }
  }
}
function dnum(v) { return isNaN(parseFloat(v)) ? 0 : parseFloat(v); }
// ============ Data Takibi ============
const DATA_KEY = 'defter-data-v1';
let dataTrades = [];
let dfDir = 'LONG';
let currentPage = 'home';
try {
  const VALID_PAGES = ['home','defter','data','review','news','egitim','strategies','analiz','mentoring','pano','indicators','designer','onchain','calendar','basvuru','chat-admin','calc','alfa','apps','alfatrading'];
  const lp = localStorage.getItem('df-last-page');
  if (lp && VALID_PAGES.indexOf(lp) >= 0) currentPage = lp;
  const sp = new URLSearchParams(location.search);
  const pg = sp.get('page');
  if (pg && VALID_PAGES.indexOf(pg) >= 0) currentPage = pg;
  const postId = sp.get('post');
  if (postId) { window.alfaOpenPostId = postId; currentPage = 'alfatrading'; }
} catch (e) {}
setInitialPage();
const NEWS_KEY = 'alfanews-shared-v1';
const ADMIN_EMAIL = 'ahmetnuman20@gmail.com';
// AlfaNews — paylaşımlı dergi (sabit kapak + içindekiler + analiz sayfaları)
let magData = { issueNo: 1, entries: [] };
let magIndex = 0;
let magSaveTimer = null;
let magPreview = false; // admin okuyucu önizlemesi

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
  } catch (e) { /* tablo yok / çevrimdışı */ }
  if (!d) { try { const raw = await store.get(NEWS_KEY); d = raw ? JSON.parse(raw) : null; } catch (e) { d = null; } }
  if (!d || typeof d !== 'object') d = {};
  magData = d;
  if (typeof magData.issueNo !== 'number') magData.issueNo = 1;
  if (!Array.isArray(magData.entries)) magData.entries = [];
  magData.entries.forEach(e => {
    if (!Array.isArray(e.images)) e.images = [];
    if (typeof e.title !== 'string') e.title = '';
    if (typeof e.body !== 'string') e.body = '';
    if (e.type !== 'update') e.type = '';
    if (typeof e.relId !== 'string') e.relId = '';
    if (typeof e.beforeImg !== 'string') e.beforeImg = '';
    if (typeof e.afterImg !== 'string') e.afterImg = '';
    if (typeof e.result !== 'string') e.result = '';
    if (typeof e.ctaUrl !== 'string') e.ctaUrl = '';
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
  // eski serbest yazılan isim/foto -> roster'a taşı
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
function magIsUpd(en) { return en && en.type === 'update'; }
function magMainList() { return magData.entries.filter(e => !magIsUpd(e)); }
function magCount() { return 2 + magMainList().length; }
function magMainIdx(entryIdx) {
  // entry (dizi) indeksi -> sayfa indeksi (kapak 0, içindekiler 1, analizler 2+)
  let c = 0;
  for (let j = 0; j < entryIdx; j++) if (!magIsUpd(magData.entries[j])) c++;
  return 2 + c;
}
function magUpdParentIdx(upd) {
  // Güncellemenin bağlı olduğu analiz indeksi (relId öncelikli, yoksa en yakın önceki analiz)
  if (upd && upd.relId) {
    const i = magData.entries.findIndex(e => !magIsUpd(e) && e.id === upd.relId);
    if (i >= 0) return i;
  }
  if (!upd) return -1;
  const idx = magData.entries.indexOf(upd);
  for (let j = idx - 1; j >= 0; j--) if (!magIsUpd(magData.entries[j])) return j;
  for (let j = magData.entries.length - 1; j >= 0; j--) if (!magIsUpd(magData.entries[j])) return j;
  return -1;
}
function magUpdBefore(upd) {
  // before görseli: önce kendi, sonra kendi images[0], sonra bağlı analizin görseli
  if (upd.beforeImg) return upd.beforeImg;
  if (Array.isArray(upd.images) && upd.images[0]) return upd.images[0];
  const pi = magUpdParentIdx(upd);
  if (pi >= 0) { const p = magData.entries[pi]; if (p && Array.isArray(p.images) && p.images[0]) return p.images[0]; }
  return '';
}
function magUpdList(parentIdx) { return magData.entries.filter(e => magIsUpd(e) && magUpdParentIdx(e) === parentIdx); }
function magUpdCount(en) { return magUpdList(magData.entries.indexOf(en)).length; }
function magMainNeighbor(i, dir) {
  let j = i + dir;
  while (j >= 0 && j < magData.entries.length && magIsUpd(magData.entries[j])) j += dir;
  return (j >= 0 && j < magData.entries.length) ? j : -1;
}
function magWeek() {
  const t = new Date(); const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const f = d => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  return f(mon) + ' – ' + f(sun);
}

function magKbIsolate(el) {
  // Dergi yazı alanlarına basılan tuşları global kısayollardan izole et
  // (aksi halde space/ok tuşları bir üst handler'a sızıp engellenebiliyor)
  ['keydown', 'keypress', 'keyup'].forEach(evt => el.addEventListener(evt, e => e.stopPropagation()));
}
function magInput(val, ph, cls, oninput) {
  const el = document.createElement('input'); el.type = 'text'; el.className = 'mag-in ' + (cls || ''); el.value = val || ''; if (ph) el.placeholder = ph;
  el.addEventListener('input', () => { oninput(el.value); magSaveT(); });
  magKbIsolate(el);
  return el;
}
function magArea(val, ph, oninput) {
  const el = document.createElement('textarea'); el.className = 'mag-in mag-area'; el.value = val || ''; if (ph) el.placeholder = ph;
  el.addEventListener('input', () => { oninput(el.value); magSaveT(); });
  magKbIsolate(el);
  return el;
}

function magBuildCover() {
  const page = document.createElement('div'); page.className = 'mag-page mag-cover3';
  const inner = document.createElement('div'); inner.className = 'mag-inner';
  if (magData.coverBg) { const bg = document.createElement('div'); bg.className = 'cv-bg'; bg.style.backgroundImage = 'url("' + String(magData.coverBg).replace(/"/g, '') + '")'; inner.appendChild(bg); }
  else {
    // Gömülü kapak tasarımı — trading temalı grafik motifi
    const glow = document.createElement('div'); glow.className = 'cv-glow'; inner.appendChild(glow);
    const deco = document.createElement('div'); deco.className = 'cv-deco';
    deco.innerHTML = '<svg viewBox="0 0 400 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
      '<g stroke="rgba(255,255,255,.06)" stroke-width="1"><line x1="0" y1="420" x2="400" y2="420"/><line x1="0" y1="480" x2="400" y2="480"/><line x1="0" y1="540" x2="400" y2="540"/></g>' +
      '<path d="M0,522 44,500 88,510 132,466 176,484 220,436 264,452 308,402 352,420 400,368 L400,600 L0,600 Z" fill="rgba(255,255,255,.05)"/>' +
      '<polyline points="0,522 44,500 88,510 132,466 176,484 220,436 264,452 308,402 352,420 400,368" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="400" cy="368" r="4" fill="rgba(255,255,255,.5)"/>' +
      '<g fill="rgba(255,255,255,.10)"><rect x="66" y="548" width="9" height="34" rx="2"/><rect x="126" y="536" width="9" height="30" rx="2"/><rect x="186" y="556" width="9" height="24" rx="2"/><rect x="246" y="528" width="9" height="42" rx="2"/><rect x="306" y="544" width="9" height="28" rx="2"/><rect x="360" y="516" width="9" height="46" rx="2"/></g>' +
      '</svg>';
    inner.appendChild(deco);
  }
  const pad = document.createElement('div'); pad.className = 'mag-pad';
  pad.innerHTML =
    '<div class="cv-top"><span class="cv-oa">ALFA TRADERS</span><span class="cv-issue">Sayı ' + (magData.issueNo || 1) + '</span></div>' +
    '<div class="cv-logo"><svg viewBox="0 0 32 32" fill="none"><path d="M8.5 26 16 6.5 23.5 26" stroke="#fff" stroke-width="2.9" stroke-linejoin="round" stroke-linecap="round"/><path d="M12 18.6h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><path d="M9.6 22.8 14.9 17.5l4.7-4.9" stroke="#c5c1ff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.9 17.5l1.8-1.9" stroke="#c5c1ff" stroke-width="2.3" stroke-linecap="round"/></svg></div>' +
    '<h1 class="cv-title">AlfaNews</h1>' +
    '<div class="cv-sub">Haftalık Piyasa Dergisi</div>' +
    '<div class="cv-cats"><span>Makroekonomi</span><span>Bitcoin &amp; Kripto</span><span>Forex</span><span>Teknik Analiz</span></div>' +
    '<div class="cv-foot"><div class="cv-date">' + magEsc(magData.weekLabel || magWeek()) + '</div><div class="cv-turn">Oku →</div></div>';
  inner.appendChild(pad);
  // Admin: hafta tarihi + sayı numarası yerinde düzenlenebilir
  if (magIsAdmin()) {
    const dEl = pad.querySelector('.cv-date');
    if (dEl) {
      const di = document.createElement('input'); di.className = 'cv-date-in'; di.value = magData.weekLabel || magWeek(); di.placeholder = 'ör. 3 – 10 Ağustos';
      magKbIsolate(di);
      di.addEventListener('input', () => { magData.weekLabel = di.value; magSaveT(); });
      dEl.replaceWith(di);
    }
    const iEl = pad.querySelector('.cv-issue');
    if (iEl) {
      const wrap = document.createElement('span'); wrap.className = 'cv-issue'; wrap.textContent = 'Sayı ';
      const ii = document.createElement('input'); ii.className = 'cv-issue-in'; ii.type = 'number'; ii.value = magData.issueNo || 1; ii.min = '1';
      magKbIsolate(ii);
      ii.addEventListener('input', () => { magData.issueNo = parseInt(ii.value, 10) || 1; magSaveT(); });
      wrap.appendChild(ii); iEl.replaceWith(wrap);
    }
  }
  // Analist avatarları — sağ alt köşede yay dizilimi
  const list = (magData.authors || []).slice(0, 6);
  if (list.length) {
    const cl = document.createElement('div'); cl.className = 'cv-analysts';
    const n = list.length, R = 62, cx = 150, cy = 150;
    list.forEach((a, idx) => {
      const av = document.createElement('div'); av.className = 'cv-an'; av.title = (a.name || '') + (a.specialty ? (' · ' + a.specialty) : '');
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
    const up = document.createElement('label'); up.className = 'cv-bgup'; up.textContent = '📷'; up.title = magData.coverBg ? 'Kapak görselini değiştir' : 'Kapak görseli ekle';
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
  const h = document.createElement('div'); h.className = 'toc-kicker'; h.textContent = 'Bu Sayıda'; pad.appendChild(h);
  const h2 = document.createElement('h2'); h2.className = 'toc-h'; h2.textContent = 'İçindekiler'; pad.appendChild(h2);
  if (!magData.entries.length) {
    const e = document.createElement('div'); e.className = 'toc-empty'; e.textContent = magIsAdmin() ? 'Henüz analiz yok. Üstteki “+ Analiz ekle” ile başla.' : 'Bu sayı hazırlanıyor.'; pad.appendChild(e);
  }
  const adminToc = magIsAdmin() && !magPreview;
  let k = 0;
  magData.entries.forEach((en, i) => {
    if (magIsUpd(en)) return; // güncellemeler ayrı sayfa değil, analiz sayfasının altında
    k++;
    const nUpd = magUpdCount(en);
    const row = document.createElement('div'); row.className = 'toc-row';
    const it = document.createElement('button'); it.className = 'toc-item' + (nUpd ? ' has-upd' : ''); it.type = 'button';
    const au = magAuthor(en.authorId);
    const auName = au && au.name ? au.name : (en.authorName || '');
    it.innerHTML = '<b>' + String(k).padStart(2, '0') + '</b><span class="tt">' + magEsc(en.title || 'Analiz') + (auName ? '<small>✍ ' + magEsc(auName) + '</small>' : '') + '</span>' + (nUpd ? '<span class="toc-upd">↺ ' + nUpd + '</span>' : '') + '<span class="pg">sf ' + (k + 2) + '</span>';
    it.addEventListener('click', () => magGoTo(magMainIdx(i)));
    row.appendChild(it);
    if (adminToc) {
      const ord = document.createElement('div'); ord.className = 'toc-ord';
      const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.title = 'Yukarı taşı'; up.disabled = !magMainNeighbor(i, -1);
      up.addEventListener('click', e => { e.stopPropagation(); magMoveEntry(i, magMainNeighbor(i, -1), 1); });
      const dn = document.createElement('button'); dn.type = 'button'; dn.textContent = '↓'; dn.title = 'Aşağı taşı'; dn.disabled = !magMainNeighbor(i, 1);
      dn.addEventListener('click', e => { e.stopPropagation(); magMoveEntry(i, magMainNeighbor(i, 1), 1); });
      ord.appendChild(up); ord.appendChild(dn); row.appendChild(ord);
    }
    pad.appendChild(row);
  });
  inner.appendChild(pad); page.appendChild(inner); return page;
}
function magEsc(v) { const d = document.createElement('div'); d.textContent = String(v == null ? '' : v); return d.innerHTML; }

function magAddImg(en, url) { if (!url) return; if (!Array.isArray(en.images)) en.images = []; if (en.images.includes(url)) return; en.images.push(url); saveNews().then(renderNews); }
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
  if (txt && /^https?:\/\//.test(txt.trim())) { ev.preventDefault(); magAddImg(en, txt.trim()); }
}
function magSetType(en, type) {
  en.type = type || '';
  if (type === 'update') {
    if (!en.relId) { const pi = magUpdParentIdx(en); if (pi >= 0) en.relId = magData.entries[pi].id; }
    if (!en.beforeImg && Array.isArray(en.images) && en.images.length) en.beforeImg = en.images[0];
  } else {
    en.relId = '';
  }
  saveNews().then(renderNews);
}
function magBaSlot(en, key, cls, lbl, auto) {
  const slot = document.createElement('div'); slot.className = 'e-ba-slot'; slot.tabIndex = 0;
  const h = document.createElement('div'); h.className = 'e-ba-slot-h';
  const l = document.createElement('span'); l.className = cls; l.textContent = lbl; h.appendChild(l);
  const box = document.createElement('div'); box.style.position = 'relative';
  const url = en[key] || auto || '';
  const set = v => { en[key] = v; saveNews().then(renderNews); };
  if (url) {
    const img = document.createElement('img'); img.className = 'e-ba-prev'; img.src = url; img.alt = '';
    box.appendChild(img);
    const clr = document.createElement('button'); clr.type = 'button'; clr.className = 'e-ba-clear'; clr.textContent = '×'; clr.title = 'Görseli kaldır';
    clr.addEventListener('click', e => { e.stopPropagation(); set(''); });
    box.appendChild(clr);
    if (auto && !en[key]) {
      const chip = document.createElement('div'); chip.className = 'e-ba-auto'; chip.textContent = '↺ ' + t('pg.news.autoBefore'); box.appendChild(chip);
      const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'e-ba-pin'; pin.textContent = '📌 ' + t('pg.news.pin'); pin.title = t('pg.news.pinTitle');
      pin.addEventListener('click', e => { e.stopPropagation(); set(auto); });
      box.appendChild(pin);
    }
  } else {
    const em = document.createElement('div'); em.className = 'e-ba-empty'; em.setAttribute('contenteditable', 'true'); em.tabIndex = -1;
    em.textContent = t('pg.news.pasteHint');
    const ph = t('pg.news.pasteHint');
    em.addEventListener('focus', () => { if (em.textContent.trim() === ph) em.textContent = ''; });
    em.addEventListener('blur', () => { if (!em.textContent.trim()) em.textContent = ph; });
    box.appendChild(em);
    box._edit = em;
  }
  slot.appendChild(h); slot.appendChild(box);
  const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.style.display = 'none';
  fi.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => set(r.result); r.readAsDataURL(f); e.target.value = ''; });
  slot.appendChild(fi);
  const onPaste = e => {
    const cd = e.clipboardData || window.clipboardData; if (!cd) return;
    const it = cd.items ? Array.from(cd.items) : [];
    const imgItem = it.find(x => x.type && x.type.indexOf('image/') === 0);
    if (imgItem) { e.preventDefault(); const f = imgItem.getAsFile(); if (f) { const r = new FileReader(); r.onload = () => set(r.result); r.readAsDataURL(f); } return; }
    const txt = cd.getData ? cd.getData('text') : '';
    if (txt && /^https?:\/\//.test(txt.trim())) { e.preventDefault(); set(txt.trim()); }
  };
  slot.addEventListener('paste', onPaste);
  slot.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && box._edit) box._edit.focus(); });
  slot.addEventListener('click', () => { if (box._edit) box._edit.focus(); fi.click(); });
  slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('hover'); });
  slot.addEventListener('dragleave', () => slot.classList.remove('hover'));
  slot.addEventListener('drop', e => { e.preventDefault(); slot.classList.remove('hover'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && f.type && f.type.indexOf('image/') === 0) { const r = new FileReader(); r.onload = () => set(r.result); r.readAsDataURL(f); } });
  return slot;
}
function magRelIndex(id) { return magData.entries.findIndex(e => e.id === id); }
function magToast(msg) {
  let t = document.getElementById('mag-toast');
  if (!t) { t = document.createElement('div'); t.className = 'mag-toast'; t.id = 'mag-toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(magToast._t); magToast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function magEntryUrl(en) { return location.origin + location.pathname + '?page=news#mag-' + en.id; }
function magShare(en, i) {
  const isUpd = en.type === 'update';
  const title = en.title || (isUpd ? t('pg.news.upd') : t('pg.news.an'));
  const author = magAuthor(en.authorId);
  const by = author && author.name ? (' — ' + author.name) : '';
  const url = magEntryUrl(en);
  const text = '📈 ' + title + by + '\n' + url;
  const done = () => magToast(t('pg.news.shareCopied'));
  if (navigator.share) { navigator.share({ title: title, text: text, url: url }).catch(() => {}); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => done());
  else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); }
}
function magBuildEntry(en, i, admin) {
  const page = document.createElement('div'); page.className = 'mag-page mag-entry';
  const inner = document.createElement('div'); inner.className = 'mag-inner';
  const pad = document.createElement('div'); pad.className = 'mag-pad';
  // başlık satırı
  const head = document.createElement('div'); head.className = 'e-head';
  const kick = document.createElement('span'); kick.className = 'e-kicker'; kick.textContent = 'ANALİZ · sf ' + (magMainIdx(i) + 1); head.appendChild(kick);
  if (admin) {
    const tools = document.createElement('span'); tools.className = 'e-tools';
    const up = document.createElement('button'); up.type = 'button'; up.textContent = '‹'; up.title = 'Öne al'; up.disabled = magMainNeighbor(i, -1) < 0; up.addEventListener('click', () => magMoveEntry(i, magMainNeighbor(i, -1))); tools.appendChild(up);
    const dn = document.createElement('button'); dn.type = 'button'; dn.textContent = '›'; dn.title = 'Geri al'; dn.disabled = magMainNeighbor(i, 1) < 0; dn.addEventListener('click', () => magMoveEntry(i, magMainNeighbor(i, 1))); tools.appendChild(dn);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = '× Sil'; del.addEventListener('click', () => magDelEntry(i)); tools.appendChild(del);
    head.appendChild(tools);
  }
  pad.appendChild(head);
  // geniş açılım: sol = analiz, sağ = güncelleme/sonuç
  const spread = document.createElement('div'); spread.className = 'e-spread' + (admin || magUpdList(i).length ? '' : ' solo');
  const main = document.createElement('div'); main.className = 'e-col-main';
  // başlık
  if (admin) main.appendChild(magInput(en.title, 'Analiz başlığı (ör. BTC Haftalık Görünüm)', 'e-title-in', v => en.title = v));
  else { const t = document.createElement('h2'); t.className = 'e-title'; t.textContent = en.title || 'Analiz'; main.appendChild(t); }
  // görseller (normal analiz)
  const imgs = document.createElement('div'); imgs.className = 'e-imgs';
  (en.images || []).forEach((url, k) => {
    const wrap = document.createElement('div'); wrap.className = 'e-imgwrap';
    const img = document.createElement('img'); img.className = 'e-img'; img.src = url; img.alt = 'Analiz görseli'; img.loading = 'lazy';
    img.addEventListener('click', () => magZoom(url, en.body));
    wrap.appendChild(img);
    if (admin) { const x = document.createElement('button'); x.type = 'button'; x.className = 'e-imgdel'; x.textContent = '×'; x.title = 'Görseli kaldır'; x.addEventListener('click', e => { e.stopPropagation(); en.images.splice(k, 1); saveNews(); renderNews(); }); wrap.appendChild(x); }
    imgs.appendChild(wrap);
  });
  main.appendChild(imgs);
  if (admin) {
    const dz = document.createElement('div'); dz.className = 'e-dz'; dz.tabIndex = 0;
    dz.innerHTML = '<div class="e-dz-t">＋ Görsel ekle</div><div class="e-dz-s">Çift tıkla yükle · tıkla + Ctrl+V yapıştır · sürükle-bırak · ya da linki aşağı yapıştır</div>';
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.multiple = true; fi.style.display = 'none';
    fi.addEventListener('change', e => { magFilesToEntry(en, e.target.files); e.target.value = ''; });
    dz.appendChild(fi);
    dz.addEventListener('dblclick', () => fi.click());
    dz.addEventListener('paste', e => magPasteToEntry(en, e));
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer) { if (e.dataTransfer.files && e.dataTransfer.files.length) magFilesToEntry(en, e.dataTransfer.files); else { const u = e.dataTransfer.getData('text'); if (u) magAddImg(en, u.trim()); } } });
    main.appendChild(dz);
    const addRow = document.createElement('div'); addRow.className = 'e-addimg';
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'mag-in'; inp.placeholder = 'TradingView / görsel bağlantısı (https://…)';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'mag-btn sm'; btn.textContent = '+ Ekle';
    const add = () => { const u = inp.value.trim(); if (!u) return; inp.value = ''; magAddImg(en, u); };
    btn.addEventListener('click', add); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    inp.addEventListener('paste', e => magPasteToEntry(en, e));
    addRow.appendChild(inp); addRow.appendChild(btn); main.appendChild(addRow);
  }
  // metin
  if (admin) main.appendChild(magArea(en.body, 'Analiz metni: bias, seviyeler, iki yönlü senaryo, riskler…', v => en.body = v));
  else { const b = document.createElement('div'); b.className = 'e-body'; b.textContent = en.body || ''; main.appendChild(b); }
  // künye (analisti yapan)
  const by = document.createElement('div'); by.className = 'mag-byline';
  const author = magAuthor(en.authorId);
  const av = document.createElement('div'); av.className = 'b-av';
  if (author && author.photo) { av.style.backgroundImage = 'url("' + author.photo.replace(/"/g, '') + '")'; }
  else { av.textContent = (author && author.name) ? author.name.trim().charAt(0).toUpperCase() : '?'; }
  by.appendChild(av);
  if (admin) {
    const col = document.createElement('div'); col.className = 'b-edit';
    const sel = document.createElement('select'); sel.className = 'mag-in';
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = '— Analist seç —'; sel.appendChild(o0);
    magData.authors.forEach(a => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.name || '(isimsiz)'; if (a.id === en.authorId) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', async () => { en.authorId = sel.value; await saveNews(); renderNews(); });
    col.appendChild(sel);
    by.appendChild(col);
  } else {
    const box = document.createElement('div');
    const nm = document.createElement('div'); nm.className = 'b-name'; nm.textContent = author ? (author.name || 'Alfa Traders') : 'Alfa Traders'; box.appendChild(nm);
    const rl = document.createElement('div'); rl.className = 'b-role'; rl.textContent = (author && author.specialty) ? author.specialty : 'Analist'; box.appendChild(rl);
    by.appendChild(box);
  }
  spread.appendChild(main);
  // Güncellemeler — sağ sütunda toplu (okuyucuda yalnız güncelleme varsa)
  if (admin || magUpdList(i).length) {
    const side = document.createElement('div'); side.className = 'e-col-side';
    side.appendChild(magBuildUpdates(en, i, admin));
    spread.appendChild(side);
  }
  pad.appendChild(spread);
  // Sayfa altı: paylaşım + kart görseli (solda) · analist (en sağda)
  const foot = document.createElement('div'); foot.className = 'e-foot';
  if (!admin) {
    const ups = magUpdList(i);
    if (ups.length) {
      const u0 = ups[0], ui0 = magData.entries.indexOf(u0);
      const sh = document.createElement('div'); sh.className = 'e-share';
      const b1 = document.createElement('button'); b1.type = 'button'; b1.textContent = t('pg.news.share'); b1.addEventListener('click', () => magShare(u0, ui0)); sh.appendChild(b1);
      const bd = document.createElement('button'); bd.type = 'button'; bd.textContent = '🖼 ' + t('pg.news.cardImg'); bd.title = t('pg.news.cardImgTitle');
      bd.addEventListener('click', async () => { const d = await magCardImg(u0); if (!d) { magToast(t('pg.news.cardImgEmpty')); return; } magCardView(d); });
      sh.appendChild(bd);
      const url = magEntryUrl(u0), txt = encodeURIComponent((u0.title || t('pg.news.upd')) + ' — AlfaNews');
      const a1 = document.createElement('a'); a1.href = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + txt; a1.target = '_blank'; a1.rel = 'noopener noreferrer'; a1.textContent = '✈ Telegram'; sh.appendChild(a1);
      const a2 = document.createElement('a'); a2.href = 'https://wa.me/?text=' + txt + '%20' + encodeURIComponent(url); a2.target = '_blank'; a2.rel = 'noopener noreferrer'; a2.textContent = '💬 WhatsApp'; sh.appendChild(a2);
      foot.appendChild(sh);
    }
    by.classList.add('byview');
  }
  foot.appendChild(by);
  pad.appendChild(foot);
  inner.appendChild(pad); page.appendChild(inner); return page;
}

function magBuildUpdates(en, i, admin) {
  const box = document.createElement('div'); box.className = 'e-updates' + (admin ? ' ed' : '');
  const list = magUpdList(i);
  const h = document.createElement('div'); h.className = 'e-updates-h';
  const hi = document.createElement('span'); hi.className = 'e-updates-ico'; hi.textContent = '↺'; h.appendChild(hi);
  const ht = document.createElement('span'); ht.className = 'e-updates-t'; ht.textContent = t('pg.news.updates'); h.appendChild(ht);
  const cnt = document.createElement('em'); cnt.className = 'e-updates-cnt'; cnt.textContent = String(list.length); h.appendChild(cnt);
  if (admin) {
    const add = document.createElement('button'); add.type = 'button'; add.className = 'mag-btn ghost sm e-upd-add'; add.textContent = '↺ ' + t('pg.news.updFor');
    add.addEventListener('click', () => magAddUpdateTo(i));
    h.appendChild(add);
  }
  box.appendChild(h);
  list.forEach(u => box.appendChild(magBuildUpdCard(u, i, admin)));
  if (!list.length && !admin) box.classList.add('empty');
  return box;
}
async function magAddUpdateTo(parentIdx) {
  const parent = magData.entries[parentIdx];
  const upd = { id: rid(), title: '', type: 'update', relId: parent ? parent.id : '', beforeImg: '', afterImg: '', result: '', body: '', ctaUrl: '', authorId: parent ? parent.authorId : '' };
  magData.entries.splice(parentIdx + 1, 0, upd);
  await saveNews(); renderNews();
}
function magBuildUpdCard(u, parentIdx, admin) {
  const card = document.createElement('div'); card.className = 'e-upd' + (admin ? ' ed' : '');
  const ui = magData.entries.indexOf(u);
  if (admin) {
    const bar = document.createElement('div'); bar.className = 'e-upd-bar';
    const badge = document.createElement('span'); badge.className = 'e-upd-badge'; badge.textContent = '↺ ' + t('pg.news.upd'); bar.appendChild(badge);
    const tools = document.createElement('span'); tools.className = 'e-tools';
    const sib = magUpdList(parentIdx);
    const sibIdx = sib.indexOf(u);
    const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.title = 'Öne al'; up.disabled = sibIdx <= 0;
    up.addEventListener('click', () => { const o = sib[sibIdx - 1]; if (o) magMoveEntry(ui, magData.entries.indexOf(o)); });
    const dn = document.createElement('button'); dn.type = 'button'; dn.textContent = '↓'; dn.title = 'Geri al'; dn.disabled = sibIdx >= sib.length - 1;
    dn.addEventListener('click', () => { const o = sib[sibIdx + 1]; if (o) magMoveEntry(ui, magData.entries.indexOf(o)); });
    const conv = document.createElement('button'); conv.type = 'button'; conv.textContent = '📄 ' + t('pg.news.convert'); conv.title = t('pg.news.convertTitle');
    conv.addEventListener('click', () => magSetType(u, ''));
    const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = '× Sil'; del.addEventListener('click', () => magDelEntry(ui));
    tools.appendChild(up); tools.appendChild(dn); tools.appendChild(conv); tools.appendChild(del);
    bar.appendChild(tools);
    card.appendChild(bar);
    card.appendChild(magInput(u.title, 'Güncelleme başlığı (ör. BTC — Güncelleme: Hedef Tuttu)', 'e-title-in', v => u.title = v));
    const ba = document.createElement('div'); ba.className = 'e-baup';
    ba.appendChild(magBaSlot(u, 'afterImg', 'after', '📷 ' + t('pg.news.after'), u.afterImg || magUpdBefore(u)));
    card.appendChild(ba);
    const l1 = document.createElement('div'); l1.className = 'e-label'; l1.textContent = '📊 ' + t('pg.news.result'); card.appendChild(l1);
    card.appendChild(magArea(u.result, 'Sonuç: fiyat nereye gitti, hedef/stop durumu, PnL & RR…', v => u.result = v));
    const l2 = document.createElement('div'); l2.className = 'e-label'; l2.textContent = '🔗 ' + t('pg.news.viewSite') + ' — hedef (boşsa varsayılan)'; card.appendChild(l2);
    card.appendChild(magInput(u.ctaUrl, magData.ctaUrl || 'https://alfa-trader.com', 'e-cta-in', v => u.ctaUrl = v));
    const relSel = document.createElement('select'); relSel.className = 'mag-in e-upd-rel'; relSel.title = 'Bağlı olduğu analiz';
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = '— Bağlı olduğu analiz —'; relSel.appendChild(o0);
    magData.entries.forEach((x, xi) => { if (x.id === u.id) return; const o = document.createElement('option'); o.value = x.id; o.textContent = (xi + 1) + '. ' + (x.title || 'Analiz'); if (x.id === u.relId) o.selected = true; relSel.appendChild(o); });
    relSel.addEventListener('change', async () => { u.relId = relSel.value; await saveNews(); renderNews(); });
    card.appendChild(relSel);
  } else {
    const hd = document.createElement('div'); hd.className = 'e-upd-hd';
    const badge = document.createElement('span'); badge.className = 'e-upd-badge'; badge.textContent = '↺ ' + t('pg.news.upd'); hd.appendChild(badge);
    const tt = document.createElement('h3'); tt.className = 'e-upd-title'; tt.textContent = u.title || t('pg.news.upd'); hd.appendChild(tt);
    card.appendChild(hd);
    const big = document.createElement('div'); big.className = 'e-upd-big';
    const bigUrl = u.afterImg || magUpdBefore(u) || '';
    if (bigUrl) {
      const img = document.createElement('img'); img.className = 'e-img e-upd-big-img'; img.src = bigUrl; img.alt = t('pg.news.after'); img.loading = 'lazy';
      img.addEventListener('click', () => magZoom(bigUrl, u.body || ''));
      big.appendChild(img);
      card.appendChild(big);
    }
    if (u.result) {
      const r = document.createElement('div'); r.className = 'e-result';
      const rh = document.createElement('div'); rh.className = 'e-result-h'; rh.textContent = t('pg.news.result'); r.appendChild(rh);
      const rt = document.createElement('div'); rt.className = 'e-result-t'; rt.textContent = u.result; r.appendChild(rt);
      card.appendChild(r);
    }
  }
  return card;
}
function magWrapText(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(' '); let line = ''; const lh2 = lh || 22;
  words.forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh2; line = w; } else line = t; });
  if (line) ctx.fillText(line, x, y);
  return y + lh2;
}
function magCardImg(u) {
  // before/after önizleme kartını tek PNG görsele çizer (paylaşılabilir, büyük)
  // önce (analiz) görseli doğrudan sol taraftaki analiz fotoğrafından alınır
  const pi = magUpdParentIdx(u);
  const parent = pi >= 0 ? magData.entries[pi] : null;
  const before = (parent && Array.isArray(parent.images) && parent.images[0]) || magUpdBefore(u) || '';
  const after = u.afterImg || '';
  return new Promise(resolve => {
    if (!before && !after) return resolve(null);
    const W = 1080, H = 860, pad = 30, bw = (W - pad * 3) / 2, bh = 420;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const load = src => new Promise(r => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });
    Promise.all([before ? load(before) : Promise.resolve(null), after ? load(after) : Promise.resolve(null)]).then(([b, a]) => {
      try {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#eef1f8'; ctx.fillRect(0, 0, W, 88);
        ctx.fillStyle = '#1a1d2e'; ctx.font = '800 27px Inter, sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('ALFA DERGİ', pad, 58);
        ctx.fillStyle = '#7a7f99'; ctx.font = '600 17px Inter, sans-serif'; ctx.textAlign = 'right';
        ctx.fillText('BEFORE / AFTER', W - pad, 58);
        ctx.fillStyle = '#1a1d2e'; ctx.font = '800 25px Inter, sans-serif'; ctx.textAlign = 'left';
        const ty = magWrapText(ctx, '↺ ' + (u.title || 'AlfaDergi — Güncelleme'), pad, 122, W - pad * 2, 30);
        const y = ty + 16;
        const draw = (im, x, lbl, color, bg) => {
          ctx.fillStyle = bg; ctx.fillRect(x, y, bw, bh);
          if (im) { const s = Math.min(bw / im.width, bh / im.height); const w = im.width * s, h = im.height * s; ctx.drawImage(im, x + (bw - w) / 2, y + (bh - h) / 2, w, h); }
          ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(x, y, bw, bh);
          ctx.fillStyle = color; ctx.font = '800 20px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(lbl, x + bw / 2, y - 12);
          if (!im) { ctx.fillStyle = '#9aa1b8'; ctx.font = '600 20px Inter, sans-serif'; ctx.fillText('—', x + bw / 2, y + bh / 2); }
        };
        draw(b, pad, 'ÖNCE · ANALİZ', '#5b6478', '#f5f7fb');
        draw(a, pad * 2 + bw, 'SONRA · SONUÇ', '#16a34a', '#f0fdf4');
        if (u.result) {
          ctx.fillStyle = '#15803d'; ctx.font = '800 22px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('SONUÇ', pad, y + bh + 58);
          ctx.fillStyle = '#334155'; ctx.font = '500 24px Inter, sans-serif';
          magWrapText(ctx, u.result, pad, y + bh + 92, W - pad * 2, 34);
        }
        ctx.fillStyle = '#8a8da8'; ctx.font = '600 20px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('alfa-trader.com', W / 2, H - 32);
        resolve(cv.toDataURL('image/png'));
      } catch (e) { resolve(null); }
    });
  });
}
function magCardView(dataUrl) {
  const v = document.getElementById('mag-cardview'); if (!v) return;
  const im = document.getElementById('mag-cardview-img'); if (im) im.src = dataUrl;
  const dl = document.getElementById('mag-cardview-dl'); if (dl) dl.href = dataUrl;
  v.classList.add('open');
}
function magCardViewClose() { const v = document.getElementById('mag-cardview'); if (v) v.classList.remove('open'); }

let magRosterOpen = false;
function renderRoster() {
  const box = document.getElementById('mag-roster'); if (!box) return;
  const show = magRosterOpen && magIsAdmin();
  box.classList.toggle('hidden', !show);
  box.innerHTML = '';
  if (!show) return;
  const h = document.createElement('div'); h.className = 'mr-h'; h.textContent = 'Analistler — isim + fotoğraf bağlantısı (her analizde buradan seçilir)'; box.appendChild(h);
  magData.authors.forEach((a, i) => {
    const row = document.createElement('div'); row.className = 'mr-row';
    const nm = document.createElement('input'); nm.type = 'text'; nm.className = 'mag-in mr-name'; nm.value = a.name || ''; nm.placeholder = 'İsim';
    nm.addEventListener('input', () => { a.name = nm.value; magSaveT(); });
    const sp = document.createElement('input'); sp.type = 'text'; sp.className = 'mag-in mr-spec'; sp.value = a.specialty || ''; sp.placeholder = 'Uzmanlık (ör. BTC & Gold)';
    sp.addEventListener('input', () => { a.specialty = sp.value; magSaveT(); });
    const ph = document.createElement('input'); ph.type = 'text'; ph.className = 'mag-in mr-photo'; ph.value = a.photo || ''; ph.placeholder = 'Foto bağlantısı (ya da 📷 yükle)';
    ph.addEventListener('input', () => { a.photo = ph.value; magSaveT(); });
    const up = document.createElement('label'); up.className = 'mr-up'; up.title = 'Fotoğraf yükle'; up.textContent = '📷';
    const upi = document.createElement('input'); upi.type = 'file'; upi.accept = 'image/*'; upi.style.display = 'none';
    upi.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = async () => { a.photo = r.result; await saveNews(); renderNews(); }; r.readAsDataURL(f); e.target.value = ''; });
    up.appendChild(upi);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'mr-del'; del.textContent = '×'; del.title = 'Analisti sil';
    del.addEventListener('click', async () => { if (!confirm('“' + (a.name || 'Analist') + '” silinsin mi?')) return; magData.authors.splice(i, 1); magData.entries.forEach(e => { if (e.authorId === a.id) e.authorId = ''; }); await saveNews(); renderNews(); });
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
  const isAdmin = magIsAdmin();
  const admin = isAdmin && !magPreview; // önizlemede okuyucu gibi render et
  const tools = document.getElementById('mag-tools'); if (tools) tools.style.display = (isAdmin && !magPreview) ? '' : 'none';
  const exitBtn = document.getElementById('mag-preview-exit'); if (exitBtn) exitBtn.style.display = (isAdmin && magPreview) ? '' : 'none';
  renderRoster();
  const badge = document.getElementById('mag-adminbadge'); if (badge) badge.style.display = admin ? '' : 'none';
  const n = magCount();
  stage.innerHTML = '';
  stage.appendChild(magBuildCover());
  stage.appendChild(magBuildToc());
  magMainList().forEach(e => stage.appendChild(magBuildEntry(e, magData.entries.indexOf(e), admin)));
  Array.from(stage.children).forEach((el, i) => el.style.zIndex = (n - i));
  const dots = document.getElementById('mag-dots'); dots.innerHTML = '';
  for (let i = 0; i < n; i++) { const d = document.createElement('button'); d.className = 'mag-dot2'; d.type = 'button'; d.setAttribute('aria-label', 'Sayfa ' + (i + 1)); d.addEventListener('click', () => magGoTo(i)); dots.appendChild(d); }
  if (magIndex >= n) magIndex = Math.max(0, n - 1);
  magApply();
  if (!window.__magHashDone) { window.__magHashDone = true; magGoHash(); }
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
  magData.entries.push({ id: rid(), title: '', images: [], body: '', authorName: '', authorPhoto: '' });
  magIndex = magCount() - 1; await saveNews(); renderNews();
}
async function magAddUpdate() {
  const mains = magMainList();
  const cur = (magIndex >= 2 && magIndex - 2 < mains.length) ? mains[magIndex - 2] : mains[mains.length - 1];
  const parent = cur || mains[mains.length - 1];
  const pi = parent ? magData.entries.indexOf(parent) : -1;
  const upd = { id: rid(), title: '', type: 'update', relId: parent ? parent.id : '', beforeImg: '', afterImg: '', result: '', body: '', ctaUrl: '', authorId: parent ? parent.authorId : '' };
  if (pi >= 0) magData.entries.splice(pi + 1, 0, upd); else magData.entries.push(upd);
  await saveNews(); renderNews();
  if (pi >= 0) magGoTo(magMainIdx(pi));
}
let magCtaOpen = false;
function renderCtaPanel() {
  const box = document.getElementById('mag-cta-panel'); if (!box) return;
  const show = magCtaOpen && magIsAdmin();
  box.classList.toggle('hidden', !show);
  box.innerHTML = '';
  if (!show) return;
  const lbl = document.createElement('span'); lbl.style.cssText = 'font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-3);white-space:nowrap;'; lbl.textContent = '🚀 Sitede Gör → hedef';
  const u = document.createElement('input'); u.type = 'text'; u.className = 'mag-in'; u.value = magData.ctaUrl || ''; u.placeholder = 'https://alfa-trader.com';
  u.addEventListener('input', () => { magData.ctaUrl = u.value.trim(); magSaveT(); });
  const l = document.createElement('input'); l.type = 'text'; l.className = 'mag-in'; l.style.maxWidth = '170px'; l.value = magData.ctaLabel || ''; l.placeholder = 'Buton yazısı';
  l.addEventListener('input', () => { magData.ctaLabel = l.value.trim(); magSaveT(); });
  box.appendChild(lbl); box.appendChild(u); box.appendChild(l);
}
function magGoHash() {
  const m = location.hash.match(/^#mag-([A-Za-z0-9]+)$/);
  if (!m) return;
  const idx = magData.entries.findIndex(e => e.id === m[1]);
  if (idx < 0) return;
  if (currentPage !== 'news') showPage('news');
  if (magIsUpd(magData.entries[idx])) {
    const p = magUpdParentIdx(magData.entries[idx]);
    if (p >= 0) { magGoTo(magMainIdx(p)); return; }
  }
  magGoTo(magMainIdx(idx));
}
async function magDelEntry(i) { if (!confirm('Bu ' + (magIsUpd(magData.entries[i]) ? 'güncelleme' : 'analiz sayfası') + ' silinsin mi?')) return; const gone = magData.entries[i]; magData.entries.splice(i, 1); if (gone) magData.entries.forEach(e => { if (e.relId === gone.id) e.relId = ''; }); if (magIndex >= magCount()) magIndex = Math.max(0, magCount() - 1); await saveNews(); renderNews(); }
async function magMoveEntry(from, to, keepIndex) { if (to < 0 || to >= magData.entries.length || from === to) return; const a = magData.entries; const it = a.splice(from, 1)[0]; a.splice(to, 0, it); if (!keepIndex) magIndex = magMainIdx(a.indexOf(it)); if (magIndex >= magCount()) magIndex = Math.max(0, magCount() - 1); await saveNews(); renderNews(); }

function magZoom(url, text) { const z = document.getElementById('mag-zoom'); const im = document.getElementById('mag-zoom-img'); if (!z || !im) return; im.src = url; const cap = document.getElementById('mag-zoom-cap'); if (cap) cap.textContent = text || ''; const inr = z.querySelector('.mz-inner'); if (inr) inr.scrollTop = 0; z.classList.add('open'); }
function magZoomClose() { const z = document.getElementById('mag-zoom'); if (z) { z.classList.remove('open'); const im = document.getElementById('mag-zoom-img'); if (im) im.src = ''; } }

function bindNewsPage() {
  const g = id => document.getElementById(id);
  const nx = g('mag-next'), pv = g('mag-prev'); if (nx) nx.addEventListener('click', magNext); if (pv) pv.addEventListener('click', magPrev);
  const addb = g('mag-addentry'); if (addb) addb.addEventListener('click', magAddEntry);
  const adu = g('mag-addupdate'); if (adu) adu.addEventListener('click', magAddUpdate);
  const ctb = g('mag-cta'); if (ctb) ctb.addEventListener('click', () => { magCtaOpen = !magCtaOpen; ctb.classList.toggle('on', magCtaOpen); renderCtaPanel(); });
  window.addEventListener('hashchange', magGoHash);
  const pvw = g('mag-preview'); if (pvw) pvw.addEventListener('click', () => { magPreview = true; magRosterOpen = false; magIndex = 0; renderNews(); const bk = g('mag-book'); if (bk) bk.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const pvx = g('mag-preview-exit'); if (pvx) pvx.addEventListener('click', () => { magPreview = false; renderNews(); });
  const aub = g('mag-authors'); if (aub) aub.addEventListener('click', () => { magRosterOpen = !magRosterOpen; aub.classList.toggle('on', magRosterOpen); renderRoster(); });
  const z = g('mag-zoom'); if (z) z.addEventListener('click', magZoomClose);
  const zcap = g('mag-zoom-cap'); if (zcap) zcap.addEventListener('click', e => e.stopPropagation());
  const cv = g('mag-cardview'); if (cv) cv.addEventListener('click', e => { if (e.target === cv) magCardViewClose(); });
  const cvc = g('mag-cardview-close'); if (cvc) cvc.addEventListener('click', magCardViewClose);
  const cvdl = g('mag-cardview-dl'); if (cvdl) cvdl.addEventListener('click', e => e.stopPropagation());
  const vp = g('mag-viewport');
  if (vp) {
    let sx = null;
    vp.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('button,a,label,input,textarea,.e-img')) { sx = null; return; } sx = e.clientX; });
    vp.addEventListener('pointerup', e => { if (sx === null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 45) { if (dx < 0) magNext(); else magPrev(); } });
    vp.addEventListener('pointercancel', () => { sx = null; });
  }
  document.addEventListener('keydown', e => {
    if (currentPage !== 'news') return;
    if (e.key === 'Escape') { magZoomClose(); magCardViewClose(); return; }
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
  const pages = ['home', 'trading', 'alfatrading', 'defter', 'data', 'review', 'news', 'egitim', 'mentoring', 'pano', 'indicators', 'designer', 'onchain', 'calendar', 'basvuru', 'chat-admin', 'calc', 'apps'];
  pages.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.toggle('hidden', p !== currentPage);
    const tb = document.getElementById('tab-' + p);
    if (tb) tb.classList.toggle('on', p === currentPage);
  });
  document.body.dataset.page = currentPage;
}

/* ===== Alfa Man ===== */
const AM_KEY = 'am_data';
let amData = null;
let amSelDay = null;
let amPane = 'nut';

const AM_QUICK_FOODS = [
  { n: 'Yumurta (2 adet)', kcal: 140, p: 12, c: 1, f: 10 },
  { n: 'Lor peynir (100g)', kcal: 98, p: 11, c: 3, f: 4 },
  { n: 'Süt (1 bardak)', kcal: 120, p: 6, c: 9, f: 6 },
  { n: 'Yulaf (50g)', kcal: 190, p: 6.5, c: 33, f: 3.5 },
  { n: 'Tavuk göğsü (100g)', kcal: 165, p: 31, c: 0, f: 3.6 },
  { n: 'Kırmızı et (100g)', kcal: 250, p: 26, c: 0, f: 17 },
  { n: 'Pirinç (100g pişmiş)', kcal: 130, p: 2.7, c: 28, f: 0.3 },
  { n: 'Makarna (100g pişmiş)', kcal: 158, p: 5.8, c: 31, f: 0.9 },
  { n: 'Patates (100g haşlama)', kcal: 87, p: 1.9, c: 20, f: 0.1 },
  { n: 'Salata (1 kase)', kcal: 90, p: 3, c: 10, f: 4 },
  { n: 'Yoğurt (200g)', kcal: 122, p: 7, c: 9, f: 6 },
  { n: 'Badem (25g)', kcal: 145, p: 5.4, c: 5.4, f: 12.6 },
  { n: 'Somon (150g)', kcal: 310, p: 34, c: 0, f: 18 },
  { n: 'Ekmek (1 dilim)', kcal: 80, p: 3, c: 15, f: 0.7 },
  { n: 'Çikolata (30g)', kcal: 160, p: 2, c: 16, f: 10 },
  { n: 'Whey protein (1 ölçek)', kcal: 120, p: 24, c: 3, f: 2 }
];

const AM_LIB = [
  { i: '🏋️', n: 'Bench Press', d: 'Göğüs', tag: 'Göğüs', sets: 3, reps: 10 },
  { i: '🏋️', n: 'Incline Dumbbell Press', d: 'Göğüs', tag: 'Göğüs', sets: 3, reps: 10 },
  { i: '🦵', n: 'Squat', d: 'Bacak', tag: 'Bacak', sets: 4, reps: 10 },
  { i: '🦵', n: 'Leg Press', d: 'Bacak', tag: 'Bacak', sets: 3, reps: 12 },
  { i: '🔧', n: 'Deadlift', d: 'Sırt', tag: 'Sırt', sets: 3, reps: 8 },
  { i: '🔧', n: 'Barbell Row', d: 'Sırt', tag: 'Sırt', sets: 3, reps: 10 },
  { i: '🔧', n: 'Lat Pulldown', d: 'Sırt', tag: 'Sırt', sets: 3, reps: 10 },
  { i: '🤸', n: 'Overhead Press', d: 'Omuz', tag: 'Omuz', sets: 3, reps: 10 },
  { i: '🤸', n: 'Lateral Raise', d: 'Omuz', tag: 'Omuz', sets: 3, reps: 12 },
  { i: '💪', n: 'Barbell Curl', d: 'Kol', tag: 'Kol', sets: 3, reps: 10 },
  { i: '💪', n: 'Triceps Pushdown', d: 'Kol', tag: 'Kol', sets: 3, reps: 10 },
  { i: '🧱', n: 'Plank', d: 'Karın', tag: 'Karın', sets: 3, reps: 60, minUnit: 'sn' },
  { i: '🧱', n: 'Crunch', d: 'Karın', tag: 'Karın', sets: 3, reps: 15 },
  { i: '🏃', n: 'Koşu', d: 'Kardiyo', tag: 'Kardiyo', sets: 1, reps: 1, min: 30, minUnit: 'dk' },
  { i: '🚴', n: 'Bisiklet', d: 'Kardiyo', tag: 'Kardiyo', sets: 1, reps: 1, min: 30, minUnit: 'dk' }
];

const AM_PLAN = [
  { d: 'Pazartesi', e: 'Bench Press, Incline Press, Overhead Press, Lateral Raise, Triceps Pushdown' },
  { d: 'Salı', e: 'Barbell Row, Lat Pulldown, Barbell Curl, Deadlift (hafif ağırlık)' },
  { d: 'Çarşamba', e: 'Squat, Leg Press, Plank, Crunch' },
  { d: 'Perşembe', e: 'Dinlenme · 30 dk yürüyüş' },
  { d: 'Cuma', e: 'Bench Press, Squat, Barbell Row, Overhead Press' },
  { d: 'Cumartesi', e: 'Barbell Curl, Triceps Pushdown, Lateral Raise, Plank' },
  { d: 'Pazar', e: 'Dinlenme' }
];

function amAllowed() {
  return !!(typeof AUTH !== 'undefined' && AUTH.user && (AUTH.user.email || '').toLowerCase() === ADMIN_EMAIL);
}
function amTodayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function amShiftKey(k, n) {
  const d = new Date(k + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function amFmtDay(k) {
  const d = new Date(k + 'T12:00:00');
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  return d.getDate() + '/' + (d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2) + ' · ' + days[d.getDay()];
}
async function amLoad() {
  if (amData) return;
  try {
    const raw = await store.get(AM_KEY);
    if (raw) amData = JSON.parse(raw);
  } catch (e) { /* bozuk veri — sıfırdan */ }
  if (!amData || typeof amData !== 'object') amData = { profile: null, days: {} };
  if (!amData.days) amData.days = {};
}
function amSave() {
  try { store.set(AM_KEY, JSON.stringify(amData)); } catch (e) { /* yerel aynada kalır */ }
}
function amDay(key) {
  if (!amData.days[key]) amData.days[key] = { food: [], ex: [] };
  return amData.days[key];
}
function amNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

async function renderAlfaMan() {
  if (!amAllowed()) return;
  await amLoad();
  if (!amSelDay) amSelDay = amTodayKey();
  amFillProfile();
  amRenderWeek();
  amRenderQuickChips();
  amRenderLibrary();
  amRenderPlan();
  amRenderNut();
  amRenderFit();
}
function amSetPane(name) {
  amPane = name;
  const t = { nut: 'am-tab-nut', fit: 'am-tab-fit' };
  Object.keys(t).forEach(k => {
    const tb = document.getElementById(t[k]);
    if (tb) tb.classList.toggle('on', k === name);
    const pn = document.getElementById('am-pane-' + k);
    if (pn) pn.classList.toggle('on', k === name);
  });
}
function amFillProfile() {
  if (!amData || !amData.profile) return;
  const pr = amData.profile;
  const s = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null && v !== '') el.value = v; };
  s('am-sex', pr.sex); s('am-age', pr.age); s('am-height', pr.height); s('am-weight', pr.weight);
  s('am-activity', pr.activity); s('am-goal', pr.goal);
}
function amCalcTdee() {
  const sex = document.getElementById('am-sex').value;
  const age = amNum(document.getElementById('am-age').value);
  const height = amNum(document.getElementById('am-height').value);
  const weight = amNum(document.getElementById('am-weight').value);
  const activity = amNum(document.getElementById('am-activity').value);
  const goal = document.getElementById('am-goal').value;
  if (!age || !height || !weight) { alert('Yaş, boy ve kilo girmelisin.'); return; }
  const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'm' ? 5 : -161);
  const tdee = bmr * activity;
  const mult = goal === 'lose' ? 0.85 : goal === 'gain' ? 1.1 : 1;
  const target = Math.round(tdee * mult);
  const prot = Math.round(weight * 2);
  const fat = Math.round(weight * 0.9);
  const carbs = Math.max(0, Math.round((target - prot * 4 - fat * 9) / 4));
  amData.profile = { sex, age, height, weight, activity, goal, bmr: Math.round(bmr), tdee: Math.round(tdee), target, prot, fat, carbs };
  amSave();
  amShowMetrics();
  amRenderWeek();
  amRenderNut();
  amFillProfile();
}
function amShowMetrics() {
  const pr = amData.profile;
  if (!pr) return;
  document.getElementById('am-bmr').textContent = pr.bmr;
  document.getElementById('am-tdee').textContent = pr.tdee;
  document.getElementById('am-target').textContent = pr.target;
  document.getElementById('am-m-protein').textContent = pr.prot + 'g';
  document.getElementById('am-m-carbs').textContent = pr.carbs + 'g';
  document.getElementById('am-m-fat').textContent = pr.fat + 'g';
  document.getElementById('am-metrics').style.display = '';
  document.getElementById('am-macro').style.display = '';
}
function amShiftDay(n) {
  amSelDay = amShiftKey(amSelDay, n);
  amRenderNut();
}
function amGotoToday() {
  amSelDay = amTodayKey();
  amRenderNut();
}
function amAddFood() {
  const name = document.getElementById('am-food-name').value.trim();
  const kcal = amNum(document.getElementById('am-food-kcal').value);
  const p = amNum(document.getElementById('am-food-p').value);
  const c = amNum(document.getElementById('am-food-c').value);
  const f = amNum(document.getElementById('am-food-f').value);
  if (!name && !kcal) { alert('Yemek adı veya kalori girmelisin.'); return; }
  amDay(amSelDay).food.push({ n: name || 'Diğer', kcal, p, c, f, t: Date.now() });
  amSave();
  ['am-food-name', 'am-food-kcal', 'am-food-p', 'am-food-c', 'am-food-f'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  amRenderNut();
  amRenderWeek();
}
function amQuickAdd(i) {
  const q = AM_QUICK_FOODS[i];
  if (!q) return;
  amDay(amSelDay).food.push({ n: q.n, kcal: q.kcal, p: q.p, c: q.c, f: q.f, t: Date.now() });
  amSave();
  amRenderNut();
  amRenderWeek();
}
function amDelFood(i) {
  const day = amData.days[amSelDay];
  if (!day) return;
  day.food.splice(i, 1);
  amSave();
  amRenderNut();
  amRenderWeek();
}
function amRenderNut() {
  const lbl = document.getElementById('am-day-lbl');
  if (lbl) lbl.textContent = amFmtDay(amSelDay);
  const day = amData.days[amSelDay] || { food: [] };
  const list = document.getElementById('am-food-list');
  list.innerHTML = '';
  if (!day.food.length) {
    const e = document.createElement('div');
    e.className = 'am-empty';
    e.textContent = 'Bu gün için kayıt yok. Yemek adını gir ve "＋ Ekle" de, ya da hızlı yemeklerden seç.';
    list.appendChild(e);
  }
  day.food.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'am-food-row';
    const fd = document.createElement('span');
    fd.className = 'fd'; fd.textContent = it.n;
    const fc = document.createElement('span');
    fc.className = 'fc';
    fc.textContent = it.kcal + ' kcal · P' + it.p + ' K' + it.c + ' Y' + it.f;
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '✕'; del.title = 'Sil';
    del.addEventListener('click', () => amDelFood(i));
    row.appendChild(fd); row.appendChild(fc); row.appendChild(del);
    list.appendChild(row);
  });
  const sum = day.food.reduce((s, it) => {
    s.kcal += it.kcal; s.p += it.p; s.c += it.c; s.f += it.f; return s;
  }, { kcal: 0, p: 0, c: 0, f: 0 });
  const total = document.getElementById('am-food-total');
  total.innerHTML = '';
  const pr = amData.profile;
  let line = 'Toplam: <b>' + sum.kcal + ' kcal</b> · Protein <b>' + sum.p.toFixed(1) + 'g</b> · Karb <b>' + sum.c.toFixed(1) + 'g</b> · Yağ <b>' + sum.f.toFixed(1) + 'g</b>';
  if (pr) {
    const left = Math.round(pr.target - sum.kcal);
    line += '<br>Hedef <b>' + pr.target + ' kcal</b> → <b class="' + (left < 0 ? 'am-over' : '') + '">' + (left >= 0 ? 'Kalan ' + left : 'Üzerinde ' + Math.abs(left)) + '</b>';
  }
  const tl = document.createElement('div');
  tl.className = 'am-total-line';
  tl.innerHTML = line;
  total.appendChild(tl);
}
function amRenderWeek() {
  const bar = document.getElementById('am-week');
  bar.innerHTML = '';
  const pr = amData.profile;
  const days = [];
  let max = 1;
  for (let i = 6; i >= 0; i--) {
    const k = amShiftKey(amTodayKey(), -i);
    const day = amData.days[k] || { food: [] };
    const kcal = day.food.reduce((s, it) => s + it.kcal, 0);
    days.push({ k, kcal, isToday: k === amTodayKey() });
    if (kcal > max) max = kcal;
  }
  if (pr && pr.target > max) max = pr.target;
  const hMax = 96;
  days.forEach(dd => {
    const col = document.createElement('div');
    col.className = 'am-bar-col';
    const fill = document.createElement('div');
    fill.className = 'am-bar-fill';
    const h = Math.max(3, Math.round(dd.kcal / max * hMax));
    fill.style.height = h + 'px';
    if (pr && dd.kcal > pr.target) fill.style.background = 'linear-gradient(180deg, var(--red), #7f1d1d)';
    const mv = document.createElement('div');
    mv.style.cssText = 'font-size:9px;color:var(--text-2);font-weight:700;';
    mv.textContent = dd.kcal ? dd.kcal : '';
    const lbl = document.createElement('div');
    lbl.className = 'am-bar-lbl';
    lbl.textContent = dd.isToday ? 'Bugün' : dd.k.slice(8, 10) + '/' + dd.k.slice(5, 7);
    if (dd.isToday) lbl.style.color = 'var(--pc)';
    col.appendChild(fill); col.appendChild(mv); col.appendChild(lbl);
    bar.appendChild(col);
  });
  if (pr) {
    const tl = document.createElement('div');
    tl.className = 'am-note';
    tl.textContent = 'Hedef: ' + pr.target + ' kcal · TDEE: ' + pr.tdee + ' kcal · BMR: ' + pr.bmr + ' kcal';
    bar.parentNode.insertBefore(tl, bar.nextSibling);
  }
}
function amRenderQuickChips() {
  const box = document.getElementById('am-quick-chips');
  box.innerHTML = '';
  AM_QUICK_FOODS.forEach((q, i) => {
    const chip = document.createElement('button');
    chip.className = 'am-chip'; chip.type = 'button';
    chip.textContent = q.n + ' · ' + q.kcal;
    chip.title = q.kcal + ' kcal · P' + q.p + ' K' + q.c + ' Y' + q.f;
    chip.addEventListener('click', () => amQuickAdd(i));
    box.appendChild(chip);
  });
}
function amAddExercise() {
  const name = document.getElementById('am-ex-name').value.trim();
  const sets = amNum(document.getElementById('am-ex-sets').value);
  const reps = amNum(document.getElementById('am-ex-reps').value);
  const weight = amNum(document.getElementById('am-ex-weight').value);
  const min = amNum(document.getElementById('am-ex-min').value);
  if (!name) { alert('Hareket adı girmelisin.'); return; }
  amDay(amTodayKey()).ex.push({ n: name, sets, reps, weight, min, t: Date.now() });
  amSave();
  ['am-ex-name', 'am-ex-sets', 'am-ex-reps', 'am-ex-weight', 'am-ex-min'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  amRenderFit();
}
function amAddExerciseFromLib(i) {
  const ex = AM_LIB[i];
  if (!ex) return;
  const entry = { n: ex.n, sets: ex.sets, reps: ex.reps, weight: 0, min: ex.min || 0, t: Date.now() };
  amDay(amTodayKey()).ex.push(entry);
  amSave();
  amRenderFit();
}
function amDelExercise(i) {
  const day = amData.days[amTodayKey()];
  if (!day) return;
  day.ex.splice(i, 1);
  amSave();
  amRenderFit();
}
function amRenderFit() {
  const key = amTodayKey();
  const day = amData.days[key] || { ex: [] };
  const list = document.getElementById('am-ex-list');
  list.innerHTML = '';
  if (!day.ex.length) {
    const e = document.createElement('div');
    e.className = 'am-empty';
    e.textContent = 'Bugün henüz antrenman kaydı yok. Kütüphaneden tek tıkla ekle veya kendi hareketini gir.';
    list.appendChild(e);
  }
  let totSets = 0, totMin = 0;
  day.ex.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'am-ex-log-row';
    const ed = document.createElement('span');
    ed.className = 'ed'; ed.textContent = it.n;
    const parts = [];
    if (it.sets) { parts.push(it.sets + ' set'); totSets += it.sets; }
    if (it.reps) parts.push((it.reps || 1) + ' tekrar');
    if (it.weight) parts.push(it.weight + ' kg');
    if (it.min) { parts.push(it.min + ' dk'); totMin += it.min; }
    const ec = document.createElement('span');
    ec.className = 'ec'; ec.textContent = parts.join(' × ') || '—';
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '✕'; del.title = 'Sil';
    del.addEventListener('click', () => amDelExercise(i));
    row.appendChild(ed); row.appendChild(ec); row.appendChild(del);
    list.appendChild(row);
  });
  const sum = document.getElementById('am-ex-summary');
  sum.innerHTML = '';
  if (day.ex.length) {
    const tl = document.createElement('div');
    tl.className = 'am-total-line';
    tl.textContent = 'Toplam: ' + day.ex.length + ' hareket · ' + totSets + ' set' + (totMin ? ' · ' + totMin + ' dk' : '');
    sum.appendChild(tl);
  }
}
function amRenderLibrary() {
  const box = document.getElementById('am-ex-library');
  box.innerHTML = '';
  AM_LIB.forEach((ex, i) => {
    const card = document.createElement('div');
    card.className = 'am-ex-card';
    const ico = document.createElement('div');
    ico.className = 'am-ex-ico'; ico.textContent = ex.i;
    const mid = document.createElement('div');
    mid.style.cssText = 'flex:1;min-width:0;';
    const h4 = document.createElement('h4'); h4.textContent = ex.n;
    const p = document.createElement('p');
    p.textContent = (ex.min ? ex.min + ' dk' : ex.sets + ' × ' + ex.reps + (ex.minUnit || '')) + ' · ' + ex.d;
    const tag = document.createElement('span');
    tag.className = 'am-ex-tag'; tag.textContent = ex.tag;
    mid.appendChild(h4); mid.appendChild(p); mid.appendChild(tag);
    const add = document.createElement('button');
    add.className = 'am-btn ghost am-ex-add'; add.type = 'button'; add.textContent = '＋';
    add.title = 'Bugünkü antrenmana ekle';
    add.addEventListener('click', () => amAddExerciseFromLib(i));
    card.appendChild(ico); card.appendChild(mid); card.appendChild(add);
    box.appendChild(card);
  });
}
function amRenderPlan() {
  const box = document.getElementById('am-plan');
  box.innerHTML = '';
  AM_PLAN.forEach(pd => {
    const row = document.createElement('div');
    row.className = 'am-plan-day';
    const nm = document.createElement('div');
    nm.className = 'pd-name'; nm.textContent = pd.d;
    const ex = document.createElement('div');
    ex.className = 'pd-ex'; ex.textContent = pd.e;
    row.appendChild(nm); row.appendChild(ex);
    box.appendChild(row);
  });
}

function showPage(name, skipAnim) {
  if (name === 'alfa' && !amAllowed()) name = 'home';
  if (name === 'apps' && !appsAllowed()) name = 'home';
  currentPage = name;
  dtRowFocus = null;
  document.body.dataset.page = name;
  const pages = ['home', 'trading', 'alfatrading', 'defter', 'data', 'review', 'news', 'egitim', 'strategies', 'analiz', 'mentoring', 'pano', 'indicators', 'designer', 'onchain', 'calendar', 'basvuru', 'chat-admin', 'calc', 'alfa', 'apps'];
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
  if (name === 'news') renderNews();
  if (name === 'egitim') renderEgitim();
  if (name === 'strategies') renderStrategies();
  if (name === 'analiz') renderAnaliz();
  if (name === 'mentoring') { try { renderMentor(); } catch (e) { /* devam */ } }
  if (name === 'pano') { panoLoad(); }
  if (name === 'indicators') renderIndicators();
  if (name === 'designer') renderDesigner();
  if (name === 'alfatrading') renderAlfaTrading();
  if (name === 'calendar') { if (window.loadCal) loadCal(); }
  if (name === 'basvuru') { renderSfx(); }
  if (name === 'chat-admin') { renderAdminChat(); startAdminChatPoll(); }
  if (name === 'alfa') { renderAlfaMan(); }
  if (name === 'apps') { renderApps(); }
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
  if (!d) return '—';
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
  return '—';
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
  addK('Toplam işlem', n, '', wins + ' kazanan');
  addK('Toplam R', (totR > 0 ? '+' : '') + totR.toFixed(2) + 'R', totR >= 0 ? 'pos' : 'neg', '');
  addK('Win rate', wr + '%', '', wins + '/' + n);
  addK('Ortalama R', (avg > 0 ? '+' : '') + avg.toFixed(2) + 'R', avg >= 0 ? 'pos' : 'neg', 'işlem başına');

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

  const tb = document.getElementById('data-table');
  tb.innerHTML = '';
  const head = document.createElement('div'); head.className = 'data-row head';
  head.innerHTML = '<span style="font-size:9px;">Tarih</span><span>Parite / Yön</span><span>Strateji</span><span>Entry Model</span><span style="text-align:right;">R</span><span></span><span></span>';
  tb.appendChild(head);

  pageRows.forEach(t => {
    const r = dnum(t.r);
    const row = document.createElement('div'); row.className = 'data-row';
    row.innerHTML =
      '<span style="font-size:10px;color:var(--text-3);">' + dfDateLabel(t) + '</span>' +
      '<span class="dr-pair">' + esc(t.pair || '—') + ' <span class="dr-dir ' + (t.dir || '').toLowerCase() + '">' + esc(t.dir || '') + '</span></span>' +
      '<span style="font-size:11px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc((t.strat||'').slice(0,14) || '—') + '</span>' +
      '<span style="font-size:11px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc((t.model||'').slice(0,18) || '—') + '</span>';
    const rwrap = document.createElement('span');
    rwrap.style.textAlign = 'right';
    const rin = document.createElement('input');
    rin.className = 'rin'; rin.type = 'number'; rin.step = '0.01'; rin.placeholder = '—';
    rin.value = t.r !== '' && t.r != null && !isNaN(t.r) ? Number(t.r) : '';
    rin.setAttribute('aria-label', 'Sonuç (R)');
    rin.addEventListener('click', e => e.stopPropagation());
    rin.addEventListener('change', async () => {
      t.r = rin.value;
      await saveData(); renderData();
      syncDataTradeNotion(t);
    });
    rwrap.appendChild(rin);
    row.appendChild(rwrap);
    const eb = document.createElement('button'); eb.className = 'dr-editb'; eb.textContent = '✎'; eb.title = 'Düzenle';
    eb.addEventListener('click', e => { e.stopPropagation(); row.classList.toggle('edit-open'); });
    row.appendChild(eb);
    const del = document.createElement('button'); del.className = 'dr-del'; del.type = 'button'; del.textContent = '×';
    del.addEventListener('click', async (e) => { e.stopPropagation(); if (!confirm('Bu işlemi sil?')) return; dataTrades = dataTrades.filter(x => x.id !== t.id); await saveData(); renderData(); });
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
  document.getElementById('data-count').textContent = n ? (n + ' işlem · sayfa ' + dfDataPage + '/' + totalPages) : (dfFilter !== 'all' ? 'Bu filtrede işlem yok.' : 'Henüz işlem yok.');
}

function imgHashStr(s) {
  var h = 2166136261, i;
  for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
function imgKey(u) { return /^https?:\/\//i.test(u || '') ? 'url:' + u : 'data:' + u; }

async function syncDataTradeNotion(t) {
  const parts = [];
  if (t.note) parts.push(t.note);
  if (t.model) parts.push('Entry Model: ' + t.model);
  const payload = { id: t.id, ts: t.ts || Date.now(), date: t.date || '', pair: t.pair || '', dir: t.dir || '', r: dnum(t.r) || 0, strat: t.strat || '', model: t.model || '', note: parts.join(' · '), stars: 0, notionId: t.notionId || undefined, images: t.images || [], syncedImages: t.imgSynced || [] };
  try {
    const resp = await fetch('/api/notion-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await resp.json();
    const rr = Array.isArray(j.results) ? j.results[0] : null;
    if (rr && rr.ok && rr.notionId && !t.notionId) {
      t.notionId = rr.notionId;
    }
    if (rr && rr.ok && Array.isArray(rr.syncedImages)) {
      t.imgSynced = rr.syncedImages;
    }
    if (rr && rr.ok) await saveData();
  } catch (e) {}
}

function buildDrEditHtml(t) {
  const dirOpt = ['LONG','SHORT'].map(d => '<option value="' + d + '"' + (t.dir === d ? ' selected' : '') + '>' + d + '</option>').join('');
  const imgs = (t.images || []).map((u, i) => '<div class="thmb"><img src="' + u + '"><button type="button" class="x" data-i="' + i + '">×</button></div>').join('');
  return '' +
    '<div class="row">' +
      '<label>Tarih<input type="date" class="e-date" value="' + (t.date || '') + '"></label>' +
      '<label>Parite<input type="text" class="e-pair" value="' + esc(t.pair || '') + '"></label>' +
      '<label>Yön<select class="e-dir">' + dirOpt + '</select></label>' +
      '<label>Sonuç (R)<input type="number" step="0.01" class="e-r" value="' + (t.r !== '' && t.r != null ? t.r : '') + '"></label>' +
    '</div>' +
    '<div class="row">' +
      '<label>Strateji<input type="text" class="e-strat" value="' + esc(t.strat || '') + '"></label>' +
      '<label>Entry Model<input type="text" class="e-model" value="' + esc(t.model || '') + '"></label>' +
    '</div>' +
    '<label>Not<textarea class="e-note">' + esc(t.note || '') + '</textarea></label>' +
    (imgs ? '<div class="dr-edit-imgs">' + imgs + '</div>' : '') +
    '<div class="acts">' +
      '<button type="button" class="dr-add-img" title="Resim ekle — tıkla seç, sonra Ctrl+V ile de yapıştırabilirsin">+</button>' +
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
  const pair = t.pair || '—';
  const dir = t.dir || '';
  const date = t.date || '—';
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
    (note ? '<div class="np-note"><strong>Not:</strong><p>' + note.replace(/\n/g, '<br>') + '</p></div>' : '<div class="np-note" style="color:var(--text-3);font-style:italic;">Not eklenmemiş.</div>');
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
  d.innerHTML = '<img src="' + dataUrl + '"><button class="del" data-i="' + (dfImages.length - 1) + '">×</button>';
  d.querySelector('.del').onclick = () => { dfImages.splice(parseInt(d.querySelector('.del').dataset.i), 1); renderDfPreviews(); };
  p.appendChild(d);
}
function renderDfPreviews() {
  const p = document.getElementById('df-img-previews');
  if (!p) return;
  p.innerHTML = '';
  dfImages.forEach((url, i) => {
    const d = document.createElement('div'); d.className = 'thmb';
    d.innerHTML = '<img src="' + url + '"><button class="del" data-i="' + i + '">×</button>';
    d.querySelector('.del').onclick = () => { dfImages.splice(i, 1); renderDfPreviews(); };
    p.appendChild(d);
  });
}
async function addDataTrade() {
  const g = id => document.getElementById(id);
  const pair = (g('df-pair').value || '').trim().toUpperCase();
  const rVal = g('df-r').value;
  if (!pair || rVal === '') { g('data-note').textContent = 'Lütfen parite ve R değerini gir.'; return; }
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
  g('data-note').textContent = '✅ İşlem kaydedildi — Notion\'a da senkron ediliyor.';
  renderData();
  const last = dataTrades[dataTrades.length - 1];
  const noteParts = [];
  if (last.note) noteParts.push(last.note);
  if (last.model) noteParts.push('Entry Model: ' + last.model);
  const ntrade = { id: last.id, ts: last.ts, date: last.date || '', pair: last.pair, dir: last.dir, r: last.r, strat: last.strat, model: last.model, note: noteParts.join(' · '), stars: 0, images: last.images || [], syncedImages: last.imgSynced || [] };
  try {
    const resp = await fetch('/api/notion-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ntrade) });
    const j = await resp.json();
    const rr = Array.isArray(j.results) ? j.results[0] : null;
    if (rr && rr.ok && rr.notionId) { last.notionId = rr.notionId; }
    if (rr && rr.ok && Array.isArray(rr.syncedImages)) { last.imgSynced = rr.syncedImages; }
    if (rr && rr.ok) await saveData();
  } catch (e) { /* senkron çevrimdışı olabilir */ }
}

async function importFromDefter() {
  const note = document.getElementById('data-note');
  if (!Array.isArray(trades) || !trades.length) { note.textContent = 'Deftere kayıtlı işlem yok.'; return; }
  const existTs = new Set(dataTrades.map(t => t.ts));
  let added = 0;
  trades.forEach(t => {
    if (existTs.has(t.id)) return;
    dataTrades.push({ id: Date.now() + Math.random() + added, ts: t.id, date: t.date || '', pair: t.pair || '', dir: t.dir || 'LONG', r: dnum(t.r), pnl: null, strat: t.strat || '', model: t.model || '', note: t.note || '', images: (t.images || []).slice(), criteria: { setup: 5, entry: 5, exit: 5, risk: 5, psycho: 5 } });
    added++;
  });
  await saveData(); renderData();
  note.textContent = added ? (added + ' işlem defterden aktarıldı.') : 'Zaten güncel — aktarılacak yeni işlem yok.';
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
      if (lines.length < 2) throw new Error('boş');
      const delim = ((lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length) ? ';' : (lines[0].indexOf('\t') > -1 ? '\t' : ',');
      const header = lines[0].split(delim).map(h => h.trim().toLowerCase());
      const find = (...keys) => header.findIndex(h => keys.some(k => h.indexOf(k) > -1));
      const iDate = find('date', 'tarih', 'time', 'zaman');
      const iSym = find('symbol', 'pair', 'parite', 'enstr', 'item');
      const iType = find('type', 'side', 'yön', 'direction', 'position', 'işlem');
      const iProfit = find('profit', 'pnl', 'kar', 'kazanç', 'net');
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
      // Aynı pair+date+dir olan kısmi pozları otomatik birleştir (kaldıraç yetmediği için bölünen pozlar)
      const { merged, mergedCount, total } = mergeCsvPartials(added);
      // Mevcut veriyle de çakışma kontrolü (r dahil)
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
      parts.push(total + ' satır okundu');
      if (mergedCount > 0) parts.push(mergedCount + ' kısmi poz birleştirildi');
      parts.push(actuallyAdded + ' yeni işlem eklendi');
      note.textContent = parts.join(' · ');
    } catch (e) {
      note.textContent = 'CSV okunamadı — sütun başlıkları (date, symbol, type, profit) olan bir dosya dene.';
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
  note.textContent = 'Notion\'dan çekiliyor…';
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
    try { j = await r.json(); } catch (e) { throw new Error('Sunucu yanıtı okunamadı (arka uç yüklü mü?)'); }
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
        if (Array.isArray(t.images) && t.images.length) {
          const cur = exist.images || [];
          t.images.forEach(u => { if (!cur.includes(u)) cur.push(u); });
          exist.images = cur;
        }
        updated++;
      } else {
        const dup = dataTrades.find(x => (x.pair||'') === (t.pair||'').toUpperCase() && (x.date||'') === (t.date||'') && (x.dir||'') === (t.dir||'') && dnum(x.r) === dnum(t.r));
        if (dup) {
          if (Array.isArray(t.images) && t.images.length) {
            const cur = dup.images || [];
            t.images.forEach(u => { if (!cur.includes(u)) cur.push(u); });
            dup.images = cur;
          }
          return;
        }
        dataTrades.push({
          id: Date.now() + Math.random() + added,
          notionId: t.notionId || null,
          ts: t.ts || (Date.now() + added),
          date: t.date || '',
          pair: (t.pair || '').toUpperCase(), dir: t.dir || 'LONG',
          r: dnum(t.r), pnl: null, strat: t.strat || '', model: t.model || '', note: t.note || '', _source: 'Notion',
          images: Array.isArray(t.images) ? t.images.slice() : []
        });
        added++;
      }
    });
    await saveData(); renderData();
    const parts = [];
    if (added) parts.push(added + ' yeni eklendi');
    if (updated) parts.push(updated + ' güncellendi');
    note.textContent = parts.length ? parts.join(' · ') + ' — Notion senkronu tamam.' : 'Zaten güncel — çekilecek yeni kayıt yok.';
  } catch (e) {
    note.textContent = 'Notion\'dan çekilemedi: ' + ((e && e.message) || e);
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
      if (note) note.textContent = '✅ Notion hesabın bağlandı! Veriler çekiliyor…';
      setTimeout(importFromNotion, 500);
    } else if (h.startsWith('#notion-error=')) {
      const err = decodeURIComponent(h.slice(14));
      window.location.hash = '';
      const note = document.getElementById('data-note');
      if (note) note.textContent = '❌ Notion bağlantı hatası: ' + err;
    }
  } catch (e) { /* hash hatası */ }
}

function bindDataPage() {
  const g = id => document.getElementById(id);
  const nb = g('data-notion'); if (nb) nb.addEventListener('click', importFromNotion);
  const no = g('data-notion-oauth');
  if (no) no.addEventListener('click', () => {
    const state = (typeof AUTH !== 'undefined' && AUTH.user) ? AUTH.user.id : '';
    window.location.href = '/api/notion-auth' + (state ? '?state=' + encodeURIComponent(state) : '');
  });
  // Notion DB ID yükleme
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
    if (nn) { nn.textContent = '✅ Database ID\'ler kaydedildi.'; setTimeout(() => { nn.textContent = ''; }, 2000); }
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
    if (!confirm('Data Takibi\'ndeki tüm işlemler silinecek. Emin misin? (Konfirmasyon Defteri etkilenmez)')) return;
    dataTrades = [];
    await saveData(); renderData();
    document.getElementById('data-note').textContent = 'Tüm işlemler silindi.';
  });

  g('data-csv-btn').addEventListener('click', () => g('data-csv-file').click());
  g('data-csv-file').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) importCsv(f); e.target.value = ''; });
  // Kriter slider canlı gösterim
  document.querySelectorAll('.crit-range').forEach(r => {
    r.addEventListener('input', () => {
      const v = document.getElementById(r.id + '-v');
      if (v) v.textContent = r.value;
    });
  });
  // Resim sürükle/bırak
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
  // Ctrl+V resim yapıştır
  document.addEventListener('paste', e => {
    if ((currentPage !== 'data' && currentPage !== 'defter') || (currentPage === 'data' && document.querySelector('.data-row.edit-open'))) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    Array.from(items).filter(item => item.type.startsWith('image/')).forEach(item => {
      const blob = item.getAsFile();
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = ev => {
        if (currentPage === 'defter') {
          const target = dtRowFocus || dtOpenTrade;
          if (target) {
            if (!Array.isArray(target.images)) target.images = [];
            // Aynı görsel zaten ekliyse tekrar ekleme (çift kayıt sorunu)
            if (!target.images.includes(ev.target.result)) {
              target.images.push(ev.target.result);
              saveTrades(); syncDefterToJournal(target); dtRenderRowThumbs(target);
            }
          }
        } else dfAddImg(ev.target.result);
      };
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
      else if (focus === 'strat') rows = allRows; // hepsini al, strat bazlı yap

      const n = rows.length;
      if (!n) { document.getElementById('data-ai-msgs').innerHTML = '<div class="ai-coach-placeholder">Seçilen filtrelere uygun işlem bulunamadı.</div>'; return; }

      // İstatistik hesapla
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
      const sharpe = stdDev > 0 ? avgR / stdDev * Math.sqrt(252) : 0; // günlük değil ama oranlama

      // Maksimum drawdown
      let cum = 0, peak = 0, maxDd = 0;
      rVals.forEach(r => { cum += r; if (cum > peak) peak = cum; const dd = (peak - cum) / (Math.abs(peak) || 1); if (dd > maxDd) maxDd = dd; });

      // Strateji bazında
      const strats = {};
      rows.forEach(t => {
        const s = (t.strat || 'Belirtilmemiş').trim();
        if (!strats[s]) strats[s] = { count: 0, wins: 0, sumR: 0, notes: [] };
        strats[s].count++;
        strats[s].sumR += dnum(t.r);
        if (dnum(t.r) > 0) strats[s].wins++;
        if (t.note) strats[s].notes.push(t.note);
      });
      const stratSummary = Object.entries(strats).map(([s, d]) =>
        `${s}: ${d.count} işlem, WR ${(d.wins/d.count*100).toFixed(0)}%, toplam R ${d.sumR.toFixed(2)}, notlar: ${d.notes.length ? d.notes.join(' | ') : 'yok'}`
      ).join('\n');

      // Kriter ortalamaları
      const critAvg = {};
      if (rows.some(t => t.criteria)) {
        ['setup','entry','exit','risk','psycho'].forEach(k => {
          const vals = rows.filter(t => t.criteria && t.criteria[k] > 0).map(t => t.criteria[k]);
          critAvg[k] = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
        });
      }

      // Consecutive wins/losses
      let maxConW = 0, maxConL = 0, curW = 0, curL = 0;
      rVals.forEach(r => {
        if (r > 0) { curW++; curL = 0; if (curW > maxConW) maxConW = curW; }
        else { curL++; curW = 0; if (curL > maxConL) maxConL = curL; }
      });

      // Son işlem notları (son 10)
      const recentNotes = rows.slice(-10).filter(t => t.note).map(t => `[${t.pair}] ${t.note}`).join('\n');

      const statsBlock =
        `📊 TEMEL İSTATİSTİKLER
Toplam İşlem: ${n}
Win Rate: ${wr.toFixed(1)}% (${wins}W / ${losses}L)
Toplam R: ${sumR.toFixed(2)}
Ortalama R: ${avgR.toFixed(2)}
Ortalama Kazanç: ${avgWin.toFixed(2)}R
Ortalama Kayıp: ${avgLoss.toFixed(2)}R
Profit Factor: ${profitFactor.toFixed(2)}
Standart Sapma: ${stdDev.toFixed(2)}
Sharpe Oranı (yıllık.): ${sharpe.toFixed(2)}
Maksimum Drawdown: ${(maxDd * 100).toFixed(1)}%
En Uzun Kazanç Serisi: ${maxConW}
En Uzun Kayıp Serisi: ${maxConL}

📋 STRATEJİ BAZINDA PERFORMANS
${stratSummary || 'Strateji bilgisi yok.'}

${Object.keys(critAvg).length ? `📏 KRİTER ORTALAMALARI (1-10)
Setup: ${critAvg.setup || '—'} | Entry: ${critAvg.entry || '—'} | Exit: ${critAvg.exit || '—'} | Risk: ${critAvg.risk || '—'} | Psikoloji: ${critAvg.psycho || '—'}` : ''}

${recentNotes ? `📝 İŞLEM NOTLARI (son 10)
${recentNotes}` : 'Not bulunamadı.'}

Yukarıdaki verilere göre bana bir trading coach gibi analiz ver:
1. Genel performans değerlendirmesi
2. Zayıf yönlerim ve iyileştirme alanları
3. Güçlü yönlerim
4. Strateji bazında hangisi daha iyi gidiyor, neden?
5. Varyans ve risk yönetimi değerlendirmesi
6. Somut öneriler (bir sonraki hafta için)`;

      const msgDiv = document.getElementById('data-ai-msgs');
      msgDiv.innerHTML = '<div class="ai-coach-placeholder">🤔 Analiz ediliyor...</div>';
      try {
        const resp = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Bir trading coach gibi davran. İşlem verilerim şu:\n\n${statsBlock}` }) });
        const data = await resp.json();
        const reply = data.reply || 'Cevap alınamadı.';
        // Format response with coach styling
        const formatted = reply.replace(/^(\d+\.\s+\*\*.*)/gm, '<div class="ai-coach-section"><h4>$1</h4>').replace(/(\*\*.*\*\*)/g, '<strong>$1</strong>');
        msgDiv.innerHTML = '<div class="ai-coach-msg" style="max-height:none;margin:0;">' + esc(reply).replace(/\n/g, '<br>') + '</div>';
      } catch(e) {
        msgDiv.innerHTML = '<div style="color:var(--red);padding:12px;">Analiz hatası: ' + esc(e.message) + '</div>';
      }
    });
  }
}

// ============ Haftalık Değerlendirme ============
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
      { id: 's1', title: 'Bu hafta nasıl geçti?' },
      { id: 's2', title: 'Kripto' },
      { id: 's3', title: 'FX' },
      { id: 's4', title: 'Hatalar' },
      { id: 's5', title: 'Değiştirmen gereken ilk hatan' },
      { id: 's6', title: 'Öğrenilenler' },
      { id: 's7', title: 'Yapılacaklar' },
      { id: 's8', title: "Edge'ini öldüren şeyler" }
    ],
    metrics: [
      { id: 'm1', title: 'Kurallarıma uydum' },
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
  const mon = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const m = mondayOf(d), e = new Date(m); e.setDate(e.getDate() + 6);
  return m.getDate() + ' ' + mon[m.getMonth()] + ' – ' + e.getDate() + ' ' + mon[e.getMonth()] + ' ' + e.getFullYear();
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
  const mon = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
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

  // Ay KPI kartları
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
    mk('Değerlendirilen hafta', nWeeks + ' hafta');
    mk('Haftalık Toplam RR', (cK + cF > 0 ? '+' : '') + (cK + cF).toFixed(2) + 'R', cK + cF >= 0 ? 'pos' : 'neg');
    mk('Trade Günlüğü R', (totR > 0 ? '+' : '') + totR.toFixed(2) + 'R', totR >= 0 ? 'pos' : 'neg');
    mk('Win rate', tradesInMonth.length ? Math.round(wins / tradesInMonth.length * 100) + '%' : '—');
  }

  // Metrikler — ortalama
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
    valSpan.textContent = avg === null ? '—' : avg + '%' + (cnt ? ' (' + cnt + ' hafta)' : '');
    head.appendChild(lbl); head.appendChild(valSpan);
    const bar = document.createElement('div'); bar.className = 'rv-bar';
    const fill = document.createElement('div'); fill.className = 'rv-bar-fill';
    fill.style.width = (avg === null ? 0 : avg) + '%'; bar.appendChild(fill);
    wrap.appendChild(head); wrap.appendChild(bar);
    mBox.appendChild(wrap);
  });

  // Bölümler — birleştirilmiş notlar + çıkarılan dersler otomatik
  const sBox = document.getElementById('rv-sections');
  sBox.innerHTML = '';
  reviewCfg.sections.forEach(sec => {
    const parts = [];
    weekKeys.forEach(k => {
      const v = reviews[k] && reviews[k].notes && reviews[k].notes[sec.id];
      if (v && v.trim()) parts.push('▸ ' + weekLabel(new Date(k + 'T00:00:00')) + '\n' + v.trim());
    });
    const isOgren = /öğren|ogren|ders|lesson/i.test(sec.title);
    if (isOgren) {
      const lessons = (Array.isArray(lessonsData && lessonsData.lessons) ? lessonsData.lessons : [])
        .filter(l => l && l.added && String(l.added).indexOf(wk) === 0);
      if (lessons.length) {
        parts.push('▸ Çıkarılan dersler (otomatik — Ders Defteri):\n' + lessons.map(l => '• ' + l.text).join('\n'));
      }
    }
    const wrap = document.createElement('div'); wrap.className = 'rv-section';
    const head = document.createElement('div'); head.className = 'rv-shead';
    const title = document.createElement('span'); title.className = 'rv-stitle'; title.textContent = sec.title;
    head.appendChild(title);
    const ta = document.createElement('div'); ta.className = 'rv-ta';
    ta.style.cssText = 'white-space:pre-wrap;';
    ta.textContent = parts.length ? parts.join('\n\n') : (isOgren ? 'Bu ay çıkarılan ders yok.' : 'Bu ay bu bölüme not girilmemiş.');
    wrap.appendChild(head); wrap.appendChild(ta);
    sBox.appendChild(wrap);
  });

  // Trade günlüğü equity
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
    const lbl = document.createElement('input'); lbl.className = 'rv-mlabel'; lbl.value = m.title; lbl.placeholder = 'Ölçüt adı';
    lbl.addEventListener('input', () => { m.title = lbl.value; });
    lbl.addEventListener('change', saveReviewCfg);
    const valSpan = document.createElement('span'); valSpan.className = 'rv-mval'; valSpan.textContent = val + '%';
    const del = document.createElement('button'); del.className = 'rv-del'; del.type = 'button'; del.textContent = '×'; del.title = 'Sil';
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
    const title = document.createElement('input'); title.className = 'rv-stitle'; title.value = sec.title; title.placeholder = 'Bölüm başlığı';
    title.addEventListener('input', () => { sec.title = title.value; });
    title.addEventListener('change', saveReviewCfg);
    const del = document.createElement('button'); del.className = 'rv-del'; del.type = 'button'; del.textContent = '×'; del.title = 'Sil';
    del.addEventListener('click', () => { reviewCfg.sections = reviewCfg.sections.filter(x => x.id !== sec.id); saveReviewCfg(); renderReview(); });
    head.appendChild(title); head.appendChild(del);
    const ta = document.createElement('textarea'); ta.className = 'rv-ta'; ta.value = val; ta.placeholder = 'Bu hafta için notların…';
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
    // Son değer etiketi
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
  g('rv-add-metric').addEventListener('click', () => { reviewCfg.metrics.push({ id: rid(), title: 'Yeni ölçüt' }); saveReviewCfg(); renderReview(); });
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
    status.textContent = 'Önce haftalık DB ID gerekli: Trade Günlüğü → ⚙ Notion Database Ayarları.';
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
  status.textContent = 'Notion\'a yazılıyor…';
  status.style.color = '';
  try {
    const resp = await fetch('/api/notion-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'push', dbId, week: wk, rr: { kripto: rr.kripto, fx: rr.fx }, sections, metrics })
    });
    const j = await resp.json();
    if (j.ok) status.textContent = '✅ ' + wk + ' senkronlandı' + (j.created ? ' (yeni sayfa)' : ' (güncellendi)');
    else status.textContent = '⚠ ' + (j.error || 'Senkron hatası') + ' — DB ID / yetki kontrol et.';
    status.style.color = j.ok ? 'var(--green)' : 'var(--red)';
  } catch (e) {
    status.textContent = '⚠ Sunucuya ulaşılamadı.';
    status.style.color = 'var(--red)';
  }
}

async function pullWeeksFromNotion() {
  const status = document.getElementById('rv-nstatus');
  if (!status) return;
  const dbId = getNotionDbIds().week;
  if (!dbId) {
    status.textContent = 'Önce haftalık DB ID gerekli: Trade Günlüğü → ⚙ Notion Database Ayarları.';
    status.style.color = 'var(--red)';
    return;
  }
  status.textContent = 'Notion\'dan çekiliyor…';
  status.style.color = '';
  try {
    const resp = await fetch('/api/notion-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pull', dbId })
    });
    const j = await resp.json();
    if (!j.ok || !j.weeks) throw new Error(j.error || 'Çekme hatası');
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
    status.textContent = '✅ ' + n + ' hafta içe aktarıldı.';
    status.style.color = 'var(--green)';
  } catch (e) {
    status.textContent = '⚠ ' + (e.message || 'Çekme hatası');
    status.style.color = 'var(--red)';
  }
}

// ============ Strateji Yönetimi (yalnızca admin, localStorage) ============
const STRAT_KEY = 'defter-strategies-v1';
let stratData = { list: [] };
let stratMode = 'list';      // strateji sayfası: 'list' | 'detail'
let stratCurId = null;
let stratEditId = null;
let stratFormOpen = false;

async function loadStrat() {
  try {
    const raw = await store.get(STRAT_KEY);
    if (raw) { const d = JSON.parse(raw); if (d && Array.isArray(d.list)) stratData = d; }
  } catch (e) { /* ilk açılış */ }
  if (!Array.isArray(stratData.list)) stratData.list = [];
  let migrated = false;
  stratData.list.forEach(s => {
    if (!Array.isArray(s.liveTrades) && Array.isArray(s.trades)) { s.liveTrades = s.trades; delete s.trades; migrated = true; }
    if (!Array.isArray(s.btTrades)) { s.btTrades = []; migrated = true; }
    if (!Array.isArray(s.liveTrades)) { s.liveTrades = []; migrated = true; }
    if (!s.edu) { s.edu = { src: '', learned: '', links: [], videos: [] }; migrated = true; }
  });
  if (migrated) saveStrat();
}
async function saveStrat() {
  try { await store.set(STRAT_KEY, JSON.stringify(stratData)); } catch (e) { console.error('saveStrat:', e); }
}
function stratCur() { return stratData.list.find(x => x.id === stratCurId) || null; }

function stratNum(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }

// --- otomatik metrikler: trade kayıtlarından ---
function stratMetrics(trades) {
  const ts = Array.isArray(trades) ? trades : [];
  const out = { n: ts.length, wr: null, pf: null, avg: null, netR: null, dd: null };
  const rs = [];
  ts.forEach(t => { const v = stratNum(t.r); if (v !== null) rs.push(v); });
  if (!rs.length) return out;
  const wins = rs.filter(v => v > 0);
  const gWin = wins.reduce((a, b) => a + b, 0);
  const gLoss = Math.abs(rs.filter(v => v < 0).reduce((a, b) => a + b, 0));
  const net = rs.reduce((a, b) => a + b, 0);
  out.wr = Math.round(wins.length / rs.length * 1000) / 10;
  out.pf = gLoss > 0 ? Math.round(gWin / gLoss * 100) / 100 : (gWin > 0 ? 99 : 0);
  out.avg = Math.round(net / rs.length * 100) / 100;
  out.netR = Math.round(net * 100) / 100;
  let peak = 0, cum = 0, maxdd = 0;
  rs.forEach(v => { cum += v; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxdd) maxdd = dd; });
  out.dd = Math.round(maxdd * 100) / 100;
  return out;
}
function stratTradesOf(s, kind) {
  if (kind === 'bt') return (s && Array.isArray(s.btTrades)) ? s.btTrades : [];
  return (s && Array.isArray(s.liveTrades)) ? s.liveTrades : [];
}
function stratAutoMetrics(s) {
  // birleşik: backtest + live — liste kartı ve skor için
  return stratMetrics(stratTradesOf(s, 'bt').concat(stratTradesOf(s, 'live')));
}
function stratScore(s) {
  // kompozit skor: işlem kayıtlarından hesaplanan metrikler. 0-100.
  const auto = stratAutoMetrics(s);
  const parts = [];
  if (auto.wr != null) parts.push(auto.wr);
  if (auto.pf != null && auto.pf > 0) parts.push(Math.min(100, auto.pf * 40));
  if (auto.avg != null) parts.push(Math.min(100, (auto.avg + 1) * 33));
  if (auto.dd != null) parts.push(auto.dd <= 2 ? 85 : auto.dd <= 4 ? 60 : auto.dd <= 7 ? 35 : 10);
  if (auto.n >= 5) {
    if (auto.wr != null) parts.push(auto.wr * 0.9);
    if (auto.netR != null) parts.push(Math.min(100, Math.max(0, (auto.netR / auto.n) * 160)));
  }
  let sc = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0;
  if (s.status === 'elendi') sc = Math.min(sc, 25);
  if (s.status === 'pasif') sc = Math.round(sc * 0.7);
  return sc;
}
function stratScoreClass(sc) { return sc >= 70 ? 'good' : sc >= 40 ? 'neu' : 'bad'; }
function stratStatusMeta(st) { return { label: st === 'aktif' ? '🟢 Aktif' : st === 'izleniyor' ? '🟡 İzleniyor' : st === 'pasif' ? '⚪ Pasif' : '🔴 Elendi', next: st === 'aktif' ? 'izleniyor' : st === 'izleniyor' ? 'pasif' : st === 'pasif' ? 'elendi' : 'aktif' }; }
function stratNextBtn(st) { return st === 'aktif' ? '➖ Pasifleştir' : st === 'izleniyor' ? '⚪ Pasif yap' : st === 'pasif' ? '🔴 Ele' : '♻️ Geri al'; }

// --- Stratejiler sayfası görünümü ---
function renderStrategies() {
  if (stratMode === 'detail') {
    const s = stratCur();
    if (!s) { stratMode = 'list'; stratRenderList(); }
    else stratRenderDetail(s);
  } else {
    stratRenderList();
  }
}
// --- liste görünümü ---
function stratRenderList() {
  const listEl = document.getElementById('strat-list');
  const emptyEl = document.getElementById('strat-empty');
  const wrap = document.getElementById('strat-list-wrap');
  const formEl = document.getElementById('strat-form');
  if (wrap) wrap.style.display = 'block';
  const dN = document.getElementById('strat-dist-note');
  if (dN) dN.innerHTML = '';
  const detEl = document.getElementById('strat-detail');
  if (detEl) detEl.classList.add('hidden');
  if (formEl) formEl.classList.toggle('hidden', !stratFormOpen);
  if (!listEl) return;
  const list = stratData.list.slice().sort((a, b) => stratScore(b) - stratScore(a) || (a.prio || 3) - (b.prio || 3));
  const card = s => {
    const auto = stratAutoMetrics(s);
    const sc = stratScore(s);
    const st = s.status;
    const meta = stratStatusMeta(st);
    const rules = (s.rules || []).length;
    const tr = stratTradesOf(s, 'bt').length + stratTradesOf(s, 'live').length;
    const m = (lbl, val, cls) => '<div class="strat-metric"><span class="m-lbl">' + lbl + '</span><span class="m-val ' + (cls || '') + '">' + val + '</span></div>';
    const wr = auto.wr;
    const pf = auto.pf;
    const netR = auto.netR != null ? (auto.netR > 0 ? '+' : '') + auto.netR : null;
    return '<div class="strat-card st-' + st + '" data-strat="' + s.id + '">' +
      '<div class="strat-flag ' + st + '"></div>' +
      '<div class="strat-main">' +
        '<div class="strat-name-row"><span class="strat-name">' + esc(s.name) + '</span><span class="strat-chip st-' + st + '">' + meta.label + '</span>' +
          (s.market ? '<span class="strat-chip">' + esc(s.market) + '</span>' : '') +
          (s.tf ? '<span class="strat-chip">⏱ ' + esc(s.tf) + '</span>' : '') +
          (s.dir ? '<span class="strat-chip">' + (s.dir === 'long' ? '↗ Long' : s.dir === 'short' ? '↘ Short' : '⇅ Her iki yön') + '</span>' : '') +
        '</div>' +
        '<div class="strat-meta">' + (s.created ? 'Eklenme: ' + new Date(s.created).toLocaleDateString('tr-TR') : '') +
          (rules ? ' · 📋 ' + rules + ' kural' : '') + (tr ? ' · 📈 ' + tr + ' işlem' : '') +
          (s.edu && s.edu.src ? ' · 🎓 @' + esc(s.edu.src) : '') + '</div>' +
        '<div class="strat-metrics">' +
          m('Win rate', wr != null ? wr + '%' : '—', wr >= 50 ? 'good' : wr >= 40 ? 'neu' : 'bad') +
          m('PF', pf != null ? pf : '—', pf >= 1.5 ? 'good' : pf >= 1 ? 'neu' : 'bad') +
          m('Ort. R', auto.avg != null ? auto.avg : '—', auto.avg >= 0.3 ? 'good' : auto.avg >= 0 ? 'neu' : 'bad') +
          m('Net R', netR != null ? netR : '—', auto.netR >= 0 ? 'good' : 'bad') +
          m('Öncelik', s.prio || '—') +
        '</div>' +
        '<div class="strat-actions-row">' +
          '<button type="button" class="btn" data-strat-open="' + s.id + '">Aç</button>' +
          '<button type="button" class="btn" data-strat-edit="' + s.id + '">✎ Düzenle</button>' +
          '<button type="button" class="btn" data-strat-status="' + s.id + '">' + stratNextBtn(st) + '</button>' +
          '<button type="button" class="btn" data-strat-del="' + s.id + '" style="color:var(--red)">🗑 Sil</button>' +
        '</div>' +
      '</div>' +
      '<div class="strat-score"><span class="s-val ' + stratScoreClass(sc) + '">' + sc + '</span><span class="s-lbl">Skor</span></div>' +
    '</div>';
  };
  listEl.innerHTML = list.map(card).join('');
  if (emptyEl) emptyEl.style.display = list.length ? 'none' : 'block';
  const dersEl = document.getElementById('strat-ders');
  if (dersEl) dersEl.innerHTML = stratDersHtml();
  if (list.length && stratEditId && !stratData.list.find(x => x.id === stratEditId)) stratEditId = null;
}
let stratTradeTab = 'live';   // detay işlem sekmesi: 'bt' | 'live'
let stratPendingImg = null;   // işlem formuna eklenecek bekleyen fotoğraf (dataURL)

function stratDersHtml() {
  // "Dersler & Konular": tüm stratejilerin eğitim içeriğini konu konu gruplar
  const groups = {};
  stratData.list.forEach(s => {
    const edu = s.edu || {};
    const hasContent = (edu.learned && edu.learned.trim()) || (edu.links && edu.links.length) || (edu.videos && edu.videos.length) || (edu.src && edu.src.trim());
    if (!hasContent) return;
    const det = stratDetectTopic(edu.learned || '', s.name, edu.src || '');
    const tid = edu.topic || det.id;
    if (!groups[tid]) groups[tid] = { meta: stratTopicMeta(tid), items: [] };
    groups[tid].items.push(s);
  });
  const ids = Object.keys(groups);
  if (!ids.length) {
    return '<div class="sd-sec sd-edu-sec">' +
      '<div class="sd-sec-h">🎓 Dersler & Konular <span class="sd-hint">eğitim içerikleri otomatik gruplanır</span></div>' +
      '<div class="sd-empty">Henüz ders içeriği yok — bir stratejiyi aç, Eğitim & Kaynak bölümünden kaynak / öğrenilenler / link / video ekle, burada ders ders gruplansın.</div></div>';
  }
  ids.sort((a, b) => groups[b].items.length - groups[a].items.length || stratTopicMeta(a).name.localeCompare(stratTopicMeta(b).name));
  const cardsHtml = s => {
    const edu = stratEdu(s);
    const links = (edu.links || []).map(l =>
      '<div class="sd-edu-item"><a href="' + esc(l.url) + '" target="_blank" rel="noopener">🔗 ' + esc(l.title || l.url) + '</a></div>').join('');
    const vids = (edu.videos || []).map(v =>
      '<div class="sd-edu-item sd-edu-vid"><div class="sd-edu-vid-top"><span>▶️ YouTube</span></div>' +
      '<iframe src="https://www.youtube.com/embed/' + esc(v.vid) + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>').join('');
    return '<div class="sd-ders-card">' +
      '<div class="sd-ders-card-h">' +
        '<button type="button" class="btn solid" data-ders-open="' + s.id + '">' + esc(s.name) + '</button>' +
        (edu.src ? '<span class="strat-chip">🎓 @' + esc(edu.src) + '</span>' : '') +
        (s.status ? '<span class="strat-chip st-' + s.status + '">' + stratStatusMeta(s.status).label + '</span>' : '') +
      '</div>' +
      (edu.learned && edu.learned.trim() ? '<div class="sd-ders-learned">' + esc(edu.learned) + '</div>' : '') +
      (links ? '<div class="sd-edu-links">' + links + '</div>' : '') +
      (vids ? '<div class="sd-edu-vids">' + vids + '</div>' : '') +
    '</div>';
  };
  return '<div class="sd-sec sd-edu-sec">' +
    '<div class="sd-sec-h">🎓 Dersler & Konular <span class="sd-hint">tüm stratejilerin eğitim içerikleri konu konu — başlığa tıkla, not ve videoları gör</span></div>' +
    ids.map(tid => {
      const g = groups[tid];
      return '<details class="sd-ders-conu">' +
        '<summary><span class="sd-ders-ico">' + g.meta.ico + '</span><span class="sd-ders-name">' + g.meta.name + '</span><span class="strat-group-n">' + g.items.length + '</span></summary>' +
        '<div class="sd-ders-body">' + g.items.map(cardsHtml).join('') + '</div>' +
      '</details>';
    }).join('') +
  '</div>';
}

function stratYtId(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function stratResizeImg(file, cb) {
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1280;
      let w = img.width, h = img.height;
      if (Math.max(w, h) > MAX) { const k = MAX / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      let out;
      try { out = cv.toDataURL('image/jpeg', 0.72); } catch (e) { out = ev.target.result; }
      cb(out);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function stratShowImg(src) {
  let lb = document.getElementById('strat-lb');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'strat-lb';
    lb.className = 'strat-lb hidden';
    lb.innerHTML = '<img id="strat-lb-img" alt="">';
    lb.addEventListener('click', () => lb.classList.add('hidden'));
    document.body.appendChild(lb);
  }
  const im = document.getElementById('strat-lb-img');
  im.src = src;
  lb.classList.remove('hidden');
}
function stratHideImg() { const lb = document.getElementById('strat-lb'); if (lb) lb.classList.add('hidden'); }
const STRAT_TOPICS = [
  { id: 'likidite', ico: '💧', name: 'Likidite & Tuzak', kw: ['likidite', 'liquidity', 'grab', 'tuza', 'trap', 'sweep', 'süpür', 'stop hunt', 'bos', 'breaker', 'fvg', 'imbalance', 'order block', 'orderblock'] },
  { id: 'kiralim', ico: '🧱', name: 'Kırılım & Yapı', kw: ['kırılım', 'kırılma', 'break', 'breakout', 'iç bar', 'dış bar', 'ic bar', 'dis bar', 'inside', 'outside', 'sıkışma', 'sikisma', 'range', 'konsolid', 'daralma'] },
  { id: 'trend', ico: '📈', name: 'Trend & Momentum', kw: ['trend', 'momentum', 'impulse', 'itki', 'devam', 'pullback', 'ger çekil', 'dip', 'tepe', 'higher high', 'higher low', 'lower high', 'lower low'] },
  { id: 'konfluens', ico: '✅', name: 'Konfluens & Onay', kw: ['konfluens', 'conflu', 'onay', 'confirm', 'cvd', 'hacim', 'volume', 'orderbook', 'order book', 'open interest', 'funding', 'fonlama', 'equilibrium', 'denge'] },
  { id: 'risk', ico: '🛡️', name: 'Risk & Para Yönetimi', kw: ['risk', 'stop loss', 'take profit', 'pozisyon boyu', 'position size', 'para yönetimi', 'kaldıraç', 'kaldirac', 'leverage', 'r:r', 'koruma', 'zarar kes'] },
  { id: 'psikoloji', ico: '🧠', name: 'Psikoloji & Disiplin', kw: ['psikoloji', 'disiplin', 'duygu', 'sabır', 'sabir', 'korku', 'fear', 'açgözlü', 'greed', 'intikam', 'revenge', 'panik', 'panic', 'overtrade', 'disiplinsiz'] },
  { id: 'backtest', ico: '📊', name: 'Backtest & Veri', kw: ['backtest', 'geri test', 'istatistik', 'win rate', 'profit factor', 'veri', 'kayıt', 'kayit', 'journal', 'günlük', 'gunluk', 'sonuç', 'sonuc', 'örneklem', 'orneklem'] },
  { id: 'plan', ico: '📅', name: 'Plan & Rutin', kw: ['plan', 'rutin', 'senaryo', 'sabah', 'akşam', 'aksam', 'checklist', 'kontrol listesi', 'hazırlık', 'hazirlik', 'rutin dışı', 'rutin disi', 'ekonomi', 'haber'] }
];
function stratTopicMeta(id) { return STRAT_TOPICS.find(t => t.id === id) || { id: 'genel', ico: '🎓', name: 'Genel / Diğer', kw: [] }; }
function stratDetectTopic() {
  // "AI" benzeri client-side sınıflandırıcı: metinlerdeki anahtar kavramlara göre konu önerir
  const norm = s => String(s || '').toLowerCase().replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g');
  const hay = [];
  for (let i = 0; i < arguments.length; i++) hay.push(norm(arguments[i]));
  const joined = ' ' + hay.join(' ');
  let best = null, bestScore = 0;
  STRAT_TOPICS.forEach(t => {
    let score = 0;
    t.kw.forEach(k => { const kk = norm(k); if (kk.length >= 3 && joined.indexOf(kk) >= 0) score += kk.length >= 6 ? 2 : 1; });
    if (score > bestScore) { bestScore = score; best = t; }
  });
  return { id: (best ? best.id : 'genel'), meta: (best ? best : stratTopicMeta('genel')), score: bestScore };
}
function stratEdu(s) { if (!s.edu) s.edu = { topic: '', src: '', learned: '', links: [], videos: [] }; return s.edu; }
function stratToast(msg) {
  let el = document.getElementById('strat-toast');
  if (!el) { el = document.createElement('div'); el.id = 'strat-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
}
function stratTrMeta(t) {
  const rv = stratNum(t.r);
  const cls = rv === null ? '' : rv > 0 ? 'good' : rv < 0 ? 'bad' : 'neu';
  return { rv, cls };
}
function stratTrRow(t, kind) {
  const { rv, cls } = stratTrMeta(t);
  const img = t.img ? '<img class="sd-tr-img" src="' + t.img + '" data-sd-img="1" alt="foto">' : '—';
  return '<tr>' +
    '<td>' + esc(t.date || '—') + '</td>' +
    '<td>' + (t.dir === 'short' ? '↘ Short' : t.dir === 'long' ? '↗ Long' : '—') + '</td>' +
    '<td>' + esc(t.pair || '—') + '</td>' +
    '<td class="' + cls + '">' + (rv !== null ? (rv > 0 ? '+' : '') + rv : '—') + '</td>' +
    '<td class="sd-tr-imgcell">' + img + '</td>' +
    '<td class="sd-tr-note">' + esc(t.note || '') + '</td>' +
    '<td><button type="button" class="sd-x" data-tr-del="' + kind + '" data-tr-id="' + t.id + '">✕</button></td>' +
  '</tr>';
}
function stratTrFormHtml(kind) {
  const lbl = kind === 'bt' ? 'Backtest işlemi' : 'Live işlem';
  const img = stratPendingImg ? '<div class="sd-tr-imgprev"><img src="' + stratPendingImg + '" data-sd-img="1" alt="foto"><button type="button" class="sd-x" data-img-clear="1">✕</button></div>' : '';
  return '<div class="sd-tr-form">' +
    '<input type="date" id="sd-tr-date" value="' + new Date().toISOString().slice(0, 10) + '">' +
    '<select id="sd-tr-dir"><option value="long">Long</option><option value="short">Short</option></select>' +
    '<input type="text" id="sd-tr-pair" placeholder="Çift" maxlength="20">' +
    '<input type="number" id="sd-tr-r" placeholder="Sonuç R (+2, -1)" step="0.01">' +
    '<input type="text" id="sd-tr-note" placeholder="Kısa not (opsiyonel)" maxlength="120">' +
    '<button type="button" class="btn solid" data-img-add title="Dosyadan fotoğraf seç">📷</button>' +
    '<input type="file" id="sd-tr-file" accept="image/*" class="hidden">' +
    img +
    '<button type="button" class="btn solid" data-tr-add="' + kind + '">＋ ' + lbl + '</button>' +
  '</div>' +
  '<div class="sd-tr-hint">Fotoğrafı bu alana yapıştır (Ctrl+V) veya 📷 ile yükle — sıkıştırılıp kaydedilir.</div>';
}
function stratTrTableHtml(s, kind) {
  const list = stratTradesOf(s, kind);
  const rows = list.slice().reverse().map(t => stratTrRow(t, kind)).join('');
  return '<div class="sd-table-wrap"><table class="sd-table">' +
    '<thead><tr><th>Tarih</th><th>Yön</th><th>Çift</th><th>Sonuç (R)</th><th>Foto</th><th>Not</th><th></th></tr></thead>' +
    '<tbody>' + (rows || '<tr><td colspan="7" class="sd-empty">Henüz işlem yok — aşağıdan ekle.</td></tr>') + '</tbody>' +
  '</table></div>';
}
function stratEduHtml(s) {
  const edu = stratEdu(s);
  const curTopic = stratTopicMeta(edu.topic);
  const det = stratDetectTopic(edu.learned, s.name, edu.src);
  const topicOpts = '<option value="">— Konu seç / otomatik —</option>' + STRAT_TOPICS.map(t =>
    '<option value="' + t.id + '"' + (edu.topic === t.id ? ' selected' : '') + '>' + t.ico + ' ' + t.name + '</option>').join('');
  const links = (edu.links || []).map(l =>
    '<div class="sd-edu-item"><a href="' + esc(l.url) + '" target="_blank" rel="noopener">🔗 ' + esc(l.title || l.url) + '</a><button type="button" class="sd-x" data-edu-link-del="' + l.id + '">✕</button></div>'
  ).join('');
  const vids = (edu.videos || []).map(v =>
    '<div class="sd-edu-item sd-edu-vid"><div class="sd-edu-vid-top"><span>▶️ YouTube</span><button type="button" class="sd-x" data-edu-vid-del="' + v.id + '">✕</button></div>' +
    '<iframe src="https://www.youtube.com/embed/' + esc(v.vid) + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>'
  ).join('');
  return '<div class="sd-sec sd-edu-sec">' +
    '<div class="sd-sec-h">🎓 Eğitim & Kaynak <span class="sd-hint">stratejiyi nereden öğrendiğin ve öğrendiklerin — aşağıdaki Dersler & Konular bölümünde ders ders gruplanır</span></div>' +
    '<div class="sd-edu-row"><label>Ders / Konu ' + (edu.topic ? '<span class="strat-chip">' + curTopic.ico + ' ' + curTopic.name + '</span>' : '') + '</label>' +
      '<div class="sd-addrow"><select id="sd-edu-topic">' + topicOpts + '</select>' +
      '<button type="button" class="btn solid" data-edu-topic-save>💾 Konuyu Kaydet</button></div>' +
      '<div class="sd-tr-hint">🤖 AI önerisi: <b>' + det.meta.ico + ' ' + det.meta.name + '</b> — <button type="button" class="btn" data-edu-topic-apply>Uygula</button></div></div>' +
    '<div class="sd-edu-row"><label>Kimden öğreniliyor / kaynak</label>' +
      '<div class="sd-addrow"><input type="text" id="sd-edu-src" value="' + esc(edu.src || '') + '" placeholder="Örn: efloud, ICT, …" maxlength="80"><button type="button" class="btn solid" data-edu-src-save>💾 Kaydet</button></div></div>' +
    '<div class="sd-edu-row"><label>Öğrenilenler</label>' +
      '<textarea id="sd-edu-learned" rows="4" placeholder="Bu strateji hakkında öğrendiklerin…" maxlength="2000">' + esc(edu.learned || '') + '</textarea>' +
      '<button type="button" class="btn solid" data-edu-learned-save>💾 Kaydet</button></div>' +
    '<div class="sd-edu-row"><label>Linkler <span class="sd-hint">tweet, makale, site — başlık + adres</span></label>' +
      '<div class="sd-edu-links">' + (links || '<div class="sd-empty">Henüz link yok.</div>') + '</div>' +
      '<div class="sd-addrow"><input type="text" id="sd-edu-link-t" placeholder="Başlık (örn: efloud’un tweet\'i)" maxlength="120"><input type="text" id="sd-edu-link-u" placeholder="https://…" maxlength="300"><button type="button" class="btn solid" data-edu-link-add>＋ Link</button></div></div>' +
    '<div class="sd-edu-row"><label>Videolar <span class="sd-hint">YouTube linki yapıştır — gömülü izlenir</span></label>' +
      '<div class="sd-edu-vids">' + (vids || '<div class="sd-empty">Henüz video yok.</div>') + '</div>' +
      '<div class="sd-addrow"><input type="text" id="sd-edu-vid-u" placeholder="https://youtube.com/watch?v=…" maxlength="300"><button type="button" class="btn solid" data-edu-vid-add>＋ Video</button></div></div>' +
  '</div>';
}
// --- detay görünümü ---
function stratRenderDetail(s) {
  const listWrap = document.getElementById('strat-list-wrap');
  const formEl = document.getElementById('strat-form');
  const detEl = document.getElementById('strat-detail');
  if (!detEl) return;  if (listWrap) listWrap.style.display = 'none';
  if (formEl) formEl.classList.add('hidden');
  detEl.classList.remove('hidden');
  const auto = stratAutoMetrics(s);
  const btM = stratMetrics(stratTradesOf(s, 'bt'));
  const liveM = stratMetrics(stratTradesOf(s, 'live'));
  const sc = stratScore(s);
  const st = s.status;
  const meta = stratStatusMeta(st);
  const m = (lbl, val, cls) => '<div class="strat-metric"><span class="m-lbl">' + lbl + '</span><span class="m-val ' + (cls || '') + '">' + val + '</span></div>';
  const rules = (s.rules || []).map(r => '<div class="sd-rule"><span class="sd-rule-txt">📋 ' + esc(r.t) + '</span><button type="button" class="sd-x" data-rule-del="' + r.id + '">✕</button></div>').join('');
  const confirms = (s.confirms || []).map(c =>
    '<label class="sd-conf' + (c.on ? ' on' : '') + '"><input type="checkbox" data-conf="' + c.id + '"' + (c.on ? ' checked' : '') + '><span class="sd-conf-box"></span><span class="sd-conf-txt">' + esc(c.t) + '</span></label>').join('');
  const confsOn = (s.confirms || []).filter(c => c.on).length;
  const confsTotal = (s.confirms || []).length;
  const edu = stratEdu(s);
  const trLbl = kind => kind === 'bt' ? '📊 Backtest Kayıtları' : '📈 Live Test Kayıtları';
  detEl.innerHTML =
    '<div class="sd-head">' +
      '<div class="sd-title-row">' +
        '<div class="strat-name">' + esc(s.name) + '</div>' +
        '<span class="strat-chip st-' + st + '">' + meta.label + '</span>' +
        (edu.src ? '<span class="strat-chip">🎓 @' + esc(edu.src) + '</span>' : '') +
        '<span class="sd-score s-val ' + stratScoreClass(sc) + '">' + sc + '</span><span class="s-lbl">Skor</span>' +
      '</div>' +
      '<div class="sd-chips">' +
        (s.market ? '<span class="strat-chip">💰 ' + esc(s.market) + '</span>' : '') +
        (s.tf ? '<span class="strat-chip">⏱ ' + esc(s.tf) + '</span>' : '') +
        (s.dir ? '<span class="strat-chip">' + (s.dir === 'long' ? '↗ Long' : s.dir === 'short' ? '↘ Short' : '⇅ Her iki yön') + '</span>' : '') +
        (s.prio ? '<span class="strat-chip">Öncelik ' + s.prio + '</span>' : '') +
        (confsTotal ? '<span class="strat-chip">✅ ' + confsOn + '/' + confsTotal + ' onay</span>' : '') +
        (btM.n ? '<span class="strat-chip">📊 ' + btM.n + ' bt</span>' : '') +
        (liveM.n ? '<span class="strat-chip">📈 ' + liveM.n + ' live</span>' : '') +
      '</div>' +
      '<div class="sd-actions">' +
        '<button type="button" class="btn" data-sd-back>← Liste</button>' +
        '<button type="button" class="btn" data-sd-edit>✎ Düzenle</button>' +
        '<button type="button" class="btn" data-sd-status>' + stratNextBtn(st) + '</button>' +
        '<button type="button" class="btn" data-sd-import title="Trade Günlüğündeki bu strateji adına işlenmiş kayıtları live kayıtlara getir">📥 Günlükten Aktar</button>' +
        '<button type="button" class="btn" data-sd-import-notion title="Önce Notion senkronunu çeker, sonra bu stratejiye eşleyen kayıtları içe aktarır">☁️ Notion\'dan Çek</button>' +
        '<button type="button" class="btn" data-sd-del style="color:var(--red)">🗑 Sil</button>' +
      '</div>' +
      (s._impMsg ? '<div class="sd-import-note">' + esc(s._impMsg) + '</div>' : '') +
    '</div>' +
    '<div class="sd-metrics">' +
      '<div class="sd-metric-group"><div class="sd-mg-title">📊 Backtest</div><div class="strat-metrics">' +
        m('İşlem', btM.n) +
        m('Win rate', btM.wr != null ? btM.wr + '%' : '—', btM.wr >= 50 ? 'good' : btM.wr >= 40 ? 'neu' : 'bad') +
        m('PF', btM.pf != null ? btM.pf : '—', btM.pf >= 1.5 ? 'good' : btM.pf >= 1 ? 'neu' : 'bad') +
        m('Ort. R', btM.avg != null ? btM.avg : '—', btM.avg >= 0.3 ? 'good' : btM.avg >= 0 ? 'neu' : 'bad') +
        m('Net R', btM.netR != null ? (btM.netR > 0 ? '+' : '') + btM.netR : '—', btM.netR >= 0 ? 'good' : 'bad') +
        m('Max DD (R)', btM.dd != null ? btM.dd : '—', btM.dd <= 3 ? 'good' : btM.dd <= 6 ? 'neu' : 'bad') +
      '</div></div>' +
      '<div class="sd-metric-group"><div class="sd-mg-title">📈 Live Test</div><div class="strat-metrics">' +
        m('İşlem', liveM.n) +
        m('Win rate', liveM.wr != null ? liveM.wr + '%' : '—', liveM.wr >= 50 ? 'good' : liveM.wr >= 40 ? 'neu' : 'bad') +
        m('PF', liveM.pf != null ? liveM.pf : '—', liveM.pf >= 1.5 ? 'good' : liveM.pf >= 1 ? 'neu' : 'bad') +
        m('Ort. R', liveM.avg != null ? liveM.avg : '—', liveM.avg >= 0.3 ? 'good' : liveM.avg >= 0 ? 'neu' : 'bad') +
        m('Net R', liveM.netR != null ? (liveM.netR > 0 ? '+' : '') + liveM.netR : '—', liveM.netR >= 0 ? 'good' : 'bad') +
        m('Max DD (R)', liveM.dd != null ? liveM.dd : '—', liveM.dd <= 3 ? 'good' : liveM.dd <= 6 ? 'neu' : 'bad') +
      '</div></div>' +
      '<div class="sd-metric-group"><div class="sd-mg-title">🔗 Toplam</div><div class="strat-metrics">' +
        m('İşlem', auto.n) +
        m('Win rate', auto.wr != null ? auto.wr + '%' : '—', auto.wr >= 50 ? 'good' : auto.wr >= 40 ? 'neu' : 'bad') +
        m('PF', auto.pf != null ? auto.pf : '—', auto.pf >= 1.5 ? 'good' : auto.pf >= 1 ? 'neu' : 'bad') +
        m('Net R', auto.netR != null ? (auto.netR > 0 ? '+' : '') + auto.netR : '—', auto.netR >= 0 ? 'good' : 'bad') +
      '</div></div>' +
    '</div>' +
    '<div class="sd-cols">' +
      '<div class="sd-sec">' +
        '<div class="sd-sec-h">📋 Strateji Kuralları <span class="sd-hint">stratejiyi ne zaman ve nasıl açacağını tanımlar</span></div>' +
        '<div class="sd-rules">' + (rules || '<div class="sd-empty">Henüz kural yok.</div>') + '</div>' +
        '<div class="sd-addrow"><input type="text" id="sd-rule-in" placeholder="Yeni kural… örn: CVD trend yönünde, hacim eşiği 1.2x" maxlength="200"><button type="button" class="btn solid" data-rule-add>＋ Ekle</button></div>' +
      '</div>' +
      '<div class="sd-sec">' +
        '<div class="sd-sec-h">✅ Konfirmasyonlar <span class="sd-hint">işlem öncesi kontrol — kutucuğu işaretle</span></div>' +
        '<div class="sd-confs">' + (confirms || '<div class="sd-empty">Henüz onay öğesi yok.</div>') + '</div>' +
        '<div class="sd-addrow"><input type="text" id="sd-conf-in" placeholder="Yeni onay… örn: R:R ≥ 1:2, trend onayı" maxlength="200"><button type="button" class="btn solid" data-conf-add>＋ Ekle</button></div>' +
      '</div>' +
    '</div>' +
    '<div class="sd-sec sd-trades-sec">' +
      '<div class="sd-tabs">' +
        '<button type="button" class="sd-tab' + (stratTradeTab === 'bt' ? ' on' : '') + '" data-tr-tab="bt">📊 Backtest</button>' +
        '<button type="button" class="sd-tab' + (stratTradeTab === 'live' ? ' on' : '') + '" data-tr-tab="live">📈 Live Test</button>' +
      '</div>' +
      '<div class="sd-sec-h">' + trLbl(stratTradeTab) + ' <span class="sd-hint">R sonucu gir — PF, win rate otomatik hesaplanır</span></div>' +
      stratTrTableHtml(s, stratTradeTab) +
      stratTrFormHtml(stratTradeTab) +
    '</div>' +
    stratEduHtml(s) +
    (s.note ? '<div class="sd-note">📝 ' + esc(s.note) + '</div>' : '');
  delete s._impMsg;
}
// --- form görünümü ---
function stratOpenForm(id) {
  stratEditId = id || null;
  stratFormOpen = true;
  stratMode = 'list';
  const g = el => document.getElementById(el);
  const s = id ? stratData.list.find(x => x.id === id) : null;
  g('strat-form-title').textContent = s ? 'Düzenle: ' + s.name : 'Yeni Strateji';
  g('sf-name').value = s ? (s.name || '') : '';
  g('sf-market').value = s ? (s.market || '') : '';
  g('sf-tf').value = s ? (s.tf || '') : '';
  g('sf-dir').value = s ? (s.dir || '') : '';
  g('sf-status').value = s ? (s.status || 'aktif') : 'aktif';
  g('sf-prio').value = s ? (String(s.prio || 3)) : '3';
  g('sf-note').value = s ? (s.note || '') : '';
  stratRenderList();
}
function stratSaveForm() {
  const g = el => document.getElementById(el);
  const name = g('sf-name').value.trim();
  if (!name) { g('sf-name').focus(); return; }
  const rec = {
    name,
    market: g('sf-market').value.trim(),
    tf: g('sf-tf').value.trim(),
    dir: g('sf-dir').value,
    status: g('sf-status').value,
    prio: parseInt(g('sf-prio').value, 10) || 3,
    note: g('sf-note').value.trim(),
  };
  if (stratEditId) {
    const ex = stratData.list.find(x => x.id === stratEditId);
    if (ex) { Object.assign(ex, rec); ex.edited = Date.now(); }
  } else {
    rec.id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    rec.created = Date.now();
    rec.rules = []; rec.confirms = []; rec.btTrades = []; rec.liveTrades = [];
    stratData.list.push(rec);
  }
  stratEditId = null;
  stratFormOpen = false;
  saveStrat().then(() => stratRenderList());
}
function stratDelete(id) {
  stratData.list = stratData.list.filter(x => x.id !== id);
  if (stratCurId === id) { stratCurId = null; stratMode = 'list'; }
  if (stratEditId === id) { stratEditId = null; stratFormOpen = false; }
  saveStrat().then(() => stratRenderList());
}
function stratCycleStatus(id) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  s.status = stratStatusMeta(s.status).next;
  saveStrat().then(() => renderStrategies());
}
function stratAddRule(id) {
  const s = stratData.list.find(x => x.id === id);
  const inp = document.getElementById('sd-rule-in');
  if (!s || !inp) return;
  const t = inp.value.trim();
  if (!t) return;
  if (!Array.isArray(s.rules)) s.rules = [];
  s.rules.push({ id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t });
  saveStrat().then(() => stratRenderDetail(s));
}
function stratDelRule(id, rid) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  s.rules = (s.rules || []).filter(r => r.id !== rid);
  saveStrat().then(() => stratRenderDetail(s));
}
function stratAddConf(id) {
  const s = stratData.list.find(x => x.id === id);
  const inp = document.getElementById('sd-conf-in');
  if (!s || !inp) return;
  const t = inp.value.trim();
  if (!t) return;
  if (!Array.isArray(s.confirms)) s.confirms = [];
  s.confirms.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t, on: false });
  saveStrat().then(() => stratRenderDetail(s));
}
function stratToggleConf(id, cid) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  const c = (s.confirms || []).find(x => x.id === cid);
  if (!c) return;
  c.on = !c.on;
  saveStrat().then(() => stratRenderDetail(s));
}
function stratDelConf(id, cid) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  s.confirms = (s.confirms || []).filter(c => c.id !== cid);
  saveStrat().then(() => stratRenderDetail(s));
}
function stratAddTrade(id, kind) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  const g = el => document.getElementById(el);
  const r = stratNum(g('sd-tr-r').value);
  if (r === null || r === 0) { const e = g('sd-tr-r'); if (e) e.focus(); return; }
  if (!Array.isArray(s.btTrades)) s.btTrades = [];
  if (!Array.isArray(s.liveTrades)) s.liveTrades = [];
  const list = kind === 'bt' ? s.btTrades : s.liveTrades;
  list.push({
    id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    date: g('sd-tr-date').value,
    dir: g('sd-tr-dir').value,
    pair: g('sd-tr-pair').value.trim(),
    r,
    note: g('sd-tr-note').value.trim(),
    img: stratPendingImg,
  });
  stratPendingImg = null;
  g('sd-tr-pair').value = ''; g('sd-tr-r').value = ''; g('sd-tr-note').value = '';
  saveStrat().then(() => stratRenderDetail(s));
}
function stratDelTrade(id, kind, tid) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  if (kind === 'bt') s.btTrades = (s.btTrades || []).filter(t => t.id !== tid);
  else s.liveTrades = (s.liveTrades || []).filter(t => t.id !== tid);
  saveStrat().then(() => stratRenderDetail(s));
}
function stratClearPendingImg() { stratPendingImg = null; renderStrategies(); }
function stratSetPendingImg(src) { stratPendingImg = src; renderStrategies(); }
function stratPickImgFile() {
  const inp = document.getElementById('sd-tr-file');
  if (inp) inp.click();
}
function stratHandleImgFile() {
  const inp = document.getElementById('sd-tr-file');
  if (!inp || !inp.files || !inp.files.length) return;
  stratResizeImg(inp.files[0], src => { stratPendingImg = src; inp.value = ''; renderStrategies(); });
}
// --- Trade Günlüğü / Notion'dan içe aktarma (live kayıtlara) ---
function stratImportFrom(id, source) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  const name = (s.name || '').trim().toLowerCase();
  if (!name) { s._impMsg = 'Önce strateji adı gir.'; stratRenderDetail(s); return; }
  const src = (typeof dataTrades !== 'undefined' && Array.isArray(dataTrades)) ? dataTrades : [];
  const matches = source === 'notion'
    ? src.filter(t => (t._source === 'Notion' || t.notionId) && stratMatch(t, name))
    : src.filter(t => stratMatch(t, name));
  if (!Array.isArray(s.liveTrades)) s.liveTrades = [];
  const known = new Set(s.liveTrades.map(x => (x.date || '') + '|' + (x.r === null || x.r === undefined ? '' : String(x.r))));
  let added = 0, skipped = 0;
  matches.forEach(t => {
    const rv = stratNum(t.r);
    if (rv === null) return;
    const key = (t.date || '') + '|' + String(rv);
    if (known.has(key)) { skipped++; return; }
    known.add(key);
    s.liveTrades.push({
      id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      date: t.date || '',
      dir: String(t.dir || 'LONG').toLowerCase().indexOf('short') === 0 ? 'short' : 'long',
      pair: t.pair || t.coin || '',
      r: rv,
      note: t.note || ((source === 'notion' ? 'Notion' : 'Günlük') + ' içe aktarıldı'),
    });
    added++;
  });
  if (added) s._impMsg = '✅ ' + added + ' işlem içe aktarıldı' + (skipped ? ' · ' + skipped + ' zaten var' : '') + (source === 'notion' ? ' (Notion)' : ' (Günlük)');
  else s._impMsg = 'Bu strateji adıyla eşleşen kayıt bulunamadı' + (skipped ? ' — ' + skipped + ' zaten eklenmiş.' : '.');
  saveStrat().then(() => stratRenderDetail(s));
}
function stratMatch(t, name) {
  const nm = String(name || '').trim().toLowerCase();
  if (!nm) return false;
  const tn = String(t.strat || '').trim().toLowerCase();
  if (tn && (tn === nm || tn.indexOf(nm) === 0 || nm.indexOf(tn) === 0 || tn.indexOf(nm) >= 0)) return true;
  if (nm.length >= 3) {
    const hay = (String(t.note || '') + ' ' + String(t.model || '')).toLowerCase();
    if (hay.indexOf(nm) >= 0) return true;
  }
  return false;
}
function stratDistributeAll() {
  // Tek buton: trade günlüğündeki tüm kayıtları strateji adı / not / model eşleşmesiyle uygun stratejilere dağıt
  const trades = (typeof dataTrades !== 'undefined' && Array.isArray(dataTrades)) ? dataTrades : [];
  if (!trades.length) { stratToast('Trade günlüğünde kayıt yok — önce günlükten işlem ekle.'); return; }
  const strats = stratData.list.filter(s => (s.name || '').trim());
  let added = 0, dupe = 0, unmatched = 0, tagged = 0;
  trades.forEach(t => {
    const rv = stratNum(t.r);
    if (rv === null) return;
    const hit = strats.find(s => stratMatch(t, s.name));
    if (!hit) { unmatched++; return; }
    if (!Array.isArray(hit.liveTrades)) hit.liveTrades = [];
    const key = (t.date || '') + '|' + String(t.dir || '') + '|' + String(t.pair || '').toUpperCase() + '|' + String(rv);
    const known = hit.liveTrades.some(x =>
      (x.date || '') + '|' + String(x.dir || '') + '|' + String(x.pair || '').toUpperCase() + '|' + (x.r === null || x.r === undefined ? '' : String(x.r)) === key);
    if (known) { dupe++; return; }
    hit.liveTrades.push({
      id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      date: t.date || '',
      dir: String(t.dir || 'LONG').toLowerCase().indexOf('short') === 0 ? 'short' : 'long',
      pair: t.pair || t.coin || '',
      r: rv,
      note: t.note || 'Günlükten dağıtıldı',
    });
    added++;
    if (!String(t.strat || '').trim()) { t.strat = hit.name; tagged++; }
  });
  saveStrat().then(async () => {
    if (tagged) { try { await saveData(); } catch (e) { /* günlük geri yazımı opsiyonel */ } }
    stratRenderList();
    const note = document.getElementById('strat-dist-note');
    if (note) note.innerHTML = '<div class="sd-import-note">📥 Dağıtım özeti: <b>' + added + '</b> işlem stratejilere eklendi' +
      (tagged ? ' · <b>' + tagged + '</b> kayıt strateji adıyla etiketlendi' : '') +
      (dupe ? ' · ' + dupe + ' zaten vardı (atlandı)' : '') +
      (unmatched ? ' · ' + unmatched + ' hiçbir stratejiyle eşleşmedi' : '') + '.</div>';
    stratToast('📥 ' + added + ' işlem dağıtıldı' + (dupe ? ' · ' + dupe + ' zaten vardı' : '') + (unmatched ? ' · ' + unmatched + ' eşleşmedi' : ''));
  });
}
// ============ Analiz Köşesi ============
const ANALIZ_KEY = 'defter-analiz-v1';
let analizData = { traders: [], posts: [] };
let anaEditId = null;
let anaPendingImgs = [];
let anaFilter = { trader: '', topic: '' };
const ANA_COINS = ['TOTAL','TOTAL2','TOTAL3','USDT.D','BTC.D','ETHBTC','DXY','BTC','ETH','SOL','XRP','DOGE','ADA','AVAX','LINK','LTC','DOT','BNB','ARB','OP','SUI','APT','TIA','INJ','PEPE','WIF','BONK','NEAR','ATOM','FIL','ETC','MATIC','UNI','AAVE','FTM','HBAR','VET','ALGO','SEI','PENDLE','RUNE','LDO','SHIB','TRX','TON','ORDI','MKR','CRV','ENA','STRK','TAO','RENDER','WLD','AXL','STX','JUP'];
const ANA_MAX_IMG = 8;
const ANA_TOPICS = [
  { id: 'btc', ico: '₿', name: 'BTC — Bitcoin', kw: ['bitcoin', 'btc'] },
  { id: 'eth', ico: '⧫', name: 'ETH — Ethereum', kw: ['ethereum', 'eth'] },
  { id: 'total', ico: '📊', name: 'TOTAL — Piyasa Değeri', kw: ['total2', 'total3', 'total', 'market cap', 'piyasa degeri', 'tum piyasa'] },
  { id: 'btcd', ico: '🟠', name: 'BTC.D — BTC Dominance', kw: ['btc.d', 'btcd', 'btc dominance', 'dominance'] },
  { id: 'usdtd', ico: '💵', name: 'USDT.D — USDT Dominance', kw: ['usdt.d', 'usdtd', 'usdt dominance', 'stablecoin dominance'] },
  { id: 'ethbtc', ico: '⚖️', name: 'ETHBTC — Parite', kw: ['ethbtc', 'eth/btc', 'parite', 'pariteler'] },
  { id: 'p123', ico: '🔢', name: '1-2-3 — Formasyon', kw: ['1-2-3', '123', '1 2 3'] },
  { id: 'alt', ico: '🪙', name: 'ALT — Altcoin Sezonu', kw: ['altcoin', 'altsezon', 'alt sezon', 'altcoin sezonu', 'alts'] },
  { id: 'genel', ico: '🎯', name: 'Genel — Piyasa', kw: [] }
];
function anaTopicMeta(id) { return ANA_TOPICS.find(t => t.id === id) || { id: 'genel', ico: '🎯', name: 'Genel — Piyasa', kw: [] }; }
function anaDetectTopic() {
  // piyasa analizi odaklı konu tespiti: metinde hangi varlık / endeks analiz ediliyor?
  const norm = s => String(s || '').toLowerCase().replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g').replace(/\s+/g, ' ');
  const hay = [];
  for (let i = 0; i < arguments.length; i++) hay.push(norm(arguments[i]));
  const joined = ' ' + hay.join(' ');
  let best = null, bestScore = 0;
  ANA_TOPICS.forEach(t => {
    if (t.id === 'genel') return;
    let score = 0;
    t.kw.forEach(k => { const kk = norm(k); if (joined.indexOf(kk) >= 0) score += kk.length >= 5 ? 2 : 1; });
    if (score > bestScore) { bestScore = score; best = t; }
  });
  return { id: (best ? best.id : 'genel'), meta: (best ? best : anaTopicMeta('genel')), score: bestScore };
}
let stratSpeakWarmed = false;
let stratSpeakNow = null;
function stratCleanForSpeech(t) {
  return String(t || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '')
    .replace(/[—–]/g, ', ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function stratSpeak(text, btn, id) {
  if (!('speechSynthesis' in window)) { stratToast('⚠️ Bu tarayıcı sesli okumayı desteklemiyor.'); return; }
  if (!stratSpeakWarmed) {
    stratSpeakWarmed = true;
    const warm = () => { try { speechSynthesis.getVoices(); } catch (e) { /* */ } };
    try { speechSynthesis.addEventListener('voiceschanged', warm); } catch (e) { /* */ }
    warm();
  }
  if (stratSpeakNow && stratSpeakNow.id === id) {
    try { speechSynthesis.cancel(); } catch (e) { /* */ }
    if (stratSpeakNow.btn) stratSpeakNow.btn.classList.remove('speaking');
    stratSpeakNow = null;
    return;
  }
  try { speechSynthesis.cancel(); } catch (e) { /* */ }
  if (stratSpeakNow && stratSpeakNow.btn) stratSpeakNow.btn.classList.remove('speaking');
  const u = new SpeechSynthesisUtterance(stratCleanForSpeech(text));
  const voices = speechSynthesis.getVoices() || [];
  const trVoice = voices.find(v => v.lang && v.lang.toLowerCase().indexOf('tr') === 0);
  if (trVoice) u.voice = trVoice;
  u.lang = trVoice ? trVoice.lang : 'tr-TR';
  u.rate = 1;
  u.pitch = 1;
  u.onend = u.onerror = () => {
    if (stratSpeakNow && stratSpeakNow.id === id) stratSpeakNow = null;
    if (btn) btn.classList.remove('speaking');
  };
  stratSpeakNow = { id, btn };
  if (btn) btn.classList.add('speaking');
  try { speechSynthesis.speak(u); } catch (e) { if (btn) btn.classList.remove('speaking'); stratToast('⚠️ Sesli okuma başlatılamadı.'); }
}
async function loadAnaliz() {
  try {
    const raw = await store.get(ANALIZ_KEY);
    const d = raw ? JSON.parse(raw) : null;
    if (d && Array.isArray(d.posts)) { analizData = { traders: Array.isArray(d.traders) ? d.traders : [], posts: d.posts }; }
  } catch (e) { analizData = { traders: [], posts: [] }; }
}
async function saveAnaliz() {
  try { await store.set(ANALIZ_KEY, JSON.stringify(analizData)); } catch (e) { console.error('saveAnaliz:', e); }
}
function anaTraderName(id) { const t = analizData.traders.find(x => x.id === id); return t ? t.name : ''; }
const ANA_CONCEPT_DEFS = [
  { id: 'liq', name: 'Likidite & Stop Avı', kw: ['likidite', 'liquidity', 'stop av', 'stop hunt', 'sweep', 'grab', 'tuzak', 'trap', 'supur', 'likidite topla'] },
  { id: 'ob', name: 'Order Block', kw: ['order block', 'orderblock', 'order blo', 'arz blogu', 'talep blogu'] },
  { id: 'fvg', name: 'FVG / Imbalance', kw: ['fvg', 'fair value gap', 'imbalance', 'dengesizlik', 'fiyat boslugu'] },
  { id: 'bos', name: 'Yapı Kırılımı (BOS / CHoCH)', kw: ['choch', 'bos kirilim', 'yapi kirilim', 'break of structure', 'kirilim', 'kirilma', 'breakout', 'break'] },
  { id: 'trend', name: 'Trend & Momentum', kw: ['trend', 'momentum', 'impulse', 'itki', 'devam', 'sureklilik', 'pullback', 'ger cekilme'] },
  { id: 'range', name: 'Aralık / Konsolidasyon', kw: ['range', 'aralik', 'konsolid', 'sikisma', 'daralma', 'yatay'] },
  { id: 'supply', name: 'Arz Bölgesi', kw: ['supply', 'arz bolgesi'] },
  { id: 'demand', name: 'Talep Bölgesi', kw: ['demand', 'talep bolgesi'] },
  { id: 'time', name: 'Zaman & Sesyon', kw: ['zamanlama', 'sesyon', 'session', 'londra', 'new york', 'asya'] }
];
function anaConcepts(text) {
  const norm = s => String(s || '').toLowerCase().replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g');
  const low = ' ' + norm(text) + ' ';
  const out = [];
  ANA_CONCEPT_DEFS.forEach(c => { if (c.kw.some(k => low.indexOf(norm(k)) >= 0)) out.push(c); });
  return out;
}
function anaConceptNarrative(concepts) {
  const msgs = [];
  concepts.forEach(c => {
    if (c.id === 'liq') msgs.push('likidite odaklı: stop avı / sweep ile likidite toplayıp hareketi ters yönde bekliyor');
    else if (c.id === 'ob') msgs.push('order block bölgelerini destek/direnç alanı olarak kullanıyor');
    else if (c.id === 'fvg') msgs.push('FVG / imbalance alanlarını yön boşluğu olarak takip ediyor');
    else if (c.id === 'bos') msgs.push('yapı kırılımı (BOS/CHoCH) ile yön teyidi alıyor');
    else if (c.id === 'trend') msgs.push('trend/momentum devamına güveniyor');
    else if (c.id === 'range') msgs.push('aralık içinde sıkışma sonrası kırılım bekliyor');
    else if (c.id === 'supply') msgs.push('arz bölgesinden satış baskısı bekliyor');
    else if (c.id === 'demand') msgs.push('talep bölgesinden alım bekliyor');
    else if (c.id === 'time') msgs.push('zaman / sesyon ritmine göre pozisyon alıyor');
  });
  return msgs;
}
function anaAi(text) {
  // "AI" benzeri client-side çıkarım: metinden coin, yön, zaman dilimi, seviye, konu + konsept
  const s = String(text || '');
  const low = ' ' + s.toLowerCase().replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g') + ' ';
  const coins = [];
  const found = new Set();
  (s.match(/\$([A-Za-z]{2,10})/g) || []).forEach(m => { const c = m.replace('$', '').toUpperCase(); if (!found.has(c)) { found.add(c); coins.push(c); } });
  (s.toUpperCase().match(new RegExp('\\b(' + ANA_COINS.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'g')) || []).forEach(c => { if (!found.has(c)) { found.add(c); coins.push(c); } });
  const dir = (/\blong\b|\bal\b|\bbuy\b|\byukari\b|\bboga\b|\bbullish\b/.test(low) ? 'long' : (/\bshort\b|\bsat\b|\bsell\b|\basagi\b|\bayi\b|\bbearish\b/.test(low) ? 'short' : ''));
  const tfM = s.match(/(\d{1,2})\s?(?:m|min|h|d|w|hafta)\b/gi);
  const tf = tfM ? tfM[0].replace(/\s+/g, '').toUpperCase() : (/\bH4\b|\bD1\b|\bH1\b|\bD4\b|\bweekly\b|\bgünlük\b|\bhaftalık\b/i.test(s) ? (s.match(/\b(H4|D1|H1|D4|weekly|günlük|haftalık)\b/i) || [''])[0] : '');
  const sev = [];
  (s.match(/\$\s?[\d.,]+\s?[kmKM]?\b/g) || []).forEach(m => { const v = m.replace(/\s+/g, '').toUpperCase(); if (sev.indexOf(v) < 0) sev.push(v); });
  (s.match(/\b[\d.,]+\s?[kmKM]\b/g) || []).forEach(m => { const v = m.replace(/\s+/g, '').toUpperCase(); if (sev.indexOf(v) < 0 && sev.length < 3) sev.push(v); });
  const topic = anaDetectTopic(s);
  const concepts = anaConcepts(s);
  const whatBits = [];
  if (coins.length) whatBits.push(coins.join(', '));
  if (tf) whatBits.push(tf);
  if (dir) whatBits.push(dir === 'long' ? 'long (alım)' : 'short (satış)');
  if (sev.length) whatBits.push('seviyeler: ' + sev.join(', '));
  if (topic.id !== 'genel') whatBits.push(topic.meta.ico + ' ' + topic.meta.name);
  const what = whatBits.join(' · ') || 'metin taraması yapıldı';
  const msgs = anaConceptNarrative(concepts);
  let why = 'Felsefe: ' + (msgs.length ? msgs.join(' · ') : 'konu netleşmedi — kendi notunu yaz');
  if (dir && sev.length) why += ' · ' + (dir === 'long' ? 'Seviyelerin üstünde kalırsa devam bekliyor.' : 'Seviyelerin altında kalırsa devam bekliyor.');
  return { coins, dir, tf, sev, topicId: topic.id, concepts, what, why };
}
function anaDeepLocal(text) {
  const a = anaAi(text);
  const C = a.concepts;
  const has = id => C.some(c => c.id === id);
  const L = [];
  L.push('📌 Felsefe — nasıl düşünüyor');
  L.push('  ' + a.why);
  L.push('');
  L.push('🧭 Yaklaşım — nasıl yapıyor');
  const yak = [];
  yak.push(a.coins.length ? a.coins.join(' / ') + ' piyasasında' : 'Piyasada');
  yak.push(a.tf ? a.tf + ' grafikte' : 'kısa/orta vade grafiklerde');
  yak.push(a.dir ? (a.dir === 'long' ? 'long (alım) tarafında çalışıyor' : 'short (satış) tarafında çalışıyor') : 'yön netleşmemiş, teyit bekliyor');
  L.push('  ' + yak.join(' — ') + '.');
  L.push('');
  L.push('🧩 Konseptler & Yapılar');
  if (C.length) {
    C.forEach(c => L.push('  • ' + c.name));
    if (has('liq')) L.push('      ↳ Likidite toplama + stop avı: tuzağın olduğu yerde ters hareket beklenir.');
    if (has('ob')) L.push('      ↳ Order Block: giriş/dönüş alanı; fiyat bu bölgeye dönüşte tepki aranır.');
    if (has('fvg')) L.push('      ↳ FVG / Imbalance: fiyat bu boşluğa çekilebilir; dolmadan yönün devamı beklenir.');
    if (has('bos')) L.push('      ↳ BOS / CHoCH: kırılım yönün devamını ya da dönüşü teyit eder.');
    if (has('trend')) L.push('      ↳ Trend / Momentum: itkiler ve geri çekilmeler trend yönünde değerlendirilir.');
    if (has('range')) L.push('      ↳ Aralık / Konsolidasyon: sıkışma sonrası kırılım yönü hedeflenir.');
    if (has('supply')) L.push('      ↳ Arz bölgesi: satış baskısının güçlendiği alan.');
    if (has('demand')) L.push('      ↳ Talep bölgesi: alımın güçlendiği alan.');
  } else {
    L.push('  • Metinde belirgin bir konsept geçmiyor — trader\'ın teyit / alım-satım mantığını kendin yorumla.');
  }
  L.push('');
  L.push('📍 Önemli Seviyeler');
  if (a.sev.length) {
    const sevN = a.sev.map(v => ({ raw: v, n: parseFloat(String(v).replace(/[^0-9.,]/g, '').replace(',', '.')) }));
    const sevSorted = sevN.slice().sort((x, y) => (isNaN(x.n) ? 0 : x.n) - (isNaN(y.n) ? 0 : y.n));
    sevSorted.forEach((v, i) => {
      let note = '— alan / bölge';
      if (!isNaN(v.n) && a.dir) {
        if (a.dir === 'long') {
          if (i === sevSorted.length - 1) note = '— hedef / direnç: üstünde kalırsa senaryo güçlenir';
          else if (i === 0 && sevSorted.length > 1) note = '— geçersizlik: altında günlük kapanış senaryoyu bozar';
          else note = '— destek: üstünde kalmalı';
        } else {
          if (i === 0) note = '— hedef / destek: altında kalırsa senaryo güçlenir';
          else if (i === sevSorted.length - 1) note = '— geçersizlik: üstünde günlük kapanış senaryoyu bozar';
          else note = '— direnç: altında kalmalı';
        }
      }
      L.push('  • ' + v.raw + ' ' + note);
    });
  } else {
    L.push('  • Metinde net bir seviye yok — trader seviye yerine alan / yapı tarif etmiş olabilir.');
  }
  L.push('');
  L.push('🎯 Beklenti & Senaryo');
  L.push('  ' + (a.dir === 'long' ? 'Yukarı senaryo ön planda.' : a.dir === 'short' ? 'Aşağı senaryo ön planda.' : 'Yön belirsiz — trader teyit bekliyor olabilir.'));
  L.push("  Geçersiz olma koşulu: trader'ın işaret ettiği seviyenin aksi yönünde günlük kapanış.");
  return { what: a.what, why: a.why, deep: L.join('\n'), coins: a.coins, dir: a.dir, tf: a.tf, sev: a.sev, topicId: a.topicId, concepts: a.concepts };
}
async function anaDeepLLM(text) {
  const prompt = "Sen kripto piyasa analistisin. Aşağıdaki trader paylaşımını oku ve profesyonel bir trade analizi yaz. Tüm çıktı Türkçe, keskin ve uygulanabilir olmalı. Şu başlıkları kullan:\n📌 Felsefe (trader piyasayı nasıl görüyor)\n🧭 Yaklaşım (nasıl çalışıyor, nereden giriş arıyor)\n🧩 Konseptler & Yapılar (OB, FVG, BOS, CHoCH, likidite vb. tespit edilenler)\n📍 Önemli Seviyeler (net fiyatlar)\n🎯 Senaryo (beklenti + geçersiz olma koşulu)\n\nEn sona şu iki satırı ekle:\nWHAT: tek satır özet (coin, seviye, TF, yön)\nWHY: tek satır ana neden\n\nPaylaşım:\n" + String(text || '').slice(0, 2500);
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt), { signal: ctl.signal });
    if (!res.ok) throw new Error('http ' + res.status);
    const body = await res.text();
    if (!body || body.trim().length < 20 || body.trim().indexOf('{') === 0) return null;
    let what = null, why = null;
    const rest = [];
    body.split('\n').forEach(l => {
      const m = l.trim();
      if (/^WHAT:/i.test(m)) what = m.replace(/^WHAT:\s*/i, '').trim();
      else if (/^WHY:/i.test(m)) why = m.replace(/^WHY:\s*/i, '').trim();
      else rest.push(l);
    });
    return { deep: rest.join('\n').trim(), what, why };
  } catch (e) { return null; }
  finally { clearTimeout(to); }
}
async function anaDeepRun() {
  const g = id => document.getElementById(id);
  const t = g('af-text').value;
  if (!t.trim()) { stratToast('🤖 Analiz için önce metni yapıştır.'); return; }
  const d = anaDeepLocal(t);
  g('af-what').value = d.what;
  g('af-why').value = d.why;
  g('af-deep').value = d.deep;
  const tSel = g('af-topic');
  if (d.topicId && d.topicId !== 'genel' && tSel) tSel.value = d.topicId;
  stratToast('🤖 Analiz hazır — ' + (d.concepts && d.concepts.length ? d.concepts.map(c => c.name).slice(0, 3).join(', ') : 'genel'));
  try {
    const r = await anaDeepLLM(t);
    if (r && r.deep) {
      const untouched = g('af-deep').value === d.deep;
      if (untouched) {
        if (r.deep) g('af-deep').value = r.deep;
        if (r.what) g('af-what').value = r.what;
        if (r.why) g('af-why').value = r.why;
        stratToast('✨ Derin analiz (LLM) tamamlandı');
      }
    }
  } catch (e) { /* yerel analiz yeterli */ }
}
function anaChipsHtml(p) {
  const chips = [];
  (p.coins || []).forEach(c => chips.push('<span class="ana-chip ana-chip-coin">' + esc(c) + '</span>'));
  if (p.dir) chips.push('<span class="ana-chip ana-chip-dir">' + (p.dir === 'long' ? '↗ Long' : '↘ Short') + '</span>');
  if (p.tf) chips.push('<span class="ana-chip">⏱ ' + esc(p.tf) + '</span>');
  (p.sev || []).forEach(v => chips.push('<span class="ana-chip">🎯 ' + esc(v) + '</span>'));
  const tm = anaTopicMeta(p.topic);
  chips.push('<span class="ana-chip">' + tm.ico + ' ' + tm.name + '</span>');
  return chips.join(' ');
}
function anaCardHtml(p) {
  const tr = anaTraderName(p.trader);
  const url = p.url ? '<a class="ana-url" href="' + esc(p.url) + '" target="_blank" rel="noopener">🔗 Gönderi</a>' : '';
  const imgs = ((p.imgs && p.imgs.length ? p.imgs : (p.img ? [p.img] : [])) || []).filter(Boolean);
  const im = imgs.length ? (imgs.length === 1
    ? '<img class="ana-img" src="' + esc(imgs[0]) + '" alt="analiz görseli" loading="lazy" data-ana-img="0">'
    : '<div class="ana-imgs">' + imgs.map((s, i) => '<img class="ana-thumb" src="' + esc(s) + '" alt="analiz görseli" loading="lazy" data-ana-img="' + i + '">').join('') + '</div>') : '';
  const text = p.text ? '<div class="ana-text">' + esc(p.text) + '</div>' : '';
  const what = p.what ? '<div class="ana-note"><b>🎯 Nereyi önemsedi:</b> ' + esc(p.what) + '</div>' : '';
  const why = p.why ? '<div class="ana-note"><b>🤔 Neden:</b> ' + esc(p.why) + '</div>' : '';
  const deep = p.deep ? '<div class="ana-deep"><div class="ana-deep-h">🧠 Analiz</div><div class="ana-deep-b">' + esc(p.deep) + '</div></div>' : '';
  return '<div class="ana-card" data-ana-post="' + p.id + '">' +
    '<div class="ana-card-h">' +
      '<span class="ana-av">' + esc((tr || '?').charAt(0).toUpperCase()) + '</span>' +
      '<div class="ana-tinfo"><span class="ana-tname">' + esc(tr || 'Bilinmeyen') + '</span>' +
        '<span class="ana-tdate">' + (p.date ? new Date(p.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '') + '</span></div>' +
      '<div class="ana-tag">' + url +
        '<button type="button" class="ana-spk" data-speak="' + p.id + '" title="Analizi sesli oku">🔊</button>' +
        '<button type="button" class="sd-x" data-ana-edit="' + p.id + '" title="Analizi düzenle">✏️</button>' +
        '<button type="button" class="sd-x" data-ana-del="' + p.id + '" title="Analizi sil">✕</button></div>' +
    '</div>' +
    '<div class="ana-chips">' + anaChipsHtml(p) + '</div>' +
    what + why + text + im + deep +
  '</div>';
}
function renderAnaliz() {
  const listEl = document.getElementById('ana-list');
  const emptyEl = document.getElementById('ana-empty');
  const fbEl = document.getElementById('ana-filter-bar');
  if (!listEl) return;
  const traders = analizData.traders.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  let posts = analizData.posts.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.created || 0) - (a.created || 0));
  if (anaFilter.trader) posts = posts.filter(p => p.trader === anaFilter.trader);
  if (anaFilter.topic) posts = posts.filter(p => (p.topic || 'genel') === anaFilter.topic);
  if (fbEl) {
    fbEl.innerHTML =
      '<select id="ana-f-trader"><option value="">👥 Tüm traderlar</option>' +
      traders.map(t => '<option value="' + t.id + '"' + (anaFilter.trader === t.id ? ' selected' : '') + '>' + esc(t.name) + (t.tw ? ' (' + esc(t.tw) + ')' : '') + '</option>').join('') + '</select>' +
      '<select id="ana-f-topic"><option value="">🎯 Tüm konular</option>' +
      ANA_TOPICS.map(t => '<option value="' + t.id + '"' + (anaFilter.topic === t.id ? ' selected' : '') + '>' + t.ico + ' ' + t.name + '</option>').join('') + '</select>' +
      '<button type="button" class="btn" id="ana-f-clear">Temizle</button>';
  }
  listEl.innerHTML = posts.map(anaCardHtml).join('');
  if (emptyEl) emptyEl.style.display = posts.length ? 'none' : 'block';
}
function anaFillTraderSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Trader seç —</option>' +
    analizData.traders.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(t =>
      '<option value="' + t.id + '">' + esc(t.name) + (t.tw ? ' (' + esc(t.tw) + ')' : '') + '</option>').join('');
}
function anaOpenForm(post) {
  anaEditId = post ? post.id : null;
  anaPendingImgs = post ? (((post.imgs && post.imgs.length ? post.imgs : (post.img ? [post.img] : [])) || []).slice()) : [];
  anaFillTraderSelect('af-trader');
  const tSel = document.getElementById('af-topic');
  if (tSel) tSel.innerHTML = ANA_TOPICS.map(t => '<option value="' + t.id + '">' + t.ico + ' ' + t.name + '</option>').join('');
  const g = id => document.getElementById(id);
  g('af-date').value = post && post.date ? post.date : new Date().toISOString().slice(0, 10);
  g('af-url').value = post ? (post.url || '') : '';
  g('af-text').value = post ? (post.text || '') : '';
  g('af-what').value = post ? (post.what || '') : '';
  g('af-why').value = post ? (post.why || '') : '';
  g('af-deep').value = post ? (post.deep || '') : '';
  if (post && post.trader) g('af-trader').value = post.trader;
  if (post && post.topic) g('af-topic').value = post.topic;
  const fi = g('af-file'); if (fi) fi.value = '';
  anaRenderImgPreview();
  const sb = g('af-save'); if (sb) sb.textContent = post ? '💾 Güncelle' : '💾 Analizi Kaydet';
  g('ana-form-title').textContent = post ? 'Analizi Düzenle' : 'Yeni Analiz';
  g('ana-form').classList.remove('hidden');
  g('ana-list').style.display = 'none';
  const e = document.getElementById('ana-empty'); if (e) e.style.display = 'none';
  const f = document.getElementById('ana-filter-bar'); if (f) f.style.display = 'none';
}
function anaCancelForm() {
  anaEditId = null; anaPendingImgs = [];
  const f = document.getElementById('ana-form'); if (f) f.classList.add('hidden');
  const sb = document.getElementById('af-save'); if (sb) sb.textContent = '💾 Analizi Kaydet';
  const fi = document.getElementById('af-file'); if (fi) fi.value = '';
  const l = document.getElementById('ana-list'); if (l) l.style.display = '';
  const e = document.getElementById('ana-empty'); if (e) e.style.display = '';
  const fb = document.getElementById('ana-filter-bar'); if (fb) fb.style.display = '';
}
function anaSave() {
  const g = id => document.getElementById(id);
  const trader = g('af-trader').value;
  const text = g('af-text').value;
  if (!trader && !text.trim()) { stratToast('Trader seç veya metin yaz.'); return; }
  const post = {
    id: anaEditId || ('a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
    trader: trader || '',
    date: g('af-date').value || new Date().toISOString().slice(0, 10),
    url: g('af-url').value.trim(),
    text: text.trim(),
    imgs: anaPendingImgs.slice(),
    img: anaPendingImgs[0] || '',
    what: g('af-what').value.trim(),
    why: g('af-why').value.trim(),
    deep: g('af-deep').value.trim(),
    topic: g('af-topic').value || 'genel',
    created: Date.now(),
  };
  if (anaEditId) {
    const i = analizData.posts.findIndex(p => p.id === anaEditId);
    if (i >= 0) { const old = analizData.posts[i]; post.created = old.created || Date.now(); post.id = anaEditId; analizData.posts[i] = post; }
  } else {
    analizData.posts.push(post);
  }
  saveAnaliz().then(() => { anaCancelForm(); renderAnaliz(); stratToast('🧭 Analiz kaydedildi'); });
}
function anaDelete(id) {
  if (!confirm('Bu analizi sil?')) return;
  analizData.posts = analizData.posts.filter(p => p.id !== id);
  saveAnaliz().then(renderAnaliz);
}
function anaAddTrader(name, tw) {
  name = String(name || '').trim();
  if (!name) return null;
  if (analizData.traders.some(t => t.name.toLowerCase() === name.toLowerCase())) return analizData.traders.find(t => t.name.toLowerCase() === name.toLowerCase()).id;
  const t = { id: 'tr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, tw: String(tw || '').trim() };
  analizData.traders.push(t);
  return t.id;
}
function anaRenderImgPreview() {
  const prev = document.getElementById('af-imgprev');
  if (!prev) return;
  if (!anaPendingImgs.length) { prev.innerHTML = ''; return; }
  prev.innerHTML = '<div class="ana-imgs-prev">' + anaPendingImgs.map((s, i) =>
    '<div class="ana-pthumb"><img src="' + esc(s) + '" alt="görsel ' + (i + 1) + '"><button type="button" class="sd-x" data-ana-rm-img="' + i + '" title="Görseli kaldır">✕</button></div>').join('') + '</div>';
}
function anaHandleImgFile(file) {
  if (!file || !file.type || file.type.indexOf('image') !== 0) return;
  if (anaPendingImgs.length >= ANA_MAX_IMG) { stratToast('⚠️ En fazla ' + ANA_MAX_IMG + ' görsel eklenebilir.'); return; }
  if (typeof stratResizeImg === 'function') stratResizeImg(file, out => { if (anaPendingImgs.length < ANA_MAX_IMG) { anaPendingImgs.push(out); anaRenderImgPreview(); } });
  else { const r = new FileReader(); r.onload = e => { if (anaPendingImgs.length < ANA_MAX_IMG) { anaPendingImgs.push(e.target.result); anaRenderImgPreview(); } }; r.readAsDataURL(file); }
}
function anaAddImgUrl(u) {
  if (!u || anaPendingImgs.indexOf(u) >= 0) return false;
  if (anaPendingImgs.length >= ANA_MAX_IMG) { stratToast('⚠️ En fazla ' + ANA_MAX_IMG + ' görsel eklenebilir.'); return false; }
  anaPendingImgs.push(u);
  anaRenderImgPreview();
  return true;
}
function anaTweetId(url) {
  const m = String(url || '').match(/(?:twitter\.com|x\.com)\/(?:[A-Za-z0-9_]{1,30}\/status\/|i\/web\/status\/|i\/status\/)(\d{1,30})/);
  return m ? m[1] : null;
}
let afFetchBusy = false;
async function anaFetchLink() {
  if (afFetchBusy) return;
  const g = id => document.getElementById(id);
  const url = (g('af-url').value || '').trim();
  if (!url) return;
  afFetchBusy = true;
  try {
    const id = anaTweetId(url);
    if (id) {
      try {
        const r = await fetch('https://api.vxtwitter.com/twitter/status/' + id);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        const txt = j.text || '';
        const textEl = g('af-text');
        if (txt && !textEl.value.trim()) textEl.value = txt;
        let mediaUrls = (j.mediaURLs || []).filter(Boolean);
        if (!mediaUrls.length && j.media_photos) mediaUrls = j.media_photos.map(m => m && (m.url || m)).filter(Boolean);
        if (!mediaUrls.length && j.media_extended) mediaUrls = j.media_extended.map(m => m && m.url).filter(Boolean);
        let cnt = 0;
        mediaUrls.forEach(u => { if (anaAddImgUrl(u)) cnt++; });
        const who = j.user_name || '';
        const tSel = g('af-trader');
        if (who && !tSel.value) {
          const nm = j.user_screen_name ? j.user_name + ' (@' + j.user_screen_name + ')' : j.user_name;
          const tid = anaAddTrader(nm, j.user_screen_name ? '@' + j.user_screen_name : '');
          anaFillTraderSelect('af-trader');
          tSel.value = tid;
        }
        if (txt) anaDeepRun();
        stratToast('📥 Tweet çekildi' + (cnt ? ' · ' + cnt + ' görsel' : ''));
        return;
      } catch (e) { stratToast('⚠️ Tweet alınamadı: ' + e.message); return; }
    }
    try {
      const r = await fetch('https://r.jina.ai/' + url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const t = await r.text();
      const textEl = g('af-text');
      if (t && !textEl.value.trim()) {
        const clean = t.replace(/^Title:.*\n?/m, '').replace(/^URL Source:.*\n?/m, '').replace(/^\s*$/gm, ' ').replace(/\n{3,}/g, '\n\n').trim();
        textEl.value = clean.slice(0, 2000);
      }
      stratToast('📥 Sayfa içeriği çekildi');
    } catch (e) { stratToast('⚠️ İçerik alınamadı: ' + e.message); }
  } finally { afFetchBusy = false; }
}
function bindAnalizPage() {
  const g = id => document.getElementById(id);
  const pg = document.getElementById('page-analiz');
  if (!pg) return;
  const renderTradersList = () => {
    const bl = g('ana-traders-list');
    if (!bl) return;
    bl.innerHTML = analizData.traders.map(t =>
      '<div class="ana-trader-row"><span class="ana-av">' + esc(t.name.charAt(0).toUpperCase()) + '</span>' +
      '<span class="ana-tname">' + esc(t.name) + '</span>' + (t.tw ? '<span class="ana-tw">' + esc(t.tw) + '</span>' : '') +
      '<button type="button" class="sd-x" data-at-del="' + t.id + '">✕</button></div>').join('') ||
      '<div class="sd-empty">Henüz trader yok — aşağıdan ekle.</div>';
  };
  pg.addEventListener('click', e => {
    const del = e.target.closest('[data-ana-del]');
    if (del) { anaDelete(del.getAttribute('data-ana-del')); return; }
    const spk = e.target.closest('[data-speak]');
    if (spk) {
      const card = spk.closest('.ana-card');
      const pid = card ? card.getAttribute('data-ana-post') : null;
      const post = pid ? analizData.posts.find(p => p.id === pid) : null;
      if (post) {
        const tr = anaTraderName(post.trader);
        const parts = [];
        if (tr) parts.push(tr + '.');
        if (post.date) parts.push(new Date(post.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) + '.');
        if (post.deep) parts.push('Analiz: ' + post.deep);
        else {
          if (post.what) parts.push('Nereyi önemsedi: ' + post.what);
          if (post.why) parts.push('Neden: ' + post.why);
        }
        if (post.text) parts.push('Paylaşım metni: ' + post.text);
        stratSpeak(parts.join(' '), spk, pid);
      }
      return;
    }
    const edt = e.target.closest('[data-ana-edit]');
    if (edt) {
      const post = analizData.posts.find(p => p.id === edt.getAttribute('data-ana-edit'));
      if (post) anaOpenForm(post);
      return;
    }
    const imgEl = e.target.closest('[data-ana-img]');
    if (imgEl) {
      const card = imgEl.closest('.ana-card');
      const pid = card ? card.getAttribute('data-ana-post') : null;
      const post = pid ? analizData.posts.find(p => p.id === pid) : null;
      if (post) {
        const imgs = ((post.imgs && post.imgs.length ? post.imgs : (post.img ? [post.img] : [])) || []).filter(Boolean);
        const idx = Number(imgEl.getAttribute('data-ana-img')) || 0;
        if (imgs[idx]) stratShowImg(imgs[idx]);
      }
      return;
    }
    if (e.target.closest('#ana-add')) anaOpenForm(null);
    else if (e.target.closest('#af-save')) anaSave();
    else if (e.target.closest('#af-cancel')) anaCancelForm();
    else if (e.target.closest('#af-fetch')) anaFetchLink();
    else if (e.target.closest('#af-dropzone')) {
      if (e.target.closest('[data-ana-rm-img]')) return;
      const f = g('af-file'); if (f) f.click();
    }
    else if (e.target.closest('#af-img-btn')) { const f = g('af-file'); if (f) f.click(); }
    else if (e.target.closest('#af-img-clear')) { anaPendingImgs = []; const fi = g('af-file'); if (fi) fi.value = ''; anaRenderImgPreview(); }
    else if (e.target.closest('[data-ana-rm-img]')) {
      const idx = Number(e.target.closest('[data-ana-rm-img]').getAttribute('data-ana-rm-img'));
      if (!isNaN(idx) && anaPendingImgs[idx]) { anaPendingImgs.splice(idx, 1); anaRenderImgPreview(); }
    }
    else if (e.target.closest('#af-ai')) { anaDeepRun(); }
    else if (e.target.closest('#af-listen')) {
      const g2 = id => document.getElementById(id);
      const deep = g2('af-deep').value.trim();
      const what = g2('af-what').value.trim();
      const why = g2('af-why').value.trim();
      const text = g2('af-text').value.trim();
      let content = '';
      if (deep) content = 'Analiz: ' + deep;
      else content = [what && ('Nereyi önemsedi: ' + what), why && ('Neden: ' + why), text && ('Paylaşım metni: ' + text)].filter(Boolean).join(' ');
      stratSpeak(content || 'Henüz içerik yok.', e.target.closest('#af-listen'), 'ana-form');
    }
    else if (e.target.closest('#af-newtrader-btn')) {
      const v = g('af-newtrader').value;
      const id = anaAddTrader(v, '');
      if (id) { anaFillTraderSelect('af-trader'); g('af-trader').value = id; g('af-newtrader').value = ''; stratToast('👥 Trader eklendi'); }
    }
    else if (e.target.closest('#ana-traders')) {
      g('ana-traders-form').classList.remove('hidden');
      renderTradersList();
    }
    else if (e.target.closest('#at-add')) {
      anaAddTrader(g('at-name').value, g('at-tw').value);
      g('at-name').value = ''; g('at-tw').value = '';
      anaFillTraderSelect('af-trader');
      renderAnaliz();
      renderTradersList();
      stratToast('👥 Trader eklendi');
    }
    else if (e.target.closest('#at-close')) { g('ana-traders-form').classList.add('hidden'); }
    else if (e.target.closest('[data-at-del]')) {
      const id = e.target.closest('[data-at-del]').getAttribute('data-at-del');
      if (!confirm('Bu traderı sil? (Analizleri kalır)')) return;
      analizData.traders = analizData.traders.filter(t => t.id !== id);
      saveAnaliz().then(() => { renderAnaliz(); anaFillTraderSelect('af-trader'); renderTradersList(); });
    }
    else if (e.target.closest('#ana-f-clear')) { anaFilter = { trader: '', topic: '' }; renderAnaliz(); }
  });
  pg.addEventListener('change', e => {
    const tr = e.target.closest('#ana-f-trader');
    const tp = e.target.closest('#ana-f-topic');
    const f = e.target.closest('#af-file');
    if (tr) { anaFilter.trader = tr.value; renderAnaliz(); }
    else if (tp) { anaFilter.topic = tp.value; renderAnaliz(); }
    else if (f) {
      const files = Array.from((f.files || [])).filter(x => x.type && x.type.indexOf('image') === 0);
      files.forEach(anaHandleImgFile);
      if (files.length) stratToast('📷 ' + files.length + ' görsel eklendi');
      f.value = '';
    }
  });
  pg.addEventListener('focusout', e => {
    if (e.target && e.target.id === 'af-url' && e.target.value.trim()) anaFetchLink();
  });
  document.addEventListener('paste', ev => {
    if (currentPage !== 'analiz') return;
    const form = document.getElementById('ana-form');
    if (!form || form.classList.contains('hidden')) return;
    const items = ev.clipboardData && ev.clipboardData.items;
    if (!items) return;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') === 0) { const fl = items[i].getAsFile(); if (fl) files.push(fl); }
    }
    if (files.length) { ev.preventDefault(); files.forEach(anaHandleImgFile); stratToast('📷 ' + files.length + ' görsel yapıştırıldı'); }
  });
  let anaDragDepth = 0;
  const formEl = () => document.getElementById('ana-form');
  pg.addEventListener('dragenter', e => {
    const form = formEl();
    if (!form || form.classList.contains('hidden') || !e.target.closest('#ana-form')) return;
    e.preventDefault(); anaDragDepth++; form.classList.add('ana-drop');
  });
  pg.addEventListener('dragleave', e => {
    if (anaDragDepth > 0) anaDragDepth--;
    if (!anaDragDepth) { const form = formEl(); if (form) form.classList.remove('ana-drop'); }
  });
  pg.addEventListener('dragover', e => { const form = formEl(); if (form && !form.classList.contains('hidden')) e.preventDefault(); });
  pg.addEventListener('drop', e => {
    const form = formEl();
    if (!form || form.classList.contains('hidden')) return;
    e.preventDefault();
    anaDragDepth = 0;
    form.classList.remove('ana-drop');
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(x => x.type && x.type.indexOf('image') === 0);
    files.forEach(anaHandleImgFile);
    if (files.length) stratToast('📷 ' + files.length + ' görsel eklendi');
  });
}
async function stratImportFromNotion(id) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  try {
    if (typeof importFromNotion === 'function') await importFromNotion();
  } catch (e) { /* senkron yoksa devam */ }
  stratImportFrom(id, 'notion');
}
function stratSetTradeTab(kind) { stratTradeTab = kind === 'bt' ? 'bt' : 'live'; renderStrategies(); }
function stratSaveEduSrc(id) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  stratEdu(s).src = document.getElementById('sd-edu-src').value.trim();
  saveStrat().then(() => { stratRenderDetail(s); stratToast('💾 Kaynak kaydedildi: ' + (s.edu.src ? '@' + s.edu.src : '(boş)')); });
}
function stratSaveEduLearned(id) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  const edu = stratEdu(s);
  edu.learned = document.getElementById('sd-edu-learned').value;
  if (!edu.topic && edu.learned.trim()) {
    const det = stratDetectTopic(edu.learned, s.name, edu.src);
    edu.topic = det.id;
    if (det.id !== 'genel') {
      saveStrat().then(() => { stratRenderDetail(s); stratToast('💾 Öğrenilenler kaydedildi · 🤖 Konu: ' + det.meta.ico + ' ' + det.meta.name + ' (otomatik)'); });
      return;
    }
  }
  saveStrat().then(() => { stratRenderDetail(s); stratToast('💾 Öğrenilenler kaydedildi'); });
}
function stratSaveEduTopic(id) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  const el = document.getElementById('sd-edu-topic');
  if (!el) return;
  const t = stratTopicMeta(el.value);
  stratEdu(s).topic = t.id;
  saveStrat().then(() => { stratRenderDetail(s); stratToast('💾 Konu kaydedildi: ' + t.ico + ' ' + t.name); });
}
function stratApplyEduTopic(id) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  const el = document.getElementById('sd-edu-topic');
  if (!el) return;
  const det = stratDetectTopic(stratEdu(s).learned, s.name, stratEdu(s).src);
  el.value = det.id;
  stratToast('🤖 AI önerisi uygulandı: ' + det.meta.ico + ' ' + det.meta.name + (det.id === 'genel' ? ' (konu bulunamadı — elle seç)' : ''));
}
function stratAddEduLink(id) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  const edu = stratEdu(s);
  const t = document.getElementById('sd-edu-link-t').value.trim();
  const u = document.getElementById('sd-edu-link-u').value.trim();
  if (!u) return;
  if (!Array.isArray(edu.links)) edu.links = [];
  edu.links.push({ id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: t, url: u });
  saveStrat().then(() => { stratRenderDetail(s); stratToast('🔗 Link eklendi'); });
}
function stratDelEduLink(id, lid) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  const edu = stratEdu(s);
  edu.links = (edu.links || []).filter(l => l.id !== lid);
  saveStrat().then(() => { stratRenderDetail(s); stratToast('🔗 Link silindi'); });
}
function stratAddEduVideo(id) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  const edu = stratEdu(s);
  const u = document.getElementById('sd-edu-vid-u').value.trim();
  const vid = stratYtId(u);
  if (!vid) return;
  if (!Array.isArray(edu.videos)) edu.videos = [];
  edu.videos.push({ id: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), vid });
  saveStrat().then(() => { stratRenderDetail(s); stratToast('▶️ Video eklendi'); });
}
function stratDelEduVideo(id, vid2) {
  const s = stratData.list.find(x => x.id === id);
  if (!s) return;
  const edu = stratEdu(s);
  edu.videos = (edu.videos || []).filter(v => v.id !== vid2);
  saveStrat().then(() => { stratRenderDetail(s); stratToast('▶️ Video silindi'); });
}

// ============ Eğitim İçeriği (Alfa Edu) ============
const EGITIM_KEY = 'defter-egitim-v1';
const EG_SECTIONS = { teknik: 'Teknik Analiz', temel: 'Temel Analiz', psikoloji: 'Trade Psikolojisi', islem: 'İşlem & Backtest', onchain: 'Onchain Analizi' };
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
  // Eski namespace'siz localStorage verisini de dene (admin giriş yapınca kayboluyor)
  let rawLocal = await store.get(EGITIM_KEY);
  if (!rawLocal) { try { rawLocal = localStorage.getItem(EGITIM_KEY); } catch (e) {} }
  // Kullanıcının kendi seçimlerini (sel/selVid) korumak için önce local'den al
  let localSel = {}, localSelVid = {};
  if (rawLocal) { try { const p = JSON.parse(rawLocal); localSel = p.sel || {}; localSelVid = p.selVid || {}; } catch (e) {} }
  const sharedHasContent = sharedData && sharedData.sections && Object.values(sharedData.sections).some(arr => arr && arr.length > 0);
  if (sharedHasContent && !isAdmin) {
    // Admin değilse: shared verisi local'in üstüne yazsın (silinenler de gitsin)
    egitimData = JSON.parse(JSON.stringify(sharedData));
    egitimData.sel = localSel;
    egitimData.selVid = localSelVid;
    // Kullanıcının KENDİ işaretlerini (v.done) ve notlarını (t.note) shared veriye geri yükle
    // (bu veriler hesaba özel saklanır; ortak içerikle karışmaz)
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
    // shared'dan gelen konuları local'e ekle (yoksa)
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
  // Adminse veriyi shared'a ata (hem ilk seferde hem de her yüklemede)
  if (isAdmin && Object.values(egitimData.sections).some(arr => arr && arr.length > 0)) {
    try {
      await saveEgitim();
    } catch (e) { console.error('Edu shared sync hatası:', e); }
  }
}
async function saveEgitim() {
  await store.set(EGITIM_KEY, JSON.stringify(egitimData));
  // Sadece admin shared'a yazsın, herkes okusun
  if (AUTH.user && (AUTH.user.email || '').toLowerCase() === ADMIN_EMAIL) {
    try {
      const payload = { sections: {}, secMeta: egSecMeta().map(s => ({ id: s.id, title: s.title })) };
      let topicCount = 0, videoCount = 0;
      egSecMeta().forEach(sec => {
        // Temiz kopya: kişiye özel not/done alanları HERKESE yayınlanmasın
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
    } catch (e) { return { ok: false, error: (e && e.message) || 'ağ hatası' }; }
  }
  return { ok: true, local: true };
}

// --- YouTube yardımcıları ---
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
function egKind(v) {
  if (ytId(v.url)) return 'video';
  if (ytListId(v.url)) return 'playlist';
  return 'invalid';
}
function egEmbedSrc(v) {
  const vid = ytId(v.url);
  if (vid) { const lst = ytListId(v.url); return 'https://www.youtube-nocookie.com/embed/' + vid + (lst ? ('?list=' + lst) : ''); }
  const pid = ytListId(v.url);
  if (pid) return 'https://www.youtube-nocookie.com/embed/videoseries?list=' + pid;
  return '';
}
function egWatchHref(v) {
  const vid = ytId(v.url);
  if (vid) return 'https://www.youtube.com/watch?v=' + vid;
  const pid = ytListId(v.url);
  if (pid) return 'https://www.youtube.com/playlist?list=' + pid;
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
  // ---- Eğitsel Kanal: trader listesi (sol alttaki panel) ----
  if (!channelsLoaded) {
    channelsLoaded = true;
    loadChannels().then(async () => { await chEnsureMine(); chSeedFromEdu(chMineTrader()); renderEduChannels(); applyChDeep(); });
  } else {
    applyChDeep();
    chSeedFromEdu(chMineTrader());
  }
  renderEduChannels();
  // ---- Kanal görünümü: Alfa Edu artık sadece trader kanalları; eski kurs arayüzü kapalı ----
  const chView = document.getElementById('ch-view');
  const oldCourse = document.getElementById('eg-old-course');
  const mainControls = document.querySelector('#page-egitim > .controls');
  const egAddForm = document.getElementById('eg-add-form');
  const chFormEl = document.getElementById('ch-form');
  const chProfEl = document.getElementById('ch-prof-form');
  if (oldCourse) oldCourse.classList.add('hidden');
  if (mainControls) mainControls.style.display = 'none';
  if (egAddForm) egAddForm.classList.add('hidden');
  const noCh = document.getElementById('eg-no-channel');
  if (noCh) noCh.style.display = channelOpen ? 'none' : 'block';
  if (channelOpen) {
    if (chView) chView.classList.remove('hidden');
    if (chFormEl) chFormEl.classList.add('hidden');
    if (chProfEl) chProfEl.classList.add('hidden');
    renderChannelView();
    return;
  }
  if (chView) chView.classList.add('hidden');
  return;
  // ---- Bölüm sekmeleri (dinamik; ekle/sil sadece admin) ----
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
      x.textContent = armed ? 'sil?' : '×';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', s.title + ' bölümünü sil');
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        if (egPendingDelSec !== s.id) { egPendingDelSec = s.id; renderEgitim(); return; }
        egPendingDelSec = null;
        const meta = egSecMeta().filter(m => m.id !== s.id);
        if (!meta.length) return;
        if (!confirm('“' + s.title + '” bölümü ve içindeki tüm konular silinsin mi?')) return;
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
    add.setAttribute('aria-label', 'Yeni bölüm ekle');
    add.title = 'Yeni bölüm ekle';
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
  // Düzenleme sadece admin: + Konu, kalem, + Video ekle
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
    // yukarı/aşağı taşıma (sadece admin, satırın en solunda)
    if (canEdit) {
      const up = document.createElement('button'); up.className = 'eg-item-move'; up.type = 'button'; up.textContent = '▲'; up.title = 'Konuyu yukarı taşı';
      up.addEventListener('click', async (e) => { e.stopPropagation(); if (egMoveTopic(t, -1)) { await saveEgitim(); renderEgitim(); } });
      row.appendChild(up);
      const dn = document.createElement('button'); dn.className = 'eg-item-move'; dn.type = 'button'; dn.textContent = '▼'; dn.title = 'Konuyu aşağı taşı';
      dn.addEventListener('click', async (e) => { e.stopPropagation(); if (egMoveTopic(t, 1)) { await saveEgitim(); renderEgitim(); } });
      row.appendChild(dn);
    }
    const idx = document.createElement('span'); idx.className = 'eg-item-idx'; idx.textContent = (i + 1);
    row.appendChild(idx);
    const tt = document.createElement('span'); tt.className = 'eg-item-t'; tt.textContent = t.title || '(başlıksız)';
    row.appendChild(tt);
    if (egSec === 'teknik' && t.level) {
      const lb = document.createElement('span'); lb.className = 'eg-level-badge ' + t.level; lb.textContent = t.level === 'temel' ? 'T' : t.level === 'orta' ? 'O' : 'İ'; lb.title = t.level === 'temel' ? 'Temel' : t.level === 'orta' ? 'Orta' : 'İleri';
      row.appendChild(lb);
    }
    const total = (t.videos || []).length;
    const done = (t.videos || []).filter(v => v.done).length;
    const cnt = document.createElement('span');
    cnt.className = 'eg-count' + (total && done === total ? ' all' : (done ? ' done' : ''));
    cnt.textContent = (total && done === total) ? ('✓ ' + total) : (done + '/' + total);
    cnt.title = total + ' video, ' + done + ' izlendi';
    row.appendChild(cnt);
    const edit = document.createElement('button'); edit.className = 'eg-item-edit'; edit.type = 'button';
    edit.textContent = '✎'; edit.title = 'Konu adını düzenle';
    edit.addEventListener('click', (e) => { e.stopPropagation(); egOpenForm('topic-edit', { topicId: t.id }, { title: t.title, level: t.level }); });
    if (canEdit) row.appendChild(edit);
    const del = document.createElement('button'); del.className = 'eg-item-del'; del.type = 'button';
    del.textContent = '×'; del.title = 'Konuyu sil';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('“' + (t.title || 'Bu konu') + '” ve içindeki videolar silinsin mi?')) return;
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
  document.getElementById('eg-empty').textContent = canEdit ? 'Bu bölümde konu yok. "+ Konu" ile ekle.' : 'Bu bölümde henüz konu yok.';
  document.getElementById('eg-empty').style.display = topics.length ? 'none' : 'block';
  // bölüm ilerlemesi (izlenen / toplam)
  let secTot = 0, secDone = 0;
  topics.forEach(t => (t.videos || []).forEach(v => { secTot++; if (v.done) secDone++; }));
  document.getElementById('eg-progress').innerHTML = secTot ? ('İzlenen <b>' + secDone + '</b>/' + secTot) : '';
  // ---- Sağ: oynatıcı ----
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
    embed.appendChild(ifr);
  } else {
    const ph = document.createElement('div'); ph.className = 'eg-embed-ph';
    const txt = document.createElement('div'); txt.className = 'eg-ph-txt';
    txt.textContent = vids.length ? 'Bu videoya henüz YouTube bağlantısı eklenmedi.' : 'Bu konuda henüz video yok.';
    ph.appendChild(txt);
    if (canEdit) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn solid';
      if (vids.length && curVid) { btn.textContent = '＋ Bağlantı ekle'; btn.addEventListener('click', () => egOpenForm('video-edit', { topicId: cur.id, vidId: curVid.id }, { title: curVid.title, url: curVid.url })); }
      else { btn.textContent = '＋ Video ekle'; btn.addEventListener('click', () => egOpenForm('video-add', { topicId: cur.id }, null)); }
      ph.appendChild(btn);
    }
    embed.appendChild(ph);
  }
  // başlık = konu adı
  document.getElementById('eg-now-title').textContent = cur.title || '(başlıksız)';
  const link = document.getElementById('eg-now-link');
  if (curVid && src) { link.style.display = ''; link.href = egWatchHref(curVid); link.textContent = egKind(curVid) === 'playlist' ? "Oynatma listesini YouTube'da aç ↗" : "YouTube'da aç ↗"; }
  else { link.style.display = 'none'; }
  // İzledim butonu (mevcut video)
  const doneBtn = document.getElementById('eg-done');
  if (curVid) {
    doneBtn.style.display = '';
    doneBtn.classList.toggle('on', !!curVid.done);
    document.getElementById('eg-done-txt').textContent = curVid.done ? '✓ İzlendi' : 'İzledim';
  } else { doneBtn.style.display = 'none'; }
  // videolar alt-listesi
  const vlist = document.getElementById('eg-vid-list');
  vlist.innerHTML = '';
  if (!vids.length) {
    const e = document.createElement('div'); e.className = 'eg-vid-empty'; e.textContent = 'Henüz video yok — “+ Video ekle” ile bağla.';
    vlist.appendChild(e);
  }
  vids.forEach((v, i) => {
    const kind = egKind(v);
    const row = document.createElement('div');
    row.className = 'eg-vid-row' + (curVid && v.id === curVid.id ? ' on' : '') + (v.done ? ' done' : '');
    const chk = document.createElement('button'); chk.className = 'eg-check' + (v.done ? ' on' : ''); chk.type = 'button';
    chk.textContent = '✓'; chk.title = v.done ? 'İzlendi — geri al' : 'İzlendi olarak işaretle';
    chk.addEventListener('click', async (e) => { e.stopPropagation(); v.done = !v.done; await saveEgitim(); renderEgitim(); });
    const idx = document.createElement('span'); idx.className = 'eg-vid-idx'; idx.textContent = (i + 1);
    row.appendChild(idx);
    const t = document.createElement('span'); t.className = 'eg-vid-t'; t.textContent = v.title || '(başlıksız)';
    row.appendChild(t);
    if (kind === 'playlist') { const tag = document.createElement('span'); tag.className = 'eg-item-tag'; tag.textContent = 'Liste'; row.appendChild(tag); }
    else if (kind === 'invalid') { const tag = document.createElement('span'); tag.className = 'eg-item-tag muted'; tag.textContent = 'Link yok'; row.appendChild(tag); }
    // yukarı/aşağı taşıma (sadece admin)
    const up = document.createElement('button'); up.className = 'eg-vid-move'; up.type = 'button'; up.textContent = '▲'; up.title = 'Yukarı taşı';
    up.addEventListener('click', async (e) => { e.stopPropagation(); if (i === 0) return; [cur.videos[i - 1], cur.videos[i]] = [cur.videos[i], cur.videos[i - 1]]; await saveEgitim(); renderEgitim(); });
    const dn = document.createElement('button'); dn.className = 'eg-vid-move'; dn.type = 'button'; dn.textContent = '▼'; dn.title = 'Aşağı taşı';
    dn.addEventListener('click', async (e) => { e.stopPropagation(); if (i === vids.length - 1) return; [cur.videos[i], cur.videos[i + 1]] = [cur.videos[i + 1], cur.videos[i]]; await saveEgitim(); renderEgitim(); });
    const edit = document.createElement('button'); edit.className = 'eg-vid-edit'; edit.type = 'button'; edit.textContent = '✎'; edit.title = 'Videoyu düzenle';
    edit.addEventListener('click', (e) => { e.stopPropagation(); egOpenForm('video-edit', { topicId: cur.id, vidId: v.id }, { title: v.title, url: v.url }); });
    const del = document.createElement('button'); del.className = 'eg-vid-del'; del.type = 'button'; del.textContent = '×'; del.title = 'Videoyu sil';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      cur.videos = cur.videos.filter(x => x.id !== v.id);
      if (egitimData.selVid[cur.id] === v.id) egitimData.selVid[cur.id] = null;
      await saveEgitim(); renderEgitim();
    });
    if (canEdit) {
      row.appendChild(up); row.appendChild(dn); row.appendChild(edit); row.appendChild(del);
    }
    // izlendi işareti en sağda
    row.appendChild(chk);
    row.addEventListener('click', async () => {
      if (egitimData.selVid[cur.id] === v.id) return;
      egitimData.selVid[cur.id] = v.id; await saveEgitim(); renderEgitim();
    });
    vlist.appendChild(row);
  });
  // not (konu bazlı)
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
  const titles = { 'topic-add': 'Yeni konu', 'topic-edit': 'Konu adını düzenle', 'video-add': 'Video ekle', 'video-edit': 'Videoyu düzenle', 'sec-add': 'Yeni bölüm' };
  g('eg-form-title').textContent = titles[mode] || 'Düzenle';
  g('eg-in-title').setAttribute('placeholder', isVideo ? 'Video başlığı (ör. Market Yapısı -1)' : isSec ? 'Bölüm başlığı (ör. Onchain Analizi)' : 'Konu başlığı (ör. Market Yapısı)');
  // Seviye seçici (sadece teknik bölümünde konu ekleme/düzenleme)
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

function egFlashSaved() {
  const s = document.getElementById('eg-notes-status');
  if (!s) return;
  s.textContent = 'kaydedildi ✓'; s.classList.add('show');
  clearTimeout(egFlashSaved._t);
  egFlashSaved._t = setTimeout(() => s.classList.remove('show'), 1400);
}

// ============ Eğitsel Kanal (trader kanalları) ============
let channelsData = { traders: {}, order: [] };
let channelsLoaded = false;
let channelOpen = null;   // açık kanalın trader userId'si
let chSec = 'teknik';     // kanal içinde seçili bölüm id
let chTopic = null;       // kanal içinde seçili konu id
let chVid = null;         // kanal içinde seçili video id
let chForm = { mode: null, topicId: null, vidId: null, ctype: 'video' };
let chDelArmed = null;    // bölüm silme onayı (secId)
let chProfMode = null;    // 'new' | 'edit'
let chProfTarget = null;  // edit edilen kanal id
let chDeep = null;        // derin bağlantı (?ch=&sec=&t=&v=) bekliyorsa burada
let chProg = null;        // kullanıcıya özel "okudum/izledim" tik haritası (yerel)

function chUid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function chUserEmail() { return (AUTH && AUTH.user && AUTH.user.email) ? String(AUTH.user.email).toLowerCase() : ''; }
function chProgLoad() {
  if (chProg) return chProg;
  try { const raw = localStorage.getItem('alfa-chprog-v1'); chProg = raw ? JSON.parse(raw) : {}; } catch (e) { chProg = {}; }
  if (!chProg || typeof chProg !== 'object') chProg = {};
  return chProg;
}
function chProgUser() { return chUserEmail() || 'guest'; }
function chProgKey(t, v) { return t.id + ':' + v.id; }
function chIsDone(t, v) { const m = chProgLoad()[chProgUser()]; return !!(m && m[chProgKey(t, v)]); }
function chProgSet(t, v, on) {
  const m = chProgLoad();
  const u = chProgUser();
  if (!m[u]) m[u] = {};
  if (on) m[u][chProgKey(t, v)] = 1; else delete m[u][chProgKey(t, v)];
  try { localStorage.setItem('alfa-chprog-v1', JSON.stringify(m)); } catch (e) {}
}
function chIsAdmin() { return !!(AUTH && AUTH.user && (AUTH.user.email || '').toLowerCase() === (typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : '')); }
function chCanEdit(trader) {
  if (!trader) return false;
  if (chIsAdmin()) return true;
  const email = chUserEmail();
  if (!email) return false;
  return (trader.editors || []).map(e => String(e).toLowerCase()).indexOf(email) !== -1;
}
function chCount(t) {
  let n = 0;
  Object.values(t.sections || {}).forEach(arr => (arr || []).forEach(x => n += (x.videos || []).length));
  return n;
}
function chAvatarHtml(t) {
  const ini = ((t.name || '').trim().charAt(0) || 'T').toUpperCase();
  return '<span>' + esc(ini) + '</span>';
}
function chSecMeta(t) {
  const m = t && t.secMeta;
  if (m && Array.isArray(m) && m.length) return m;
  return chDefaultSecMeta();
}
function chDefaultSecMeta() { return Object.keys(EG_SECTIONS).map(id => ({ id, title: EG_SECTIONS[id] })); }

async function loadChannels() {
  try {
    const r = await fetch('/api/edu-shared?kind=channel');
    if (r.ok) {
      const j = await r.json();
      if (j && j.data && j.data.traders) {
        channelsData = j.data;
        channelsLoaded = true;
        try { localStorage.setItem('alfa-channels-v1', JSON.stringify(channelsData)); } catch (e) {}
        return;
      }
    }
  } catch (e) { /* ağ kapalıysa yedek */ }
  try {
    const raw = localStorage.getItem('alfa-channels-v1');
    if (raw) { const p = JSON.parse(raw); if (p && p.traders) channelsData = p; }
    channelsLoaded = true;
  } catch (e) { /* */ }
}
// Adminin kendi kanalı (Trader Ahmet): Alfa Edu içeriğiyle bir kez tohumlanır, üstüne eklenebilir
function chIsMine(t) {
  const a = (typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : '') || '';
  return !!(t && t.owner && String(t.owner).toLowerCase() === String(a).toLowerCase());
}
function chMineTrader() {
  for (const id of channelsData.order) { const t = channelsData.traders[id]; if (chIsMine(t)) return t; }
  for (const id of Object.keys(channelsData.traders || {})) { const t = channelsData.traders[id]; if (chIsMine(t)) return t; }
  // Eski veri: 'Trader Ahmet' adıyla açılmış kanal da adminin sayılır
  for (const id of channelsData.order) {
    const t = channelsData.traders[id];
    if (t && String(t.name || '').trim().toLowerCase() === 'trader ahmet') return t;
  }
  return null;
}
async function chEnsureMine() {
  if (!chIsAdmin()) return null;
  const mine = chMineTrader();
  if (mine) {
    // Eski kanalı sahiplen (owner alanı yoksa)
    if (!mine.owner) {
      mine.owner = (typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : '').toLowerCase();
      if (Object.values(mine.sections || {}).some(arr => arr && arr.length)) mine.seeded = true;
      saveChannel(mine, true);
    }
    return mine;
  }
  const t = {
    id: chUid(),
    name: 'Trader Ahmet',
    bio: 'Alfa Edu içerikleri bu kanaldadır — videolar ve notlar üstüne eklenir.',
    owner: (typeof ADMIN_EMAIL !== 'undefined' ? ADMIN_EMAIL : '').toLowerCase(),
    editors: [],
    createdAt: Date.now(),
    sections: {},
    secMeta: null,
    seeded: false,
  };
  channelsData.traders[t.id] = t;
  if (channelsData.order.indexOf(t.id) === -1) channelsData.order.push(t.id);
  try { localStorage.setItem('alfa-channels-v1', JSON.stringify(channelsData)); } catch (e) {}
  try { await fetch('/api/edu-shared?kind=channel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trader: t }) }); } catch (e) {}
  return t;
}
function chSeedFromEdu(t) {
  if (!t || t.seeded) return;
  if (!egitimData || !egitimData.sections) return;
  if (Object.values(t.sections || {}).some(arr => arr && arr.length)) { t.seeded = true; return; }
  const meta = chSecMeta(t);
  let added = 0;
  t.sections = t.sections || {};
  meta.forEach(m => {
    const src = egitimData.sections[m.id] || [];
    if (!Array.isArray(src) || !src.length) return;
    if (!Array.isArray(t.sections[m.id])) t.sections[m.id] = [];
    src.forEach(x => {
      const vids = (x.videos || []).map(v => ({ id: chUid(), title: v.title || '', url: v.url || '' }));
      t.sections[m.id].push({
        id: chUid(),
        title: x.title || '',
        level: (m.id === 'teknik' && x.level) || undefined,
        videos: vids,
      });
      added += vids.length;
    });
  });
  if (!added) return;
  t.seeded = true;
  saveChannel(t, true);
}
async function saveChannel(trader, silent) {
  if (!trader) return;
  channelsData.traders[trader.id] = trader;
  if (channelsData.order.indexOf(trader.id) === -1) channelsData.order.push(trader.id);
  try { localStorage.setItem('alfa-channels-v1', JSON.stringify(channelsData)); } catch (e) {}
  if (!silent) renderEduChannels();
  try {
    await fetch('/api/edu-shared?kind=channel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trader }),
    });
  } catch (e) { /* */ }
}
async function deleteChannel(traderId) {
  delete channelsData.traders[traderId];
  channelsData.order = channelsData.order.filter(x => x !== traderId);
  try { localStorage.setItem('alfa-channels-v1', JSON.stringify(channelsData)); } catch (e) {}
  if (channelOpen === traderId) { channelOpen = null; renderEgitim(); } else renderEduChannels();
  try {
    await fetch('/api/edu-shared?kind=channel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remove: traderId }),
    });
  } catch (e) { /* */ }
}
function renderEduChannels() {
  const listEl = document.getElementById('eg-ch-list');
  const emptyEl = document.getElementById('eg-ch-empty');
  const addBtn = document.getElementById('eg-ch-add');
  if (!listEl) return;
  listEl.innerHTML = '';
  channelsData.order.map(id => channelsData.traders[id]).filter(Boolean).forEach(t => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'ch-trader' + (channelOpen === t.id ? ' on' : '');
    row.innerHTML = '<span class="ch-ava">' + chAvatarHtml(t) + '</span><span class="ch-t-name">' + esc(t.name || 'Trader') + '</span><span class="ch-t-cnt">' + chCount(t) + ' içerik</span>';
    row.addEventListener('click', () => openChannel(t.id));
    listEl.appendChild(row);
  });
  if (emptyEl) emptyEl.style.display = channelsData.order.length ? 'none' : '';
  // Yeni kanal ekleme sadece admin'e özel; diğer herkes sadece izler
  if (addBtn) addBtn.classList.toggle('hidden', !chIsAdmin());
}

function chCurTrader() { return channelOpen ? channelsData.traders[channelOpen] || null : null; }
function chCanEditCur() { return chCanEdit(chCurTrader()); }
function openChannel(userId) {
  const t = channelsData.traders[userId];
  if (!t) return;
  if (chIsMine(t)) chSeedFromEdu(t);
  channelOpen = userId;
  chSec = chSecMeta(t)[0].id;
  chTopic = null; chVid = null;
  chCloseForm(); chCloseProf();
  renderEgitim();
}
function closeChannel() {
  channelOpen = null; chDelArmed = null;
  chCloseForm(); chCloseProf();
  renderEgitim();
}
function applyChDeep() {
  const d = chDeep; if (!d) return;
  chDeep = null;
  if (d.short) {
    fetch('/api/edu-shared?kind=short&code=' + encodeURIComponent(d.short))
      .then(r => r.ok ? r.json() : null)
      .then(j => { applyChTarget((j && j.ok && j.found && j.target) ? j.target : null); })
      .catch(() => applyChTarget(null));
    return;
  }
  applyChTarget(d);
}
function applyChTarget(target) {
  if (!target) { renderEgitim(); return; }
  const t = channelsData.traders[target.ch];
  if (!t) return;
  channelOpen = t.id;
  const meta = chSecMeta(t);
  chSec = (target.sec && meta.some(m => m.id === target.sec)) ? target.sec : (meta[0] && meta[0].id);
  chTopic = null; chVid = null;
  if (target.t && (chTopics(t) || []).some(x => x.id === target.t)) chTopic = target.t;
  const topic = chCurTopic(t);
  if (target.v && topic && (topic.videos || []).some(x => x.id === target.v)) chVid = target.v;
  chCloseForm(); chCloseProf();
  renderEgitim();
}
async function chTopicLink(t) {
  const topic = chCurTopic(t);
  const target = { ch: t.id, sec: chSec || null, t: (topic && topic.id) || null, v: chVid || null };
  const full = location.origin + location.pathname + '?page=egitim&ch=' + encodeURIComponent(target.ch)
    + (target.sec ? '&sec=' + encodeURIComponent(target.sec) : '')
    + (target.t ? '&t=' + encodeURIComponent(target.t) : '')
    + (target.v ? '&v=' + encodeURIComponent(target.v) : '');
  try {
    const r = await fetch('/api/edu-shared?kind=short', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    if (r.ok) {
      const j = await r.json();
      if (j && j.code) return { url: location.origin + location.pathname + '?go=' + j.code, full };
    }
  } catch (e) {}
  return { url: full, full };
}
function chShareTopic() {
  const t = chCurTrader(); if (!t) return;
  const topic = chCurTopic(t);
  const btn = document.getElementById('ch-share-topic');
  const flash = () => { if (btn) { const o = btn.textContent; btn.textContent = '✓ Bağlantı kopyalandı'; setTimeout(() => { btn.textContent = o; }, 1600); } };
  chTopicLink(t).then(link => {
    if (navigator.share) {
      navigator.share({ title: t.name, text: (topic && topic.title) ? (topic.title + ' — ' + t.name) : t.name, url: link.url }).then(flash).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link.url).then(flash, () => {});
    } else {
      try { window.prompt('Bağlantıyı kopyala:', link.url); } catch (e) {}
    }
  });
}
function chTopics(t) { const sec = chSec; return (t.sections && t.sections[sec]) || []; }
function chCurTopic(t) {
  const list = chTopics(t);
  if (!list.length) return null;
  let sel = list.find(x => x.id === chTopic);
  if (!sel) { sel = list[0]; chTopic = sel.id; }
  return sel;
}
function chCurVid(topic) {
  if (!topic || !topic.videos || !topic.videos.length) return null;
  let v = topic.videos.find(x => x.id === chVid);
  if (!v) { v = topic.videos[0]; chVid = v.id; }
  return v;
}
function chMoveTopic(t, topic, dir) {
  const arr = t.sections[chSec];
  if (!arr || !arr.length) return false;
  const i = arr.indexOf(topic), j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}

function renderChannelView() {
  const t = chCurTrader();
  const canEdit = chCanEditCur();
  if (!t) return;
  // header
  document.getElementById('ch-view-ava').innerHTML = chAvatarHtml(t);
  const nm = document.getElementById('ch-view-name');
  nm.innerHTML = esc(t.name || 'Trader') + ' <small>' + chSecMeta(t).length + ' bölüm · ' + chCount(t) + ' içerik</small>';
  if (chCanEdit(t)) nm.innerHTML += ' <span class="ch-badge-owner">' + (chIsAdmin() ? 'ADMIN' : 'KANALIN') + '</span>';
  document.getElementById('ch-view-bio').textContent = t.bio || 'Bu trader henüz bir tanıtım yazmadı.';
  const editProf = document.getElementById('ch-edit-prof');
  if (editProf) editProf.classList.toggle('hidden', !canEdit);
  // bölüm sekmeleri
  const seg = document.getElementById('ch-sec-seg');
  seg.innerHTML = '';
  chSecMeta(t).forEach(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pair-tab' + (s.id === chSec ? ' on-gold' : '');
    const lbl = document.createElement('span');
    lbl.textContent = s.title;
    lbl.addEventListener('click', () => { chSec = s.id; chTopic = null; chVid = null; renderChannelView(); });
    b.appendChild(lbl);
    if (canEdit) {
      const armed = chDelArmed === s.id;
      const x = document.createElement('span');
      x.className = 'pair-x' + (armed ? ' armed' : '');
      x.textContent = armed ? 'sil?' : '×';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', s.title + ' bölümünü sil');
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chDelArmed !== s.id) { chDelArmed = s.id; renderChannelView(); return; }
        chDelArmed = null;
        const meta = chSecMeta(t).filter(m => m.id !== s.id);
        if (!meta.length) return;
        if (!confirm('“' + s.title + '” bölümü ve içindeki tüm konular silinsin mi?')) return;
        t.secMeta = meta;
        delete t.sections[s.id];
        if (chSec === s.id) chSec = meta[0].id;
        chTopic = null; chVid = null;
        saveChannel(t); renderChannelView();
      });
      b.appendChild(x);
    }
    seg.appendChild(b);
  });
  if (canEdit) {
    const add = document.createElement('button');
    add.className = 'addp'; add.textContent = '+';
    add.setAttribute('aria-label', 'Yeni bölüm ekle');
    add.title = 'Yeni bölüm ekle';
    add.addEventListener('click', () => chOpenForm('sec-add', null, null));
    seg.appendChild(add);
  }
  // konular
  const addTopic = document.getElementById('ch-add-topic');
  if (addTopic) addTopic.classList.toggle('hidden', !canEdit);
  const topics = chTopics(t);
  const cur = chCurTopic(t);
  const listEl = document.getElementById('ch-topic-list');
  listEl.innerHTML = '';
  topics.forEach((topic, i) => {
    const row = document.createElement('div');
    row.className = 'eg-item' + (cur && topic.id === cur.id ? ' on' : '');
    row.style.cursor = 'pointer';
    if (canEdit) {
      const up = document.createElement('button'); up.className = 'eg-item-move'; up.type = 'button'; up.textContent = '▲'; up.title = 'Konuyu yukarı taşı';
      up.addEventListener('click', (e) => { e.stopPropagation(); if (chMoveTopic(t, topic, -1)) { saveChannel(t); renderChannelView(); } });
      row.appendChild(up);
      const dn = document.createElement('button'); dn.className = 'eg-item-move'; dn.type = 'button'; dn.textContent = '▼'; dn.title = 'Konuyu aşağı taşı';
      dn.addEventListener('click', (e) => { e.stopPropagation(); if (chMoveTopic(t, topic, 1)) { saveChannel(t); renderChannelView(); } });
      row.appendChild(dn);
    }
    const idx = document.createElement('span'); idx.className = 'eg-item-idx'; idx.textContent = (i + 1);
    row.appendChild(idx);
    const tt = document.createElement('span'); tt.className = 'eg-item-t'; tt.textContent = topic.title || '(başlıksız)';
    row.appendChild(tt);
    const cnt = document.createElement('span'); cnt.className = 'eg-count';
    const tVids = topic.videos || [];
    const tDone = tVids.filter(v => chIsDone(t, v)).length;
    cnt.textContent = tDone + '/' + tVids.length;
    cnt.title = 'Okunan/izlenen içerik sayısı';
    if (tVids.length && tDone === tVids.length) cnt.classList.add('done');
    row.appendChild(cnt);
    if (canEdit) {
      const edit = document.createElement('button'); edit.className = 'eg-item-edit'; edit.type = 'button'; edit.textContent = '✎'; edit.title = 'Konu adını düzenle';
      edit.addEventListener('click', (e) => { e.stopPropagation(); chOpenForm('topic-edit', { topicId: topic.id }, { title: topic.title }); });
      row.appendChild(edit);
      const del = document.createElement('button'); del.className = 'eg-item-del'; del.type = 'button'; del.textContent = '×'; del.title = 'Konuyu sil';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!confirm('“' + (topic.title || 'Bu konu') + '” ve içindeki videolar silinsin mi?')) return;
        t.sections[chSec] = t.sections[chSec].filter(x => x.id !== topic.id);
        if (chTopic === topic.id) chTopic = null;
        saveChannel(t); renderChannelView();
      });
      row.appendChild(del);
    }
    row.addEventListener('click', () => { if (chTopic === topic.id) return; chTopic = topic.id; chVid = null; renderChannelView(); });
    listEl.appendChild(row);
  });
  document.getElementById('ch-topic-empty').style.display = topics.length ? 'none' : '';
  // sağ: oynatıcı
  const wrap = document.getElementById('ch-player-wrap');
  const empty = document.getElementById('ch-player-empty');
  if (!cur) { wrap.style.display = 'none'; empty.style.display = 'block'; return; }
  wrap.style.display = 'block'; empty.style.display = 'none';
  const vids = cur.videos || [];
  const curVid = chCurVid(cur);
  const embed = document.getElementById('ch-embed');
  const noteBox = document.getElementById('ch-note-box');
  const foot = document.getElementById('ch-foot');
  const src = (curVid && curVid.url) ? egEmbedSrc(curVid) : '';
  const hasNote = !!(curVid && ((curVid.photos && curVid.photos.length) || (curVid.body && String(curVid.body).trim())));
  embed.innerHTML = '';
  if (src) {
    embed.className = 'eg-embed';
    embed.classList.remove('hidden');
    const ifr = document.createElement('iframe');
    ifr.src = src; ifr.title = (curVid.title || cur.title || 'video');
    ifr.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
    ifr.setAttribute('allowfullscreen', '');
    embed.appendChild(ifr);
  } else if (!hasNote) {
    embed.className = 'eg-embed';
    embed.classList.remove('hidden');
    const ph = document.createElement('div'); ph.className = 'eg-embed-ph';
    const txt = document.createElement('div'); txt.className = 'eg-ph-txt';
    txt.textContent = vids.length ? 'Bu içeriğe henüz bağlantı ya da not eklenmedi.' : 'Bu konuda henüz içerik yok.';
    ph.appendChild(txt);
    if (canEdit) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn solid';
      if (curVid) { btn.textContent = '＋ İçerik düzenle'; btn.addEventListener('click', () => chOpenForm('video-edit', { topicId: cur.id, vidId: curVid.id }, { title: curVid.title, url: curVid.url, type: curVid.type, body: curVid.body, photos: curVid.photos })); }
      else { btn.textContent = '＋ İçerik ekle'; btn.addEventListener('click', () => chOpenForm('video-add', { topicId: cur.id }, null)); }
      ph.appendChild(btn);
    }
    embed.appendChild(ph);
  } else {
    embed.classList.add('hidden');
  }
  // notlar: video oynatıcının altında (video yoksa tek başına, aynı genişlikte)
  noteBox.innerHTML = '';
  let boxShown = false;
  if (curVid && hasNote) {
    boxShown = true;
    const nv = chBuildNoteBox(curVid, cur.title);
    if (nv) noteBox.appendChild(nv);
  }
  if (curVid) {
    const used = chUsedVidSet(curVid);
    const extraHtml = chItemVids(curVid).map((u, i) => used.has(i) ? '' : chVideoEmbedHtml(u)).filter(Boolean).join('');
    if (extraHtml) {
      boxShown = true;
      const wrap = document.createElement('div'); wrap.className = 'ch-extra-vids';
      wrap.innerHTML = extraHtml;
      noteBox.appendChild(wrap);
    }
  }
  if (boxShown) noteBox.classList.remove('hidden'); else noteBox.classList.add('hidden');
  // okudum/izledim tik
  if (curVid) {
    foot.classList.remove('hidden');
    foot.innerHTML = '';
    const db = document.createElement('button'); db.type = 'button';
    db.className = 'eg-done-btn' + (chIsDone(t, curVid) ? ' on' : '');
    db.textContent = (chIsDone(t, curVid) ? '✓ ' : '') + (src ? 'İzledim' : 'Okudum');
    db.addEventListener('click', () => { chProgSet(t, curVid, !chIsDone(t, curVid)); renderChannelView(); });
    foot.appendChild(db);
  } else {
    foot.classList.add('hidden');
  }
  document.getElementById('ch-now-title').textContent = cur.title || '(başlıksız)';
  const link = document.getElementById('ch-now-link');
  if (curVid && src) { link.style.display = ''; link.href = egWatchHref(curVid); link.textContent = egKind(curVid) === 'playlist' ? "Oynatma listesini YouTube'da aç ↗" : "YouTube'da aç ↗"; }
  else if (curVid && curVid.url) { link.style.display = ''; link.href = curVid.url; link.textContent = 'Kaynağı aç ↗'; }
  else { link.style.display = 'none'; }
  const addVid = document.getElementById('ch-add-vid');
  if (addVid) addVid.classList.toggle('hidden', !canEdit);
  const vlist = document.getElementById('ch-vid-list');
  vlist.innerHTML = '';
  if (!vids.length) {
    const e = document.createElement('div'); e.className = 'eg-vid-empty'; e.textContent = 'Henüz içerik yok — “+ İçerik ekle” ile bağla.';
    vlist.appendChild(e);
  }
  vids.forEach((v, i) => {
    const vtype = (v.url && egEmbedSrc(v)) ? 'video' : 'not';
    const kind = egKind(v);
    const done = chIsDone(t, v);
    const row = document.createElement('div');
    row.className = 'eg-vid-row' + (curVid && v.id === curVid.id ? ' on' : '') + (done ? ' done' : '');
    row.style.cursor = 'pointer';
    const idx = document.createElement('span'); idx.className = 'eg-vid-idx'; idx.textContent = (i + 1);
    row.appendChild(idx);
    const tt = document.createElement('span'); tt.className = 'eg-vid-t'; tt.textContent = v.title || '(başlıksız)';
    row.appendChild(tt);
    if (vtype === 'not') { const tag = document.createElement('span'); tag.className = 'eg-item-tag'; tag.textContent = '📝 İçerik'; row.appendChild(tag); }
    else if (kind === 'playlist') { const tag = document.createElement('span'); tag.className = 'eg-item-tag'; tag.textContent = 'Liste'; row.appendChild(tag); }
    else if (kind === 'invalid') { const tag = document.createElement('span'); tag.className = 'eg-item-tag muted'; tag.textContent = 'Link yok'; row.appendChild(tag); }
    const chk = document.createElement('button'); chk.className = 'eg-check' + (done ? ' on' : ''); chk.type = 'button'; chk.textContent = '✓';
    chk.title = done ? (vtype === 'not' ? 'Okundu — geri al' : 'İzlendi — geri al') : (vtype === 'not' ? 'Okundu olarak işaretle' : 'İzlendi olarak işaretle');
    chk.addEventListener('click', (e) => { e.stopPropagation(); chProgSet(t, v, !chIsDone(t, v)); renderChannelView(); });
    row.appendChild(chk);
    if (canEdit) {
      const up = document.createElement('button'); up.className = 'eg-vid-move'; up.type = 'button'; up.textContent = '▲'; up.title = 'Yukarı taşı';
      up.addEventListener('click', (e) => { e.stopPropagation(); if (i === 0) return; [cur.videos[i - 1], cur.videos[i]] = [cur.videos[i], cur.videos[i - 1]]; saveChannel(t); renderChannelView(); });
      const dn = document.createElement('button'); dn.className = 'eg-vid-move'; dn.type = 'button'; dn.textContent = '▼'; dn.title = 'Aşağı taşı';
      dn.addEventListener('click', (e) => { e.stopPropagation(); if (i === vids.length - 1) return; [cur.videos[i], cur.videos[i + 1]] = [cur.videos[i + 1], cur.videos[i]]; saveChannel(t); renderChannelView(); });
      const edit = document.createElement('button'); edit.className = 'eg-vid-edit'; edit.type = 'button'; edit.textContent = '✎'; edit.title = 'İçeriği düzenle';
      edit.addEventListener('click', (e) => { e.stopPropagation(); chOpenForm('video-edit', { topicId: cur.id, vidId: v.id }, { title: v.title, url: v.url, type: v.type, body: v.body, photos: v.photos }); });
      const del = document.createElement('button'); del.className = 'eg-vid-del'; del.type = 'button'; del.textContent = '×'; del.title = 'İçeriği sil';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        cur.videos = cur.videos.filter(x => x.id !== v.id);
        if (chVid === v.id) chVid = null;
        saveChannel(t); renderChannelView();
      });
      row.appendChild(up); row.appendChild(dn); row.appendChild(edit); row.appendChild(del);
    }
    row.addEventListener('click', () => { if (chVid === v.id) return; chVid = v.id; renderChannelView(); });
    vlist.appendChild(row);
  });
}

function chBuildNoteBox(vid, fallbackTitle) {
  const photos = (vid && vid.photos && vid.photos.length) ? vid.photos : [];
  const body = (vid && vid.body) ? String(vid.body).trim() : '';
  if (!vid || (!photos.length && !body)) return null;
  const view = document.createElement('div'); view.className = 'ch-note-view';
  const ttl = document.createElement('div'); ttl.className = 'ch-note-title'; ttl.textContent = vid.title || fallbackTitle || 'İçerik';
  view.appendChild(ttl);
  const inBody = new Set();
  if (body) {
    const re = /\{\{foto:(\d+)\}\}|!\[[^\]]*\]\(([^)]+)\)/g;
    let mm; while ((mm = re.exec(body))) {
      if (mm[1]) { const ph = photos[Number(mm[1]) - 1]; if (ph) inBody.add(String(ph.url).trim()); }
      else inBody.add(String(mm[2]).trim());
    }
  }
  photos.forEach(p => {
    if (inBody.has(String(p.url || '').trim())) return;
    const fig = document.createElement('figure'); fig.className = 'ch-photo-item';
    const img = document.createElement('img');
    img.className = 'ch-photo'; img.src = p.url; img.alt = p.caption || vid.title || 'foto'; img.loading = 'lazy';
    img.addEventListener('error', () => { img.remove(); });
    img.addEventListener('click', () => chZoomPhoto(p.url, p.caption));
    fig.appendChild(img);
    if (p.caption) { const cap = document.createElement('figcaption'); cap.className = 'ch-photo-cap'; cap.textContent = p.caption; fig.appendChild(cap); }
    view.appendChild(fig);
  });
  if (body) {
    const art = document.createElement('div'); art.className = 'ch-article';
    art.innerHTML = chFormatBody(body, photos, chItemVids(vid));
    art.addEventListener('click', (e) => { const im = e.target.closest('.ch-photo'); if (im) chZoomPhoto(im.src, im.getAttribute('data-cap') || ''); });
    view.appendChild(art);
  }
  if (vid.url) {
    const a = document.createElement('a'); a.className = 'ch-src-link'; a.href = vid.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = 'Kaynağı aç ↗';
    view.appendChild(a);
  }
  return view;
}
function chInline(t) {
  t = esc(t);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|.)\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return t;
}
function chImgFigure(cap, url) {
  const c = esc(cap || '');
  return '<figure class="ch-photo-item"><img class="ch-photo" src="' + esc(url) + '" alt="' + c + '" loading="lazy" data-cap="' + c + '">'
    + (c ? '<figcaption class="ch-photo-cap">' + c + '</figcaption>' : '') + '</figure>';
}
function chFormatBody(text, photos, vids) {
  const lines = String(text || '').split(/\r?\n/);
  let html = '', ul = false, para = [];
  const IMG = /^(\{\{foto:(\d+)\}\}|!\[([^\]]*)\]\(([^)]+)\))$/;
  const VID = /^\{\{video:([^{}]+)\}\}$/;
  const flushPara = () => {
    if (!para.length) return;
    const parts = para.join('\n').split(/(\{\{foto:\d+\}\}|\{\{video:[^{}]+\}\}|!\[[^\]]*\]\([^)]+\))/);
    let seg = [];
    parts.forEach(p => {
      const vm = p.match(VID);
      if (vm) {
        if (seg.length) { html += '<p>' + seg.map(chInline).join('<br>') + '</p>'; seg = []; }
        const ref = vm[1].trim();
        if (/^\d+$/.test(ref)) {
          const vu = (vids || [])[Number(ref) - 1];
          if (vu) html += chVideoEmbedHtml(vu);
        } else {
          html += chVideoEmbedHtml(ref);
        }
        return;
      }
      const m = p.match(IMG);
      if (m) {
        if (seg.length) { html += '<p>' + seg.map(chInline).join('<br>') + '</p>'; seg = []; }
        if (m[2]) {
          const ph = (photos || [])[Number(m[2]) - 1];
          if (ph && ph.url) html += chImgFigure(ph.caption, ph.url);
        } else {
          html += chImgFigure(m[3], m[4].trim());
        }
      } else if (p) {
        seg.push(p);
      }
    });
    if (seg.length) html += '<p>' + seg.map(chInline).join('<br>') + '</p>';
    para = [];
  };
  const flushUl = () => { if (ul) { html += '</ul>'; ul = false; } };
  for (let raw of lines) {
    const ln = raw.trim();
    if (!ln) { flushPara(); flushUl(); continue; }
    if (ln.startsWith('### ')) { flushPara(); flushUl(); html += '<h4>' + chInline(ln.slice(4)) + '</h4>'; continue; }
    if (ln.startsWith('## ')) { flushPara(); flushUl(); html += '<h3>' + chInline(ln.slice(3)) + '</h3>'; continue; }
    if (ln.startsWith('# ')) { flushPara(); flushUl(); html += '<h2>' + chInline(ln.slice(2)) + '</h2>'; continue; }
    if (ln.startsWith('- ') || ln.startsWith('* ')) {
      flushPara();
      if (!ul) { html += '<ul>'; ul = true; }
      html += '<li>' + chInline(ln.replace(/^[-*]\s*/, '')) + '</li>';
      continue;
    }
    flushUl();
    para.push(ln);
  }
  flushPara(); flushUl();
  return html || '<p>—</p>';
}

// ---- Not formu: fotoğraf düzenleyici (URL / Ctrl+V / PC'den yükle) ----
function chPhotoRow(photo) {
  const row = document.createElement('div');
  row.className = 'ch-prow';
  const prev = document.createElement('img'); prev.className = 'ch-pprev'; prev.alt = 'önizleme'; prev.hidden = true;
  const urlIn = document.createElement('input'); urlIn.type = 'text'; urlIn.className = 'ch-purl'; urlIn.placeholder = 'Görsel bağlantısı (URL) — veya Ctrl+V yapıştır'; urlIn.maxLength = 500000;
  const fileBtn = document.createElement('button'); fileBtn.type = 'button'; fileBtn.className = 'ch-pfile'; fileBtn.textContent = '📁 PC\u2019den';
  const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = 'image/*'; fileIn.style.display = 'none';
  const capIn = document.createElement('input'); capIn.type = 'text'; capIn.className = 'ch-pcap'; capIn.placeholder = 'Fotoğrafın altına yazılacak metin'; capIn.maxLength = 500;
  const ins = document.createElement('button'); ins.type = 'button'; ins.className = 'ch-pins'; ins.textContent = '↪'; ins.title = 'Fotoğrafı yazının içine koy (imleç konumuna)';
  const del = document.createElement('button'); del.type = 'button'; del.className = 'ch-pdel'; del.textContent = '×'; del.title = 'Bu fotoğrafı kaldır';
  if (photo && photo.url) urlIn.value = photo.url;
  if (photo && photo.caption) capIn.value = photo.caption;
  chPhotoPreview(urlIn, prev);
  ins.addEventListener('click', () => {
    const ta = document.getElementById('ch-in-body');
    if (!ta) return;
    if (!urlIn.value.trim()) { urlIn.focus(); return; }
    const s = ta.selectionStart, e2 = ta.selectionEnd;
    const idx = (Array.prototype.indexOf.call(row.parentNode ? row.parentNode.children : [], row) || 0) + 1;
    ta.setRangeText('\n{{foto:' + idx + '}}\n', s, e2, 'end');
    ta.focus();
  });
  del.addEventListener('click', () => row.remove());
  fileBtn.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0];
    if (f) chFileToDataUrl(f, du => { urlIn.value = du; chPhotoPreview(urlIn, prev); });
    fileIn.value = '';
  });
  urlIn.addEventListener('paste', (e) => {
    const items = (e.clipboardData || {}).items || [];
    for (const it of items) {
      if (it.type && it.type.indexOf('image') === 0) {
        e.preventDefault();
        const f = it.getAsFile();
        if (f) chFileToDataUrl(f, du => { urlIn.value = du; chPhotoPreview(urlIn, prev); });
        return;
      }
    }
  });
  urlIn.addEventListener('input', () => chPhotoPreview(urlIn, prev));
  row.appendChild(prev);
  row.appendChild(urlIn);
  row.appendChild(fileBtn);
  row.appendChild(fileIn);
  row.appendChild(capIn);
  row.appendChild(ins);
  row.appendChild(del);
  return row;
}
function chPhotoPreview(urlIn, prev) {
  const v = urlIn.value.trim();
  if (v) { prev.onerror = () => { prev.hidden = true; }; prev.src = v; prev.hidden = false; }
  else prev.hidden = true;
}
function chFileToDataUrl(file, cb) {
  const rd = new FileReader();
  rd.onload = () => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1400;
      let w = img.width, h = img.height;
      const sc = Math.min(1, MAX / Math.max(w, h));
      if (sc < 1) { w = Math.round(w * sc); h = Math.round(h * sc); }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      const mime = (file.type && file.type.indexOf('png') !== -1) ? 'image/png' : 'image/jpeg';
      cb(cv.toDataURL(mime, 0.82));
    };
    img.onerror = () => { try { cb(rd.result); } catch (e) {} };
    img.src = rd.result;
  };
  rd.onerror = () => {};
  rd.readAsDataURL(file);
}
function chCollectPhotos() {
  const out = [];
  document.querySelectorAll('#ch-photo-ed .ch-prow').forEach(row => {
    const u = (row.querySelector('.ch-purl').value || '').trim();
    const c = (row.querySelector('.ch-pcap').value || '').trim();
    if (u) out.push({ url: u, caption: c });
  });
  return out;
}
function chVideoRow(url) {
  const row = document.createElement('div');
  row.className = 'ch-vrow';
  const urlIn = document.createElement('input'); urlIn.type = 'text'; urlIn.className = 'ch-vurl'; urlIn.placeholder = 'YouTube video ya da oynatma listesi bağlantısı'; urlIn.maxLength = 500;
  if (url) urlIn.value = url;
  const ins = document.createElement('button'); ins.type = 'button'; ins.className = 'ch-pins'; ins.textContent = '↪'; ins.title = 'Videoyu yazının içine koy (imleç konumuna)';
  ins.addEventListener('click', () => {
    const ta = document.getElementById('ch-in-body');
    if (!ta) return;
    if (!urlIn.value.trim()) { urlIn.focus(); return; }
    const s = ta.selectionStart, e2 = ta.selectionEnd;
    const idx = (Array.prototype.indexOf.call(row.parentNode ? row.parentNode.children : [], row) || 0) + 1;
    ta.setRangeText('\n{{video:' + idx + '}}\n', s, e2, 'end');
    ta.focus();
  });
  const del = document.createElement('button'); del.type = 'button'; del.className = 'ch-pdel'; del.textContent = '×'; del.title = 'Bu videoyu kaldır';
  del.addEventListener('click', () => row.remove());
  row.appendChild(urlIn); row.appendChild(ins); row.appendChild(del);
  return row;
}
function chCollectVideos() {
  const out = [];
  document.querySelectorAll('#ch-video-ed .ch-vrow').forEach(row => {
    const u = (row.querySelector('.ch-vurl').value || '').trim();
    if (u) out.push({ url: u });
  });
  return out;
}
function chItemVids(v) {
  if (!v || !Array.isArray(v.vids) || !v.vids.length) return [];
  const out = [];
  v.vids.forEach(x => { const u = (typeof x === 'string' ? x : (x && x.url)) || ''; if (u) out.push(String(u).trim()); });
  return out;
}
function chUsedVidSet(v) {
  const used = new Set();
  const body = (v && v.body) ? String(v.body) : '';
  const re = /\{\{video:(\d+)\}\}/g;
  let mm; while ((mm = re.exec(body))) used.add(Number(mm[1]) - 1);
  return used;
}
function chVideoEmbedHtml(url) {
  const src = egEmbedSrc({ url: String(url || '') });
  if (!src) return '';
  return '<div class="ch-video-item"><iframe src="' + esc(src) + '" title="video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen="" loading="lazy"></iframe></div>';
}
function chZoomPhoto(src, cap) {
  const old = document.getElementById('ch-zoom');
  if (old) old.remove();
  const ov = document.createElement('div'); ov.id = 'ch-zoom'; ov.className = 'ch-zoom';
  const img = document.createElement('img'); img.src = src; img.alt = cap || '';
  ov.appendChild(img);
  if (cap) { const c = document.createElement('div'); c.className = 'ch-zoom-cap'; c.textContent = cap; ov.appendChild(c); }
  ov.addEventListener('click', () => ov.remove());
  document.addEventListener('keydown', function chZoomEsc(e) { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', chZoomEsc); } });
  document.body.appendChild(ov);
}

function chOpenForm(mode, ids, prefill) {
  if (!chCanEditCur()) return;
  const g = id => document.getElementById(id);
  const isVideo = (mode === 'video-add' || mode === 'video-edit');
  const isSec = (mode === 'sec-add');
  chForm = { mode: mode, topicId: (ids && ids.topicId) || null, vidId: (ids && ids.vidId) || null, ctype: 'not' };
  g('ch-in-title').value = (prefill && prefill.title) || '';
  g('ch-in-body').value = (prefill && prefill.body) || '';
  g('ch-in-url').value = (prefill && prefill.url) || '';
  const photoEd = g('ch-photo-ed');
  const prePhotos = (prefill && prefill.photos && prefill.photos.length) ? prefill.photos
    : ((prefill && prefill.type === 'foto' && prefill.url) ? [{ url: prefill.url, caption: '' }] : []);
  if (photoEd) {
    photoEd.innerHTML = '';
    prePhotos.forEach(p => photoEd.appendChild(chPhotoRow(p)));
  }
  const videoEd = g('ch-video-ed');
  if (videoEd) {
    videoEd.innerHTML = '';
    chItemVids(prefill || {}).forEach(u => videoEd.appendChild(chVideoRow(u)));
  }
  g('ch-in-err').textContent = '';
  const titles = { 'topic-add': 'Yeni konu', 'topic-edit': 'Konu adını düzenle', 'video-add': 'Yeni içerik', 'video-edit': 'İçeriği düzenle', 'sec-add': 'Yeni bölüm' };
  g('ch-form-title').textContent = titles[mode] || 'Düzenle';
  g('ch-in-title').setAttribute('placeholder', isVideo ? 'Başlık (ör. Market Yapısı -1)' : isSec ? 'Bölüm başlığı (ör. Onchain Analizi)' : 'Konu başlığı (ör. Market Yapısı)');
  g('ch-form').classList.remove('hidden');
  g('ch-in-title').focus();
}
function chCloseForm() { chForm = { mode: null, topicId: null, vidId: null, ctype: 'video' }; const f = document.getElementById('ch-form'); if (f) f.classList.add('hidden'); }
function chCloseProf() { chProfMode = null; chProfTarget = null; const f = document.getElementById('ch-prof-form'); if (f) f.classList.add('hidden'); }

async function chSaveForm() {
  const g = id => document.getElementById(id);
  const t = chCurTrader();
  if (!t || !chCanEditCur()) { chCloseForm(); return; }
  const title = g('ch-in-title').value.trim();
  const url = g('ch-in-url').value.trim();
  const body = g('ch-in-body').value.trim();
  const mode = chForm.mode;
  const isVideo = (mode === 'video-add' || mode === 'video-edit');
  const hasVideoLink = !!(url && (ytId(url) || ytListId(url)));
  const ctype = hasVideoLink ? 'video' : 'not';
  const photos = isVideo ? chCollectPhotos() : [];
  if (isVideo && url && !hasVideoLink && /youtube\.com|youtu\.be/i.test(url)) {
    g('ch-in-err').textContent = 'Geçerli bir YouTube video ya da oynatma listesi bağlantısı gir (ya da boş bırak).';
    return;
  }
  if (mode === 'sec-add') {
    const id = chUid();
    t.secMeta = chSecMeta(t).concat([{ id, title: title || 'Yeni Bölüm' }]);
    if (!t.sections) t.sections = {};
    if (!t.sections[id]) t.sections[id] = [];
    chSec = id; chTopic = null; chVid = null;
  } else if (mode === 'topic-add') {
    const id = chUid();
    if (!t.sections) t.sections = {};
    if (!t.sections[chSec]) t.sections[chSec] = [];
    t.sections[chSec].push({ id, title: title || 'Konu', videos: [] });
    chTopic = id;
  } else if (mode === 'topic-edit') {
    const x = (t.sections[chSec] || []).find(k => k.id === chForm.topicId);
    if (x) x.title = title || x.title || 'Konu';
  } else if (mode === 'video-add') {
    const x = (t.sections[chSec] || []).find(k => k.id === chForm.topicId);
    if (x) {
      const defTitle = hasVideoLink ? ((ytListId(url) && !ytId(url)) ? 'Oynatma listesi' : 'Video') : 'İçerik';
      const v = { id: chUid(), title: title || defTitle, url, type: ctype, body, photos, vids: chCollectVideos() };
      if (!x.videos) x.videos = [];
      x.videos.push(v);
      chTopic = x.id; chVid = v.id;
    }
  } else if (mode === 'video-edit') {
    const x = (t.sections[chSec] || []).find(k => k.id === chForm.topicId);
    const v = x && x.videos && x.videos.find(k => k.id === chForm.vidId);
    if (v) { v.title = title || v.title || 'Video'; v.url = url; v.type = ctype; v.body = body; v.photos = photos; v.vids = chCollectVideos(); chVid = v.id; }
  }
  chCloseForm();
  await saveChannel(t);
  renderChannelView();
}

function chOpenNew() {
  if (!chIsAdmin()) return;
  chProfMode = 'new'; chProfTarget = null;
  const g = id => document.getElementById(id);
  g('ch-prof-name').value = '';
  g('ch-prof-bio').value = '';
  g('ch-prof-editors').value = '';
  g('ch-prof-err').textContent = '';
  const del = g('ch-prof-del');
  if (del) del.classList.add('hidden');
  const ed = g('ch-prof-editors');
  if (ed) ed.style.display = '';
  g('ch-prof-title').textContent = 'Yeni Kanal';
  g('ch-prof-form').classList.remove('hidden');
  g('ch-prof-name').focus();
}
function chOpenProf(traderId) {
  const t = traderId ? channelsData.traders[traderId] : chCurTrader();
  if (!t || !chCanEdit(t)) return;
  chProfMode = 'edit'; chProfTarget = t.id;
  const g = id => document.getElementById(id);
  g('ch-prof-name').value = t.name || '';
  g('ch-prof-bio').value = t.bio || '';
  g('ch-prof-editors').value = (t.editors || []).join(', ');
  g('ch-prof-err').textContent = '';
  const del = g('ch-prof-del');
  if (del) del.classList.toggle('hidden', !chIsAdmin());
  const ed = g('ch-prof-editors');
  if (ed) ed.style.display = chIsAdmin() ? '' : 'none';
  g('ch-prof-title').textContent = 'Kanal Profili';
  g('ch-prof-form').classList.remove('hidden');
  g('ch-prof-name').focus();
}
async function chSaveProf() {
  const g = id => document.getElementById(id);
  const name = g('ch-prof-name').value.trim();
  const bio = g('ch-prof-bio').value.trim();
  if (!name) { g('ch-prof-err').textContent = 'Kanal adı boş olamaz.'; return; }
  const editors = (g('ch-prof-editors').value || '')
    .split(/[,;\n]+/).map(e => e.trim().toLowerCase()).filter(Boolean).slice(0, 20);
  if (chProfMode === 'new') {
    if (!chIsAdmin()) { g('ch-prof-err').textContent = 'Yeni kanal sadece admin açabilir.'; return; }
    var t = { id: chUid(), name, bio, editors, createdAt: Date.now(), sections: {}, secMeta: null };
  } else {
    var t = chProfTarget ? channelsData.traders[chProfTarget] : chCurTrader();
    if (!t || !chCanEdit(t)) { chCloseProf(); return; }
    t.name = name; t.bio = bio;
    if (chIsAdmin()) t.editors = editors;
  }
  chCloseProf();
  await saveChannel(t);
  openChannel(t.id);
  renderEduChannels();
}
async function chDelProf() {
  if (!chIsAdmin()) return;
  const t = chProfTarget ? channelsData.traders[chProfTarget] : chCurTrader();
  if (!t) return;
  if (!confirm('“' + t.name + '” kanalı silinsin mi? Tüm konu ve içerikler kaldırılır.')) return;
  chCloseProf();
  await deleteChannel(t.id);
}

function bindChannelsPage() {
  const g = id => document.getElementById(id);
  const addBtn = g('eg-ch-add');
  if (addBtn) addBtn.addEventListener('click', chOpenNew);
  const back = g('ch-back');
  if (back) back.addEventListener('click', closeChannel);
  const editProf = g('ch-edit-prof');
  if (editProf) editProf.addEventListener('click', () => chOpenProf(null));
  const addTopic = g('ch-add-topic');
  if (addTopic) addTopic.addEventListener('click', () => { if (chCanEditCur()) chOpenForm('topic-add', null, null); });
  const addVid = g('ch-add-vid');
  if (addVid) addVid.addEventListener('click', () => {
    if (!chCanEditCur()) return;
    const t = chCurTrader(); const cur = t && chCurTopic(t);
    if (!cur) { alert('Önce soldan bir konu seç.'); return; }
    chOpenForm('video-add', { topicId: cur.id }, null);
  });
  const addPhoto = g('ch-add-photo');
  if (addPhoto) addPhoto.addEventListener('click', () => {
    const ed = g('ch-photo-ed');
    if (ed) { ed.appendChild(chPhotoRow(null)); ed.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
  const addVideo = g('ch-add-video');
  if (addVideo) addVideo.addEventListener('click', () => {
    const ed = g('ch-video-ed');
    if (ed) { ed.appendChild(chVideoRow(null)); ed.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });
  const bodyTool = g('ch-body-tool');
  if (bodyTool) bodyTool.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const ta = g('ch-in-body'); if (!ta) return;
    const mode = b.getAttribute('data-wrap');
    const isLink = b.hasAttribute('data-link');
    const isImg = b.hasAttribute('data-img');
    const isVid = b.hasAttribute('data-vid');
    const s = ta.selectionStart, e2 = ta.selectionEnd;
    const sel = ta.value.slice(s, e2);
    if (isVid) {
      const pv = g('ch-video-ed');
      const first = pv ? (pv.querySelector('.ch-vurl') || {}).value || '' : '';
      const url = window.prompt('Video bağlantısı (YouTube):', first || 'https://');
      if (!url) return;
      const vidUrl = url.trim();
      let idx = 0;
      if (pv) {
        let rows = pv.querySelectorAll('.ch-vrow');
        if (!rows.length) { pv.appendChild(chVideoRow(vidUrl)); rows = pv.querySelectorAll('.ch-vrow'); }
        let vi = -1; rows.forEach((r, i) => { if ((r.querySelector('.ch-vurl').value || '').trim() === vidUrl) vi = i; });
        if (vi === -1) { pv.appendChild(chVideoRow(vidUrl)); rows = pv.querySelectorAll('.ch-vrow'); vi = rows.length - 1; }
        idx = vi + 1;
      }
      ta.setRangeText('\n{{video:' + idx + '}}\n', s, e2, 'end');
    } else if (isImg) {
      const pv = g('ch-photo-ed');
      const first = pv ? (pv.querySelector('.ch-purl') || {}).value || '' : '';
      const url = window.prompt('Fotoğraf bağlantısı (URL):', first || 'https://');
      if (!url) return;
      const cap = window.prompt('Fotoğrafın altına yazılacak metin:', '') || '';
      ta.setRangeText('\n![ ' + cap + '](' + url.trim() + ')\n', s, e2, 'end');
    } else if (isLink) {
      const url = window.prompt('Bağlantı adresi (URL):', 'https://');
      if (!url) return;
      const label = sel || url;
      ta.setRangeText('[' + label + '](' + url + ')', s, e2, 'end');
    } else if (mode === '#' || mode === '-') {
      let st = s; while (st > 0 && ta.value[st - 1] !== '\n') st--;
      const line = ta.value.slice(st, e2);
      const marker = mode === '#' ? '### ' : '- ';
      const nl = (st > 0 ? '\n' : '') + marker + line;
      ta.setRangeText(nl, st, e2, 'end');
    } else {
      const wrap = mode || '**';
      ta.setRangeText(wrap + (sel || 'metin') + wrap, s, e2, 'end');
    }
    ta.focus();
  });
  const shareTopic = g('ch-share-topic');
  if (shareTopic) shareTopic.addEventListener('click', chShareTopic);
  const inCancel = g('ch-in-cancel');
  if (inCancel) inCancel.addEventListener('click', chCloseForm);
  const inSave = g('ch-in-save');
  if (inSave) inSave.addEventListener('click', chSaveForm);
  const inTitle = g('ch-in-title');
  if (inTitle) inTitle.addEventListener('keydown', e => { if (e.key === 'Enter' && g('ch-in-url').style.display === 'none') chSaveForm(); });
  const inUrl = g('ch-in-url');
  if (inUrl) inUrl.addEventListener('keydown', e => { if (e.key === 'Enter') chSaveForm(); });
  const profCancel = g('ch-prof-cancel');
  if (profCancel) profCancel.addEventListener('click', chCloseProf);
  const profSave = g('ch-prof-save');
  if (profSave) profSave.addEventListener('click', chSaveProf);
  const profDel = g('ch-prof-del');
  if (profDel) profDel.addEventListener('click', chDelProf);
  const profName = g('ch-prof-name');
  if (profName) profName.addEventListener('keydown', e => { if (e.key === 'Enter') chSaveProf(); });
}

function panoRoomId() {
  const el = document.getElementById('pano-room');
  const r = (el ? el.value : 'alfa').trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return r || 'alfa';
}

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
    if (st) { st.textContent = (d && d.ok) ? 'kaydedildi ✓' : 'yerel kaydedildi'; st.classList.add('show'); }
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

  // sürüklenebilir araç çubuğu (TradingView tarzı)
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

  // araç çubuğu
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

  // ekstra araçlar
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

  // metin editörü
  const editor = document.createElement('div');
  editor.className = 'pano-editor';
  editor.contentEditable = true;
  editor.style.display = 'none';
  editor.addEventListener('mousedown', e => e.stopPropagation());
  c.parentElement.appendChild(editor);
  window.panoEditor = editor;

  // klavye kısayolları
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

  // görsel yapıştır (Ctrl+V clipboard görseli) ve sürükle-bırak
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

  // pointer olayları
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
    // şekiller
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
      // küçük şekil ise yine de bırak
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

function bindStrategiesPage() {
  const g = id => document.getElementById(id);
  g('strat-add').addEventListener('click', () => stratOpenForm(null));
  const distBtn = document.getElementById('strat-distribute-all');
  if (distBtn) distBtn.addEventListener('click', stratDistributeAll);
  const anBtn = document.getElementById('strat-analiz-btn');
  if (anBtn) anBtn.addEventListener('click', () => showPage('analiz'));
  g('strat-list').addEventListener('click', e => {
    const open = e.target.closest('[data-strat-open]');
    const ed = e.target.closest('[data-strat-edit]');
    const st = e.target.closest('[data-strat-status]');
    const del = e.target.closest('[data-strat-del]');
    if (open) { stratCurId = open.getAttribute('data-strat-open'); stratMode = 'detail'; renderStrategies(); }
    else if (ed) stratOpenForm(ed.getAttribute('data-strat-edit'));
    else if (st) stratCycleStatus(st.getAttribute('data-strat-status'));
    else if (del) { if (confirm('Bu stratejiyi kalıcı olarak sil?')) stratDelete(del.getAttribute('data-strat-del')); }
  });
  const dersEl = document.getElementById('strat-ders');
  if (dersEl) {
    dersEl.addEventListener('click', e => {
      const open = e.target.closest('[data-ders-open]');
      if (!open) return;
      stratCurId = open.getAttribute('data-ders-open');
      stratMode = 'detail';
      stratEditId = null;
      stratFormOpen = false;
      stratPendingImg = null;
      renderStrategies();
      const detEl = document.getElementById('strat-detail');
      if (detEl) detEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  const sdEl = document.getElementById('strat-detail');
  if (sdEl) {
    sdEl.addEventListener('click', e => {
      const back = e.target.closest('[data-sd-back]');
      const edit = e.target.closest('[data-sd-edit]');
      const st = e.target.closest('[data-sd-status]');
      const del = e.target.closest('[data-sd-del]');
      const ruleAdd = e.target.closest('[data-rule-add]');
      const ruleDel = e.target.closest('[data-rule-del]');
      const confAdd = e.target.closest('[data-conf-add]');
      const confDel = e.target.closest('[data-conf-del]');
      const trAdd = e.target.closest('[data-tr-add]');
      const trDel = e.target.closest('[data-tr-del]');
      const trTab = e.target.closest('[data-tr-tab]');
      const impJ = e.target.closest('[data-sd-import]');
      const impN = e.target.closest('[data-sd-import-notion]');
      const imgAdd = e.target.closest('[data-img-add]');
      const imgClr = e.target.closest('[data-img-clear]');
      const imgEl = e.target.closest('[data-sd-img]');
      const eSrc = e.target.closest('[data-edu-src-save]');
      const eLrn = e.target.closest('[data-edu-learned-save]');
      const eLinkAdd = e.target.closest('[data-edu-link-add]');
      const eLinkDel = e.target.closest('[data-edu-link-del]');
      const eVidAdd = e.target.closest('[data-edu-vid-add]');
      const eVidDel = e.target.closest('[data-edu-vid-del]');
      const eTopic = e.target.closest('[data-edu-topic-save]');
      const eTopicApply = e.target.closest('[data-edu-topic-apply]');
      const id = stratCurId;
      if (back) { stratMode = 'list'; stratCurId = null; stratEditId = null; stratFormOpen = false; stratPendingImg = null; renderStrategies(); }
      else if (edit) stratOpenForm(id);
      else if (st) stratCycleStatus(id);
      else if (del) { if (confirm('Bu stratejiyi kalıcı olarak sil?')) stratDelete(id); }
      else if (ruleAdd) stratAddRule(id);
      else if (ruleDel) stratDelRule(id, ruleDel.getAttribute('data-rule-del'));
      else if (confAdd) stratAddConf(id);
      else if (confDel) stratDelConf(id, confDel.getAttribute('data-conf-del'));
      else if (trTab) stratSetTradeTab(trTab.getAttribute('data-tr-tab'));
      else if (trAdd) stratAddTrade(id, trAdd.getAttribute('data-tr-add'));
      else if (trDel) stratDelTrade(id, trDel.getAttribute('data-tr-del'), trDel.getAttribute('data-tr-id'));
      else if (imgAdd) stratPickImgFile();
      else if (imgClr) stratClearPendingImg();
      else if (imgEl) { e.preventDefault(); stratShowImg(imgEl.src); }
      else if (eSrc) stratSaveEduSrc(id);
      else if (eLrn) stratSaveEduLearned(id);
      else if (eLinkAdd) stratAddEduLink(id);
      else if (eLinkDel) stratDelEduLink(id, eLinkDel.getAttribute('data-edu-link-del'));
      else if (eVidAdd) stratAddEduVideo(id);
      else if (eVidDel) stratDelEduVideo(id, eVidDel.getAttribute('data-edu-vid-del'));
      else if (eTopic) stratSaveEduTopic(id);
      else if (eTopicApply) stratApplyEduTopic(id);
      else if (impJ) stratImportFrom(id, 'journal');
      else if (impN) stratImportFromNotion(id);
    });
    sdEl.addEventListener('change', e => {
      const c = e.target.closest('[data-conf]');
      if (c) stratToggleConf(stratCurId, c.getAttribute('data-conf'));
      const f = e.target.closest('#sd-tr-file');
      if (f) stratHandleImgFile();
    });
    document.addEventListener('paste', ev => {
      if (stratMode !== 'detail' || !stratCurId) return;
      const items = ev.clipboardData && ev.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) {
          const f = items[i].getAsFile();
          if (f) { ev.preventDefault(); stratResizeImg(f, src => { stratPendingImg = src; renderStrategies(); }); }
          break;
        }
      }
    });
  }
  g('sf-save').addEventListener('click', stratSaveForm);
  g('sf-cancel').addEventListener('click', () => { stratEditId = null; stratFormOpen = false; stratRenderList(); });
  g('sf-name').addEventListener('keydown', e => { if (e.key === 'Enter') stratSaveForm(); });
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
  // Seviye seçici tıklama (form içinde)
  document.querySelectorAll('#eg-level-picker [data-lv]').forEach(b => {
    b.addEventListener('click', () => {
      b.parentElement.querySelectorAll('[data-lv]').forEach(x => x.classList.toggle('on-gold', x === b));
    });
  });
  // İzledim / bitirdim işareti (mevcut video)
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
  // konu adı düzenle (oynatıcı üstündeki kalem)
  g('eg-topic-edit').addEventListener('click', () => { const t = egCurTopic(); if (t) egOpenForm('topic-edit', { topicId: t.id }, { title: t.title, level: t.level }); });
  // video ekle (oynatıcı içindeki buton)
  g('eg-add-vid').addEventListener('click', () => { const t = egCurTopic(); if (t) egOpenForm('video-add', { topicId: t.id }, null); });
  // form kaydet
  g('eg-in-cancel').addEventListener('click', () => egCloseForm());
  g('eg-in-save').addEventListener('click', async () => {
    if (!magIsAdmin()) { egCloseForm(); return; }
    const title = g('eg-in-title').value.trim();
    const url = g('eg-in-url').value.trim();
    const mode = egForm.mode;
    const isVideo = (mode === 'video-add' || mode === 'video-edit');
    if (isVideo && url && !ytId(url) && !ytListId(url)) {
      g('eg-in-err').textContent = 'Geçerli bir YouTube video ya da oynatma listesi bağlantısı gir (ya da boş bırak).';
      return;
    }
    const secList = egitimData.sections[egSec];
    // Seviye seçici (teknik bölümü)
    let pickedLevel = 'temel';
    const lvBtn = document.querySelector('#eg-level-picker [data-lv].on-gold');
    if (lvBtn) pickedLevel = lvBtn.getAttribute('data-lv');
    if (mode === 'sec-add') {
      const meta = egSecMeta();
      const id = rid();
      egitimData.secMeta = meta.concat([{ id, title: title || 'Yeni Bölüm' }]);
      if (!egitimData.sections[id]) egitimData.sections[id] = [];
      egSec = id; egLevel = 'temel'; egPendingDelSec = null;
    } else if (mode === 'topic-add') {
      const t = { id: rid(), title: title || 'Konu', note: '', videos: [], level: (egSec === 'teknik' ? pickedLevel : 'temel') };
      secList.push(t); egitimData.sel[egSec] = t.id;
    } else if (mode === 'topic-edit') {
      const t = secList.find(x => x.id === egForm.topicId); if (t) { t.title = title || t.title || 'Konu'; if (egSec === 'teknik') t.level = pickedLevel; }
    } else if (mode === 'video-add') {
      const t = secList.find(x => x.id === egForm.topicId);
      if (t) { const v = { id: rid(), title: title || (ytListId(url) && !ytId(url) ? 'Oynatma listesi' : 'Video'), url: url }; t.videos.push(v); egitimData.selVid[t.id] = v.id; egitimData.sel[egSec] = t.id; }
    } else if (mode === 'video-edit') {
      const t = secList.find(x => x.id === egForm.topicId);
      const v = t && t.videos.find(x => x.id === egForm.vidId);
      if (v) { v.title = title || v.title || 'Video'; v.url = url; egitimData.selVid[t.id] = v.id; }
    }
    await saveEgitim(); egCloseForm(); renderEgitim();
  });
  g('eg-in-url').addEventListener('keydown', e => { if (e.key === 'Enter') g('eg-in-save').click(); });
  g('eg-in-title').addEventListener('keydown', e => { if (e.key === 'Enter' && g('eg-in-url').style.display === 'none') g('eg-in-save').click(); });
  // not — yazdıkça konuya kaydet (debounce)
  g('eg-notes').addEventListener('input', e => {
    const t = egCurTopic(); if (!t) return;
    t.note = e.target.value;
    clearTimeout(egSaveTimer);
    egSaveTimer = setTimeout(async () => { await saveEgitim(); egFlashSaved(); }, 600);
  });
  // not alanından ayrılınca hemen kaydet (sayfa kapanmadan önce kaçmasın)
  g('eg-notes').addEventListener('blur', () => {
    clearTimeout(egSaveTimer);
    saveEgitim().then(() => egFlashSaved()).catch(() => {});
  });
}

// ============ İndikatörler ============
const INDICATORS = [
  {
    id: 'aggr-workspace',
    name: 'Aggr Trade — BTC CVD + Spot/Perp Delta + CB Premium',
    tagline: 'aggr.trade için hazır workspace — BTC spot CVD, aggregate perp delta, Coinbase Premium ve daha fazlası tek ekranda.',
    sections: [
      { type: 'html', content: '<p><strong>Aggr Trade</strong> — gerçek zamanlı CVD, delta ve premium verilerini tek workspace\'te toplayan ücretsiz bir platform. Aşağıdaki dosyayı indirip aggr.trade\'e yükleyerek kullanabilirsiniz.</p>' },
      { type: 'html', content: '<h3>📥 Workspace\'i İndir</h3><p><a href="/workspace-btc-cvd.json" download style="display:inline-block;background:var(--pc);color:#fff;padding:10px 20px;border-radius:10px;font-weight:600;text-decoration:none;">📥 BTC Workspace JSON\'u İndir</a></p>' },
      { type: 'html', content: '<h3>📖 Kullanım</h3><ol><li><a href="https://aggr.trade" target="_blank" rel="noopener noreferrer">aggr.trade</a> sitesine gidin</li><li>Sağ üstteki menüden <strong>Workspace → Import</strong> seçeneğine tıklayın</li><li>İndirdiğiniz JSON dosyasını seçin</li><li>Workspace otomatik yüklenecek. BTC CVD, Spot Delta, Perp Delta ve CB Premium panellerini göreceksiniz.</li></ol>' },
      { type: 'html', content: '<h3>📊 Panel İçeriği</h3><ul><li><strong>Coinbase CVD</strong> — Coinbase agresif alış-satış hacim farkı</li><li><strong>Binance Spot CVD</strong> — Binance spot agresif alış-satış hacim farkı</li><li><strong>Binance Futures CVD</strong> — Binance futures agresif alış-satış hacim farkı</li><li><strong>Aggregate Spot Delta</strong> — Tüm borsaların spot delta toplamı</li><li><strong>Aggregate Perp Delta</strong> — Tüm borsaların perpetual delta toplamı</li><li><strong>Coinbase Premium</strong> — Coinbase ile Binance spot arası fiyat farkı</li></ul>' },
    ],
  },
  {
    id: 'alfa-levels',
    name: 'Alfa Levels',
    tagline: 'Dinamik destek/direnç seviyeleri — likidite bölgeleri, order blokları ve iç yapı.',
    sections: [
      { type: 'html', content: '<p><strong>Alfa Levels</strong> — Intraday ve swing için önemli bölgeleri gösteren indikatör.</p>' },
      { type: 'html', content: '<h3>📐 Bileşenler</h3><ul><li>Intraday ve Swing important areas</li><li>Tom Dante\'s ATR</li><li>EMA/SMA vs. trend following</li><li>Daily Open</li><li>Weekly Open</li><li>NYMO</li><li>Asia Low / High</li><li>Monday Range</li><li>Monthly Open</li><li>Yearly Open</li><li>Previous Monthly Open</li></ul>' },
      { type: 'html', content: '<h3>🔗 TradingView</h3><p><a href="https://tr.tradingview.com/script/AK4RibWy/" target="_blank" rel="noopener noreferrer" style="color:var(--pc);font-weight:600;">Alfa Levels — TradingView&apos;de aç</a></p>' },
      { type: 'html', content: '<h3>📖 Kullanım Videosu</h3><p style="color:var(--text-3);font-style:italic;">Video henüz eklenmedi — yakında.</p>' },
      { type: 'html', content: '<h3>📊 Backtest</h3><p style="color:var(--text-3);font-style:italic;">Backtest sonuçları henüz eklenmedi.</p>' },
    ],
  },
  {
    id: 'alfa-flow',
    name: 'Flow (Alfa Flow)',
    tagline: 'Spot CVD + Delta divergence — emir akışındaki gizli dönüşleri yakala.',
    sections: [
      { type: 'html', content: '<p><strong>Alfa Flow</strong>, spot Cumulative Volume Delta (CVD) ve futures delta divergencelarını analiz ederek piyasadaki gizli arz/talep dengesizliğini tespit eder. Fiyat bir yöne giderken akış tersini söylüyorsa, dönüş yakındır.</p>' },
      { type: 'html', content: '<h3>🔍 Nasıl Çalışır</h3><ul><li><strong>Spot CVD</strong>: Borsadaki alıcı-satıcı hacim farkı. CVD yükseliyorsa agresif alım var (bullish), düşüyorsa agresif satım var (bearish)</li><li><strong>Delta Divergence</strong>: Fiyat yeni bir tepe yaparken CVD tepe yapmıyorsa = bearish divergence. Tam tersi = bullish divergence.</li><li><strong>Akış Konfluensi</strong>: Alfa Levels’daki bir bölge + CVD divergence’ı aynı anda işaret ediyorsa işlem kalitesi yükselir.</li></ul>' },
      { type: 'html', content: '<h3>📖 Kullanım</h3><ol><li>Grafikte Spot CVD indikatörünü aç (TradingView’da “CVD” veya “Cumulative Volume Delta”)</li><li>Fiyat bir likidite bölgesine yaklaşırken CVD’ye bak: divergence var mı?</li><li>Divergence + Alfa Levels konfluensi = yüksek kaliteli setup</li><li>Divergence yoksa veya akış fiyatla aynı yöndeyse işlemi ele — akışa ters trade daha güvenlidir</li></ol>' },
      { type: 'html', content: '<h3>🎥 Video</h3><p style="color:var(--text-3);font-style:italic;">Video henüz eklenmedi — yakında.</p>' },
      { type: 'html', content: '<h3>📊 Backtest</h3><p style="color:var(--text-3);font-style:italic;">Backtest sonuçları henüz eklenmedi.</p>' },
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

/* ===== Alfa Designer — trader vücudu ===== */
const DESIGNER_KEY = 'defter-designer-v1';
let designerData = { topics: {} };
let designerSel = 'brain';
const DESIGNER_ORGANS = [
  { id: 'brain', ico: '🧠', name: 'Edge & Setup', body: 'Beyin', desc: 'Setup kalitesi: checklist skoru, A+/B karar oranı, entry kalitesi.', weak: 'Yüksek olasılıklı setup bulamıyorsun demektir. Rastgele işleme girip edge\'ini hisse dayıyorsun — kriterler işaretlenmiyor ya da kalitesiz entry yapılıyor.', topics: ['Checklist kriterlerini dürüstçe işaretle', 'A+/B kararını yalnızca skor öyle dediğinde ver', 'Sinyali bekle — erken giriş edge\'i öldürür'] },
  { id: 'eyes', ico: '👁️', name: 'Analiz & Veri', body: 'Gözler', desc: 'Veri ve teknik kriterleri okuma: CVD, OI, orderbook, trend, key level.', weak: 'Piyasayı net göremiyorsun demektir. Orderflow ve teknik veriyi okumadan işlem açıyorsun — analizin "hissetmeye" dayanıyor, veriye değil.', topics: ['Spot CVD / OI / Long-Shorts verisini analizine kat', 'Trend, key level ve manipulasyon okumasını geliştir', 'Trade başlamadan önce tezini yaz'] },
  { id: 'heart', ico: '❤️', name: 'Risk Yönetimi', body: 'Kalp', desc: 'Pozisyon kriterleri, risk disiplini ve kayıpları sınırlama.', weak: 'Tek bir işlem bilançoyu sarsabilir demektir. Risk büyüklüğü kontrolsüz; pozisyon planı yok, kayıplar sınırlanmıyor.', topics: ['Risk büyüklüğü — her işlemde sabit % risk', 'Pozisyon planlama — entry/TP/SL önceden belirle', 'Kayıp oranını düşür — daha az ama daha iyi işlem'] },
  { id: 'lungs', ico: '🫁', name: 'Trade Psikolojisi', body: 'Akciğer', desc: 'Duygu kontrolü: mood ibresi, duygu kilitleri, intent.', weak: 'Duygular nefesini kesiyor demektir. Korku/coşku anında karar veriyorsun; duygu kilitleri ve revenge trading planını çiğniyor.', topics: ['Duygu kilitleriyle işlem açma alışkanlığını kır', 'Revenge / duygu tradeleme döngüsünü bitir', 'Uç duyguda (coşku/korku) karar verme — mola al'] },
  { id: 'muscle', ico: '💪', name: 'Disiplin & İcra', body: 'Kaslar', desc: 'Kural takibi ve icra gücü: YOK kararla işlem açmama, kapasite içinde kalma.', weak: 'Kasların zayıf — kurallarına uymuyorsun demektir. YOK kararla işlem açıyor, kapasite dışına çıkıyorsun; irade değil dürtü karar veriyor.', topics: ['YOK kararla işlem açmayı bırak — kadran karar verir', 'Kapasite dışı işlemleri azalt', 'Kurallarına sıkı sıkıya bağlı kal'] },
  { id: 'bone', ico: '🦴', name: 'Para Yönetimi', body: 'İskelet', desc: 'İskelet = sistemin taşıyıcı yapısı: R sonuçları, win rate, ortalama R, drawdown ve konsistans.', weak: 'Kümülatif eğrin çökebilir demektir. Kayıplar kazançları siliyor, win rate ya da ortalama R zayıf, drawdown derinleşiyor.', topics: ['İşlem sonuçlarını düzenli R olarak gir', 'Ortalama R pozitif olmalı — kayıpları kes, kazananları taşı', 'Drawdown kontrolü — kayıp serisinde boyut küçült'] },
  { id: 'legs', ico: '🦵', name: 'Plan & Rutin', body: 'Bacaklar', desc: 'Seni ayakta tutan rutin: günlük plan (sabah/senaryo/anti), gün sonu değerlendirme ve seans seçimi.', weak: 'Ayaklarının üstünde sağlam duramıyorsun demektir. Plan ve rutin eksik; hazırlıksız, rastgele saatlerde işleme giriyorsun.', topics: ['Her işlem öncesi günlük planı (sabah/senaryo/anti) doldur', 'Gün sonu değerlendirme rutini kur', 'Seansını önceden seç — rastgele saatte işlem açma'] },
  { id: 'feet', ico: '👣', name: 'İstikrar & İcra', body: 'Ayaklar', desc: 'Her gün aynı disiplinle yürümek: kararı uygulama (icra) oranı ve sonuçların istikrarı.', weak: 'İstikrarlı adım atamıyorsun demektir. Bazen uyguluyor bazen kaçıyorsun; sonuçların çok dalgalı, süreklilik yok.', topics: ['Kararlarını istikrarla uygula — analiz edip kaçma', 'Pozisyon boyutunu sabit tut — sonuç dalgalanmasını azalt', 'Her gün aynı rutinle işlem yap'] }
];
const DS_STATUS = { ok: 'Sağlıklı', warn: 'Dikkat', crit: 'Kritik' };
function dsClamp(v) { return Math.max(0, Math.min(100, v)); }
function dsStatusOf(score) { return score >= 70 ? 'ok' : score >= 40 ? 'warn' : 'crit'; }

async function loadDesigner() {
  try {
    const raw = await store.get(DESIGNER_KEY);
    if (raw) { const d = JSON.parse(raw); if (d && d.topics) designerData = d; }
  } catch (e) { /* ilk açılış */ }
  if (!designerData.chat) designerData.chat = [];
}
async function saveDesigner() {
  try { await store.set(DESIGNER_KEY, JSON.stringify(designerData)); }
  catch (e) { console.error('saveDesigner:', e); }
}

function dsTradeCatFrac(t, cat) {
  const pcfg = config.pairs[t.pair];
  if (!pcfg || !Array.isArray(pcfg.criteria)) return null;
  const catNames = pcfg.criteria.filter(c => c.cat === cat).map(c => c.name);
  if (!catNames.length) return null;
  const checked = new Set((t.crits || []).map(c => c.n));
  let hit = 0;
  catNames.forEach(n => { if (checked.has(n)) hit++; });
  return hit / catNames.length;
}

function computeDesigner() {
  const T = (typeof trades !== 'undefined' && Array.isArray(trades)) ? trades : [];
  const D = (typeof dataTrades !== 'undefined' && Array.isArray(dataTrades)) ? dataTrades : [];
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const out = {};
  const stats = { n: T.length, scored: 0, winRate: 0, avgR: 0, totalR: 0, pf: 0, negTrades: 0 };

  // ---- Beyin: Edge & Setup ----
  {
    const scored = T.filter(t => typeof t.score === 'number');
    const avgScore = avg(scored.map(t => t.score));
    const aplusRate = scored.length ? scored.filter(t => t.verdict === 'A+').length / scored.length : 0;
    const bRate = scored.length ? scored.filter(t => t.verdict === 'B').length / scored.length : 0;
    const setupScores = D.map(t => t.criteria && typeof t.criteria.setup === 'number' ? t.criteria.setup : null).filter(v => v !== null);
    const entryScores = D.map(t => t.criteria && typeof t.criteria.entry === 'number' ? t.criteria.entry : null).filter(v => v !== null);
    const avgSetup = setupScores.length ? avg(setupScores) * 10 : null;
    const avgEntry = entryScores.length ? avg(entryScores) * 10 : null;
    let score = 50, reasons = [], topics = [];
    if (scored.length) {
      score = 0.45 * dsClamp(avgScore) + 0.35 * (aplusRate + 0.5 * bRate) * 100;
      if (avgSetup !== null) score = score * 0.7 + avgSetup * 0.3;
      if (avgEntry !== null) score = score * 0.7 + avgEntry * 0.3;
      score = Math.round(dsClamp(score));
      reasons.push({ m: '⬆', t: 'Ortalama checklist skoru <b>' + Math.round(avgScore) + '</b>/100' });
      reasons.push({ m: '🏁', t: '<b>' + Math.round(aplusRate * 100) + '%</b> A+ karar verilmiş' });
      if (avgSetup !== null) reasons.push({ m: '⚙️', t: 'Setup kalitesi <b>' + Math.round(avgSetup) + '</b>/100' });
      if (avgEntry !== null) reasons.push({ m: '🎯', t: 'Entry kalitesi <b>' + Math.round(avgEntry) + '</b>/100' });
      if (avgScore < 70) topics.push('Setup kalitesini yükselt — kriterleri daha çok işaretle');
      if (aplusRate < 0.3) topics.push('A+ karar oranını artırmak için daha seçici ol');
      if (avgEntry !== null && avgEntry < 60) topics.push('Entry kalitesi — reaksiyon ve zamanlama çalış');
    } else {
      reasons.push({ m: '⏳', t: 'Henüz işlem yok — checklist kaydedince puanlanır.' });
      topics.push('Checklist kullanmaya başla');
    }
    out.brain = { score, reasons, topics };
  }

  // ---- Gözler: Analiz & Veri ----
  {
    const veriFracs = T.map(t => dsTradeCatFrac(t, 'veri')).filter(v => v !== null);
    const tekFracs = T.map(t => dsTradeCatFrac(t, 'teknik')).filter(v => v !== null);
    const veriAvg = veriFracs.length ? avg(veriFracs) : null;
    const tekAvg = tekFracs.length ? avg(tekFracs) : null;
    let score = 50, reasons = [], topics = [];
    const v100 = veriAvg !== null ? veriAvg * 100 : null;
    const t100 = tekAvg !== null ? tekAvg * 100 : null;
    if (v100 !== null || t100 !== null) {
      const parts = [v100, t100].filter(v => v !== null);
      score = Math.round(dsClamp(avg(parts)));
      if (v100 !== null) reasons.push({ m: '📊', t: 'Veri kriterleri (CVD/OI/orderbook) <b>' + Math.round(v100) + '%</b> işaretlenmiş' });
      if (t100 !== null) reasons.push({ m: '📈', t: 'Teknik kriterler <b>' + Math.round(t100) + '%</b> işaretlenmiş' });
      if (v100 !== null && v100 < 60) topics.push('Spot CVD / OI / Long-Shorts verisini analizine kat');
      if (t100 !== null && t100 < 60) topics.push('Trend, key level ve manipulasyon okumasını geliştir');
    } else {
      reasons.push({ m: '⏳', t: 'Henüz işlem yok — analiz kriterleri puanlanamadı.' });
      topics.push('Orderflow ve CVD okuma çalış');
    }
    out.eyes = { score, reasons, topics };
  }

  // ---- Kalp: Risk Yönetimi ----
  {
    const posFracs = T.map(t => dsTradeCatFrac(t, 'pozisyon')).filter(v => v !== null);
    const posAvg = posFracs.length ? avg(posFracs) * 100 : null;
    const riskScores = D.map(t => t.criteria && typeof t.criteria.risk === 'number' ? t.criteria.risk : null).filter(v => v !== null);
    const riskAvg = riskScores.length ? avg(riskScores) * 10 : null;
    const withR = D.filter(t => t.r !== '' && t.r != null && !isNaN(Number(t.r))).map(t => Number(t.r));
    const lossRate = withR.length ? withR.filter(v => v < 0).length / withR.length * 100 : null;
    let score = 50, reasons = [], topics = [];
    if (withR.length || riskScores.length || posFracs.length) {
      const parts = [];
      if (riskAvg !== null) parts.push(riskAvg);
      if (posAvg !== null) parts.push(posAvg);
      if (lossRate !== null) parts.push(100 - lossRate * 1.2);
      score = parts.length ? Math.round(dsClamp(avg(parts))) : 50;
      if (riskAvg !== null) reasons.push({ m: '🛡️', t: 'Risk kriteri <b>' + Math.round(riskAvg) + '</b>/100' });
      if (posAvg !== null) reasons.push({ m: '📐', t: 'Pozisyon kriterleri <b>' + Math.round(posAvg) + '%</b> işaretlenmiş' });
      if (lossRate !== null) reasons.push({ m: '💸', t: 'Kayıp işlem oranı <b>%' + Math.round(lossRate) + '</b>' });
      if (riskAvg !== null && riskAvg < 60) topics.push('Risk büyüklüğü — her işlemde sabit % risk');
      if (posAvg !== null && posAvg < 60) topics.push('Pozisyon planlama — entry/TP/SL önceden belirle');
      if (lossRate !== null && lossRate > 50) topics.push('Kayıp oranını düşür — daha az ama daha iyi işlem');
    } else {
      reasons.push({ m: '⏳', t: 'Henüz sonuç verisi yok.' });
      topics.push('Risk yönetimi kuralları çalış');
    }
    out.heart = { score, reasons, topics };
  }

  // ---- Akciğer: Trade Psikolojisi ----
  {
    const emoRate = T.length ? T.filter(t => t.emoBlock).length / T.length : null;
    const intentEmo = T.length ? T.filter(t => t.intent === 'emo').length / T.length : null;
    const moodBad = T.length ? T.filter(t => typeof t.mood === 'number' && Math.abs(t.mood) >= 6).length / T.length : null;
    const duyguFrac = (() => { const f = T.map(t => dsTradeCatFrac(t, 'duygu')).filter(v => v !== null); return f.length ? avg(f) : null; })();
    const psychoScores = D.map(t => t.criteria && typeof t.criteria.psycho === 'number' ? t.criteria.psycho : null).filter(v => v !== null);
    const psychoAvg = psychoScores.length ? avg(psychoScores) * 10 : null;
    let score = 50, reasons = [], topics = [];
    const parts = [];
    if (emoRate !== null) parts.push((1 - emoRate) * 100);
    if (intentEmo !== null) parts.push((1 - intentEmo) * 100);
    if (moodBad !== null) parts.push((1 - moodBad) * 100);
    if (duyguFrac !== null) parts.push((1 - duyguFrac) * 100);
    if (psychoAvg !== null) parts.push(psychoAvg);
    if (parts.length) {
      score = Math.round(dsClamp(avg(parts)));
      if (emoRate !== null) reasons.push({ m: '🔒', t: '<b>' + Math.round(emoRate * 100) + '%</b> işlem duygu kilitli' });
      if (intentEmo !== null) reasons.push({ m: '😤', t: '<b>' + Math.round(intentEmo * 100) + '%</b> işlemde "Duygumu" tradeledin' });
      if (moodBad !== null) reasons.push({ m: '🎢', t: '<b>' + Math.round(moodBad * 100) + '%</b> işlemde uç duygu (|mood| ≥ 6)' });
      if (duyguFrac !== null && duyguFrac > 0) reasons.push({ m: '💭', t: 'Negatif duygu kriterleri işaretlenmiş: %' + Math.round(duyguFrac * 100) });
      if (psychoAvg !== null) reasons.push({ m: '🧘', t: 'Psikoloji notu <b>' + Math.round(psychoAvg) + '</b>/100' });
      if (emoRate !== null && emoRate > 0.1) topics.push('Duygu kilitleriyle işlem açma alışkanlığını kır');
      if (intentEmo !== null && intentEmo > 0.1) topics.push('Revenge / duygu tradeleme döngüsünü bitir');
      if (moodBad !== null && moodBad > 0.2) topics.push('Uç duyguda (coşku/korku) karar verme — mola al');
    } else {
      reasons.push({ m: '⏳', t: 'Henüz psikoloji verisi yok.' });
      topics.push('Trade psikolojisi ve duygu farkındalığı çalış');
    }
    out.lungs = { score, reasons, topics };
  }

  // ---- Kaslar: Disiplin & İcra (kural takibi) ----
  {
    const yokRate = T.length ? T.filter(t => t.verdict === 'YOK').length / T.length : null;
    const capRate = T.length ? T.filter(t => t.cap).length / T.length : null;
    let score = 50, reasons = [], topics = [];
    const parts = [];
    if (yokRate !== null) parts.push((1 - yokRate) * 100);
    if (capRate !== null) parts.push((1 - capRate) * 100);
    if (parts.length) {
      score = Math.round(dsClamp(avg(parts)));
      if (yokRate !== null) reasons.push({ m: '🚫', t: '<b>' + Math.round(yokRate * 100) + '%</b> işlem YOK kararla açılmış' });
      if (capRate !== null) reasons.push({ m: '⚠️', t: '<b>' + Math.round(capRate * 100) + '%</b> işlem kapasite dışı' });
      if (yokRate !== null && yokRate > 0.15) topics.push('YOK kararla işlem açmayı bırak — kadran karar verir');
      if (capRate !== null && capRate > 0.15) topics.push('Kapasite dışı işlemleri azalt');
    } else {
      reasons.push({ m: '⏳', t: 'Henüz disiplin verisi yok.' });
      topics.push('İşlem disiplini ve kural takibi çalış');
    }
    out.muscle = { score, reasons, topics };
  }

  // ---- Bacaklar: Plan & Rutin ----
  {
    const planFill = T.length ? T.filter(t => t.sabah && t.senaryo && t.anti).length / T.length : null;
    const reviewRate = T.length ? T.filter(t => t.gunsonu).length / T.length : null;
    const sessOk = T.length ? T.filter(t => t.sess && t.sess !== '—').length / T.length : null;
    let score = 50, reasons = [], topics = [];
    const parts = [];
    if (planFill !== null) parts.push(planFill * 100);
    if (reviewRate !== null) parts.push(reviewRate * 100);
    if (sessOk !== null) parts.push(sessOk * 100);
    if (parts.length && T.length) {
      score = Math.round(dsClamp(avg(parts)));
      if (planFill !== null) reasons.push({ m: '📋', t: 'Günlük plan (sabah/senaryo/anti) <b>%' + Math.round(planFill * 100) + '</b> dolu' });
      if (reviewRate !== null) reasons.push({ m: '🌙', t: 'Gün sonu değerlendirmesi <b>%' + Math.round(reviewRate * 100) + '</b>' });
      if (sessOk !== null) reasons.push({ m: '🕐', t: 'Seans seçimi <b>%' + Math.round(sessOk * 100) + '</b>' });
      if (planFill !== null && planFill < 0.5) topics.push('Her işlem öncesi günlük planı (sabah/senaryo/anti) doldur');
      if (reviewRate !== null && reviewRate < 0.5) topics.push('Gün sonu değerlendirme rutini kur');
      if (sessOk !== null && sessOk < 0.5) topics.push('Seansını önceden seç — rastgele saatte işlem açma');
    } else {
      reasons.push({ m: '⏳', t: 'Henüz plan/rutin verisi yok.' });
      topics.push('Günlük plan ve rutin oluşturmaya başla');
    }
    out.legs = { score, reasons, topics };
  }

  // ---- Ayaklar: İstikrar & İcra ----
  {
    const execRate = T.length ? T.filter(t => t.verdict && t.verdict !== 'YOK').length / T.length : null;
    const withR = D.filter(t => t.r !== '' && t.r != null && !isNaN(Number(t.r))).map(t => Number(t.r));
    let rConsist = null;
    if (withR.length >= 3) {
      const m = avg(withR);
      const std = Math.sqrt(avg(withR.map(v => (v - m) * (v - m))));
      rConsist = dsClamp(100 - std * 16);
    }
    let score = 50, reasons = [], topics = [];
    const parts = [];
    if (execRate !== null) parts.push(execRate * 100);
    if (rConsist !== null) parts.push(rConsist);
    if (parts.length && (T.length || withR.length)) {
      score = Math.round(dsClamp(avg(parts)));
      if (execRate !== null) reasons.push({ m: '🚶', t: 'Kararı uygulama (icra) oranı <b>%' + Math.round(execRate * 100) + '</b>' });
      if (rConsist !== null) reasons.push({ m: '📏', t: 'Sonuç istikrarı (R dağılımı) <b>' + Math.round(rConsist) + '</b>/100' });
      reasons.push({ m: '🔁', t: 'Toplam <b>' + T.length + '</b> işlem kaydı' });
      if (execRate !== null && execRate < 0.6) topics.push('Kararlarını uygula — analiz edip işlem açmamak istikrarı bozar');
      if (rConsist !== null && rConsist < 60) topics.push('Sonuçların çok dalgalı — pozisyon boyutunu ve riski sabit tut');
      topics.push('Her gün aynı rutinle işlem yap — istikrar edge kadar önemlidir');
    } else {
      reasons.push({ m: '⏳', t: 'Henüz istikrar verisi yok.' });
      topics.push('Düzenli işlem ve kayıt alışkanlığı oluştur');
    }
    out.feet = { score, reasons, topics };
  }

  // ---- İskelet: Para Yönetimi ----
  {
    const withR = D.filter(t => t.r !== '' && t.r != null && !isNaN(Number(t.r))).map(t => Number(t.r));
    const wins = withR.filter(v => v > 0), losses = withR.filter(v => v < 0);
    const winRate = withR.length ? wins.length / withR.length * 100 : null;
    const avgR = withR.length ? avg(withR) : null;
    const totalR = withR.length ? withR.reduce((a, b) => a + b, 0) : null;
    const pf = losses.length ? Math.abs(avg(wins)) / Math.abs(avg(losses)) : null;
    let peak = 0, maxDD = 0, cum = 0;
    withR.forEach(v => { cum += v; peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum); });
    let score = 50, reasons = [], topics = [];
    if (withR.length) {
      const parts = [];
      if (winRate !== null) parts.push(winRate);
      if (avgR !== null) parts.push(dsClamp((avgR + 1) * 40));
      if (pf !== null) parts.push(dsClamp(pf * 50));
      if (maxDD > 0) parts.push(dsClamp(100 - maxDD * 20));
      score = Math.round(dsClamp(avg(parts)));
      reasons.push({ m: '🎯', t: 'Win rate <b>%' + Math.round(winRate) + '</b> (' + wins.length + '/' + withR.length + ')' });
      reasons.push({ m: '📈', t: 'Ortalama R <b>' + (avgR > 0 ? '+' : '') + avgR.toFixed(2) + '</b>' });
      reasons.push({ m: '💰', t: 'Toplam <b>' + (totalR > 0 ? '+' : '') + totalR.toFixed(1) + 'R</b>' });
      if (pf !== null) reasons.push({ m: '⚖️', t: 'Profit factor <b>' + pf.toFixed(2) + '</b>' });
      if (maxDD > 0) reasons.push({ m: '📉', t: 'Maksimum drawdown <b>' + maxDD.toFixed(1) + 'R</b>' });
      if (winRate !== null && winRate < 45) topics.push('Win rate düşük — edge geliştir');
      if (avgR !== null && avgR < 0.3) topics.push('Ortalama R pozitif olmalı — kayıpları kes, kazananları taşı');
      if (maxDD > 5) topics.push('Drawdown kontrolü — kayıp serisinde boyut küçült');
    } else {
      reasons.push({ m: '⏳', t: 'Henüz R sonucu girilmemiş.' });
      topics.push('İşlem sonuçlarını R olarak gir');
    }
    out.bone = { score, reasons, topics };
  }

  // küresel istatistikler
  stats.scored = T.filter(t => typeof t.score === 'number').length;
  const wR = D.filter(t => t.r !== '' && t.r != null && !isNaN(Number(t.r))).map(t => Number(t.r));
  const w = wR.filter(v => v > 0), l = wR.filter(v => v < 0);
  stats.totalR = wR.length ? wR.reduce((a, b) => a + b, 0) : 0;
  stats.winRate = wR.length ? w.length / wR.length * 100 : 0;
  stats.avgR = wR.length ? avg(wR) : 0;
  stats.pf = l.length ? Math.abs(avg(w)) / Math.abs(avg(l)) : null;
  stats.negTrades = l.length;
  out.stats = stats;
  return out;
}

function dsTopicsFor(id) {
  const manual = (designerData.topics[id] || []).slice();
  const o = DESIGNER_ORGANS.find(x => x.id === id);
  if (o && Array.isArray(o.topics)) {
    o.topics.forEach(t => { if (manual.indexOf(t) === -1) manual.push(t); });
  }
  return manual;
}

function dsSvgHtml(organs) {
  // Gerçek foto vücut (alfa-body.png) üzerine bindirilen etkileşim katmanı.
  // Koordinatlar görselin piksel uzayında (1024 x 1536).
  const ZONES = {
    brain: '<ellipse cx="512" cy="150" rx="98" ry="118"/>',
    eyes: '<ellipse cx="512" cy="188" rx="92" ry="52"/>',
    heart: '<ellipse cx="452" cy="442" rx="82" ry="86"/>',
    lungs: '<ellipse cx="588" cy="446" rx="82" ry="86"/>',
    muscle: '<ellipse cx="298" cy="520" rx="70" ry="155"/><ellipse cx="728" cy="520" rx="70" ry="155"/>',
    bone: '<ellipse cx="512" cy="705" rx="122" ry="108"/>',
    legs: '<ellipse cx="442" cy="1015" rx="74" ry="155"/><ellipse cx="586" cy="1015" rx="74" ry="155"/>',
    feet: '<ellipse cx="452" cy="1345" rx="64" ry="182"/><ellipse cx="580" cy="1345" rx="64" ry="182"/>'
  };
  let h = '<g class="ds-zones">';
  DESIGNER_ORGANS.forEach(o => {
    const st = dsStatusOf(organs[o.id].score);
    const selc = designerSel === o.id ? ' sel' : '';
    h += '<g class="ds-zone ' + st + selc + '" data-organ="' + o.id + '"><title>' + o.body + ' — ' + o.name + ' · ' + organs[o.id].score + '/100 · ' + DS_STATUS[st] + '</title>' + ZONES[o.id] + '</g>';
  });
  h += '</g>';
  return h;
}

function dsLegendHtml(organs) {
  return DESIGNER_ORGANS.map(o => {
    const sc = organs[o.id].score;
    const st = dsStatusOf(sc);
    const sel = designerSel === o.id ? ' sel' : '';
    return '<div class="ds-legend-row' + sel + '" data-organ="' + o.id + '"><span class="ds-legend-dot ds-dot-' + st + '"></span><span class="ds-legend-ico">' + o.ico + '</span><span class="ds-legend-nm">' + o.body + ' — ' + o.name + '</span><span class="ds-legend-sc">' + sc + '</span></div>';
  }).join('');
}

function renderDesigner() {
  const organs = computeDesigner();
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const st = organs.stats;
  const overall = Math.round(avg(DESIGNER_ORGANS.map(o => organs[o.id].score)));
  const oSt = dsStatusOf(overall);
  const overallEl = document.getElementById('ds-overall');
  if (overallEl) {
    overallEl.innerHTML = '<span class="ds-overall-score" style="color:var(--' + (oSt === 'ok' ? 'green' : oSt === 'warn' ? 'amber' : 'red') + ');">' + overall + '<small style="font-size:13px;color:var(--text-3);">/100</small></span>' +
      '<div class="ds-overall-bar"><div class="ds-bar-fill" style="width:' + overall + '%;background:var(--' + (oSt === 'ok' ? 'green' : oSt === 'warn' ? 'amber' : 'red') + ');"></div></div>' +
      '<span class="ds-overall-txt">Genel trader sağlığı · ' + st.n + ' işlem · ' + st.scored + ' checklist' + (st.totalR !== 0 ? ' · ' + (st.totalR > 0 ? '+' : '') + st.totalR.toFixed(1) + 'R' : '') + '</span>';
  }
  const svg = document.getElementById('ds-svg');
  if (svg) { svg.innerHTML = dsSvgHtml(organs); }
  renderDsMarkers(organs);
  renderDsDetail(organs, organs[designerSel]);
  dsAiRender();
}

/* ---- Body-map: foto üzerinde organ işaretleri (marker) ---- */
const DS_MARK = { brain: [512, 112], eyes: [614, 178], heart: [452, 432], lungs: [602, 452], muscle: [300, 486], bone: [512, 700], legs: [600, 1000], feet: [452, 1360] };
function renderDsMarkers(organs) {
  const box = document.getElementById('ds-markers');
  if (!box) return;
  box.innerHTML = DESIGNER_ORGANS.map(o => {
    const sc = organs[o.id].score;
    const st = dsStatusOf(sc);
    const sel = designerSel === o.id ? ' sel' : '';
    const a = DS_MARK[o.id];
    const l = (a[0] / 1024 * 100).toFixed(2), t = (a[1] / 1536 * 100).toFixed(2);
    return '<div class="ds-marker ' + st + sel + '" data-organ="' + o.id + '" style="left:' + l + '%;top:' + t + '%" role="button" tabindex="0" title="' + o.body + ' — ' + o.name + ' · ' + sc + '/100 · ' + DS_STATUS[st] + '"><span class="ds-marker-ico">' + o.ico + '</span><span class="ds-marker-sc">' + sc + '</span></div>';
  }).join('');
}

function renderDsDetail(organs, organ) {
  const el = document.getElementById('ds-detail');
  if (!el || !organ) return;
  const st = dsStatusOf(organ.score);
  const color = st === 'ok' ? 'var(--green)' : st === 'warn' ? 'var(--amber)' : 'var(--red)';
  const o = DESIGNER_ORGANS.find(x => x.id === designerSel) || DESIGNER_ORGANS[0];
  const manual = dsTopicsFor(designerSel);
  const userTopics = designerData.topics[designerSel] || [];
  const allTopics = organ.topics.concat(manual.filter(t => organ.topics.indexOf(t) === -1));
  const weakMsg = organ.score >= 70
    ? o.name + ' sağlıklı. Sürdürmek için istikrarlı kal — zayıf organlarına odaklan.'
    : o.weak;
  el.innerHTML =
    '<div class="ds-head">' +
      '<div class="ds-head-ico">' + o.ico + '</div>' +
      '<div class="ds-head-t"><div class="ds-title">' + o.body + ' — ' + o.name + '</div><div class="ds-sub">' + o.desc + '</div></div>' +
      '<div class="ds-status ' + st + '">' + DS_STATUS[st] + '</div>' +
    '</div>' +
    '<div class="ds-big-score" style="color:' + color + ';">' + organ.score + '<small>/100</small></div>' +
    '<div class="ds-bar"><div class="ds-bar-fill" style="width:' + organ.score + '%;background:' + color + ';"></div></div>' +
    '<div class="ds-sec"><div class="ds-sec-h">💡 Bu eksik ne anlama geliyor?</div><div class="ds-weak">' + esc(weakMsg) + '</div></div>' +
    '<div class="ds-sec"><div class="ds-sec-h">🔍 Neden bu durumda?</div><div class="ds-reasons">' +
      organ.reasons.map(r => '<div class="ds-reason"><span class="ds-rmrk">' + r.m + '</span><span>' + r.t + '</span></div>').join('') +
    '</div></div>' +
    '<div class="ds-sec"><div class="ds-sec-h">📚 Çalışma konuları</div>' +
      (allTopics.length ? '<div class="ds-topics">' + allTopics.map(t => '<span class="ds-topic">' + esc(t) + '<button type="button" class="ds-topic-ai" title="AI ile öğren" data-topic-ask="' + esc(t) + '">🤖</button>' + (userTopics.indexOf(t) > -1 ? '<button type="button" class="ds-topic-del" title="Kaldır" data-topic-del="' + esc(t) + '">✕</button>' : '') + '</span>').join('') + '</div>' : '<div class="ds-empty" style="padding:12px;">Henüz öneri yok.</div>') +
      '<div class="ds-topic-add"><input type="text" id="ds-topic-in" placeholder="Kendi çalışma konunu ekle…" maxlength="80"><button type="button" class="btn solid" id="ds-topic-add">Ekle</button></div>' +
    '</div>' +
    '<div class="ds-kpis">' +
      '<div class="ds-kpi"><div class="k-lbl">İşlem</div><div class="k-val">' + organs.stats.n + '</div></div>' +
      '<div class="ds-kpi"><div class="k-lbl">Win rate</div><div class="k-val">%' + Math.round(organs.stats.winRate) + '</div></div>' +
      '<div class="ds-kpi"><div class="k-lbl">Ort. R</div><div class="k-val" style="color:' + (organs.stats.avgR >= 0 ? 'var(--green)' : 'var(--red)') + ';">' + (organs.stats.avgR > 0 ? '+' : '') + organs.stats.avgR.toFixed(2) + '</div></div>' +
      '<div class="ds-kpi"><div class="k-lbl">Toplam R</div><div class="k-val" style="color:' + (organs.stats.totalR >= 0 ? 'var(--green)' : 'var(--red)') + ';">' + (organs.stats.totalR > 0 ? '+' : '') + organs.stats.totalR.toFixed(1) + '</div></div>' +
    '</div>';
  const inEl = document.getElementById('ds-topic-in');
  const addBtn = document.getElementById('ds-topic-add');
  if (addBtn) addBtn.addEventListener('click', () => dsAddTopic());
  if (inEl) inEl.addEventListener('keydown', e => { if (e.key === 'Enter') dsAddTopic(); });
}

function dsAddTopic() {
  const inEl = document.getElementById('ds-topic-in');
  const v = (inEl.value || '').trim();
  if (!v) return;
  if (!designerData.topics[designerSel]) designerData.topics[designerSel] = [];
  if (designerData.topics[designerSel].indexOf(v) === -1) designerData.topics[designerSel].push(v);
  saveDesigner();
  renderDesigner();
}

/* ---- Alfa Mentor: çalışma konuları için AI sohbeti ---- */
function dsAiCtx() {
  const organs = computeDesigner();
  const o = DESIGNER_ORGANS.find(x => x.id === designerSel) || DESIGNER_ORGANS[0];
  const organ = organs[o.id];
  const manual = designerData.topics[o.id] || [];
  const topics = organ.topics.concat(manual.filter(t => organ.topics.indexOf(t) === -1));
  return { o, organ, topics, organs };
}

function dsAiSystem(ctx) {
  const st = dsStatusOf(ctx.organ.score);
  const stTxt = DS_STATUS[st];
  return `Sen Alfa Trader'ın trade mentoru Alfa Mentor'sun. Kullanıcının trade verilerine göre kişiselleştirilmiş eğitim veriyorsun.

Şu an odaklanılan yetenek (organ): ${ctx.o.body} — ${ctx.o.name}
Skor: ${ctx.organ.score}/100 (${stTxt})
Bu ne anlama geliyor: ${ctx.organ.score >= 70 ? 'Sağlıklı görünüyor, sürdür.' : ctx.o.weak}
Çalışma konuları: ${ctx.topics.length ? ctx.topics.join('; ') : 'henüz belirlenmedi'}

ÖĞRETİM KURALLARI:
- Türkçe konuş, kısa ve net ol (max 8-10 satır).
- Konuyu basitçe açıkla, somut örnek ver, pratik adım öner.
- Markdown yerine düz metin kullan; başlıkları * * içinde, maddeleri "-" ile yaz.
- Kullanıcının verisiyle ilgili zayıflıklara odaklan, cesaretlendir.`;
}

function dsAiRenderChips(ctx) {
  const box = document.getElementById('ds-ai-chips');
  if (!box) return;
  if (!ctx.topics.length) { box.innerHTML = ''; return; }
  box.innerHTML = ctx.topics.map(t =>
    '<button type="button" class="ds-ai-chip" data-ai-topic="' + esc(t) + '">🎓 ' + esc(t) + '</button>'
  ).join('');
}

function dsAiBubble(msg) {
  const log = document.getElementById('ds-ai-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = 'ds-ai-bub ' + msg.role;
  if (msg.role === 'ai') {
    const t = esc(msg.text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    div.innerHTML = t;
  } else {
    div.textContent = msg.text;
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function dsAiRender() {
  const log = document.getElementById('ds-ai-log');
  if (!log) return;
  log.innerHTML = '';
  const chat = designerData.chat || [];
  if (!chat.length) {
    log.innerHTML = '<div class="ds-empty">Merhaba! 👋 Ben Alfa Mentor. Hangi konuyu öğrenmek istersin?</div>';
  } else {
    chat.forEach(m => dsAiBubble(m));
  }
  dsAiRenderChips(dsAiCtx());
}

async function dsAiAsk(text) {
  const q = (text || '').trim();
  if (!q) return;
  const log = document.getElementById('ds-ai-log');
  if (!log) return;
  if (!designerData.chat) designerData.chat = [];
  designerData.chat.push({ role: 'user', text: q });
  saveDesigner();
  dsAiBubble({ role: 'user', text: q });
  dsAiBubble({ role: 'think', text: '🤔 Düşünüyorum…' });
  const ctx = dsAiCtx();
  try {
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: q,
        history: designerData.chat.slice(0, -1).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })),
        system: dsAiSystem(ctx),
        tokens: 500
      })
    });
    const data = await resp.json();
    const reply = data.reply;
    if (!reply) throw new Error('boş cevap');
    designerData.chat.push({ role: 'ai', text: reply });
    saveDesigner();
    const logEl = document.getElementById('ds-ai-log');
    if (logEl) {
      const thinkEl = logEl.querySelector('.ds-ai-bub.think');
      if (thinkEl) thinkEl.remove();
    }
    dsAiBubble({ role: 'ai', text: reply });
  } catch (e) {
    const logEl = document.getElementById('ds-ai-log');
    if (logEl) {
      const thinkEl = logEl.querySelector('.ds-ai-bub.think');
      if (thinkEl) thinkEl.remove();
    }
    dsAiBubble({ role: 'ai', text: 'Üzgünüm, şu an cevap veremiyorum. AI anahtarı yapılandırılmamış olabilir. Kısa bir süre sonra tekrar dene.' });
  }
}

function bindDesignerPage() {
  const svgEl = document.getElementById('ds-svg');
  if (svgEl) svgEl.addEventListener('click', e => {
    const z = e.target.closest('[data-organ]');
    if (z) { designerSel = z.getAttribute('data-organ'); renderDesigner(); }
  });
  const markBox = document.getElementById('ds-markers');
  if (markBox) {
    markBox.addEventListener('click', e => {
      const m = e.target.closest('.ds-marker[data-organ]');
      if (m) { designerSel = m.getAttribute('data-organ'); renderDesigner(); }
    });
    markBox.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const m = e.target.closest('.ds-marker[data-organ]');
        if (m) { e.preventDefault(); designerSel = m.getAttribute('data-organ'); renderDesigner(); }
      }
    });
  }
  document.getElementById('ds-detail').addEventListener('click', e => {
    const del = e.target.closest('[data-topic-del]');
    if (del) {
      const t = del.getAttribute('data-topic-del');
      designerData.topics[designerSel] = (designerData.topics[designerSel] || []).filter(x => x !== t);
      saveDesigner();
      renderDesigner();
    }
    const ask = e.target.closest('[data-topic-ask]');
    if (ask) {
      const t = ask.getAttribute('data-topic-ask');
      const ai = document.getElementById('ds-ai');
      if (ai) { const body = document.getElementById('ds-ai-body'); if (body && !body.classList.contains('open')) body.classList.add('open'); ai.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      dsAiAsk(t + ' — bu konuyu bana öğret: ne olduğunu, neden önemli olduğunu ve nasıl çalışacağımı adım adım anlat.');
    }
  });
  const chips = document.getElementById('ds-ai-chips');
  if (chips) chips.addEventListener('click', e => {
    const c = e.target.closest('[data-ai-topic]');
    if (c) dsAiAsk(c.getAttribute('data-ai-topic') + ' — bu konuyu bana öğret.');
  });
  const send = document.getElementById('ds-ai-send');
  if (send) send.addEventListener('click', () => {
    const inEl = document.getElementById('ds-ai-in');
    const v = (inEl.value || '').trim();
    if (!v) return;
    inEl.value = '';
    dsAiAsk(v);
  });
  const inEl = document.getElementById('ds-ai-in');
  if (inEl) inEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = (inEl.value || '').trim();
      if (!v) return;
      inEl.value = '';
      dsAiAsk(v);
    }
  });
  const clear = document.getElementById('ds-ai-clear');
  if (clear) clear.addEventListener('click', () => {
    designerData.chat = [];
    saveDesigner();
    dsAiRender();
  });
}

/* ===== Alfa Trading — topluluk işlem/analiz akışı ===== */
const ALFA_ADMIN_EMAILS = [ADMIN_EMAIL]; // buraya yeni admin e-postaları eklenebilir
let alfaPosts = [];
let alfaFilter = 'all';
let alfaCoinQ = '';
let alfaComposer = { type: 'analiz', dir: 'long' };
let alfaLoaded = false;

function alfaIsAdmin() {
  try {
    if (typeof AUTH === 'undefined' || !AUTH_ENABLED) return true; // yerel/geliştirme
    return !!(AUTH.user && ALFA_ADMIN_EMAILS.indexOf((AUTH.user.email || '').toLowerCase()) >= 0);
  } catch (e) { return false; }
}
function alfaNick(force) {
  let n = '';
  try { n = localStorage.getItem('alfa-nick') || ''; } catch (e) {}
  if (!n && force) {
    n = (prompt('Toplulukta görünecek rumuzun:') || '').trim().slice(0, 40);
    if (n) { try { localStorage.setItem('alfa-nick', n); } catch (e) {} }
  }
  return n;
}
function alfaProfile() { try { return JSON.parse(localStorage.getItem('alfa-profile') || '{}') || {}; } catch (e) { return {}; } }
function alfaSaveProfile(p) { try { localStorage.setItem('alfa-profile', JSON.stringify(p)); } catch (e) {} }
function alfaMyName() {
  if (alfaIsAdmin()) {
    const p = alfaProfile(); if (p.name) return p.name;
    try { return (AUTH && AUTH.user && (AUTH.user.email || '').split('@')[0]) || 'Admin'; } catch (e) { return 'Admin'; }
  }
  return alfaNick(false) || '';
}
function alfaMyAvatar() { return alfaIsAdmin() ? (alfaProfile().avatar || '') : ''; }
function atQuoteHtml(q) {
  if (!q) return '';
  if (q.kind === 'bias') {
    const d = (q.dir || '').toUpperCase();
    const emo = (d === 'BULLISH' || d === 'LONG') ? '🟢' : (d === 'BEARISH' || d === 'SHORT') ? '🔴' : '⚪';
    const lbl = d === 'BULLISH' ? 'Bullish' : d === 'BEARISH' ? 'Bearish' : (d || 'Nötr');
    return '<div class="at-quote"><div class="at-quote-hd">🎯 Alıntı · HTF Bias</div>' +
      '<div class="at-quote-main">' + emo + ' ' + esc(lbl) + (q.pair ? ' · ' + esc(q.pair) : '') + '</div>' +
      (q.note ? '<div class="at-quote-note">' + esc(q.note) + '</div>' : '') + '</div>';
  }
  if (q.kind === 'result') {
    const rn = parseFloat(String(q.r).replace(',', '.'));
    const cls = isNaN(rn) ? '' : (rn >= 0 ? ' pos' : ' neg');
    const rtxt = (q.r === '' || q.r == null) ? '—' : ((rn > 0 ? '+' : '') + q.r + 'R');
    const dir = String(q.dir || '').toUpperCase();
    const dtag = dir ? ' <span class="at-tag ' + (dir === 'LONG' ? 'long">🟢 LONG' : 'short">🔴 SHORT') + '</span>' : '';
    return '<div class="at-quote"><div class="at-quote-hd">📊 Alıntı · İşlem Sonucu</div>' +
      '<div class="at-quote-main">' + esc(q.pair || '') + dtag + ' <span class="at-rpill' + cls + '">' + esc(rtxt) + '</span>' +
      (q.verdict ? ' · ' + esc(q.verdict) : '') + (q.date ? ' · ' + esc(q.date) : '') + '</div>' +
      (q.strat ? '<div class="at-quote-note">Strateji: ' + esc(q.strat) + '</div>' : '') + '</div>';
  }
  return '';
}
function atTimeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + ' sn';
  const m = Math.floor(s / 60); if (m < 60) return m + ' dk';
  const h = Math.floor(m / 60); if (h < 24) return h + ' sa';
  const d = Math.floor(h / 24); if (d < 7) return d + ' gün';
  try { return new Date(ts).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }); } catch (e) { return d + ' gün'; }
}
async function atApi(action, payload) {
  const res = await fetch('/api/contrib?store=alfatrading', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ action }, payload || {})),
  });
  return res.json();
}
async function loadAlfaTrading() {
  try {
    const res = await fetch('/api/contrib?store=alfatrading', { cache: 'no-store' });
    const data = await res.json();
    alfaPosts = Array.isArray(data.posts) ? data.posts : [];
  } catch (e) { alfaPosts = []; }
  alfaLoaded = true;
  renderAlfaFeed();
}
function renderAlfaTrading() {
  const adm = alfaIsAdmin();
  const nb = document.getElementById('at-new-btn'); if (nb) nb.style.display = adm ? '' : 'none';
  const pb = document.getElementById('at-prof-btn'); if (pb) pb.style.display = adm ? '' : 'none';
  if (!alfaLoaded) { loadAlfaTrading(); } else { renderAlfaFeed(); loadAlfaTrading(); }
}
function alfaFiltered() {
  const q = alfaCoinQ.trim().toUpperCase();
  return alfaPosts.filter(p => {
    if (alfaFilter !== 'all' && p.type !== alfaFilter) return false;
    if (q && (p.coin || '').toUpperCase().indexOf(q) < 0) return false;
    return true;
  });
}
function renderAlfaFeed() {
  const feed = document.getElementById('at-feed');
  if (!feed) return;
  const list = alfaFiltered();
  if (!list.length) {
    feed.innerHTML = '<div class="at-empty">' + (alfaLoaded ? (alfaPosts.length ? 'Bu filtrede paylaşım yok.' : 'Henüz paylaşım yok.' + (alfaIsAdmin() ? ' Üstteki “+ Paylaşım Ekle” ile başla.' : '')) : 'Yükleniyor…') + '</div>';
    return;
  }
  feed.innerHTML = list.map(atCardHtml).join('');
  if (window.alfaOpenPostId) {
    const pid = window.alfaOpenPostId;
    const el = feed.querySelector('.at-card[data-pid="' + pid + '"]');
    if (el) {
      window.alfaOpenPostId = '';
      setTimeout(() => { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('at-hl'); }, 150);
    }
  }
}
function atCardHtml(p) {
  const admin = alfaIsAdmin();
  const me = alfaMyName();
  const liked = me && (p.likes || []).indexOf(me) >= 0;
  const nlike = (p.likes || []).length;
  const ncom = (p.comments || []).length;
  const av = (p.author || 'A').trim().charAt(0).toUpperCase();
  let badges = '';
  badges += '<span class="at-tag type">' + (p.type === 'islem' ? '📊 İşlem' : '📝 Analiz') + '</span>';
  if (p.coin) badges += '<span class="at-tag coin">' + esc(p.coin) + '</span>';
  if (p.bias) badges += '<span class="at-tag ' + p.bias + '">' + (p.bias === 'long' ? '🟢 Long bias' : p.bias === 'short' ? '🔴 Short bias' : '⚪ Nötr') + '</span>';
  if (p.type === 'islem' && p.dir) badges += '<span class="at-tag ' + p.dir + '">' + (p.dir === 'long' ? '🟢 LONG' : '🔴 SHORT') + '</span>';
  if (p.type === 'islem') {
    const stL = { aktif: 'Aktif', tp: 'TP geldi', sl: 'SL', iptal: 'İptal' }[p.status] || 'Aktif';
    badges += '<span class="at-tag st-' + (p.status || 'aktif') + '">' + stL + '</span>';
  }
  let levels = '';
  if (p.type === 'islem' && (p.entry || p.tp || p.sl)) {
    levels = '<div class="at-levels">' +
      '<div class="at-lvl"><div class="l">Entry</div><div class="v">' + (esc(p.entry) || '—') + '</div></div>' +
      '<div class="at-lvl tp"><div class="l">TP</div><div class="v">' + (esc(p.tp) || '—') + '</div></div>' +
      '<div class="at-lvl sl"><div class="l">SL</div><div class="v">' + (esc(p.sl) || '—') + '</div></div>' +
    '</div>';
    if (p.lev || p.risk) levels += '<div class="at-text" style="color:var(--text-3);font-size:12px;">' + [p.lev ? 'Kaldıraç: ' + esc(p.lev) : '', p.risk ? 'Risk: ' + esc(p.risk) : ''].filter(Boolean).join(' · ') + '</div>';
  }
  const comments = (p.comments || []).map(c =>
    '<div class="at-comment" data-cid="' + c.id + '"><div class="at-c-av">' + (c.avatar ? '<img src="' + esc(c.avatar) + '" alt="">' : (c.nick || '?').trim().charAt(0).toUpperCase()) + '</div>' +
    '<div class="at-c-body"><div class="at-c-top"><span class="at-c-nick">' + esc(c.nick) + (c.isAdmin ? ' 👑' : '') + '</span><span class="at-c-time">' + atTimeAgo(c.ts) + '</span>' +
    (admin ? '<button type="button" class="at-c-del" data-atcdel="' + p.id + '|' + c.id + '">✕</button>' : '') +
    '</div><div class="at-c-text">' + esc(c.text) + '</div></div></div>'
  ).join('');
  const avHtml = p.avatar ? '<img src="' + esc(p.avatar) + '" alt="">' : esc(av);
  return '<article class="at-card" data-pid="' + p.id + '">' +
    (p.repost ? '<div class="at-rt-badge">🔁 ' + esc(p.author || 'Admin') + ' bir gönderiyi alıntıladı</div>' : '') +
    '<div class="at-card-hd"><div class="at-avatar">' + avHtml + '</div>' +
      '<div class="at-who"><div class="at-author">' + esc(p.author || 'Admin') + (p.isAdmin ? '<span class="at-adm">Admin</span>' : '') + '</div>' +
      '<div class="at-time">' + atTimeAgo(p.ts) + (p.edited ? ' · düzenlendi' : '') + '</div></div>' +
      (admin ? '<button type="button" class="at-act danger at-c-del" data-atedit="' + p.id + '" title="Düzenle">✏️</button>' : '') +
      (admin ? '<button type="button" class="at-act danger at-c-del" data-atpdel="' + p.id + '" title="Sil">🗑</button>' : '') +
    '</div>' +
    '<div class="at-badges">' + badges + '</div>' +
    (p.title ? '<div class="at-title">' + esc(p.title) + '</div>' : '') +
    (p.text ? '<div class="at-text">' + esc(p.text) + '</div>' : '') +
    levels +
    atQuoteHtml(p.quote) +
    (p.img ? '<img class="at-img" src="' + esc(p.img) + '" alt="" loading="lazy" data-atimg="' + esc(p.img) + '">' : '') +
    atRepostHtml(p.repost) +
    '<div class="at-actions">' +
      '<button type="button" class="at-act' + (liked ? ' liked' : '') + '" data-atlike="' + p.id + '">' + (liked ? '❤️' : '🤍') + ' <span>' + nlike + '</span></button>' +
      '<button type="button" class="at-act" data-atcom="' + p.id + '">💬 <span>' + ncom + '</span></button>' +
      '<button type="button" class="at-act" data-atshare="' + p.id + '">🔗 Paylaş</button>' +
      (admin ? '<button type="button" class="at-act" data-atrt="' + p.id + '">🔁 RT</button>' : '') +
      (admin ? '<button type="button" class="at-act" data-atafter="' + p.id + '">📊 Sonuç ekle</button>' : '') +
      (p.type === 'islem' && (p.entry || p.sl) ? '<button type="button" class="at-act tool" data-attool="' + p.id + '">🧮 Calculator\'a gönder</button>' : '') +
      (admin && p.type === 'islem' ? '<button type="button" class="at-act" data-atstatus="' + p.id + '">⚙ Durum</button>' : '') +
    '</div>' +
    '<div class="at-comments" id="at-com-' + p.id + '">' + comments +
      '<div class="at-c-add"><input type="text" placeholder="Yorum yaz…" maxlength="800" data-atcinput="' + p.id + '"><button type="button" class="at-c-send" data-atcsend="' + p.id + '">➤</button></div>' +
    '</div>' +
  '</article>';
}
async function atToggleLike(pid) {
  const nick = alfaMyName() || alfaNick(true);
  if (!nick) return;
  const p = alfaPosts.find(x => x.id === pid); if (!p) return;
  p.likes = p.likes || [];
  const i = p.likes.indexOf(nick);
  if (i >= 0) p.likes.splice(i, 1); else p.likes.push(nick);
  renderAlfaFeed();
  await atApi('like', { postId: pid, nick });
}
async function atSendComment(pid) {
  const inp = document.querySelector('[data-atcinput="' + pid + '"]');
  if (!inp) return;
  const text = (inp.value || '').trim(); if (!text) return;
  const nick = alfaMyName() || alfaNick(true); if (!nick) return;
  inp.value = '';
  const p = alfaPosts.find(x => x.id === pid); if (!p) return;
  const av = alfaMyAvatar();
  p.comments = p.comments || [];
  p.comments.push({ id: 't' + Date.now(), nick, text, ts: Date.now(), isAdmin: alfaIsAdmin(), avatar: av });
  renderAlfaFeed();
  const box = document.getElementById('at-com-' + pid); if (box) box.classList.add('open');
  await atApi('comment', { postId: pid, nick, text, isAdmin: alfaIsAdmin(), avatar: av });
  loadAlfaTrading();
}
async function atDelPost(pid) {
  if (!confirm('Bu paylaşım silinsin mi?')) return;
  alfaPosts = alfaPosts.filter(p => p.id !== pid);
  renderAlfaFeed();
  await atApi('delPost', { postId: pid });
}
async function atDelComment(pid, cid) {
  const p = alfaPosts.find(x => x.id === pid); if (p) p.comments = (p.comments || []).filter(c => c.id !== cid);
  renderAlfaFeed();
  const box = document.getElementById('at-com-' + pid); if (box) box.classList.add('open');
  await atApi('delComment', { postId: pid, commentId: cid });
}
async function atSetStatus(pid) {
  const opts = { '1': 'aktif', '2': 'tp', '3': 'sl', '4': 'iptal' };
  const c = prompt('Durum seç:\n1 = Aktif\n2 = TP geldi\n3 = SL\n4 = İptal', '1');
  const st = opts[(c || '').trim()]; if (!st) return;
  const p = alfaPosts.find(x => x.id === pid); if (p) p.status = st;
  renderAlfaFeed();
  await atApi('status', { postId: pid, status: st });
}
function atToolSend(pid) {
  const p = alfaPosts.find(x => x.id === pid); if (!p) return;
  const setv = (id, v) => { const el = document.getElementById(id); if (el && v) { el.value = v; el.dispatchEvent(new Event('input')); } };
  setv('entryPrice', p.entry); setv('slPrice', p.sl);
  showPage('calc');
  try { if (typeof updateCalc === 'function') updateCalc(); } catch (e) {}
}
function atCompressImage(fileOrBlob, maxW, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fileOrBlob);
    const im = new Image();
    im.onload = () => {
      const scale = Math.min(1, maxW / (im.width || maxW));
      const w = Math.max(1, Math.round(im.width * scale)), h = Math.max(1, Math.round(im.height * scale));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(im, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { resolve(cv.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
    };
    im.onerror = e => { URL.revokeObjectURL(url); reject(e); };
    im.src = url;
  });
}
async function atSetPostImage(blob) {
  try {
    const d = await atCompressImage(blob, 1000, 0.72);
    const el = document.getElementById('at-f-img'); if (el) el.value = d;
    document.getElementById('at-f-imgprev').innerHTML = '<img src="' + d + '" alt="">';
    atUpdatePreview();
  } catch (e) { alert('Görsel işlenemedi.'); }
}
async function atSetAvatarImage(blob) {
  try {
    const d = await atCompressImage(blob, 256, 0.85);
    const el = document.getElementById('at-p-avatar'); if (el) el.value = d;
    atRenderProfPrev();
  } catch (e) { alert('Görsel işlenemedi.'); }
}
function atPasteImageFrom(e, handler) {
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.indexOf('image') === 0) {
      const blob = items[i].getAsFile(); if (blob) { e.preventDefault(); handler(blob); return true; }
    }
  }
  return false;
}
function atRepostHtml(rp) {
  if (!rp) return '';
  const av = rp.avatar ? '<img src="' + esc(rp.avatar) + '" alt="">' : esc((rp.author || 'A').charAt(0).toUpperCase());
  const dtag = (rp.type === 'islem' && rp.dir) ? ' <span class="at-tag ' + (rp.dir === 'long' ? 'long">🟢 LONG' : 'short">🔴 SHORT') + '</span>' : '';
  return '<div class="at-repost"><div class="at-repost-hd"><span class="at-c-av">' + av + '</span><span class="at-c-nick">' + esc(rp.author || 'Admin') + '</span>' +
    (rp.coin ? ' <span class="at-tag coin">' + esc(rp.coin) + '</span>' : '') + dtag + '</div>' +
    (rp.title ? '<div class="at-repost-title">' + esc(rp.title) + '</div>' : '') +
    (rp.text ? '<div class="at-repost-text">' + esc(rp.text) + '</div>' : '') +
    (rp.img ? '<img class="at-repost-img" src="' + esc(rp.img) + '" alt="">' : '') + '</div>';
}
function atRenderRepostBox() {
  const box = document.getElementById('at-repost-box'); if (!box) return;
  if (!alfaComposer.repost) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'block';
  box.innerHTML = '<button type="button" class="at-qx" id="at-rtx">✕</button><div class="at-repost-hd" style="margin-bottom:6px;color:var(--text-3);font-weight:700">🔁 Alıntılanan gönderi</div>' + atRepostHtml(alfaComposer.repost);
}
function atStartRepost(pid) {
  const p = alfaPosts.find(x => x.id === pid); if (!p) return;
  atOpenModal();
  alfaComposer.repost = { id: p.id, author: p.author, avatar: p.avatar || '', type: p.type, coin: p.coin || '', dir: p.dir || '', status: p.status || '', title: p.title || '', text: (p.text || '').slice(0, 300), img: p.img || '' };
  // RT = sadece metin güncellemesi: analiz tipine sabitle, işlem (entry/tp/sl/kaldıraç) alanlarını gizle
  alfaComposer.type = 'analiz';
  const ts = document.getElementById('at-typeseg'); if (ts) ts.style.display = 'none';
  document.querySelectorAll('.at-type').forEach(x => x.classList.toggle('on', x.getAttribute('data-attype') === 'analiz'));
  document.getElementById('at-islem-fields').style.display = 'none';
  const mt = document.getElementById('at-modal-title'); if (mt) mt.textContent = '🔁 RT / Güncelle';
  const txt = document.getElementById('at-f-text'); if (txt) txt.placeholder = 'Güncelleme / yorumunu yaz…';
  atRenderRepostBox(); atUpdatePreview();
}
function atStartAfter(pid) {
  atStartRepost(pid); // before = alıntılanan gönderi
  const mt = document.getElementById('at-modal-title'); if (mt) mt.textContent = '📊 Sonucu paylaş (after)';
  const txt = document.getElementById('at-f-text'); if (txt) txt.placeholder = 'Sonuç / kapanış yorumu (örn. TP geldi ✅ +2.4R)…';
  // "after" için işlem sonucu seçiciyi otomatik aç
  const box = document.getElementById('at-result-list'); if (box && box.style.display === 'none') atToggleResultList();
}
function atStartEdit(pid) {
  const p = alfaPosts.find(x => x.id === pid); if (!p) return;
  atOpenModal();
  alfaComposer.editId = p.id;
  alfaComposer.type = p.type || 'analiz';
  alfaComposer.dir = p.dir || 'long';
  alfaComposer.quote = p.quote || null;
  alfaComposer.repost = p.repost || null;
  const setv = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setv('at-f-coin', p.coin); setv('at-f-title', p.title); setv('at-f-text', p.text); setv('at-f-img', p.img);
  setv('at-f-entry', p.entry); setv('at-f-tp', p.tp); setv('at-f-sl', p.sl); setv('at-f-lev', p.lev); setv('at-f-risk', p.risk);
  const bias = document.getElementById('at-f-bias'); if (bias) bias.value = p.bias || '';
  document.querySelectorAll('.at-type').forEach(x => x.classList.toggle('on', x.getAttribute('data-attype') === alfaComposer.type));
  document.querySelectorAll('.at-dir').forEach(x => x.classList.toggle('on', x.getAttribute('data-atdir') === alfaComposer.dir));
  document.getElementById('at-islem-fields').style.display = alfaComposer.type === 'islem' ? '' : 'none';
  document.getElementById('at-f-imgprev').innerHTML = p.img ? '<img src="' + esc(p.img) + '" alt="">' : '';
  const mt = document.getElementById('at-modal-title'); if (mt) mt.textContent = '✏️ Gönderiyi Düzenle';
  const sb = document.getElementById('at-submit'); if (sb) sb.textContent = 'Kaydet';
  atRenderQuoteBox(); atRenderRepostBox(); atUpdatePreview();
}
function atOpenModal() {
  alfaComposer = { type: 'analiz', dir: 'long', quote: null, repost: null, editId: null };
  const mt = document.getElementById('at-modal-title'); if (mt) mt.textContent = 'Yeni Paylaşım';
  const sb = document.getElementById('at-submit'); if (sb) sb.textContent = 'Paylaş';
  const ts = document.getElementById('at-typeseg'); if (ts) ts.style.display = '';
  const txt = document.getElementById('at-f-text'); if (txt) txt.placeholder = 'Analiz / açıklama…';
  ['at-f-coin', 'at-f-title', 'at-f-text', 'at-f-entry', 'at-f-tp', 'at-f-sl', 'at-f-lev', 'at-f-risk', 'at-f-img'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const bias = document.getElementById('at-f-bias'); if (bias) bias.value = '';
  document.querySelectorAll('.at-type').forEach(b => b.classList.toggle('on', b.getAttribute('data-attype') === 'analiz'));
  document.querySelectorAll('.at-dir').forEach(b => b.classList.toggle('on', b.getAttribute('data-atdir') === 'long'));
  document.getElementById('at-islem-fields').style.display = 'none';
  document.getElementById('at-f-imgprev').innerHTML = '';
  document.getElementById('at-result-list').style.display = 'none';
  atRenderQuoteBox(); atRenderRepostBox(); atUpdatePreview();
  document.getElementById('at-modal').classList.add('open');
}
function atCloseModal() { document.getElementById('at-modal').classList.remove('open'); }

function atRenderQuoteBox() {
  const box = document.getElementById('at-quote-box'); if (!box) return;
  if (!alfaComposer.quote) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'block';
  box.innerHTML = '<button type="button" class="at-qx" id="at-qx">✕</button>' + atQuoteHtml(alfaComposer.quote);
}
function atUpdatePreview() {
  const prev = document.getElementById('at-live-prev'); if (!prev) return;
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const type = alfaComposer.type;
  const post = {
    id: 'prev', type, author: alfaMyName() || 'Admin', avatar: alfaMyAvatar(), isAdmin: true,
    coin: val('at-f-coin').toUpperCase(), bias: (document.getElementById('at-f-bias') || {}).value || '',
    title: val('at-f-title'), text: val('at-f-text'), img: val('at-f-img'),
    dir: type === 'islem' ? alfaComposer.dir : '',
    entry: type === 'islem' ? val('at-f-entry') : '', tp: type === 'islem' ? val('at-f-tp') : '', sl: type === 'islem' ? val('at-f-sl') : '',
    lev: type === 'islem' ? val('at-f-lev') : '', risk: type === 'islem' ? val('at-f-risk') : '',
    status: 'aktif', quote: alfaComposer.quote || null, repost: alfaComposer.repost || null, ts: Date.now(), likes: [], comments: [],
  };
  prev.innerHTML = atCardHtml(post);
}
function atQuoteBias() {
  let d = {};
  try { d = (typeof collectDaily === 'function') ? collectDaily() : {}; } catch (e) {}
  let dir = (d && d.bias) || (typeof dailyBias !== 'undefined' ? dailyBias : '');
  if (!dir) { const c = prompt('Bias yönü: 1=Bullish, 2=Bearish, 3=Nötr', '1'); dir = { '1': 'BULLISH', '2': 'BEARISH', '3': 'NÖTR' }[(c || '').trim()] || ''; if (!dir) return; }
  alfaComposer.quote = { kind: 'bias', dir, pair: (d && d.pair) || '', note: ((d && d.senaryo) || '').slice(0, 500) };
  atRenderQuoteBox(); atUpdatePreview();
}
function atToggleResultList() {
  const box = document.getElementById('at-result-list'); if (!box) return;
  if (box.style.display !== 'none') { box.style.display = 'none'; return; }
  const trades = (typeof dataTrades !== 'undefined' && Array.isArray(dataTrades)) ? dataTrades.filter(t => t.r !== '' && t.r != null) : [];
  if (!trades.length) { box.style.display = 'block'; box.innerHTML = '<div class="at-rrow" style="cursor:default">Sonucu girilmiş işlem bulunamadı.</div>'; return; }
  const sorted = trades.slice().sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 20);
  box.innerHTML = sorted.map(t => {
    const rn = parseFloat(String(t.r).replace(',', '.'));
    const col = isNaN(rn) ? 'var(--text-3)' : (rn >= 0 ? '#16a34a' : '#dc2626');
    return '<div class="at-rrow" data-atrid="' + t.id + '"><span>' + esc(t.pair || '') + ' ' + esc(t.dir || '') + '</span> · <b style="color:' + col + '">' + ((rn > 0 ? '+' : '') + t.r + 'R') + '</b> · ' + esc(t.verdict || '') + ' · ' + esc(t.date || '') + '</div>';
  }).join('');
  box.style.display = 'block';
}
function atPickResult(id) {
  const t = (typeof dataTrades !== 'undefined' ? dataTrades : []).find(x => String(x.id) === String(id)); if (!t) return;
  alfaComposer.quote = { kind: 'result', pair: t.pair || '', dir: t.dir || '', r: t.r || '', verdict: t.verdict || '', date: t.date || '', strat: t.strat || '' };
  const box = document.getElementById('at-result-list'); if (box) box.style.display = 'none';
  atRenderQuoteBox(); atUpdatePreview();
}
function atOpenProfile() {
  const p = alfaProfile();
  document.getElementById('at-p-name').value = p.name || '';
  document.getElementById('at-p-avatar').value = p.avatar || '';
  atRenderProfPrev();
  document.getElementById('at-pmodal').classList.add('open');
}
function atRenderProfPrev() {
  const name = (document.getElementById('at-p-name').value || alfaMyName() || 'Admin').trim();
  const av = (document.getElementById('at-p-avatar').value || '').trim();
  const el = document.getElementById('at-prof-prev'); if (!el) return;
  el.innerHTML = '<div class="at-avatar">' + (/^https?:\/\//.test(av) ? '<img src="' + esc(av) + '" alt="">' : esc((name || 'A').charAt(0).toUpperCase())) + '</div>' +
    '<div><div class="nm">' + esc(name) + '</div><div class="at-time">Admin</div></div>';
}
async function atSaveProfile() {
  const name = (document.getElementById('at-p-name').value || '').trim().slice(0, 40);
  const avatar = (document.getElementById('at-p-avatar').value || '').trim();
  alfaSaveProfile({ name, avatar });
  document.getElementById('at-pmodal').classList.remove('open');
  let email = ''; try { email = (AUTH && AUTH.user) ? AUTH.user.email : ''; } catch (e) {}
  // geçmiş gönderilerdeki isim/foto da güncellensin
  alfaPosts.forEach(p => { if (email && p.authorEmail === email) { if (name) p.author = name; p.avatar = avatar; } });
  renderAlfaFeed();
  if (email) { try { await atApi('profileUpdate', { email, name, avatar }); } catch (e) {} loadAlfaTrading(); }
}
async function atSubmit() {
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const type = alfaComposer.type;
  const text = val('at-f-text'), title = val('at-f-title');
  if (!text && !title && !val('at-f-coin')) { alert('En azından başlık, coin ya da metin gir.'); return; }
  const post = {
    type, author: alfaMyName() || 'Admin', avatar: alfaMyAvatar(), authorEmail: (function () { try { return AUTH && AUTH.user ? AUTH.user.email : ''; } catch (e) { return ''; } })(),
    coin: val('at-f-coin'), bias: (document.getElementById('at-f-bias') || {}).value || '',
    title, text, img: val('at-f-img'),
    dir: type === 'islem' ? alfaComposer.dir : '',
    entry: type === 'islem' ? val('at-f-entry') : '', tp: type === 'islem' ? val('at-f-tp') : '', sl: type === 'islem' ? val('at-f-sl') : '',
    lev: type === 'islem' ? val('at-f-lev') : '', risk: type === 'islem' ? val('at-f-risk') : '',
    quote: alfaComposer.quote || null, repost: alfaComposer.repost || null,
  };
  const btn = document.getElementById('at-submit'); const editing = !!alfaComposer.editId;
  if (btn) { btn.disabled = true; btn.textContent = editing ? 'Kaydediliyor…' : 'Paylaşılıyor…'; }
  let r;
  if (editing) {
    r = await atApi('edit', { postId: alfaComposer.editId, post });
    if (r && r.ok) { const i = alfaPosts.findIndex(x => x.id === alfaComposer.editId); if (i >= 0) Object.assign(alfaPosts[i], post, { edited: true }); }
  } else {
    r = await atApi('add', { post });
    if (r && r.ok && r.post) alfaPosts.unshift(r.post);
  }
  if (btn) { btn.disabled = false; btn.textContent = editing ? 'Kaydet' : 'Paylaş'; }
  if (r && r.ok) { atCloseModal(); renderAlfaFeed(); }
  else alert((editing ? 'Kaydedilemedi: ' : 'Paylaşılamadı: ') + ((r && r.error) || 'bilinmeyen hata'));
}
/* ---- Dış paylaşım: markalı sonuç görseli + teaser + link ---- */
let atShareState = { pid: '', teaser: false, dataUrl: '' };
function atShareLink(pid) { return location.origin + location.pathname + '?page=alfatrading&post=' + encodeURIComponent(pid); }
function atToast(msg) { const t = document.getElementById('at-toast'); if (!t) return; t.textContent = msg; t.classList.add('on'); clearTimeout(atToast._t); atToast._t = setTimeout(() => t.classList.remove('on'), 1900); }
function atRR(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function atWrap(c, text, x, y, maxW, lh, maxLines) {
  if (!text) return y;
  const words = String(text).split(/\s+/); let line = '', lines = 0;
  for (let i = 0; i < words.length; i++) {
    const t = line ? line + ' ' + words[i] : words[i];
    if (c.measureText(t).width > maxW && line) {
      c.fillText(line, x, y); y += lh; line = words[i];
      if (++lines >= maxLines) { c.fillText('…', x, y); return y; }
    } else line = t;
  }
  c.fillText(line, x, y); return y;
}
function atMakeShareCanvas(p, teaser) {
  const W = 1080, H = 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0b1220'); g.addColorStop(1, '#0e1c2e');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = '#2aabee'; c.fillRect(0, 0, W, 12);
  c.fillStyle = '#7fa8c4'; c.font = '800 36px Inter, Arial, sans-serif'; c.fillText('ALFA TRADING', 70, 116);
  c.textAlign = 'right'; c.fillStyle = '#cbd5e1'; c.font = '600 30px Inter, Arial, sans-serif'; c.fillText('@' + (p.author || 'admin'), W - 70, 116); c.textAlign = 'left';
  c.fillStyle = '#ffffff'; c.font = '800 132px Inter, Arial, sans-serif'; c.fillText((p.coin || 'ALFA'), 70, 300);
  const dir = String(p.dir || (p.quote && p.quote.dir) || '').toUpperCase();
  if (dir === 'LONG' || dir === 'SHORT') {
    const isL = dir === 'LONG'; c.fillStyle = isL ? '#16a34a' : '#dc2626'; atRR(c, 70, 336, 250, 74, 18); c.fill();
    c.fillStyle = '#fff'; c.font = '800 42px Inter, Arial, sans-serif'; c.fillText(isL ? 'LONG' : 'SHORT', 102, 388);
  }
  c.fillStyle = '#dbe4ee'; c.font = '600 42px Inter, Arial, sans-serif'; atWrap(c, p.title || '', 70, 500, W - 140, 54, 2);
  // sonuç kutusu
  c.fillStyle = '#0f2136'; atRR(c, 70, 630, W - 140, 250, 26); c.fill();
  c.fillStyle = '#7c93a8'; c.font = '700 30px Inter, Arial, sans-serif'; c.fillText('SONUÇ', 110, 702);
  const rq = (p.quote && p.quote.kind === 'result') ? p.quote : null;
  if (rq && rq.verdict) { c.textAlign = 'right'; c.fillStyle = '#94a3b8'; c.font = '800 40px Inter, Arial, sans-serif'; c.fillText(rq.verdict, W - 110, 704); c.textAlign = 'left'; }
  let rTxt = '', rn = NaN;
  if (rq) { rn = parseFloat(String(rq.r).replace(',', '.')); rTxt = (isNaN(rn) ? String(rq.r) : (rn > 0 ? '+' : '') + rq.r) + 'R'; }
  else if (p.type === 'islem') { rTxt = ({ aktif: 'AKTİF', tp: 'TP GELDİ', sl: 'SL', iptal: 'İPTAL' })[p.status] || 'AKTİF'; }
  if (rTxt && !teaser) {
    c.fillStyle = (!isNaN(rn) ? (rn >= 0 ? '#22c55e' : '#ef4444') : '#e2e8f0'); c.font = '800 118px Inter, Arial, sans-serif'; c.fillText(rTxt, 110, 838);
  } else {
    c.save(); c.filter = 'blur(20px)'; c.fillStyle = '#22c55e'; c.font = '800 118px Inter, Arial, sans-serif'; c.fillText('+ ? . ? R', 110, 832); c.restore();
    c.fillStyle = '#e2e8f0'; c.font = '700 40px Inter, Arial, sans-serif'; c.fillText('🔒 Sonucu görmek için linke tıkla', 110, 800);
  }
  c.fillStyle = '#2aabee'; c.font = '800 42px Inter, Arial, sans-serif'; c.fillText('alfa-trader.com', 70, 992);
  c.fillStyle = '#64748b'; c.font = '600 28px Inter, Arial, sans-serif'; c.fillText('Analiz · İşlem · Topluluk', 70, 1034);
  return cv;
}
function atRenderShare() {
  const p = alfaPosts.find(x => x.id === atShareState.pid); if (!p) return;
  try { atShareState.dataUrl = atMakeShareCanvas(p, atShareState.teaser).toDataURL('image/png'); } catch (e) { atShareState.dataUrl = ''; }
  const img = document.getElementById('at-share-img'); if (img && atShareState.dataUrl) img.src = atShareState.dataUrl;
}
function atShareOpen(pid) {
  atShareState = { pid: pid, teaser: false, dataUrl: '' };
  const tc = document.getElementById('at-share-teaser'); if (tc) tc.checked = false;
  atRenderShare();
  document.getElementById('at-smodal').classList.add('open');
}
async function atShareGo() {
  const link = atShareLink(atShareState.pid);
  const p = alfaPosts.find(x => x.id === atShareState.pid);
  const text = (p && p.title ? p.title + ' — ' : '') + 'Alfa Trading';
  try {
    if (atShareState.dataUrl && navigator.canShare) {
      const blob = await (await fetch(atShareState.dataUrl)).blob();
      const file = new File([blob], 'alfa-trading.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: text + '\n' + link }); return; }
    }
    if (navigator.share) { await navigator.share({ title: 'Alfa Trading', text: text, url: link }); return; }
    await navigator.clipboard.writeText(link); atToast('Bağlantı kopyalandı ✓');
  } catch (e) { try { await navigator.clipboard.writeText(link); atToast('Bağlantı kopyalandı ✓'); } catch (_) {} }
}
function atShareCopy() { const link = atShareLink(atShareState.pid); (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => atToast('Bağlantı kopyalandı ✓')).catch(() => { prompt('Bağlantıyı kopyala:', link); }); }
function atShareDownload() { if (!atShareState.dataUrl) return; const a = document.createElement('a'); a.href = atShareState.dataUrl; a.download = 'alfa-trading-' + atShareState.pid + '.png'; document.body.appendChild(a); a.click(); a.remove(); }

function bindAlfaTrading() {
  const nb = document.getElementById('at-new-btn'); if (nb) nb.addEventListener('click', atOpenModal);
  const mx = document.getElementById('at-modal-x'); if (mx) mx.addEventListener('click', atCloseModal);
  const cc = document.getElementById('at-cancel'); if (cc) cc.addEventListener('click', atCloseModal);
  const sub = document.getElementById('at-submit'); if (sub) sub.addEventListener('click', atSubmit);
  const modal = document.getElementById('at-modal'); if (modal) modal.addEventListener('click', e => { if (e.target === modal) atCloseModal(); });
  document.querySelectorAll('.at-type').forEach(b => b.addEventListener('click', () => {
    alfaComposer.type = b.getAttribute('data-attype');
    document.querySelectorAll('.at-type').forEach(x => x.classList.toggle('on', x === b));
    document.getElementById('at-islem-fields').style.display = alfaComposer.type === 'islem' ? '' : 'none';
    atUpdatePreview();
  }));
  document.querySelectorAll('.at-dir').forEach(b => b.addEventListener('click', () => {
    alfaComposer.dir = b.getAttribute('data-atdir');
    document.querySelectorAll('.at-dir').forEach(x => x.classList.toggle('on', x === b));
    atUpdatePreview();
  }));
  const img = document.getElementById('at-f-img');
  if (img) img.addEventListener('input', () => { const v = img.value.trim(); document.getElementById('at-f-imgprev').innerHTML = /^https?:\/\//.test(v) ? '<img src="' + esc(v) + '" alt="">' : ''; });
  const mbody = document.querySelector('#at-modal .at-modal-body');
  if (mbody) mbody.addEventListener('input', atUpdatePreview);
  // alıntı butonları
  const qb = document.getElementById('at-q-bias'); if (qb) qb.addEventListener('click', atQuoteBias);
  const qr = document.getElementById('at-q-result'); if (qr) qr.addEventListener('click', atToggleResultList);
  const rlist = document.getElementById('at-result-list'); if (rlist) rlist.addEventListener('click', e => { const r = e.target.closest('[data-atrid]'); if (r) atPickResult(r.getAttribute('data-atrid')); });
  const qbox = document.getElementById('at-quote-box'); if (qbox) qbox.addEventListener('click', e => { if (e.target.closest('#at-qx')) { alfaComposer.quote = null; atRenderQuoteBox(); atUpdatePreview(); } });
  const rbox = document.getElementById('at-repost-box'); if (rbox) rbox.addEventListener('click', e => { if (e.target.closest('#at-rtx')) { alfaComposer.repost = null; atRenderRepostBox(); atUpdatePreview(); } });
  // görsel yükle / yapıştır — post
  const upl = document.getElementById('at-f-upl'); const file = document.getElementById('at-f-file');
  if (upl && file) { upl.addEventListener('click', () => file.click()); file.addEventListener('change', () => { if (file.files && file.files[0]) atSetPostImage(file.files[0]); file.value = ''; }); }
  if (modal) modal.addEventListener('paste', e => atPasteImageFrom(e, atSetPostImage));
  // görsel yükle / yapıştır — profil avatar
  const pupl = document.getElementById('at-p-upl'); const pfile = document.getElementById('at-p-file');
  if (pupl && pfile) { pupl.addEventListener('click', () => pfile.click()); pfile.addEventListener('change', () => { if (pfile.files && pfile.files[0]) atSetAvatarImage(pfile.files[0]); pfile.value = ''; }); }
  const pmodalEl = document.getElementById('at-pmodal'); if (pmodalEl) pmodalEl.addEventListener('paste', e => atPasteImageFrom(e, atSetAvatarImage));
  // dış paylaşım modalı
  const smx = document.getElementById('at-smodal-x'); if (smx) smx.addEventListener('click', () => document.getElementById('at-smodal').classList.remove('open'));
  const smodal = document.getElementById('at-smodal'); if (smodal) smodal.addEventListener('click', e => { if (e.target === smodal) smodal.classList.remove('open'); });
  const steaser = document.getElementById('at-share-teaser'); if (steaser) steaser.addEventListener('change', () => { atShareState.teaser = steaser.checked; atRenderShare(); });
  const scopy = document.getElementById('at-share-copy'); if (scopy) scopy.addEventListener('click', atShareCopy);
  const sdl = document.getElementById('at-share-dl'); if (sdl) sdl.addEventListener('click', atShareDownload);
  const sgo = document.getElementById('at-share-go'); if (sgo) sgo.addEventListener('click', atShareGo);
  // profil
  const profBtn = document.getElementById('at-prof-btn'); if (profBtn) profBtn.addEventListener('click', atOpenProfile);
  const pmx = document.getElementById('at-pmodal-x'); if (pmx) pmx.addEventListener('click', () => document.getElementById('at-pmodal').classList.remove('open'));
  const pmc = document.getElementById('at-pmodal-cancel'); if (pmc) pmc.addEventListener('click', () => document.getElementById('at-pmodal').classList.remove('open'));
  const pms = document.getElementById('at-pmodal-save'); if (pms) pms.addEventListener('click', atSaveProfile);
  const pmodal = document.getElementById('at-pmodal'); if (pmodal) pmodal.addEventListener('click', e => { if (e.target === pmodal) pmodal.classList.remove('open'); });
  ['at-p-name', 'at-p-avatar'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', atRenderProfPrev); });
  document.querySelectorAll('.at-fbtn').forEach(b => b.addEventListener('click', () => {
    alfaFilter = b.getAttribute('data-atf');
    document.querySelectorAll('.at-fbtn').forEach(x => x.classList.toggle('on', x === b));
    renderAlfaFeed();
  }));
  const cs = document.getElementById('at-coin-search'); if (cs) cs.addEventListener('input', () => { alfaCoinQ = cs.value; renderAlfaFeed(); });
  const feed = document.getElementById('at-feed');
  if (feed) feed.addEventListener('click', e => {
    const t = e.target;
    const like = t.closest('[data-atlike]'); if (like) return atToggleLike(like.getAttribute('data-atlike'));
    const com = t.closest('[data-atcom]'); if (com) { const b = document.getElementById('at-com-' + com.getAttribute('data-atcom')); if (b) b.classList.toggle('open'); return; }
    const csend = t.closest('[data-atcsend]'); if (csend) return atSendComment(csend.getAttribute('data-atcsend'));
    const ed = t.closest('[data-atedit]'); if (ed) return atStartEdit(ed.getAttribute('data-atedit'));
    const pdel = t.closest('[data-atpdel]'); if (pdel) return atDelPost(pdel.getAttribute('data-atpdel'));
    const cdel = t.closest('[data-atcdel]'); if (cdel) { const [pi, ci] = cdel.getAttribute('data-atcdel').split('|'); return atDelComment(pi, ci); }
    const sh = t.closest('[data-atshare]'); if (sh) return atShareOpen(sh.getAttribute('data-atshare'));
    const rt = t.closest('[data-atrt]'); if (rt) return atStartRepost(rt.getAttribute('data-atrt'));
    const af = t.closest('[data-atafter]'); if (af) return atStartAfter(af.getAttribute('data-atafter'));
    const tool = t.closest('[data-attool]'); if (tool) return atToolSend(tool.getAttribute('data-attool'));
    const stt = t.closest('[data-atstatus]'); if (stt) return atSetStatus(stt.getAttribute('data-atstatus'));
    const im = t.closest('[data-atimg]'); if (im) { try { window.open(im.getAttribute('data-atimg'), '_blank', 'noopener'); } catch (e) {} }
  });
  if (feed) feed.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const inp = e.target.closest('[data-atcinput]'); if (inp) { e.preventDefault(); atSendComment(inp.getAttribute('data-atcinput')); } }
  });
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
    g('riskValueLabel').textContent = t('pg.calc.riskPct');
    g('riskValue').setAttribute('max', '100');
  } else {
    g('riskValueLabel').textContent = t('pg.calc.riskAmt');
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

// ============ Açılış + Giriş/Kayıt akışı ============
let APP_BOOTED = false;
async function bootApp(opts) {
  if (APP_BOOTED) return;
  APP_BOOTED = true;
  if (opts && opts.seed) { try { await seedIfEmpty(); } catch (e) { /* boş başla */ } }
  try { await loadConfig(); } catch (e) { /* devam */ }
  try { await loadAiProfile(); } catch (e) { /* devam */ }
  try { await loadData(); } catch (e) { /* devam */ }
  try { await loadNews(); } catch (e) { /* devam */ }
  try { await loadMentor(); } catch (e) { /* devam */ }
  try { await loadReviews(); } catch (e) { /* devam */ }
  try { await loadEgitim(); } catch (e) { /* devam */ }
  try { await loadStrat(); } catch (e) { /* devam */ }
  try { await loadAnaliz(); } catch (e) { /* devam */ }
  try { await loadDesigner(); } catch (e) { /* devam */ }
  try { init(); } catch (e) { /* devam */ }
  showPage(currentPage);
}

async function refreshAppData() {
  try { await loadConfig(); } catch (e) { /* devam */ }
  try { await loadData(); } catch (e) { /* devam */ }
  try { await loadNews(); } catch (e) { /* devam */ }
  try { await loadMentor(); } catch (e) { /* devam */ }
  try { await loadReviews(); } catch (e) { /* devam */ }
  try { await loadEgitim(); } catch (e) { /* devam */ }
  try { await loadStrat(); } catch (e) { /* devam */ }
  try { await loadAnaliz(); } catch (e) { /* devam */ }
  try { await loadDesigner(); } catch (e) { /* devam */ }
  try { await loadTrades(); renderTrades(); } catch (e) { /* devam */ }
  try { await loadLessons(); renderLessons(); } catch (e) { /* devam */ }
  try { if (typeof loadDaily === 'function') loadDaily(); } catch (e) { /* devam */ }
  try { if (typeof render === 'function') render(); } catch (e) { /* devam */ }
  try { if (typeof renderRRcum === 'function') renderRRcum(); } catch (e) { /* devam */ }
  showPage(currentPage, true);
}

function showGate() { document.getElementById('auth-gate').classList.add('open'); }
function hideGate() { document.getElementById('auth-gate').classList.remove('open'); }
function showLanding() { document.body.classList.add('landed'); document.getElementById('landing').classList.add('open'); try { renderSiteReviews(); } catch (e) {} }
function hideLanding() { document.body.classList.remove('landed'); document.getElementById('landing').classList.remove('open'); }

function migrateLegacyLocal() {
  // Bu tarayıcıda hesapsız kullanılmış eski verileri (varsa) yeni hesaba taşı.
  try {
    Object.keys(localStorage).forEach(k => {
      const keep = (k === STORAGE_KEY || k === TRADES_KEY || k === LESSONS_KEY || k === DATA_KEY || k === NEWS_KEY || k === REVIEW_KEY || k === REVIEW_CFG_KEY || k === EGITIM_KEY || k === MT_KEY || k === AI_PROFILE_KEY || k === DESIGNER_KEY || k.indexOf(DAILY_PREFIX) === 0);
      if (keep && !(k in AUTH.cloud)) AUTH.cloud[k] = localStorage.getItem(k);
    });
  } catch (e) { /* erişilemedi */ }
}

async function onAuthed(user) {
  AUTH.user = user;
  AUTH.ns = 'u:' + user.id + ':';
  // Buluttan bu kullanıcının verisini çek
  let data = null;
  try {
    const res = await AUTH.client.from('journals').select('data').eq('user_id', user.id).maybeSingle();
    if (res && res.data && res.data.data && typeof res.data.data === 'object') data = res.data.data;
  } catch (e) { /* çevrimdışı — yerel aynadan devam */ }
  if (!data) {
    data = {};
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.indexOf(AUTH.ns) === 0) data[k.slice(AUTH.ns.length)] = localStorage.getItem(k);
      });
    } catch (e) { /* yok */ }
  }
  AUTH.cloud = data;
  // Yerel (hesapsız) verileri hesaba taşı: bulut boş olsun olmasın,
  // yalnızca bulutta OLMAYAN anahtarlar kopyalanır (mevcut veri ezilmez).
  migrateLegacyLocal();

  const nm = (user.user_metadata && user.user_metadata.name) || (user.email || '').split('@')[0];
  document.getElementById('user-name').textContent = nm;
  document.getElementById('user-badge').classList.remove('hidden');
  const nlAppBtn = document.getElementById('nav-login-app');
  if (nlAppBtn) nlAppBtn.style.display = 'none';
  // Admin kontrolü: sadece admin görebilir
  const isAdmin = (user.email || '').toLowerCase() === ADMIN_EMAIL;
  const adminTab = document.getElementById('tab-chat-admin');
  if (adminTab) adminTab.style.display = isAdmin ? '' : 'none';
  // Alfa Man: sadece admin hesabında
  const amTab = document.getElementById('tab-alfa');
  const amMob = document.getElementById('mnav-alfa');
  if (amTab) amTab.style.display = isAdmin ? '' : 'none';
  if (amMob) amMob.style.display = isAdmin ? '' : 'none';
  // Başvurular: sadece admin hesabında
  const apTab = document.getElementById('tab-apps');
  const apMob = document.getElementById('mnav-apps');
  if (apTab) apTab.style.display = isAdmin ? '' : 'none';
  if (apMob) apMob.style.display = isAdmin ? '' : 'none';
  // Mentoring erişimi: sadece Ahmet + Çağatay (e-postası sonradan eklenecek)
  const mtDesk = document.getElementById('tab-mentoring');
  const mtMob = document.getElementById('mnav-mentoring');
  const mtOk = mtAllowed();
  if (mtDesk) mtDesk.style.display = mtOk ? '' : 'none';
  if (mtMob) mtMob.style.display = mtOk ? '' : 'none';
  hideGate();
  hideLanding();
  const wrap = document.querySelector('.wrap');
  if (wrap) wrap.classList.remove('hidden');
  await refreshAppData();
  scheduleCloudSync();
  handleNotionHash();
  try { renderSiteReviews(); } catch (e) {}
  // Yorum yazmak için landing'den giriş yapıldıysa landing'e geri dön ve formu aç
  if (RV_PENDING) {
    RV_PENDING = false;
    showLanding();
    var rb = document.getElementById('lp-nav-rv-btn');
    if (rb && rb.getAttribute('aria-expanded') !== 'true') {
      setTimeout(function () { rb.click(); }, 250);
    }
  }
}

function authError(err) {
  const m = (err && err.message) ? err.message : '';
  if (/Invalid login/i.test(m)) return 'E-posta veya şifre hatalı.';
  if (/already registered/i.test(m)) return 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.';
  if (/Email not confirmed/i.test(m)) return 'E-postan henüz onaylanmamış. Gelen kutunu kontrol et.';
  if (/least 6/i.test(m)) return 'Şifre en az 6 karakter olmalı.';
  if (/rate limit|too many/i.test(m)) return 'Çok fazla deneme oldu, biraz bekle.';
  return m || 'Bir hata oldu, tekrar dene.';
}

function bootAuth() {
  AUTH.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  let mode = 'login';
  // Şifre sıfırlama bağlantısıyla mı gelindi? (URL'de recovery işareti)
  let recovering = /type=recovery/.test(window.location.hash) || /type=recovery/.test(window.location.search);
  const msg = (t, cls) => { const el = $('au-msg'); el.textContent = t; el.className = 'auth-msg' + (cls ? ' ' + cls : ''); };
  // "Beni hatırla" — giriş bilgilerini bu cihazda sakla, form açılınca doldur
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
  // Modlar: login | register | reset (sıfırlama isteği) | newpass (yeni şifre belirle)
  const setMode = m => {
    mode = m;
    const isLogin = m === 'login', isReg = m === 'register', isReset = m === 'reset', isNew = m === 'newpass';
    $('tab-login').classList.toggle('on', isLogin);
    $('tab-register').classList.toggle('on', isReg);
    document.querySelector('.auth-tabs').classList.toggle('hidden', isReset || isNew);
    $('f-name').classList.toggle('hidden', !isReg);
    $('f-email').classList.toggle('hidden', isNew);   // yeni şifre modunda e-posta yok
    $('f-pass').classList.toggle('hidden', isReset);  // sıfırlama isteğinde şifre yok
    $('forgot-link').classList.toggle('hidden', !isLogin);
    $('back-login').classList.toggle('hidden', !isReset);
    if ($('f-remember')) $('f-remember').classList.toggle('hidden', !isLogin);
    $('au-submit').textContent = isReg ? 'Kayıt ol' : isReset ? 'Sıfırlama bağlantısı gönder' : isNew ? 'Şifreyi güncelle' : 'Giriş yap';
    $('au-pass').setAttribute('autocomplete', (isReg || isNew) ? 'new-password' : 'current-password');
    $('au-pass').setAttribute('placeholder', isNew ? 'Yeni şifre (en az 6 karakter)' : 'En az 6 karakter');
    if (isLogin) rememberPrefill();
    msg('', '');
  };
  $('tab-login').addEventListener('click', () => setMode('login'));
  $('tab-register').addEventListener('click', () => setMode('register'));
  $('forgot-link').addEventListener('click', () => setMode('reset'));
  $('back-login').addEventListener('click', () => setMode('login'));
  // Tanıtım sayfası -> giriş penceresi
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
  // Şifre sıfırlama bağlantısına tıklayınca Supabase bu olayı tetikler
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
        if (!email) { msg('E-postanı yaz.', 'err'); return; }
        const redirectTo = window.location.origin + window.location.pathname;
        const { error } = await AUTH.client.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        msg('Sıfırlama bağlantısı e-postana gönderildi. Gelen kutunu (ve spam) kontrol et.', 'ok');
      } else if (mode === 'newpass') {
        if (pass.length < 6) { msg('Yeni şifre en az 6 karakter olmalı.', 'err'); return; }
        const { error } = await AUTH.client.auth.updateUser({ password: pass });
        if (error) throw error;
        recovering = false;
        try { history.replaceState(null, '', window.location.pathname); } catch (e2) {}
        msg('Şifren güncellendi, giriş yapılıyor…', 'ok');
        const { data } = await AUTH.client.auth.getUser();
        if (data && data.user) await onAuthed(data.user);
      } else if (mode === 'register') {
        if (!email || pass.length < 6) { msg('E-posta ve en az 6 karakterli şifre gerekli.', 'err'); return; }
        if (!name) { msg('Lütfen isminizi yazın.', 'err'); return; }
        const { data, error } = await AUTH.client.auth.signUp({ email, password: pass, options: { data: { name } } });
        if (error) throw error;
        if (data && data.session && data.user) { saveRemember(email, pass, true); await onAuthed(data.user); return; }
        msg('Kayıt alındı. E-posta onayı gerekiyorsa gelen kutunu kontrol et, sonra giriş yap.', 'ok');
        setMode('login');
      } else {
        if (!email || pass.length < 6) { msg('E-posta ve en az 6 karakterli şifre gerekli.', 'err'); return; }
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
  // Mevcut oturum var mı? Sıfırlama akışındaysak yeni şifre ekranını göster.
  AUTH.client.auth.getSession()
    .then(({ data }) => {
      if (recovering) { showGate(); setMode('newpass'); return; }
      if (data && data.session && data.session.user) onAuthed(data.session.user);
      else showLanding();
    })
    .catch(() => { if (recovering) { showGate(); setMode('newpass'); } else showLanding(); });
}

// ============ Site istatistikleri (çevrimiçi + toplam ziyaret) ============
var STATS_WINDOW = 90000;   // 90 sn içinde heartbeat'ı görünenler "çevrimiçi"
var STATS_TOTAL = null;
var STATS_REG = null;

function statsVid() {
  try {
    var v = localStorage.getItem('at_visitor_v1');
    if (!v) {
      v = 'v' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('at_visitor_v1', v);
    }
    return v;
  } catch (e) { return 'v' + Date.now().toString(36); }
}

function statsRender(online) {
  if (typeof online === 'number') {
    var e1 = document.getElementById('nav-live-online'); if (e1) e1.textContent = online;
    var e2 = document.getElementById('lp-live-online'); if (e2) e2.textContent = online;
  }
  if (typeof STATS_TOTAL === 'number') {
    var t = STATS_TOTAL.toLocaleString('tr-TR');
    var e3 = document.getElementById('nav-live-total'); if (e3) e3.textContent = t;
    var e4 = document.getElementById('lp-live-total'); if (e4) e4.textContent = t;
  }
  if (typeof STATS_REG === 'number') {
    var r = STATS_REG.toLocaleString('tr-TR');
    var e5 = document.getElementById('nav-live-reg'); if (e5) e5.textContent = r;
    var e6 = document.getElementById('lp-live-reg'); if (e6) e6.textContent = r;
    var e7 = document.getElementById('lp-proof-users'); if (e7) e7.textContent = r;
  }
}

function statsRefresh() {
  if (!AUTH || !AUTH.client) return;
  AUTH.client.from('presence')
    .select('id', { count: 'exact', head: true })
    .gt('last_seen', new Date(Date.now() - STATS_WINDOW).toISOString())
    .then(function (r) {
      statsRender(r && !r.error && typeof r.count === 'number' ? r.count : null);
    })
    .catch(function () { statsRender(null); });
}

function statsHeartbeat() {
  if (!AUTH || !AUTH.client) return;
  var vid = statsVid();
  AUTH.client.from('presence')
    .upsert({ visitor_id: vid, last_seen: new Date().toISOString() }, { onConflict: 'visitor_id' })
    .then(function () {
      return AUTH.client.from('presence')
        .delete()
        .lt('last_seen', new Date(Date.now() - STATS_WINDOW).toISOString());
    })
    .then(function () { statsRefresh(); })
    .catch(function () {});
}

function statsFetchTotal() {
  if (!AUTH || !AUTH.client) return;
  AUTH.client.from('site_stats')
    .select('total_visits')
    .eq('id', 1)
    .maybeSingle()
    .then(function (r) {
      if (r && !r.error && r.data && typeof r.data.total_visits === 'number') {
        STATS_TOTAL = r.data.total_visits;
        statsRender(null);
      }
    })
    .catch(function () {});
}

function statsFetchReg() {
  if (!AUTH || !AUTH.client) return;
  AUTH.client.from('profiles')
    .select('id', { count: 'exact', head: true })
    .then(function (r) {
      if (r && !r.error && typeof r.count === 'number') {
        STATS_REG = r.count;
        statsRender(null);
      }
    })
    .catch(function () {});
}

function statsCountTotal() {
  if (!AUTH || !AUTH.client) return;
  AUTH.client.rpc('increment_total')
    .then(function (r) {
      if (r && !r.error && typeof r.data === 'number') {
        try { localStorage.setItem('at_visit_done_v1', '1'); } catch (e) {}
        STATS_TOTAL = r.data;
        statsRender(null);
      }
    })
    .catch(function () {});
}

function statsInit() {
  if (!AUTH_ENABLED || !AUTH || !AUTH.client) return;
  var done = false;
  try { done = !!localStorage.getItem('at_visit_done_v1'); } catch (e) {}
  if (done) statsFetchTotal();
  else statsCountTotal();
  statsFetchReg();
  statsHeartbeat();
  setInterval(statsHeartbeat, 30000);
  setInterval(statsRefresh, 15000);
  setInterval(statsFetchTotal, 30000);
}

// ============ Mentoring (ortak eğitim — Ahmet + Çağatay) ============
var MT_KEY = 'alfa-mentoring-v1';
// Çağatay'ın e-postası sonradan eklenecek. Örn: MENTOR_EMAILS.push('cagatay@mail.com');
var MENTOR_EMAILS = [];
var mtData = { topics: [] };
var mtSel = null;
var mtSaveTimer = null;

function mtAllowed() {
  try {
    if (!AUTH || !AUTH.user) return false;
    const em = (AUTH.user.email || '').toLowerCase();
    return em === ADMIN_EMAIL || MENTOR_EMAILS.indexOf(em) >= 0;
  } catch (e) { return false; }
}
function mtTopic(id) { return mtData.topics.find(t => t.id === id) || null; }

async function loadMentor() {
  let d = null;
  try {
    if (typeof AUTH !== 'undefined' && AUTH.client) {
      const res = await AUTH.client.from('alfanews').select('data').eq('id', 2).maybeSingle();
      if (res && res.data && res.data.data) d = res.data.data;
    }
  } catch (e) { /* tablo yok / çevrimdışı */ }
  if (!d) { try { const raw = await store.get(MT_KEY); d = raw ? JSON.parse(raw) : null; } catch (e) { d = null; } }
  if (!d || typeof d !== 'object') d = {};
  if (!Array.isArray(d.topics)) d.topics = [];
  d.topics.forEach(t => {
    if (typeof t.id !== 'string') t.id = rid();
    if (typeof t.title !== 'string') t.title = '';
    if (typeof t.notes !== 'string') t.notes = '';
    if (!Array.isArray(t.images)) t.images = [];
    if (!Array.isArray(t.imgNotes)) t.imgNotes = [];
    if (typeof t.createdAt !== 'string') t.createdAt = '';
  });
  mtData = d;
  if (mtSel && !mtTopic(mtSel)) mtSel = null;
}

async function saveMentor() {
  const json = JSON.stringify(mtData);
  try { await store.set(MT_KEY, json); } catch (e) { /* yerel */ }
  if (mtAllowed()) {
    try { if (typeof AUTH !== 'undefined' && AUTH.client && AUTH.user) await AUTH.client.from('alfanews').upsert({ id: 2, data: mtData, updated_at: new Date().toISOString() }); } catch (e) { /* tablo yok */ }
  }
}
function mtSaveT() { clearTimeout(mtSaveTimer); mtSaveTimer = setTimeout(() => saveMentor(), 500); }

function renderMentor() {
  const list = document.getElementById('mt-list');
  const empty = document.getElementById('mt-empty');
  const notice = document.getElementById('mt-notice');
  const detail = document.getElementById('mt-detail');
  const addBtn = document.getElementById('mt-add-topic');
  if (!list || !empty || !detail) return;
  const allowed = mtAllowed();
  if (addBtn) addBtn.style.display = allowed ? '' : 'none';
  if (!allowed) {
    if (notice) { notice.classList.remove('hidden'); notice.textContent = 'Bu panel yalnızca Ahmet ve Çağatay içindir — izinli e-postanla giriş yapmalısın.'; }
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.textContent = 'Bu panel için yetkin yok.';
    detail.innerHTML = '<div class="data-empty">Bu panel yalnızca Ahmet ve Çağatay içindir.</div>';
    return;
  }
  if (notice) notice.classList.add('hidden');
  empty.textContent = 'Henüz konu yok. "+ Konu" ile başla.';
  list.innerHTML = mtData.topics.map((t, i) =>
    '<button type="button" class="eg-item' + (t.id === mtSel ? ' on' : '') + '" data-mt-id="' + esc(t.id) + '">' +
    '<span class="eg-item-idx">' + (i + 1) + '</span>' +
    '<span class="eg-item-t">' + esc(t.title || '(Başlıksız)') + '</span>' +
    ((t.images && t.images.length) ? '<span class="eg-item-tag">' + t.images.length + ' 📷</span>' : '') +
    '<button type="button" class="eg-item-del" data-mt-del="' + esc(t.id) + '" title="Konuyu sil">✕</button>' +
    '</button>'
  ).join('');
  empty.classList.toggle('hidden', mtData.topics.length > 0);
  list.querySelectorAll('.eg-item').forEach(btn => {
    btn.addEventListener('click', e => {
      if (e.target.closest('[data-mt-del]')) return;
      mtSel = btn.getAttribute('data-mt-id');
      renderMentor();
    });
  });
  list.querySelectorAll('[data-mt-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!window.confirm('Konu silinecek, emin misin?')) return;
      const id = btn.getAttribute('data-mt-del');
      mtData.topics = mtData.topics.filter(t => t.id !== id);
      if (mtSel === id) mtSel = null;
      saveMentor();
      renderMentor();
    });
  });
  const topic = mtTopic(mtSel);
  if (!topic) {
    detail.innerHTML = '<div class="data-empty">Soldan bir konu seç — notları ve fotoğrafları burada gör.</div>';
    return;
  }
  const meta = topic.createdAt ? 'Eklendi: ' + new Date(topic.createdAt).toLocaleDateString('tr-TR') : '';
  detail.innerHTML =
    '<div class="mt-title-row"><div class="mt-tit"><h3 class="mt-title">' + esc(topic.title || '(Başlıksız)') + '</h3><div class="mt-meta">' + meta + '</div></div>' +
    '<button type="button" class="eg-mini-edit" id="mt-rename" title="Başlığı değiştir">✏</button>' +
    '<button type="button" class="mt-del-topic" id="mt-del-topic">Konuyu sil</button>' +
    '</div>' +
    '<label class="mt-notes-lbl" for="mt-notes">Notlar <span class="mt-save" id="mt-notes-status"></span></label>' +
    '<textarea id="mt-notes" class="mt-notes" placeholder="Bu konuya dair notların…"></textarea>' +
    '<label class="mt-notes-lbl" for="mt-imgs">Fotoğraflar</label>' +
    '<div class="mt-imgs">' + (topic.images || []).map((img, k) =>
      '<div class="mt-img"><img src="' + img + '" alt="Fotoğraf ' + (k + 1) + '" data-mt-zoom="' + k + '"><button type="button" class="mt-img-x" data-mt-imgx="' + k + '" title="Fotoğrafı kaldır">✕</button><textarea class="mt-img-note" data-mt-imgnote="' + k + '" rows="1" placeholder="Bu görselin notu…" maxlength="600">' + esc((topic.imgNotes && topic.imgNotes[k]) || '') + '</textarea></div>'
    ).join('') +
    '<button type="button" class="mt-add-tile" id="mt-add-tile" title="Tıkla, sonra Ctrl+V ile görsel ekle"><span class="mt-add-tile-plus">+</span><span class="mt-add-tile-lbl">Görsel ekle</span><span class="mt-add-tile-hint">tıkla → belirteç gelsin → Ctrl+V</span></button>' +
    '</div>';
  const ta = document.getElementById('mt-notes');
  if (ta) {
    ta.value = topic.notes || '';
    ta.addEventListener('input', () => {
      const st = document.getElementById('mt-notes-status');
      if (st) st.textContent = 'kaydediliyor…';
      clearTimeout(mtSaveTimer);
      mtSaveTimer = setTimeout(() => {
        topic.notes = ta.value;
        saveMentor();
        if (st) st.textContent = '✓ kaydedildi';
      }, 500);
    });
  }
  const delBtn = document.getElementById('mt-del-topic');
  if (delBtn) delBtn.addEventListener('click', () => {
    if (!window.confirm('Konu silinecek, emin misin?')) return;
    mtData.topics = mtData.topics.filter(t => t.id !== topic.id);
    mtSel = null;
    saveMentor();
    renderMentor();
  });
  const fi = document.getElementById('mt-img-file');
  if (fi) fi.addEventListener('change', () => {
    const files = Array.prototype.slice.call(fi.files || []);
    if (!files.length) return;
    let pend = files.length;
    files.forEach(f => {
      const r = new FileReader();
      r.onload = () => { topic.images.push(r.result); if (!Array.isArray(topic.imgNotes)) topic.imgNotes = []; topic.imgNotes.push(''); if (--pend === 0) { saveMentor(); renderMentor(); } };
      r.readAsDataURL(f);
    });
    fi.value = '';
  });
  detail.querySelectorAll('[data-mt-imgx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = parseInt(btn.getAttribute('data-mt-imgx'), 10);
      topic.images.splice(k, 1);
      if (Array.isArray(topic.imgNotes)) topic.imgNotes.splice(k, 1);
      saveMentor();
      renderMentor();
    });
  });
  const rn = document.getElementById('mt-rename');
  if (rn) rn.addEventListener('click', () => {
    const tit = detail.querySelector('.mt-title');
    if (!tit) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'mt-title-in'; inp.value = topic.title || ''; inp.maxLength = 140;
    const commit = () => {
      const v = inp.value.trim();
      if (v) topic.title = v;
      saveMentor();
      renderMentor();
    };
    tit.replaceWith(inp); inp.focus(); inp.select();
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') renderMentor();
    });
    inp.addEventListener('blur', commit);
  });
  const imgNotes = detail.querySelectorAll('[data-mt-imgnote]');
  imgNotes.forEach(ta => {
    ta.addEventListener('input', () => {
      const k = parseInt(ta.getAttribute('data-mt-imgnote'), 10);
      if (!Array.isArray(topic.imgNotes)) topic.imgNotes = [];
      topic.imgNotes[k] = ta.value;
      clearTimeout(mtSaveTimer);
      mtSaveTimer = setTimeout(() => saveMentor(), 500);
    });
  });
  const addTile = document.getElementById('mt-add-tile');
  if (addTile) addTile.addEventListener('click', () => {
    addTile.classList.toggle('active');
  });
  if (mtArmed) {
    if (addTile) addTile.classList.add('active');
    mtArmed = false;
  }
  detail.querySelectorAll('[data-mt-zoom]').forEach(im => {
    im.addEventListener('click', e => {
      e.stopPropagation();
      const k = parseInt(im.getAttribute('data-mt-zoom'), 10);
      mtZoom(topic, k);
    });
  });
}

var mtArmed = false;
var mtZoomTopic = null;
var mtZoomIdx = 0;

function mtZoomNote() {
  const n = document.getElementById('mtz-note');
  if (!n) return;
  const txt = mtZoomTopic && Array.isArray(mtZoomTopic.imgNotes) ? (mtZoomTopic.imgNotes[mtZoomIdx] || '') : '';
  n.textContent = txt;
  n.classList.toggle('empty', !txt.trim());
}

function mtZoom(topic, k) {
  if (!topic || !Array.isArray(topic.images) || !topic.images.length) return;
  mtZoomTopic = topic;
  mtZoomIdx = Math.max(0, Math.min(topic.images.length - 1, k || 0));
  const im = document.getElementById('mtz-img');
  const c = document.getElementById('mtz-count');
  if (im) im.src = mtZoomTopic.images[mtZoomIdx];
  if (c) c.textContent = (mtZoomIdx + 1) + ' / ' + mtZoomTopic.images.length;
  mtZoomNote();
  const ov = document.getElementById('mt-zoom');
  if (ov) ov.classList.add('open');
}

function mtZoomNav(d) {
  if (!mtZoomTopic || !Array.isArray(mtZoomTopic.images) || !mtZoomTopic.images.length) return;
  mtZoomIdx = (mtZoomIdx + d + mtZoomTopic.images.length) % mtZoomTopic.images.length;
  const im = document.getElementById('mtz-img');
  const c = document.getElementById('mtz-count');
  if (im) im.src = mtZoomTopic.images[mtZoomIdx];
  if (c) c.textContent = (mtZoomIdx + 1) + ' / ' + mtZoomTopic.images.length;
  mtZoomNote();
}

function mtZoomClose() {
  const ov = document.getElementById('mt-zoom');
  if (ov) ov.classList.remove('open');
}

function mtZoomBind() {
  const ov = document.getElementById('mt-zoom');
  if (!ov) return;
  const close = document.getElementById('mtz-close');
  const prev = document.getElementById('mtz-prev');
  const next = document.getElementById('mtz-next');
  if (close) close.addEventListener('click', mtZoomClose);
  if (prev) prev.addEventListener('click', e => { e.stopPropagation(); mtZoomNav(-1); });
  if (next) next.addEventListener('click', e => { e.stopPropagation(); mtZoomNav(1); });
  ov.addEventListener('click', e => { if (e.target === ov) mtZoomClose(); });
  document.addEventListener('keydown', e => {
    if (!ov.classList.contains('open')) return;
    if (e.key === 'Escape') mtZoomClose();
    else if (e.key === 'ArrowLeft') { e.preventDefault(); mtZoomNav(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); mtZoomNav(1); }
  });
}

function mtInit() {
  mtZoomBind();
  const mtd = document.getElementById('mt-detail');
  if (mtd && !mtd.dataset.mtPaste) {
    mtd.dataset.mtPaste = '1';
    mtd.addEventListener('paste', e => {
      const topic = mtTopic(mtSel);
      if (!topic) return;
      const items = (e.clipboardData && e.clipboardData.items) || [];
      let found = false;
      Array.prototype.forEach.call(items, it => {
        if (it.kind !== 'file' || it.type.indexOf('image/') !== 0) return;
        const f = it.getAsFile();
        if (!f) return;
        found = true;
        const r = new FileReader();
        r.onload = () => {
          if (!Array.isArray(topic.images)) topic.images = [];
          if (!Array.isArray(topic.imgNotes)) topic.imgNotes = [];
          topic.images.push(r.result);
          topic.imgNotes.push('');
          mtArmed = true;
          saveMentor();
          renderMentor();
        };
        r.readAsDataURL(f);
      });
      if (found) e.preventDefault();
    });
  }
  const add = document.getElementById('mt-add-topic');
  const form = document.getElementById('mt-add-form');
  const save = document.getElementById('mt-in-save');
  const cancel = document.getElementById('mt-in-cancel');
  const title = document.getElementById('mt-in-title');
  const err = document.getElementById('mt-in-err');
  if (!add || !form || !save || !cancel) return;
  const hide = () => { form.classList.add('hidden'); title.value = ''; if (err) err.textContent = ''; };
  add.addEventListener('click', () => {
    if (!mtAllowed()) return;
    form.classList.remove('hidden');
    title.focus();
  });
  cancel.addEventListener('click', hide);
  save.addEventListener('click', () => {
    const t = title.value.trim();
    if (!t) { if (err) err.textContent = 'Başlık yazmalısın.'; return; }
    const topic = { id: rid(), title: t, notes: '', images: [], imgNotes: [], createdAt: new Date().toISOString() };
    mtData.topics.push(topic);
    mtSel = topic.id;
    saveMentor();
    renderMentor();
    hide();
  });
  title.addEventListener('keydown', e => { if (e.key === 'Enter') save.click(); });
}

// ============ Site yorumları (Trustpilot tarzı) ============
var RV_RATING = 0;
var RV_PENDING = false;
var RV_ALL = [];
var RV_SHOW = 6;
var RV_MINE = null;

function rvStars(n) {
  var k = Math.max(0, Math.min(5, Math.round(n || 0)));
  return '★★★★★'.slice(0, k) + '☆☆☆☆☆'.slice(0, 5 - k);
}

function rvDate(iso) {
  try { return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return ''; }
}

function rvDisplayName(raw) {
  if (!raw) return window.t('rv.member');
  var s = String(raw);
  if (s.indexOf('@') !== -1) s = s.split('@')[0];
  return s || window.t('rv.member');
}

function rvFirstName(raw) {
  var s = rvDisplayName(raw).split(/\s+/)[0];
  return s || window.t('rv.member');
}

function rvUserName() {
  if (!AUTH || !AUTH.user) return window.t('rv.member');
  var nm = AUTH.user.user_metadata && AUTH.user.user_metadata.name;
  return rvDisplayName(nm || AUTH.user.email || window.t('rv.member'));
}

function rvCardHtml(x) {
  return '<div class="lp-rv-card"><div class="rv-stars">' + rvStars(x.rating) + '</div><p>' + esc(x.text) + '</p><div class="rv-meta">' + esc(rvDisplayName(x.name)) + ' · ' + rvDate(x.created_at) + '</div></div>';
}

function rvRenderStats() {
  var avg = 0, n = RV_ALL.length;
  RV_ALL.forEach(function (x) { avg += (x && Number(x.rating)) || 0; });
  avg = n ? avg / n : 0;
  var avgTxt = n ? avg.toFixed(1) : '—';
  var countTxt = n ? n + ' ' + window.t('rv.count') : window.t('rv.none');
  var e1 = document.getElementById('lp-rv-avg'); if (e1) e1.textContent = avgTxt;
  var e2 = document.getElementById('lp-rv-avgstars'); if (e2) e2.textContent = rvStars(avg);
  var e3 = document.getElementById('lp-rv-count'); if (e3) e3.textContent = countTxt;
  var e4 = document.getElementById('hm-rv-avgstars'); if (e4) e4.textContent = rvStars(avg);
  var e5 = document.getElementById('hm-rv-count'); if (e5) e5.textContent = countTxt;
  var e6 = document.getElementById('lp-proof-rating'); if (e6) e6.textContent = n ? avgTxt + ' ' + window.t('rv.per5') : '— ' + window.t('rv.per5');
}

function rvRenderList(gridId, moreId) {
  var grid = document.getElementById(gridId);
  var more = document.getElementById(moreId);
  if (!grid) return;
  var items = RV_ALL.slice(0, RV_SHOW);
  grid.innerHTML = items.length ? items.map(rvCardHtml).join('') : '<div class="lp-rv-empty">' + window.t('rv.empty') + '</div>';
  if (more) more.classList.toggle('hidden', RV_ALL.length <= RV_SHOW);
}

function refreshRvStatic() {
  rvRenderStats();
  rvRenderList('lp-rv-grid', 'lp-rv-more');
  rvBindForm('lp-rv');
}

function refreshRvDynamic() {
  try { if (typeof rvRenderStats === 'function') rvRenderStats(); } catch (e) {}
  try { if (typeof rvRenderList === 'function') rvRenderList('lp-rv-grid', 'lp-rv-more'); } catch (e) {}
  try { if (typeof rvBindForm === 'function') rvBindForm('lp-rv'); } catch (e) {}
}

function rvBindForm(p) {
  var form = document.getElementById(p + '-form');
  if (!form) return;
  form.innerHTML = '';
  if (!AUTH || !AUTH.user) {
    form.innerHTML = '<div class="lp-rv-form-in"><h4>⭐ ' + window.t('rv.form.h').replace(/^⭐\s*/, '') + '</h4><div class="rv-q">' + window.t('rv.form.qGuest') + '</div><div class="lp-rv-note">' + window.t('rv.form.loginNote') + '</div><button class="lp-rv-login" id="' + p + '-login" type="button">' + window.t('rv.form.loginBtn') + '</button></div>';
    var lb = document.getElementById(p + '-login');
    if (lb) lb.addEventListener('click', function () { RV_PENDING = true; showGate(); });
    return;
  }
  var mine = RV_MINE;
  var starsBtns = [1, 2, 3, 4, 5].map(function (v) {
    return '<button type="button" data-v="' + v + '"' + (mine && mine.rating >= v ? ' class="on"' : '') + ' aria-label="' + (window.LANG === 'en' ? v + ' stars' : v + ' yıldız') + '">★</button>';
  }).join('');
  var head = mine ? window.t('rv.form.updateHead') : window.t('rv.form.h').replace(/^⭐\s*/, '');
  var q = mine ? window.t('rv.form.qEdit') : window.t('rv.form.q');
  var btnTxt = mine ? window.t('rv.form.update') : window.t('rv.form.publish');
  var anonSel = !!(mine && mine.name === 'Anonim');
  var nameVal = (mine && mine.name && mine.name !== 'Anonim') ? mine.name : '';
  var nameRow = '<div class="rv-name-input-row"><label class="rv-name-input-lbl" for="' + p + '-name">' + window.t('rv.form.nameLbl') + '</label><input type="text" id="' + p + '-name" maxlength="40" placeholder="' + window.t('rv.form.namePh') + '" value="' + esc(nameVal) + '"><label class="rv-anon-cb"><input type="checkbox" id="' + p + '-anon"' + (anonSel ? ' checked' : '') + '> ' + window.t('rv.form.anon') + '</label></div>';
  form.innerHTML = '<div class="lp-rv-form-in"><h4>⭐ ' + head + '</h4><div class="rv-q">' + q + '</div><div class="rv-starpick" id="' + p + '-stars">' + starsBtns + '</div>' + nameRow + '<textarea id="' + p + '-text" rows="3" maxlength="500" placeholder="' + window.t('rv.form.textPh') + '">' + (mine ? esc(mine.text) : '') + '</textarea><div class="rv-act-row"><button class="lp-rv-submit" id="' + p + '-submit" type="button">' + btnTxt + '</button>' + (mine ? '<button class="lp-rv-del" id="' + p + '-del" type="button">' + window.t('rv.form.del') + '</button>' : '') + '</div></div>';
  var starBtns = document.querySelectorAll('#' + p + '-stars button');
  var ta = document.getElementById(p + '-text');
  var submit = document.getElementById(p + '-submit');
  var del = document.getElementById(p + '-del');
  starBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      RV_RATING = parseInt(b.dataset.v, 10) || 5;
      starBtns.forEach(function (x) { x.classList.toggle('on', parseInt(x.dataset.v, 10) <= RV_RATING); });
    });
  });
  var doSave = function () {
    var txt = (ta && ta.value ? ta.value.trim() : '');
    if (!txt) { if (ta) ta.focus(); return; }
    if (!AUTH.client || !AUTH.user) return;
    var anonCb = document.getElementById(p + '-anon');
    var nameInput = document.getElementById(p + '-name');
    var anon = !!(anonCb && anonCb.checked);
    var nameRaw = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
    var nameFinal = anon ? 'Anonim' : (nameRaw || 'Anonim');
    var payload = { user_id: AUTH.user.id, name: nameFinal, rating: RV_RATING || (mine ? mine.rating : 5), text: txt };
    var finish = function (err) {
      if (!err) { if (ta) ta.value = ''; rvLoadAll(); }
      else {
        if (submit) submit.disabled = false;
        if (err && err.message && window.alert) alert(err.message);
      }
    };
    submit.disabled = true;
    var updateById = function (id) {
      return AUTH.client.from('site_reviews').update({ name: payload.name, rating: payload.rating, text: payload.text }).eq('id', id);
    };
    if (mine && mine.id) {
      updateById(mine.id).then(function (r) { finish(r && r.error); }).catch(function (e) { finish(e); });
    } else {
      AUTH.client.from('site_reviews').insert(payload)
        .then(function (r) {
          if (r && r.error) {
            if (r.error.code === '23505') {
              AUTH.client.from('site_reviews').select('id').eq('user_id', AUTH.user.id).maybeSingle()
                .then(function (m) {
                  if (m && m.data && !m.error) {
                    RV_MINE = m.data;
                    return updateById(m.data.id).then(function (u) { finish(u && u.error); }).catch(function (e) { finish(e); });
                  }
                  return finish(r.error);
                })
                .catch(function () { finish(r.error); });
            } else {
              finish(r.error);
            }
          } else {
            finish(null);
          }
        })
        .catch(function (e) { finish(e); });
    }
  };
  if (submit) submit.addEventListener('click', doSave);
  if (ta) ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) doSave(); });
  if (del) del.addEventListener('click', function () {
    if (!AUTH.client || !AUTH.user) return;
    if (window.confirm && !window.confirm('Yorumunu silmek istediğine emin misin?')) return;
    AUTH.client.from('site_reviews').delete().eq('user_id', AUTH.user.id)
      .then(function (r) { if (!r || !r.error) { RV_MINE = null; rvLoadAll(); } })
      .catch(function () {});
  });
}

function rvLoadAll() {
  if (!AUTH || !AUTH.client) return;
  AUTH.client.from('site_reviews')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300)
    .then(function (r) {
      if (!r || r.error) return;
      RV_ALL = r.data || [];
      rvRenderStats();
      rvRenderList('lp-rv-grid', 'lp-rv-more');
      rvRenderList('hm-rv-grid', 'hm-rv-more');
      if (AUTH.user) {
        AUTH.client.from('site_reviews').select('*').eq('user_id', AUTH.user.id).maybeSingle()
          .then(function (m) {
            RV_MINE = (m && m.data && !m.error) ? m.data : null;
            RV_RATING = RV_MINE ? RV_MINE.rating : 0;
            rvBindForm('lp-rv');
            rvBindForm('hm-rv');
            rvBindForm('lp-nav-rv');
          })
          .catch(function () {});
      } else {
        RV_MINE = null;
        rvBindForm('lp-rv');
        rvBindForm('hm-rv');
        rvBindForm('lp-nav-rv');
      }
    })
    .catch(function () {});
}

function renderSiteReviews() { rvLoadAll(); }

(function () {
  var fab = document.getElementById('rvFab');
  if (fab) fab.addEventListener('click', function () {
    try { renderSiteReviews(); } catch (e) {}
    try { if (typeof showPage === 'function') showPage('home'); } catch (e) {}
    setTimeout(function () {
      var sec = document.getElementById(AUTH && AUTH.user ? 'hm-rv' : 'lp-rv');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  });
  var rvBtn = document.getElementById('lp-nav-rv-btn');
  var rvPop = document.getElementById('lp-nav-rv-pop');
  if (rvBtn && rvPop) {
    rvPop.style.zIndex = '10000';
    if (document.body) document.body.appendChild(rvPop);
    var rvPlace = function () {
      var r = rvBtn.getBoundingClientRect();
      var w = rvPop.offsetWidth || 320;
      var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      rvPop.style.position = 'fixed';
      rvPop.style.top = (r.bottom + 10) + 'px';
      rvPop.style.left = left + 'px';
    };
    var rvOpen = function () {
      rvPop.hidden = false;
      rvPlace();
      rvBtn.setAttribute('aria-expanded', 'true');
      try { rvBindForm('lp-nav-rv'); } catch (e) {}
      setTimeout(function () {
        var f = document.getElementById('lp-nav-rv-form');
        if (f) f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
    };
    var rvClose = function () {
      rvPop.hidden = true;
      rvBtn.setAttribute('aria-expanded', 'false');
    };
    rvBtn.addEventListener('click', function () {
      if (!AUTH || !AUTH.user) {
        rvClose();
        RV_PENDING = true;
        if (typeof showGate === 'function') showGate();
        return;
      }
      if (rvPop.hidden) rvOpen(); else rvClose();
    });
    document.addEventListener('click', function (ev) {
      if (rvPop.hidden) return;
      if (!rvBtn.contains(ev.target) && !rvPop.contains(ev.target)) rvClose();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !rvPop.hidden) { rvClose(); rvBtn.focus(); }
    });
    window.addEventListener('scroll', function () { if (!rvPop.hidden) rvPlace(); }, true);
    window.addEventListener('resize', function () { if (!rvPop.hidden) rvPlace(); });
  }
  var moreL = document.getElementById('lp-rv-more');
  if (moreL) moreL.addEventListener('click', function () { RV_SHOW += 6; rvRenderList('lp-rv-grid', 'lp-rv-more'); });
  var moreH = document.getElementById('hm-rv-more');
  if (moreH) moreH.addEventListener('click', function () { RV_SHOW += 6; rvRenderList('hm-rv-grid', 'hm-rv-more'); });
})();

if (AUTH_ENABLED) {
  bootApp({ seed: false });
  bootAuth();
  statsInit();
} else {
  // Yerel mod (anahtar yok): eski davranış — kimse giriş yapmadan çalışır.
  document.body.classList.remove('landed');
  const nlAppBtn3 = document.getElementById('nav-login-app');
  if (nlAppBtn3) nlAppBtn3.style.display = 'none';
  seedIfEmpty().then(loadConfig).then(loadData).then(loadReviews).then(loadEgitim).then(loadNews).then(loadMentor).then(init)
    .then(() => showPage(currentPage)).catch(() => showPage(currentPage));
  // OAuth olmayan modda da hash kontrolü
  setTimeout(handleNotionHash, 1000);
}
// ============ Kümülatif PnL Grafiği (R cinsinden) ============
(function () {
  // 2026 aylık kümülatif R — Ocak dip, Şub-Mar toparlanma, Nis düşüş,
  // May-Haz güçlü yükseliş, Tem yatay → toplam +52R
  const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem'];
  const CUM    = [ -8,    10,    25,    19,    31,    50,    52  ];
  const TOTAL  = CUM[CUM.length - 1];
  let started = false;

  // SVG çizim alanı (viewBox 320×132)
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

    // sıfır çizgisi
    const yz = Y(0);
    zeroEl.setAttribute('y1', yz); zeroEl.setAttribute('y2', yz);

    lineEl.setAttribute('d', line);
    areaEl.setAttribute('d', area);
    dotEl.setAttribute('cx', X(CUM.length - 1));
    dotEl.setAttribute('cy', Y(TOTAL));

    // çizgiyi soldan sağa çiz (stroke-dashoffset)
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

    // değeri 0 → TOTAL say
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

  // page-basvuru görünür olunca başlat
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
  // Zaten cevaplanmış/atlanmışsa hiç gösterme
  if (localStorage.getItem(KEY)) return;
  card.hidden = false;

  const answers = {};
  const sendBtn = document.getElementById('hs-send');
  const hint = document.getElementById('hs-hint');
  const qCount = card.querySelectorAll('.hs-q').length;

  // Öneri eşlemesi — cevaba göre en uygun bölüm
  const REC = {
    zorluk: {
      disiplin:  { t: 'Alfa-Check List', p: 'defter' },
      risk:      { t: 'Trade Günlüğü', p: 'data' },
      teknik:    { t: 'Alfa Edu', p: 'egitim' },
      psikoloji: { t: 'Alfa Edu — Psikoloji', p: 'egitim' },
      strateji:  { t: 'Haftalık Değerlendirme', p: 'review' },
    },
    ihtiyac: {
      egitim:    { t: 'Alfa Edu', p: 'egitim' },
      topluluk:  { t: 'Alfa Ol', p: 'basvuru' },
      araclar:   { t: 'İndikatörler', p: 'indicators' },
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
      hint.textContent = done < qCount ? (qCount - done) + ' soru kaldı' : 'Hazır!';
    });
  });

  document.getElementById('hs-skip').addEventListener('click', () => {
    localStorage.setItem(KEY, JSON.stringify({ skipped: true, ts: Date.now() }));
    card.hidden = true;
  });

  sendBtn.addEventListener('click', () => {
    if (Object.keys(answers).length < qCount) return;
    localStorage.setItem(KEY, JSON.stringify({ answers, ts: Date.now() }));
    // Öneri linkleri oluştur
    const recs = [];
    const seen = new Set();
    [REC.zorluk[answers.zorluk], REC.ihtiyac[answers.ihtiyac]].forEach(r => {
      if (r && !seen.has(r.p)) { seen.add(r.p); recs.push(r); }
    });
    const linksBox = document.getElementById('hs-done-links');
    linksBox.innerHTML = '';
    recs.forEach(r => {
      const a = document.createElement('a');
      a.href = '?page=' + r.p; a.textContent = r.t + ' →';
      a.addEventListener('click', e => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (typeof showPage === 'function') showPage(r.p);
      });
      linksBox.appendChild(a);
    });
    document.getElementById('hs-done-msg').textContent = recs.length
      ? 'Cevaplarına göre şunlarla başlamanı öneriyoruz:'
      : 'Cevapların kaydedildi — sana en uygun içerikleri hazırlıyoruz.';
    card.querySelector('.hs-body').hidden = true;
    card.querySelector('.hs-foot').hidden = true;
    document.getElementById('hs-done').hidden = false;
  });
})();

// ============ Alfa Trader Ol — Topluluk Akışı ============
const BAS_FEED_KEY = 'alfa-feed-v1';
let basFeed = [];
function loadFeed() {
  try { const d = localStorage.getItem(BAS_FEED_KEY); if (d) basFeed = JSON.parse(d); } catch (e) { basFeed = []; }
  if (!basFeed.length) {
    basFeed = [
      { id: 'f1', type: 'announce', title: 'Alfa Traders Topluluğuna Hoş Geldiniz', content: 'Burası hayat boyu öğrenme ve disiplinli trading ortamı. İşlemlerimizi, analizlerimizi ve bilgi birikimimizi paylaşıyoruz. Aktif ol, chart paylaş, gelişime açık kal — ekibin parçası ol.', author: 'Alfa Ekibi', date: new Date().toISOString(), pin: true },
      { id: 'f2', type: 'trade', title: 'BTC Long — TP +2.8R', content: '4H likidite alımı + CVD divergance + Orderbook desteği. Entry: 68450, TP1: 69100 (%50), TP2: 69800 (%50), SL: 67900.', author: 'traderahmet', date: new Date(Date.now() - 864e5).toISOString(), pin: false },
      { id: 'f3', type: 'topic', title: 'Haftalık Piyasa Değerlendirmesi', content: 'BTC bu hafta 67-69k aralığında sıkıştı. 70k üzerinde hacimli kapanış alırsak yeni ATH denemesi beklerim. Altcoinlerde ETH ve SOL relative strength gösteriyor.', author: 'traderahmet', date: new Date(Date.now() - 2 * 864e5).toISOString(), pin: false },
      { id: 'f4', type: 'edu', title: 'CVD Divergance Nasıl Okunur?', content: 'Fiyat yeni dip yaparken Spot CVD yükseliyorsa = bullish divergence. Alçalan trendde CVD önden dönüş sinyali verir. Daily timeframe en güvenilir sinyali verir.', author: 'Alfa Edu', date: new Date(Date.now() - 3 * 864e5).toISOString(), pin: false },
    ];
    saveFeed();
  }
}
function saveFeed() {
  try { localStorage.setItem(BAS_FEED_KEY, JSON.stringify(basFeed)); } catch (e) {}
}
function renderFeed() {
  const list = document.getElementById('bas-feed-list');
  if (!list) return;
  const sorted = [...basFeed].sort((a, b) => {
    if (a.pin && !b.pin) return -1;
    if (!a.pin && b.pin) return 1;
    return new Date(b.date) - new Date(a.date);
  });
  if (!sorted.length) {
    list.innerHTML = '<div class="bas-empty">Henüz paylaşım yok. İlk paylaşımı sen yap!</div>';
    return;
  }
  const LABELS = { trade: 'İşlem', topic: 'Konu', question: 'Soru', edu: 'Eğitim', announce: 'Duyuru' };
  list.innerHTML = sorted.map(p => `<div class="bas-post">
    <div class="bas-post-head">
      <span class="badge ${p.type}">${LABELS[p.type] || p.type}</span>
      <span class="date">${fmtDate(p.date)}</span>
      ${p.pin ? '<span class="pin">📌</span>' : ''}
    </div>
    <h4>${esc(p.title)}</h4>
    <div class="content">${esc(p.content)}</div>
    <div class="author">— ${esc(p.author || 'Anonim')}</div>
  </div>`).join('');
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 864e5;
  if (diff < 1) return 'Bugün';
  if (diff < 2) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function toggleAddPost() {
  const w = document.getElementById('bas-add-wrap');
  const btn = document.getElementById('feed-add-btn');
  if (!w) return;
  const open = !w.classList.contains('open');
  w.classList.toggle('open', open);
  if (btn) btn.textContent = open ? 'İptal' : '+ Paylaş';
}
function addFeedPost() {
  const type = document.getElementById('feed-type').value;
  const title = document.getElementById('feed-title').value.trim();
  const content = document.getElementById('feed-content').value.trim();
  const author = document.getElementById('feed-author').value.trim() || 'Alfa Trader';
  const pin = document.getElementById('feed-pin').checked;
  if (!title || !content) { alert('Başlık ve içerik zorunlu.'); return; }
  basFeed.push({ id: 'f' + Date.now(), type, title, content, author, date: new Date().toISOString(), pin });
  saveFeed(); renderFeed();
  document.getElementById('feed-title').value = '';
  document.getElementById('feed-content').value = '';
  document.getElementById('feed-author').value = '';
  document.getElementById('feed-pin').checked = false;
  toggleAddPost();
}
// ============ Başarı Fotoğrafları (Supabase) ============
const SFX_TABLE = 'success_photos';
let sfxPhotos = [];
async function loadSfx() {
  sfxPhotos = [];
  try {
    if (typeof AUTH !== 'undefined' && AUTH.client) {
      const { data, error } = await AUTH.client.from(SFX_TABLE).select('*').order('sort', { ascending: true }).limit(60);
      if (!error && data) sfxPhotos = data;
    }
  } catch (e) { /* */ }
  renderSfx();
  sfxStart();
}
function renderSfx() {
  const track = document.getElementById('sfx-track');
  const addBtn = document.getElementById('sfx-add-btn');
  if (!track) return;
  const admin = appsAllowed();
  if (addBtn) addBtn.classList.toggle('hidden', !admin);
  if (!sfxPhotos.length) {
    track.innerHTML = '<div class="sfx-empty">Henüz başarı fotoğrafı eklenmemiş.</div>';
    return;
  }
  function makeCard(p) {
    const c = document.createElement('figure');
    c.className = 'sfx-card';
    const img = document.createElement('img');
    img.src = p.url; img.alt = p.caption || 'Alfa Traders başarısı'; img.loading = 'lazy';
    img.addEventListener('click', () => { if (sfxJustDragged) return; openSfxLightbox(p.url); });
    c.appendChild(img);
    if (p.caption) {
      const fig = document.createElement('figcaption');
      fig.textContent = p.caption;
      c.appendChild(fig);
    }
    if (admin) {
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'sfx-del'; del.textContent = '🗑'; del.title = 'Sil';
      del.addEventListener('click', ev => { ev.stopPropagation(); if (sfxJustDragged) return; delSfxPhoto(p.id); });
      c.appendChild(del);
    }
    return c;
  }
  const group = document.createDocumentFragment();
  sfxPhotos.forEach(p => group.appendChild(makeCard(p)));
  const clone = group.cloneNode(true);
  track.innerHTML = '';
  track.appendChild(group);
  track.appendChild(clone);
}
function openSfxLightbox(url) {
  const lg = document.getElementById('sfx-lg');
  const im = document.getElementById('sfx-lg-img');
  if (!lg || !im) return;
  im.src = url; im.alt = 'Alfa Traders başarısı';
  lg.classList.remove('hidden');
}
function closeSfxLightbox() {
  const lg = document.getElementById('sfx-lg');
  if (lg) lg.classList.add('hidden');
}
let sfxAuto = 0;
let sfxOff = 0;
let sfxT = null;
let sfxDrag = null;
let sfxHover = false;
let sfxHoverable = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
let sfxJustDragged = false;
function sfxPeriod(track) {
  const cards = track.querySelectorAll('.sfx-card');
  const n = Math.floor(cards.length / 2);
  if (n < 1 || cards.length < 2) return 0;
  const a = cards[0].getBoundingClientRect().left;
  const b = cards[n].getBoundingClientRect().left;
  return b - a;
}
function sfxApply() {
  const track = document.getElementById('sfx-track');
  if (!track) return;
  let P = 0;
  try { P = sfxPeriod(track); } catch (_) { P = 0; }
  let x = sfxAuto + sfxOff;
  if (P > 0) {
    const m = ((x % P) + P) % P;
    x = m - P;
  }
  track.style.transform = 'translateX(' + x + 'px)';
}
function sfxLoop() {
  sfxT = requestAnimationFrame(sfxLoop);
  if (!sfxDrag && !sfxHover) sfxAuto -= 0.33;
  sfxApply();
}
function initSfxDrag() {
  const track = document.getElementById('sfx-track');
  const view = document.getElementById('sfx-view');
  if (!track || typeof PointerEvent === 'undefined') return;
  track.addEventListener('pointerdown', e => {
    sfxDrag = { x: e.clientX, off: sfxOff };
    const t = e.target;
    if (t && t.setPointerCapture) { try { t.setPointerCapture(e.pointerId); } catch (_) { /* */ } }
    track.querySelectorAll('img').forEach(im => im.classList.add('dragging'));
  });
  track.addEventListener('pointermove', e => {
    if (!sfxDrag) return;
    const dx = e.clientX - sfxDrag.x;
    sfxOff = sfxDrag.off + dx;
    if (Math.abs(dx) > 8) sfxJustDragged = true;
    sfxApply();
  });
  const end = () => {
    if (sfxDrag) {
      sfxDrag = null;
      track.querySelectorAll('img').forEach(im => im.classList.remove('dragging'));
      setTimeout(() => { sfxJustDragged = false; }, 400);
    }
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  if (view && sfxHoverable) {
    view.addEventListener('mouseenter', () => { sfxHover = true; });
    view.addEventListener('mouseleave', () => { sfxHover = false; });
  }
}
function sfxStart() {
  if (sfxT != null) return;
  initSfxDrag();
  sfxLoop();
}
const APP_BUILD = 'b27';
function initAutoReload() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  setInterval(async () => {
    try {
      const r = await fetch('/sw.js?__v=' + Date.now(), { cache: 'no-store' });
      const t = await r.text();
      const m = /const BUILD_ID = '([^']+)'/.exec(t);
      if (m && m[1] && m[1] !== APP_BUILD) location.reload();
    } catch (e) { /* */ }
  }, 40000);
}
let sfxInsertAt = null;
let sfxPasteOpen = false;
function openSfxModal(idx) {
  sfxInsertAt = (typeof idx === 'number') ? idx : null;
  const t = document.getElementById('sfx-modal-t');
  if (t) t.textContent = (typeof idx === 'number') ? 'Fotoğraf Ekle — şeridin bu noktasına' : 'Fotoğraf Ekle';
  const m = document.getElementById('sfx-modal');
  if (!m) return;
  m.classList.remove('hidden');
  sfxPasteOpen = true;
  setSfxMsg('', '');
  const b = document.getElementById('sfx-paste');
  if (b) { b.focus(); b.classList.add('over'); setTimeout(() => b.classList.remove('over'), 300); }
}
function closeSfxModal() {
  const m = document.getElementById('sfx-modal');
  if (m) m.classList.add('hidden');
  sfxPasteOpen = false;
  sfxInsertAt = null;
}
function setSfxMsg(text, cls) {
  const el = document.getElementById('sfx-msg');
  if (el) { el.textContent = text; el.className = 'sfx-msg' + (cls ? ' ' + cls : ''); }
}
function initSfxPaste() {
  const box = document.getElementById('sfx-paste');
  const input = document.getElementById('sfx-file');
  if (!box) return;
  box.addEventListener('click', () => { if (input) input.click(); });
  if (input) {
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) handleSfxFile(input.files[0]);
      input.value = '';
    });
  }
  box.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('over'); });
  box.addEventListener('dragleave', () => box.classList.remove('over'));
  box.addEventListener('drop', e => {
    e.preventDefault();
    box.classList.remove('over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleSfxFile(e.dataTransfer.files[0]);
  });
  document.addEventListener('paste', e => {
    if (!sfxPasteOpen) return;
    const items = e.clipboardData && e.clipboardData.items;
    for (const it of items || []) {
      if (it.type && it.type.indexOf('image') === 0) { e.preventDefault(); handleSfxFile(it.getAsFile()); break; }
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSfxModal(); closeSfxLightbox(); }
  });
  const lg = document.getElementById('sfx-lg');
  if (lg) lg.addEventListener('click', () => closeSfxLightbox());
}
function handleSfxFile(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const max = 1400;
      let w = img.width, h = img.height;
      if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      uploadSfxImage(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => setSfxMsg('Görsel okunamadı.', 'err');
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
async function sfxAddRow(url, caption) {
  const arr = sfxPhotos.slice();
  const idx = (sfxInsertAt == null || sfxInsertAt > arr.length) ? arr.length : sfxInsertAt;
  const { error } = await AUTH.client.from(SFX_TABLE).insert({ url, caption, sort: idx });
  if (error) throw new Error(error.message);
  arr.splice(idx, 0, { url, caption, sort: idx });
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].id && arr[i].sort !== i) {
      const { error: ue } = await AUTH.client.from(SFX_TABLE).update({ sort: i }).eq('id', arr[i].id);
      if (ue) { /* sıralama hatası göz ardı edilir */ }
    }
  }
  sfxInsertAt = idx + 1;
  loadSfx();
}
async function uploadSfxImage(data) {
  const box = document.getElementById('sfx-paste');
  if (box) { box.textContent = '⏳ Yükleniyor…'; box.style.pointerEvents = 'none'; }
  setSfxMsg('Yükleniyor…', '');
  try {
    let url = null;
    if (AUTH.client && AUTH.client.storage) {
      const res = await fetch(data);
      const blob = await res.blob();
      const path = 'sfx/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
      const { error: upErr } = await AUTH.client.storage.from('success').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
      if (upErr) throw new Error(upErr.message);
      url = AUTH.client.storage.from('success').getPublicUrl(path).data.publicUrl;
    } else {
      const r = await fetch('/api/contrib?upload=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
      const j = await r.json();
      if (!j.ok || !j.url) throw new Error(j.error || 'hata');
      url = j.url;
    }
    try {
      await sfxAddRow(url, '');
    } catch (err) {
      const uEl = document.getElementById('sfx-url');
      if (uEl) uEl.value = url;
      setSfxMsg('Fotoğraf yüklendi ama tabloya eklenemedi — URL alanına kondu, Ekle\'ye bas. (' + (err.message || 'hata') + ')', 'err');
      return;
    }
    setSfxMsg('✅ Eklendi. Devam edebilirsin — şerit yenilendi.', '');
  } catch (e) {
    setSfxMsg('Yükleme hatası: ' + (e.message || 'hata'), 'err');
  } finally {
    if (box) { box.textContent = '📸 Şimdi Ctrl+V yap — ya da buraya tıkla → dosya seç'; box.style.pointerEvents = ''; box.focus(); }
  }
}
async function addSfxPhoto() {
  const uEl = document.getElementById('sfx-url');
  const url = uEl ? uEl.value.trim() : '';
  if (!url) { setSfxMsg('Fotoğraf linki gerekli.', 'err'); return; }
  try {
    await sfxAddRow(url, '');
  } catch (e) { setSfxMsg('Eklenemedi: ' + (e.message || 'hata'), 'err'); return; }
  if (uEl) uEl.value = '';
  setSfxMsg('✅ Eklendi.', '');
}
async function delSfxPhoto(id) {
  if (!window.confirm('Bu fotoğraf silinsin mi?')) return;
  try {
    const { error } = await AUTH.client.from(SFX_TABLE).delete().eq('id', id);
    if (error) { window.alert('Silinemedi: ' + (error.message || 'hata')); return; }
  } catch (e) { window.alert('Silinemedi: ' + (e.message || 'hata')); return; }
  loadSfx();
}
// ============ Deneyimli Alfa Trader — Form → Google Sheets ============
// 📌 Buraya Google Apps Script Web App URL'ni ekle:
const BAS_GS_URL = 'https://script.google.com/macros/s/AKfycbxemXXvOyEW6tqwPv2ib6MQx9BeStGjbjtY_1rQU7cPWttLuzEP3-v4M_cPR1hIHZ0/exec';
async function submitSeniorForm() {
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
  if (!name || !tg || !exp || !market || !freq || !method || !level || !pnl || !why) { result.textContent = 'Ad, Telegram, tecrübe, piyasa, sıklık, analiz, seviye, son 6 ay ve neden zorunlu.'; result.style.display = 'block'; return; }
  // ---- Public Alfa Edu (giriş gerektirmez) ----
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
        const vids = (t.videos || []).filter(v => v.url || (v.body && String(v.body).trim()) || (v.photos && v.photos.length));
        if (!vids.length) return;
        const row = document.createElement('div');
        row.className = 'eg-item' + (t.id === pubSel[pubSec] ? ' on' : '');
        const idx = document.createElement('span'); idx.className = 'eg-item-idx'; idx.textContent = i + 1;
        const tt = document.createElement('span'); tt.className = 'eg-item-t'; tt.textContent = t.title || '(başlıksız)';
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
      const vids = (cur.videos || []).filter(v => v.url || (v.body && String(v.body).trim()) || (v.photos && v.photos.length));
      const curVid = vids.find(v => v.id === pubSelVid[cur.id]) || vids[0];
      if (curVid && curVid.id !== pubSelVid[cur.id]) pubSelVid[cur.id] = curVid.id;
      const embed = document.getElementById('pub-eg-embed');
      embed.innerHTML = '';
      const src = curVid ? egEmbedSrc(curVid) : '';
      if (src) {
        embed.style.display = '';
        const ifr = document.createElement('iframe');
        ifr.src = src; ifr.title = curVid.title || cur.title || 'video';
        ifr.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
        ifr.setAttribute('allowfullscreen', '');
        embed.appendChild(ifr);
      } else {
        embed.style.display = 'none';
      }
      const pubNote = document.getElementById('pub-eg-note');
      pubNote.innerHTML = '';
      pubNote.style.display = '';
      const nv = curVid ? chBuildNoteBox(curVid, cur.title) : null;
      if (nv) pubNote.appendChild(nv);
      if (curVid) {
        const used = chUsedVidSet(curVid);
        const extraHtml = chItemVids(curVid).map((u, i) => used.has(i) ? '' : chVideoEmbedHtml(u)).filter(Boolean).join('');
        if (extraHtml) {
          const wrap = document.createElement('div'); wrap.className = 'ch-extra-vids';
          wrap.innerHTML = extraHtml;
          pubNote.appendChild(wrap);
        }
      }
      if (!pubNote.childNodes.length) pubNote.style.display = 'none';
      document.getElementById('pub-eg-now-title').textContent = cur.title || '(başlıksız)';
      const link = document.getElementById('pub-eg-now-link');
      if (curVid && src) { link.style.display = ''; link.href = egWatchHref(curVid); link.textContent = egKind(curVid) === 'playlist' ? "Oynatma listesini YouTube'da aç ↗" : "YouTube'da aç ↗"; }
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

  btn.disabled = true; btn.textContent = 'Gönderiliyor...';
  result.style.display = 'none';
  const payload = { name, tg, x, exp, market, freq, method, level, pnl, pnl2, payout, lasttrade, why, date: new Date().toISOString() };
  const res = await saveApplication(payload, 'senior');
  btn.disabled = false; btn.textContent = t('pg.bas.fSubmit');
  if (res.ok) {
    result.textContent = res.queued ? '✅ Başvurun bu cihazda kaydedildi. Supabase erişimi açılınca iletilir.' : t('pg.bas.okSenior');
    result.style.display = 'block'; result.style.color = '#22c55e';
    document.getElementById('senior-form').querySelectorAll('input, select, textarea').forEach(el => el.value = '');
  } else {
    result.textContent = t('pg.bas.errRetry'); result.style.display = 'block'; result.style.color = '#ef4444';
  }
}