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
- Gerçek hesap/kayıt e-postası oluşturulmadı. SMTP teslimatı, spam klasörüne
  düşme veya redirect allowlist'in tamamı bu testlerle doğrulanmış sayılmaz.
- AUTH/SITE, Supabase ayarları, RLS ve ödeme/onay kuralları değiştirilmedi.

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
