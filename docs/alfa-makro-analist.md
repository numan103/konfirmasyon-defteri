# Alfa Makro Analist — işletim ve kurulum

## Mevcut altyapı ve değişiklik sınırı

- Site: düz `index.html`/JavaScript; Node.js Vercel Functions; Supabase/Postgres.
- İşlem `/api/ai?macro=1` içinde çalışır; bu fonksiyonun mevcut süresi 60 saniyedir. Yeni API fonksiyonu, paket veya bot yoktur. `vercel.json`, `middleware.js` ve `package.json` değişmez.
- `api/tg.mjs` içindeki mevcut `sendTelegram` kodu `lib/telegram.mjs` içine taşınıp iki akış tarafından kullanılır. Portföy bildirimlerinin hedefleri/biçimi korunur. Webhook, polling, emir veya işlem API'si kullanılmaz.
- Makro POST işlemleri sitenin mevcut Supabase oturumu ve admin e-posta kontrolüyle korunur. Operasyonel GET yalnızca ayrı `MACRO_CRON_SECRET` kabul eder; eski Ayna `CRON_SECRET` ayarına dokunulmaz.
- Ana sayfa → Yönetim → **Alfa Makro Analist**: hedef kontrolü, mesaj göndermeden önizleme, açık onayla test ve ayrı otomasyon aç/kapat.

## Değişken adları (değerleri kaynak koda veya loglara koymayın)

Mevcut: `GROQ_API_KEY`, `TG_BOT_TOKEN`, `TG_CHAT_ID`, `TG_THREAD`, `SUPABASE_SERVICE_ROLE`.

Gerekli yeni: `MACRO_CRON_SECRET` (en az 32 karakter, kriptografik rastgele).

İsteğe bağlı: `SUPABASE_URL`, `MACRO_MODEL`, `MACRO_WEB_PROVIDER`, `TAVILY_API_KEY`, `MACRO_TARGET`, `MACRO_TARGET_THREAD`, `MACRO_ENABLED`.

Premium hedef zaten varsa `TG_PREMIUM_CHAT_ID`, `TG_PREMIUM_THREAD` yeniden kullanılır. Makro yeni hedef veya bot oluşturmaz. Tek yapılandırılmış hedef otomatik seçilebilir; iki hedef varsa `MACRO_TARGET` ile `public` veya `premium` açıkça seçilmelidir. İkisine birden gönderilmez. Forum konusu desteklenmiyorsa gönderim durur; yalnızca makro için konuyu kaldırmak isterseniz `MACRO_TARGET_THREAD=0` kullanın. Mevcut bildirimlerin `TG_THREAD` değerini değiştirmeyin.

`MACRO_ENABLED=0` acil sunucu durdurmasıdır. Bu değer olmasa bile ilk kurulumda DB ayarı **kapalıdır**. Başarılı, kullanıcı tarafından onaylanmış test ve ayrı etkinleştirme olmadan otomatik gönderim açılamaz.

## Araştırma, rapor ve maliyet

Varsayılan: mevcut Groq anahtarı + `openai/gpt-oss-20b`, zorunlu `browser_search` çağrısı. Arama adımı JSON kaynak adayları döndürür; ikinci model çağrısı arama yapmaz, gerçekten yeniden HTTP ile alınmış izinli kaynaklardan raporu üretir. Browser search ile structured outputs birlikte gönderilmez. ChatGPT sohbetine veya zamanlanmış ChatGPT görevine erişim varsayılmaz.

Her çalışmada resmi kaynaklar/Reuters/AP/ETF ihraççıları yeniden alınır. HTTPS/domain allowlist ve her yönlendirme kontrol edilir; sayfa boyutu ve süreleri sınırlıdır. Kaynak içinde bulunan talimatlar güvensiz veri kabul edilir. En az üç erişilmiş kaynak ve son 24 saatte yayın tarihi doğrulanmış en az bir kaynak yoksa rapor hazırlanmaz. Yayın zamanı bulunamayan kaynak güncel gelişme kanıtı sayılmaz. Kaynakların alınma zamanı, yayın zamanı yerine kullanılmaz.

