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
- FAZ 3–5 sonraki fazlarda ele alındı; bu fazın dışındaki değişiklik yapılmadı.

---

## FAZ 3 — Mobile Feature Discovery (P1)

### Önceki UX problemi

Denetim, masaüstünde çalışan gelişmiş araçların telefonda keşfedilemediğini kaydetti (390×844, gerçek tarayıcı ölçümü):

| Ölçüm / davranış | Önce |
|---|---|
| Mobil menü girişi | 18 kısayol; Multi-chart, Strategy Tester ve Research yok |
| `#multi-toggle` | `display:none` (gizli toolbar içinde) |
| `#lab-menu`, `#tester-open`, `#research-toggle` | `display:none` / 0×0 |
| Multi-chart düzeni | Telefonda 2/4/6 için dikey kaydırmalı tek kolon, 180 px satırlar |
| Replay | Menüde vardı; Tester yalnızca Replay → Paper dolaylı yoluyla |
| Açıklama | Gelişmiş araçların ne yaptığına dair mobil not yok |

Kaynak: [`docs/upgrade-screenshots/phase3-00-before-menu.png`](upgrade-screenshots/phase3-00-before-menu.png) ve `docs/alfa-mobile-ux-audit.md` (öncelik #7/#8).

### Yapılan değişiklik

- `alfa-charts.html`: mobil menüye dört giriş eklendi: **Çoklu grafik**, **Strateji testi**, **Araştırma**, **Gelişmiş**. Menü altına “Test araçları simülasyondur; gerçek emir gönderilmez” notu ve Detaylar bağlantısı eklendi.
- Yeni `#mobile-advanced-sheet` alt paneli: Çoklu grafik, Strateji testleri, Araştırma arşivi ve Replay/İndikatörler kartları; her kart mevcut akışa kısayol. Panel, yeni motor açmadığını ve 4/6 düzenin masaüstüne daha uygun olduğunu açıkça söylüyor.
- `assets/alfa-charts.mjs`: yeni girişler **mevcut** kontrolleri çağırıyor:
  - Multi-chart → mevcut `[data-layout="2"]` düğmesi (`initMultiChart` state’i ve `setOpen(true)` aynen korunuyor).
  - Tester → mevcut `#tester-open` (Replay yoksa açıklayıcı dialog, varsa tester sekmesi).
  - Research → mevcut `#research-toggle` / `research.toggle()`.
  - Replay ve İndikatörler → mevcut `#replay-toggle` / `#indicators-manage`.
  - Menü açıldığında ve `#multi-exit` kullanıldığında `aria-pressed` / etiket senkronize ediliyor.
- `assets/alfa-charts.css`: mobil 2-grafik düzeni artık yan yana değil **dikey iki eşit pane** (kaydırma yerine `minmax(0,1fr)`), üstte 44 px’lik “Tek grafiğe dön” kontrolü; Research ve Paper/Tester panelleri alt strip ile çakışmayacak şekilde safe-area’ya göre konumlandırıldı.
- `alfa-charts.html`: varlık sürümleri `alfa-charts.css?v=37`, `alfa-charts.mjs?v=80`; `sw.js` değiştirilmedi.
- `tests/browser/alfa-feature-discovery.browser.mjs`: menü girişleri, 2-pane düzen, tester dialogu, Research paneli, gelişmiş alt paneli, yatay erişim ve masaüstü smoke için regresyon testi eklendi.

### Kullanıcıya etkisi

- Kullanıcı artık menüden tek dokunuşla iki grafik açabiliyor ve aynı “Tek grafiğe dön” kontrolüyle çıkabiliyor; 2 pane 375 px yükseklikte, yatayda 148 px.
- Strateji testi ve Araştırma, gizli Laboratuvar popover’ına girmeden doğrudan menüde; Replay ve indikatörler de aynı akışta korunuyor.
- Gelişmiş paneli, sığmayan 4/6 düzen ve hesap bağımlı özellikleri açıklıyor; simülasyon uyarısı kalıcı olarak görünür.
- Masaüstü etkilenmedi: 1440×950’de toolbar `flex` (54 px), `#multi-toggle` görünür (34×34), grafik 1140×733, watchlist 248×872, `pageErrors: []`.

### Test sonucu

Komut:

```powershell
node tests/browser/alfa-feature-discovery.browser.mjs --url=http://127.0.0.1:8787 --playwright=C:\\Users\\Pc\\AppData\\Local\\Temp\\opencode\\alfa-chart-browser-tests\\node_modules\\playwright\\index.mjs --shots=docs/upgrade-screenshots
```

**Sonuç: PASS**, `pageErrors: []`.

| Kontrol | Sonuç |
|---|---|
| Mobil menü | 22 giriş; yeni 4 giriş dikeyde 111×64 px, yatayda 198×48 px |
| Çoklu grafik | `body.multi-open`, `data-layout=2`, tek chart gizli, 2 hücre 386×375 px |
| Çıkış | `#multi-exit` 90×44 px; dönüşte `aria-pressed=false` |
| Strateji testi | “Strateji testleri” dialogu ve “Replay başlat” eylemi açıldı |
| Research | Panel 374×420 px, `Misafir · yalnızca yerel kayıt`, yatay taşma 0 |
| Gelişmiş paneli | 374×574 px, 4 kart, simülasyon ve 1/2 düzen notu |
| Yatay | Menü girişleri 48 px; 2 pane 840×148 px |
| Regresyon | FAZ 1 ve FAZ 2 testleri yeniden **PASS**; masaüstü smoke **PASS** |

**Ekran görüntüleri**

- Önce (18 girişli menü): [`docs/upgrade-screenshots/phase3-00-before-menu.png`](upgrade-screenshots/phase3-00-before-menu.png)
- Sonra (22 girişli menü): [`docs/upgrade-screenshots/phase3-01-menu-after.png`](upgrade-screenshots/phase3-01-menu-after.png)
- İki grafik: [`docs/upgrade-screenshots/phase3-02-multi-two.png`](upgrade-screenshots/phase3-02-multi-two.png)
- Research paneli: [`docs/upgrade-screenshots/phase3-03-research.png`](upgrade-screenshots/phase3-03-research.png)
- Gelişmiş alt paneli: [`docs/upgrade-screenshots/phase3-04-advanced.png`](upgrade-screenshots/phase3-04-advanced.png)
- Yatay iki grafik: [`docs/upgrade-screenshots/phase3-05-landscape-multi.png`](upgrade-screenshots/phase3-05-landscape-multi.png)

**Commit:** `c87a34a` (`feat: surface advanced chart tools on mobile`)

### Doğrulanamayan / kapsam dışı

- Gerçek iPhone Safari, fiziksel çentik ve iOS PWA kurulumu: gerçek cihaz olmadan **UNVERIFIED**.
- Research hesap özellikleri, bulut çakışma çözümü ve cross-device senaryoları: staging Auth `401 Invalid JWT` verdiği için **UNVERIFIED**; misafir/yerel panel doğrulandı.
- 4/6 grafik düzeni telefonda kasıtlı olarak birincil değil; masaüstü davranışı korundu. Gerçek gerçek emir gönderimi kapsam dışı; Tester/Paper simülasyon olarak etiketlendi.

---

## FAZ 4 — Trust, Status & Touch Targets (P0/P1)

### Önceki UX problemi

Denetim, mobil kabukta güven ve durum bilgisinin görünmediğini, alt şerit ile zaman aralığı satırlarının ise 44 px dokunma hedefinin altında kaldığını kaydetti (390×844 ve 844×390 gerçek tarayıcı ölçümü):

| Ölçüm / davranış | Önce |
|---|---|
| Kayıt durumu | Yalnızca gizli footer’da (`footer{display:none}`); telefonda görünmüyordu |
| Alarm kapsamı | Doğru metin yalnızca Alarm dialogunun içinde; ana menüde hatırlatma yok |
| Paper simülasyonu | Başlıkta küçük «Paper Trading · SİMÜLASYON» metni vardı, kalıcı rozet yok |
| Alt şerit (dikey) | Menü `34×34`, yıldız `28×34`, zaman `56×34` px |
| Alt şerit (yatay) | `28 px` yükseklik, düğmeler `44×30` px |
| Zaman aralığı satırı | `36 px` yükseklik (13 satır / 26 buton) |

Kaynak: [`docs/upgrade-screenshots/phase4-00-portrait-strip.png`](upgrade-screenshots/phase4-00-portrait-strip.png), [`phase4-00-landscape-strip.png`](upgrade-screenshots/phase4-00-landscape-strip.png), [`phase4-00-timeframes.png`](upgrade-screenshots/phase4-00-timeframes.png) ve `docs/alfa-mobile-ux-audit.md` (öncelik #2/#3/#5/#9/#10/#17).

### Yapılan değişiklik

- `alfa-charts.html`: mobil menüye salt-okunur `#mobile-save-state` durumu ve kalıcı alarm kapsam notu eklendi. Not, mevcut `#alarm-scope` metnini **değiştirmeden** aynı gerçeği özetliyor: yerel alarm, yalnızca seçili sembol, sekme kapalıyken/Replay’de çalışmaz, 7/24 sunucu alarmı değildir.
- `assets/alfa-charts.mjs`: `syncMobileStatus()` mevcut `#drawing-status`, `#cloud-conflict`, `#workspace-conflict`, research `data-state` ve `navigator.onLine` sinyallerini okuyup menüdeki durumu güncelliyor. Yeni auth çağrısı, `localStorage` yazımı, Supabase isteği veya izin istemi yok; `cloudSettings.start()` yeniden çağrılmıyor.
- `assets/alfa-paper.mjs`: Paper panelinin sabit header’ına `GERÇEK EMİR YOK` rozeti eklendi. Header `update()` sırasında yeniden kurulmadığı için rozet sekme değişiminde ve liste yeniden çiziminde kalıcı.
- `assets/alfa-charts.css`:
  - Alt şerit düğmeleri dikeyde en az `44×44`, yatayda `44×44` olacak şekilde büyütüldü. Yatay şerit `28 → 48 px`, grafik `352 → 332 px` (hâlâ ekranı dolduruyor, test eşiği `>=300`).
  - Odak modu, çizim hızlı çubuğu, sol dock, replay bar, research/paper panel ve swipe overlay konumları yeni şerit yüksekliğine göre kaydırıldı.
  - Zaman aralığı satırları `36 → 46 px`, favori butonları `36×36 → 46×46`; dikey sheet için ek yükseklik ve `overscroll-behavior:contain` eklendi.
  - Durum rozetleri için yerel/çevrimdışı/hata/çakışma/hesap renkleri tanımlandı; masaüstü düzeni etkilenmedi.
- `alfa-charts.html`: varlık sürümleri `alfa-charts.css?v=38`, `alfa-charts.mjs?v=81`; paper modülü içe aktarımı `alfa-paper.mjs?v=6`. `sw.js` değiştirilmedi.
- `tests/browser/alfa-trust-touch.browser.mjs`: durum notu, alarm kapsamı, Paper rozeti, dokunma hedefleri, zaman sheet’i, yatay yerleşim ve masaüstü smoke için regresyon testi eklendi. FAZ 1 testindeki yatay şerit eşiği, bilinçli 44 px hedefi nedeniyle `<=32 → 44..56` olarak güncellendi.

### Kullanıcıya etkisi

- Menü artık açıldığında kayıt durumunu açık söylüyor: misafirde «MİSAFİR · yalnızca yerel kayıt»; gerçek oturumda hesap/bulut durumları yalnızca mevcut sinyallerden yansıyor, doğrulanmamış senkronizasyon iddia edilmiyor.
- Alarmın 7/24 olmadığı, yalnızca seçili sembol ve açık sekme ile sınırlı olduğu artık ana menüde de görünüyor; Alarm dialogunun korunan metni aynen kalıyor.
- Paper Trading panelinde «GERÇEK EMİR YOK» rozeti her sekmede ve her yeniden çizimde görünür; gerçek emir isteği gönderilmedi (`realOrderRequests: 0`).
- Menü, yıldız, zaman ve sembol dokunma hedefleri dikeyde 44 px; yatayda şerit 48 px ve düğmeler 44 px. Zaman aralığı seçim satırları 46 px.
- Masaüstü etkilenmedi: 1440×950’de toolbar `flex` (54 px), grafik 1140×733, watchlist 248×872, `pageErrors: []`.

### Test sonucu

Komut:

```powershell
node tests/browser/alfa-trust-touch.browser.mjs --url=http://127.0.0.1:8787 --playwright=C:\Users\Pc\AppData\Local\Temp\opencode\alfa-chart-browser-tests\node_modules\playwright\index.mjs --shots=docs/upgrade-screenshots
```

**Sonuç: PASS**, `pageErrors: []`, `realOrderRequests: 0`.

| Kontrol | Sonuç |
|---|---|
| Kayıt durumu | Menüde 348×34 px rozet; `MİSAFİR · yalnızca yerel kayıt` |
| Alarm kapsamı | Menü notu + dialog; `Sekme kapalıyken … 7/24 sunucu alarmı değildir` |
| Paper rozeti | `GERÇEK EMİR YOK`, 105×24 px; tester/all sekmelerinde kalıcı |
| Dikey dokunma | Menü 44×44, yıldız 44×44, zaman 56×44, sembol 204×44 px |
| Zaman aralığı | 26 buton / 13 satır, her biri 46 px; yatay taşma 0 |
| Yatay | Şerit 48 px, düğmeler 44 px, grafik 332 px, taşma 0 |
| Regresyon | FAZ 1, FAZ 2, FAZ 3 ve `alfa-paper` testleri **PASS**; masaüstü smoke **PASS** |

**Ekran görüntüleri**

- Önce (menü, alarm, Paper, zaman aralığı, yatay): [`phase4-00-portrait-strip.png`](upgrade-screenshots/phase4-00-portrait-strip.png), [`phase4-00-alarm.png`](upgrade-screenshots/phase4-00-alarm.png), [`phase4-00-paper.png`](upgrade-screenshots/phase4-00-paper.png), [`phase4-00-timeframes.png`](upgrade-screenshots/phase4-00-timeframes.png), [`phase4-00-landscape-strip.png`](upgrade-screenshots/phase4-00-landscape-strip.png)
- Sonra (menü durumu): [`docs/upgrade-screenshots/phase4-02-menu-status.png`](upgrade-screenshots/phase4-02-menu-status.png)
- Alarm dialogu: [`docs/upgrade-screenshots/phase4-03-alarm-dialog.png`](upgrade-screenshots/phase4-03-alarm-dialog.png)
- Paper rozeti: [`docs/upgrade-screenshots/phase4-04-paper-badge.png`](upgrade-screenshots/phase4-04-paper-badge.png)
- Zaman aralığı: [`docs/upgrade-screenshots/phase4-05-timeframes.png`](upgrade-screenshots/phase4-05-timeframes.png)
- Yatay şerit: [`docs/upgrade-screenshots/phase4-06-landscape.png`](upgrade-screenshots/phase4-06-landscape.png)

**Commit:** `1f16c12` (`feat: clarify mobile status and enlarge touch targets`)

### Doğrulanamayan / kapsam dışı

- Gerçek hesapta bulut kaydı, çakışma çözümü ve cihazlar arası senkronizasyon: staging Auth `401 Invalid JWT` verdiği için **UNVERIFIED**. Menü rozeti gerçek durumu yalnızca mevcut sinyallerden okur; yeni bir doğrulama iddiası üretmez.
- 7/24 alarm teslimi, Telegram/webhook gönderimi ve gerçek iOS bildirim izni: gerçek hesap/cihaz olmadan **UNVERIFIED**; yerel kapsam metni doğrulandı.
- Yatay şerit 28 px’den 48 px’e çıkarıldı; bu, 44 px dokunma hedefi için bilinçli bir değişikliktir ve FAZ 1’in tam ekran davranışı korundu (grafik 332 px).
- Gerçek emir gönderimi kapsam dışı; Paper/tester yalnızca simülasyon olarak etiketlendi.

---

## FAZ 5 — Paylaşım, ortak sheet davranışı ve PWA temeli (P0/P1)

### Önceki UX problemi

Denetim, paylaşım seçeneklerinin tarayıcı yeteneğine bakılmadan gösterildiğini ve hata mesajının telefonda görünmez footer’a yazıldığını kaydetti. Ayrıca grafik sayfasında service worker kaydı yoktu (`swRegistrations: 0`), install ipucu bulunmuyordu ve Paylaş/Zaman dilimi sayfalarında geri dönüş ile `Escape` kapatma yoktu.

| Davranış / ölçüm | Önce |
|---|---|
| Paylaşım seçenekleri | 4 buton her tarayıcıda görünür; desteklenmeyenler tıklanabiliyordu |
| Hata görünürlüğü | `connection(...)` → gizli footer / gizli `#chart-data-state`; ekranda mesaj yok |
| Görüntü paylaşımı fallback’i | `navigator.share` yoksa görüntü panosuna düşüyordu; o da yoksa hata |
| Service worker | Grafik sayfasında kayıt yok (`swRegistrations: 0`) |
| Kurulum ipucu | Yok; iOS install iddiası/doğrulaması yok |
| Paylaş / zaman sheet’i | Yalnızca Kapat; Escape ile kapanmıyordu |
| Sheet geri/kapat butonları | 28×28 px |

Kaynak: [`phase5-00-share.png`](upgrade-screenshots/phase5-00-share.png), [`phase5-00-timeframes.png`](upgrade-screenshots/phase5-00-timeframes.png), [`phase5-00-advanced.png`](upgrade-screenshots/phase5-00-advanced.png) ve `docs/alfa-mobile-ux-audit.md` (öncelik #6/#12/#16).

### Yapılan değişiklik

- `alfa-charts.html`:
  - Paylaş ve Zaman dilimi sheet’lerine menüye dönen geri butonları eklendi; paylaşım butonlarına `data-share-action` ve görünür bir yetenek notu (`#mobile-share-note`) eklendi.
  - Gelişmiş sheet’e, desteklenmeyen cihazlarda yanıltıcı olmayan kurulum notu eklendi: ana ekrana ekleme yalnızca tarayıcı/cihaz destekliyorsa kullanılabilir; **iOS Safari kurulumu bu çalışmada doğrulanmadı**.
  - Varlık sürümleri `alfa-charts.css?v=40` ve `alfa-charts.mjs?v=82`’ye yükseltildi. `sw.js` değiştirilmedi.
- `assets/alfa-charts.mjs`:
  - `detectShareCapabilities()`: `navigator.share`, dosya desteği için `navigator.canShare()` (küçük `File` probu) ve görüntü panosu desteğini okur. Yeni auth, izin isteği veya ağ çağrısı yok.
  - `syncShareCapabilities()` desteklenmeyen seçenekleri gizler; sistem paylaşımı yoksa «Bağlantıyı paylaş» butonunu mevcut `copyChartLink()` yoluna bağlayıp «Bağlantıyı kopyala» olarak etiketler. İndirme seçeneği her zaman kalır.
  - `shareChartImage()` artık desteklenmeyen durumda görüntü panosuna düşmek yerine mevcut `downloadChartScreenshot()` yolunu kullanır.
  - Paylaşım hataları `showMessage()` ile ekranda görünür; sheet açık kalır, böylece kullanıcı çalışan bir fallback seçebilir. Masaüstü screenshot menüsündeki hatalar da görünür mesaja yazılır.
  - Tüm sheet’ler için `Escape` ile kapatma, açılış/kapanışta `aria-hidden` senkronizasyonu ve Paylaş/Zaman geri butonları eklendi.
  - Mevcut `/sw.js` yalnızca kaydediliyor (secure context + `load` sonrası); service worker kaynak kodu, önbellek stratejisi veya `BUILD_ID` değişmedi.
- `assets/alfa-charts.css`: sheet geri/kapat ve paylaşım butonları 44 px; yetenek notu ve kurulum notu stilleri eklendi.
- `tests/browser/alfa-capability-pwa.browser.mjs`: gerçek Chrome/Playwright ile fallback, native yetenek simülasyonu, görünür hata, geri/Escape, service worker kaydı ve masaüstü smoke testi eklendi.
- Yeni paket/framework, chart/drawing motoru değişikliği, gerçek kullanıcı verisi mutasyonu, production deploy veya credentials kullanılmadı.

### Kullanıcıya etkisi

- Desteklenmeyen tarayıcıda Paylaş sheet’i sadece çalışan seçenekleri gösterir: bağlantı kopyalama ve görüntü indirme. Yetenek yoksa kullanıcıya nedeni açıkça yazılır.
- Sistem paylaşımı olan tarayıcıda fotoğraf/bağlantı paylaşımı ve görüntü panosu seçenekleri görünür; bir seçenek çalışmazsa hata ekranda gösterilir ve fallback’ler erişilebilir kalır.
- Paylaşım ve Zaman dilimi sheet’leri artık menüye dönebilir; `Escape` ve backdrop/grip/kapat yolları ortak davranışı korur.
- Grafik sayfası mevcut service worker’ı kaydeder; testte kayıt kapsamı doğrulandı. Bu, çevrimdışı çalışmanın veya iOS kurulumunun doğrulandığı anlamına gelmez.
- Masaüstü workspace korundu: 1440×950’de toolbar `flex` (54 px), grafik 1140×733, watchlist 248×872, `pageErrors: []`.

### Test sonucu

Komut:

```powershell
node tests/browser/alfa-capability-pwa.browser.mjs --url=http://127.0.0.1:8787 --playwright=C:\Users\Pc\AppData\Local\Temp\opencode\alfa-chart-browser-tests\node_modules\playwright\index.mjs --shots=docs/upgrade-screenshots
```

**Sonuç: PASS**, `pageErrors: []`.

| Kontrol | Sonuç |
|---|---|
| Service worker | `http://127.0.0.1:8787/` kapsamında 1 kayıt; `sw.js` değişmedi |
| Fallback yetenekleri | `share=false`, `imageShare=false`, `clipboardImage=false`, `download=true` |
| Fallback UI | Görüntü/pano seçenekleri gizli; bağlantı butonu `copy-link`, 348×44 px; indirme 348×44 px; not görünür |
| Bağlantı fallback’i | `http://127.0.0.1:8787/alfa-charts.html?symbol=BTCUSDT&interval=1h` panoya kopyalandı |
| İndirme fallback’i | `chart-btcusdt-1h-*.png` indirme olayı gerçekleşti |
| Native yetenek simülasyonu | `share=true`, `imageShare=true`, `clipboardImage=true`; fotoğraf paylaşımı 1 dosya aldı |
| Görünür hata | Pano hatası zorlandı; `#message` görünür, sheet açık kaldı |
| Ortak kapatma | Paylaş/Zaman geri butonları menüye döndü; `Escape` tüm sheet’leri kapattı, `aria-hidden=true` |
| Kurulum notu | Tarayıcı/cihaz desteği ve iOS doğrulanmadı ifadesi görünür |
| Regresyon | FAZ 1, FAZ 2, FAZ 3, FAZ 4, `alfa-paper` ve masaüstü smoke **PASS**; birim testleri 22/22 |

**Ekran görüntüleri**

- Önce (paylaşım, zaman dilimi, gelişmiş): [`phase5-00-share.png`](upgrade-screenshots/phase5-00-share.png), [`phase5-00-timeframes.png`](upgrade-screenshots/phase5-00-timeframes.png), [`phase5-00-advanced.png`](upgrade-screenshots/phase5-00-advanced.png)
- Sonra (fallback paylaşım): [`phase5-01-share-fallback.png`](upgrade-screenshots/phase5-01-share-fallback.png)
- Sonra (zaman dilimi geri): [`phase5-06-timeframes-back.png`](upgrade-screenshots/phase5-06-timeframes-back.png)
- Kurulum notu: [`phase5-02-install-hint.png`](upgrade-screenshots/phase5-02-install-hint.png)
- Native yetenekler: [`phase5-03-share-native.png`](upgrade-screenshots/phase5-03-share-native.png)
- Görünür hata: [`phase5-04-share-error.png`](upgrade-screenshots/phase5-04-share-error.png)
- Masaüstü: [`phase5-05-desktop.png`](upgrade-screenshots/phase5-05-desktop.png)

**Commit:** `a5c2ee1` (`feat: make mobile sharing capability-aware`)

### Doğrulanamayan / kapsam dışı

- Gerçek cihazlarda `navigator.share`, dosya paylaşımı, görüntü panosu ve Android/iOS PWA kurulumu: gerçek cihaz olmadan **UNVERIFIED**. Testte native yetenekler yalnızca kontrollü olarak simüle edildi; gerçek işletim sistemi paylaşım paneli açılmadı.
- iOS Safari «Ana ekrana ekle» akışı ve `beforeinstallprompt` davranışı: **UNVERIFIED**; kurulum notu bilinçli olarak iddia içermez.
- Service worker’ın gerçek çevrimdışı davranışı ve uzun vadeli önbellek senaryosu kapsam dışı; yalnızca grafik sayfasında kayıt oluştuğu doğrulandı. `sw.js`, `BUILD_ID` ve önbellek stratejisi değiştirilmedi.
- Gerçek hesap/bulut/cross-device senaryoları FAZ 4’te olduğu gibi **UNVERIFIED**; staging Auth `401 Invalid JWT` veriyor.
- Production deploy yapılmadı; tüm çalışma yerel statik sunucu ve yerel commit’lerle sınırlı.

## FAZ 5 sonrası düzeltme: alt çizim çubuğu / parite şeridi çakışması

- **Sorun:** Çizim seçiliyken `#mobile-draw-actions` (geri al / yinele / kilitle / gizle / sil) ve araç seçilmemişken `#mobile-draw-quick`, parite şeridinin (`#mobile-market-strip`) üst binmesini kapsıyordu; menü ve parite dokunmaları çubuğa gidiyordu.
- **Düzeltme:** Çubuklar portrede `bottom: 56px → 84px`, yatayda `60px → 66px`; ipucu da sırasıyla `108px → 146px` ve `110px → 124px` yukarı taşındı. Şeridin üstünde 8 px boşluk kaldı; `sw.js` değişmedi, CSS sürümü `?v=40 → ?v=41` yapıldı.
- **Regresyon:** `alfa-drawing-experience.browser.mjs` artık hızlı araç/aksiyon çubuğunun şeridi geçmediğini ve menü/parite düğmelerinin `elementFromPoint` ile hâlâ ulaşılabilir olduğunu doğruluyor. Yerel suite PASS; `alfa-trust-touch` ve `alfa-mobile-landscape` de PASS.
- **Kapsam:** Yalnızca mobil yerleşim/CSS ve test; çizim motoru, masaüstü düzeni ve Supabase kodu değişmedi.

---

## FAZ 6 — Grafik Etkileşimleri

### Önceki eksiklik / mevcut durum

Kod denetimi, istenen davranışların büyük kısmının zaten mevcut olduğunu gösterdi: `CrosshairMode.Normal` (`assets/alfa-charts.mjs:108`), `chart.subscribeCrosshairMove` (`assets/alfa-charts.mjs:1275`), pan/pinch ve fiyat ekseni grip (`assets/alfa-charts.mjs:111-112`, `:614-682`), uzun basma ile sıfırlama, eski mum gezinmesi ve çizim kalıcılığı çalışıyordu. Bunlar yeniden yazılmadı. Gerçek eksiklikler şunlardı:

1. Mobil CSS `#ohlc` öğesini gizliyordu (`assets/alfa-charts.css:705`); dokunarak okunabilir fiyat/zaman balonu yoktu.
2. “Son mum” ve “Sığdır” menüde vardı ama görünür bir “Görünümü sıfırla” eylemi yalnızca uzun basma/ayarlar içindeydi.
3. Dokunmatik fiyat-pan dinleyicisi çizim hit hedeflerini hariç tutmuyordu; seçili çizim sürüklemesi fiyat marjlarını da değiştirebiliyordu.
4. Görünür grafik aralığı (zoom/konum) sayfa yenilemesinde korunmuyordu; çizimler ve düzen ayrı olarak kalıcıydı.

### Uygulanan geliştirme

- `#mobile-candle-readout` eklendi; mevcut crosshair aboneliğinden besleniyor, O/H/L/C, değişim, hacim ve biçimlendirilmiş zamanı gösteriyor. `pointer-events` devraldığı için pan, pinch ve çizim dokunmalarını engellemiyor. Masaüstünde gizli.
- Mobil menüye `menu-reset` eklendi ve mevcut `handleChartAction('reset-view')` akışına bağlandı. Sıfırlama ayrıca kaydedilmiş görünüm aralığını temizliyor.
- Fiyat-pan dinleyicisine `[data-id]` ve `.selection-toolbar` hariç tutmaları eklendi; çizim seçimi/sürüklemesi artık fiyat eksenini kaydırmıyor.
- Yalnızca mobil için sembol/zaman dilimi bazlı görünür logical aralık kalıcılığı eklendi. İlk veri gelince, aynı oturum ve aynı sembol/zaman dilimi için geri yükleniyor; sembol veya timeframe değişiminde sıfırlama davranışı korunuyor. `fit`, `son mum`, aralık seçimleri yeni aralığı kaydediyor; `sıfırla` kaydı siliyor.
- Asset sürümleri CSS `?v=41 → ?v=42`, JS `?v=82 → ?v=83` yapıldı. `sw.js`, çizim motoru, grafik motoru, Watchlist, Replay, indikatörler ve masaüstü düzeni değişmedi. Production deploy yapılmadı.

### Test sonucu

- Yeni suite: `tests/browser/alfa-mobile-chart-interactions.browser.mjs` — **PASS**. Dokunma ile okuma balonu, menü sıfırlama, reload sonrası aralık geri yükleme, çizim sürüklemesinde fiyat marjlarının sabit kalması ve yatay görünüm kontrol edildi; sayfa hatası yok.
- Regresyon: `alfa-mobile-shell`, `alfa-drawing-experience`, `alfa-mobile-landscape`, `alfa-trust-touch`, `alfa-capability-pwa` — **PASS** ( masaüstü smoke dahil ).
- Birim testleri: `node --test tests/*.test.mjs` — **1219/1219 PASS**.
- `alfa-mobile-shell.browser.mjs` yerel `http://` origin ile de çalışacak şekilde genişletildi; üretim kodu etkilenmedi.

**Ekran görüntüleri**

- Önce: [`phase6-00-before-portrait.png`](upgrade-screenshots/phase6-00-before-portrait.png), [`phase6-01-before-tap.png`](upgrade-screenshots/phase6-01-before-tap.png), [`phase6-02-before-landscape.png`](upgrade-screenshots/phase6-02-before-landscape.png)
- Sonra: [`phase6-10-after-tap-readout.png`](upgrade-screenshots/phase6-10-after-tap-readout.png), [`phase6-11-after-persisted-viewport.png`](upgrade-screenshots/phase6-11-after-persisted-viewport.png), [`phase6-12-after-drawing-guard.png`](upgrade-screenshots/phase6-12-after-drawing-guard.png), [`phase6-13-after-landscape.png`](upgrade-screenshots/phase6-13-after-landscape.png)

**Commit:** `feat: improve FAZ 6 mobile chart interactions` (tek FAZ 6 commit’i; kesin hash teslim notunda)

### Kalan sınırlamalar

- Gerçek iPhone/Android dokunma hissi ve Safari özel davranışları **UNVERIFIED**; testler gerçek Chrome’da Playwright/CDP dokunma olaylarıyla yapıldı.
- Kalıcılık yalnızca mobil görünür logical aralığı kapsar; fiyat marjları ve çizim seçimi formu ayrıca saklanmaz. Çoklu grafik açıkken aralık geri yükleme/ kaydetme ana grafiğin senkronizasyonuna bırakılır.
- Bulut hesabı/cross-device doğrulama gerçek hesap olmadan **UNVERIFIED**; FAZ 4 bulut çakışma mekanizmasına dokunulmadı.

---

## FAZ 7 — Çizim ve Fibonacci Pro

### Önceki eksiklik / mevcut durum

Denetim, istenen yeteneklerin çoğunun zaten bulunduğunu gösterdi: Fibonacci aracı mobil hızlı çubukta ve iki noktalı akışta çalışıyordu (`assets/alfa-charts.mjs:1994`, `alfa-drawing-experience` regresyonu); seviye/renk/stil alanları ve Fib şablonları mevcuttu (`alfa-charts.html:199-232`); favoriler, kilit/gizle/sil ve yerel/bulut çizim belgesi kalıcılığı da çalışıyordu (`alfa-drawings.mjs:171-185`, `alfa-drawings-store.mjs:16`, `:51-62`). Bu mekanizmalar yeniden yazılmadı. Gerçek boşluklar şunlardı:

1. Mobil bağlam çubuğunda **kopyala** eylemi yoktu; kopyalama yalnızca masaüstü seçim çubuğu, sağ tık menüsü ve yönetim formundaydı.
2. Fib şablonları ve stil alanları telefon `#drawing-manager` içinde masaüstü boyutlarında kalıyordu; bazı kontroller 44 px dokunma hedefinin altındaydı ve yönetim paneli aksiyon çubuğuna yaklaşabiliyordu.
3. Seçili çizim için sayısal UTC zaman/fiyat koordinatı girişi yoktu; hassas ayar yalnızca sürükleme, uç nokta tutamaçları ve ok tuşlarıyla yapılabiliyordu.

### Uygulanan geliştirme

- Mobil seçim çubuğuna `copy` eylemi eklendi; mevcut `drawings.action('copy')` akışını kullanıyor, yeni bir kopyalama motoru oluşturmuyor. 44 px dokunma hedefi korundu.
- `#drawing-manager` yalnızca telefon/yatay medya sorgularında tam genişlikte, kaydırılabilir bir sheet gibi davranıyor; input/select/textarea/button ve nesne ağacı satırları en az 44 px, Fib alanları ve şablon kontrolleri thumb-friendly. Panel alt sınırı mobil aksiyon çubuğunun üstünde kalıyor. Masaüstü yerleşimi değişmedi.
- `#drawing-coordinate-fields` eklendi; seçili nokta tabanlı çizimler için her anchor için UTC epoch saniye ve fiyat alanları üretiliyor. `applySettings()` bu değerleri doğrulayıp mevcut `commit()` üzerinden belgeye yazıyor; kilitli çizimlerde alanlar devre dışı. Fırça, long/short pozisyonlar ve 20’den fazla noktalı çizimler bu editörden hariç tutuldu.
- Asset sürümleri CSS `?v=42 → ?v=43`, ana JS `?v=83 → ?v=84`, çizim motoru importu `?v=16 → ?v=17` yapıldı. `sw.js`, favori anahtarı `alfa-draw-fav:v1`, çizim belgesi anahtarı `alfa-drawings:v1:{owner}:{symbol}`, çizim/grafik motorlarının mimarisi, Watchlist, Replay ve masaüstü davranışı değişmedi. Production deploy yapılmadı.

### Test sonucu

- Yeni suite: `tests/browser/alfa-mobile-drawing-pro.browser.mjs` — **PASS**. Fib oluşturma, mobil kopyalama, 44 px yönetim kontrolleri, şablon kaydetme/uygulama, hassas koordinat düzenleme, reload sonrası çizim/şablon kalıcılığı ve yatay görünüm doğrulandı; sayfa hatası yok.
- Regresyon: `alfa-drawing-experience`, `alfa-mobile-chart-interactions` (FAZ 6), `alfa-mobile-shell`, `alfa-mobile-landscape`, `alfa-trust-touch`, `alfa-capability-pwa` — **PASS** (masaüstü smoke dahil).
- Birim testleri: `node --test tests/*.test.mjs` — **1219/1219 PASS**.

**Ekran görüntüleri**

- Önce: [`phase7-00-before-actions.png`](upgrade-screenshots/phase7-00-before-actions.png), [`phase7-01-before-settings.png`](upgrade-screenshots/phase7-01-before-settings.png), [`phase7-02-before-landscape.png`](upgrade-screenshots/phase7-02-before-landscape.png)
- Sonra: [`phase7-10-after-copy.png`](upgrade-screenshots/phase7-10-after-copy.png), [`phase7-11-after-template.png`](upgrade-screenshots/phase7-11-after-template.png), [`phase7-12-after-coordinates.png`](upgrade-screenshots/phase7-12-after-coordinates.png), [`phase7-13-after-landscape.png`](upgrade-screenshots/phase7-13-after-landscape.png)

**Commit:** `feat: improve FAZ 7 mobile drawing and Fibonacci ergonomics` (tek FAZ 7 commit’i; kesin hash teslim notunda)

### Kalan sınırlamalar

- Gerçek iPhone/Android Safari dokunma hissi, native paylaşım ve PWA kurulumu **UNVERIFIED**; testler gerçek Chrome’da Playwright/CDP ile yapıldı.
- Bulut hesabı/cross-device senaryoları gerçek hesap olmadan **UNVERIFIED**; yalnızca yerel belge/şablon kalıcılığı doğrulandı.
- Koordinat editörü UTC epoch saniye ve fiyat kabul eder; ondalık zamanlar korunur ancak kullanıcı arayüzü takvim seçici değildir. Fırça ve pozisyon çizimleri kapsam dışıdır.
- Çizim motoru ve render katmanı yeniden yazılmadı; yeni alanlar mevcut doğrulama/geçmiş/kayıt akışına eklendi. `sw.js` değişmediği için yeni sürüm sorguları service worker önbelleğini doğal olarak geçersiz kılar.
