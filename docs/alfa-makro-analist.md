# Alfa Makro Analist — işletim ve kurulum

**Son düzen:** [Sabah + kritik veri akışı](macro-event-flow.md). Önceki uzun rapor biçimleri arşiv uyumluluğu içindir; yeni sabah mesajının hedefi 150–200 kelimedir. Kritik veri öncesi/sonrası işler ayrı kayıt ve ayrı gönderim izni kullanır. Kurulum ve gerçek canlı doğrulama durumu [doğrulama kaydında](macro-verification.md) tutulur.

## Mevcut altyapı ve değişiklik sınırı

- Site: düz `index.html`/JavaScript; Node.js Vercel Functions; Supabase/Postgres.
- İşlem `/api/ai?macro=1` içinde çalışır; bu fonksiyonun mevcut süresi 60 saniyedir. Yeni API fonksiyonu, paket veya bot yoktur. `vercel.json`, `middleware.js` ve `package.json` değişmez.
- `api/tg.mjs` içindeki mevcut `sendTelegram` kodu `lib/telegram.mjs` içine taşınıp iki akış tarafından kullanılır. Portföy bildirimlerinin hedefleri/biçimi korunur. Webhook, polling, emir veya işlem API'si kullanılmaz.
- Makro POST işlemleri sitenin mevcut Supabase oturumu ve admin e-posta kontrolüyle korunur. Operasyonel GET yalnızca ayrı `MACRO_CRON_SECRET` kabul eder; eski Ayna `CRON_SECRET` ayarına dokunulmaz.
- Ana sayfa → Yönetim → **Alfa Makro Analist**: hedef kontrolü, mesaj göndermeden önizleme, açık onayla test ve ayrı otomasyon aç/kapat.

## Değişken adları (değerleri kaynak koda veya loglara koymayın)

Mevcut: `GROQ_API_KEY`, `TG_BOT_TOKEN`, `TG_CHAT_ID`, `TG_THREAD`, `SUPABASE_SERVICE_ROLE`.

Gerekli yeni: `MACRO_CRON_SECRET` (en az 32 karakter, kriptografik rastgele).

İsteğe bağlı: `SUPABASE_URL`, `MACRO_MODEL`, `MACRO_TARGET`, `MACRO_TARGET_THREAD`, `MACRO_ENABLED`.

Premium hedef zaten varsa `TG_PREMIUM_CHAT_ID`, `TG_PREMIUM_THREAD` yeniden kullanılır. Makro yeni hedef veya bot oluşturmaz. Tek yapılandırılmış hedef otomatik seçilebilir; iki hedef varsa `MACRO_TARGET` ile `public` veya `premium` açıkça seçilmelidir. İkisine birden gönderilmez. Forum konusu desteklenmiyorsa gönderim durur; yalnızca makro için konuyu kaldırmak isterseniz `MACRO_TARGET_THREAD=0` kullanın. Mevcut bildirimlerin `TG_THREAD` değerini değiştirmeyin.

7 Kasım kullanıcı düzeltmesi: makro hedefi **Alfa Makro konusu**, `https://t.me/alfatraderspublic/772`. Production'da yalnız `MACRO_TARGET_THREAD=772` kullanılır; önce belirtilen `/434` makro hedefi değildir. Mevcut `TG_THREAD` ve portföy bildirimleri korunur. Konu değişikliği hedef parmak izini değiştirir; eski test/etkinleştirme onayı yeni konuya taşınmaz.

`MACRO_ENABLED=0` acil sunucu durdurmasıdır. Bu değer olmasa bile ilk kurulumda DB ayarı **kapalıdır**. Başarılı, kullanıcı tarafından onaylanmış test ve ayrı etkinleştirme olmadan otomatik gönderim açılamaz.

## Araştırma, rapor ve maliyet

