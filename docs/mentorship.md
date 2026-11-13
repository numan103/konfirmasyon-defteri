# Premium üye / mentorship akışı

## Hedef

- Bybit veya OKX'te **bizim referansımızla** açılmış hesabı olan üyeyi otomatik doğrulamak.
- Doğrulanan üyeye anında premium (site `ref`) erişimi vermek.
- Aynı anda Telegram mentorship grubuna **tek kullanımlık** davet linki üretmek.
- Anahtarlar yokken veya borsa hata verirken kimseyi yanlışlıkla "doğrulanmadı" diye suçlamamak.

## Akış

```
Üye → Erişim sayfası → borsayı seç
                          │
              referans linkiyle kayıt / hesap taşıma
              (Bybit: yeni e-posta + video, OKX: yeni hesap)
                          │
                    UID gönder
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

> **Referans şartı:** Üye, UID yazmadan önce bizim referans linkimizle kayıt
> olmuş olmalıdır. Bybit'te mevcut hesap taşınabilir (yeni e-posta + hesap kimliği
> taşıma videosu). OKX'te mevcut hesap referansa taşınamıyorsa linkten yeni hesap
> açılır. Hesap açılışı borsanın KYC/kullanım koşullarına tabidir. OKX yaklaşık
> 6 ayda bir tekrar giriş isteyebilir.
>
> - Bybit: https://partner.bybit.com/b/cryptoahmet
> - OKX: https://www.okx.com/join/CRYPTOAHMET
> - Bybit hesap taşıma videosu: https://youtu.be/p0EcYJ40Kt0

### Dönüş kodları

| Borsa sonucu | Kayıt durumu | Üyeye mesaj |
|---|---|---|
| `ok` | `verified` | Premium + mentorship daveti |
| `not_found` | `rejected` | "UID referans listemizde görünmüyor" |
| `not_configured` | `pending` | "Otomatik doğrulama henüz aktif değil" |
| `auth_error` / `rate_limited` / `error` | `pending` | "Kontrol sürüyor" |

Yalnızca borsa **kesin olarak** "bu UID senin invitee'n değil" dediğinde reddedilir.
Anahtar/izin/ağ hatası üyeyi reddetmez; yönetici onayına düşer.

> Affiliate API anahtarı eklenmezse sistem yine çalışır: her başvuru yöneticiye
> **özelden** UID + Onayla/Reddet olarak düşer. Bu mod kalıcıdır; onaydan önce
> UID'yi borsanın affiliate panelinden elle kontrol etmek gerekir.

### Telegram içinden akış (site hesabı gerekmez)

Üye doğrudan botla konuşur. Kimlik `telegram_access.telegram_id`'dir; e-posta/site
hesabı gerekmez. Aynı borsa UID'si iki Telegram hesabına bağlanamaz.

```
/start → Bybit/OKX butonu
   → kayıt/talimat ekranı (referans linki + Bybit video, "Kaydım hazır, UID'ye geç")
   → UID → "Doğru mu?" onayı
   → verifyExchange()
       verified  → status=verified + tek kullanımlık davet DM'e gönderilir
       not_found → status=rejected, tekrar dene / destek
       pending   → status=pending, yöneticiye Onayla/Reddet butonlu bildirim
```

Komutlar: `/dogrula`, `/durum`, `/link`, `/destek`, `/iptal`, `/sil`, `/yardim`.
Kısa/markalı katılım linkleri (Vercel redirect):
- `https://alfa-trader.com/katil` → bot doğrulama akışı
- `https://alfa-trader.com/mentorluk` → bot doğrulama akışı
- `https://alfa-trader.com/premium` → bot doğrulama akışı
- `https://alfa-trader.com/durum` → üyelik durumu
Yönetici: `/bekleyen`, `/grupid`. Üye gruba katılınca `chat_member` güncellemesi
`mentor_status='joined'` yazar. Bot gruba eklenince `my_chat_member` ile chat id
yöneticiye bildirilir.

Bot DM'de tanımadığı mesajları Q&A'ya devreder; yani `/ask`, `/data` ve serbest
piyasa soruları aynı sohbette çalışmaya devam eder.

## Gerekli kurulum

### 1. Veritabanı

`supabase/site/005_mentorship.sql` dosyasını Supabase SQL Editor'de bir kez çalıştır.
Eklenen alanlar: `volume`, `volume_updated_at`, `exchange_joined_at`,
`mentor_status`, `mentor_invite`, `mentor_invite_expires_at`,
`mentor_invited_at`, `mentor_joined_at`, `last_checked_at`, `check_reason`.

Dosya çalıştırılmazsa site çökmez: `/api/access` şemayı algılar, mentorship paneli
"kurulum bekliyor" der, premium erişim normal çalışır.

