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

// Sağdaki detay kartı tek bir düğümdür; hover/focus olaylarında DOM yeniden
// çizilmez, sadece kartın metni güncellenir (scroll anchoring bozulmasın).
let detailCard = null;
let activeTarget = null;
let detailPinned = false;
let showTimer = null;
let expandTimer = null;
let hideTimer = null;
let touchTimer = null;
let touchStart = null;
let tipSeq = 0;

/* Kısa tanımlar: c(selector, tip, side) ve p(title, intro, points, foot, controls). */
function c(selector, tip, side = 'right') { return { selector, tip, side }; }
function p(title, intro, points, foot, controls) { return { title, intro, points, foot, controls }; }

/* Hemen her sayfada görünen üst menü ve araçlar. */
const GLOBAL = [
  c('#nav-home', 'Ana menüye döner; günlük panel ve hızlı kartlar burada.', 'left'),
  c('#whats-new-btn-app', 'Son eklenen özelliklerin listesini açar.', 'left'),
  c('#lang-btn-app', 'Site dilini Türkçe / İngilizce arasında değiştirir.', 'left'),
  c('#nav-live', 'Şu an sitede kaç kişi olduğunu gösterir.', 'right'),
  c('#economic-news-trigger', 'Ekonomik takvim ve yüksek etkili haberleri açar.', 'right'),
  c('#home-magazine-link', 'Haftalık derginin tamamını yeni sayfada açar.', 'right'),
  c('#tab-portfoy', 'Portföy menüsünü açar: Alfa Portföy ve kendi Portföyüm.', 'left'),
  c('#tab-defter', 'İşlem öncesi kontrol listesi ve işlem kayıtları.', 'left'),
  c('#tab-review', 'Haftalık performans ve retrospektif değerlendirme.', 'left'),
  c('#tab-calc', 'Risk ve pozisyon büyüklüğü hesaplayıcı.', 'left'),
  c('#tab-ek', 'Diğer modüllere giden kısayol kartları.', 'left'),
  c('#tab-erisim', 'Borsa bağlama, UID doğrulama ve premium durumu.', 'left'),
  c('#tab-analitik', 'Ziyaretçi ve ürün metrikleri; yöneticiye açıktır.', 'left'),
  c('.edu-partners button', 'Partner akışının otomatik geçişini duraklatır/sürdürür.', 'block'),
  c('.edu-partner-logo.okx', 'OKX referans linkiyle kayıt olur.', 'block'),
  c('.edu-partner-logo.bybit', 'Bybit referans linkiyle kayıt olur.', 'block'),
  c('.edu-partner-logo.breakout', 'Breakout’a ALFA partner koduyla gider.', 'block'),
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
    'Ücretsiz üyelere açıktır. Başvuru düğmeleri ödeme almaz; onay işlemi manuel yapılır.',
    [
      c('#eduplans-root', 'Paket kartlarının ve açıklamaların üretildiği alan.'),
      c('.eduplans-actions button', 'Paket kartlarına kaydırarak karşılaştırmaya başlar.'),
      c('.eduplans-actions a', 'Onaylı eğitimin varsa Alfa Edu derslerine götürür.'),
      c('.eduplan[data-plan]', 'Paket kartı; seviye, fiyat ve içerik hakkını gösterir.'),
      c('.eduplan-live-details summary', 'Canlı derste işlenen konuları açıp kapatır.'),
      c('[data-edu-apply][data-edu-route]', 'Seçilen katılım yoluna göre bilgi formunu açar.'),
      c('.eduplans-code button', 'ALFA partner kodunu panoya kopyalar.'),
      c('.eduplans-term summary', 'Sık sorulan sorunun kısa cevabını açıp kapatır.'),
      c('.eduplans-faq-title', 'Sık sorulan sorular bölümünün başlığıdır.')
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
      c('#hf-cta', 'Erişim durumuna göre portföyü veya borsa bağlamayı açar.'),
      c('#hmr-collapse', 'Haftalık dergi okuyucusunu daraltır veya genişletir.'),
      c('#hmr-prev', 'Haftalık dergide önceki haftaya geçer.'),
      c('#hmr-next', 'Haftalık dergide sonraki haftaya geçer.'),
      c('#home-daily-refresh', 'Günlük notları yeniden yükler.'),
      c('#daily-tasks-panel', 'Günlük görevleri, XP ve seri durumunu gösterir.'),
      c('#dt-remind', 'Görev hatırlatıcısını ayarlar.'),
      c('#dt-add', 'Kendi görevine yeni bir satır ekler.'),
      c('#home-find', 'Sayfa ve konu aramasını açar.'),
      c('#home-quick', 'Hızlı erişim kartlarını gösterir.'),
      c('#ht-cta', 'Portföy özetinden ilgili detay sayfasına geçer.'),
      c('#home-guide', '4 adımlı başlangıç kontrol listesini gösterir.'),
      c('#hg-steps .hg-step', 'Başlangıç adımını açar veya ilgili sayfaya götürür.'),
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
      c('#bd-typeseg button', 'Tümü, gelir veya gider filtresini seçer.'),
      c('#bd-catf', 'Seçili kategoriye göre listeyi süzler.'),
      c('#bd-q', 'Kayıt açıklamalarında arama yapar.'),
      c('#bd-import-btn', 'Ekstre/PDF içe aktarma panelini açar.'),
      c('#bd-import-parse', 'Yüklenen metni kayıtlara ayırır.'),
      c('#bd-import-commit', 'Ayrıştırılan kayıtları onaylar.'),
      c('#bd-quick-type button', 'Hızlı kaydı gelir veya gider olarak işaretler.'),
      c('#bd-quick-amount', 'Hızlı kayıt tutarını girer.'),
      c('#bd-quick-cat', 'Hızlı kaydın kategorisini seçer.'),
      c('#bd-quick-note', 'Hızlı kayda kısa açıklama ekler.'),
      c('#bd-quick-save', 'Hızlı kaydı listeye ekler.'),
      c('#bd-list', 'Ayın işlem kayıtlarını listeler.'),
      c('[data-bedit]', 'Satırı düzenlemek için detaylı formu açar.'),
      c('[data-bdel]', 'Satırı siler; onay penceresi çıkar.'),
      c('#bd-form-date', 'Kaydın hangi aya sayılacağını belirler.'),
      c('#bd-form-amount', 'Detaylı kayıt tutarını girer.'),
      c('#bd-form-cat', 'Detaylı kayıt için kategori seçer.'),
      c('#bd-newcat-add', 'Yeni kategori oluşturur ve seçer.'),
      c('#bd-save', 'Detaylı gelir/gider formunu kaydeder.'),
      c('#bd-cancel', 'Detaylı formu kaydetmeden kapatır.'),
      c('#bd-clear-cat', 'Kategori filtresini temizler.')
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
      c('#edu-search', 'Kurs ve konu arar.'),
      c('#edu-grid', 'Kurs kartlarının üretildiği alan.'),
      c('.edu-card[data-course]', 'Kurs kartı; eğitmeni ve seviyeyi gösterir.'),
      c('.edu-play', 'Kursu açıp dersleri oynatır.'),
      c('#edu-empty', 'Aramaya uygun kurs bulunamadığında görünür.'),
      c('#edu-manage-toggle', 'Yönetici içerik araçlarını açıp kapatır.'),
      c('#edu-daily-refresh', 'Günlük notları yeniler.'),
      c('#edu-daily-more', 'Daha eski günlük notları gösterir.'),
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

/* Zengin açıklamalar: kısa ipucunun altına adım adım anlatım ekler.
   Burada tanımlanmayan kontroller için sayfa rehberinin intro/maddeleri
   kullanılır; böylece 35 sayfanın tamamında kart çalışır. */
const DETAILS = {};
function d(selector, title, body, steps) { DETAILS[selector] = { title, body, steps: steps || [] }; }

/* Ortak kontroller */
d('#nav-home', 'Ana menüye dön', 'Günlük kontrol panelini açar. Sabah kartı, haberler, görevler ve hızlı kartlar buradadır.', [
  'Başka bir sayfadayken bile bu düğme ana ekrana döndürür.',
  'Ana sayfadaki adımları tamamlayarak siteyi tanımaya devam et.'
]);
d('#whats-new-btn-app', 'Yeni özellikler', 'Siteye eklenen son değişikliklerin listesini gösterir; okundu bilgisi saklanır.', [
  'Düğmeye bas, listedeki yenilikleri oku.',
  'Kapatınca rozet söner; yeni bir özellik eklenince tekrar yanar.'
]);
d('#lang-btn-app', 'Dil değiştir', 'Arayüzü Türkçe ve İngilizce arasında değiştirir; tercihin sonraki ziyaretlerde korunur.', []);
d('#nav-live', 'Canlı kullanıcı sayısı', 'Şu anda sitede bulunan kişi sayısını gösterir. İşlem sinyali değildir.', []);
d('.edu-partners button', 'Partner akışını duraklat', 'Logolar otomatik kayar. İncelemek için akışı duraklat, tekrar başlatmak için aynı düğmeye bas.', []);
d('.edu-partner-logo.okx', 'OKX referans linki', 'OKX’e referans kodunla gider. Kayıt olmadan önce kodun doğrulandığından emin ol.', []);
d('.edu-partner-logo.bybit', 'Bybit referans linki', 'Bybit’e referans kodunla gider. Partner koşulları ilgili borsaya aittir.', []);
d('.edu-partner-logo.breakout', 'Breakout partner linki', 'Breakout resmî sitesine ALFA partner koduyla gider; hesap uygunluğu ayrıca incelenir.', []);

/* Ana sayfa */
d('#mc-card', 'Sabah kartı', 'Günlük ruh halini ve işlem öncesi kriterlerini kaydeder. Seri ve günlük puan buradan beslenir.', [
  'Sabah kartını aç.',
  'Ruh halini ve hazır olup olmadığını işaretle.',
  'Kaydettiğinde günlük seriye ve karneye işlenir.'
]);
d('#mc-edit', 'Sabah kartını düzenle', 'Karttaki soruları ve seçenekleri değiştirir; varsayılan akışı bozmak istemiyorsan dokunma.', []);
d('#mc-chip', 'Küçük kartı geri getir', 'Sabah kartını kapattıysan küçük hatırlatıcıyı tekrar gösterir.', []);
d('#hf-news', 'Günün haberi', 'Ekonomik gündemin kısa özetini popover içinde açar; ekonomik takvim tetikleyicisiyle aynı veriyi kullanır.', []);
d('#hf-cta', 'Odak kartının aksiyonu', 'Erişim durumuna göre portföyü açar veya borsa bağlama sayfasına yönlendirir.', []);
d('#hmr-prev', 'Önceki hafta', 'Haftalık dergide bir önceki haftanın yazılarına geçer.', []);
d('#hmr-next', 'Sonraki hafta', 'Haftalık dergide bir sonraki haftanın yazılarına geçer.', []);
d('#home-daily-refresh', 'Günlük notları yenile', 'Telegram’dan gelen eğitsel notları yeniden çeker; yeni not varsa listeye ekler.', []);
d('#daily-tasks-panel', 'Günlük görevler', 'Gün içi alışkanlıkları takip eder. Bitirdikçe XP ve seri kazanırsın; veri bu cihazda tutulur.', [
  'Bugünün görevlerini oku.',
  'Tamamladıklarını işaretle.',
  'İstersen hatırlatıcıyı aç; XP ve seviye otomatik güncellenir.'
]);
d('#dt-remind', 'Görev hatırlatıcısı', 'Günlük görevler için saatli hatırlatıcıyı açar veya kapatır.', []);
d('#home-find', 'Hızlı arama', 'Sayfa, konu ve eğitim arar. Yazmaya başla, sonuçlardan birini seç.', []);
d('#home-quick', 'Hızlı erişim kartları', 'En çok kullanılan modüllere kısayol içerir; kartlara dokunarak ilgili sayfaya git.', []);
d('#economic-news-trigger', 'Ekonomik takvim', 'Yüksek etkili makro olayları ve açıklanan sonuçları gösterir.', []);
d('#home-guide', 'Başlangıç rehberi', 'Siteyi kullanmaya başlamak için dört adımlı kontrol listesi. Adımlar tamamlandıkça çubuk dolar.', [
  'Giriş yap veya erişim kodunu doğrula.',
  'Günlük notlardan birini oku.',
  'Hızlı kartlardan bir modüle git.',
  'Adımlar tamamlandıkça sayacın 4 / 4 olduğunu gör.'
]);
d('#hg-steps .hg-step', 'Başlangıç adımı', 'Adıma dokunduğunda ilgili yere gider: giriş, borsa bağlama, günlük notlar veya hızlı kartlar.', []);
d('#home-top', 'Yukarı çık', 'Uzun sayfalarda başa dönmek için kullanılır.', []);

/* Gelir / Gider */
d('#bd-eye', 'Tutarları gizle/göster', 'Ekrandaki tutarları gizler; yanındaki insanlar varsa kullan. Veriler silinmez.', []);
d('#bd-prev', 'Önceki ay', 'Bir önceki ayın gelir/gider kayıtlarına geçer.', []);
d('#bd-next', 'Sonraki ay', 'Bir sonraki ayın kayıtlarına geçer.', []);
d('#bd-today', 'Bugünün ayı', 'Filtreleri temizleyip içinde bulunulan aya döner.', []);
d('#bd-quick-type button', 'Gelir / gider türü', 'Hızlı kaydın türünü seçer. Gelir artı, gider eksi olarak hesaplanır.', [
  'Gelir veya Gider düğmesine bas.',
  'Tutarı yaz, kategoriyi seç.',
  'Enter’a bas veya ＋ Ekle’ye dokun.'
]);
d('#bd-quick-amount', 'Hızlı kayıt tutarı', 'Kayıt tutarını girer. Ondalık için virgül veya nokta kullanılabilir.', [
  'Tutarı yaz (örn. 249,90).',
  'Kategoriyi seçip Enter’a bas.',
  'Kayıt hemen aşağıdaki İşlemler listesine düşer.'
]);
d('#bd-quick-cat', 'Hızlı kayıt kategorisi', 'Harcamanın hangi kalemde görüneceğini belirler; pasta grafiği buna göre güncellenir.', []);
d('#bd-quick-note', 'Hızlı kayıt açıklaması', 'İsteğe bağlı kısa not. Sonradan listede arama yaparken işine yarar.', []);
d('#bd-quick-save', 'Hızlı kaydı ekle', 'Tutar, tür ve kategori geçerliyse kaydı listeye ekler; alanları temizler.', [
  'Türü seç.',
  'Tutarı yaz ve kategoriyi belirle.',
  '＋ Ekle’ye bas; onay mesajını gör.'
]);
d('#bd-typeseg button', 'Kayıt türü filtresi', 'Listede sadece gelirleri veya sadece giderleri gösterir.', []);
d('#bd-catf', 'Kategori filtresi', 'Seçtiğin kategoriye ait kayıtları listeler; grafiğe tıklayarak da aynı filtre uygulanır.', []);
d('#bd-q', 'Kayıtlarda ara', 'Açıklama veya kategori içinde arama yapar.', []);
d('#bd-clear-cat', 'Filtreyi temizle', 'Kategori filtresini kaldırır ve tüm kayıtları gösterir.', []);
d('#bd-list', 'İşlem listesi', 'Ayın kayıtlarını gösterir. Satırdaki ✎ düzenler, ✕ siler.', [
  'Yeni kayıt için yukarıdaki Hızlı Kayıt alanını kullan.',
  'Düzenlemek için satırdaki kalem simgesine bas.',
  'Silmek için ✕ simgesine bas ve onayla.'
]);
d('[data-bedit]', 'Kaydı düzenle', 'Detaylı formu seçili kayıtla açar; tutar, tarih, kategori ve notu değiştirebilirsin.', [
  'Kalem simgesine bas.',
  'Formdaki alanları güncelle.',
  'Kaydet’e bas; liste ve grafik yenilenir.'
]);
d('[data-bdel]', 'Kaydı sil', 'Seçili gelir/gider kaydını siler. Onay penceresi çıkar; veri geri alınamaz.', [
  'Satırdaki ✕ simgesine bas.',
  'Onay penceresinde eminsen Tamam de.',
  'Kayıt listeden ve grafikten kalkar.'
]);
d('#bd-save', 'Detaylı formu kaydet', 'Tutar, kategori ve tarih doluysa kaydı oluşturur veya açık kaydı günceller.', [
  'Türü, tarihi, kategoriyi ve tutarı doldur.',
  'İstersen açıklama ekle.',
  'Kaydet’e bas.'
]);
d('#bd-form-date', 'Kayıt tarihi', 'Kaydın hangi aya sayılacağını belirler. Farklı bir aya kaydederse takvim otomatik oraya geçer.', []);
d('#bd-form-amount', 'Detaylı tutar', 'Kayıt tutarını girer. Sıfırdan büyük olmalı; aksi hâlde uyarı gösterilir.', []);
d('#bd-form-cat', 'Detaylı kategori', 'Kayıt için kategori seçer. Yeni kategori eklemek için altındaki alayı kullan.', []);
d('#bd-newcat-add', 'Yeni kategori ekle', 'Listede olmayan bir harcama kalemi oluşturur ve hemen seçer.', []);
d('#bd-cancel', 'Formdan vazgeç', 'Detaylı formu kapatır; yaptığın değişiklikler kaydedilmez.', []);
d('#bd-import-btn', 'Ekstre içe aktar', 'CSV, banka metni, PDF veya fotoğraftan toplu kayıt çıkarma panelini açar.', [
  'İçe Aktar’a bas.',
  'CSV metnini yapıştır veya dosya seç.',
  'Önizle ile kontrol et, sonra Onayla ve Ekle’ye bas.'
]);
d('#bd-import-parse', 'İçe aktarma önizlemesi', 'Metni kayıtlara ayırır ve eklemeden önce listeler; hatalı satırları burada görürsün.', []);
d('#bd-import-commit', 'İçe aktarmayı onayla', 'Önizlenen kayıtları listeye ekler. Önizleme yapmadan düğme etkin değildir.', []);
d('#bd-pf-refresh', 'Portföyü yenile', 'Yatırım pozisyonlarının güncel fiyatlarını çeker.', []);
d('#bd-pf-add', 'Pozisyon ekle', 'Yeni yatırım pozisyonu formunu açar.', []);
d('#bd-pl-sync', 'Uzun vadeli planı eşitle', 'Plan rakamlarını güncel portföy ve kayıtlarla hizalar.', []);

/* Eğitim paketleri */
d('#eduplans-root', 'Eğitim paketleri sayfası', 'Video, canlı ve birebir paketleri karşılaştırır; katılım yolu ve onay akışını anlatır.', [
  'Önce paket kartlarını oku; üst paket önceki hakları da içerir.',
  'USDT/TRC20 veya Breakout yolundan birini seç.',
  'Bilgilerini gönder; ödeme alınmaz, erişim manuel onaylanır.',
  'Onaydan sonra Mevcut derslerime git bağlantısıyla eğitime geç.'
]);
d('.eduplans-actions button', 'Paket seçmeye git', 'Sayfayı paket kartlarına kaydırır; karşılaştırmayı oradan yap.', []);
d('.eduplans-actions a', 'Mevcut dersler', 'Eğitim paketin zaten onaylıysa Alfa Edu derslerine götürür.', [
  'Eğitim Paketleri sayfasındaki Mevcut derslerime git bağlantısına dokun.',
  'Açılan Alfa Edu sayfasından kaldığın derse devam et.'
]);
d('.eduplan[data-plan]', 'Paket kartı', 'Seviyeyi, fiyatı ve hakları gösterir. “Canlıda neler var?” bağlantısı detayı açar.', [
  'Karttaki hakları oku.',
  'Canlı veya birebir ders detayını aç.',
  'Uygunsan altındaki katılım düğmelerinden birini seç.'
]);
d('.eduplan-live-details summary', 'Canlı eğitim detayı', 'Canlı derste işlenen konuları, market analizi ve soru-cevap akışını açıklar.', []);
d('[data-edu-apply][data-edu-route]', 'Katılım yolunu seç', 'Seçilen paket için USDT, Breakout veya 100K bildirim akışını başlatır.', [
  'Paket kartındaki katılım düğmesine bas.',
  'Açılan formda istenen bilgileri gönder.',
  'Onay sonucunu siteden takip et; form göndermek erişim açmaz.'
]);
d('.eduplans-code button', 'ALFA kodunu kopyala', 'Breakout kaydında kullanılacak partner kodunu panoya kopyalar.', []);
d('.eduplans-term summary', 'Sık sorulan soru', 'Video hakkı, grup devamı, özel ders ve onay akışı hakkında kısa cevabı açar.', []);

/* Eğitim alanı */
d('#edu-browse', 'Kurs kataloğu', 'Tüm kursları ve konu başlıklarını listeler; seviye filtreleriyle daraltabilirsin.', [
  'Kataloğu aç.',
  'Arama veya erişim filtresiyle kursu bul.',
  'Kursu açıp konuları sırayla ilerlet.'
]);
d('#edu-continue', 'Kaldığın dersler', 'Yarım kalan konulara hızlı dönüş sağlar.', []);
d('#edu-access-tabs [data-access]', 'Erişim filtresi', 'Ücretsiz, referans veya premium gibi seviyelere göre içerik gösterir.', []);
d('#edu-search', 'Eğitimde ara', 'Kurs, konu ve günlük not içeriklerinde arar.', []);
d('#edu-daily-more', 'Eski günlük notlar', 'Daha önceki eğitsel paylaşımları listeler.', []);
d('#eg-done', 'Konuyu tamamla', 'Açık konuyu tamamlandı olarak işaretler; ilerleme takibine eklenir.', []);

/* Defter */
d('#btn-long', 'Long yönü', 'İşlem yönünü uzun olarak seçer; skor ve senaryo buna göre hesaplanır.', []);
d('#btn-short', 'Short yönü', 'İşlem yönünü kısa olarak seçer; skor ve senaryo buna göre hesaplanır.', []);
d('#pair-confirm', 'Pariteyi onayla', 'Seçilen enstrümanı plana bağlar; onaylamadan kayıt anlamlı olmaz.', []);
d('#mood-range', 'Duygu durumu', 'İşlem öncesi ruh halini işaretler; disiplin skoruna yansır.', []);
d('#d-save', 'Günlük planı kaydet', 'Kriterler, yön ve duygu durumuyla birlikte planı deftere yazar.', [
  'Parite ve yönü seç.',
  'Kriterleri puanla, duygu durumunu işaretle.',
  'Kaydet’e bas; karar skorunu gör.'
]);
d('#btn-logtrade', 'Planı işleme çevir', 'Kaydedilmiş planı işlem kaydına dönüştürür; giriş/çıkış ve sonuç alanlarını doldur.', []);
d('#btn-ghost-save', 'İşlem yapmadım', 'Planı tuttuğunu ama işlem açmadığını kaydeder; disiplin serisi korunur.', []);
d('#btn-reset', 'Formu sıfırla', 'Formdaki seçimleri temizler; kayıtlı planları silmez.', []);
d('#btn-export', 'Kayıtları dışa aktar', 'İşlem kayıtlarını dosya olarak indirir; yedekleme için kullan.', []);
d('#ls-btn-add', 'Ders ekle', 'Ders defterine yeni bir öğrenme notu ekler.', []);

/* Erişim */
d('#acc-link-okx', 'OKX’e git', 'Referans bağlantısıyla OKX kayıt sayfasını açar; UID doğrulaması için önce kayıt gerekir.', []);
d('#acc-link-bybit', 'Bybit’e git', 'Referans bağlantısıyla Bybit kayıt sayfasını açar.', []);
d('#acc-exchange', 'Borsa seç', 'Doğrulama yapılacak borsayı seçer; sonraki alanlar buna göre güncellenir.', []);
d('#acc-uid', 'Borsa UID', 'Kayıt olduğun borsadaki kullanıcı numaranı girer. Yanlış UID onayı geciktirir.', []);
d('#acc-submit', 'UID doğrulat', 'Borsa ve UID bilgisini onaya gönderir; durum buradan takip edilir.', [
  'Borsaya referans linkinden kayıt ol.',
  'UID’ni kopyala ve alana yapıştır.',
  'Gönder’e bas; onay panelinde durumu izle.'
]);
d('#acc-ref-confirm', 'Referans kodunu onayla', 'Kullandığın referans kodunu doğrular; eşleşmezse erişim açılmaz.', []);
d('#acc-go', 'Hedef sayfaya dön', 'Doğrulama tamamlandıktan sonra kaldığın sayfaya döndürür.', []);
d('#acc-benefits', 'Açılacak özellikler', 'Onay sonrası erişeceğin modülleri listeler.', []);

/* Risk hesaplayıcı */
d('#accountBalance', 'Hesap bakiyesi', 'Risk yüzdesinin hangi tutar üzerinden hesaplanacağını belirler.', []);
d('#riskType', 'Risk tipi', 'Riski yüzde veya sabit tutar olarak vermeni sağlar.', []);
d('#riskValue', 'Risk değeri', 'Yüzde ya da para tutarı olarak max riski girer.', []);
d('#instrument', 'Enstrüman', 'FX, kripto veya altın seçimine göre pip ve lot hesabı değişir.', []);
d('#entryPrice', 'Giriş fiyatı', 'Pozisyonun açılacağı seviyeyi girer.', []);
d('#slPrice', 'Stop fiyatı', 'Stop seviyesini girer; girişle arasındaki mesafe riski belirler.', []);
d('#leverage', 'Kaldıraç', 'Marj ve nominal tutar hesabında kullanılır; riski değiştirmez.', []);
d('#resStandardLot', 'Standart lot', 'Girdiğin riske göre hesaplanan lot büyüklüğünü gösterir.', []);
d('#resPipValue', 'Pip değeri', 'Seçili enstrümanda bir pip’in parasal karşılığını gösterir.', []);

/* Portföy */
d('#ap2-tab-alpha', 'Alfa Portföy', 'Paylaşılan örnek portföyün özetini açar; pozisyon detayı premium kapısının arkasındadır.', []);
d('#ap2-tab-mine', 'Portföyüm', 'Yalnızca bu cihazda saklanan kişisel portföyünü açar.', []);
d('#ap2-add', 'Enstrüman ekle', 'Takip edilecek yeni enstrümanı portföye ekler.', []);
d('#ap2-gate-verify', 'Premium kodu doğrula', 'Alfa Portföy detayını açan erişim kodunu kontrol eder.', []);
d('#mp-new', 'Yeni portföy', 'Kişisel portföylerinden bir yenisini oluşturur.', []);
d('#mp-add', 'Pozisyon ekle', 'Seçili kişisel portföye yeni pozisyon ekler.', []);
d('#mp-delete', 'Portföyü sil', 'Seçili kişisel portföyü cihazdan kaldırır; onay ister.', []);
d('#home-magazine-link', 'Derginin tamamı', 'Haftalık dergiyi okumak için ayrı sayfaya götürür.', []);
d('#hmr-collapse', 'Dergi okuyucusunu katla', 'Önizleme alanını daraltıp genişletir; sayfada daha az yer kaplar.', []);
d('#dt-add', 'Görev ekle', 'Kendi günlük görevini listeye ekler; tamamlayınca XP kazanırsın.', []);
d('#ht-cta', 'Portföy özeti', 'Ana sayfadaki kısa portföy kartından ilgili detay sayfasına geçer.', []);
d('.edu-card[data-course]', 'Kurs kartı', 'Eğitmen, seviye ve açılış durumunu gösterir; oynat düğmesiyle derse girilir.', [
  'Kartı bul ve açıklamasını oku.',
  'Oynat düğmesine bas.',
  'Konuları sırayla ilerlet, tamamlananları işaretle.'
]);
d('.edu-play', 'Dersi oynat', 'Kursu açar ve video/konu akışına geçer.', []);
d('#edu-grid', 'Kurs listesi', 'Filtrelere uyan kurs kartlarını gösterir.', []);
d('#edu-empty', 'Kurs bulunamadı', 'Arama veya filtre sonucu boşsa görünür; farklı bir kelime dene.', []);
d('#edu-manage-toggle', 'Yönetici araçları', 'İçerik düzenleme kontrollerini gösterir; yönetici erişimi gerekir.', []);

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
  tip.id = 'sg-tip-' + (++tipSeq);
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-label', entry.tip);
  tip.dataset.sgSide = entry.side || 'right';
  tip.textContent = entry.tip;
  try {
    if (tip.dataset.sgSide === 'left') target.parentNode.insertBefore(tip, target);
    else target.parentNode.insertBefore(tip, target.nextSibling);
    target.dataset.sgTipped = '1';
    target.dataset.sgKey = entry.selector;
    target.dataset.sgTip = entry.tip;
    target.setAttribute('aria-describedby', tip.id);
    tipNodes.push({ tip, target, tipId: tip.id });
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

/* --- Sağdaki detay kartı ------------------------------------------------ */
function node(tag, cls, content) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (content !== undefined) n.textContent = content;
  return n;
}

function ensureCard() {
  if (detailCard && detailCard.parentNode) return detailCard;
  const card = node('div', 'sg-detail');
  card.setAttribute('role', 'note');
  card.setAttribute('aria-live', 'polite');
  card.setAttribute('aria-label', 'Rehber detayı');

  const head = node('div', 'sg-detail-head');
  head.appendChild(node('span', 'sg-detail-kicker', 'Rehber · Detay'));
  const pin = node('button', 'sg-detail-pin', '☆');
  pin.type = 'button';
  pin.title = 'Kartı sabitle';
  pin.setAttribute('aria-label', 'Kartı sabitle');
  pin.setAttribute('aria-pressed', 'false');
  pin.onclick = () => {
    detailPinned = !detailPinned;
    pin.textContent = detailPinned ? '★' : '☆';
    pin.title = detailPinned ? 'Sabitlemeyi kaldır' : 'Kartı sabitle';
    pin.setAttribute('aria-label', pin.title);
    pin.setAttribute('aria-pressed', String(detailPinned));
    card.classList.toggle('is-pinned', detailPinned);
    if (detailPinned) clearTimeout(hideTimer);
    else scheduleHide();
  };
  const close = node('button', 'sg-detail-close', '✕');
  close.type = 'button';
  close.title = 'Detay kartını kapat';
  close.setAttribute('aria-label', 'Detay kartını kapat');
  close.onclick = () => { detailPinned = false; hideDetail(true); };
  head.appendChild(pin);
  head.appendChild(close);
  card.appendChild(head);

  card.appendChild(node('div', 'sg-detail-page'));
  card.appendChild(node('h3', 'sg-detail-title'));
  card.appendChild(node('p', 'sg-detail-short'));
  card.appendChild(node('p', 'sg-detail-body'));
  card.appendChild(node('ol', 'sg-detail-steps'));
  card.appendChild(node('p', 'sg-detail-foot',
    'Kısa bakış için üzerine gel; uzunca durursan adımlar açılır. Klavyede odaklanabilir, mobilde basılı tutabilirsin.'));

  card.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  card.addEventListener('pointerleave', () => { if (!detailPinned) scheduleHide(180); });
  try { document.body.appendChild(card); detailCard = card; } catch (e) { detailCard = null; }
  return detailCard;
}

function setCardText(cls, value) {
  if (!detailCard) return;
  const target = detailCard.querySelector(cls);
  if (target) target.textContent = value || '';
}

function labelFor(target) {
  if (!target) return 'Bu öğe';
  const raw = target.getAttribute && (target.getAttribute('aria-label') || target.getAttribute('title') || target.getAttribute('placeholder'))
    || target.textContent || target.id || '';
  return String(raw).replace(/\s+/g, ' ').trim().slice(0, 70) || 'Bu öğe';
}

function collectData(target) {
  const def = PAGES[pageName()];
  const key = target && target.dataset ? target.dataset.sgKey : '';
  const rich = DETAILS[key];
  if (rich) {
    return {
      page: def ? def.title : 'Site rehberi',
      title: rich.title || labelFor(target),
      short: (target && target.dataset && target.dataset.sgTip) || '',
      body: rich.body,
      steps: rich.steps || []
    };
  }
  return {
    page: def ? def.title : 'Site rehberi',
    title: labelFor(target) || (def ? def.title : 'Bu öğe'),
    short: (target && target.dataset && target.dataset.sgTip) || '',
    body: def ? def.intro : 'Bu öğe hakkında ek açıklama yok.',
    steps: def ? def.points || [] : []
  };
}

function fillCard(data, expanded) {
  const card = ensureCard();
  if (!card) return;
  setCardText('.sg-detail-page', data.page ? 'Rehber · ' + data.page : 'Rehber · Bu öğe');
  setCardText('.sg-detail-title', data.title);
  setCardText('.sg-detail-short', data.short || data.body);
  setCardText('.sg-detail-body', data.short ? data.body : '');
  const list = card.querySelector('.sg-detail-steps');
  if (list) {
    while (list.firstChild) list.removeChild(list.firstChild);
    for (const step of data.steps || []) list.appendChild(node('li', undefined, step));
    list.className = 'sg-detail-steps' + (data.steps && data.steps.length ? '' : ' is-empty');
  }
  card.classList.add('is-open');
  card.classList.toggle('is-expanded', !!expanded);
}

function showPageOverview() {
  if (!enabled) return;
  const def = PAGES[pageName()];
  if (!def) return;
  activeTarget = null;
  fillCard({
    page: def.title,
    title: 'Bu sayfayı nasıl kullanırım?',
    short: 'Bir butona gel, klavyeyle odaklan veya mobilde basılı tut; bu kart o öğeyi anlatır.',
    body: def.intro,
    steps: def.points || []
  }, true);
}

function showDetail(target, expanded) {
  if (!target || !enabled) return;
  activeTarget = target;
  fillCard(collectData(target), expanded);
}

function scheduleHide(delay = 240) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => hideDetail(false), delay);
}

