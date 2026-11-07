# Geliştirme doğrulama kaydı — 5–7 Kasım 2026

**En güncel çalışma:** [sabah + olay güncellemesi düzeni](macro-event-flow.md). Aşağıdaki bölümler tarihsel kayıttır. Son canlı önizleme 7 Kasım **11:48**, 133 kelime, yeni kaynak alımıyla ve model çağrısı olmadan oluşturuldu. BLS takvimine Vercel erişimi hâlâ eksik. En son 12:23 doğrulamasında BLS API 200 verirken BLS açıklama sayfası 403 döndü; bu nedenle yalnız API ile doğrulama ve açık manşet çapraz kontrolü sınırlaması eklendi. Kullanıcının açık onayıyla günlük ve olay otomasyonu **7 Kasım 12:30 TSİ itibarıyla açıldı**; etkinleştirme anında mesaj gönderilmedi.

- Canlı hedef `getChat` ile okundu: **Alfa Traders Public**, `supergroup`, herkese açık kullanıcı adı var; mevcut konu seçimi geçerli. Hedef id'si ve anahtarlar bu kayda alınmadı.
- Groq models API, `openai/gpt-oss-20b` erişimini doğruladı. Bu kontrol ücretsiz metadata sorgusudur; gerçek araştırma veya rapor üretimi başarısı anlamına gelmez.
- Korumalı `status` isteği 200: otomasyon **kapalı**, kalıcı kayıt altyapısı **hazır** (`storageReady:true`).
- Mesaj göndermeyen gerçek `preview` istekleri araştırmaya ve model üretimine ulaştı; **başarılı, doğrulanmış rapor henüz yok**. Sayısal kaynak doğrulaması (`report_unsupported_number`), eksik rapor alanları ve sağlayıcının `400/json_validate_failed` hataları görüldü. Son deneme grubu günlük sınırına ulaştı; otomatik veya sınırsız tekrar yapılmayacak.
- Gerçek Telegram `sendMessage` / test gönderimi **yapılmadı**. Hedef onayı ve rapor önizlemesi tamamlanmadan yapılmayacak.
- `MACRO_CRON_SECRET` ayrı, hassas Production değişkeni olarak oluşturuldu; eski `CRON_SECRET`, bot token'ı, hedef ve webhook/polling ayarları değiştirilmedi.
- `supabase/site/002_macro.sql` uygulandı. `003_macro_schedule.sql` ve Vault zamanlayıcı sırrı henüz kurulmadı; etkin zamanlayıcı olduğu iddia edilmiyor.
- Sonraki adımlar: gerçek önizlemeyi başarıyla üret/incele → hedefi ve metni kullanıcıya göster/onay al → test → Vault ve zamanlayıcı → ayrı etkinleştirme. Vault'a aynı secret girilemiyorsa `MACRO_CRON_SECRET` ve Vault değerini birlikte güvenli biçimde yeniden belirle.
- Başarı senaryosu birim testleri yapay test verisiyle çalışır; gerçek piyasa raporu veya gerçek Telegram teslimi kanıtı olarak sunulmaz.
- Son kontrol: toplam **139/139 birim ve regresyon testi** başarılı. Bu testler gerçek rapor üretiminin başarılı olduğu anlamına gelmez.

## Araştırma ve doğrulama kısıtları

- Modelin URL keşfi yerine her çalıştırmada resmi RSS/HTML listeleri, Hazine nominal/reel getiri CSV'leri, BLS API ve spot fiyat API'leri çekiliyor. Küçük strict JSON-schema model denemesi başarılı; tam rapor başarısı bununla kanıtlanmış sayılmıyor.
- Canlı ortamda BLS RSS/takvim ve SEC makale erişimlerinde HTTP 403; FRED geniş dolar serisinde zaman aşımı görüldü. BLS API erişimi çalışıyor. Dolar göstergesi eksikse DXY uydurulmuyor.
- Coinbase tek borsa BTC kotasyonu, gold-api üçüncü taraf XAUUSD kotasyonudur. Resmi/konsolide fiyat diye sunulmuyor. ETF net akışları, Reuters/AP teyidi ve resmi ara seçim sertifikasyonu henüz doğrulanmış kapsamda değil.
- Kaynak yayın zamanı, piyasa gözlem zamanı yerine otomatik yazılmaz. Eksik seçim bölümüne ilgisiz kaynak atamak ve başarısız rapordan cümle silerek doğrulamayı geçirmeye çalışmak kaldırıldı; geçersiz rapor engellenir.
- Model için `generation.mjs` içinde sabit alanlı, düz JSON şeması kullanılır; metinler değiştirilmeden mevcut rapor yapısına eşlenir. Verilen kaynak kimlikleri şema ile sınırlandırılır. Bilinmeyen seçim aşamasında modelin sonuç iddiaları ve ilgisiz atıfları yayımlanmaz.
- Geliştirme sırasında yalnızca teslimat kaydı olmayan başarısız araştırma kayıtlarına bakım yapıldı. Son bakım revision koşullu güncelleme ile yapıldı; gönderim durumları sıfırlanmadı. Bundan sonraki canlı denemeler için limit yeniden tekrar tekrar sıfırlanmayacak.

