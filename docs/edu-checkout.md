# Alfa Edu — kendi kendine katılım / manuel onay

Ana paket düğmeleri artık Telegram mesajı açmaz:

1. **50 / 99 / 250 USDT · TRC20 ile katıl**: site hesabıyla giriş, paket tutarı,
   USDT/TRON(TRC20) adresi, ödeme sonrası 64 haneli TXID ve onay bildirimi.
2. **Breakout hesabıyla katıl**: resmi Breakout bağlantısı, ALFA kodu, alınan hesabın
   serbest yazılan tam adı (ör. 25K 1 Step Pro / Turbo), kayıt e-postası + hesap ID + sipariş ID.
   Personal 100K seçeneği aynı paket içinde 4 özel ders olarak kalır.
3. **Sorum var**: isteğe bağlı Telegram soru mesajı; ödeme/katılımın şartı değil.

Kullanıcı 19 Kasım'da eğitim için de mevcut site adresini onayladı:
`TPipnkFzdUF8Vb5cPpuwNLyRR6wcePxqG6`. Tutarlar sabit **50 / 99 / 250 USDT**,
kur hesabıyla azaltılmaz. Yalnızca USDT/TRC20; ağ ücreti ayrıca karşılanır.
Site cüzdan işlemi imzalamaz, ödeme başlatmaz veya otomatik zincir onayı vermez.
Breakout tam affiliate URL parametresi uydurulmaz; verilen resmi domain ve
ALFA kodu kullanılır. Pro muadilliği hâlâ ayrı manuel uygunluk gerektirir.

## API ve kayıtlar

`/api/analytics?education=1`:
- POST `op:submitPurchase`: doğrulanmış site hesabı, consent ve manuel onay
  bekleme kabulü zorunlu. İletişim ve üye ID'si istemciden değil doğrulanmış
  oturumdan alınır. Form kişi adına başka e-postayla başvuru açamaz.
- GET `&mine=1`: yalnızca o oturumun paket/yol kayıtları. Admin notları, audit,
  diğer başvuranlar veya dahili satır ID'si dönmez.
- Eski POST `op:apply` genel ilgi formu geriye uyumlu kalır; ödeme onayı sayılmaz.

Satır ID'si üye UUID/paket/yoldan HMAC ile türetilir. Beyanlar, önceki bildirimler
ve TXID/hesap bilgileri mevcut CRM içinde AES-GCM + ID AAD ile şifreli tutulur.
Tahsilat, komisyon ve ders hakları formdan yazılmaz. Sabit beklenen tutar,
alıcı adresi, ağ ve varlık sunucudan belirlenir. Gerçek alınan tutar ayrı,
yönetici tarafından girilir.

`eduproof_<HMAC>` kayıtları aynı TXID veya Breakout hesap ID'sinin birden fazla
eğitim başvurusunda kullanılmasını engeller. Yalnızca opak sahip kayıt ID'sini
şifreli tutar. Ana kayıt yazılamazsa aynı sahip tekrar deneyebilir; başka kayıt
409 alır. Bu indeks zincir doğrulaması veya ürünler arası muhasebe mutabakatı
değildir; yönetici başka ürün için kullanılmış ödeme olup olmadığını da kontrol eder.

Onaylı kayıt üye tekrar gönderimiyle değişmez. Bekleyen kayıt düzeltmeleri
yalnızca beyanı/inceleme bekleme işaretini değiştirir; yönetici durumu, tutarlar
ve haklar korunur. CAS yarışmaları sessizce ezilmez.

Başarılı kayıttan sonra adres/form kaldırılır, **Eğitim onayı bekliyor** yazılır.
Mevcut başvurusu olan kullanıcıya yeniden ödeme yaptırılmaz; önce durumu gösterilir.
Durum API'si hata verirse boş başvuru varsayılıp ödeme talimatı açılmaz.
Çıkışta açık ödeme penceresi kaldırılır; kişi verisi localStorage'a yazılmaz.

## Yönetici incelemesi

Eğitim CRM'de beyan ve “Onay bekliyor” işareti görünür. TRC20 için Tronscan
bağlantısı, beklenen adres/tutar/varlık/ağ; Breakout için hesap/sipariş/e-posta
gösterilir. Üye şifresi veya API anahtarı istenmez. Yapılandırılmış özel yönetici
Telegram sohbetine bildirim denenir; grup/mentorship'e ödeme bilgisi gönderilmez.
Bildirim başarısız olsa da kalıcı CRM kaydı korunur.

**TXID/dekont/hesap bilgisi beyanı ≠ doğrulanmış ödeme/alım.**
Yönetici zincir/Breakout kontrolü ve açık onayla alımı onaylar. Bu değişiklik
eğitim/Telegram yetkilerini otomatik değiştirmez; hak tanımlama mevcut yönetici
sürecinde kalır. Influencer ödeme/erişim akışı, üç eğitim paketinin hakları ve
mevcut Access taslakları değiştirilmez. Yeni SQL/DDL yoktur.

## Görsel katılım ekranı / farklı hesaplar

- Global `* { margin:0 }` yüzünden sola kayan native dialog, açık `position:fixed`,
  `inset:0`, `margin:auto` ile yatay/dikey ortalanır. Uzun içerik pencere içinde
  kayar; başlık/kapat ve soru bağlantısı görünür kalır. Mobilde tek sütun.
- Sayfada üç kısa adım, görselli paket kartları, temsili yerel eğitim fotoğrafları
  ve açılır detaylar bulunur. Orijinal Breakout partner afişi kullanılır.
- Hesap adı 3–160 karakter serbest metindir. Pro/Turbo örnek butonları sadece
  alanı doldurur; seçenek listesiyle sınırlamaz. Yeni istemci `accountType:custom`
  ve `accountDescription` gönderir. Eski Classic/Pro istemcileri geriye uyumludur.
- Serbest isimden otomatik hesap büyüklüğü, eşdeğerlik veya ders hakkı çıkarılmaz.
  `accountSize:null`, `requestedAccountSize:<paketin referansı>` tutulur.
  Yönetici gerçek hesap adı ile seçilen paketin / 100K yükseltmesinin uygunluğunu
  ayrıca `accountEligibilityConfirmed:true` ile onaylamadan alım onaylanamaz.
  Başvuranın gönderdiği bu bayrak dikkate alınmaz.
- Aynı paket için diğer yolda bekleyen/onaylı başvuru varsa yeni ödeme talimatı
  yerine mevcut kayda yönlendirilir. İlk kayıt/uygun ilk alım şartı değişmez.