Ardından `supabase/site/006_telegram_access.sql` dosyasını çalıştır. Bu dosya
botun DM akışı için `public.telegram_access` tablosunu oluşturur. RLS açık,
politika yok; yalnızca service-role erişir. Tablo yoksa bot "sistem hazırlanıyor"
der ve yöneticiye SQL uyarısı gönderir.

### 2. Telegram mentorship grubu

1. Özel bir grup aç (mentorship/premium) — grup zaten açıksa tekrar açma.
2. `@alfaportfoy_bot` botunu gruba ekle.
3. Botu **yönetici** yap ve **"Davet linkleri oluşturma"** yetkisini ver.
4. Grubun chat id'sini almanın en kolay yolu: gruba `/grupid` yaz (bot yönetici
   id'sine cevap verir) veya botu gruba ekle; `my_chat_member` bildirimi chat id'yi
   yöneticiye gönderir. Chat id `-100...` ile başlar.
5. Vercel → Production env: `TG_MENTORSHIP_CHAT_ID=-100...`
6. (Opsiyonel) `TG_ADMIN_IDS=5122809433` — Onayla/Reddet butonlarını kullanacak
   Telegram hesapları. Boşsa varsayılan yönetici id'si kullanılır.
7. (Opsiyonel) `TG_ADMIN_CHAT_ID=5122809433` — UID'li yönetici bildirimlerinin
   gideceği **özel** sohbet. Tanımlı değilse ilk yönetici id'sine DM atılır.
   Bildirimler bilinçli olarak gruba gönderilmez; UID'ler grupta görünmez.

Bot zaten `TG_BOT_TOKEN` ile çalışıyor; yeni bot gerekmez.

Webhook `allowed_updates`: `message`, `callback_query`, `my_chat_member`, `chat_member`.
Kod deploy edildikten sonra webhook'u yeniden kur (yönetici JWT'siyle):

```
GET https://alfa-trader.com/api/ai?telegram-webhook=1
```

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

Telegram tarafında yönetici:

- `/bekleyen` → bekleyen başvurular + Onayla/Reddet butonları
- `/yanit <telegram_id> <mesaj>` → kullanıcıya bot üzerinden DM
- `/grupid` → içinde bulunulan grubun chat id'si

## Güvenlik notları

- Grup **özel** olmalıdır; herkese açık kullanıcı adı (`@...`) varsa kaldırılmalı ve
  ana davet linki sıfırlanmalıdır. Aksi halde UID onayı olmadan gruba girilebilir.
- Bot gruba girdiğinde/sonradan katılan biri `status='verified'` değilse bot onu
  **banlar** ve yöneticiye bildirir. Onay/doğrulama sonrası davet üretilirken ban
  otomatik kaldırılır. Botun grupta **"Üyeleri banla"** yetkisi olmalıdır.
- Davet linki `member_limit=1` ve 7 gün geçerlidir; paylaşılsa bile tek kişi kullanabilir.
- Link yalnızca satır sahibine gösterilir (`site_access` RLS: select own).
- `site_access` tablosunda istemci yazma politikası yoktur; tüm yazma `/api/access`
  üzerinden service-role ile yapılır.
- API anahtarları yalnızca sunucudadır; istemciye asla gönderilmez.
- `mentor` endpoint'i yalnızca `status='verified'` üyeye link üretir; 30 saniyelik
  yenileme sınırı vardır.

## Testler

```powershell
node --test tests\exchanges.test.mjs tests\mentorship.test.mjs tests\telegram-onboarding.test.mjs
```

Kapsam: Bybit/OKX başarı, bulunamadı, auth hatası, rate limit, ağ hatası,
hacim/katılım alanları, davet oluşturma/iptal, süre kontrolü; bot DM akışının
saf yardımcıları (UID ayrıştırma, klavyeler, durum etiketleri, yönetici kontrolü).

## Bilinen kurulum sırası

1. `005_mentorship.sql` + `006_telegram_access.sql` çalıştır.
2. Vercel'e `TG_MENTORSHIP_CHAT_ID` ve `TG_ADMIN_CHAT_ID` ekle. Affiliate anahtarları
   bilinçli olarak eklenmez; tüm başvurular elle onaylanır.
3. Deploy et, webhook'u yeniden kur.
4. Botu gruba ekle/yönetici yap; `/grupid` ile id'yi doğrula.
5. Test hesabıyla uçtan uca dene: `/start` → borsa → kayıt ekranı → UID → yönetici
   onayı → davet → gruba katılım.

## Sonraki adım (opsiyonel)

- Günlük/haftalık yeniden doğrulama: UID artık affiliate listesinde değilse
  `mentor_status='revoked'` + erişim kapatma.
- Hacme göre kademeli mentorship (örn. aylık $10k üstü ek grup).
