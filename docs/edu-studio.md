# Alfa Edu · İçerik Stüdyosu

## İki ayrı akış

- **Günlük Notlar:** ana sayfada ve eğitim sayfasında herkese açık paylaşım akışı. En yeni not büyük **Günün yazısı** kartı, sonraki notlar küçük kartlar olarak gösterilir. Telegram’daki kaynak yönetici gönderileri onay/taslağa alma olmadan buraya gelir. Ücretsiz/ücretli eğitimlerden ve paketlerden bağımsızdır.
- **Eğitim İçerikleri:** kanal → bölüm → konu → not/video ağacı. Mevcut ücretsiz dersler ve paid gating korunur; günlük akış bunlara yazmaz.

## Kullanım

1. Gerçek yönetici hesabıyla menüden **İçerik Stüdyosu** veya doğrudan **`?page=edustudio`**. Analitik/admin panelinde de kısayol bulunur.
2. Stüdyo iki sekmeyle açılır: **Günlük Notlar** (varsayılan) ve **Eğitim İçerikleri**. İstediğin tarafta kal; sayfa yenilense de seçim korunur.
3. **Günlük Notlar** sekmesinde otomatik gelen notlar listelenir. **Düzenle**, **Yayından kaldır / Yayınla**, **Yayındaki notu aç** ve **＋ Ana sayfaya günlük not** işlemleri buradadır. Liste tam metni/görselleri açılışta çekmez; editör açılınca yükler.
4. **Eğitim İçerikleri** sekmesinde kanal ve bölüm seç; **+ Bölüm**, **+ Konu**, **+ Not / + Video** ile dersleri yönet. YouTube bağlantısı isteğe bağlıdır; açıklama, trickler, görseller ve ek videolar aynı derste saklanır.
5. Açıklama/trick alanına **Ctrl+V** ile görsel yapıştır, forma dosya sürükle veya fotoğraf satırında dosya seç. Görsel altyazısı ve metin içindeki konumu düzenlenebilir.
6. **Kaydet** veya **Ctrl/Cmd+S**. Editör başarıdan sonra da açık kalır; tekrar kaydetmek aynı içeriği günceller, ikinci kopya oluşturmaz. Sunucu onaylamazsa yazı, görseller ve cihaz taslağı korunur.

Stüdyoda öğrenci değerlendirmesi, video oynatıcı veya paket satış kartı bulunmaz. Öğrenci değerlendirmeleri gerçek adminin öğrenci görünümünde de yüklenmez; üyelerdeki değerlendirme akışı korunur.

## Günlük not editörü, ana sayfa ve eğitim sayfası

- Editör açıkça **HERKESE AÇIK · Günlük Notlar · Ücretli derslerden bağımsız** etiketini taşır. Fiyat, paket ve video alanları gizlidir.
- Elle yazılan not stabil `draftId` ile aynı kaydı günceller. Kayıt sonrası editör açık kalır; ana sayfa listesi ve yönetim listesi birlikte yenilenir.
- **Yazıyı oku / Notu aç** artık ayrı sayfa veya dialog açmaz; Alfa Edu içindeki **Günlük Notlar** panelinde satır içi okuyucuyu açar. Okuyucuda kapat/listeye dön ve yönetici için **Stüdyoda düzenle** kısayolu vardır. Medya yüklenemezse not başlığı, açıklama ve varsa kaynak bağlantısı gösterilir; uydurma içerik üretilmez. Editöryal kaydedilmemiş önizleme modalı ayrı kalır.
- Ana sayfa ve eğitim sayfası aynı public feed’i kullanır; eğitim sayfası önce ilk dört notu gösterir. Her iki yüzde de ilk not **Günün yazısı** kartıdır, kalanlar kompakt listedir. Eğitim panelindeki **Önceki notlar** düğmesi eski notları sayfalayarak aynı listede getirir; tekrar eden kart eklenmez. Yalnız küçük özet indeksini çeker; tam metin ve görseller satır içi okuyucuda yüklenir. Feed cache 15 saniyedir; açık ana sayfa 60 saniyede bir, sekme odağında ve **Yenile** ile yenilenir. Eğitim paneli ayrı **Yenile** düğmesiyle zorla tazelenir.
- **Yayından kaldır** fiziksel silme değil, gizleme tombstone’udur. Not ana sayfadan ve public detay/görsel endpoint’lerinden düşer; **Yayınla** ile geri gelir. Stüdyoda düzenlenen veya kaldırılan notu geç Telegram tekrarı geri almaz.
- Var olan kurs günlükleri ve ücretli içerikler değişmez; yeni günlük paylaşımının oluşturulduğu yer artık günlük feed’dir. Kurs oynatıcı açıkken eğitim sayfasındaki günlük paneli gizlenir.

