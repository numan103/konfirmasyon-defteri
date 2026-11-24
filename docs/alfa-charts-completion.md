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
