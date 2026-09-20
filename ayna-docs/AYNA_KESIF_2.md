# AYNA Keşif Raporu 2

Tarih: 20 Eylül 2026

---

## S1. Dosya yapısı

Repo kökündeki dosya ve klasör ağacı (node_modules ve .git hariç, iki seviye):

```
repo-konfirmasyon/
├── .gitignore
├── .vercel/
│   ├── project.json
│   └── README.txt
├── alfa-body.png
├── api/
│   ├── ai-checklist.mjs
│   ├── ai.mjs
│   ├── chat-admin.mjs
│   ├── contrib.mjs
│   ├── eco-cal.mjs
│   ├── edu-shared.mjs
│   ├── notion-callback.mjs
│   ├── notion-sync.mjs
│   ├── notion-trades.mjs
│   ├── notion-week.mjs
│   └── tg.mjs
├── ayna-docs/
│   └── AYNA_MASTER_PROMPT.md
├── bump.js
├── chk_0.js ... chk_7.js
├── ds-strat-test.js
├── ds-verify.js
├── favicon.png
├── import-check.js
├── index-local.html
├── index.html
├── KESIF_RAPORU.md
├── local-check.js
├── manifest.webmanifest
├── middleware.js
├── og.png
├── package.json
├── package-lock.json
├── poll-deploy.js
├── sim-ap2.js
├── sim-sos2.js
├── sw.js
├── vercel.json
└── workspace-btc-cvd.json
```

`index.html` toplam satır sayısı: **28.843**

`index.html` dışında `.js` veya `.css` dosyası: **Evet**. Kök levelda 18 `.js` dosyası (sw.js, bump.js, chk_0-7.js, ds-strat-test.js, ds-verify.js, import-check.js, local-check.js, middleware.js, poll-deploy.js, sim-ap2.js, sim-sos2.js). Bunlardan hiçbiri `index.html`'de `<script src="...">` ile yüklenmez. `sw.js` çalışma zamanında `fetch('/sw.js?__v=...')` ile okunur (servis.actualizasyonu için). `api/` altındaki 11 `.mjs` dosyası Vercel serverless fonksiyonlarıdır, istemci tarafından `/api/*` uçlarından çağrılır. `index.html`'de harici CSS dosyası yoktur; tek harici kaynak Google Fonts (satır 23) ve Supabase CDN (satır 24)'dür.

---

## S2. Supabase istemcisi

`createClient` çağrısı iki satırda yapılır:

