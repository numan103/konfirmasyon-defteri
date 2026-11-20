# ALPHA BOT — STRATEJİ BİLGİ TABANI v16 (KANONİK SÜRÜM)

**Durum:** Kullanıcıyla aşamalı görüşmelerin sonunda kesinleştirilmiş kurallar. **Önce bu bölüm okunur.** Aşağıdaki v15 arşivinde farklı/eksik eski ifadeler bulunabilir; çelişkide **v16 kesinleşmiş kuralları üstündür**. Bu doküman işlemlerin istatistiksel olarak kârlı olduğunu iddia etmez. Bot **analiz yapar, emir göndermez**; canlı emir yönetimi ayrı yetkilendirme ister.

## A. Piyasa okuma felsefesi
- **Price action birincil**, order book, açık pozisyon (OI), CVD/delta, likidasyon ve on-chain veriler **yardımcı/opsiyonel**. Ek veri tek başına setup yaratamaz; veri eksikliği geçerli PA setup'ını otomatik iptal ettirmez. Çelişkili veri açıkça raporlanır.
- Önce **location ve market narrative**, sonra execution: weekly/daily/4H/1H önemli demand/supply, SR flip, korunmuş yapı, likidite kümeleri, inducement, sweep/reclaim, fiyatın tepkisi, hacimli kayıp ve continuation/reversal olasılıkları. Ardından 15M setup. Başlıca modeller: (i) BTC 15M 0.382 yapı kırılımı, (ii) likidite sweep + IFVG reversal, (iii) HTF POI / swing, (iv) Wyckoff/hacim destek analizi. **Bu modellerin kurallarını birbirine karıştırma**; 0.382'nin 2.5R hedefini diğer tüm modellere otomatik aktarma.
- BTC IFVG için hacimli dönemler ve özellikle New York seansı bağlamı değerlidir. Saat 16:30–17:00 Türkiye saati örnek, sabit filtre değildir; ABD yaz/kış saati farkı göz önünde tutulur.
- Her analizde long/bearish alternatifleri, invalidation, hangi oyuncuların olası stop/likidasyonu, karşıt kanıtlar, no-trade gerekçesi belirtilir. OI düşüşünü tek başına likidasyonun ispatı gibi sunma. Order book emirleri iptal edilebilir. Video ortak konuşmacısının görüşlerini Ahmet'in kesin kuralları olarak atfetme.

## B. BTC 15M 0.382 — kesinleşmiş işlem kuralları

| Başlık | Kesin kural |
|---|---|
| İşlem yönü | Long ve short (ayna simetriği) |
| Ana swing | 15M pivotu **1H veya 4H** protected HL/LH yapısıyla ilişkili **veya** önemli HTF supply/demand etkileşimiyle ilişkili olmalı. Her iki HTF birden zorunlu değil. |
| HTF demand/supply etkileşimi | **Temas, likidite süpürme, reclaim veya güçlü reaksiyondan herhangi biri** yeterli. Sırf yakınlık yeterli değil; olayın seviyesi ve zamanı gösterilir. |
| HTF protected HL/LH | Bullish: yeni HH yaptıran son HL. Bearish: yeni LL yaptıran son LH. |
| **Yeni HTF HH/LL teyidi (v16)** | **İlgili 1H veya 4H mumun önceki high/low'un ötesinde KAPANMASI gerekir.** Yalnız fitille aşılması protected structure güncellemesi için yeterli değildir. Tamamlanmamış HTF mumu onay sayılmaz. |
| 15M MSB | Ana swing ötesinde **15M kapanışı** gerekir ve kıran mumda **gövde/aralık ≥ 0.60** olmalı. Fitil tek başına geçersiz. Mum aralığı sıfırsa geçersiz. |
| Displacement oranı | `abs(close - open) / (high - low) >= 0.60`; ek ATR/FVG/on-chain teyidi zorunlu değil. |
| Fibonacci | Kullanıcının örneğine göre, kırılımı oluşturan yapı/impuls referansı seçilir. **Yeni HH yapılıp A'nın sağındaki korunmuş dip kırılırsa bearish fib yeni HH → kırılım sonrası oluşmuş swing low**. Long senaryosu simetrik: yeni LL → kırılım sonrası swing high. Kullanıcının diğer özel A/B varyasyonlarında daha eski açıklama korunur; şematik A/B her zaman tek otomatik anchor varsayımı değildir. |
| Fib bitişi | Kırılım sonrası **ilk belirgin geri çekilme başladığında** ekstrem swing low/high sabitlenir; bir mum sayısı / ATR eşiği henüz tanımlanmamıştır. |
| Entry | Fib **0.382**, doğrudan **limit**. Ek mum confirmation şart değil. |
| Stop | Fib **0.805**. |
| TP | **Sabit 2.5R**. `risk=abs(entry-stop)`; long `TP=entry+2.5*risk`, short `TP=entry-2.5*risk`. |
| Bekleyen emir | **Emir dolmadan fiyat hesaplanan TP'ye ulaşırsa limit iptal** edilir ve kazanç yazılmaz. Karşıt MSB/HTF bölge kaybını kendiliğinden otomatik iptal kuralına çevirmeyin. |
| Yeni ekstrem ama emir dolmadı | Kullanıcı **görsel fiyat davranışına** göre küçük harekette fib güncellemeyi değerlendirebilir. Büyük kaçan hareketi kovalamaz. Sabit ATR, yüzde veya mum sayısı eşiği UYDURMA. Belirsizse analiz/manuel kontrol iste. |
| Ek veriler | OI, likidasyon, order book, funding, CVD, on-chain yalnızca bağlamı güçlendirir/zayıflatır. |

### İşlem hesap mantığı (örnek değil, genel)
1. Yalnız tamamlanmış 1H/4H mumlarla **HTF yeni HH/LL kapanışını** doğrula, yeni yapıyı oluşturan son HL/LH'yi protected olarak işaretle.
2. 15M pivotunun HTF protected pivot veya önemli supply/demand bölgesiyle **kanıtlanabilir** ilişkisini göster; sadece internal kırılımları ele.
3. 15M'de swing ötesinde mum kapanışı VE %60 gövde oranı koşullarını kontrol et.
4. Fib uçlarını seçerken hangi pivotların kullanıldığını **timestamp + fiyatla** açıkla. Anchor çok anlamlı ise tek seviye uydurma; senaryoları ayrı göster.
5. İlk belirgin pullback sonrası ekstremi sabitle; fib 0.382 limit, 0.805 stop, 2.5R TP hesapla.
6. Fiyat emre değmeden TP'ye giderse `MISSED_TP_BEFORE_ENTRY` ve `CANCEL_PENDING`. Önce entry olduysa artık bu kuralı 'bekleyen emir iptali' olarak uygulama. OHLC'de aynı mum içinde önce giriş mi TP mi gerçekleştiği bilinmiyorsa kesin doldurulmuş gibi yazma.
7. Her yeni ekstremde otomatik fib yeniden hesaplama yapma. 'Görsel küçük değişim' kararı sayısal olarak tanımlı değil: bot öneri çıkarır, otomatik emir değişikliği yapmaz.

### Kesinleştirilmemiş uygulama ayrıntıları — soru yağmuru yerine güvenli davranış
- 1H/4H pivot yakınlığı, önemli demand/supply bölgesi nicel kriteri, ilk 'belirgin' pullback için ölçüt ve kullanıcı anlatımındaki bazı A/B anchor varyasyonları **henüz objektif kodlanmış değil**. Kullanıcı kararı verilmemiş bir eşik sanki kesin kuralmış gibi kullanılmaz.
- Bot **iki modla** çalışabilir: `strict_signal` = kanıtlanamayan pivot/anchor için `NEEDS_REVIEW`, emir veya kesin sinyal yok; `analysis` = alternatif swing ve fiyat seviyelerini açıklayan yorum. Bu çalışma modu önerilen mühendislik önlemidir, kullanıcı tarafından 'strateji filtresi' diye onaylanmış ek kural değildir.
- Pozisyon dolduktan sonraki partial, BE, trailing gibi kurallar **0.382 modelinin kesin kuralı değil**. Diğer videodaki konuşmacının önerilerini aynen benimseme.
- Varsayılan çıktı: HTF bias, protected pivot fiyatı/zamanı, PA gerekçesi, MSB mumu + gövde oranı, Fib anchor fiyatları, entry/stop/2.5R TP, likidite hedefleri, ek veri destek/çelişki, belirsizlikler, durum (`NO_TRADE`, `WATCH`, `PENDING_LIMIT`, `MISSED_TP_BEFORE_ENTRY`, `NEEDS_REVIEW`).

## C. OpenCode / Alpha Bot için kopyalanabilir tek talimat

```text
ALPHA BOT KANONİK STRATEJİ TALİMATI — v16
Bu belgenin A ve B bölümleri kesinleşmiş kullanıcı strateji kurallarıdır. Çelişkili eski v1–v15 notlarının üstündedir. Önce price action location ve narrative oluştur; order book/OI/likidasyon/on-chain yardımcıdır. BTC 15M 0.382 modeli long ve short simetriktir. 1H veya 4H'de önceki HH/LL ötesinde tamamlanmış HTF MUM KAPANIŞI arayarak protected HL/LH belirle: yeni HH oluşturan son HL veya yeni LL oluşturan son LH. 15M ana swing bu yapıyla ya da HTF supply/demand'daki temas/sweep/reclaim/güçlü reaksiyonla ilişkili olmalıdır. 15M MSB için ana swing ötesinde kapanış ve |C-O|/(H-L) >= 0.60 gerekir. Kırılım impulsu için doğru fib başlangıcı ve ilk belirgin geri çekilmede sabitlenen ekstremi göster; 0.382 LIMIT, 0.805 STOP, 2.5R TP. Bekleyen emir dolmadan TP'ye gelirse emri iptal et; fill ve TP sırasından emin değilsen kazanç yazma. Fiyatın az/çok uzaklaşması yalnız görsel değerlendirmedir: sabit eşik uydurma, otomatik emir güncelleme. Eksik tanımlı pivot ve anchor'da NEEDS_REVIEW. Diğer konuşmacının fikirlerini kullanıcıya atfetme. Kullanıcıdan yeni yeni soru istemek yerine tamamlanmış analizi ve belirsizlikleri göster. Emir gönderme.
```

---

## D. ARŞİV — v15 ve öncesi ayrıntılı transkript çözümlemeleri

**Uyarı:** Alttaki sürüm notları geçmiş aşamaların kayıtlarıdır. 'UNRESOLVED' diyen eski bir satırın v16'da çözümlenmiş hâlini iptal etmesine izin verme. Çelişkide yukarıdaki kanonik bölüm geçerlidir.