Varsayılan ve Production seçimi: mevcut Groq anahtarı + `openai/gpt-oss-120b` (`MACRO_MODEL`). Kaynaklar model aramasıyla değil, resmi RSS/HTML listeleri, Hazine CSV verileri, BLS API ve spot veri uçlarıyla her çalıştırmada alınır. Model yalnızca iki bülten/veri özeti yazar; `response_format`/JSON şeması istenmez. Etki kanalları, diğer gözlem, varlık senaryoları, bölümler, kaynak kimlikleri, tarihler ve takvim kod tarafından yönetilir. Model özetlerinde BTC/Bitcoin, kripto, altın veya XAUUSD yorumu ve eski `channels` alanı reddedilir; cümle silinerek onarılmaz. Koşullu aktarım çerçevesi reel faiz/dolar ve güvenli liman etkilerini ayırır: risk iştahı artışı altına otomatik destek sayılmaz. Bu çerçeve bir fiyat tahmini veya gerçekleşmiş yön iddiası değildir. ChatGPT sohbeti veya zamanlanmış ChatGPT görevi kullanılmaz.

HTTPS/domain allowlist ve her yönlendirme kontrol edilir; sayfa boyutu ve süreleri sınırlıdır. Kaynak içindeki talimatlar güvensiz veridir. Araştırma katmanı erişim/tarih kapsamını kontrol eder; eksikler açıkça belirtilir. Reuters/AP teyidi, ETF net akışları ve resmi seçim sertifikasyonu henüz doğrulanmış kapsamda değildir. Yayın zamanı bulunamayan kaynak güncel gelişme kanıtı sayılmaz; alınma zamanı yayın zamanı yerine kullanılmaz.

Başlıklar, Türkçe 350–550 kelime, tam üç gelişme, iki varlığın destek/baskı/doğrulama/bozulma koşulları ve 3–6 gerçek kaynak kontrol edilir. Modelin gördüğü metindeki rakamlar, yalnızca model girdisinde maskelenir; asıl kanıt değiştirilmez. Yorum metnindeki sayısal iddialar ve teknik seviye üretimi taslağı reddettirir; hatalı cümleler silinerek rapor geçerli sayılmaz. Genel rapor doğrulamasında da tarihsiz/kaynaksız sayılar reddedilir. Bu kontroller anlam/finansal doğruluğun bağımsız denetimi değildir; ilk önizlemede içerik gözden geçirilmelidir.

7 Kasım son üslup tercihi (`prose-v4`, `narrative-v1`): Telegram'da yalnız kısa başlık, İstanbul veri saati ve **dört akıcı analiz paragrafı** görünür. Kaynak listesi, bağlantılar, köşeli kaynak numaraları, madde işaretleri ve destek/baskı/bozulma alt başlıkları kaldırıldı. Üç gelişmenin kanıtı, BTC/altın koşulları, olay saatleri, 3–6 gerçek URL ve kapsam eksikleri yine doğrulanıp kayıt metadata'sında korunur; kaynaklar araştırmadan çıkarılmaz. Reel faiz yönü iki tarihli sayısal karşılaştırmadan gelir; nominal getiri reel yerine konmaz. Model yalnız iki olgusal giriş özeti yazar; aktarım yönü ve koşullu analiz kod tarafından korunur. Yaklaşık 390 kelime hedeflenir; son sınır 350–550 kelime ve tek mesaj için 3900 karakterdir. Bu biçimde `text_link` entities veya görünür kaynak etiketleri yoktur. Eski raporların gönderim kayıtları değiştirilmez.

BLS ve BEA'nın resmi ICS takvimleri her seferinde alınır. Doğu ABD saat dilimi IANA kurallarıyla (yaz/kış saati dahil) Türkiye saatine çevrilir. Yalnızca doğrulanmış bu olayların saatleri takvime girer. Fed konuşmaları/diğer olayların saati bu otomatik doğrulama kapsamı dışındaysa eksik kapsam açıkça yazılır, saat uydurulmaz. Doğrudan lisanslı spot BTC/XAUUSD kotasyon akışı yoktur; bu eksik belirtilir, vadeli altın spot yerine konmaz.

