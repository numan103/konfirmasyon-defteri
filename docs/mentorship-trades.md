# Telegram Mentorship → İşlem Kanalı

Tek kaynak: `alfakasim`, forum başlığı `6`, yazar `traderahmetd`.
Public kanalları kapsam dışıdır. `TG_MENTOR_TRADE_AUTHOR_ID` isteğe bağlı olarak
yazarın sayısal Telegram ID'sini sabitler. İsim benzerliği yeterli değildir;
anonim yönetici, forward ve diğer üyeler yok sayılır.

## Akış

Mevcut Telegram webhook'u, `message` ve `edited_message` içinde **tam satır**
`BTC +2.3R`, `GOLD -1R`, `NZDCAD +2,8r` sonuçlarını okur.
Hedef/plandaki R gerçekleşmiş sonuç sayılmaz; belirsiz ifadeler aktarılmaz.
Yalnızca kaynak/yazar/başlık eşleşirse özel akışa yazılır.
Webhook secret doğrulaması zorunludur. Veritabanı hatası 503 döner ve Telegram
tekrar deneyebilir; eski bellek-içi dedupe bu adımı atlatmaz.

Yanıt verilen ilk mesajdaki metin/fotoğraf ve sonuç mesajının fotoğrafı alınır.
Tek fotoğraf çok sembollü özetin tüm işlemlerine tahminen bağlanmaz: eşleşmeyen
satırlar **teyit bekliyor** görünür. Giriş, stop, yön, kâr tutarı veya performans
özeti uydurulmaz. Fotoğraftaki R OCR ile tahmin edilmez.
Bu sürüm doğrudan ilk işleme yanıtları eşleştirir; daha karmaşık webhook yanıt
zincirlerini otomatik olarak birleştirdiğini iddia etmez.

Bir kaynak ilk-mesaj/sembol için deterministik ID + CAS kullanılır.
Tekrar gelen teslimatlar yeni sonuç eklemez; daha yeni açık R düzeltmesi sonucu
değiştirir, R'leri toplamaz. Metinden kaldırılan sonuç edited_message ile geri
çekilir. Telegram silme olayı Bot API'den gelmediği için silme otomatik izlenmez.
Düzenleme taraması 1000 kayıt sınırını aşarsa sessiz yanlışlık yerine hata verir.

## Site ve gizlilik

`?page=alfatrading` içinde **Trader Ahmet · İşlem Sonuçları** alanı.
`/api/ai?mentorTrades=1`: GET liste / `&image=<id>&index=0|1` fotoğraf.
Hem liste hem orijinal fotoğraf, her istekte doğrulanmış site_access üyeliği
veya admin gerektirir. Eksik tablo/erişim hatası kapalı sonuçlanır.
SITE_ACCESS_OPEN ve eski "tablo yoksa ref" varsayımı bu özel akışı açmaz.

`edu_shared` satırları `mentortrade_<sha256>` ve AES-256-GCM + ID AAD.
Anahtar `MENTOR_TRADES_SECRET` veya servis anahtarından türetilir; yerel fallback
yoktur. Ham kayıtlar, Telegram dosya ID'leri ve tarihsel JPEG'ler şifreli saklanır.
Liste cevapları dosya ID'si/verisini içermez. Fotoğraf API'si bot token'ını veya
Telegram dosya URL'sini tarayıcıya vermez; kimlik doğrulamalı byte proxy kullanır.
Fotoğraflar en fazla 2MB, JPEG/PNG/WebP. Görsel hatası açıkça gösterilir.
Yanıtlar private/no-store; istemci logout/navigasyonda DOM'u ve Blob URL'lerini
temizler. Public feed, OG, portföy, CRM, gelir veya kişisel günlüğe kopyalanmaz.
Yeni SQL/DDL gerekmez.

## Kurulum / geçmiş

Yönetici POST `{op:"connect"}` botun gerçek grup üyeliğini/okuma iznini kontrol
eder. Webhook başka URL'ye bağlıysa değiştirmez. Mevcut callback ve üyelik
güncellemeleri korunur, düzenlemeler eklenir; bekleyen mesajlar düşürülmez.

Yönetici POST `{op:"import",ids:[946]}` geçmiş mesajları Telegram'ın yayınladığı
widget'tan sunucuda yeniden okur. Exact yazar + en fazla 6 adımda başlık 6'ya
ulaşan yanıt zinciri gerekir. İstemciden metin/görsel kabul edilmez. Geçmiş
grafikleri yalnızca allowlist cdn*.telesco.pe adresinden indirilip şifreli
saklanır. Telegram tarafından erişilemeyen mesajlar içe aktarılmış sayılmaz.

19 Kasım kurulumu: verilen örneğe kadar 9–18 Kasım aralığı tarandı. Aynı ilk
işleme ait sonuç düzeltmesi birleştirilerek 9 ayrı kayıt / 18 görsel aktarıldı;
4 kayıt önceki takvim haftasından, 5 kayıt bu haftadan. Başlık 49'a bağlı ETH
sonucu başlık 6 kapsamında olmadığı için aktarılmadı. Tam Telegram arşivinin
eksiksiz tarandığı iddia edilmez; erişilebilen ve kesin biçimde ayrıştırılan
mesajlar kullanılır.

Kurulumda kullanılan geçici, 30 dakika sınırlı içe aktarım yetkisi kaldırıldı.
Kalıcı sürümde ayrı kurulum anahtarı yolu yoktur; yönetim yalnızca admin JWT.
