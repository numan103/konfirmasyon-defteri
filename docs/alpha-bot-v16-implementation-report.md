# Alpha Bot v16 — uygulama ve test raporu

## Durum

Kod Telegram Q&A akışına entegre edildi. Bu rapor geliştirme/test sonuçlarını kaydeder; canlı yayın durumu ayrıca deployment kaydıyla doğrulanır. **Gerçek emir, Telegram test mesajı veya production DB yazımı yapılmadı.**

Kanonik kaynak: `docs/alpha-bot-strategy-v16.md`, kullanıcının dosyasının değiştirilmemiş kopyası.
SHA-256: `FB2AFC758B0EA454764D24B5185633140B38CBC015E1C40E0A5B7E546C71D4EC`.
Strateji otoritesi A/B ve bunları özetleyen C bölümüdür; D arşivindeki çelişkili maddeler geçerli kural değildir.

## 1. Önceki altyapıda ne vardı?

- `lib/telegram-qa.mjs`: piyasa verisi → çoklu zaman dilimi bağlamı → Supabase strateji/bilgi notları → Groq yorum → plan ayrıştırma/doğrulama → Telegram cevabı.
- Binance, OKX, Bybit, Coinbase OHLC yedekleri; fakat mumun **open ve timestamp alanları atılıyordu**, kapanmış mum şartı uygulanmıyordu.
- `lib/market-structure.mjs`: 2 sol/2 sağ komşulu betimsel pivot, son impuls, Fibonacci, FVG/IFVG, ATR/EMA araçları.
- `lib/trade-plan.mjs`: yön/seviye geometrisinin yanında genel ATR, fiyat uzaklığı ve RR sınırları.
- `lib/coinalyze.mjs`: BTC spot CVD, OI ve long/short bağlamı. `lib/orderbook-levels.mjs`: OpenMarket/Binance Futures defter bağlantısı; Q&A veri toplamasında kapalıydı.
- V16 ile çelişkiler: 1H/4H son impulsundan 0.382–0.5 giriş, ATR tabanlı stop, likidite TP'si, IFVG için 08–12 sabit saati ve BTC IFVG yasağı.

## 2. Güncel çalışma şekli

1. Mevcut salt-okunur veri kaynaklarından mumlar alınır. OHLCV ve Unix-ms zamanı korunur; yalnız karar anına kadar **kapanmış**, geçerli mumlar analize girer. OKX açık mum bayrağı da kontrol edilir.
2. Kanonik v16 talimatı, eski dinamik notlardan önce ve sonra uygulanır. Eski notlar yalnız alt öncelikli yöntem/arşiv bağlamıdır.
3. M1 sweep + IFVG, M2 BTC 15M 0.382, M3 HTF POI/swing ve M4 Wyckoff ayrı tutulur. Eski CVD Momentum notu M2'nin giriş/iptal filtresi değildir; CVD tek başına PA setup yaratmaz.
4. `lib/alpha-strategy-v16.mjs` saf/nedensel denetim motorudur:
   - 1H **veya** 4H için kapanışla HH/LL ve protected HL/LH adaylarını raporlar.
   - 15M ana swing ötesi kapanış ve `abs(C-O)/(H-L) >= 0.60` kontrolü yapar. Fitil ve sıfır aralık geçersizdir.
   - Mevcut 2/2 pivot taraması yalnız **aday gözlemidir**; kullanıcının ana swing algoritması veya ilk belirgin pullback tanımı diye sunulmaz. Sağ komşu mumlar kapanmadan pivot bilinmiş sayılmaz.
   - Zaman damgalı manuel inceleme kanıtı varsa yeni HH→short / yeni LL→long varyantında fib başlangıç/bitişi, HTF ilişkisi ve pullback kilidini denetler. Diğer A/B varyantı `NEEDS_REVIEW` kalır.
   - Long/short: tam **0.382 limit**, **0.805 stop**, **2.5R TP**. Stopa ATR alt sınırı, girişe yüzde yakınlık, ek confirmation veya seans şartı eklemez.
   - Onaylanan plan için **yalnız simülasyon** yaşam döngüsü: `PENDING_LIMIT`, `OPEN_POSITION`, `CLOSED_TP`, `CLOSED_STOP`, `MISSED_TP_BEFORE_ENTRY`, `INTRABAR_SEQUENCE_UNKNOWN`.
   - Limit dolmadan TP: `CANCEL_PENDING`, gerçekleşmiş R=0, win değil.
   - Aynı OHLC mumunda sıralama/fill fiyatı çözülemiyorsa sonuç bilinmiyor; kazanç yazılmaz. Kilitleme mumuna geriye dönük fill atanmaz.
   - Yeni ekstrem: uyarı, otomatik re-anchor yok. Karşıt yapı, zaman/seans veya HTF değişimi için yeni otomatik iptal kuralı yok.
