# ALFA CHARTS — TradingView Supercharts Karşılaştırmalı Teknik ve İşlevsel Denetim

**Tarih:** 2026-11-23  
**Hedef:** https://alfa-trader.com/alfa-charts.html  
**Kod tabanı:** Denetim `c23567e Fix admin grant for live Fjor account` üzerinde yapıldı; P0 düzeltmeleri yerel olarak `61db14b` üzerine eklendi.<br>
**Üretim paketleri:** `/assets/alfa-charts.mjs?v=48`, `/assets/alfa-charts.css?v=18` (P0 düzeltmeleri henüz dağıtılmadı).<br>
**Teşhis URL’si:** `https://alfa-trader.com/alfa-charts.html?debug=1` → `window.__alfaDebug.ready === true`

---

## 0. Yönetici özeti

ALFA CHARTS, Lightweight Charts 5 üzerine kurulmuş, kendi çizim motoru, nesne ağacı, bulut/local kayıt katmanı, replay iskeleti, mikro-yapı çalışmaları ve Paper/Research/Strategy laboratuvarı olan **ciddi bir özel grafik çalışma alanıdır**. Arayüzde görünen 77 etkileşimli kontrolün büyük bölümü gerçekten bağlıdır; statik taramada “sadece görünen, hiçbir işe yaramayan” (UI-only stub) kontrol bulunmamıştır.

Buna karşılık ürün, TradingView Supercharts’ın **tam karşılığı değildir**. En kritik farklar:

1. **Bar Replay, 13 timeframe’in 5’inde çalışmaz** (`3m`, `2h`, `6h`, `12h`, `3d`) ve konsola `Error: Unsupported timeframe` düşer.
2. **“Otomatik fiyat ölçeği” butonu tek yönlüdür**; açık/kapalı değişmez, gerçek bir toggle değildir.
3. **Görünüm menüsündeki 2/4/6 düzen butonları çoklu grafiğe geçmez**; sadece dahili `state.layout` değerini değiştirir, görünür bir etki yoktur.
4. **Alarm tetikleme durumu semboller arası paylaşılır**; sembol değiştirildikten sonra ilk tick önceki sembolün fiyatıyla karşılaştırılabilir ve yanlış crossover alarmı üretebilir.
5. Fibonacci yalnızca **retracement**; extension/fan/spiral/time-zone/channel yoktur.
6. Long/Short Position gerçek emir/risk nesnesi değil, **analiz çizimidir**; bakiye, lot, kaldıraç, PnL, kısmi dolum yoktur.
7. Çoklu grafik, **senkronize olmayan iframe’lerden** oluşur; crosshair/zaman ekseni/interval/sembol çift yönlü senkronize değildir.
8. Kayıtlar birden fazla store’a dağılmıştır; chart-settings çakışmasında bulut sürümü sessizce yerel ayarların üzerine yazılabilir.
9. Testler çizim matematiği, replay determinizmi ve seçili workspace akışlarında güçlüdür; ancak **butonların çoğu gerçek tıklamayla test edilmemiştir**.

Bu denetimde P0 olarak sınıflandırılan 4 maddenin küçük ve bağımsız commit’lerle giderilmesi planlanmıştır. Üretime dağıtım kullanıcı onayı olmadan yapılmayacaktır.

---

## 1. Yöntem ve ortam

### 1.1 Kaynak incelemesi

- `alfa-charts.html`: 245 satır; tüm toolbar, drawing rail, object tree, replay bar, multi-chart ve dialog DOM’u.
- `assets/alfa-charts.mjs`: ~86 KB; ana olay bağlama, modals, alarmlar, replay geçişleri, view state, layout persistence.
- `assets/alfa-drawings.mjs`, `alfa-drawings-model.mjs`, `alfa-drawings-render.mjs`, `alfa-drawings-store.mjs`, `alfa-object-tree.mjs`: çizim motoru.
- `assets/alfa-indicators.mjs`, `alfa-chart-studies.mjs`, `alfa-public-studies.mjs`, `alfa-market-data-public.mjs`: çalışma katmanları.
- `assets/alfa-multichart.mjs`, `alfa-alerts.mjs`, `alfa-replay-model.mjs`, `alfa-paper.mjs`, `alfa-research.mjs`, `alfa-watchlist.mjs`, `alfa-chart-settings-store.mjs`, `alfa-chart-ui.mjs`.
- `assets/alfa-charts.css`, `vercel.json`, `sw.js`.

### 1.2 Çalışma zamanı denetimi

