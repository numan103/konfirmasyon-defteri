# Alfa Charts — TradingView farkları ve geliştirme sırası

**Denetim:** 24 Kasım 2026 · başlangıç commit'i `bf94707`.
Canlı hedef: https://alfa-trader.com/alfa-charts (denetim başlangıcında `alfa-charts.mjs?v=57`).

## Kapsam ve yöntem

- Canlı misafir grafiği, indikatör kataloğu ve grafik ayarları incelendi.
- Çizim, alarm, veri adaptörleri, kayıt, çoklu grafik, replay, Paper/Strategy/Research
  modülleri kodla karşılaştırıldı.
- Karşılaştırma TradingView'in **tüm ürün yeteneklerine** göredir; bunların hepsi
  ücretsiz planda bulunmaz. Hedef birebir kopya veya ücretli veri lisansı satın almak
  değil, Alfa'nın günlük analiz deneyimini güvenli ve ücretsiz geliştirmektir.
- Gerçek kullanıcı oturumuna girilmedi; kayıtlı çizim/ayar silinmedi veya test
  verisiyle değiştirilmedi. Hesaplı bulut kaydı, Telegram teslimatı ve ikinci
  fiziksel cihaz bu denetimde canlı uçtan uca doğrulanmadı.
- Önceki [teknik denetim](alfa-supercharts-gap-analysis.md) tarihsel kayıttır;
  çözülmüş maddeler yeniden eksik sayılmadı.

## Zaten var — yeniden yapılmayacak

| Alan | Mevcut yetenek |
|---|---|
| Temel grafik | Mum, bar, çizgi, alan, Heikin Ashi; 13 periyot; favoriler ve sayı kısayolları; log/oto ölçek; renk ayarları |
| Çizim | Trend, yatay/dikey çizgi, ışın, ok, dikdörtgen, fırça, metin/etiket, cetvel, Fibonacci, long/short analiz çizimi |
| Çizim yönetimi | Nesne ağacı, klasör, çoklu seçim, adlandırma, katman sırası, kilit/gizleme, kopyalama, undo/redo, JSON yedek |
| Fibonacci/risk | .886 ve 1.272/1.618/2.618 dahil düzenlenebilir seviyeler; şablon; entry/SL/TP, risk tutarı ve pozisyon büyüklüğü |
| Göstergeler | 14 klasik gösterge, hacim, seanslar/seviyeler, BOS/CHoCH, FVG/IFVG, MTF ve 7 piyasa-verisi çalışması |
| Çoklu grafik | 1/2/4/6 düzen, sekmeler; zaman aralığı ve crosshair mesaj köprüsü; ana periyodu panellere uygulama |
| Replay/laboratuvar | Mum seçimi/tarih, zaman çizelgesi, hız, kayıt; Paper Trading, manuel strateji analizi, günlük ve Research arşivi |
| Alarmlar | 6 fiyat/yüzde/kesişim koşulu, düzenle/devre dışı/sessiz, tetikleme geçmişi, ses, tarayıcı/Telegram/webhook gönderimi |
| Liste/paylaşım | Sembol arama, borsa referansları, TXT/CSV içe/dışa aktarım, liste bağlantısı, ekran görüntüsü |

“Var” eşdeğer derinlik anlamına gelmez: örneğin bir grafikte RSI bulunması Pine
ekosistemini, mum başı delta bulunması fiyat-kademeli footprint'i karşılamaz.

## Sınıflar

- **A — Güvenilirlik / doğru beklenti:** önce anlaşılması ve güvenceye alınması gerekenler.
- **B — Günlük kullanım:** küçük ve bağımsız modüllerle kapatılabilecek farklar.
- **C — Analiz derinliği:** model + render + kapsamlı test gerektiren geliştirmeler.
- **D — Altyapı / dış bağımlılık:** veri lisansı, sürekli çalışan sunucu veya büyük yeni ürün gerektirenler.

