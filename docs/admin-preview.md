# Canlı yönetici görünüm geçişi

Oturum açmış, sunucudan `SITE.admin === true` almış yönetici için ekranın en
üstünde sabit dört buton: **Giriş sayfası / Yeni kayıt / Premium üye / Yönetici**.
Menüler sitenin kendi menüleridir; sayfa listesi veya statik tasarım kopyası yoktur.
Katalog, katılım penceresi, filtreler ve yerel araçlar gerçek uygulama koduyla
çalışır. Yönetici butonu izole görünümü kaldırır, gerçek oturuma döner.

## İzolasyon ve veri sınırı

- Kaynak `/` HTML'i oturumsuz alınır; gerçek admin DOM'u veya kişisel storage'ı
  kopyalanmaz. App boot sözleşmesi doğrulanır; gerçek bootAuth yerine yalnız
  bu belge içinde preview runtime çalıştırılır. Sözleşme değişirse açılmaz.
- `sandbox="allow-scripts"`; **allow-same-origin, allow-forms, top-navigation,
  popups yok**. Opak origin nedeniyle ebeveyn session/storage erişimi yoktur.
- Bellek içi local/sessionStorage ve sahte, boş Supabase client kullanılır.
  Token `preview-no-authority` gerçek JWT değildir. Gerçek JWT frame'e verilmez.
  Yerel araçlarda yapılan denemeler rol değiştirince/kapatınca silinir.
- CSP `connect-src 'none'`, `form-action 'none'`, `worker-src 'none'`;
  native fetch/XHR/socket/beacon, DB/oturum/OAuth yazma yolları kapalıdır.
- fetch adapter ebeveyne yalnız URL+GET gönderir. Ebeveyn frame source,
  origin, rastgele kanal ve gerçek admin durumunu kontrol eder. Rol ebeveynden
  seçilir; mesaj içeriğinden veya URL'den yetki alınmaz. Header/body aktarılmaz.
- Ebeveyn sadece açık allowlist GET çağrılarını yapar; URL'leri yeniden kurar.
  Sunucu yazıları, analytics, AI maliyetli POST'lar, bildirim ve gerçek kişisel
  başvuru/kayıt okumaları engellenir. `/mine` başvuruları boş test cevabıdır.
- Free Mentorship her zaman results uç noktasına gider ve coin/r/date alanlarına
  tekrar daraltılır. Premium ortak metin/grafikleri normal feed modülüyle açar.
  Portföy free'de yalnız summary'dir; versions/admin bayrakları aktarılmaz.
- Eğitim kursları premium görünümde ortak katalogdan okunur. Premium, başka
  bir kişinin ders alımı veya Influencer aboneliği varmış gibi davranmaz.
- Ortak landing/podcast/YouTube, ekonomik takvim, piyasa fiyatları canlı okunur.
  Harici linkler ve hesap işlemleri uyarıyla engellenir; video embed'leri ve
  yayınlanmış medya sağlayıcının iframe koşulları elverdiği ölçüde çalışır.
- Static asset CORS `*` yalnız public `/assets/` modülleri için eklenmiştir.
  API auth/CORS veya gerçek kullanıcı yetkileri değiştirilmemiştir.

Bu bir **etkileşimli test görünümü**, gerçek bir kullanıcıya ait oturum değildir.
Kişisel alanlar boş başlar; server-side işlemler bilerek tamamlanmaz.
Yetki testlerinin yerine geçmez. Yönetici görünümü gerçek ve normal işlevlidir.
