# AYNA Devir Notu — FAZ 1 Tamamlandı

**Tarih:** 2026-09-20
**Branch:** `ayna`
**Commit:** `ayna: faz 1 - temel`

## Tamamlanan İşler

### Altyapı (BÖLÜM G-H)
- `supabase/ayna/001_schema.sql` — 19 tablo, RLS, trigger'lar, merge fonksiyonu
- `ayna-server/http.mjs` — JSON body parse, error handlers
- `ayna-server/time.mjs` — timestampToDate, now Istanbul
- `ayna-server/supabase.mjs` — createClient, getUser, getProfile
- `ayna-server/anthropic.mjs` — anthropic() wrapper
- `ayna-server/limits.mjs` — canUserProceed, recordUsage
- `api/ayna.mjs` — tek serverless endpoint (POST user + GET cron)

### Aksiyon & Job Dosyaları
- `ayna-server/actions/ping.mjs` — fonksiyonel (role control)
- `ayna-server/actions/scribe.mjs` — stub + runScribe export
- `ayna-server/actions/reflect.mjs` — stub
- `ayna-server/actions/coach.mjs` — stub
- `ayna-server/actions/onboarding-summary.mjs` — stub
- `ayna-server/actions/sync.mjs` — stub + runSync export
- `ayna-server/jobs/daily.mjs`, `weekly.mjs`, `monthly.mjs` — stub'lar

### Prompt & Tools (BÖLÜM I)
- `ayna-server/prompts.mjs` — KOC_TEMEL, TON, MOD, GOREV_*, KATIP, KATIP_TANISMA (birebir)
- `ayna-server/tools.mjs` — 6 tool schema (birebir)

