# Kayıt odaklı giriş sayfası ve kişisel konu takibi

## Giriş sayfası

- Tek bir ana çağrı: ücretsiz hesap oluşturma. Borsa bağlamak kayıt koşulu değildir.
- Eski ücretsiz/premium karşılaştırma kartları kaldırıldı. Gerçek erişim
  kuralları değişmedi; eğitim paketleri ve özel alanlar ücretsiz kayda dahil
  olarak sunulmaz. Referans açıklaması ek erişim koşullarında bulunur.
- Alfa Dergi, Influencer konu haritası ve Alfa Edu girişte gösterilir.
- Finansal sonuç önizlemeleri ve eski referans videosu isteğe bağlı açılır;
  ziyaretçinin ilk adımını bir paket veya borsa seçiminden başlatmaz.

## E-posta akışındaki bulgu

Önceden signup sonucunda `msg(...)` çağrısından sonra `setMode('login')`
çalışıyor ve bu fonksiyon mesajı temizliyordu. Onay bekleyen kişi geri bildirim
göremiyordu. Artık doğrulama için ayrı bir ekran açılır, adres gösterilir,
şifre alanı temizlenir, yeniden gönderme ve girişe dönme seçenekleri sunulur.

- Resend, signup ile aynı redirect hedefini kullanır; 60 saniyelik istemci
  bekleme süresi yinelenen istekleri azaltır. Sağlayıcının asıl rate limiti korunur.
- Onaylanmamış e-posta, rate limit, şifre sıfırlama ve süresi dolan bağlantı
  durumları ayrı ayrı test edilir.
- Auth modalında klavye odağı tutulur, Escape ile kapanır ve eski odağa dönülür.
- Canlı public `/auth/v1/settings` salt okunur kontrolünde kayıt açık,
  e-posta sağlayıcısı açık ve e-posta onayı zorunlu görüldü.
- Resend üzerinden `auth.alfa-trader.com` doğrulandı ve Supabase Auth için
  özel SMTP bağlandı. Gerçek şifre yenileme e-postası gönderildi; Resend
  loglarında `cryptotraderahmet@gmail.com` adresine `Delivered` görüldü.
  Teslimat spam klasörüne düşme ihtimalini sıfırlamaz; redirect allowlist'in
  tamamı ayrıca doğrulanmış sayılmaz.
- AUTH/SITE ve SITE URL'si, RLS, ödeme/onay kuralları ve production veri yazımı
  değiştirilmedi. Yalnızca Supabase Auth SMTP ayarları ve e-posta limiti güncellendi.
- Eğitim katılımından girişe geçerken kapanmış dialog eşzamanlı kaldırılır.
  Yeniden açılan ödeme penceresiyle eski düğümün kısa süre birlikte kalması
  önlenir. Tutarlar, cüzdan ve manuel onay mantığı değişmez.

### E-posta sınırı ve açık oturumdan şifre değiştirme

- E-posta gönderim kotası, hatalı giriş ve sağlayıcının saniye cinsinden
  bekleme mesajları artık farklı gösterilir. Bilinmeyen kota için kesin
  “bir dakika sonra açılır” sözü verilmez.
- Şifre yenileme e-postası başarılı istendikten veya rate limit alındıktan sonra
  aynı sekmede en az 60 saniye yeni istek gönderilmez. Bu sadece tekrar
  isteklerini azaltır; sunucunun gerçek kotasını yükseltmez veya atlatmaz.
- Açık hesabın üst menüsündeki “Şifre” düğmesi mevcut oturumdan şifre
  belirlemeye izin verir. SDK oturumundaki kullanıcı ile mevcut kullanıcı
  eşleştirilir; asıl yetki kontrolü Supabase `updateUser` tarafından yapılır.
  Sağlayıcı yeniden kimlik doğrulama isterse işlem başarısız sayılır ve açıklanır.
- Supabase Auth, Resend SMTP üzerinden `noreply@auth.alfa-trader.com`
  adresiyle gönderim yapıyor. Domain Resend'de `Verified`; SMTP ayarı yeniden
  yükleme sonrasında da korundu.
- Özel SMTP açılınca projenin e-posta limiti varsayılan saatte 2'den saatte 30'a
  çıktı; `RATE_LIMIT_EMAIL_SENT=30`, `SMTP_MAX_FREQUENCY=60`. Kaynak:
  https://supabase.com/docs/guides/auth/rate-limits
- Gerçek şifre yenileme akışı tek bir e-posta üretti ve Resend loglarında
  `Delivered` görüldü. API anahtarı yalnızca Supabase'in güvenli SMTP formunda
  tutuluyor; dokümana veya koda yazılmadı.
- Hata mesajları ve açık oturumdan şifre değiştirme yolları izole sağlayıcı
  yanıtlarıyla test edildi.

## Kişisel “Yaptım” ve hatırlatma

- Her konu için tamamlandı tarihi ve 0/1/3/7/14/30 günlük tekrar aralığı.
- Tekrar zamanı gelince kutu yeni kontrol için boş görünür; son tamamlanma
  tarihi saklanır. “Yaptım” yeni kontrol tarihini başlangıç yapar.
- Hatırlatmalar sayfa açıkken dakikada bir yerel olarak güncellenir;
  sekmeye dönüldüğünde de kontrol edilir. E-posta, push, cron yoktur.
- `kind=influencer-progress`: mevcut `edu-shared` API'si, gerçek kullanıcı
  oturumuyla ve Influencer ürün erişimi kontrolünden sonra çalışır.
- Yalnızca oturum sahibinin satırı okunur/yazılır; istek gövdesindeki başka
  kullanıcı id'si dikkate alınmaz. Admin de kendi kişisel kaydını görür.
- Mevcut `edu_shared` içinde kullanıcı kimliği hash'lenmiş ayrı satır,
  kullanıcı satırına bağlı AES-GCM AAD ve CAS yazımı kullanılır.
  İçerik yayını veya başka bir kullanıcının ilerlemesi değiştirilmez.
