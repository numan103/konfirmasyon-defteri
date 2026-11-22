/* Alfa Traders — Rehber modu.
   Açıkken her sayfanın üstünde o sayfayı anlatan bir panel; her ana butonun
   yanında (sağında/solunda) ne işe yaradığını anlatan kısa bir etiket görünür.
   Rehber kapalıyken hiçbir DOM değişikliği yapılmaz. */

const STORAGE_KEY = 'alfa.siteGuide.v1';

let enabled = false;
let renderedPage = null;
let tipNodes = [];
let introNode = null;
let pageObserver = null;
let contentObserver = null;
let renderQueued = false;
let rendering = false;

/* Kısa tanımlar: c(selector, tip, side) ve p(title, intro, points, foot, controls). */
function c(selector, tip, side = 'right') { return { selector, tip, side }; }
function p(title, intro, points, foot, controls) { return { title, intro, points, foot, controls }; }

/* Hemen her sayfada görünen üst menü ve araçlar. */
const GLOBAL = [
  c('#nav-home', 'Ana menüye döner; günlük panel ve hızlı kartlar burada.', 'left'),
  c('#whats-new-btn-app', 'Son eklenen özelliklerin listesini açar.', 'left'),
  c('#lang-btn-app', 'Site dilini Türkçe / İngilizce arasında değiştirir.', 'left'),
  c('#nav-live', 'Şu an sitede kaç kişi olduğunu gösterir.', 'right'),
  c('#tab-portfoy', 'Portföy menüsünü açar: Alfa Portföy ve kendi Portföyüm.', 'left'),
  c('#tab-defter', 'İşlem öncesi kontrol listesi ve işlem kayıtları.', 'left'),
  c('#tab-review', 'Haftalık performans ve retrospektif değerlendirme.', 'left'),
  c('#tab-calc', 'Risk ve pozisyon büyüklüğü hesaplayıcı.', 'left'),
  c('#tab-ek', 'Diğer modüllere giden kısayol kartları.', 'left'),
  c('#tab-erisim', 'Borsa bağlama, UID doğrulama ve premium durumu.', 'left'),
  c('#tab-analitik', 'Ziyaretçi ve ürün metrikleri; yöneticiye açıktır.', 'left'),
  c('[data-mnav="home"]', 'Ana menüye döner.', 'block')
];