function hideDetail(force) {
  if (!force && detailPinned) return;
  clearTimeout(hideTimer);
  if (detailCard) detailCard.classList.remove('is-open', 'is-expanded');
  activeTarget = null;
}

function resetDetail() {
  clearTimeout(showTimer);
  clearTimeout(expandTimer);
  clearTimeout(hideTimer);
  clearTimeout(touchTimer);
  touchStart = null;
  detailPinned = false;
  activeTarget = null;
  if (detailCard && detailCard.parentNode) {
    try { detailCard.parentNode.removeChild(detailCard); } catch (e) {}
  }
  detailCard = null;
}

function guideTarget(from) {
  let current = from;
  while (current && current !== document.body && current !== document) {
    if (current.dataset && current.dataset.sgKey) return current;
    current = current.parentNode;
  }
  return null;
}

function inside(nodeToCheck, parent) {
  let current = nodeToCheck;
  while (current) {
    if (current === parent) return true;
    current = current.parentNode;
  }
  return false;
}

function clearHoverTimers() {
  clearTimeout(showTimer);
  clearTimeout(expandTimer);
  clearTimeout(hideTimer);
}

function onPointerOver(event) {
  if (!enabled || (event.pointerType && event.pointerType === 'touch')) return;
  const target = guideTarget(event.target);
  if (!target || target === activeTarget) return;
  clearHoverTimers();
  const current = target;
  showTimer = setTimeout(() => showDetail(current, false), 180);
  expandTimer = setTimeout(() => { if (activeTarget === current) showDetail(current, true); }, 900);
}

