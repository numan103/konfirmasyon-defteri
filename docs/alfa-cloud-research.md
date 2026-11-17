# Faz 5 / Modül 2 — Cloud Research Database

ALFA CHARTS araştırma verilerinin (Replay oturumları, çizimler, Paper işlemleri,
Tester/Lab notları ve MAE/MFE girdileri) kimlik doğrulaması yapmış kullanıcıya
ait Supabase ortamında saklanması ve cihazlar arasında senkronize edilmesi.
Trade Management Research ve optimizer kapsam dışıdır; otomatik strateji
çalıştırma, gerçek emir endpoint'i, ücretli API, sahte sonuç veya görsel
yükleme eklenmemiştir.

## Durum

| Öğe | Değer |
| --- | --- |
| Kod commit'i | `0c91141` (`feat: add per-user cloud research database sync`) |
| Checkpoint (çalışmadan önce) | `cloud-research-pre` |
| Migration dosyası | `supabase/site/014_cloud_research.sql` |
| Production migration | **Uygulanmadı** (Supabase SQL Editor erişimi bu ortamda yok) |
| Production deploy | **Yapılmadı**; kaynak production'da hâlâ `a1c34fa` |
| Temiz release doğrulaması | `C:\Users\Pc\AppData\Local\Temp\alfa-clean-release-cloud`, `http://127.0.0.1:4174` |

`0c91141` yalnızca araştırma veritabanı dosyalarını içerir. Çalışma ağacındaki
bağımsız Access değişiklikleri (`api/access.mjs`, `index.html`,
`supabase/site/011_access_volume_history.sql`) bilinçli olarak stage'e
alınmadı ve temiz release paketinde HEAD sürümüne döndürüldü.

## Saklanan veri ve sınır

Bir araştırma kaydı (`research_packet`) şunları içerir:

- Replay oturumu: `id`, `symbol`, `timeframe`, `dataStart`, `startTime`,
  `currentTime`, branch bilgisi; Trade ID'leri ve değişmez olay günlüğü
  (`create`, `edit`, `close`, `cancel`, `resolve`) korunur.
- Paper durumu: freezing ilk risk, stop/entry/TP düzenlemeleri, komisyon,
  günlük işlem geçmişi, Lab/Tester notları ve revizyon geçmişi, şablonlar.
- MAE/MFE girdileri: ham OHLC (birincil ve alt zaman aralığı), gözlem
  watermark'ı ve exclursion hesabı için gereken parametreler.
- Çizim/indikatör bağlamı, Replay imleç konumu.

Türetilmiş snapshot'lar (`labSnapshot`, trade sonuçları, MAE/MFE raporu)
sunucuya **gönderilmez**; saklanan değişmez olaylar + OHLC'den istemcide
yeniden hesaplanır. Böylece sync sonrası Tester/Lab/MAE/MFE yeniden
hesaplanabilir ve eski bir financial truth olarak taşınmaz.

Fiyat yolu olmayan eski localStorage oturumları `reference-only` olarak
işaretlenir; buluttan gelen fiyatlarla yalnızca **complete** paketler açılır.
OHLC boşlukları `partial` üretir, eksik mum sıfırla doldurulmaz.

## Veritabanı şeması (additive / idempotent)

`014_cloud_research.sql` mevcut `chart_settings`, `site_access`, drawing veya
portföy tablolarını değiştirmez veya silmez. Dört yeni tablo:

| Tablo | Amaç | Anahtar |
| --- | --- | --- |
| `research_sessions` | Son araştırma paketi + revision | `(user_id, session_id, branch_id)` |
| `research_session_versions` | Her revision'ın değişmez kopyası | `(user_id, session_id, branch_id, revision)` |
| `research_candles` | Değişmez OHLC satırları | `(user_id, session_id, branch_id, timeframe, time)` |
| `research_legacy_records` | Ham localStorage migration arşivi | `(user_id, record_key, digest)` |

Kısıtlar: sembol/timeframe whitelist'i, watermark ≥ `currentTime + step` ve
gelecek zamana ≤, OHLC pozitiflik/low≤open,close≤high, 10.000 olay,
4 MB payload, 55.000 mum / 12 MB candle batch, oturum başına 50 MB revision
quota (silmek yerine hata verir/dışa aktarmaya yönlendirir).

### RLS ve yetkiler