> **GÜNCELLİK UYARISI (v14 — en yüksek öncelik):** BTC 15M ana swing için 1H **veya** 4H üzerinde korunmuş HL/LH yahut önemli supply/demand ilişkisi yeterlidir. Supply/demand ilişkisi, **bölgeye temas, bölgedeki likiditenin avlanması, bölgenin geri kazanılması veya bölgeden güçlü reaksiyon** yollarından *herhangi biriyle* gerekçelendirilebilir. Pivotun kutu içinde doğması şart değildir. Kesin uzaklık yüzdesi/ATR toleransı kullanıcı tarafından onaylanmamıştır; yalnız 'yakın' diye belgesiz eşleşme uydurulmaz. v13'ün açık bıraktığı HTF bölge–pivot ilişki tanımında v14 önceliklidir.

> **GÜNCELLİK UYARISI (v10 — en yüksek öncelik):** Kullanıcının BTC 15M 0.382 modelinde **ana/external swing seçimi, 1H/4H ile uyumlu pivotlara dayanır.** 15M'deki her internal/local pivot MSB tetiklemez. v9 ve daha eski bölümlerde geçen `external_swing_pivot_detection: UNRESOLVED` notları, *seçim prensibi* açısından geçersizdir; ancak **1H/4H uyumunun mekanik tanımı** hâlâ çözülmemiştir. v10'da güçlü displacement'ın sayısal/objektif tanımı da henüz onaylanmamıştır.

> **GÜNCELLİK UYARISI (v9 — en yüksek öncelik):** BTC 15M 0.382 modelinin sabit TP katsayısı kullanıcı tarafından **2.5R** olarak kesinleştirildi. v8 ve daha eski kısımlardaki `USER_INPUT_REQUIRED`, `UNRESOLVED` veya 'henüz belirtilmedi' RR ifadeleri yalnızca tarihsel nottur. Hesaplama ve bekleyen limit emrin TP'ye ulaşmasıyla iptali için **v9 kuralları uygulanır**.

> **GÜNCELLİK UYARISI (v8):** Belgenin en altındaki **v8 kullanıcı onaylı sabit RR ve TP’ye bağlı emir iptali** kuralları, önceki bölümlerde geçen `take_profit: UNRESOLVED`, emir geçerliliği ve eski emir iptal varsayımlarından üstündür. Sabit RR katsayısı henüz belirtilmediğinden sayısal değer uydurulmaz.

> **GÜNCELLİK UYARISI (v7):** Bu belgenin sonundaki **v7 kullanıcı onaylı emir güncelleme kuralı**, önceki sürümlerin `new_extreme_before_fill: UNRESOLVED` notlarının üstündedir. Önceki sürümler tarihsel kayıt olarak saklanır.

> **ÖNCEKİ v6 NOTU:** Bu belgenin aşağıdaki **v6 bağlayıcı kuralları**, eski v1–v5 değişiklik günlüklerinde yer alan çelişkili veya `UNRESOLVED` ifadelerden üstündür. Özellikle Fibonacci anchor seçimi, yeni ekstrem teyidi ve eski “fiyat kırılımın hemen ardından LL yapınca” varsayımı v6 ile düzeltildi.

# ALPHA BOT — Ahmet'in Piyasa Okuma ve Strateji Bilgi Tabanı (v15)

**Veri seti:** `transkriptler.zip` içindeki 11 video transkripti. `SIFIRDAN TRADINGE BAŞLASAYDIK - STRATEJİ KURMA 5.txt` ayrıca aynı videonun kopyasıdır, bağımsız bir 12. kaynak değildir.

**ÖNEMLİ:** Bu doküman, videolardan çıkarılmış kullanıcının anlatımını yapılandırır. Backtest ile ispatlanmış kârlılık iddiası değildir. Video otomatik altyazıları eksik/hatalı olabilir. Grafikleri görmeden swing ve Fibonacci anchor'ları kesin algoritmaya çevrilemez. Strateji kurma videosunda ikinci bir konuşmacı vardır; karşı tarafın fikirleri otomatik olarak Ahmet'in zorunlu kuralı sayılamaz.

## 1. Üst düzey işlem düşüncesi

- **Location > execution.** Önce haftalık/günlük/4H bağlam, sonrasında 15m tetik ve emir; 5m gerektiğinde hassaslaştırma.
- **Fiyatın hikâyesi:** Hangi pivot/likidite avlandı, hangi yapı korundu veya kaybedildi, hangi aktör tuzağa düşürüldü, fiyatın açık hedefleri nerede?
- **Yapı:** HH/HL ve LH/LL; internal ile external structure ayrımı; güçlü dip/tepe; impulsun ardından korunması gereken düzeltme bölgesi.
- **Likidite:** Swing high/low, eşit tepeler/dipler, seans yapıları, önceki fitil/stop kümeleri; wick sweep + bölgeye geri kapanış ile gerçek kabul/kırılımı birbirinden ayır.
- **Manipülasyon:** Sadece fitil değil; yanlış yönde ikna, fake BOS, breaker/FVG trap, inducement ve hareketin ardından hızlı geri dönüş gibi mekanizmalar. Kimlerin neden stop olacağı veya yanlış tarafa gireceği anlatılmalı.
- **HTF POI:** SR flip, supply/demand, order block, FVG, breaker, BPR, hacim profili ve değer alanları. Bunlar otomatik giriş değil, reaksiyon izlenecek konumlardır.
- **Önce iki senaryo:** HTF bullish ise bile bearish invalidation belirle; HTF bearish ise de bullish reclaim senaryosu hazırla. Tek bir tahmini kesinmiş gibi sunma.

## 2. Analiz akışı

1. **Weekly/Daily:** Önemli high/low, premium/discount (0.5), ATH/ATL, günlük mum yapısı, açık likiditeler ve yönsel olasılıklar.
2. **4H/1H:** Korunması gereken HL/LH, belirgin POI, SR flip, FVG/OB, hareketin devam mı yoksa re-accumulation/distribution mı olduğuna ilişkin kanıtlar.
3. **15m:** Sweep / IFVG'nin kazanılması-kaybedilmesi / internal BOS-CHOCH / retest. Seans filtresi uygulama. Çoğunlukla New York likiditesi ve ~16:30–17:30 Türkiye saatine denk gelen örnekler vurgulanıyor; gün ışığı tasarrufu ve pariteye göre yerel seans zamanları değişebilir.
4. **5m:** Yalnızca anlamlı HTF bağlam içinde giriş hassaslaştırması; tek başına rastgele sinyal üretme.
5. **Risk ve hedef:** Stop, önce süpürülmemiş ve mantıklı invalidation ötesinde; hedef yakın SR/FVG veya karşı taraftaki likidite, flow uyumuna göre seçilir. İşlem başlamadan RR ve iptal gerekçesi yazılır.

## 3. Model katalogu

### M1 — Likidite süpürme + reversal + IFVG
- **Context:** HTF konum anlamlı; sweep'in hedefi belirgin. Özellikle 15m'de seans hareketine bakılır.
- **Gözlem:** Fiyat belirgin swing likiditesini fitille alır, seviyenin içine geri döner; IFVG geçersizleşir / karşı tarafa kazanılır, market yapısı değişimi görülür.
- **Entry:** Oluşan FVG/IFVG veya kırılım bölgesi retestinde limit; chase etme.
- **Stop:** Süpürülen ekstrem ve potansiyel ikinci fitil ötesi; tek mum fitilinin üstüne/altına mekanik yapıştırma.
- **Target:** Karşı likidite veya ilk önemli seviyeler; trend karşıtıysa ilk anlamlı SR/FVG'yi öncele.
- **İptal:** Gerçek kırılım ve yeni bölgede kabul, HTF ile sert çatışma, risk/ödül bozuk, kritik hedef temizlenmiş.
- **Kaynak:** Strateji Kurma 5 ~[03:19], [14:18], [18:49], [27:05]; Likidite ve Manipülasyon ~[01:06], [12:55].

### M2 — BTC 15M çift yönlü 0.382 yapı kırılımı + limit emir modeli (KULLANICI TARAFINDAN DOĞRULANDI)

**Doğrulanmış, bağlayıcı kurallar (14 Kasım 2026; çift yönlü güncelleme):**
- **Çalışma grafiği:** BTC, 15 dakika.
- **Bearish senaryo:** Önce market yapısında geçerli bearish kırılımı belirle. Fibonacci'nin **1.0 / başlangıç referansı, bu yapı kırılımını başlatan swing high**; **0.0 / bitiş referansı, kırılımdan sonra oluşan LL** olmalıdır. Fiyatın yönlü hareketinin 0.382 geri çekilmesi işlem giriş seviyesidir.
- **Bullish senaryo (kullanıcı teyidi):** Aynı mantığın long versiyonu uygulanır: geçerli bullish yapı kırılımını başlatan **swing low → kırılımdan sonra oluşan HH** impulsunu ölç. 0.382 geri çekilmeye **limit buy**, 0.805 seviyesine stop (long girişinin altında). Bu yön de kullanıcının kendi modelidir.
- **Emir:** Fiyat 0.382'ye geri dönerse **doğrudan limit emir**; girişte ayrıca IFVG, yeni mum veya LTF confirmation zorunlu değildir. 0.382'yi 0.5 ya da 0.618 ile otomatik değiştirme.
- **Stop:** Aynı Fibonacci hareketinin **0.805 seviyesi** (kullanıcının önceki açık beyanı). Stop emri emir yönüne uygun tarafta olmalı. Potansiyel order tipi, ücret ve slipaj ayrıca hesaplanır.
- **Hedef:** Çevredeki fiyat/likidite yapısı ve gerçekçi RR ile seçilir; sabit TP henüz kullanıcının bu model için kesin doğruladığı kural değildir.
- **Geçersiz:** Ortada geçerli structure break veya güvenle seçilmiş anchor high/LL yoksa **M2 sinyali üretme**. 0.382 çizgisinin her dokunuşu giriş değildir.
- **Önemli:** Long ve short simetrisi kullanıcı tarafından açıkça teyit edilmiştir; her iki yönde de stop 0.805, giriş 0.382 ve doğrudan limit emirdir.

**KULLANICI TARAFINDAN DOĞRULANMIŞ MSB KURALI (14 Kasım 2026):** BTC 15M 0.382 (M2) modelinde geçerli market structure break için **15 dakika mumunun ana swing seviyesinin ötesinde kapanması VE güçlü displacement** gerekir. **Yalnızca ana/external swing yapısı geçerlidir**; internal/micro pivot kırılımları M2'yi tek başına tetiklemez. Bearish MSB = ana swing low altında 15m kapanış + güçlü bearish displacement; bullish MSB = ana swing high üzerinde 15m kapanış + güçlü bullish displacement. Sadece fitil kırılımı geçersizdir. Bu zorunlu MSB onayı, 0.382 seviyesinde ayrıca giriş confirmation gerektirmez: MSB sonrası emir doğrudan limittir.

**Henüz algoritmik olarak çözülmeyen kritik belirsizlik:** 'Ana/external swing' pivotları nasıl tespit ediliyor ve **'kırılımı başlatan swing high/low' hangi pivot**? Özellikle birden fazla external pivot veya konsolidasyon varsa hangi high/low fib başlangıcı seçilir? 'Güçlü displacement'ın objektif ölçüsü (ör. mum gövdesi/ATR, kapanış konumu, ardışık mumlar) ve **yeni LL/HH'nin ne zaman kesinleşeceği** de henüz net değildir. Bunları keyfî sabitlerle doldurmayın; tanımı isteyin. **Öncelikli sıradaki soru: Fibonacci başlangıç anchor'ını seçme kuralı.**

