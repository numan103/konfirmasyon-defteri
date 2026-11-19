import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const arg = key => process.argv.find(v => v.startsWith('--' + key + '='))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = http.createServer((req,res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/influencer-content.css"><style>body{font-family:Arial;background:#121522;color:white;--text:white;--card:#202438;--bg2:#15192b;--border:#48435f;--pc:#e879f9;--pc-soft:#382142}</style><div id="library"></div><script type="module">import * as lib from "/assets/influencer-content.mjs";window.lib=lib;</script>');
  }
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.mjs') ? 'text/javascript' : 'text/css'); res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
try {
  const page = await browser.newPage({ viewport:{width:1280,height:1000}, hasTouch:true });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let stored = { topics:['a','b','c'].map(id => ({
    id, title:'Konu ' + id.toUpperCase(), description:'', published:true,
    sections:[1,2,3].map(n => ({ id:id+n, title:'Bölüm ' + id+n, blocks:[] })),
  })) };
  await page.route('**/api/edu-shared?kind=influencer-content', route => {
    if (route.request().method() === 'POST') stored = route.request().postDataJSON().data;
    return route.fulfill({ json:{ok:true,data:stored,revision:'2026-11-19T12:00:00Z'} });
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => window.lib);
  await page.evaluate(() => window.lib.mount(document.getElementById('library'), {admin:true,unlocked:true,userId:'admin',getToken:async ()=>'admin'}));
  await page.locator('.ic-topic-node').first().waitFor();
  const topicIds = () => page.locator('.ic-topic-node').evaluateAll(nodes => nodes.map(n => n.dataset.sortId));
  const sectionIds = () => page.locator('.ic-map-branch').evaluateAll(nodes => nodes.map(n => n.dataset.sortId));
  async function drag(source, target) {
    await source.scrollIntoViewIfNeeded(); await target.scrollIntoViewIfNeeded();
    const s = await source.boundingBox(), t = await target.boundingBox();
    await page.mouse.move(s.x+s.width/2,s.y+s.height/2); await page.mouse.down();
    await page.mouse.move(t.x+t.width*.8,t.y+t.height*.8,{steps:12}); await page.mouse.up();
  }
  await drag(page.getByRole('button',{name:'Konuyu taşı: Konu A',exact:true}), page.locator('.ic-topic-node[data-sort-id="c"]'));
  assert.deepEqual(await topicIds(), ['b','c','a']);
  await page.locator('.ic-topic-node[data-sort-id="b"] .ic-topic-open').click();
  await drag(page.getByRole('button',{name:'Alt başlığı taşı: Bölüm b1',exact:true}), page.locator('.ic-map-branch[data-sort-id="b3"]'));
  assert.deepEqual(await sectionIds(), ['b2','b3','b1']);
  await page.getByRole('button',{name:'Alt başlığı taşı: Bölüm b1',exact:true}).press('ArrowUp');
  assert.deepEqual(await sectionIds(), ['b2','b1','b3']);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Alt başlığı taşı: Bölüm b1');
  const cancelSource = await page.getByRole('button',{name:'Alt başlığı taşı: Bölüm b1',exact:true}).boundingBox();
  const cancelTarget = await page.locator('.ic-map-branch[data-sort-id="b2"]').boundingBox();
  await page.mouse.move(cancelSource.x+12,cancelSource.y+12); await page.mouse.down();
  await page.mouse.move(cancelTarget.x+80,cancelTarget.y+10,{steps:8});
  await page.keyboard.press('Escape'); await page.mouse.up();
  assert.deepEqual(await sectionIds(),['b2','b1','b3']);
  assert.equal(await page.locator('.ic-sort-ghost').count(),0);
  const search = page.getByLabel('Haritada ara', {exact:true});
  await search.fill('BÖLÜM b3');
  assert.equal(await page.locator('.ic-topic-node').count(),1);
  assert.equal(await page.locator('.ic-search-match').count(),1);
  assert.equal(await page.getByRole('button',{name:'Alt başlığı taşı: Bölüm b1',exact:true}).isDisabled(),true);
  await search.fill('bulunmayan başlık');
  await page.getByText('Bu aramayla eşleşen konu veya alt başlık bulunamadı.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Aramayı temizle',exact:true}).click();
  assert.deepEqual(await topicIds(), ['b','c','a']);
  await page.setViewportSize({width:390,height:1000});
  const source = page.getByRole('button',{name:'Alt başlığı taşı: Bölüm b3',exact:true});
  await source.scrollIntoViewIfNeeded();
  const target = page.locator('.ic-map-branch[data-sort-id="b2"]');
  await target.scrollIntoViewIfNeeded();
  const s = await source.boundingBox(), t = await target.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:s.x+s.width/2,y:s.y+s.height/2}]});
  for(let i=1;i<=12;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{
    x:s.x+s.width/2+(t.x+t.width/2-(s.x+s.width/2))*i/12,
    y:s.y+s.height/2+(t.y+t.height*.2-(s.y+s.height/2))*i/12,
  }]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.deepEqual(await sectionIds(), ['b3','b2','b1']);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
  await page.getByRole('button',{name:'Değişiklikleri kaydet',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Kaydedildi ve yayınlandı.'}).waitFor();
  assert.deepEqual(stored.topics.map(t=>t.id),['b','c','a']);
  assert.deepEqual(stored.topics[0].sections.map(s=>s.id),['b3','b2','b1']);
  await page.getByRole('button',{name:'Yeniden yükle',exact:true}).click();
  await page.locator('.ic-topic-node').first().waitFor();
  assert.deepEqual(await topicIds(),['b','c','a']);
  assert.deepEqual(await sectionIds(),['b3','b2','b1']);
  await page.getByLabel('Haritada ara',{exact:true}).fill('Konu C');
  assert.equal(await page.getByRole('button',{name:'Değişiklikleri kaydet',exact:true}).count(),0,'search does not dirty the saved document');
  await page.getByRole('button',{name:'Aramayı temizle',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,topicDrag:true,sectionDrag:true,keyboardSort:true,touchSort:true,search:true,persistedOrder:true,mobile:true,productionWrites:false}));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
