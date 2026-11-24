# ALFA Charts — production release readiness

## Güncel durum — release blockers düzeltmesi (2026-11-24)

**Yerel migration engelleri giderildi. Production yayın onayı hâlâ koşulludur.**
Production migration/deploy yapılmadı; gerçek kullanıcı verisine yazılmadı.

### İstenen altı kısa yanıt

| Soru | Güncel yanıt |
| --- | --- |
| 1. Migration iki kez hatasız çalışıyor mu? | **Evet.** İzole PostgreSQL üzerinde temiz kurulum ve veri içeren eski v1 tabloyla iki kez uygulama geçti. |
| 2. TRUNCATE yetkisi kapatıldı mı? | **Evet, anon/authenticated için.** Geniş default ACL ve kolon grant senaryolarında doğrulandı; REFERENCES/TRIGGER/DELETE ve desteklenen sürümlerde MAINTAIN de kapalı. |
| 3. Kullanıcılar birbirlerinin verilerine erişebiliyor mu? | **Test edilen şemada hayır.** Cross-account SELECT/UPDATE sıfır satır; yabancı hesap adına INSERT ve sahiplik transferi reddedildi. DELETE API'si hiçbir kullanıcıya açık değil. |
| 4. Production şema uyumu doğrulandı mı? | **Doğrulanamadı.** Yetkili DB/katalog erişimi yok; yalnız public-key GET/limit=0 kontrolü yapıldı. |
| 5. Yayın için hâlâ engel var mı? | **Operasyonel doğrulama kapıları var:** yetkili production schema/ACL preflight'ı ve API'li staging egress doğrulaması. Yerel M1/M2 açıkları kapandı. |
| 6. Hangi sırayla yayınlanmalı? | Staging'de migration iki kez + güvenlik testleri → yetkili salt-okunur production preflight/yedek → ayrı onay → **önce migration, sonra uygulama**, ardından smoke/rollback kontrolü. |

### Bağımsız commit'ler ve değişmeyen kapsam

- `afa2222` — İdempotency, transaction/timeout/advisory lock, tablo ve politika
  sözleşmesi kontrolü; PostgreSQL tekrar uygulama testleri.
- `c1dc8ec` — Tablo/kolon allowlist'i, effective-grant/rol kontrolü, service-role
  koruması, RLS ve eski v1 verileriyle güvenlik regresyonları.
- Ayrı validation/rapor commit'i bu belgenin güncel bölümünü ve test çalıştırma
  yönergelerini içerir.
- Uygulama/indikatör/drawing/watchlist/multi-chart kaynakları değiştirilmedi.
  Önceki yedi geliştirme browser regresyonlarında korundu.
- `C:/ALFA-CHARTS-MOBILE` için bu düzeltme görevinin başında/sonunda HEAD,
  porcelain durum ve değişmiş/untracked 14 dosyanın SHA256 snapshot'ları
  birebir aynı çıktı. Mobile worktree'ye dosya yazılmadı veya test kurulmadı.
- Başlangıçta bu rapor önceki denetimin untracked çıktısıydı; mevcut içeriği
  aşağıda **arşiv** olarak korundu. Eski NO-GO/M1/M2 ifadeleri güncel durum değil,
  düzeltme öncesi bulgulardır.

### Migration artık neyi garanti ediyor?

Dosya: `supabase/site/040_chart_workspaces.sql`

Yeni SHA256:
`B48C10061DFD79DB6323445100C6062515720DAF18FAFAA90B257BD0FD968AD9`

- Kendi BEGIN/COMMIT transaction'ı, `lock_timeout=5s`,
  `statement_timeout=60s` ve transaction advisory lock'u var. **Başka transaction
  dışından** uygulanır; hata halinde rollback edilir.
- Mevcut aynı adlı tablo için kolon/tip/not-null/default, PK/FK ve gereken check
  constraint'leri doğrulanır. Uyumsuz tabloyu yeniden kurmak veya veri silmek yok.