Ara seçim statüsü anket/tahmin piyasası/geçici sayım/medya projeksiyonu/resmi kesinleşme/politika/doğrulanmadı olarak ayrılır. Olay zamanı son 24 saatin dışındaysa veya önceki kaydın olay parmak iziyle aynıysa yeni gelişme olarak etiketlenmez. Önceki rapordan yalnızca seçim bağlamı alınır; eski metin yeni rapor yerine gönderilmez.

Kullanım maliyeti seçilen Groq modelinin ve mevcut hesabın güncel token tarifesi/kotasına bağlıdır. Önceki küçük modelin maliyet örneği daha güçlü model için geçerli değildir; ücretsiz kullanım veya toplam fatura garantisi verilmez. Modelin erişilebilir olması ücretsiz olduğu anlamına gelmez. Hiçbir ücretli plan veya yeni hizmet satın alınmaz.

Tavily ve Groq browser-search mevcut araştırma yolunda kullanılmaz; bunlar için plan veya bakiye alınmaz. Araştırma/model hatasında eski rapor gönderilmez. Bir günlük üretim denemeleri kalıcı sayaçla sınırlandırılır; model taşıması kendi içinde tekrar yapmaz.

## Kalıcı kayıt ve zamanlayıcı kurulumu

1. Mevcut Supabase projesinin SQL editöründe `supabase/site/002_macro.sql` çalıştırın. İki tablo özel/RLS açık; anon/authenticated için tüm yetkiler kaldırılır, sadece service_role erişir. Diğer tablolar ve portföy verileri değiştirilmez.
2. Vercel Production'da gerekli değişkenleri güvenli arayüzden ayarlayın. Anahtar değerlerini destek mesajlarına/konsol çıktılarına koymayın.
3. Admin panelinde **Durumu yenile**: botun `getChat` sonucu olan hedef adı ve türünü doğrulayın. Kanal ise üyelerce görünür olduğunu özellikle kontrol edin. Hedef belirsiz veya forum konusu uyumsuzken test kapalıdır.
4. **Raporu önizle**: gerçek araştırma ve rapor tamamlanmalı. Sadece API 200 sonucu değil, metin, kaynaklar, tarih ve hedef incelenmeli. Eksik anahtar/erişim/kota/tablo varsa bu bir başarılı rapor değildir.
5. İlk gerçek gönderim için raporu ve hedefi kullanıcıya gösterip onay alın. Panelde onay kutusu + **Test gönder** + ikinci açık onay gerekir. Test gerçek mesajdır ve o günün günlük gönderimini tüketir. Bu araç hiçbir hedefe kendiliğinden test mesajı göndermez.
6. Supabase Vault UI'da `alfa_macro_trigger` adlı secret oluşturun; Vercel `MACRO_CRON_SECRET` ile **aynı değeri** kullanın. Hassas değişken tekrar okunamıyorsa ikisini güvenli biçimde aynı yeni değere döndürün. Değeri SQL içine gömmeyin.
7. `supabase/site/003_macro_schedule.sql` çalıştırın. pg_cron, UTC **06:00**'da (Europe/Istanbul **09:00**) Vercel'i pg_net ile çağırır. 06:15 ve 06:30 yalnızca sınırlı toparlama tetikleridir. Vercel Hobby'nin ±59 dakika belirsizliği nedeniyle mevcut Vercel cron'u bu iş için kullanılmaz. Bilgisayarın açık olması gerekmez. 09:00 araştırma başlangıç hedefidir; ağ/model süreleri teslimi geciktirebilir. Hiçbir bulut zamanlayıcı sıfır gecikme garantisi vermez.
8. Başarılı testten sonra panelden **Günlük otomasyonu aç** onayı verin. `cron.job` içinde yalnızca job adı, schedule ve active alanlarını kontrol edin; Vault değerlerini veya pg_net istek başlıklarını terminale dökmeyin.