/* Sayfa rehberleri: tanıtım paneli + o sayfadaki gerçek kontroller. */
const PAGES = {
  edustudio: p('İçerik Stüdyosu',
    'Eğitim içeriklerini, günlük notları ve taslakları yönettiğin yönetici çalışma alanı.',
    ['İçerik ve öğrenci görünümünü aynı veri üzerinde önizleyebilirsin.',
     'Ana sayfa günlük notu buradan oluşturulur.',
     'Telegram taslakları ve konu ağacı burada toplanır.'],
    'Varsayılan olarak gizlidir; yönetici erişimiyle açılır.',
    [
      c('#edu-author-preview', 'İçerik görünümünü önizler.'),
      c('#edu-author-student', 'Öğrencinin göreceği görünümü önizler.'),
      c('#edu-author-journal', 'Günlük not üretme alanını açar.'),
      c('#edu-daily-add', 'Ana sayfada görünecek yeni günlük not oluşturur.'),
      c('#edu-author-reload', 'Konu ağacını yeniden yükler.'),
      c('#edu-telegram-refresh', 'Telegram kaynak içeriklerini yeniler.'),
      c('#edu-author-search', 'Konular arasında arama yapar.'),
      c('#edu-author-tree', 'Konu başlıklarını ve alt başlıkları listeler.'),
      c('#edu-author-drafts', 'Kaydedilmemiş taslakları gösterir.'),
      c('#edu-telegram-inbox', 'Telegram’dan gelen taslakları listeler.'),
      c('#edu-course-manager', 'Kurs ve bölüm yapısını yönetir.')
    ]),
  eduplans: p('Eğitim Paketleri',
    'Video, canlı ve birebir eğitim paketlerini; Breakout ve USDT katılım yollarını anlatan tanıtım sayfası.',
    ['Paket kartları seviye ve içerik farkını gösterir.',
     'Partner kodu kopyalanarak kayıtta kullanılabilir.',
     'SSS ve canlı buluşma bilgileri aşağıda yer alır.'],
    'Yönetici bu sayfayı görmez; İçerik Stüdyosu yönlendirmesi yapılır.',
    [
      c('#eduplans-root', 'Paket kartlarının ve açıklamaların üretildiği alan.'),
      c('.eduplans-actions button', 'Seçilen paket için başvuru veya soru akışını başlatır.'),
      c('.eduplans-actions a', 'Mevcut derslere ve eğitim alanına götürür.'),
      c('.eduplan[data-plan]', 'Paket kartı; seviye, süre ve içerik detayını gösterir.'),
      c('[data-edu-apply][data-edu-route]', 'Seçilen katılım yoluna göre ödeme/başvuru adımına geçer.'),
      c('.eduplans-code button', 'ALFA partner kodunu panoya kopyalar.'),
      c('.eduplans-faq-title', 'Sık sorulan soru yanıtını açıp kapatır.'),
      c('.edu-partners button', 'Partner akışının otomatik geçişini duraklatır/sürdürür.')
    ]),
  home: p('Ana Menü',
    'Günlük kontrol panelin. Sabah kartı, haberler, haftalık dergi, görevler, paylaşılan portföy özeti ve hızlı arama tek ekranda toplanır.',
    ['Sabah kartı ruh halini ve günlük kriterlerini kaydeder.',
     'Günün yazısı, ekonomik haberler ve dergi akışı buradan okunur.',
     'Günlük görevler XP ve seri biriktirir.',
     'Paylaşılan portföy özeti ve hızlı erişim kartları altta yer alır.'],
    'Yöneticiye özel Ayna ve veri kartları erişim seviyesine göre gizlenir.',
    [
      c('#mc-card', 'Sabah ruh hali kontrolünü açar; günlük soruları yanıtlatır.'),
      c('#mc-edit', 'Sabah kartındaki soruları düzenler.'),
      c('#mc-chip', 'Küçük sabah kartını tekrar gösterir.'),
      c('#hf-news', 'Günün haber ve özetlerini popover içinde açar.'),
      c('#hmr-prev', 'Haftalık dergide önceki haftaya geçer.'),
      c('#hmr-next', 'Haftalık dergide sonraki haftaya geçer.'),
      c('#home-daily-refresh', 'Günlük notları yeniden yükler.'),
      c('#daily-tasks-panel', 'Günlük görev listesini açar.'),
      c('#dt-remind', 'Görev hatırlatıcısını ayarlar.'),
      c('#home-find', 'Sayfa ve konu aramasını açar.'),
      c('#home-quick', 'Hızlı erişim kartlarını gösterir.'),
      c('#economic-news-trigger', 'Ekonomik takvim ve yüksek etkili haberleri açar.'),
      c('#home-guide', '4 adımlı başlangıç rehberini gösterir.'),
      c('#home-top', 'Sayfanın en üstüne döner.')
    ]),
  influencer: p('Alfa Influencer',
    'İçerik üreticisi paketlerini, USDT ödeme akışını ve başlangıç kontrol listesini gösterir.',
    ['Paket seçimi video, rehberli ve büyüme seçeneklerini karşılaştırır.',
     'Cüzdan adresi kopyalanır, TXID ile ödeme bildirimi gönderilir.',
     'Kontrol listesi hesap açılış adımlarını takip eder.'],
    'Yönetici ödeme bildirimleri ayrı panelde toplanır.',
    [
      c('[data-inf-package]', 'Video, guided veya growth paketini seçer.'),
      c('#inf-copy-wallet', 'Ödeme cüzdan adresini kopyalar.'),
      c('#inf-package', 'Seçili paket bilgisini gösterir.'),
      c('#inf-txid', 'Ödeme işlem numarasını girer.'),
      c('#inf-payment-submit', 'Ödeme bildirimini yöneticiye iletir.'),
      c('#inf-checks', 'Başlangıç kontrol listesini açar.'),
      c('#inf-reset', 'Kontrol listesini sıfırlar.'),
      c('#inf-refresh-orders', 'Yönetici ödeme bildirimlerini yeniler.'),
      c('#inf-full', 'Geniş içerik ve gönderi alanını açar.')
    ]),
  butce: p('Gelir / Gider',
    'Gelir-gider kayıtları, harcama dağılımı, yatırım pozisyonları ve uzun vadeli birikim planı.',
    ['Ay bazlı gezinme ve hızlı kayıt formu vardır.',
     'Ekstre/PDF içe aktarma ile toplu kayıt eklenebilir.',
     'Tutarlar gizlenebilir; portföy ve plan panelleri ayrıdır.'],
    'Referans erişimli üyelere açıktır.',
    [
      c('#bd-eye', 'Tutarları gizler veya tekrar gösterir.'),
      c('#bd-prev', 'Önceki aya geçer.'),
      c('#bd-next', 'Sonraki aya geçer.'),
      c('#bd-today', 'Bugünün ayına döner.'),
      c('#bd-import-btn', 'Ekstre/PDF içe aktarma panelini açar.'),
      c('#bd-import-parse', 'Yüklenen metni kayıtlara ayırır.'),
      c('#bd-import-commit', 'Ayrıştırılan kayıtları onaylar.'),
      c('#bd-quick-amount', 'Hızlı kayıt tutarını girer.'),
      c('#bd-quick-save', 'Hızlı kaydı listeye ekler.'),
      c('#bd-save', 'Detaylı gelir/gider formunu kaydeder.'),
      c('#bd-pf-refresh', 'Portföy pozisyonlarını yeniler.'),
      c('#bd-pf-add', 'Yeni yatırım pozisyonu ekler.'),
      c('#bd-pl-sync', 'Uzun vadeli planı güncel verilerle eşitler.')
    ]),
  sosyalmetre: p('Sosyalmetre',
    'Sosyal medya performansını, koşulları ve işlem notlarını birlikte değerlendiren karar aracı.',
    ['Eşik değerleri skorlamayı belirler.',
     'Koşullar, işlemler ve paylaşım kartı aynı sayfada yönetilir.',
     'Yedek alma ve geri yükleme komutları altta yer alır.'],
    'Yöneticiye açıktır.',
    [
      c('#sm-th', 'Skor eşiğini seçer.'),
      c('#sm-export', 'Mevcut veriyi yedek olarak dışa aktarır.'),
      c('#sm-import', 'Yedek dosyadan veri geri yükler.'),
      c('#sm-reset', 'Sosyalmetre verisini sıfırlar.'),
      c('#sm-cond-add', 'Yeni koşul ekler.'),
      c('#sm-cond-list', 'Tanımlı koşulları listeler.'),
      c('#sm-add-trade', 'Yeni işlem notu ekler.'),
      c('#sm-t-save', 'İşlem notunu kaydeder.'),
      c('#sm-copy', 'Paylaşım metnini kopyalar.'),
      c('#sm-png', 'Paylaşım kartını görsel olarak indirir.')
    ]),
  uyap: p('Gayrimenkul Takip',
    'Emlak ilanları, maliyetler, yatırım notları ve fotoğraf akışı için çalışma alanı.',
    ['İlan linkleri, fiyat ve maliyet bilgileri kartlarda tutulur.',
     'Hızlı etiketlerle yatırım notu akışına giriş yapılır.',
     'Fotoğraflar sürükle-bırak ile eklenir.'],
    'Ek sayfasından açılır; yöneticiye özeldir.',
    [
      c('#uyap-search', 'İlanlar arasında arama yapar.'),
      c('#uyap-copy-all-btn', 'Tüm ilan linklerini kopyalar.'),
      c('#uyap-add-btn', 'Yeni ilan formunu açar.'),
      c('#uyap-note-save', 'Yatırım notunu kaydeder.'),
      c('[data-uyap-quicktag]', 'Hazır etiketlerle hızlı not ekler.'),
      c('#uyap-f-cost-add', 'İlan maliyet satırı ekler.'),
      c('#uyap-f-img-drop', 'Fotoğraf sürükle-bırak alanıdır.'),
      c('#uyap-form-save', 'İlan kaydını kaydeder.'),
      c('#uyap-imgview-close', 'Fotoğraf görüntüleyiciyi kapatır.')
    ]),
  zaman: p('Zaman & Gelişim',
    'Günlük zaman takibi, su hedefi, alışkanlıklar ve kişisel gelişim kayıtları.',
    ['Zaman takibi ve kişisel gelişim aynı sayfada iki sekmede durur.',
     'Gün bazlı satırlar, kategoriler ve su sayacı vardır.',
     'Hedefler ve seriler motivasyonu takip eder.'],
    'Yöneticiye açıktır.',
    [
      c('#zm-main-tabs [data-zm-tab]', 'Zaman takibi ile kişisel gelişim arasında geçiş yapar.'),
      c('[data-zm-prev]', 'Önceki güne geçer.'),
      c('[data-zm-next]', 'Sonraki güne geçer.'),
      c('[data-zm-today]', 'Bugüne döner.'),
      c('[data-zm-addcat]', 'Yeni zaman kategorisi ekler.'),
      c('[data-water]', 'Su bardağı sayacını artırır.'),
      c('[data-water-goal]', 'Günlük su hedefini belirler.'),
      c('[data-zm-collapse]', 'Harcama, yüzde ve şablon panellerini açar.'),
      c('[data-pg-add]', 'Yeni kişisel gelişim hedefi ekler.')
    ]),
  strateji: p('Strateji İzleme',
    'Strateji adaylarını aşama, güven düzeyi ve güçlü/zayıf yönleriyle izler.',
    ['Yeni strateji formu aday kaydı oluşturur.',
     'Kartlar stratejinin olgunluk seviyesini gösterir.',
     'Güçlü ve zayıf yönler ayrı alanlara yazılır.'],
    'Yöneticiye açıktır.',
    [
      c('#st2-new', 'Yeni strateji formunu açar.'),
      c('#st2-name', 'Strateji adını girer.'),
      c('#st2-stage', 'Strateji aşamasını seçer.'),
      c('#st2-conf', 'Güven düzeyini girer.'),
      c('#st2-save', 'Strateji kaydını kaydeder.'),
      c('#st2-cancel', 'Formu kapatır.'),
      c('#st2-grid', 'Kayıtlı strateji kartlarını listeler.')
    ]),
  trading: p('Trading Terminali',
    'TradingView grafiği, siteye ait izleme listesi, favoriler, alarm ve çizim araçları.',
    ['Sembol araması ve izleme listesi grafikle aynı ekrandadır.',
     'Favori, ekleme ve fiyat uyarısı kısayolları grafik altındadır.',
     'Kodda erişim admin seviyesindedir.'],
    'Terminal içeriği terminal.mjs tarafından dinamik üretilir.',
    [
      c('.term-top button:first-child', 'Siteye, yani ana menüye geri döner.'),
      c('.term-symbol', 'Parite arama penceresini açar.'),
      c('.term-side-toggle', 'Sağ izleme panelini açar/kapatır.'),
      c('.term-side-close', 'Sağ izleme panelini kapatır.'),
      c('.term-body select[aria-label="Zaman dilimi"]', 'Grafik zaman aralığını değiştirir.'),
      c('.term-side-search', 'İzleme listesinde sembol filtreler.'),
      c('.term-quick button', 'Favoriye alma, grafiğe ekleme ve alarm kısayollarıdır.')
    ]),
  alfatrading: p('İşlem Kanalı',
    'Gerekçeli işlem, analiz, bias ve onchain paylaşımlarının toplandığı akış.',
    ['Yönetici yeni paylaşım oluşturabilir ve profil ayarlarını düzenleyebilir.',
     'Paylaşım formunda yön, giriş, TP/SL, kaldıraç ve risk alanları vardır.',
     'Görsel yükleme ve alıntıla akışı desteklenir.'],
    'Herkese açık akış; yazma araçları yöneticiye özeldir.',
    [
      c('#at-new-btn', 'Yeni işlem/analiz paylaşım formunu açar.'),
      c('#at-prof-btn', 'Paylaşım profili ayarlarını açar.'),
      c('[data-attype]', 'Paylaşım türünü seçer.'),
      c('#at-f-title', 'Paylaşım başlığını girer.'),
      c('#at-f-text', 'Paylaşım metnini yazar.'),
      c('[data-atdir]', 'Long veya short yönünü seçer.'),
      c('#at-f-entry', 'Giriş fiyatını girer.'),
      c('#at-f-tp', 'Kâr hedefini girer.'),
      c('#at-f-sl', 'Stop seviyesini girer.'),
      c('#at-f-file', 'Paylaşıma görsel ekler.'),
      c('#at-submit', 'Paylaşımı yayına alır.')
    ]),
  portfoy: p('Portföy Yönetimi',
    'Paylaşılan Alfa Portföy özeti ve yalnızca bu cihazda saklanan kendi Portföyüm alanı.',
    ['Üstte Alfa Portföy ile Portföyüm sekmeleri bulunur.',
     'Enstrüman arama, grafik aralığı ve dağılım grafikleri özeti oluşturur.',
     'Kişisel pozisyonlar, satışlar ve fikirler cihazda tutulur; sunucuya yazılmaz.'],
    'Özet herkese açıktır; Alfa Portföy pozisyon detayı premium kapısının arkasındadır.',
    [
      c('#ap2-tab-alpha', 'Paylaşılan Alfa Portföy sekmesini açar.'),
      c('#ap2-tab-mine', 'Kendi Portföyüm sekmesini açar.'),
      c('#ap2-search', 'Enstrüman arar.'),
      c('#ap2-add', 'Yeni enstrüman ekler.'),
      c('#ap2-reset', 'Portföy görünümünü sıfırlar.'),
      c('#ap2-idea-add', 'Portföy notu ekler.'),
      c('#ap2-chart-range [data-ap2r]', 'Getiri grafiğinin zaman aralığını seçer.'),
      c('#ap2-gate-verify', 'Premium erişim kodunu doğrular.'),
      c('#ap2-gate-cta', 'Erişim/premium sayfasına yönlendirir.'),
      c('#ap2-f-save', 'Alfa Portföy enstrüman formunu kaydeder.'),
      c('#mp-new', 'Yeni kişisel portföy oluşturur.'),
      c('#mp-rename', 'Portföy adını değiştirir.'),
      c('#mp-delete', 'Portföyü siler.'),
      c('#mp-add', 'Kişisel pozisyon ekler.'),
      c('#mp-set-export', 'Kişisel portföy yedeğini dışa aktarır.'),
      c('#mp-set-reset', 'Kişisel portföyü sıfırlar.')
    ]),
  defter: p('Alfa Check List',
    'İşlem öncesi kriter puanlama, senaryo/anti-senaryo, duygu durumu ve işlem kaydı.',
    ['Parite ve yön seçimi skoru belirler.',
     'Kadran, karar kalitesi ve risk satırı anlık geri bildirim verir.',
     'Kayıtlar, ders defteri ve paylaşım kartı aynı sayfadadır.'],
    'Referans erişimli üyelere açıktır.',
    [
      c('#btn-long', 'Long yönünü seçer.'),
      c('#btn-short', 'Short yönünü seçer.'),
      c('#pair-confirm', 'Seçili pariteyi onaylar.'),
      c('#mood-range', 'Duygu durumunu işaretler.'),
      c('#verdict', 'Skor ve karar sonucunu gösterir.'),
      c('#d-save', 'Günlük planı kaydeder.'),
      c('#btn-logtrade', 'Planı işlem kaydına çevirir.'),
      c('#btn-share', 'Paylaşım kartını açar.'),
      c('#btn-reset', 'Formu sıfırlar.'),
      c('#btn-ghost-save', 'İşlem almadığını kaydeder.'),
      c('#btn-export', 'İşlem kayıtlarını dışa aktarır.'),
      c('#btn-copy', 'Paylaşım metnini kopyalar.'),
      c('#ls-btn-add', 'Ders defterine yeni ders ekler.'),
      c('#sh-copy', 'Paylaşım kartı metnini kopyalar.'),
      c('#btn-defaults', 'Kriterleri varsayılan hale getirir.')
    ]),
  data: p('Veri / Notion',
    'Tüm işlem verisini tablo halinde gösterir, Notion senkronizasyonu ve AI analizi sunar.',
    ['KPI’lar ve sayfalı tablo veriyi özetler.',
     'Notion bağlantısı ve database ID ayarları burada tutulur.',
     'AI paneli seçili veriye odaklanarak analiz üretir.'],
    'Yöneticiye açıktır.',
    [
      c('#data-notion', 'Notion kayıtlarını yeniden çeker.'),
      c('#data-notion-oauth', 'Notion bağlantısını başlatır.'),
      c('#ndb-kripto', 'Kripto database kimliğini girer.'),
      c('#ndb-fx', 'FX database kimliğini girer.'),
      c('#ndb-save', 'Database ayarlarını kaydeder.'),
      c('#data-clear', 'Filtreleri temizler.'),
      c('#data-ai-btn', 'Seçili veri için AI analizini çalıştırır.')
    ]),
  review: p('Haftalık Değerlendirme',
    'Haftalık RR, kümülatif PnL eğrisi ve retrospektif bölümleri.',
    ['Hafta/ay görünümü arasında geçiş yapılabilir.',
     'Notion senkron düğmeleri veriyi günceller.',
     'Retrospektif bölümleri ve metrikler eklenabilir.'],
    'Referans erişimli üyelere açıktır.',
    [
      c('#rv-prev', 'Önceki haftaya geçer.'),
      c('#rv-next', 'Sonraki haftaya geçer.'),
      c('#rv-today', 'İçinde bulunulan haftaya döner.'),
      c('#rv-mode-week', 'Haftalık özet görünümünü seçer.'),
      c('#rv-mode-month', 'Aylık özet görünümünü seçer.'),
      c('#rv-npush', 'Veriyi Notion’a gönderir.'),
      c('#rv-npull', 'Notion’dan veri çeker.'),
      c('#rr-krip-in', 'Kripto RR değerini girer.'),
      c('#rr-fx-in', 'FX RR değerini girer.'),
      c('#rv-add-section', 'Yeni retrospektif bölümü ekler.'),
      c('#rv-add-metric', 'Yeni performans metriği ekler.')
    ]),
  karne: p('Günün Karnesi',
    'Günlük disiplin puanı, yaşam dengesi, koç yorumu ve son 30 günün geçmişi.',
    ['Gün bazlı gezinme ve kayıt vardır.',
     'Koç yorumu AI tarafından üretilir.',
     'Yaşam dengesi paneli ayrıca kaydedilir.'],
    'Yöneticiye açıktır.',
    [
      c('#kr-prev', 'Önceki güne geçer.'),
      c('#kr-next', 'Sonraki güne geçer.'),
      c('#kr-today', 'Bugüne döner.'),
      c('#kr-save', 'Günün karnesini kaydeder.'),
      c('#kr-del', 'Günün kaydını siler.'),
      c('#kr-ai-btn', 'Koç yorumunu oluşturur.'),
      c('#bd-life-save', 'Yaşam dengesi kaydını kaydeder.'),
      c('#kr-hist-list', 'Son 30 günün geçmişini listeler.')
    ]),
  news: p('Alfa Dergi / AlfaNews',
    'Haftalık dergi, makro ve yüksek zaman dilimi yazıları; yönetici düzenleme araçlarıyla.',
    ['Haftalık yazı listesi ve dergi okuyucu bulunur.',
     'Yönetici modunda yazı ekleme ve önizleme araçları açılır.',
     'Görseller büyütülebilir ve kart olarak indirilebilir.'],
    'Okuma herkese açıktır; düzenleme yöneticiye özeldir.',
    [
      c('#news-weekly-list', 'Haftalık yazıları listeler.'),
      c('#mag-tools', 'Yönetici düzenleme araçlarını açar.'),
      c('#mag-preview', 'Yayın öncesi önizlemeyi gösterir.'),
      c('#mag-addupdate', 'Yeni güncelleme ekler.'),
      c('#mag-addentry', 'Dergiye yeni yazı ekler.'),
      c('#mag-prev', 'Önceki sayfaya geçer.'),
      c('#mag-next', 'Sonraki sayfaya geçer.'),
      c('#mag-preview-exit', 'Önizleme modundan çıkar.'),
      c('#mag-zoom', 'Yazı görselini büyütür.'),
      c('#mag-cardview-dl', 'Paylaşım kartını indirir.')
    ]),
  ek: p('Ek Sayfalar',
    'Diğer modüllere kart bazlı kısayollar ve kilit durumlarının görünümü.',
    ['Her kart ilgili sayfaya götürür.',
     'Erişimi olmayan modüllerde kilit notu gösterilir.',
     'Kart listesi erişim seviyesine göre yeniden üretilir.'],
    'Yöneticiye açıktır.',
    [
      c('#ek-grid', 'Modül kısayol kartlarının üretildiği alan.'),
      c('#ek-grid a[href^="?page="]', 'İlgili modül sayfasını açar.')
    ]),
  egitim: p('Alfa Edu',
    'Kurs kataloğu, günlük notlar, video izleme, notlar ve yönetici içerik araçları.',
    ['Katalog, devam edilen dersler ve stüdyo sekmeleri vardır.',
     'Günlük notlar okunur, arama ve seviye filtreleri kullanılır.',
     'Ders içinde not alma ve konu ekleme yapılabilir.'],
    'Ücretsiz üyelere açıktır; içerik yazma araçları yöneticiye özeldir.',
    [
      c('#edu-browse', 'Kurs kataloğunu açar.'),
      c('#edu-continue', 'Kaldığın derslere döner.'),
      c('#edu-studio', 'İçerik stüdyosuna gider.'),
      c('#edu-access-tabs [data-access]', 'Erişim seviyesine göre içerik filtreler.'),
      c('#edu-daily-refresh', 'Günlük notları yeniler.'),
      c('#edu-daily-more', 'Daha eski günlük notları gösterir.'),
      c('#edu-search', 'Kurs ve konu arar.'),
      c('#eg-add-topic', 'Derse yeni konu ekler.'),
      c('#eg-done', 'Konuyu tamamlandı olarak işaretler.'),
      c('#ch-add-topic', 'Kanal konusu ekler.'),
      c('#ch-in-save', 'İçerik editörünü kaydeder.'),
      c('#ch-prof-save', 'Kanal profilini kaydeder.')
    ]),
  strategies: p('Stratejiler',
    'Strateji kayıtları, otomatik dağıtım ve analiz köşesine geçiş.',
    ['Stratejiler işlem günlüğünden dağıtılabilir.',
     'Formda market, zaman dilimi, yön, durum ve öncelik alanları vardır.',
     'Analiz köşesi butonu ilgili sayfaya götürür.'],
    'Yöneticiye açıktır.',
    [
      c('#strat-analiz-btn', 'Analiz Köşesi sayfasına gider.'),
      c('#strat-distribute-all', 'Stratejileri işlem günlüğüne dağıtır.'),
      c('#strat-auto-journal', 'İşlem günlüğünden otomatik strateji oluşturur.'),
      c('#strat-add', 'Yeni strateji formunu açar.'),
      c('#sf-name', 'Strateji adını girer.'),
      c('#sf-market', 'Piyasayı seçer.'),
      c('#sf-status', 'Strateji durumunu seçer.'),
      c('#sf-save', 'Stratejiyi kaydeder.')
    ]),
  analiz: p('Analiz Köşesi',
    'Trader paylaşımlarını link, metin ve görsel ile kaydedip AI destekli analiz üretir.',
    ['Trader listesi ve analiz kayıtları aynı sayfadır.',
     'Linkten içerik çekme, metin girme ve dosya yükleme desteklenir.',
     'Analiz alanları ne/niye/konu/derinlik olarak ayrılmıştır.'],
    'Yöneticiye açıktır.',
    [
      c('#ana-add', 'Yeni analiz formunu açar.'),
      c('#af-url', 'Analiz edilecek gönderi adresini girer.'),
      c('#af-fetch', 'Bağlantıdan içerik çeker.'),
      c('#af-text', 'Paylaşım metnini girer.'),
      c('#af-file', 'Görsel ekler.'),
      c('#af-ai', 'AI analizini çalıştırır.'),
      c('#af-save', 'Analizi kaydeder.'),
      c('#at-add', 'Yeni trader ekler.')
    ]),
  mentoring: p('Mentoring',
    'Koçluk konuları ve birebir görüşme notları.',
    ['Davet durumu üstte gösterilir.',
     'Konular listelenir, seçilince detay açılır.',
     'Yeni konu formu başlık ve kaydet/iptal içerir.'],
    'Mentorluk izni olan üyelere açıktır.',
    [
      c('#mt-notice', 'Erişim ve davet durumunu gösterir.'),
      c('#mt-add-topic', 'Yeni koçluk konusu formunu açar.'),
      c('#mt-in-title', 'Konu başlığını girer.'),
      c('#mt-in-save', 'Konuyu kaydeder.'),
      c('#mt-in-cancel', 'Formu kapatır.')
    ]),
  pano: p('Çalışma Panosu',
    'Üyeye özel şifreli beyaz tahta; çizim, metin, görsel ve not alanı.',
    ['Araç çubuğunda seçim, kalem, şekil, metin ve silgi vardır.',
     'Renk ve kalınlık seçimi, geri al/yinele ve çoğalt/sil bulunur.',
     'Görsel ekleme, tam ekran ve yakınlaştırma kontrolleri üsttedir.'],
    'Referans erişimli üyelere açıktır; içerik şifreli ve hesaba özeldir.',
    [
      c('[data-tool]', 'Çizim aracını seçer: V, P, L, R, O, T, E, H.'),
      c('#pano-color', 'Aktif aracın rengini seçer.'),
      c('#pano-size', 'Kalem/kalınlık değerini ayarlar.'),
      c('#pano-undo', 'Son işlemi geri alır.'),
      c('#pano-redo', 'Geri alınan işlemi yineler.'),
      c('#pano-dup', 'Seçili nesneyi çoğaltır.'),
      c('#pano-del', 'Seçili nesneyi siler.'),
      c('#pano-img', 'Tuvale görsel ekler.'),
      c('#pano-zout', 'Görünümü yakınlaştırır.'),
      c('#pano-zin', 'Görünümü uzaklaştırır.'),
      c('#pano-zfit', 'Tuvali ekrana sığdırır.'),
      c('#pano-clear', 'Tüm panoyu temizler.'),
      c('#pano-save-status', 'Kayıt durumunu gösterir.')
    ]),
  indicators: p('İndikatörler',
    'Teknik indikatörlerin ne işe yaradığını anlatan kartlar.',
    ['Kartlar indikatör adı ve kısa açıklamasını içerir.',
     'Bu sayfa salt okunur; düzenleme kontrolü yoktur.'],
    'Yöneticiye açıktır.',
    [
      c('#ind-ind-list', 'İndikatör açıklama kartlarının üretildiği alan.')
    ]),
  designer: p('Alfa Designer',
    'Trader “vücudu” metaforuyla güçlü/zayıf yönleri ve AI sohbetini gösterir.',
    ['Organ haritası üzerinden bölge seçilince detay açılır.',
     'AI asistan paneli sohbet geçmişi ve hazır sorular içerir.'],
    'Yöneticiye açıktır.',
    [
      c('#ds-svg', 'Trader vücudu şemasını gösterir.'),
      c('#ds-markers', 'Güçlü/zayıf yön işaretlerini listeler.'),
      c('#ds-detail', 'Seçili bölgenin detayını açar.'),
      c('#ds-ai-chips', 'Hazır AI sorularını gösterir.'),
      c('#ds-ai-in', 'AI asistana soru yazar.'),
      c('#ds-ai-send', 'Soruyu AI asistana gönderir.'),
      c('#ds-ai-clear', 'Sohbet geçmişini temizler.')
    ]),
  onchain: p('Onchain',
    'Zincir üstü veri ve funding/CVD/OI panelleri.',
    ['Gösterge panelleri dinamik olarak üretilir.',
     'Bu sayfada statik düğme bulunmaz; içerik veri kartlarıdır.'],
    'Referans erişimli üyelere açıktır.',
    [
      c('#onchain-grid', 'Zincir üstü veri panellerinin üretildiği alan.')
    ]),
  calendar: p('Ekonomik Takvim',
    'Yüksek etkili makro takvim ve açıklanan sonuçları takip etme.',
    ['Yüksek etki / tümü filtresi ajandayı süzler.',
     'Yenileme düğmesi güncel veriyi çeker.',
     'Aynı veri ana sayfadaki ekonomik haber popover’ında da görünür.'],
    'Ücretsiz üyelere açıktır.',
    [
      c('#cal-imp-seg [data-imp]', 'Önem seviyesine göre filtreler.'),
      c('#cal-refresh', 'Takvim verisini yeniler.'),
      c('#cal-status', 'Son güncelleme durumunu gösterir.'),
      c('#cal-list', 'Yaklaşan ve gerçekleşen olayları listeler.')
    ]),
  basvuru: p('Alfa Ol / Başvurular',
    'Junior ve senior trader başvuru formları, PnL ekranları, başarılar ve SSS.',
    ['Junior ve senior formları ayrı alanlardadır.',
     'Başarı görselleri eklenip yöneticiye iletilir.',
     'İletişim bağlantıları sayfanın altındadır.'],
    'Yöneticiye açıktır.',
    [
      c('#jf-submit', 'Junior başvurusunu gönderir.'),
      c('#sr-submit', 'Senior başvurusunu gönderir.'),
      c('#sfx-add-btn', 'Başarı görseli ekleme penceresini açar.'),
      c('#sfx-url', 'Başarı gönderisi adresini girer.'),
      c('#sfx-file', 'Başarı ekran görüntüsünü yükler.'),
      c('#bas-ask-x', 'X üzerinden iletişim bağlantısını açar.'),
      c('#bas-ask-tg', 'Telegram iletişim bağlantısını açar.')
    ]),
  'chat-admin': p('Canlı Destek',
    'Yönetici-canlı destek konuşmalarını listeler ve yanıtlar.',
    ['Konuşmalar solda, mesajlar ortada, yanıt kutusu alttadır.',
     'Yanıt gönderildiğinde konuşma listede güncellenir.'],
    'Yöneticiye açıktır.',
    [
      c('#ca-list', 'Açık destek konuşmalarını listeler.'),
      c('#ca-input', 'Yanıt metnini yazar.'),
      c('#ca-send', 'Yanıtı gönderir.')
    ]),
  calc: p('Alfa Calculator',
    'FX, kripto ve altın için risk ve pozisyon büyüklüğü hesaplar.',
    ['Hesap bakiyesi ve risk yüzdesi/tutarı girilir.',
     'Enstrüman, giriş, stop ve kaldıraç parametreleri kullanılır.',
     'Lot, nominal tutar ve marj sonuçları anında güncellenir.'],
    'Ücretsiz üyelere açıktır.',
    [
      c('#accountBalance', 'Hesap bakiyesini girer.'),
      c('#riskType', 'Risk tipini yüzde veya tutar olarak seçer.'),
      c('#riskValue', 'Risk değerini girer.'),
      c('#instrument', 'Enstrümanı seçer.'),
      c('#entryPrice', 'Giriş fiyatını girer.'),
      c('#slPrice', 'Stop fiyatını girer.'),
      c('#leverage', 'Kaldıraç oranını girer.'),
      c('#resStandardLot', 'Hesaplanan standart lot sonucunu gösterir.'),
      c('#resPipValue', 'Pip değerini gösterir.')
    ]),
  alfa: p('Alfa Man',
    'Beslenme ve spor takibi; kalori, makro, yemek ve antrenman kayıtları.',
    ['TDEE hesabı için cinsiyet, yaş, boy, kilo, aktivite ve hedef girilir.',
     'Yemek ve antrenman listeleri haftalık görünümle desteklenir.',
     'Beslenme ve spor sekmeleri ayrıdır.'],
    'Yöneticiye açıktır.',
    [
      c('#am-tab-nut', 'Beslenme sekmesini açar.'),
      c('#am-tab-fit', 'Spor sekmesini açar.'),
      c('#am-goal', 'Kilo hedefini seçer.'),
      c('button[onclick="amCalcTdee()"]', 'Günlük kalori ihtiyacını hesaplar.'),
      c('#am-food-name', 'Yemek adını girer.'),
      c('#am-food-kcal', 'Yemek kalorisini girer.'),
      c('#am-ex-name', 'Antrenman adını girer.'),
      c('#am-ex-sets', 'Set sayısını girer.'),
      c('#am-plan', 'Hazır antrenman planını gösterir.')
    ]),
  apps: p('Başvurular (Admin)',
    'Gelen başvuru kayıtlarının listelendiği yönetici sayfası.',
    ['Liste başvuru özetlerini gösterir.',
     'Yenile butonu güncel kayıtları çeker.'],
    'Yöneticiye açıktır.',
    [
      c('#apps-list', 'Başvuru kayıtlarını listeler.'),
      c('#page-apps .path-btn', 'Başvuru listesini yeniler.')
    ]),
  ayna: p('Kişisel Günlük Asistan',
    'Onboarding, günlük/haftalık günlük, harita, koç, kurallar, arşiv ve ayarlar.',
    ['İlk açılışta ton seçimi ve tanışma akışı yürür.',
     'Ana uygulama sekmeleri today, map, coach, rules, archive, settings’tir.',
     'İçerik Ayna.render() ile dinamik üretilir.'],
    'Yöneticiye açıktır; ana sayfadaki kısayol da yöneticiye özeldir.',
    [
      c('#ay-ob-next', 'Onboarding’de sonraki adıma geçer.'),
      c('[data-tone]', 'Asistan tonunu seçer.'),
      c('#ay-tone-ok', 'Ton seçimini onaylar.'),
      c('#ay-ob-meet-start', 'Tanışma sohbetini başlatır.'),
      c('#ay-ob-send', 'Tanışma mesajını gönderir.'),
      c('#ay-tabs button[data-ay-tab]', 'Günlük, harita, koç, kurallar, arşiv veya ayarlar sekmesini açar.'),
      c('#ayna-flash', 'Kısa sistem bildirimini gösterir.')
    ]),
  erisim: p('Erişim / Borsanı Bağla',
    'Bybit/OKX referans akışı, UID doğrulama, premium durumu ve yönetici onay paneli.',
    ['Üç adımlı akış borsa seçimi, UID ve onaydır.',
     'Doğrulanmış referans üyeler için mentorship daveti görünür.',
     'Yönetici onayları ayrı panelde listelenir.'],
    'Erişim durumu yüklenene kadar hedef sayfa bekletilir.',
    [
      c('#acc-link-okx', 'OKX referans sayfasını açar.'),
      c('#acc-link-bybit', 'Bybit referans sayfasını açar.'),
      c('#acc-go', 'Bağlandıktan sonra hedef sayfaya döner.'),
      c('#acc-mentor-join', 'Mentorship davetini kabul eder.'),
      c('#acc-mentor-refresh', 'Davet durumunu yeniler.'),
      c('#acc-admin-refresh', 'Bekleyen onayları yeniler.'),
      c('#acc-ref-confirm', 'Referans kodunu onaylar.'),
      c('#acc-exchange', 'Borsayı seçer.'),
      c('#acc-uid', 'Borsa kullanıcı numarasını girer.'),
      c('#acc-submit', 'UID doğrulamasını gönderir.'),
      c('#acc-benefits', 'Açılacak özellikleri listeler.')
    ]),
  analitik: p('Ziyaretçi & Ürün Analitiği',
    'Ziyaretçi ve ürün metrikleri ile yönetici kısayolları.',
    ['Gün sayısı ve yönetici dahil etme filtresi vardır.',
     'Kısayollar İçerik Stüdyosu, Günlük Notlar, Eğitim Paketleri ve Başvurulara götürür.',
     'CRM alanı ayrı bir slotta yüklenir.'],
    'Yöneticiye açıktır.',
    [
      c('#ana-days', 'Analiz aralığındaki gün sayısını seçer.'),
      c('#ana-include-admin', 'Yönetici ziyaretlerini hesaba katar.'),
      c('#ana-refresh', 'Metrikleri yeniler.'),
      c('#ana-prune', 'Eski analiz kayıtlarını temizler.'),
      c('.ana-shortcut[data-ana-go]', 'İlgili yönetici sayfasına gider.')
    ])
};