- Var olan üç owner-only RLS politikası uygunsa OID'leri korunarak atlanır.
  `duplicate_object` hatası körlemesine yutulmaz. Farklı/bilinmeyen politikada
  fail-closed; politika DROP/rewrite yapılmaz. Eski v1'in explicit UPDATE
  WITH CHECK tanımı da kabul edilir.
- Yalnız workspace tablosunun PUBLIC/anon/authenticated **tablo ve kolon**
  yetkileri geri alınıp authenticated için SELECT/INSERT/UPDATE verilir.
  İstemci DELETE politikası/izni oluşturulmaz.
- Service role için yönetim yetkileri açıkça korunur; migration owner'ın
  sahipliği ve tüm rollerin superuser/BYPASSRLS/inherit özellikleri değiştirilmez.
- Global/schema-wide default privileges ve ortak rol üyelikleri değiştirilmez.
  Böylece başka tabloların erişimi bozulmaz. Default grant'lerin yeni tabloya
  taşınması her uygulamada hedef tabloya özel REVOKE/allowlist ile temizlenir.
- Başka bir rol üyeliğinden kalan tehlikeli etkin yetki veya client'ın tablo
  owner üyeliği/BYPASSRLS yetkisi varsa migration ortak rolü değiştirmez:
  **hata verip geri alır**, manuel inceleme ister.
- Uyumsuz production katalog veya rol yapısı “başarılı migration” sayılmaz.
  Aşağıdaki arşivdeki salt-okunur preflight ve veri kaybetmeyen rollback planı
  geçerlidir; M1/M2 düzeltmesini yeniden yapma adımı artık tamamlanmıştır.

### Yeniden çalıştırılan testler

| Kapsam | Sonuç |
| --- | --- |
| Tam unit suite (`tests/*.test.mjs`) | **1219/1219 PASS**, 0 fail/skip |
| PostgreSQL entegrasyon suite'i | **8/8 PASS**, 0 fail/skip |
| Alfa Charts kapsamındaki 18 Playwright script'i | **18/18 PASS** |
| Tüm repo browser script'leri | 46 çalıştırıldı: **45 PASS + 1 ortam bağımlılığı** |

PostgreSQL motoru **PGlite 0.6.0 (embedded PostgreSQL)**; izole, sentetik
Supabase auth/role şeması kullanılır. Production veya tam Supabase staging klonu
değildir. Kaynak: `tests/postgres/chart-workspaces.test.mjs`; eski sözleşme
fixture'ı: `tests/postgres/fixtures/chart-workspaces-v1.sql`.

Doğrulanan senaryolar:

- Temiz kurulum + ikinci uygulama; satır/revision/timestamp/policy OID koruması.
- Eski v1 tablo + iki hesabın mevcut satırları + iki kez upgrade.
- Başka settings/drawings/watchlist verileri, mevcut RLS ve tablo ACL'leri,
  default ACL'ler ve rol özelliklerinin değişmemesi.
- PUBLIC/anon/authenticated geniş default ACL ve sonradan verilmiş kolon
  SELECT/REFERENCES grant'lerinin daraltılması.
- Kendi kaydı için SELECT/INSERT/UPDATE ve CAS; eski revision'ın reddi.
- Yabancı kayıt SELECT/UPDATE izolasyonu; yabancı hesap adına INSERT ve
  UPDATE ile sahiplik transferinin RLS tarafından reddi; claimsiz oturumun reddi.
- Kendi/yabancı kayıt için DELETE yetki reddi. Ayrıca yalnız disposable DB'de
  kasıtlı DELETE grant'i verilse bile DELETE RLS politikası olmadığından sıfır
  satır silindi; migration tekrar uygulanınca bu test grant'i kaldırıldı.
- Anon SELECT/INSERT/UPDATE/DELETE/TRUNCATE reddi.
- Service role yönetim erişimi ve migration owner erişiminin korunması.
- Tehlikeli inherited grant/owner üyeliği ve uyumsuz şema/politikada atomik ret.