Öncelik: **P0** yanlış beklenti/veri kaybı riski; **P1** günlük ihtiyaç; **P2**
ileri analiz; **P3** uzun vadeli/ayrı ürün. Boyutlar göreli iş kapsamıdır, süre taahhüdü değildir.

## A — Güvenilirlik / doğru beklenti

| ID | Fark | Alfa'daki mevcut sınır ve yapılacak iş | Öncelik / boyut |
|---|---|---|---|
| A1 | Alarmın çalışma kapsamı — açıklama tamamlandı | Panel seçili sembol, açık sekme, canlı bağlantı ve Replay sınırını açıkça belirtiyor. Sekme/cihaz kapalıyken çalışan bulut alarmı hâlâ yok; çoklu sembol ve 7/24 motoru ayrı iş. | P0 / açıklama tamam, motor büyük |
| A2 | Veri kaynağı ve gecikme şeffaflığı | Binance Spot doğrudan WS; diğerleri polling/proxy. Forex/metallerin bazıları Yahoo veya vadeli yaklaşık veri; `CRYPTOCAP` yalnızca değer, mum geçmişi yok. İstenen referans, gerçek kaynak, yaklaşık/türetilmiş/gecikmiş durum birlikte gösterilmeli; broker feed'iyle aynı fiyat vaat edilmemeli. | P0 / orta |
| A3 | “Footprint / heatmap” derinliği — açıklama tamamlandı | Katalog/legend/ayar adları mum deltası özeti ve anlık emir defteri seviyeleri olarak düzeltildi; ayarlarda sınırlar görünür. Gerçek fiyat kademeli footprint ve tarihsel ısı haritası henüz yok, C/D kapsamı. | P0 / açıklama tamam |
| A4 | Ayar çakışmasında yerel tercihi koruma | Çizim store'u çakışmayı blokluyor; chart-settings bazı revision çakışmalarında bulutu otomatik uyguluyor. Yerel kopyayı koruma + yerel/bulut seçimi + yedek akışı gerekli. | P0 / orta |

Kanıt: `assets/alfa-charts.mjs` (`checkAlarms`, `connectPolling`,
`scheduleCloudSave`), `assets/alfa-charts-data.mjs` (`parseMarketRef`, `YAHOO`),
`assets/alfa-market-data-public.mjs` (`footprintFromFlow`),
`assets/alfa-public-studies.mjs` (`renderHeatmap`).

## B — Günlük kullanım

| ID | Eksik / kısmi yetenek | Küçük modül hedefi | Öncelik / boyut |
|---|---|---|---|
| B1 | Grafik saat dilimi — tamamlandı | UTC, İstanbul, New York, Londra ve Tokyo; eksen/crosshair/son mum saati; yaz-kış saati. **Veri ve çizim epoch'ları değişmez.** | P1 / küçük |
| B2 | Mum kapanış geri sayımı | Periyoda göre sayaç; eski veri/replay durumunda yanıltıcı canlı sayaç göstermeme. | P1 / küçük |
| B3 | Replay'den bağımsız tarihe git | Mevcut tarih girişi replay başlatıyor. Normal grafikte tarih bulma, veri yoksa açık uyarı; replay durumunu değiştirmeme. | P1 / orta |
| B4 | Fiyat ekseni seçenekleri | Yüzde, 100'e endeksleme, ters fiyat ölçeği; log/oto zaten var. | P1 / orta |
| B5 | Çizim hassasiyeti | Zaman/fiyat koordinatlarını sayıyla düzenleme; devamlı çizim modu; güçlü/zayıf mıknatıs toleransı; kilitlileri koruyan toplu işlemler. Her biri ayrı modül. | P1 / orta |
| B6 | İzleme listesi organizasyonu — tamamlandı | Birden fazla isimli liste, TV tarzı sınıflandırma/gruplama, sıralama, renk bayrakları ve arama. Eski 44 referans ve mevcut listeler kayıpsız taşındı. | P1 / orta |
| B7 | İsimli görünüm/gösterge şablonları | Mevcut otomatik kayda ek olarak şablon kaydet/yükle; göstergeleri farklı sembollere uygulama. Fibonacci şablonları zaten var. | P1 / orta |
| B8 | Komut arama / kısayol rehberi | Aranabilir aksiyon menüsü; mevcut kısayolları görünür kılma; input ve modal odaklarını bozmama. | P2 / küçük |
| B9 | Çoklu grafikte panel kontrolü | Bağımsız panel periyodu, seçilebilir sync kapsamı, çizim senkronizasyonu, panel boyutlandırma; mobilde aynı anda 2 grafik. Mevcut zaman/crosshair köprüsünü yeniden yazmama. | P1 / orta-büyük |