**Destekleyici video bağlamı:** BTC-GOLD Haftalık İşlemler ~[02:15] strateji dışı hatalı örnek; Sıfırdan 6 ~[04:00], [18:37]; Kayıplarınızdan Öğrenmek 7 ~[16:47], [18:28]. **Swing anchor, limit emir ve 0.805 stop kararı bu konuşmada kullanıcının doğrudan teyidinden gelir; videoların birebir alıntısı diye sunulmaz.**

### M3 — HTF POI'den pozisyon / swing
- **Context:** Weekly/Daily/4H SR flip, supply/demand, breaker, FVG, değer alanı veya anlamlı dağıtım/birikim yapısı.
- **Trigger:** HTF zone'a geliş, LTF'de savunma/reclaim veya yapısal kırılım; bazen HTF limit seçiliyor.
- **Stop:** Sırf LTF'deki ufak high/low değil, HTF fikrin geçersizleştiği seviyenin ötesi.
- **Target:** HTF likidite/POI, daha uzun pozisyon taşınabilirse taşıma gerekçesi; bu modeli intraday ile karıştırma.
- **Kaynak:** Kayıplarınızdan Öğrenmek 7 ~[03:53]–[09:28]; Sıfırdan 6 ~[00:34]–[04:00]; Price Action ~[17:25]–[21:52].

### M4 — Wyckoff birikim/dağıtım + hacim doğrulaması
- **Context:** Range, manipülasyon, reclaim/loss ve testler; bazen yükselen/azalan yapı içindeki yeniden birikim/dağıtım.
- **Onay:** Salt şematik spring/UTAD görüntüsü değil; fiyatın kapanışları, hacim, POC/değer alanı, yeni high/low yapamama birlikte okunur.
- **Entry:** Spring/UTAD sonrası teyit ve retest; veya yapısal değişim + anlamlı zone.
- **Not:** Videoda otomatik, sürekli kullanılan bir mekanik girişten çok konum ve senaryo okuması olarak da kullanılıyor.
- **Kaynak:** Hacim ve Wyckoff ~[17:11]–[29:32]; Strateji Kurma 5 ~[08:52]–[09:57].

## 4. Hacim ve türev veri kullanımı — yardımcı filtre, bağımsız emir değil
- **Fixed Range Volume Profile:** POC, VAH, VAL, düşük hacimli boşluklar, kabul/kaybetme; boşluklarda hızlı hareket ihtimalini gözle.
- **OI:** Aşırı konumlanma ve squeeze/kaldıraç riski için bağlam; **yüksek OI kesin düşüş değildir.** Videonun bu yöndeki kestirmesi şartlı hipotez olarak kullanılmalı.
- **Spot CVD vs futures/general CVD:** Spot satışla desteklenmeyen vadeli yükseliş veya tersine diverjanslar; tek başına kesin dönüş garantisi değil.
- **Market Delta/Orderbook:** Agresif alıcı-satıcı, absorbsiyon ve görünür likidite; emir defteri spoofing/iptal nedeniyle yanıltabilir.
- **Kaynak:** Hacim Verileri (OI, Spot CVD...) ~[00:33]–[10:43], [15:10]–[23:27]; Hacim Profili ve Wyckoff ~[00:35], [15:28]–[17:11].

## 4A. Çoklu veri doğrulama katmanı (14 Kasım 2026 kullanıcı ilavesi)

**Yetki / rol ayrımı:** Botun hâlihazırda okuyabildiği on-chain ve türev veri kaynaklarını kullan; yeni veri uydurma. Bu veriler PRICE ACTION ile tanımlanmış setup'ın kalitesini yükseltmek, çelişkileri saptamak ve hipotezleri test etmek için **yardımcı kanıttır**; hiçbir tekil metrik tek başına pozisyon açtırmaz. Teknisyen gibi sadece checklist doldurma: veri-hipotez-senaryo bağlantısını gerekçelendir.

**Öncelik:** (1) HTF location ve ana yön, (2) belirgin likidite/market structure olayı, (3) modele özel trigger ve entry, (4) piyasa mikro yapısı ve zincir üstü teyit/çelişki, (5) gerçekçi stop/TP/risk. Bir pozitif on-chain göstergesi eksik BOS'u telafi etmez; bir çelişkiyi de gizleme.

| Kaynak | Pozitif/negatif delilin yorumu | Kritik sınırlama |
|---|---|---|
| Order book / depth | Büyük bid/ask duvarlarının yakınlığı, kalıcılığı, gerçek gerçekleşme/absorpsiyon izleri | Sahte/iptal edilebilen emirler; tek anlık görüntü kırılma garantisi değildir |
| OI | Fiyat + OI birlikte yükseliyor/düşüyor mu; pozisyon ekleme vs. azaltma olasılıkları | Long ve short toplam açık kontrat sayısıdır; tek başına yön vermez |
| Likidasyon akışı | Sweep sırasında gerçekten forced close gözlenmiş mi; hangi yönde ve hangi büyüklükte | Heatmap'in tahmini tasfiye kümeleri GERÇEKLEŞMİŞ likidasyon değildir |
| CVD / delta | Agresif alıcı/satıcı akışı fiyatla uyumlu mu; absorption/divergence var mı | Borsa ve spot/perp kapsamına duyarlı; uyuşmazlık kesin dönüş değildir |
| Funding / basis | Tek yönlü kaldıraç birikimi ve squeeze ihtimali | Ekstremler sürekli kalabilir; doğrudan ters işlem sinyali değil |
| On-chain | Borsa cüzdan akışları, büyük transferler, arz/kullanım bağlamı | Cüzdan etiketleri hatalı olabilir; zincir üstü metrikler intraday 15m tetik için çoğu zaman gecikmeli veya dolaylıdır |

**Çıktı kuralı:** Her setup için (i) price action dayanağı, (ii) türev/orderbook teyitleri, (iii) on-chain teyitleri, (iv) çelişkili kanıtlar, (v) veri tazeliği ve kaynak/borsa bilgisi, (vi) kesin değilse 'gözlem/hipotez' etiketi göster. Eksik veri 'olumlu' sayılmamalı, yalnızca 'mevcut değil' yazılmalı. Likidasyon "oldu" demek için gerçekleşen işlem/veri gerekir; yoksa "tahmini likidasyon bölgesi" denir. 

**KULLANICI TARAFINDAN KESİNLEŞTİRİLDİ — Price Action First:** Order book, OI, gerçekleşmiş likidasyon, CVD/funding ve on-chain metrikler **destekleyici ve zorunlu olmayan** kanıttır. Bu veri kaynaklarının yokluğu veya teyit etmemesi, price action kuralları tam olan bir setup'ı **otomatik olarak geçersiz kılmaz**. Çelişen veri ayrıca görünür şekilde işaretlenir; senaryoya duyulan güveni düşürebilir ve risk değerlendirmesini etkileyebilir, fakat tek başına sabit veto kuralı değildir. Bot, bu verileri fiyat sinyalinin yerine koymaz, sinyal yaratmak için kullanmaz. 'PA geçerli + ek veri yok' → 'PA modeli geçerli, ek teyit yok'; 'PA geçerli + veri çelişkili' → 'PA modeli geçerli, ek verilerde çelişki var'; 'PA geçersiz + veri olumlu' → 'işlem modeli geçersiz'. Eksik veriyi sıfır/negatif skor olarak işleme. Botun otomatik emir gönderme yetkisi bu belgeyle verilmiş değildir.

## 5. Karar filtresi / NO TRADE

| Kontrol | Geçerli yorum |
|---|---|
| HTF location | Anlamlı POI veya açık likidite hedefine mesafe var mı? |
| Structure | Market yönü, internal/external kırılım, korunacak pivot ne? |
| Liquidity | Kim avlandı; hangi hedef halen açık? |
| Model | M1, M2, M3 veya M4 açıkça tarif ediliyor mu? |
| Confirmation | Modele uygun kapanış / sweep / IFVG / retest mevcut mu? |
| Session | Likiditenin aktif olduğu saat mi? Gece/hafta sonu örneklerinde temkinli. |
| Stop | Fikir nereye gelirse yanlış olur? Stop orada mı, tampon var mı? |
| RR | Gerçekçi ilk hedef stop mesafesine göre mantıklı mı? |
| Risk | Günlük/haftalık sınırlar ve aynı bölgede tekrar giriş aşılmıyor mu? |
| Alternatives | Bear ve bull senaryoları ve iptal koşulları yazıldı mı? |

**NO TRADE:** Mekanik fib'e uygun swing yoksa; sweep gerçekleşmiş fakat güçlü kabul aksini gösteriyorsa; hedef zaten temizlenmişse; salt gösterişli mum varsa ama location zayıfsa; fiyat beklenen momentum yerine zayıflıyorsa; yeniden işlem alma sadece telafi isteğinden kaynaklanıyorsa.

## 6. İşlem yönetimi (kesin ve kişisel kuralları karıştırma)

- Videolar **dinamik çıkış**, yeni high/low yapamama ve zone kaybıyla erken kapanış ihtimalini anlatıyor. Ancak bazı öneriler konuk tarafından ifade ediliyor; otomatik kural olarak kabul edilmemeli.
- Bazı videolarda break-even (entry stop) kullanılıyor; güncel olarak Ahmet'in sabit BE kullanmama tercihi olabilir. **Güncel kullanıcı kuralı videodan üstündür.**
- Videolarda risk örnekleri 0.5R ve 1R arasında değişir. Güncel risk parametreleri dışarıdan ayrı bir konfigürasyonla verilmeli ve hiçbir video örneği bunları override etmemeli.
- Aynı bölgede ikinci girişe mesafeli yaklaşım, günlük az işlem, haftalık zarar limitine gelince durma videolarda tekrar eder.
- Backtestteki sonucu canlı istatistik sanma; bir videoda TP olmuş işlem valide setup olmayabilir.

## 7. Alpha Bot nasıl konuşmalı?

Çıktı biçimi:

1. **HTF fotoğrafı:** bullish/bearish/range + sebep + korunması gereken seviye.
2. **Likidite haritası:** üst/alt hedefler, hangileri süpürüldü?
3. **İki senaryo:** bullish ve bearish tetik, iptal koşulu.
4. **Setup değerlendirmesi:** M1/M2/M3/M4, eksik teyitler, 15m/5m execution.
5. **Risk planı:** stop mantığı, ilk ve nihai hedef, beklenen RR, risk limiti, işlem yapılmama gerekçesi.
6. **Hüküm:** `TRADE ADAYI / İZLE / NO TRADE`; kesinlik dili kullanma.
7. **Kanıt:** Hangi video ve timestamp bu düşünceyi destekliyor? Bir kuralı desteklemeyen kaynakları kural olarak sunma.