5. LLM sayısal bir M2 planı üretirse `validateCanonicalPlan` bunu motorun onaylanmış planıyla karşılaştırır; kanıtsız/yanlış seviyeleri geçirmez. Eski ATR/yüzde doğrulayıcısı başka çağıranlar için korunur; v16 akışına uygulanmaz.
6. Telegram'da “BTC hakkında fikrin nedir?” normal bir **piyasa yorumu** üretir: görüş/neden, kanıtlı seviyeler, long/short senaryoları ve strateji durumu. M2 kanıtı eksikliği genel analizi durdurmaz; yalnız kesin işlem planını engeller. Kullanıcıdan manuel etiketleme istenmez. Deterministik denetim özeti modelin iç bağlamına verilir; yalnız açıkça teknik denetim/debug isteyen kullanıcıya ayrıca gösterilir.
7. Uzun cevaplar Telegram uzunluk sınırını aşmamak için ayrı mesaj parçalarına bölünür. Webhook ve mevcut admin/knowledge/strateji komutları korunur; yeni API function açılmadı.

### Önemli sınır: neden canlıda kesin M2 sinyali çıkmayabilir?

Bu sürüm **otomatik external swing/önemli HTF zone/ilk belirgin pullback sınıflandırmasını tamamlanmış gibi yapmaz**. Bu kavramların nicel tanımı v16'da açık değildir.

Q&A, şu anda kullanıcıdan/sunucudan zaman damgalı incelenmiş anchor kanıtını alan bir UI/kalıcı veri akışına sahip değildir. Telegram varsayılanı `analysis` modudur: piyasa yorumu devam eder, ancak kesin M2 işlem planı onaylanmaz. İç motorun `NEEDS_REVIEW` durumu kullanıcıya “analiz yapamam” cevabı olarak yansıtılmaz.

Saf motorun `analyzeV16(detail, asOf, { evidence, mode })` arayüzü incelenmiş kanıtla çalışabilir; testlerde iki yön için doğrulandı. `analysis` modu da kanıtsız kesin sinyale izin vermez. Bu mühendislik önlemidir, yeni strateji filtresi değildir.

### Kısa Telegram yanıtı

Varsayılan yorum 3–4 cümle ve en fazla 90 kelimedir; tablo, model kataloğu ve iç durum kodları gösterilmez. Uzun yanıt bir kez kısalttırılır ve işlem planı güvenliği tekrar denetlenir; hâlâ uygunsuzsa canlı fiyat/1H betimsel görünümden kısa güvenli cevap döner. Detay/işlem planı açıkça istendiğinde ayrıntıya izin verilir. Saat birimleri “24 saat / 1 saat” diye açık yazılır; defter duvarları HTF supply/demand gibi sunulmaz.

### İsteğe bağlı iki senaryolu Telegram görseli