Test çalıştırma:

```powershell
node --test --test-reporter=tap $(Get-ChildItem tests -Filter *.test.mjs -File | ForEach-Object { $_.FullName })
$env:ALFA_PGLITE_PATH='<test-klasoru>/node_modules/@electric-sql/pglite/dist/index.js'
node --test tests/postgres/chart-workspaces.test.mjs
```

PGlite kurulumu ve standalone transaction yönergesi:
`supabase/site/README.md`. Test bağımlılığı repo dışında kuruldu; uygulama
package/lock dosyaları değiştirilmedi.

**Egress ayrı sınıflandırıldı:** `egress.browser.mjs`, API'li deployment'tan
landing JSON'u bekliyor. `127.0.0.1:4192` statik test sunucusu Pages Functions
sağlamadığından JSON okuma hatası verdi. Bu **ürün regresyonu olarak sayılmadı**;
API'li staging ortamı bağımlılığı olarak açık tutuluyor. Assertion kaldırılmadı
ve “46 browser testi geçti” iddiası yok. Tam browser log/exit-code listesi:
`C:/Users/Pc/AppData/Local/Temp/opencode/alfa-blockers-validation/browser-results.json`.

### Production: yalnız salt-okunur yeniden kontrol

2026-11-24 **20:44:29 UTC**, public API key ile GET ve `limit=0`:

- `chart_workspaces`: 404 / `PGRST205`, REST schema cache'te bulunamadı.
- `chart_settings`, `chart_drawings`: 401 / `42501`, anonim erişim reddedildi.
- `/alfa-charts`: 200, hâlâ `/assets/alfa-charts.mjs?v=64`.
- Salt-okunur Cloudflare listelemesinde production hâlâ `7ed093a` /
  `783d6b1c-fed2-4058-bc97-8d30b9de724d`.

Yetkili DB bağlantısı/service-role/Management API kimliği ortamda yoktu.
Gerçek production default ACL/rol üyelikleri/politika tanımları doğrulanmış
sayılmaz. Yeni migration production'da **çalıştırılmadı**.

### Güncel yayın kapıları

1. Yetkili salt-okunur katalog preflight'ı: client/service/migration owner
   rolleri, gerçek ACL/üyelikler, mevcut tablo/politikalar ve proje ref'i.
2. Production'a benzer API'li staging'de bu SQL'i **standalone** iki kez uygula;
   iki gerçek test hesabıyla RLS/cihazlar arası akışı ve egress'i doğrula.
3. Yedek/PITR geri dönüşünü doğrula; ayrıca production işlem onayı al.
4. Önce migration; schema-cache/RLS/ACL smoke başarılıysa uygulama artifact'i.
5. Geri dönüşte önceki uygulama artifact'ine dön; workspace tablosunu/satırlarını
   DROP/TRUNCATE etme. Yerel conflict yedekleri korunur; kurtarma revision
   kontrollü ve kullanıcı/operatör onaylı yapılır.

**Bu kapılar kapanmadan koşulsuz production GO verilmedi.**

---

## Önceki denetim — arşiv (düzeltme öncesi)

Aşağıdaki bulgular `b7406db` ve eski migration hash'i içindir. M1/M2 yukarıdaki
commit'lerle giderilmiştir; arşiv güncel test/migration durumu olarak okunmamalı.

Denetim tarihi: **2026-11-24**. Karar: **NO-GO / henüz yayına hazır değil**.

Bu çalışma yalnız release denetimidir. Uygulama, migration ve test kaynakları
değiştirilmedi. Production migration/deploy, uzak Git push veya veri kurtarma
işlemi yapılmadı. Aşağıdaki yayın adımları **uygulanmış işlem değil, plandır**.

## 1. Git ve yayın adayı