## C — Analiz derinliği

| ID | Eksik / kısmi yetenek | Sınır ve bağımlılık | Öncelik / boyut |
|---|---|---|---|
| C1 | Aynı grafikte karşılaştırma | İkinci sembolü bindirme, yüzde normalize karşılaştırma; sonra spread/oran. Zaman eşleme ve kaynak uyumu şart. | P1 / orta |
| C2 | Genişletilmiş çizim ailesi | Paralel kanal, üç noktalı trend-based Fib extension, anchored VWAP; sonrasında pitchfork/Gann/harmonik. Mevcut Fib >1 seviyeleri üç noktalı extension değildir. | P2 / orta |
| C3 | Gösterge kapsamı ve şablonları | Ichimoku, pivot, Donchian/Keltner, ROC/CCI/MFI vb.; seans/ankrajlı VWAP; değerleri gösteren veri penceresi. | P2 / orta |
| C4 | Gelişmiş grafik tipleri ve aralıklar | Renko, range, Kagi, P&F, hollow/baseline; özel/saniye/tick periyotlar. Hepsi aynı veri ve anlamla üretilemez. | P2 / büyük |
| C5 | Gerçek volume profile / TPO / footprint | Seans/sabit/görünür aralık profilleri, fiyat kademeli delta/imbalance; OHLC'den tahmini hacmi gerçek işlem gibi sunmama. | P2 / büyük |
| C6 | Kural bazlı backtest | Şu anki manuel replay analitiğinden ayrı otomatik strateji kuralları; komisyon, kayma, örneklem dışı test. Pine motoru değildir. | P2 / büyük |
| C7 | Replay/paper kapsamı | Şu an motor Binance Spot bağlamına bağlı; diğer borsalar, senkron çoklu replay ve canlı paper hesapları ayrı uyarlama ister. | P2 / büyük |

## D — Altyapı / dış bağımlılık

| ID | Fark | Neden ilk sprint değil? |
|---|---|---|
| D1 | 7/24 sunucu alarmı, indikatör/çizim/çoklu koşul, tüm listeyi izleme | Kalıcı görev motoru, teslimat kuyruğu, tekrar önleme, kota/maliyet ve kesinti stratejisi gerekir. Ücretsiz Pages Functions tek başına sürekli alarm motoru değildir. |
| D2 | TradingView ile birebir borsa/broker verisi, uzun tick geçmişi | Lisans ve sağlayıcı anlaşması; bazı borsalarda ücretli veri. Public/proxy veriyle birebir eşitlik sözü verilemez. |
| D3 | Pine Script / topluluk script pazarı | Lightweight Charts bir Pine çalışma ortamı değildir. Güvenli özel kural editörü ayrıca değerlendirilebilir; Pine uyumluluğu vaat edilmeyecek. |
| D4 | Gerçek broker emirleri / DOM / hesap bağlantıları | Yetkilendirme, finansal güvenlik, broker API ve canlı emir sorumluluğu. Mevcut analiz/simülasyon ürününden ayrı kapsam. |
| D5 | Tam platform özellikleri | Tarayıcı (screener), hisse temel verileri, opsiyon zinciri, haber/takvim katmanları, sosyal yayın; hepsi ayrı veri/ürün modülleri. |

