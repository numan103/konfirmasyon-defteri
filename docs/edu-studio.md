# Alfa Edu · Eğitmen Stüdyosu

## Kullanım

1. Gerçek yönetici hesabıyla menüden **İçerik Stüdyosu** veya doğrudan **`?page=edustudio`**. Analitik/admin panelinde de kısayolu bulunur. Kurs/paket kartlarının arasından geçmek gerekmez.
2. Kanal ve bölümünü soldan seç; **+ Bölüm** ile yeni ücretli/ücretsiz bölüm oluştur. Bölüm adını ve yeni içerikler için varsayılan erişimi düzenleyebilirsin.
3. **+ Konu** ile `OBO – TOBO` gibi bir konu aç.
4. **+ Not / + Video**: YouTube bağlantısı isteğe bağlı; açıklama, trickler, görseller ve ek videolar aynı derste saklanır.
5. Açıklama/trick alanına **Ctrl+V** ile görsel yapıştır, forma dosya sürükle veya fotoğraf satırında dosya seç. Görsel altyazısı ve metin içindeki konumu düzenlenebilir.
6. **Kaydet** veya **Ctrl/Cmd+S**. Not editörü başarıdan sonra da açık kalır; tekrar kaydetmek aynı içeriği günceller, ikinci kopya oluşturmaz. Sunucu onaylamazsa yazı ve form korunur.

Stüdyoda öğrenci değerlendirmesi, video oynatıcı veya paket satış kartı bulunmaz. Öğrenci değerlendirmeleri gerçek adminin öğrenci görünümünde de yüklenmez; üyelerdeki değerlendirme akışı korunur.

### Taslaklar

- Yazarken hesap ID'sine özel **IndexedDB cihaz taslağı** tutulur. Bu otomatik sunucu kaydı/yayınlama değildir; yalnızca kendi yazdığın editör verisidir, kanal yanıtı önbelleği değildir.
- Başka sayfaya geçip dönebilir veya sayfayı yenileyebilirsin. Başlık, açıklama, trick, görseller, altyazılar, ek videolar ve erişim seçimi geri açılır.
- **Kapat · taslağı sakla** içerik kaybetmeden editörü kapatır. **Taslağı sil** yalnız onaydan sonra cihaz taslağını kaldırır; yayındaki dersi silmez.
- **Kaydedilmemiş taslaklar** listesinden diğer taslaklara dönülür. Konusu silinen not taslağı, seçilen başka konuya yeni not olarak aktarılabilir.
- Taslaklar hesaba ve bu tarayıcıya özeldir. Başka cihazda görünmesi için **Kaydet** ile sunucuya kaydetmek gerekir. Tarayıcı verilerini silmek cihaz taslaklarını siler.
- Cihaza yazma başarısızsa “saklandı” denmez; sekme belleğinde korunur ve sekmeyi kapatmadan önce uyarı verilir. Görseller hazırlanırken veya kalıcı kayıt sürerken kapatma uyarısı vardır.
- Konu/içerik/bölüm silme onay ister; stüdyo değişiklikleri önce kopyada yapılır, başarısız sunucu kaydı mevcut listeyi bozmaz.

Ücretli bölüm erişimi **yeni içerikler için varsayılandır**. Var olan ücretsiz dersler ücretliye dönüştürülmez. Her içeriğin erişimi editörde ayrıca seçilebilir.

Öğrenci ekranında video + notlar / yalnız video / yalnız notlar seçenekleri bulunur. Dar ekranda video ve notlar alt alta gelir.

## Günlük notlar, gezinme ve önizleme