7 Kasım kurulum durumu: Vault sırrı, `pg_cron`, `pg_net` ve `alfa-macro-0900-istanbul` görevi kuruldu. Görev 06:00/06:15/06:30 UTC zamanlarına ayarlı; gönderim ayarı **kapalı** olduğu sürece HTTP tetiklemesi bile yapmaz. Supabase/Vercel sunucularında çalışır; sitenin, bilgisayarın veya sohbetin açık kalması gerekmez. Kurulum sırasında yönetici oturumu gerekmesi, çalışma sırasında oturum gerektiği anlamına gelmez. Yönetilen hizmet kesintisi/askıya alınması veya API kotası yine çalışmayı etkileyebilir. `/772` konu testi ve ayrı etkinleştirme tamamlanmadan otomatik teslimat başlamaz.

pg_net, Vault'tan okunan başlığı geçici kuyruğa yazar; Supabase DB login yetkilerini yalnızca güvenilir yöneticilerde tutun. Yönetilen Supabase'in duraklatılması/uyuması planı etkileyebilir; plan ve çalışma durumu kontrol edilmelidir. Bu entegrasyon Supabase hesabını ücretli plana yükseltmez.

## Güvenilirlik / operasyon

- Gün, `Europe/Istanbul` tarihidir; DB `report_date` primary key tek kaydı zorlar. Her geçiş UUID revision ile compare-and-swap yapar. Paralel preview/cron/test aynı günü iki kez sahiplenemez.
- Araştırma kilidi 120 saniye; en fazla üç araştırma denemesi/gün. Başarısız araştırma eski rapora düşmez. 15 dakikadan eski kesit veya yanlış gün gönderilemez.
- Gönderim ve her parça için ağ çağrısından **önce** `sending` kalıcı yazılır. Telegram'ın mesaj id'si teyit edilmeden `sent` yazılmaz. Teyit/DB commit kaybı varsa otomatik yeniden gönderim yoktur. Bu, mükerrer yerine bazen insan kontrolü gerektiren eksik teslimi tercih eder; exactly-once dış servis teslimi iddia edilmez.
- İstisna yalnız kullanıcının açıkça istediği **bugünkü arşiv raporunun farklı bir konuya test kopyasıdır**: yönetici `macro-topic-copy` işlemi güncel hedef/rapor hash'i ve iki açık onay alanı ister. Kaynak veri saati değiştirilmez, kopya olarak etiketlenir; yeni araştırma veya taze rapor diye sunulmaz. Asıl günlük `sent` satırı hiç değiştirilmez. Ayarlarda gün+hedef parmak izine bağlı ayrı `topicCopies` kaydı gönderimden önce CAS ile sahiplenilir; belirsiz/başarısız teslim dahil aynı konuya ikinci kopya otomatik veya körlemesine gönderilemez. Başarılı message id kaydı yeni konu için test teyidi sağlar; otomasyon kendiliğinden açılmaz.
- `sending`, `delivery_unknown`, `delivery_failed` ve `sent` aynı gün otomatik sıfırlanmaz. Belirsiz teslimde Telegram'ı kontrol edin; satırı körlemesine silmeyin veya tekrar gönder butonu aramayın. Otomatik Telegram retry **yoktur**.
- Yeni makro raporu **tek mesajdır**; görünür metin en fazla 3900 UTF-16 birimiyle sınırlanır ve test etiketi için pay bırakılır. Son `narrative-v1` biçiminde kaynaklar yalnız metadata'dadır; önceki `single-v1` arşivlerinin kopyası gerekiyorsa URL'ler `text_link` entities ile korunur. Metin kesilmez, otomatik bölünmez; sınır aşılırsa gönderimden önce reddedilir. `parse_mode` yoktur: model HTML/Markdown'u biçimlendirme olarak yorumlanmaz. Eski biçimde test etiketi eklenirken bağlantı offset'leri kaydırılır. Portföy taşıması değişmez.
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