Başlıklar, Türkçe 350–550 kelime, tam üç gelişme, iki varlığın destek/baskı/doğrulama/bozulma koşulları ve 3–6 gerçek kaynak kontrol edilir. Kaynak dışı URL, tarihsiz veya kaynakta bulunmayan sayısal değer, doğrulanmamış takvim id'si, kesinleşmemiş seçim sonucunun kesin sonuç diye işaretlenmesi reddedilir. Bu kontroller anlam/finansal doğruluğun bağımsız denetimi değildir; ilk önizlemede içerik gözden geçirilmelidir.

BLS ve BEA'nın resmi ICS takvimleri her seferinde alınır. Doğu ABD saat dilimi IANA kurallarıyla (yaz/kış saati dahil) Türkiye saatine çevrilir. Yalnızca doğrulanmış bu olayların saatleri takvime girer. Fed konuşmaları/diğer olayların saati bu otomatik doğrulama kapsamı dışındaysa eksik kapsam açıkça yazılır, saat uydurulmaz. Doğrudan lisanslı spot BTC/XAUUSD kotasyon akışı yoktur; bu eksik belirtilir, vadeli altın spot yerine konmaz.

Ara seçim statüsü anket/tahmin piyasası/geçici sayım/medya projeksiyonu/resmi kesinleşme/politika/doğrulanmadı olarak ayrılır. Olay zamanı son 24 saatin dışındaysa veya önceki kaydın olay parmak iziyle aynıysa yeni gelişme olarak etiketlenmez. Önceki rapordan yalnızca seçim bağlamı alınır; eski metin yeni rapor yerine gönderilmez.

Groq resmi fiyat listesi (05.11.2026 kontrolü): GPT-OSS 20B milyon giriş token'ı $0.075, çıkış $0.30. Örnek 8.000 giriş + 4.000 çıkış token'ı toplamı yaklaşık **$0.0018/rapor, $0.054/30 gün**, **tarayıcı arama ücretleri ve ek araç bağlamı hariçtir**. Groq browser-search dokümanı araç için sayısal tarife vermeyip fiyat sayfasına yönlendirir; konsoldaki güncel araç tarifesi/erişim/kota ayrıca doğrulanmalıdır. Bu nedenle bu tutar toplam fatura garantisi değildir. Mevcut ücretsiz kota varsa tüketim o kotadan olabilir. Hiçbir ücretli plan satın alınmaz.

Alternatif: `MACRO_WEB_PROVIDER=tavily` ve `TAVILY_API_KEY`. Dört basic arama/çalışma, `max_age_hours=0` (gerçekten canlı alım), otomatik advanced yükseltmesi kapalı. Normalde ~120 kredi/30 gün; üç deneme/günle üst sınır ~360 kredi/ay. Resmi ücretsiz plan 1.000 kredi/ay; ücretli kullandıkça ödeme $0.008/kredi (~$0.032/araştırma) + Groq token maliyeti. **Ücretli plan veya otomatik bakiye satın alınmaz.** Kota/erişim hatasında cached-only aramaya sessizce düşülmez.

## Kalıcı kayıt ve zamanlayıcı kurulumu

1. Mevcut Supabase projesinin SQL editöründe `supabase/site/002_macro.sql` çalıştırın. İki tablo özel/RLS açık; anon/authenticated için tüm yetkiler kaldırılır, sadece service_role erişir. Diğer tablolar ve portföy verileri değiştirilmez.
2. Vercel Production'da gerekli değişkenleri güvenli arayüzden ayarlayın. Anahtar değerlerini destek mesajlarına/konsol çıktılarına koymayın.
3. Admin panelinde **Durumu yenile**: botun `getChat` sonucu olan hedef adı ve türünü doğrulayın. Kanal ise üyelerce görünür olduğunu özellikle kontrol edin. Hedef belirsiz veya forum konusu uyumsuzken test kapalıdır.
4. **Raporu önizle**: gerçek araştırma ve rapor tamamlanmalı. Sadece API 200 sonucu değil, metin, kaynaklar, tarih ve hedef incelenmeli. Eksik anahtar/erişim/kota/tablo varsa bu bir başarılı rapor değildir.
5. İlk gerçek gönderim için raporu ve hedefi kullanıcıya gösterip onay alın. Panelde onay kutusu + **Test gönder** + ikinci açık onay gerekir. Test gerçek mesajdır ve o günün günlük gönderimini tüketir. Bu araç hiçbir hedefe kendiliğinden test mesajı göndermez.
6. Supabase Vault UI'da `alfa_macro_trigger` adlı secret oluşturun; Vercel `MACRO_CRON_SECRET` ile **aynı değeri** kullanın. Hassas değişken tekrar okunamıyorsa ikisini güvenli biçimde aynı yeni değere döndürün. Değeri SQL içine gömmeyin.
7. `supabase/site/003_macro_schedule.sql` çalıştırın. pg_cron, UTC **06:00**'da (Europe/Istanbul **09:00**) Vercel'i pg_net ile çağırır. 06:15 ve 06:30 yalnızca sınırlı toparlama tetikleridir. Vercel Hobby'nin ±59 dakika belirsizliği nedeniyle mevcut Vercel cron'u bu iş için kullanılmaz. Bilgisayarın açık olması gerekmez. 09:00 araştırma başlangıç hedefidir; ağ/model süreleri teslimi geciktirebilir. Hiçbir bulut zamanlayıcı sıfır gecikme garantisi vermez.
8. Başarılı testten sonra panelden **Günlük otomasyonu aç** onayı verin. `cron.job` içinde yalnızca job adı, schedule ve active alanlarını kontrol edin; Vault değerlerini veya pg_net istek başlıklarını terminale dökmeyin.

