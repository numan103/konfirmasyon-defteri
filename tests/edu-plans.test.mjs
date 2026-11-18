import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EDU_PLANS, PRIVATE_LESSON_MINUTES, eduApplicationURL } from '../assets/edu-plans-model.mjs';
test('Alfa Edu packages keep the agreed prices and total lesson allowances', () => {
  assert.deepEqual(EDU_PLANS.map(p => [p.id, p.usd, p.groupMonths, p.groupLessons, p.privateLessons]), [
    ['video', 50, 1, 0, 0], ['live', 99, 1, 4, 0], ['personal', 250, 1, 4, 2], ['plus', null, 1, 4, 4],
  ]);
  assert.deepEqual(PRIVATE_LESSON_MINUTES, { min: 90, max: 180 });
  assert.equal(EDU_PLANS[0].account.tr, '10K Classic');
  assert.equal(EDU_PLANS[1].account.tr, '25K Classic');
  assert.match(EDU_PLANS[2].account.tr, /50K Classic.*Pro/);
  assert.equal(EDU_PLANS[3].account.tr, '100K Classic');
});
test('applications request manual verification and never invent a Breakout referral or a Plus cash price', () => {
  for (const plan of EDU_PLANS) {
    const url = new URL(eduApplicationURL(plan.id, 'breakout'));
    assert.equal(url.origin + url.pathname, 'https://t.me/traderahmetd');
    assert.match(url.searchParams.get('text'), /Satın almadan önce referans bağlantısını ve uygunluğumu teyit/);
    assert.ok(url.searchParams.get('text').includes(plan.account.tr));
  }
  assert.equal(eduApplicationURL('plus', 'cash'), null);
  assert.equal(eduApplicationURL('unknown'), null);
  assert.equal(eduApplicationURL('video', 'invalid'), null);
  assert.match(new URL(eduApplicationURL('personal', 'cash', 'en')).searchParams.get('text'), /\$250/);
});
test('public package offer is separate from existing course access and has clear continuation conditions', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../assets/edu-plans.mjs', import.meta.url), 'utf8');
  assert.match(html, /eduplans: 'free'/);
  assert.match(html, /egitim: 'ref'/);
  assert.match(html, /id="page-eduplans"/);
  assert.match(html, /id="tab-eduplans"/);
  assert.match(html, /data-mnav="eduplans"/);
  assert.match(html, /get\('page'\) === 'eduplans'/);
  for (const phrase of ['ömür boyu', 'İkinci aydan', 'OKX', 'Bybit', '1,5–3', 'manuel', 'otomatik yenilenmez', 'kazanç garantisi verilmez']) assert.ok(client.includes(phrase), phrase);
  assert.ok(!client.includes('innerHTML'));
  assert.ok(!client.includes('localStorage'));
  assert.ok(!client.includes('fetch('), 'offer page must not collect payment or alter access');
});