Bot **asla** sadece "IFVG oluştu → short" veya "0.382 var → long" yapmamalı. "Neredeyiz, hangi likidite, hangi structure, hangi model, invalidation nerede?" sorularını yanıtlamalı.

## 8. Transkriptlerden öğrenmede veri hijyeni

- Her pasajı `speaker=Ahmet | konuk | belirsiz` olarak etiketle. Özellikle 'Strateji Kurma 5' ikili konuşma.
- `type=normatif kural | canlı düşünce | varsayımsal senaryo | hata itirafı | sonuç sonrası yorum | konuk görüşü` olarak sınıflandır.
- `confidence=explicit | inferred | ambiguous` sakla. Ekran görüntüsü olmadan çizim referanslarını kesin fiyat/tetik gibi kodlama.
- Hata itirafını **anti-rule**'a çevir: 0.382 için swing yokken işlem almak gibi.
- Güncel yazılı risk/BE/timeframe kararı ve canlı işlem günlüğü, eski YouTube örnekleri ile çelişirse ayrı sürümle yönet.
- Her sinyalde alıntılanabilir video + timestamp tut; RAG yalnızca metin getirmesin, kuralları ve speaker/sınıf etiketini de getirsin.

## 9. Netleştirilmesi gereken açık noktalar

1. **EN KRİTİK:** MSB için **ana/external swing + 15m kapanış + güçlü displacement** artık onaylandı. Açık kalan konu: Fibonacci başlangıç anchor’ı olarak kırılımı başlatan *hangi* external swing high/low seçiliyor? Ayrıca external pivot tespit algoritması, displacement gücünün nicel eşiği ve yeni LL/HH kesinleşmesi belirsiz.
2. IFVG geçerliliği için minimum displacement, mum kapanışı ve HTF sınırı.
3. İç yapı kırılımı için wick mi body mi, hangi zaman diliminde, ne kadar penetrasyon?
4. Karşıt flow trade'e izin veren özel şartlar.
5. BE/partial/pozisyon yönetiminde geçerli güncel kişisel kurallar.
6. Güncel işlem seansı, haber filtresi, ürün bazlı özel istisnalar.
7. Somut başarının gerçek örneklem testi; videolardan edge/WR tahmini çıkmaz.

## 10. OpenCode / Alpha Bot sistem talimatı önerisi

> Sen Alpha Bot'sun. Ahmet'in piyasa okuma yöntemini ezber kalıplar olarak değil hiyerarşik karar süreci olarak uygula: önce konum ve HTF structure, sonra likidite ve piyasa katılımcılarının olası tuzağı, sonra yalnızca tanımlı M1/M2/M3/M4 setup, en son giriş/stop/hedef/risk. Eksik teyitte NO TRADE de. İki yönlü senaryo üret. Sahip olmadığın grafik, canlı OI/CVD veya mum verisini varmış gibi gösterme. Video pasajlarında Ahmet ile konuğu ayır. Geçmiş hata örneklerinden meşrulaştırma üretme. Güncel yazılı trading kuralları eski video yorumlarından önceliklidir. Çıktıda gerekçe, çürütücü gözlem, invalidation ve kanıtlı kaynak timestamp'i belirt. Hiçbir sinyalin kârlılığını garanti etme.

## 11. Güncelleme kaydı — 2026-11-14 (v2)

- Kullanıcı **M2 için BTC 15M bearish anchor = yapı kırılımını başlatan swing high → LL** kararını doğruladı.
- Kullanıcı **0.382'de doğrudan limit emir** kararını doğruladı; ek mikro-konfirmasyon dayatma.
- Daha önce belirttiği **0.805 stop** kuralı korundu.
- Sıradaki netleştirme: **15M yapı kırılımı ne zaman geçerli olur ve kırılımı başlatan high nasıl seçilir?**


## v3 değişiklik kaydı
- Kullanıcı 0.382 modelinin **long ve short** tarafında simetrik olduğunu açıkça teyit etti.
- Emir türü **doğrudan 0.382 limit**, stop aynı impulsun **0.805** seviyesi; fib çapaları yapı kırılımını başlatan pivot ile oluşan yeni ekstrem.
- Order book, OI, gerçekleşen likidasyon, CVD, funding ve on-chain kaynakları bağlamsal teyit/çelişki değerlendirmesine dahil edildi.
- **Bir sonraki kritik belirsizlik:** Piyasa yapısı kırılımında hangi HL/LH'nin esas alındığı ve 15M kapanış/fitil koşulu. Türev/on-chain veri rolü v4 ile çözüldü: zorunlu veto değil, destekleyici kanıt.


## v4 değişiklik kaydı — 2026-11-14
- **Kesin kullanıcı kuralı:** `PRICE_ACTION_FIRST = true`; `DERIVATIVES_ONCHAIN_CONFIRMATION_REQUIRED = false`.
- **Ek verinin statüsü:** `supportive_only`; olumlu/olumsuz/eksik ayrı sınıflandırılır; tek başına setup validasyonunu değiştirmez.
- **Kural önceliği:** Kullanıcının bu konuşmada belirlediği kurallar eski videolardan türetilmiş önerilerden önceliklidir.
- **Bir sonraki netleştirme:** BTC 15M için market structure break (MSB) hangi swing HL/LH seviyesinin hangi tür kırılımıyla oluşur? Wick teması mı, 15m mum gövdesi kapanışı mı, kapanış + displacement mı? Internal/external swing ayrımı ve pivot seçimi halen belirlenmedi.

### OpenCode için doğrudan makine-okunur kural parçası
```yaml
alpha_bot:
  decision_priority:
    - price_action_location_and_structure
    - setup_specific_trigger_and_fib_entry
    - supplementary_market_data
    - risk_and_targets
  supplemental_data:
    types: [order_book, open_interest, realized_liquidations, cvd, funding, on_chain]
    required_for_setup_validity: false
    missing_data_veto: false
    positive_data_can_replace_missing_price_action: false
    conflicting_data: report_and_contextualize
    do_not_invent: true
  btc_15m_0382:
    directions: [long, short]
    fibonacci_anchor_short: structure_break_initiating_swing_high_to_new_LL
    fibonacci_anchor_long: structure_break_initiating_swing_low_to_new_HH
    entry: 0.382_retracement_limit
    stop: 0.805_retracement
    msb_rule:
      timeframe: 15m
      required_structure: external_main_swing_only
      require_candle_close_beyond_external_level: true
      require_strong_displacement: true
      wick_only_break_valid: false
      bearish_break_level: confirmed_external_swing_low
      bullish_break_level: confirmed_external_swing_high
      displacement_strength_threshold: UNRESOLVED_ASK_USER
    swing_selection_rule:
      structure: external_main_swing_only
      fibonacci_start_anchor_which_external_pivot: UNRESOLVED_ASK_USER
      external_pivot_detection_algorithm: UNRESOLVED_ASK_USER
      new_LL_HH_confirmation: UNRESOLVED_ASK_USER
    take_profit_rule: UNRESOLVED_ASK_USER
    auto_trade_permission: false
```


## v5 değişiklik kaydı — 2026-11-14

**Kullanıcının açık, bağlayıcı teyidi:**
1. BTC 15M'de M2 için geçerli MSB = **ana/external swing yapısının 15M mum kapanışıyla kırılması + güçlü displacement** (ikisi birlikte zorunlu).
2. İç yapı (internal) kırılımı tek başına bu 0.382 modelinde MSB değildir.
3. Yalnızca wick/fitil penetrasyonu MSB değildir.
4. Long ve short için simetrik uygulanır. Önceki kurallar değişmedi: fib başlangıcı kırılımı başlatan swing high/low, yeni LL/HH'ye ölçüm, 0.382 limit giriş, 0.805 stop, ek market/orderbook/OI/likidasyon/on-chain kanıtları isteğe bağlı destek.

**Sıradaki kritik kararsızlık — Fibonacci anchor seçimi:** Bir bearish external MSB'yi başlatan high, son korunmuş *external swing high* mı, yoksa kırılımı gerçekleştiren son displacement ayağının *lokal başlangıç tepesi* mi? Bullish senaryoda simetrik olarak low. İkisi farklı sonuç verdiğinde otomatik seçim yapma; kullanıcı seçimini bekle. Bu ayrım özellikle 0.382 giriş ve 0.805 stop seviyelerini değiştirir.

**Bot uygulama notu:** Bir kırılımı tespit eden 15M kapanışı henüz oluşmadan M2 oluşturma. Displacement tanımı henüz ölçülmediği için yalnızca mum büyüklüğüne bakıp kesin sınıflandırma yapma. Mum tamamlanması ve anchor seçimi sırasında ileriye bakma (look-ahead bias) kullanma. Kullanıcı henüz canlı işlem yürütme yetkisi vermemiştir.


## v6 — Onaylanmış Bitcoin 15M 0.382 kuralları (en yüksek öncelik, 2026-11-14)

### Kesin kullanıcı onayları
- **Long ve short simetrik:** 0.382 entry ve 0.805 stop, aynı fib geri çekilme ölçümüne göredir.
- **MSB:** Yalnızca ana/external swing yapısı; ilgili seviye ötesinde **15 dakikalık mum kapanışı** ve **güçlü displacement** birlikte şart. Sadece fitil/internal break yeterli değildir.
- **Emir:** Geçerli setup ve onaylanmış anchorlardan sonra 0.382 seviyesine **doğrudan limit**; ayrıca entry confirmation şart değildir.
- **Bearish anchor, kullanıcının açıkça doğruladığı ikinci örnek:** Önceki ana tepe A aşılır ve yeni HH oluşursa, ardından A'nın sağındaki ana swing low 15M displacement kapanışıyla aşağı kırılırsa, fib **yeni HH → kırılımdan sonraki swing low** çizilir. Bu kırılan seviyenin kendisine değil, kırılım sonrası sabitlenen ekstremine ölçülür.
- **Bullish örnek:** Aynı mantık tersine uygulanır: yeni LL, ardından ana swing high üstünde güçlü kapanış; fib yeni LL → kırılım sonrası swing high. Long için ayrıntılı anchor örneklerinin gerçek grafikte doğrulanması yararlı olacaktır.
- **Bitiş anchor'ının sabitlenmesi:** Fiyat kırıldıktan sonra ilk **belirgin karşı yönde geri çekilme başladığında** kırılım sonrası swing low (short) / swing high (long) sabitlenir. Bunun öncesinde devam eden yeni ekstremle fib kesinleştirme ve limit emir açma; gelecekteki mumlara bakıp geçmişe sinyal yazma. “Belirgin”in makinece ölçülebilen kriteri henüz onaylanmadı; bot, bir sayı/eşik uyduramaz.
- **Veri önceliği:** Price action esas; order book/OI/likidasyon/on-chain destekleyici, zorunlu filtre değil. Bu veriler tek başına setup oluşturamaz.

