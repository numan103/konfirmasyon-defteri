# Yayın kapıları: özel yedek/restore ve gerçek staging

Bu dosya iki yayın kapısının son durumunu ve tekrarlanabilir yöntemi kaydeder.
Production migration/deploy, veri değişikliği veya mobile worktree erişimi yapılmadı.
Parola, token, secret veya yedek içeriği bu dosyaya/Git'e yazılmaz.

## 1. Özel pg_dump yedeği ve izole restore — PASS

- Kaynak: üretim Supabase PostgreSQL 17.12; doğrudan/session bağlantı ile
  `sslmode=verify-full` ve doğrulanmış CA kullanıldı.
- Yedek, şifreli VeraCrypt birimi `V:\ALFA-Backups` altında saklandı;
  `pg_restore --list` exit 0, SHA256 manifest ile doğrulandı.
- Gerçek restore, WSL Debian + PostgreSQL 17.12 + Supabase uyumlu roller ve
  `supabase_vault` v0.3.2 ile ayrı, ağdışı (`unshare --net`, socket-only,
  swap kapalı) kurtarma laboratuvarında yapıldı.
- `scripts/run-private-restore-lab.sh` ve `scripts/verify-private-restore.py`
  ile 80 tablonun sayı/içerik hash'i, şema/RLS/ACL/owner satırları,
  extension/rol/üyelik/locale katalog metadata'sı karşılaştırıldı.
- Sonuç: `isolated-restore-evidence.json` içinde `status: PASS`; geçersiz index 0,
  doğrulanmamış constraint sayısı kaynakla aynı (1). Manifest
  `isolatedRestoreVerified: true` ve `backupRestoreStatus: PASS` olarak güncellendi.
- Kapsam: mantıksal veritabanı arşividir. Cluster parola hash'leri, Storage
  dosya byte'ları ve harici entegrasyonlar kapsam dışıdır; bu alanlar için
  ayrı özel prosedür gerekir.

Yedek veya kanıt dosyaları Git'e, dağıtım paketine veya sohbete eklenmez.
V: birimi iş bitince bağlantısı kesilerek kilitlenir.

## 2. Gerçek staging egress — PASS

Ayrı Supabase Free projesi oluşturulamadı: owner hesabının free-proje kotası
dolu olduğu Dashboard tarafından bildirildi. Ücretli yükseltme, silme veya
başka proje üzerinde değişiklik yapılmadı. Bu nedenle staging, production
verisi/secret'ı olmadan sentetik Supabase-uyumlu REST Pages Functions ile
ayrı bir Cloudflare Pages projesinde kuruldu.

