# Mevcut özellikleri tamamlama — 2026-11-24

Production deploy yapılmaz. Mobile worktree değiştirilmez.

## İnceleme durumu

| Kapsam | Başlangıç durumu | Bulgular |
| --- | --- | --- |
| Multi-chart layout/sekme/mesaj güvenliği | WORKING | Mevcut 1/2/4/6 düzen ve origin/session/echo korumaları korundu. |
| Bağımsız panel timeframe | PARTIAL | URL global interval kullanıyordu; kayıt timeframe'i kaybediyordu; aynı sembolün farklı periyotları eklenemiyordu. |
| Senkron kapsamı | MISSING | Crosshair/range köprüsü vardı, kullanıcı tarafından kapatılamıyordu; symbol/interval kapsamı yoktu. |
| Watchlist → aktif panel | BROKEN | Yeni sembol sekme ekliyordu; iframe içindeki tıklama parent'a ulaşmıyordu. |
| Watchlist kimlik/liste/arama | WORKING (workspace regresyonu) | Mevcut venue/spot/perpetual kimliği ve liste altyapısı yeniden yazılmadı. |
| History | PARTIAL / inceleme sürüyor | Eski mum yükleme ve logical-range kaydırma mevcut; tarih kontrolleri ayrıca doğrulanacak. |
| Indicator legend | WORKING (workspace regresyonu) | Mevcut motor, katalog, ayar/eye/removal ve pane davranışları geçiyor; imleç değerleri ayrıca incelenecek. |
| Workspace | PARTIAL | Panel interval kaydı eksikti. Cloud settings çatışması yereli otomatik eziyor; ayrı düzeltme gerekli. |

## İlk düzeltme: panel bağlamı ve watchlist yönlendirmesi

- **Önceki sorun:** Global periyot bütün panelleri etkiliyor; sembol seçimi yeni sekme açıyor; iframe tıklaması aktif paneli değiştirmiyordu.
- **Düzeltme:** Panel sembol/periyot kaydı, panel periyot seçimi, dört bağımsız sync tercihi ve iframe odak takibi eklendi. Sembol seçimi açık grid'de aktif paneli, Symbol Sync açıkken bütün panelleri güncelliyor. Mevcut iframe belgeleri sembol/periyot değişiminde yeniden oluşturulmuyor.
- **Fayda:** BTC 4H/1H/15M/5M → ETH seçiminde dört periyot korunuyor; spot/perpetual kimlikleri korunuyor. Eski kayıtlar silinmeden varsayılan periyotla okunuyor.
- **Test:** Unit suite 1192/1192. Yeni izole Playwright testi: dört timeframe kabul senaryosu, iframe focus, active routing, sync-off izolasyonu, interval sync, iframe kimliği ve reload kalıcılığı geçti. Mevcut workspace suite 24 PASS; gerçek iframe native timeframe değişimi ve geri bildirim testi dahil; uncaught browser error yok.
- **Sınır:** Panel kayıtları mevcut yerel workspace kapsamında; yeni cloud workspace servisi oluşturulmadı. Watchlist ve gösterge/çizim motorları yeniden yazılmadı.
- **Commit:** `72635d1`.

## İkinci düzeltme: bulut çakışması yerel ayarları ezmiyor

- **Önceki sorun:** Revision conflict yanıtından sonra bulut sürümü otomatik yüklenip uygulanıyor, kullanıcının o anki yerel ayarları kayboluyordu.
- **Düzeltme:** Çakışmada o anki ayarların hesap/sembol/periyot kapsamlı ayrı bir yerel kopyası korunuyor. Otomatik bulut yazımı duruyor; sonraki yerel değişiklikler bu kopyayı güncelliyor. Yeniden açılışta da çakışmalı bulut sürümü yereli ezmiyor.
- **Fayda:** Çatışma iki sürümden birini sessizce seçmiyor. Çizim/watchlist kayıtları ve bulut revision kontrolü değiştirilmedi.
- **Test:** Dört hedefli test: hesap/piyasa/periyot izolasyonu, depolama hatası, gerçek save handler ve gerçek layout loader. Tam unit suite 1196/1196; workspace Playwright 24 PASS.
- **Sınır:** Bu koruyucu adım çakışmalı bağlamı yerel modda tutar; iki sürümü karşılaştırıp kullanıcı kararıyla uzlaştıran arayüz henüz tamamlanmadı. Normal, çakışmasız bulut akışı değişmedi.
- **Commit:** `17be5c4`.

## Üçüncü düzeltme: kısa history de sola kaydırınca büyüyebiliyor

- **Önceki sorun:** Scroll backfill koşulu en az 900 mum istiyordu; kısa/aggregate history eski veri isteyemiyordu. Bitiş noktasında boş/overlap yanıtları tekrar istenebiliyordu.
- **Düzeltme:** Mum sayısı eşiği kaldırıldı. Gerçekten daha eski barlar ekleniyor, duplicate barlar ayıklanıyor ve görünür logical range sadece eklenen eski bar sayısı kadar kaydırılıyor. Boş bitiş noktaları oturum içinde sınırlı bir kümede tutuluyor; ağ hataları yeniden denenebiliyor.
- **Fayda:** İstek beklerken mevcut mumlar ve görünüm korunuyor; yeni markete geçildiyse eski yanıt uygulanmıyor.
- **Test:** Dört hedefli test kısa veri, sıralama/duplicate/overlap, anchor kayması, pending/stale yanıt ve retry davranışlarını doğruluyor.
- **Sınır:** Veri sağlayıcının seans/tatil boşlukları sentetik mumlarla doldurulmaz. Tarih menüsündeki mevcut kontrol açıkça Replay başlatır; normal grafikte tarihe atlama ve preset için çok sayfalı backfill henüz tamamlanmadı.