## Kullanıcı onaylı tek ek deneme

- Kullanıcı soru aracında **Bir ek denemeyi onayla** seçimini yaptı. Yalnızca `research_failed`, teslimatsız ve beklenen revision'a sahip günlük kayıtta sayaç üçten ikiye indirildi; yalnızca bir ek üretim hakkı verildi. Kayıt silinmedi; Telegram teslimat/etkinleştirme durumu değiştirilmedi.
- Bu tek denemede düz şema bütün rapor alanlarını üretti. Rapor `report_invalid_event_time` kontrolünde durdu; metin yayımlanmadı. Yeni bir canlı üretim tekrarlanmadı.
- Ardından olay zamanı şemasına saat ve zaman dilimi zorunluluğu eklendi; sadece gün biliniyorsa null isteniyor. Kaynak yayın zamanı gözlem zamanı yerine yazılmıyor.
- Ayrı bir araştırma kesiti hatası düzeltildi: veri kesiti artık ağ sorgularının başlangıcı yerine bitişini gösteriyor. Böylece bu çalıştırmada birkaç saniye sonra alınan spot kotasyonlar yanlışlıkla gelecekte sayılmıyor; ileri zamanlı kaynak saati kesiti ileri itemiyor. İki durum birim testleriyle kapsandı.
- Son durum: başarılı gerçek önizleme **henüz yok**; Telegram testi **yok**; otomasyon **kapalı**. Son tarih düzeltmesinin tam canlı üretim doğrulaması bekliyor.

## Tarih düzeltmesi için ayrıca onaylanan tek deneme

- Kullanıcının **evet** yanıtıyla bir tek ek, mesaj göndermeyen canlı deneme yapıldı. Yalnızca teslimatsız `research_failed` kaydı, beklenen revision ve deneme sayısı koşullarıyla bir hak için güncellendi.
- Sonuç: sağlayıcı **400 / json_validate_failed**; uygulamada `model_invalid_json`. Geçerli rapor oluşmadı. Bu onay kapsamında başka model çağrısı yapılmadı.
- Bundan sonraki başarısız üretimlerde, boyutu sınırlı ve JSON olarak ayrıştırılabilen reddedilmiş taslak ile kaynak kanıtları **özel** başarısızlık kaydında tutulur. Böylece yeni üretim çağrısı harcamadan hata çevrimdışı incelenebilir. Bu özellik son başarısız çağrıdan sonra eklendiğinden önceki taslağı geri getirmez.
- `GET action=failure` yalnız mevcut scheduler sırrıyla okunabilir. Normal durum/önizleme yanıtına tanılama taslağı eklenmez; kayıt `research_failed` kalır, `report` alanına konmaz, test gönderimi için kullanılamaz. Bu ayrım regresyon testleriyle doğrulandı.
- Mevcut durum hâlâ **tamamlanmadı**: gerçek önizleme ve kullanıcıya metin gösterimi yok; Telegram gönderimi yok; zamanlayıcı kurulumu/etkinleştirme yok.

## Düz metin akışı ve 6 Kasım incelemesi (en güncel durum)