- “BTC’yi grafikle yorumla”, `/ask BTC grafikle yorumla` veya `/grafik BTC`: aynı veri snapshot'ından 15M PNG ve kısa yorum. `/chart BTC` de desteklenir. Normal sorularda görsel oluşturulmaz.
- `lib/telegram-bias-chart.mjs`: kapanmış gerçek mumlar, gözlenebilir aday pivotlar, iki koşullu yol. Çizgilerin kontrol noktaları mevcut pivot/görünür pencere ekstreminden gelir; keyfî ileri fiyat hedefi veya M2 fib/TP üretilmez.
- Kırmızı satış, yeşil alış yolu; 1H/4H betimsel eğilim uyumluysa ana/karşı etiketleri, değilse iki koşullu senaryo. Kesikli çizgi ölçülmüş olasılık değildir.
- Çemberler **beklenen** retest/teyit noktalarıdır. Görsel mevcut durumda hiçbir noktayı gerçekleşmiş M2 teyidi diye işaretlemez. Aday pivotlar kullanıcı onaylı external swing diye sunulmaz.
- Son kapalı mum, kaynak ve piyasa adı görselde bulunur. Altın için XAUT/USDT proxy etiketi korunur. Gelecek mum verisi çizilmez.
- `lib/telegram-bias-image.mjs`: ağdan font/görsel indirmeden yerel font ve Resvg ile PNG üretir. WOFF font SFNT'ye açılıp özel çalışma zamanı temp dosyasına yazılır; Resvg'nin desteklediği `fontFiles` seçeneği kullanılır. Desteklenmeyen `fontBuffers` kaldırılmıştır; sistem fontlarına güvenilmez.
- `deliverQaReply`: mevcut `sendPhoto` yardımcısıyla aynı chat/topic'e gönderir. Kısa yorum caption olur; uzun detay metni ayrı gönderilir. Başarılı kısa caption ikinci defa mesaj olarak gönderilmez.
- Veri eski/yetersizse, render veya photo gönderimi başarısızsa metin cevap korunur. Photo otomatik tekrar gönderilmez. Testlerde Telegram gönderimleri taklit edildi; production test mesajı gönderilmedi.
- Yeni API function, DB tablosu, yayın takvimi veya gerçek emir entegrasyonu yoktur.
- Görünüm 144 kapanmış mumla yaklaşık 36 saati kapsar; fiyat ekseni yuvarlak aralıklarla, üst/alt boşlukla ve yüksek kontrastlı ayrı panelde çizilir. Gözlenen pencere tepesi/dibi belirtilir. Aynı borsada varsa 1H referans pivotları kullanılır; bunlar M2 ana swing onayı değildir.
- Canlı quote ile son kapalı mum ayrı etiketlenir. Gelecek zamanlı, eski veya farklı borsadan quote çizim başlangıcına karıştırılmaz. Son yerel kırılım/geri kazanım gözlemi kapalı mumlardan çıkarılır; teyit diye sunulmaz.
- Yeşil/kırmızı beklenen teyit çemberleri fiyatlar yakın olsa da yatayda ayrılır. Metin yedeği grafiğin gerçek iki referansını ve varsa yerel olayı kullanır; genel şablon cevaba düşmez. Normal sohbet istemine işlem-plan formu eklenmez.

## 3. Ek veri bağlantıları

- Coinalyze OI/CVD ve mevcut OpenMarket orderbook okuyucuları korundu; Q&A'da orderbook tekrar okunuyor. Bağımsız kaynaklar paralel çalışır; hata diğer kaynağı veya PA'yı veto etmez.
- Kaynak, veri zamanı ve BTC spot/perp kapsamı gösterilir; BTC CVD'si ETH/altına aitmiş gibi kullanılmaz.
- İncelenen Q&A collector'ında ayrı **gerçekleşmiş likidasyon, funding ve gerçek zincir-üstü akış sağlayıcısı bulunmadı**. Bunlar varmış gibi üretilmez; mevcut değil diye raporlanır. “Onchain” sayfa adı, OI/CVD'nin zincir-üstü veri olduğu anlamına gelmez.
- OI düşüşü gerçekleşmiş likidasyon kanıtı sayılmaz; orderbook duvarları iptal edilebilir. Yardımcı verinin yokluğu/çelişkisi, geçerli M2 PA koşulunu otomatik bozmaz.
- Geçmiş teste bugünkü orderbook/OI/on-chain snapshot'ları eklenmedi.

## 4. Gerçek BTC verisinde yapılan test

Veri: **Binance BTCUSDT spot**, 1 Ocak 2025 00:00 UTC–15 Ocak 2025 00:00 UTC (bitiş hariç).

| Kontrol | Sonuç |
|---|---:|
| 15M mum | 1.344 |
| 1H mum | 336 |
| 4H mum | 84 |
| Ardışık karar anı | 1.344 |
| Gelecek suffix eklendiğinde sonuç aynı mı? | 1.344 / 1.344 |
| Betimsel pivot kırılım adayı | 315 |
| Kapanış + %60 gövde şartı uygun long adayı | 107 |
| Kapanış + %60 gövde şartı uygun short adayı | 99 |
| Betimsel protected pivot adayı | 27 |
| Doğrulanmış tam M2 işlem sinyali | **0 — manuel etiket yok** |
| Gerçek emir | **0** |
| Win rate / kârlılık | **Hesaplanmadı** |

