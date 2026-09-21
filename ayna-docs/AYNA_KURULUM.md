# Ayna kurulum notları

## 1. Veritabanı
Supabase panelinde SQL Editor'ı açın, supabase/ayna/001_schema.sql dosyasının tamamını yapıştırıp çalıştırın. Dosya tekrar çalıştırılabilir.

## 2. Ortam değişkenleri
Vercel proje ayarlarındaki Environment Variables bölümüne ekleyin; önce Preview, canlıya alırken Production ortamına:
- OPENAI_API_KEY: OpenAI platformundan (platform.openai.com) alınan API anahtarı.
- AYNA_ALLOWED_USER_IDS: Ayna'yı kullanacak hesapların Supabase kullanıcı kimlikleri, virgülle ayrılmış. Kimlikler Supabase panelinin Authentication bölümündeki kullanıcı listesinde görünür.
- CRON_SECRET: En az 32 karakterlik rastgele bir dizi.
- İsteğe bağlı: AYNA_MODEL_SCRIBE ve AYNA_MODEL_COACH (boş bırakılırsa varsayılan modeller kullanılır).
- İsteğe bağlı: AYNA_PROVIDER (varsayılan: openai), AYNA_PROVIDER_SCRIBE, AYNA_PROVIDER_COACH — desteklenen değerler: `openai`, `anthropic`. Her iş türü için ayrı sağlayıcı seçilebilir.
- Anthropic kullanılıyorsa ANTHROPIC_API_KEY de tanımlanmalıdır.

Şu üçü projede zaten tanımlıdır ve Ayna bunları aynen kullanır: SUPABASE_URL, SUPABASE_PUBLISHABLE, SUPABASE_SERVICE_ROLE. Tanımlı değilse eklenmelidir; SUPABASE_SERVICE_ROLE, Supabase panelindeki gizli (secret veya service_role) anahtardır ve asla istemci koduna veya repoya yazılmaz.
Değişkenleri ekledikten sonra yeniden deploy edin.

## 3. Varsayılan modeller
| Sağlayıcı | Scribe | Coach |
|---|---|---|
| OpenAI (varsayılan) | gpt-4o-mini | gpt-4o |
| Anthropic | claude-haiku-4-5-20251001 | claude-sonnet-5 |

## 4. Maliyet kalkanı
OpenAI veya Anthropic panelinde aylık harcama limiti tanımlayın. Ayna kullanıcı başına günlük çağrı sınırları uygular; ayna_usage tablosu tüm çağrıları ve token sayılarını tutar.

## 5. Bilinmesi gerekenler
- Vercel Hobby planında cron günde bir kez ve belirtilen saatten sonraki bir saat içinde çalışır; fonksiyon süresi 60 saniyeyle sınırlıdır. Ayna bu sınırlara göre yazılmıştır.
- `journals` tablosu bütçe, trade günlüğü, portföy ve karne verisinin tamamını tutar. Bu tabloda RLS kapalıysa (Supabase panelinde uyarı olarak görünür), sitenin açık anahtarıyla bu veriler dışarıdan okunabilir. Ayna'dan bağımsız ama öncelikli bir konudur.
- Projede zaten 11 Vercel fonksiyonu vardır; Ayna tek fonksiyon ekler. Bu yüzden sunucu yardımcıları `api/` klasörünün dışında, `ayna-server/` altında durur.
- Onay metinleri taslaktır. Ticari kullanımdan önce KVKK kapsamında hukuki görüş alınmalı; yurt dışına veri aktarımı (Supabase ve OpenAI/Anthropic) için standart sözleşme ve bildirim yükümlülükleri değerlendirilmelidir.
