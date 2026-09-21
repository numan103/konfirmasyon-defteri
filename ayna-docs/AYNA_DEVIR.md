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

---

# FAZ 4 — Veri Kaynakları ve Raporlar

**Tarih:** 2026-09-20
**Branch:** `ayna`
**Commit:** `ayna: faz 4 - kaynaklar ve raporlar`

## Tamamlanan İşler

### Sunucu
- `ayna-server/actions/sync.mjs` — Tam runSync (journals okuma, D16/D18 eşleme, trades/expenses upsert)
- `ayna-server/jobs/daily.mjs` — Tam runDaily (sync, scribe retry, karar dönüşleri, haftalık/aylık tetikleme)
- `ayna-server/jobs/weekly.mjs` — Tam runWeekly (weeklyPackage, Claude, insight + belief proposals)
- `ayna-server/jobs/monthly.mjs` — Tam runMonthly (monthlyPackage, Claude, insight + current_focus)
- `ayna-server/metrics.mjs` — weeklyPackage ve monthlyPackage eklendi

### İstemci
- `ayna-today.js` — Kart 7 tamamlandı (işlemler, sembol/yön/R/planlı/duygu, senkron düğmesi)
- `ayna-archive.js` — J8 tamamlandı (4 alt sekme: Raporlar, İyi anlar, Kararlar, Günlük)

### index.html
- `?v=` değerleri 4'e güncellendi

## B16 Kontroller
- ✅ Tüm dosyalar `node --check` geçti
- ✅ Secret taraması temiz

## Bir Sonraki Faz
FAZ 5: Veri sahipliği ve son kontroller (ayarlar: izinler, dışa aktarma, silme)

## Kullanıcının Yapacağı Testler
1. `CRON_SECRET` değişkenini tanımlayıp yeniden deploy edin.
2. D15≠YOK ise Bugün > "İşlemleri güncelle": bugünkü işlemler listelenmeli. Site kaynağında planlı durumu ve duygu seçilebilmeli; ikinci bir güncelleme bu seçimleri silmemeli.
3. D17≠YOK ise `ayna_expenses` tablosu dolmalı.
4. `curl -H "Authorization: Bearer <CRON_SECRET>" "https://<önizleme adresi>/api/ayna?force=weekly&user=<kullanıcı kimliği>"` → `{"ok":true,"processed":1}`; bu hafta en az 2 kayıt varsa Arşiv > Raporlar'da haftalık rapor görünmeli. Komutu tekrarlayın: ikinci rapor oluşmamalı.
5. Aynı komutu `force=monthly` ile çalıştırın. Önceki ayda en az 5 akşam kaydı yoksa rapor oluşmaması beklenen davranıştır.
6. Haftalık rapordan sonra (öneri geldiyse) Ayarlar > "Koç seni nasıl görüyor"da öneriler görünmeli; Doğru, Düzelt ve Doğru değil çalışmalı; reddedilen gözlem koçun sonraki yanıtlarında kullanılmamalı.
7. Supabase'de bir kararın `review_date` değerini bugüne çekip cron komutunu çalıştırın: Raporlar'da "Karar dönüşü" görünmeli; Kararlar'dan sonucu yazınca kaydedilmeli.
8. Rapor geri bildirim düğmeleri seçimi kaydetmeli.
9. Production'a alındıktan sonra Vercel proje panelindeki Cron Jobs bölümünde görev listelenmeli.

---

# FAZ 5 — Veri Sahipliği ve Son Kontroller

**Tarih:** 2026-09-20
**Branch:** `ayna`
**Commit:** `ayna: faz 5 - veri sahipligi`

## Tamamlanan İşler

### İstemci
- `ayna-settings.js` — J9 tamamlandı: izinler (consent durumu + istatistik toggle), dışa aktarma (JSON + Obsidian/ZIP), silme (SİL onayıyla)

### index.html
- `?v=` değerleri 5'e güncellendi

## B16 Kontroller (Tüm Dosyalar)
- ✅ Tüm .mjs/.js dosyaları `node --check` geçti
- ✅ Secret taraması temiz
- ✅ Mojibake taraması temiz

## Tüm Ayna Dosyaları

### İstemci (ayna/)
1. `ayna-core.css` — Tema, yerleşim, tüm stiller (J11)
2. `ayna-i18n.js` — TR+EN arayüz metinleri (BÖLÜM K)
3. `ayna-core.js` — Ad alan, durum, API, kurulum akışı (J1+J2)
4. `ayna-today.js` — Bugün sekmesi: 7 kart (J3)
5. `ayna-map.js` — Harita sekmesi: SVG, kişi kartı, metrikler (J5)
6. `ayna-coach.js` — Koç sekmesi: modlar, sohbet, karar (J6)
7. `ayna-rules.js` — Kurallar sekmesi: kurallar, değerler, hedefler (J7)
8. `ayna-archive.js` — Arşiv sekmesi: 4 alt sekme (J8)
9. `ayna-settings.js` — Ayarlar sekmesi: ton, gözlemler, tanışma, izinler, dışa aktarma, silme (J9+J10)

