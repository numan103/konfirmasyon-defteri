# Ekonomik takvim uyarilari

## Hedef
- Yalnizca **onceden planlanmis** yuksek etkili ABD verilerini bildirmek: TÜFE/ÜFE, tarim disi istihdam, issizlik, Fed faiz karari, GSYH, perakende satislar, PMI, PCE vb.
- Sabah tek bir **gunluk ajanda**, veriden **5-25 dakika once** kisa bir hatirlatma gondermek.
- Rakam uydurmamak: mesajlarda yalnizca kaynaktaki `forecast` (beklenti) ve `previous` (onceki) degerleri kullanilir.
- **Gerceklesen (actual) sonuc bildirilmez.** ForexFactory haftalik JSON'unda `actual` alani yoktur; veri sonrasi yorum `market-news` ve resmi BLS/BEA hattinin isidir. Bu hat deterministik kalir.

## Kaynak
- `https://nfs.faireconomy.media/ff_calendar_thisweek.json` (ForexFactory haftalik JSON).
- Alanlar: `title`, `country`, `date`, `impact`, `forecast`, `previous`. `actual` yok.
- Ayni kaynak site icin `api/eco-cal.mjs` proxy'sinde de kullanilir.
- Tarihler kaynakta ABD Dogu saati ofsetiyle gelir; hat bunlari **Europe/Istanbul** saatine cevirir.
- Basliklar `TITLE_TR` tablosuyla Turkceye cevrilir; tabloda olmayan baslik Ingilizce kalir (uydurma ceviri yapilmaz).

### Kaynak kesintisi (429 / 5xx)
ForexFactory ucretsiz feed'i yogunlukta `429` donebilir. Hat sirayla dener:
1. Dogrudan feed; `429`/`5xx` ise kisa bir bekleme sonrasi **tek tekrar**.
2. Site ici edge-cache'li proxy: `https://alfa-trader.com/api/eco-cal` (`ECON_CALENDAR_PROXY_URL`).
3. Ikisi de olmezse Supabase'deki **son basarili kopya** (en fazla 48 saat).

Basarili her okuma `econ_calendar_state.data.cache` alanina yazilir (en fazla 30 dakikada bir). Kaynak kesintisinde ajanda/hatirlatma bu kopyadan uretilir; cevapta `source: "cache"`, `stale: true` doner. 48 saatten eski kopya kullanilmaz ve `source_unavailable` doner. `api/eco-cal` hata cevaplarini artik cache'lemez (`Cache-Control: no-store`), boylece kisa bir 429 bes dakika boyunca "takvim yok" olarak kalmaz.

## Filtre
- Varsayilan: yalnizca `country = USD` ve `impact = High`.
- `ECON_COUNTRIES` (or. `USD,EUR`) ve `ECON_IMPACTS` (or. `High,Medium`) ile degistirilebilir. Ajanda basligi da secilen ulkelere gore yazilir.
- Ayni `country + baslik + dakika` kombinasyonu tek olay sayilir (`parseCalendarRows`).
- Gun siniri Istanbul takvim gunune gore cizilir; 00:00 TSİ'yi gecen veri ertesi gune yazilir.

## Zamanlama
Tetikleme: `.github/workflows/news-poll.yml` icindeki ikinci adim, `*/15 * * * *` (15 dakikada bir).
`https://alfa-trader.com/api/ai?calendar=1`

1. **Haftalik on bakis**
   - Varsayilan **Pazar 20:00 TSİ**, 45 dakikalik pencere (20:00-20:44).
   - `ECON_WEEKLY_START` (or. `20:00`) ve `ECON_WEEKLY_WINDOW_MIN` (5-180) ile ayarlanir.
   - Ertesi gun (Pazartesi) baslayan haftanin henuz gerceklesmemis yuksek etkili verileri gun adi + saat + Turkce baslik + beklenti/onceki ile listelenir.
   - Haftada **en fazla 1 kez** gonderilir (`state.weekKey`, hedef haftanin Pazartesi tarihi).
   - `ECON_WEEKLY_DAY` (ISO 1 = Pazartesi ... 7 = Pazar) ve `ECON_WEEKLY_ENABLED=0` ile ayarlanir.
   - Haftalik mesaj o gunun verilerini de icerdigi icin ayni gun ayrica gunluk ajanda gitmez.
   - Haftada yuksek etkili veri yoksa kisa bir "veri yok" notu gonderilir (`ECON_EMPTY_NOTES=0` ile kapatilir).
