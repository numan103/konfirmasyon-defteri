# ALFA CHARTS Mobil UX / Ürün Denetimi

**Tarih:** 2026-11-25/26  
**Kapsam:** Salt okunur (read-only) UX ve ürün denetimi. Uygulama kodu değiştirilmedi, yeni paket/framework eklenmedi, production deploy yapılmadı, gerçek kullanıcı verisi değiştirilmedi.  
**Test ortamı:** `https://alfa-charts-staging.pages.dev/alfa-charts.html?debug=1` (mobil 390×844, iPhone 13 emülasyonu, gerçek Chrome + Playwright). Production `https://alfa-trader.com/alfa-charts.html` yalnızca referans alındı.  
**Uygulama sürümleri:** `alfa-charts.css?v=33`, `alfa-charts.mjs?v=76`. `sw.js` değiştirilmedi: `CACHE = alfa-v157-polish`, `BUILD_ID = b218-polish`.

---

## 1. Yöntem ve sınıflandırma

### 1.1 Sınıflandırma anahtarı

| Durum | Anlamı |
|---|---|
| `WORKING` | Gerçek tarayıcı akışında gözlemlendi; yalnızca butonun/varlığın bulunması yeterli değil. Kalıcı sonuç veya doğrulanabilir durum değişimi var. |
| `PARTIAL` | Kod/UI yolu var ancak mobil görünürlük, tarayıcı yeteneği, ağ/hesap bağımlılığı veya UX kısıtı nedeniyle tam ürün davranışı sağlanmıyor. |
| `BROKEN` | Denenen akışta hata üretti veya beklenen sonuç vermedi. Bu denetimde kapsam içindeki ana akışlarda `BROKEN` gözlemlenmedi. |
| `MISSING` | İlgili yetenek üründe bulunmuyor (ör. ayrılmış landscape mobil düzeni, 7/24 sunucu taraflı alarm). |
| `UNVERIFIED` | Gerçek hesap, bulut, cihazlar arası, iOS Safari, native install veya production erişimi olmadan doğrulanamadı. |

### 1.2 Kanıt eşiği

- Bir özellik yalnızca DOM’da buton varsa `WORKING` sayılmadı.
- `WORKING` için en az bir gözlemlenebilir sonuç kullanıldı: `localStorage` anahtarı, grafik görünür aralığı, çizim kimliği/konumu, indikatör parametresi, dialog alanları veya ekran görüntüsü.
- oturum açma/bulut/cross-device senaryoları `UNVERIFIED` bırakıldı; staging Auth yanıtı `401 {"message":"Invalid JWT"}`.
- İlk otomatik koşularda iki yanlış test varsayımı düzeltildi:
  1. Fibonacci için masaüstü grup butonuna tıklanıp sürükleme yapılmıştı; mobil akışta araç **iki nokta tıklaması** ile tamamlanır. Doğru mobil grup/yol ile akış `WORKING`.
  2. Replay için menü tıklaması sonrası doğrudan replay çubuğu beklenmişti; gerçek akış önce **Bar Replay** modalı ve mum seçimi gerektirir. Doğru akışla `WORKING`.
- Tüm tarayıcı koşularında `pageErrors: []`.

### 1.3 Kanıt dosyaları