### Özel uyarı: Kullanıcının tarif ettiği *ilk A–B senaryosu*
Kullanıcı ayrıca ilk örnekte A'dan B'nin solundaki dibe ölçümden bahsetti. Bu ifadenin geometrisi mevcut metin anlatımıyla tam çözülemedi. İkinci, yeni HH üreten senaryonun teyit edilmiş anchor kuralını **her türlü yapı dizilimine** sessizce genelleme. İlk senaryoyu `needs_chart_validation` olarak sakla.

### Limit emir yaşam döngüsü — henüz kullanıcının onaylamadığı sorular
1. **Yeni ekstrem:** Swing low/high sabitlendikten, fakat 0.382 limit dolmadan önce yeni LL/HH oluşursa emri iptal edip fib'i yeniden çizmek mi, yoksa eski limit korunacak mı?
2. **İptal:** Limit dolmadan karşıt yönde yapı kırılımı, anchor ekstremine aşım, HTF location bozulması veya süre/seans değişimi gibi olaylardan hangisi setup'ı iptal eder?
3. **Süre:** Limit emir kaç 15m mum, kaç saat veya hangi seans sonuna kadar açık kalır?
4. **Gerçekleşme sonrası:** Stop/TP/BE/partial yönetimi; güncel kişisel kurallar ile video konuk görüşlerini karıştırma.

### OpenCode'a aktarılacak v6 makine-okunur kural
```yaml
alpha_bot:
  authority: user_confirmed_v6_overrides_prior_versions
  btc_15m_0382:
    symbol: BTC
    timeframe: 15m
    directions: [long, short]
    msb:
      structure: external_main_only
      require_15m_close_beyond_level: true
      strong_displacement_required: true
      strong_displacement_quantification: NOT_YET_DEFINED
      wick_only: invalid
      internal_break_only: invalid
    short_confirmed_HH_variant:
      prerequisite: new_HH_above_previous_A_then_close_below_external_low_right_of_A
      fib_start: new_HH
      fib_end: post_break_swing_low
    long_mirror_variant:
      fib_start: new_LL
      fib_end: post_break_swing_high
      detailed_chart_validation: recommended
    first_A_B_variant: NEEDS_CHART_VALIDATION
    terminal_pivot_lock:
      trigger: first_distinct_countertrend_pullback_begins
      distinct_pullback_numeric_definition: NOT_YET_DEFINED
      prohibit_lookahead: true
      order_only_after_pivot_lock: true
    entry: {type: limit, retracement: 0.382, extra_confirmation: false}
    stop: {retracement: 0.805}
    supplemental_data: {price_action_first: true, mandatory: false}
    pending_order:
      new_extreme_before_fill: UNRESOLVED_ASK_USER
      invalidation_rule: UNRESOLVED_ASK_USER
      expiry_rule: UNRESOLVED_ASK_USER
    take_profit: UNRESOLVED_ASK_USER
    automated_execution_authorized: false
```


## v7 — 0.382 bekleyen limit emir: yeni ekstrem oluşursa (kullanıcı onayı, 2026-11-14)

### Bağlayıcı kullanıcı ifadesi
- Kullanıcı, limit emir henüz dolmamışken fiyat **biraz daha düşük LL** (short) veya simetrik olarak **biraz daha yüksek HH** (long) yaparsa Fibonacci ve emri **görsel fiyat davranışı makul ölçüde küçükse** güncelleyebileceğini belirtti.
- Eğer hareket **belirgin biçimde uzaklara giderse** işlemi kovalamaz; fırsat kaçmış kabul edilir, yeni setup bekler.
- **Küçük/büyük ayrımını görsel fiyat davranışından yapıyor; sabit yüzde, ATR katsayısı, mum sayısı ya da R eşiği kullanmıyor.** Bu ayrım bot tarafından icat edilmiş eşiklerle değiştirilmemelidir.
- Bu kural hem short hem long için simetriktir.

### Botun uygulama kararı
1. Onaylanmış 15M external MSB + displacement + ilk belirgin karşı-yön geri çekilme ile pivotu kilitle; fib 0.382 limit, 0.805 stop temelini koru.
2. **Limit dolmadan yeni LL/HH oluşursa**, önceki giriş ve stop seviyelerini hemen mutlak doğru sayma. Yeni ekstrem, önceki impuls, HTF konumu ve geri çekilme davranışını karşılaştır.
3. Görsel değerlendirme yeni ekstremi *küçük devam* olarak gösteriyorsa yeni ekstremden fib'i yeniden hesaplamayı ve bekleyen emrin güncellenmesini **aday karar** olarak sun. Emir gerçekten değiştirilecekse önce mevcut emir iptali ve yeni emrin yerleştirilmesi planı açık olmalı.
4. Görsel değerlendirme fiyatın *uzaklaştığını / uzamış yeni impuls* oluşturduğunu gösteriyorsa **CHASE ETME / MISSED SETUP / YENİ YAPI BEKLE**. 0.382 hedefi sırf fiyatı yakalamak için ileri taşınmaz.
5. Durum iki sınıf arasında **belirsiz** ise bot `DISCRETIONARY_REVIEW_REQUIRED` raporlar. Kullanıcının takdir kararını kesin otomatik eşik gibi taklit etmez; yeni emir değişikliğini otomatik uygulamaz.
6. Yeni emir değerlendirmesi için kullanıcı açık yetkilendirmedikçe **hiçbir alım/satım emri girme, değiştirme veya iptal etme**. Bu bilgi tabanı analiz kurallarıdır, işlem yetkisi değildir.
7. ``Görsel karar`` bir avantajın istatistiksel olarak doğrulandığı anlamına gelmez. Backtest sonuçlarında manuel sınıflama ve ekran görüntüsü gerekebilir; geçmiş barların geleceğini görerek pivot veya sınıf seçmek yasaktır.

### Bilinçli olarak tanımlanmayan alanlar
- `small_vs_extended_numeric_threshold`: `NONE_USER_DISCRETIONARY` (bot kendiliğinden türetmez).
- `visual_classification_confidence_threshold`: `NOT_SPECIFIED` (hesaplanmış güven yüzdesi uydurulmaz).
- `pending_order_expiry`: `UNRESOLVED_ASK_USER`.
- `pending_order_invalidation_on_opposite_MSB_or_HTF_change`: `UNRESOLVED_ASK_USER`.
- `exact_displacement_quantification`, `external_swing_pivot_algorithm`, `distinct_pullback_quantification`, `take_profit`: hâlâ tanımlanmamış.
- İlk A–B fib varyantı, önceki v6 uyarısındaki gibi **grafik üstünde doğrulama bekliyor**.

### OpenCode için v7 override
```yaml
alpha_bot:
  rule_version: v7
  authority: user_confirmed_v7_overrides_prior_pending_order_rules
  btc_15m_0382:
    pending_order:
      if_new_extreme_before_fill:
        applies_to: [new_LL_short, new_HH_long]
        decision_basis: discretionary_visual_price_behavior
        fixed_numeric_threshold: none
        if_minor_extension: propose_reanchor_recalculate_0382_entry_and_0805_stop
        if_large_extension: missed_setup_no_chase_wait_for_new_structure
        if_ambiguous: discretionary_review_required_no_automatic_modify
        execution_authorized: false
      expiry: unresolved
      invalidation_on_opposite_structure_or_context: unresolved
    still_unresolved:
      - displacement_objective_definition
      - external_swing_pivot_identification
      - distinct_pullback_definition
      - take_profit_rule
```


## v8 — BTC 15M 0.382: sabit RR ile TP ve bekleyen emir iptali (kullanıcı onayı, 2026-11-14)

### Bağlayıcı kararlar
- **TP yöntemi: sabit risk/ödül (RR).** Likidite, SR, FVG, hacim gibi seviyeler analizde kullanılabilir ancak M2'nin TP hesaplama kuralının yerini almaz.
- **Sabit RR katsayısı henüz kullanıcı tarafından belirtilmedi.** Örn. 2R / 2.5R / 3R yalnızca örnektir; bot herhangi birini varsayılan sayamaz. `rr_multiple: USER_INPUT_REQUIRED`.
- **Bekleyen 0.382 limit emrin iptali:** Fiyat, emir **henüz gerçekleşmeden** bu modelin önceden hesaplanmış TP seviyesine dokunursa ilgili emir iptal edilir; olay `MISSED_TP_BEFORE_ENTRY` olarak kaydedilir. **İşlem açılmadığı için gerçekleşmiş kâr, R veya win yazılmaz.**
- Kullanıcının açık ifadesi: **“limit emir geçersiz olmaz, eğer işlem tp ye ulaşırsa o zaman geçersiz olur.”** Dolayısıyla karşıt MSB, konum değişimi, seans değişimi veya zamanaşımı otomatik ve kullanıcıca onaylanmış iptal koşulu olarak tanımlanamaz. Bunlar uyarı ve yeniden değerlendirme sebebi olabilir; kullanıcı onayı olmadan emri iptal etme gerekçesine dönüştürülmez.
- v7'deki **küçük yeni ekstremde görsel değerlendirmeyle fib yeniden çizme**, **çok uzak hareketi kovalamama** kuralları devam eder. Bunlar yeni bir emir planı oluşturma konusunda takdir gerektirir; koşulsuz otomatik iptal yaratmaz.
- Kullanıcı, bekleyen emre gerçek emir yetkisi vermedi; bilgi tabanı yalnızca analiz ve planlama içindir.

### Hesaplama kuralları (fiyat birimleri)
- `entry = FibRetracement(0.382)` ve `stop = FibRetracement(0.805)`; fib yönü ve anchor'lar v6'da tanımlanmıştır.
- Long için: `risk_distance = entry - stop` (pozitif olmalı); `tp = entry + rr_multiple * risk_distance`.
- Short için: `risk_distance = stop - entry` (pozitif olmalı); `tp = entry - rr_multiple * risk_distance`.
- Hesaplanmış hedef, girişe göre kârlı tarafta değilse model `INVALID_PARAMETER_CONFIGURATION` olarak işaretlenir; RR katsayısı bilinmiyorsa **sayısal TP üretme veya TP'ye dayalı iptal testi yapma**.
- İlk defa belirlenen ve emri bekleyen bir plan için TP, emir dolmadan önce hesaplanmış olmalı. Fib manuel olarak güncellenirse giriş, stop ve TP birlikte yeniden hesaplanıp yeniden onaylanır; eski hedef otomatik olarak yeni plana taşınmaz.
- Backtest/live olay sırası önemlidir. Aynı mumda hem limit giriş hem TP görülebiliyorsa OHLC mum verisinden hangisinin önce gerçekleştiği kesin çıkarılamayabilir: `INTRABAR_SEQUENCE_UNKNOWN`; düşük zaman dilimi/tick verisiyle doğrulamadan kâr veya iptal atama.