2. **Gunluk ajanda (yalnizca Pazartesi-Cuma)**
   - Varsayilan **08:30 TSİ**, 45 dakikalik pencere (08:30-09:14).
   - `ECON_AGENDA_START` (or. `08:30`) ve `ECON_AGENDA_WINDOW_MIN` (5-180) ile ayarlanir.
   - Gunde **en fazla 1 kez** gonderilir (`state.day`).
   - O gun kalan tum yuksek etkili veriler saat, ulke, Turkce baslik, beklenti ve onceki degerle listelenir.
   - Ajanda, olaya **25 dakikadan az** kalan verileri "gonderildi" olarak isaretler; ayni veri icin ayrica hatirlatma gitmez.
   - O gun veri yoksa kisa bir "bugün veri yok" notu gonderilir. Notlar `ECON_EMPTY_NOTES=0` ile kapatilir.
3. **Veri hatirlatmasi (yalnizca Pazartesi-Cuma)**
   - Veriden **5-25 dakika once**, gunde her olay icin **en fazla 1 kez**.
   - 15 dakikalik tetikleme + 20 dakikalik pencere, her olayi yakalar.
   - Ayni calistirmada birden fazla olay varsa tek mesajda toplanir.
   - **Sessiz saatler:** 08:00-23:00 TSİ disinda hatirlatma gitmez. `ECON_REMINDER_START_HOUR` / `ECON_REMINDER_END_HOUR` ile degistirilebilir.
   - Gece 00:00 civarinda ajanda/hatirlatma yoktur.

## Hafta sonu kurali
- **Cumartesi ve Pazar** gunluk ajanda, veri hatirlatmasi ve makro haber gonderilmez.
- Tek istisna: **Pazar 20:00 TSİ haftalik on bakis**; ertesi haftanin takvimini ozetler.
- Hafta sonu calistirmalar `skipped: "weekend"` doner; durum yazilmaz.
- `force` / `dryRun` / `adminPreview` bu kapıyı test icin atlar.


## Mesaj bicimleri

Haftalik on bakis (Pazar 20:00):
```
🗓️ Bu Haftanın Ekonomik Takvimi
16 Kasım 2026 – 22 Kasım 2026 · TSİ

Bu hafta öne çıkan ABD verileri:
• Salı 16:30 — ABD TÜFE (aylık)
  Beklenti: 0,3% · Önceki: 0,6%
• Cuma 16:30 — ABD Tarım Dışı İstihdam

Saatler TSİ. Kaynak: Forex Factory; resmî kurum tahmini değildir.
```

Gunluk ajanda:
```
📅 Ekonomik Takvim
14.11.2026 · TSİ

Bugünün öne çıkan verileri (ABD):
• 16:30 — ABD TÜFE (aylık)
  Beklenti: 0,3% · Önceki: 0,6%

Saatler TSİ. Beklenti/önceki değerler Forex Factory takviminden; resmî kurum tahmini değildir.
```

Tek veri hatirlatmasi:
```
⏰ 15 dk sonra: ABD TÜFE (aylık)
16:30 TSİ
Beklenti: 0,3% · Önceki: 0,6%

Yüksek etkili veri; BTC ve altında oynaklık artabilir.
```

- Mesajlarda "gerceklesti / actual / sonuc" iddiasi yoktur.
- Fiyat tahmini veya yatirim tavsiyesi yoktur; yalnizca takvim bilgisi ve oynaklik uyarisi.