| Kaynak | İçerik |
|---|---|
| `C:\Users\Pc\AppData\Local\Temp\opencode\alfa-ux-audit\evidence.json` | Ana oturum: 10 ekran görüntüsü, 13 akış, `pageErrors: []`. |
| `C:\Users\Pc\AppData\Local\Temp\opencode\alfa-ux-audit\evidence-supplement.json` | Fibonacci ve Replay/Paper akışlarının doğru etkileşim modeliyle yeniden doğrulanması, `pageErrors: []`. |
| `docs/screenshots/*.png` | 390×844 dikey ve 844×390 yatay ekran görüntüleri. |
| Statik envanter | `alfa-charts.html`, `assets/alfa-charts.mjs`, `alfa-drawings.mjs`, `alfa-chart-studies.mjs`, `alfa-watchlist.mjs`, `alfa-multichart.mjs`, `alfa-chart-settings-store.mjs`, `sw.js`, `manifest.webmanifest`, `index.html`. |
| Operasyonel kanıt | `V:\ALFA-Backups\alfa-20261125T163349Z.dump` (4.732.095 bayt), SHA256 `6DCE0F7A144D8500EED3CFDD44D16A76DE61AF1FD8F5C48100CDAB3917DA1917`, `verify-full`, VeraCrypt şifreli, `pg_restore --list` çıkış kodu 0. İzole geri yükleme: `V:\ALFA-Backups\isolated-restore-evidence.json`; 80 tablo sayım/içerik hash’i eşleşti, ağ izolasyonu true. |

> Not: Yedek dosya yolu, boyutu ve hash’i kanıt amacıyla verilmiştir; yedek içeriği, parola, token, API anahtarı veya üretim sırrı bu raporda yer almaz.

---

## 2. Özellik envanteri ve durumlar

