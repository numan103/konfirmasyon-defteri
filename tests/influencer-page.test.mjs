import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const middleware = fs.readFileSync(new URL('../middleware.js', import.meta.url), 'utf8');

test('influencer sayfası herkese açık bir sayfa olarak kayıtlı', () => {
  const tiers = html.slice(html.indexOf('const PAGE_TIER = {'), html.indexOf('// Referans linkleri'));
  assert.match(tiers, /influencer:\s*'free'/);
  assert.match(html, /const pages = \[[^\]]*'influencer'/);
  assert.ok(html.includes('<div id="page-influencer" class="hidden">'));
});

test('influencer masaüstü ve mobil menüde görünür', () => {
  assert.match(html, /href="\?page=influencer" class="nav-link" id="tab-influencer" data-nav/);
  assert.match(html, /data-mnav="influencer" id="mnav-influencer"/);
});

test('sayfa açılırken kontrol listesi çizilir', () => {
  assert.match(html, /if \(name === 'influencer'\) renderInfluencer\(\);/);
  assert.match(html, /function renderInfluencer\(/);
  assert.match(html, /localStorage\.setItem\(INF_CHECK_KEY, JSON\.stringify\(done\)\)/);
  assert.match(html, /id="inf-bar"/);
  assert.match(html, /id="inf-count"/);
  assert.match(html, /id="inf-reset"/);
});

test('sayfa metinleri Türkçe ve İngilizce sözlükte tanımlı', () => {
  for (const key of [
    'app.influencer', 'pg.influencer.t', 'pg.influencer.s', 'pg.influencer.check',
    'pg.influencer.c1', 'pg.influencer.c8', 'pg.influencer.road',
    'pg.influencer.w4d', 'pg.influencer.metrics', 'pg.influencer.warnp',
  ]) {
    assert.match(html, new RegExp("[\"']" + key.replace(/\./g, '\\.') + "[\"']:\\s*\\{\\s*tr:"));
  }
  for (const id of ['inf-checks', 'inf-bar', 'inf-count', 'inf-reset']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing element: ' + id);
  }
});

test('tanıtım videosu ve 3 paket herkese açık, tam içerik kilitli', () => {
  assert.ok(html.includes('id="inf-teaser"'));
  assert.ok(html.includes('id="inf-full" class="hidden"'));
  assert.match(html, /pg\.influencer\.videoSoon/);
  for (const price of ['$50', '$90', '$175']) assert.ok(html.includes(price), 'missing price: ' + price);
  assert.match(html, /pg\.influencer\.p3\.note/);
  assert.match(html, /1000 takipçi/);
  assert.match(html, /90 gün/);
  assert.match(html, /id="inf-txid"/);
  assert.match(html, /id="inf-payment-submit"/);
  assert.match(html, /TPipnkFzdUF8Vb5cPpuwNLyRR6wcePxqG6/);
  assert.match(html, /https:\/\/t\.me\/traderahmetd/);
  assert.match(html, /class="inf-card inf-faq"/);
});

test('ödeme tutarları sabit USDT; Telegram fiyat teyidi istenmez', () => {
  assert.match(html, /INF_PAYMENT_PRICES = \{ video: 50, guided: 90, growth: 175 \}/);
  assert.match(html, /id="inf-pay-amount">50 USDT/);
  assert.match(html, /inf-package'\)\.onchange = infPaintPrices/);
  assert.match(html, /infPaintPrices\(\); \};/);
  assert.match(html, /op=prices/);
  assert.ok(!html.includes("Göndermeden önce Telegram'dan güncel USDT tutarını teyit et"));
  assert.match(html, /data-inf-try="video"/);
  assert.match(html, /TL referans kuru tarihi/);
});

test('büyüme örnekleri verilen ölçümlerle sınırlı ve temsili tweetler etiketli', () => {
  const section = html.slice(html.indexOf('<div id="page-influencer"'), html.indexOf('<div id="page-mentoring"'));
  assert.equal((section.match(/class="inf-result"/g) || []).length, 3);
  assert.equal((section.match(/class="inf-tweet"/g) || []).length, 3);
  for (const value of ['60', '140', '200', '1.200', '250', '450', '2 hafta', '2 ay', 'Süre belirtilmedi']) assert.ok(section.includes(value));
  assert.match(section, /Temsili örnek · gerçek gönderi değil/);
  assert.match(section, /Doğrulanmış analitik rapor veya sonuç garantisi değildir/);
  assert.match(section, /Takipçi sayısı tek başına kaliteyi veya bot kullanımını göstermez/);
  assert.match(section, /Eğitimler hazırlanıyor/);
});

test('üçüncü hesap 250→450, +200 ve yüzde 80 büyüme olarak gösterilir', () => {
  const a = html.indexOf('data-i18n="pg.influencer.case.3"');
  const card = html.slice(a, html.indexOf('</article>', a));
  assert.match(card, /250 <span>→<\/span> 450/);
  assert.match(card, /\+200/);
  assert.match(card, /\+80%/);
  assert.match(card, /width:55\.56%/);
  assert.ok(!card.includes('2.000'));
  assert.ok(!card.includes('4.000'));
});

test('beğeni aralığı beyan olarak gösterilir; sahte gönderi analitiği üretilmez', () => {
  const a = html.indexOf('id="inf-engagement"');
  const block = html.slice(a, html.indexOf('</section>', a));
  assert.match(block, /30–50/);
  assert.match(block, /bazı gönderilerde beğeni/);
  assert.match(block, /ortalama veya garanti değil/);
  assert.match(block, /Beğeni, toplam etkileşim demek değildir/);
  assert.match(html, /"pg\.influencer\.engagement\.h": \{ tr: .+, en: /);
});

test('verilen üç gerçek X gönderisi izleme parametresiz gömülür ve yedek bağlantıları vardır', () => {
  const a = html.indexOf('id="inf-real-posts"');
  const block = html.slice(a, html.indexOf('</section>', a));
  for (const id of ['2122697067059388880', '2120899179778113906', '2114068323839172986']) {
    const url = 'https://x.com/traderahmet_/status/' + id;
    assert.equal(block.split('href="' + url + '"').length - 1, 2);
    assert.ok(!block.includes(url + '?'));
  }
  assert.equal((block.match(/class="twitter-tweet"/g) || []).length, 3);
  assert.match(html, /https:\/\/platform\.twitter\.com\/widgets\.js/);
  assert.match(html, /script\.onerror/);
  assert.match(html, /function infLoadRealPosts\(\)/);
  assert.match(html, /data-dnt="true"/);
  assert.ok(!html.includes('Gerçek gönderi bağlantıları ve ekran görüntüleri eklendiğinde'));
});

test('erişim kodu yok; kilit sunucu onayı veya admin ile açılır', () => {
  assert.match(html, /function infUnlocked\(\)/);
  assert.match(html, /siteIsAdmin\(\)/);
  assert.ok(!html.includes('INF_UNLOCK_KEY'));
  assert.ok(!html.includes('ALFA-INF-2026'));
  assert.ok(!html.includes('inf-code-input'));
  assert.match(html, /infAccess = !!data.unlocked/);
  assert.match(html, /siteFetch\('\/api\/ai\?influencer=1'/);
  assert.match(html, /teaser\.classList\.toggle\('hidden', unlocked\)/);
  assert.match(html, /full\.classList\.toggle\('hidden', !unlocked\)/);
});

test('konu taslağı HTML içinde yok, sadece admin API üzerinden yüklenir', () => {
  assert.match(html, /infApi\('\?op=outline'\)/);
  assert.match(html, /id="inf-admin" class="inf-card hidden"/);
  assert.ok(!html.includes('1. Başlangıç ve konumlandırma'));
  assert.ok(!html.includes('8. Güven ve sürdürülebilirlik'));
});

test('sosyal önizleme için middleware sayfa başlığı var', () => {
  assert.match(middleware, /influencer:\s*\{\s*title: 'Alfa Traders — Alfa Influencer'/);
});

test('Alfa Influencer hesap, içerik ve topluluk desteği sunar', () => {
  assert.match(html, /data-i18n="app\.influencer">🚀 Alfa Influencer/);
  assert.match(html, /data-i18n="pg\.influencer\.t">Alfa Influencer/);
  assert.match(html, /Kripto ve FX içeriklerinde hesabını, etkileşimini ve kişisel markanı/);
  assert.match(html, /Sadece izleyen değil, üreten tarafta ol/);
  assert.ok(!html.includes('>Kripto Influencer<'));
});

test('fayda, hedef ve Türkiye odaklı senaryolar paketlerden önce anlatılır', () => {
  const section = html.slice(html.indexOf('<div id="page-influencer"'), html.indexOf('<div id="page-mentoring"'));
  const stages = ['inf-opportunities', 'inf-outcomes', 'inf-real-world', 'inf-packages'];
  let previous = -1;
  for (const id of stages) {
    const position = section.indexOf('id="' + id + '"');
    assert.ok(position > previous, 'out of order or missing: ' + id);
    previous = position;
  }
  assert.equal((section.match(/class="inf-benefit"/g) || []).length, 6);
  assert.equal((section.match(/class="inf-story"/g) || []).length, 3);
  for (const topic of ['Prop firm ile kampanya', 'Borsa ile içerik iş birliği', 'Araç ve platform iş birlikleri']) assert.ok(section.includes(topic));
  assert.match(section, /Örnek fırsatlardır; paketlere dahil değildir/);
  assert.match(section, /Değerlendirme erişimi, fonlanma veya ödeme garantisi değildir/);
  assert.match(section, /Reklam ve komisyon ilişkisini açıkça belirt/);
  for (const foreign of ['Justin Welsh', 'Ali Abdaal', 'Ben Felix']) assert.ok(!section.includes(foreign));
});

test('pazarlama alanı gerçek fotoğraf ve kısa maddeler kullanır', () => {
  const section = html.slice(html.indexOf('<div id="page-influencer"'), html.indexOf('<div id="page-mentoring"'));
  for (const image of ['creator', 'trading', 'writing', 'network']) {
    assert.ok(section.includes('/assets/alfa-influencer-' + image + '.jpg'));
    const file = new URL('../assets/alfa-influencer-' + image + '.jpg', import.meta.url);
    assert.ok(fs.existsSync(file));
    const bytes = fs.readFileSync(file);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
  }
  const marketing = section.slice(0, section.indexOf('id="inf-packages"'));
  assert.equal((marketing.match(/class="inf-mini-list"/g) || []).length, 10);
  assert.ok(!section.includes('/assets/alfaluence-hero.svg'));
  assert.match(section, /Fotoğraflar temsilidir/);
  assert.ok(marketing.length > 0);
  assert.ok(!section.includes('günlük yaşam'));
  assert.ok(!section.includes('yaşam tarzı'));
  assert.ok(!section.includes('inf-your-path'));
  assert.match(section, /<details class="inf-sample-drawer"><summary/);
  assert.ok(!section.includes('<details class="inf-sample-drawer" open'));
});

test('destekler büyüme, etkileşim, viral potansiyel, networking, topluluk ve kariyer içerir', () => {
  const a = html.indexOf('id="inf-opportunities"');
  const block = html.slice(a, html.indexOf('</section>', a));
  for (const phrase of ['Küçük hesabını geliştir', 'Etkileşimini güçlendir', 'Viral potansiyelini geliştir', 'Doğru networking', 'Toplulukla büyü', 'Kariyer ve ek gelir fırsatları']) {
    assert.ok(block.includes(phrase), phrase);
  }
  assert.match(block, /Viral olma, belirli bir takipçi sayısı veya gelir garantisi verilmez/);
  assert.match(block, /Kendi topluluğunun temelini kur/);
});

test('gerçek gönderiler eşit boyutlu, kaydırılabilir ve devam bağlantılıdır', () => {
  assert.match(html, /\.inf-real-post \{[^}]*height: 440px/);
  assert.match(html, /\.inf-real-post-preview \{[^}]*overflow: auto/);
  assert.equal((html.match(/class="inf-real-post-preview" tabindex="0"/g) || []).length, 3);
  assert.equal((html.match(/data-i18n="pg\.influencer\.openPost">Devamını gör ↗/g) || []).length, 3);
  assert.match(html, /data-i18n-aria="pg\.influencer\.postPreview"/);
});
