import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EDU_PLANS, PRIVATE_LESSON_MINUTES, EDU_PAYMENT, eduApplicationURL, eduQuestionURL } from '../assets/edu-plans-model.mjs';
test('Alfa Edu packages keep the agreed prices and total lesson allowances', () => {
  assert.deepEqual(EDU_PLANS.map(p => [p.id, p.usd, p.groupMonths, p.groupLessons, p.privateLessons]), [
    ['video', 50, 1, 0, 0], ['live', 99, 1, 4, 0], ['personal', 250, 1, 4, 2],
  ]);
  assert.deepEqual(PRIVATE_LESSON_MINUTES, { min: 90, max: 180 });
  assert.equal(EDU_PLANS[0].account.tr, '10K Classic');
  assert.equal(EDU_PLANS[1].account.tr, '25K Classic');
  assert.match(EDU_PLANS[2].account.tr, /50K Classic.*Pro/);
  assert.equal(EDU_PLANS[1].name.tr, 'Canlı Grup Eğitimi');
  assert.deepEqual(EDU_PLANS[2].upgrade, { account: { tr: '100K Classic', en: '100K Classic' }, privateLessons: 4 });
});
test('applications specify first purchase and keep the 100K upgrade inside Personal Coaching', () => {
  for (const plan of EDU_PLANS) {
    const url = new URL(eduApplicationURL(plan.id, 'breakout'));
    assert.equal(url.origin + url.pathname, 'https://t.me/traderahmetd');
    assert.match(url.searchParams.get('text'), /ilk hesap alımı fırsatı/);
    assert.match(url.searchParams.get('text'), /Partner kodu: ALFA/);
    assert.match(url.searchParams.get('text'), /Satın almadan önce referans bağlantısını ve ilk alım uygunluğumu teyit/);
    assert.ok(url.searchParams.get('text').includes(plan.account.tr));
  }
  assert.equal(eduApplicationURL('plus', 'cash'), null);
  assert.equal(eduApplicationURL('video', 'breakout100k'), null);
  assert.equal(eduApplicationURL('live', 'breakout100k'), null);
  const upgrade = new URL(eduApplicationURL('personal', 'breakout100k')).searchParams.get('text');
  assert.match(upgrade, /Personal Coaching/);
  assert.match(upgrade, /100K Classic/);
  assert.match(upgrade, /2 yerine toplam 4 birebir ders/);
  assert.equal(eduApplicationURL('unknown'), null);
  assert.equal(eduApplicationURL('video', 'invalid'), null);
  assert.match(new URL(eduApplicationURL('personal', 'cash', 'en')).searchParams.get('text'), /\$250/);
});
test('partner assets are local, inert and the shared marquee supports accessible motion controls', () => {
  const client = fs.readFileSync(new URL('../assets/edu-plans.mjs', import.meta.url), 'utf8');
  const partners = fs.readFileSync(new URL('../assets/site-partners.mjs', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../assets/site-partners.css', import.meta.url), 'utf8');
  for (const name of ['okx', 'bybit', 'breakout']) {
    const svg = fs.readFileSync(new URL('../assets/partners/' + name + '.svg', import.meta.url), 'utf8');
    assert.match(svg, /<svg/);
    assert.doesNotMatch(svg, /<script|<foreignObject|onload=|href=/i);
  }
  assert.ok(fs.statSync(new URL('../assets/partners/breakout-trader-ahmet.jpg', import.meta.url)).size > 10000);
  assert.match(client, /await navigator.clipboard.writeText\('ALFA'\)/);
  assert.doesNotMatch(client, /aria-hidden/, 'ortak şerit eğitim sayfasında tekrar üretilmemeli');
  assert.match(partners, /aria-hidden/);
  assert.match(partners, /aria-pressed/);
  assert.match(partners, /https:\/\/www.okx.com\/join\/CRYPTOAHMET/);
  assert.match(partners, /https:\/\/partner.bybit.com\/b\/cryptoahmet/);
  assert.match(css, /translateX\(-50%\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /focus-within/);
});
test('eğitim paketleri hero posteri sağda, dikey ve kırpılmadan gösterilir', () => {
  const poster = fs.readFileSync(new URL('../assets/edu-apply-poster.webp', import.meta.url));
  assert.equal(poster.toString('ascii', 0, 4), 'RIFF');
  assert.equal(poster.toString('ascii', 8, 12), 'WEBP');
  assert.ok(poster.length > 100000, 'poster dosyası gerçek görsel olmalı');

  const client = fs.readFileSync(new URL('../assets/edu-plans.mjs', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../assets/edu-plans.css', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(client, /edu-apply-poster\.webp\?v=1/);
  assert.match(client, /img\.width = 1122; img\.height = 1402/);
  assert.match(client, /ALFA EDU eğitim paketleri/);
  assert.match(client, /hero\.append\(copy, art\)/, 'poster hero sağında');
  assert.doesNotMatch(client, /edu-execution\.jpg/);
  assert.doesNotMatch(client, /Fotoğraf temsilidir/);

  assert.match(css, /\.eduplans-art img \{[^}]*aspect-ratio: 1122\/1402[^}]*object-fit: contain/);
  assert.doesNotMatch(css, /\.eduplans-art img \{[^}]*object-fit: cover/);
  assert.doesNotMatch(css, /\.eduplans-art img \{ aspect-ratio: (4\/3|16\/9)/);
  assert.match(html, /\/assets\/edu-plans\.css\?v=5/);
  assert.match(html, /\/assets\/edu-plans\.mjs\?v=9/);
});
test('public package offer is separate from existing course access and has clear continuation conditions', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../assets/edu-plans.mjs', import.meta.url), 'utf8');
  assert.match(html, /eduplans: 'free'/);
  assert.match(html, /egitim: 'free'/);
  assert.match(html, /id="page-eduplans"/);
  assert.match(html, /id="tab-eduplans"/);
  assert.match(html, /data-mnav="eduplans"/);
  assert.match(html, /get\('page'\) === 'eduplans'/);
  for (const phrase of ['ömür boyu', 'İkinci aydan', 'OKX', 'Bybit', '1,5–3', 'manuel', 'otomatik yenilenmez', 'kazanç garantisi verilmez']) assert.ok(client.includes(phrase), phrase);
  assert.ok(client.includes('Haftalık canlı grup eğitimi'));
  assert.ok(client.includes('yalnızca bizim referansımızdan ilk kayıt ve uygun ilk hesap alımına'));
  assert.ok(!client.includes('Coaching Plus'));
  assert.ok(!client.includes('innerHTML'));
  assert.ok(!client.includes('localStorage'));
  assert.ok(!client.includes('fetch('), 'offer page must not collect payment or alter access');
});
test('education enrollment is direct; the confirmed TRC20 destination is unchanged and Telegram is optional', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../assets/edu-plans.mjs', import.meta.url), 'utf8');
  assert.ok(html.includes('<code class="inf-wallet">' + EDU_PAYMENT.address + '</code>'));
  assert.deepEqual([EDU_PAYMENT.currency, EDU_PAYMENT.network], ['USDT','TRC20']);
  assert.ok(!client.includes('eduApplicationURL'));
  assert.ok(client.includes("button.dataset.eduRoute = route"));
  assert.match(new URL(eduQuestionURL('personal')).searchParams.get('text'), /bir sorum var/);
});