## Durum ve tekilleme
- Supabase `edu_shared` tablosunda `id = 'econ_calendar_state'` satiri:
  ```json
  {
    "day": "2026-11-14",
    "agendaSentAt": "2026-11-14T05:30:12.000Z",
    "weekKey": "2026-11-16",
    "weekSentAt": "2026-11-15T17:00:12.000Z",
    "sent": { "USD|cpi m/m|29649270": "2026-11-14T12:45:00.000Z" },
    "cache": {
      "fetchedAt": "2026-11-14T05:20:00.000Z",
      "via": "feed",
      "events": []
    },
    "updatedAt": "2026-11-14T12:45:00.000Z"
  }
  ```
- `sent` anahtari olay bazlidir; son 3 gun tutulur, en fazla 200 kayit.
- `weekKey` haftalik on bakisin hedefledigi haftanin Pazartesi tarihidir (Pazar aksami gonderimde ertesi gun baslayan hafta); ayni hafta ikinci kez gonderilmez.
- `cache`, kaynak kesintisinde kullanilan son basarili filtreli kopyadir (en fazla 500 olay).
- Ajanda gonderilemezse `day` yazilmaz; pencere icinde tekrar denenir. Telegram/DB hatasinda cevap `502`/`503` doner ve workflow kirmizi olur.
- `SUPABASE_SERVICE_ROLE` yoksa normal gonderim `503 state_not_configured` ile durur; `dryRun` calismaya devam eder.

## Yetkilendirme
`api/ai?calendar=1` su yollardan biriyle calisir:
- `Authorization: Bearer <ECON_ALERT_SECRET>` (yoksa `NEWS_ALERT_SECRET`, `MACRO_CRON_SECRET`, `CRON_SECRET`),
- `?key=<secret>`,
- Vercel cron (`x-vercel-cron: 1` veya `vercel-cron/` user-agent),
- GitHub Actions OIDC: `x-github-oidc-token` basligi; `github-oidc.mjs` imza, `aud`, repo ve `workflow_ref` dogrular,
- admin oturumu (`requestUser().admin`).

Aksi halde `401 unauthorized`.

## Ortam degiskenleri
| Degisken | Varsayilan | Aciklama |
|---|---|---|
| `ECON_ALERT_SECRET` | — | Elle tetikleme sirri (opsiyonel; diger sir isimleri de kabul edilir) |
| `ECON_CHAT_ID` | `NEWS_CHAT_ID` / `TG_TRADE_CHAT_ID` / `TG_CHAT_ID` | Hedef sohbet |
| `ECON_THREAD` | `NEWS_THREAD` / `TG_TRADE_THREAD` / `MACRO_TARGET_THREAD` / `TG_THREAD` | Konu/thread id |
| `ECON_COUNTRIES` | `USD` | Virgulle ayrilmis ulke kodlari |
| `ECON_IMPACTS` | `High` | Etki seviyeleri |
| `ECON_AGENDA_START` | `08:30` | Ajanda baslangici (TSİ) |
| `ECON_AGENDA_WINDOW_MIN` | `45` | Ajanda penceresi (dk) |
| `ECON_WEEKLY_DAY` | `7` | Haftalik on bakis gunu (ISO: 1=Pazartesi, 7=Pazar) |
| `ECON_WEEKLY_START` | `20:00` | Haftalik on bakis baslangici (TSİ) |
| `ECON_WEEKLY_WINDOW_MIN` | `45` | Haftalik on bakis penceresi (dk) |
| `ECON_WEEKLY_ENABLED` | `1` | `0` ise haftalik on bakis gonderilmez |
| `ECON_EMPTY_NOTES` | `1` | `0` ise "veri yok" bilgi notlari gonderilmez |
| `ECON_REMINDER_START_HOUR` | `8` | Hatirlatma sessiz saat baslangici |
| `ECON_REMINDER_END_HOUR` | `23` | Hatirlatma sessiz saat bitisi (haric) |
| `ECON_CALENDAR_PROXY_URL` | `https://alfa-trader.com/api/eco-cal` | 429/5xx yedek kaynagi |
| `ECON_FETCH_RETRY_MS` | `1200` | 429/5xx tekrar beklemesi (0-5000) |
| `ECON_CACHE_MAX_AGE_HOURS` | `48` | Son basarili kopyanin azami yasi |
| `ECON_CACHE_WRITE_MIN` | `30` | Kopyayi en sik yazma araligi (dk) |
| `SUPABASE_URL` | proje URL'i | Varsayilan proje URL'i gomulu |
| `SUPABASE_SERVICE_ROLE` | — | Durum yazimi icin zorunlu |
| `TG_BOT_TOKEN` | — | Telegram bot token'i |