function onPointerOut(event) {
  if (!enabled || (event.pointerType && event.pointerType === 'touch')) return;
  const target = guideTarget(event.target);
  if (!target) return;
  if (event.relatedTarget && (inside(event.relatedTarget, target) || inside(event.relatedTarget, detailCard))) return;
  clearTimeout(showTimer);
  clearTimeout(expandTimer);
  scheduleHide(220);
}

function onFocusIn(event) {
  if (!enabled) return;
  const target = guideTarget(event.target);
  if (!target) return;
  clearHoverTimers();
  showDetail(target, true);
}

function onFocusOut(event) {
  if (!enabled) return;
  if (!guideTarget(event.target)) return;
  clearTimeout(showTimer);
  clearTimeout(expandTimer);
  scheduleHide(220);
}

function onTouchStart(event) {
  if (!enabled || !event.touches || event.touches.length !== 1) return;
  const target = guideTarget(event.target);
  if (!target) return;
  const touch = event.touches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
  clearTimeout(touchTimer);
  touchTimer = setTimeout(() => { touchStart = null; showDetail(target, true); }, 550);
}

function onTouchMove(event) {
  if (!touchStart || !event.touches || !event.touches[0]) return;
  const touch = event.touches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  if (dx * dx + dy * dy > 144) {
    clearTimeout(touchTimer);
    touchStart = null;
  }
}

