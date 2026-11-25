# ALFA Charts — güvenli production yayın checklist'i

**Durum: NO-GO.** Bu belge işlem onayı değildir. Production migration/deploy,
plan yükseltme, backup/restore veya veri değişikliği yapılmadı. İşaretlenmemiş
maddeler gerçek kanıt bekler; yazılı rollback planı DB yedeği sayılmaz.

## 0. Sabit kapsam ve mevcut kanıt

- [x] Yedi uygulama geliştirmesi + migration düzeltmeleri release geçmişinde.
  Referans kod HEAD'i `e963ce1`; `afa2222`, `c1dc8ec`, `b68da37` dahil.
  Bu görevin ekleri yalnız katalog SQL/test/belgeleridir.
- [x] Migration hash'i doğrulandı:
  `B48C10061DFD79DB6323445100C6062515720DAF18FAFAA90B257BD0FD968AD9`.
- [x] Geniş default privileges/kolon grant'leri altında migration testi: 8/8.
- [x] Yeni salt-okunur postflight doğrulaması: 4/4 izole PostgreSQL testi.
- [x] Tam unit suite yeniden geçti: 1219/1219.
- [x] Production katalog sorgusu yetkili oturumda tamamlandı:
  `2026-11-25T14:30:23Z`, proje `fssrtlpjqbavzomynwmg`.
  Workspace yok, isim çakışması yok, mevcut settings/drawings RLS açık.
- [x] Production default grants'in geniş olduğu gerçek katalogda doğrulandı.
- [x] Backup/PITR ekranları incelendi: FREE plan, hosted backup dahil değil;
  PITR Pro add-on. Gerçek harici backup/restore kanıtı yok.
- [ ] Yayınlanacak kesin SHA/artifact ID, operatör ve UTC pencereyi release
  kaydına yaz. “O anki main” veya mobile worktree'den yayın yapma.

## 1. Gerçek API'li staging — zorunlu

- [ ] Onaylı staging URL'si, izole Supabase proje ref'i ve aday SHA doğrulandı.
  Production URL'sini staging diye kullanma; production verisine test yazma.
- [ ] İzole ortamda yalnız `040_chart_workspaces.sql` standalone çalıştırıldı;
  ikinci uygulama da hatasız. Preflight/postflight dosyaları migration değildir.
- [ ] `040_chart_workspaces_postflight.sql` sonucu PASS olarak kaydedildi.
- [ ] İki test hesabıyla kendi workspace erişimi ve cross-account red/izolasyon,
  stale revision CAS ve conflict çözümü gerçek API üzerinden doğrulandı.
- [ ] `egress.browser.mjs` staging URL'sinde gerçek JSON/API/resim/401
  sınırlarıyla geçti. Fixture/static-server veya eski production testi sayılmaz.
- [ ] Dört timeframe, symbol sync, legend, geçmiş tarih/preset ve çizim anchor
  koruması staging'de smoke edildi.

**Şu an BLOCKED:** preview deployment listesi 0; onaylı gerçek staging/API
ortamı yok. Otomatik yeni ortam veya ücretli kaynak oluşturulmadı.

## 2. Production yedeği ve restore kanıtı — zorunlu

- [ ] Yetkili operatör kullanılacak yöntemi onayladı:
  sağlayıcı backup/PITR veya yönetilen şifreli manuel logical backup.
  Free Plan'da mevcut hosted backup varmış gibi davranma; otomatik upgrade yapma.
- [ ] Backup, doğru production proje/DB kimliğine bağlandı; backup ID/dosya
  manifesti, UTC tarihi, SHA256 veya sağlayıcı bütünlük bilgisi, güvenli konum
  ve saklama süresi kaydedildi. Parola/DB URL secret'ı repoya/loga yazılmadı.
- [ ] Kapsam doğrulandı: kullanıcı verisi + şema/constraint/index/sequence'ler,
  RLS/policy/ACL metadata'sı, gerekli role mapping ve Supabase auth bağımlılıkları.
  CSV tablo export'u veya schema-only dump tam kurtarma kanıtı değildir.
- [ ] Gerekliyse Storage objeleri ayrıca kapsandı: DB yedeği dosya byte'larını
  otomatik içeriyor varsayma.
