# ALFA CHARTS Mobil UX Upgrade — Uygulama Raporu

**Temel:** `docs/alfa-mobile-ux-audit.md`  
**Branch:** `feat/mobile-ux-upgrade`  
**Kapsam:** Mevcut grafik motoru ve `WORKING` akışlar korunarak kademeli UX iyileştirmesi. Production deploy yapılmadı; gerçek kullanıcı verisi değiştirilmedi; yeni paket/framework eklenmedi.  
**Test yöntemi:** Gerçek Chrome + Playwright ile yerel statik sunucu (`http://127.0.0.1:8787`) üzerinde mobil emülasyon (390×844, `isMobile`, `hasTouch`) ve masaüstü görünüm (1440×950). Statik kontroller tek başına yeterli sayılmadı.

> Varlıkların önbellek geçerliliği yalnızca `?v=` parametreleriyle değiştirildi. `sw.js` bu çalışma boyunca değiştirilmedi.

---

## FAZ 1 — Landscape Fullscreen (P0)

### Önceki UX problemi

Denetimde iPhone 13 yatay görünümde (844×390) mobil kabuk kayboluyor, masaüstü araç çubuğu geri geliyordu:

| Ölçüm (844×390) | Önce |
|---|---:|
| Sayfa yüksekliği | 1232 px (dikey kaydırma) |
| Grafik yüksekliği | 173 px |
| Araç çubuğu | `display: flex`, 54 px |
| Alt bant | 38 px |
| „Siteye dön“ bağlantısı | `display: none` |

Kaynak: `docs/upgrade-screenshots/phase1-00-landscape-before.png` ve `alfa-mobile-ux-baseline.json` (geçici test çıktısı).

### Yapılan değişiklik

- `assets/alfa-charts.css`: Mevcut 10 mobil medya bloğu, telefonları yatayda da kapsayan ortak sorguya genişletildi:
  `@media(max-width:600px),(max-width:932px) and (max-height:500px) and (orientation:landscape)`.
- Yatay için ek kompakt kabuk eklendi: sayfa ve `body` 100dvh ile sabitlendi, masaüstü toolbar/market-controls gizlendi, grafik `grid` içinde `minmax(0,1fr)` ile viewport'u doldurdu, alt bant 28 px'e indirildi, safe-area (`env(safe-area-inset-*)`) kenar boşlukları korundu, menü/timeframe/tool sheet'leri yatay ekrana sığdırıldı.
- `assets/alfa-charts.mjs`: Mobil algılama aynı sorguyla genişletildi (`MOBILE_SHELL_QUERY`); `mobile-shell` / `mobile-landscape` body sınıfları orientation değişiminde senkronize ediliyor. `ResizeObserver`, yön değişiminde görünür zaman aralığını (`getVisibleRange`) kaydedip `setVisibleRange` ile geri uyguluyor; çizimlerin zaman/fiyat koordinatları dokunulmadan yeniden çiziliyor.
- `alfa-charts.html`: Varlık sürümleri `alfa-charts.css?v=34`, `alfa-charts.mjs?v=77` olarak güncellendi.
- `tests/browser/alfa-mobile-landscape.browser.mjs`: 390×844 → 844×390 → 390×844 geçişi, gerçek Fibonacci çizimi, aktif araç, çizim koordinatları, görünür aralık ve araç menüsü erişimi için regresyon testi eklendi.

### Kullanıcıya etkisi

- Telefonunu çevirdiğinde masaüstü düzeni geri gelmiyor; grafik neredeyse tüm yatay ekranı kullanıyor ve sayfa kaydırılmıyor.
- „Siteye dön“ ve kompalt alt bant yatayda erişilebilir kalıyor; çentik/safe-area alanları kapanmıyor.
- Çizim, seçili araç ve görüntülenen mum aralığı rotasyon boyunca korunuyor; yatayda çizim araçları kompakt menüden açılabiliyor.
- Masaüstü çalışma alanı etkilenmedi: 1440×950 smoke testinde toolbar `flex` (54 px), grafik 1140×733, watchlist 248×872, `pageErrors: []`.

### Test sonucu

Komut:

```powershell
node tests/browser/alfa-mobile-landscape.browser.mjs --url=http://127.0.0.1:8787 --playwright=C:\Users\Pc\AppData\Local\Temp\opencode\alfa-chart-browser-tests\node_modules\playwright\index.mjs --shots=docs/upgrade-screenshots
```