function onTouchEnd() {
  clearTimeout(touchTimer);
  touchStart = null;
}

function onKeyDown(event) {
  if (event.key !== 'Escape' || !detailCard) return;
  detailPinned = false;
  hideDetail(true);
}

function cleanTip(item) {
  try { if (item.tip.parentNode) item.tip.parentNode.removeChild(item.tip); } catch (e) {}
  try { delete item.target.dataset.sgTipped; } catch (e) {}
  try { delete item.target.dataset.sgKey; } catch (e) {}
  try { delete item.target.dataset.sgTip; } catch (e) {}
  try { item.target.removeAttribute('aria-describedby'); } catch (e) {}
}

function clear() {
  for (const item of tipNodes) cleanTip(item);
  resetDetail();
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
    cleanTip(item);
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
    if (full && enabled) showPageOverview();
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
          // Sınıf değişimi bir öğeyi görünür yaptığında (örn. sabah kartının
          // .hidden sınıfının kalkması) eksik ipuçlarını tamamlamak için
          // yeniden çizim gerekir. Zaten ipucu almış öğelerde tekrar gerekmez.
          if (m.type === 'attributes' && target && target.dataset && target.dataset.sgKey) continue;
          queueRender();
          return;
        }
      });
      const container = document.getElementById('page-' + pageName());
      if (container) contentObserver.observe(container, {
        childList: true, attributes: true, attributeFilter: ['class', 'hidden'], subtree: true
      });
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
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true, capture: true });
    document.addEventListener('touchend', onTouchEnd, true);
    document.addEventListener('touchcancel', onTouchEnd, true);
    document.addEventListener('keydown', onKeyDown, true);
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
  detailData: DETAILS,
  globalControls: GLOBAL,
  render: queueRender,
  addTipForTest: addTip,
  showDetailForTest: showDetail,
  detailCardForTest: () => detailCard,
  visibleForTest: isVisible
});

enabled = readPref().enabled;
bind();
apply();
