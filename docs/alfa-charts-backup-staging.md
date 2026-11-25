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
