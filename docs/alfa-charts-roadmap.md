# Alfa Charts — TradingView farkları ve geliştirme sırası

**Denetim:** 24 Kasım 2026 · başlangıç commit'i `bf94707`.
Canlı hedef: https://alfa-trader.com/alfa-charts (`alfa-charts.mjs?v=57`).

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
| A1 | Alarmın çalışma kapsamı | `checkAlarms()` yalnızca seçili sembolün gelen fiyatını kontrol ediyor. Sekme/cihaz kapalıyken çalışan bulut alarmı yok. Önce panelde açıkça belirt; çoklu sembol ve 7/24 motoru ayrı projelendir. | P0 / açıklama küçük, motor büyük |
| A2 | Veri kaynağı ve gecikme şeffaflığı | Binance Spot doğrudan WS; diğerleri polling/proxy. Forex/metallerin bazıları Yahoo veya vadeli yaklaşık veri; `CRYPTOCAP` yalnızca değer, mum geçmişi yok. İstenen referans, gerçek kaynak, yaklaşık/türetilmiş/gecikmiş durum birlikte gösterilmeli; broker feed'iyle aynı fiyat vaat edilmemeli. | P0 / orta |
| A3 | “Footprint / heatmap” derinliği | Mevcut footprint mum başına taker alım-satım toplamı; fiyat seviyelerine ayrılmış bid/ask hücreleri değil. Heatmap anlık derinlik fiyat çizgileri; tarihsel likidite ısı haritası değil. Önce doğru isim/açıklama; gerçek sürümler C/D kapsamı. | P0 / açıklama küçük |
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
| B6 | İzleme listesi organizasyonu | Birden fazla isimli liste, klasör/bölüm, sıralama, renk bayrakları ve arama. Şimdiki owner-başına tek listeyi kayıpsız taşıma. | P1 / orta |
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
2. **A1 + A3 — Doğru kapsam açıklamaları**: yeni motor varmış izlenimi vermeden UI'ı netleştir.
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

## Kaynaklar

- [TradingView özellikleri](https://www.tradingview.com/features/) — grafik tipleri,
  çizimler, bulut alarmları, replay, Pine, paper ve veri kapsamı.
- [TradingView saat dilimi ayarı](https://www.tradingview.com/support/solutions/43000476526-is-there-a-way-to-change-chart-timezone-or-clock-time-at-the-bottom-of-the-chart/)
- Alfa kaynak dosyaları ve `tests/browser/alfa-workspace.browser.mjs`,
  `alfa-drawings.browser.mjs`, `alfa-replay.browser.mjs`.
