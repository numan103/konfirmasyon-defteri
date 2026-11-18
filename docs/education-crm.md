# Eğitim / ürün CRM ve analitik

## Ekranlar

`?page=analitik` ziyaret raporunun üstünde **Eğitim · Talepler & Alımlar**.
Aynı bileşen yönetici için `?page=erisim` üye panelinde de görünür.
Mevcut Access taslağı, hacim geçmişi SQL'i ve borsa yetkilendirmesi değiştirilmez.

- Ziyaret ve paket/katılım yolu bazında CTA ilgisi; seçili ziyaret raporu dönemi.
- Açık talep formu: ad (isteğe bağlı), e-posta veya Telegram, paket/katılım yolu,
  ihtiyaç notu ve iletişim/takip onayı.
- Manuel CRM: ilgileniyor, başvurdu, alımı onaylandı, uygun değil, iptal.
- Paket/katılım yolu/grup dönemi filtresi, metin arama, filtrelenen kayıtları CSV.
- Gerçekte girilen tahsilat ve komisyon; özel/ortak ders kullanımı; girilmiş grup
  tarihleri ve ilk dönem bitişi. İkinci ay devam şartı ayrı kontrol edilir.
- Borsa özeti mevcut `/api/access?op=list` üzerinden. Eğitim satırlarıyla yalnızca
  sunucuda doğrulanmış form hesabı UUID'si eşleştirilir. E-posta benzerliğinden
  otomatik kimlik birleştirmesi yapılmaz.

**Ziyaret/tıklama ≠ başvuru ≠ onaylı alım.** Eski tıklamalardan geçmiş satış
uydurulmaz. Önceki öğrenciler manuel kaydedilebilir. CRM sayıları kayıt/fırsat
sayısıdır; aynı iletişim farklı paket/yollarda birden fazla kayda sahip olabilir.
Tekil iletişim de gösterilir; bu, doğrulanmış tekil insan sayısı iddiası değildir.

## Doğrulama ve tutarlar

Alımı onaylamak için yönetici onay kutusu + doğrulama referansı gerekir.
Breakout'ta ayrıca ilk kayıt/uygun ilk satın alım ve varsa Pro muadilliği onayı.
100K seçeneği yalnızca Personal Coaching'de, toplam 4 özel ders; standartta 2.
Kullanım sayısı hakları aşamaz. Ders süresi 90–180 dakika olarak paketlerde kalır.

Boş tutar bilinmiyor demektir. $50/$99/$250 etiketi veya 10K/25K/50K/100K
hesap büyüklüğü otomatik gelir yazılmaz. Komisyon tahmini türetilmez. Tutar
özetleri yalnızca **alımı onaylı kayıtlarda elle girilen** değerlerin toplamıdır;
muhasebe defteri, net kâr veya banka mutabakatı değildir.

Bu sürüm CRM takibidir. Alım onayı **site/Telegram erişimini otomatik açmaz**,
grup dönemi bitişi de otomatik çıkarmaz. Ders rezervasyonu veya ödeme tahsilatı
yapılmaz. Mevcut kullanıcı hakları korunur.

## API ve gizlilik

Mevcut `/api/analytics?education=1`:

- `POST {op:"apply", plan, route, name, contact, note, consent:true}`: açık talep.
  İstemci `stage`, `memberId`, tutar veya onay gönderse de dikkate alınmaz.
  Üye kimliği yalnızca geçerli Bearer token ile sunucudan alınır.
- `GET&page=N`: yöneticiye 300'lük sayfalar, daha fazla kayıt varsa sonraki sayfa.
  Arama, toplamlar ve CSV'nin yalnızca yüklü sayfayı kapsadığı açıkça belirtilir.
  Bu sınır çok dilli notlarda da serverless yanıt boyutunu sınırlı tutar.
- `POST {op:"save", ...}`: yalnızca doğrulanmış yönetici. Düzenlemede `id/revision`
  gerekir; iletişim/paket/yol sabittir. Güncelleme `updated_at` karşılaştırmalı CAS.
- `POST {op:"erase", id, revision, confirmation:"ERASE"}`: yönetici, ayrı açık
  onay ve CAS ile yalnızca seçilen CRM kaydını siler. UI'de `SIL` yazılır.

Veri mevcut `edu_shared` içinde `educrm_<HMAC>` satırlarında **AES-256-GCM**
şifreli tutulur. Satır ID'si AAD ile ciphertext'e bağlanır; başka satıra taşınan
veya değiştirilmiş kayıt çözülemez. Düz JSON geri dönüşü ya da tahmin edilebilir
yerel anahtar yoktur. Yazma için service role zorunludur. Anahtar kaynağı:
`EDU_CRM_SECRET`, yoksa `ANALYTICS_SECRET`, yoksa service role. Anahtar
değiştirilmeden önce kayıtlar uygun şekilde yeniden şifrelenmelidir.

Yeni tablo/DDL gerekmez. Genel tablo okuması varsa yalnızca şifreli içerik,
opak ID ve güncelleme zamanı görünür; iletişim/notlar açığa çıkmaz.
CRM endpoint'i liste ve kayıt ayrıntılarını yalnızca yöneticiye döndürür;
anonim form yanıtı yalnızca alındı bilgisi ve opak referanstır.

Aynı iletişim/paket/yol yeniden gönderildiğinde yeni satış oluşturulmaz.
Takip talebi ayrı, doğrulanmamış metadata olarak eklenir; yönetici alım
onayı/tutarları/ders sayıları değişmez. Eşzamanlı güncellemeler CAS ile korunur.
Son 50 yönetici durum kaydı kayıt içinde tutulur. Kişisel veri kalıcı silindiğinde
bu kayıt da silinir. Ziyaretlerin 90 günlük temizliği CRM satırlarına dokunmaz;
CRM saklama/silme süreci yönetici sorumluluğundadır.

Ham IP, cihaz parmak izi veya ziyaretçinin kendiliğinden iletişim bilgisi
toplanmaz. Kişi bilgisi açık form veya yönetici girişiyle gelir. CSV yönetici
isteğiyle üretilir, formül enjeksiyonuna karşı hücreler korunur. Tarayıcı
localStorage'a CRM kişi verisi yazılmaz; çıkışta ekran ve düzenleyici temizlenir.
