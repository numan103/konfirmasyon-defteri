// Kanal API boş döndüğünde eğitim kataloğu da boş kalır. Bu test, şifreli
// kanal belgesi çözüldüğünde ders kartlarının gerçekten render edildiğini kurar.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
page.on('pageerror', e => errors.push(e.message));

const channel = {
  ok: true,
  data: {
    traders: {
      t1: {
        id: 't1', name: 'Trader Ahmet', bio: 'Canlı kanal', owner: 'admin@test.dev', editors: [],
        secMeta: [{ id: 'spot', title: 'Spot Fırsatları', kind: 'course', access: 'free', plans: [] }],
        sections: { spot: [{ id: 'topic', title: 'Giriş', videos: [
          { id: 'v1', title: 'Ücretsiz ders', url: 'https://youtu.be/old', type: 'video', access: 'free', plans: [] },
        ] }] },
      },
    },
    order: ['t1'],
  },
};
const isChannel = url => url.pathname === '/api/edu-shared' && url.search === '?kind=channel';
await page.route(url => isChannel(url), route => route.fulfill({ json: channel }));
await page.route('**/api/access**', route => route.fulfill({ json: { ok: true, admin: false, tier: 'free', status: 'none' } }));
await page.route('**/api/edu-shared?kind=progress**', route => route.fulfill({ json: { ok: true, data: null } }));
await page.route('**/api/edu-shared?kind=channel&view=daily-notes**', route => route.fulfill({ json: { ok: true, data: { items: [] } } }));

try {
  await page.goto((arg('url') || 'http://127.0.0.1:4173') + '/?page=egitim');
  await page.waitForFunction(() => document.querySelectorAll('#edu-grid .edu-card').length > 0, null, { timeout: 15000 });
  const state = await page.evaluate(() => ({
    cards: document.querySelectorAll('#edu-grid .edu-card').length,
    titles: Array.from(document.querySelectorAll('#edu-grid .edu-card-title')).map(el => el.textContent.trim()),
    emptyHidden: document.getElementById('edu-empty')?.classList.contains('hidden'),
    errorText: document.getElementById('edu-overall')?.textContent.trim() || '',
  }));
  assert.ok(state.cards >= 1, 'eğitim kartı render edilmeli');
  assert.ok(state.titles.some(title => title.includes('Spot Fırsatları')), 'kanal bölümü kart başlığında görünmeli');
  assert.equal(state.emptyHidden, true, 'boş durum mesajı görünmemeli');
  assert.doesNotMatch(state.errorText, /yüklenemedi|Tekrar dene/, 'kanal yükleme hatası gösterilmemeli');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, state, pageErrors: errors }));
} catch (error) {
  console.log(JSON.stringify({ passed: false, error: error.message, pageErrors: errors }));
  process.exitCode = 1;
} finally { await browser.close(); }