- Dört tabloda da RLS `ENABLE` + `FORCE`.
- `anon`/`public` hiçbir SELECT/INSERT/UPDATE/execute hakkına sahip değil.
- `authenticated`: oturumlarda SELECT/INSERT/UPDATE, candle/version/legacy
  tablolarında yalnızca SELECT/INSERT; tüm politikalar
  `(select auth.uid()) = user_id` ile sınırlı.
- Candle, version ve legacy kayıtları uygulama tarafından güncellenemez/silinemez
  (append-only). Trigger'lar `auth.uid()` kontrolü yapar.
- Frontend yalnızca publishable key + kullanıcı JWT'si kullanır. Service-role
  anahtarı frontend kodu veya paket içinde yer almaz.

### Commit protokolü

`public.research_commit_session(uuid,text,text,bigint,jsonb,jsonb)`:

1. `auth.uid()` = `p_user_id` ve `expected_revision >= 0` zorunlu.
2. Advisory transaction lock + `SELECT … FOR UPDATE` ile aynı oturum için
   serialize.
3. Mevcut revision `expected_revision`'a eşit değilse `40001` ile reddedilir
   (null CAS dahil); kör `upsert` yok.
4. Insert revision 1, update `revision = revision + 1`; her yazma trigger ile
   `research_session_versions` tablosuna arşivlenir.
5. Candle'lar çakışan fiyat veya duplicate için tüm işlemi geri alır; aynı
   değer `ON CONFLICT DO NOTHING` ile tekrar yüklenmez.
6. Guard'lar oturum kimliği, replay clock, olay günlüğü öneki, Lab gözlem
   geçmişi, şablon içeriği ve Tester not revision'ının değiştirilemeyeceğini
   doğrular.

## İstemci mimarisi

| Dosya | Görev |
| --- | --- |
| `assets/alfa-research-model.mjs` | Paket doğrulama, dedup/merge, export/import, OHLC deltas |
| `assets/alfa-research-storage.mjs` | IndexedDB (`alfa-research-v1`) kayıt + güvenlik yedeği |
| `assets/alfa-research-transport.mjs` | Publishable-key Supabase transport, RPC commit, legacy archive |
| `assets/alfa-research-sync.mjs` | Çevrimdışı kuyruk, retry, CAS, three-way merge, conflict akışı |
| `assets/alfa-research.mjs` | Research DB paneli, migration UI, açma/accept-cloud akışları |
| `assets/alfa-charts.mjs` | Replay kayıt hook'u, research açma yolu, owner korumaları |

Özgün localStorage kayıtları silinmez. IndexedDB yedekleri migration öncesi,
import öncesi, bulut kopyasını kabul etmeden önce ve yerel çalışma kopyasını
değiştirmeden önce oluşturulur. Misafir modu yalnızca yereldir; hesaba otomatik
taşıma yapılmaz. Hesap değişimi core örneğini sıfırlar ve owner uyuşmazlığında
Replay/Paper işlemini durdurur.

### Çevrimdışı davranış

Capture her zaman önce IndexedDB'ye yazılır. `offline` olayında panel
"Çevrimdışı" durumuna geçer, kuyruk büyümeye devam eder. `online` veya
`TOKEN_REFRESHED` sonrası `flush()` bekleyen revision'ları sırayla gönderir.
Gönderim sırasında yeni OHLC eklenirse acknowledgment sonrası birleştirilir;
yeni metadata revision'ı kuyrukta kalır. HTTP cevabı kaybolan commit aynı
expected revision ile tekrar denenir, duplicate version oluşmaz.

### Çakışma çözümü

Üç yönlü birleştirme (base / local / remote) kullanılır:

- Ayrık metadata ve ayrık revision geçmişleri birleştirilir.
- Aynı alanın eşzamanlı düzenlenmesi, ayrılan Replay imleçleri veya çakışan
  execution tail'i **açık çakışma** üretir; sessiz overwrite yapılmaz.
- Her iki kopya saklanır: panel `Çakışma` durumu, hata mesajı, "Bulutu kullan
  (yerel kopya yedeklenir)" ve çakışan bulut kopyası için JSON export sunar.
- `acceptCloud` yalnızca kullanıcı onayıyla çalışır; önceki yerel branch
  IndexedDB yedeğinde kalır.

## Migration, export/import

