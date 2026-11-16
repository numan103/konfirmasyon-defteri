# ALFA Podcast

Ana sayfaya eklenen yatay, tek bölüm oynatıcısı. Supabase kotasını ses trafiğiyle büyütmek için ses dosyası Vercel Blob'a yüklenir; veritabanı yalnızca bölüm başlığı, açıklama, tarih, tür, süre ve ses adresini tutar.

## Davranış

- `assets/alfa-podcast.mjs` sayfa yüklendiğinde `#landing-podcast-slot` (ziyaretçi) ve `#home-podcast-slot` (uygulama ana sayfası) içine kart ekler.
- Çalma otomatik başlamaz. Oynat/duraklat, 15 saniye ileri/geri, ilerleme çubuğu, hız seçimi (0,75×–2×) ve süre etiketi vardır.
- Bölüm çalmaya başlayınca `hasPlayed` olur; uygulama içinde başka bir sayfaya geçildiğinde aynı `<audio>` ögesi `.ap-dock` mini oynatıcısına taşınır ve çalma kesilmez. Sekme arka plana alındığında ses devam eder; `visibilitychange` sesi durdurmaz.
- Kaldığı yer `localStorage` (`alfa-podcast-listening-v1`) içinde bölüm kimliğiyle saklanır ve `loadedmetadata` anında uygulanır. Bölüm bittiyse konum sıfırlanır.
- Media Session API ile kilit ekranı / donanım tuşları çalışır.
- Yayınlanan bölüm yoksa ziyaretçilerde oynatıcı hiç gösterilmez; yöneticiye "Bölüm ekle" kartı görünür.

## Yayınlama

Yalnızca yönetici hesabından yapılır (`siteIsAdmin()`):

1. Ana sayfa kartındaki **Bölüm ekle / Düzenle**.
2. Başlık, açıklama, haftalık/günlük türü ve bölüm tarihi.
3. Ses dosyası (≤ 30 MB, MP3/M4A/AAC/OGG/OPUS/WAV) seçip **Seçilen dosyayı yükle**; dosya doğrudan Vercel Blob'a gider.
4. Ya da doğrudan bir HTTPS ses adresi gir.
5. **Yayınla** — bu adım olmadan bölüm görünmez. Yayınlamadan önceki konum ve ses kaydedilmez.
6. **Yayından kaldır** onaylıdır; ses dosyası silinmez.

Yükleme ve yayın iki ayrı adımdır; yalnızca yükleme yapmak bölümü yayınlamaz.

## Veri ve güvenlik

- Tablo: `public.site_podcast` (id='current' tek satır), RLS açık. `previous_episode` ve `episode` JSONB, maksimum 8192 bayt.
- Yazma yalnızca `public.podcast_publish(p_revision, p_episode)` SECURITY DEFINER fonksiyonu üzerinden, `service_role` ile ve tam revizyon eşleşmesiyle yapılır (stale write koruması).
- Anon/authenticated rolleri tabloyu yazamaz; `podcast_publish` execute yetkisi anon'a verilmemiştir.
- API uçları (`/api/edu-shared?kind=podcast`) aynı kimlik akışını kullanır: anonim yayın/yayın-kaldırma ve yönetici olmayan erişim 401/403.
- Ses adresi istemci tarafında `assets/podcast-model.mjs` ile doğrulanır: HTTPS, doğrudan ses dosyası uzantısı, kullanıcı bilgisi, localhost/IP ve Supabase ana bilgisayar adları reddedilir. Supabase trafiği ve yerel adresler ses kaynağı olamaz.
- Bölüm başlığı/açıklaması `textContent` ile çizilir; URL yalnızca `src` olarak atanır.

## Egress ve kota

- Supabase yalnızca küçük bölüm meta verisini servis eder (≤ 8 KB), 60 saniyelik kenar önbelleğiyle.
- Ses Vercel Blob'tan gelir; Supabase kotası ses trafiğinden etkilenmez.
- Vercel Blob Hobby: 1 GB depolama, 10 GB/ay trafik, 10 000 basit ve 2 000 gelişmiş işlem. Konuşma için 64–96 kbps mono önerilir. Eski ses dosyaları silinmez; depolama dolduğunda Vercel Blob panosundan eski dosyalar silinmelidir.

## Testler

- `tests/podcast.test.mjs`: model doğrulama, günlük/haftalık etiket, süre etiketi, devam pozisyonu, API yetki/revizyon/önbellek, şema.
- `tests/browser/podcast.browser.mjs`: gerçek Chrome ile oynatma, arka planda devam, sayfa geçişinde mini oynatıcı, duraklatmada konum kaydı, ilk bölüm öncesi gizlilik, yönetici formu.

## Geri alma

- **Yayından kaldır** bölüm meta verisini boşaltır; ses dosyası kalır.
- SQL migration (`supabase/site/012_site_podcast.sql`) tek tablo ve tek fonksiyon ekler; geri almak için tabloyu ve fonksiyonu silmek yeterlidir. Mevcut veriler etkilenmez.
- Oynatıcı kodu `index.html`'de dört küçük ek ve `assets/` altında izole dosyalardır; kaldırılırsa sayfa normal çalışır.