- Üretim `?debug=1` yükü: `ready: true`, bağlantı `Canlı · geçmiş eşitlendi`, başlık `BTCUSDT · 1H`, konsol/hata yok.
- Görünür etkileşimli öğe envanteri: **77 kontrol** (button, select, input, link, role=button, tabindex).
- Yerel statik sunucu `http://127.0.0.1:4181` üzerinde, her buton için ayrı temiz sayfa açılarak tıklama denemesi yapıldı; URL, bağlantı metni, sembol, timeframe, chart tipi, dialog, multi-chart durumu, view config, çizim aracı, watchlist sayısı ve localStorage anahtar sayısı öncesi/sonrası karşılaştırıldı.
- Lab menüsündeki Bar Replay / Strateji testleri / Araştırma butonları ilk turda `<details>` kapalı olduğu için tıklanamadı; menü açıldıktan sonra **üçü de çalışır durumda doğrulandı**.
- `3m` timeframe’inde replay başlatma denemesi gerçek bir `pageerror: Error: Unsupported timeframe` üretti.

### 1.3 Test envanteri

- Birincil gerçek tarayıcı suite’leri: `alfa-workspace.browser.mjs`, `alfa-drawings.browser.mjs`, `alfa-replay.browser.mjs`.
- Ek chrom host suite’leri: `alfa-lab`, `alfa-excursions`, `alfa-research`, `alfa-strategy`, `alfa-paper`.
- Node/model testleri: çizim, replay, indikatör, alarm, market-data, watchlist, public studies, paper/research/lab vb.
- 131 literal `id`’den **52’si hiçbir test dosyasında geçmiyor**; özellikle `#reset-view`, `#fullscreen`, `#watch-export`, `#watch-share`, `#magnet-toggle`, `#drawings-toggle`, `#auto-scale`, `#drawing-clear-all`, `#replay-restart`.

---

## 2. Özellik matrisi — TradingView Supercharts vs ALFA CHARTS

| TradingView temel özelliği | ALFA CHARTS durumu | Değerlendirme | Öncelik |
|---|---|---|---|
| Candlestick / bar / line / area / Heikin Ashi | Var | 5 typ gerçekten uygulanıyor; runtime’da `line` ve `heikin` değişimi doğrulandı | — |
| 13 timeframe + klavye kısayolları | Var | `1`→`1m`, `60`→`1h`, `D`, `3D`, `W` vb. bağlı | — |
| Çizim araçları (trend, ray, rectangle, text, arrow, brush, ruler, delete) | Var | 16 araç kayıtlı; çizim, sürükleme, stil, undo/redo, nesne ağacı çalışıyor | — |
| Fibonacci retracement | Var | Seviye düzenleme, ters çevirme, fiyat etiketleri, şablon var | P1 (aile eksik) |
| Fibonacci extension / fan / spiral / time zone / channel | Yok | Sadece `fibonacci` retracement var | P1 |
| Long / Short Position | Kısmi | Entry/SL/TP, 2.5R hedef, dinamik kar/zarar renkleri var; gerçek pozisyon/risk yok | P1 |
| Çoklu grafik (layout 1/2/4/6) | Kısmi | Layout state var; görünüm menüsündeki butonlar açmıyor; iframe’ler senkronize değil | **P0 (buton)** + P1 (senkron) |
| Bar Replay | Kısmi | 8/13 timeframe çalışıyor; 5’inde hard fail. Scrubber yok | **P0** + P1 |
| Replay hız / play / pause / prev / next / restart / stop | Var | Bağlı; `#replay-restart` test edilmemiş ama handler mevcut | — |
| İndikatörler (SMA/EMA/RSI/MACD/BB/VWAP/ATR/ADX/OBV/Supertrend vb.) | Var (küçük katalog) | 14 klasik + volume/session/structure/FVG/MTF + 7 public microstructure | P1 (Pine yok) |
| Pine Script / topluluk scripti / script alarmı | Yok | Mimari olarak yok | P2 |
| Alarmlar (fiyat, yüzde, crossover, ses, webhook, Telegram) | Kısmi | Kurulum çalışıyor; CRUD eksik, lokal-only, cross-symbol bug | **P0 (bug)** + P1 |
| Grafik kaydetme / layout persistence | Var (otomatik) | local/cloud drawing + settings + local layout; manual save/load UI yok | P1 |
| Watchlist, sembol arama, TXT import/export/share | Var | Runtime’da picker/import/share bağlı; export download event’i test edilmemiş | P2 test |
| Screenshot / copy image / copy link | Var | Menü ve handler’lar mevcut; download/clipboard assertion eksik | P2 test |
| Crosshair sync / time-scale sync (multi-chart) | Yok | `postMessage` köprüsü yok | P1 |
| Global lock-all / clear-all lock koruması | Yok | Clear-all kilitli çizimleri de siliyor | P2 |
| Tema/renk paleti, grid, axis, sade mod | Var | View toggle’ları runtime’da `viewConfig` değiştirdi | — |
| TradingView watermark/branding | Yok | Vendor branding bulunmadı; fonksiyonel “TradingView benzeri” metinler kaldı | — |