**Satır 23971** (ilk oluşturma):
```js
AUTH.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

**Satır 24080** (yeniden oluşturma — "Beni hatırla" kapalıyken sessionStorage'a geçiş):
```js
AUTH.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: keep, autoRefreshToken: true, detectSessionInUrl: false } });
```

Atandığı değişken: `AUTH.client` (`AUTH` nesnesinin `client` özelliği).

`SUPABASE_URL` ve `SUPABASE_ANON_KEY` sabitleri satır 8208-8209'da tanımlıdır:
```js
const SUPABASE_URL = 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_***';
```

Tanımlandığı kapsam: `AUTH` nesnesi **en üst düzey betik** kapsamında `const` ile tanımlanmıştır (satır 8211). `createClient` çağrıları `bootAuth()` adlı üst düzey fonksiyon içinde yapılır (satır 23970), bu fonksiyon da üst düzey `<script>` bloğu içindedir.

`const`/`let`/`var`: `AUTH` nesnesi `const` ile, `SUPABASE_URL` ve `SUPABASE_ANON_KEY` `const` ile tanımlıdır.

---

## S3. Kimlik doğrulama

Kullanılan Supabase Auth yöntemleri:

| Satır | Yöntem | Kullanım |
|-------|--------|----------|
| 23971 | `window.supabase.createClient(...)` | İstemci oluşturma |
| 24080 | `window.supabase.createClient(..., {auth:...})` | İstemci yeniden oluşturma (storage seçimi) |
| 24031 | `AUTH.client.auth.signOut()` | Çıkış |
| 24035 | `AUTH.client.auth.onAuthStateChange(cb)` | `PASSWORD_RECOVERY` olayını dinleme |
| 24052 | `AUTH.client.auth.resetPasswordForEmail(email, {redirectTo})` | Şifre sıfırlama e-postası |
| 24057 | `AUTH.client.auth.updateUser({password})` | Şifre güncelleme |
| 24062 | `AUTH.client.auth.getUser()` | Kullanıcı bilgisi okuma (şifre sonrasınd) |
| 24067 | `AUTH.client.auth.signUp({email, password, options: {data: {name}}})` | Kayıt |
| 24082 | `AUTH.client.auth.signInWithPassword({email, password})` | Giriş |
| 24099 | `AUTH.client.auth.getSession()` | Oturum kontrolü (sayfa yüklemede) |

Kullanıcının kimliği `AUTH.user` değişkeninde tutulur (satır 8212: `user: null`). `onAuthed(user)` fonksiyonu (satır 23858) `AUTH.user = user` ataması yapar.

Supabase Auth dışında bir giriş sistemi **yoktur**. Tek mekanizma Supabase Auth'tur. E-posta tabanlı sertifika karşılaştırması, özel kullanıcı tablosu veya şifre hash'leme yoktur. "Beni hatırla" özelliği (satır 23978-23984) localStorage'a e-posta ve şifreyi düz metin olarak yazar — bu bir alternatif auth sistemi değil, istemci kolaylığıdır.

---

## S4. Yetki

`showPage` içindeki erişim kontrolü (satır 12762-12770):

```js
function showPage(name, skipAnim) {
  if (name === 'alfa' && !amAllowed()) name = 'home';
  if (name === 'apps' && !appsAllowed()) name = 'home';
  if (name === 'basvuru' && !amAllowed()) name = 'home';
  if (name === 'sosyalmetre' && !amAllowed()) name = 'home';
  if (name === 'uyap' && !amAllowed()) name = 'home';
  if (name === 'zaman' && !amAllowed()) name = 'home';
  if (name === 'strateji' && !amAllowed()) name = 'home';
  if (name === 'butce' && !amAllowed()) name = 'home';
  if (name === 'portfoy' && !amAllowed()) name = 'home';
```

`amAllowed()` fonksiyonu (satır 12428-12430):
```js
function amAllowed() {
  return !!(typeof AUTH !== 'undefined' && AUTH.user && (AUTH.user.email || '').toLowerCase() === ADMIN_EMAIL);
}
```

`ADMIN_EMAIL` sabiti (satır 11647):
```js
const ADMIN_EMAIL = 'ahmetnuman20@gmail.com';
```

Yönetici olup olmadığı: **Tek bir e-posta adresi karşılaştırması** ile belirlenir. Tablo, sütun veya rol alanı yoktur.

Nav linkleri gizlenir mi: **Evet**. Giriş yapıldıktan sonra (satır 23886-23940) yönetici sayfalarının masaüstü tab ve mobil nav öğeleri `style.display = 'none'` ile gizlenir. Örneğin:
```js
const isAdmin = (user.email || '').toLowerCase() === ADMIN_EMAIL;
const amTab = document.getElementById('tab-alfa');
const amMob = document.getElementById('mnav-alfa');
if (amTab) amTab.style.display = isAdmin ? '' : 'none';
if (amMob) amMob.style.display = isAdmin ? '' : 'none';
```

---

## S5. Tablolar

Koddaki tüm `.from('...')` ve `.rpc('...')` çağrıları:

| Tablo/Fonksiyon | İşlem | Kullanılan sütunlar | Sayfa/Fonksiyon | Satır |
|-----------------|-------|---------------------|-----------------|-------|
| `journals` | upsert | `user_id`, `data`, `updated_at` | `pushCloud()` — bulut senkronu | 8230 |
| `journals` | select | `data` (filter: `eq('user_id', ...)`) | `onAuthed()` — giriş callback | 23864 |
| `alfanews` | select | `data` (filter: `eq('id', 1)`) | `loadNews()` — dergi | 11662 |
| `alfanews` | upsert | `id`, `data`, `updated_at` | `saveNews()` — dergi kaydet | 11710 |
| `alfanews` | select | `data` (filter: `eq('id', 2)`) | `loadMentor()` — mentor | 24253 |
| `alfanews` | upsert | `id`, `data`, `updated_at` | `saveMentor()` — mentor kaydet | 24276 |
| `presence` | select (count) | `id` (count: exact, head: true) | `statsRefresh()` — ziyaretçi sayısı | 24145 |
| `presence` | upsert | `visitor_id`, `last_seen` (onConflict: visitor_id) | `statsHeartbeat()` — kalp atışı | 24159 |
| `presence` | delete | — (filter: `lt('last_seen', ...)`) | `statsHeartbeat()` — eski kayıtları temizle | 24162 |
| `site_stats` | select | `total_visits` (filter: `eq('id', 1)`) | `statsFetchTotal()` — toplam ziyaret | 24179 |
| `profiles` | select (count) | `id` (count: exact, head: true) | `statsFetchReg()` — kayıtlı kullanıcı | 24194 |
| `site_reviews` | update | `name`, `rating`, `text` | `rvBindForm()` — inceleme güncelle | 24674 |
| `site_reviews` | insert | `user_id`, `name`, `rating`, `text` | `rvBindForm()` — inceleme ekle | 24679 |
| `site_reviews` | select | `id` (filter: `eq('user_id', ...)`) | `rvBindForm()` — mevcut inceleme kontrol | 24683 |
| `site_reviews` | delete | — (filter: `eq('user_id', ...)`) | `rvBindForm()` — inceleme sil | 24707 |
| `site_reviews` | select | `*` (order: created_at desc, limit: 300) | `rvLoadAll()` — tüm incelemeler | 24715 |
| `site_reviews` | select | `*` (filter: `eq('user_id', ...)`) | `rvLoadAll()` — kullanıcının incelemesi | 24726 |
| `success_photos` | select | `*` (order: sort asc, limit: 60) | `loadSfx()` — başarı fotoğrafları | 25072 |
| `success_photos` | insert | `url`, `caption`, `sort` | `sfxAddRow()` — fotoğraf ekle | 25291 |
| `success_photos` | update | `sort` (filter: `eq('id', id)`) | `sfxAddRow()` — sıralama | 25296 |
| `success_photos` | delete | — (filter: `eq('id', id)`) | `delSfxPhoto()` — fotoğraf sil | 25350 |
| Storage: `success` | upload | bucket: success, path: sfx/...jpg | `uploadSfxImage()` | 25313 |
| Storage: `success` | getPublicUrl | bucket: success | `uploadSfxImage()` | 25315 |
| RPC: `increment_total` | rpc | — | `statsCountTotal()` | 24208 |

Toplam benzersiz tablo: **7** (`journals`, `alfanews`, `presence`, `site_stats`, `profiles`, `site_reviews`, `success_photos`)

Toplam benzersiz Storage bucket: **1** (`success`)

Toplam RPC fonksiyonu: **1** (`increment_total`)

Repoda `.sql` dosyası veya `supabase/` klasörü **yoktur**.

---

## S6. Bütçe (Alfa Defter, ?page=butce)

Veriler **Supabase `journals` tablosunda** saklanır. Tek satırlık bir JSON blob yapısındadır. Bütçe verisi `journals.data` JSON nesnesinin `defter-butce-v1` anahtarının altındadır.

Depolama anahtarı (satır 15579):
```js
const BUTCE_KEY = 'defter-butce-v1';
```

Yapı (satır 15604):
```js
let butceData = { entries: [], cats: [], budget: { monthly: 0 } };
```

Kayıt yapısı (satır 15848):
```js
{
  id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  type: 'gelir' | 'gider',
  cat: 'kategori_id',
  date: 'YYYY-MM-DD',
  amount: 1234.56,
  note: 'açıklama',
  created: Date.now()
}
```

Kategori yapısı (satır 15868):
```js
{
  id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  name: 'Kira',
  icon: '🏠',
  color: '#6366f1',
  type: 'gelir' | 'gider'
}
```

Maskeli örnek:
```json
{
  "entries": [
    { "id": "babc123xyz", "type": "gider", "cat": "gida", "date": "2026-09-15", "amount": 450.50, "note": "Market", "created": 1694774400000 },
    { "id": "bdef456uvw", "type": "gelir", "cat": "maas", "date": "2026-09-01", "amount": 15000, "note": "", "created": 1693564800000 }
  ],
  "cats": [
    { "id": "cx1abc", "name": "Kira", "icon": "🏠", "color": "#6366f1", "type": "gider" }
  ],
  "budget": { "monthly": 8000 }
}
```

Kayıtlar kullanıcıya göre ayrılıyor mu: **Evet**. `journals` tablosunda `user_id` sütunu ile. Tüm veriler `journals.data` JSON'unda tutulur; `user_id` satır düzeyinde ayrım sağlar.

---

## S7. Trade verisi

Trade verisi için kullanılan sayfalar ve kaynaklar:

| Sayfa | Depolama anahtarı | Supabase tablosu |
|-------|-------------------|------------------|
| `?page=data` (Trade Günlüğü) | `defter-data-v1` | `journals` (data blob içinde) |
| `?page=review` (Haftalık Değerlendirme) | `defter-reviews-v1` | `journals` (data blob içinde) |
| `?page=karne` (Günün İşlem Karnesi) | `alfa-karne-v1` | `journals` (data blob içinde) |
| `?page=portfoy` (Alfa Portföy) | `defter-portfoy-v1` | `journals` (data blob içinde) |
| `?page=defter` (Konfirmasyon Defteri) | `konfirmasyon-defteri-v3` | `journals` (data blob içinde) |

Trade kayıt yapısı — `defter-data-v1` (satır 13161-13178):
```js
{
  id: Date.now() + Math.random(),
  ts: Date.parse(dateVal) || Date.now(),
  date: 'YYYY-MM-DD',
  pair: 'BTCUSDT',
  dir: 'LONG' | 'SHORT',
  r: 2.5,                    // R-multiple
  strat: '1-2-3 Reversal',
  model: 'HTF Region',
  criteria: { setup: 4, entry: 5, exit: 5, risk: 5, psycho: 5 },
  kKalite: 'Kurallı' | 'Zorlama' | 'Kaçan-Korku' | 'Doğru-Pas',
  kKaliteLog: [],
  note: '...',
  images: [],
  notionId: '...',
  imgSynced: []
}
```

Maskeli örnek:
```json
{
  "id": 1726401234567.89,
  "ts": 1726401234567,
  "date": "2026-09-15",
  "pair": "BTCUSDT",
  "dir": "LONG",
  "r": 2.5,
  "strat": "1-2-3 Reversal",
  "model": "HTF Region",
  "criteria": { "setup": 8, "entry": 7, "exit": 6, "risk": 9, "psycho": 7 },
  "kKalite": "Kurallı",
  "note": "Temiz giriş"
}
```

Sahip sütunu: `user_id` (journals tablosu düzeyinde).

`notion`, `api.notion.com` veya `NOTION` koddan geçiyor mu: **Evet**, çok sayıda yerde. Başlıca kullanım alanları:
- Satır 5874-5875: Trade Günlüğü sayfasında "Notion'dan Çek" ve "Notion'a Bağlan" düğmeleri
- Satır 12973-12989: `syncDataTradeNotion()` fonksiyonu — `/api/notion-sync` çağrısı
- Satır 13286-13370: `getNotionDbIds()`, `importFromNotion()` — `/api/notion-trades` çağrısı
- Satır 13376-13399: `getNotionToken()`, `setNotionToken()`, `handleNotionHash()` — OAuth token yönetimi
- Satır 14004-14070: Review sayfasında `syncWeekToNotion()`, `pullWeeksFromNotion()` — `/api/notion-week` çağrısı
- `api/notion-callback.mjs`: OAuth callback
- `api/notion-sync.mjs`: Tek işlem Notion'a senkron
- `api/notion-trades.mjs`: Notion'dan trade çekme
- `api/notion-week.mjs`: Haftalık veri push/pull

---

## S8. `/api` klasörü

Toplam dosya sayısı: **11** (tümü `.mjs` modülü). Toplam fonksiyon dosyası: **11**. `_` ile başlayan dosya veya klasör: **Yok**.

| # | Dosya | İlk satırlar | `process.env` değişkenleri |
|---|-------|-------------|---------------------------|
| 1 | `ai-checklist.mjs` | Groq model tanımı, AI checklist şeması | `GEMINI_API_KEY`, `GROQ_API_KEY` |
| 2 | `ai.mjs` | AI asistan sistemi, Groq model tanımı | `GEMINI_API_KEY`, `GROQ_API_KEY` |
| 3 | `chat-admin.mjs` | `@vercel/blob` import, GET/POST/DELETE | `BLOB_READ_WRITE_TOKEN` |
| 4 | `contrib.mjs` | Supabase URL/key, topluluk katkıları | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE`, `SUPABASE_SERVICE_ROLE` |
| 5 | `eco-cal.mjs` | FairEconomy JSON feed | — |
| 6 | `edu-shared.mjs` | Supabase URL/key, eğitim içeriği | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE`, `SUPABASE_SERVICE_ROLE` |
| 7 | `notion-callback.mjs` | Notion OAuth redirect | `NOTION_OAUTH_CLIENT_ID`, `NOTION_OAUTH_CLIENT_SECRET` |
| 8 | `notion-sync.mjs` | Notion API version, DB ID'leri | `NOTION_TOKEN` |
| 9 | `notion-trades.mjs` | Notion API version, DB sorgulama | `NOTION_TOKEN` |
| 10 | `notion-week.mjs` | Notion API helper, haftalık veri | `NOTION_TOKEN`, `NOTION_WEEK_DB` |
| 11 | `tg.mjs` | Telegram kanal parserı | `TG_CHANNEL`, `TG_MAX_POSTS`, `TG_BOT_TOKEN`, `TG_CHAT_ID`, `TG_THREAD` |

Benzersiz `process.env` toplamı: **15**.

---

## S9. Yapılandırma dosyaları

**`package.json`** — mevcut:
```json
{
  "private": true,
  "dependencies": {
    "@vercel/blob": "^2.6.0"
  }
}
```

**`vercel.json`** — mevcut:
```json
{
  "alias": ["alfatraders.vercel.app"]
}
```

**`.vercelignore`** — **mevcut değil**.

**`.gitignore`** — mevcut:
```
.vercel
node_modules/
```

**`.env*` dosyaları** — **hiçbiri yok**.

---

## S10. `showPage`

Başlangıç satırı: **12762**, bitiş satırı: **12819**. Toplam 57 satır.

Tam kod:
```js
function showPage(name, skipAnim) {
  if (name === 'alfa' && !amAllowed()) name = 'home';
  if (name === 'apps' && !appsAllowed()) name = 'home';
  if (name === 'basvuru' && !amAllowed()) name = 'home';
  if (name === 'sosyalmetre' && !amAllowed()) name = 'home';
  if (name === 'uyap' && !amAllowed()) name = 'home';
  if (name === 'zaman' && !amAllowed()) name = 'home';
  if (name === 'strateji' && !amAllowed()) name = 'home';
  if (name === 'butce' && !amAllowed()) name = 'home';
  if (name === 'portfoy' && !amAllowed()) name = 'home';
  currentPage = name;
  dtRowFocus = null;
  document.body.dataset.page = name;
  if (name === 'ek') renderEk();
  if (name === 'zaman') zmRender();
  if (name === 'strateji') st2Render();
  const pages = ['home', 'butce', 'sosyalmetre', 'uyap', 'zaman', 'strateji', 'trading', 'alfatrading', 'portfoy', 'defter', 'data', 'review', 'karne', 'news', 'ek', 'egitim', 'strategies', 'analiz', 'mentoring', 'pano', 'indicators', 'designer', 'onchain', 'calendar', 'basvuru', 'chat-admin', 'calc', 'alfa', 'apps'];
  pages.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.toggle('hidden', name !== p);
    const tb = document.getElementById('tab-' + p);
    if (tb) tb.classList.toggle('on', name === p);
  });
  document.querySelectorAll('[data-mnav]').forEach(el => el.classList.toggle('on', el.getAttribute('data-mnav') === name));
  document.querySelectorAll('.nav-drop').forEach(d => {
    const isActive = !!d.querySelector('.nav-link.on');
    d.classList.toggle('on', isActive);
    if (!isActive) d.classList.remove('open');
  });
  const shown = document.getElementById('page-' + name);
  if (shown && !skipAnim) { shown.classList.remove('page-anim'); void shown.offsetWidth; shown.classList.add('page-anim'); }
  try { localStorage.setItem('df-last-page', name); } catch (e) {}
  document.getElementById('home-ticker').style.display = name === 'home' ? '' : 'none';
  const tvBar = document.querySelector('.tv-bar');
  if (tvBar) tvBar.style.display = name === 'home' ? '' : 'none';
  if (name === 'data') renderData();
  if (name === 'review') renderReview();
  if (name === 'karne') { if (window.renderKarne) renderKarne(); }
  if (name === 'news') renderNews();
  if (name === 'egitim') renderEgitim();
  if (name === 'strategies') renderStrategies();
  if (name === 'analiz') renderAnaliz();
  if (name === 'sosyalmetre') renderSosyal();
  if (name === 'uyap') renderUyap();
  if (name === 'butce') { renderButce(); ap2RenderPublicTeaser(); if (bdTab === 'portfoy') renderPortfoy(); }
  if (name === 'mentoring') { try { renderMentor(); } catch (e) { /* devam */ } }
  if (name === 'pano') { panoLoad(); }
  if (name === 'indicators') renderIndicators();
  if (name === 'designer') renderDesigner();
  if (name === 'alfatrading') renderAlfaTrading();
  if (name === 'portfoy') { renderAlfaPortfoy2(); ap2LoadPrices(); }
  if (name === 'calendar') { if (window.loadCal) loadCal(); }
  if (name === 'basvuru') { renderSfx(); }
  if (name === 'chat-admin') { renderAdminChat(); startAdminChatPoll(); }
  if (name === 'alfa') { renderAlfaMan(); }
  if (name === 'apps') { renderApps(); }
}
```

---

## S11. Sayfa kabı

`#page-butce` kabının açılış etiketi (satır 6390):
```html
  <div id="page-butce" class="hidden bd-hidden">
```