- **＋ Günlük not** seçili kanalda “Trader Günlüğü” için tarihli not açar. Günler İstanbul tarihine göre gruplanır; aynı günde birden fazla not olabilir. Bölüm/gün kayıtları yalnız başarılı **Kaydet** ile oluşur.
- İlk günlük güvenli varsayılan olarak ücretli açılır; sonraki notlar günlük bölümünün erişimini devralır. Yazar ücretsiz seçebilir. Var olan derslerin erişimi değişmez.
- Stüdyodaki arama konu başlığı, not başlığı, açıklama ve trick metninde çalışır.
- Aynı hesap için gelen `SIGNED_IN / USER_UPDATED / TOKEN_REFRESHED` olayları editörü sıfırlamaz. Gerçek hesap değişimi/çıkışta taslak önce yakalanır, eski hesabın editörü, görselleri, modalı ve Telegram kutusu temizlenir. Geç dönen istekler hesap-epoch kontrolüyle eski veriyi geri koyamaz.
- Öğrenci görünümüne geçiş yazar formunu taşımaz/kapatmaz. Stüdyoya dönüşte kanal, bölüm, not ve kaydırma konumu korunur. Eşzamanlı yüklemeler tek isteği paylaşır; geçici ağ hatası mevcut çalışma alanını silmez.
- **İçeriği önizle** kaydedilmemiş içerikle, yalnız yazara görünen modal açar. **Yayındaki öğrenci görünümü** gerçekten kaydedilmiş notu açar; kaydedilmemiş not yerine başka bir dersi göstermez.
- Görseller editörde ve öğrenci/önizleme ekranında tıklama veya klavyeyle büyütülür. Modalda yakınlaştır/uzaklaştır, sığdır ve kapat kontrolleri; büyük görselde kaydırma ve doğal Escape kapanışı bulunur.

## Telegram → günlük taslak kutusu

Kaynak varsayılanı: **`https://t.me/alfakasim/4`** (`@alfakasim`, konu/thread `4`).

