# Piyasa haber akisi uyarilari

## Hedef
- Yalnizca BTC/kripto ve altini gercekten hareket ettirebilecek haberleri yakalamak (Fed/faiz, enflasyon, tarim disi istihdam, tahvil faizi, dolar, tarife/jeopolitik, ETF/regulasyon, BTC veya altin fiyat hareketi).
- Sirket/teknoloji gurultusunu (Nvidia, Microsoft, Outlook, Copilot, hisse kazanci, CEO istifasi vb.) gondermemek.
- Turkce, kisa, tek olaylik Telegram mesaji halinde bildirmek.
- **Gunde en fazla 2 haber** gondermek (Istanbul takvim gunu).
- Resmi makro takvim hattindan (BLS/BEA) bagimsiz calismak: bu hat yalnizca gercek RSS basliklarini kullanir.

## Zamanlama
- `api/ai?news=1` endpoint'i, `lib/market-news.mjs` modulunu calistirir.
- Vercel Hobby planinda 15 dakikalik cron yok; bu yuzden tetikleme disaridan yapilir (cron-job.org veya GitHub Actions).
- Onerilen aralik: 15 dakika. Sunucu tarafindaki cooldown tekrar yagmurunu engeller.
- Vercel cron eklenmedi; mevcut 3 gunluk cron degismedi.

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
3. Gurultu dislama (`NOISE_RES`): Nvidia, Microsoft, Outlook/Copilot, Apple, Tesla, Meta, Amazon, OpenAI, kazanc/guidance/layoff/CEO istifasi, spor/eglence.
4. Onizleme dislama (`PREVIEW_RES`): "ahead of", preview, what to watch, week ahead, outlook, forecast gibi gercek gelisme olmayan basliklar.
5. Hedef puanlama (`scoreNews`): dogrudan BTC/kripto/altin +3, guclu makro surucu +2, gerceklesmis hareket/karar +1. Puan 0 ise haber gonderilmez.
6. Benzerlik tekilleme: kelime kumesi Jaccard >= 0.4 olan basliklar tek basliga indirilir.
7. Olay anahtari (`newsEventKey`): ayni varlik + ayni konu (or. `btc:selloff`, `gold:inflation`) gun icinde ikinci kez gonderilmez.
8. Siralama: en yuksek puan once, esitlikte en yeni.
9. Gonderilmis basliklar Supabase `edu_shared` / `market_news_seen` satirinda tutulur (son 800).

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
- Linkler mesaja konmaz (Google News yonlendirme adresleri cok uzun).
- AI yorumu yalnizca BTC ve altin etkisine odaklanir; baslikta yazan bilgiyle sinirlidir, uydurma yasak.
- Mesaj 3900 karaktere kirpilir (Telegram limiti 4096).

## Yinelenmeyi onleme
- Ayni baslik ikinci kez gonderilmez (gorulenler listesi).
- Cooldown: son gonderimden sonra `NEWS_COOLDOWN_MIN` (varsayilan 60) dakika boyunca otomatik gonderim yapilmaz; cevap `skipped: "cooldown"`.
- Gunluk limit: `NEWS_DAILY_MAX` (varsayilan 2). Limit dolunca cevap `skipped: "daily_cap"`; Istanbul gece yarisinda sifirlanir.
- Ayni olay gun icinde tekrar gonderilmez (`skipped: "duplicate_event"`).
- Elle/test gonderimi icin `&force=1` cooldown ve gunluk limiti atlar.
- Cooldown, gorulenler ve gunluk sayac ayni Supabase satirinda (`data.lastSentAt`, `data.seen`, `data.day`, `data.events`) tutulur; yazma icin `SUPABASE_SERVICE_ROLE` gerekir.

## Yetkilendirme
- `Authorization: Bearer <NEWS_ALERT_SECRET|MACRO_CRON_SECRET|CRON_SECRET>`
- `?key=<ayni secret>`
- Vercel cron: `x-vercel-cron: 1` veya `vercel-cron/*` user-agent.
- Admin JWT (site girisi) ile de calisir.

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
- `skipped: "no_new_news"`: yeni uygun baslik yok.
- `skipped: "daily_cap"`: gunluk 2 haber limiti doldu; `sentToday` / `dailyMax` doner.
- `skipped: "duplicate_event"`: ayni olay bugun zaten gonderildi.
- `skipped: "cooldown"`: cooldown aktif; `pending` kac uygun baslik bekledigini gosterir.
- `messageId`: Telegram mesaj kimligi (basari kaniti).
- `seenSaved: false`: Supabase yazimi basarisiz; tekrar riski var, kontrol edilmeli.

## Hedef
- `NEWS_CHAT_ID || TG_TRADE_CHAT_ID || TG_CHAT_ID`
- `NEWS_THREAD || TG_TRADE_THREAD || MACRO_TARGET_THREAD || TG_THREAD`

## Bilinen sinirlar
- RSS basliklari dogrulanmis haber metni degildir; AI yorumu "yorum" olarak etiketlenir.
- Google News ayni olayi farkli kelimelerle tekrar eder; olay anahtari ve gunluk limit bunu sinirlar ama tamamen bitirmez.
- Cok buyuk bir gelisme gunluk 2 limit dolduktan sonra gelirse ertesi gun hatirlatilmaz; limit bilincli bir tercihtir.
- Vercel Hobby: fonksiyon suresi ve cron sikligi kisitli; agir filtreleme eklenirse tek cagrida 10 sn altinda kalinmali.
