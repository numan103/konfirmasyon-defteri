# Telegram webhook — kalıcı tekrar koruması

`/api/ai?telegram-webhook=1` aynı `update_id`'yi birden fazla kez alabilir
(Telegram retry, worker yeniden başlatması, çift teslimat). Eski davranış
süreç içi bir `Set` kullanıyordu; Cloudflare worker'ı yeniden başladığında bu
kayıt kayboluyordu.

## Yeni davranış

- Tekrar kaydı yeni Supabase projesindeki `edu_shared` tablosunda
  `id = 'tg_update_dedupe'` satırında tutulur. Yeni tablo veya API açılmaz.
- Satır `updated_at` ile CAS güncellenir; eşzamanlı teslimatlarda kayıp olmaz,
  çakışma birkaç kez yeniden denenir.
- Yalnızca 200–299 yanıtlar işaretlenir. 403/503 gibi retry yanıtları
  işaretlenmez; Telegram tekrar denediğinde işlem yeniden çalışır.
- Son 500 `update_id` tutulur; daha eskileri zaman damgasına göre temizlenir.
- Eski, egress'i kısıtlanmış Supabase referansı görülürse hiçbir ağ isteği
  atılmaz.
- Service-role anahtarı yoksa (yerel geliştirme) yalnızca süreç içi koruma
  kalır; hiçbir veri yazılmaz veya okunmaz.

## Testler

- `node --test tests/telegram-update-dedupe.test.mjs` — CAS, cold-start,
  eski proje engeli, sınır temizliği ve retry davranışı.
- `node tests/browser/telegram-webhook-dedupe.browser.mjs --playwright=...`
  — gerçek webhook kodu + CAS'li yerel `edu_shared` taklidi üzerinden
  tarayıcıdan iki kez aynı update gönderilir; ikincisi `skipped: duplicate`
  döner ve ikinci bir DB yazısı yapılmaz.
