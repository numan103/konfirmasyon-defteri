# Alfa Makro — sabah ve olay güncellemesi akışı

## Mesaj düzeni

- **09.00 Türkiye:** ne değişti, bugün hangi veri önemli, mevcut makro ağırlık ne ve ne olursa değişir? Hedef 150–200 kelime; bilgi azsa gereksiz uzatmamak için 120–200 kelimelik doğrulama aralığı kullanılır. Tek mesaj, görünür kaynak/madde listesi yoktur. Referans dönemi, veri gözlem günü ve araştırma kesiti birbirine karıştırılmaz.
- **Kritik veriden yaklaşık 15 dakika önce:** resmî planlanan saat, açıklama öncesinde kaydedilmiş beklenti ve önceki takvim değeri. Beklenti bulunmazsa sayı uydurulmaz. Saat öncelikle resmî BLS/BEA takviminden gelir; resmî takvim alınamazsa Forex Factory ikincil takvimi yalnız eksik kurum için, “yaklaşık olabilir” etiketiyle kullanılabilir ve resmî saati hiçbir zaman geçersiz kılmaz.
- **En erken açıklamadan 5 dakika sonra:** resmî sonuç + varsa önceden kaydedilmiş beklenti + teyit edilebilen önceki değer. Son cümle sabah görüşünün korunması/değişmesi/zayıflamasını açıklar. Beklenti yoksa önceki değerdeki değişim “sürpriz” sayılmaz; beklentiye paralel sonuç da sabah görüşünü kendiliğinden tersine çevirmez.
- **35–90 dakika arasındaki takip:** yalnız anlamlı resmî veri revizyonu varsa. Yeni HTTP zamanı veya aynı sonucu yeniden okumak yeni mesaj değildir. Bu sürüm fiyat tepkisini nedensellik diye yorumlamaz; otomatik fiyat-tepkisi takibi henüz kapsamda değildir.

İlk kapsam: ABD istihdam/işsizlik, manşet + çekirdek aylık TÜFE, manşet + çekirdek aylık PCE, yıllıklandırılmış çeyreklik GSYH. Bölgesel GSYH veya GDP açıklama aşamaları birbirinin yerine kullanılamaz. Diğer haberler sabah araştırmasında kalır; her konuşma/haber için gün içi uyarı üretilmez.

Son 24 saatin önemli ve tarihli politika/makro bültenleri, ay boyunca aynı istihdam özetini tekrar etmekten önceliklidir. Yapılandırılmış aylık göstergeler **ve reel faiz karşılaştırmasının değerleri/tarihleri** önceki raporla aynıysa 50–120 kelimelik kısa bir devam notu üretilir; eski rakamlar yeni gelişme gibi yeniden anlatılmaz. Görüşün korunması, yeni fiyat tepkisi olduğu anlamına gelmez.

## Kanıt ve yorum

`event-sources.mjs` resmî takvimi, BLS yayımlanan açıklama + API çapraz kontrolünü ve BEA açıklamalarını ayrıştırır. Aylık TÜFE'de mevsimsel düzeltilmiş seri kullanılır; yıllık enflasyon veya düzeltilmemiş endeks aylık manşet sonuç yerine konmaz. BLS metni ile API dönemi/değeri uyuşmazsa sonuç yayımlanmaz. Açıklama sayfası sunucudan 403 dönerse sonuç yalnız resmî BLS API ile doğrulanabilir (`verification:api_only`); bu durumda yeni referans dönemi ve değerler yine zorunludur, ancak manşet metniyle çapraz kontrol yapılamadığı her mesajda açıkça yazılır. GDP'de advance/second/third aşaması ve çeyrek, PCE'de aylık dönem ve çekirdek/manşet ayrılır.

Beklenti ve ikincil saat için ücretsiz, herkese açık `https://nfs.faireconomy.media/ff_calendar_thisweek.json` kesiti kullanılabilir. Bu **ikincil ekonomik takvim beklentisidir**, doğrulanmış Reuters/AP ekonomist anketi veya resmî kurum tahmini diye sunulmaz. Ülke, gösterge, birim ve resmî etkinlik saati tam eşleşmeli; indirme zamanı açıklama saatinden önce olmalıdır. Açıklama sonrasında alınan tahmin geriye dönük beklenti diye eklenmez. Boş değer bilinmiyordur, sıfır değildir. Önceki resmî değer alınamıyorsa bu da açıkça yazılır.