| # | Alan / Özellik | Durum | Kanıt ve not |
|---|---|---|---|
| 1 | Chart erişim yetkisi (`/api/access`) | `UNVERIFIED` | Nav linkleri varsayılan gizli; admin/kullanıcı yetkisi kodu var. Staging JWT reddediyor: `401 Invalid JWT`. |
| 2 | PWA standalone metadata | `PARTIAL` | Manifest `display: standalone`, 3 ikon, `theme_color #0b0f1a`; doğrudan chart sayfasında `swRegistrations: 0`. Gerçek iOS “Ana Ekrana Ekle” akışı `UNVERIFIED`. |
| 3 | Mobil kabuk ve sheet sistemi | `WORKING` | Menu/tools/settings/share/timeframes sheet’leri açılıp kapanıyor; backdrop, grip ve close yolları çalışıyor. 18 menü butonu. |
| 4 | Güvenli alan / alt strip | `WORKING` | 390×844’te chart `390×768`, strip `y=768`, `h=48`; iOS gesture alanı `24px + safe-area` ile temizleniyor. |
| 5 | Siteye dön bağlantısı | `WORKING` | `#chart-home` → `/?page=home`, dikey modda görünür; yatayda gizli. |
| 6 | BTC ↔ ETH ↔ BTC | `WORKING` | Başlangıç `BTCUSDT`, picker üzerinden `ETHUSDT`, watchlist satırından tekrar `BTCUSDT`; `method: ui`. |
| 7 | İzleme listesi ekle/kaydet | `WORKING` | `alfa-watchlist:v1:guest` içinde `ETHUSDT` mevcut; uzunluk 1779 karakter. |
| 8 | TradingView/private liste import | `UNVERIFIED` | Kod yolu var; auth/sunucu bağımlılığı ve gerçek hesap testi yapılmadı. |
| 9 | Zaman dilimleri | `WORKING` | 9 buton; mobil sheet’ten `3D` seçildi ve kalıcı oldu. Satır ölçüsü `306×36`. |
| 10 | Eski mumlar / aralık gezinme | `WORKING` | Görünür aralık `from 935 → 879` kaydı; eski veri isteği ve birleştirme gözlemlendi. Sağlayıcı derinlik sınırı `UNVERIFIED`. |
| 11 | Dokunma hareketleri (pan/pinch) | `WORKING` | Dikey pan kapatılıp yatay pan/pinch açık; kod ve mobil kabuk davranışı uyumlu. |
| 12 | Fiyat ekseni dokunma ölçekleme | `WORKING` | Grip ile temas sonrası 1% fiyat piksel mesafesi `5.29 → 4.14`; `engaged: true`. |
| 13 | Uzun basma ile görünüm sıfırlama | `WORKING` | Bağlam menüsü açıldı; görünüm `from 1065, to 1135`, `autoScale: true`. |
| 14 | Fibonacci çiz/taşı/sil/tazele | `WORKING` | İki nokta tıklaması ile oluşturuldu, uç noktası taşındı, reload sonrası aynı koordinatlar, nesne ağacından silindi; boş tıklama çizim oluşturmadı. |
| 15 | Çizim nesne ağacı / undo / redo | `WORKING` (yerel) | Nesne ağacından seçim ve silme çalıştı; undo/redo kod yolu mevcut. Bulut tarafı ayrıca `UNVERIFIED`. |
| 16 | EMA / VWAP ekleme ve parametre düzenleme | `WORKING` | EMA `period=50`, VWAP `source=close`; legend değerleri güncellendi. |
| 17 | İndikatör kataloğu / study legend | `WORKING` | Katalog, arama, active sekmesi, ayar dialogu ve chip/value render’ı doğrulandı. |
| 18 | Görünüm/palette kaydı | `WORKING` (yerel) | 10 kontrol; `alfa-chart-palette:v1` → `#18263a`, chart boyaması `rgb(24, 38, 58)`. |
| 19 | Reload sonrası workspace restore | `WORKING` (yerel) | Reload öncesi/sonrası `3D`, `#18263a`, `ETHUSDT` watchlist durumu aynı. |
| 20 | Multi-chart layout / sync | `PARTIAL` | Masaüstünde kod ve senkronizasyon tam; telefonda `#multi-toggle` ve toolbar gizli, mobil menüde yok. |
| 21 | Replay | `WORKING` | Modal → grafikten mum seçimi → çubuk göründü; `301 → 302`, `2026-11-24T10:00Z → 11:00Z`. |
| 22 | Paper Trading | `WORKING` (simülasyon) | Replay sırasında panel açıldı; gerçek emir yok, ürün simülasyon olarak tanımlı. |
| 23 | Strategy Tester / Research erişimi | `PARTIAL` | Ana mobil menüde tester yok, `#lab-menu` gizli; `#tester-open` Replay/Paper paneli içinde görünür oldu (`display: flex`). Research yolu masaüstü lab menüsüne bağlı. |
| 24 | Fiyat alarmları | `PARTIAL` | Dialog 9 alan, izin ve ekle butonları var; metin açıkça “sekme/cihaz kapalıyken çalışmaz” diyor. 7/24 teslim `MISSING`. |
| 25 | Telegram/webhook alarm teslimi | `UNVERIFIED` | Auth/server ve HTTPS/browser izni bağımlılığı; gerçek gönderim testi yapılmadı. |
| 26 | Screenshot / paylaşım | `PARTIAL` | Canvas kompozisyonu, indirme, link ve share sheet kodu var; `navigator.share` ve görüntü panosu desteği `UNVERIFIED`. |
| 27 | Bulut düzen/çizim senkronizasyonu | `UNVERIFIED` | Kod yolu ve çakışma çözümü var; gerçek Supabase oturumu olmadan doğrulanamadı. |
| 28 | Masaüstünde kaydedilen çizimi mobilde açma | `UNVERIFIED` | `chart_drawings` select + local fallback kodu var; gerçek hesap/cross-device testi yok. |
| 29 | Dikey mobil düzen | `WORKING` | 390×844’te yatay taşma yok (`doc.w=390`), chart ve alt strip doğru yerleşti. |
| 30 | Yatay telefon düzeni | `PARTIAL` | 844×390’da masaüstü toolbar döndü, chart yüksekliği `139`, sayfa yüksekliği `1232`, ev bağlantısı gizli. Ayrılmış landscape düzeni `MISSING`. |
| 31 | Performans (ilk yükleme) | `WORKING` (ölçüm) | `domContentLoaded 378 ms`, `load 381 ms`, 70 resource; gerçek cihaz performansı `UNVERIFIED`. |
| 32 | Yedeklenabilirlik / izole restore | `WORKING` | verify-full TLS, VeraCrypt şifreli dump, `pg_restore --list` başarılı, 80 tablo hash eşleşmesi. Bu bir UX özelliği değil, operasyonel güvence kanıtıdır. |