- Modelden JSON istenmesi kaldırıldı. Düz metindeki etiketler eksik/tekrarlıysa, kaynak kimliği/URL veya sayısal iddia üretilirse taslak reddedilir. Sayılar yalnız model girdisinde maskelenir; kaynak kanıtı korunur. Özgün tarihler ve takvim koddan gelir. Nihai kelime bütçesi gerçek başlık/kaynak/eksik kapsamı ölçülerek belirlenir.
- 6 Kasım'ın üç günlük deneme hakkı kullanıldı; sayaç sıfırlanmadı. İlk taslak içerik kontrolünde durdu. Sonraki iki gerçek üretim biçim doğrulamasını geçti; fakat editöryel inceleme destek/baskı yönü ve doğrulanmamış değişim ifadeleri buldu. Bu raporlar gönderime onaylanmadı.
- İki `ready` kayıt, revision/gün/phase/teslimatsızlık koşullarıyla, raporları özel ret kopyalarında korunarak `research_failed` durumuna alındı. Üç deneme sayısı değiştirilmedi. Ret kopyasının sonraki sınırlı denemede korunması regresyon testiyle kontrol edilir.
- Production `MACRO_MODEL=openai/gpt-oss-120b` eklendi; gerçek durum sorgusu modelin erişilebilir olduğunu doğruladı. Yeni hizmet/ücretli plan satın alınmadı. Erişilebilirlik ücretsiz kullanım garantisi değildir.
- Son kodda model yalnız **iki bülten özeti + bir koşullu aktarım paragrafı** üretir. Reel getiri kesiti hakkında değişim çıkarılamayacağı ve BTC/altın destek–baskı–teyit–bozulma koşulları kod tarafından belirlenir. Bunlar günlük gerçekleşmiş piyasa hareketi değil, açıkça etiketlenmiş koşullu bir çerçevedir; eski rapor veya başarısız model cümleleri sessizce yedeklenmez.
- Son kodla **457 kelimelik, beş kaynaklı yerel inceleme önizlemesi** derlendi: gerçek 6 Kasım 16:12 TSİ üretiminin kaynakları ve ilk bülten paragrafları kullanıldı. Yeni model/araştırma çağrısı yapılmadı. Bu belge yeni bir canlı üretim, güncel gönderim kaydı veya uçtan uca başarı olarak sunulmaz; belgenin üstünde bu ayrım açıkça yazılıdır.
- **Kalanlar:** son üç-paragraflı akışın yeni güncel kaynaklarla canlı doğrulaması; önemli takvim/seçim/ETF/teyit kapsamı eksikleri; onaylı Telegram testi; Vault/zamanlayıcı kurulumu; ayrı otomasyon etkinleştirmesi. Otomasyon kapalıdır; mesaj gönderilmedi.

## 6 Kasım 22:38 TSİ canlı önizleme — son durum

- Kullanıcının “Tek önizlemeyi üret” onayıyla kaynaklar yeniden alındı. İlk istek model çağrısından önce `insufficient_fresh_evidence` ile durdu: çalışma sırasında alınan gözlemler başlangıç saatine göre yanlışlıkla gelecekte sayılıyordu. Güncellik kapısı araştırma bitiş kesitine taşındı; `freshCount` ile `freshNewsCount` ayrıldı. Erişim zamanı eski haberi yeni yapmaz; BLS referans ayı yayın tarihi değildir.
- Hata/grant/revision/gün/phase/teslimatsızlık koşulları doğrulandıktan sonra yalnız bir kez `preModelRefund:true` ve gerekçesi kaydedilerek model öncesi tüketilen hak iade edildi. Tek devam isteği HTTP 200 ve `ready` üretti. Yeni üretim tekrarlanmadı.
- Gerçek metin Review'da gösterildi. Editöryel inceleme modelin risk iştahı artışını spot altın için de olumlu genellemesini kabul etmedi. Rapor gönderime onaylanmadı; revision/rapor hash/phase/teslimatsızlık koşullarıyla `research_failed` yapıldı. Günlük sayaç üçte kaldı; güncel ret kopyası ve önceki ret geçmişi korundu.
- Resmî Ekim BLS API verileri, iki tarihli Hazine reel/nominal karşılaştırmaları, tarihli IBIT varlık/pay dosyası ve yalnız Solano County kapsamlı geçici sayım desteği eklendi. IBIT varlıkları net akış değildir. İsteğe bağlı Farside ayrıştırıcısı eksik hücreleri, eski/tekrarlı günleri ve tutarsız toplamları reddeder; sunucuda erişim 403 olduğundan net akış teyidi yoktur.
- BLS takvimi için resmî HTML yedeği ve New York yaz/kış saati dönüşümü test edildi; canlı sunucuda takvim kapsamı eksik. AP/Reuters doğrudan teyidi, ulusal seçim kesinleşmesi ve ETF net akışı doğrulanmadı. Son kaynak tanılamasında `freshCount:2`, `freshNewsCount:0`; gözlem kesitleri yeni haber diye sunulmadı.
- Önizleme öncesi **154/154 test** geçti. Teknik üretim başarısı editöryel kabul veya teslimat kanıtı değildir. **Telegram mesajı/testi yok; otomasyon kapalı; Vault/zamanlayıcı kurulmadı.** Yeni model denemesi veya gönderim için yeniden açık onay gerekir.

