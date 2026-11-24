# Vercel → Cloudflare Pages geçişi

## Durum

Canlı site ve tüm `/api/*` rotaları **Cloudflare Pages Functions** üzerinde
çalışır. Özel alan `https://alfa-trader.com` Cloudflare Pages'e bağlıdır.
Yeni Vercel hesabı açılmadı, ücretli plan alınmadı, mevcut kullanıcı verisi
ve eski şifreli kayıtlar taşınmadan korundu.

Kök klasördeki `api/*.mjs` dosyaları hâlâ tek iş mantığı kaynağıdır;
`functions/api/*.js` dosyaları bu handler'ları Cloudflare `context.env` ile
besleyip çağıran ince sarmalayıcılardır. `vercel.json`, `middleware.js` ve
`@vercel/blob` geçmiş yapılandırma/uyumluluk dosyaları olarak korunur; canlı
API yönlendirmesi Cloudflare tarafından yapılır.

## Dağıtım

```powershell
wrangler.cmd pages deploy . --project-name=alfa-traders --branch=main --commit-dirty=true
```

`wrangler.toml` sabitleri:

- `name = "alfa-traders"`
- `compatibility_date = "2026-11-24"`
- `compatibility_flags = ["nodejs_compat"]` — kripto, Buffer ve `@vercel/blob`
  uyumluluğu için gereklidir.
- Build adımı yok; kök klasör doğrudan statik çıktıdır.

Secret değerleri repoya yazılmaz. Cloudflare Dashboard → Pages → `alfa-traders`
→ Settings → Environment Variables üzerinden tanımlanır. Cloudflare secret
değerleri okunamaz; doğrulama yalnızca davranışsal uçlarla yapılır.

## 12 fonksiyon sınırı

Hobby kotası nedeniyle `functions/api/` **12/12** dosyadır. Yeni özellikler
yeni fonksiyon açılmadan mevcut rotalar üzerinden çoğullenir:

| Wrapper | Çoğullenen işlevler |
|---|---|
| `ai.js` | Ayna, webhook (`telegram-webhook=1`), influencer (`influencer=1`), Telegram günlük akışı, haber/watch, econ takvim, Coinalyze, orderbook, mentor haberleri, makro, cron |
| `edu-shared.js` | Eğitim verisi, landing projeksiyonları, ortak ayarlar, esseg stilleri |
| `contrib.js` | Alfa Trading paylaşımları ve görsel projeksiyonları |
| `tg.js` | Telegram medya/proxy ve dergi fotoğrafı istekleri |
| `access.js`, `analytics.js`, `ai-checklist.js`, `chat-admin.js`, `eco-cal.js`, `notion-callback.js`, `notion-sync.js`, `notion-trades.js` | Kendi alanları |

Bu yüzden yeni bir API dosyası eklemeden önce mevcut rota ve sorgu bayrağı
kullanılmalıdır.

## Kısa linkler ve zamanlayıcılar

- Eski `vercel.json` redirect'leri Cloudflare `_redirects` dosyasına birebir
  taşındı: `/katil`, `/mentorluk`, `/premium`, `/durum`. `/durum` kuralı
  eski edge cache kaydını da zorla geçmek için `302!` kullanır; kısa linklerin
  hiçbirinde `Cache-Control: no-store` dışında kalıcı cache yoktur.
- 15 dakikalık haber + ekonomik takvim tetiklemesi
  `.github/workflows/news-poll.yml` ile `https://alfa-trader.com/api/ai?...`
  adresine yapılır; GitHub OIDC token'i kullanılır, sunucuda cron secret saklanmaz.
- Makro zamanlayıcısı Supabase `pg_cron` + `pg_net` üzerinden yine özel alan
  adresine çağrı yapar (`supabase/site/003_macro_schedule.sql`,
  `004_macro_events.sql`). Vault sırrı `MACRO_CRON_SECRET` ile aynı değerde
  tutulmalıdır; değer SQL'e yazılmaz.
- `vercel.json` içindeki eski `crons` kaydı tarihsel referanstır; Cloudflare'da
  Vercel cron çalışmaz.

## Veri ve kimlik

- Varsayılan Supabase projesi yenidir: `fssrtlpjqbavzomynwmg`. Eski,
  org-level egress kısıtına takılan `zvnjslmptwmnuhftgqsr` referansı runtime
  modüllerinde fail-closed engellenir. Tek istisna, eski oturum anahtarlarını
  okumak için kullanılan `sb-zvnjslmptwmnuhftgqsr-auth-token` localStorage adıdır;
  bu bir ağ isteği değildir ve kullanıcı verisini korur.
- JWT imzalama anahtarı ve eski şifreli alan secret'ları aynı değerlerle
  Cloudflare secret'ına aktarıldı: `EDU_CHANNEL_SECRET`, `EDU_PROGRESS_SECRET`,
  `EDU_CRM_SECRET`, `ANALYTICS_SECRET`, `PANO_SECRET`,
  `MENTOR_TRADES_SECRET`, `INFLUENCER_CONTENT_SECRET`.
- `SUPABASE_SERVICE_ROLE` yeni projenin service-role anahtarıdır; eski proje
  anahtarıyla karıştırılmaz. Publishable anahtar yalnızca okuma/JWT doğrulama
  içindir.
- PDF, podcast ve sohbet yüklemeleri için `BLOB_READ_WRITE_TOKEN` Cloudflare
  secret'ında bulunmalıdır. `@vercel/blob` bağımlılığı depolama uyumluluğu
  içindir; site API'si Vercel'de çalışmaz.
- `/api/*` yanıtları `Cache-Control: private, no-store` ve uygun yerlerde
  `Vary: Authorization` taşır (`_headers` + wrapper'lar).

## Sosyal önizleme notu

Vercel `middleware.js` yalnızca Vercel Edge runtime'ında çalışır. Cloudflare'da
statik `index.html` varsayılan `og:title` / `og:description` değerlerini sunar;
post'a özel dinamik OG üretimi, 12 fonksiyon kotası aşılmadan taşınmadı. Bu,
site erişimini ve Telegram bildirimlerini etkilemez.

## Doğrulama

```powershell
node --test tests/cloudflare-migration.test.mjs tests/cloudflare-wrappers.test.mjs
node scripts/verify-supabase-bootstrap.mjs
node scripts/verify-influencer-orders.mjs
```

Canlı kontrol: `/api/ai?telegram-webhook=1&action=info` JWT'siz **401**
döner; Webhook URL `PUBLIC_SITE_URL` / `SITE_URL` üzerinden türetilir, geçersiz
veya HTTP adresleri fail-closed olur.
