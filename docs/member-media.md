# Ücretsiz üyelik: podcast ve son video

- Podcast oynatıcı ücretsiz, referanslı ve yönetici hesaplarına görünür.
  Borsa bağlamak gerekmez. Girişsiz oturumda gizlidir; çıkışta ses durdurulur.
  Yayınlama, yükleme ve düzenleme hâlâ yöneticiye özeldir.
- Ana sayfada podcast'ın altında son YouTube videosu gömülür; otomatik oynatılmaz.
  Sayfadan ayrılınca veya çıkış yapınca iframe kaldırılır.
- Kaynak: https://www.youtube.com/feeds/videos.xml?channel_id=UCm37PItmzZ5hH_16D9bPMFw
  (`@cryptotraderahmet`, Crypto Ahmet). En yeni yayın tarihi seçilir.
  18 Kasım 2026 kontrolünde `g1z4tZUnEF8` (13 Kasım yayını).
- `/api/edu-shared?kind=youtube` mevcut fonksiyonu kullanır; yeni serverless
  fonksiyon, API anahtarı, veritabanı veya cron gerekmez. Kaynak 15 dakika
  bellekte, yanıt 5 dakika edge'de önbelleklenir. Hatalar başarı sayılmaz.
- Embed: `youtube-nocookie.com`, lazy iframe, autoplay yok; YouTube yedek
  bağlantısı var. Başlıklar metin olarak işlenir.
- Bunlar uygulama içi üyelik avantajlarıdır, DRM değildir. YouTube videosu
  YouTube'da zaten herkese açıktır; mevcut podcast genel metadata/ses adresi
  altyapısı değiştirilmedi. Premium sayfa izinleri genişletilmedi.