**Sonuç: PASS**, `pageErrors: []`.

| Ölçüm | Önce (844×390) | Sonra (844×390) |
|---|---:|---:|
| Sayfa yüksekliği | 1232 px | **390 px** |
| Grafik yüksekliği | 173 px | **352 px** |
| Araç çubuğu | flex / 54 px | **none** |
| Alt bant yüksekliği | 38 px | **28 px** |
| „Siteye dön“ | none | **flex** (22×30) |
| Menü düğmesi | — | **flex** (44×30) |

Doğrulanan ek koşullar: `mobile-shell: true`, `mobile-landscape: true`, çizim sayısı `1` ve koordinatları rotasyon öncesi/sonrası birebir aynı, aktif araç `fibonacci`, görünür aralık başlangıcı `870` (rotasyonda korundu), yatayda Araçlar sayfası açılabiliyor, dikey dönüşte grafik 768 px'e geri dönüyor.

**Ekran görüntüleri**

- Önce: [`docs/upgrade-screenshots/phase1-00-landscape-before.png`](upgrade-screenshots/phase1-00-landscape-before.png)
- Sonra (yatay): [`docs/upgrade-screenshots/phase1-02-landscape.png`](upgrade-screenshots/phase1-02-landscape.png)
- Dikey çizim sonrası: [`docs/upgrade-screenshots/phase1-01-portrait-drawn.png`](upgrade-screenshots/phase1-01-portrait-drawn.png)
- Dikeye dönüş: [`docs/upgrade-screenshots/phase1-03-portrait-restored.png`](upgrade-screenshots/phase1-03-portrait-restored.png)

**Commit:** `602f823` (`feat: keep mobile shell in landscape`)

---

## FAZ 2 — Drawing Experience (P1)

### Önceki UX problemi

Denetimde çizim motoru `WORKING` idi; sorun motor değil mobil erişimdi (390×844, gerçek tarayıcı ölçümü):

| Ölçüm / davranış | Önce |
|---|---|
| Favori araç düğmeleri | 27×27 px, grafik üstünde yüzen küçük bant |
| Seçim sonrası işlem düğmeleri | 28×28 px, yalnızca ayarlar / kopyala / sil |
| `#drawing-help` (ikinci nokta tarifı) | `display:none` (mobilde gizli) |
| Hızlı Long / Short seçimi | Yok; iki seviyeli Araçlar sheet'i gerekiyordu |
| Seçili araç göstergesi | Yalnızca kapalı Araçlar sheet'i içinde `aria-pressed` |
| Undo / redo / lock / hide | Yalnızca gizli masaüstü toolbar / nesne panelinde |

Kaynak: [`docs/upgrade-screenshots/phase2-00-before.png`](upgrade-screenshots/phase2-00-before.png).

### Yapılan değişiklik

- `assets/alfa-drawings.mjs` **değiştirilmedi**; çizim motoru, geçmiş/undo-redo, kalıcılık ve koordinat modeli korundu.
- `alfa-charts.html`: grafiğin yanına (chart host dışında, böylece dokunuşlar çizim olarak algılanmıyor) üç hafif katman eklendi: `#mobile-draw-quick`, `#mobile-draw-hint`, `#mobile-draw-actions`.
- `assets/alfa-charts.mjs`: `initDrawingQuickUX()` mevcut motor API'sini (`setTool`, `toggleFav`, `action`, `current`, `#drawing-undo/#drawing-redo`) yeni katmanlara bağlıyor:
  - Geri al / yinele + Fib, Yatay, Trend, Long, Short + kullanıcı favorileri + Araçlar: tek dokunuşla 44×44 px düğmeler.
  - Araç üzerinde uzun basma (`contextmenu`) favorilere ekle/çıkar; `alfa-draw-fav:v1` kalıcılığı korunuyor.
  - Seçili araç `aria-pressed=true` ve vurgulu zeminle açıkça gösteriliyor; ipucu satırı ilk nokta / ikinci nokta / seçili çizim durumuna göre güncelleniyor.
  - Çizim bitince hızlı çubuk yerine bağlamsal düzenleme çubuğu çıkıyor: Ayarlar, Geri al, Yinele, Kilitle/Kilidi aç, Gizle/Göster, Sil, Araçlar.
  - Gizlenen çizim seçili kalıyor; böylece “Göster” ile geri getirilebiliyor.
