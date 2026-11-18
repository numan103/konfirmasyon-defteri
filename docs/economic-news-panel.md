# Üst ekonomik haber paneli

- Sağ üstte tema anahtarının yanında takvim ikonu; üzerine gelince sola açılan
  sayfadan bağımsız popover. Her sayfa yüklenmesinde kapalı başlar; eski açık
  tercihler dikkate alınmaz. Mobilde dokunarak, klavyede Enter ile açılır.
  Kapat, Escape, dışarı tıklama veya fareyi uzaklaştırma ile kapanır.
  Kapalıyken veri isteği yapılmaz ve sağlayıcı iframe'i kaldırılır.
- Sol: `/api/eco-cal` üzerinden mevcut Forex Factory / Fair Economy haftalık akışı.
  Sadece bugünün TSİ kayıtları; varsayılan yüksek etki, tüm etkiler seçilebilir.
  Türkçe başlık ve orijinali birlikte gösterilir. Sözlükte olmayan başlıkta
  çeviri bulunamadığı açıkça belirtilir; makineyle uydurulmaz.
- Sağ: TradingView'in resmî `tv-economic-calendar` Türkçe web bileşeni;
  gerçekleşen, beklenti, önceki değerler sağlayıcının kendi takviminde kalır.
  Site bu verileri kazımaz, proxy'lemez veya Forex Factory kaydıyla eşleştirmez.
  Sağlayıcı atıfları/bağlantıları gizlenmez. Saat dilimi bu bileşenin kendi
  ayarına bağlıdır; yalnızca sol ajandanın saatleri TSİ olarak garanti edilir.
- Resmî doküman: https://www.tradingview.com/widget-docs/widgets/calendars/economic-calendar/
- Ajanda 5 dakika arayla, yalnızca açık/görünür panelde yenilenir. Gizli sekme,
  kapalı panel ve landing'de periyodik istek yok. Yenile düğmesi sonuç
  bileşenini de yeniden kurar. Ağ/adblock hataları boş haber günü sayılmaz.
- FF akışı gerçekleşen değer sağlamaz (`actualAvailable: false`). Sağlayıcı
  gecikmesi olabilir; bu panel işlem sinyali veya sıfır gecikme garantisi değildir.
- Telegram hattı, erişim politikaları ve veritabanı şemaları değiştirilmedi.
