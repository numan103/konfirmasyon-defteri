# Yönetici görünüm önizlemesi

Üye yönetimi başlığındaki **Görünüm önizleme** düğmesi yalnızca sunucudan
`SITE.admin === true` almış, oturum açmış yöneticiye görünür.
Giriş / Yeni üye / Premium üye ve sayfa listesi; Yöneticiye dön veya Escape.

Bu sürüm **salt okunur tasarım önizlemesidir**, gerçek bir başka kullanıcı
oturumu veya uçtan uca üyelik testi değildir. Kaynak, canlı admin DOM'u değil,
`/` adresinden oturumsuz okunan HTML'dir. Sitenin kendi stilleri ve statik
yerleşimi kullanılır; dinamik uygulama modülleri çalıştırılmaz.
Kişisel günlükler, eğitim hakları, başvuru/ödeme durumları ve araçların
etkileşimleri gösterilmez. Dinamik modül alanları boş kalabilir.
Sayfalar üstteki listeden seçilir; iframe içindeki kontroller devre dışıdır.

Iframe `sandbox=""` ile opak kökendedir: script, oturum/storage erişimi,
form, popup, üst pencere gezinmesi yoktur. Ek CSP script/connect/frame/form
erişimini kapatır. Kaynak script/event handler'ları ve admin alanları silinir.
Gerçek AUTH/SITE, URL, yerel günlükler ve Supabase oturumu değiştirilmez.

Mentorship ortak içerik istisnası: ebeveyn yalnızca sabit GET uçlarını okur.
Yeni üye sadece `results=1` çağırır; cevap yeniden coin/r/date allowlist'ine
daraltılır. Premium ortak metni ve ilk 8 grafiği okur; token iframe'e verilmez.
Grafikler veri URL'leri olarak geçirilir. Rol değiştirme/kapatma eski asenkron
yanıtları geçersiz kılar ve frame'i boşaltır. Ödeme veya kayıt yazma yolu yoktur.
Premium, eğitim satın alınmış olduğu veya Influencer erişimi olduğu anlamına gelmez.