---

## 3. Buton-buton runtime denetimi

### 3.1 Gerçekten çalıştığı doğrulananlar

| Kontrol | Gözlenen etki |
|---|---|
| `#symbol` | BTCUSDT → ETHUSDT: sembol, başlık, bağlantı ve URL değişti |
| `#symbol-search` | Sembol picker dialog’u açıldı |
| Zaman dilimi butonları (1M–1W) | Başlık ve veri yükü değişti; klavye kısayolları da çalışıyor |
| `#chart-type` | `line` ve `heikin` seçimleri uygulandı |
| `#indicators-manage` | İndikatör/study kataloğu açıldı |
| `#alarm-toggle` | Alarm yöneticisi dialog’u açıldı |
| `#replay-toggle` | Lab menüsü açıkken Bar Replay dialog’u açıldı |
| `#tester-open` | Strateji testleri dialog’u açıldı |
| `#research-toggle` | Araştırma paneli görünür oldu |
| `#goto-date-btn` | Replay başlatma akışını tetikledi |
| `#reset-view` | Görünüm sıfırlama mesajı/log’u üretti; çizim/indikatörleri silmedi |
| `#chart-settings` | Ayar dialog’u açıldı |
| `#fit`, `#live` | Bağlantı durumunu güncelledi |
| `#screenshot` | Shot menüsünü açtı |
| `#multi-toggle` | Tek/çoklu grafik geçişi yaptı (ancak ikon kaybı var, bkz. P2) |
| `#list-toggle` | Watchlist görünürlüğünü değiştirdi |
| Çizim araç grupları | İmleç, çizgiler, Fibonacci, şekiller, metin, pozisyon, cetvel, sil flyout/araç seçimleri çalıştı |
| `#magnet-toggle`, `#drawings-toggle` | `aria-pressed` ve çizim görünürlük durumu güncellendi |
| `#drawing-manage` | Nesne ağacı paneli açıldı |
| Seans kutusu butonları / `#session-boxes-settings` | Seans ekleme ve UTC ayar dialog’u çalıştı |
| `#watch-add`, `#watch-import`, `#watch-share` | Picker/import/share akışları çalıştı |
| `#log-scale` | Log/lineer ölçek değişimi çalıştı |

### 3.2 Bozuk veya yarım çalışanlar

| Kontrol | Runtime kanıtı | Sınıf |
|---|---|---|
| Replay @ `3m`, `2h`, `6h`, `12h`, `3d` | `pageerror: Error: Unsupported timeframe`; replay bar açılmadı | **P0** |
| `#auto-scale` | İlk ve ikinci tıklamada `aria-pressed=true`, `priceScale.autoScale=true` kaldı; kapatılamıyor | **P0** |
| `.layout-buttons button[data-layout="2\|4\|6"]` | `multiState.layout` 4’e değişti ama `#multi-chart` hâlâ `hidden`, `state.open=false` | **P0** |
| Alarm crossover state | Kodda `lastAlarmPrice` tek global değişken; sembol bazlı değil | **P0** |
| `#multi-toggle` | Geçiş çalışıyor ama `button.textContent = 'Tek grafik'` ikonu yok ediyor; `aria-label/title` eski metinde kalıyor | P2 |
| `#watch-export` | Handler mevcut; dosya indirme event’i test edilmedi | P2 test |
| `#replay-restart` | Handler mevcut; browser suite’inde tıklanmıyor | P2 test |

### 3.3 Gizli/duruma bağlı, hata değil

- `#shot-menu`, `#drawing-selection`, `#drawing-manager`, `#drawing-settings`, `[data-tool]` alanları, `#replay-bar`, `#multi-chart`, `#paper-panel`, `#research-panel`, `#strategy-tester`, `#strategy-lab` state’e göre gizlidir ve erişildiğinde çalışır.
- `#screenshot` ≤600px’de, `#fullscreen` desteklenmeyen tarayıcıda gizlidir.
- `#live` replay sırasında devre dışıdır; bu beklenen davranıştır.
- Lab menüsü kapalıyken replay/tester/research butonlarına programatik tıklama timeout verir; kullanıcı akışında menü açıldığı için gerçek hata değildir.

---