## Küçük adımlı sıra ve kabul şartları

1. **B1 — Saat dilimi**: tamamlandı; ilk düşük riskli kullanım geliştirmesi.
2. **A1 + A3 — Doğru kapsam açıklamaları**: tamamlandı; yeni motor varmış izlenimi vermeden UI netleştirildi.
3. **A2 — Kaynak/durum rozeti**: birebir ve yaklaşık veriyi ayır.
4. **A4 — Ayar çakışması**: yeni kayıt yüzeylerinden önce veri güvenliği.
5. **B2 — Mum sayacı**, **B3 — Tarihe git**, **B5 — Koordinat editörü**: ayrı commit/test.
6. **B6/B7 — Liste ve şablonlar**, sonra **C1 — Karşılaştırma**.
7. Diğer C/D başlıkları bağımlılıkları ve ücretsiz çalışma sınırları doğrulanınca.

Her kod modülü: ilgili birim + gerçek tarayıcı testi, çizim/ayar/replay regresyonu,
ayrı commit ve Türkçe sonuç raporu. Başarısız testte sonraki modüle geçilmez.
Bir turda tüm listeyi geliştirmeye çalışılmaz.

Korunacaklar: bare `BTCUSDT` = Binance Spot; venue ref'leri, çizim/alarm/research
anahtarları ve JWT kapıları değişmez. Misafir veri erişimi korunur. Eski kısıtlı
Supabase'e fallback yok. Mevcut çizim/veri silinmez, marka/watermark eklenmez.
Saat dilimi yalnızca gösterimdir; seans hesapları ve replay saatleri UTC kalır.

## İlk modül — B1 sonuçları

- `assets/alfa-chart-time.mjs`: IANA/Intl tabanlı etiket formatları; UTC varsayılan,
  bölgeye göre yaz/kış saati; tarih-only anahtarların takvim günü korunur.
- Alt çubuktaki saat dilimi düğmesi ve Grafik ayarları seçicisi aynı tercihi kullanır.
- Yeni `alfa-chart-timezone:v1:<owner>` tercihi yalnızca yerelde saklanır; eski
  çizim/alarm/layout anahtarları, bulut şeması ve API yetkileri değişmez.
  Aynı hesabın açık sekme/panellerine storage olayıyla uygulanır.
- 10 yeni birim testi; tüm birim testleri **1156/1156**.
- Yeni sentetik-verili Playwright testi: eksen/crosshair, görünüm/veri/çizim
  korunması, iptal, yeniden yükleme, diğer sekme/panel, replay UTC ve 320/390 px.
- Gerçek Binance verisiyle `alfa-workspace`, `alfa-drawings`, `alfa-replay`
  tarayıcı regresyonları geçti. Bu modül için gerçek hesaplı bulut testi yapılmadı.

## İkinci modül — A1/A3 açıklamaları

- Alarm panelindeki kalıcı not; seçili sembol, açık/canlı sekme, kapalı cihaz,
  arka plan duraklatması ve Replay sınırını belirtir. Bildirim izni yanıtı bu notu
  kaldırmaz. Telegram/webhook bağımsız 7/24 izleme olarak sunulmaz.
- `footprint` adı **Mum deltası · Footprint özeti**, `heatmap` adı
  **Likidite seviyeleri · anlık emir defteri** oldu. Katalog, grafik legend'i,
  çizgi/panel başlıkları ve ayar açıklamaları aynı metaveriyi kullanır.
- Aktif CVD/delta/footprint kaynak etiketleri `aggTrades` yerine kullanılan
  `klines` taker hacmini belirtir. Hesaplama, REST adresleri ve yenileme değişmedi.
- Eski `footprint`/`heatmap` kimlikleri, ayar/favori/layout ve alarm anahtarları
  korunur; veri taşıma veya sunucu/veritabanı değişikliği yoktur.
