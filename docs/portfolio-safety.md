# Portföy veri güvenliği

## Sorun

Bu olayda saptanan sonuç, paylaşılan portföy satırının boş belgeyle değişmesiydi;
tekil hatalı isteğin kaynağı kesin kanıtlanmadı. Eski kodda tarayıcıdan doğrudan
paylaşım tablosuna yazma, sayfa açılışında kayıt/normalizasyon, onay alınmadan
başarılı sayılan sıfırlama ve hata sonrası yerel değişiklikleri silebilen yeniden
yükleme yolları vardı. Bunlar sunucu kapanmasından farklı veri güvenliği riskleri.

## Koruma

- `009_portfolio_versions.sql` yalnızca `alfa_portfoy_public` satırını korur.
  Diğer paylaşımlar, hesap girişi ve grafik çizimleri değişmez.
- Portföye doğrudan `anon` / `authenticated` yazma ve satırı silme/yeniden
  adlandırma veritabanı tetikleyicisi tarafından engellenir.
- `portfolio_commit` sunucu servis rolüne açıktır; API her istekte gerçek kullanıcı
  ve admin yetkisini doğrular. Tarayıcıya servis anahtarı verilmez.
- Güncelleme, revizyon kontrolü, doğrulama ve eski/yeni sürüm kaydı aynı DB
  işlemindedir. Yedek yazılamazsa asıl değişiklik de uygulanmaz. Eski cihaz
  sürümü 409 alır. RPC yoksa/bozuksa eski ham PATCH yoluna düşülmez.
- Sessiz pozisyon kaybı, satış geçmişinin çıkarılması ve geçmişin boşaltılması
  normal kayıtta reddedilir. Tam satışta pozisyonun kalkmasına yeni satışın
  `posId` referansı izin verir; tekil silme ayrı eylemdir.
- Sıfırlama `PORTFOYU SIFIRLA` metni ile açık onay ister. Yerel kopya önceden
  korunur. Sunucu başarı/versiyon onayı gelmeden ekran temizlenmez.
- Sürüm geri yüklemede DB'deki sürüm seçilir; tarayıcıdan gönderilen keyfi
  snapshot kullanılmaz. Geri yükleme de yeni sürümdür ve revizyon kontrolü yapar.
- Son **100 sürüm** tutulur; belge başına **256 KiB** sınırı vardır. Sürüm listesi
  yalnızca 20 metaveri satırı döndürür; tam belge sadece seçildiğinde indirilir.
  Arka plan sürüm anketi/polling eklenmedi. Yeni ücretli hizmet yok.
- Kayıt hatası veya belirsiz ağ sonucunda düzenleme kilitlenir, yerel JSON ve
  kurtarma kopyası korunur; sayfa değişiminde otomatik bulut yeniden yüklemesi
  yapılmaz. Sunucu sürümüne dönmek kullanıcı onayı gerektirir. Kaydedilmemiş
  değişiklikte sayfa kapatılırken tarayıcı uyarısı vardır.
- Cache yükleme okuma işlemidir; yüklerken birleştirme, tarih yeniden yazma veya
  kayıt gönderme yapılmaz. Not düzenleme çift tıklama işleyicisi de düzeltildi.

## Kullanım

Portföy Yönetimi üst kısmında:

- **JSON yedeğini indir:** cihazdaki kopya.
- **Sunucu sürüm geçmişi:** tarih, pozisyon/satış sayısı; sürümü JSON indirme ve
  açık onayla önceki sürüme dönme.
- **Sunucudaki sürümü yükle:** hata/çakışma sonrasında yerel kopyayı koruyarak
  kontrollü yeniden yükleme.

Kırmızı/hata durumunda yeni işlem yapmak yerine önce JSON indirin ve sunucu
sürümünü kontrol edin. Sonucu belirsiz bir yazma otomatik tekrar edilmez.

## Doğrulama

- Migration 009 Supabase SQL Editor'de uygulandı; kurtarılan mevcut portföy
  ilk sürüm olarak alındı.
- `tests/sql/portfolio-safety.verify.sql`: gerçek DB'de 13 kontrol geçti.
  Atomik kayıt/önceki sürüm, eski revizyon, boşaltma, pozisyon/satış kaybı,
  bozuk miktar, onaysız sıfırlama, onaylı sıfırlama sonrası geri dönüş, satır
  silme ve anonim doğrudan yazma testleri içerir. Tamamı ROLLBACK ile sonlanır.
- API/istemci birim testleri: `tests/portfolio-safety.test.mjs`.
- Gerçek Chrome, **mock portfolio API** ile history JSON indirme, onaylı
  geri yükleme, ağ kesilmesi, düzenleme kilidi ve gezinmede kaydedilmemiş
  değişikliğin korunması: `tests/browser/portfolio-safety.browser.mjs`.
  Bu test gerçek kullanıcının portföyüne veri yazmaz.
- Portföye özel izole yayın kopyasında 441 Node testi geçti; üretim kaynağıyla
  mock API arayüz testi, kurtarılan tek altın/6 satış ekranı ve anonim egress
  smoke testi de geçti. Canlı REST'te anonim sürüm okuma/RPC çağrısı 401/42501
  ile reddedildi. DB testlerinden sonra gerçek portföyün verisi ve revizyonunun
  hiç değişmediği tekrar karşılaştırıldı.
- Geçerli gerçek kullanıcı oturumuyla üretim sürüm-listesi/geri-dönüş akışının
  uçtan uca kontrolü ayrıca yapılmalı: bu incelemede uygulama test tarayıcısının
  eski oturumu geçersizdi ve 401 döndü. Yeni test hesabı/oturumu üretilmedi.

## Sınırlar

Bu bir “asla arıza olmaz” garantisi değildir. Aynı DB'deki sürümler tüm projenin
silinmesine veya tüm veritabanının kaybedilmesine karşı bağımsız yedek değildir.
Önemli dönemlerde JSON'u başka bir güvenli yerde de saklayın. 100 kayıt dışına
çıkan eski sürümler silinir; aynı belgeyi tekrar kaydetmek sürüm üretmez.
Supabase/Vercel kesintisinde yeni kayıt onayı alınamaz, işlem durur; mevcut
veri/kurtarma kopyaları korunur. Bağımsız, zamanlanmış harici yedekleme bu
değişiklikte kurulmadı. Ücretli plana geçilmedi.
