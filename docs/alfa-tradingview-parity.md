# ALFA CHARTS — TradingView video parity review

**Tarih:** 2026-11-28
**Referans:** Kullanıcının sağladığı 8 dk 46 sn TradingView kaydından çıkarılmış gözlemler. Video yeniden izlenmedi / ses çözümlenmedi / yeni envanter üretilmedi; maddeler doğrudan gereksinim olarak alındı.
**Kapsam:** Masaüstü / tablet web yüzeyi. Mobil yalnızca regresyon olarak koşuldu; mobil davranışı değiştirmek bu görevin dışında.
**Ortam:** Yerel statik sunucu `http://127.0.0.1:8827`, anonimis / guest oturum, gerçek kullanıcı hesabı yok, production yazma/yayınlama yok.
**Amaç:** Kullanıcı işi başlatıp düzenleyip kaydedip yeniden açarken TradingView'e kıyasla belirgin bir kullanım kopukluğu yaşamamalı.

## Durum matrisi

| # | Alan (video zaman kodu) | Durum | Kısa gerekçe |
|---|---|---|---|
| 1 | Drawing Tools — `00:12–01:24` | `PARTIAL` / `UX INFERIOR` | Araçlar, gruplar, favoriler ve aynı motor çalışıyor; Escape ile seçim temizleme ve çoklu seçimde sağ tık eylemleri bu turda düzeltildi. Son kullanılan araç ↔ grup ikonu tutarlılığı hâlâ tarayıcıda kanıtlanmadı. |
| 2 | Watchlist — `01:36–02:24` | `PARTIAL` (çekirdek `WORKING`) | Çoklu liste, aktif liste, favori/sınıflandırma, import/export ve grafik eşlemesi kanıtlı; sembol seçici filtreleri kapanıp açılınca sıfırlanıyordu, düzeltildi. |
| 3 | Object Tree & Context Menus — `02:24–03:48` | `PARTIAL` | Ağaç, çoklu seçim, grupla/sil/undo ve seçim senkronu var; sağ tık menüsü etiketi ile eylem sonucu çelişiyordu, düzeltildi. Birçok ağaç eyleminin tarayıcı assertion'ı hâlâ yok. |
| 4 | Pine Editor / Strategy Lab — `04:00–04:48` | `PARTIAL` | JS-benzeri study API, kaydetme/açma ve okunabilir hatalar çalışıyor; Pine uyumluluğu, derleyici ve kural tabanlı strateji motoru yok (bilinçli olarak eklenmedi). |
| 5 | Symbol Search — `05:00–05:36` | `PARTIAL` | Geniş katalog, borsa/quote filtreleri, serbest FX/kripto kotasyonları ve panel eşlemesi var; aktif filtreler düzeltildi. Veri sağlayıcısı desteklemeyen enstrüman için sahte fiyat üretilmiyor. |
| 6 | Chart Actions & Bar Replay — `05:48–07:36` | `WORKING` | Sağ tık grafik menüsü, replay başlangıç mumu, ileri/geri adım, hız, geçmiş yükleme ve gelecek veri gizleme gerçek tarayıcıda kanıtlı; replay display timeframe değişimi clock'u koruyor. |
| 7 | Advanced Alert Experience — `07:36–08:46` | `PARTIAL` | Oluşturma/düzenleme/silme, koşullar, tekrar, grafikten alarm, bildirim kanalları var; kayıt hatası yanlış başarı olarak gösteriliyordu, düzeltildi. Çizim/indikatör koşulu ve 7/24 sunucu alarmı yok. |

## 1. Drawing Tools — `00:12–01:24`