### Emir yaşam döngüsü (yalnızca analiz amaçlı)
1. `WAITING_FOR_MSB` → onaylı external MSB ve güçlü displacement.
2. `WAITING_FOR_PIVOT` → ilk belirgin karşı-yön geri çekilme, fib bitiş ekstremi kilitlenir.
3. `PENDING_LIMIT` → 0.382 entry, 0.805 stop ve **kullanıcının seçeceği sabit RR** ile hesaplanan TP.
4. `PENDING_LIMIT` durumunda **TP, entry'den önce görülürse:** `CANCELLED_MISSED_TP`; bekleyen emrin iptali yalnızca işlem yetkisi varsa uygulanır.
5. `PENDING_LIMIT` durumunda **entry önce görülürse:** `OPEN_POSITION`; daha sonra stop/TP ve pozisyon yönetimi ayrı kurallara tabidir.
6. RR belirtilmeden `PENDING_LIMIT` için otomatik TP tabanlı iptal değerlendirmesi yapılamaz.

### OpenCode için v8 override
```yaml
alpha_bot:
  rule_version: v8
  authority: user_confirmed_v8_overrides_prior_tp_and_pending_order_cancellation_assumptions
  btc_15m_0382:
    take_profit:
      method: fixed_RR
      rr_multiple: USER_INPUT_REQUIRED
      long_formula: entry + rr_multiple * (entry - stop)
      short_formula: entry - rr_multiple * (stop - entry)
      prohibit_assumed_default_RR: true
    pending_order:
      cancel_when: calculated_TP_reached_before_limit_fill
      cancellation_reason: MISSED_TP_BEFORE_ENTRY
      completed_trade_PnL_on_cancellation: 0
      classify_as_winning_trade: false
      opposite_MSB_auto_cancel: false
      location_change_auto_cancel: false
      session_end_auto_cancel: false
      time_expiry_auto_cancel: false
      warning_for_changed_context: true
      maintain_v7_discretionary_reanchor: true
      intrabar_sequence_ambiguous: REQUIRE_LOWER_TIMEFRAME_OR_FLAG_UNKNOWN
      automated_execution_authorized: false
    unresolved:
      - exact_fixed_RR_multiple
      - objective_displacement_definition
      - external_swing_pivot_detection
      - distinct_countertrend_pullback_definition
      - first_A_B_fib_variant_chart_validation
      - post_fill_position_management
```


## v9 — BTC 15M 0.382: sabit TP = 2.5R (kullanıcı tarafından doğrulandı, 2026-11-14)

### Bağlayıcı karar
- Model M2'nin **long ve short işlemlerinde sabit TP hedefi 2.5R'dir**. RR, işleme girerken planlanan **0.382 limit entry** ve **0.805 stop** arasındaki fiyat uzaklığından hesaplanır.
- **Long:** `risk = entry - stop` (pozitif olmalı); `TP = entry + 2.5 * risk`.
- **Short:** `risk = stop - entry` (pozitif olmalı); `TP = entry - 2.5 * risk`.
- Bekleyen emir **henüz dolmadan** fiyat hesaplanmış 2.5R TP'ye erişirse emir artık geçerli değildir: `CANCELLED_MISSED_TP`. Bu bir kazanan işlem **değildir**; gerçekleşen PnL ve R kaydı sıfırdır.
- Emir dolduktan sonra 2.5R TP'ye ulaşılması normal kapanış hedefidir (`CLOSED_TP`, yürütme/ücret/slipaj gerçekleşmesine bağlı). Emir dolmadan ve sonra yaşanan olayları ayrı tut.
- Diğer MSB, location, zaman geçişi tek başına kullanıcı tarafından tanımlanmış otomatik iptal koşulu değildir. Görsel küçük yeni ekstremde fib güncelleme ihtimali; büyük yeni ekstremde chase etmeme kuralı v7'deki gibi devam eder ve kesin sayısal eşik içermez.
- Tek OHLC mumunda hem 0.382 giriş hem 2.5R TP görüldüyse önce hangisinin gerçekleştiği bilinmiyorsa **işlem sonucu varsayma**: `INTRABAR_SEQUENCE_UNKNOWN`; daha düşük zaman çözünürlüğü gerekir.
- Bu dosya botun **analiz ve karar-destek** kullanımını tanımlar; otomatik emir açma, güncelleme veya iptal yetkisi vermez.

### Gelecek tur için öncelikli açık konu
**External/ana swing nasıl tanımlanıyor?** Yalnız ana yapının güçlü displacement + 15M kapanış ile kırılması kabul edildiğinden, pivot algoritması açıklanmadan bot doğru MSB veya Fibonacci başlangıç anchor'ını tekrar edilebilir biçimde çıkaramaz. Sonraki adım kullanıcının grafikte hangi HL/LH'yi 'ana swing' saydığını örnekle belirlemektir. 'Güçlü displacement' ölçüsü ve 'ilk belirgin geri çekilme' tanımı da henüz objektif değildir; bot eşik uydurmaz.

### OpenCode için v9 override
```yaml
alpha_bot:
  rule_version: v9
  authority: user_confirmed_v9_overrides_all_previous_RR_placeholders
  btc_15m_0382:
    entry: {type: limit, fib_retracement: 0.382}
    stop: {fib_retracement: 0.805}
    take_profit:
      method: fixed_RR
      rr_multiple: 2.5
      long_formula: entry + 2.5 * (entry - stop)
      short_formula: entry - 2.5 * (stop - entry)
    pending_order:
      cancel_when: calculated_2_5R_TP_reached_before_limit_fill
      cancellation_reason: CANCELLED_MISSED_TP
      filled_trade: false
      record_realized_pnl: 0
      classify_as_win: false
      auto_cancel_on_opposite_MSB: false
      auto_cancel_on_context_change: false
      auto_cancel_on_session_end: false
      maintain_v7_visual_discretionary_reanchor: true
      if_same_bar_entry_and_TP: INTRABAR_SEQUENCE_UNKNOWN
    execution_authorized: false
    next_rule_to_define: external_swing_pivot_definition
    unresolved:
      - external_swing_pivot_detection
      - objective_displacement_definition
      - distinct_countertrend_pullback_definition
      - first_A_B_fib_variant_chart_validation
      - post_fill_position_management
```


## v10 — BTC 15M 0.382: ana swing = 1H/4H ile uyumlu pivotlar (kullanıcı onayı: 2026-11-14)

### Bağlayıcı karar
- Model M2 için **15M ana/external swing**, 1H ve/veya 4H piyasa yapısıyla uyumlu anlamlı pivotlar üzerinden seçilir. Kullanıcı özellikle “1H/4H ile uyumlu pivotlar” ifadesini seçmiştir. Bu, her 15M HL/LH'nin otomatik olarak external sayılmasını önler.
- MSB kuralı değişmez: **15M'de ana swing'in ötesinde kapanış ve güçlü displacement** birlikte gerekir. Wick-only ve internal-only kırılımlar M2'de tetik değildir.
- Fibonacci yönleri ve giriş/stop/TP değişmez: long/short simetrik, `0.382 limit`, `0.805 stop`, `2.5R TP`. Kırılım sonrası ilk belirgin karşı-yön hareketiyle fib bitiş ekstremi sabitlenir.
- Price action önceliklidir; Order Book/OI/likidasyon/on-chain teyitleri zorunlu değildir.
- **Açık belirsizlikler:** “1H/4H ile uyumlu” pivotun yalnızca bu grafiklerde açıkça görülen swing mi yoksa 15M pivotunun HTF korunmuş yapı/POI ile hizalanması mı olduğu; 1H ve 4H'den birinin yeterli olup olmadığı; swing algılama eşiği; displacement gücünün hangi objektif koşullarla tanımlanacağı. Model bunları kendi başına sabitlememelidir.

### Displacement — sonraki kullanıcı kararına açık
Mevcut kesin koşul: ana MSB'yi geçen 15M mumunun/impulsunun **güçlü displacement** göstermesi gerekir. “Güçlü”nün şartları henüz belirlenmemiştir. Kullanıcıya tartışılabilecek fakat onaylanmamış sinyaller:
1. Gövdeli kapanış: kırılım seviyesi ötesinde belirgin gerçek gövde ve az karşı fitil;
2. Normal aralığa göre genişleme: ATR veya son mumlarla karşılaştırmalı kuvvet;
3. Yapısal impuls: ardışık yönlü mumlar, sürat ve FVG oluşumu;
4. Görsel değerlendirme: tek sayısal eşik olmadan bariz momentum.
Bu dört seçenekten hiçbiri şu anda kullanıcı kuralı değildir. Hacim artışı destekleyici olabilir; önceki price-action-first kararı nedeniyle OI/on-chain doğrulaması zorunlu koşula dönüştürülemez.

### OpenCode v10 override
```yaml
alpha_bot:
  rule_version: v10
  authority: user_confirmed_v10_overrides_older_external_swing_selection_notes
  btc_15m_0382:
    market_structure_break:
      trigger_timeframe: 15m
      require_candle_close_beyond_external_swing: true
      require_strong_displacement: true
      external_swing_selection:
        principle: pivot_aligned_with_1h_or_4h_structure
        treat_every_15m_internal_pivot_as_external: false
        mechanical_alignment_definition: USER_INPUT_REQUIRED
    entry: {type: limit, fib_retracement: 0.382}
    stop: {fib_retracement: 0.805}
    take_profit: {method: fixed_RR, rr_multiple: 2.5}
    pending_order:
      cancel_when: calculated_2_5R_TP_reached_before_limit_fill
      auto_cancel_on_opposite_MSB: false
      execution_authorized: false
    displacement:
      required: true
      definition: USER_INPUT_REQUIRED
    unresolved:
      - precise_1h_4h_pivot_alignment_rule
      - objective_or_visual_displacement_definition
      - distinct_countertrend_pullback_definition
      - first_A_B_fib_variant_chart_validation
      - post_fill_position_management
```


## v11 — BTC 15M 0.382: güçlü displacement = belirgin mum gövdesi + net kapanış (kullanıcı onayı: 2026-11-14)

### Bağlayıcı karar
- Kullanıcı M2 modelinde **güçlü displacement** olarak **belirgin mum gövdesi ve net kapanış** kriterini seçti.
- 15M'de 1H/4H yapısıyla uyumlu **ana swing** seviyesinin ötesinde **mum kapanışı** gerekir. Fitil geçişi tek başına geçerli MSB değildir.
- Kırılım yapan 15M mumunun gerçek gövdesi **görsel olarak belirgin**, kapanışı kırılan seviyenin **net ötesinde** olmalıdır. Sadece küçük gövdeli, kararsız veya fitil ağırlıklı ihlal güçlü displacement olarak otomatik onaylanmaz.
- **Henüz tanımlanmamış eşikler:** `belirgin gövde` için gövde/aralık oranı, kapanışın seviyeden asgari uzaklığı, fitil toleransı, birden çok mumluk impulsun değerlendirilip değerlendirilmeyeceği. Asla %/ATR/mum sayısı gibi bir eşiği kullanıcının kuralı olarak uydurma. Yeterli netlik yoksa `DISPLACEMENT_UNCERTAIN` olarak işaretle ve grafik/somut örnek üzerinden onay iste.
- **Zorunlu olmayanlar:** hacim artışı, FVG varlığı, ATR genişlemesi, arka arkaya belirli sayıda mum, OI/order book/likidasyon/on-chain teyidi. Bunlar varsa yalnızca yardımcı kanıttır.
- Önceki kararlar aynen devam eder: long/short simetrik; `0.382 limit`, `0.805 stop`, `2.5R TP`; bekleyen emir henüz dolmadan TP görülürse `CANCELLED_MISSED_TP`; 1H/4H uyumlu ana swing; kırılım sonrası ilk belirgin karşı-yön geri çekilmede fib bitiş ekstremi sabitlenir; ek veriler destekleyicidir. Otomatik emir yürütme yetkisi verilmemiştir.

