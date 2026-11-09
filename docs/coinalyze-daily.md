# Coinalyze gunluk BTC turev ozeti

## Hedef
- Her gun **Istanbul 11:00** civarinda, Alfa Traders Public grubundaki **charts**
  konusuna (`TG_THREAD` = `/434`) tek bir Telegram mesaji gonderilir.
- Mesaj uc veriyi birlikte verir:
  - **Spot CVD (24s):** BTC spot marketlerinin alim-satim hacim farki (base coin).
  - **Long/Short:** BTC perpetual marketlerinin long/short hesap orani ortalamasi.
  - **Acik pozisyon (OI):** BTC perpetual marketlerinin USD cinsinden toplami ve 24s degisimi.
- Yeni bot, ucretli plan veya ek kanal yoktur; mevcut `TG_BOT_TOKEN` ve
  `sendTelegram` tasima katmani kullanilir.

## Zamanlama
- `vercel.json` cron: `0 8 * * *` UTC = **11:00 TSİ**.
- Cagri: `GET /api/ai?coinalyze=1`.
- Zamanlanmis cagri yalnizca Istanbul saati **11** iken gonderir; diger saatlerde
  `{ ok: true, skipped: "outside_window" }` doner ve veri cekmez.
- Yonetici cagrilari pencere disinda da calisabilir; `dryRun=1` yalnizca metni
  dondurur, `force=1` ayni gun icin yeniden gonderim denemesine izin verir.

## Veri kaynagi ve anlam
- Resmi Coinalyze API'si (`https://api.coinalyze.net/v1`) ve mevcut
  `COINALYZE_API_KEY` kullanilir. Anahtar yalnizca sunucu tarafinda okunur.
- Spot marketler Coinalyze BTC CVD sayfasinin varsayilan 19 marketidir
  (`BTCUD.A ... BTCUSD.P`); CVD bu sabit listeyle hesaplanir.
- Perpetual marketler `future-markets` icinden `base_asset === "BTC"`,
  `is_perpetual === true` olanlardan secilir.
- OI, BTC OI sayfasinin varsayilan borsa setinden (Binance, Bitfinex, Bybit,
  Deribit, Huobi, Hyperliquid, Kraken, OKX, WOO X, dYdX) alinir; yalnizca
  USD/USDT/USDC kotali perpetual kontratlar secilir, perpetuallar once gelir ve
  en fazla 15 kontrat istenir.
- Long/Short orani, sayfanin varsayilan bes marketinden alinir
  (`BTCUSD_PERP.A`, `BTCUSDC_PERP.A`, `BTCUSDT_PERP.A`, `BTCUSD.6`, `BTCUSDT.6`).
- CVD, 24 saatlik `ohlcv-history` barlarindan `bv - (v - bv)` ile hesaplanir.
  Islem hacmi USD karsiligi `delta * close` ile raporlanir.
- OI, `open-interest-history` cevabindan `convert_to_usd=true` ile alinir ve
  market bazinda toplanir. 24s degisim, ayni yontemle 24 saat onceki toplama gore
  hesaplanir.
- Long/Short orani, `long-short-ratio-history` icindeki `l` / `s` yuzdelerinin
  market bazinda ortalamasidir; oran `long% / short%` olarak yazilir.
- Veri eksikse (CVD, OI veya LSR bos/gecersiz) **mesaj gonderilmez**; istek
  `502 coinalyze_incomplete` doner. Eksik veri tahminle tamamlanmaz.
- API anahtari dakikada 40 cagriya izin verir. Bir kosu 1 market-listesi +
  19 spot + 15 OI + 5 LSR = **40 cagri** yapar; sinir asilmaz.

## Mesaj bicimi
```
📊 BTC türev görünümü
9.11.2026 11:00 TSİ

Spot CVD (24s): -759 BTC · -56,1 mn$
Long/Short: 1,65 · Long %62,3 / Short %37,7
Açık pozisyon: 20,95 mlr$ · 24s -1,6%

Coinalyze agregasyonu.
```
- Sayilar Turkce bicimdedir: binlik `.`, ondalik `,`, negatif `−`.
- Kaynak listesi, parantezli atif veya Entry/TP/SL/Kaldırac bilgisi yoktur.
- Mesaj duz metindir; `parse_mode` kullanilmaz. Site onchain sayfasina link eklenir
  ve Telegram link onizlemesi aciktir (site og.png gosterilir).

## Yinelenmeyi onleme
- Gunluk durum `edu_shared` tablosunda `id = "coinalyze_daily"` satirinda tutulur:
  `{ day, phase, messageId?, at, error? }`.
- Gonderimden **once** `phase = "sending"` yazilir. Bu yazim basarisiz olursa
  mesaj gonderilmez (`503 state_unavailable`); boylece durum bilinmeden gonderim
  yapilmaz.
- Telegram ag hatasinda `phase = "unknown"` olur ve **kor retry yapilmaz**.
- Telegram reddinde `phase = "failed"` olur; sonraki zamanlanmis cagri ayni gun
  icinde bir kez daha deneyebilir.
- `phase = "sent"` ise ayni gun icin ikinci mesaj gonderilmez; istek
  `{ ok: true, skipped: "already_sent" }` doner.
- Basarili gonderimde `messageId` saklanir.

## Yetkilendirme
- Zamanlanmis cagri: `x-vercel-cron: 1` veya `vercel-cron/*` user-agent.
- Alternatif: `Authorization: Bearer <CRON_SECRET|MACRO_CRON_SECRET>`.
- Yonetici: gecerli Supabase oturumu ve `SITE_ADMIN_EMAILS` icinde e-posta.
- Diger istekler `401 unauthorized` alir; veri cekilmez ve mesaj gonderilmez.

## Hata durumlari
| Durum | HTTP | Davranis |
| --- | --- | --- |
| API anahtari yok | 502 | `coinalyze_key_missing`, mesaj yok |
| Coinalyze erisilemez | 502 | `coinalyze_unavailable`, mesaj yok |
| Veri eksik | 502 | `coinalyze_incomplete`, mesaj yok |
| Telegram ayarsiz | 503 | `telegram_not_configured` |
| Durum yazilamadi | 503 | `state_unavailable`, mesaj yok |
| Telegram ag hatasi | 502 | `unknown`, tekrar yok |
| Telegram reddi | 502 | `failed`, sonraki gun/deneme |

## Manuel dogrulama
```sh
# Yonetici token'i ile metni gor (mesaj atmaz)
curl -H "Authorization: Bearer <site.token>" \
  "https://alfa-trader.com/api/ai?coinalyze=1&dryRun=1"

# Ayni gun icin bilincli tekrar denemesi
curl -H "Authorization: Bearer <site.token>" \
  "https://alfa-trader.com/api/ai?coinalyze=1&force=1"
```

## Dogrulama kaydi
- **2026-11-09 production dry run:** CVD `−777 BTC · −57,4 mn$`, Long/Short
  `1,65 · Long %62,3 / Short %37,7`, OI `26,02 mlr$ · 24s −1,9%`; hedef
  `chat -1003939737954`, thread `4`.
- Ayni gun yonetici gonderimi `messageId 822` ile charts konusuna gitti.
  Ikinci cagri veri cekmeden `{ skipped: "already_sent" }` dondu.
- Test mesaji `delTg` ile silindi (`deleted: 822`) ve `coinalyze_daily` satiri
  temizlendi.
- **429 notu:** Ayni dakika icinde iki tam kosu (40'ar cagri) limiti asar.
  Ardisik manuel denemeler arasinda en az 60 saniye beklenmelidir.