İlk iç eleman (satır 6391-6396):
```html
    <div class="strat-head">
      <div>
        <div class="strat-title">💰 Alfa Defter <button type="button" class="bd-eye-inline" id="bd-eye" title="Miktarları gizle/göster">👁️</button></div>
        <div class="strat-sub">Aylık gelir / gider takibi...</div>
      </div>
    </div>
```

Tüm `#page-*` kapları **`<div class="wrap">`** (satır 4963) ebeveyninin içinde durur.

Sonuncu `#page-ek` kapanış etiketi: satır **8072** (`<div id="page-ek">`) → kapanış satır **8080** (`</div>`). Wrap kapanışı satır **8080**'den hemen sonra.

---

## S12. Nav

Masaüstünde "Alfa Defter" linkinin tam HTML'i (satır 4973):
```html
<a href="?page=butce" class="nav-link" id="tab-butce" data-nav data-i18n="app.butce">💰 Alfa Defter</a>
```

"Trader" açılır menüsünün tam HTML'i (satır 4975-4984):
```html
<div class="nav-drop">
  <a class="nav-link drop-btn" data-i18n="app.trader">⚡ Trader ▾</a>
  <div class="drop-menu">
    <a href="?page=defter" class="nav-link" id="tab-defter" data-nav data-i18n="app.check">✅ Check List</a>
    <a href="?page=data" class="nav-link" id="tab-data" data-nav data-i18n="app.journal">📈 Trade Günlüğü</a>
    <a href="?page=calc" class="nav-link" id="tab-calc" data-nav data-i18n="app.calc">🧮 Alfa Calculator</a>
    <a href="?page=zaman" class="nav-link" id="tab-zaman" data-nav>⏱️ Zaman</a>
    <a href="?page=strateji" class="nav-link" id="tab-strateji" data-nav>🧭 Strateji</a>
  </div>
</div>
```

