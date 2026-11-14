# Piyasa haber akisi uyarilari

## Hedef
- Yalnizca BTC/kripto ve altini gercekten hareket ettirebilecek haberleri yakalamak (Fed/faiz, enflasyon, tarim disi istihdam, tahvil faizi, dolar, tarife/jeopolitik, ETF/regulasyon, BTC veya altin fiyat hareketi).
- Sirket/teknoloji gurultusunu (Nvidia, Microsoft, Outlook, Copilot, hisse kazanci, CEO istifasi vb.) gondermemek.
- Turkce, kisa, tek olaylik Telegram mesaji halinde bildirmek.
- **Gunde en fazla 2 haber** gondermek (Istanbul takvim gunu).
- Resmi makro takvim hattindan (BLS/BEA) bagimsiz calismak: bu hat yalnizca gercek RSS basliklarini kullanir.

## Zamanlama
- `api/ai?news=1` endpoint'i, `lib/market-news.mjs` modulunu calistirir.
- **Gonderim saatleri:** yalnizca **09:00** ve **15:00 TSİ** (piyasa hacmi girmeden once). Gece 00:00 gibi hacimsiz saatlerde bildirim gitmez; pencere disindaki tetiklemeler `skipped: "outside_window"` doner ve RSS bile cekilmez.
- Her pencerede **en fazla 1 bildirim**. Sabah 09:00'da mesaj gittiyse ayni pencerede (09:00-09:59) ikinci mesaj gitmez: `skipped: "slot_already_sent"`.
- Pencere icinde yeni ve net etkili haber gelirse gonderilir; yeni haber yoksa sessiz kalir (`skipped: "no_new_news"`).
- Varsayilan pencere suresi 60 dk. `NEWS_SEND_HOURS` (or. `9,15`) ve `NEWS_WINDOW_MIN` (5-240) ile degistirilebilir.
- `&force=1` ve `&dryRun=1` saat/pencere kontrolunu atlar (elle test icin).
- Vercel Hobby planinda 15 dakikalik cron yok; tetikleme **GitHub Actions** ile yapilir: `.github/workflows/news-poll.yml`, `*/15 * * * *`. Actions her 15 dk calissa da gonderim yalnizca yukaridaki pencerelerde olur.
- Vercel cron eklenmedi; mevcut 3 gunluk cron degismedi. cron-job.org artik gerekli degil (yedek olarak kalabilir).
- Actions is akisi sunucuda saklanan sir kullanmaz: `id-token: write` ile alinan GitHub OIDC token'i `x-github-oidc-token` basligiyla gonderilir. Sunucu token'i GitHub JWKS ile dogrular.

## Kaynaklar
- RSS: CNBC, BBC Business, NYT Business, MarketWatch.
- Google News hedefli aramalar:
  - `bitcoin OR BTC ETF OR crypto regulation OR crypto liquidation`
  - `gold price OR XAU OR bullion OR central bank gold buying`
  - `federal reserve OR FOMC OR rate decision OR CPI OR PPI OR jobs report`
- Reuters RSS artik yayin yapmiyor (DNS yok); listede yok.

## Filtreleme
1. Zaman penceresi: son 24 saat.
2. Baslik anahtari (`titleKey`): kucuk harf + Google News kaynak eki (` - CNBC`) temizlenir.
3. Gurultu dislama (`NOISE_RES`): Nvidia, Microsoft, Outlook/Copilot, Apple, Tesla, Meta, Amazon, OpenAI, kazanc/guidance/layoff/CEO istifasi, spor/eglence; ayrica "price today", "price prediction", "technical analysis", "market analysis" gibi rutin fiyat yorumlari.
4. Onizleme dislama (`PREVIEW_RES`): "ahead of", preview, what to watch, "brace for", "focus on", "await", "due", forecast gibi gercek gelisme olmayan basliklar.
5. Hedef puanlama (`scoreNews`): dogrudan BTC/kripto/altin +3, guclu makro surucu +2, gerceklesmis hareket/karar +1. Puan 0 ise haber gonderilmez.
6. Sert veri onceligi (`isHardEvent`): PPI, CPI/PCE, tarim disi istihdam/isssizlik, FOMC/faiz karari basliklari **hem veri turunu hem gerceklesmis sonucu** ("0.3%", "rose", "slows", "held") iceriyorsa listede en uste alinir; piyasa fiyat yorumundan once gonderilir.
7. Benzerlik tekilleme: kelime kumesi Jaccard >= 0.4 olan basliklar tek basliga indirilir.
8. Yon filtresi (`hasClearMarketImpact`): basliktan BTC veya altin icin net pozitif/negatif yon cikmiyorsa haber **hic secilmez** ("PPI raporu izleniyor", "traders weigh..." gibi).
9. Olay anahtari (`newsEventKey`): sert veri raporlarinda (`PPI`, `CPI/PCE`, istihdam, FOMC) kaynak/varlik fark etmeksizin tek anahtar kullanilir: `data:ppi`, `data:cpi`, `data:jobs`, `data:fomc`. Boylece "cooler PPI" ile "yields move as traders weigh PPI" ayni gun iki kez gitmez. Diger haberlerde ayni varlik + ayni konu (or. `btc:selloff`, `macro:inflation`).
10. Siralama: once sert veri, sonra en yuksek puan, esitlikte en yeni.
11. Gonderilmis basliklar Supabase `edu_shared` / `market_news_seen` satirinda tutulur (son 800).

