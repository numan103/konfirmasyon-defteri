# Site erişimi — kurulum

Bu klasör deploy edilmez (`.vercelignore` içinde `supabase/` var). SQL'i Supabase panelinden elle çalıştırıyorsun.

## 1. Tabloyu oluştur

Supabase → SQL Editor → `001_access.sql` içeriğini bir kez çalıştır.

Oluşan tablo: `public.site_access`.

- Kullanıcı **yalnızca kendi satırını SELECT** edebilir (RLS).
- INSERT/UPDATE politikası yok → istemci kendini `verified` yapamaz.
- Yazma sadece `/api/access` üzerinden, `SUPABASE_SERVICE_ROLE` ile.
- Aynı borsa UID'si iki hesaba bağlanamaz (`site_access_uid_key`).

## 2. Ortam değişkenleri (Vercel → Settings → Environment Variables)

Zaten mevcut olması gerekenler:

| Değişken | Ne için |
|---|---|
| `SUPABASE_URL` | Supabase proje URL'i |
| `SUPABASE_PUBLISHABLE` | İstemci anahtarı (JWT doğrulama) |
| `SUPABASE_SERVICE_ROLE` | Sunucu yazması (RLS bypass) |

Referans kapısı için:

| Değişken | Ne için |
|---|---|
| `SITE_OKX_REF_LINK` | OKX referans linkin (boşsa `https://www.okx.com/join/CRYPTOAHMET`) |
| `SITE_BYBIT_REF_LINK` | Bybit referans linkin (boşsa `https://partner.bybit.com/b/cryptoahmet`) |
| `SITE_ADMIN_EMAILS` | Virgülle ayrılmış admin e-postaları (boşsa `ahmetnuman20@gmail.com`) |
| `SITE_ACCESS_OPEN` | `1` yaparsan **her giriş yapmış kullanıcı tam erişim** alır (acil durum vanası) |

Borsa doğrulaması için (affiliate API anahtarı):

| Değişken | Not |
|---|---|
| `BYBIT_API_KEY` / `BYBIT_API_SECRET` | Bybit affiliate anahtarı; **yalnızca "Affiliate" izni** verilmeli |
| `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_API_PASSPHRASE` | OKX affiliate kimliği |
| `OKX_AFFILIATE_PATH` | Varsayılan `/api/v5/affiliate/invitee/list`; OKX farklı yol veriyorsa buradan değiştir |

> Anahtarlar tanımlı değilse doğrulama **yanlış sonuç üretmez**: başvuru `pending` olarak kaydedilir ve elle onaylanır.

## 3. Elle onay / red

```sql
-- Onayla
update public.site_access
   set status = 'verified', verified_by = 'manual', verified_at = now(), note = null
 where user_id = '<auth.users.id>';

-- Reddet
update public.site_access
   set status = 'rejected', note = 'manual reject'
 where user_id = '<auth.users.id>';

-- Bekleyenler
select user_id, exchange, exchange_uid, status, note, created_at
  from public.site_access
 where status = 'pending'
 order by created_at;
```

## 4. Erişim seviyeleri

`index.html` içindeki `PAGE_TIER` haritası:

- **free** — kayıtlı herkes: `home`, `news`, `calc`, `calendar`, `ek`
- **ref** — referansı doğrulanmış: `alfatrading` (işlem kanalı), `defter`, `data`, `review`, `karne`, `trading`, `egitim`, `strategies`, `analiz`, `indicators`, `designer`, `pano`, `onchain`, `portfoy`, `butce`
- **admin** — `alfa`, `apps`, `basvuru`, `chat-admin`, `sosyalmetre`, `uyap`, `zaman`, `strateji`, `ayna`, `mentoring`

## 5. Bilinen sınır

Site tek dosya (`index.html`) ve içerik HTML'in içinde. Bu yüzden sayfa kapısı bir **ürün kapısıdır**: tarayıcıda JS ile aşılabilir. Gerçek koruma veri katmanındadır:

- `journals` — Supabase RLS, kullanıcı yalnızca kendi verisini okur.
- `edu_shared` — herkese açık okuma (eğitim içeriği burada). Kapatmak istersen okuma politikasını değiştirmek gerekir.
- `/api/access` — yazma service-role ile, istemci durumu değiştiremez.

### API uçlarının yetkileri

| Uç | Kural |
|---|---|
| `/api/access` | Giriş zorunlu; yazma service-role ile |
| `/api/tg?notify=1` | Giriş + `ref`/`admin` + 3 sn throttle (anonim spam kapalı) |
| `/api/contrib?store=alfatrading` | **GET açık** (paylaşılan gönderi linkleri için); `add/edit/delPost/delComment/status/profileUpdate` → admin; `like/comment` → giriş |
| `/api/contrib?store=pano` | Giriş + `ref`/`admin` |
| `/api/chat-admin` | Giriş; kullanıcı yalnızca kendi `?sid=` oturumunu okur, admin hepsini; `role='admin'` ve DELETE → admin |

Not: `site_access` tablosu yokken kapı bilinçli olarak kapalıdır (herkes `ref`), yani yukarıdaki `ref` kontrolleri de gevşer. Tablo kurulunca hepsi devreye girer.

İçeriği gerçekten sunucu arkasına almak istersen sonraki adım: premium veriyi `edu_shared`'dan çıkarıp JWT + `site_access` kontrolü yapan bir uçtan servis etmek.
