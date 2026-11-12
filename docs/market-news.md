# Piyasa haber akisi uyarilari

## Hedef
- Piyasayi hareket ettirebilecek haberleri (Fed/faiz, enflasyon, tarife, jeopolitik, kripto, buyuk sirket olaylari) yakalamak.
- Turkce, kisa, tek Telegram mesaji halinde bildirmek.
- Resmi makro takvim hattindan (BLS/BEA) bagimsiz calismak: bu hat yalnizca gercek RSS basliklarini kullanir.

## Zamanlama
- `api/ai?news=1` endpoint'i, `lib/market-news.mjs` modulunu calistirir.
- Vercel Hobby planinda 15 dakikalik cron yok; bu yuzden tetikleme disaridan yapilir (cron-job.org veya GitHub Actions).
- Onerilen aralik: 15 dakika. Sunucu tarafindaki cooldown tekrar yagmurunu engeller.
- Vercel cron eklenmedi; mevcut 3 gunluk cron degismedi.

## Kaynaklar
- RSS: CNBC, BBC Business, NYT Business, MarketWatch.
- Google News hedefli aramalar:
  - `nvidia OR bitcoin OR federal reserve OR tariff`
  - `stock market OR recession OR layoffs OR CEO resigns`
- Reuters RSS artik yayin yapmiyor (DNS yok); listede yok.

## Filtreleme
1. Zaman penceresi: son 24 saat.
2. Baslik anahtari (`titleKey`): kucuk harf + Google News kaynak eki (` - CNBC`) temizlenir.
3. Gurultu dislama (`EXCLUDE`): star wars, wnba, nba, box office, film, social security, moda, yemek vb.
4. Kelime sinirli anahtar eslesmesi (`KEYWORDS`): "sec" gibi kisa kelimeler "second" icinde eslesmez.
5. Benzerlik tekilleme: kelime kumesi Jaccard >= 0.4 olan basliklar tek basliga indirilir.
6. Konu kotasi: ayni konudan (nvidia, bitcoin, fed, tarif, petrol, tahvil...) en fazla 2 baslik.
7. Siralama: yuksek etkili konular once, sonra en yeni.
8. Gonderilmis basliklar Supabase `edu_shared` / `market_news_seen` satirinda tutulur (son 800).

## Mesaj bicimi
```
📰 Piyasa Haber Akışı
12.11.2026 17:33 TSİ

• Baslik
  Kaynak
...

📊 AI Yorumu:
- N: POZITIF/NEGATIF/NOTR | etkilenen varlik | 1 cumle gerekce

AI yorumu bilgilendirme amaçlıdır, yatırım tavsiyesi değildir.
```
- Linkler mesaja konmaz (Google News yonlendirme adresleri cok uzun).
- AI yorumu basliklarda acikca yazan bilgiyle sinirlidir; uydurma yasak.
- Mesaj 3900 karaktere kirpilir (Telegram limiti 4096).

## Yinelenmeyi onleme
- Ayni baslik ikinci kez gonderilmez (gorulenler listesi).
- Cooldown: son gonderimden sonra `NEWS_COOLDOWN_MIN` (varsayilan 60) dakika boyunca otomatik gonderim yapilmaz; cevap `skipped: "cooldown"`.
- Elle/test gonderimi icin `&force=1` cooldownu atlar.
- Cooldown ve gorulenler ayni Supabase satirinda (`data.lastSentAt`, `data.seen`) tutulur; yazma icin `SUPABASE_SERVICE_ROLE` gerekir.

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
- `skipped: "cooldown"`: cooldown aktif; `pending` kac baslik bekledigini gosterir.
- `messageId`: Telegram mesaj kimligi (basari kaniti).
- `seenSaved: false`: Supabase yazimi basarisiz; tekrar riski var, kontrol edilmeli.

## Hedef
- `NEWS_CHAT_ID || TG_TRADE_CHAT_ID || TG_CHAT_ID`
- `NEWS_THREAD || TG_TRADE_THREAD || MACRO_TARGET_THREAD || TG_THREAD`

## Bilinen sinirlar
- RSS basliklari dogrulanmis haber metni degildir; AI yorumu "yorum" olarak etiketlenir.
- Google News zaman zaman ayni olayi farkli kelimelerle tekrar eder; konu kotasi bunu sinirlar ama tamamen bitirmez.
- Vercel Hobby: fonksiyon suresi ve cron sikligi kisitli; agir filtreleme eklenirse tek cagrida 10 sn altinda kalinmali.