**107/99 sayıları işlem veya geçerli external MSB sayısı değildir.** Sadece aday pivot ve mum koşullarını geçen gözlemlerdir.

Her 15M kapanışında yalnız o ana kadar kapalı mumlarla sonuç üretildi. Ayrıca tüm gelecek mumları içeren veri dizisi aynı `asOf` kesitiyle çalıştırıldı; sonuçlar birebir karşılaştırıldı. Testler fixture ile internet olmadan yeniden çalışır.

Bu çalışma **nedensellik/kural testi**, stratejinin istatistiksel performans backtesti değildir. Manuel ana swing/anchor/pullback etiketleri olmadan gerçek işlem sayısı veya kazanma oranı uydurulmadı. 14 günlük spot örneklem bütün piyasa rejimlerini temsil etmez; futures fill/spread/komisyon/slipaj testi değildir.

Dosyalar:
- `tests/fixtures/alpha-v16/btc-2025-01.json`: gerçek tarihsel OHLCV; SHA-256 `8c6d69144df77f27d78033f3f17fa03da3c078ebade5a04108af665202a30009`.
- `docs/alpha-v16-history/summary.json`: makine okunur sonuçlar.
- `docs/alpha-v16-history/charts.html`: karar anından sonrasını göstermeyen iki gerçek BTC aday grafiği. **İşlem grafiği değil**, manuel inceleme materyali.

Tekrar:
```sh
node scripts/alpha-v16-history.mjs
node --test tests/*.test.mjs
```

`--fetch` yalnız herkese açık geçmiş mumları yeniden indirir; yeniden indirmek fixture hash'ini değiştirir. Normal test internet/DB/emir erişimi kullanmaz.

## 5. Gerçek grafikte hâlâ doğrulanması gerekenler

1. 15M ana/external pivotun hangi 1H/4H protected yapı veya önemli HTF zone olayıyla ilişkili olduğu. Aynı anda iki HTF zorunlu değil; sırf yakınlık yeterli değil.
2. Protected HL/LH için seçilen önceki high/low ve son HL/LH; **tamamlanmış HTF kapanışı** ile fitil aşımının ayrımı.
3. Yeni HH→short ve yeni LL→long fib anchorları; ilk A/B varyantını ayrı tutma.
4. İlk “belirgin” pullback'in **o anda** işaretlenmesi. Sonradan görülen en iyi ekstremi geçmişe taşımama.
5. Emir dolmadan yeni ekstremde küçük devam/uzamış hareket ayrımı; sayısal eşik yok, manuel inceleme.
6. Giriş/TP/stop aynı mumdaysa 1M/tick verisiyle sıra ve gerçek fill fiyatı; spread, ücret, slipaj ve spot/futures farkı.
7. M1/M3/M4'e M2'nin 0.805/2.5R/saat varsayımlarını taşımama; bu modeller henüz bağımsız istatistiksel backtestten geçmedi.
8. Daha geniş ve farklı trend/range/volatilite dönemlerinde, sağ tarafı kapalı grafiklerle bağımsız etiketleme ve out-of-sample test.

## 6. Regresyon ve güvenlik

Tam test paketi: **846 test / 846 geçti / 0 başarısız**. `git diff --check` temiz. Ek regresyon testi sistem fontları kapalıyken başlık ve sağ fiyat eksenindeki gerçek yazı piksellerini kontrol eder; yalnız PNG dosyasının oluşması yeterli sayılmaz.

Yeni testler iki yönlü MSB/Fibonacci, HTF fitil/kapanış ayrımı, gelecek/eksik kanıt, limitten önce TP, intrabar belirsizliği, fill sonrası hedef, otomatik re-anchor olmaması, LLM plan reddi ve Telegram parçalamayı kapsar. Q&A entegrasyonu ağ/LLM taklitleriyle test edilir; gerçek servis yazımı yapılmaz.

Kaynak belge ve tarihsel fixture/grafikler `.vercelignore` ile public deploy dosyalarından dışlandı. Trading emir bağlantısı eklenmedi; mevcut Paper Trading motoru, site tasarımı, üyelik ve production verisi değiştirilmedi.