## Etki kanalı düzeltmesi — prose-v3

- Model artık yalnız iki kaynak özeti üretir. Etki kanalları uygulamaya taşındı; BTC likidite/faiz-dolar ilişkisi ile altının reel faiz/dolar ve güvenli liman kanalları ayrılır. Risk iştahı artışı altına otomatik destek sayılmaz. Bu genel koşullar günün gerçekleşmiş piyasa tepkisi değildir.
- Eski `channels` model alanı ve özetlerin içine BTC/Bitcoin, kripto, altın veya XAUUSD yorumu sokulması tüm taslağı reddettirir; model cümlesi sessizce düzeltilmez. Gerçek reddedilen paragraf ve benzeri ifadeler regresyon testine eklendi.
- Kapsam açıklamaları korunarak tekrar eden takvim/teknik hedef ifadeleri kısaltıldı. Önceden alınan gerçek araştırma kesitiyle ve iki korunmuş üretim özetiyle çevrimdışı doğrulama: **536 kelime, 6 kaynak, sıfır yeni model çağrısı**. Bu yeni uçtan uca canlı araştırma/üretim kanıtı değildir.
- Ayrı etiketli editöryel önizleme Review'da gösterildi; asıl reddedilmiş rapor değiştirilmedi. Günlük hak artırılmadı. **155/155 test** başarılı. Telegram testi ve otomasyon ayrı onay kuralı nedeniyle kapalı; görevin tümü etkinleştirilmiş olarak sunulmaz.

## 7 Kasım 09:36 TSİ — prose-v3 gerçek canlı önizleme

- Yeni İstanbul gününde normal günlük hakla **bir** mesaj göndermeyen üretim yapıldı; sayaç bakımı/iade yok. Korumalı `status` ve `preview` HTTP 200 döndü; rapor `ready` oluştu. Kaynaklar yeniden alındı; bu kez çevrimdışı derleme değil gerçek üretimdir.
- **523 kelime, 6 gerçek kaynak.** Ekim BLS referans dönemi özeti ile 6 Kasım/5 Kasım Hazine reel getiri karşılaştırması ayrı etiketli; yayın saati uydurulmadı. Altın etki kanalı koddan geliyor ve risk iştahını otomatik destek saymıyor. Editöryel kontrolde önceki hata tekrarlanmadı.
- IBIT dosyası 5 Kasım varlık/pay kesitidir, net akış değildir. Seçim sayımı yalnız Solano County kapsamındadır. Takvim, Reuters/AP, DXY ve net akış eksikleri metinde açıkça korunur; tüm araştırma kapsamının tamamlandığı iddia edilmez.
- Gerçek rapor Review'da kullanıcıya açıldı. Hedef yeniden **Alfa Traders Public / supergroup / alfatraderspublic**, mevcut konu geçerli olarak doğrulandı. **Telegram mesajı yok; otomasyon kapalı.** Onaylı test ve ayrı etkinleştirme yapılmadığından sistem otomatik teslimata alınmış değildir.

## 7 Kasım 09:39 TSİ — onaylı Telegram testi

- Kullanıcının “olur” test onayı ve site yönetici oturumu açılması sonrasında, gösterilen raporun hash'i ve Alfa Traders Public hedef parmak izi eşleştirildi. Rapor 15 dakikalık geçerlilik aralığındaydı; teslimat kaydı boş ve durum `ready` idi.
- Mevcut yönetici kimlik doğrulaması üzerinden `macro-test-send` **bir kez** çağrıldı. HTTP 200, `phase:sent`, **2 parça**. Sonraki salt okunur durum kontrolü iki parçanın da `sent` olduğunu ve her birinin Telegram message id teyidinin kalıcı kayda yazıldığını doğruladı. Test etiketi ilk parçada bulunur; bugünün günlük gönderimi tüketildi, tekrar gönderilmeyecek.
- `tested:true`, `targetApproved:true`, **enabled:false** doğrulandı. Test tamamlandı; günlük otomasyon ve Vault/zamanlayıcı kurulumu hâlâ ayrı etkinleştirme aşamasıdır. Anahtarlar, hedef id'si veya mesaj id değerleri bu belgeye konmadı.

## 7 Kasım — tek mesaj ve Alfa Makro konusu