---

## 3. Gerçek akış sonuçları

| Akış | Sonuç | Durum | Ölçülen kanıt |
|---|---|---|---|
| Menü ve dokunma hedefleri | PASS | `WORKING` | Menü butonları `111×64`; araç butonları `66×52`; araç grupları `113×54`; zaman aralığı satırları `306×36`. |
| BTC → ETH → BTC | PASS | `WORKING` | `BTCUSDT → ETHUSDT → BTCUSDT`; sembol picker/watchlist yolu UI. |
| Watchlist ekle/kaydet | PASS | `WORKING` | `alfa-watchlist:v1:guest`, `hasEth: true`. |
| Zaman dilimi + eski mumlar | PASS | `WORKING` | `3D`; görünür aralık `from 935 → 879`, `to 1005 → 999`. |
| Görünüm/palette | PASS | `WORKING` | `#18263a` kaydedildi ve grafik `rgb(24, 38, 58)` boyandı. |
| Fibonacci çiz / taşı / reload / sil | PASS | `WORKING` | Kimlik `d2d2f873…`; tip `fibonacci`; uç nokta `time 1795582338.75 → 1795629251.25`, `price 56999.75 → 57816.06`; reload sonrası aynı; son çizim sayısı `0`; yanlışlıkla çizim oluşmadı. |
| Reload workspace restore | PASS | `WORKING` | Sembol `BTCUSDT`, TF `3D`, palette `#18263a`, watchlist `true` korundu. |
| EMA / VWAP ekle + parametre | PASS | `WORKING` | EMA `period=50, source=close`; VWAP `source=close`; legend’de `73.645,59` ve `59.358,85` değerleri. |
| Alarm dialogu | PASS | `PARTIAL` | Başlık `🔔 Fiyat Alarmları · BTCUSDT`, 9 alan, izin + ekle butonları; kapsam notu açık. |
| Replay + Paper | PASS | `WORKING` / `PARTIAL` | Replay `301 → 302`, saat `10:00Z → 11:00Z`; Paper paneli açıldı; tester ana menüde yok. |
| Fiyat ekseni touch scale | PASS | `WORKING` | 1% fiyat mesafesi `5.29 → 4.14`. |
| Uzun basma reset | PASS | `WORKING` | Görünüm son mumlara döndü, `autoScale: true`. |
| PWA metadata | PASS | `PARTIAL` | `display: standalone`, 3 ikon, tema `#0b0f1a`; SW kaydı 0, iOS install `UNVERIFIED`. |
| Landscape 844×390 | OBSERVED | `PARTIAL` | Toolbar `display:flex`, chart `796×139`, doc `844×1232`, ev bağlantısı `display:none`. |
| Auth / cloud / cross-device | BLOCKED | `UNVERIFIED` | Staging `401 {"message":"Invalid JWT"}`; gerçek kullanıcı verisi kullanılmadı. |

---

## 4. Ekran görüntüleri

Tüm görüntüler staging oturumundan alınmıştır; dosyalar `docs/screenshots/` altındadır.