Mobilde "Alfa Defter" linkinin tam HTML'i (satır 5034):
```html
<a href="?page=butce" class="mnav-link" data-nav data-mnav="butce" id="mnav-butce" data-i18n="app.butce">💰 Alfa Defter</a>
```

Mobil "Trader" grubunun ilk iki öğesi (satır 5036-5038):
```html
<div class="mnav-group" data-i18n="app.trader">⚡ Trader</div>
<a href="?page=defter" class="mnav-link" data-nav data-mnav="defter" data-i18n="app.check">✅ Check List</a>
<a href="?page=data" class="mnav-link" data-nav data-mnav="data" data-i18n="app.journal">📈 Trade Günlüğü</a>
```

`data-mnav` kullanımı örneği (satır 5033):
```html
<a href="?page=home" class="mnav-link" data-nav data-mnav="home" data-i18n="app.home">🏠 Ana Menü</a>
```

`#tab-*` kullanımı örneği (satır 4972):
```html
<a href="?page=home" class="nav-link on" id="tab-home" data-nav data-i18n="app.home">🏠 Ana Menü</a>
```

---

## S13. Dil desteği

"EN" düğmesinin çalışma şekli: İki düğme vardır (satır 4486 landing, satır 5015 app navbar). Her ikisi de `setLang()` çağırır; `window.LANG` `'tr'` ve `'en'` arasında geçiş yapar. Düğme metni her zaman karşı dilin adını gösterir (`tr` iken "EN", `en` iken "TR").

