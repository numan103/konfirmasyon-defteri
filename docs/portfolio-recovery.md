# Portföy görünmüyor sorunu ve koruma değişiklikleri

## Teşhis (15 Kas 2026)

- Bulut kaydı `edu_shared/alfa_portfoy_public` içinde pozisyon 0, satış 0;
  geçmiş serisi 8 Eylül 2026'ya kadar ~1.268 TL değerliydi, 15 Kas 2026
  11:33'te 1.000 TL (boş başlangıç değeri) ile üzerine yazılmış.
- Otomasyon tarayıcısında `alfa-fund-v1` ve kurtarma anahtarları boş; yani veri
  bu profilde değil. Kullanıcının kendi tarayıcı profilindeki yerel kopyalar
  hâlâ kurtarma kaynağı olabilir.

## Değişiklikler (b188)

- `assets/portfolio-recovery.js` + `portfoy-kurtarma.html`: yalnızca yerel
  bilinen anahtarları okuyan, sunucuya hiçbir şey göndermeyen, salt okunur
  tarama ve JSON yedeği indirme sayfası. Silme/yazma yok.
- Hidrasyon artık salt okunur: boş bulut kaydı yerel veriyi ezmez; cihazdaki
  daha yeni kopya otomatik buluta itilmez. Bulut boş/eski iken dolu yerel kopya
  bulunursa salt okunur önizleme + geri yükleme paneli gösterilir.
- Geri yükleme (`ap2RestoreRecovery`) yalnızca açık onay + yüklü revizyon ile
  çalışır; revizyon çakışması yazmayı reddeder; başarısızlıkta yerel kopya
  korunur. Eski örnek tohum kaydı (`eth-sep5`) hiçbir zaman görünmez/geri
  yüklenmez.
- Kurtarma koruması: boş/örnek belgeler son bilinen dolu kopyayı ezemez;
  kota hatalarında hiçbir depolama yazımı yapılmaz.

## Testler

- 428 Node testi geçti; yeni testler: boş bulut yereli ezemez, dolu kopya
  onaysız yayınlanamaz, başarısız geri yükleme kopyayı korur, kurtarma modülü
  simülasyon/token/bozuk belgeleri kaynak saymaz, tarama salt okunurdur.

## Kullanıcı adımları

1. Verinin en son görüldüğü tarayıcıda `https://alfa-trader.com/portfoy-kurtarma.html`
   aç; varsa JSON yedeğini indir.
2. Portföy Yönetimi sayfasında salt okunur kurtarma önizlemesi görünürse
   "Bu kopyayı buluta geri yükle" ile onaylı taşı.
3. Hiç kopya bulunamazsa veri o cihaz tarayıcısında yok demektir; tarayıcı
   verilerini son temizleme zamanını kontrol et. Bulut geçmişi (değer serisi)
   yedek olarak duruyor; pozisyon listesi bulutta silinmiş durumda.
