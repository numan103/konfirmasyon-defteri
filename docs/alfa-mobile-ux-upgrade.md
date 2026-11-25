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

### Doğrulanamayan / kapsam dışı

- Gerçek iPhone Safari, fiziksel çentik davranışı ve iOS PWA kurulumu: gerçek cihaz olmadan **UNVERIFIED**.
- Bulut/hesap senkronizasyonu ve cross-device testi: staging Auth `401 Invalid JWT` verdiği için **UNVERIFIED**; yerel çizim verisi etkilenmedi.
- FAZ 2–5 henüz uygulanmadı; bu fazda mevcut davranışları korumak dışında yeni özellik eklenmedi.
