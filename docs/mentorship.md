# Premium üye / mentorship akışı

## Hedef

- Bybit veya OKX'te **bizim referansımızla** açılmış hesabı olan üyeyi otomatik doğrulamak.
- Doğrulanan üyeye anında premium (site `ref`) erişimi vermek.
- Aynı anda Telegram mentorship grubuna **tek kullanımlık** davet linki üretmek.
- Anahtarlar yokken veya borsa hata verirken kimseyi yanlışlıkla "doğrulanmadı" diye suçlamamak.

## Akış

```
Üye → Erişim sayfası → UID gönder
                         │
              /api/access (submit)
                         │
        ┌────────────────┴─────────────────┐
        │ anahtar var                      │ anahtar yok / hata
        ▼                                  ▼
  Bybit/OKX affiliate API              status = pending
        │                                  │
   verified? ─── hayır ──► rejected   yönetici onayı
        │                (yalnızca kesin yok)
        evet
        ▼
  status = verified  →  tier = ref (premium)
        ▼
  bot: createChatInviteLink (member_limit=1, 7 gün)
        ▼
  mentor_status = invited, davet linki sitede görünür
        ▼
  üye gruba katılır → mentor_status = joined
```

### Dönüş kodları

| Borsa sonucu | Kayıt durumu | Üyeye mesaj |
|---|---|---|
| `ok` | `verified` | Premium + mentorship daveti |
| `not_found` | `rejected` | "UID referans listemizde görünmüyor" |
| `not_configured` | `pending` | "Otomatik doğrulama henüz aktif değil" |
| `auth_error` / `rate_limited` / `error` | `pending` | "Kontrol sürüyor" |

Yalnızca borsa **kesin olarak** "bu UID senin invitee'n değil" dediğinde reddedilir.
Anahtar/izin/ağ hatası üyeyi reddetmez; yönetici onayına düşer.

## Gerekli kurulum

### 1. Veritabanı

`supabase/site/005_mentorship.sql` dosyasını Supabase SQL Editor'de bir kez çalıştır.
Eklenen alanlar: `volume`, `volume_updated_at`, `exchange_joined_at`,
`mentor_status`, `mentor_invite`, `mentor_invite_expires_at`,
`mentor_invited_at`, `mentor_joined_at`, `last_checked_at`, `check_reason`.

Dosya çalıştırılmazsa site çökmez: `/api/access` şemayı algılar, mentorship paneli
"kurulum bekliyor" der, premium erişim normal çalışır.

### 2. Telegram mentorship grubu

1. Özel bir grup aç (mentorship/premium).
2. `@alfaportfoy_bot` botunu gruba ekle.
3. Botu **yönetici** yap ve **"Davet linkleri oluşturma"** yetkisini ver.
4. Grubun chat id'sini al: bot `/getChat` ile ya da gruba bir mesaj atıp
   `https://api.telegram.org/bot<TOKEN>/getUpdates` çıktısından.
   Chat id `-100...` ile başlar.
5. Vercel → Production env: `TG_MENTORSHIP_CHAT_ID=-100...`

Bot zaten `TG_BOT_TOKEN` ile çalışıyor; yeni bot gerekmez.

### 3. Borsa affiliate API anahtarları

#### Bybit

1. Bybit hesabında **Affiliate** programına üye ol (Affiliate Portal).
2. API Management → yeni anahtar:
   - İzin: yalnızca **Affiliate**
   - Ana hesap (master UID) adına
   - IP kısıtı: istersen Vercel çıkış IP'lerini ekle; emin değilsen boş bırak
3. Vercel → Production:
   - `BYBIT_API_KEY`
   - `BYBIT_API_SECRET`

Sorgu: `GET /v5/user/aff-customer-info?uid=...`
Dönen `result.uid` bizim invitee'mizle eşleşirse doğrulanır. Hacim:
`tradeVol365Day` (ömür boyu), `tradeVol30Day` (30 gün).

> Bybit yalnızca **master UID** kabul eder. Alt hesap UID'si doğrulanmaz.

#### OKX

1. OKX **Affiliate** hesabı aç.
2. API → yeni anahtar:
   - İzin: yalnızca **Affiliate** (okuma)
   - Passphrase belirle
3. Vercel → Production:
   - `OKX_API_KEY`
   - `OKX_API_SECRET`
   - `OKX_API_PASSPHRASE`

Sorgu: `GET /api/v5/affiliate/invitee/detail?uid=...`
`data[0].uid` eşleşirse doğrulanır. Hacim: `totalVol` (ömür boyu),
`volPeriod` (dönem), katılım: `joinTime`.

### 4. Deploy

```powershell
cd repo-konfirmasyon
cmd /c "vercel --prod --yes"
```

Env değişiklikleri yeni deployment ister.

## Yönetici paneli

`Erişim` sayfasında (`?page=erisim`) yönetici olarak:

- Bekleyen/onaylı/reddedilen üyeler
- Borsa, UID, hacim
- `mentor: davetli / grupta / iptal`
- `Onayla` → premium + davet üretir
- `Reddet` / `Geri al` → erişimi kapatır, daveti iptal eder

## Güvenlik notları

- Davet linki `member_limit=1` ve 7 gün geçerlidir; paylaşılsa bile tek kişi kullanabilir.
- Link yalnızca satır sahibine gösterilir (`site_access` RLS: select own).
- `site_access` tablosunda istemci yazma politikası yoktur; tüm yazma `/api/access`
  üzerinden service-role ile yapılır.
- API anahtarları yalnızca sunucudadır; istemciye asla gönderilmez.
- `mentor` endpoint'i yalnızca `status='verified'` üyeye link üretir; 30 saniyelik
  yenileme sınırı vardır.

## Testler

```powershell
node --test tests\exchanges.test.mjs tests\mentorship.test.mjs
```

Kapsam: Bybit/OKX başarı, bulunamadı, auth hatası, rate limit, ağ hatası,
hacim/katılım alanları, davet oluşturma/iptal, süre kontrolü.

## Sonraki adım (opsiyonel)

- Günlük/haftalık yeniden doğrulama: UID artık affiliate listesinde değilse
  `mentor_status='revoked'` + erişim kapatma.
- `mentor_status='joined'` durumunu Telegram `chat_member` güncellemesiyle
  otomatik işaretleme (bot webhook'una `chat_member` handler'ı).
- Hacme göre kademeli mentorship (örn. aylık $10k üstü ek grup).