Çeviri sözlüğü: **`I18N`** nesnesi (satır 26022). Her anahtar `{ tr: '...', en: '...' }` biçiminde.

Çeviri fonksiyonu: **`window.t(k)`** (satır 26622-26625):
```js
window.t = function (k) {
  var e = I18N[k];
  return e ? (e[window.LANG] !== undefined ? e[window.LANG] : e.tr) : k;
};
```

Çeviri anahtarı tanımlanması örneği (satır 26023):
```js
'nav.login': { tr: 'Giris yap', en: 'Log in' },
```

HTML'de kullanımı (satır 4487):
```html
<button class="nav-login" id="nav-login" type="button" data-i18n="nav.login">Giris yap</button>
```

JS'de kullanımı (satır 24600):
```js
el.textContent = n ? avgTxt + ' ' + window.t('rv.per5') : '— ' + window.t('rv.per5');
```

Etkin dilin okunma yöntemi (satır 26618-26621):
```js
var saved = 'tr';
try { saved = localStorage.getItem('alfa-lang') || 'tr'; } catch (e) {}
if (saved !== 'tr' && saved !== 'en') saved = 'tr';
window.LANG = saved;
```

`data-i18n*` öznitelikleri: `data-i18n` (textContent), `data-i18n-html` (innerHTML), `data-i18n-ph` (placeholder), `data-i18n-aria` (aria-label), `data-i18n-title` (title).