En fazla 36 saat önce kaydedilmiş beklentiler karşılaştırmaya alınır. Takvimde daha önce tutulmuş eski veya etkinliği yeniden saatlenen kayıtlar arşivde kalabilir; mesajda güncel beklenti gibi kullanılmaz.

Model yalnız doğrulanmış bülten özetlerinde kullanılabilir. Yapılandırılmış BLS işsizlik/istihdam gözlemleri varsa iki sayısal özet doğrudan uygulamada yazılır (`verified-observations-v1`); model çağrısı yapılmaz. Sayılar yine kaynak metniyle doğrulanır. Referans ayı bir yayın günü olarak etiketlenmez. BTC/altın aktarım yönü ve günlük sonuç kodda korunur; ters veya çelişkili sürprizler tek yönlü görüşe zorlanmaz.

Takipte okuma yönünü değiştiren revizyon veya en az 25 bin istihdam, 0,1 yüzde puan işsizlik/aylık enflasyon ya da 0,2 yüzde puan yıllıklandırılmış büyüme revizyonu anlamlılık filtresini geçer. Bu eşikler **mesaj gürültüsü filtresidir**, işlem veya risk kuralı değildir. Küçük bir sayı düzeltmesi aynı yorumu tekrar göndertmez.

## Sunucu ve kalıcı güvenlik

`004_macro_events.sql` iki özel/RLS açık tablo oluşturur:

- `alfa_macro_events`: resmî takvim kimliği, saati ve açıklama öncesi beklenti kesitleri.
- `alfa_macro_updates`: olay+aşama başına araştırma ve gönderim kaydı; ayrı önizleme anahtarları.

Asıl günlük `alfa_macro_reports` satırları değiştirilmez. Takvim değişirse yeni saat saklanır, eski saate ait beklenti taşınmaz; resmî takvimden kaldırılan gelecekteki olay iptal edilir. Doğrulanmış takvim kesiti 18 saatten eskiyse işleyici mesaj üretmez.

Takvim 06/12/18 UTC'de yenilenir. Beş dakikalık olay tetikleyicisi önce yalnız DB'deki yakın olayları kontrol eder; boş günlerde model veya veri uçlarını çağırmaz. Gönderimden önce hem günlük ana izin hem `eventUpdatesEnabled` ve mevcut hedef için test/onay parmak izi gerekir. Araştırma en fazla üç deneme, hata sonrası 10/15 dakika beklemelidir. Veri sonrası ilk mesaj 5–60 dakika penceresi dışına sarkarsa geç gönderilmez. Takip yalnız ilk mesajın teyitli tesliminden sonra değerlendirilir.

Gönderimden **önce** CAS ile `sending` yazılır. Telegram message id kalıcı yazılmadan `sent` sayılmaz. `sending`, `delivery_unknown` ve `delivery_failed` asla otomatik geri alınmaz. Eşzamanlı tetikler, yanıt/commit kaybı ve önizleme ile gerçek gönderimin ayrımı test edilir. Önizleme anahtarları gerçek olay gönderim hakkını tüketmez ve gönderilemez.

Hedef mevcut botla yalnız `https://t.me/alfatraderspublic/772`; PC, açık site veya sohbet gerekmez. Günlük ana izin kapatıldığında olay gönderimleri de durur. Günlük izin ile kritik veri izni admin panelinden ayrı onaylanır. Hiçbir yeni bot, ücretli plan veya paket eklenmedi; mevcut sağlayıcı tarifesi/kotası için ücretsiz kullanım garantisi verilmez.

## Güncel doğrulama sınırı

Kurulum tek başına canlı olay teslimi kanıtı değildir. Vercel'de BLS takvimi (ICS/liste/ay görünümü) 403 dönerken BLS API 200 döner; açıklama sayfası da 403 olduğundan veri sonrası doğrulama yalnız API ile yapılabilir ve bu sınırlama mesajda yazılır. BLS takvimi alınamazsa yalnız eksik kurum için Forex Factory ikincil zamanı kullanılabilir; bu saat yaklaşık etiketiyle sunulur ve resmî saatin yerine geçmez. BEA takvimi ve açıklamaları erişilebilir. Forex Factory HTML ve Investing TR sayfaları 403; yalnız FF JSON akışı kullanılabilir. BEA erişimi çalışsa bile resmî sonuç ayrıştırıcısı veya birim/dönem kontrolü başarısızsa uyarı gönderilmez. Kaynak erişim engeli çözülmeden tüm veri takviminin kapsandığı iddia edilemez.