- `assets/alfa-charts.css`: yeni katmanlar yalnızca telefon kabuğunda (dikey + yatay) görünüyor; yatayda alt bant üstüne, dikeyde gesture alanı üstüne yerleşiyor. `body.focus-mode` ve `body.tools-hidden` davranışları korundu.
- `alfa-charts.html`: varlık sürümleri `alfa-charts.css?v=36`, `alfa-charts.mjs?v=79`; `sw.js` yine değiştirilmedi.
- `tests/browser/alfa-drawing-experience.browser.mjs`: favori kalıcılığı, kaydırma/çizim ayrımı, iki nokta yönlendirmesi, düzenleme eylemleri, undo/redo, reload kalıcılığı ve yatay erişim için regresyon testi eklendi.

### Kullanıcıya etkisi

- En sık kullanılan beş araç ve geri al/yinele artık tek dokunuşla, başparmak alanında; menüye girmeye gerek yok.
- İlk dokunuştan sonra ekran açıkça “ikinci noktayı seçin (sürükleyerek de ayarlanır)” diyor; yanlış dokunuşta Escape/iptal yolu korunuyor.
- Çizim tamamlanınca Kilitle/Gizle/Sil/Geri al/Yinele tek ekranda; araç çubuğu gereksiz yere yer kaplamıyor.
- Grafik kaydırması (imleç aracıyla) çalışmaya devam ediyor; hızlı araç düğmesine dokunmak çizim oluşturmuyor.
- Masaüstü etkilenmedi: 1440×950 smoke testinde toolbar `flex`, grafik 1140×733, yeni katmanlar `display:none`, `pageErrors: []`.

### Test sonucu

Komut:

```powershell
node tests/browser/alfa-drawing-experience.browser.mjs --url=http://127.0.0.1:8787 --playwright=C:\Users\Pc\AppData\Local\Temp\opencode\alfa-chart-browser-tests\node_modules\playwright\index.mjs --shots=docs/upgrade-screenshots
```

**Sonuç: PASS**, `pageErrors: []`.

| Kontrol | Sonuç |
|---|---|
| Hızlı çubuk (390×844) | 374×54 px, 9 düğme, hepsi 44×44 px |
| Yönlendirme | “Fib · başlangıç noktasını seçin” → “Fib · ikinci noktayı seçin …” |
| Seçili araç | Fib `aria-pressed=true`, vurgulu görünüm |
| Çizim sonrası | 374×54 px düzenleme çubuğu, 7 düğme, hepsi 44×44 px |
| Lock / unlock / hide / show | Gerçek çizimde doğrulandı; gizli çizim hâlâ düzenlenebilir |
| Undo / redo | Son düzenleme geri alındı ve yinelendi |
| Kaydırma vs çizim | İmleçle sürükleme görünür aralığı değiştirdi; hızlı araç dokunuşu çizim eklemedi |
| Kalıcılık | Fibonacci koordinatları ve `long` favorisi reload sonrası aynı |
| Yatay (844×390) | Hızlı çubuk 828×50 px, düğmeler 44×44 px |

**Ekran görüntüleri**

- Önce: [`docs/upgrade-screenshots/phase2-00-before.png`](upgrade-screenshots/phase2-00-before.png)
- Araç seçili / ilk nokta: [`docs/upgrade-screenshots/phase2-01-armed.png`](upgrade-screenshots/phase2-01-armed.png), [`phase2-02-second-point.png`](upgrade-screenshots/phase2-02-second-point.png)
- Düzenleme eylemleri: [`docs/upgrade-screenshots/phase2-03-edit-actions.png`](upgrade-screenshots/phase2-03-edit-actions.png)
- Yatay hızlı çubuk: [`docs/upgrade-screenshots/phase2-04-landscape.png`](upgrade-screenshots/phase2-04-landscape.png)

**Commit:** `2e42417` (`feat: add one-tap mobile drawing UX`)

### Doğrulanamayan / kapsam dışı

- Gerçek iPhone Safari, fiziksel çentik davranışı ve iOS PWA kurulumu: gerçek cihaz olmadan **UNVERIFIED**.
- Bulut/hesap senkronizasyonu ve cross-device çizim senkronizasyonu: staging Auth `401 Invalid JWT` verdiği için **UNVERIFIED**; yerel kalıcılık doğrulandı.
- `navigator.share` ve görüntü panosu desteği tarayıcı yeteneğine bağlı; FAZ 5'te alternatifler değerlendirilecek.
- FAZ 3–5 henüz uygulanmadı.
