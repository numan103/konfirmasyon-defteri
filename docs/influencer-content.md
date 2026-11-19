# Alfa Influencer içerik kütüphanesi

- Mevcut Influencer tam erişim alanında gösterilir.
- Admin konu, açıklama ve alt başlık ekler. Her alt başlıkta sıralanabilir metin,
  görsel ve video blokları bulunur. Konular ve alt başlıklar da sıralanabilir.
- “Viral Gönderi taslağı ekle” örneği yalnızca editörde bir taslak oluşturur;
  kaydetmeden sunucuya yazılmaz, “Yayında” seçilmeden üyelere açılmaz.
- Görseller JPG/PNG/WebP olarak cihazdan yüklenir ve tarayıcıda küçültülür
  (1400 px, tek görsel en fazla 500 KB data URL). Alternatif: HTTPS görsel adresi.
  Tüm kaydetme isteği en fazla 3 MB. Çok sayıda görsel için URL kullanın.
- Videolar YouTube veya HTTPS MP4 bağlantısıyla eklenir; video dosyası yükleme yoktur.
- Okuma: admin veya `influencer_orders.status=approved` olan kullanıcı.
  Site premium üyeliği tek başına yetmez. Taslaklar yalnızca admin'e döner.
- Yazma: gerçek admin JWT'si zorunludur; tarayıcıdaki admin bayrağı yetki sağlamaz.
- Depolama: mevcut `edu_shared` tablosunda `influencer_content_v1`.
  AES-256-GCM ile şifreli saklanır; genel tablo okuması içerik metnini açığa çıkarmaz.
  Anahtar `SUPABASE_SERVICE_ROLE` + bu modüle özel alan adından türetilir.
  **Service role anahtarı değiştirilecekse önce eski anahtarla veriyi açıp yeni
  anahtarla yeniden şifreleyin.** Ham anahtar hiçbir yanıtta veya logda gösterilmez.
- `POST /api/edu-shared?kind=influencer-content` revision ile CAS yapar.
  Çakışma 409 döner, otomatik üzerine yazılmaz. Başarısız kayıt “Kaydedildi” demez.
- Ödeme, onay, Supabase RLS ve storage bucket ayarları değiştirilmez.