pg_net, Vault'tan okunan başlığı geçici kuyruğa yazar; Supabase DB login yetkilerini yalnızca güvenilir yöneticilerde tutun. Yönetilen Supabase'in duraklatılması/uyuması planı etkileyebilir; plan ve çalışma durumu kontrol edilmelidir. Bu entegrasyon Supabase hesabını ücretli plana yükseltmez.

## Güvenilirlik / operasyon

- Gün, `Europe/Istanbul` tarihidir; DB `report_date` primary key tek kaydı zorlar. Her geçiş UUID revision ile compare-and-swap yapar. Paralel preview/cron/test aynı günü iki kez sahiplenemez.
- Araştırma kilidi 120 saniye; en fazla üç araştırma denemesi/gün. Başarısız araştırma eski rapora düşmez. 15 dakikadan eski kesit veya yanlış gün gönderilemez.
- Gönderim ve her parça için ağ çağrısından **önce** `sending` kalıcı yazılır. Telegram'ın mesaj id'si teyit edilmeden `sent` yazılmaz. Teyit/DB commit kaybı varsa otomatik yeniden gönderim yoktur. Bu, mükerrer yerine bazen insan kontrolü gerektiren eksik teslimi tercih eder; exactly-once dış servis teslimi iddia edilmez.
- `sending`, `delivery_unknown`, `delivery_failed` ve `sent` aynı gün otomatik sıfırlanmaz. Belirsiz teslimde Telegram'ı kontrol edin; satırı körlemesine silmeyin veya tekrar gönder butonu aramayın. Otomatik Telegram retry **yoktur**.
- Mesajlar whitespace sınırlarında bölünür; URL ve kelimeler parçalanmaz, parçalar numaralanır, her parça Telegram sınırının altındadır. `parse_mode` kullanılmaz; model HTML/Markdown'u komut/biçimlendirme olarak yorumlanmaz.
- Kayıtlar: araştırılmış rapor, kaynak alım/yayın zamanları, seçim durumu, hedef parmak izi, gönderim durumları ve başarılı message id'leri. Bot/model/scheduler anahtarları kaydedilmez. Hedef chat id'si admin tarayıcı yanıtına verilmez.
- Durdurma: admin panelinden kapatın veya Vercel `MACRO_ENABLED=0`; zamanlayıcıyı ayrıca `cron.unschedule` ile kaldırabilirsiniz. Hedef değişince eski test/otomasyon onayı geçersiz olur.

## Resmi referanslar

- https://console.groq.com/docs/tool-use/built-in-tools/browser-search
- https://console.groq.com/docs/models
- https://console.groq.com/docs/deprecations (Compound kaldırılmıştır; kullanılmaz)
- https://docs.tavily.com/documentation/api-reference/endpoint/search
- https://docs.tavily.com/documentation/api-credits
- https://supabase.com/docs/guides/functions/schedule-functions
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://core.telegram.org/bots/api/methods/sendmessage.md
- https://www.bls.gov/schedule/news_release/bls.ics
- https://www.bea.gov/news/schedule/icalendar