function readPref() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      return { enabled: parsed.enabled === true, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null };
    }
  } catch (e) { /* localStorage kapalı olabilir */ }
  return { enabled: false, updatedAt: null };
}

function writePref(patch) {
  const next = Object.assign(readPref(), patch, { updatedAt: new Date().toISOString() });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
  return next;
}

function pageName() {
  try {
    const viaBody = document.body && document.body.dataset && document.body.dataset.page;
    if (viaBody) return viaBody;
    const viaUrl = new URLSearchParams(window.location.search).get('page');
    if (viaUrl) return viaUrl;
  } catch (e) {}
  return 'home';
}

function isVisible(el) {
  if (!el) return false;
  try {
    const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')) return false;
    if (el.closest && el.closest('.hidden, [hidden]')) return false;
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (rect && (rect.width === 0 && rect.height === 0)) return false;
  } catch (e) { return false; }
  return true;
}

function findTarget(selector, scope) {
  try {
    const nodes = scope.querySelectorAll(selector);
    for (const node of nodes) if (isVisible(node) && node.dataset.sgTipped !== '1') return node;
  } catch (e) {}
  return null;
}

function addTip(target, entry) {
  if (!target || !entry || !entry.tip) return;
  const tip = document.createElement('span');
  tip.className = 'sg-tip';
  tip.setAttribute('role', 'note');
  tip.setAttribute('aria-label', entry.tip);
  tip.dataset.sgSide = entry.side || 'right';
  tip.textContent = entry.tip;
  try {
    if (tip.dataset.sgSide === 'left') target.parentNode.insertBefore(tip, target);
    else target.parentNode.insertBefore(tip, target.nextSibling);
    target.dataset.sgTipped = '1';
    tipNodes.push({ tip, target });
  } catch (e) {}
}

