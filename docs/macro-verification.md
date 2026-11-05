# Teslim anındaki doğrulama — 5 Kasım 2026

- Canlı hedef `getChat` ile okundu: **Alfa Traders Public**, `supergroup`, herkese açık kullanıcı adı var; mevcut konu seçimi geçerli. Hedef id'si ve anahtarlar bu kayda alınmadı.
- Groq models API, `openai/gpt-oss-20b` erişimini doğruladı. Bu kontrol ücretsiz metadata sorgusudur; gerçek araştırma veya rapor üretimi başarısı anlamına gelmez.
- Korumalı `status` isteği 200: otomasyon **kapalı**, kalıcı kayıt altyapısı **hazır değil**.
- Mesaj göndermeyen `preview` isteği gerçekten çalıştırıldı ve **503 / macro_storage_unavailable** ile durdu. Rapor üretilmedi; güncel veriden rapor hazırlanmış gibi gösterilmedi.
- Gerçek Telegram `sendMessage` / test gönderimi **yapılmadı**. Hedef onayı ve rapor önizlemesi tamamlanmadan yapılmayacak.
- `MACRO_CRON_SECRET` ayrı, hassas Production değişkeni olarak oluşturuldu; eski `CRON_SECRET`, bot token'ı, hedef ve webhook/polling ayarları değiştirilmedi.
- `supabase/site/002_macro.sql` ve `003_macro_schedule.sql` henüz Supabase SQL editöründe uygulanmadı. Bu oturumda SQL yönetim erişimi yoktu; service-role REST erişimi SQL DDL çalıştırma yetkisi yerine kullanılmadı.
- Sonraki adımlar: özel tabloları kur → gerçek önizlemeyi üret/incele → hedefi ve metni kullanıcıya göster/onay al → test → Vault ve zamanlayıcı → ayrı etkinleştirme. Vault'a aynı secret girilemiyorsa `MACRO_CRON_SECRET` ve Vault değerini birlikte güvenli biçimde yeniden belirle.
- Başarı senaryosu birim testleri yapay test verisiyle çalışır; gerçek piyasa raporu veya gerçek Telegram teslimi kanıtı olarak sunulmaz.
- Kontroller: toplam **121/121 test**, 12 inline script sözdizimi kontrolü ve admin JavaScript sözdizimi kontrolü başarılı. Mevcut Telegram portföy bildirimi regresyon testleri de dahildir.

## Dosyalar

- Değişen: `api/ai.mjs`, `api/tg.mjs`, `index.html`, `sw.js`.
- Ortak Telegram: `lib/telegram.mjs`.
- Yeni sunucu modülleri: `lib/macro/core.mjs`, `research.mjs`, `report.mjs`, `store.mjs`, `target.mjs`, `job.mjs`, `handler.mjs`.
- Admin arayüzü: `assets/macro-admin.js`, `assets/macro-admin.css`.
- Özel tablolar ve zamanlayıcı: `supabase/site/002_macro.sql`, `supabase/site/003_macro_schedule.sql`.
- Test: `tests/macro.test.mjs`.
- Belgeler: `docs/alfa-makro-analist.md`, `docs/macro-verification.md`.

Kurulum, maliyet ve resmi doküman bağlantıları: [alfa-makro-analist.md](alfa-makro-analist.md).
