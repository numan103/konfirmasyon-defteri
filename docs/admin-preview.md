# Canlı yönetici görünüm geçişi

Oturum açmış, sunucudan `SITE.admin === true` almış yönetici için ekranın en
üstünde küçük bir geçiş düğmesi grubu: **Giriş sayfası / Yeni kayıt / Premium üye /
Yönetici**. Düğmeler ikon ve kısa başlıktır; tam ad erişilebilirlik adı ve
ipucundadır. Menüler sitenin kendi menüleridir; sayfa listesi veya statik tasarım
kopyası yoktur. Yönetici düğmesi izole görünümü kaldırır, gerçek oturuma döner.

## Görünüm kuralları

- Giriş sayfası ve Yeni kayıt **aydınlık tema** ile açılır. Premium koyu temada
  kalır. Tema seçimi yalnızca geçici önizleme storage'ına yazılır.
- Giriş ve yeni kayıt görünümünde ana sayfada **1 Kasım’dan bugüne** yalnızca
  aktarılmış ve eşleşmesi teyitli sonuçlardan günlük/kümülatif R değerlendirmesi
  öne çıkar. Eski tarihli sonuçlar bu kümülatife katılmaz.
- Premium görünümde aynı değerlendirme sayfanın **en altına** alınır. Detaylı
  **İşlem Akışı** başlığı, filtreleri, aktif işlem/bias sekmeleri ve sayfalama
  bu görünümde gizlenir; yalnızca teyitli sonuç kartları ile ortak açıklama ve
  görsel kalır. Yeni kayıt görünümünde işlem akışı olduğu gibi kalır. Eski tarz
  kanal geçmişi Compact sembol / R / tarih satırlarına düzenlenir, yeni
  formatlı geçmiş aynı sayfada bırakılır.
- YouTube gömülü oynatıcısı opak sandbox'ta çalışmadığı için yerine video
  posteri gösterilir. Tıklayınca ebeveyn, `youtube-nocookie` oynatıcısını küçük
  ve izole bir pencerede açar. Token veya üye verisi aktarılmaz.

## İzolasyon ve veri sınırı

- Kaynak `/` HTML'i oturumsuz alınır; gerçek admin DOM'u veya kişisel storage'ı
  kopyalanmaz. App boot sözleşmesi doğrulanır; gerçek bootAuth yerine yalnız
  bu belge içinde preview runtime çalıştırılır. Sözleşme değişirse açılmaz.
- Ana önizleme iframe'i `sandbox="allow-scripts"`; **allow-same-origin,
  allow-forms, top-navigation, popups yok**. Opak origin nedeniyle ebeveyn
  session/storage erişimi yoktur. Video penceresi ayrı bir cross-origin
  `youtube-nocookie` iframe'idir ve ebeveyn verisini göremez.
- Bellek içi local/sessionStorage ve sahte, boş Supabase client kullanılır.
  Token `preview-no-authority` gerçek JWT değildir. Gerçek JWT frame'e verilmez.
  Yerel araçlarda yapılan denemeler rol değiştirince/kapatınca silinir.
- CSP `connect-src 'none'`, `form-action 'none'`, `worker-src 'none'`;
  native fetch/XHR/socket/beacon, DB/oturum/OAuth yazma yolları kapalıdır.
- fetch adapter ebeveyn yalnız URL+GET gönderir. Ebeveyn frame source, origin,
  rastgele kanal ve gerçek admin durumunu kontrol eder. Rol ebeveynden seçilir;
  mesaj içeriğinden veya URL'den yetki alınmaz. Header/body aktarılmaz.
- Ebeveyn sadece açık allowlist GET çağrılarını yapar; URL'leri yeniden kurar.
  Sunucu yazıları, analytics, AI maliyetli POST'lar, bildirim ve gerçek kişisel
  başvuru/kayıt okumaları engellenir. `/mine` başvuruları boş test cevabıdır.
- Free Mentorship her zaman results uç noktasına gider ve coin/r/date alanlarına
  tekrar daraltılır. Premium ortak metin/grafikleri normal feed modülüyle açar.
  Portföy free'de yalnız summary'dir; versions/admin bayrakları aktarılmaz.
- Eğitim kursları premium görünümde ortak katalogdan okunur. Premium, başka
  bir kişinin ders alımı veya Influencer aboneliği varmış gibi davranmaz.
- Ortak landing/podcast/YouTube bilgisi, ekonomik takvim, piyasa fiyatları canlı
  okunur. Harici linkler ve hesap işlemleri uyarıyla engellenir.

Bu bir **etkileşimli test görünümü**, gerçek bir kullanıcıya ait oturum değildir.
Kişisel alanlar boş başlar; server-side işlemler bilerek tamamlanmaz.
Yetki testlerinin yerine geçmez. Yönetici görünümü gerçek ve normal işlevlidir.