## Eğitim ve yönetici görünümü

- Premium/ref üye eğitim sayfasında varsayılan olarak **Sana açık** görünümünü görür: kendi açık/premium eğitimleri önce, ilerleme yalnız bu derslerin üzerinden hesaplanır. Kilitli içerik varsa **Pakete özel** sekmesi seçenek olarak durur; ücretsiz üyede bu sekme paketleri gösterir. Kilitli görünüm boşsa sekme gizlenir, paket seçeneği hero ve stüdyo bağlantısıyla kalır.
- Kartlarda kaç açık/kilitli ders olduğu ve eğitmen adı net yazılır; paket kartı yalnız ücretsiz karşılaştırma sayfasına götürür, ders içeriği veya erişim kodu içermez.
- Gerçek yönetici eğitim kataloğunda **Bölüm adını düzenle** araç çubuğunu görür. Bölüm seçilip düğmeye basılınca mevcut `sec-edit` akışı açılır; başlık değişir, `access` ve `plans` korunur, paid gating bozulmaz. Aynı işlem stüdyodaki **Bölümü düzenle** ile de yapılabilir.
- Yönetici analitik sayfası üstte tek tıkla kısayollarla açılır (İçerik Stüdyosu, Günlük Notlar, Eğitim Paketleri, Başvurular, Üye Erişimi, Uygulamalar). Büyüme özeti, günlük görüntüleme grafiği ve öneriler **Büyüme & grafikler** başlığı altında katlanır; KPI kartları ve kısayollar açık kalır.

## Telegram → Ana Sayfa / Günlük Notlar

Kaynak varsayılanı: **`https://t.me/alfakasim/4`** (`@alfakasim`, konu/thread `4`).

- Mevcut botun grupta yönetici olması ve mevcut webhook’un `message / edited_message` güncellemelerini alması gerekir. Bu çalışma botu gruba eklemez, Telegram izinlerini veya webhook ayarını değiştirmez. **Üretimde üyelik/mesaj alma doğrulanmadı.**
- **Bağlantıyı kontrol et** gerçek bot kullanıcı adını, kaynak gruptaki yönetici rolünü ve bu siteye kayıtlı webhook’u salt okunur kontrol eder. Kurulum eksikse “bağlı” denmez.
- Yalnız kaynak konudaki yönetici/izinli göndericiler alınır. Normal üyeler, diğer gruplar/konular, bot mesajları ve `/` komutları aktarılmaz. Anonim grup yöneticisi gönderimleri desteklenir. Geçersiz kaynak yapılandırması fail-closed olur.
- Yeni paylaşımlar **doğrudan yayınlanır**; “taslağa al → onayla → kaydet” adımı yoktur. Aynı mesajın tekrarı veya düzenlemesi stabil `edutg_<sha256>` kaydını günceller; ikinci kopya oluşturmaz. Eski `edit_date` yeni sürümü geri alamaz.
- DB/index yazımı başarısızsa webhook retriable `503` döner; başarı gibi işaretlenmez. Yarış durumlarda CAS ve revision stamp’leri, geciken Telegram yazısının kaldırılmış/düzenlenmiş notu diriltmesini engeller.
- Telegram Bot API bu linkten geçmiş mesajları okuyamaz. Eski paylaşımlar kendiliğinden gelmez. Stüdyo açılırken yalnız kaynak URL’si doğrulanabilen şifreli eski kutu kayıtları yönetici JWT’li `sync-source` ile otomatik yayına alınır; doğrulanamayan özel taslaklar gizli kalır.
- Kullanılabilir en büyük Telegram varyantı (≤300 KB; `file_size` yoksa da denenir) token içermeyen raster veriye çevrilir ve aynı origin’den proxy edilir. Bir varyant indirilemezse diğerleri denenir; hiçbiri alınamazsa not yine yayında kalır ve görsel eksikliği açıkça işaretlenir. JPEG/PNG/WebP kabul edilir. Raw bot dosya URL’si/token’ı hiçbir public cevaba yazılmaz.
- Anonim public GET yalnız whitelist alanları döner: liste `view=daily-notes`, detay `&note=<id>`, görsel `&photo=<id>&n=<index>`. Özel alanlar, edit verisi ve legacy kutu kayıtları public tarafta görünmez.
- Yönetim listesi (`view=telegram-inbox`), tek not açma (`&manage=<id>`) ve tüm yazımlar gerçek admin JWT ister; anonim istek `401`, üye isteği `403` alır. Preview bu uç noktaları salt okunur public whitelist ile sınırlar, hiçbir yazıma izin vermez.

