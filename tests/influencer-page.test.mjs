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

test('influencer masaüstü ve mobil menüde, ayrıca ana sayfa kartında', () => {
  assert.match(html, /href="\?page=influencer" class="nav-link" id="tab-influencer" data-nav/);
  assert.match(html, /data-mnav="influencer" id="mnav-influencer"/);
  assert.match(html, /href="\?page=influencer" class="home-card" data-nav/);
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
  assert.match(section, /doğrulanmış X analitik raporu/);
  assert.match(section, /büyük olması bot kullandığını kanıtlamaz/);
  assert.match(section, /içeriklerin tamamı henüz yayında değil/);
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
  assert.match(block, /tüm gönderilerin ortalaması veya sonuç garantisi değildir/);
  assert.match(block, /toplam etkileşim ya da gösterim sayısı anlamına gelmez/);
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
  assert.match(middleware, /influencer:\s*\{\s*title: 'Alfa Traders — Kitle Atölyesi'/);
});

test('Kitle Atölyesi kripto dışındaki içerik üreticilerine de hitap eder', () => {
  assert.match(html, /data-i18n="app\.influencer">🚀 Kitle Atölyesi/);
  assert.match(html, /data-i18n="pg\.influencer\.t">Kitle Atölyesi/);
  assert.match(html, /Kripto veya FX trader’ı, eğitmen, teknoloji meraklısı/);
  assert.match(html, /Audience Studio/);
  assert.ok(!html.includes('>Kripto Influencer<'));
});

test('gerçek gönderiler eşit boyutlu, kaydırılabilir ve devam bağlantılıdır', () => {
  assert.match(html, /\.inf-real-post \{[^}]*height: 440px/);
  assert.match(html, /\.inf-real-post-preview \{[^}]*overflow: auto/);
  assert.equal((html.match(/class="inf-real-post-preview" tabindex="0"/g) || []).length, 3);
  assert.equal((html.match(/data-i18n="pg\.influencer\.openPost">Devamını gör ↗/g) || []).length, 3);
  assert.match(html, /data-i18n-aria="pg\.influencer\.postPreview"/);
});