### Analist için MSB doğrulama sırası
1. 1H/4H market structure ile uyumlu önemli 15M ana swing seviyesini belirle; uyumun nasıl kurulduğunu açıkla.
2. İlgili 15M mumunun swing **ötesinde kapandığını** OHLC ile kontrol et.
3. Kırılım mumu için **belirgin gövde** ve **net kapanış** gözlemini açıkla; belirsiz ise geçerli MSB iddiasında bulunma.
4. MSB doğrulanınca kullanıcı onaylı fib anchor ve ilk belirgin geri çekilme kurallarını uygula; 0.382/0.805/2.5R hesapla.
5. Order book/OI/likidasyon/on-chain bulgularını ayrı `supporting_evidence` olarak değerlendir; zorunlu filtre yapma.

### OpenCode v11 override
```yaml
alpha_bot:
  rule_version: v11
  authority: user_confirmed_v11_overrides_v10_displacement_placeholder
  btc_15m_0382:
    market_structure_break:
      timeframe: 15m
      swing_type: external_pivot_aligned_with_1h_or_4h
      require_close_beyond_swing: true
      displacement:
        required: true
        qualitative_definition:
          - distinct_real_candle_body
          - clear_close_beyond_broken_swing
        numeric_threshold: NOT_DEFINED_BY_USER
        if_ambiguous: DISPLACEMENT_UNCERTAIN
        wick_only_break: INVALID
        require_atr_threshold: false
        require_fvg: false
        require_orderflow_or_onchain_confirmation: false
    entry: {type: limit, fib_retracement: 0.382}
    stop: {fib_retracement: 0.805}
    take_profit: {method: fixed_RR, rr_multiple: 2.5}
    pending_order:
      cancel_when: calculated_2_5R_TP_reached_before_limit_fill
      execution_authorized: false
    unresolved:
      - quantitative_or_example_based_distinct_body_and_clear_close_definition
      - precise_1h_4h_pivot_alignment_rule
      - distinct_countertrend_pullback_definition
      - first_A_B_fib_variant_chart_validation
      - post_fill_position_management
```


## v12 — BTC 15M 0.382: displacement gövde oranı ≥ %60 (kullanıcı onayı: 2026-11-15)

### Bağlayıcı karar — önceki sürümlerin gövde eşiği belirsizliğini geçersiz kılar
- BTC 15M **hem long hem short** MSB için, kırılımı onaylayan **15M mumunun gerçek gövdesi toplam high-low mum aralığının en az %60'ı** olmalıdır.
- `body_ratio = abs(close - open) / (high - low)`; `body_ratio >= 0.60` ve ilgili ana swing ötesinde **net 15M kapanış** birlikte gereklidir. `high == low` halinde oran hesaplanamaz, geçerli displacement kabul edilmez. Hesaplama yalnız tamamlanmış mumda yapılır.
- Short kırılım: `close < external_swing_low`; long kırılım: `close > external_swing_high`. Bu koşullardan biri ve `%60` gövde oranı olmazsa **o mum geçerli MSB displacement onayı değildir**. Fitille geçiş geçersizdir.
- Bu sayısal eşik **önceki v11 `numeric_threshold: NOT_DEFINED_BY_USER` satırının yerini alır**. Kapanışın seviyeden kaç dolar veya yüzde uzaklıkta olması gerektiği hâlâ açıklanmamıştır; yalnız teknik olarak swing ötesinde kapanması kodlanmıştır, “netlik” ayrıca isteğe bağlı görsel nitelendirmeyle raporlanabilir.
- ATR, hacim artışı, FVG, OI, order book, likidasyon ve on-chain teyidi ek zorunluluk değildir. Price action önceliği korunur.
- Ana swing seçimi hâlâ 1H/4H ile uyumlu pivotlar üzerinden yapılır; bunun mekanik tanımı **henüz kullanıcı tarafından belirlenmedi**.
- 0.382 limit / 0.805 stop / sabit 2.5R TP / emir dolmadan TP görülürse iptal / diğer önceki onaylı kurallar aynen geçerlidir.

### OpenCode v12 override — en güncel sürüm önceliklidir
```yaml
alpha_bot:
  rule_version: v12
  authority: user_confirmed_v12_overrides_older_displacement_threshold_placeholders
  btc_15m_0382:
    directions: [long, short]
    market_structure_break:
      timeframe: 15m
      swing_type: external_pivot_aligned_with_1h_or_4h
      require_closed_candle: true
      break_requires_close_beyond_swing: true
      wick_only_break: invalid
      displacement:
        candle_body_ratio_min_inclusive: 0.60
        formula: abs(close-open)/(high-low)
        require_nonzero_candle_range: true
        close_location_buffer: not_defined_by_user
        require_atr_filter: false
        require_fvg_filter: false
        require_orderflow_or_onchain_confirmation: false
      long: {close_must_be_above: external_swing_high}
      short: {close_must_be_below: external_swing_low}
    entry: {type: limit, fib_retracement: 0.382}
    stop: {fib_retracement: 0.805}
    take_profit: {method: fixed_RR, rr_multiple: 2.5}
    pending_order:
      cancel_when: calculated_2_5R_TP_reached_before_limit_fill
      execution_authorized: false
    unresolved:
      - exact_alignment_definition_of_15m_pivot_with_1h_or_4h
      - whether_one_htf_or_both_are_required
      - quantitative_definition_of_distinct_first_pullback
      - first_A_B_fib_variant_chart_validation
      - post_fill_position_management
```

### Sonraki karar: 1H/4H pivot uyumu
Aşağıdaki üç ayrıntı henüz kullanıcı kararı değildir: (1) 15M ana pivotun 1H veya 4H grafiğinde kendi başına görünen swing olması mı gerektiği, yoksa HTF supply/demand / korunmuş yapı ile çakışmasının yeterli mi olduğu; (2) yalnız 1H uyumu yeterli mi, yalnız 4H uyumu yeterli mi, yoksa her ikisi mi gerekli; (3) uyuşmazlık halinde hangi zaman diliminin öncelik taşıdığı. Bot bunları varsayım olarak açıkça işaretlemeli, kullanıcı kuralı diye sunmamalıdır.


## v13 — BTC 15M 0.382: HTF pivot uyumu (kullanıcı onayı: 2026-11-15)

### Bağlayıcı kullanıcı kararları
- BTC 15M modelinde `ana swing` sayılabilecek bir 15M pivot, **1H veya 4H'deki korunmuş market structure (HL/LH) yahut önemli supply/demand bölgesiyle ilişkili** olmalıdır.
- **1H veya 4H'den yalnızca birinin uyumu yeterlidir**; her ikisinin birlikte onayı zorunlu değildir. 15M pivotun HTF grafikte mutlaka tek başına gözle görülen bir pivot olması ayrıca şart koşulmamıştır.
- İlişkinin sebebi analizde belirtilmelidir: `1h_protected_structure`, `4h_protected_structure`, `1h_supply_demand`, `4h_supply_demand` seçeneklerinden hangileriyle bağlantılı olduğu ve ilgili fiyat seviyeleri verilmelidir.
- Bir 15M pivotun 1H/4H ilişkisi bulunamıyorsa bu pivot **v13 ana swing filtresini geçmez**; sadece küçük internal swing kırılması 0.382 setup'ı üretmez.
- Korunmuş HL/LH'nin belirlenmesinde kullanılacak kesin pivot algoritması, supply/demand bölgesinin sınırları, bölge-pivot **yakınlık toleransı** ve birbiriyle çelişen HTF yorumlarının önceliği **henüz kullanıcı tarafından tanımlanmamıştır**. Bot bu alanlarda sayısal eşik veya öznel kanaatini kullanıcının kesin kuralı gibi göstermez; kanıt ve belirsizliği raporlar.

### Önceki kurallar aynen geçerlidir
- BTC 15M, **long ve short**. Ana swing ötesinde tamamlanmış 15M mum kapanışı ve kırılım mumunda `abs(close-open)/(high-low) >= 0.60` (high>low) birlikte zorunlu.
- Kırılımdan sonra ilk belirgin karşı yönlü geri çekilme başladığında fib bitiş swing ekstremi sabitlenir. Daha önce kullanıcı tarafından belirlenen fib anchor varyantları korunur; görsel doğrulama gerektiren varyantlar kesinleştirilmiş sayılmaz.
- Entry 0.382 **limit**, stop 0.805, TP **2.5R sabit**. Emir dolmadan fiyat hesaplanan TP'ye ulaşırsa bekleyen emir iptal olur ve gerçekleşmiş kâr yazılmaz.
- Küçük yeni ekstrem/uzaklaşma değerlendirmesi görseldir; sabit ATR/yüzde sınırı yoktur. Fiyat kaçarsa kovalanmaz.
- Order book, OI, likidasyon ve on-chain **destekleyici** veri; setup için zorunlu değil. Botun otomatik emir gönderme yetkisi varsayılmaz.

### OpenCode v13 override — son sürüm öncelikli
```yaml
alpha_bot:
  rule_version: v13
  authority: user_confirmed_v13_overrides_older_htf_pivot_alignment_placeholders
  btc_15m_0382:
    directions: [long, short]
    main_swing_eligibility:
      timeframe: 15m
      htf_match_logic: ANY_ONE
      eligible_htfs: [1h, 4h]
      eligible_relationships:
        - protected_structure_HL_or_LH
        - significant_supply_or_demand_zone
      htf_visible_pivot_itself_required: false
      no_eligible_htf_relationship: reject_as_main_swing
      explain_relationship_and_price_levels: true
      zone_proximity_tolerance: NOT_DEFINED_BY_USER
      exact_protected_structure_algorithm: NOT_DEFINED_BY_USER
      htf_conflict_priority: NOT_DEFINED_BY_USER
    market_structure_break:
      timeframe: 15m
      require_completed_candle: true
      require_close_beyond_main_swing: true
      displacement_body_ratio_min_inclusive: 0.60
      displacement_formula: abs(close-open)/(high-low)
      high_equals_low: invalid
      wick_only: invalid
    entry: {type: limit, fib_retracement: 0.382}
    stop: {fib_retracement: 0.805}
    take_profit: {method: fixed_RR, rr_multiple: 2.5}
    pending_order:
      cancel_when: price_reaches_calculated_TP_before_entry_fill
      execution_authorized: false
    auxiliary_data: {orderbook: optional, oi: optional, liquidations: optional, onchain: optional}
    unresolved:
      - htf_zone_pivot_relationship_definition_and_tolerance
      - objective_protected_structure_HL_LH_pivot_identification
      - quantitative_first_clear_pullback_definition
      - chart_validation_of_fib_anchor_variants
      - post_fill_position_management
```

