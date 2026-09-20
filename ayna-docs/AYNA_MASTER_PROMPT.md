# AYNA — OpenCode Ana Talimatı (Master Prompt)

Sürüm 1.0, 20 Eylül 2026. Bu belge, "Alfa Traders" sitesine eklenecek Ayna modülünün tek ve bağlayıcı tarifidir.

---

## BÖLÜM A — İnsan için kullanım (OpenCode bu bölümü uygulamaz)

1. Repo kökünde `ayna-docs` adlı bir klasör oluşturun ve bu dosyayı `ayna-docs/AYNA_MASTER_PROMPT.md` olarak kaydedin.
2. Faz 1 tamamlanana kadar hiçbir şeyi push etmeyin ve deploy etmeyin. (Kökteki `KESIF_RAPORU.md` ve `ayna-docs/` klasörü, Faz 1'de deploy dışına alınacak.)
3. OpenCode'a şu komutu verin:

```
ayna-docs/AYNA_MASTER_PROMPT.md dosyasını baştan sona oku. BÖLÜM B'deki kurallar kesindir. Yalnızca FAZ 0'ı uygula; bitince dur.
```

4. Oluşan `ayna-docs/AYNA_KESIF_2.md` dosyasını Claude'a verin. BÖLÜM D'deki Karar Tablosu doldurulacak ve bu dosyada güncellenecek.
5. Sonraki her faz için aynı kalıbı kullanın (N yerine faz numarası):

```
ayna-docs/AYNA_MASTER_PROMPT.md dosyasını baştan sona oku. BÖLÜM B'deki kurallar kesindir. ayna-docs/AYNA_DEVIR.md dosyasını oku. Yalnızca FAZ N'yi uygula; bitince dur.
```

6. Her faz bitince OpenCode'un gösterdiği kabul listesini uygulayın. Sorun yoksa sonraki faza geçin; sorun varsa sorunu ve OpenCode'un çıktısını Claude'a getirin.
7. OpenCode oturumlar arasında hafıza tutmaz; süreklilik `ayna-docs/AYNA_DEVIR.md` dosyasıyla sağlanır.

---

## BÖLÜM B — Kesin kurallar (OpenCode için; ihlal edilemez)

**B1. Kapsam.** Yalnızca bu belgede, istenen faz için yazılanı yap. Belgede olmayan hiçbir özellik, iyileştirme, refaktör, yeniden adlandırma, biçim düzeltmesi veya "daha iyi olur" değişikliği yapma. Mevcut kodda hata görsen bile düzeltme; `ayna-docs/AYNA_NOTLAR.md` dosyasına not düş.

**B2. Belirsizlik.** Bu belgede cevabı olmayan bir karar gerekirse tahmin etme, varsayım yapma. Soruyu `ayna-docs/AYNA_SORULAR.md` dosyasına numaralı olarak yaz, çalışmayı o noktada durdur ve kullanıcıya yalnızca şunu söyle: `DURDUM: ayna-docs/AYNA_SORULAR.md dosyasında soru var.`

**B3. Çelişki.** Bu belge ile mevcut kod ya da BÖLÜM D arasında çelişki varsa B2'yi uygula.

**B4. Faz disiplini.** Yalnızca kullanıcının söylediği fazı uygula. Faz bitince dur; sonraki faza kendiliğinden geçme. Faz 1 ve sonrası ancak BÖLÜM D'deki tüm zorunlu alanlar doluysa başlar; boş zorunlu alan varsa B2.

**B5. Dokunulmaz dosyalar.** `sw.js`, `middleware.js`, `package.json`, `/api` altındaki mevcut dosyalar, `index.html` içindeki mevcut CSS ve mevcut fonksiyon gövdeleri. Tek istisna BÖLÜM F4'te listelenen ekleme noktalarıdır.

**B6. İşaretleme.** `index.html`'e yapılan her ekleme işaretçiler arasında olur: HTML'de `<!-- AYNA:BASLA -->` ile `<!-- AYNA:BITIR -->`, JavaScript'te `// AYNA:BASLA` ile `// AYNA:BITIR`. İşaretçilerin dışında `index.html`'de tek karakter değişmez.

**B7. Bağımlılık.** Yeni npm paketi ekleme. Harici betik olarak yalnızca BÖLÜM J10'daki JSZip 3.10.1 kullanılabilir.

**B8. Gizli bilgiler.** Hiçbir anahtar, token veya şifre değeri koda, belgeye veya commit'e yazılmaz. Sunucu kodu gizli değerleri yalnızca `process.env` üzerinden okur. `SUPABASE_SERVICE_ROLE` yalnızca `ayna-server/supabase.mjs` içinde, `{ service: true }` ile yapılan çağrılarda okunur; bu çağrılar yalnızca cron akışında (`GET /api/ayna`) yapılır. İstemci dosyalarında (`/ayna/` klasörü) hiçbir gizli anahtarın adı bile geçmez.

**B9. Veritabanı.** SQL dosyasını yaz, çalıştırma. `ayna_` önekli olmayan hiçbir tabloya DDL veya yazma işlemi yapılmaz. Mevcut tablolar yalnızca BÖLÜM D'de adı geçenler olmak üzere ve yalnızca SELECT ile okunur.

**B10. Git ve deploy.** Deploy etme, push etme. Faz 1 başında çalışma ağacında commit'lenmemiş değişiklik varsa (yalnızca `ayna-docs/` klasörü hariç) dur ve bildir. `ayna` adlı branch'te çalış; yoksa mevcut branch'ten oluştur. Her faz sonunda tek commit at: `ayna: faz N - <kısa açıklama>`. Faz 0'da commit yok.

**B11. Kodlama.** Tüm dosyalar UTF-8 (BOM'suz). Mevcut dosyaların satır sonu biçimini koru. Türkçe karakterler bozulmamalı.

**B12. Stil.** İstemci kodunda (`/ayna/`) girinti, tırnak ve noktalı virgül kullanımında `index.html`'deki mevcut JavaScript stilini izle. Sunucu kodunda (`api/`) BÖLÜM H2'deki referans kodun stilini ve ES module sözdizimini (`import`/`export`) izle. H2'deki referans kod her durumda birebir kalır.

**B13. Birebir metin.** BÖLÜM I'daki yapay zeka talimatları ve araç şemaları, BÖLÜM G'deki SQL, BÖLÜM H2'deki referans kod ve BÖLÜM K'daki arayüz metinleri kelimesi kelimesine kullanılır; kısaltma, genişletme veya "iyileştirme" yapılmaz. BÖLÜM K'daki İngilizce karşılıklar anlam eklemeden birebir çevrilir. Arayüzde BÖLÜM K'da olmayan bir metin gerekirse B2.

**B14. Tarayıcıda kişisel veri yok.** Günlük metni, kişi bilgisi, sohbet içeriği ve rapor içeriği `localStorage`, `sessionStorage`, IndexedDB veya çerezlere yazılmaz. İzin verilen tek anahtar `ayna.tab`'dır (son açık sekmenin adı).

**B15. Güvenli gösterim.** Kullanıcıdan veya yapay zekadan gelen hiçbir metin `innerHTML` ile ham olarak basılmaz. Ya `textContent` kullanılır ya da `Ayna.esc()` ile kaçışlanır. Yapay zeka raporları yalnızca BÖLÜM J1'deki güvenli mini biçimlendirici ile gösterilir.

**B16. Faz sonu kontrolleri.** Her fazın sonunda sırayla çalıştır ve sonuçlarını devir notuna yaz:
1. Sözdizimi: `/ayna/` altındaki her dosya ile `ayna-server/` ve `api/` altındaki her yeni `.mjs` dosyası için `node --check <dosya>`.
2. Gizli bilgi taraması: `/ayna/` altında `sk-ant`, `sb_secret_`, `service_role`, `SERVICE_ROLE` geçmemeli. `ayna-docs/` hariç tüm repoda gerçek anahtar kalıbı bulunmamalı: `sk-ant-[A-Za-z0-9_-]{10,}|sb_secret_[A-Za-z0-9_-]{10,}`.
3. Bozuk karakter taraması: bu fazda değişen dosyalarda (`ayna-docs/` hariç) `Ã`, `Ä±`, `Ä°`, `ÅŸ`, `Åž`, `ÄŸ`, `Ã¼`, `Ã§`, `Ã¶` dizileri geçmemeli.
4. `git diff --stat` çıktısında yalnızca o fazda izin verilen dosyalar ve `ayna-docs/` altındaki belgeler olmalı. `index.html` farkındaki tüm eklemeler işaretçiler arasında olmalı.

**B17. Hata anında.** Kendi yazdığın koddaki sözdizimi hatasını düzeltebilirsin. Bunun dışında bir komut veya kontrol başarısız olursa alternatif yol deneme; hatayı devir notuna yaz ve B2 ile dur.

**B18. Devir notu.** Her faz sonunda `ayna-docs/AYNA_DEVIR.md` dosyasının sonuna şu başlıklarla ekle: Faz, Tarih, Değişen dosyalar, Yapılanlar, Kontrol sonuçları (B16), Açık konular, Kullanıcının yapacağı testler. "Kullanıcının yapacağı testler" başlığına o fazın BÖLÜM L'deki kabul listesini aynen kopyala. Ardından kabul listesini kullanıcıya aynen göster ve dur.

---

## BÖLÜM C — Bağlam

### C1. Site hakkında kesinleşen bilgiler

- Site "Alfa Traders" adında tek sayfalık bir uygulamadır (SPA). CSS ve JavaScript büyük ölçüde `index.html` içindedir.
- Sayfa geçişi `showPage(name)` fonksiyonuyla yapılır. Linkler `data-nav` özniteliği ve `?page=` parametresi taşır. Sayfa kapları `#page-<ad>` kimliğine sahiptir. Etkin sayfa `document.body.dataset.page` ile işaretlenir; `body[data-page="..."]` seçicileri sayfaya özel `--pc`, `--pc-soft`, `--glow-a`, `--glow-b` renklerini atar.
- `showPage` yönetici sayfaları için erişim kontrolü yapar (alfa, apps, basvuru, sosyalmetre, uyap, zaman, strateji, butce, portfoy), son sayfayı localStorage'a yazar, etkin nav linkini işaretler ve sayfaya özel render fonksiyonlarını çağırır.
- Masaüstü nav: `.navbar` (sticky), `.nav-links`, açılır menüler `.nav-drop`. Mobil nav: sağdan açılan çekmece, `.nav-mobile-body`, grup başlıklı düz liste. 680px altında hamburger menü.
- Supabase istemcisi `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` adresinden yüklenir. Sitede giriş, çıkış ve kullanıcı rozeti vardır.
- Barındırma Vercel'dir. `middleware.js` Edge runtime'da yalnızca botlar için Open Graph meta üretir ve yalnızca `/` ile `/index.html` yollarında çalışır. `/api/*` yolları vardır. Tanımlı ortam değişkenleri arasında `SUPABASE_URL` ve `SUPABASE_PUBLISHABLE` bulunur.
- `sw.js`: önbellek adı `alfa-v30`. Gezinme istekleri ağ öncelikli, statik dosyalar stale-while-revalidate. `/api/*` yolları ve farklı kökenli istekler önbelleğe alınmaz.
- Yazı tipleri Inter ve Sora (`--font-display`). İkonlar satır içi SVG. TR/EN dil düğmesi, koyu/açık tema ve `prefers-reduced-motion` desteği vardır.
- Kullanılabilir CSS değişkenlerinden bazıları: `--bg`, `--bg-2`, `--card`, `--card-2`, `--border`, `--text`, `--text-2`, `--text-3`, `--acc`, `--acc-2`, `--acc-soft`, `--green`, `--green-soft`, `--amber`, `--amber-soft`, `--red`, `--red-soft`, `--blue-txt`, `--blue-hover`, `--muted-2`, `--bar-bg`, `--hover-a`, `--hover-b`, `--ph`, `--radius`, `--shadow`, `--font-display`.

### C2. Ayna nedir

Ayna, kullanıcının günlüğünden, duygu kayıtlarından, ilişkilerinden, trade ve harcama verisinden derlenen bir hafıza üzerinde çalışan kişisel yaşam koçudur. Sabit ilkesi: **Koç bilgi değil anlayış biriktirir; bunu yargılamadan ve doğru zamanda geri verir.**

### C3. Tasarım ilkeleri (her kararda geçerlidir)

- Kullanıcının yazdığı hiçbir şey kaybolmaz. Yapay zeka hatası kaydı engellemez.
- Yapay zeka hüküm vermez, kanıt gösterir. Her içgörü dayandığı kayıtlara bağlanır.
- Kontrol kullanıcıdadır. Yapay zekanın bulduğu kişiler onaysız haritaya girmez; koçun kullanıcı hakkındaki gözlemleri onaysız kullanılmaz.
- Temel çok kullanıcılıdır. Her satır `user_id` taşır ve RLS ile korunur; bugün tek kullanıcı olsa bile.
- Görsel cesaret tek yerdedir: ilişki haritası. Arayüzün geri kalanı sitenin mevcut bileşenleriyle sakin ve tutarlıdır.
- Sadelik: bu belgede olmayan hiçbir şey eklenmez.

---

## BÖLÜM D — Karar Tablosu (FAZ 0 raporuna göre dolduruldu)

Faz 1 ve sonrası bu değerlere göre uygulanır. Satır numaraları FAZ 0 raporundaki `index.html` numaralarıdır; kodu numaraya değil içeriğe göre bul.

| Kod | Alan | Değer |
|---|---|---|
| D1 | AUTH_TIPI | `SUPABASE_AUTH`. Tek giriş yöntemi Supabase Auth'tur (e-posta ve şifre). |
| D2 | SUPABASE_ISTEMCI_ADI | `AUTH.client`. `AUTH` üst düzey `const` (satır 8211); istemci `bootAuth()` içinde oluşturulur ve "Beni hatırla" kapalıyken yeniden oluşturulur. |
| D3 | SUPABASE_ISTEMCI_ERISIMI | `GLOBAL`. Ayna kodu `AUTH.client` ifadesine adıyla doğrudan erişir (`window[...]` kullanılmaz) ve erişimi her çağrıda yapar; istemci referansını kendi içinde saklamaz. |
| D4 | ERISIM_KONTROLU | `showPage` başındaki `if (name === 'alfa' && !amAllowed()) name = 'home';` kalıbındaki satırlar (satır 12763-12771). Yetki `amAllowed()` ile belirlenir: `AUTH.user.email` değeri `ADMIN_EMAIL` sabitine eşitse yönetici. Eklenecek satır: `if (name === 'ayna' && !amAllowed()) name = 'home';` |
| D5 | SAYFA_KABI_ORNEGI | `<div id="page-butce" class="hidden bd-hidden">`. Tüm sayfa kapları `<div class="wrap">` (satır 4963) içindedir; son kap `#page-ek` satır 8080'de kapanır. Ayna kabı: `<div id="page-ayna" class="hidden">`, içinde yalnızca `<div id="ayna-root"></div>`. |
| D6 | NAV_ORNEGI_MASAUSTU | `<a href="?page=butce" class="nav-link" id="tab-butce" data-nav data-i18n="app.butce">💰 Alfa Defter</a>` |
| D7 | NAV_ORNEGI_MOBIL | `<a href="?page=butce" class="mnav-link" data-nav data-mnav="butce" id="mnav-butce" data-i18n="app.butce">💰 Alfa Defter</a>` |
| D8 | NAV_YERLESIMI | `TRADER_ACILIR`. Masaüstünde "⚡ Trader ▾" menüsünün `.drop-menu` bloğundaki ilk öğe (Check List'ten önce); mobilde "⚡ Trader" grubunun ilk öğesi. Her iki linkte `data-i18n` YOK, `style="display:none"` var. |
| D9 | RENDER_KANCASI | `showPage` sonundaki `if (name === 'data') renderData();` ile başlayan blok (satır 12810-12830). Eklenecek satır: `if (name === 'ayna' && window.Ayna) window.Ayna.render();` |
| D10 | I18N_YONTEMI | Site sözlüğü `I18N` (satır 26022, her anahtar `{ tr, en }`), çeviri `window.t(k)`, etkin dil `window.LANG` (`localStorage['alfa-lang']`, `tr` veya `en`). Ayna yalnızca kendi sözlüğünü (`AYNA_I18N`) kullanır, dili `window.LANG` üzerinden okur ve site sözlüğüne anahtar EKLEMEZ. |
| D11 | TEMA_YONTEMI | `<html data-theme="light">` / `"dark"`, `localStorage['alfa-theme']`, varsayılan koyu. Açık tema değişkenleri `html[data-theme="light"]` bloğunda tanımlıdır; bu yüzden Ayna yalnızca değişken kullanır. |
| D12 | BILESEN_SINIFLARI | panel: `.panel`; kpi: `.kpi` (iç: `.k-lbl`, `.k-val`, `.k-sub`); buton: `.btn`; buton_birincil: `.btn.solid`; buton_tehlike: `.btn.danger`; segmented: `.seg` (etkin düğme: `.on-gold`); chip: `.chip` (etkin: `.chip.on`); modal: kullanılmaz (Ayna kendi kart yerleşimini kullanır); input, select ve textarea için sitede ortak sınıf YOK, bu yüzden Ayna `ay-inp`, `ay-sel`, `ay-ta` sınıflarını yalnızca mevcut CSS değişkenleriyle tanımlar; toast fonksiyonu: YOK (Ayna `#ayna-flash` alanını kullanır). |
| D13 | CSS_ONEKI | `ay-` |
| D14 | AYNA_RENGI | `#a5b4fc` (rgb 165, 180, 252). Mevcut hiçbir sayfa renginde kullanılmıyor. |
| D15 | TRADE_KAYNAGI | `SITE_JOURNAL`. Trade kayıtları Supabase `journals` tablosunda, `data` JSON'unun `defter-data-v1` anahtarındaki dizide durur. Sitenin kendi Notion entegrasyonu bu diziyi doldurur; Ayna Notion'a bağlanmaz. |
| D16 | TRADE_ESLEME | Aşağıdaki D16 bloğu. |
| D17 | BUTCE_KAYNAGI | `SITE_JOURNAL`. Harcamalar aynı satırda, `data` JSON'unun `defter-butce-v1` anahtarındaki `entries` dizisindedir; kategori adları aynı nesnedeki `cats` dizisindedir. |
| D18 | BUTCE_ESLEME | Aşağıdaki D18 bloğu. |

### D16 — Trade eşlemesi (`data['defter-data-v1']` dizisindeki her öğe `t`)

```
source        = 'site'
source_id     = String(t.id)
symbol        = t.pair (metin değilse null)
direction     = t.dir === 'LONG' ? 'long' : t.dir === 'SHORT' ? 'short' : null
local_date    = isIsoDate(t.date) ? t.date : (t.ts sayıysa localDate(new Date(t.ts)) : satır atlanır)
opened_at     = t.ts sayıysa new Date(t.ts).toISOString(), değilse null
closed_at     = null
pnl           = Number(t.r) (sayı değilse null) — bu kaynakta değer R katsayısıdır
planned       = t.kKalite === 'Kurallı' ? true : t.kKalite === 'Zorlama' ? false : (alan gönderilmez)
note          = t.note (en fazla 500 karakter)
raw           = { strat: t.strat, model: t.model, criteria: t.criteria, kKalite: t.kKalite }
emotions      = hiçbir zaman gönderilmez (yalnızca kullanıcı Ayna'da seçer)
```

`pnl` alanı bu kurulumda para değil R katsayısı taşır. Bu yüzden arayüzde ve raporlarda `label.pnl` = `R` olarak gösterilir.

### D18 — Harcama eşlemesi (`data['defter-butce-v1'].entries` dizisindeki her öğe `e`)

```
source        = 'site'
source_id     = String(e.id)
local_date    = isIsoDate(e.date) ? e.date : satır atlanır
amount        = Math.abs(Number(e.amount)) (sayı değilse satır atlanır)
is_income     = e.type === 'gelir'
category      = cats dizisinde id === e.cat olan öğenin name değeri; yoksa e.cat
description   = e.note (en fazla 200 karakter)
currency      = 'TRY'
raw           = e
```

## BÖLÜM E — FAZ 0: Keşif (salt okunur)

**İzinli tek yazma:** `ayna-docs/AYNA_KESIF_2.md` dosyasını oluşturmak. Başka hiçbir dosya oluşturulmaz, değiştirilmez veya taşınmaz. Commit yok.

**Biçim:** Soruları sırayla, `## S1` … `## S22` başlıklarıyla yanıtla. Her yanıtta dosya adı ve satır numarası ver. Kod alıntılarını ``` blokları içinde birebir ver. Gizli değerleri (anahtar, token, şifre, e-posta adresi, kişisel veri) `***` ile maskele. Bilmediğin veya bulamadığın her şey için "BULUNAMADI" yaz; tahmin yazma.

- **S1. Dosya yapısı.** Repo kökündeki dosya ve klasör ağacı (`node_modules` ve `.git` hariç, iki seviye). `index.html` toplam satır sayısı. `index.html` dışında `.js` veya `.css` dosyası var mı; varsa hangileri ve `index.html`'de nasıl yüklendikleri.
- **S2. Supabase istemcisi.** `createClient` çağrısının bulunduğu satır(lar) (anahtarı maskele), atandığı değişkenin adı, tanımlandığı kapsam (en üst düzey betik mi, bir fonksiyon veya IIFE içi mi) ve `const`/`let`/`var` hangisi.
- **S3. Kimlik doğrulama.** İstemcinin `.auth` nesnesi üzerinden kullanılan tüm yöntemler (`signIn…`, `signUp`, `signOut`, `onAuthStateChange`, `getSession`, `getUser` vb.) ve geçtikleri satırlar. Oturumdaki kullanıcının kimliği uygulamada hangi değişken veya fonksiyonda tutuluyor? Supabase Auth dışında bir giriş sistemi var mı (kendi kullanıcı tablosu, şifre karşılaştırması vb.)?
- **S4. Yetki.** `showPage` içindeki erişim kontrolünün tam kodu. Kullanıcının yönetici olup olmadığı nasıl belirleniyor (tablo ve sütun, e-posta listesi, rol alanı vb.)? İlgili tam kod. Yetkisiz kullanıcıya bu sayfaların nav linkleri gizleniyor mu; nasıl?
- **S5. Tablolar.** Koddaki tüm `.from('...')` ve `.rpc('...')` çağrılarının listesi: ad, işlem (select/insert/update/delete/upsert), kullanılan sütunlar, hangi sayfa veya fonksiyonda. Repoda `.sql` dosyası veya `supabase/` klasörü var mı?
- **S6. Bütçe (Alfa Defter, `?page=butce`).** Veriler nerede saklanıyor (Supabase tablosu ve sütunları, localStorage anahtarı, başka)? Bir kaydın alan yapısı ve iki maskeli örnek. Kayıtlar kullanıcıya göre ayrılıyor mu; hangi sütunla?
- **S7. Trade verisi.** `?page=data` (Trade Günlüğü), `review`, `karne`, `portfoy` ve `defter` sayfalarının verisi nerede? Kayıt alan yapısı, iki maskeli örnek, sahip sütunu. Kodda `notion`, `api.notion.com` veya `NOTION` geçiyor mu? Geçiyorsa tüm yerleri.
- **S8. `/api` klasörü.** Tüm dosyalar; her dosyanın ilk 15 satırı (gizlileri maskele); kullandığı `process.env` adları; toplam fonksiyon dosyası sayısı; `_` ile başlayan dosya veya klasör var mı?
- **S9. Yapılandırma dosyaları.** `package.json`, `vercel.json`, `.vercelignore`, `.gitignore` ve `.env*` dosyaları var mı? Varsa içerikleri (değerleri maskeleyerek).
- **S10. `showPage`.** Fonksiyonun tam kodu, başlangıç ve bitiş satırlarıyla.
- **S11. Sayfa kabı.** `#page-butce` kabının açılış etiketinden ilk iç elemanına kadar olan HTML (birebir) ve kabın kapanış etiketi. Tüm `#page-*` kapları hangi ebeveynin içinde duruyor; sonuncunun kapanış satırı hangisi?
- **S12. Nav.** Masaüstünde "Alfa Defter" linkinin tam HTML'i; "Trader" açılır menüsünün tam HTML'i; mobilde "Alfa Defter" linkinin tam HTML'i; mobil "Trader" grubunun ilk iki öğesinin HTML'i; `data-mnav` ve `#tab-*` kullanımına birer örnek.
- **S13. Dil desteği.** "EN" düğmesinin çalışma şekli; çeviri sözlüğünün veya fonksiyonunun adı ve tanımlandığı satır; bir çeviri anahtarının tanımlanıp kullanılmasına HTML ve JavaScript tarafından birer örnek; etkin dilin nasıl okunduğu.
- **S14. Tema.** Açık/koyu tema değişiminin kodu; açık tema değişkenlerinin tanımlandığı yer; `--input-bg`, `--seg-bg` ve `--panel-alt` değerlerinin nerede atandığı.
- **S15. Bileşenler.** Şunların her biri için sitede kullanılan sınıf adı ve birer birebir HTML örneği: panel/kart, KPI kutusu, buton (normal, birincil, tehlike), input, select, textarea, segmented control (etkin durum dahil), chip/etiket (etkin durum dahil), modal/diyalog, toast/bildirim (fonksiyon adı ve imzası).
- **S16. Önek çakışması.** `ay-` veya `ayn-` ile başlayan bir sınıf veya kimlik var mı? `ayna` kelimesi herhangi bir dosyada geçiyor mu?
- **S17. Sayfa renkleri.** Tüm `body[data-page="..."]` bloklarının birebir içeriği.
- **S18. Mevcut sohbet penceresi.** Kimlik ve sınıf adları, z-index değerleri.
- **S19. Service worker.** `navigator.serviceWorker.register` satırı; build kimliğinin (`b88`) tanımlandığı yer.
- **S20. Betik sırası.** `</body>` öncesindeki tüm `<script>` etiketleri ve satır numaraları; ana uygulama betiğinin başladığı ve bittiği satırlar.
- **S21. Git.** Mevcut branch; son 5 commit (kısa hash ve mesaj); `git status` özeti; `KESIF_RAPORU.md` git tarafından takip ediliyor mu?
- **S22. Ortam.** `node -v` çıktısı ve işletim sistemi.

Dosyanın sonuna `FAZ 0 TAMAMLANDI` yaz. Kullanıcıya yalnızca şunu söyle ve dur: `FAZ 0 TAMAMLANDI. ayna-docs/AYNA_KESIF_2.md dosyasını Claude'a verin; BÖLÜM D doldurulacak.`

---

## BÖLÜM F — Mimari

### F1. Yeni dosyalar

```
ayna/                          İstemci (statik, herkese açık dosyalar; gizli bilgi içermez)
  ayna-core.css                Tema, yerleşim ve tüm Ayna stilleri
  ayna-i18n.js                 Arayüz metinleri (TR/EN)
  ayna-core.js                 Ad alanı, durum, API çağrısı, yardımcılar, sekme iskeleti, kurulum akışı
  ayna-today.js                Bugün sekmesi
  ayna-map.js                  Harita sekmesi ve kişi kartı
  ayna-coach.js                Koç sekmesi
  ayna-rules.js                Kurallar sekmesi
  ayna-archive.js              Arşiv sekmesi
  ayna-settings.js             Ayarlar sekmesi (dışa aktarım ve silme dahil)
api/
  ayna.mjs                     TEK sunucu fonksiyonu: POST kullanıcı işlemleri, GET günlük görev (Vercel Cron)
ayna-server/                   Sunucu yardımcıları (fonksiyon değildir; api/ayna.mjs tarafından içe aktarılır)
  http.mjs  time.mjs  supabase.mjs  anthropic.mjs  limits.mjs
  prompts.mjs  tools.mjs  context.mjs  metrics.mjs
  actions/ping.mjs  actions/scribe.mjs  actions/reflect.mjs  actions/coach.mjs
  actions/onboarding-summary.mjs  actions/sync.mjs
  jobs/daily.mjs  jobs/weekly.mjs  jobs/monthly.mjs
supabase/ayna/001_schema.sql   Veritabanı şeması (insan çalıştırır; deploy dışı)
ayna-docs/                     Belgeler (deploy dışı)
```

Neden tek fonksiyon: projede hâlihazırda 11 Vercel fonksiyonu var ve ücretsiz planda dağıtım başına fonksiyon sayısı sınırlıdır. Yardımcılar `api/` dışında durur ki fonksiyon sayılmasınlar; içlerinde gizli değer bulunmaz, yalnızca `process.env` okunur.

### F2. Veri akışı

```
Tarayıcı (ayna/*.js) ──Supabase JS, kullanıcı oturumu, RLS──────────────► Supabase ayna_* tabloları
Tarayıcı ──POST /api/ayna, Authorization: Bearer <kullanıcı JWT>──► api/ayna.mjs
        api/ayna.mjs ──REST, kullanıcı JWT, RLS──► Supabase
        api/ayna.mjs ──Anthropic Messages API────► Claude
Vercel Cron (günde bir) ──GET /api/ayna, Bearer CRON_SECRET──► api/ayna.mjs
        api/ayna.mjs ──REST, servis anahtarı, her sorguda user_id filtresi──► Supabase; ──► Claude
```

### F3. Güvenlik modeli

- Tüm `ayna_*` tablolarında RLS açıktır; tek politika `user_id = auth.uid()`'dir.
- Kullanıcı adına yapılan sunucu işlemleri kullanıcının JWT'siyle yapılır, dolayısıyla RLS sunucuda da geçerlidir. Servis anahtarı yalnızca cron'da kullanılır ve orada her sorgu `user_id` ile açıkça filtrelenir.
- `AYNA_ALLOWED_USER_IDS` izin listesinde olmayan kullanıcıya `/api/ayna` 403 döner. Liste boşsa kimse kullanamaz. Bu, yapay zeka maliyetine karşı kalkandır.
- İstemci tarafında sayfanın gizlenmesi yalnızca kullanım kolaylığıdır. Güvenlik RLS ve API kontrolleriyle sağlanır.
- Kişisel içerik tarayıcı depolamasına yazılmaz (B14). `/api/*` service worker tarafından önbelleğe alınmaz.
- Haritadaki kişiler için iletişim bilgisi (telefon, e-posta, adres, sosyal medya) alanı yoktur ve eklenmez. Kullanıcılar arasında kişi eşleştirmesi yapılmaz.

### F4. `index.html` ekleme noktaları (yalnızca bunlar)

1. `<head>` içinde, mevcut son `<link>` veya `<style>` etiketinden sonra:
   `<link rel="stylesheet" href="/ayna/ayna-core.css?v=1">`
2. `#page-*` kaplarının sonuncusunun kapanışından hemen sonra, D5'teki kapla birebir aynı etiket ve sınıflarla, `id="page-ayna"` olan bir kap. İçinde yalnızca `<div id="ayna-root"></div>` bulunur.
3. Masaüstü nav: D8=`UST_SEVIYE` ise "Alfa Defter" linkinden hemen sonra, D8=`TRADER_ACILIR` ise "Trader" açılır menüsünün (`.drop-menu`) ilk öğesi olarak, D6'daki yapıyla birebir aynı biçimde bir link: metin `🧠 Ayna`, hedef `?page=ayna`, kimlik `tab-ayna`, `data-nav` özniteliği var, `data-i18n` özniteliği YOK, `style="display:none"`.
4. Mobil nav: D8=`UST_SEVIYE` ise "Alfa Defter" linkinden hemen sonra, D8=`TRADER_ACILIR` ise mobil "Trader" grubunun ilk öğesi olarak, D7'deki yapıyla birebir aynı biçimde: `data-mnav="ayna"`, kimlik `mnav-ayna`, `data-i18n` YOK, `style="display:none"`.
5. `showPage` içinde üç ekleme: (a) yetki satırları arasına `if (name === 'ayna' && !amAllowed()) name = 'home';`; (b) fonksiyonun içindeki `pages` dizisine `'ayna'` eklenir (bu olmadan sayfa hiç gösterilmez); (c) D9'daki render bloğuna `if (name === 'ayna' && window.Ayna) window.Ayna.render();`
6. `</body>` etiketinden hemen önce, mevcut tüm betiklerden sonra, bu sırayla ve `defer`/`async` olmadan: `ayna-i18n.js`, `ayna-core.js`, `ayna-today.js`, `ayna-map.js`, `ayna-coach.js`, `ayna-rules.js`, `ayna-archive.js`, `ayna-settings.js`. Her biri `<script src="/ayna/<dosya>?v=1"></script>` biçiminde.
7. Yalnızca D3=`PENCEREYE_ATA` ise: Supabase istemcisinin oluşturulduğu satırdan hemen sonra `window.__aynaSb = <D2>;` (D3=`GLOBAL` olduğunda bu ekleme yapılmaz.)
8. Giriş sonrası yönetici nav öğelerini gösterip gizleyen blokta (D4'teki `isAdmin` hesabının yapıldığı yer), oradaki kalıbın aynısıyla iki link için görünürlük satırları eklenir:

```js
const aynaTab = document.getElementById('tab-ayna');
const aynaMob = document.getElementById('mnav-ayna');
if (aynaTab) aynaTab.style.display = isAdmin ? '' : 'none';
if (aynaMob) aynaMob.style.display = isAdmin ? '' : 'none';
```

Bir fazda istemci dosyalarından herhangi biri değiştiyse F4-1 ve F4-6'daki tüm `?v=` değerleri 1 artırılır (işaretçilerin içinde kalınarak).

### F5. Ortam değişkenleri

Değerleri insan Vercel panelinde tanımlar. Kod yalnızca adları kullanır.

| Ad | Durum | Kullanım |
|---|---|---|
| `SUPABASE_URL` | Mevcut | Supabase adresi |
| `SUPABASE_PUBLISHABLE` | Mevcut | Genel (publishable) anahtar |
| `SUPABASE_SERVICE_ROLE` | Mevcut (diğer fonksiyonlarda kullanılıyor) | Yalnızca cron akışı |
| `ANTHROPIC_API_KEY` | Yeni | Claude API |
| `AYNA_ALLOWED_USER_IDS` | Yeni | Virgülle ayrılmış Supabase kullanıcı kimlikleri |
| `AYNA_MODEL_SCRIBE` | İsteğe bağlı | Varsayılan `claude-haiku-4-5-20251001` |
| `AYNA_MODEL_COACH` | İsteğe bağlı | Varsayılan `claude-sonnet-5` |
| `CRON_SECRET` | Yeni | Cron doğrulaması |

### F6. `vercel.json`

Dosya mevcuttur ve içeriği `{ "alias": ["alfatraders.vercel.app"] }` şeklindedir. Mevcut `alias` anahtarı korunarak şu iki anahtar eklenir:

```json
{
  "functions": {
    "api/ayna.mjs": { "maxDuration": 60 }
  },
  "crons": [
    { "path": "/api/ayna", "schedule": "0 17 * * *" }
  ]
}
```

17:00 UTC, İstanbul saatiyle 20:00'dir. Vercel'in ücretsiz planında görev bu saatten sonraki bir saat içinde herhangi bir anda çalışabilir ve nadiren iki kez tetiklenebilir; günlük görev bu yüzden tekrar çalışmaya dayanıklı (idempotent) yazılır.

### F7. `.vercelignore` ve belgeler

`.vercelignore` varsa sonuna, yoksa yeni dosyaya şu iki satır eklenir: `ayna-docs/` ve `supabase/`. Faz 0'da (S5) repoda önceden var olan bir `supabase/` klasörü bulunduysa `supabase/` yerine `supabase/ayna/` satırı eklenir. Kökteki `KESIF_RAPORU.md` git'te takip ediliyorsa `git mv` ile, değilse normal taşıma ile `ayna-docs/KESIF_RAPORU.md` konumuna taşınır.

### F8. Zaman

Gün sınırları `Europe/Istanbul` saat dilimine göredir (profilde `timezone` alanı). Tüm tarih hesapları BÖLÜM H2'deki `time.js` fonksiyonlarıyla yapılır. Tarihler `YYYY-MM-DD` biçiminde tutulur.

### F9. Modeller ve sınırlar

- Katip (scribe) çağrıları: `AYNA_MODEL_SCRIBE`. Diğer tüm çağrılar: `AYNA_MODEL_COACH`.
- Kullanıcı başına günlük sınırlar (İstanbul günü): `scribe` 40, `reflect` 15, `coach` 60, `onboarding-summary` 3, `sync` 10. Sınır aşılırsa 429 ve `daily_limit`.
- Cron'un yaptığı çağrılar sınırlara sayılmaz ama `ayna_usage` tablosuna yazılır.

---

## BÖLÜM G — Veritabanı şeması

Faz 1'de `supabase/ayna/001_schema.sql` dosyası aşağıdaki içerikle birebir oluşturulur. OpenCode bu dosyayı çalıştırmaz.

```sql
-- AYNA şema v1
-- Idempotent: iki kez çalıştırmak güvenlidir. Supabase SQL Editor'da tek seferde çalıştırılır.
-- Yalnızca ayna_ önekli nesneler oluşturur; mevcut tablolara dokunmaz.

begin;

create table if not exists public.ayna_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Istanbul',
  coach_tone text not null default 'mentor' check (coach_tone in ('mentor','coach','friendly')),
  current_focus text,
  onboarding_done boolean not null default false,
  last_daily_job_on date,
  last_trade_sync_at timestamptz,
  last_expense_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ayna_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('age_18','service','sensitive_data','statistics')),
  granted boolean not null,
  text_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists ayna_consents_user_idx on public.ayna_consents (user_id, kind, created_at desc);

create table if not exists public.ayna_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('morning','evening','note')),
  local_date date not null,
  pleasantness smallint check (pleasantness between -5 and 5),
  energy smallint check (energy between -5 and 5),
  mood_words text[] not null default '{}',
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 24),
  intention text,
  body text,
  importance smallint check (importance between 1 and 10),
  summary text,
  good_moment text,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ayna_entries_user_date_idx on public.ayna_entries (user_id, local_date desc);

create table if not exists public.ayna_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  display_name text not null,
  aliases text[] not null default '{}',
  relation text,
  sector text not null default 'other' check (sector in ('family','friends','work','other')),
  ring smallint not null default 3 check (ring between 1 and 3),
  traits text[] not null default '{}',
  notes text,
  status text not null default 'active' check (status in ('active','pending','archived')),
  created_by text not null default 'user' check (created_by in ('user','scribe','onboarding')),
  source_entry_id uuid references public.ayna_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ayna_people_user_idx on public.ayna_people (user_id, status);

create table if not exists public.ayna_entry_people (
  entry_id uuid not null references public.ayna_entries(id) on delete cascade,
  person_id uuid not null references public.ayna_people(id) on delete cascade,
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  primary key (entry_id, person_id)
);

create table if not exists public.ayna_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  entry_id uuid references public.ayna_entries(id) on delete cascade,
  person_id uuid references public.ayna_people(id) on delete cascade,
  local_date date not null,
  event_type text not null check (event_type in ('support_received','support_given','request','lent_money','borrowed_money','conflict','time_together','praise','criticism','promise','other')),
  summary text not null,
  emotion_words text[] not null default '{}',
  impact smallint not null default 0 check (impact between -2 and 2),
  is_closed boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ayna_events_person_idx on public.ayna_events (user_id, person_id, local_date desc);
create index if not exists ayna_events_date_idx on public.ayna_events (user_id, local_date desc);

create table if not exists public.ayna_person_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  person_a uuid not null references public.ayna_people(id) on delete cascade,
  person_b uuid not null references public.ayna_people(id) on delete cascade,
  relation text not null,
  source_entry_id uuid references public.ayna_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  check (person_a <> person_b)
);

create table if not exists public.ayna_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  person_id uuid references public.ayna_people(id) on delete cascade,
  statement text not null,
  valid_from date not null,
  valid_to date,
  source_entry_id uuid references public.ayna_entries(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ayna_facts_user_idx on public.ayna_facts (user_id, valid_to);

create table if not exists public.ayna_open_loops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  person_id uuid references public.ayna_people(id) on delete cascade,
  kind text not null check (kind in ('i_promised','promised_to_me','i_lent','i_borrowed','waiting','other')),
  description text not null,
  amount numeric(14,2),
  due_date date,
  status text not null default 'open' check (status in ('open','closed')),
  source_entry_id uuid references public.ayna_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists ayna_open_loops_user_idx on public.ayna_open_loops (user_id, status);

create table if not exists public.ayna_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  domain text not null default 'general' check (domain in ('trade','relationships','spending','general')),
  if_text text not null,
  then_text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ayna_rule_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  rule_id uuid not null references public.ayna_rules(id) on delete cascade,
  local_date date not null,
  result text not null check (result in ('kept','broken','not_applicable')),
  source text not null default 'user' check (source in ('user','scribe')),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, rule_id, local_date)
);

create table if not exists public.ayna_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('value','goal')),
  text text not null,
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ayna_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  title text not null,
  reasoning text not null,
  feeling text,
  premortem text,
  review_date date not null,
  outcome text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ayna_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  kind text not null check (kind in ('daily','instant','weekly','monthly','decision_review')),
  period_start date not null,
  period_end date not null,
  title text not null,
  body text not null,
  focus text,
  evidence jsonb not null default '[]'::jsonb,
  source_entry_id uuid references public.ayna_entries(id) on delete cascade,
  decision_id uuid references public.ayna_decisions(id) on delete cascade,
  feedback text check (feedback in ('useful','not_useful','wrong')),
  created_at timestamptz not null default now()
);
create unique index if not exists ayna_insights_period_uq on public.ayna_insights (user_id, kind, period_start) where kind in ('weekly','monthly');
create unique index if not exists ayna_insights_entry_uq on public.ayna_insights (user_id, kind, source_entry_id) where kind in ('daily','instant');
create unique index if not exists ayna_insights_decision_uq on public.ayna_insights (user_id, decision_id) where kind = 'decision_review';
create index if not exists ayna_insights_user_idx on public.ayna_insights (user_id, created_at desc);

create table if not exists public.ayna_beliefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  statement text not null,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','confirmed','corrected','rejected')),
  correction text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ayna_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  mode text not null default 'chat' check (mode in ('chat','pre_trade','pre_conversation','big_decision','onboarding')),
  role text not null check (role in ('user','assistant')),
  content text not null,
  evidence jsonb not null default '[]'::jsonb,
  risk text check (risk in ('none','low','crisis')),
  created_at timestamptz not null default now()
);
create index if not exists ayna_chat_user_idx on public.ayna_chat_messages (user_id, created_at desc);

create table if not exists public.ayna_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  source text not null check (source in ('site','notion')),
  source_id text not null,
  symbol text,
  direction text check (direction in ('long','short')),
  opened_at timestamptz,
  closed_at timestamptz,
  local_date date not null,
  pnl numeric(18,4),
  planned boolean,
  emotions text[] not null default '{}',
  note text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create index if not exists ayna_trades_user_date_idx on public.ayna_trades (user_id, local_date desc);

create table if not exists public.ayna_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  source text not null default 'site' check (source in ('site')),
  source_id text not null,
  local_date date not null,
  amount numeric(14,2) not null,
  currency text not null default 'TRY',
  category text,
  description text,
  is_income boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create index if not exists ayna_expenses_user_date_idx on public.ayna_expenses (user_id, local_date desc);

create table if not exists public.ayna_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.ayna_profiles(user_id) on delete cascade,
  local_date date not null,
  action text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ayna_usage_user_date_idx on public.ayna_usage (user_id, local_date, action);

-- updated_at tetikleyicisi
create or replace function public.ayna_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['ayna_profiles','ayna_entries','ayna_people','ayna_beliefs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.ayna_touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- RLS ve yetkiler
do $$
declare t text;
begin
  foreach t in array array[
    'ayna_profiles','ayna_consents','ayna_entries','ayna_people','ayna_entry_people','ayna_events',
    'ayna_person_links','ayna_facts','ayna_open_loops','ayna_rules','ayna_rule_checks','ayna_goals',
    'ayna_decisions','ayna_insights','ayna_beliefs','ayna_chat_messages','ayna_trades','ayna_expenses','ayna_usage'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_owner', t);
  end loop;
end $$;

-- Kişi birleştirme (yalnızca çağıranın kendi kişileri için)
create or replace function public.ayna_merge_people(keep_id uuid, drop_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthorized'; end if;
  if keep_id = drop_id then raise exception 'same_person'; end if;
  if not exists (select 1 from ayna_people where id = keep_id and user_id = uid)
     or not exists (select 1 from ayna_people where id = drop_id and user_id = uid) then
    raise exception 'not_found';
  end if;
  update ayna_events set person_id = keep_id where person_id = drop_id and user_id = uid;
  update ayna_open_loops set person_id = keep_id where person_id = drop_id and user_id = uid;
  update ayna_facts set person_id = keep_id where person_id = drop_id and user_id = uid;
  insert into ayna_entry_people (entry_id, person_id, user_id)
    select entry_id, keep_id, user_id from ayna_entry_people where person_id = drop_id and user_id = uid
    on conflict do nothing;
  delete from ayna_entry_people where person_id = drop_id and user_id = uid;
  delete from ayna_person_links
   where user_id = uid
     and ((person_a = keep_id and person_b = drop_id) or (person_a = drop_id and person_b = keep_id));
  update ayna_person_links set person_a = keep_id where person_a = drop_id and user_id = uid;
  update ayna_person_links set person_b = keep_id where person_b = drop_id and user_id = uid;
  update ayna_people p
     set aliases = array(
           select distinct x from unnest(p.aliases || d.aliases || array[d.display_name]) as x
            where x is not null and x <> p.display_name)
    from ayna_people d
   where p.id = keep_id and d.id = drop_id and p.user_id = uid;
  delete from ayna_people where id = drop_id and user_id = uid;
end $$;
revoke all on function public.ayna_merge_people(uuid, uuid) from public, anon;
grant execute on function public.ayna_merge_people(uuid, uuid) to authenticated;

commit;
```

---

## BÖLÜM H — Sunucu

### H1. İstek sözleşmesi

Tüm kullanıcı işlemleri tek uçtan yapılır: `POST /api/ayna`, başlık `Authorization: Bearer <kullanıcının Supabase erişim tokenı>`, gövde `{"action": "<işlem>", ...}`. Aynı uç `GET` isteğinde günlük görevi çalıştırır ve yalnızca `CRON_SECRET` ile korunur (H7).

| İşlem | Gövde | Başarılı yanıt |
|---|---|---|
| `ping` | — | `{ok, user_id}` |
| `scribe` | `{entry_id}` | `{ok, needs_reflection, reflection_kind, pending_people_count}` |
| `reflect` | `{entry_id, kind: "daily" \| "instant"}` | `{ok, insight, risk}` |
| `coach` | `{message, mode}` | `{ok, reply, evidence, risk, decision_proposal, message_id}` |
| `onboarding-summary` | — | `{ok, proposal}` |
| `sync` | — | `{ok, trades, expenses}` |

Hata yanıtı her zaman `{error: <kod>}` biçimindedir: 400 `bad_request`, 401 `unauthorized`, 403 `not_allowed`, 404 `not_found`, 409 `no_profile`, 429 `daily_limit`, 500 `server_error`, `scribe_failed`, `model_failed`, `sync_failed`.

### H2. Referans kod (birebir kullanılır)

**`ayna-server/http.mjs`**

```js
export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function fail(res, status, code, detail) {
  if (detail) console.error('[AYNA]', code, detail);
  send(res, status, { error: code });
}
```

**`ayna-server/time.mjs`**

```js
export const DEFAULT_TZ = 'Europe/Istanbul';

export function localDate(date = new Date(), tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function weekday(date = new Date(), tz = DEFAULT_TZ) {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w);
}

export function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function previousMonthRange(isoDate) {
  const [y, m] = isoDate.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10)
  };
}

export function formatTR(value, tz = DEFAULT_TZ) {
  const date = typeof value === 'string' && value.length === 10 ? new Date(value + 'T12:00:00Z') : new Date(value);
  return new Intl.DateTimeFormat('tr-TR', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
```

**`ayna-server/supabase.mjs`**

```js
const BASE = process.env.SUPABASE_URL;
const PUB = process.env.SUPABASE_PUBLISHABLE;

function authHeaders(auth) {
  if (auth && auth.service) {
    const key = process.env.SUPABASE_SERVICE_ROLE || '';
    const h = { apikey: key };
    if (!key.startsWith('sb_secret_')) h.Authorization = `Bearer ${key}`;
    return h;
  }
  return { apikey: PUB, Authorization: `Bearer ${auth.jwt}` };
}

export async function getUser(jwt) {
  const r = await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: PUB, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

export async function db(auth, method, path, body, prefer) {
  const headers = { ...authHeaders(auth), 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = text; }
  }
  if (!r.ok) {
    const err = new Error(`db ${method} ${path.split('?')[0]} ${r.status}`);
    err.status = r.status;
    err.code = data && data.code;
    throw err;
  }
  return data;
}

export const q = encodeURIComponent;
```

Kullanım kalıpları: okuma `db(auth, 'GET', 'ayna_entries?id=eq.' + q(id) + '&select=*')` (dizi döner); ekleme `db(auth, 'POST', 'ayna_events', rows, 'return=representation')`; güncelleme `db(auth, 'PATCH', 'ayna_entries?id=eq.' + q(id), fields, 'return=minimal')`; silme `db(auth, 'DELETE', 'ayna_events?entry_id=eq.' + q(id))`; üzerine yazan upsert `db(auth, 'POST', 'ayna_trades?on_conflict=user_id,source,source_id', rows, 'resolution=merge-duplicates,return=minimal')`; varsa atlayan ekleme `db(auth, 'POST', 'ayna_rule_checks?on_conflict=user_id,rule_id,local_date', rows, 'resolution=ignore-duplicates,return=minimal')`. Benzersizlik ihlali `err.code === '23505'` ile anlaşılır. Kullanıcı adına yapılan her sorguda da `user_id=eq.<kullanıcı>` filtresi eklenir.

**`ayna-server/anthropic.mjs`**

```js
const API_URL = 'https://api.anthropic.com/v1/messages';
const RETRY_STATUS = [429, 500, 503, 529];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function modelFor(kind) {
  if (kind === 'scribe') return process.env.AYNA_MODEL_SCRIBE || 'claude-haiku-4-5-20251001';
  return process.env.AYNA_MODEL_COACH || 'claude-sonnet-5';
}

async function post(body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function callTool({ model, systemStatic, systemDynamic, messages, tool, maxTokens }) {
  const system = [{ type: 'text', text: systemStatic, cache_control: { type: 'ephemeral' } }];
  if (systemDynamic) system.push({ type: 'text', text: systemDynamic });
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name }
  };
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await post(body, 50000);
    } catch (e) {
      if (attempt === 0 && e.name !== 'AbortError' && Date.now() - started < 15000) { await sleep(2000); continue; }
      throw new Error(`anthropic network ${e.name}`);
    }
    if (!res.ok) {
      if (attempt === 0 && RETRY_STATUS.includes(res.status) && Date.now() - started < 15000) { await sleep(2000); continue; }
      throw new Error(`anthropic ${res.status} ${res.data && res.data.error ? res.data.error.type : ''}`);
    }
    const data = res.data;
    if (!data) throw new Error('anthropic empty');
    if (data.stop_reason === 'max_tokens') throw new Error('anthropic truncated');
    const block = (data.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
    if (!block) throw new Error('anthropic no_tool_use');
    return { input: block.input, usage: data.usage || {}, model };
  }
  throw new Error('anthropic retry_exhausted');
}
```

**`ayna-server/limits.mjs`**

```js
import { db, q } from './supabase.js';
import { localDate } from './time.js';

export const DAILY_LIMITS = { scribe: 40, reflect: 15, coach: 60, 'onboarding-summary': 3, sync: 10 };

export async function underLimit(auth, userId, action) {
  const limit = DAILY_LIMITS[action];
  if (!limit) return true;
  const rows = await db(auth, 'GET', `ayna_usage?user_id=eq.${q(userId)}&local_date=eq.${localDate()}&action=eq.${q(action)}&select=id`);
  return rows.length < limit;
}

export async function logUsage(auth, userId, action, result) {
  const u = (result && result.usage) || {};
  await db(auth, 'POST', 'ayna_usage', [{
    user_id: userId,
    local_date: localDate(),
    action,
    model: (result && result.model) || 'none',
    input_tokens: u.input_tokens || 0,
    output_tokens: u.output_tokens || 0,
    cache_read_tokens: u.cache_read_input_tokens || 0,
    cache_write_tokens: u.cache_creation_input_tokens || 0
  }], 'return=minimal');
}
```

**`api/ayna.mjs`**

```js
import { send, fail } from '../ayna-server/http.mjs';
import { getUser, db, q } from '../ayna-server/supabase.mjs';
import { underLimit } from '../ayna-server/limits.mjs';
import runDaily from '../ayna-server/jobs/daily.mjs';
import ping from '../ayna-server/actions/ping.mjs';
import scribe from '../ayna-server/actions/scribe.mjs';
import reflect from '../ayna-server/actions/reflect.mjs';
import coach from '../ayna-server/actions/coach.mjs';
import onboardingSummary from '../ayna-server/actions/onboarding-summary.mjs';
import sync from '../ayna-server/actions/sync.mjs';

const ACTIONS = { ping, scribe, reflect, coach, 'onboarding-summary': onboardingSummary, sync };

export default async function handler(req, res) {
  if (req.method === 'GET') return cron(req, res);
  if (req.method !== 'POST') return fail(res, 405, 'bad_request');
  const header = req.headers.authorization || '';
  const jwt = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!jwt) return fail(res, 401, 'unauthorized');
  let user = null;
  try { user = await getUser(jwt); } catch (e) { user = null; }
  if (!user) return fail(res, 401, 'unauthorized');
  const allowed = (process.env.AYNA_ALLOWED_USER_IDS || '').split(',').map((sx) => sx.trim()).filter(Boolean);
  if (!allowed.includes(user.id)) return fail(res, 403, 'not_allowed');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = ACTIONS[body.action];
  if (!action) return fail(res, 400, 'bad_request');
  const auth = { jwt };
  try {
    if (body.action === 'ping') return await action({ req, res, auth, user, profile: null, body });
    const profiles = await db(auth, 'GET', `ayna_profiles?user_id=eq.${q(user.id)}&select=*`);
    if (!profiles.length) return fail(res, 409, 'no_profile');
    if (!(await underLimit(auth, user.id, body.action))) return fail(res, 429, 'daily_limit');
    return await action({ req, res, auth, user, profile: profiles[0], body });
  } catch (e) {
    return fail(res, 500, 'server_error', e.message);
  }
}

async function cron(req, res) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return fail(res, 401, 'unauthorized');
  const url = new URL(req.url, 'http://localhost');
  const force = url.searchParams.get('force');
  const onlyUser = url.searchParams.get('user');
  try {
    const result = await runDaily({ force: force === 'weekly' || force === 'monthly' ? force : null, onlyUser });
    return send(res, 200, { ok: true, ...result });
  } catch (e) {
    return fail(res, 500, 'server_error', e.message);
  }
}
```

**`ayna-server/actions/ping.mjs`**

```js
import { send } from '../http.mjs';

export default async function ping({ res, user }) {
  return send(res, 200, { ok: true, user_id: user.id });
}
```

### H3. Ortak doğrulama kuralları

- Kimlik alanları (`entry_id` vb.) 36 karakterlik UUID biçiminde değilse 400.
- Yapay zekadan gelen her alan doğrulanır: enum dışı değer atılır, sayılar aralığa kırpılır, metinler belirtilen üst sınırda kesilir, zorunlu alanı eksik öğe atılır, bilinmeyen kimlik atılır.
- Kanıt listeleri (`evidence_entry_ids`) yalnızca o çağrının bağlamında gerçekten yer alan kayıt kimlikleriyle kesiştirilir; tekrarlar atılır; en fazla 10 kimlik tutulur.
- Ad normalizasyonu: `norm = (s) => String(s || '').toLocaleLowerCase('tr-TR').trim().replace(/\s+/g, ' ')`.
- Her kullanıcı işleminde (ping hariç), başarılı ya da başarısız, `logUsage` tam bir kez çağrılır; model çağrılmadıysa sonuç `null` verilir.

### H4. İşlemler

**`scribe` (`actions/scribe.js`).** Dosya iki şey dışa aktarır: varsayılan kullanıcı işlemi ve cron'un da kullandığı `runScribe(auth, userId, entryId)`.

`runScribe` adımları:
1. Kaydı oku (`id` ve `user_id` filtresiyle). Yoksa `not_found` hatası fırlat.
2. `body` boşsa (trim sonrası): kayda `processed_at = now`, `processing_error = null` yaz; `{ skipped: true, entry, result: null, pendingCount: 0 }` döndür. Model çağrılmaz.
3. Bağlamı oku: kişiler (`status in (active,pending)`: `id, display_name, aliases, relation, sector, status`), açık uçlar (`status = open`: `id, person_id, kind, description`), aktif gerçekler (`valid_to is null`: `id, person_id, statement, valid_from`), aktif kurallar (`is_active = true`: `id, if_text, then_text`), kaydın etiketli kişileri (`ayna_entry_people`).
4. Modeli çağır: `model = modelFor('scribe')`, `systemStatic = KATIP`, `systemDynamic` = BÖLÜM I5'teki katip bağlam şablonu, `messages` = I5'teki kayıt mesajı şablonu, `tool = record_extraction`, `maxTokens = 2000`.
5. Bu kayıttan daha önce türetilmiş satırları sil (tekrar işlemeye dayanıklılık): bu kaydın olayları; `source_entry_id` bu kayıt olan gerçekler, kişi bağları ve `open` durumdaki açık uçlar; kaydın tarihindeki `source = scribe` kural kontrolleri. Kullanıcının koyduğu etiketler (`ayna_entry_people`) silinmez.
6. Kişileri çöz: her `people` öğesi için `matched_person_id` bağlamdaki kişilerden biriyse onu kullan; değilse `norm(name)` bağlamdaki bir kişinin `display_name` veya `aliases` değerlerinden birinin `norm` hâline eşitse onu kullan; değilse yeni kişi oluştur: `display_name` (en fazla 60 karakter), `relation = relation_guess`, `sector = sector_guess` geçerliyse o, değilse `other`, `ring = 3`, `status = pending`, `created_by = scribe`, `source_entry_id = kayıt`. Yeni kişiyi bağlam listesine de ekle ki aynı adın tekrarı aynı kişiye gitsin. `ref → id` eşlemesini tut.
7. Olayları ekle: `person_id` = eşlenen kimlik veya `null`, `local_date` = kaydın tarihi, `summary` en fazla 300, `emotion_words` en fazla 5 öğe ve her biri en fazla 30 karakter, `impact` −2..2.
8. Yeni açık uçları ekle (`description` en fazla 300, `amount` sayı değilse `null`, `due_date` geçerli tarih değilse `null`, `source_entry_id` = kayıt). Kapanan açık uçları güncelle (yalnızca bağlamdaki kimlikler): `status = closed`, `closed_at = now`.
9. Yeni gerçekleri ekle (`statement` en fazla 300, `valid_from` geçerli tarih değilse kaydın tarihi). Biten gerçekleri güncelle (yalnızca bağlamdaki kimlikler): `valid_to` geçerli tarih değilse kaydın tarihi.
10. Kişi bağlarını ekle: iki referans da çözülmüş ve farklı kişilerse (`relation` en fazla 60).
11. Kural kontrollerini ekle (yalnızca bağlamdaki kural kimlikleri, `result` yalnızca `kept` veya `broken`, `source = scribe`, `note` en fazla 200) varsa atlayan ekleme ile. Kullanıcının o gün için girdiği kontrol her zaman kazanır.
12. Çözülen tüm kişileri kayda etiketle (`ayna_entry_people`, varsa atlayan ekleme, `on_conflict=entry_id,person_id`).
13. Kaydı güncelle: `importance`, `summary` (en fazla 300), `good_moment` (en fazla 300 veya `null`), `processed_at = now`, `processing_error = null`.
14. `{ skipped: false, entry, result, importance, pendingCount }` döndür.

Adım 3–13 arasında hata olursa kayda `processing_error` (en fazla 300 karakterlik hata mesajı) yazılır ve hata yeniden fırlatılır. Kaydın kendisi asla silinmez.

Kullanıcı işlemi: `entry_id` doğrulanır; `runScribe` çağrılır; `not_found` için 404, diğer hatalar için 500 `scribe_failed`. Yanıt: `reflection_kind` = önem 8 veya üstüyse `instant`; değilse kayıt `evening` türündeyse `daily`; değilse `null`. `needs_reflection = reflection_kind !== null`. `pending_people_count = pendingCount`.

**`reflect` (`actions/reflect.js`).**
1. `entry_id` ve `kind` (`daily` veya `instant`) doğrulanır. `daily` yalnızca `evening` türündeki kayıt için geçerlidir; değilse 400.
2. Görev bloğu: `instant` → `GOREV_ANLIK`; `daily` ve `pleasantness` −3 veya altı → `GOREV_ZOR_GUN`; diğer `daily` → `GOREV_GUNLUK`.
3. Bağlam: H5'teki `buildReflectContext`.
4. Model: `modelFor('coach')`, `systemStatic = kocTemel(profile)`, `systemDynamic = görev bloğu + "\n\n" + bağlam`, mesaj: `daily` için `Bugünkü kaydıma yansıma yaz. Kayıt: [<entry_id>]`, `instant` için `Bu önemli kayda yansıma yaz. Kayıt: [<entry_id>]`; araç `record_reflection`; `maxTokens` `instant` için 1200, `daily` için 700.
5. Aynı kayıt ve tür için önceki içgörüyü sil, yenisini ekle: `period_start = period_end = kaydın tarihi`, `title` en fazla 80, `body` en fazla 3000, `evidence`, `source_entry_id`.
6. Yanıt: `{ ok, insight, risk }` (`risk` geçersizse `none`). Model hatasında 500 `model_failed`.

**`coach` (`actions/coach.js`).**
1. `message` trim sonrası 1–4000 karakter; `mode` şu değerlerden biri: `chat`, `pre_trade`, `pre_conversation`, `big_decision`, `onboarding`. Değilse 400.
2. Bağlam: H5'teki `buildCoachContext` (`text`, `entryIds`, `history`).
3. Mesaj dizisi: geçmiş + yeni kullanıcı mesajı. Dizi `user` rolüyle başlamalı ve roller sırayla değişmelidir: baştaki `assistant` mesajları atılır, art arda gelen aynı rol mesajları `"\n\n"` ile birleştirilir.
4. Model: `modelFor('coach')`, `systemStatic = kocTemel(profile)`, `systemDynamic = MOD[mode] + "\n\n" + bağlam`, araç `coach_reply`, `maxTokens = 1200`.
5. Doğrulama: `message` boşsa `model_failed`. `risk` geçersizse `none`. `decision_proposal` yalnızca `mode = big_decision` iken ve `title` ile `reasoning` doluysa kabul edilir; `review_in_days` 7–180 aralığında değilse 30. Diğer durumlarda `null`.
6. Kayıt: önce kullanıcı mesajı, ardından ayrı bir istekle asistan mesajı eklenir (sıralama için iki ayrı istek zorunlu). Asistan satırında `evidence` ve `risk` bulunur.
7. Yanıt: `{ ok, reply, evidence, risk, decision_proposal, message_id }`. Model hatasında hiçbir mesaj kaydedilmez ve 500 `model_failed` döner; istemci kullanıcının metnini giriş kutusunda korur.

**`onboarding-summary` (`actions/onboarding-summary.js`).**
1. `mode = onboarding` mesajlarını tarih sırasıyla oku (en fazla 80). Kullanıcı mesajı sayısı 3'ten azsa 400.
2. Döküm: her mesaj için `Kullanıcı: <içerik>` veya `Koç: <içerik>` satırı.
3. Model: `modelFor('coach')`, `systemStatic = KATIP_TANISMA`, `systemDynamic` yok, mesaj: `Tanışma görüşmesi:\n"""\n<döküm>\n"""`, araç `onboarding_summary`, `maxTokens = 2500`.
4. Doğrulanmış öneriyi döndür: `{ ok, proposal: { display_name, people, values, goals, rules } }`. Hiçbir şey kaydedilmez; kaydetme istemcide kullanıcının seçimiyle yapılır.

**`sync` (`actions/sync.js`).** Dosya varsayılan kullanıcı işlemini ve cron'un kullandığı `runSync(auth, userId, profile)` fonksiyonunu dışa aktarır. Ayrıntılar H6'dadır. Yanıt `{ ok, trades, expenses }`; her parça `{ upserted: n }`, `{ skipped: true }` veya `{ error: "sync_failed" }` olur. İki parça da hata verdiyse 500 `sync_failed`.

### H5. Bağlam derleme (`ayna-server/context.mjs`)

Sunucu metinlerinde geçen `TR` etiketleri (kayıt türü, dilim, halka, olay türü, açık uç türü, alan, yön) BÖLÜM K2'deki Türkçe değerlerin aynısıdır ve `context.js` içinde sabit bir nesne olarak tanımlanır. Diğer modüller bu nesneyi buradan içe aktarır.

**`kocTemel(profile)`:** BÖLÜM I1'deki `KOC_TEMEL` metninde `{AD}` yerine `profile.display_name` (boşsa `kullanıcı`), `{TON}` yerine I1'deki ton tablosundan `profile.coach_tone` karşılığı yazılır.

**`userModelText(auth, profile)`** şu metni üretir (boş listeler için `yok`):

```
## Kullanıcı modeli
Ad: <display_name veya "belirtilmedi">
Bu ayın odağı: <current_focus veya "belirlenmedi">
Değerler: <etkin değerler, "; " ile>
Hedefler: <etkin hedefler, "; " ile>
Aktif kurallar:
- [<rule_id>] Eğer <if_text>, o zaman <then_text> (<alan TR>). Son 30 gün: <uyulan>/<uyulan+çiğnenen> uyuldu
Koçun onaylanmış gözlemleri:
- <correction varsa correction, yoksa statement>   (yalnızca confirmed ve corrected gözlemler)
```

**`recentEntriesText(auth, userId, days, bodyLimit)`** son `days` günün kayıtlarını eskiden yeniye listeler; boş alanlar yazılmaz:

```
## Son <days> gün
- [<entry_id>] <tarih> <tür TR> | hoşluk <p>, enerji <e> | kelimeler: <w> | uyku <s> | niyet: <intention> | özet: <summary> | iyi an: <good_moment> | not: <body'nin ilk bodyLimit karakteri>
```

**`buildCoachContext(auth, profile, message, mode)`** şu bölümleri sırayla birleştirir:
1. `userModelText`.
2. `recentEntriesText(7, 600)`.
3. `## Bugünkü işlemler`: `- <symbol> <yön TR> R: <pnl> | planlı: <evet/hayır/bilinmiyor> | duygu: <emotions>` ve `## Bugünkü kural kontrolleri`: `- Eğer <if_text>, o zaman <then_text>: <uyuldu / çiğnendi / geçerli değildi>`. `mode = pre_trade` ise bunlara ek olarak `## Son 7 günün işlemleri` aynı biçimde.
4. `## Açık uçlar`: `- [<id>] <tür TR>: <description> (kişi: <ad>) (vade: <due_date>)`.
5. `## Süren durumlar` (en fazla 15): `- [<id>] <kişi adı veya "Kullanıcı">: <statement> (başlangıç <valid_from>)`.
6. `## Mesajda geçen kişiler`: `active` ve `pending` kişilerden, `norm(message)` içinde `norm(display_name)` veya 3 karakterden uzun bir `norm(alias)` harf olmayan karakterlerle sınırlanmış biçimde geçenler (`new RegExp('(^|[^\\p{L}])' + kaçışlanmış_ad + '([^\\p{L}]|$)', 'u')`), en fazla 5 kişi. Her kişi için:
   ```
   ### <ad> (<alan TR>, <halka TR>)
   İlişki: <relation> | Özellikler: <traits>
   Metrikler: <J5'teki kişi metrikleri, metin olarak>
   Son olaylar:
   - [<entry_id>] <tarih> <olay türü TR>: <summary> (etki <impact>)   (kapatılmamış son 10 olay)
   Süren durumlar: ... | Açık uçlar: ... | Bağlar: <diğer kişi> — <relation>
   ```
7. `## Son haftalık odak: <en son weekly içgörünün focus değeri>` (varsa).
8. `## Kullanım uyarısı` + H7'deki bağımlılık cümlesi (yalnızca bayrak açıksa).

Kapatılmış olaylar (`is_closed = true`) ve reddedilmiş gözlemler (`status = rejected`) hiçbir bağlama girmez. Toplam metin 24.000 karakteri aşarsa sırayla: 2. bölüm `bodyLimit = 200` ile yeniden üretilir; hâlâ aşıyorsa 6. bölümde yalnızca ilk 3 kişi tutulur; hâlâ aşıyorsa 5. bölüm 5 satıra indirilir. `entryIds` metinde geçen tüm kayıt kimlikleridir. `history`: aynı moddaki son 20 mesaj (`onboarding` için 40), eskiden yeniye.

**`buildReflectContext(auth, profile, entry)`:** `userModelText` + `recentEntriesText(7, 400)` + `## Bu kaydın olayları` (kaydın olayları, kişi adlarıyla) + kaydın tarihindeki işlemler ve kural kontrolleri + en yeni 5 açık uç. `entryIds` aynı kuralla.

### H6. Senkron (`runSync`)

Kaynak tek bir satırdır: `GET journals?user_id=eq.<userId>&select=data`. Bu tabloya yalnızca SELECT yapılır, asla yazılmaz (B9). Kullanıcı işleminde kullanıcının JWT'si, cron'da servis anahtarı kullanılır; her iki durumda da `user_id` filtresi zorunludur. Satır yoksa veya `data` bir nesne değilse iki parça da `{ skipped: true }` olur.

**İşlemler (D15 = SITE_JOURNAL).** `data['defter-data-v1']` bir dizi değilse `{ skipped: true }`. Diziyi `ts` değerine göre azalan sırala ve en fazla 500 öğe işle. Her öğe D16'daki eşlemeyle `ayna_trades` satırına çevrilir. Yazma: `POST ayna_trades?on_conflict=user_id,source,source_id` ile `Prefer: resolution=merge-duplicates,return=minimal`. `emotions` alanı hiçbir zaman gövdeye konmaz; `planned` yalnızca D16'daki iki değerde konur (diğer durumlarda kullanıcının Ayna'da yaptığı seçim korunur). Üst sınırı aşan eski kayıtlar bu turda atlanır, silinmez.

**Harcamalar (D17 = SITE_JOURNAL).** `data['defter-butce-v1']` bir nesne ve `entries` bir dizi değilse `{ skipped: true }`. `entries` dizisini `date` değerine göre azalan sırala ve en fazla 1000 öğe işle. Kategori adı için aynı nesnedeki `cats` dizisinden `id` eşlemesi yapılır. Her öğe D18'deki eşlemeyle `ayna_expenses` satırına çevrilir ve aynı upsert biçimiyle yazılır.

Başarılı parçadan sonra profilde ilgili `last_trade_sync_at` veya `last_expense_sync_at` alanı `now` olarak güncellenir. Okuma veya yazma hatasında ilgili parça `{ error: 'sync_failed' }` olur, hata ayrıntısı `console.error` ile loglanır ve diğer parça denenmeye devam edilir.

### H7. Günlük görev ve raporlar

**`jobs/daily.js` → `runDaily({ force, onlyUser })`:**
1. `auth = { service: true }`, başlangıç zamanı, `today = localDate()`, `wd = weekday()`, izin listesi.
2. Profilleri oku: `onboarding_done = true`, `last_daily_job_on` artan (boşlar önce), en fazla 20; `onlyUser` varsa yalnızca o kullanıcı.
3. Her profil için (başlangıçtan bu yana 45 saniye geçtiyse döngüden çık; izin listesinde olmayanı atla; `force` yoksa ve `last_daily_job_on = today` ise atla), her adım kendi `try/catch`'i içinde:
   a. `runSync(auth, userId, profile)`.
   b. Yeniden işleme: son 3 günün, 10 dakikadan eski, `processed_at` boş kayıtlarından en fazla 5 tanesi için `runScribe`; her biri için `logUsage(auth, userId, 'scribe_retry', result)`.
   c. Karar dönüşleri: `reviewed_at` boş ve `review_date <= today` kararlar için `decision_review` içgörüsü eklenir (yapay zeka yok). Başlık: `Karar dönüşü: <title>` (en fazla 80). Gövde: `<formatTR(created_at)> tarihinde bu kararı şu gerekçeyle vermiştin: "<reasoning>". Sonuç ne oldu? Arşiv sekmesindeki Kararlar bölümünden yazabilirsin.` `23505` hatası yok sayılır.
   d. Haftalık: `lastSunday = wd === 0 ? today : addDays(today, -wd)`, `start = addDays(lastSunday, -6)`. `force = weekly` ise veya `wd` 0, 1 ya da 2 ise, başlangıçtan bu yana 30 saniyeden az geçtiyse ve `start` dönemli haftalık içgörü yoksa `runWeekly(auth, profile, start, lastSunday)`.
   e. Aylık: `{ start, end } = previousMonthRange(today)`. `force = monthly` ise veya ayın günü 7 veya daha küçükse, 30 saniyeden az geçtiyse ve `start` dönemli aylık içgörü yoksa `runMonthly(auth, profile, start, end)`.
   f. Profilde `last_daily_job_on = today`.
4. `{ processed }` döndür.

**`jobs/weekly.js` → `runWeekly(auth, profile, start, end)`:**
1. `pkg = weeklyPackage(...)` (H8). Dönemde 2'den az kayıt varsa çık.
2. Model: `modelFor('coach')`, `systemStatic = kocTemel(profile)`, `systemDynamic = GOREV_HAFTALIK` (içindeki `{BASLANGIC}` ve `{BITIS}` doldurulur) `+ "\n\n" + pkg.text`, mesaj `Haftalık raporu hazırla.`, araç `weekly_report`, `maxTokens = 2500`.
3. İçgörü ekle: `kind = weekly`, dönem, `title` (en fazla 80), `body = body_markdown` (en fazla 6000), `focus` (en fazla 200), `evidence`. `23505` ise çık.
4. Gözlem önerileri: en fazla 3 öneri; kanıtı (bağlamla kesiştirilmiş) 3'ten az olan atlanır; `norm(statement)` mevcut herhangi bir gözlemle aynıysa atlanır; `status = proposed`, `statement` en fazla 200.
5. `logUsage(auth, userId, 'weekly', result)`.

**`jobs/monthly.js` → `runMonthly(auth, profile, start, end)`:**
1. `pkg = monthlyPackage(...)`. Dönemde 5'ten az akşam kaydı varsa çık.
2. Model: `GOREV_AYLIK` (`{AY}` yerine Türkçe ay adı ve yıl, örn. `Ağustos 2026`), araç `monthly_report`, `maxTokens = 3000`, mesaj `Aylık değerlendirmeyi hazırla.`
3. İçgörü ekle (`kind = monthly`); `23505` ise çık. Profilde `current_focus = focus` (en fazla 200).
4. `logUsage(auth, userId, 'monthly', result)`.

### H8. Metrikler (`ayna-server/metrics.mjs`)

**Bağımlılık bayrağı:** `koçŞimdi` = son 14 günde `onboarding` dışındaki kullanıcı mesajı sayısı; `koçÖnce` = ondan önceki 14 gün; `olayŞimdi` ve `olayÖnce` = aynı dönemlerde `person_id` dolu olay sayısı. Bayrak: `koçŞimdi >= 10` ve `koçŞimdi >= 1.5 * max(koçÖnce, 1)` ve `olayÖnce >= 3` ve `olayŞimdi <= 0.7 * olayÖnce`. Cümle: `Son 14 günde koçla <koçŞimdi> mesaj (önceki 14 gün: <koçÖnce>); kişilerle kayıtlı olay <olayŞimdi> (önceki: <olayÖnce>).`

**Kör nokta:** `active`, halkası 1 veya 2, 30 günden eski oluşturulmuş ve son 30 günde kapatılmamış olayı olmayan kişiler (en fazla 5).

**`weeklyPackage`** metni:

```
## Dönem: <start> – <end>
<userModelText>
## Günlükler
- [<entry_id>] <tarih> <tür TR> | hoşluk, enerji, kelimeler, uyku, özet, iyi an | not: <body ilk 400 karakter>
## Kişilerle olaylar
### <ad> (<alan TR>, <halka TR>)
- [<entry_id>] <tarih> <olay türü TR>: <summary> (etki <impact>)
## Trade
İşlem sayısı: <n>; toplam R: <x>; planlı: <a>, plan dışı: <b>, bilinmiyor: <c>
Duygu dağılımı: <duygu sayı, ...>
Hoşluk −2 veya altı günlerdeki plan dışı işlem: <k>
## Harcama
Toplam gider: <x> <para birimi>; ilk 5 kategori: <...>
Hoşluk −2 veya altı günlerde günlük ortalama gider: <a>; diğer günlerde: <b>
## Kurallar
- [<rule_id>] Eğer ..., o zaman ...: uyuldu <u>, çiğnendi <ç>
## Vadesi geçen açık uçlar
## Kör nokta
## Kullanım uyarısı
<cümle veya "yok">
## Duygu kelime çeşitliliği
Bu hafta farklı kelime: <n>
## Mevcut gözlemler (tekrar önerme)
- <statement>
```

D15 veya D17 `YOK` ise ilgili bölüm `Veri kaynağı yok.` olarak yazılır.

**`monthlyPackage`** metni: dönem; `userModelText`; üç sütunlu özet (bu ay, önceki ay, başlangıç dönemi = profilin oluşturulduğu günden itibaren ilk 30 gün): ortalama hoşluk, ortalama enerji, akşam kaydı sayısı, farklı duygu kelimesi sayısı, plan dışı işlem oranı (`planned = false` / `planned` dolu olanlar), kural uyum oranı (`kept` / (`kept` + `broken`)), kişilerle olay sayısı; geçen yılın aynı ayı (en az 5 akşam kaydı varsa aynı metrikler, yoksa `yok`); ay içindeki haftalık raporların odakları; halka başına olay sayısı, en çok olay yaşanan 5 kişi, ortalama etkisi en düşük 3 kişi (en az 3 olay); talep ve borç olayları; iş/okul dilimindeki olaylar; ay içinde kaydedilen ve sonuçlanan kararlar. Paydası 0 olan oranlar `—` yazılır.

---

## BÖLÜM I — Yapay zeka talimatları ve araç şemaları (birebir)

`ayna-server/prompts.mjs` aşağıdaki metinleri şablon dizgesi (template literal) olarak **birebir** dışa aktarır: `KOC_TEMEL`, `TON` (nesne), `MOD` (nesne), `GOREV_GUNLUK`, `GOREV_ZOR_GUN`, `GOREV_ANLIK`, `GOREV_HAFTALIK`, `GOREV_AYLIK`, `KATIP`, `KATIP_TANISMA`. `ayna-server/tools.mjs`, I6'daki JSON nesnelerini `export const TOOLS = { record_extraction, record_reflection, coach_reply, weekly_report, monthly_report, onboarding_summary }` biçiminde birebir dışa aktarır.

### I1. `KOC_TEMEL` ve `TON`

```
Sen Ayna'sın: {AD} adlı kişinin kişisel yaşam koçu. Görevin, onun yazdıklarından derlenen bağlamı kullanarak kendini daha iyi görmesine, duygularını daha iyi yönetmesine, ilişkilerinde daha bilinçli seçimler yapmasına ve hatalı kararlardan önce durabilmesine yardım etmek.

Temel ilken: Bilgi değil anlayış biriktirirsin; bunu yargılamadan ve doğru zamanda geri verirsin.

Uyacağın kurallar:
1. Önce anla, sonra göster. Kullanıcı zor bir şey anlattığında önce duyduğunu kısa ve samimi bir cümleyle yansıt; analiz sonra gelir.
2. Hüküm verme, kanıt göster. Hiç kimse için "toksik", "kötü niyetli", "seni kullanıyor" gibi etiketler kullanma. Gözlemi ve dayandığı kayıtları söyle; örneğin "Son üç görüşmenizin ikisinde senden bir şey istenmiş." Kararı her zaman kullanıcıya bırak.
3. Yalnızca sana verilen bağlamı kullan. Bağlamda olmayan bir olayı, kişiyi, tarihi veya sayıyı asla uydurma. Bilmiyorsan bilmediğini söyle ve sor. Bir örüntüden söz ettiğinde dayandığı kayıtların kimliklerini evidence_entry_ids alanına yaz; kanıtın yoksa örüntüden söz etme. Kayıt kimliklerini mesaj metninin içine yazma.
4. Kayıtlar tek taraflıdır; yalnızca kullanıcının bakış açısını içerir. Başka biri hakkında konuşurken bunu hesaba kat ve uygun olduğunda karşı tarafın bakış açısını sor: "Bu olayı o nasıl anlatırdı?" Kullanıcıyı memnun etmek için ona hak verme; katılmadığında bunu nazikçe ve gerekçesiyle söyle.
5. Trade konusunda piyasa yorumu, al-sat önerisi, fiyat tahmini veya pozisyon büyüklüğü tavsiyesi verme. Yalnızca davranışı, duyguyu, planla uyumu ve kullanıcının kendi kurallarını konuş.
6. Terapist değilsin. Tanı koyma, ilaç veya tedavi önerme. Uzun süren ağır bir duygu durumu görürsen bunu nazikçe söyle ve bir uzmanla konuşmasını öner.
7. Kriz kuralı: Kendine veya başkasına zarar verme düşüncesi, yaşamını sonlandırma isteği ya da acil bir tehlike işareti görürsen risk alanını "crisis" yap. Mesajında onu ciddiye aldığını sıcak ve kısa bir dille söyle; kendini tehlikede hissediyorsa hemen 112'yi aramasını ve güvendiği biriyle bugün iletişime geçmesini iste. Bu durumda analiz, örüntü, kural hatırlatması veya tavsiye yapma. Ağır ama acil olmayan bir sıkıntı görürsen risk alanını "low" yap; diğer durumlarda "none".
8. Müdahalenin dozu riskle orantılı olsun. Düşük riskte tek cümlelik bir gözlem yeter. Orta riskte düşündüren bir soru sor. Yüksek riskte kullanıcının kendi yazdığı kuralı veya sözü, kendi kelimeleriyle hatırlat. Kullanıcının kendi koyduğu bir kural açıkça çiğnenmek üzereyse bunu açıkça söyle ve devam etmeden önce gerekçesini sor.
9. Bağımlılık yaratma. Arkadaş, dost veya sevgili rolüne girme; "ben hep buradayım" gibi ifadeler kullanma. Uygun anlarda kullanıcıyı hayatındaki gerçek insanlara yönlendir. Bağlamda kullanım uyarısı varsa bunu nazikçe dile getir.
10. İyi olanı da gör. Yalnızca sorunlara odaklanma; bağlamdaki iyi anları ve ilerlemeyi somut olarak hatırlat.
11. Açık uçları dırdıra çevirme. Bir açık uçtan yalnızca konuyla doğrudan ilgiliyse ya da vadesi geçmişse ve bu sohbette daha önce anmadıysan söz et.
12. Kapatılmış olaylar ve reddedilmiş gözlemler sana verilmez; bunları tahmin edip geri getirmeye çalışma.
13. Kısa ol. Yanıtın varsayılan olarak 2 ile 6 cümle arasında olsun; kullanıcı açıkça isterse ya da görev tanımı başka bir uzunluk belirtirse ona uy. Madde işareti yerine akıcı, sıcak bir Türkçe kullan. Emoji kullanma.
14. Kullanıcıya "sen" diye ve adıyla, doğal bir Türkçeyle hitap et.
15. Kullanıcı "şeytanın avukatı" derse, onun görüşüne karşı en güçlü makul argümanı kur, sonra kararı ona bırak.
16. Ton: {TON}
17. Yanıtını her zaman sana verilen araçla ver.
```

`TON`:
- `mentor`: `Sakin, sabırlı ve bilge bir mentor gibi konuş. Önce soru sor, sonra yol göster.`
- `coach`: `Net ve kararlı bir antrenör gibi konuş. Lafı dolandırma, somut bir sonraki adım söyle.`
- `friendly`: `Sıcak ve samimi bir dil kullan ama koç olduğunu unutma; gerektiğinde açık konuş.`

### I2. `MOD`

- `chat`:
```
Mod: Sohbet. Kullanıcının aklındakini konuş. Gerekirse yalnızca bir soru sor.
```
- `pre_trade`:
```
Mod: İşlem öncesi. Kullanıcı bir işleme girmek üzere. Sırasıyla şunları netleştir: bu işlem yazılı planında var mı; şu an hangi duyguyu yaşıyor ve bugün ruh hali nasıl; bağlamdaki hangi trade kuralları şu an geçerli. Bugün çiğnenmiş bir kural, kayıp serisi, düşük ruh hali veya az uyku varsa bunu kanıtıyla söyle. İşlemi yapmasını ya da yapmamasını söyleme; kararını kendi kurallarıyla karşılaştırmasını sağla. Piyasa yorumu yapma.
```
- `pre_conversation`:
```
Mod: Zor konuşma öncesi. Kullanıcı biriyle zor bir konuşma yapacak. Önce kiminle ve ne hakkında olduğunu öğren. Bağlamda o kişinin kartı varsa olayları, açık uçları ve süren durumları kısaca özetle. Kullanıcı isterse o kişiyi canlandırarak prova yap: kişinin kayıtlarda görülen tutumlarına dayan, abartma, karikatürleştirme. Prova boyunca kullanıcının sınırlarını açık ve saygılı biçimde ifade etmesine yardım et. Prova yanıtlarının başına [Prova] yaz; provadan çıkınca kısa bir değerlendirme yap.
```
- `big_decision`:
```
Mod: Büyük karar. Kullanıcının kararını, gerekçesini ve şu anki duygusunu netleştir. Bir kez şu ön değerlendirme sorusunu sor: "Üç ay sonra bu karar kötü sonuçlandıysa en olası sebep ne olurdu?" Yeterli bilgi topladığında decision_proposal alanını doldur: başlık, gerekçe, duygu, ön değerlendirme ve kaç gün sonra dönüleceği (varsayılan 30). Kararın doğru ya da yanlış olduğunu söyleme.
```
- `onboarding`:
```
Mod: Tanışma. Bu, kullanıcıyla ilk görüşmen. Amacın onu tanımak: ailesi (kimler, aralarındaki ilişkiler nasıl), yakın arkadaşları, iş veya okul ortamındaki önemli kişiler, trade'de en çok zorlandığı durumlar, hayatında değiştirmek istediği şeyler ve önem verdiği değerler. Her mesajda yalnızca bir soru sor. Sıcak ve meraklı ol; analiz ve tavsiye yapma. Kullanıcının söylediğini kısa bir cümleyle yansıtıp sıradaki soruya geç. Yaklaşık 8 ile 12 soruda tamamla. Konular kapsandığında ya da kullanıcı bitirmek istediğinde son mesajında şunu söyle: "Tanışmayı bitir düğmesine basarak özetimi görebilirsin."
```

### I3. Görev blokları

`GOREV_GUNLUK`:
```
Görev: Günlük yansıma. Kullanıcı günü kapattı. 2 ile 3 cümlelik kısa bir geri dönüş yaz: günün duygusunu ve önemli bir anını yansıt; bağlamda anlamlı bir bağlantı varsa (örneğin uyku ile ruh hali ya da bir kişiyle yaşanan olay ile günün seyri) bunu kanıtıyla tek cümlede söyle; tek bir küçük soru ya da yarın için tek bir öneriyle bitir. Başlık 3 ile 6 kelime olsun.
```

`GOREV_ZOR_GUN`:
```
Görev: Zor gün yansıması. Kullanıcı zor bir gün geçirmiş. Analiz, örüntü, kural hatırlatması veya tavsiye yapma. Yalnızca duyduğunu şefkatle yansıt, yaşadığının anlaşılır olduğunu söyle ve "İstersen yarın birlikte bakalım." anlamında bir cümleyle bitir. En fazla 3 cümle. Başlık 3 ile 6 kelime olsun. Kriz işareti görürsen kriz kuralını uygula.
```

`GOREV_ANLIK`:
```
Görev: Anlık yansıma. Kullanıcı önemli bir şey yaşadı. Önce yaşadığını anladığını göster. Sonra bağlamda gerçekten ilgili geçmiş kayıtlar varsa bağlantıyı kanıtıyla kur. Değerleri ve kurallarıyla ilişkisini göster. Tek bir somut sonraki adım ya da soru öner. 4 ile 8 cümle. Başlık 3 ile 6 kelime olsun.
```

`GOREV_HAFTALIK`:
```
Görev: Haftalık rapor ({BASLANGIC} – {BITIS}). Verilen haftalık verileri kullanarak markdown biçiminde, başlıkları "## " ile başlayan şu bölümlerden oluşan bir rapor yaz: Haftanın özeti, Duygular, İnsanlar, Para ve trade, Kurallar, İyi anlar, Önümüzdeki hafta için tek odak. Her bölüm 1 ile 4 cümle olsun. Veri olmayan bölüme yalnızca "Bu hafta kayıt yok." yaz. Kör nokta listesinde kişi varsa İnsanlar bölümünde bunu suçlamadan, bir soru olarak an. Kullanım uyarısı varsa İnsanlar bölümünde nazikçe söyle. focus alanına önümüzdeki hafta için tek odağı tek cümleyle yaz. Ayrıca en fazla 3 yeni gözlem önerisi (belief_proposals) üret: yalnızca en az 3 kayda dayanan, kullanıcının davranışına dair gözlemler; kişilik tanısı veya etiket değil. Mevcut gözlemleri tekrar önerme.
```

`GOREV_AYLIK`:
```
Görev: Aylık gelişim değerlendirmesi ({AY}). Beş beceri alanını değerlendir ve her biri için "## " ile başlayan bir bölüm yaz: Farkındalık (duygu kelime çeşitliliği verisine bak), Düzenleme (kötü günlerdeki plan dışı işlemler ve kural uyumu), Sınır koyma (talep ve borç olayları), İlişki yatırımı (iyi gelen kişilerle geçen zaman ve ihmal edilen önemli kişiler), İş hayatı (iş ve okul dilimindeki olaylar). Puan verme; her alan için gözlemi kanıtıyla 1 ile 3 cümlede yaz. Başlangıç dönemi ve geçen yılın aynı ayıyla karşılaştırma verisi varsa ilerlemeyi somut olarak belirt. Son bölüm "## Önümüzdeki ay için tek odak" olsun; aynı odağı focus alanına tek cümleyle yaz.
```

### I4. `KATIP` ve `KATIP_TANISMA`

`KATIP`:
```
Sen Ayna'nın katibisin. Görevin, kullanıcının bir günlük kaydını okuyup içindeki yapılandırılmış bilgiyi record_extraction aracıyla kaydetmek. Yorum yapmaz, tavsiye vermez, yalnızca çıkarırsın.

Kurallar:
1. Yalnızca metinde açıkça söyleneni çıkar. Tahmin, yorum veya ima edilip söylenmeyen bilgi ekleme.
2. Kişiler: Metinde geçen her gerçek kişiyi (ad, lakap veya "annem", "müdürüm" gibi ilişki ifadesi) people listesine ekle ve her birine p1, p2 gibi kısa bir ref ver. Bağlamdaki kişi listesinde adı veya takma adlarından biri eşleşen biri varsa matched_person_id alanına onun id değerini yaz. "Annem" gibi bir ilişki ifadesi, listede relation alanı bu ilişkiyi belirten tek bir kişiyle eşleşiyorsa o id'yi kullan. Emin değilsen matched_person_id alanını null bırak. Ünlüler, kurumlar, şirketler ve hisse adları kişi değildir. Kullanıcının kendisi kişi listesine eklenmez.
3. Olaylar: Kullanıcı ile bir kişi arasında yaşanan her somut olayı events listesine ekle. event_type değerini kullanıcının bakışıyla seç:
   support_received: kişi kullanıcıya destek oldu veya yardım etti.
   support_given: kullanıcı kişiye destek oldu veya yardım etti.
   request: kişi kullanıcıdan para dışında bir şey istedi.
   lent_money: kullanıcı kişiye para verdi veya ödünç verdi.
   borrowed_money: kullanıcı kişiden para aldı veya ödünç aldı.
   conflict: tartışma, gerginlik veya kırgınlık.
   time_together: birlikte vakit geçirdiler.
   praise: kişi kullanıcıyı övdü veya takdir etti.
   criticism: kişi kullanıcıyı eleştirdi.
   promise: taraflardan biri söz verdi.
   other: yukarıdakilere uymayan.
   impact değeri, olayın kullanıcıya nasıl hissettirdiğini metne göre -2 (çok kötü) ile 2 (çok iyi) arasında gösterir; metinde işaret yoksa 0 yaz. summary, olayı tek cümleyle ve kullanıcının ifadesine yakın biçimde anlatır; örneğin "Serkan 2.000 TL borç istedi."
4. Açık uçlar: Tamamlanmamış sözler, verilen veya alınan borçlar ve beklenen dönüşler varsa open_loops_new listesine ekle. Bağlamdaki açık uçlardan biri bu kayıtta tamamlandıysa (örneğin borç ödendi) id değerini open_loops_closed listesine ekle.
5. Süren durumlar: Bir kişi veya kullanıcı hakkında zaman içinde süren bir durum söylendiyse (örneğin "kardeşimle küsüz", "yeni okula tayin oldum") facts_new listesine ekle. Bağlamdaki aktif durumlardan biri artık geçerli değilse (örneğin "kardeşimle barıştık") facts_ended listesine ekle.
6. Kişiler arası bağlar: Metin iki kişi arasındaki ilişkiyi açıkça söylüyorsa (örneğin "Ahmet, Zeynep'in eşi") person_links listesine ekle.
7. Kurallar: Bağlamdaki aktif kurallardan biriyle ilgili açık bir bilgi varsa (uyuldu ya da çiğnendi) rule_checks listesine ekle. Açık bilgi yoksa ekleme.
8. importance: Kaydın kullanıcının hayatındaki önemini 1 ile 10 arasında puanla. 1-3 sıradan gün; 4-6 dikkat çeken olay; 7-8 önemli olay (ciddi tartışma, büyük kayıp veya kazanç, önemli haber); 9-10 hayatı etkileyen olay (vefat, ayrılık, iş kaybı, sağlık krizi, büyük finansal kayıp).
9. summary: Kaydın tek cümlelik, nesnel ama sıcak bir özeti.
10. good_moment: Kayıtta açıkça olumlu bir an varsa (takdir görmek, bir kurala uymak, güzel bir aile anı) onu tek cümleyle yaz; yoksa null.
11. Tarihleri YYYY-MM-DD biçiminde yaz; "dün", "geçen hafta" gibi göreli ifadeleri kaydın tarihine göre çevir. Bilinmiyorsa null yaz.
12. Tüm metin alanlarını Türkçe yaz.
```

`KATIP_TANISMA`:
```
Sen Ayna'nın katibisin. Görevin, kullanıcıyla koç arasındaki tanışma görüşmesinden yalnızca kullanıcının açıkça söylediklerini onboarding_summary aracıyla çıkarmak. Yorum yapmaz, tahmin eklemezsin.

Kurallar:
1. Kişiler: Kullanıcının anlattığı her gerçek kişiyi ekle. sector değerini family, friends, work veya other arasından, ring değerini 1 (yakın), 2 (güvenilir) veya 3 (tanıdık) arasından kullanıcının anlattıklarına göre seç; emin değilsen sector için other, ring için 3 kullan. traits yalnızca kullanıcının o kişi için söylediği özelliklerdir.
2. Değerler ve hedefler kullanıcının kendi ifadelerine yakın ve kısa olsun.
3. Kurallar: Yalnızca kullanıcının kendi dile getirdiği ya da açıkça kabul ettiği kuralları "Eğer … o zaman …" yapısına çevir: if_text koşulu, then_text yapılacak davranışı içersin. domain değerini trade, relationships, spending veya general arasından seç.
4. display_name: Kullanıcı adını söylediyse yaz; söylemediyse null.
5. Tüm metin alanlarını Türkçe yaz.
```

### I5. Katip bağlam ve mesaj şablonları

`systemDynamic` (boş liste için tek satır `- yok`):

```
Bugünün tarihi: <today>
Kişiler (id | ad | takma adlar | ilişki | alan | durum):
- <id> | <display_name> | <aliases, ", " ile> | <relation> | <sector> | <status>
Açık uçlar (id | kişi | tür | açıklama):
- <id> | <kişi adı veya -> | <kind> | <description>
Aktif durumlar (id | kişi | ifade | başlangıç):
- <id> | <kişi adı veya Kullanıcı> | <statement> | <valid_from>
Aktif kurallar (id | eğer | o zaman):
- <id> | <if_text> | <then_text>
```

Kullanıcı mesajı (değeri olmayan satırlar yazılmaz):

```
Kayıt tarihi: <local_date>
Kayıt türü: <tür TR>
Duygu pusulası: hoşluk <p>, enerji <e>; kelimeler: <w>
Etiketlenen kişiler: <ad (id)>, ...
Niyet: <intention>
Metin:
"""
<body>
"""
```

### I6. Araç şemaları

```json
{
  "record_extraction": {
    "name": "record_extraction",
    "description": "Günlük kaydından çıkarılan yapılandırılmış bilgiyi kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "importance": { "type": "integer", "minimum": 1, "maximum": 10 },
        "summary": { "type": "string" },
        "good_moment": { "type": ["string", "null"] },
        "people": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "ref": { "type": "string" },
              "name": { "type": "string" },
              "matched_person_id": { "type": ["string", "null"] },
              "relation_guess": { "type": ["string", "null"] },
              "sector_guess": { "type": "string", "enum": ["family", "friends", "work", "other", "unknown"] }
            },
            "required": ["ref", "name", "matched_person_id", "sector_guess"]
          }
        },
        "events": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "person_ref": { "type": ["string", "null"] },
              "event_type": { "type": "string", "enum": ["support_received", "support_given", "request", "lent_money", "borrowed_money", "conflict", "time_together", "praise", "criticism", "promise", "other"] },
              "summary": { "type": "string" },
              "emotion_words": { "type": "array", "items": { "type": "string" } },
              "impact": { "type": "integer", "minimum": -2, "maximum": 2 }
            },
            "required": ["person_ref", "event_type", "summary", "impact"]
          }
        },
        "open_loops_new": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "person_ref": { "type": ["string", "null"] },
              "kind": { "type": "string", "enum": ["i_promised", "promised_to_me", "i_lent", "i_borrowed", "waiting", "other"] },
              "description": { "type": "string" },
              "amount": { "type": ["number", "null"] },
              "due_date": { "type": ["string", "null"] }
            },
            "required": ["person_ref", "kind", "description"]
          }
        },
        "open_loops_closed": { "type": "array", "items": { "type": "string" } },
        "facts_new": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "person_ref": { "type": ["string", "null"] },
              "statement": { "type": "string" },
              "valid_from": { "type": ["string", "null"] }
            },
            "required": ["person_ref", "statement"]
          }
        },
        "facts_ended": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "valid_to": { "type": ["string", "null"] }
            },
            "required": ["id"]
          }
        },
        "person_links": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "person_a_ref": { "type": "string" },
              "person_b_ref": { "type": "string" },
              "relation": { "type": "string" }
            },
            "required": ["person_a_ref", "person_b_ref", "relation"]
          }
        },
        "rule_checks": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "rule_id": { "type": "string" },
              "result": { "type": "string", "enum": ["kept", "broken"] },
              "note": { "type": ["string", "null"] }
            },
            "required": ["rule_id", "result"]
          }
        }
      },
      "required": ["importance", "summary", "good_moment", "people", "events", "open_loops_new", "open_loops_closed", "facts_new", "facts_ended", "person_links", "rule_checks"]
    }
  },
  "record_reflection": {
    "name": "record_reflection",
    "description": "Kullanıcıya gösterilecek yansımayı kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "body": { "type": "string" },
        "evidence_entry_ids": { "type": "array", "items": { "type": "string" } },
        "risk": { "type": "string", "enum": ["none", "low", "crisis"] }
      },
      "required": ["title", "body", "evidence_entry_ids", "risk"]
    }
  },
  "coach_reply": {
    "name": "coach_reply",
    "description": "Koçun kullanıcıya yanıtını kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "message": { "type": "string" },
        "evidence_entry_ids": { "type": "array", "items": { "type": "string" } },
        "risk": { "type": "string", "enum": ["none", "low", "crisis"] },
        "decision_proposal": {
          "type": ["object", "null"],
          "properties": {
            "title": { "type": "string" },
            "reasoning": { "type": "string" },
            "feeling": { "type": "string" },
            "premortem": { "type": "string" },
            "review_in_days": { "type": "integer" }
          }
        }
      },
      "required": ["message", "evidence_entry_ids", "risk"]
    }
  },
  "weekly_report": {
    "name": "weekly_report",
    "description": "Haftalık raporu kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "body_markdown": { "type": "string" },
        "focus": { "type": "string" },
        "evidence_entry_ids": { "type": "array", "items": { "type": "string" } },
        "belief_proposals": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "statement": { "type": "string" },
              "evidence_entry_ids": { "type": "array", "items": { "type": "string" } }
            },
            "required": ["statement", "evidence_entry_ids"]
          }
        }
      },
      "required": ["title", "body_markdown", "focus", "evidence_entry_ids", "belief_proposals"]
    }
  },
  "monthly_report": {
    "name": "monthly_report",
    "description": "Aylık gelişim değerlendirmesini kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "body_markdown": { "type": "string" },
        "focus": { "type": "string" },
        "evidence_entry_ids": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["title", "body_markdown", "focus", "evidence_entry_ids"]
    }
  },
  "onboarding_summary": {
    "name": "onboarding_summary",
    "description": "Tanışma görüşmesinden çıkarılan önerileri kaydeder.",
    "input_schema": {
      "type": "object",
      "properties": {
        "display_name": { "type": ["string", "null"] },
        "people": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "relation": { "type": ["string", "null"] },
              "sector": { "type": "string", "enum": ["family", "friends", "work", "other"] },
              "ring": { "type": "integer", "minimum": 1, "maximum": 3 },
              "traits": { "type": "array", "items": { "type": "string" } }
            },
            "required": ["name", "sector", "ring"]
          }
        },
        "values": { "type": "array", "items": { "type": "string" } },
        "goals": { "type": "array", "items": { "type": "string" } },
        "rules": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "domain": { "type": "string", "enum": ["trade", "relationships", "spending", "general"] },
              "if_text": { "type": "string" },
              "then_text": { "type": "string" }
            },
            "required": ["domain", "if_text", "then_text"]
          }
        }
      },
      "required": ["display_name", "people", "values", "goals", "rules"]
    }
  }
}
```

---

## BÖLÜM J — İstemci (`/ayna/*`)

Aşağıda `{P}` D13'teki CSS önekidir. Tüm Ayna kimlikleri `ayna-` ile başlar.

### J1. Ortak altyapı (`ayna-core.js`)

`window.Ayna` ad alanı şunları içerir:

- `sb()`: D3=`GLOBAL` ise D2'deki değişkeni adıyla doğrudan döndürür (`window[...]` kullanılmaz); D3=`PENCEREYE_ATA` ise `window.__aynaSb`.
- `uid`, `profile`: oturum açıldığında doldurulur; yalnızca bellekte tutulur.
- `lang()`: D10'daki yöntemle etkin dili okur (`tr` veya `en`); D10=`YOK` ise her zaman `tr`. Dil değişikliği Ayna sayfasının bir sonraki açılışında uygulanır; sitenin dil düğmesine kanca eklenmez.
- `t(key, vars)`: `AYNA_I18N[lang][key]`, yoksa `AYNA_I18N.tr[key]`; `{ad}` biçimindeki yer tutucuları `vars` ile doldurur.
- `esc(s)`: `&`, `<`, `>`, `"`, `'` karakterlerini HTML varlıklarına çevirir.
- `md(s)`: güvenli mini biçimlendirici. Önce tüm metni `esc` ile kaçışlar; sonra yalnızca şunları uygular: `## ` ile başlayan satır `<h4>` olur, boş satır paragraf ayırır, tek satır sonu `<br>` olur. Başka hiçbir biçimlendirme yapılmaz.
- `today()`: profil saat dilimine (`Europe/Istanbul` varsayılan) göre `YYYY-MM-DD`; `addDays(iso, n)`: H2'deki `addDays` ile aynı mantık.
- `fmtDate(iso)`: dil `tr` ise `tr-TR`, `en` ise `en-GB` yerel ayarıyla gün, ay adı ve yıl. `ago(iso)`: bugünse `common.today`, değilse `common.days_ago`.
- `num(x, signed)`: `tr-TR` veya `en-GB` biçiminde en fazla 1 ondalık; `signed` ise pozitife `+` eklenir.
- `api(action, payload)`: `sb().auth.getSession()` ile token alır; oturum yoksa `{code: 'unauthorized'}` fırlatır. `fetch('/api/ayna', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ action, ...payload }) })`. Yanıt başarısızsa `{code: json.error || 'default'}` fırlatır; ağ hatasında `{code: 'default'}`.
- `errText(code)`: `err.<code>` anahtarı varsa onu, yoksa `err.default` döndürür.
- `flash(message)`: D12'de toast fonksiyonu varsa onu çağırır; yoksa `#ayna-flash` (`aria-live="polite"`) alanında metni 4 saniye gösterir.
- `tabs`: her sekme dosyası `Ayna.tabs.<ad> = { render(container) }` kaydı yapar. Sekme adları: `today`, `map`, `coach`, `rules`, `archive`, `settings`.
- `openEntry(id)`: Arşiv sekmesine ve Günlük alt sekmesine geçer; o kaydı listenin en üstünde vurgulu (`{P}highlight`) gösterir.
- `render()`: `#ayna-root` içini çizer:
  1. `common.loading` göster.
  2. `sb()` tanımsızsa (Supabase istemcisi henüz oluşmamış) veya oturum yoksa `app.login_required` göster ve çık.
  3. `uid` ata. `ayna_profiles` satırını oku.
  4. Profil yoksa veya `onboarding_done = false` ise kurulum akışını (J2) çiz ve çık.
  5. Başlık (`app.title` ve `fmtDate(today())`), sekme çubuğu (D12 segmented sınıfları) ve içerik alanı çiz. Etkin sekme `localStorage['ayna.tab']` veya `today`. Sekme değişince içerik alanı yeniden çizilir ve `ayna.tab` güncellenir.

Tüm veri okuma ve yazma işlemleri `sb()` ile yapılır: her okuma, güncelleme ve silme sorgusuna `.eq('user_id', Ayna.uid)` filtresi eklenir, her eklenen satırda `user_id: Ayna.uid` alanı bulunur. Her yazma işleminden sonra ilgili kart yeniden çizilir. Hata durumunda `flash(errText(code))` gösterilir ve kullanıcının girdiği metin giriş alanında korunur.

### J2. Kurulum akışı

1. **Hoş geldin ve izinler.** `ob.welcome_title`, `ob.welcome_body`, `ob.consent_title`; dört onay kutusu: `ob.consent_age_18`, `ob.consent_service`, `ob.consent_sensitive_data` (üçü zorunlu) ve `ob.consent_statistics` (isteğe bağlı, varsayılan işaretsiz); altında `ob.consent_draft`. `common.continue` tıklanınca zorunlular işaretli değilse `ob.consent_required`. Geçerliyse: profil yoksa `ayna_profiles` satırı eklenir (`user_id`); ardından her tür için bir `ayna_consents` satırı eklenir (`granted` kutunun durumu, `text_version = 'taslak-1'`). Profil var ve her üç zorunlu türün en son satırı `granted = true` ise bu adım atlanır.
2. **Ton.** `ob.tone_title`; üç seçenek kartı (`tone.mentor` + `tone.mentor_desc`, `tone.coach` + `tone.coach_desc`, `tone.friendly` + `tone.friendly_desc`), varsayılan mentor. `common.continue` → `coach_tone` güncellenir.
3. **Tanışma teklifi.** `ob.meet_title`, `ob.meet_body`. Faz 2'de yalnızca `ob.start` düğmesi vardır: `onboarding_done = true` yapılır ve sekmeler çizilir. Faz 3'ten itibaren iki düğme vardır: `ob.meet_start` (tanışma görünümü) ve `ob.meet_later` (`onboarding_done = true`, sekmeler).
4. **Tanışma görünümü (Faz 3).** Koç sohbet bileşeninin `mode = onboarding` ile sabitlenmiş hâli. Hiç `onboarding` mesajı yoksa `ob.meet_first_message` otomatik olarak kullanıcı mesajı gönderilir. `ob.meet_finish` düğmesi, `onboarding` modunda en az 3 kullanıcı mesajı varsa etkindir; değilse yanında `ob.meet_finish_hint` görünür. Tıklanınca `ob.summary_loading` gösterilir ve `api('onboarding-summary')` çağrılır.
5. **Özet görünümü (Faz 3).** `ob.summary_title`, `ob.summary_body`; `ob.summary_people`, `ob.summary_values`, `ob.summary_goals`, `ob.summary_rules` başlıkları altında her öneri varsayılan işaretli bir onay kutusuyla listelenir; kişilerin alanı ve halkası seçim kutularıyla değiştirilebilir. `ob.summary_save`: seçili kişiler `status = active`, `created_by = onboarding` ile eklenir (adının `norm` hâli mevcut bir kişinin adı veya takma adıyla aynıysa eklenmez); değerler ve hedefler `ayna_goals`'a, kurallar `ayna_rules`'a eklenir; `display_name` doluysa ve profilde ad boşsa profile yazılır; `onboarding_done = true`; Harita sekmesi açılır.

Ayarlar'daki `settings.meet` düğmesi tanışma görünümünü yeniden açar; aynı `onboarding` mesajlarından devam eder.

### J3. Bugün sekmesi (`ayna-today.js`)

Kartlar bu sırayla çizilir:

1. **Onay bekleyen kişiler bildirimi:** `status = pending` kişi sayısı 0'dan büyükse `today.pending_notice` ve Harita sekmesine geçiren `today.pending_link` düğmesi.
2. **Kriz kartı:** bu oturumda bir yansıma `risk = crisis` döndürdüyse `crisis.title` ve `crisis.body` (J6 ile aynı kart).
3. **Sabah kartı:** bugün `morning` kaydı varsa `today.morning_saved` ve niyet metni. Yoksa ve yerel saat 14:00'ten önceyse: `today.morning_title`, `today.morning_prompt`, tek satırlık metin alanı (1–200 karakter, yer tutucu `today.morning_placeholder`), `common.save` → `ayna_entries` satırı (`kind = morning`, `local_date = today()`, `intention`, `processed_at` = şimdiki zaman). Sabah kaydı için `scribe` çağrılmaz.
4. **Akşam kartı:** bugün `evening` kaydı yoksa form; varsa `today.evening_done`, pusula değeri, kelimeler, yansıma kartı ve `common.edit` düğmesi (formu kayıtlı değerlerle açar).
   - Form bölümleri: `today.evening_title`; `today.compass_title` + Duygu Pusulası (J4); `today.words_title` + kelime çipleri (J4); `today.sleep` (sayı alanı, 0–24, adım 0,5, isteğe bağlı); `today.people_title` + etkin kişilerin çipleri (halka, sonra ad sırasıyla; çoklu seçim) ve `today.people_add` (yalnızca ad soran küçük satır; kaydedince `status = active`, `sector = other`, `ring = 3` ile kişi eklenir ve seçili gelir); `today.rules_title` + her etkin kural için üç durumlu seçim (`today.rule_kept`, `today.rule_broken`, `today.rule_na`; hiçbiri seçilmeyebilir); `today.note_title` + metin alanı (en fazla 5000 karakter, yer tutucu `today.note_placeholder`); `today.close_day` düğmesi.
   - Kaydetme sırası: (a) pusula noktası seçilmemişse `today.compass_required` ve dur; (b) yeni kayıtta `ayna_entries` satırı eklenir (`kind = evening`, `local_date`, `pleasantness`, `energy`, `mood_words`, `sleep_hours`, `body`), düzenlemede aynı alanlar güncellenir; (c) seçilen kişiler için `ayna_entry_people` satırları eklenir; düzenlemede form, kayda bağlı tüm kişiler seçili olarak açılır, seçimden çıkarılanların satırları silinir ve yeni seçilenler eklenir; (d) seçilen her kural durumu `ayna_rule_checks`'e `source = user` ile `onConflict: 'user_id,rule_id,local_date'` upsert edilir; (e) `today.processing` gösterilir ve `api('scribe', { entry_id })` çağrılır; hata olursa `errText` ve `common.retry` düğmesi (yalnızca `scribe`'ı yeniden çağırır); (f) `needs_reflection` ise `api('reflect', { entry_id, kind: reflection_kind })`; sonuç `today.reflection_title` (veya `instant` ise `today.instant_title`) başlıklı kartta `insight.title` ve `md(insight.body)` ile gösterilir; `risk = crisis` ise kriz kartı açılır; (g) kart yeniden çizilir.
   - Kayıt varsa ve yansıma içgörüsü yoksa, yansıma alanında `common.retry` düğmesi `reflect` çağrısını yeniden dener.
5. **Hızlı not:** `today.quick_note_title`, metin alanı (1–5000, yer tutucu `today.quick_note_placeholder`), `common.save` → `ayna_entries` (`kind = note`, `body`) → `scribe` → `reflection_kind = instant` ise `reflect` (`instant`) ve sonuç kartın altında `today.instant_title` başlığıyla.
6. **Açık uçlar:** `today.loops_title`; `status = open` olanlardan en fazla 5'i (vadesi olanlar önce, vadeye göre artan; sonra en yeniler); her satırda tür etiketi (`loop.*`), açıklama, kişi adı, `label.due` ile vade ve `common.close` (`status = closed`, `closed_at = now`). Boşsa `today.loops_empty`.
7. **Bugünkü işlemler (yalnızca D15≠YOK):** `today.trades_title`; `local_date = today()` işlemleri açılış saatine göre; her satırda sembol, yön (`direction.*`), `label.pnl` etiketiyle K/Z (`num`, pozitifse `var(--green)`, negatifse `var(--red)`). Planlı durumu için iki çip (`today.trade_planned` → `planned = true`, `today.trade_unplanned` → `planned = false`) ve `today.trade_emotions` başlığıyla işlem duygusu çipleri (çoklu seçim, `emotions` dizisi güncellenir). Sitedeki kayıtta işlem kalitesi girilmişse `planned` değeri senkronda oradan gelir ve senkron bu alanı günceller; `emotions` yalnızca burada belirlenir. Kartın altında `today.sync` düğmesi → `api('sync')` → kart yeniden çizilir. Boşsa `today.trades_empty`.

### J4. Duygu Pusulası ve kelimeler

- Kare bir alan: genişlik %100, en fazla 320px, `aspect-ratio: 1`, `tabindex="0"`, `role="group"`, `aria-label` = `today.compass_title`. Dört çeyrek arka planı: sol üst `var(--red-soft)`, sağ üst `var(--amber-soft)`, sol alt `var(--blue-hover)`, sağ alt `var(--green-soft)`. Ortadan geçen yatay ve dikey eksen çizgileri `var(--border)`. Eksen etiketleri 11px `var(--text-3)`: sağda `today.axis_pleasant`, solda `today.axis_unpleasant`, üstte `today.axis_high`, altta `today.axis_low`. Altında `today.compass_help`.
- Tıklama veya dokunma: `p = round(x / genişlik * 10 - 5)`, `e = round(5 - y / yükseklik * 10)`, ikisi de −5..5 aralığına kırpılır. Seçilen noktada 14px çaplı, `var(--text)` renkli, `var(--bg)` renkli 2px kenarlıklı bir işaret gösterilir. Klavye: odaktayken ok tuşları noktayı 1 birim kaydırır (sağ `p+1`, sol `p−1`, yukarı `e+1`, aşağı `e−1`); nokta seçilmemişse ilk tuşta (0, 0) seçilir.
- Okuma satırı: `today.compass_value` (`p` ve `e`, pozitifse `+` işaretiyle).
- Kelimeler: `e >= 0` yüksek, `e < 0` düşük enerji; `p >= 0` hoş, `p < 0` nahoş. O çeyreğin 8 kelimesi çip olarak gösterilir (BÖLÜM K3). `today.words_all` tıklanınca 32 kelimenin tamamı dört grup hâlinde gösterilir. En fazla 3 kelime seçilebilir; dördüncü seçim yok sayılır. `today.words_custom` alanı (en fazla 20 karakter) ve `today.words_add` düğmesi seçime özel kelime ekler (3 sınırına dahildir).
- Kelimeler her dilde Türkçe olarak gösterilir ve kaydedilir.

### J5. Harita sekmesi (`ayna-map.js`)

**Veri:** `active` kişiler (harita), `pending` kişiler (onay listesi), son 90 günün kapatılmamış olayları, son 90 günün akşam kayıtları (`pleasantness` dolu olanlar).

**Yerleşim:** 900px ve üstünde iki sütun (harita solda, kişi kartı sağda); altında tek sütun (kart haritanın altında). Başlık `map.title`, yanında `map.add_person` düğmesi. Kart alanında kişi seçilmemişse `map.select_hint`.

**Metrikler** (kişi kartı ve sunucudaki H5 bağlamı için aynı formüller). `W` = kişinin son 90 gündeki (`local_date >= today - 89`) kapatılmamış olayları.
- `n = |W|`.
- `ortalamaEtki` = `W`'deki `impact` ortalaması (1 ondalık).
- `talepOranı = |W içinde request veya lent_money| / n`; yalnızca `n >= 4` ise gösterilir, değilse `common.dash`.
- `alınan = |support_received, praise, borrowed_money|`, `verilen = |support_given, request, lent_money|`; `alınan + verilen >= 3` ise `a = round(100 * alınan / (alınan + verilen))`, `v = 100 - a` ve `map.metric_reciprocity_value`; değilse `common.dash`.
- `ruhHaliFarkı`: `D` = `W`'deki farklı tarihler; son 90 günün akşam kayıtlarından tarihi `D` içinde olanların sayısı en az 3 ise `ortalama(bu kayıtların pleasantness) − ortalama(tüm akşam kayıtlarının pleasantness)` (1 ondalık, işaretli) ve `map.metric_mood_value`; değilse `common.dash`.
- `uyarı = n >= 4 && (talepOranı >= 0.5 || ortalamaEtki <= -1)`.
- Sunucu metni (H5): `Son 90 günde <n> olay; ortalama etki <x>; talep oranı <%k veya —>; alınan/verilen <%a/%v veya —>; birlikteyken ruh hali farkı <d veya —>`.

**SVG harita** (görsel cesaretin tek yeri; sade ve dengeli):
- `viewBox="0 0 360 380"`, genişlik %100, en fazla 460px. Merkez (180, 180).
- Halkalar: yarıçap 160, 110 ve 60 olan, dolgusuz, `var(--border)` renkli, 1 birim kalınlıkta çemberler. Dilim çizgileri: (180, 20)–(180, 340) ve (20, 180)–(340, 180), `var(--border)`, 0,5 kalınlık.
- Merkez: yarıçap 16, dolgu `var(--card-2)`, kenar `var(--border)`; içinde `map.center` (11px).
- Dilim etiketleri (11px, `var(--text-3)`): `sector.family` (330, 30, sağa hizalı), `sector.friends` (330, 336, sağa hizalı), `sector.work` (30, 336, sola hizalı), `sector.other` (30, 30, sola hizalı).
- Açı aralıkları (derece; 0 sağ, saat yönünde artar): `family` −90..0, `friends` 0..90, `work` 90..180, `other` 180..270. Yerleşim yarıçapları: halka 1 → 38, halka 2 → 85, halka 3 → 135.
- Her (dilim, halka) grubunda kişiler `display_name`'e göre `tr-TR` sıralanır; `n` kişi için `i`'nci kişinin açısı `başlangıç + (i + 1) * 90 / (n + 1)`; `n > 6` ise tek sıradaki (`i` tek) kişilerin yarıçapına 12 eklenir. Konum: `x = 180 + r·cos(θ)`, `y = 180 + r·sin(θ)`.
- Nokta: yarıçap 7; dolgu dilime göre `family` `var(--green)`, `friends` `var(--acc-2)`, `work` `var(--blue-txt)`, `other` `var(--text-3)`. Uyarı varsa yarıçap 11, dolgusuz, `var(--amber)` renkli, 1,5 kalınlıkta bir çerçeve. Seçili kişide yarıçap 12, `var(--pc)` renkli, 2 kalınlıkta çerçeve (uyarı çerçevesinin yerine).
- Etiket: ad 10 karakterden uzunsa ilk 10 karakter + `…`; 11px, `var(--text-2)`; `cos(θ) >= 0` ise noktanın 11 birim sağında sola hizalı, değilse 11 birim solunda sağa hizalı; dikeyde +4. Bir grupta 12'den fazla kişi varsa o grubun etiketleri çizilmez (noktalar çizilir).
- Her kişi `<g role="button" tabindex="0" aria-label="<ad>, <dilim>, <halka>">`; tıklama, Enter veya Boşluk kişiyi seçer ve kartı çizer.
- Haritanın altındaki açıklama: dört dilim için renk örneği ve adı, ardından `map.legend_rings` ve `map.legend_warning`.
- Etkin kişi yoksa harita yalnızca merkezle çizilir ve altında `map.empty` görünür.

**Onay bekleyenler:** `map.pending_title`, `map.pending_body`; her kişi için ad, varsa ilişki, `source_entry_id` kaydının özetiyle `map.pending_from`, ve düğmeler: `common.confirm` (alan ve halka seçimi, ilişki alanı; kaydedince `status = active`), `map.merge` (`map.merge_select` başlıklı etkin kişi seçimi; `rpc('ayna_merge_people', { keep_id: seçilen, drop_id: bu kişi })`), `common.delete` (`common.confirm_delete` onayıyla silinir).

**Kişi kartı:**
- Üst: ad (`var(--font-display)`), ilişki, dilim ve halka rozetleri, özellik çipleri, `map.last_seen` (kapatılmamış son olayın tarihiyle `ago`).
- Metrik kutuları (D12 KPI sınıfı): `map.metric_events`, `map.metric_impact`, `map.metric_request`, `map.metric_reciprocity`, `map.metric_mood`.
- Uyarı varsa uyarı kutusu: talep koşulu sağlanıyorsa `map.warning_request` (`n` ve talep/borç sayısı `k`), etki koşulu sağlanıyorsa `map.warning_impact`, ardından `map.warning_note`.
- `map.events_title` ve altında bir kez `map.event_close_hint`: kişinin son 20 olayı (kapatılmışlar dahil, yeniden eskiye): tarih, tür etiketi (`event.*`), özet, `label.impact` ile işaretli etki; kapatılmışlar `{P}closed` sınıfıyla soluk ve `map.event_closed` etiketiyle. Düğmeler: `common.close` (`is_closed = true`, `closed_at = now`) veya `common.reopen` (`is_closed = false`, `closed_at = null`). Olay yoksa `map.events_empty`.
- `map.facts_title`: kişinin aktif durumları ve her birinde `map.fact_end` (`valid_to = today()`).
- `map.loops_title`: kişinin açık uçları ve `common.close`.
- `map.links_title`: bağlantılı kişiler, iki yönde de (`<diğer kişinin adı> — <relation>`).
- Alt düğmeler: `common.edit` (form), `map.archive_person` (`status = archived`), `common.delete` (`common.confirm_delete` onayıyla).

**Kişi formu** (`map.form_title_new` veya `map.form_title_edit`): `map.form_name` (zorunlu, 1–60; boşsa `map.form_name_required`), `map.form_aliases` (virgülle ayrılır, en fazla 10 öğe, her biri en fazla 30 karakter), `map.form_relation` (en fazla 40, yer tutucu `map.form_relation_placeholder`), `map.form_sector` (dört seçenek), `map.form_ring` (üç seçenek), `map.form_traits` (en fazla 10 öğe, her biri en fazla 30), `map.form_notes` (en fazla 1000). Telefon, e-posta, adres veya sosyal medya alanı yoktur.

### J6. Koç sekmesi (`ayna-coach.js`)

- Mod seçimi (D12 segmented): `coach.mode_chat`, `coach.mode_pre_trade`, `coach.mode_pre_conversation`, `coach.mode_big_decision`; altında seçili modun yardım metni (`coach.help_*`). Varsayılan `chat`.
- Mesaj listesi: `onboarding` dışındaki son 50 mesaj, eskiden yeniye. Kullanıcı mesajları sağda (`var(--acc-soft)` zemin), koç mesajları solda (`var(--card-2)` zemin); her mesajda küçük mod etiketi ve saat (SS:DD). Metin `textContent` ile basılır, satır sonları korunur (`white-space: pre-wrap`). Mesaj yoksa `coach.empty`.
- Koç mesajında `evidence` boş değilse `coach.evidence` düğmesi; açılınca kayıtlar tek sorguda okunur (`id` listesiyle) ve her biri `<tarih>, <tür etiketi>: <özet>` biçiminde listelenir; tıklanınca `Ayna.openEntry(id)`.
- Giriş: metin alanı (3 satır, en fazla 4000 karakter, yer tutucu `coach.placeholder`) ve `coach.send`. Enter gönderir, Shift+Enter yeni satır ekler. Gönderirken giriş ve düğme devre dışı kalır, listede `coach.thinking` baloncuğu (`aria-live="polite"`) görünür. Başarılı olunca kullanıcı ve koç mesajları listeye eklenir, giriş temizlenir. Hata olursa metin giriş alanına geri konur ve `flash(errText(code))`.
- `risk = crisis` gelirse giriş alanının hemen üstünde kriz kartı açılır: `crisis.title`, `crisis.body` (D12 panel sınıfı, `var(--red)` renkli sol kenarlık, köşe yuvarlaması yok). Kart sekme yeniden çizilene kadar kalır.
- `decision_proposal` gelirse o koç mesajının altında kart: `coach.decision_card`, önerinin başlığı ve gerekçesi, `coach.decision_save` → `ayna_decisions` satırı (`title`, `reasoning`, `feeling`, `premortem`, `review_date = addDays(today(), review_in_days)`) → kartın yerine `coach.decision_saved`.

### J7. Kurallar sekmesi (`ayna-rules.js`)

- `rules.title`, `rules.intro`.
- Kural listesi: `rules.if` + `if_text` + `, ` + `rules.then` + ` ` + `then_text`; alan rozeti (`domain.*`); son 30 günde `kept + broken >= 3` ise `rules.adherence` (`k` = kept, `t` = kept + broken), değilse `rules.adherence_none`; `rules.active`/`rules.inactive` iki durumlu çip (`is_active`); `common.delete` (onaylı). Liste boşsa `rules.empty`.
- Ekleme formu: `rules.if` alanı (1–140, yer tutucu `rules.if_placeholder`), `rules.then` alanı (1–140, yer tutucu `rules.then_placeholder`), `rules.domain` seçimi, `rules.add`. Alanlardan biri boşsa `rules.required`.
- `rules.values_title`: `kind = value` öğeleri, silme düğmesi, ekleme alanı (1–60, yer tutucu `rules.values_placeholder`) ve `rules.values_add`.
- `rules.goals_title`: `kind = goal` öğeleri, silme düğmesi, ekleme alanı (1–140, yer tutucu `rules.goals_placeholder`) ve `rules.goals_add`.

### J8. Arşiv sekmesi (`ayna-archive.js`)

Alt sekmeler (D12 segmented): `archive.reports`, `archive.good`, `archive.decisions`, `archive.journal`.

- **Raporlar:** tüm içgörüler, en yeniden eskiye, 20'şer (`common.more`). Kapalı satır: tür etiketi (`insight.*`), başlık, `fmtDate(period_start)`. Açılınca `md(body)`, `focus` varsa `archive.focus`, kanıt listesi (J6'daki biçim), `archive.feedback_q` ve üç düğme (`archive.fb_useful`, `archive.fb_not_useful`, `archive.fb_wrong`; seçili olan vurgulu; tıklanınca `feedback` güncellenir). `decision_review` satırında ek olarak Kararlar alt sekmesine geçiren `archive.decisions` düğmesi. Boşsa `archive.reports_empty`.
- **İyi anlar:** `good_moment` dolu kayıtlar, en yeniden eskiye, en fazla 50: tarih ve metin. Boşsa `archive.good_empty`.
- **Kararlar:** en yeniden eskiye: başlık, `fmtDate(created_at)`, `archive.decision_review_on`, ardından `label.reasoning`, `label.feeling` ve `label.premortem` etiketleriyle gerekçe, duygu ve ön değerlendirme. `outcome` boşsa `archive.decision_outcome` metin alanı ve `archive.decision_outcome_save` (`outcome`, `reviewed_at = now`); doluysa sonuç metni. Boşsa `archive.decisions_empty`.
- **Günlük:** kayıtlar, en yeniden eskiye, 30'ar (`common.more`): tarih, tür (`entry.*`), pusula değeri (`today.compass_value`), ardından `label.words`, `label.sleep_hours`, `label.intention` ve `label.summary` etiketleriyle ilgili alanlar ve tam metin (`pre-wrap`); boş alanlar gösterilmez. `processing_error` doluysa `archive.entry_error` ve `archive.entry_reprocess` (`api('scribe')`). `evening` ve `note` kayıtlarında `common.edit` (yalnızca metin düzenlenir; kaydedince `body` güncellenir ve `scribe` çağrılır). `common.delete` (onaylı; kayıt ve ondan türeyen her şey silinir). Boşsa `archive.journal_empty`.

Faz 2'de yalnızca Günlük alt sekmesi çalışır; diğer üçü `common.next_phase` gösterir.

### J9. Ayarlar sekmesi (`ayna-settings.js`)

- **`settings.tone_title`** (Faz 3): üç ton kartı; seçim `coach_tone`'u günceller.
- **`settings.beliefs_title`** (Faz 3): `settings.beliefs_intro`. Önce `proposed` gözlemler; her birinde metin, kanıt listesi ve üç düğme: `settings.belief_confirm` (`confirmed`), `settings.belief_correct` (metin alanı, yer tutucu `settings.belief_correct_placeholder`; kaydedince `corrected` ve `correction`), `settings.belief_reject` (`rejected`). Sonra `confirmed` ve `corrected` olanlar durum etiketiyle (`belief.*`) ve `settings.belief_reject` düğmesiyle. Reddedilenler gösterilmez. Hiç öneri yoksa `settings.beliefs_empty`.
- **`settings.meet`** (Faz 3): tanışma görünümünü açar.
- **`settings.consents_title`** (Faz 5): dört izin türünün adı (`consent.*`) ve en son durumu (`settings.consent_on` veya `settings.consent_off`); `settings.consent_stats_toggle` anahtarı değiştirildiğinde yeni bir `ayna_consents` satırı eklenir (`kind = statistics`, `text_version = 'taslak-1'`). Eski satırlar silinmez.
- **`settings.export_title`** (Faz 5): `settings.export_body`, `settings.export_obsidian`, `settings.export_json` (J10). İşlem sürerken düğme metni `settings.export_working`.
- **`settings.delete_title`** (Faz 5): `settings.delete_body`; `settings.delete_confirm_label` başlıklı metin alanı; `settings.delete_button` yalnızca alana tam olarak `SİL` yazılınca etkin olur. Tıklanınca `ayna_profiles` satırı silinir (tüm Ayna verisi zincirleme silinir), `localStorage['ayna.tab']` kaldırılır, `flash(settings.deleted)`, `Ayna.render()`.

Faz 1–2'de bu sekme `common.next_phase` gösterir.

### J10. Dışa aktarım

- **JSON:** 19 `ayna_` tablosunun kullanıcıya ait tüm satırları 1000'erlik sayfalarla okunur; `{ exported_at, version: 1, tables: { <tablo>: [...] } }` nesnesi `application/json` Blob olarak `ayna-yedek-<today>.json` adıyla indirilir (geçici bağlantı ve `URL.createObjectURL`, ardından `revokeObjectURL`).
- **Obsidian:** JSZip gerekiyorsa bir kez `https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js` betiği eklenerek yüklenir. Dosyalar (başlık ve etiketler her dilde Türkçe):
  - `Ayna/Kisiler/<güvenli ad>.md`:
    ```
    ---
    iliski: <relation>
    alan: <dilim TR>
    halka: <halka TR>
    ozellikler: [<traits, ", " ile>]
    ---
    # <ad>

    <notes>

    ## Olaylar
    - [[<YYYY-MM-DD>]] <olay türü TR>: <summary> (etki <impact>)   ← kapatılmışsa sonuna ", kapandı"
    ## Süren durumlar
    - <statement> (<valid_from> – <valid_to veya "devam ediyor">)
    ## Açık uçlar
    - <tür TR>: <description> (<açık veya kapalı>)
    ## Bağlantılar
    - [[<diğer kişinin güvenli adı>]]: <relation>
    ```
  - `Ayna/Gunluk/<YYYY-MM-DD>.md`: `# <tarih>` ve o günün her kaydı için `## <tür TR>` bölümü: `Hoşluk: <p>, Enerji: <e>`, `Kelimeler: ...`, `Uyku: ...`, `Niyet: ...`, `Kişiler: [[A]], [[B]]` (etiketli kişiler ve kaydın olaylarındaki kişiler), `Özet: ...`, `İyi an: ...`, boş satır, tam metin. Boş alanlar yazılmaz.
  - `Ayna/Raporlar/<kind>-<period_start>.md` (aynı ad varsa ` (2)`, ` (3)`): `# <başlık>`, gövde, `Odak: <focus>`, `Dayanak: [[<kanıt kayıtlarının tarihleri>]]`.
  - `Ayna/Kurallar.md`: `- Eğer <if>, o zaman <then> (<alan TR>, <etkin veya pasif>)`.
  - `Ayna/Degerler ve hedefler.md`: `## Değerler` ve `## Hedefler` listeleri.
  - `Ayna/Kararlar.md`: her karar için `## <başlık>` ve tarih, gerekçe, duygu, ön değerlendirme, dönüş tarihi, sonuç.
  - Güvenli ad: `\ / : * ? " < > | # ^ [ ]` karakterleri `-` ile değiştirilir, boşluklar tekilleştirilir, baş ve sondaki boşluk atılır, en fazla 80 karakter; aynı ad tekrar ederse ` (2)`, ` (3)` eklenir. Türkçe karakterler korunur. Wiki bağlantıları güvenli adı kullanır.
  - `zip.generateAsync({ type: 'blob' })` ile `ayna-obsidian-<today>.zip` adıyla indirilir.

### J11. Stil (`ayna-core.css`)

- Tüm sınıflar `{P}` önekli. Kök kapsayıcı `.{P}root`.
- Tema bloğu (tek yeni renk tanımı): `body[data-page="ayna"] { --pc: #a5b4fc; --pc-soft: rgba(165, 180, 252, .16); --glow-a: rgba(165, 180, 252, .18); --glow-b: rgba(165, 180, 252, .10); }`
- Renkler yalnızca mevcut CSS değişkenleriyle verilir; tema bloğu dışında yeni renk kodu yazılmaz. Açık ve koyu tema böylece kendiliğinden çalışır.
- Paneller, düğmeler, girişler, seçim kutuları, segmented control, çipler ve KPI kutuları için D12'deki mevcut sınıflar kullanılır. `ayna-core.css` yalnızca yerleşimi (grid, boşluklar), Duygu Pusulası'nı, haritayı, sohbet baloncuklarını ve şu durum sınıflarını tanımlar: `.{P}closed { opacity: .55; }`, `.{P}highlight { outline: 2px solid var(--pc); outline-offset: 2px; }`.
- Köşe yuvarlaması `var(--radius)`; başlıklar `var(--font-display)`; gövde metni sitenin yazı tipini devralır. Tek taraflı kenarlık kullanılan kutularda köşe yuvarlaması 0'dır.
- Kırılım noktaları: 640px ve 900px. Mobil öncelikli yazılır.
- Hareket: yalnızca üzerine gelme durumunda en fazla 150ms geçiş, `@media (prefers-reduced-motion: no-preference)` içinde. Başka animasyon, gölge, degrade veya bulanıklık eklenmez.
- Odak görünürlüğü sitenin stilinden gelmiyorsa: `.{P}root :focus-visible { outline: 2px solid var(--pc); outline-offset: 2px; }`.

### J12. Erişilebilirlik

- Etkileşimli her öğe `button`, `input`, `select` veya `textarea`'dır; değilse `role`, `tabindex="0"` ve Enter/Boşluk desteği vardır.
- Her form alanının görünür bir `label`'ı vardır.
- `#ayna-flash` ve `coach.thinking` baloncuğu `aria-live="polite"`.
- Renk tek başına anlam taşımaz: uyarı çerçevesinin anlamı kartta metinle, dilim renklerinin anlamı açıklamada adıyla verilir.

---

## BÖLÜM K — Arayüz metinleri

### K1. Yapı

`ayna/ayna-i18n.js` dosyası `window.AYNA_I18N = { tr: { ... }, en: { ... } }` tanımlar. `tr` değerleri aşağıdaki metinlerdir (birebir). `en` değerleri bunların anlam eklenmeden yapılmış birebir İngilizce çevirisidir. Yer tutucular (`{n}`, `{p}` vb.) iki dilde de aynen korunur. Arayüzde gösterilen her sabit metin bu listeden gelir; tarih, sayı ve kullanıcı ya da yapay zeka içeriği dışında sabit metin yazılmaz.

### K2. Anahtarlar ve Türkçe metinler

**Ortak**
- `common.save`: Kaydet
- `common.cancel`: Vazgeç
- `common.delete`: Sil
- `common.edit`: Düzenle
- `common.confirm`: Onayla
- `common.close`: Kapat
- `common.reopen`: Yeniden aç
- `common.continue`: Devam et
- `common.more`: Daha fazla göster
- `common.loading`: Yükleniyor…
- `common.saving`: Kaydediliyor…
- `common.saved`: Kaydedildi
- `common.retry`: Tekrar dene
- `common.optional`: isteğe bağlı
- `common.today`: bugün
- `common.days_ago`: {n} gün önce
- `common.confirm_delete`: Silmek istediğine emin misin? Bu işlem geri alınamaz.
- `common.next_phase`: Bu bölüm sonraki güncellemede gelecek.
- `common.dash`: —

**Uygulama ve sekmeler**
- `app.title`: Ayna
- `app.login_required`: Ayna'yı kullanmak için giriş yapmalısın.
- `tab.today`: Bugün
- `tab.map`: Harita
- `tab.coach`: Koç
- `tab.rules`: Kurallar
- `tab.archive`: Arşiv
- `tab.settings`: Ayarlar

**Hatalar**
- `err.unauthorized`: Oturumun kapanmış görünüyor. Tekrar giriş yap.
- `err.not_allowed`: Ayna şu an yalnızca davetli kullanıcılara açık.
- `err.no_profile`: Önce kurulumu tamamla.
- `err.daily_limit`: Bugünkü kullanım sınırına ulaştın. Yarın devam edebilirsin.
- `err.scribe_failed`: Kaydın güvende ama işlenemedi. Tekrar dene.
- `err.model_failed`: Koça şu an ulaşılamadı. Birazdan tekrar dene.
- `err.sync_failed`: İşlemler alınamadı. Birazdan tekrar dene.
- `err.bad_request`: Bu istek işlenemedi. Girdiklerini kontrol edip tekrar dene.
- `err.default`: Bir şeyler ters gitti. Tekrar dene.

**Kurulum**
- `ob.welcome_title`: Ayna'ya hoş geldin
- `ob.welcome_body`: Ayna, yazdıklarından seni tanıyan kişisel bir koç. Günlüğün, duyguların, ilişkilerin ve işlemlerin arasındaki bağlantıları görmene yardım eder. Hüküm vermez; ne gördüğünü ve neye dayandığını gösterir, kararı sana bırakır.
- `ob.consent_title`: Başlamadan önce
- `ob.consent_age_18`: 18 yaşından büyüğüm.
- `ob.consent_service`: Ayna'nın yazdıklarımı, duygu kayıtlarımı, işlemlerimi ve harcamalarımı bana koçluk yapmak amacıyla işlemesini ve bu amaçla yurt dışındaki yapay zeka hizmet sağlayıcısına iletmesini kabul ediyorum.
- `ob.consent_sensitive_data`: Duygu durumu ve ruh hâli kayıtlarımın sağlık verisi sayılabileceğini biliyorum; bu verilerin yalnızca bana hizmet vermek için işlenmesine açık rıza veriyorum.
- `ob.consent_statistics`: İsteğe bağlı: Hiçbir metin veya kişi bilgisi içermeyen, en az 20 kişilik gruplar hâlinde toplanmış anonim sayıların Ayna'nın etkisini ölçmek için kullanılmasına izin veriyorum. İstediğim zaman kapatabilirim.
- `ob.consent_draft`: Bu metinler taslaktır; ticari kullanımdan önce hukuki olarak gözden geçirilecektir.
- `ob.consent_required`: Devam etmek için ilk üç kutuyu işaretlemelisin.
- `ob.tone_title`: Koçun nasıl konuşsun?
- `tone.mentor`: Sakin mentor
- `tone.mentor_desc`: Önce sorar, sonra yol gösterir.
- `tone.coach`: Net antrenör
- `tone.coach_desc`: Lafı dolandırmaz, somut bir adım söyler.
- `tone.friendly`: Sıcak ve samimi
- `tone.friendly_desc`: Yakın bir dille konuşur, gerektiğinde açık olur.
- `ob.meet_title`: Tanışalım mı?
- `ob.meet_body`: Koç sana ailen, çevren, işin ve trade'deki zorlukların hakkında birkaç soru sorar. Sonunda anlattıklarından bir özet çıkarır; neyin kaydedileceğine sen karar verirsin. Yaklaşık 10 dakika sürer.
- `ob.meet_start`: Tanışmaya başla
- `ob.meet_later`: Sonra yaparım
- `ob.start`: Başla
- `ob.meet_first_message`: Merhaba, tanışalım.
- `ob.meet_finish`: Tanışmayı bitir
- `ob.meet_finish_hint`: Birkaç soruyu yanıtladıktan sonra tanışmayı bitirebilirsin.
- `ob.summary_loading`: Anlattıklarından özet çıkarılıyor…
- `ob.summary_title`: Tanışmadan çıkanlar
- `ob.summary_body`: Kaydetmek istediklerini seç. Seçmediklerin kaydedilmez.
- `ob.summary_people`: Kişiler
- `ob.summary_values`: Değerler
- `ob.summary_goals`: Hedefler
- `ob.summary_rules`: Kurallar
- `ob.summary_save`: Seçilenleri kaydet

**Bugün**
- `today.morning_title`: Güne başla
- `today.morning_prompt`: Bugün için niyetin ne?
- `today.morning_placeholder`: Örneğin: Bugün sabırlı olacağım.
- `today.morning_saved`: Bugünkü niyetin
- `today.evening_title`: Günü kapat
- `today.compass_title`: Şu an nasıl hissediyorsun?
- `today.compass_help`: Karede sana en yakın noktaya dokun. Sağa gittikçe daha hoş, yukarı çıktıkça daha enerjik.
- `today.compass_required`: Önce karede bir nokta seç.
- `today.compass_value`: Hoşluk: {p}, Enerji: {e}
- `today.axis_pleasant`: hoş
- `today.axis_unpleasant`: nahoş
- `today.axis_high`: yüksek enerji
- `today.axis_low`: düşük enerji
- `today.words_title`: Hangi kelimeler anlatıyor? En fazla 3 tane seç.
- `today.words_all`: Tüm kelimeleri göster
- `today.words_custom`: Başka bir kelime
- `today.words_add`: Ekle
- `today.sleep`: Dün gece kaç saat uyudun?
- `today.people_title`: Bugün kimlerle bir şey yaşadın?
- `today.people_add`: Yeni kişi
- `today.rules_title`: Bugün kurallarım
- `today.rule_kept`: Uydum
- `today.rule_broken`: Uymadım
- `today.rule_na`: Geçerli değildi
- `today.note_title`: Günün notu
- `today.note_placeholder`: Bugün ne oldu? Aklından geçenleri yaz, düzenlemek zorunda değilsin.
- `today.close_day`: Günü kapat
- `today.processing`: Ayna kaydını işliyor…
- `today.reflection_title`: Günün yansıması
- `today.instant_title`: Anlık yansıma
- `today.evening_done`: Bugünü kapattın.
- `today.quick_note_title`: Hızlı not
- `today.quick_note_placeholder`: Aklına gelen bir şeyi not et.
- `today.loops_title`: Açık uçlar
- `today.loops_empty`: Açık uç yok.
- `today.pending_notice`: Ayna {n} yeni kişi buldu. Haritada onaylayabilirsin.
- `today.pending_link`: Haritaya git
- `today.trades_title`: Bugünkü işlemler
- `today.trades_empty`: Bugün kayıtlı işlem yok.
- `today.trade_planned`: Planımdaydı
- `today.trade_unplanned`: Plan dışı
- `today.trade_emotions`: İşlem öncesi duygu
- `today.sync`: İşlemleri güncelle

**Kriz kartı**
- `crisis.title`: Yalnız değilsin
- `crisis.body`: Yazdıkların, şu an çok zor bir yerde olabileceğini düşündürüyor. Kendini ya da bir başkasını tehlikede hissediyorsan hemen 112'yi ara. Bugün güvendiğin biriyle, bir yakınınla ya da bir sağlık profesyoneliyle konuş. Ayna bir yapay zeka koçu; böyle anlarda bir insanın desteği gerekir.

**Harita**
- `map.title`: İlişki haritan
- `map.center`: Sen
- `map.legend_rings`: İç halka yakın, orta halka güvenilir, dış halka tanıdık.
- `map.legend_warning`: Turuncu çerçeve, kayıtlarında dikkat çeken bir örüntü olduğunu gösterir.
- `map.empty`: Haritan boş. İlk kişiyi ekle ya da günlüğünde birinden bahset; Ayna onu buraya getirsin.
- `map.add_person`: Kişi ekle
- `map.select_hint`: Kartını görmek için haritada bir kişiye dokun.
- `map.pending_title`: Onay bekleyen kişiler
- `map.pending_body`: Ayna bu kişileri günlüğünden buldu. Onaylamadıkça haritada görünmezler.
- `map.pending_from`: Geçtiği kayıt: {summary}
- `map.merge`: Mevcut biriyle birleştir
- `map.merge_select`: Kiminle aynı kişi?
- `map.last_seen`: Son kayıt: {when}
- `map.metric_events`: Son 90 günde olay
- `map.metric_impact`: Ortalama etki
- `map.metric_request`: Talep oranı
- `map.metric_reciprocity`: Alınan / verilen
- `map.metric_reciprocity_value`: %{a} / %{v}
- `map.metric_mood`: Birlikteyken ruh hali
- `map.metric_mood_value`: {d} (genel ortalamana göre)
- `map.warning_request`: Son 90 günde bu kişiyle {n} olayın {k} tanesinde senden bir şey istenmiş.
- `map.warning_impact`: Son 90 günde bu kişiyle yaşanan olayların ortalama etkisi {x}.
- `map.warning_note`: Bu bir yargı değil, kayıtlarının özeti. Dayandığı olaylar aşağıda.
- `map.events_title`: Olaylar
- `map.events_empty`: Bu kişiyle ilgili henüz olay yok.
- `map.event_closed`: kapandı
- `map.event_close_hint`: Kapattığın olaylar arşivde kalır ama örüntülerde ve koçun bağlamında kullanılmaz.
- `map.facts_title`: Süren durumlar
- `map.fact_end`: Artık geçerli değil
- `map.loops_title`: Açık uçlar
- `map.links_title`: Bağlantılı kişiler
- `map.archive_person`: Arşivle
- `map.form_title_new`: Yeni kişi
- `map.form_title_edit`: Kişiyi düzenle
- `map.form_name`: Ad
- `map.form_aliases`: Takma adlar (virgülle ayır)
- `map.form_relation`: İlişki
- `map.form_relation_placeholder`: annem, kardeşim, iş arkadaşım
- `map.form_sector`: Alan
- `map.form_ring`: Halka
- `map.form_traits`: Özellikler (virgülle ayır)
- `map.form_notes`: Not
- `map.form_name_required`: Ad boş olamaz.

**Sabit etiketler**
- `sector.family`: Aile
- `sector.friends`: Arkadaşlar
- `sector.work`: İş / okul
- `sector.other`: Diğer
- `ring.1`: Yakın
- `ring.2`: Güvenilir
- `ring.3`: Tanıdık
- `event.support_received`: Destek aldın
- `event.support_given`: Destek verdin
- `event.request`: Senden bir şey istendi
- `event.lent_money`: Borç verdin
- `event.borrowed_money`: Borç aldın
- `event.conflict`: Gerginlik
- `event.time_together`: Birlikte vakit
- `event.praise`: Takdir
- `event.criticism`: Eleştiri
- `event.promise`: Söz
- `event.other`: Diğer
- `loop.i_promised`: Söz verdin
- `loop.promised_to_me`: Sana söz verildi
- `loop.i_lent`: Borç verdin
- `loop.i_borrowed`: Borç aldın
- `loop.waiting`: Bekleniyor
- `loop.other`: Diğer
- `domain.trade`: Trade
- `domain.relationships`: İlişkiler
- `domain.spending`: Harcama
- `domain.general`: Genel
- `entry.morning`: Sabah niyeti
- `entry.evening`: Akşam kapanışı
- `entry.note`: Not
- `insight.daily`: Günlük yansıma
- `insight.instant`: Anlık yansıma
- `insight.weekly`: Haftalık rapor
- `insight.monthly`: Aylık değerlendirme
- `insight.decision_review`: Karar dönüşü
- `belief.proposed`: Öneri
- `belief.confirmed`: Onaylandı
- `belief.corrected`: Düzeltildi
- `belief.rejected`: Reddedildi
- `direction.long`: Long
- `direction.short`: Short

**Ek etiketler** (bir veri alanının yanında kısa etiket gerektiğinde yalnızca bunlar kullanılır)
- `label.pnl`: R
- `label.summary`: Özet
- `label.intention`: Niyet
- `label.words`: Kelimeler
- `label.sleep_hours`: {s} saat uyku
- `label.reasoning`: Gerekçe
- `label.feeling`: Duygu
- `label.premortem`: Ön değerlendirme
- `label.due`: Vade: {date}
- `label.impact`: Etki {x}
- `consent.age_18`: Yaş onayı
- `consent.service`: Hizmet için veri işleme
- `consent.sensitive_data`: Duygu kayıtlarının işlenmesi
- `consent.statistics`: Anonim istatistik katkısı

**Koç**
- `coach.mode_chat`: Sohbet
- `coach.mode_pre_trade`: İşlem öncesi
- `coach.mode_pre_conversation`: Zor konuşma öncesi
- `coach.mode_big_decision`: Büyük karar
- `coach.mode_onboarding`: Tanışma
- `coach.help_chat`: Aklındakini yaz. Koç önce dinler, sonra birlikte bakarsınız.
- `coach.help_pre_trade`: İşleme girmeden önce: Ne yapmak istiyorsun, neden şimdi ve nasıl hissediyorsun?
- `coach.help_pre_conversation`: Kiminle, ne hakkında konuşacaksın? İstersen önce prova edelim.
- `coach.help_big_decision`: Kararını ve gerekçeni yaz. Koç sonunda kaydetmeyi önerir; belirlenen gün geldiğinde birlikte dönersiniz.
- `coach.empty`: Koça bugün aklını kurcalayan bir şeyi yazarak başla.
- `coach.placeholder`: Yaz. Enter gönderir, Shift ve Enter yeni satır açar.
- `coach.send`: Gönder
- `coach.thinking`: Koç düşünüyor…
- `coach.evidence`: Dayanak ({n})
- `coach.decision_card`: Bu kararı kaydetmek ister misin? Belirlenen gün geldiğinde birlikte dönersiniz.
- `coach.decision_save`: Kararı kaydet
- `coach.decision_saved`: Karar kaydedildi. {date} tarihinde hatırlatılacak.

**Kurallar**
- `rules.title`: Kurallarım
- `rules.intro`: Kural, sakin hâlinin duygusal hâline bıraktığı nottur.
- `rules.empty`: Henüz kuralın yok. İlkini yaz: Eğer … o zaman …
- `rules.if`: Eğer
- `rules.then`: o zaman
- `rules.if_placeholder`: günde iki kayıp yaşarsam
- `rules.then_placeholder`: o gün yeni işlem açmam
- `rules.domain`: Alan
- `rules.add`: Kural ekle
- `rules.adherence`: Son 30 gün: {k}/{t} uyuldu
- `rules.adherence_none`: Henüz yeterli kayıt yok
- `rules.active`: Etkin
- `rules.inactive`: Pasif
- `rules.required`: İki alanı da doldur.
- `rules.values_title`: Değerlerim
- `rules.goals_title`: Hedeflerim
- `rules.values_add`: Değer ekle
- `rules.goals_add`: Hedef ekle
- `rules.values_placeholder`: Örneğin: dürüstlük
- `rules.goals_placeholder`: Örneğin: yıl sonuna kadar düzenli birikim

**Arşiv**
- `archive.reports`: Raporlar
- `archive.good`: İyi anlar
- `archive.decisions`: Kararlar
- `archive.journal`: Günlük
- `archive.reports_empty`: İlk haftalık rapor pazar akşamı gelecek.
- `archive.focus`: Odak: {focus}
- `archive.feedback_q`: Bu rapor işine yaradı mı?
- `archive.fb_useful`: Yararlı
- `archive.fb_not_useful`: Yararsız
- `archive.fb_wrong`: Yanlış bilgi var
- `archive.good_empty`: İyi anlar biriktikçe burada görünecek.
- `archive.decisions_empty`: Koçun Büyük karar modunda kaydettiğin kararlar burada görünür.
- `archive.decision_review_on`: Dönüş tarihi: {date}
- `archive.decision_outcome`: Sonuç ne oldu?
- `archive.decision_outcome_save`: Sonucu kaydet
- `archive.journal_empty`: Henüz kayıt yok.
- `archive.entry_reprocess`: Kaydı yeniden işle
- `archive.entry_error`: Bu kayıt işlenemedi.

**Ayarlar**
- `settings.tone_title`: Koçun tonu
- `settings.beliefs_title`: Koç seni nasıl görüyor
- `settings.beliefs_intro`: Koç zamanla senin hakkında gözlemler önerir. Yalnızca onayladıkların ve düzelttiklerin kullanılır.
- `settings.beliefs_empty`: Henüz bir öneri yok. Haftalık raporlarla birlikte gelecek.
- `settings.belief_confirm`: Doğru
- `settings.belief_correct`: Düzelt
- `settings.belief_reject`: Doğru değil
- `settings.belief_correct_placeholder`: Doğrusu şu:
- `settings.meet`: Tanışma görüşmesini başlat
- `settings.consents_title`: İzinlerin
- `settings.consent_on`: Verildi
- `settings.consent_off`: Verilmedi
- `settings.consent_stats_toggle`: Anonim istatistiklere katkı
- `settings.export_title`: Verilerini indir
- `settings.export_body`: Tüm Ayna verin senindir. İstediğin zaman indirebilirsin.
- `settings.export_obsidian`: Obsidian klasörü olarak indir (.zip)
- `settings.export_json`: Tam yedek olarak indir (.json)
- `settings.export_working`: Hazırlanıyor…
- `settings.delete_title`: Tüm Ayna verimi sil
- `settings.delete_body`: Günlüklerin, haritan, sohbetlerin, raporların ve kuralların kalıcı olarak silinir. Site hesabın etkilenmez.
- `settings.delete_confirm_label`: Onaylamak için SİL yaz
- `settings.delete_button`: Kalıcı olarak sil
- `settings.deleted`: Ayna verilerin silindi.

### K3. Kelime listeleri (her dilde Türkçe gösterilir ve kaydedilir)

- Yüksek enerji, hoş: heyecanlı, coşkulu, umutlu, gururlu, meraklı, odaklı, neşeli, istekli
- Yüksek enerji, nahoş: gergin, öfkeli, kaygılı, stresli, sabırsız, huzursuz, sinirli, panik içinde
- Düşük enerji, nahoş: yorgun, üzgün, kırgın, bıkkın, yalnız, hayal kırıklığına uğramış, tükenmiş, umutsuz
- Düşük enerji, hoş: sakin, huzurlu, rahat, minnettar, dingin, memnun, güvende, dinlenmiş
- İşlem duyguları: sakin, emin, heyecanlı, FOMO, intikam, korku, açgözlülük, sıkılmışlık

---

## BÖLÜM L — Fazlar

Her faz: B4 önkoşulu, yalnızca listelenen dosyalar, B16 kontrolleri, B18 devir notu, tek commit, dur.

### FAZ 1 — Temel

**Önkoşul:** BÖLÜM D'nin zorunlu alanları dolu; B10 git kontrolü temiz.

**İzinli dosyalar.** Yeni: `supabase/ayna/001_schema.sql`; `api/ayna.mjs`; `ayna-server/` altında `http.mjs`, `time.mjs`, `supabase.mjs`, `anthropic.mjs`, `limits.mjs`, `prompts.mjs`, `tools.mjs`, `actions/ping.mjs`, `actions/scribe.mjs`, `actions/reflect.mjs`, `actions/coach.mjs`, `actions/onboarding-summary.mjs`, `actions/sync.mjs`, `jobs/daily.mjs`; `ayna/` altındaki dokuz dosya; `ayna-docs/AYNA_KURULUM.md`, `ayna-docs/AYNA_DEVIR.md`. Değişen: `index.html` (yalnızca F4), `vercel.json` (F6); yeni: `.vercelignore` (F7); taşınan: `KESIF_RAPORU.md` (F7).

**Görevler:**
1. `ayna` branch'ine geç (yoksa oluştur).
2. F7'yi uygula.
3. BÖLÜM G'deki SQL'i `supabase/ayna/001_schema.sql` olarak birebir yaz.
4. BÖLÜM H2'deki dosyaları birebir yaz.
5. BÖLÜM I'daki metinleri `ayna-server/prompts.mjs` dosyasına, şemaları `ayna-server/tools.mjs` dosyasına birebir yaz.
6. Taslaklar: `ayna-server/actions/` altındaki `scribe.mjs`, `reflect.mjs`, `coach.mjs`, `onboarding-summary.mjs` ve `sync.mjs` dosyalarının varsayılan dışa aktarımı yalnızca `return fail(res, 400, 'bad_request');` yapar. `scribe.mjs` ayrıca `export async function runScribe() { throw new Error('not_implemented'); }`, `sync.mjs` ayrıca `export async function runSync() { return { trades: { skipped: true }, expenses: { skipped: true } }; }` dışa aktarır. `ayna-server/jobs/daily.mjs` varsayılan olarak `async () => ({ processed: 0 })` dışa aktarır.
7. F6'yı uygula.
8. İstemci: `ayna-i18n.js` (BÖLÜM K'nın tamamı, TR ve EN); `ayna-core.css` (J11: tema bloğu, kök yerleşim, sekme çubuğu, `#ayna-flash`); `ayna-core.js` (J1'in tamamı; bu fazda `render()` 3. ve 4. adımları yerine `api('ping')` çağırır, `not_allowed` ise `err.not_allowed` gösterir, başarılıysa 5. adıma geçer); diğer altı sekme dosyası yalnızca kendini `Ayna.tabs`'a kaydeder ve `common.next_phase` gösterir.
9. F4'teki tüm `index.html` eklemelerini yap.
10. BÖLÜM N'deki metni `ayna-docs/AYNA_KURULUM.md` olarak birebir yaz.
11. B16, B18, commit: `ayna: faz 1 - temel`.

**Kabul listesi (kullanıcı):**
1. Supabase SQL Editor'da `supabase/ayna/001_schema.sql` içeriğini çalıştırın; hata vermemeli. Aynı içeriği ikinci kez çalıştırın; yine hata vermemeli.
2. Supabase tablo görünümünde 19 `ayna_` tablosu bulunmalı ve hepsinde RLS açık görünmeli.
3. `ayna-docs/AYNA_KURULUM.md`'deki ortam değişkenlerini Vercel'de Preview ortamına tanımlayın.
4. `ayna` branch'ini push edin ve Vercel önizleme adresini açın.
5. Yönetici hesabıyla giriş yapın: "⚡ Trader" menüsünde (mobilde "⚡ Trader" grubunda) "🧠 Ayna" görünmeli; tıklayınca altı sekmeli Ayna sayfası açılmalı. Yönetici olmayan bir hesapta bu link hiç görünmemeli.
6. Tarayıcı konsolunda `await Ayna.api('ping')` çalıştırın: `{ ok: true, user_id: ... }` dönmeli.
7. İzin listesinde olmayan bir hesapla konsolda aynı komut `not_allowed` hatası vermeli; Ayna sayfasına nav'dan erişilememeli.
8. Önizleme adresinde `/api/ayna` açılınca `{"error":"unauthorized"}` dönmeli (GET isteği cron ucudur ve gizli anahtar ister). Vercel dağıtımı hatasız tamamlanmış olmalı; Vercel proje panelindeki Functions listesinde `api/ayna` görünmeli ve `ayna-server/` altındaki dosyalar fonksiyon olarak listelenmemeli.
9. `/ayna-docs/AYNA_MASTER_PROMPT.md` ve `/supabase/ayna/001_schema.sql` adresleri 404 dönmeli.
10. Ayna sayfası açık ve koyu temada, telefonda ve masaüstünde düzgün görünmeli. Ana Menü, Alfa Defter ve Trade Günlüğü eskisi gibi çalışmalı; konsolda yeni hata olmamalı.

### FAZ 2 — Günlük, katip ve harita

**İzinli dosyalar:** `ayna-server/actions/scribe.mjs`; `ayna/ayna-core.js`, `ayna/ayna-today.js`, `ayna/ayna-map.js`, `ayna/ayna-archive.js`, `ayna/ayna-core.css`; `index.html` (yalnızca `?v=` artışı).

**Görevler:**
1. `scribe.js`: H4'teki `runScribe` ve kullanıcı işlemi (tamamı).
2. `ayna-core.js`: `render()` J1'deki tam hâline getirilir (`ping` adımı kaldırılır); J2'nin 1–3. adımları (3. adım Faz 2 biçimiyle, yalnızca `ob.start`).
3. `ayna-today.js`: J3'teki 1, 3, 4, 5 ve 6. kartlar. Bu fazda 4. kartın (f) adımı ve 5. karttaki `reflect` çağrısı yapılmaz.
4. `ayna-map.js`: J5'in tamamı.
5. `ayna-archive.js`: J8'in yalnızca Günlük alt sekmesi; diğer alt sekmeler `common.next_phase`.
6. Stiller J11'e göre. `?v=` artışı. B16, B18, commit: `ayna: faz 2 - gunluk, katip, harita`.

**Kabul listesi (kullanıcı):**
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

### FAZ 3 — Koç

**İzinli dosyalar:** `ayna-server/context.mjs`, `ayna-server/metrics.mjs` (yalnızca kişi metrikleri metni, bağımlılık bayrağı ve kör nokta), `ayna-server/actions/reflect.mjs`, `coach.js`, `onboarding-summary.js`; `ayna/ayna-core.js`, `ayna/ayna-today.js`, `ayna/ayna-coach.js`, `ayna/ayna-rules.js`, `ayna/ayna-settings.js`, `ayna/ayna-core.css`; `index.html` (yalnızca `?v=`).

**Görevler:**
1. H5 (`context.js`), H8'in belirtilen kısmı (`metrics.js`), H4'teki `reflect`, `coach` ve `onboarding-summary` işlemleri.
2. `ayna-core.js`: J2'nin 3–5. adımlarının tam hâli.
3. `ayna-today.js`: 2. kart, 4. kartın (f) adımı ve yansıma yeniden deneme, 5. karttaki `instant` yansıma.
4. `ayna-coach.js`: J6. `ayna-rules.js`: J7. `ayna-settings.js`: J9'un ton, gözlemler ve tanışma bölümleri; diğer bölümler bu fazda gösterilmez.
5. Stiller, `?v=`, B16, B18, commit: `ayna: faz 3 - koc`.

**Kabul listesi (kullanıcı):**
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

### FAZ 4 — Veri kaynakları ve raporlar

**İzinli dosyalar:** `ayna-server/actions/sync.mjs`, `ayna-server/jobs/daily.mjs`, `weekly.js`, `monthly.js`, `ayna-server/metrics.mjs`; `ayna/ayna-today.js`, `ayna/ayna-archive.js`, `ayna/ayna-core.css`; `index.html` (yalnızca `?v=`).

**Görevler:**
1. H6 (`runSync` ve `sync` işlemi), H7 (üç görev dosyası), H8'in paket kısımları.
2. `ayna-today.js`: 7. kart (D15≠YOK ise).
3. `ayna-archive.js`: J8'in tamamı.
4. Stiller, `?v=`, B16, B18, commit: `ayna: faz 4 - kaynaklar ve raporlar`.

**Kabul listesi (kullanıcı):**
1. `CRON_SECRET` değişkenini tanımlayıp yeniden deploy edin.
2. D15≠YOK ise Bugün > "İşlemleri güncelle": bugünkü işlemler listelenmeli. Site kaynağında planlı durumu ve duygu seçilebilmeli; ikinci bir güncelleme bu seçimleri silmemeli.
3. D17≠YOK ise `ayna_expenses` tablosu dolmalı.
4. `curl -H "Authorization: Bearer <CRON_SECRET>" "https://<önizleme adresi>/api/ayna?force=weekly&user=<kullanıcı kimliği>"` → `{"ok":true,"processed":1}`; bu hafta en az 2 kayıt varsa Arşiv > Raporlar'da haftalık rapor görünmeli. Komutu tekrarlayın: ikinci rapor oluşmamalı.
5. Aynı komutu `force=monthly` ile çalıştırın. Önceki ayda en az 5 akşam kaydı yoksa rapor oluşmaması beklenen davranıştır.
6. Haftalık rapordan sonra (öneri geldiyse) Ayarlar > "Koç seni nasıl görüyor"da öneriler görünmeli; Doğru, Düzelt ve Doğru değil çalışmalı; reddedilen gözlem koçun sonraki yanıtlarında kullanılmamalı.
7. Supabase'de bir kararın `review_date` değerini bugüne çekip cron komutunu çalıştırın: Raporlar'da "Karar dönüşü" görünmeli; Kararlar'dan sonucu yazınca kaydedilmeli.
8. Rapor geri bildirim düğmeleri seçimi kaydetmeli.
9. Production'a alındıktan sonra Vercel proje panelindeki Cron Jobs bölümünde görev listelenmeli.

### FAZ 5 — Veri sahipliği ve son kontroller

**İzinli dosyalar:** `ayna/ayna-settings.js`, `ayna/ayna-core.css`; `index.html` (yalnızca `?v=`).

**Görevler:**
1. J9'un izinler, dışa aktarım ve silme bölümleri; J10'un tamamı.
2. Tüm Ayna dosyalarında B16 kontrollerini çalıştır.
3. Devir notuna ek olarak tüm Ayna dosyalarının listesini ve F5'teki ortam değişkenlerinin listesini yaz.
4. `?v=`, B18, commit: `ayna: faz 5 - veri sahipligi`.

**Kabul listesi (kullanıcı):**
1. Ayarlar > İzinlerin: durumlar doğru görünmeli; istatistik katkısını açıp kapatın: `ayna_consents`'e yeni satırlar eklenmeli, eskiler silinmemeli.
2. "Tam yedek olarak indir": JSON dosyası inmeli ve 19 tablonun tamamını içermeli.
3. "Obsidian klasörü olarak indir": zip'i açın, klasörü Obsidian'da kasa olarak açın. Grafik görünümünde kişiler ve günler birbirine bağlı görünmeli; Türkçe karakterler bozulmamalı.
4. Bir test hesabıyla "Tüm Ayna verimi sil": `SİL` yazılmadan düğme çalışmamalı; silince kurulum ekranı gelmeli; Supabase'de bu hesaba ait hiçbir `ayna_` satırı kalmamalı; site hesabı ve diğer sayfalar etkilenmemeli.
5. Devir notundaki B16 sonuçları temiz olmalı.

**Canlıya alma (kullanıcı):** `ayna` branch'ini ana branch'e birleştirin; ortam değişkenlerini Production ortamına da tanımlayın; SQL aynı Supabase projesinde zaten çalıştırıldıysa tekrar gerekmez; ilk gece cron'un çalıştığını Vercel loglarından doğrulayın.

---

## BÖLÜM M — Kapsam dışı (hiçbir fazda yapılmaz)

- Anonim istatistik deposu ve herkese açık etki sayfası. (Mimari hazırdır: `statistics` izni kaydedilir; veri hattı kurulmaz.)
- WHO-5 veya başka bir iyi oluş ölçeği.
- Sesli giriş, Telegram veya WhatsApp botu, anlık (push) bildirimler.
- Hayat bölümleri, zaman kapsülü, soru bankası, okul takvimi entegrasyonu.
- Ayna'nın Notion'a doğrudan bağlanması. (Trade verisi sitenin kendi Notion senkronuyla `journals` içine düştüğü için Ayna yalnızca oradan okur.)
- Ödeme, abonelik, plana göre erişim.
- Yapay zeka çıktılarının İngilizce üretilmesi.
- Embedding, anlamsal arama, pgvector, Batch API, akışlı (streaming) yanıt.
- Mevcut trade veya bütçe formlarına alan eklemek; mevcut herhangi bir modülü değiştirmek.
- `sw.js` veya `middleware.js` değişikliği; `index.html` refaktörü.
- iOS veya Android uygulaması.
- Bir yöneticinin ya da herhangi bir kişinin başka bir kullanıcının Ayna verisini görmesini sağlayan her türlü ekran, sorgu veya yetki. Bu hiçbir koşulda yapılmaz.

---

## BÖLÜM N — `ayna-docs/AYNA_KURULUM.md` içeriği (Faz 1'de birebir yazılır)

```
# Ayna kurulum notları

## 1. Veritabanı
Supabase panelinde SQL Editor'ı açın, supabase/ayna/001_schema.sql dosyasının tamamını yapıştırıp çalıştırın. Dosya tekrar çalıştırılabilir.

## 2. Ortam değişkenleri
Vercel proje ayarlarındaki Environment Variables bölümüne ekleyin; önce Preview, canlıya alırken Production ortamına:
- ANTHROPIC_API_KEY: Claude Platform'dan (platform.claude.com) alınan API anahtarı.
- AYNA_ALLOWED_USER_IDS: Ayna'yı kullanacak hesapların Supabase kullanıcı kimlikleri, virgülle ayrılmış. Kimlikler Supabase panelinin Authentication bölümündeki kullanıcı listesinde görünür.
- CRON_SECRET: En az 32 karakterlik rastgele bir dizi.
- İsteğe bağlı: AYNA_MODEL_SCRIBE ve AYNA_MODEL_COACH (boş bırakılırsa varsayılan modeller kullanılır).
Şu üçü projede zaten tanımlıdır ve Ayna bunları aynen kullanır: SUPABASE_URL, SUPABASE_PUBLISHABLE, SUPABASE_SERVICE_ROLE. Tanımlı değilse eklenmelidir; SUPABASE_SERVICE_ROLE, Supabase panelindeki gizli (secret veya service_role) anahtardır ve asla istemci koduna veya repoya yazılmaz.
Değişkenleri ekledikten sonra yeniden deploy edin.

## 3. Maliyet kalkanı
Claude Platform'da aylık harcama limiti tanımlayın. Ayna kullanıcı başına günlük çağrı sınırları uygular; ayna_usage tablosu tüm çağrıları ve token sayılarını tutar.

## 4. Bilinmesi gerekenler
- Vercel Hobby planında cron günde bir kez ve belirtilen saatten sonraki bir saat içinde çalışır; fonksiyon süresi 60 saniyeyle sınırlıdır. Ayna bu sınırlara göre yazılmıştır.
- `journals` tablosu bütçe, trade günlüğü, portföy ve karne verisinin tamamını tutar. Bu tabloda RLS kapalıysa (Supabase panelinde uyarı olarak görünür), sitenin açık anahtarıyla bu veriler dışarıdan okunabilir. Ayna'dan bağımsız ama öncelikli bir konudur.
- Projede zaten 11 Vercel fonksiyonu vardır; Ayna tek fonksiyon ekler. Bu yüzden sunucu yardımcıları `api/` klasörünün dışında, `ayna-server/` altında durur.
- Onay metinleri taslaktır. Ticari kullanımdan önce KVKK kapsamında hukuki görüş alınmalı; yurt dışına veri aktarımı (Supabase ve Claude) için standart sözleşme ve bildirim yükümlülükleri değerlendirilmelidir.
```

---

Belgenin sonu.