## Alfa News dergisi

- Alfa News kanalındaki konular artık içeriğe göre ayrılır: `BTC -HTF` gibi paylaşımlar **BTC Bias**, `Makro…` paylaşımları **Makro**, diğerleri **Haber**, `alfakasim/6` yazar akışı **Teknik Analiz** bölümüne gider. Aynı kategori listesi ingestion, public API, okuyucu rozetleri, içindekiler ve admin seçicisinde birlikte kullanılır.
- Gün içi işlem/sonuç içerikleri dergiye girmez: `+R` sonuç satırları, `long/short/entry/stop`, parite önekli işlem paylaşımları ve otomatik işlem sınıflandırması dergi girişinde elenir. Düzenlemede kategori ve kaynak bağlantısı da güncellenir.
- Telegram fotoğrafları public `images` alanına `/api/tg?magPhoto=<file_id>` proxy URL’si olarak gelir; admin ham kaydı da aynı proxy’yi kullanır. İlk iki görsel hemen, sonrakiler lazy yüklenir. Proxy 404/bozuksa kırık ikon yerine açıklayıcı yer tutucu gösterilir; Telegram hotlink ve bot token’ı public cevapta yer almaz.

## İşlem akışı

- İşlem grubunda eski “📢 Kanal / 📊 İşlem / 📡 Onchain & Bias” filtreleri ve eski kanal-işlem listesi kaldırıldı. Mentor akışı tek yüzeyde **İşlemler / Bias görüşleri / Analiz & Onchain / Sonuçlar** ayrımı ve kısa bir açıklama ile gösterilir.
- Kümülatif R eğrisi işlem grubunda premium üye ve yöneticiye gösterilmez; giriş/kayıt yüzeyindeki herkese açık önizlemede kalır. Ücretsiz üyeler işlem akışında eğriyi görmeye devam eder. Eğrinin dayanağı (aktarılan teyitli sonuçlar, bağımsız getiri iddiası olmadığı) notta yazılıdır.
- Mentor görselleri eksikse tekrar dene düğmesi gösterilir; yeni kayıtlarda görsel alınamaması akışı engellemez. Geçmiş Telegram mesajları Bot API ile okunamadığı için eski bir paylaşıma sonradan fotoğraf eklemek mümkün değildir; düzeltme yeni gönderiler için geçerlidir.

## Eğitim içerikleri, taslaklar ve önizleme