- **TradingView'de gözlenen:** Kategorilere ayrılmış sol araç çubuğu, grup menülerinden araç seçimi, hızlı erişimde favoriler, grafik üstünden araç erişimi, sembol/ikon ekleme, grup içi birden fazla alt seçenek.
- **ALFA durumu:** 8 kontrollü sürüklenebilir ana ray, `#drawing-all-tools` üzerinden 15 araç, grup → flyout seçimi, `alfa-draw-fav:v1` ile kalıcı favoriler, masaüstü ve mobil aynı `DrawingEngine` örneği.
- **Eksik / yetersiz etkileşim:** (a) Çizim seçiliyken Escape yalnızca aracı kapatıyor, seçimi ve seçim araç çubuğunu bırakıyordu; yeni çizime başlamadan seçimi iptal etme güvenilir değildi. (b) Çoklu seçimde sağ tık menüsü `2 seçili çizimi sil` derken `Gizle` / `Öne getir` / `Çizim ayarları…` tek çizimmiş gibi davranıyordu ve ayarlar maddesi seçimi tek id'ye indiriyordu.
- **Yapılan düzeltme:** `cancel({ clearSelection })` ile Escape seçimi ve toolbar'ı temizliyor; sağ tık maddeleri `targetIds` üzerinden çalışıyor ve etiketler çoklu seçimde `2 seçili çizimi …` oluyor. Ayarlar maddesi bilinçli olarak tek çizime indiriyor (panel tek nesne düzenler).
- **Test kanıtı:** `tests/browser/alfa-drawings.browser.mjs` → `Escape clears drawing selection and the selection toolbar`, `Right-click actions on a multi-selection match the menu label`. Düzeltme öncesi çalıştırma seçim id'sini korudu (`afterEscapeIds=[…]`) ve menüde `🗑2 seçili çizimi sil` yanında `👁Gizle` üretti; sonrası 21/21 PASS, `pageErrors=[]`. Birim: `tests/alfa-drawing-selection.test.mjs`, `tests/alfa-drawings.test.mjs`.
- **Commit:** `34ffb2b`, `9437fab`.
- **Kalan sınırlamalar:** Son kullanılan araç ↔ grup ikonu tutarlılığı masaüstü/mobil arasında tarayıcıda kanıtlanmadı (mobil grup ikonları `group.tools[0]` kullanıyor); `drawings-toggle` görünürlüğünün reload sonrası assertion'ı yok; TradingView'deki extension/fan/channel aileleri kapsam dışı.

## 2. Watchlist — `01:36–02:24`

- **TradingView'de gözlenen:** İzleme listesi üzerinden sembol seçimi, liste yönetimi, sembol bağlam menüleri, birden fazla piyasa aracı, grafikle birlikte çalışma.
- **ALFA durumu:** Birden fazla adlandırılmış liste, aktif listeyi hatırlama, ekleme/silme/sıralama, favori ve sınıflandırma bayrakları, borsa kimliği (`BINANCE`, `OKX`, `FX_IDC`, …), seçilen sembolün aktif grafik paneline uygulanması, çoklu grafik picker'ı, zaman diliminin pair geçişinde korunması.
- **Eksik / yetersiz etkileşim:** Sembol ekleme penceresinde `query`, `venue`, `quote` filtreleri kapatılıp yeniden açıldığında sıfırlanıyordu; kullanıcı filtreleri tekrar kurmak zorunda kalıyordu.
- **Yapılan düzeltme:** `ChartWatchlist.pickerFilters` durumu eklendi; `openPicker()` kayıtlı filtreleri geri yüklüyor ve her değişiklikte güncelliyor.
- **Test kanıtı:** `tests/browser/alfa-watchlist-tv.browser.mjs` → `symbol picker filters survive close and reopen`, 8/8 PASS. Önce: `reopened= { q: '', venue: '', quote: '' }`; sonra: `{ q: 'XAU', venue: 'FX', quote: 'TRY' }`. Ayrıca `settings: named lists… persist across reload`, `manual TV restore adds missing refs only…`, `320/390/768 px layouts…`.
- **Commit:** `3049305`.
- **Kalan sınırlamalar:** Kimliği doğrulanmış bulut senkronizasyonu gerçek hesap olmadan kanıtlanmadı; bu turda `PASS` ilan edilmedi.

## 3. Object Tree & Context Menus — `02:24–03:48`