### Sonraki kritik karar önerisi
**HTF bölgeyle ilişkili sayılacak 15M pivotun yakınlığı nasıl değerlendirilecek?** Örneğin pivotun 1H/4H supply/demand kutusunun **içinde kalması** mı gerekli, yoksa kutuya yapılan **likidite süpürmesi ve geri kazanım** gibi reaksiyonlar da ilişki kurmaya yeter mi? Bu karar kullanıcıdan gelene kadar bot, ölçülmemiş yakınlıkları kesin eşleşme olarak raporlamaz.


## v14 — BTC 15M 0.382: HTF supply/demand–pivot ilişkisi (kullanıcı onayı: 2026-11-15)

### Bağlayıcı kullanıcı kuralı
- Bir 15M swing'in 1H veya 4H'deki **önemli supply/demand bölgesi** ile ilişkili sayılması için şu olaylardan **en az biri** yeterlidir: **(a) bölgeye temas, (b) bölgeyle ilişkili likidite avı/sweep, (c) bölgenin geri kazanılması (reclaim), (d) bölgeden güçlü fiyat reaksiyonu**.
- Pivotun mutlaka HTF kutunun **içinde** bulunması gerekmez. Bu seçenekler **OR** ilişkisindedir; dördünün bir arada oluşması gerekmez.
- Korunmuş HL/LH ile doğrudan ilişki de v13 uyarınca ayrı bir geçerli HTF uyum yoludur. **1H veya 4H'den tek biri yeterli**.
- Bot HTF zone adı/TF'si, kutu sınırları ve gerçekleşen olay (`touch`, `liquidity_sweep`, `reclaim`, `strong_reaction`) ile ilgili mumların zaman ve fiyatlarını kanıt olarak göstermelidir.
- `touch`: fiyatın tanımlanmış HTF bölgeyle kesişmesi; `sweep`: ilgili bölgenin ilişkili olduğu önceki swing/likidite seviyesinin alınması; `reclaim`: bölgenin kaybından sonra tekrar kazanılması; `strong_reaction`: bölgeden anlamlı karşı yönlü fiyat tepkisi. Bunlar **açıklayıcı kavramlardır**; sweep'in mutlaka kapanışla mı, wick ile mi; reclaim'in hangi TF kapanışıyla; reaksiyonun ne ölçüde 'güçlü' olacağı henüz kullanıcı tarafından belirlenmedi.
- Yalnızca 'bölgenin yakınında' olmak **otomatik yeterli değildir**. Sayısal mesafe, tolerans veya ATR katsayısı **kullanıcının kesin strateji kuralı gibi** atanmayacak. Yeterli olay kanıtı yoksa eşleşme `unconfirmed` olarak belirtilir.

### Diğer onaylanmış M2 kuralları değişmez
- BTC 15M long ve short; ana swing'in 1H/4H protected structure veya HTF önemli supply/demand ilişkisi; ana swing ötesinde tamamlanmış 15M mum kapanışı ve kırılım mumunda `abs(close-open)/(high-low) >= 0.60`.
- Kırılımdan sonraki ilk belirgin geri çekilmede ekstrem swing sabitlenir; kullanıcının tarif ettiği fib anchor varyantları korunur ve çizim belirsizliği olursa raporlanır. 0.382 limit entry, 0.805 stop, 2.5R sabit TP. Limit dolmadan hedefe ulaşılırsa emir iptal ve **0 R gerçekleşmiş sonuç**; kaçan işlem kâr sayılmaz.
- Limit dolmadan küçük yeni ekstrem oluşursa güncelleme görsel değerlendirmeye bağlıdır; büyük hareket kaçtıysa kovalanmaz. Price action öncelikli, order book/OI/likidasyon/on-chain verileri yalnızca yardımcıdır.

### OpenCode v14 override — son kullanıcı teyidi
```yaml
alpha_bot:
  rule_version: v14
  precedence: latest_user_confirmed_rules_win
  btc_15m_0382:
    main_swing_eligibility:
      require_htf_match: true
      eligible_htfs: [1h, 4h]
      htf_match_logic: ANY_ONE
      htf_relationships_any:
        - protected_HL_or_LH
        - significant_supply_demand_zone_interaction
      significant_supply_demand_zone_interaction:
        logic: ANY_ONE
        events: [touch, liquidity_sweep, reclaim, strong_reaction]
        pivot_must_form_inside_zone: false
        mere_unverified_proximity_is_sufficient: false
        require_evidence: [htf_timeframe, zone_bounds, event_type, event_time_and_prices]
        zone_proximity_numeric_tolerance: NOT_DEFINED_BY_USER
        strong_reaction_numeric_threshold: NOT_DEFINED_BY_USER
        sweep_and_reclaim_exact_confirmation: NOT_DEFINED_BY_USER
    market_structure_break:
      require_closed_15m_candle_beyond_main_swing: true
      body_ratio_min: 0.60
      high_equals_low: invalid
    entry: {type: limit, fib_retracement: 0.382}
    stop: {fib_retracement: 0.805}
    take_profit: {method: fixed_RR, rr_multiple: 2.5}
    pending_order: {cancel_when: calculated_TP_hit_before_fill}
    price_action_priority: true
    auxiliary_data: {orderbook: optional, oi: optional, liquidations: optional, onchain: optional}
    execution_authorized: false
    unresolved:
      - definition_of_HTF_protected_HL_LH
      - significance_of_supply_demand_zone
      - operational_touch_sweep_reclaim_reaction_confirmation
      - precise_fibonacci_anchor_for_all_chart_cases
      - objective_first_clear_pullback_detection
      - post_fill_position_management
```

### Sıradaki kritik karar — HTF protected structure nasıl seçilir?
1H/4H'de 'korunmuş HL/LH', **sonraki HH/LL'yi yaptıran son dip/tepe** midir, yoksa **yalnızca grafikte belirgin ve yapısal olarak önemli olan** swing midir? Her local HL/LH'nin korunan seviye sayılmaması için bu ayrım açıklığa kavuşturulmalıdır.

## v15 — HTF protected HL/LH = yeni HH/LL yaptıran son HL/LH (kullanıcı onayı: 2026-11-15)

### Kesin kullanıcı kararı — v14 ve öncesi üstüne yazılır
- **Bullish 1H/4H protected low:** Yeni bir **higher high (HH)** oluşmasını sağlayan **son higher low (HL)** korunmuş dip olarak işaretlenir.
- **Bearish 1H/4H protected high:** Yeni bir **lower low (LL)** oluşmasını sağlayan **son lower high (LH)** korunmuş tepe olarak işaretlenir.
- Ana swing uygunluğu bakımından bu korunmuş HL/LH ile ilişkili 15M pivot **veya** önemli HTF supply/demand bölgesi etkileşimi geçerlidir; 1H **ya da** 4H'den biri yeterlidir.
- Her küçük 15M internal swing otomatik olarak ana swing değildir. HTF korunan seviye ile ilişki, pivot fiyatı ve grafikteki zamanlar üzerinden açıkça gösterilmelidir.
- Bu tanım, **yeni HH/LL'nin kesinleştiği kriterin** (wick aşımı mı, mum kapanışı mı) henüz belirlendiği anlamına gelmez. Bot bunu kendiliğinden kullanıcı kuralı saymamalı.

### Uygulama adımları
1. 1H ve 4H için tamamlanmış mumlarla olası HH/HL ve LL/LH dizilerini belirle.
2. Bullish dizide yeni HH'yi oluşturan hareketin son HL'sini `protected_low`; bearish dizide yeni LL'yi oluşturan hareketin son LH'sini `protected_high` olarak etiketle.
3. 15M'deki aday ana swing'i, bu HTF protected level ile bağlantısı veya v14'teki bağımsız HTF supply/demand etkileşimi üzerinden doğrula.
4. MSB için ilgili 15M mumun ana swing ötesinde kapanmasını ve `abs(close-open)/(high-low) >= 0.60` koşulunu birlikte ara.
5. v14'ten aktarılan entry, stop, TP ve bekleyen emir kurallarını uygula: fib 0.382 limit, 0.805 stop, 2.5R TP; emir dolmadan TP görülürse iptal. Order Book/OI/likidasyon/on-chain yalnızca yardımcıdır.
6. HH/LL tanımı veya HL/LH seçimi birden fazla makul yoruma açıksa kesin sinyal üretmeden alternatif pivotları ve belirsizliği göster; tamamlanmamış HTF mumundan teyit uydurma.

### OpenCode v15 override — öncekilerle çelişkide en yeni kullanıcı kararı geçerlidir
```yaml
alpha_bot:
  rule_version: v15
  precedence: latest_user_confirmed_rules_win
  btc_15m_0382:
    main_swing_eligibility:
      eligible_htfs: [1h, 4h]
      timeframe_match_logic: ANY_ONE
      eligible_relationships_any: [htf_protected_structure, significant_htf_supply_demand_interaction]
      htf_protected_structure:
        bullish_protected_low: last_HL_that_produced_new_HH
        bearish_protected_high: last_LH_that_produced_new_LL
        source_timeframe_required: true
        internal_15m_swing_alone_is_enough: false
        new_HH_LL_confirmation_method: UNRESOLVED_USER_DECISION
      significant_htf_supply_demand_interaction:
        eligible_events_any: [touch, liquidity_sweep, reclaim, strong_reaction]
        proximity_only_without_event: insufficient
    market_structure_break:
      completed_15m_close_beyond_main_swing: required
      displacement_body_ratio_min_inclusive: 0.60
      displacement_formula: abs(close-open)/(high-low)
    entry: {order_type: limit, fib_retracement: 0.382}
    stop: {fib_retracement: 0.805}
    take_profit: {method: fixed_RR, multiple: 2.5}
    pending_order: {cancel_if_TP_reached_before_fill: true}
    auxiliary_data: {orderbook: optional, oi: optional, liquidations: optional, onchain: optional}
    execution_authorized: false
    unresolved:
      - whether_new_HTF_HH_LL_requires_wick_exceedance_or_HTF_candle_close
      - precise_swing_identification_in_nested_HTF_swings
      - objective_first_clear_pullback_detection
      - precise_fibonacci_anchor_for_all_chart_cases
      - post_fill_position_management
```

### Sonraki kritik belirsizlik — yeni HTF HH/LL oluşma şartı
1H/4H'de son HL/LH'yi 'protected' yapmak için yeni HH/LL'nin **önceki tepe/dibi fitille aşması** yeterli mi, yoksa **ilgili HTF mumunun seviye ötesinde kapanması** mı gerekiyor? Bu karar, korunan seviyenin gerçek zamanlı ne zaman değiştiğini etkiler. Bu iki ihtimalden hiçbiri henüz kullanıcının onayı değildir.