---

## S14. Tema

Açık/koyu tema değişimi (satır 4432-4459): `<html>` etiketine `data-theme` özniteliği atanır. Varsayılan `'dark'`. localStorage anahtarı: `'alfa-theme'`. Toggle `document.documentElement.getAttribute('data-theme')` okuyup `'light'`↔`'dark'` arasında geçirir.

Açık tema değişkenleri (satır 3547-3564, `html[data-theme="light"]` içinde):
```css
html[data-theme="light"] {
  color-scheme: light;
  --bg: #f4f5fa; --bg-2: #eceef7; --card: #ffffff; --card-2: #ffffff;
  --border: #e6e8f0; --text: #1a1d29; --text-2: #5b6172; --text-3: #9aa0b4;
  --acc: #5b5bd6; --acc-2: #7c5cf0; --acc-soft: #eeeefb;
  --green: #16a34a; --green-soft: #e8f7ee; --amber: #d97706; --amber-soft: #fdf3e3;
  --red: #dc2626; --red-soft: #fdeaea;
  --shadow: 0 1px 3px rgba(23,25,35,0.05), 0 4px 16px rgba(23,25,35,0.05);
  --input-bg: #f8f9fc; --seg-bg: #f2f3f8; --panel-alt: #fbfbfd; --muted-2: #cdd2e0;
  --bar-bg: #eceef5; --red-hover: #fbdcdc; --green-hover: #d9f2e2;
  --amber-hover: #fef3c7; --blue-hover: #dbeafe; --blue-txt: #1d4ed8;
  --hover-a: #e2e2fb; --hover-b: #e6e6fb;
  --nav-bg: rgba(244,245,250,.9);
  --menu-shadow: 0 20px 46px rgba(23,25,35,0.26), 0 2px 8px rgba(23,25,35,0.10);
  --ph: #9aa0b4; --scroll: #c9cdde; --scroll-h: #aeb3c9;
  --btn-tone: #1a1d29; --body-grad: #eef0f9; --glow-red: rgba(190,18,60,.05);
  --sel-bg: rgba(123,120,245,.18); --sel-txt: #1a1d29;
}
```

`--input-bg`, `--seg-bg` ve `--panel-alt` atamaları:
- Koyu temada: `:root` içinde self-referencing (satır 46-48, etkisiz).
- Açık temada: `html[data-theme="light"]` içinde somut değerler (satır 3555).

---

## S15. Bileşenler