| Dosya | İçerik |
|---|---|
| `01-chart-portrait.png` | 390×844 dikey grafik kabuğu: chart `390×768`, alt market strip, gizli masaüstü toolbar. |
| `02-menu.png` | Mobil menü sheet’i; 18 kısayol. |
| `03-tools-groups.png` | Araç sheet’i ve kategori grupları. |
| `04-timeframes.png` | Zaman dilimi sheet’i; 9 seçenek. |
| `05-watchlist.png` | İzleme listesi paneli ve ekle/satır seçimi. |
| `06-symbol-picker.png` | Parite arama/ekleme dialogu; ETHUSDT seçimi. |
| `07-settings-palette.png` | Görünüm ayarları; özel palet kaydı. |
| `08-fibonacci.png` | İki nokta ile çizilen Fibonacci nesnesi. |
| `09-indicators-active.png` | Aktif EMA/VWAP/Hacim study chip’leri ve değerleri. |
| `10-alarms.png` | Fiyat alarmı yöneticisi ve yerel kapsam uyarısı. |
| `11-replay-paper.png` | Replay çubuğu ve Paper Trading paneli birlikte. |
| `12-landscape.png` | 844×390: masaüstü toolbar’a düşen yatay görünüm. |

---

## 5. UX sorun analizi

1. **Yatay mod mobil ürün değil, masaüstü fallback.** `isMobile` modül yüklenirken bir kez hesaplanıyor; CSS breakpoint yalnızca genişliğe bakıyor. 844×390’da toolbar geri geliyor, chart `139px` yüksekliğe iniyor ve sayfa `1232px` uzuyor. Kullanıcı yatayda tekrar kaydırmak zorunda kalıyor. `PARTIAL` + ayrılmış düzen `MISSING`.

2. **Gelişmiş araçların keşfedilebilirliği zayıf.** Multi-chart masaüstünde çalışıyor ama telefonda menüde yok. Strategy Tester doğrudan menüde değil; Replay → Paper içinden dolaylı yolla açılıyor. Research masaüstü lab menüsüne bağlı. Buton kodu varlığı mobil erişim anlamına gelmiyor.

3. **Alarm beklentisi ile gerçek davranış riski.** UI doğru şekilde “sekme/cihaz kapalıyken çalışmaz” diyor; ancak ürün genelinde alarm 7/24 algısı oluşabilir. Sunucu taraflı teslim `MISSING`, Telegram/webhook `UNVERIFIED`.

4. **Paper Trading gerçek işlem sanısına açık.** Panel simülasyon olarak işaretli olsa da mobil akışta Replay ile birlikte açıldığı için “canlı emir” algısı oluşabilir. Kalıcı ve belirgin “simülasyon” etiketi önerilir.

5. **Bulut davranışı sessizce yerel’e düşebiliyor.** Yerel restore çalışıyor; gerçek hesapta senkronizasyon ve çakışma çözümü kodda var ama doğrulanmadı. Kullanıcıya “yerel / bulut / çakışma” durumu net gösterilmiyor. `UNVERIFIED`.

6. **İki noktalı çizim gesture’ı sezgisel değil.** Fibonacci ve benzer araçlar sürükle-bırak değil, iki ayrı tıklama ile tamamlanıyor. Yardım metni “iki nokta seçin” diyor; ilk denemede sürükleme yapan kullanıcı için çizim oluşmuyor. Bu bir hata değil, öğrenme maliyeti.

7. **Alt şerit dokunma hedefleri küçük.** Menü sheet’i `111×64` ile iyi; ancak alt strip’te sembol butonu `230×36`, zaman dilimi `56×34`, yıldız `28×34`, menü `34×34`. Yıldız ve zaman butonları 44×44 önerisinin altında.

8. **Zaman aralığı satır yüksekliği 36px.** `306×36` genişlik açısından iyi, dikey dokunma için düşük.

9. **Paylaşım yetenekleri cihaza göre değişiyor.** Share sheet ve indirme/link yolu var; ancak `navigator.share` ve görüntü panosu desteği doğrulanmadı. Desteklenmeyen cihazda kullanıcı önce hatayı görebilir.

10. **PWA kurulumu doğrudan chart sayfasında eksik hissettiriyor.** Metadata doğru, fakat chart sayfasında service worker kaydı yok (0). Ana sitede kayıt var; doğrudan URL ile açan kullanıcı için offline/install davranışı belirsiz.