- Kullanıcı son düzeltmesinde yalnız `https://t.me/alfatraderspublic/772` konusunu istedi; önceki `/434` seçimi kullanılmaz. Production'a yalnız `MACRO_TARGET_THREAD=772` eklendi. Portföyün `TG_THREAD`, hedef/bot ve webhook ayarlarına dokunulmadı.
- Yeni raporlar tek Telegram mesajıdır. Tam metnin kaynak URL satırları `text_link` entities ile tıklanabilir “Kaynağı aç” etiketlerine dönüştürülür. İçerik ve gerçek kaynak adresleri korunur; parse_mode/HTML açılmaz. 3900 UTF-16 üst sınırı, test öneki için boşluk ve etiket sonrası doğru kaynak offset'leri kontrol edilir. Eski çok parçalı hazır rapor da artık gönderilemez.
- Gerçek 09:36 metniyle yalnız biçim doğrulaması: **3789 karakter, test etiketiyle 3804, 529 görünür kelime, 6 bağlantı, tek mesaj**. Yerel HTML önizleme oluşturuldu; yeni model/araştırma çağrısı veya Telegram mesajı yoktur. Önceki iki parçalı test silinmedi veya yeniden gönderilmedi; günlük `sent` kaydı korundu.
- **161/161 test** geçti: Unicode/UTF-16 bağlantıları, tek mesaj üst sınırı, eski çok parçalı taslağın engellenmesi, tek çağrı/kalıcı teslim teyidi ve yalnız makro konu override'ı kapsanır. Hedef parmak izi konu değişince farklı olduğundan eski test onayı yeni hedefe geçmez; otomasyon kapalı tutulur.
- Canlı dağıtım `READY`; son korumalı durum HTTP 200, `topicUrl:https://t.me/alfatraderspublic/772`, `warning:null`, `enabled:false`, `tested:false`, `targetApproved:false`. Önceki günlük kayıtta iki eski teslimin `sent` durumu değişmedi. Yeni konuda teslim yapılmış olduğu iddia edilmez.

## 7 Kasım — sunucu zamanlayıcısı kuruldu, gönderim kapalı

- Kullanıcı Supabase yönetici oturumunu açtı. Salt okunur ön kontrolde `enabled:false`, Vault scheduler secret sayısı sıfır, `pg_cron`/`pg_net` henüz kurulu değil olarak doğrulandı.
- Mevcut özel scheduler anahtarı değerini çıktı/SQL içine yazmadan Supabase Vault arayüzünden `alfa_macro_trigger` adıyla saklandı. Vercel anahtarı, mevcut bot ve diğer sırlar değiştirilmedi; plan satın alınmadı.
- Tek transaction içinde kapalı ayar/tek Vault secret güvenlik koşulları, `pg_cron`, `pg_net`, UTC zaman dilimi kontrolü ve adlandırılmış `alfa-macro-0900-istanbul` görevi uygulandı. Metadata sonucu: `0,15,30 6 * * *`, active true. Görevin SQL koşulu **enabled false iken HTTP isteği bile başlatmaz**; aktif cron kaydı otomatik mesaj izni demek değildir.
- Supabase `pg_net` üzerinden Vault kimlik doğrulamasıyla Vercel'in yalnız `action=status` ucu bir kez çağrıldı. Kalıcı yanıt: **HTTP 200, timeout false, enabled false, storageReady true, target topic /772**. Bu bulutlar arası erişim ve credential eşleşmesi kanıtıdır; Telegram teslimi veya zamanlanmış üretim kanıtı değildir.
- Site/PC/sohbet günlük çalışmada gerekli değildir; hesapların ve Supabase/Vercel hizmetlerinin çalışır olması gerekir. Yeni konu için test ve ayrı etkinleştirme tamamlanmadığından otomatik gönderim **kapalı** kalır; günlük `sent` kaydı sıfırlanmadı.
- Kurulum ve UTC/kapalı ayar/Vault güvenlik koşulları için testler eklendi. En güncel toplam **163/163** testtir.
- Vault/Vercel eşleşmesi doğrulandıktan sonra ajanın oluşturduğu yerel geçici scheduler anahtar dosyası silindi. Çalışma sırrı yalnız yönetilen Vercel/Vault ayarlarında kaldı; tarayıcıdaki kurulum formu kapandı.

## 7 Kasım 09:59 TSİ — kullanıcının istediği /772 tek mesaj kopyası

