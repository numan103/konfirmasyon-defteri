# Site erişimi — kurulum

Bu klasör deploy edilmez (`.vercelignore` içinde `supabase/` var). SQL'i Supabase panelinden elle çalıştırıyorsun.

## 1. Tabloyu oluştur

Supabase → SQL Editor → `001_access.sql` içeriğini bir kez çalıştır.

Ardından `005_mentorship.sql` dosyasını da çalıştır (premium/mentorship katmanı:
hacim, davet linki, mentorship durumu). Dosya idempotenttir; tekrar çalıştırmak zararsızdır.

Son olarak `006_telegram_access.sql` dosyasını çalıştır. Bu dosya, üyelerin **bot
üzerinden** doğrulanmasını sağlayan `public.telegram_access` tablosunu oluşturur
(site hesabı gerekmez, kimlik Telegram user id'sidir). RLS açıktır ve hiçbir
politika yoktur; yalnızca service-role erişir.

> `005` veya `006` çalıştırılmadan da site/bot çökmez: `/api/access` eksik kolonları
> algılar, mentorship paneli "kurulum bekliyor" der; bot ise "sistem hazırlanıyor"
> deyip yöneticiye haber verir.

Oluşan tablolar: `public.site_access` (site), `public.telegram_access` (bot).

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
| `BYBIT_API_KEY` / `BYBIT_API_SECRET` | Bybit affiliate anahtarı; **yalnızca "Affiliate" izni** verilmeli, master UID ile |
| `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_API_PASSPHRASE` | OKX affiliate kimliği |
| `OKX_AFFILIATE_DETAIL_PATH` | Varsayılan `/api/v5/affiliate/invitee/detail`; OKX farklı yol veriyorsa buradan değiştir |

Mentorship (Telegram özel grup) için:

| Değişken | Not |
|---|---|
| `TG_BOT_TOKEN` | Mevcut bot (zaten tanımlı) |
| `TG_MENTORSHIP_CHAT_ID` | Mentorship grubunun chat id'si (`-100...`). Bot grupta **yönetici** ve "davet linki oluşturma" yetkisine sahip olmalı |
| `TG_ADMIN_IDS` | (Opsiyonel) Onay/red butonlarını kullanabilecek Telegram user id'leri, virgülle. Boşsa `5122809433` |
| `TG_ADMIN_CHAT_ID` | (Opsiyonel) Yönetici bildirimlerinin gideceği **özel** chat id. Boşsa ilk `TG_ADMIN_IDS` id'sine DM atılır; asla gruba düşmez |

> Anahtarlar tanımlı değilse doğrulama **yanlış sonuç üretmez**: başvuru `pending` olarak kaydedilir ve elle onaylanır. `TG_MENTORSHIP_CHAT_ID` yoksa premium erişim yine açılır; yalnızca davet adımı görünmez.

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


### Notion uçları (b93)

| Uç | Kural |
|---|---|
| `/api/notion-sync` | Giriş + `ref`/`admin` — site sahibinin Notion defterine yazar |
| `/api/notion-trades` | Giriş + `ref`/`admin` — defteri okur (`?mode=options` dahil) |
| `/api/notion-week` | Giriş + `ref`/`admin` — haftalık değerlendirme push/pull |
| `/api/notion-callback` | Açık — OAuth yönlendirme adresi; token `#notion-token=` fragment'ında döner |

### Hâlâ açık uçlar

| Uç | Durum |
|---|---|
| `/api/ai` | Girişsiz (misafir asistanı + landing). Kötüye kullanımda Groq kotası tükenebilir; gerekirse hız sınırı eklenmeli. |
| `/api/ai-checklist` | Girişsiz. Aynı risk. |
| `/api/edu-shared` | Herkese açık (eğitim içeriği paylaşımı). |
| `/api/eco-cal` | Herkese açık (ekonomik takvim, 5 dk cache). |


### Panelden onay (b96)

Yonetici hesapla giris yapip **Erisim** sayfasini ac: "Uyelik onaylari" panelinde UID gonderen uyeler listelenir (e-posta + borsa + UID). `Onayla` aninda premium erisim verir, `Reddet` / `Geri al` erisimi kapatir. Bu islemler `/api/access` uzerinden service-role ile yazilir; arayuz yalnizca `SITE_ADMIN_EMAILS` listesindeki hesaplara acilir.

> Bu dosya env guncellemesi sonrasi guncellendi.

## 6. Mentorship akisi (premium → Telegram)

1. Üye, Erişim sayfasında borsasını seçip UID'sini gönderir.
2. Anahtarlar tanımlıysa `/api/access` borsaya sorar:
   - `verified` → anında `ref` (premium) + mentorship daveti
   - `not_found` → `rejected` (yalnızca borsa kesin "yok" dediğinde)
   - `not_configured` / `auth_error` / `rate_limited` / `error` → `pending` (yanlış suçlama yok)
3. Doğrulanan üye için bot, mentorship grubunda **tek kullanımlık** davet linki üretir
   (`member_limit=1`, 7 gün). Link `site_access.mentor_invite` alanında tutulur ve
   yalnızca sahibine gösterilir.
4. Üye linke tıklayıp gruba katılır. Bağlantı süresi dolmuşsa Erişim sayfasındaki
   "Davet linkini yenile" butonu yeni link üretir.
5. Elle onay (`approve`) da aynı davet akışını tetikler.

Yönetici panelinde her üye için `mentor: davetli / grupta / iptal` ve varsa hacim görünür.
`revoke` işlemi erişimi kapatır, mentorship davetini iptal eder ve durumu `revoked` yapar.

## 7. Telegram içinden doğrulama (site hesabı gerekmez)

Üye `@alfaportfoy_bot` ile DM'de konuşur:

```
/start
  → Bybit / OKX seçimi (inline buton)
  → UID girişi
  → "Doğru mu?" onayı
  → bot affiliate API'sinden kontrol eder
      verified  → tek kullanımlık grup daveti DM'e gelir
      not_found → "UID bulunamadı", tekrar dene / destek
      pending   → başvuru kaydedilir, yöneticiye Onayla/Reddet butonu gider
```

Komutlar: `/dogrula`, `/durum`, `/link` (yeni davet), `/destek`, `/iptal`, `/sil`,
`/yardim`. Piyasa soruları aynı DM'de `/ask`, `/data`, `/ogren` ile çalışmaya devam eder.

Yönetici tarafı:

- Bot gruba eklenince `my_chat_member` ile **chat id** yöneticiye DM/grup olarak bildirilir.
- Grup içinde `/grupid` yazınca chat id döner (yalnızca yönetici).
- `/bekleyen` ile bekleyen başvurular ve Onayla/Reddet butonları listelenir.
- Üye mentorluk grubuna katılınca `chat_member` güncellemesiyle `mentor_status='joined'` işaretlenir.

Webhook'un bu güncellemeleri alması için `allowed_updates` şunları içermelidir:
`message`, `callback_query`, `my_chat_member`, `chat_member`. Webhook'u yeniden kurmak için
yönetici JWT'siyle `GET /api/ai?telegram-webhook=1` çağır.

> Bot, grupta **yönetici** değilse davet linki üretemez. Bu durumda kullanıcı yine
> doğrulanır, davet adımı "hazırlanıyor" kalır ve yönetici uyarılır.