11. **Giriş/erişim kapısı görünmez.** Chart bağlantıları varsayılan gizli ve yetki `/api/access` ile kontrol ediliyor. Yetkisiz kullanıcı için neden erişemediği açık değil; staging doğrulaması JWT hatasıyla bloklu.

12. **Canlı veri ve sağlayıcı derinliği genelleştirilemedi.** Görünür aralık kaydı çalışıyor; tüm sembollerde veya çok derin geçmişte davranış `UNVERIFIED`.

---

## 6. İlk 20 iyileştirme önerisi

| # | Öncelik | Öneri | Gerekçe / kanıt |
|---|---|---|---|
| 1 | `P0` | Yatay mod için gerçek bir mobil düzen yap; breakpoint’e `orientation/height` ekle ve `isMobile` değerini resize sırasında yeniden hesapla. | 844×390’da masaüstü toolbar, `139px` chart, `1232px` sayfa. |
| 2 | `P0` | Alarm kapsamını ana ekranda da açıkça göster: “yalnızca bu sekme açıkken”. | UI notu doğru ama ürün beklentisi riskli; 7/24 teslim `MISSING`. |
| 3 | `P0` | Bulut senkronizasyonu, çakışma ve cross-device senaryolarını gerçek test hesabıyla doğrula; durum göstergesini görünür kıl. | `UNVERIFIED`; yerel restore `WORKING`. |
| 4 | `P0` | Masaüstünde kaydedilen çizimin mobilde açıldığını uçtan uca test et. | Kod yolu var; auth/cross-device testi yok. |
| 5 | `P0` | Paper Trading’e kalıcı “Simülasyon / gerçek emir yok” rozeti ekle. | Replay ile birlikte açılıyor; gerçek emir kapsam dışı. |
| 6 | `P0` | Chart sayfasında service worker kaydını ve install ipucunu netleştir. | Direct chart `swRegistrations: 0`; iOS install `UNVERIFIED`. |
| 7 | `P1` | Multi-chart için mobil bir keşif yolu ekle ya da mobilde bilinçli olarak devre dışı olduğunu açıkla. | Kod `WORKING` ama menüde yok. |
| 8 | `P1` | Strategy Tester / Research için mobil giriş noktaları veya açıklayıcı boş durum ekle. | `#lab-menu` gizli; tester sadece Replay/Paper detour’unda. |
| 9 | `P1` | Alt şeritteki menü, yıldız ve zaman butonlarını en az `44×44` yap. | Ölçümler `34×34`, `28×34`, `56×34`. |
| 10 | `P1` | Zaman aralığı sheet satır yüksekliğini `44px` üstüne çıkar. | Mevcut `306×36`. |
| 11 | `P1` | Fibonacci gibi iki noktalı araçlar için ilk dokunuşta kısa bir görsel ipucu göster. | Sürükleme denemesi çizim oluşturmuyor; doğru davranış iki tık. |
| 12 | `P1` | `navigator.share` / clipboard desteklenmediğinde indirme ve kopyalanabilir link fallback’ini otomatik göster. | Yetenek desteği `UNVERIFIED`. |
| 13 | `P1` | Gerçek iPhone Safari’de gesture, safe-area, standalone ve share testi yap. | Headless Chrome gerçek iOS davranışını kanıtlamaz. |
| 14 | `P1` | Erişim reddedildiğinde kullanıcıya anlaşılır bir “neden / nasıl erişirim” ekranı göster. | Staging `401 Invalid JWT`; nav gizli. |
| 15 | `P1` | Sağlayıcı geçmiş derinliği ve sembol bazlı veri sınırlarını UI’da göster. | Aralık kaydı çalışıyor; derinlik `UNVERIFIED`. |
| 16 | `P2` | Share sheet, tools sheet ve settings sheet için ortak bir “kapat”/geri davranış standardı kullan. | Sheet sistemi yeniden kullanılabilir; tutarlılık artırılabilir. |
| 17 | `P2` | Alarm sayfasındaki kapsam notunu daha kısa ve görünür bir uyarı kartına dönüştür. | 9 alan arasında not kolay kayboluyor. |
| 18 | `P2` | Legend chip’lerindeki ham parametre metnini (`period=50, source=close`) kullanıcı dostu etikete çevir. | Gözlemlenen chip metni karışık görünüyor. |
| 19 | `P2` | Yatay modda ev bağlantısını gizlemek yerine kompakt bir “Siteye dön” ikonu tut. | 844×390’da `display:none`. |
| 20 | `P2` | Asset değişikliklerinde `?v=` zorunlu kuralını ve `sw.js` dokunmama kuralını CI kontrolüne bağla. | Mevcut sürümler `?v=33 / ?v=76`; `sw.js` sabit. |