- 4 yeni birim testi; ilgili 29 birim ve tam suite **1160/1160** geçti.
- Yeni `alfa-chart-scope.browser.mjs`: kalıcı alarm notu, izin reddi, sembol
  değişimi, isim/ayar tutarlılığı, aynı delta sonucu, eski kimlik/favoriler,
  reload ve 320/390 px. Yalnızca izole test verisi; gerçek teslimat yok.
- `alfa-workspace`, `alfa-chart-time`, `alfa-drawings`, `alfa-replay` regresyonları
  da geçti. Bu modül 7/24 alarm veya gerçek footprint motoru eklemez.

## Ara düzeltme — Open Interest görünürlüğü

- **Sebep:** `1H` grafikte otomatik periyot `60m` üretiliyordu. Binance USD-M
  Futures istatistik uç noktası `60m` değerini kabul etmiyor; canlı istek
  `HTTP 400 / code -1130 · parameter 'period' is invalid` döndü. Arayüz
  göstergeyi “eklendi” olarak işaretlediği için boş alt panel kalıyordu.
- `intervalToPeriod` artık desteklenen `5m/15m/30m/1h/2h/4h/6h/12h/1d`
  değerlerini koruyor; `1m/3m → 5m`, `3d/1w → 1d`, bilinmeyen değer `1h`.
  Aynı eşleme Long/Short oranına da uygulanıyor ve desteklenmeyen açık
  periyotlar istek atılmadan reddediliyor.
- Spot grafik Spot kalıyor; OI aynı sembolün USD-M futures istatistiğinden
  geliyor. Ayar açıklaması, katalog/legend adı ve durum satırı kaynağı ve
  periyodu açıkça belirtiyor. Bare `BTCUSDT` ve venue referansları değişmedi.
- Legend ve aktif liste artık kalıcı `loading/ready/empty/unsupported/error`
  durumu gösteriyor; hata/boş durumda yeniden dene düğmesi var. Canlı fiyat
  tick'i durumu silmiyor; ağ hatasında son çizilen seri korunuyor, render
  hatası görünür oluyor, istek 15 sn'de zaman aşıyor ve yeniden boyama cache
  süresini uzatmıyor.
- Yeni alt panel, ölçülmemiş yükseklikle `setHeight()` çağrısı yaptığı için
  eşzamanlı eklenen göstergelerde çöküyordu; görece `setStretchFactor()`
  kullanıldı. 390/320 px'de OI paneli görünür kalıyor.
- İlgili birim testleri **20/20**, tam suite **1169/1169** geçti. Yeni
  `alfa-open-interest.browser.mjs` sentetik Binance taşımacılığıyla varsayılan
  `1H → 1h`, manuel `4h`, `1m → 5m`, HTTP hatası/yeniden deneme, boş durum,
  Long/Short, yeniden yükleme, mobil pane'ler ve çizim/alarm korunmasını
  doğruluyor. `workspace`, `scope`, `time`, `drawings`, `replay` regresyonları
  da geçti. Bu düzeltme API/veritabanı/JWT kapılarını değiştirmedi.

## Üçüncü modül — İndikatör kalıcılığı ve TV tarzı legend

- **Sebep:** göstergeler `alfa-chart-layout:v1:<owner>:<symbol>:<interval>` içinde
  saklanıyordu; `1H → 4H` geçişinde yeni periyot kaydı boş olduğu için indikatörler
  kayboluyordu.
- Yeni `alfa-studies:v1:<owner>:<ref>` paketi göstergeleri ve overlay durumlarını
  sembol/pazar bazında tutuyor. Eski periyot layout'ları yalnızca migrasyon
  kaynağı; var olan paket sessizce ezilmiyor, kasıtlı boş paket geri getirilmiyor.