| Bileşen | Sınıf adı | HTML örneği |
|---------|-----------|-------------|
| Panel/kart | `.panel` | `<div class="panel">` (satır 5520) |
| KPI kutusu | `.kpi` (iç: `.k-lbl`, `.k-val`, `.k-sub`) | `<div class="data-kpis" id="data-kpis"></div>` (satır 5833, JS ile doldurulur) |
| Buton (normal) | `button.btn` | `<button class="btn" id="pair-cancel">Vazgeç</button>` (satır 5516) |
| Buton (birincil) | `button.btn.solid` | `<button class="btn solid" id="pair-confirm">Ekle</button>` (satır 5515) |
| Buton (tehlike) | `button.btn.danger` | `<button class="btn danger" id="btn-defaults">Kriterleri Sıfırla</button>` (satır 5809) |
| Input | (bağlam selectoru) | `<input type="text" id="at-f-coin" class="at-inp" placeholder="Coin / Sembol">` (satır 6938) |
| Select | (bağlam selectoru) | `<select id="ai-style">...</select>` (satır 5475) |
| Textarea | (bağlam selectoru) | `<textarea id="d-sabah" placeholder="..."></textarea>` (satır 5537) |
| Segmented | `.seg` (etkin: `.seg button.on-gold`) | `<div class="seg"><button id="btn-long">LONG</button>...</div>` (satır 5507) |
| Chip/etiket | `.chip` (etkin: `.chip.on`) | `<div class="chiprow" id="ai-concepts"></div>` (satır 5485, JS ile doldurulur) |
| Modal/diyalog | `.at-modal` / `#share-modal` | `<div id="at-modal" class="at-modal">...</div>` (satır 6929) |
| Toast/bildirim | `magToast(msg)` / `stratToast(msg)` / `atToast(msg)` | `magToast('Kaydedildi')` — fonksiyon adı: `magToast`, imza: `function magToast(msg)` (satır 11954). `stratToast`: satır 14409. `atToast`: satır 23574. |

---

## S16. Önek çakışması

`ay-` veya `ayn-` ile başlayan bir sınıf veya kimlik: **YOK** (dosyada tarama sonucu false positive — `day-chips`, `am-day-lbl` gibi substring eşleşmeleri var ama `ay-` önekli gerçek bir tanımlama yok).

`ayna` kelimesi herhangi bir dosyada geçiyor mu: **index.html'de yalnızca yorumlarda** (Türkçe "ayna" = "mirror" anlamında; CSS sınıfı veya fonksiyon adı olarak kullanılmamış). `ayna-docs/` klasöründe ise master prompt dosyasında geçer.

---

## S17. Sayfa renkleri

Tüm `body[data-page="..."]` blokları:

```css
body[data-page="defter"] { --pc: #34d399; --pc-soft: rgba(52,211,153,.16); --glow-a: rgba(52,211,153,.18); --glow-b: rgba(16,185,129,.10); }
body[data-page="data"] { --pc: #38bdf8; --pc-soft: rgba(56,189,248,.16); --glow-a: rgba(56,189,248,.18); --glow-b: rgba(59,130,246,.10); }
body[data-page="review"] { --pc: #fbbf24; --pc-soft: rgba(251,191,36,.16); --glow-a: rgba(251,191,36,.18); --glow-b: rgba(245,158,11,.10); }
body[data-page="news"] { --pc: #fb7185; --pc-soft: rgba(251,113,133,.16); --glow-a: rgba(251,113,133,.20); --glow-b: rgba(225,29,72,.10); }
body[data-page="egitim"] { --pc: #f472b6; --pc-soft: rgba(244,114,182,.16); --glow-a: rgba(244,114,182,.20); --glow-b: rgba(236,72,153,.10); }
body[data-page="pano"] { --pc: #a78bfa; --pc-soft: rgba(167,139,250,.16); --glow-a: rgba(167,139,250,.20); --glow-b: rgba(139,92,246,.10); }
body[data-page="indicators"] { --pc: #2dd4bf; --pc-soft: rgba(45,212,191,.16); --glow-a: rgba(45,212,191,.18); --glow-b: rgba(20,184,166,.10); }
body[data-page="onchain"] { --pc: #fb923c; --pc-soft: rgba(251,146,60,.16); --glow-a: rgba(251,146,60,.18); --glow-b: rgba(234,88,12,.10); }
body[data-page="calendar"] { --pc: #60a5fa; --pc-soft: rgba(96,165,250,.16); --glow-a: rgba(96,165,250,.18); --glow-b: rgba(59,130,246,.10); }
body[data-page="chat-admin"] { --pc: #4ade80; --pc-soft: rgba(74,222,128,.16); --glow-a: rgba(74,222,128,.18); --glow-b: rgba(34,197,94,.10); }
body[data-page="calc"] { --pc: #8b7bfa; --pc-soft: rgba(139,123,250,.16); --glow-a: rgba(139,123,250,.20); --glow-b: rgba(109,92,240,.10); }
body[data-page="basvuru"] { --pc: #fbbf24; --pc-soft: rgba(251,191,36,.16); --glow-a: rgba(251,191,36,.18); --glow-b: rgba(245,158,11,.10); }
body[data-page="trading"] { --pc: #22d3ee; --pc-soft: rgba(34,211,238,.16); --glow-a: rgba(34,211,238,.18); --glow-b: rgba(6,182,212,.10); }
body[data-page="sosyalmetre"] { --pc: #c084fc; --pc-soft: rgba(192,132,252,.16); --glow-a: rgba(192,132,252,.18); --glow-b: rgba(168,85,247,.10); }
body[data-page="alfa"] { --pc: #ef4444; --pc-soft: rgba(239,68,68,.16); --glow-a: rgba(239,68,68,.20); --glow-b: rgba(220,38,38,.10); }
body[data-page="designer"] { --pc: #a3e635; --pc-soft: rgba(163,230,53,.16); --glow-a: rgba(163,230,53,.18); --glow-b: rgba(132,204,22,.10); }
body[data-page="alfatrading"] { --pc: #2aabee; --pc-soft: rgba(42,171,238,.16); --glow-a: rgba(42,171,238,.18); --glow-b: rgba(14,165,233,.10); }
body[data-page="karne"] { --pc: #a3e635; --pc-soft: rgba(163,230,53,.16); --glow-a: rgba(163,230,53,.20); --glow-b: rgba(132,204,22,.10); }
body[data-page="uyap"] { --pc: #f59e0b; --pc-soft: rgba(245,158,11,.16); --glow-a: rgba(245,158,11,.18); --glow-b: rgba(217,119,6,.10); }
```