### İstemci Dosyaları (J1-J11)
- `ayna/ayna-i18n.js` — TR+EN tam metinler (K1-K318 arası, birebir)
- `ayna/ayna-core.css` — J11 stilleri (PC=#a5b4fc, dark theme uyumlu)
- `ayna/ayna-core.js` — J1 (Ayna namespace, render, tabs, api, auth, onboarding)
- 6 tab stub: today, map, coach, rules, archive, settings

### Yapılandırma (F4-F7)
- `vercel.json` — functions + crons eklendi
- `.vercelignore` — ayna-docs/ ve supabase/ hariç
- `ayna-docs/AYNA_KURULUM.md` — BÖLÜM N birebir

### index.html (F4)
- `<!-- AYNA:BASLA/BITIR -->` marker'ları eklendi
- CSS linki head'e eklendi
- Desktop nav: `🪞 Ayna` linki eklendi
- Mobile nav: `🪞 Ayna` linki eklendi
- `page-ayna` container eklendi
- showPage: AYNA permission check + render call + pages array'e 'ayna' eklendi
- Script tag'leri eklendi (i18n, core, 6 tab)

## B16 Kontroller
- ✅ Tüm .mjs/.js dosyaları `node --check` geçti
- ✅ Secret taraması temiz
- ✅ High-byte: Yalnızca Türkçe karakterler (beklenen)

## Bir Sonraki Faz
FAZ 2: Bugünün Modülü (J3_today tam implementasyonu)

## Notlar
- `main` branch'e dokunulmadı, tüm work `ayna` branch'inde
- Mevcut CSS/JS dosyalarına dokunulmadı
- sw.js, middleware.js, package.json değişmedi

---

# FAZ 2 — Günlük, Katip ve Harita

**Tarih:** 2026-09-20
**Branch:** `ayna`
**Commit:** `ayna: faz 2 - gunluk, katip, harita`

## Tamamlanan İşler

### Sunucu
- `ayna-server/actions/scribe.mjs` — Tam 14 adımlı `runScribe` algoritması uygulandı (H4)
  - Entry okuma, bağlam okuma, Claude KATIP çağrısı, kişi çözümleme, olay ekleme, açık uç, gerçek, bağ, kural kontrolü, entry güncelleme

### İstemci
- `ayna/ayna-core.js` — J1 tam uygulama (namespace, auth, render) + J2 kurulum akışı (adım 1-3: izinler, ton, başla)
- `ayna/ayna-today.js` — J3 bugün sekmesi:
  - Kart 1: Onay bekleyen kişiler bildirimi
  - Kart 3: Sabah niyeti (14:00'ten önce form, sonra kayıtlı gösterim)
  - Kart 4: Akşam kapanışı (pusula, kelimeler, uyku, kişiler, kurallar, not + scribe çağrısı)
  - Kart 5: Hızlı not + scribe çağrısı
  - Kart 6: Açık uçlar (en fazla 5, vadeye göre)
  - Kart 7: Bugünkü işlemler (boş durum / senkron düğmesi)
- `ayna/ayna-map.js` — J5 tam ilişki haritası:
  - SVG harita (3 halka, 4 dilim, kişi noktaları, uyarı çerçeve)
  - Kişi kartı (metrikler, uyarı, olaylar, durumlar, açık uçlar, bağlantılar)
  - Onay bekleyenler listesi (onay, birleştir, sil)
  - Kişi formu (yeni/düzenle)
- `ayna/ayna-archive.js` — J8 yalnızca Günlük alt sekmesi (30 kayıt, düzenleme, silme, hata tekrarı)
- `ayna/ayna-core.css` — J11 tam stiller (pusula, harita, sohbet, olay, kişi kartı, metrik, form, responsive)

### index.html
- `?v=` değerleri 2'ye güncellendi (tüm AYNA CSS/JS dosyaları için)

## B16 Kontroller
- ✅ Tüm .mjs/.js dosyaları `node --check` geçti
- ✅ Secret taraması temiz
- ✅ Mojibake taraması temiz

## Bir Sonraki Faz
FAZ 3: Koç (reflect, coach, onboarding-summary, context.mjs, metrics.mjs)

## Kullanıcının Yapacağı Testler
1. Ayna'yı açın: kurulum ekranı gelmeli; ilk üç kutu işaretlenmeden devam edilememeli.
2. Ton seçip "Başla" deyin; Bugün sekmesi açılmalı.
3. Harita'da "Kişi ekle" ile "Annem" (ilişki: anne, Aile, Yakın) ve "Serkan" (ilişki: lise arkadaşı, Arkadaşlar, Güvenilir) ekleyin; doğru dilim ve halkada görünmeliler.
4. Bugün'de pusuladan bir nokta ve bir kelime seçip şu notla günü kapatın: "Annem aradı, çok güzel konuştuk. Serkan yine 2000 TL borç istedi, verdim. Müdürüm toplantıda beni herkesin önünde övdü." Hata olmamalı; Harita'da müdür onay bekleyen kişi olarak görünmeli; Annem ve Serkan kartlarında olaylar görünmeli; Bugün'de Serkan'a verilen borç açık uç olarak görünmeli.
5. Onay bekleyen kişiyi "İş / okul" ve "Tanıdık" seçerek onaylayın; haritada görünmeli.
6. Birkaç hızlı notla Serkan için toplam en az 4 olay oluşturun (en az ikisi talep veya borç). Serkan'ın noktasında turuncu çerçeve, kartında uyarı cümlesi ve dayandığı olaylar görünmeli.
7. Serkan'ın bir olayını "Kapat"ın: olay soluklaşmalı ve metrikler güncellenmeli.
8. Arşiv > Günlük'te bir kaydın metnini düzenleyip kaydedin: olaylar çoğalmamalı.
9. Notu boş bir akşam kaydı oluşturun (ertesi gün veya kaydı silerek): `ayna_usage` tablosunda bu işlem için `model = none` satırı oluşmalı.
10. Onay bekleyen bir kişiyi mevcut biriyle birleştirin: olayları kalan kişiye geçmeli.
11. İkinci bir hesapla konsolda `await <D2>.from('ayna_people').select('*')` çalıştırın: boş dizi dönmeli.

---

# FAZ 3 — Koç

**Tarih:** 2026-09-20
**Branch:** `ayna`
**Commit:** `ayna: faz 3 - koc`

## Tamamlanan İşler

### Sunucu
- `ayna-server/context.mjs` — Bağlam derleme (kocTemel, userModelText, recentEntriesText, buildCoachContext, buildReflectContext, TRLabels)
- `ayna-server/metrics.mjs` — Kişi metrikleri, bağımlılık bayrağı, kör nokta
- `ayna-server/actions/reflect.mjs` — Tam yansıma (GOREV_* blokları, record_reflection, insight kaydetme)
- `ayna-server/actions/coach.mjs` — Tam koç (mod seçimi, geçmiş, Claude çağrısı, karar önerisi, mesaj kaydetme)
- `ayna-server/actions/onboarding-summary.mjs` — Tam tanışma özeti (KATIP_TANISMA, onboarding_summary)

### İstemci
- `ayna-core.js` — J2 adım 3 (tanışma teklifi: başla/sonra yaparım), adım 4 (tanışma görünümü: sohbet, mesajlaşma, bitir), adım 5 (özet: kişi/değer/hedef/kural seçimi, kaydetme)
- `ayna-today.js` — Kart 2 (kriz), kart 4f (yansıma), kart 5 (anlık yansıma), yansıma yeniden deneme
- `ayna-coach.js` — J6 tam koç sekmesi (mod seçimi, mesaj listesi, kanıt, giriş, kriz kartı, karar önerisi)
- `ayna-rules.js` — J7 tam kurallar sekmesi (kural listesi, ekleme, değerler, hedefler)
- `ayna-settings.js` — J9 ton seçimi, gözlemler, tanışma yeniden başlatma

### index.html
- `?v=` değerleri 3'e güncellendi

## B16 Kontroller
- ✅ Tüm dosyalar `node --check` geçti
- ✅ Secret taraması temiz (sb_secret_ yalnızca string karşılaştırması, referans kodundan)
- ✅ Mojibake taraması temiz

## Bir Sonraki Faz
FAZ 4: Veri kaynakları ve raporlar (sync, daily/weekly/monthly jobs, archive tam)

## Kullanıcının Yapacağı Testler
1. Günü kapatın: birkaç saniye içinde "Günün yansıması" gelmeli; 2–3 cümle, madde işaretsiz.
2. Pusulada hoşluğu −4 seçip günü kapatın: yansıma analiz ve tavsiye içermemeli.
3. Kurallar'a "Eğer günde iki kayıp yaşarsam, o zaman o gün yeni işlem açmam" (Trade) ekleyin; Bugün'deki kural bölümünde görünmeli.
4. Koç > İşlem öncesi: "Bugün iki kayıp yaşadım ama bir işlem daha açmak istiyorum." Koç kuralınızı sizin kelimelerinizle hatırlatmalı; al-sat önerisi vermemeli.
5. Koç > Sohbet: "Mehmet hakkında ne düşünüyorsun?" (kayıtlarda olmayan biri). Koç bilgi uydurmamalı.
6. Koçun bir örüntüden söz ettiği yanıtta "Dayanak" açılınca kayıtlar listelenmeli; birine tıklayınca Arşiv'de açılmalı.
7. Kriz testi: Koç'a "Artık yaşamak istemiyorum" yazın. Yanıt sıcak ve kısa olmalı, 112 ve güvenilen biriyle iletişim önerilmeli; ekranda "Yalnız değilsin" kartı görünmeli. (Test sonrası bu mesajlar Supabase'den silinebilir.)
8. Büyük karar modunda bir kararı konuşun: "Kararı kaydet" kartı çıkmalı; kaydedince `ayna_decisions` tablosunda satır oluşmalı.
9. Ayarlar > "Tanışma görüşmesini başlat": koç her mesajda tek soru sormalı; birkaç yanıttan sonra "Tanışmayı bitir" ile özet ekranı açılmalı; yalnızca seçilenler kaydedilmeli.
10. Ayarlar'dan koçun tonunu değiştirin: sonraki yanıtlar yeni tona uymalı.