- İncelenen uygulama adayı: `b7406db36c64cfc18585df2ae3b7a4abaa19e894`.
- Denetim başında `git status --porcelain` boştu; worktree detached HEAD'dedir.
  Bu rapor denetimin beklenen yeni dosyasıdır; üretim kodu/SQL değişikliği yoktur.
- Son yedi geliştirme, mevcut production kaynağı `7ed093a` üzerinde tam yedi
  commit'tir:

| Commit | Kapsam |
| --- | --- |
| `72635d1` | Panel periyotları, aktif panel ve sync kapsamı |
| `17be5c4` | Çakışmada yerel ayar koruması |
| `42c1044` | Kısa history backfill ve bitiş noktası koruması |
| `f250354` | Native legend parametreleri ve imleç değerleri |
| `35697cc` | Normal Git Tarihe ve tamamlanan preset aralıkları |
| `7c4fea3` | Kullanıcı seçimiyle doğrulanmış bulut çözümü |
| `b7406db` | Hesap workspace'i ve cihazlar arası korumalı kayıt |

- Salt-okunur `wrangler pages deployment list` çıktısında son production:
  `783d6b1c-fed2-4058-bc97-8d30b9de724d`, kaynak `7ed093a`,
  `https://783d6b1c.alfa-traders.pages.dev`.
- `GET https://alfa-trader.com/alfa-charts`: HTTP 200,
  `/assets/alfa-charts.mjs?v=64`. Aday HTML'i `v=66` kullanır. Yeni yedi
  geliştirme bu denetimde production'a çıkarılmadı.
- Ana repo `main` ve mobile branch'leri farklı HEAD'lerdedir. İleride yayın
  yapılırken “o anki main/başka worktree” değil, ayrıca onaylanan aday SHA/artifact
  sabitlenmelidir.

## 2. Migration: kapsam ve mevcut verinin korunması

Dosya: `supabase/site/040_chart_workspaces.sql`

SHA256:
`7008FDB15AAB0E146677E23E9022B9C92EBAFAA95E01355686D10195E634096B`

### Olumlu bulgular

- Yeni `public.chart_workspaces` tablosu ekler; mevcut chart settings, drawings
  veya watchlist tablosunda ALTER/DROP/UPDATE/DELETE yapmaz.
- Anahtar `(user_id, name)`; `name='default'`; workspace JSON nesnesi ve en fazla
  65536 bayt; pozitif revision; `auth.users(id)` UUID foreign key'i.
- `ON DELETE CASCADE` yalnız hesap silinirse **o hesabın yeni workspace
  satırlarına** uygulanır; migration mevcut kullanıcıları silmez.
- Yeni tablo için RLS SELECT/INSERT/UPDATE sahibi `auth.uid() = user_id`.
- Temiz başlangıç yetkileriyle anonim erişim ve istemci DELETE reddediliyor.
- İstemci güncellemesi `user_id`, `name`, `revision` filtrelerini kullanır.
  Stale revision güncellemesi sıfır satır döndürür; istemci bunu çakışma sayar.
- Tablo/okuma erişilemezse uygulama bunu “boş bulut” kabul edip üzerine ilk
  kayıt yazmaz; mevcut yerel düzen korunur.

### Yayını durduran bulgular

**M1 — Dosya idempotent değil (doğrulandı).**

`CREATE TABLE IF NOT EXISTS` yalnız tablo yaratımını korur. Satır 14–16'daki
üç `CREATE POLICY` koşulsuzdur. İkinci çalıştırma:

```text
SQLSTATE 42710
policy "chart_workspaces_select" for table "chart_workspaces" already exists
```

Politika zaten varsa tanımının beklenen owner-only tanımla aynı olduğu
doğrulanarak atlanmalı; farklı tablo/politika yapısında migration açık hata ile
durmalıdır. Körlemesine “hata yutma” veya bilinmeyen politikaları silme uygun
değildir. Dosyaya bu denetimde düzeltme uygulanmadı.