- [ ] Gerçek backup **production olmayan izole hedefe** başarıyla restore edildi.
  Production üzerinde deneme restore'u yapılmadı.
- [ ] Restore edilen şema/constraint/RLS/ACL, kayıt sayıları/bütünlük ve
  auth/role mapping karşılaştırıldı; iki test hesabıyla işlev doğrulandı.
- [ ] Backup sahibinin erişimi, restore komutu/araç sürümü, sonuç ve ölçülen
  kurtarma süresi kayda girdi. RTO/RPO tahmin değil gerçek kanıta dayanıyor.

**Şu an BLOCKED:** gerçek backup artifact'i ve izole restore kanıtı yok.

## 3. Son production preflight ve ayrıca açık işlem onayı

- [ ] Yayın penceresinde `040_chart_workspaces_preflight.sql` sonucu yenilendi;
  önceki kontrolden sonraki schema/role drift karşılaştırıldı.
- [ ] Migration uygulayacak rolün public-schema nesne oluşturma ve
  `auth.users` foreign-key için gereken yetkileri doğrulandı.
- [ ] Client rol üyelikleri/BYPASSRLS, owner, default ACL ve schema/type/index
  adları uygun; uyumsuz tanımda otomatik ilerlenmiyor.
- [ ] Önceki çalışan deployment ID kaydedildi ve hâlâ kullanılabilir:
  `783d6b1c-fed2-4058-bc97-8d30b9de724d` / `7ed093a`.
- [ ] Operatör, backup/restore ve staging kanıtlarını gözden geçirdi.
- [ ] Kullanıcıdan/operatörden production migration ve deploy için **ayrıca
  açık onay** alındı. Bu hazırlık görevleri o onay değildir.

## 4. Önce migration — yalnız onay sonrası

- [ ] Doğru production proje/rol ve dosya hash'i son kez karşılaştırıldı.
- [ ] Yalnız `040_chart_workspaces.sql` çalıştırıldı. Kendi BEGIN/COMMIT,
  timeout ve advisory lock'u var; dış transaction'a sarmalanmadı.
- [ ] Hata halinde duruldu/ROLLBACK doğrulandı; politika/tablolar körlemesine
  silinmedi ve sınırsız tekrar yapılmadı.
- [ ] Schema cache yenilendi; yeni tablo API'de beklenen biçimde görünüyor.
- [ ] `040_chart_workspaces_postflight.sql` JSON sonucu PASS olarak kaydedildi.
  Tablo yokluğu/boş sonuç PASS sayılmadı.
- [ ] Mevcut settings/drawings politikaları ve verisi etkilenmedi.

## 5. Sonra uygulama — yalnız migration kontrolleri geçerse

- [ ] Onaylı tam SHA/artifact yayınlandı; mobile worktree kullanılmadı.
- [ ] HTML ana asset'i `v=66` ve bağlı modül/cache sürümleri doğrulandı.
- [ ] Anon erişim sınırları, giriş yapmış hesabın workspace kaydı, farklı cihazda
  restore, sync tercihleri ve doğrulanmış conflict çözümü smoke edildi.
- [ ] Tarih/preset, çizim/indikatör ve farklı timeframe'lerde sembol değişimi
  korunuyor; eski yerel workspace kayıtları okunuyor.
- [ ] API hata/çatışma oranı izlendi; kullanıcı içerikleri loglanmadı.

## 6. Durdurma ve kurtarma

- [ ] Migration hatasında uygulama yayınlanmadı; transaction sonucu incelendi.
- [ ] Uygulama sorunu varsa onaylı operatör eski Pages artifact'ine döndü.
  Workspace tablosu/verileri DROP/TRUNCATE edilmedi; localStorage silinmedi.
- [ ] Veri kurtarma gerekiyorsa gerçek backup önce izole ortamda doğrulandı;
  güncel bulut ve ilgili yerel kopya ayrı korundu.
- [ ] Yalnız gerekli hesap/bağlam onaylı ve revision-kontrollü işlemle
  kurtarıldı; tüm production eski snapshot ile körlemesine ezilmedi.
- [ ] İçerik/revision tekrar okuması doğrulanmadan otomatik sync açılmadı.

**Yayın sırası:** staging → production preflight/yedek/restore kanıtı → açık
onay → migration → salt-okunur postflight → uygulama → smoke/izleme.