- Proje: `alfa-charts-staging`; URL: `https://alfa-charts-staging.pages.dev`
  (production host'u `alfa-trader.com` değil).
- Staging secretları yerel özel klasörde üretildi; production secret'ı
  kopyalanmadı. Secret değerleri CLI'ye stdin üzerinden verildi, log/chat'e
  yazılmadı.
- `scripts/build-staging-artifact.ps1` tüm production URL/key/host
  referanslarını staging değerleriyle değiştirdi ve dağıtım paketinde
  production referansı kalmadığını doğruladı.
- Dağıtım, artifact'in kendi dizininden yapıldı; böylece staging-only
  `functions/rest/v1/*` ve `functions/auth/v1/*` route'ları da pakete girdi.
- Endpoint'ler: `/api/edu-shared?kind=landing` gerçek Pages Function üzerinden
  staging REST katmanına erişti; özel endpoint'ler anonim istekte 401 döndü.
- Doğrulama komutu:

```powershell
node tests/browser/egress.browser.mjs `
  --url=https://alfa-charts-staging.pages.dev `
  --playwright=C:/Users/Pc/AppData/Local/Temp/opencode/alfa-chart-browser-tests/node_modules/playwright/index.mjs
```

Sonuç: `passed: true`, ana sayfa 200, önizleme resmi 200, açılışta news/full
feed okuması yok, özel endpoint'ler reddedildi, sayfa hatası yok.
Ayrıntılar özel `staging-egress-evidence.json` dosyasında; production URL'si,
production secret'ı veya kullanıcı verisi içermez.

## 3. iOS’ta uygulama gibi açılış — PWA

Gerçek App Store IPA’sı için macOS/Xcode ve Apple imza gereklidir; bu ortamda
yapılamaz. Bunun yerine iOS Safari’de **Add to Home Screen** ile tam ekran,
ikonalı, standalone uygulama deneyimi sağlandı:

- `manifest.webmanifest`: `display: standalone`, `start_url: /?page=home`,
  uygun 192/512/maskable ikonlar.
- `index.html`: iOS apple-mobile-web-app meta etiketleri, `viewport-fit=cover`,
  theme-color ve 180x180 `apple-touch-icon`.
- `assets/ios-pwa.css`: safe-area ve standalone dokunmatik ayarları.

Kullanım: Safari ile staging URL’sini aç → Paylaş/Share → **Add to Home Screen**
→ ana ekrandan uygulama gibi aç. Production sürümü için aynı dosyalar production
deploy’u ile birlikte gider; burada yalnız staging dağıtımı güncellendi.

## 4. Mobil grafik kabuğu — staging

`alfa-charts.html` için telefon düzeni TradingView mantığıyla sıkıştırıldı:
marka başlığı kaldırıldı; sembol ve zaman dilimleri tek satırda yatay kaydırılır;
grafik alanı ekran yüksekliğini dolduruyor ve sayfa `overscroll` yapmıyor;
dikey temas sürüklemesi ve sağ fiyat ekseni tutamağı ile fiyat aralığı
ayarlanabiliyor.

İkinci turda indikatör çipleri grafik üstüne gömüldü, indikatör yöneticisi
ve çizim araçları alttan açılan sheet'lere taşındı. Alttaki parite şeridi
dikey kaydırmayla önceki/sonraki pariteye geçiyor. Görünüm sheet'inde
gece/gündüz teması, kanvas/zemin, mum ve fitil renkleri, eksen metni ve ızgara
renkleri canlı ayarlanıyor; mevcut `alfa-chart-palette:v1` anahtarında saklanıyor.
Tüm chart dialog'ları telefonlarda alt sheet görünümünde açılıyor.

Üçüncü turda araç sheet’i kategori/drill-down yapısına taşındı: beş grup ve
imleç/ölçüm/sil araçları tam katalogdan üretiliyor; geri tuşu önceki menüyü
açıyor, sheet tutamağı aşağı sürüklenince kapanıyor. Parite şeridi artık
sürükleme sırasında 28 px adımlarla anlık geçiş yapıp bırakıldığında o paritede
kilitleniyor. Grafik üstünde yükleme katmanı ve `CANLI / VERİ HAZIR / YENİDEN
BAĞLANIYOR` durumu gösteriliyor; canlı tick’lerde fiyat ve durum nabız gibi
yanıp sönüyor. Sol alt dock çizim yöneticisi, izleme listesi ve fotoğraf/bağlantı
paylaşım panelini açıyor (Web Share desteklenmiyorsa kopyalama/indirme
kullanılıyor).

Dördüncü turda sol alt dock tek menü düğmesine indirgendi; menü sheet’inde
çizimler, araçlar, indikatörler, görünüm, pariteler, fotoğraf/paylaşım, alarm,
replay, sığdır, son mum ve tam ekran bulunuyor. Üstteki zaman dilimi satırı
gizlendi; parite şeridiyle aynı hizada, sağda kaydırılabilen bir zaman dilimi
çipi var. Parite geçişi artık iki aşamalı: ok/shift ile önizleme yapılır, grafik
hemen değişmez; önizlemeye bir kez dokunmak ya da 3 saniye beklemek seçimi
onaylar. Zaman dilimi çipi de kaydırmayla favoriler arasında geçer, dokununca
13 zaman diliminin tamamı küçük doldurulabilir yıldızlarla açılır. İzleme
listesi telefonlarda alttan açılan sheet görünümünde ve kapatma düğmesi var.
Mobil kabuk testi bu akışların tamamı için PASS verdi (sayfa hatası yok);
staging dağıtımı `4d734e13-8499-4e3c-a41c-fffc9610524e`.

Beşinci turda üst toolbar tamamen kaldırıldı; arama kutucuğu, sembol select’i
ve fiyat/veri durumu etiketleri telefon ekranını kaplamıyor. Menü artık alt
şeridin solunda, paritenin hemen yanında; oklar, fiyat ve onay düğmesi kaldırıldı.
Pariteye dokunmak kompakt liste panelini açıyor. Grafik üzerinde dikey kaydırma
da pariteler arasında geziniyor; arka plan bulanıklaşıp üstte gelecek parite
kartı beliriyor, 3 saniyelik bekleme seçimi onaylıyor. İzleme listesinde arama
ve-diğer yardımcı bloklar gizlendi. Menüye “Araçları gizle / göster” odak modu
eklendi; grafik yüksekliği 706 px’den 806 px’e çıkıyor. Testler PASS, sayfa
hatası yok; staging dağıtımı `dc08c7ad-0d57-48bc-90b5-13ce0e674024`.

Altıncı turda piyasa başlığı grafiğin içine alındı; ayrı panel/üst toolbar
kalmadı. Alt şeritte yalnız menü, parite, araç yıldızı ve zaman dilimi var;
oklar, fiyat ve ek ipuçları kaldırıldı. Pariteler arası geçiş artık yalnız bu
şeritten yapılıyor: sürükleme sırasında bulanık arka plan üzerinde
önceki/current/sonraki parite kartı ve `konum / toplam` sayacı görünüyor,
geçiş 3 saniyelik beklemeyle onaylanıyor. Ekran ortasındaki dikey kaydırma
parite değiştirmiyor. Zaman diliminin solundaki yıldız sadece çizim araçlarını
gizleyip gösteriyor (kalıcı tercih); grafikteki 1G/5G/1A ve UTC/Log/Oto satırı
gizlendi, aynı işlevler menüye taşındı. Mobil test ve egress PASS, sayfa hatası
yok; staging dağıtımı `b6747adc-72b5-4834-8c09-fbbe3ba60a53`.

Bu değişiklikler `assets/alfa-charts.css`, `assets/alfa-charts.mjs` ve
`alfa-charts.html` içinde. Önce staging’e dağıtıldı; kullanıcının canlı site
isteği üzerine `2026-11-25T19:50:41Z` civarında aynı kaynak commit (`5e86afd`)
`alfa-traders` projesine `main` dalından dağıtıldı. Production deployment
`fa6cb389-65f4-409b-a19f-2d11d7a6af29`; canlı
`https://alfa-trader.com/alfa-charts.html` HTTP 200, `?v=31` / `?v=74` ve gerçek
Supabase Auth referansı doğrulandı, staging referansı bulunmadı. `sw.js` sabit
kaldı; önbellek kırılımı sorgu dizeleriyle yapıldı. Veri/migration yapılmadı;
secret, şifre veya kullanıcı verisi kopyalanmadı.

## Mobil v7 — 25 Kasım 2026

- Sol üstte `/?page=home` hedefine siteye dönüş bağlantısı eklendi.
- Alt şerit yuvarlatıldı; altına `24px + safe-area-inset-bottom` boşluk bırakıldı.
- Mobil dikey dokunma, görünür mumlara göre otomatik ölçekli ve sınırlı
  marjlarla hareket ediyor. Yatay sürükleme ve pinch ayrı kalıyor.
- 600 ms dokunup tutma mevcut grafik bağlam menüsünü açıyor; sıfırlama
  tüm geçmişi sıkıştırmak yerine son 65 mumu ve varsayılan fiyat marjlarını açıyor.
- Renk formu tema değişince güncelleniyor; özel canvas rengi, mum/fitil/ızgara
  ayarları mevcut ortak palette/layout depolamasını kullanıyor. Aynı origin'deki
  sekmeler palette storage olayını dinliyor; hesap senkronu mevcut layout
  altyapısını kullanıyor (cihazlar arası gerçek hesap testi yapılmadı).
- Staging `ae2e82af.alfa-charts-staging.pages.dev`: mobil ve egress PASS.
  Mobil test, dokunup tutma/sıfırlama, sınırlı fiyat kaydırma, alt boşluk,
  site bağlantısı ve özel zemin rengi kaydını da doğruladı. Gerçek iPhone
  Safari sistem hareketleri ayrıca cihazda kontrol edilmeli.
- Cache sürümleri: CSS `32`, JS `75`; `sw.js` değişmedi.
- Canlı yayın: kaynak `65b2c38`, deployment
  `https://a9442035.alfa-traders.pages.dev`. `alfa-trader.com/alfa-charts.html`
  HTTP 200; CSS/JS sürümleri ve siteye dönüş bağlantısı doğrulandı,
  staging referansı yok. Production veri/migration işlemi yapılmadı.

## Tekrar için scripts

- `scripts/backup-production-private.ps1`
- `scripts/prepare-private-restore-lab.sh`
- `scripts/run-private-restore-lab.sh`
- `scripts/verify-private-restore.py`
- `scripts/prepare-staging-secrets.ps1`
- `scripts/build-staging-artifact.ps1`
- `scripts/staging-rest-function.js`
- `scripts/staging-auth-function.js`

Bu scriptler production'a deploy/migration yapmaz; yalnız özel yedek, izole
restore ve ayrı staging doğrulaması içindir.