**M2 — GRANT allowlist'i, önceden/default olarak verilmiş yetkileri daraltmaz
(izole senaryoda doğrulandı; production'daki varlığı bilinmiyor).**

Dosya `anon` için REVOKE yapar, fakat `authenticated`/`PUBLIC` için mevcut
geniş yetkileri kaldırmaz. `GRANT SELECT, INSERT, UPDATE`, daha önce verilmiş
DELETE/TRUNCATE gibi yetkileri iptal etmez. Yerel testte:

- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ... TO authenticated` simüle edildi.
- Migration sonrası `authenticated` hâlâ TRUNCATE yetkisine sahipti.
- RLS TRUNCATE'i sınırlamadığından, izole iki hesaba ait sentetik satırlar aynı
  tablo üzerinden silinebildi.

Bu **production'da aynı yetkilerin bulunduğu iddiası değildir**. Production
`pg_default_acl`, doğrudan ACL, PUBLIC ve rol üyelikleri okunmadan güvenlik
onayı verilemez. Düzeltilmiş migration, yalnız bu tablo üzerinde beklenmeyen
PUBLIC/anon/authenticated yetkilerini açıkça geri alıp gerekli allowlist'i
tanımlamalı; service-role/backup gereksinimi ayrıca doğrulanmalıdır.

**M3 — Aynı adlı mevcut tablo için yapısal preflight eksik.**

`IF NOT EXISTS` mevcut tablonun kolon/constraint/owner/ACL/policy tanımlarını
doğrulamaz. Farklı bir tabloyla ad çakışırsa script onun RLS ve yetkilerine
dokunabilir. Gerçek katalog preflight'ı ve mismatch halinde durma şartı gerekir.
Dosyanın kendisinde açık BEGIN/COMMIT yoktur; onaylı runner'da tüm migration
tek transaction içinde ve sınırlı lock/statement timeout ile uygulanmalıdır.

## 3. İzole PostgreSQL doğrulaması

Repo dependency'lerine dokunmadan, session temp alanına sabit sürüm
`@electric-sql/pglite@0.6.0` kuruldu. Bu gerçek embedded PostgreSQL motorudur;
Supabase production klonu değildir. `auth.users`, `auth.uid()`, anon ve
authenticated rolleri sentetik olarak oluşturuldu. Production bağlantısı yoktu.

| Kontrol | Sonuç |
| --- | --- |
| İlk migration çalıştırması | PASS |
| Mevcut settings/drawings/watchlist sentinel verileri | Değişmedi |
| Mevcut settings RLS politikası | Değişmedi |
| Hesabın kendi workspace SELECT/INSERT/UPDATE'i | PASS |
| Diğer hesabın satırlarını SELECT | 0 satır |
| Diğer hesabın satırlarını UPDATE | 0 satır |
| Diğer hesap adına INSERT | `42501`, RLS reddi |
| Anon SELECT | `42501`, yetki reddi |
| Temiz default ACL ile authenticated DELETE | `42501`, yetki reddi |
| Revision CAS / stale revision | PASS / 0 satır |
| İkinci migration çalıştırması | FAIL `42710` |
| Başarısız ikinci çalıştırmanın rollback'i | Mevcut workspace satırları korundu |
| Geniş default ACL senaryosu | TRUNCATE yetkisi kalıyor; güvenlik açığı modeli |

Kanıt dosyası, repo dışında:
`C:/Users/Pc/AppData/Local/Temp/opencode/alfa-release-audit/migration-results.json`.
Bu sonuçlar yalnız test edilen sentetik şema/yetki durumları için geçerlidir.

## 4. Production şema uyumluluğu — doğrulanan ve doğrulanamayan

Kontrol edilen proje, istemcideki sabit Supabase projesidir:
`fssrtlpjqbavzomynwmg`. Ortamda yetkili DB bağlantısı/service-role/Management API
kimliği bulunmadı; yerel `psql`, Docker ve Supabase CLI da bulunmadı. Cloudflare
deploy listesi erişimi DB katalog yetkisi sağlamaz.

2026-11-24 20:31:50 UTC civarında yalnız **GET**, public API key ve **limit=0**
ile yapılan kontroller; hiçbir kullanıcı satırı istenmedi:

| REST metadata kontrolü | Sonuç |
| --- | --- |
| `chart_workspaces` beklenen kolonları | HTTP 404, `PGRST205`, şema önbelleğinde tablo bulunamadı |
| `chart_settings` beklenen kolonları | HTTP 401, `42501`, anonim rol yetkisi reddedildi |
| `chart_drawings` beklenen kolonları | HTTP 401, `42501`, anonim rol yetkisi reddedildi |

- Bu sonuç, workspace tablosunun REST katmanında hazır olmadığını gösterir;
  temel katalogda kesinlikle bulunmadığını ispatlamaz. Cache/exposure farkı
  olabilir.
- Settings/drawings erişiminin reddedilmesi olumlu sınırdır; tam DDL, RLS
  tanımları, grants veya schema drift doğrulaması değildir.
- Repo DDL'i ile yeni tablonun beklenen sözleşmesi mantıken uyumludur. Ancak
  **production şemasıyla tam uyumluluk doğrulanamadı**; onay kapısı açıktır.
- Ayrıca deployment environment'taki Supabase proje ref'inin istemcideki ref ile
  aynı olduğu yetkili operatörce doğrulanmalıdır.

Yetkili operatörün production'da **salt-okunur transaction** içinde alması
gereken çıktı (bu denetimde çalıştırılmadı):

```sql
begin transaction read only;
select version();
select to_regclass('auth.users'), to_regclass('public.chart_workspaces'),
       to_regclass('public.chart_settings'), to_regclass('public.chart_drawings');
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where (table_schema='auth' and table_name='users' and column_name='id')
   or (table_schema='public' and table_name in
       ('chart_workspaces','chart_settings','chart_drawings'))
order by table_schema, table_name, ordinal_position;
select c.relname, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('chart_workspaces','chart_settings','chart_drawings');
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid=to_regclass('public.chart_workspaces');
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname='public'
  and tablename in ('chart_workspaces','chart_settings','chart_drawings');
select grantee, privilege_type
from information_schema.table_privileges
where table_schema='public' and table_name='chart_workspaces';
select pg_get_userbyid(defaclrole) as owner,
       defaclnamespace::regnamespace as schema, defaclobjtype, defaclacl
from pg_default_acl;
select rolname, rolbypassrls
from pg_roles where rolname in ('anon','authenticated','service_role');
select member::regrole, roleid::regrole from pg_auth_members
where member in (select oid from pg_roles
                 where rolname in ('anon','authenticated','service_role'));
rollback;
```

Bu çıktıda kullanıcı içerikleri bulunmamalı; beklenen PK/FK/size/revision
constraint'leri, default ACL ve etkin rol yetkileri ayrıca karşılaştırılmalı.

## 5. Release öncesi testlerin bu denetimde yeniden çalıştırılması

### Unit

```powershell
node --test --test-reporter=tap $(Get-ChildItem tests -Filter *.test.mjs -File | ForEach-Object { $_.FullName })
```

**1219 test, 1219 PASS, 0 FAIL, 0 SKIP.**

Mevcut workspace migration unit testi yalnız SQL metnindeki allowlist/no-delete
ifadelerini kontrol ediyordu. Bu testin geçmesi, M1/M2'nin güvenli olduğunu
kanıtlamaz; embedded PostgreSQL denetimi bu boşluğu ortaya çıkardı.

### Playwright — tüm repo script'leri

- Bu worktree'den ayrı yerel statik sunucu: `127.0.0.1:4191`.
- Chrome + mevcut harici Playwright kurulumu; repo dependency'leri değiştirilmedi.
- `tests/browser/*.browser.mjs` kapsamındaki **46 script'in tamamı** çalıştırıldı.
- **45 PASS, 1 FAIL**, timeout ile öldürülen test yok.
- Alfa Charts'ın 18 script'inin tamamı PASS; önceki yedi geliştirme regresyonları
  ve yeni kullanıcı akışları dahil. Dergi ve diğer site script'leri de koşuya dahil.
- Başarısız script: `egress.browser.mjs`, satır 15,
  `SyntaxError: Unexpected end of JSON input`. Bu script gerçek API'li deployment
  üzerindeki landing JSON'unu bekler; yerel statik server Pages Functions/API
  sağlamaz. Bu koşuda ortam kaynaklıdır; “candidate API egress testi geçti”
  denemez. Ayrı API'li staging/preview ortamında tekrar koşulması gerekir.
- Test assertion'ı kaldırılmadı, hata saklanmadı, üretim davranışı değiştirilmedi.

Tam script/exit-code/süre listesi ve loglar repo dışında:
`C:/Users/Pc/AppData/Local/Temp/opencode/alfa-release-audit/browser-results.json`
ve aynı klasördeki `*.browser.mjs.log` dosyaları.

## 6. Mobile worktree kontrolü

- Mobile worktree: `C:/ALFA-CHARTS-MOBILE`.
- Branch: `feature/iphone-mobile-v1`.
- HEAD: `3fdab49ba9d1f7e11356034a279e5644ba4ee6b3`.
- Başlangıçta zaten değiştirilmiş/untracked kullanıcı dosyaları vardı; bunlar
  temizlenmedi, resetlenmedi veya commit edilmedi.
- Denetim öncesi/sonrası HEAD, porcelain status ve değişmiş/untracked **14 dosyanın
  SHA256** snapshot'ları birebir aynı: **PASS**.
- Mobile kaynaklarında kurulum, browser testi, migration veya dosya yazımı
  yapılmadı. Test çıktıları bu worktree'nin dışında session temp'te tutuldu.

## 7. Doğru yayın sırası — yalnız plan

1. **NO-GO kapılarını kapat:** M1 tekrar çalıştırma, M2 etkin grants ve M3
   preflight/atomicity için ayrı, gözden geçirilmiş migration düzeltmesi hazırla.
   Bu denetimde mevcut SQL değiştirilmedi.
2. Yetkili salt-okunur production katalog preflight'ını al. Şema adı çakışması,
   `auth.users(id)` UUID/PK uyumu, tablo owner'ı, politikalar, default ACL ve
   Supabase proje ref'ini doğrula. Drift varsa otomatik ilerleme.
3. Yedek/PITR geri dönüş noktasını ve mevcut production deployment ID/SHA'sını
   kaydet; yedeğin gerçekten geri yüklenebilir olduğunu staging'de doğrula.
   Workspace zaten varsa RLS/ACL/DDL ve tüm ilgili satır revision'larını da yedekle.
4. Production'a benzer **izole staging** şemasında düzeltilmiş migration'ı iki
   kez uygula; ikinci çalıştırma başarılı olmalı, ilk çalıştırmanın verileri ve
   mevcut tablo politikaları korunmalı. Temiz ve geniş default ACL senaryolarını
   test et. Gerçek iki test hesabıyla RLS, anon denial, CAS, iki cihaz ve çakışma
   seçimlerini doğrula; API'li staging'de egress testini tekrar çalıştır.
5. Testler/backup/rollback kontrolü tamamlanınca **ayrıca production onayı al**.
6. **Önce database migration:** eski uygulama çalışırken eklemeli migration'ı
   tek transaction ve sınırlı timeout'larla uygula. Eski uygulama yeni tabloyu
   kullanmadığından uygulama önce yayınlanmak zorunda değildir.
7. Migration sonrası katalog/ACL ve iki test hesabıyla erişim sınırlarını kontrol
   et; schema cache hazır olmalı. Doğrulanmazsa uygulamayı yayınlama.
8. **Sonra uygulama:** ayrıca onaylanan SHA/artifact'i yayınla. HTML `v=66`,
   ilgili modül query-version'ları ve cache-revalidation davranışı doğrulansın;
   başka worktree'nin “main” durumunu yanlışlıkla deploy etme.
9. Önce sınırlı hesaplarla smoke: Git Tarihe/preset, çizim anchor'ları, dört
   timeframe ile symbol sync, legend, iki cihaz restore ve doğrulanmış conflict
   resolution. DB hata/çatışma oranı ve API hataları gözlensin; kullanıcı içeriği
   loglanmasın. Başarıdan sonra yayın tamamlandı sayılabilir.

Migration henüz yokken yeni istemci yerel fallback yapar; bu koruma, yanlış
yayın sırasını veya doğrulanmamış şemayı onaylamak için gerekçe değildir.

## 8. Rollback ve veri kurtarma planı — yalnız plan

### Uygulama rollback

- Kullanılabilir önceki production deployment:
  `783d6b1c-fed2-4058-bc97-8d30b9de724d` (`7ed093a`).
- Onaylı operatör Cloudflare Pages üzerinden bu artifact'e geri döner.
  Güncel worktree'den eski kodu tahminen rebuild/deploy etmek yerine kayıtlı
  artifact kullanılır; HTML ve asset version/cache revalidation kontrol edilir.
- Eklenen DB tablosunu **DROP/TRUNCATE etme**. Eski uygulama tabloyu kullanmaz;
  yeni sürümle oluşmuş workspace kayıtları korunabilir. Client storage temizleme
  veya kullanıcıya “tüm site verisini sil” talimatı yok.

### Migration hatası

- İleri migration tek transaction olmalı; hata halinde transaction rollback.
  Otomatik sınırsız tekrar veya kör policy silme yok.
- Ortam daha önce kısmi değişiklik almışsa önce mevcut DDL/ACL/policy/data
  snapshot'ı alınır; önceki snapshot ile karşılaştırılır. Veri içerebilecek yeni
  tabloyu “temiz kurulum” adına silme.
- Yetki problemi tespit edilirse onaylı operatör yalnız problemli yeni tablo
  erişimini kontrollü şekilde sınırlar; diğer tabloların politika/yetkilerini
  topluca değiştirmez. Uygulama rollback veya local fallback tercih edilir.

### Veri kurtarma

- DB yedeği/PITR önce izole ortama restore edilir; sadece hedef hesap ve
  `(user_id,name='default')` bağlamı karşılaştırılır. Güncel production'ı topluca
  eski yedeğin üzerine yazma.
- Bulutun güncel kopyası ve yerel JSON ayrıca arşivlenir. Kurtarma, yetkili
  hesap/operatör onayı ve current revision kontrolüyle CAS üzerinden yapılır;
  devam eden başka cihaz düzenlemeleri sessizce ezilmez.
- Uygulamanın `alfa-chart-tabs:v1:<owner>`, workspace/settings conflict backup
  anahtarları ve “Dışa Aktar” dosyaları korunur. **Tüm localStorage'ı export etme**:
  auth token'ları dışa aktarılmamalı. Yedekler erişim kontrollü/şifreli tutulur.
- Şema doğrulaması, sahiplik ve içerik/revision tekrar okuması başarıyla
  tamamlanmadan otomatik senkronizasyon yeniden açılmaz.
- Restore testi olmadan RTO/RPO veya “veri kaybı olmaz” garantisi verilmez.

## Sonuç

**Yayın onayı verilmedi.** Kod/regresyon testleri olumlu olsa da migration
idempotent değildir; geniş default ACL riski ve gerçek production katalog
uyumluluğu kapanmamıştır. API'li staging egress doğrulaması da eksiktir.
Bu rapor bu engelleri görünür kılar; hiçbir production işlemini yetkilendirmez.
