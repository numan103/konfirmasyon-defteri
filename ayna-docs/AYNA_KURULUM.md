# Ayna kurulum notları

## 1. Veritabanı
Supabase panelinde SQL Editor'ı açın, supabase/ayna/001_schema.sql dosyasının tamamını yapıştırıp çalıştırın. Dosya tekrar çalıştırılabilir.

## 2. Ortam değişkenleri
Vercel proje ayarlarındaki Environment Variables bölümüne ekleyin; önce Preview, canlıya alırken Production ortamına:
- OPENAI_API_KEY: OpenAI platformundan (platform.openai.com) alınan API anahtarı.
- AYNA_ALLOWED_USER_IDS: Ayna'yı kullanacak hesapların Supabase kullanıcı kimlikleri, virgülle ayrılmış. Kimlikler Supabase panelinin Authentication bölümündeki kullanıcı listesinde görünür.
- CRON_SECRET: En az 32 karakterlik rastgele bir dizi.
- İsteğe bağlı: AYNA_MODEL_SCRIBE ve AYNA_MODEL_COACH (boş bırakılırsa varsayılan modeller kullanılır).
Şu üçü projede zaten tanımlıdır ve Ayna bunları aynen kullanır: SUPABASE_URL, SUPABASE_PUBLISHABLE, SUPABASE_SERVICE_ROLE. Tanımlı değilse eklenmelidir; SUPABASE_SERVICE_ROLE, Supabase panelindeki gizli (secret veya service_role) anahtardır ve asla istemci koduna veya repoya yazılmaz.
Değişkenleri ekledikten sonra yeniden deploy edin.

## 3. Maliyet kalkanı
OpenAI platformunda aylık harcama limiti tanımlayın. Ayna kullanıcı başına günlük çağrı sınırları uygular; ayna_usage tablosu tüm çağrıları ve token sayılarını tutar.

## 4. Bilinmesi gerekenler
- Vercel Hobby planında cron günde bir kez ve belirtilen saatten sonraki bir saat içinde çalışır; fonksiyon süresi 60 saniyeyle sınırlıdır. Ayna bu sınırlara göre yazılmıştır.
- `journals` tablosu bütçe, trade günlüğü, portföy ve karne verisinin tamamını tutar. Bu tabloda RLS kapalıysa (Supabase panelinde uyarı olarak görünür), sitenin açık anahtarıyla bu veriler dışarıdan okunabilir. Ayna'dan bağımsız ama öncelikli bir konudur.
- Projede zaten 11 Vercel fonksiyonu vardır; Ayna tek fonksiyon ekler. Bu yüzden sunucu yardımcıları `api/` klasörünün dışında, `ayna-server/` altında durur.
- Onay metinleri taslaktır. Ticari kullanımdan önce KVKK kapsamında hukuki görüş alınmalı; yurt dışına veri aktarımı (Supabase ve Claude) için standart sözleşme ve bildirim yükümlülükleri değerlendirilmelidir.
