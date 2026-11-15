# Portföy görünmüyor sorunu ve koruma değişiklikleri

## Kurtarma tamamlandı (16 Kas 2026)

- Kullanıcı, 12 Kasım tarihli `portfolio-before.json` yedeğindeki ETH/DOGE/PEPE
  kayıtlarının kaybolan portföyü olduğunu doğruladı ve geri yüklemeyi onayladı.
- Bu dosya `C:\Users\Pc\AppData\Local\Temp\opencode` içinde bulundu. JSON'un tamamı,
  boş bulut kaydının öncesi/sonrası ve eski adaylar
  `C:\Users\Pc\Documents\Portfoy-Kurtarma-2026-11-16` klasöründe korundu.
  Finansal kayıtlar repoya veya herkese açık site dosyalarına eklenmedi.
- Onaylanan yedeğin `data` alanı, Supabase SQL Editor üzerinden yalnızca mevcut
  boş satıra, beklenen `updated_at` revizyonu ve boş pozisyon/satış koşullarıyla
  geri yazıldı. İşlem tek satır döndürdü. RLS/izinler değiştirilmedi.
- Sonrasında REST üzerinden yeniden okunan `data`, kaynak yedekle
  `assert.deepEqual` kullanılarak karşılaştırıldı: birebir eşleşti.
  3 pozisyon, 6 satış, 1 fikir/not ve 9 geçmiş kaydı doğrulandı.
  Miktar, maliyet, gerçekleşme tarihi, kayıtlı fiyat veya nakit değiştirilmedi.
- Daha önce gerçek Chrome LevelDB'den Eylül kopyası ve Edge HTTP önbelleğinden
  31 Ekim kopyası kurtarılmıştı. Kullanıcı bunların eksik olduğunu belirttiği
  için ikisi de güncel portföy yerine yüklenmedi.
- Önceki "geri getirilemez", "tüm kopyalar yok" ve "yeniden girilmeli" ifadeleri
  doğru değildi. Otomasyon profili, kullanıcının gerçek tarayıcı profili değildir.
  Eski gömülü kayıtların tamamının sahte/örnek olduğu da varsayılamaz.

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
   korunur. Mevcut eski-kopya filtresi, tek pozisyonlu `eth-sep5` durumunu
   otomatik güncel portföy olarak yüklemez; bu, geçmiş kaydın sahte olduğunu
   kanıtlamaz. Kurtarılan güncel pozisyonların kimlikleri farklıdır.
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
3. Kurtarma sayfasında kopya olmaması yalnızca o origin/profilde, bilinen
   anahtarların güncel değerlerinde kopya bulunmadığını gösterir. Diğer profiller,
   LevelDB kalıntıları, HTTP önbelleği ve çalışma öncesi dosya yedekleri ayrıca
   kontrol edilmelidir. Bu olayda onaylanan dosya yedeğinden kurtarma tamamlandı;
   kullanıcının işlemleri yeniden girmesi gerekmedi.