- Legend artık sol üstten aşağıya dikey kartlar: her kartta göster/gizle, ayarlar,
  küçült/genişlet ve kaldır; altta toplu yönet/küçült/genişlet/kaldır. Osilatör
  paneli küçültülünce 30 px'e iniyor; kimlik, parametre, görünürlük ve küçültme
  durumu korunuyor.
- Görünüm amaçlı saat dilimi değişimi göstergelere dokunmuyor; çizim/replay
  epoch'ları UTC kalıyor. Eski `studies` kayıtları byte-uyumlu; `collapsed` yalnızca
  yeni kayıtlarda yazılıyor.
- `alarmLevel` eksik importu giderildi; alarm tetikleme geçmişi artık hata vermiyor.
- Yeni birim testleriyle tam suite **1176/1176**. Yeni
  `alfa-indicator-pane.browser.mjs` periyot/sembol/reload/saat dilimi ve üretim
  API'sine yazılmadığını doğruluyor; `workspace`, `chart-time`, `open-interest` ve
  `replay` tarayıcı regresyonları da geçti.
- Çizim/alarm/research anahtarları, bare `BTCUSDT` = Binance Spot, JWT kapıları ve
  bulut şeması değişmedi.

## Dördüncü modül — B6 izleme listesi organizasyonu ve TV listesi

- **Sebep:** yeni çalışma alanına geçişte eski 44 referanslık TradingView listesi
  ve kullanıcının önceki liste/ayarları görünmüyordu; listede klasör/sıralama/
  renk bayrağı ve TV tarzı sınıflandırma yoktu.
- Yeni `alfa-watchlist:v1:<owner>` belgesi geriye uyumlu: `symbols` aktif listenin
  görünümü olarak kalıyor; `lists`, `settings`, `flags` ek alanları adlandırılmış
  liste, renk, sıralama, grup modu (`none|type|venue|quote`), yıldız ve renk
  bayrağı taşıyor. Eski düz dizi ve v1 nesnesi aynı belgeye taşınıyor, mevcut
  özel listeler kırpılmıyor veya ezilmiyor.
- `alfa-watchlist:tv-migrated:v1:<owner>` işareti yalnızca başarılı kayıttan sonra
  yazılıyor. Bulut okuma hatası yerel migrasyonu engellemiyor; oturum açıkken
  eski `journals.data` kopyası tek yönlü ve sahip denetimli okunuyor, JWT kapıları
  ve bulut şeması değişmiyor.
- İlk açılışta/doc boşsa veya yalnızca dokunulmamış 4 varsayılan sembol varsa
  `TradingView · FX & Kripto` listesi **tam 44 referansla** oluşturuluyor ve aktif
  oluyor; üretilmiş varsayılan liste geride bırakılmıyor. Sonradan gelen eski
  kaynaklar eksik referansları ekliyor, hiçbir listeyi silmiyor. Manuel “TV
  listesini ekle” aynı birleştirmeyi kullanıyor.
- Sınıflandırma yalnızca gösterim: `Kripto · Spot`, `Kripto · Vadeli`,
  `Döviz / Emtia`, `Kripto endeksleri`, `Endeks / Vadeli`. Sembol kimlikleri
  (`CME:BTC1!`, `FX_IDC:XAUTRYG`, `CRYPTOCAP:BTC.D`, `BINANCE:BTCUSDT.P`,
  `BINANCE:BTCUSDT`, `OKX:XAUTUSDT` …) olduğu gibi saklanıyor; zorunlu coin
  kategorisi veya borsa dönüşümü yok.
- Ücretsiz FX/kripto referansları misafirde doğrudan, `BINANCE:BTCUSDT` gibi
  gated referanslar oturumla birlikte çalışıyor. Bare `BTCUSDT` hâlâ Binance Spot.
  Venue'lü Binance Spot referanslarında Binance REST/WS taşıması artık altındaki
  spot sembolünü kullanıyor; grafik/storage kimliği değişmiyor.
