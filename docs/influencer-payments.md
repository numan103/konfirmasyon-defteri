# Influencer eğitimi: ödeme onayı kurulumu

## Veritabanı

Supabase SQL Editor'da **yalnızca**
`supabase/site/015_influencer_orders.sql` çalıştırılmalıdır.
`011_access_volume_history.sql` ve `014_cloud_research.sql` bu kurulumun parçası değildir.

Yeni tablo sadece service-role erişimine açıktır. Premium erişimi ayrı kalır.
Migration yokken API `503` döner; sahte bir ödeme/onay başarısı göstermez.

## Akış

1. Kullanıcı paketini seçer. Sabit ödeme tutarları sırasıyla **50 / 90 / 175 USDT**.
   Telegram'dan fiyat teyidi gerekmez. Dolar etiketi referanstır; yaklaşık TL
   karşılığı Frankfurter/ECB USD/TRY kuruyla, kur tarihiyle birlikte gösterilir.
   Kur servisi erişilemezse TL tahmini gizlenir; USDT tutarı değişmez.
2. Site hesabına giriş yapar, USDT'yi TRON/TRC20 üzerinden
   `TPipnkFzdUF8Vb5cPpuwNLyRR6wcePxqG6` adresine gönderir.
3. Paketini ve 64 karakterlik TXID'yi bildirir. Sipariş `pending` kaydedilir.
4. Mevcut bot, `TG_ADMIN_CHAT_ID` / mevcut admin kimliğine **özel mesaj**
   gönderir. Grup/topic hedeflerine geri dönüş yoktur.
5. Yönetici influencer sayfasındaki özel panelden TXID'yi TronScan'de açar.
   Ağ, doğru USDT sözleşmesi, başarılı işlem, alıcı ve seçilen paketin sabit USDT
   tutarını kontrol eder. Ağ ücreti kullanıcı tarafından ayrıca karşılanır.
6. Yönetici onayladığında erişim sunucuda açılır. TXID bildirimi tek başına ödeme
   kanıtı değildir. Aynı TXID ikinci kez kullanılamaz.

Botun yöneticiye yazabilmesi için yönetici botu önceden başlatmış olmalıdır.
Telegram gönderimi başarısız olsa da kayıt özel admin panelinde kalır.

## Yayın öncesi

- 015 migration'ını uygula; gerçek veritabanıyla başvuru/onay akışını doğrula.
- Tanıtım videosu henüz verilmedi; alakasız site videosu yerine yer tutucu var.
- Gerçek eğitim videolarını public dosyalara koyma; özel depolama ve sunucudan
  paket kontrolü yapılan süreli video bağlantıları gerekir. Mevcut çalışma alanı
  henüz eğitim-video dağıtım sistemi değildir.
- Eğitim alanı henüz tamamlanmadı; videolar ve kaynaklar eklendikçe güncelleneceği
  sayfada açıkça belirtilir.
- Büyüme karşılaştırmaları Ahmet'in verdiği anonim başlangıç/sonuç rakamlarıdır.
  Ara zaman serisi, doğrulanmış analitik veya etkileşim ölçümleri uydurulmaz.
  Eğitim taslakları temsili etiketlenir. Ahmet'in verdiği üç gerçek gönderi ayrı
  bölümde resmi X widget'ıyla gösterilir; X engellenirse alıntı ve doğrudan kaynak
  bağlantısı kalır. Gömme kodu yalnızca influencer sayfası açılınca yüklenir.
  Beğeni sayıları sabitlenmez ve doğrulanmamış gösterim/etkileşim verisi üretilmez.
- İptal/iade koşulları ve görüşme süreleri henüz belirtilmedi; destek iletişimi
  Telegram'dır. Fiyat için teyit şartı yoktur.
- Özel konu taslağı `/api/ai?influencer=1&op=outline` içinde tutulur; anonim ve premium
  kullanıcıya `401/403` döner, public HTML'ye gömülmez.