- **TradingView'de gözlenen:** Nesne ağacı, grafik çizimleri, bağlam menüleri; aynı eylemin farklı giriş noktalarında aynı sonucu vermesi.
- **ALFA durumu:** Fibonacci / trend / yatay / Long-Short nesneleri ağaçta tür ve isimle listeleniyor; ağaç → grafik seçim senkronu, Ctrl çoklu seçim, klasörleme, toplu silme + undo, rename, `window.__alfaDebug.drawings` üzerinden gerçek durum doğrulaması mevcut.
- **Eksik / yetersiz etkileşim:** Sağ tık menüsü çoklu seçimde silme/kopyalama için doğru etiketliyken gizleme, katman sırası ve ayarlar maddelerinde tek nesne varsayımı kullanıyordu; kullanıcı menü etiketine güvenemiyordu (madde F ve ortak UX kuralı ihlali).
- **Yapılan düzeltme:** Menü, seçili nesnelerden `targets` türetiyor; tüm eylemler `targetIds` ile çağrılıyor ve etiketler seçim sayısını yansıtıyor. `anyLocked` / `allHidden` durumları doğru eylem adını seçiyor.
- **Test kanıtı:** `tests/browser/alfa-drawings.browser.mjs` → `Right-click actions on a multi-selection match the menu label` (önce FAIL, sonra PASS); `tests/browser/alfa-workspace.browser.mjs` → `object tree: Ctrl multi-select, grouping, bulk delete, undo and rename`; `tests/browser/alfa-ux-corrections.browser.mjs` → sol tık seçer, sağ tık menü açar. Menü sonrası etiketler: `🗑2 seçili çizimi sil`, `📋2 seçili çizimi kopyala`, `👁2 seçili çizimi gizle`, `2 seçili çizimi öne getir`, `2 seçili çizimi arkaya gönder`.
- **Commit:** `9437fab`.
- **Kalan sınırlamalar:** Ağaç satırındaki hide/lock/delete, `tree-front/back/ungroup/select-all`, arama/collapse ve ayar değişikliği undo'su için tarayıcı assertion'ı yok; kod var ama kanıt eksik. `assets/alfa-drawings.mjs` mobil ile paylaşılıyor — sağ tık menüsü telefonda bastırımla açılmıyor, ancak ortak motor değişikliği çapraz yüzey riski taşıyor (mobile QA yeniden koşuldu, 11/11 PASS).

## 4. Pine Editor / Strategy Lab — `04:00–04:48`

- **TradingView'de gözlenen:** Pine Editor, kod düzenleme alanı, editör ayarları, strateji ↔ grafik bağlantısı.
- **ALFA durumu:** `alfa-charts.html:207-212` ve `assets/alfa-right-panel.mjs` ile JavaScript-benzeri `study/input/ta.sma/ta.ema` API'si CSP iframe'de çalışıyor; kod `alfa-script-code:v1`'e kaydediliyor, `Script hatası: …` mesajı gösteriliyor, plot'lar market/data reload sonrası yeniden çiziliyor ve share snapshot'ı kodu taşıyor. Lab/Research tarafında özel şablon, revizyon, kaydetme/açma ve çakışma yönetimi var.
- **Eksik / yetersiz etkileşim:** Pine Script uyumluluğu / derleyici / topluluk script'i yok; Lab/Tester stratejilerinden grafiğe sinyal/entry bağlantısı yok; `study.overlay` ve `input()` parametre UI'si yok; özel study kodu workspace study bundle'ına girmiyor.
- **Yapılan düzeltme:** Bu turda ürün kodu değiştirilmedi; kapsam ve maliyet değerlendirildi, büyük derleyici/strateji motoru bilinçli olarak oluşturulmadı.
- **Test kanıtı:** `tests/browser/alfa-right-panel-editor.browser.mjs:70-93`, `tests/browser/alfa-chart-share.browser.mjs:69-74,101-138`, `tests/browser/alfa-lab.browser.mjs:88-104,131-135`, `tests/browser/alfa-strategy.browser.mjs:69-108`, `tests/browser/alfa-research.browser.mjs:85-126`. Tümü web QA içinde PASS.
- **Commit:** Bu alan için commit yok (kapsam dışı tutuldu).
- **Kalan sınırlamalar:** Pine uyumluluğu IDDIA EDİLMİYOR; kural tabanlı backtest / otomatik strateji motoru ve gerçek hesapla doğrulanmış cloud sync yok.

## 5. Symbol Search — `05:00–05:36`