- Yazarken hesap ID’sine özel **IndexedDB cihaz taslağı** tutulur. Bu otomatik sunucu kaydı/yayınlama değildir; yalnızca kendi yazdığın editör verisidir, kanal yanıtı önbelleği değildir.
- Başka sayfaya geçip dönebilir veya sayfayı yenileyebilirsin. Başlık, açıklama, trick, görseller, altyazılar, ek videolar ve erişim seçimi geri açılır. Günlük not taslağında kanal/fiyat alanı aranmaz.
- **Kapat · taslağı sakla** içerik kaybetmeden editörü kapatır. **Taslağı sil** yalnız onaydan sonra cihaz taslağını kaldırır; yayındaki notu/dersi silmez.
- **Kaydedilmemiş taslaklar** listesinden diğer taslaklara dönülür. Konusu silinen not taslağı, seçilen başka konuya yeni not olarak aktarılabilir. Taslaklar hesaba ve bu tarayıcıya özeldir; başka cihazda görünmesi için **Kaydet** gerekir.
- Cihaza yazma başarısızsa “saklandı” denmez; sekme belleğinde korunur ve sekmeyi kapatmadan önce uyarı verilir. Görsel hazırlanırken veya kalıcı kayıt sürerken kapatma uyarısı vardır.
- Aynı hesap için gelen `SIGNED_IN / USER_UPDATED / TOKEN_REFRESHED` olayları editörü sıfırlamaz. Gerçek hesap değişimi/çıkışta taslak önce yakalanır; eski hesabın editörü, görselleri, modalı ve günlük listesi temizlenir. Geç dönen istekler hesap-epoch kontrolüyle eski veriyi geri koyamaz.
- Öğrenci görünümüne geçiş yazar formunu taşımaz/kapatmaz. Günlük editöründe kaydedilmişse public not açılır, kaydedilmemişse önizleme uyarısı gösterilir. Stüdyoya dönüşte kanal, bölüm, not ve kaydırma konumu korunur. Eşzamanlı yüklemeler tek isteği paylaşır; geçici ağ hatası mevcut çalışma alanını silmez.
- **İçeriği önizle** kaydedilmemiş içerikle, yalnız yazara görünen modal açar. **Yayındaki öğrenci görünümü** gerçekten kaydedilmiş notu açar; kaydedilmemiş not yerine başka bir dersi göstermez.
- Görseller editörde ve okuyucu/önizleme ekranında tıklama veya klavyeyle büyütülür. Modalda yakınlaştır/uzaklaştır, sığdır ve kapat kontrolleri; büyük görselde kaydırma ve doğal Escape kapanışı bulunur.

## Depolama ve sınırlar

- Kanal yazımı gerçek JWT ile doğrulanır. Kanal oluşturma/silme ve owner/editor yönetimi yalnız admin içindir; mevcut owner/editor yalnız yetkili olduğu kanalı güncelleyebilir.
- Kanal dışındaki eğitim yazımları da korunur: eski bölüm eşitlemesi ve özellik duyurusu yalnız admin JWT, shortlink oluşturma oturumlu kullanıcı JWT gerektirir. Anonim istemci bu rotalara yazamaz.
- Paid içerik, ilgili CRM paketi veya mevcut admin/ref erişimi olmayan okuyuculara gönderilmez. Kanal sahibi/editörü kendi tam derslerini okuyabilir.
- Admin/ref yanıtları dahil kanal belgeleri ortak localStorage’a yazılmaz; eski ortak cache silinir. Yalnız yazarın değişiklikleri hesap-kapsamlı cihaz taslağına alınır.
- Yetkili kayıtta bütün kanal belgesi sunucuda AES-256-GCM ile şifrelenir. Legacy belge okunur; manuel production migrasyonu yapılmaz. Yorum sistemi de şifreli belgeyi okuyabilir.
- Anahtar: `EDU_CHANNEL_SECRET || EDU_CRM_SECRET || ANALYTICS_SECRET || SUPABASE_SERVICE_ROLE`; ayrı anahtar/AAD namespace’i kullanılır. **Seçilen secret değişmeden saklanmalı**; değişiklik eski içeriği okunamaz kılar. Yazım için service role gereklidir.
- Supabase projesi değiştiğinde `SUPABASE_SERVICE_ROLE` yeni DB anahtarına döner; bu anahtar şifreleme sırrı olarak kullanıldıysa eski kayıtlar çözülemez. Bu yüzden kalıcı şifreleme sırları DB anahtarından ayrılır: kanal/günlük için `EDU_CHANNEL_SECRET`, ilerleme için `EDU_PROGRESS_SECRET`, CRM için `EDU_CRM_SECRET`, analitik için `ANALYTICS_SECRET`, pano için `PANO_SECRET`, mentor işlemleri için `MENTOR_TRADES_SECRET`, influencer içerik kütüphanesi için `INFLUENCER_CONTENT_SECRET`. Bunlar eski kayıtların şifrelendiği değeri taşır; DB erişimi için yeni service-role ayrı kullanılır.
- Günlük akış mevcut `edu_shared` içinde şifreli `edutg_<sha256>` satırları ve küçük `edudaily_index` özet satırı kullanır. En son 1000 not ve 2000 revision stamp tutulur; public cevap whitelist ile süzülür. SQL migrasyonu/yeni API function yoktur; mevcut `api/edu-shared?kind=channel&view=...` ve webhook genişletilmiştir.
- Öğrenci ilerlemesi ve tamamlama belgeleri mevcut `edu_shared` içinde şifreli `eduprog_<hmac(user.id)>` satırlarında tutulur. Yeni tablo/API function yoktur; `api/edu-shared?kind=progress` GET/POST JWT ister, `private, no-store` döner ve service role olmadan boş/uydurma veri üretmez. Satır AAD/scope’u `progress:<64hex>`’tir; secret zinciri `EDU_PROGRESS_SECRET || EDU_CHANNEL_SECRET || EDU_CRM_SECRET || ANALYTICS_SECRET || SUPABASE_SERVICE_ROLE` kullanır. Secret rotation eski ilerleme/sertifika satırlarını okunamaz kılar.
- Bu değişiklik DB’nin mevcut RLS politikalarını değiştirmez. Doğrudan Supabase yazma izinleri ayrıca kısıtlı tutulmalıdır; uygulama uç noktasındaki JWT kontrolü DB izinlerinin yerine geçmez.
- En fazla 10 görsel/içerik; kaynak dosya PNG/JPEG/WebP ve ≤10 MB; çözümleme ≤40 MP. Görseller 1400 px’e küçültülür, kodlanmış görsel ≤450 KB. Kanal/günlük kaydetme isteği ≤2.8 MB; boyut aşımında sessiz kırpma yerine hata gösterilir. Daha büyük arşivlerde görsel URL’leri kullanılabilir. Bölümde 200 konu, günlük bölümünde 1000 gün, konu/günde 200 içerik sınırı sessiz veri kesmek yerine açık hata verir. Aynı görsel URL’si iki farklı altyazı/konum için korunur.
- Paketlere özel YouTube bağlantısı uygulamada gizlenir; bu DRM değildir. Erişimi olan biri bağlantıyı paylaşabilir.
- Değişen immutable asset sürümleri: `/assets/admin-preview-policy.mjs?v=3` (`admin-preview.mjs` içinden), `/assets/admin-preview.mjs?v=4`, `/assets/site-new.mjs?v=4`, `/assets/site-new.css?v=6`. Taslak modülü `/assets/edu-author-drafts.mjs?v=1` değişmedi.