function decorate(list, scope) {
  for (const entry of list) {
    const target = findTarget(entry.selector, scope);
    if (target) addTip(target, entry);
  }
}

function buildIntro(def) {
  const box = document.createElement('aside');
  box.className = 'sg-intro';
  box.setAttribute('role', 'note');
  box.setAttribute('aria-label', 'Sayfa rehberi');

  const kicker = document.createElement('div');
  kicker.className = 'sg-intro-kicker';
  kicker.textContent = 'Rehber · Bu sayfa';
  box.appendChild(kicker);

  const heading = document.createElement('h2');
  heading.textContent = def.title;
  box.appendChild(heading);

  const lead = document.createElement('p');
  lead.textContent = def.intro;
  box.appendChild(lead);

  if (def.points && def.points.length) {
    const ul = document.createElement('ul');
    for (const point of def.points) {
      const li = document.createElement('li');
      li.textContent = point;
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }

  if (def.foot) {
    const foot = document.createElement('p');
    foot.className = 'sg-intro-foot';
    foot.textContent = def.foot;
    box.appendChild(foot);
  }
  return box;
}

function clear() {
  for (const item of tipNodes) {
    try {
      if (item.tip.parentNode) item.tip.parentNode.removeChild(item.tip);
    } catch (e) {}
    try { delete item.target.dataset.sgTipped; } catch (e) {}
  }
  tipNodes = [];
  if (introNode && introNode.parentNode) {
    try { introNode.parentNode.removeChild(introNode); } catch (e) {}
  }
  introNode = null;
}

function pruneStaleTips() {
  for (let i = tipNodes.length - 1; i >= 0; i--) {
    const item = tipNodes[i];
    if (item.tip.parentNode && item.target.parentNode && item.target.dataset.sgTipped === '1') continue;
    try {
      if (item.tip.parentNode) item.tip.parentNode.removeChild(item.tip);
    } catch (e) {}
    try { delete item.target.dataset.sgTipped; } catch (e) {}
    tipNodes.splice(i, 1);
  }
}

function render(force = false) {
  if (rendering) return;
  rendering = true;
  const page = pageName();
  // Aynı sayfada tekrar çizim yapmak mouse wheel'i takar: düğümler sökülüp
  // takıldıkça tarayıcı scroll anchoring ile konumu geri çeker. Yalnızca
  // sayfa veya açık/kapalı durumu değiştiğinde tam yeniden çizim yap; aksi
  // halde eksik ipuçlarını ekle, DOM'dan çıkanları temizle.
  const full = force || !enabled || page !== renderedPage || !introNode || !introNode.parentNode;
  // Kendi DOM eklemelerimiz gözlemciyi yeniden tetiklemesin; aksi halde
  // her çizim bir sonraki çizimi kuyruğa alır ve ipuçları kaybolur.
  const wasObserving = !!(pageObserver || contentObserver);
  if (wasObserving) unobserve();
  try {
    if (full) {
      clear();
      renderedPage = page;
      if (!enabled) return;
      try { document.body.classList.add('sg-active'); } catch (e) {}
      decorate(GLOBAL, document);

      const def = PAGES[page];
      const container = document.getElementById('page-' + page);
      if (def && container) {
        introNode = buildIntro(def);
        container.insertBefore(introNode, container.firstChild);
        decorate(def.controls, container);
      }
    } else {
      pruneStaleTips();
      decorate(GLOBAL, document);
      const def = PAGES[page];
      const container = document.getElementById('page-' + page);
      if (def && container) decorate(def.controls, container);
    }
    syncToggles();
  } finally {
    rendering = false;
    if (wasObserving && enabled) observe();
  }
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  // rAF arka planda/sekme görünmezken çalışmadığı için zamanlayıcı kullan.
  setTimeout(() => { renderQueued = false; render(); }, 0);
}

function syncToggles() {
  try {
    document.querySelectorAll('.sg-toggle').forEach(btn => {
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      btn.setAttribute('aria-label', enabled ? 'Rehber modunu kapat' : 'Rehber modunu aç');
      const label = btn.querySelector('.sg-toggle-label');
      if (label) label.textContent = enabled ? 'Rehberi kapat' : 'Rehber';
    });
  } catch (e) {}
}

function observe() {
  try {
    if (!pageObserver && window.MutationObserver && document.body) {
      pageObserver = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.attributeName === 'data-page') { queueRender(); return; }
          if (m.attributeName === 'class') {
            // nav-autohide her scroll'da body class'ını değiştirir. Bunu
            // yeniden çizim sayarsak her tekerlek hareketinde DOM sökülüp
            // takılır ve sayfa kaydırması takılır. Sadece gerçek görünürlük
            // değişimlerini (landing, tema, gating) dikkate al.
            const meaningful = s => (s || '').split(/\s+/)
              .filter(c => c && c !== 'nav-scrolled' && c !== 'nav-peek')
              .sort().join(' ');
            if (meaningful(m.oldValue) !== meaningful(document.body.className)) {
              queueRender();
              return;
            }
          }
        }
      });
      // class değişimi (landing kapanması, tema, gating) de görünürlüğü
      // değiştirdiği için izlenir; scroll kaynaklı nav sınıfları yoksayılır.
      pageObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-page', 'class'],
        attributeOldValue: true
      });
    }
    if (!contentObserver && window.MutationObserver) {
      contentObserver = new MutationObserver(mutations => {
        if (rendering) return;
        for (const m of mutations) {
          const target = m.target;
          if (target && target.closest && target.closest('.sg-tip, .sg-intro')) continue;
          queueRender();
          return;
        }
      });
      const container = document.getElementById('page-' + pageName());
      if (container) contentObserver.observe(container, { childList: true, subtree: true });
    }
  } catch (e) {}
}