---

## 7. Yeniden kullanılabilir bileşenler

| Bileşen | Yeri | Kullanım / not |
|---|---|---|
| `openSheet / closeSheets / backdrop / grip` | `assets/alfa-charts.mjs` | Menu, tools, settings, share ve timeframes için tek sheet mekanizması. Yeni mobil paneller buraya eklenebilir. |
| `mobile-market-strip` | `alfa-charts.html`, `assets/alfa-charts.mjs` | Swipe preview + dwell commit; sembol değiştirme ve izleme listesi girişi. |
| Mobil zaman aralığı sheet’i | `assets/alfa-charts.mjs` | Favoriler, swipe ve dokunma seçimi; 9 TF seçeneği. |
| Araç grupları + favoriler | `assets/alfa-drawings.mjs`, `assets/alfa-charts.mjs` | Grup → araç iki seviyeli seçim; long-press/contextmenu ile favori. |
| `DrawingHistory / DrawingStore / ObjectTree` | `assets/alfa-drawings*.mjs` | Çizim yaşam döngüsü, undo/redo, yerel kalıcılık, nesne ağacı. Bulut katmanı ayrı. |
| `ChartStudies` + study dialog | `assets/alfa-chart-studies.mjs` | Katalog, arama, active sekmesi, legend, parametre editor’ü. EMA/VWAP doğrulandı. |
| `chartDialog` | `assets/alfa-chart-ui.mjs` | Alarm, indikatör, replay, çizim ayarları için ortak modal altyapısı. |
| Watchlist model/store/picker | `assets/alfa-watchlist*.mjs` | Liste, favori, arama, ekle/sil, quote refresh. |
| `ReplayEngine` + replay bar | `assets/alfa-replay-model.mjs`, `assets/alfa-charts.mjs` | Private candle prefix, deterministik adım, warm-up, kayıt/restore. |
| Paper panel | `assets/alfa-paper.mjs` | Simülasyon defteri ve Replay entegrasyonu; üretim emri yok. |
| Alarm manager | `assets/alfa-charts.mjs` | Yerel kurallar, ses/tekrar, izin isteği, kapsam uyarısı. |
| Layout/palette store + conflict resolver | `assets/alfa-charts.mjs`, `alfa-cloud-conflict.mjs` | Kullanıcı/sembol/TF bazlı kalıcılık; bulut çakışması için çözüm dialogu kodu var. |
| PWA metadata seti | `manifest.webmanifest`, `alfa-charts.html`, `assets/ios-pwa.css` |Standalone, ikonlar, Apple meta, safe-area, dynamic theme-color. |

---

## 8. Masaüstü – mobil farkları