## Makro yon tutarliligi
AI'nin baslikta olmayan bir yon uydurmasi engellenir; yon once kurallarla cikarilir:

1. **Surucu + yon cikarimi (`extractMacroFacts`):** basliktaki ifade ayni cumle parcasi icinde okunur (virgul/`as`/`while`/`but` ile ayrilir). Desteklenen suruculer: PPI, CPI/PCE, istihdam, Fed/FOMC, tahvil getirisi, dolar, jeopolitik, duzenleme/ETF, fiyat hareketi.
   - "cooler / slows / below expectations / falls" → dovish → BTC ve altin **pozitif**.
   - "hotter / rises / above expectations / sticky" → hawkish → BTC ve altin **negatif**.
   - Tahvil getirisi: dusus/3,5% alti pozitif; yukselis/4,5% ustu negatif (or. %5,17 → negatif).
   - Jeopolitik gerilim → altin pozitif; BTC yonu belirsiz.
2. **Net etki sarti:** BTC veya altin icin yon cikmiyorsa haber secilmez.
3. **AI'ya gercek blok verilir:** surucu, surucu yonu, BTC/altin etkisi ve varsa oran modele zorunlu girdi olarak verilir; `Etki` satiri bu blokla birebir ayni olmak zorundadir.
4. **Dogrulama (`validateAnalysis`):** cevap reddedilir eger:
   - `Etki` satiri eksik veya `combinedEffect` ile uyusmuyorsa (`effect_mismatch`),
   - `BTC:`, `Altin:`, `Neden:` satirlarindan biri eksikse (`missing_sections`),
   - 110 kelimeyi geciyorsa (`too_long`),
   - basliktaki yone aykiri ifade varsa; or. "cooler PPI" haberinde "PPI yukselisi" yazarsa (`contradiction`).
5. **Tek retry + yedek:** reddedilen cevap modele hata sebebiyle bir kez daha sorulur. Yine gecmezse `buildFactAnalysis` ile **kural tabanli** analiz gonderilir; uydurma/celiskili yon hicbir sekilde cikmaz.
6. **Etki satiri normalizasyonu (`normalizeEffectLine`):** "Etki: NEGATIF / NEGATIF" gibi tekrarlar tek etikete indirilir.

Yeni yon kurali eklerken `tests/market-news.test.mjs` icindeki "Makro tutarlilik" testlerini guncelle; ayni veri raporunun iki farkli basligi mutlaka ayni `data:*` anahtarini uretmelidir.

## Mesaj bicimi
```
📰 BTC & Altın Önemli Haber
13.11.2026 15:45 TSİ

• Baslik
  Kaynak

📊 Etki:
Etki: POZITIF/NEGATIF/NOTR
BTC: 1 cumle
Altin: 1 cumle
Neden: 1 cumle

AI yorumu bilgilendirme amaçlıdır, yatırım tavsiyesi değildir.
```
- Her mesajda **tek olay**; gunde en fazla **2 mesaj**.
- `Etki` satiri tek etiket olur (`POZITIF`, `NEGATIF`, `NOTR`); "POZITIF / POZITIF" gibi tekrar temizlenir.
- Linkler mesaja konmaz (Google News yonlendirme adresleri cok uzun).
- AI yorumu yalnizca BTC ve altin etkisine odaklanir; baslikta yazan bilgiyle sinirlidir, uydurma yasak.
- Mesaj 3900 karaktere kirpilir (Telegram limiti 4096).