- **TradingView'de gözlenen:** Geniş arama ekranı, kategori/piyasa filtreleri, farklı enstrüman türleri, sonuçtan seçim.
- **ALFA durumu:** `#symbol-query` + borsa/quote filtreleri, `FX/FX_IDC/OANDA/FOREXCOM/CRYPTOCAP/BIST/CME/…` kataloğu, BTC/ETH/XAUUSD/EURUSD/US100 araması, aynı sembolün farklı borsa karşılıklarının ayrıştırılması, sonucun doğru panele uygulanması, veri yoksa açık durum mesajı.
- **Eksik / yetersiz etkileşim:** Filtreler pencere yeniden açıldığında kayboluyordu (Watchlist düzeltmesiyle aynı kök neden); desteklenmeyen enstrümanlar için sahte fiyat üretilmiyor — bu bilinçli sınırlama.
- **Yapılan düzeltme:** `pickerFilters` kalıcılığı (bkz. #2); arama sonucu seçimi ve panel eşlemesi mevcut kodda korundu.
- **Test kanıtı:** `tests/browser/alfa-watchlist-tv.browser.mjs` (8/8), `tests/browser/alfa-workspace.browser.mjs` → `searchable venue picker, bounded TXT import and scoped watchlist persistence`, `tests/alfa-watchlist.test.mjs`.
- **Commit:** `3049305`.
- **Kalan sınırlamalar:** Yeni lisanslı veri sağlayıcısı eklenmedi; ücretli/kapalı kaynaklar `UNVERIFIED` kalır, uydurma enstrüman üretilmez.

## 6. Chart Actions & Bar Replay — `05:48–07:36`

- **TradingView'de gözlenen:** Grafik bağlam menüsü, mum seçimi, replay başlangıcı, oynatma/durdurma/ileri adım, hız, geçmiş veri, gelecek verinin gizlenmesi, çıkışta normal duruma dönüş.
- **ALFA durumu:** Sağ tık grafik menüsü (alarm, reset/fit/last bar, tam ekran, ayarlar, palet, ızgara, sade mod, log/auto scale, gösterge, nesne ağacı, ekran görüntüsü, kopyala, bağlantı), replay pick/next/prev/play/hız, geçmiş `klines` yükleme, replay clock ile filtrelenmiş çizim/indikatör verisi, display timeframe değişiminin engine/journal/clock'u koruması.
- **Eksik / yetersiz etkileşim:** Bu turda doğrulanmış P0/P1 kopukluğu bulunmadı; önceki turlarda düzeltilen davranışlar regresyona uğramadı.
- **Yapılan düzeltme:** Yok (yalnızca regresyon doğrulaması).
- **Test kanıtı:** `tests/browser/alfa-replay.browser.mjs` (geçmiş prepend, replay başlangıç mumu, EMA verisinin `time <= selection.time` olması, next/prev, timeframe değişiminde clock koruması), `tests/browser/alfa-replay-controls.browser.mjs`, `tests/browser/alfa-workspace.browser.mjs` → `right click adds price alarm and opens the full TradingView-style chart menu`. Web QA 31/31.
- **Commit:** Bu turda commit yok.
- **Kalan sınırlamalar:** Canlı depth geçmiş modda yok ve yerine geçmiş likidite koyulmuyor; replay motoru yeniden yazılmadı.

## 7. Advanced Alert Experience — `07:36–08:46`

- **TradingView'de gözlenen:** Alarm ayarları, koşul seçenekleri, bildirim tercihleri, test bildirimi ve gerçek teslim; alarm akışının güvenilirliği.
- **ALFA durumu:** Oluşturma/düzenleme/silme, 6 fiyat/yüzde/kesişim koşulu, tekrar davranışı, aktif/pasif, grafik sağ tıktan hızlı alarm, ses presets, webhook/Telegram alanları, izin durumu ve test sesi. Kapsam metni: `Yalnızca bu sekme açıkken · 7/24 sunucu alarmı değildir.`
- **Eksik / yetersiz etkileşim:** `localStorage.setItem` başarısız olduğunda (quota/engelleme) `saveAlarms()` hatayı yutuyordu; UI `Alarm eklendi` diyordu ama depoda kayıt yoktu — yanlış kayıt / veri kaybı (P0).
- **Yapılan düzeltme:** `commitAlarms()` ile all-or-nothing yazma, bellek listesi ve ilgili localStorage anahtarlarının rollback'i, `role="alert"` hata alanı ve `connection(..., 'error')`; hızlı alarm, silme ve aç/kapat aynı transaction üzerinden geçirildi. Başarı mesajı yalnızca yazma başarılıysa gösteriliyor.
- **Test kanıtı:** `tests/browser/alfa-workspace.browser.mjs` → `alarm save failure is reported and never shows false success`: depolama hatası enjekte edilince form açık kalıyor, `#alarm-save-error` görünüyor, kayıt sayısı değişmiyor; izin geri verilince kayıt başarıyla ekleniyor. Birim: `tests/alfa-alerts.test.mjs`, `tests/alfa-chart-scope.test.mjs`. Önce: `connection=Alarm eklendi`, `stored=null`; sonra: `formStillOpen=1`, `error=Alarm kaydedilemedi: QuotaExceededError`, `stored=null`.
- **Commit:** `999a0bc`.
- **Kalan sınırlamalar:** Çizime/indikatöre dayalı alarm koşulu yok; 7/24 sunucu alarmı yok ve varmış gibi gösterilmiyor; gerçek webhook/Telegram teslimi gerçek hesap/izin olmadan `UNVERIFIED`.

## Düzeltme özeti (öncelik sırasıyla)

| Öncelik | Commit | Alan | Kök neden |
|---|---|---|---|
| P0 | `999a0bc` | Alarms | Depolama hatası yutuluyor, yanlış başarı mesajı |
| P1 | `34ffb2b` | Drawings | Escape seçimi temizlemiyordu |
| P1 | `3049305` | Watchlist / Symbol search | Picker filtreleri yeniden açılışta sıfırlanıyordu |
| P1 | `9437fab` | Drawings / Object tree | Sağ tık eylemleri çoklu seçimde etiketle çelişiyordu |

Cache busting: entrypoint `alfa-charts.mjs?v=118`, `alfa-drawings.mjs?v=24`, `alfa-watchlist.mjs?v=17`; CSS `?v=69` değişmedi. `tests/cache-busting.test.mjs` güncel/stale sürümleri doğruluyor.

## Önce / sonrası kanıtlar

Tüm dosyalar `.qa-reports/parity-screenshots/` altında (Git tarafından yok sayılır):

| Akış | Önce | Sonra |
|---|---|---|
| Escape sonrası çizim seçimi | `drawings-before-selection.png`, `drawings-before-after-escape.png` | `drawings-after-selection.png`, `drawings-after-after-escape.png` |
| Sembol seçici filtreleri | `watchlist-before-filter-set.png`, `watchlist-before-filter-reopened.png` | `watchlist-after-filter-set.png`, `watchlist-after-filter-reopened.png` |
| Alarm kayıt hatası | `alarms-before-false-success.png` | `alarms-after-save-error.png` |
| Çoklu seçim sağ tık menüsü | regression test çıktısı (`👁Gizle`) | `context-menu-after-multi-selection.png` |

## Doğrulama sonuçları

```text
node --test tests/*.test.mjs                     -> 1239 pass, 0 fail
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alfa-qa-web.ps1 -Url http://127.0.0.1:8827 -Unit -MaxAttempts 1
  -> total=31 pass=31 fail=0 retried=0   report=.qa-reports/web-20261128-122458
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alfa-qa-mobile.ps1 -Url http://127.0.0.1:8827 -Unit -MaxAttempts 1
  -> total=11 pass=11 fail=0 retried=0   report=.qa-reports/mobile-20261128-122937
node tests/browser/alfa-drawings.browser.mjs --url=http://127.0.0.1:8827 --playwright=<...>
  -> 21/21 PASS, pageErrors=[]
```

Tüm koşular `attempts=1` (retry yok). Regresyon testleri düzeltme öncesi kodu üzerinde bilinçli olarak FAIL etti, sonrasında PASS.

## Çapraz yüzey riski

`assets/alfa-drawings.mjs` masaüstü ve mobil tarafından paylaşılıyor. Escape ile seçim temizleme ve çoklu seçim eylem semantics'i bu paylaşılan motorada. Telefon dokunması masaüstü sağ tık menüsünü açmıyor (`contextMenu()` phone/touch koruması), dolayısıyla menü etiketi değişikliği mobil akışı doğrudan etkilemiyor; yine de mobil QA (11/11) yeniden koşuldu. Grup ikonu tutarlılığında bilinen mobil fark ayrı bir iş olarak bırakıldı.

## Açıkça iddia edilmeyenler / kalan sınırlamalar

- Gerçek hesap olmadan bulut senkronizasyonu `PASS` değil; guest/local kalıcı kayıt doğrulandı.
- Yerel alarmlar yalnızca sekme açıkken çalışır; 7/24 sunucu alarmı veya gerçek teslim kanıtı yok.
- Pine Script uyumluluğu, derleyici, topluluk scripti ve kural tabanlı strateji motoru yok.
- Çizim/indikatör koşullu alarmlar, yeni lisanslı veri sağlayıcıları, oturum açmış kullanıcı akışları kapsam dışı.
- Nesne ağacının bazı eylemleri kodda mevcut olup tarayıcı assertion'ı olmadığı için `PARTIAL` kaldı.
- Production deploy, push, merge veya production veri değişikliği yapılmadı. `docs/alfa-charts-release-readiness.md` `BLOCKED / NO-GO` olarak korundu (gate kullanıcı tarafından değiştirilmedi).