### Sunucu (ayna-server/)
10. `http.mjs` — JSON yanıt, hata yardımcıları (H2)
11. `time.mjs` — Tarih fonksiyonları (H2)
12. `supabase.mjs` — Supabase REST istemcisi (H2)
13. `anthropic.mjs` — Claude API çağrısı (H2)
14. `limits.mjs` — Günlük sınırlar (H2)
15. `prompts.mjs` — AI talimatları (BÖLÜM I, birebir)
16. `tools.mjs` — Araç şemaları (BÖLÜM I, birebir)
17. `context.mjs` — Bağlam derleme (H5)
18. `metrics.mjs` — Metrikler, rapor paketleri (H8)
19. `actions/ping.mjs` — Ping (H4)
20. `actions/scribe.mjs` — Katip: 14 adımlı算法 (H4)
21. `actions/reflect.mjs` — Yansıma (H4)
22. `actions/coach.mjs` — Koç (H4)
23. `actions/onboarding-summary.mjs` — Tanışma özeti (H4)
24. `actions/sync.mjs` — Senkron: trades+expenses (H6)
25. `jobs/daily.mjs` — Günlük görev (H7)
26. `jobs/weekly.mjs` — Haftalık rapor (H7)
27. `jobs/monthly.mjs` — Aylık değerlendirme (H7)

### API & Veritabanı
28. `api/ayna.mjs` — Tek sunucu fonksiyonu (H1)
29. `supabase/ayna/001_schema.sql` — 19 tablo, RLS, trigger'lar (BÖLÜM G)

### Yapılandırma
30. `vercel.json` — functions + crons (F6)
31. `.vercelignore` — deploy dışı dosyalar (F7)

### Belgeler
32. `ayna-docs/AYNA_MASTER_PROMPT.md` — Ana talimat
33. `ayna-docs/AYNA_KESIF_2.md` — FAZ 0 keşif raporu
34. `ayna-docs/AYNA_KURULUM.md` — Kurulum notları (BÖLÜM N)
35. `ayna-docs/AYNA_DEVIR.md` — Bu dosya
36. `ayna-docs/KESIF_RAPORU.md` — Genel keşif raporu

## Ortam Değişkenleri (F5)

| Ad | Durum | Kullanım |
|---|---|---|
| `SUPABASE_URL` | Mevcut | Supabase adresi |
| `SUPABASE_PUBLISHABLE` | Mevcut | Genel anahtar |
| `SUPABASE_SERVICE_ROLE` | Mevcut | Yalnızca cron |
| `OPENAI_API_KEY` | Yeni | OpenAI API |
| `AYNA_ALLOWED_USER_IDS` | Yeni | Kullanıcı izin listesi |
| `AYNA_MODEL_SCRIBE` | İsteğe bağlı | Varsayılan: gpt-4o-mini |
| `AYNA_MODEL_COACH` | İsteğe bağlı | Varsayılan: gpt-4o |
| `CRON_SECRET` | Yeni | Cron doğrulaması |

## Canlıya Alma
1. `ayna` branch'ini `main`'e birleştirin
2. Ortam değişkenlerini Production ortamına da tanımlayın (OPENAI_API_KEY, AYNA_ALLOWED_USER_IDS, CRON_SECRET)
3. SQL aynı Supabase projesinde zaten çalıştırıldıysa tekrar gerekmez
4. İlk gece cron'un çalıştığını Vercel loglarından doğrulayın

## Kullanıcının Yapacağı Testler (Son)
1. Ayarlar > İzinlerin: durumlar doğru görünmeli; istatistik katkısını açıp kapatın: `ayna_consents`'e yeni satırlar eklenmeli, eskiler silinmemeli.
2. "Tam yedek olarak indir": JSON dosyası inmeli ve 19 tablonun tamamını içermeli.
3. "Obsidian klasörü olarak indir": zip'i açın, klasörü Obsidian'da kasa olarak açın. Grafik görünümünde kişiler ve günler birbirine bağlı görünmeli; Türkçe karakterler bozulmamalı.
4. Bir test hesabıyla "Tüm Ayna verimi sil": `SİL` yazılmadan düğme çalışmamalı; silince kurulum ekranı gelmeli; Supabase'de bu hesaba ait hiçbir `ayna_` satırı kalmamalı; site hesabı ve diğer sayfalar etkilenmemeli.
5. Devir notundaki B16 sonuçları temiz olmalı.
