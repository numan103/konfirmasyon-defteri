# KEŞIF RAPORU — Alfa Traders (Konfirmasyon Defteri)

> Bu rapor, `repo-konfirmasyon` projesinin tam teknik analizini içerir. Hiçbir kod değiştirilmemiştir.

---

## 1. DOSYA YAPISI

```
repo-konfirmasyon/
├── .gitignore                     # .vercel ve node_modules hariç tutar
├── .vercel/
│   ├── project.json               # Vercel proje bağlamı (team/org ID)
│   └── README.txt                 # Vercel klasör açıklaması
├── api/                           # Vercel Serverless Functions (11 dosya)
│   ├── ai-checklist.mjs           # AI checklist üretici (Groq/LLaMA)
│   ├── ai.mjs                     # AI sohbet botu (Groq/Gemini)
│   ├── chat-admin.mjs             # Sohbet yönetimi (Vercel Blob)
│   ├── contrib.mjs                # Topluluk katkıları + Çalışma Panosu
│   ├── eco-cal.mjs                # Ekonomik takvim proxy (faireconomy.media)
│   ├── edu-shared.mjs             # Eğitim içeriği paylaşımı (Supabase)
│   ├── notion-callback.mjs        # Notion OAuth callback
│   ├── notion-sync.mjs            # Notion ticaret senkronizasyonu
│   ├── notion-trades.mjs          # Notion ticaret sorgusu
│   ├── notion-week.mjs            # Notion haftalık değerlendirme
│   └── tg.mjs                     # Telegram entegrasyonu (bildirim + kanal okuma)
├── alfa-body.png                  # Alfa görsel varlığı
├── bump.js                        # Versiyon bump betiği (cache ID güncelleme)
├── chk_0.js                       # Tema modülü (dark/light toggle)
├── chk_1.js                       # Fiyat ticker'ı (Binance API)
├── chk_2.js                       # TradingView grafik embed
├── chk_3.js                       # TradingView notları (localStorage)
├── chk_4.js                       # Ekonomik takvim render
├── chk_5.js                       # Çekirdek uygulama mantığı (~12.900 satır)
├── chk_6.js                       # Başvuru formu + admin panel
├── chk_7.js                       # i18n çeviri sözlüğü (~565 satır)
├── ds-strat-test.js               # Strateji fonksiyonları birim testleri
├── ds-verify.js                   # Deployment doğrulama betiği
├── favicon.png                    # Site faviconı
├── import-check.js                # Import/birleştirme kontrolü
├── index.html                     # ANA DOSYA — tüm uygulama (28.843 satır)
├── index-local.html               # Yerel geliştirme varyantı
├── local-check.js                 # Yerel özellik doğrulama
├── manifest.webmanifest           # PWA manifest dosyası
├── middleware.js                   # Vercel Edge middleware (OG meta bot tespiti)
├── og.png                         # Open Graph sosyal önizleme görseli
├── package-lock.json              # npm kilit dosyası
├── package.json                   # Minimal: sadece @vercel/blob bağımlılığı
├── poll-deploy.js                 # Deploy polling betiği
├── sim-ap2.js                     # Alfa Portföy 2 birim testleri
├── sim-sos2.js                    # Sosyal Metre birim testleri
├── sw.js                          # Service Worker (stale-while-revalidate)
├── vercel.json                    # Vercel yapılandırması (alias: alfatraders.vercel.app)
└── workspace-btc-cvd.json         # BTC CVD çalışma alanı verisi
```

### HTML Sayfaları

| Dosya | Açıklama |
|---|---|
| `index.html` | Ana uygulama — tek sayfalık SPA (Single Page Application). Tüm sayfalar, stiller ve JavaScript bu dosyanın içinde. |
| `index-local.html` | Yerel geliştirme/testing varyantı. Üretimle aynı yapıda ama farklı sayfa yönlendirmeleri. |

---

## 2. TEKNOLOJİ

### Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Frontend | **Saf HTML/CSS/JS** — React, Vue, Angular gibi bir framework KULLANILMIYOR |
| Backend | **Vercel Serverless Functions** (11 API endpoint) |
| Veritabanı | **Supabase** (PostgreSQL + Auth + Realtime) |
| Dosya Depolama | **Vercel Blob** (sohbet mesajları) |
| CDN | **Vercel Edge Network** + Service Worker |
| Hosting | **Vercel** (alias: `alfatraders.vercel.app`, üretim: `alfa-trader.com`) |