"Yerel kayıtları buluta taşı" yalnızca oturum açıkken çalışır; hesabın kendi
`alfa-replay-session:*`, `alfa-paper:*` ve ilişkili `alfa-drawings:*`
anahtarlarını tarar (en fazla 1000 kayıt). Her ham kayıt önce IndexedDB'ye
yedeklenir, ardından `research_legacy_records` tablosuna arşivlenir. Bozuk JSON
veya eşleşmeyen oturumlar ham metin olarak korunur ve uyarı gösterilir. Geçerli
oturumlar ayrıca research packet'ı olarak capture edilir. İşlem idempotenttir
(aynı digest tekrar eklenmez) ve hiçbir localStorage anahtarını silmez.

JSON export/import kullanıcı bazındadır: `format: "alfa-research"`, `owner`,
`records`. Import owner'ı doğrular, misafir yedeğinin hesaba kopyalanması için
açık onay ister, 16 MB sınırı ve benzersiz session ID kontrolü uygular.

## Panel durumları

`Kaydedildi`, `Senkronize ediliyor`, `Çevrimdışı`, `Hata`, `Çakışma` ve
"Son başarılı senkronizasyon" zamanı gösterilir. Panel ayrıca retry, bulut
listesini yenile, migration, JSON dışa aktar, yerel yedek JSON, JSON içe aktar,
oturum açma, JSON yedek, bulut revision listesi ve çakışma işlemlerini sunar.

## Doğrulama

Temiz release paketinde (Access dosyaları HEAD sürümünde) çalıştırılan testler:

| Test | Sonuç |
| --- | --- |
| Tüm birim testleri (`tests/*.test.mjs`) | 613 / 613 geçti |
| Research sync birim testi | 22 / 22 geçti |
| PostgreSQL migration + RLS simülasyonu | 17 / 17 geçti |
| `alfa-research.browser.mjs` (4174) | geçti — guest, offline/online, conflict, export/import, replay restore, `noSupabaseRequests: 0` |
| `alfa-paper`, `alfa-strategy`, `alfa-lab`, `alfa-excursions`, `alfa-replay`, `alfa-drawings` (4174) | geçti; 4.000 mum Replay ve 14/14 çizim senaryosu dahil |
| `podcast`, `portfolio-safety` (4175) | geçti |
| Sayfa hataları / gerçek emir isteği / görsel yükleme | 0 / 0 / 0 |

Önemli: DB testi yerel PGlite üzerinde `auth.uid()` **simülasyonu** ile
çalışır; gerçek Supabase RLS kanıtı değildir. Tarayıcı testleri Supabase'e
gerçek istek göndermez (sahte transport), bu yüzden `noSupabaseRequests: 0`
beklenen sonuçtur.

## Bilinen boşluklar / üretim öncesi şartlar

1. `014_cloud_research.sql` Supabase SQL Editor'da elle uygulanmalıdır.
   Uygulanmadan panel hata durumunu gösterir, yerel kayıt ve kuyruk korunur.
2. Gerçek Supabase RLS, iki ayrı kullanıcı oturumu ve iki fiziksel cihaz bu
   ortamda doğrulanamadı. Migration sonrası gerçek JWT ile owner izolasyonu,
   CAS/çakışma ve replay geri yükleme yeniden test edilmelidir.
3. Production deploy yalnızca migration + RLS kabulü ve temiz release
   doğrulamasından sonra yapılmalı; deploy sonrası production browser
   suite'leri tekrar çalıştırılıp deployment ID kaydedilmelidir.
4. Anonim production şema probe'u şu an `404` / `PGRST205` dönüyor
   (`research_sessions` henüz yok) — migration öncesi beklenen durum.

## Kurulum

1. Supabase → SQL Editor → `supabase/site/014_cloud_research.sql` içeriğini
   bir kez çalıştır (idempotenttir).
2. Publishable key ve Supabase URL zaten `alfa-chart-settings-store.mjs` ve
   research transport'ta yapılandırılıdır; service-role anahtarı gerekmez.
3. Siteye giriş yapıp **Research DB** panelinden "Yerel kayıtları buluta taşı"
   ile migration'ı başlat; uyarıları ve migration sonucunu kontrol et.
4. İkinci cihazda aynı hesapla giriş yapıp "Bulut listesini yenile" ve
   "Oturumu aç" ile Replay/Paper/MAE geri yüklemesini doğrula.