`ECON_COUNTRIES` degisirse ajanda basligi otomatik guncellenir; "ABD" sabit yazilmaz.

## Elle test
```powershell
# Yalnizca onizleme; mesaj atmaz, durum yazmaz.
$token = $env:ECON_ALERT_SECRET
Invoke-RestMethod "https://alfa-trader.com/api/ai?calendar=1&dryRun=1" -Headers @{ Authorization = "Bearer $token" }

# Pencere disinda bile ajandayi/hatirlatmayi zorla dene (mesaj atar).
Invoke-RestMethod "https://alfa-trader.com/api/ai?calendar=1&force=1" -Headers @{ Authorization = "Bearer $token" }

# Haftalik on bakisi bugun olmasa bile zorla gonder (mesaj atar).
Invoke-RestMethod "https://alfa-trader.com/api/ai?calendar=1&weekly=1" -Headers @{ Authorization = "Bearer $token" }

# Ornek mesajlari YALNIZCA yonetici DM'ine gonder (haftalik + gunluk + hatirlatma).
Invoke-RestMethod "https://alfa-trader.com/api/ai?calendar=1&adminPreview=1" -Headers @{ Authorization = "Bearer $token" }

# Ayni ornekleri gondermeden sadece metin olarak al.
Invoke-RestMethod "https://alfa-trader.com/api/ai?calendar=1&adminPreview=1&dryRun=1" -Headers @{ Authorization = "Bearer $token" }
```
`adminPreview=1` bu haftanin gercek takvim verileriyle haftalik, gunluk ve hatirlatma orneklerini `🧪 ÖRNEK — gruba gönderilmedi` etiketiyle admin DM'ine yollar; gruba gitmez ve durum yazmaz.
`dryRun` cevabi: `agenda`, `agendaEmpty`, `weekly`, `weeklyEmpty`, `weeklyDue`, `weekKey`, `weekend`, `weeklyDay`, `weeklyWindow`, `weekSentAt`, `reminders`, `events`, `agendaWindow`, `windows`, `source`, `stale`.
`force` ajanda icin yalnizca o gun henuz gonderilmediyse calisir; tekrar denemek icin durum satirindaki `day` alanini temizle.
`weekly=1` haftalik on bakisi gun/hafta kontrolu olmadan gonderir; test disinda kullanilmamalidir.

## Cevap alanlari
- `kind: "weekly"` / `kind: "agenda"` / `kind: "reminder"`: mesaj gonderildi.
- `source`: `feed` (dogrudan), `proxy` (edge-cache yedegi) veya `cache` (son basarili kopya).
- `stale: true`: kaynak kesintisi nedeniyle son kopya kullanildi.
- `skipped: "source_unavailable"`: kaynak alinamadi ve kullanilabilir kopya yok; mesaj yok.
- `skipped: "no_events_today"`: ajanda penceresinde o gun veri yok ve bos gun notu kapali.
- `skipped: "weekend"`: hafta sonu; gunluk ajanda ve hatirlatma gonderilmedi.
- `skipped: "nothing_due"`: 5-25 dk penceresinde gonderilecek veri yok.
- `events`: gonderilen/uygun olay sayisi veya olay anahtarlari.
- `stateSaved`: durum satiri yazildi mi.
- `401`, `502`, `503`: yetki/Telegram/durum hatasi.

## Cakisma kurallari
- Ekonomik takvim hatti **veri oncesi** bilgi verir; `market-news` hatti yalnizca gerceklesmis gelismeleri 09:00/15:00 pencerelerinde bildirir.
- `macro-event-flow.md` resmi BLS/BEA saatlerini ve veri sonrasi yorumu yonetir. Bu hat resmi saat iddiasinda bulunmaz; kaynak etiketi mesajda acikca yazar.