### CDN'den Yüklenen Harici Kütüphaneler

| Kütüphane | Sürüm | Yüklendiği Yer |
|---|---|---|
| **Google Fonts** (Inter + Sora) | Inter: 400-700, Sora: 600-800 | `index.html` `<head>` (satır ~23) |
| **Supabase JS Client** | v2 (latest) | `index.html` `<head>` (satır ~24) — `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` |

> **Not:** Başka harici kütüphane veya framework yok. Tüm ikonlar inline SVG, tüm stiller inline CSS.

### Build Aracı / Derleme

- **Build aracı YOK** — Webpack, Vite, Rollup gibi bir derleme sistemi bulunmuyor
- `chk_0.js` - `chk_7.js` dosyaları bağımsız çalışır, HTML'e doğrudan gömülür
- `bump.js` — Manuel versiyon güncelleme betiği (cache/build ID'leri değiştirir)
- `package.json` çok minimal: sadece `@vercel/blob: ^2.6.0` bağımlılığı var, script tanımı yok
- Deployment: Vercel'e `git push` ile otomatik deploy (Git-integrated)

---

## 3. HARCAMA VERİSİ (Bütçe / Alfa Defter)

### Depolama Konumu

Harcama/gelir-gider verisi **localStorage**'da saklanır. Anahtarı: `defter-butce-v1`. Buna ek olarak, kullanıcı giriş yaptıysa Supabase `journals` tablosuna da senkronize edilir (`store.set()` aracılığıyla).

### localStorage Anahtarları

| Anahtar | Amaç |
|---|---|
| `defter-butce-v1` | Tüm bütçe verisi (gelir/gider kayıtları + kategoriler + aylık limit) |

### Harcama Kaydının Veri Yapısı

```
butceData = {
  entries: [
    {
      id:       string    // 'b' + timestamp36 + random (ör: "b1k9x4mz7wq2")
      type:     string    // 'gelir' | 'gider'
      cat:      string    // kategori ID'si (ör: 'gida', 'maas', 'kira')
      date:     string    // ISO tarih "YYYY-MM-DD"
      amount:   number    // pozitif tutar (₺)
      note:     string    // opsiyonel açıklama
      created:  number    // Date.now() oluşturma zaman damgası
    }
  ],
  cats: [
    {
      id:     string    // 'c' + timestamp36 + random
      name:   string    // görüntülenen ad
      icon:   string    // emoji
      color:  string    // hex renk kodu
      type:   string    // 'gelir' | 'gider'
    }
  ],
  budget: {
    monthly: number     // aylık harcama limiti (₺), 0 = limitsiz
  }
}
```

### Örnek Kayıtlar (Maskelenmiş)

**Gider kaydı:**
```json
{
  "id": "b1k9x4mz7wq2",
  "type": "gider",
  "cat": "gida",
  "date": "2026-09-15",
  "amount": 999,
  "note": "örnek",
  "created": 1757942400000
}
```

**Gelir kaydı:**
```json
{
  "id": "b1k9x4mz8abc",
  "type": "gelir",
  "cat": "maas",
  "date": "2026-09-01",
  "amount": 999,
  "note": "örnek",
  "created": 1756646400000
}
```

**Restoran gideri:**
```json
{
  "id": "b1k9x4mz9def",
  "type": "gider",
  "cat": "restoran",
  "date": "2026-09-10",
  "amount": 999,
  "note": "örnek",
  "created": 1757510400000
}
```

### CRUD Fonksiyonları

| Fonksiyon | Satır | Görev |
|---|---|---|
| `butceSaveForm()` | 15836 | **Ekleme/Düzenleme** — form alanlarını okur, yeni kayıt ekler veya mevcut kaydı günceller |
| `butceOpenForm(entry)` | 15824 | **Düzenleme** — mevcut bir kaydı forma doldurarak açar |
| `butceDelete(id)` | 15858 | **Silme** — `window.confirm()` ile onay alıp kaydı siler |
| `butceQuickSave()` | 15958 | **Hızlı Ekleme** — tek satır input'tan anında kayıt (bugünün tarihi ile) |
| `butceRenderList(month)` | 15724 | **Listeleme** — belirli ay için filtrelenmiş/sıralanmış kayıtları render eder |
| `renderButce()` | 15752 | **Tam Sayfa Render** — özet kartları, bütçe çubuğu, pasta grafik, efsane, çubuklar, filtreli liste |
| `loadButce()` | 15977 | **Yükleme** — `store.get(BUTCE_KEY)` ile veriyi okur |
| `saveButce()` | 15986 | **Kaydetme** — `butceData`'yı `store.set(BUTCE_KEY, ...)` ile yazar |

### Kategori Sistemi

- **19 hazır kategori** `BUTCE_CATS` sabitinde (satır 15583):
  - **14 gider:** Gıda & Market, Restoran & Dışarı, Ulaşım, Faturalar, Kira & Ev, Eğlence & Oyun, Giyim & Aksesuar, Sağlık, Eğitim, Abonelikler, Kredi Kartı, Kripto & Yatırım, Hediye & Kişisel, Diğer Gider
  - **5 gelir:** Maaş, Serbest Çalışma, Yatırım Getirisi, Kripto Kâr, Diğer Gelir
- Her kategori: `id`, `name`, `icon` (emoji), `color` (hex), `type` ('gelir'/'gider')
- Kullanıcı kategorileri `butceData.cats[]` dizisinde tutulur (`c` ön ekli otomatik ID)
- `butceCat(id)` (15682): Önce özel kategorilere bakar, sonra hazır kategorilere düşer
- İkonlar `BUTCE_ICONS` dizisinden seçilir, renkler `BUTCE_COLORS` paletinden döngüsel atanır

### Tarih ve Para Birimi

- **Tarihler:** ISO format `"YYYY-MM-DD"` olarak saklanır
- `butceMonthKey(d)` — herhangi bir tarihten `"YYYY-MM"` ay anahtarı çıkarır
- `butceFilterMonth(entries, mk)` — belirli aya göre filtreleme
- `butceMonthShift(mk, delta)` — aylar arası gezinme (+/- delta)
- **Para birimi:** Sadece Türk Lirası (TRY) desteklenir
- `butceMoney(n)` — `toLocaleString('tr-TR')` ile `₺` ekli format

---

## 4. DİĞER VERİLER

Harcama dışında saklanan tüm veriler ve yapıları:

| localStorage Anahtarı | Modül | Veri Yapısı Özeti |
|---|---|---|
| `konfirmasyon-defteri-v3` | Ana uygulama | `{ pairs: { BTC/XAU: { thresholds, criteria[] } } }` — İşlem çifti kriterleri, eşikler |
| `defter-ai-profile-v1` | AI Profili | `{ market, experience, strategy, emotions[], problem, criteria[], thresholds }` — Kişiselleştirilmiş AI koçluk profili |
| `defter-daily:<tarih>[:<pair>]` | Günlük Plan | `{ bias, pair, sabah, senaryo, anti, gunsonu }` — Günlük trading planı |
| `defter-trades-v1` | İşlem Kayıtları | `[{ date, pair, direction, score, verdict, pnl, images[], note }]` — Konfirmasyon defteri işlemleri |
| `defter-lessons-v1` | Dersler | `{ lessons: [{id, text, src}], log: { tarih: [{id, answer}] } }` — Trading dersleri + takip |
| `defter-data-v1` | Trade Günlüğü | `[{ date, pair, direction, pnl, r }]` — R-cinsinden işlem kayıtları |
| `alfanews-shared-v1` | AlfaNews | `{ issueNo, entries: [{title, body, images[]}], authors: [] }` — Dergi formatında analizler |
| `defter-reviews-v1` | Haftalık Değerlendirme | `{ "YYYY-Wnn": { metrics[], sections[], lessons } }` — Haftalık RR + retrospektif |
| `defter-review-cfg-v1` | Değerlendirme Şablonu | `{ metrics: [{label, max}], sections: [{title}] }` — Özelleştirilebilir şablon |
| `defter-strategies-v1` | Strateji Yönetimi | `{ list: [{ id, name, status, rules[], trades[], metrics }] }` — Trading stratejileri |
| `defter-analiz-v1` | Analiz Köşesi | `{ list: [{ id, title, coins[], direction, note, images[] }] }` — Teknik analiz notları |
| `defter-portfoy-v1` | Portföy | `{ positions: [{id, type, symbol, amount, price}], cash, sells[] }` — Kripto/altın portföy takibi |
| `defter-sosyalmetre-v2` | Sosyalmetre | `{ trades[], bands[], checklists[], rules[] }` — Sosyal medya trading metrikleri |
| `defter-egitim-v1` | Eğitim | `{ modules: [{id, title, chapters: [{id, title, content, links[]}]}] }` — Yapılandırılmış öğrenme içeriği |
| `alfa-pano-canvas-v1` | Çalışma Panosu | `{ objects: [], toolbar: {left, top} }` — İşbirlikçi beyaz tahta (yapışkan notlar) |
| `defter-designer-v1` | Alfa Designer | `{ elements: [] }` — UI tasarım sayfası |
| `alfa-mentoring-v1` | Mentörlük | `{ channels: [], shorts: [] }` — Trader paylaşım kanalları |
| `alfa-karne-v1` | Günlük Karnesi | `{ "YYYY-MM-DD": { a: [0\|1\|null x8], ts } }` — 8 disiplin sorusu |
| `alfa-karne-life-v1` | Yaşam Dengesi | `{ "YYYY-Wnn": { answers: [], ts } }` — Haftalık yaşam dengesi değerlendirmesi |
| `alfa-zaman-v1` | Zaman Takibi | `{ cats: [], days: {}, water: {}, waterGoal: 8 }` — Kategori bazlı zaman harcama + su |
| `alfa-kisisel-v1` | Kişisel Gelişim | `{ items: [{id, name, icon, dir, active}], days: {} }` — Hedef takibi + seriler |
| `alfa-strateji-v1` | Strateji İzleme | `{ list: [{ id, name, stage, todo, strong, weak, confidence }] }` — Strateji aşama takibi |
| `alfa-theme` | Tema | `'dark'` veya `'light'` |
| `alfa-lang` | Dil | `'tr'` veya `'en'` |
| `df-last-page` | Son Sayfa | Sayfa adı stringi (otomatik geri yükleme) |
| `alfa-survey-v1` | Anket | `{ answers: {...}, ts }` veya `{ skipped: true }` |
| `alfa-login-rem` | Beni Hatırla | `{ email, pass }` — **(şifre düz metin!)** |
| `alfa-chat-v3` | Sohbet | `[{ role, text, name?, ts }]` — Mesaj geçmişi |
| `alfa-chat-sid` | Sohbet Oturumu | Oturum ID stringi |

**Toplam benzersiz localStorage anahtarı:** 41+

---

## 5. DIŞ BAĞLANTILAR

### API Çağrıları (İstemci Taraflı)

**Dahili `/api/` Endpointleri:**

| URL | Yöntem | Amaç | Çağıran Fonksiyon |
|---|---|---|---|
| `/api/ai` | POST | AI koçuna mesaj gönder (Groq/Gemini) | `aiCoach()` |
| `/api/ai-checklist` | POST | AI trading checklist üret | inline |
| `/api/notion-sync` | POST | İşlem verisini Notion'a senkronize et | `syncToNotion()` |
| `/api/notion-trades` | GET | Notion'dan işlemler çek | `loadNotionTrades()` |
| `/api/notion-week` | GET/POST | Haftalık değerlendirmeyi Notion'dan çek/push et | `loadNotionWeek()` / `pushNotionWeek()` |
| `/api/chat-admin` | GET/POST/DELETE | Sohbet yönetimi | admin panel |
| `/api/eco-cal` | GET | Ekonomik takvim verisi | takvim loader |
| `/api/contrib?store=pano&room=X` | GET/POST | Çalışma Panosu okuma/yazma | pano senkronizasyonu |
| `/api/edu-shared` | GET/POST | Paylaşılan eğitim içeriği | edu sayfa yükleyicileri |
| `/api/tg` | POST | Telegram bot entegrasyonu | bildirim gönderici |

**Harici API Çağrıları:**

| URL | Amaç |
|---|---|
| `api.binance.com/api/v3/ticker/24hr` | Kripto fiyatları (BTC, ETH, SOL) |
| `okx.com/api/v5/market/tickers` | OKX piyasa verileri |
| `api.frankfurter.dev/v1/latest` | Döviz kurları (USD/EUR/JPY/TRY) |
| `api.gold-api.com/price/XAU` | Altın fiyatı |
| `api.gold-api.com/price/XAG` | Gümüş fiyatı |
| `text.pollinations.ai/<prompt>` | Ücretsiz AI metin üretimi (fallback) |
| `api.vxtwitter.com/twitter/status/<id>` | Tweet verisi çekme |
| `r.jina.ai/<url>` | Web sayfası okuyucu/scraper |
| Google Sheets Apps Script URL | Uygulama analitiği, sohbet kaydı |

### API Anahtarı / Token / Şifre

| Değişken | Konum | Tür |
|---|---|---|
| `SUPABASE_URL` | `index.html` satır ~8208 | **KOD İÇİNE YAZILI** — Supabase proje URL'i |
| `SUPABASE_ANON_KEY` | `index.html` satır ~8209 | **KOD İÇİNE YAZILI** — Supabase publishable anahtarı |
| `SUPABASE_KEY` | `middleware.js` satır ~9 | **KOD İÇİNE YAZILI** (fallback) |
| `SUPABASE_KEY` | `api/edu-shared.mjs` satır ~9 | **KOD İÇİNE YAZILI** (fallback) |
| `SUPABASE_KEY` | `api/contrib.mjs` satır ~3 | **KOD İÇİNE YAZILI** (fallback) |
| `BAS_GS_URL` | `index.html` satır ~25357 | **KOD İÇİNE YAZILI** — Google Sheets Apps Script URL |
| `ADMIN_EMAIL` | `index.html` satır ~11647 | **KOD İÇİNE YAZILI** — `ahmetnuman20@gmail.com` |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | `api/ai.mjs` satır ~27 | **Ortam değişkeni** (server-side) |
| `NOTION_TOKEN` | `api/notion-sync.mjs` satır ~174 | **Ortam değişkeni** (server-side) |
| `BLOB_READ_WRITE_TOKEN` | `api/chat-admin.mjs` satır ~7 | **Ortam değişkeni** (server-side) |
| `notion_oauth_token` | `index.html` (localStorage) | Kullanıcının Notion OAuth token'ı (cihazda saklanır) |
| `alfa-login-rem` | `index.html` satır ~23978 | **Düz metin şifre** — localStorage'da email + şifre saklanır |

> **Güvenlik Uyarısı:** `alfa-login-rem` anahtarı kullanıcının şifresini düz metin olarak localStorage'da saklar.

---

## 6. GİRİŞ VE GÜVENLİK

### Kimlik Doğrulama Sistemi

- **Sağlayıcı:** Supabase Auth (v2 istemci SDK'sı CDN'den yüklenir)
- **Supabase URL:** `https://zvnjslmptwmnuhftgqsr.supabase.co`
- **İstemci başlatma:** `window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`

### AUTH Nesnesi (satır ~8211)

```javascript
const AUTH = {
  client: null,     // Supabase istemci örneği
  user: null,       // Giriş yapan kullanıcı nesnesi
  cloud: {},        // Supabase 'journals' tablosuna senkronize edilen veri
  ns: '',           // localStorage namespace öneki (kullanıcı başına)
  syncTimer: null   // debounced cloud senkronizasyon zamanlayıcısı
};
```

### Giriş Akışı

1. **Auth kapısı açılır:** `openAuth('login')` — nav-login butonlarıyla tetiklenir
2. **Mod seçimi:** `setMode(mode)` — `login | register | reset | newpass` modları
3. **Giriş gönderimi:**
   ```javascript
   AUTH.client.auth.signInWithPassword({ email, password: pass })
   ```
4. **Başarılı giriş:** Kullanıcı nesnesi ayarlanır, bulut verisi yüklenir, `AUTH.ns` namespace'ı atanır
5. **Kayıt:** `AUTH.client.auth.signUp({ email, password: pass, options: { data: { name } } })`
6. **Şifre sıfırlama:** `AUTH.client.auth.resetPasswordForEmail(email, { redirectTo })`
7. **Oturum kontrolü:** Sayfa yüklenirken `AUTH.client.auth.getSession()` çağrılır
8. **Çıkış:** `AUTH.client.auth.signOut()`

### Yetkilendirme Kontrolleri

`amAllowed()` fonksiyonu (satır ~12428) belirli sayfaları admin-only yapar:
- Admin-only sayfalar: `alfa`, `apps`, `basvuru`, `sosyalmetre`, `uyap`, `zaman`, `strateji`, `butce`, `portfoy`
- Kontrol: `AUTH.user.email === 'ahmetnuman20@gmail.com'`
- Yetkisiz erişim → `showPage('home')` ile ana sayfaya yönlendirme

### Cloud Senkronizasyonu

- **`scheduleCloudSync()`** (satır ~8222): 700ms debounced tetikleme
- **`pushCloud()`** (satır ~8227): `AUTH.cloud` nesnesini Supabase `journals` tablosuna yazar
- Senkronize edilen anahtarlar: `STORAGE_KEY`, `TRADES_KEY`, `LESSONS_KEY`, `DATA_KEY`, `NEWS_KEY`, `REVIEW_KEY`, `BUTCE_KEY`, `PORTFOY_KEY`, `STRAT_KEY` ve diğerleri

---

## 7. BARINDIRMA İPUÇLARI

| Dosya | İçerik |
|---|---|
| `vercel.json` | `{"alias": ["alfatraders.vercel.app"]}` — Vercel alias tanımı |
| `.vercel/project.json` | Vercel proje bağlamı (team ID, org ID) |
| `manifest.webmanifest` | PWA manifest: "Alfa Traders — Trading Yaşam Alanı" (standalone, portrait, dark theme, TR) |
| `sw.js` | Service Worker: `alfa-v30` cache, stale-while-revalidate stratejisi |
| `middleware.js` | Vercel Edge Runtime — bot tespiti + dinamik OG meta üretimi |

Bulunmayanlar: `CNAME`, `netlify.toml`, `.htaccess`, `_redirects`, `.github/` (GitHub Actions yok)

---

## 8. TASARIM

### Renk Paleti ve CSS Değişkenleri

Tüm stiller `:root` içinde tanımlı CSS değişkenleri kullanır:

| Değişken | Değer | Amaç |
|---|---|---|
| `--bg` | `#0c0d1b` | Ana koyu arka plan |
| `--bg-2` | `#121426` | İkincil arka plan |
| `--card` | `#161832` | Kart/panel arka planı |
| `--card-2` | `#1c1f3d` | İkincil kart |
| `--border` | `#262a4e` | Kenarlık rengi |
| `--text` | `#edefff` | Birincil metin (beyaz) |
| `--text-2` | `#b8bcd9` | İkincil metin |
| `--text-3` | `#7d82a6` | Üçüncül metin |
| `--acc` | `#7b78f5` | Vurgu rengi (mor) |
| `--acc-soft` | `#262952` | Yumuşak vurgu arka planı |
| `--green` | `#34d399` | Başarı/pozitif |
| `--amber` | `#fbbf24` | Uyarı |
| `--red` | `#f87171` | Hata/negatif |
| `--radius` | `14px` | Varsayılan köşe yuvarlaklığı |
| `--shadow` | `0 1px 3px rgba(0,0,0,.45), 0 12px 34px rgba(0,0,0,.38)` | Kart gölgesi |
| `--font-display` | `'Sora', 'Inter', sans-serif` | Başlık yazı tipi |
| `--pc` | `#a78bfa` | Sayfa bazlı vurgu rengi (her sayfa farklı) |

Her sayfa `body[data-page="..."]` seçicisi ile kendine özgü `--pc`, `--pc-soft`, `--glow-a`, `--glow-b` renkleri tanımlar (satır ~89-107).

### Yazı Tipleri

- **Başlıklar:** Sora (600-800 ağırlık)
- **Gövde:** Inter (400-700 ağırlık)
- Google Fonts CDN'den yüklenir

### Ortak Stil

- **Harici CSS dosyası YOK** — tüm stiller `index.html` içindeki `<style>` bloklarında (binlerce satır)
- Her sayfa kendi stillerini inline tanımlar
- Ortak bileşenler: `.wrap` (sarmalayıcı), `.btn` / `.btn.solid` (butonlar), `.hidden` (gizleme), `.page-anim` (sayfa geçiş animasyonu)

### Mobil Uyumluluk

- **79 `@media` sorgusu** dosya genelinde
- Kırılma noktaları: `640px`, `720px`, `820px`, `900px`, `940px`, `960px` (min-width) ve `400px`-`1100px` arası (max-width)
- **Navbar:** 680px altında hamburger menüye dönüşür
- **Mobil menü:** Sağdan kayan drawer (`translateX(105%)`)
- **`prefers-reduced-motion`** desteği: Animasyonları devre dışı bırakır

### Navigasyon Yapısı

**Masaüstü:** Sticky navbar (blur efektli), sol menü + sağ taraf (sosyal linkler, dil, giriş)

| Menü | Alt Menü |
|---|---|
| 🏠 Ana Menü | — |
| 💰 Alfa Defter | — |
| 🏠 Real Estate | — |
| ⚡ Trader ▾ | Check List, Trade Günlüğü, Alfa Calculator, Zaman, Strateji |
| 📢 İşlem Kanalı | — |
| 💼 Portföy Yönetimi | — |
| 🎓 Edu ▾ | Alfa Edu, Stratejiler, Analiz Köşesi, İndikatörler, Alfa Designer |
| 📰 AlfaNews ▾ | Ekonomik Takvim |
| 📎 Ek | — |

**Mobil:** Tüm sayfalar düz liste halinde gruplanmış olarak gösterilir

**Sayfa geçişi:** `showPage(name)` fonksiyonu — `?page=...` URL parametresi ile derin bağlantı desteği, tüm sayfalar `#page-{name}` div'leri olarak saklanır, `hidden` class'ı ile açılıp kapatılır.

---

## 9. KOD KALİTESİ NOTLARI

1. **Tek dosya mimarisi:** Tüm uygulama (~28.843 satır) tek `index.html` dosyasında. Bu, bakım ve işbirliğini zorlaştırıyor.

2. **`chk_5.js` devasa:** ~12.900 satırlık tek JS modülü. Tüm uygulama mantığı (işlem kayıtları, portföy, sosyal metrik, AI, e-ticaret,vs.) burada.

3. **Tekrar eden kod:** Benzer modal/form açma-kapama, tarih formatlama, para birimi gösterme fonksiyonları birden fazla yerde tekrar ediyor.

4. **Güvenlik endişeleri:**
   - `alfa-login-rem` anahtarında şifre düz metin saklanıyor
   - Supabase publishable anahtarı kod içine yazilmiş (bu aslında Supabase'de beklenen bir davranış, anonim anahtar JWT)
   - Google Sheets Apps Script URL'i kod içine yazilmiş

5. **Test altyapısı:** Birim testleri var (`ds-strat-test.js`, `sim-ap2.js`, `sim-sos2.js`) ama bir test framework'ü kullanılmıyor — kendi basit test çalıştırıcısı ile.

6. **i18n:** Tam TR/EN desteği (`chk_7.js`, ~565 satır çeviri). Attribute-bazlı (`data-i18n`).

7. **PWA desteği:** Service Worker + Web App Manifest mevcut.

8. **API modülleri temiz:** `api/` klasöründeki `.mjs` dosyaları iyi yapılandırılmış, her biri tek bir sorumluluk taşıyor.

---

## 10. GIT DURUMU

Proje **Git** ile takip ediliyor. `main` dalında çalışıyor.

### Son 5 Commit

```
5a9f9db fix: remove premature closing brace in zmLoad
7a7e2ab fix: tg.mjs syntax hatasi - fazladan } kaldirildi
93a5cd5 fix: telegram - trim() ile bosluk temizle, orijinal fetch'e don
9546b9f fix: telegram - https modulu ile gonder, fetch uyumsuzlugunu as
824cad3 debug: telegram chat id detayli hata
```

> Son 5 commit'in tamamı hata düzeltme ve debugging. Telegram entegrasyonu ve `zmLoad` fonksiyonundaki bir syntax hatası üzerine yoğunlaşılmış.

### Git Durumu

```
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
```

Çalışma ağaçında değişiklik yok.