## Yerel doğrulama

`node --test tests/*.test.mjs`

`node scripts/preview-edu-studio.mjs`

Yerel sentetik ekranlar: `http://127.0.0.1:4319/?role=admin` ve `?role=reader`. Gerçek hesabı taklit etmez, Supabase’e veya Telegram’a yazmaz; kaydetmeler yalnız bellekteki sahte kayıtlardadır. Hata akışı için `window.syntheticFail = true` kullanılabilir.

Kontrol edilenler: video açıklama/görsel/trick roundtrip, mevcut ücretsiz dersler, JWT ve owner/editor sınırları, şifreleme ve bozuk belge fail-closed, kilitli okuyucu, Ctrl+V görseli, başarısız kayıtta formun korunması, 390/1440 px taşma ve görünüm düzeni.

Son tam test: **1027/1027 başarılı**. Yazma rotaları artık JWT ile korunur; ücretli öğelerde `locked` alanını sunucu yazar, istemci içerik boşluğundan kilit tahmin etmez. Ek kontroller: aynı hesap auth olayları, hesap-epoch / eşzamanlı yükleme / ağ hatası, günlüğün yalnız kayıtta oluşması, eski şifreli kanal formatı uyumu, webhook secret / kaynak / yönetici kontrolü, public günlük feed + detay + görsel whitelist, eski özel kayıtların sızmaması, admin-only yazımlar, kaynak doğrulamalı legacy sync, Telegram tekrarı/düzenlemesi ve CAS yarışlarında kaldırılan notun dirilmemesi. Sentetik tarayıcı testleri Telegram notunun manuel kayıt olmadan ana sayfada görünmesini, public satır içi okuyucuyu, eski not sayfalamasını, yönetici bölüm adı düzenlemeyi, stüdyodan düzenlemeyi, başarısız kayıtta taslağın korunmasını, reload sonrası geri açılışı, ikinci kayıtta kopya olmamasını, yayından kaldırınca ana sayfadan düşmesini, ücretli dersin değişmemesini ve 390/1440 px reader/admin kontrollerini kapsar. Production kontrolü yalnız salt okunur yapılır; gerçek ders, Telegram mesajı veya DB kaydı elle eklenmez.