## 4. Özellik bazlı detaylı bulgular

### 4.1 Çizim araçları

**Güçlü yönler.** `TOOLS` registry’sinde `cursor`, `horizontal`, `vertical`, `trend`, `ray`, `rectangle`, `fibonacci`, `long`, `short`, `text`, `label`, `arrow`, `brush`, `ruler`, `delete` var. Çizim belgeleri UTC epoch + fiyat saklar; pixel bağımlılığı yok. `validDrawing()` sınır/kapasite kontrolü yapar. Undo/redo (`DrawingHistory`), manyetik OHLC yakalama, tüm çizimleri gizleme, nesne ağacı, arama, çoklu seçim, klasörleme, z-order, rename, copy, lock/hide, JSON export ve per-account/per-symbol localStorage + Supabase (`chart_drawings`) persistence mevcut.

**Eksikler.** Global lock-all yok. `#drawing-clear-all` kilitli nesneleri kontrol etmeden tüm diziyi temizliyor. Magnet snapping’de piksel/fiyat toleransı yok; uzak noktalar bile OHLC’ye çekiliyor. Varsayılan favorilerde yalnızca 4 araç var.

**Kanıt:** `assets/alfa-drawings-model.mjs:2-10,46-93,131-142`; `assets/alfa-drawings.mjs:97-118,145-164,385-473,494-540,586-604`; `alfa-charts.html:142-219`.

### 4.2 Fibonacci

Yalnızca bir araç var: `fibonacci: ['≋', 'Fibonacci Retracement']` (`alfa-drawings-model.mjs:6`). Varsayılan seviyeler `[0, .236, .382, .5, .618, .705, .786, 1]`; `.886` yok. `fibPrice()` ters anchor semantiği kullanıyor: `0 = ikinci uç, 1 = ilk uç` (`alfa-drawings-model.mjs:13-16`, UI notu `alfa-charts.html:182`). Bu TradingView kullanıcıları için kafa karıştırıcı olabilir.

Ayar panelinde seviye listesi, ters çevirme, fiyat etiketleri, isimli şablon kaydetme/yükleme gerçekten çalışıyor (`alfa-drawings.browser.mjs:100-138`). Buna karşılık extension (1.272/1.618/2.618), fan, spiral, time zone ve channel araçları yok.

**Öncelik:** P1. Mevcut davranış bozulmadan yeni tipler eklenmeli; `.886` varsayılan sete eklenebilir.

### 4.3 Long / Short Position

Entry/SL/TP alanları, RR hesabı, dinamik kâr/zarar renkleri ve sürüklenebilir handle’lar gerçekten var (`alfa-charts.html:191-207`, `alfa-drawings-render.mjs:64`, `alfa-drawings.mjs:448-450,642-645`). Ancak araç “yalnızca analiz” olarak etiketli; gerçek emir, bakiye riski, pozisyon büyüklüğü, kaldıraç, marjin, PnL, kısmi dolum, trailing stop yok.

`makeDrawing()` pozisyon oluştururken stop mesafesini `entry * .001` tabanına ve `entry * .2` üst sınırına clamp’liyor, target’ı sabit `2.5R` yapıyor (`alfa-drawings-model.mjs:51-57`). Bu, kullanıcı geometrisini sessizce değiştiriyor. Canlı RR metni `Math.abs()` kullandığı için yön hatalı olsa bile pozitif görünebilir.

**Öncelik:** P1. En azından “Risk/Reward Drawing” adı ve yön doğrulaması önerilir.

### 4.4 Çoklu grafik

- Tabs, 1/2/4/6 layout, pane ekleme/kapatma, odaklama, boş hücreye ekleme çalışıyor (`alfa-multichart.mjs:44-126,144-166`).
- Her pane ayrı `/alfa-charts.html?embed=1...` iframe’i (`MULTI:64-66,99-102`).
- Crosshair, time-scale scroll/zoom, child→parent sembol bildirimi ve per-pane interval **yok**.
- Parent `interval` değişince tüm iframe’ler yeniden render ediliyor.
- Embed modunda toolbar, drawing rail, watchlist, replay bar gizli (`alfa-charts.css:143-146`).
- Görünüm menüsündeki layout butonları sadece `state.layout` değiştiriyor, çoklu moda geçirmiyor (runtime kanıtı: `layout:4`, `open:false`, `#multi-chart hidden`).
- `#multi-grid` de generic `[data-layout]` selector’ına yakalandığı için grid tıklaması layout’u yeniden uyguluyor.
- `#multi-toggle` ikonu `textContent` ile yok ediliyor; erişilebilir ad eski kalıyor.

