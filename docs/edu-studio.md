# Alfa Edu · Eğitmen Stüdyosu

## Kullanım

1. Gerçek yönetici hesabıyla **Alfa Edu → Eğitmen Stüdyosu**.
2. İlk girişte açılan bölüm formunda başlığı ve ücretli paketi seçip kaydet. Var olan ücretli bölüm varsa stüdyo doğrudan o bölümü açar. Bölüm çubuğundaki `+` ile başka bölüm eklenebilir.
3. **+ Ders** ile `OBO – TOBO` gibi bir konu aç.
4. **+ İçerik**: YouTube bağlantısı isteğe bağlı; açıklama, trickler, görseller ve ek videolar aynı derste saklanır.
5. Açıklama/trick alanına **Ctrl+V** ile görsel yapıştır, forma dosya sürükle veya fotoğraf satırında dosya seç. Görsel altyazısı ve metin içindeki konumu düzenlenebilir.
6. **Kaydet**. Sunucu onaylamazsa form açık kalır; tekrar denemek mümkündür.

Ücretli bölüm erişimi **yeni içerikler için varsayılandır**. Var olan ücretsiz dersler ücretliye dönüştürülmez. Her içeriğin erişimi editörde ayrıca seçilebilir.

Öğrenci ekranında video + notlar / yalnız video / yalnız notlar seçenekleri bulunur. Dar ekranda video ve notlar alt alta gelir.

## Depolama ve sınırlar

- Kanal yazımı gerçek JWT ile doğrulanır. Kanal oluşturma/silme ve owner/editor yönetimi yalnız admin içindir; mevcut owner/editor yalnız yetkili olduğu kanalı güncelleyebilir.
- Paid içerik, ilgili CRM paketi veya mevcut admin/ref erişimi olmayan okuyuculara gönderilmez. Kanal sahibi/editörü kendi tam derslerini okuyabilir.
- Admin/ref yanıtları dahil kanal belgeleri ortak localStorage'a yazılmaz; eski ortak cache silinir.
- Yetkili kayıtta bütün kanal belgesi sunucuda AES-256-GCM ile şifrelenir. Legacy belge okunur; manuel production migrasyonu yapılmaz. Yorum sistemi de şifreli belgeyi okuyabilir.
- Anahtar: `EDU_CHANNEL_SECRET || EDU_CRM_SECRET || ANALYTICS_SECRET || SUPABASE_SERVICE_ROLE`; ayrı anahtar/AAD namespace'i kullanılır. **Seçilen secret değişmeden saklanmalı**; değişiklik eski içeriği okunamaz kılar. Yazım için service role gereklidir.
- Bu değişiklik DB'nin mevcut RLS politikalarını değiştirmez. Doğrudan Supabase yazma izinleri ayrıca kısıtlı tutulmalıdır; uygulama uç noktasındaki JWT kontrolü DB izinlerinin yerine geçmez.
- En fazla 10 görsel/içerik; kaynak dosya PNG/JPEG/WebP ve ≤10 MB; çözümleme ≤40 MP. Görseller 1400 px'e küçültülür, kodlanmış görsel ≤450 KB. Kanal kaydetme isteği ≤2.8 MB; boyut aşımında sessiz kırpma yerine hata gösterilir. Daha büyük arşivlerde görsel URL'leri kullanılabilir.
- Paketlere özel YouTube bağlantısı uygulamada gizlenir; bu DRM değildir. Erişimi olan biri bağlantıyı paylaşabilir.
- Yeni API function veya immutable asset değişikliği yoktur.

## Yerel doğrulama

`node --test tests/*.test.mjs`

`node scripts/preview-edu-studio.mjs`

Yerel sentetik ekranlar: `http://127.0.0.1:4319/?role=admin` ve `?role=reader`. Gerçek hesabı taklit etmez, Supabase'e yazmaz; kaydetmeler yalnız bellektedir. Tarayıcıda hata akışı için `window.syntheticFail = true` kullanılabilir.

Kontrol edilenler: video açıklama/görsel/trick roundtrip, mevcut ücretsiz dersler, JWT ve owner/editor sınırları, şifreleme ve bozuk belge fail-closed, kilitli okuyucu, Ctrl+V görseli, başarısız kayıtta formun korunması, 390/1440 px taşma ve görünüm düzeni.

Son tam test: **863/863 başarılı**. Production ön kontrolü yalnız herkese açık sayımla yapıldı: 1 kanal, 39 ücretsiz içerik; hiçbir ders veya DB kaydı eklenmedi.