- Ayarlar penceresi listede ad/renk/silme, yeni liste, seçili sembolü ekleme,
  sıralama/yön/gruplama, sıkışık satır, renk bayrağı ve fiyat görünümü
  seçeneklerini kalıcı hale getiriyor. “Grafik görünümü sıfırla” çizim veya
  indikatörleri etkilemiyor.
- Çoklu grafik sembol seçici artık tüm listelerdeki referansları okuyor.
- İlgili birim testleri ve tam suite **1184/1184** geçti. Yeni
  `alfa-watchlist-tv.browser.mjs` 44 referansın birebir geri gelmesini, ücretsiz
  FX/kripto fiyatlarını, mevcut listenin korunmasını, manuel geri yüklemeyi,
  ayar kalıcılığını, çoklu grafiği ve 320/390/768 px düzenlerini doğruluyor.
  `workspace`, `indicator-pane`, `chart-time`, `open-interest` ve `replay`
  tarayıcı regresyonları da geçti.
- Çizim/alarm/indikatör/research anahtarları, admin/JWT kapıları ve bulut
  şeması değişmedi; yeni webhook, hesap veya veritabanı eklenmedi.

## Beşinci modül — TV tarzı kompakt gösterge satırları ve alt panel gömme

- **Sebep:** üstteki göstergeler iki satırlık kartlarla ayrı bir sayfa gibi
  görünüp grafik alanını küçültüyordu; alttaki osilatör panelini gömmek için
  yalnızca küçük bir düğme vardı.
- `#study-legend` artık TV'deki gibi tek satırlık, sol üstten aşağı sıralanan
  kompakt satırlar üretiyor. Ad/parametre/kısa açıklama aynı satırda; düğmeler
  satırın içinde, hover/focus ve dokunmatik cihazlarda görünür. Legend yüksekliği
  masaüstünde 112 px, mobilde 72 px ile sınırlı; beş gösterge eklemek grafiği
  belirgin şekilde küçültmüyor.
- Osilatörlerin (RSI, MACD, Stochastic, Stochastic RSI, ATR, ADX, OBV) legend
  satırına çift tıklamak TV davranışıyla alt paneli grafiğin dibine ince bir
  şeride gömüyor; ikinci çift tık paneli geri açıyor. Düğmelerde çift tıklama
  panel durumunu değiştirmiyor. Panel yüksekliği açıkken 80–150 px aralığında,
  kapalıyken 30 px; gösterge kimliği, parametreleri, `visible` ve `collapsed`
  durumu `alfa-studies:v1:<owner>:<ref>` içinde aynen korunuyor.
- Yeni `alfa-study-layout.test.mjs` satır sınıflarını ve panel yüksekliği
  sınırlarını doğruluyor. Tam birim suite **1186/1186** geçti.
  `alfa-indicator-pane.browser.mjs` kompakt satırları, çift tıkla gömmeyi ve
  periyot/sembol/reload/saat dilimi regresyonlarını doğruluyor; `workspace`,
  `chart-time`, `open-interest`, `watchlist-tv`, `replay` ve `chart-scope`
  tarayıcı testleri de geçti. `chart-scope` testi ayrıca deterministik watchlist
  seed'i ve `collapsed` alanıyla güncellendi.
- Çizim/alarm/research anahtarları, bare `BTCUSDT` = Binance Spot, JWT kapıları
  ve bulut şeması değişmedi; üretim API'sine yazılmadı.

## Kaynaklar

- [TradingView özellikleri](https://www.tradingview.com/features/) — grafik tipleri,
  çizimler, bulut alarmları, replay, Pine, paper ve veri kapsamı.
- [TradingView saat dilimi ayarı](https://www.tradingview.com/support/solutions/43000476526-is-there-a-way-to-change-chart-timezone-or-clock-time-at-the-bottom-of-the-chart/)
- Alfa kaynak dosyaları ve `tests/browser/alfa-workspace.browser.mjs`,
  `alfa-drawings.browser.mjs`, `alfa-replay.browser.mjs`.