**Öncelik:** Görünür buton hatası **P0**; senkronizasyon eksikliği **P1** (büyük mimari iş, şimdilik “comparison grid” olarak dokümante edilmeli).

### 4.5 Bar Replay

**Çalışan:** 15m/1h/4h/1d/1w vb. için mum seçimi, tarihten başlatma, play/pause, prev/next, hız, save, stop, go-to-date, EMA/MTF Warm-up sınırları, boşluk/corrupt candle doğrulaması, saved session restore (`alfa-replay.browser.mjs:38-113`, `alfa-replay-model.mjs:40-105`).

**Kritik hata:** `candleCloseTime()` yalnızca 8 timeframe tanıyor:

```js
{ '1m':60, '5m':300, '15m':900, '30m':1800,
  '1h':3600, '4h':14400, '1d':86400, '1w':604800 }
```

Grafikte seçilebilen ve klavye kısayolu olan `3m`, `2h`, `6h`, `12h`, `3d` için `throw new Error('Unsupported timeframe')` oluşuyor (`alfa-replay-model.mjs:23-28`; `alfa-charts.mjs:269,310,313`). Runtime’da `3m` ile doğrulandı.

**Diğer eksikler:** Scrubber/timeline/progress göstergesi yok. Replay ve paper session’ları `exchange:'Binance', marketType:'spot'` olarak sabit kodlu (`alfa-charts.mjs:308`, `alfa-replay-model.mjs:81-83,111-114`); OKX/Bybit/Binance perp/FX ref’leri için yanlış metadata üretiliyor.

**Öncelik:** timeframe hard fail **P0**; scrubber ve venue metadata **P1**.

### 4.6 İndikatörler ve çalışmalar

`INDICATOR_CATALOG` 14 klasik indikatör içeriyor: SMA, EMA, WMA, VWMA, VWAP, Bollinger, Supertrend, RSI, MACD, Stochastic, StochRSI, ATR, ADX, OBV (`alfa-indicators.mjs:5-20`). Maksimum 24 indikatör. Study kataloğu volume, seans kutuları, session levels, market structure, FVG, MTF ve 7 public microstructure çalışması ekliyor.

Study UI gerçekten zengin: arama, kategori sekmeleri, favoriler, aktif filtresi, eye/settings/remove, parametre formları, MTF HTF seçimleri, seans UTC override’ları, public study config’leri (`alfa-chart-studies.mjs:146-288`). `marketDelta` gerçek browser testiyle doğrulandı; diğer 6 public study yalnızca katalog/config seviyesinde testli.

**Kısıtlar:** Bollinger population std kullanıyor (`/period`); VWAP UTC gününe göre sıfırlanıyor. Pine Script, topluluk scripti, script alert’i yok. TradingView’in yüzlerce built-in’i ile kıyaslanamaz.

**Öncelik:** P1 (katalog/genişletme), P2 (Pine ekosistemi).

### 4.7 Alarmlar

Condition seti: `above`, `below`, `crossAbove`, `crossBelow`, `pctUp`, `pctDown`. Sesler, tekrar, ses seviyesi, browser notification, webhook ve JWT’li `/api/access chart-alarm-telegram` gerçekten var (`alfa-alerts.mjs:4-125`, `alfa-charts.mjs:982-1006`). Alarm ekleme/test/silme runtime’da çalışıyor.

**Kritik bug:** `let alarms = null, lastAlarmPrice = null;` (`alfa-charts.mjs:980`). `checkAlarms(price)` her aktif sembol tick’inde bu tek değişkeni güncelliyor (`alfa-charts.mjs:1002-1006`). `crossAbove/crossBelow` önceki fiyatı kullandığı için BTC → ETH geçişinde ilk ETH tick, BTC fiyatıyla karşılaştırılabilir. Yanlış alarm veya kaçan alarm riski var.

**Diğer eksikler:** Alarm listesi sadece add/delete/test; edit, mute/disable, trigger history, export, cloud sync yok. Alarm storage local-only.

**Öncelik:** cross-symbol bug **P0**; CRUD/cloud/history **P1**.

### 4.8 Grafik kaydetme / veri bütünlüğü

| Store | Anahtar / tablo | Kapsam |
|---|---|---|
| Drawings | `alfa-drawings:v1:<owner>:<symbol>` + `chart_drawings` | hesap + sembol, revision + conflict block |
| Chart settings | `chart_settings` | user + symbol + timeframe |
| Local layout | `alfa-chart-layout:v1:<owner>:<symbol>:<interval>` | interval, type, grid, palette, overlay config |
| Multi-chart | `alfa-multichart:*` | tabs/layout/panes |
| Alarms | `alfa-alarms:v1:<owner>` | kullanıcı |