- Kullanıcı “bugünkünü ilgili kısma gönder” diyerek, daha önce gösterilen bugünkü raporun yeni `/772` konusuna ek kopyasını açıkça istedi. 09:36 kaynak kesiti artık taze gönderim penceresinin dışındaydı; tarih değiştirmek veya yeni araştırma gibi sunmak yerine **bugünkü arşiv raporunun kopyası** olarak açıkça etiketlendi. Yeni model çağrısı yapılmadı.
- Mevcut admin oturumu üzerinden ayrı `macro-topic-copy` işlemi uygulandı. Bu işlem yalnız aynı günün daha önce `sent` olmuş raporunu farklı konuya, kaynak/rapor/target hash eşleşmesi ve açık kopya onayıyla bir kez gönderebilir. Günlük satır/sayaç/ilk teslim kayıtları sıfırlanmadı. Ayrı `topicCopies` CAS kaydı ağ çağrısından önce `sending` yazılır; belirsiz teslim veya ack commit kaybında yeniden gönderim engellenir.
- Gerçek sonuç: **HTTP 200, sent, tek mesaj**, hedef `https://t.me/alfatraderspublic/772`. Son durum sorgusu kopyanın kalıcı message id teyidini, `tested:true`, `targetApproved:true` ve **enabled:false** durumlarını doğruladı. Özgün günlük satır ve iki ilk teslim `sent` kaldı.
- **168/168 test** başarılı; paralel kopya talepleri, yanlış gün/hedef/onay, belirsiz teslim ve ack commit kaybı test edildi. Yeni konu teslim testi tamamlandı; otomasyon ayrıca açılmadı.

## 7 Kasım — akıcı analist sunumu

- Kullanıcı, yorucu madde/kaynak sunumunu kaldırıp güncellenen verilerin olası etkilerini analist yazısı gibi anlatmamızı istedi. Yeni `narrative-v1` biçimi başlık/veri saati ve dört paragraftır; kaynak künyeleri, URL'ler, köşeli atıflar ve destek/baskı/teyit alt listeleri mesajda görünmez.
- Özgün kaynak/URL, dönem/saat, sayısal kanıt, seçim kapsamı, takvim ve eksik veri doğrulaması korunur. Kaynaklar ile eksikler rapor metadata'sındadır. Model iki olgusal giriş özeti üretir (`prose-v4`); BTC/altın aktarım ilişkileri uygulamaya aittir. Reel getiri yönü saklanan iki gözlemle yeniden doğrulanır; nominal faizle karıştırılmaz. Eksikler kısa bir bağlam paragrafına dönüşür; eksik veri için olmuş piyasa hareketi uydurulmaz.
- Daha önce kaydedilen gerçek 09:36 kesiti ve o verilerden yazılan editöryel girişle **yerel üslup önizlemesi** oluşturuldu: **366 kelime, 2908 karakter, tek mesaj; 6 arka plan kaynağı, sıfır görünür kaynak bağlantısı**. Bu yeni canlı araştırma/model üretimi değildir. Review'da etiketli gösterildi; Telegram'a ek mesaj gönderilmedi ve önceki `sent` kayıtları değiştirilmedi.
- **172/172 test** başarılı: kaynak görünümü kalksa da provenans/yanlış sayı/yanlış reel yön kontrolü, kaynak ve madde sızıntısı olmaması, tek mesaj teslimi ve nominal/reel ayrımı kapsanır. Son biçimin yeni bir uçtan uca model çağrısı bu kullanıcı isteği kapsamında yapılmadı.

## 7 Kasım — sabah + olay odaklı akış