function unobserve() {
  try { if (pageObserver) pageObserver.disconnect(); } catch (e) {}
  try { if (contentObserver) contentObserver.disconnect(); } catch (e) {}
  pageObserver = null;
  contentObserver = null;
}

function apply() {
  if (enabled) {
    render(true);
    observe();
  } else {
    unobserve();
    clear();
    try { document.body.classList.remove('sg-active'); } catch (e) {}
    syncToggles();
  }
}

function closeMobileNav() {
  // Mobil menü açıkken rehber açılırsa arka plandaki sayfa kaydırılamaz;
  // çekmeceyi ve perdeyi kapat ki içerik hemen kaydırılabilsin.
  try {
    const mnav = document.getElementById('nav-mobile');
    const backdrop = document.getElementById('nav-mobile-backdrop');
    const menuBtn = document.getElementById('nav-mobile-btn');
    if (mnav) mnav.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  } catch (e) {}
}

function setEnabled(next) {
  enabled = next === true;
  closeMobileNav();
  writePref({ enabled });
  apply();
  return enabled;
}

function bind() {
  try {
    document.querySelectorAll('.sg-toggle').forEach(btn => {
      btn.addEventListener('click', () => setEnabled(!enabled));
    });
    window.addEventListener('popstate', queueRender);
    window.addEventListener('hashchange', queueRender);
  } catch (e) {}
}

window.AlfaSiteGuide = Object.freeze({
  setEnabled,
  isEnabled: () => enabled,
  getPreference: readPref,
  currentPage: pageName,
  renderedPage: () => renderedPage,
  pageIds: Object.keys(PAGES),
  pages: PAGES,
  globalControls: GLOBAL,
  render: queueRender,
  addTipForTest: addTip,
  visibleForTest: isVisible
});

enabled = readPref().enabled;
bind();
apply();