`layoutSettings()` çizim, alarm, watchlist ve multi state’i içermiyor. Çizim çakışmasında yerel değişiklik korunuyor ve kullanıcıya JSON export öneriliyor (`alfa-drawings-store.mjs:77-85,103-115`). Chart settings çakışmasında ise bulut sürümü otomatik uygulanıp “çakışma çözüldü” deniyor (`alfa-charts.mjs:1290-1322`). Bu, yerel tercihlerin sessizce kaybolması anlamına geliyor.

**Öncelik:** P1, ama “mevcut veriyi kesinlikle bozma” ilkesi gereği yak takip edilmeli.

### 4.9 Veri adaptörleri ve güvenlik

- `parseMarketRef()` bare `BTCUSDT` → Binance Spot; `OKX:BTCUSDT.P`, `BYBIT:BTCUSDT`, `BINANCE:BTCUSDT.P`, FX/Yahoo/indices destekleniyor (`alfa-charts-data.mjs:49-91`).
- Non-allowlisted/gated ref’ler için JWT token zorunlu; guest doğrudan Binance Spot kotasyonu alıyor.
- `CRYPTOCAP:*` quote-only, chartable değil.
- `/api/access?op=status` üretimde `401`, `private, no-store`, `Vary: Authorization` döndürüyor.
- Public microstructure study’leri yalnızca `binance` / `binance-perp` feed’lerini kabul ediyor (`alfa-public-studies.mjs:49-59`); OKX/Bybit/FX grafikleri açılsa bile OI/CVD/delta/footprint/heatmap çalışmıyor.
- Vendor watermark/iframe/branding yok.

**Öncelik:** study-venue uyumsuzluğu P1; mevcut güvenlik davranışı korunmalı.

### 4.10 UX

Güçlü: native `<dialog>` + focus restore, Escape/Arrow klavye navigasyonu, Alt+I/R/F/L/S, timeframe sayı kısayolları, sürüklenebilir favori araç çubuğu, responsive 320/390/768 kontrolleri, yükleme/hata mesajları, çevrimdışı uyarı.

Zayıf: `chartDialog()` her modala aynı `aria-label="Grafik ayarları"` veriyor (`alfa-chart-ui.mjs:62-84`). Multi-toggle erişilebilir adı/ikonu tutarsız. Replay scrubber yok. Mobil çoklu grafik tek kolona iniyor. 3-pane layout yok.

---

## 5. Önceliklendirilmiş eksiklikler

### P0 — Kritik (bu turda düzeltilecek)

| # | Eksiklik | Etki | Kanıt | Planlanan düzeltme |
|---|---|---|---|---|
| P0-1 | Replay 5 timeframe’de `Unsupported timeframe` atıyor | Bar Replay seçilen timeframe’lerde hiç açılmıyor; pageerror | `alfa-replay-model.mjs:23-28`; runtime `3m` pageerror | `candleCloseTime()` haritasını tüm `TIMEFRAMES` değerleriyle genişlet; sınır testi ekle |
| P0-2 | `#auto-scale` tek yönlü, kapatılamıyor | Görünen buton yarı çalışıyor; kullanıcı fiyat ölçeğini kontrol edemiyor | `alfa-charts.mjs:792-797,1452,1470,1506`; runtime tıklama testi | Gerçek toggle + `aria-pressed` + chart options + persistence; browser assertion |
| P0-3 | View menüsü layout butonları çoklu grafiğe geçmiyor | 2/4/6 butonları görünürde ölü | `alfa-multichart.mjs:196-198`; runtime `layout:4, open:false` | Selector’ı `.layout-buttons` ile sınırla, tıklamada `setOpen(true)` çağır; browser testi |
| P0-4 | Alarm önceki fiyatı semboller arası paylaşıyor | Yanlış/kaçan crossover alarmları | `alfa-charts.mjs:980,1002-1006` | Sembol bazlı tracker helper’ı + unit test + ana akışta kullanım |

### P1 — Önemli (sonraki tur)

1. Replay scrubber/timeline, venue/market-type metadata; paper/research tutarlılığı.
2. Çoklu grafik crosshair/time-scale/symbol sync ya da ürünü “karşılaştırma gridi” olarak net konumlandırma.
3. Alarms: edit, mute, history, cloud sync, test sound/delivery assertion’ları.
4. Fibonacci ailesi: extension/fan/spiral/time zone/channel; `.886`; TradingView uyumlu yön seçeneği.
5. Position tool: yön doğrulaması, geometriyi sessiz clamp etmeme, gerçek risk/size modeli veya isim değişikliği.
6. Chart settings çakışmasında yerel veriyi koruyan çözüm (keep local/cloud/export).
7. Study catalog genişletme, Bollinger sample-std seçeneği, session-VWAP anchor.
8. Public studies için venue capability UI; desteklenmeyen ref’lerde önleyici devre dışı bırakma.