## Yinelenmeyi onleme
- Ayni baslik ikinci kez gonderilmez (gorulenler listesi).
- Cooldown: son gonderimden sonra `NEWS_COOLDOWN_MIN` (varsayilan **10**) dakika boyunca otomatik gonderim yapilmaz; cevap `skipped: "cooldown"`. Onemli veri haberi 60 dk beklemesin diye dusuruldu.
- Gunluk limit: `NEWS_DAILY_MAX` (varsayilan 2). Limit dolunca cevap `skipped: "daily_cap"`; Istanbul gece yarisinda sifirlanir.
- Her gonderim penceresi icin en fazla 1 mesaj: `skipped: "slot_already_sent"`.
- Ayni olay gun icinde tekrar gonderilmez (`skipped: "duplicate_event"`).
- Elle/test gonderimi icin `&force=1` cooldown ve gunluk limiti atlar.
- Cooldown, gorulenler ve gunluk sayac ayni Supabase satirinda (`data.lastSentAt`, `data.seen`, `data.day`, `data.events`) tutulur; yazma icin `SUPABASE_SERVICE_ROLE` gerekir.

## Yetkilendirme
- `Authorization: Bearer <NEWS_ALERT_SECRET|MACRO_CRON_SECRET|CRON_SECRET>`
- `?key=<ayni secret>`
- Vercel cron: `x-vercel-cron: 1` veya `vercel-cron/*` user-agent.
- GitHub Actions OIDC: `x-github-oidc-token: <JWT>` (aud `alfa-trader-news`, repo `numan103/konfirmasyon-defteri`, workflow `.github/workflows/news-poll.yml`).
- Admin JWT (site girisi) ile de calisir.
- Her istek `market-news poll` logu birakir: `secretOk`, `queryOk`, `cronHeader`, `oidcOk`, `oidcReason`.

## Manuel dogrulama
```powershell
node "$env:TEMP\opencode\mint.mjs" | Out-Null
$token = Get-Content "$env:TEMP\opencode\site.token"
# Metni gor, mesaj atmaz:
Invoke-WebRequest -Uri "https://alfa-trader.com/api/ai?news=1&dryRun=1" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing
# Gercek gonderim (cooldownu atlar):
Invoke-WebRequest -Uri "https://alfa-trader.com/api/ai?news=1&force=1" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing
```

## Cevap alanlari
- `skipped: "outside_window"`: gonderim penceresi disinda; `nextWindow`, `nextInMinutes` doner.
- `skipped: "slot_already_sent"`: ayni pencerede zaten bir bildirim gonderildi.
- `skipped: "no_new_news"`: yeni uygun baslik yok.
- `skipped: "daily_cap"`: gunluk 2 haber limiti doldu; `sentToday` / `dailyMax` doner.
- `skipped: "duplicate_event"`: ayni olay bugun zaten gonderildi.
- `skipped: "cooldown"`: cooldown aktif; `pending` kac uygun baslik bekledigini gosterir.
- `messageId`: Telegram mesaj kimligi (basari kaniti).
- `seenSaved: false`: Supabase yazimi basarisiz; tekrar riski var, kontrol edilmeli.

## Hedef sohbet
- `NEWS_CHAT_ID || TG_TRADE_CHAT_ID || TG_CHAT_ID`
- `NEWS_THREAD || TG_TRADE_THREAD || MACRO_TARGET_THREAD || TG_THREAD`

## Bilinen sinirlar
- RSS basliklari dogrulanmis haber metni degildir; AI yorumu "yorum" olarak etiketlenir.
- Google News ayni olayi farkli kelimelerle tekrar eder; olay anahtari ve gunluk limit bunu sinirlar ama tamamen bitirmez.
- Cok buyuk bir gelisme gunluk 2 limit dolduktan sonra gelirse ertesi gun hatirlatilmaz; limit bilincli bir tercihtir.
- GitHub Actions zamanlayicisi yogun saatlerde birkac dakika gecikebilir; 15 dk hedef, garanti degil.
- Vercel Hobby: fonksiyon suresi ve cron sikligi kisitli; agir filtreleme eklenirse tek cagrida 10 sn altinda kalinmali.
