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
Özel tam liste ve orijinal fotoğraf, her istekte doğrulanmış site_access üyeliği
veya admin gerektirir. Free üyeye yalnızca aşağıdaki güvenli sonuç projeksiyonu
verilir. Eksik tablo/erişim hatası özel içerik için kapalı sonuçlanır.
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

## Kategoriler, erişim ve sonuç eğrisi

- Yeni, bu başlıktaki yazar mesajları da aktarılır: açık `bias` / `#bias` yön
  görüşü; `long`, `short`, `entry`, `girdik` veya `#islem` işlem; aksi gönderi.
  Belirsiz fotoğraflardan yön/sonuç çıkarılmaz. Komut ve forward aktarılmaz.
- Tam R satırı Sonuç kategorisindedir. Sonuçlanan kaydın ilk paylaşımı, aktif
  işlem/gönderi listesinde tekrar gösterilmez. Sembol/R satırları açıklamadan
  temizlenir, gerçek açıklamalar korunur. Tek sonuçta R tek yerde görünür.
- Premium: işlem, bias, gönderi, açıklama, kaynak ve kimlik doğrulamalı fotoğraf.
- Kayıtlı ücretsiz: teyitli, sonuçlanmış kayıtların opak ID/sembol/R/tarih
  allowlist'i ve iki görseli olan sonuçlar için before/after kapasite bayrağı.
  Açık işlemler, notlar ve Telegram linkleri verilmez; görseller yalnızca
  allowlist'teki sonuç ID'leri için kimlik doğrulamalı, aynı kökenli proxy ile
  gelir. Ham dosya ID'si, kaynak mesajı veya medya verisi tarayıcıya çıkmaz.
- Giriş sayfasının sağındaki İşlemler sekmesi ve üye ana sayfasında günlük
  kümülatif R: başlangıç 0R, tüm aktarılan teyitli sonuçlar, negatif/0R dahil.
  Günlük kapanış eğrisidir, gün içi drawdown iddiası değildir. Kayıt sayısı ve
  veri dönemi görünür; tam geçmiş/bağımsız doğrulanmış getiri iddia edilmez.
- Anonim ziyaretçi yalnızca toplu günlük eğriyi görür; sembol bazlı sonuçlar
  kayıt gerektirir. Bias ve aktif işlem ayrıntıları girişte gösterilmez.

`?summary=1` anonim toplu eğri; `?results=1` kayıtlı üyeye güvenli sonuç listesi.
Normal liste API'si premium üyeye özel akış, free üyeye güvenli sonuçlar döner.
`?image=<id>&index=0|1` free üyede yalnızca public allowlist'teki, teyitli ve
iki görseli olan sonuçlar için açılır; tek görselin "önce" slotu ve teyit
bekleyen kayıtlar kapalı kalır. `PAGE_TIER.alfatrading=free` sadece sonuç
sayfasını açar; açık işlem/bias ve ham medya sunucuda premium doğrulanmaya
devam eder. Eski manuel tam akış free istemcide yüklenmez.

Metadata `mentormeta_<hash>` satırlarında AES-GCM şifrelidir; fotoğraf byte'ı ve
dosya ID'si içermez. Liste/filtreler bu küçük metadata'yı okur. Eski kayıtlar ilk
özet/listede bir kez metadata'ya geçirilir; yeni yazılar her iki kaydı günceller.
Sonuç projeksiyonu da şifreli `mentor_results_public` satırında tutulur; API
allowlist'i dışında alan yayımlamaz. CAS ve webhook retry projeksiyon hatalarını
sessiz başarı saymaz. 1000 kayıt sınırında eksik veri yerine hata verir.

Fotoğraflar görünür olunca, en fazla iki paralel istekte yüklenir. İlk işlem
fotoğrafı açılır bölümde bekler; tıklanan grafik büyütülür. Çıkış, seviye
düşürme ve navigasyonda özel DOM ve Blob URL'leri temizlenir. Eğri/landing
istekleri birleştirilir, 60 saniye içi tekrar istek yapılmaz; arka plan poll yok.