### P2 — Gelişmiş / cilalama

1. `#multi-toggle` ikon + `aria-label/title` tutarlılığı.
2. Global lock-all; clear-all’de kilitli nesneleri koruma.
3. Magnet snap toleransı.
4. 3-pane layout ve mobil 2-up/swipe.
5. Modal bazlı `aria-label`.
6. `#watch-export`, `#drawing-export`, `#replay-restart`, screenshot download/copy assertion’ları.
7. Tüm context-menu aksiyonlarını gerçekten tıklayan test matrisi.

---

## 6. Test kapsamı değerlendirmesi

### 6.1 Gerçekten güçlü olan taraflar

- 1000+ mumluk gerçek Binance yükü, zoom/pan sonrası çizim anchor’larının korunması.
- Fibonacci 0.382 fiyatı, şablon kaydet/yükle, drag.
- Long/Short 2.5R ve handle drag.
- Replay determinizmi, boşluk reddi, EMA/MTF warm-up sınırları, saved session restore.
- View toggle’ları, chart settings, candle palette, keyboard timeframe kısayolları.
- Import/preview/apply watchlist akışı, hesap izolasyonu.
- Multi-chart basic toggle/layout/add/tab/exit.
- Object tree Ctrl multi-select/group/rename/delete/undo.

### 6.2 Kritik test boşlukları

1. 52 literal ID hiçbir testte geçmiyor; static string assert’leri ölü butonları yakalayamıyor.
2. Context-menu item’leri sadece metin olarak kontrol ediliyor; aksiyonlar tıklanmıyor.
3. Alarm teslimatı (Notification/Telegram/webhook) browser’da gerçek tetiklemeyle test edilmiyor.
4. 7 public studyden sadece `marketDelta` gerçek enable/disable ile testli.
5. Embedded multi-chart iframe’leri stub’lanıyor; gerçek iframe boot edilmiyor.
6. Page-error assertion’ları suite sonunda; erken hata diğer vakaları maskeleyebiliyor.
7. `#auto-scale`, `[data-layout]`, `#replay-restart`, `#watch-export`, `#drawing-clear-all` için davranış testi yok.

### 6.3 Önerilen P0 test eklemeleri

- `tests/alfa-replay.test.mjs`: tüm `TIMEFRAMES` için `candleCloseTime()` sınır değerleri ve constructor kabulü.
- `tests/alfa-alerts.test.mjs`: sembol bazlı price tracker (aynı sembol→önceki fiyat, farklı sembol→`null` previous).
- `tests/browser/alfa-workspace.browser.mjs`: `#auto-scale` iki tıklama; layout butonu → `#multi-chart` görünür + `state.open === true`.
- Her test vakasında page-error assertion’ı vakaya bağlı hale getirilmeli.

---

## 7. P0 düzeltme planı ve korunacak davranışlar

Düzeltmeler aşağıdaki sırayla, her biri ayrı commit olacak şekilde yapılacak:

1. `fix(replay): support all chart timeframes` — replay model + unit test.
2. `fix(charts): make auto-scale a real toggle` — main module + browser assertion.
3. `fix(multichart): layout buttons open multi-chart view` — multichart module + browser assertion.
4. `fix(alerts): track alarm previous price per symbol` — alerts helper + main module + unit test.

Her commit sonrası ilgili testler ve `node --test tests/*.test.mjs` çalıştırılacak. Üretime deploy **yapılmayacak**; kullanıcı onayı beklenene kadar commit’ler yerel kalacak.

Korunacak davranışlar:

- Bare `BTCUSDT` = Binance Spot; qualified ref’ler sessizce dönüştürülmeyecek.
- Çizim/analiz/araştırma için bare symbol anahtarları korunacak.
- Guest kullanıcı doğrudan Binance Spot kotasyonu almaya devam edecek.
- Free non-Spot ref’ler Alfa Charts session olmadan açılmaya devam edecek.
- Non-allowlisted ref’ler için JWT zorunluluğu sürecek.
- `private, no-store` ve `Vary: Authorization` başlıkları korunacak.
- Vendor branding/watermark eklenmeyecek.
- “Grafik görünümü sıfırla” yalnızca zoom/scale/view toggle’larını sıfırlayacak; çizim ve indikatörleri silmeyecek.
- `zgrc25@gmail.com` yalnızca Alfa Charts kullanıcısı kalacak; admin olmayacak.