| Özellik | Masaüstü | Mobil | Durum |
|---|---|---|---|
| Ana toolbar / aksiyon satırı | Görünür, tam aksiyon seti | Gizli; menü ve alt strip ile değiştirildi | `WORKING` (equiv. dikey) |
| Çizim araçları | Sol rail + flyout | Araç sheet’i + gruplar | `WORKING` |
| İzleme listesi | Yan panel | Alt sheet / market strip | `WORKING` |
| Zaman dilimleri | Toolbar butonları | Sheet + swipe | `WORKING` |
| Geçmiş aralık butonları | Toolbar | Menü kısayolları + uzun basma reset | `WORKING` |
| Multi-chart | Görünür ve senkronize | Gizli; menüde yok | `PARTIAL` |
| Screenshot menüsü | Görünür | Share sheet | `PARTIAL` (native capability `UNVERIFIED`) |
| Strategy Tester | Lab/replay yolu | Ana menüde yok; Paper içinden dolaylı | `PARTIAL` |
| Research | Lab toggle | Mobil birincil yol yok | `PARTIAL` |
| Fiyat ekseni ölçekleme | Mouse drag | Touch grip | `WORKING` |
| Ev bağlantısı | Görünür | Dikeyde görünür, yatayda gizli | `PARTIAL` |
| Yatay düzen | Doğal masaüstü düzen | Masaüstü fallback, aşırı dikey kaydırma | `PARTIAL` / özel düzen `MISSING` |
| Bulut senkronizasyonu | Kod yolu var | Kod yolu var | `UNVERIFIED` |

---

## 9. Doğrulanamayanların kabul kriterleri

| Madde | Kabul için gereken |
|---|---|
| Gerçek hesap / yetki | Geçerli staging veya production oturumuyla `/api/access` yanıtının `200` ve doğru rol döndürmesi. |
| Bulut düzen / çizim sync | Aynı kullanıcıyla masaüstünde çizim kaydetme, mobilde açma, reload sonrası aynı `drawingId` ve koordinatlar. |
| Cross-device | İki gerçek cihazda oturum açıp watchlist, layout, drawing ve alarm durumlarının eşleşmesi. |
| iOS Safari / PWA | Gerçek iPhone’da standalone kurulum, safe-area, gesture, share ve clipboard akışları. |
| Native share | Destekleyen ve desteklemeyen cihazlarda fallback davranışı. |
| Alarm teslimi | Sunucu taraflı 7/24 mekanizma veya mevcut yerel kapsamın ürün metninde net taahhüt olarak sunulması. |
| Sağlayıcı derinliği | Her desteklenen sembol/TF için eski mum sayısı ve hata mesajları. |

---

## 10. Değişiklik durumu

- Uygulama kodu, stiller, script’ler, manifest veya `sw.js` değiştirilmedi.
- Production deploy yapılmadı; staging salt okunur test edildi.
- Gerçek kullanıcı verisi okunmadı/değiştirilmedi; bulut yazma denemesi yapılmadı.
- Yeni dosyalar yalnızca denetim çıktısıdır: `docs/alfa-mobile-ux-audit.md` ve `docs/screenshots/*.png`.
- Gelecekte asset değiştirilirse `?v=` değeri artırılmalı; cache busting için `sw.js` asla düzenlenmemelidir.
- Denetim sırasında `git status --short` yalnızca `?? docs/screenshots/` gösterdi; rapor eklendikten sonra beklenen çıktı rapor dosyası + screenshots klasörüdür.

---

## 11. Yönetici özeti

Mobil grafik deneyiminin çekirdeği çalışıyor: sembol geçişi, izleme listesi, zaman aralığı, eski mumlar, çizimler, indikatörler, palette, reload restore, Replay/Paper, alarm dialogu ve dokunma hareketleri gerçek tarayıcıda doğrulandı. En kritik UX açığı **yatay modun masaüstü fallback’e düşmesi**; ardından gelişmiş araçların mobil keşfedilebilirliği, alarm kapsamı, Paper simülasyon etiketi ve küçük dokunma hedefleri geliyor. Hesap, bulut, cihazlar arası çizim, gerçek iOS install/share ve production erişimi bu denetimde `UNVERIFIED` kaldı; bunlar için gerçek hesap ve cihaz testi gerekir.
