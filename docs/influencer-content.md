# Alfa Influencer içerik kütüphanesi

- Mevcut Influencer tam erişim alanında gösterilir.
- Admin konu, açıklama ve alt başlık ekler. Her alt başlıkta sıralanabilir metin,
  görsel ve video blokları bulunur. Konular ve alt başlıklar da sıralanabilir.
- Konu haritasında bağlı kartlarla ilerlenir: konu → alt başlık → o alt başlığın
  içerik editörü/okuyucusu. Tüm alt başlık formları aynı anda açılmaz.
- Konu kartının yanında onay isteyen silme tuşu vardır; silme kaydedilince uygulanır.
- Konu ve alt başlık kartlarındaki ⠿ tutamacıyla fare/dokunmatik/kalem üzerinden
  sıralama yapılır. Mor çizgi önce/sonra bırakma yerini gösterir. Escape iptal eder.
  Tutamaç odaktayken ok tuşları komşu kartla sıralamayı değiştirir.
  Yeni sıra “Kaydet” ile kalıcı olur; haritada sürükleme tek başına sunucuya yazmaz.
- Konu adı, açıklaması veya alt başlıkta arama yapılabilir. Eşleşen alt başlıklar
  vurgulanır. Filtre açıkken gizli kartların sırasını yanlışlıkla değiştirmemek için
  sürükleme durdurulur; arama temizlenince yeniden açılır. Arama içerik kaydı sayılmaz.
- Alt başlık kartları metin, görsel, video ve gönderi adetlerini gösterir.
- “Viral Gönderi örneğini ekle” örneği yalnızca editörde içerik oluşturur.
  Kaydetmeden sunucuya yazılmaz. **Kaydet = yayınla**: başarılı kayıtta tüm
  mevcut konular `published=true` olarak kaydedilir. Ayrı yayınlama kutusu yoktur.
  Sunucu da kayıtları yayınlanmış olarak saklar. Önceki sürümde kaydedilip eski
  taslak bayrağı taşıyan konular da okuma sırasında yayınlanmış kabul edilir;
  bunun için arka planda veri tabanı değişikliği yapılmaz.
- Görseller JPG/PNG/WebP olarak cihazdan yüklenir ve tarayıcıda küçültülür
  (1400 px, tek görsel en fazla 500 KB data URL). Alternatif: HTTPS görsel adresi.
  Tüm kaydetme isteği en fazla 3 MB. Çok sayıda görsel için URL kullanın.
- Videolar YouTube veya HTTPS MP4 bağlantısıyla eklenir; video dosyası yükleme yoktur.
- Admin sayfası doğrudan editörle açılır; tanıtım yalnızca erişimi olmayan yeni
  kullanıcılara gösterilir. Üye/ödeme yönetimi editörün altında kapalı bir bölümdür.
- Her alt başlıkta odaklanabilir fotoğraf alanı vardır: tıkla + Ctrl+V,
  çoklu dosya seçimi ve sürükle-bırak aynı yükleme hattını kullanır.
  Metin alanına yapıştırma normal metin işlemi olarak kalır.
- Çoklu fotoğraflar küçültülürken kaydetme ve düzenleme geçici durdurulur.
  Desteklenmeyen dosyalar bildirilir; kabul edilen fotoğraflar korunur.
  Toplam içerik boyutu önceden kontrol edilir, kayıt sınırına ulaşınca uyarılır.
- Gönderi örneği bloğunda metin ve isteğe bağlı HTTPS kaynak bağlantısı eklenir;
  üçüncü taraf gönderi iframe'i veya script'i çalıştırılmaz.
- Okuma: admin veya `influencer_orders.status=approved` olan kullanıcı.
  Site premium üyeliği tek başına yetmez. Henüz kaydedilmeyen değişiklikler
  yalnızca admin'in o tarayıcı oturumunda bulunur; üyeye gönderilmez.
- Yazma: gerçek admin JWT'si zorunludur; tarayıcıdaki admin bayrağı yetki sağlamaz.
- Depolama: mevcut `edu_shared` tablosunda `influencer_content_v1`.
  AES-256-GCM ile şifreli saklanır; genel tablo okuması içerik metnini açığa çıkarmaz.
  Anahtar `SUPABASE_SERVICE_ROLE` + bu modüle özel alan adından türetilir.
  **Service role anahtarı değiştirilecekse önce eski anahtarla veriyi açıp yeni
  anahtarla yeniden şifreleyin.** Ham anahtar hiçbir yanıtta veya logda gösterilmez.
- `POST /api/edu-shared?kind=influencer-content` revision ile CAS yapar.
  Çakışma 409 döner, otomatik üzerine yazılmaz. Başarısız kayıt “Kaydedildi” demez.
- Ödeme, onay, Supabase RLS ve storage bucket ayarları değiştirilmez.