- Kullanıcının “yap bakalım” isteğiyle sabah özeti, kritik veri öncesi beklenti, doğrulanmış veri sonrası görüş karşılaştırması ve anlamlı revizyon takibi uygulandı. Kullanıcıya yeni bir Telegram mesajı veya otomatik etkinleştirme yapılmadı.
- `004_macro_events.sql` canlıda uygulandı. `alfa_macro_events` ve `alfa_macro_updates` RLS açık; anon SELECT yetkileri **false** doğrulandı. Eski günlük `sent` satırı değişmedi. Üç cron kaydı: sabah 06:00/06:15/06:30 UTC, takvim 06/12/18 UTC, olay kontrolü her beş dakika. İki izin de **false** olduğundan tetikler gerçek gönderime başlamaz.
- Beklenti, resmî etkinlik saatiyle tam eşleşen ve açıklama öncesinde alınan ekonomik takvim kesitidir. Açıklama sonrası yakalanan veya 36 saatten eski beklenti karşılaştırmaya alınmaz; boş değer sıfır değildir. Olay sonrası sonuç resmî BLS açıklama/API ya da BEA açıklamasıyla kontrol edilir. Veri dönemi, GDP açıklama aşaması, aylık/yıllıklandırılmış birim ve çekirdek/manşet ayrımı testlidir. Gerçek zamanda yayımlanan bir kritik açıklamanın bu akışla uçtan uca teslimi henüz yapılmadı; testler yapay/sabitlenmiş kaynak örnekleridir.
- İlk yeni-sabah üretimi `report_word_limit` ile durdu; modelin kısa ve muğlak veri cümlesi gönderilmedi. Bu özel önizleme denemesi audit kopyasında korundu. Sabit aylık göstergeler doğrudan doğrulanmış sayısal gözlemlerden oluşturulacak şekilde düzeltildi; modelin “gerilim hafifledi” gibi ek yargısı yeniden kullanılmadı.
- İkinci özel önizleme yalnız yapılandırılmış gözlemler şartıyla, model fallback'i kapalı olarak araştırmayı **yeniden** yaptı: **HTTP 200, ready, 7 Kasım 11:09 TSİ, 133 kelime, 6 arka plan kaynağı, model:null, verified-observations-v1**. Dağıtım sonrası aynı yol bir kez daha **11:48** için doğrulandı: HTTP 200, 133 kelime, `morning-v2`, model:null; mesaj gönderilmedi. İşsizlik/istihdam sayıları referans ayıyla doğrulandı; reel faiz gözlem tarihi açık yazıldı. Önceki `09:36` raporunun yerel yeniden yazımı değildir. Günlük sayaç/teslimler sıfırlanmadı. Yeni önizleme tablosunda attempts 2 ve priorFailures 1 doğrulandı.
- Canlı takvim yenilemede **BEA erişimi var**, BLS ICS/liste/ay görünümü sunucuda doğrulanamadı; ileri yedi günde kuyruğa eklenen destekli olay sayısı **0**. İkincil takvim saatleri resmî saat yerine geçirilmedi. TÜFE/istihdam otomatik kapsamı tamamlanmış sayılmaz; takvim erişimi çözülmeden bütün akış için tamamlandı/aktif iddiası yoktur.
- Aynı aylık gözlemler ve reel faiz karşılaştırması tekrarlanırsa kısa devam notu; yeni önemli tarihli politika haberi varsa önce o seçilir. Değişmeyen sonuç, yeni HTTP saati veya küçük ve görüşü değiştirmeyen düzeltme takip mesajı doğurmaz. Belirsiz Telegram yanıtı/ack commit kaybında kör retry yoktur.
- **202/202 test** başarılı: örnek resmî kaynaklar, anlık beklenti kaydı, eski/yeni dönem ve mevsimsel düzeltme, GDP aşaması, çelişkili sürprizler, eşzamanlı işçiler, sınırlı araştırma/backoff, belirsiz teslim, önizleme izolasyonu, küçük revizyon sessizliği, aylık veri tekrarı ve sayısal kanıt kontrolü kapsanır.

## 7 Kasım 12:23 TSİ — takvim sondası, ikincil saat ve BLS API-only doğrulama

