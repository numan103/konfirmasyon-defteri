# Alfa Edu — yorum ve soru-cevap

## Kurulum

Supabase SQL Editor'da yalnızca `supabase/site/016_edu_feedback.sql` çalıştırılır.
011 Access ve 014 Cloud Research bu özelliğin parçası değildir.
Migration uygulanmadan API `setup_required` döner; sahte bir başarı göstermez.

## Kullanım

- Mevcut kanalın eğitimine ait tek genel yorum/soru alanıdır. Bölüm, konu veya
  video değişince alan sıfırlanmaz; soru formunda video seçimi yoktur.
  Eski, gizli kurs panelini yeniden açmaz.
- Eğitim altındaki Yorumlar / Sorular alanını, eğitim erişimi olan öğrenciler görür.
  Girişsiz veya premium olmayan kullanıcı API'den okuyamaz/yazamaz.
- 1–5 puan ve yorum. Yorum gönderilince form kapanır; tekrar değerlendirme istenmez.
  Öğrenci kendi yorumunun sağ üstündeki kalemle düzenlemeyi açar, kaydeder veya
  vazgeçer. Kendi yorumu listede geride kalmışsa düzenleme için ayrıca gösterilir.
- Yeni kayıtlar mevcut tablodaki `general/general` kapsamına yazılır. Eski konu
  kayıtları silinmez, genel kanal akışında okunur; eski video bilgileri saklansa da
  öğrenciye video bağlantısı olarak gösterilmez. Yeni SQL kurulumu gerekmez.
- Başlangıç, en az %50 ve tamamlama aşamasında belirgin hatırlatma çıkar.
  Bu aşamalar kanaldaki bütün içeriklerin **İzledim / Okudum işaretlerine** dayanır;
  video oynatma süresi veya doğrulanmış izleme olarak sunulmaz. Tek içerikli
  eğitimde orta aşama olmayabilir. Daha önce yorum yapan öğrenciye hiçbiri çıkmaz.
- “Şimdi değil” ile kapatılabilir; video veya ders erişimi yoruma bağlı değildir.
  Hatırlatma tercihleri tarayıcıda hesap + kanal bazında tutulur.
- Anonim varsayılandır. Öğrenci isterse görünen adını/takma adını yazar.
  Anonimlik diğer öğrencilere yöneliktir, kayıt auth hesabıyla bağlı kalır.
- Kullanıcının e-postası ve UUID'si okuma yanıtına konmaz; API sadece `mine` işareti
  döndürür. İsimler kullanıcı tarafından açıkça girilir; e-postadan ad üretilmez.
- Sorular öğrencilere görünür; eğitmen yanıtını yalnızca sunucunun doğruladığı site
  yöneticisi yazabilir. Yalnızca istemcideki kanal editörü alanına güvenilmez.
- Kendi paylaşımını silebilirsin; yönetici moderasyon için diğer kayıtları silebilir.
  Soruyu silmek ona bağlı yanıtları da siler.
- Metin düz yazıdır, HTML çalıştırılmaz. Uzunluk ve puan sunucuda doğrulanır.
- 30 kayıtlık sayfalama vardır. Kayıtlar sunucuda tutulur; localStorage paylaşım
  veritabanı olarak kullanılmaz. Saatlik paylaşım limiti ve kısa bekleme uygulanır.
- Mevcut `/api/edu-shared?kind=feedback` kullanılır; Vercel fonksiyon sayısı artmaz.

## Kontroller

`node --test tests/edu-feedback.test.mjs`

Tarayıcı kontrolü: başlangıç/orta/bitiş, tek yorum güncelleme, anonim/isimli soru,
eğitmen yanıtı, XSS metin gösterimi, mobil taşma ve kayıt sırasında oynatıcının
yeniden oluşturulmaması. Gerçek öğrenci yorumu veya sorusu test amacıyla yayınlanmaz.
