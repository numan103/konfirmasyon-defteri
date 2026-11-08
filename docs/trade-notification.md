# İşlem / bias bildirimi ve bulanık önizleme

## Hedef
- Yeni **işlem** (`type === 'islem'`) ve **Onchain & Bias** (`type === 'onchain'`)
  paylaşımları **Alfa Traders Public** grubundaki **charts** konusuna bildirilir.
- Konu: `TG_THREAD` = **/434** (kullanıcı tarafından 2026-11-07'de onaylandı).
- İsteğe bağlı geçersiz kılmalar: `TG_TRADE_CHAT_ID`, `TG_TRADE_THREAD`.
- Kaçış kapısı: `TG_TRADE_NOTIFY=off` → bildirim gönderilmez, paylaşım yine kaydedilir.

## Davranış
- Yalnızca yeni `islem` ve `onchain` paylaşımı bildirir. `analiz` (📢 Kanal)
  paylaşımları ve düzenlemeler (`edit`) bildirim üretmez.
- Tür korunur: `onchain` paylaşımı depoda da `onchain` olarak kalır; böylece akış
  filtresi ve kart etiketi “📡 Onchain & Bias” görünür.
- İşlem metni: `📊 Yeni işlem · <COIN> · <LONG/SHORT>`, başlık, en fazla 240
  karakter özet ve paylaşım bağlantısı.
- Bias metni: `📡 Yeni bias · <COIN> · <LONG/SHORT/NÖTR>`, başlık, en fazla 240
  karakter özet ve `Detay: <link>` satırı. Bias yönü seçilmemişse yalnızca coin kalır.
- **Entry/TP/SL/Kaldıraç hiçbir bildirim metnine yazılmaz**; işlem detayı yalnızca
  sitede (ve bulanık kartın arkasında) kalır. Görsel baytı yüklenmez.
- Bağlantı önizlemesi bu bildirimlerde **açıktır**: Telegram gönderi bağlantısından
  başlık/açıklama ve bulanık `og:image` kartını çıkarır. Böylece paylaşım, kanalda
  bağlantıya tıklamadan da görünür. Diğer bildirimlerde önizleme kapalı kalır
  (`disable_web_page_preview: true`).
- Bağlantı: `https://alfa-trader.com/?page=alfatrading&post=<id>`.

## Yinelenmeyi önleme
- İstemci her paylaşım için `clientId` üretir. Aynı `clientId` ile tekrar deneme
  yeni kayıt açmaz ve **ikinci Telegram mesajı göndermez**.
- Gönderimden önce `tradeNotify.phase = 'sending'` kalıcı yazılır. Ağ hatasında
  durum `unknown` olur ve **kör retry yapılmaz**; belirsiz teslimde mesaj
  yeniden gönderilmez.
- Terminal durumlar: `sent`, `failed`, `unknown`, `disabled`, `dry_run`.
  `dry_run` yalnızca metni döndürür, gönderim yapmaz.
- `tradeNotify.kind` alanı `trade` veya `bias` olur; `key` da `trade:<id>` /
  `bias:<id>` şeklinde ayrışır.

## Eski kaydı bias olarak bildirme
- `analiz` olarak kaydedilmiş bir gönderi, türü kaybedildiği için sonradan
  bildirilemez. Yönetici şu eylemle bunu düzeltebilir:
  `{ action: 'notify', postId, markOnchain: true }`.
- Eylem türü `onchain` yapar, bias bildirimini bir kez gönderir. Kayıt zaten
  `sent`/`sending`/`unknown` ise **409 `already_notified`** döner; bilinçli tekrar
  için `force: true` gerekir. `dryRun: true` yalnızca metni döndürür.

## Bulanık önizleme
- Paylaşım görseli yüklenirken istemci 480 px genişliğinde, `blur(6px)` uygulanmış
  küçük bir JPEG üretir (`imgBlur`, `imgBlurW`, `imgBlurH`).
- Sosyal botlar için `middleware.js` gönderiye özel `og:image` üretir:
  `/api/contrib?store=alfatrading&image=<id>&v=<ts>`.
- Görsel `api/contrib.mjs` tarafından `image/jpeg` olarak servis edilir; bulanık
  kopya yoksa veya geçersizse `/og.png` (genel görsel) döner.
- `middleware.js` açıklama metni de seviye sızdırmaz: metin yoksa Entry/TP/SL
  yerine nötr “Alfa Trading topluluk paylaşımı.” cümlesi kullanılır.
- Yeni gönderi kimliği kullanıldığı için Telegram önizleme önbelleği devreye
  girmez; paylaşılan bağlantı güncel bulanık görseli gösterir.

## Doğrulama (2026-11-07)
- Etiketli test paylaşımı: `mw6o4g3zs2ftn`, Telegram `messageId 801`, `/434`.
- Mesaj metni Telegram embed üzerinden birebir doğrulandı.
- Aynı `clientId` ile tekrar deneme: `duplicate: true`, yeni mesaj yok,
  `messageId` değişmedi.
- Önizleme ucu: `image/jpeg`, 480 px genişlik, gönderiye özel başlık/açıklama.
- Var olmayan gönderi kimliği genel `/og.png` görseline düşer.

## Notlar
- `delTg` yönetici eylemi yanlış gönderilmiş bir bildirimi geri alır
  (`action: 'delTg', messageId`). Yalnızca admin kullanabilir.
- `middleware.js` satır okuması için geçerli bir Supabase **publishable** anahtarı
  gerekir. Üretimde `SUPABASE_PUBLISHABLE` tanımlı değilse dosyadaki doğrulanmış
  yayın anahtarı kullanılır; env anahtarı `401` dönerse bir kez yedek anahtarla
  denenir.
- Satır ~1.5 MB olduğu için okuma yaklaşık 1 saniye sürebilir; middleware 6 saniye
  zaman aşımıyla korunur.