- Kullanıcının Investing TR / Forex Factory sorusu üzerine yalnız sabit adresleri denetleyen yönetici `macro-calendar-probe` eklendi. Çıktı yalnız host, HTTP durumu, bayt ve süre içerir; çağırandan URL almaz, sayfa gövdesi döndürmez.
- Canlı sonda (Vercel): BLS ICS/liste/ay görünümü/açıklama sayfası **403**; BLS API **200** (3163 bayt). BEA ICS **200** (43.459 bayt), BEA güncel açıklamalar **200** (58.927 bayt). Forex Factory JSON **200** (15.780 bayt); Forex Factory HTML ve Investing TR **403**. Yani zaman/beklenti için yalnız FF JSON, sonuç için BLS API + BEA açıklamaları kullanılabilir.
- İkincil saat desteği eklendi: resmî BLS veya BEA takvimi alınamazsa FF JSON’dan yalnız desteklenen ABD göstergeleri (istihdam/işsizlik, manşet+çekirdek TÜFE, manşet+çekirdek PCE, GDP aşaması) ve yalnız başarısız kurum için saat türetilir. Saat `secondary_calendar` olarak işaretlenir, mesajda “yaklaşık olabilir, resmî saat diye sunulmaz” denir, aynı gün için çelişen saat reddedilir. Resmî saat varsa ikincil akış hiç okunmaz ve resmî saati geçersiz kılamaz. Admin olay listesi bu kayıtları `· ikincil saat` olarak gösterir.
- BLS açıklama sayfası 403 döndüğünde sonuç artık yalnız resmî API ile doğrulanabiliyor (`verification:api_only`). Yeni referans dönemi ve sayısal değerler yine zorunlu; eski dönem, dönem boşluğu veya geçersiz birim reddedilir. Veri sonrası mesaj “manşet metniyle çapraz kontrol yapılamadı” açıklamasını taşır. Açıklama sayfası erişilebilirse tam `release_and_api` çapraz kontrolü korunur; BEA sonuçları `release_and_api` olarak işaretlenir.
- Yeni testler: ikincil saatlerin yalnız desteklenen göstergeleri kapsaması, GDP aşaması/dönem koruması, çelişkili saat reddi, resmî takvim çalışırken ikincil akışın hiç okunmaması, ikincil saatli olayın sonuç doğrulamasında yine resmî kaynak istemesi, 403 + yeni API dönemiyle `api_only` başarısı ve eski API dönemiyle red. Toplam **209/209 test** başarılı; `assets/macro-admin.js` sözdizimi kontrolü geçti.
- Production dağıtım **READY**. Canlı `macro-agenda-refresh`: BEA erişilebilir, BLS 403, kuyruğa eklenen olay **0**, ikincil saat **0**, saat çelişkisi yok. FF JSON “thisweek” yalnız içinde bulunulan haftayı kapsadığından cumartesi günü gelecek haftanın olayı yoktur; bu, uçtan uca olay tesliminin kanıtı değildir.
- Son durum: günlük rapor `sent` (09:36 kaydı korunuyor), günlük otomasyon **kapalı**, `eventUpdatesEnabled:false`, olay gönderimi **0**, yeni Telegram mesajı **yok**. Etkinleştirme ayrı ve açık onay gerektirir.

## 7 Kasım 12:30 TSİ — kullanıcı onayıyla otomasyon açıldı

- Kullanıcı “hepsini yapalım” yanıtıyla hem günlük sabah özeti hem olay güncellemeleri için açık onay verdi. Mevcut hedef parmak izi ve test kaydı eşleştiği için ayrı bir test gönderimi yapılmadı.
- `macro-enable` ve `macro-events-enable` yönetici işlemleri HTTP 200 döndü: günlük `enabled:true`, olay `enabled:true`, `configured:true`, `requiresDailyEnable:false`. Hedef yine **Alfa Traders Public / /772**.
- Etkinleştirme anında mesaj gönderilmedi: bugünün sabah penceresi (06:00–07:00 UTC) geçmişti ve günlük kayıt zaten `sent` durumundaydı; olay kuyruğu **0** olduğu için beş dakikalık tetik gönderecek olay bulamıyor. Mevcut 09:36 günlük teslimatı ve `/772` kopyası korunuyor.
- Sıradaki otomatik sabah çalışması yarın 06:00 UTC (09:00 TSİ) penceresindedir. Takvim 06/12/18 UTC’de yenilenecek; FF JSON yeni haftayı kapsadığında BLS ikincil saatleri kuyruğa girebilir. Gerçek bir veri açıklamasında uçtan uca olay teslimi hâlâ denenmedi.
- BLS takvimi 403 olduğu sürece olay saatleri ikincil kaynaktan, sonuçlar resmî BLS API’den doğrulanacak; açıklama sayfası engeli mesajda belirtilecek. BEA olaylarında resmî açıklama kullanılmaya devam eder.

## Dosyalar

- Değişen: `api/ai.mjs`, `api/tg.mjs`, `index.html`, `sw.js`.
- Ortak Telegram: `lib/telegram.mjs`.
- Yeni sunucu modülleri: `lib/macro/core.mjs`, `research.mjs`, `report.mjs`, `store.mjs`, `target.mjs`, `job.mjs`, `handler.mjs`.
- Admin arayüzü: `assets/macro-admin.js`, `assets/macro-admin.css`.
- Özel tablolar ve zamanlayıcı: `supabase/site/002_macro.sql`, `supabase/site/003_macro_schedule.sql`.
- Test: `tests/macro.test.mjs`.
- Belgeler: `docs/alfa-makro-analist.md`, `docs/macro-verification.md`.

Kurulum, maliyet ve resmi doküman bağlantıları: [alfa-makro-analist.md](alfa-makro-analist.md).
