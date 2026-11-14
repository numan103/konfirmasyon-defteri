# Ziyaretçi Analitiği

Site ziyaretçilerini **kim geldi, ne kadar kaldı, hangi sayfalarla ilgilendi** ekseninde
gösteren yönetici paneli. Panel yalnızca `ahmetnuman20@gmail.com` (veya
`SITE_ADMIN_EMAILS`) hesabıyla açılır: `?page=analitik`.

## Ne ölçülür?

| Alan | Açıklama |
| --- | --- |
| `vid` | Tarayıcıya özel ziyaretçi kimliği (localStorage). Üye değilse anonimdir. |
| `sid` | Sekme oturumu kimliği (sessionStorage). Sekme kapanınca yeni oturum sayılır. |
| `first` / `last` | Oturumun ilk ve son görülme zamanı. |
| `activeMs` | Sekme görünürken geçen aktif süre. Sekme arka plana geçince durur. |
| `pages` | Sayfa başına görüntüleme, aktif süre ve maksimum kaydırma yüzdesi. |
| `days` | Günlük aktif süre ve sayfa görüntüleme (İstanbul günü). |
| `clicks` | Borsa/affiliate, Telegram, dış bağlantı ve CTA tıklamaları. |
| `entry` / `ref` / `utm` | Giriş sayfası, yönlendiren kaynak ve UTM etiketleri. |
| `device` / `browser` / `os` | User-Agent'tan kaba çözümleme. |
| `country` | Yalnızca Vercel'in `x-vercel-ip-country` başlığından 2 harfli ülke kodu. |
| `lang` / `tz` / `screen` | Tarayıcı dili, saat dilimi, ekran çözünürlüğü. |
| `member` | Yalnızca geçerli Supabase token doğrulanırsa üye UUID'si. |

## Gizlilik

- **Ham IP adresi okunmaz ve saklanmaz.**
- Ülke yalnızca kaba ülke kodudur; şehir/koordinat tutulmaz.
- İsim ve e-posta satıra yazılmaz. Üye UUID'si, yönetici özeti alınırken
  Supabase auth kullanıcılarıyla eşlenir; bu bilgi **yalnızca yönetici yanıtında** görünür.
- Anonim ziyaretçi isimlendirilemez; panelde `Ziyaretçi XXXX` (ziyaretçi kimliğinin
  son 4 karakteri) olarak görünür.
- Yönetici ziyaretleri varsayılan olarak sayılmaz. Paneldeki
  **“Yönetici ziyaretleri”** kutusuyla dahil edilebilir.

## Depolama

Yeni tablo açılmaz (DDL gerekmez). Mevcut `edu_shared` tablosunda oturum başına
tek satır tutulur:

```
id   = visit_<sid>
data = { sid, vid, first, last, activeMs, pages, days, clicks, ... }
```

- Yazma/okuma: `SUPABASE_SERVICE_ROLE` (yoksa publishable anahtarla sınırlı deneme).
- Satırlar 90 gün sonra **Panel → 🧹 Eski kayıtları temizle** ile silinebilir.
- Okuma üst sınırı tek istekte 5.000 satırdır (1.000'lik sayfalar hâlinde).

## API

### `POST /api/analytics`

Gövde örneği:

```json
{
  "sid": "s1a2b3c4d5",
  "vid": "v9z8y7x6w5",
  "first": "2026-11-14T06:00:00.000Z",
  "page": "portfoy",
  "entry": "/?page=home",
  "activeMs": 42000,
  "pages": { "home": { "v": 2, "ms": 15000, "s": 60 } },
  "days": { "2026-11-14": { "ms": 42000, "pv": 3 } },
  "clicks": [
    { "t": "2026-11-14T06:01:00.000Z", "kind": "affiliate", "label": "Bybit", "url": "partner.bybit.com/b/cryptoahmet", "page": "erisim" }
  ],
  "scroll": 60
}
```

- `sid`/`vid`: 6–64 karakter, harf/rakam/`_`/`-`.
- Gövde 24 KB ile sınırlıdır.
- İstemcinin gönderdiği `member` alanı **yok sayılır**.
- Tarayıcı botları (`bot`, `crawler`, `spider`, ...) işaretlenir ve özetlerden çıkarılır.
- Yanıt: `{ "ok": true }`.

### `GET /api/analytics?days=7&includeAdmin=0&prune=0`

`Authorization: Bearer <supabase access token>` gerekir; token sahibi yönetici değilse `401`.

Yanıt özeti:

```json
{
  "ok": true,
  "range": { "days": 7, "since": "..." },
  "totals": {
    "onlineNow": 2,
    "uniqueVisitors": 14,
    "sessions": 21,
    "pageviews": 96,
    "avgActiveMs": 142000,
    "memberSessions": 4,
    "anonymousSessions": 17,
    "adminSessions": 3,
    "botSessions": 1
  },
  "online": [ ... ],
  "topPages": [ { "page": "portfoy", "label": "Portföy Yönetimi", "views": 22, "visitors": 9, "avgMs": 61000, "scroll": 84 } ],
  "referrers": [ { "source": "Telegram", "sessions": 8, "visitors": 7 } ],
  "devices": [ ... ],
  "countries": [ ... ],
  "daily": [ { "date": "2026-11-14", "sessions": 5, "visitors": 5, "pageviews": 31, "ms": 420000 } ],
  "sessions": [ ... ]
}
```

`days` en fazla 90'dır. `prune=1` yalnızca 90 günden eski `visit_*` satırlarını siler.

## Zamanlama ve sınırlar

- İstemci 25 saniyede bir, sayfa değişiminde ve sekme kapanırken (`sendBeacon`) veri yollar.
- “Çevrimiçi” = son 90 saniye içinde sinyal gönderen tekil ziyaretçi.
- Oturum süresi üst sınırı 12 saattir; uyku/askıya alma süreleri sayılmaz.
- Yeni fonksiyon sayısı: Vercel Hobby 12 fonksiyon sınırına `api/analytics.mjs` ile tamamlanır.
  Yeni bir uç eklenmesi gerekiyorsa mevcut uçlardan biriyle birleştirilmelidir.

## Test

```bash
node --test tests/analytics.test.mjs
```

Kapsam: payload doğrulama, oturum birleştirme, cihaz/kaynak çözümleme, günlük/tekil
ziyaretçi özeti, yönetici/bot filtresi ve arayüz bağlantıları.