---

## S18. Mevcut sohbet penceresi

Kimlik ve sınıf adları:

| Öğe | ID | Sınıf | z-index |
|-----|----|-------|---------|
| Süzme butonu | `chat-btn` | `.chat-bubble` | 1000 |
| Sohbet penceresi | `chat-popup` | `.chat-popup` | 1000 |
| Başlık | — | `.chat-head`, `.ico`, `.close` | (pencereden miras) |
| Mesaj alanı | `chat-body` | `.chat-body` | (pencereden miras) |
| Giriş satırı | `chat-foot` | `.chat-foot` | (pencereden miras) |
| Giriş alanı | `chat-input` | — | (pencereden miras) |
| Temizleme butonu | `chat-clear-btn` | `.chat-clear` | (pencereden miras) |

CSS tanımları (satır 3479-3497):
```css
.chat-bubble { position: fixed; bottom: 24px; right: 24px; z-index: 1000; width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, var(--pc), #7c3aed); ... }
.chat-popup { position: fixed; bottom: 88px; right: 24px; z-index: 1000; width: 340px; ... }
```

---

## S19. Service worker

`navigator.serviceWorker.register` satırı: `index.html'**de YOK**. Yalnızca `import-check.js` dosyasında (satır 7873):
```
navigator.serviceWorker.register('/sw.js').catch(() => {});
```

Build kimliğinin (`b88`) tanımlandığı yer: `index.html` satır **25195**:
```js
const APP_BUILD = 'b88';
```

`sw.js` önbellek adı: `alfa-v30`.

---

## S20. Betik sırası

`</body>` öncesindeki tüm `<script>` etiketleri ve satır numaraları:

| # | Satır | Açıklama |
|---|-------|----------|
| 1 | 24 | Harici: `@supabase/supabase-js@2` CDN (head içinde) |
| 2 | 4429-4431 | Inline: Portföy/pozisyon verisi tohumlama (`alfa-fund-v1`) |
| 3 | 4432-5212 | Inline: Ana sayfa rendering, nav, sayfa yönlendirme |
| 4 | 5349-5431 | Inline: TradingView chart ekleme ve watchlist |
| 5 | 5436-5443 | Inline: TV notları localStorage kalıcılık |
| 6 | 7355-7436 | Inline: ForexFactory takvim widget'ı |
| 7 | **8082-26019** | **Ana uygulama betiği** (~17.937 satır) |
| 8 | 26020-26650 | Inline: I18N / lokalizasyon (`I18N` sözlüğü + `setLang()`) |
| 9 | 26651-28841 | Inline: Günün İşlem Karnesi |

Ana uygulama betiğinin başladığı satır: **8082**, bittiği satır: **26019**.

---

## S21. Git

Mevcut branch: **main**

Son 5 commit:
```
5a9f9db fix: remove premature closing brace in zmLoad
7a7e2ab fix: tg.mjs syntax hatasi - fazladan } kaldirildi
93a5cd5 fix: telegram - trim() ile bosluk temizle, orijinal fetch'e don
9546b9f fix: telegram - https modulu ile gonder, fetch uyumsuzlugunu as
824cad3 debug: telegram chat id detayli hata
```

`git status` özeti:
```
?? KESIF_RAPORU.md
?? ayna-docs/
```

`KESIF_RAPORU.md` git tarafından takip edilmiyor (untracked).

---

## S22. Ortam

`node -v`: **v24.18.0**

İşletim sistemi: **Microsoft Windows NT 10.0.26200.0** (Windows 11)

---

FAZ 0 TAMAMLANDI