- Mevcut botun grupta yönetici olması ve mevcut webhook'un `message / edited_message` güncellemelerini alması gerekir. Bu çalışma botu gruba eklemez, Telegram izinlerini veya webhook ayarını değiştirmez. **Üretimde üyelik/mesaj alma doğrulanmadı.**
- **Bağlantıyı kontrol et** gerçek bot kullanıcı adını, kaynak gruptaki yönetici rolünü ve bu siteye kayıtlı webhook'u salt okunur kontrol eder. Kurulum eksikse “bağlı” denmez. Uçtan uca mesaj alımını ilk yeni kaynak paylaşımı doğrular.
- Yalnız kaynak konudaki yönetici paylaşımları alınır. Normal üyeler, diğer gruplar/konular ve bot mesajları aktarılmaz. Anonim grup yöneticisi gönderimleri desteklenir.
- Paylaşımlar doğrudan yayınlanmaz: yöneticiye özel şifreli **Telegram kutusuna** girer. **Günlüğe taslak olarak al → kontrol et → Kaydet**. Aynı paylaşımı tekrar almak mevcut notu açar; ikinci kopya oluşturmaz.
- Mesajlar kalıcı mesaj anahtarıyla idempotent yazılır; düzenlemeler aynı kutu kaydını günceller. DB hatasında webhook 503 verir, yanlışlıkla başarı denmez. Soru-cevap botuna otomatik yanıt gönderilmez.
- Telegram Bot API bu linkten geçmiş mesajları okuyamaz. Eski paylaşımlar kendiliğinden gelmez; elle kopyalanabilir. İnternet önizlemesinden içerik/hikâye uydurulmaz.
- Küçük fotoğraflar (≤120 KB Telegram varyantı) token içermeyen raster data URL'ye çevrilir; alınamayan büyük görsel açıkça işaretlenir. Albüm mesajları ayrı kutu kayıtlarıdır. Kaynak bağlantısı taslağa eklenir.
- Liste sadece admin JWT ile, `Cache-Control: private, no-store` ve en fazla 12 son kayıtla okunur. “Kutudan kaldır” yalnız o kutu kopyasını siler, yayındaki notu veya Telegram mesajını silmez.
- Depolama: mevcut `edu_shared` üzerinde `edutg_<sha256>` satırları; satıra özel key/AAD namespace'iyle şifreli. SQL migrasyonu/yeni API function yok. `api/edu-shared?kind=channel&view=telegram-inbox` mevcut endpoint'i genişletir; alım mevcut webhook'tadır.
- Gerekli mevcut ortam: `TG_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE`. Opsiyonel: `TG_EDU_SOURCE_CHAT`, `TG_EDU_SOURCE_THREAD`, `TG_EDU_AUTHOR_IDS` (virgüllü izinli gönderen ID'leri; yoksa Telegram kaynak yönetici rolü doğrulanır). Secret doğrulanmadan yeni kutuya yazım yapılmaz.

## Depolama ve sınırlar

- Kanal yazımı gerçek JWT ile doğrulanır. Kanal oluşturma/silme ve owner/editor yönetimi yalnız admin içindir; mevcut owner/editor yalnız yetkili olduğu kanalı güncelleyebilir.
- Paid içerik, ilgili CRM paketi veya mevcut admin/ref erişimi olmayan okuyuculara gönderilmez. Kanal sahibi/editörü kendi tam derslerini okuyabilir.
- Admin/ref yanıtları dahil kanal belgeleri ortak localStorage'a yazılmaz; eski ortak cache silinir. Yalnız yazarın değişiklikleri hesap-kapsamlı cihaz taslağına alınır.
- Yetkili kayıtta bütün kanal belgesi sunucuda AES-256-GCM ile şifrelenir. Legacy belge okunur; manuel production migrasyonu yapılmaz. Yorum sistemi de şifreli belgeyi okuyabilir.
- Anahtar: `EDU_CHANNEL_SECRET || EDU_CRM_SECRET || ANALYTICS_SECRET || SUPABASE_SERVICE_ROLE`; ayrı anahtar/AAD namespace'i kullanılır. **Seçilen secret değişmeden saklanmalı**; değişiklik eski içeriği okunamaz kılar. Yazım için service role gereklidir.
- Bu değişiklik DB'nin mevcut RLS politikalarını değiştirmez. Doğrudan Supabase yazma izinleri ayrıca kısıtlı tutulmalıdır; uygulama uç noktasındaki JWT kontrolü DB izinlerinin yerine geçmez.
- En fazla 10 görsel/içerik; kaynak dosya PNG/JPEG/WebP ve ≤10 MB; çözümleme ≤40 MP. Görseller 1400 px'e küçültülür, kodlanmış görsel ≤450 KB. Kanal kaydetme isteği ≤2.8 MB; boyut aşımında sessiz kırpma yerine hata gösterilir. Daha büyük arşivlerde görsel URL'leri kullanılabilir. Bölümde 200 konu, günlük bölümünde 1000 gün, konu/günde 200 içerik sınırı sessiz veri kesmek yerine açık hata verir; günlük dolduğunda hızlı ekleme yeni günlük arşivi seçer. Aynı görsel URL'si iki farklı altyazı/konum için korunur.
- Paketlere özel YouTube bağlantısı uygulamada gizlenir; bu DRM değildir. Erişimi olan biri bağlantıyı paylaşabilir.
- Yeni API function yoktur. Taslak modülü `/assets/edu-author-drafts.mjs?v=1` sürümüyle yüklenir.

## Yerel doğrulama

`node --test tests/*.test.mjs`

`node scripts/preview-edu-studio.mjs`

Yerel sentetik ekranlar: `http://127.0.0.1:4319/?role=admin` ve `?role=reader`. Gerçek hesabı taklit etmez, Supabase'e yazmaz; kaydetmeler yalnız bellektedir. Tarayıcıda hata akışı için `window.syntheticFail = true` kullanılabilir.

Kontrol edilenler: video açıklama/görsel/trick roundtrip, mevcut ücretsiz dersler, JWT ve owner/editor sınırları, şifreleme ve bozuk belge fail-closed, kilitli okuyucu, Ctrl+V görseli, başarısız kayıtta formun korunması, 390/1440 px taşma ve görünüm düzeni.

Son tam test: **891/891 başarılı**. Ek kontroller: gerçek auth callback'inde aynı hesap olayları, çıkış öncesi taslak yakalama, hesap-epoch / eşzamanlı yükleme / ağ hatası, günlüğün yalnız kayıtta oluşması, eski şifreli kanal formatı uyumu, webhook secret / kaynak / yönetici kontrolü, kalıcı Telegram tekrarları, salt-okunur bağlantı teşhisi, fotoğraf indeksleri ve 200 günden uzun günlükte veri kaybı olmaması. Sentetik tarayıcı testleri öğrenci ekranına gidip dönüş, günlük taslağının yenileme sonrası geri gelmesi, editör/önizleme içinde iç içe görsel büyütme, 390/1440 px taşma ve Telegram taslağının tekrarında kopya oluşmamasını kapsar. Production kontrolü yalnız salt okunur yapılır; gerçek ders, Telegram mesajı veya DB kaydı elle eklenmez.