---

## 8. Ek — komutlar

```powershell
cd 'C:\Users\Pc\AppData\Local\Temp\opencode\alfa-telegram-mobile-edu-deploy'

# Tüm Node testleri
node --test tests/*.test.mjs

# Yerel statik sunucu (Terminal 1)
node tests/browser/serve.mjs 4181

# Birincil browser suite’leri (Terminal 2)
$pw = 'C:\Users\Pc\AppData\Local\Temp\opencode\alfa-chart-browser-tests\node_modules\playwright\index.mjs'
node tests/browser/alfa-workspace.browser.mjs --playwright=$pw --url=http://127.0.0.1:4181
node tests/browser/alfa-drawings.browser.mjs --playwright=$pw --url=http://127.0.0.1:4181
node tests/browser/alfa-replay.browser.mjs --playwright=$pw --url=http://127.0.0.1:4181
node tests/browser/charts-feature-nav.browser.mjs --playwright=$pw --url=http://127.0.0.1:4181
```

---

## 9. Düzeltme günlüğü

Tüm P0 maddeleri küçük, bağımsız commit’lerle yerel olarak düzeltildi. Üretime dağıtım yapılmadı.

| Commit | Kapsam | Doğrulama |
|---|---|---|
| `f7afd2c` | Denetim raporunun eklenmesi | Belge commit’i; kod değişikliği yok |
| `7d2cc41` | P0-1 — Replay tüm chart timeframe’lerini destekliyor (`alfa-replay-model.mjs`, yeni sınır testi) | `node --test tests/alfa-replay.test.mjs` → 18/18; `node tests/browser/alfa-replay.browser.mjs` → `passed: true`, 4000 gerçek Binance mumu, `errors: []` |
| `7cb527a` | P0-2 — `#auto-scale` gerçek aç/kapat toggle’u; `aria-pressed`, `priceScale.autoScale`, ayar dialog’u, layout persistence ve “grafik görünümü sıfırla” tutarlı | `node --test tests/*.test.mjs` → 1093/1093; `node tests/browser/alfa-workspace.browser.mjs` → yeni `auto scale is a real on/off toggle` dahil tüm vakalar geçti |
| `7de0103` | P0-3 — Görünüm menüsündeki `[data-layout]` butonları çoklu grafiğe geçiriyor; `#multi-grid` yanlış selector’dan çıkarıldı | `node --test tests/*.test.mjs` → 1093/1093; workspace browser suite → yeni `view-menu layout buttons open multi-chart view` dahil 22/22 vaka geçti |
| `61db14b` | P0-4 — Alarm önceki fiyatı artık sembol bazlı (`createPriceTracker`), sembol değişiminde sıfırlanıyor, sınırlı boyutta | `node --test tests/alfa-alerts.test.mjs` → 7/7; `node --test tests/*.test.mjs` → **1094/1094**; workspace + replay + drawings browser suite’leri geçti, `pageErrors: []` |

### Son doğrulama özeti

- `node --test tests/*.test.mjs`: **1094 test, 1094 geçti, 0 hata**.
- `tests/browser/alfa-workspace.browser.mjs`: 22/22 gerçek tarayıcı vakası geçti (gerçek Binance verisi, yeni auto-scale ve layout kontrolleri dahil).
- `tests/browser/alfa-replay.browser.mjs`: `passed: true`, 4000 mum, `futureHidden`, `nextPrevious`, `ema200Warmup`, `goToDate`, `returnedToLive` doğrulandı.
- `tests/browser/alfa-drawings.browser.mjs`: 16/16 vaka geçti, çizim/Fibonacci/position/touch/undo regression’ları korundu.
- `git diff --check`: temiz. `git status --short`: temiz (commit sonrası değişiklik yok).
- Üretim hâlâ eski paketleri sunuyor; P0 commit’leri **deploy edilmedi**. Dağıtım için açık kullanıcı onayı gerekiyor.

### Korunan davranışlar (regression kontrolü)

Bare `BTCUSDT` = Binance Spot; qualified ref’ler korunuyor; guest doğrudan Binance Spot kotasyonu alıyor; free non-Spot ref’ler Alfa Charts session olmadan açılıyor; non-allowlisted ref’ler için JWT zorunluluğu sürüyor; `private, no-store` ve `Vary: Authorization` başlıkları korundu; vendor branding eklenmedi; “Grafik görünümü sıfırla” çizim/indikatörleri silmiyor; `zgrc25@gmail.com` admin değil.
