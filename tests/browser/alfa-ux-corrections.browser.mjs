// Deterministic regression for the reported desktop chart UX corrections.
// Anonymous local-browser fixture only: no credentials, real orders or writes.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const errors = [];
const STEP = 900;
const END = Math.floor(Date.parse('2026-11-20T12:00:00Z') / 1000);
const COUNT = 1800;
const candles = Array.from({ length: COUNT }, (_, i) => {
  const time = END - (COUNT - 1 - i) * STEP;
  const base = 100 + i / 100;
  return [time * 1000, base.toFixed(2), (base + 1).toFixed(2), (base - 1).toFixed(2), (base + 0.2).toFixed(2), String(10 + i % 7), time * 1000 + STEP * 1000 - 1, '0'];
});
const symbols = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'OKX:BNBUSDT.P', 'OKX:AVAXUSDT.P'];
const watchlistDoc = {
  version: 2, name: 'İzleme listesi', symbols, activeListId: 'main',
  lists: [{ id: 'main', name: 'İzleme listesi', symbols, color: '#7da4ff', collapsed: false,
    sections: [
      { id: 'crypto', name: 'Kripto', symbols: ['BTCUSDT', 'ETHUSDT', 'XRPUSDT'] },
      { id: 'fx', name: 'Vadeli', symbols: ['OKX:BNBUSDT.P', 'OKX:AVAXUSDT.P'] }
    ] }],
  settings: { sort: 'custom', direction: 'asc', groupBy: 'none', compact: false, showFlags: true, showQuotes: false, collapsedGroups: {} },
  flags: {}
};

await context.addInitScript(doc => {
  // Seed only the first load; later reloads must prove persisted drag order.
  if (!localStorage.getItem('alfa-watchlist:v1:guest')) localStorage.setItem('alfa-watchlist:v1:guest', JSON.stringify(doc));
  localStorage.setItem('alfa-watchlist:tv-migrated:v1:guest', '1');
  window.WebSocket = class {
    constructor() { this.readyState = 0; queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); }); }
    close() { this.readyState = 3; this.onclose?.({}); }
    send() {}
  };
}, watchlistDoc);
await context.route('**/api/v3/klines?**', route => {
  const url = new URL(route.request().url());
  const start = url.searchParams.has('startTime') ? Number(url.searchParams.get('startTime')) : NaN;
  const end = url.searchParams.has('endTime') ? Number(url.searchParams.get('endTime')) : NaN;
  let rows = candles;
  if (Number.isFinite(start)) rows = rows.filter(row => row[0] >= start);
  if (Number.isFinite(end)) rows = rows.filter(row => row[0] <= end);
  if (!url.searchParams.has('startTime')) rows = rows.slice(-1000);
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
});
await context.route('**/api/v3/exchangeInfo?**', route => route.fulfill({ json: { symbols: [] } }));
await context.route('**/api/**', route => {
  if (route.request().url().includes('/api/v3/')) return route.continue();
  const body = route.request().postDataJSON?.() || {};
  if (body.op === 'chart-market-quotes-free') {
    const quotes = {};
    for (const ref of body.refs || []) quotes[ref] = { price: 100, change: 0.5, at: Date.now() };
    return route.fulfill({ json: { ok: true, quotes } });
  }
  return route.fulfill({ json: { ok: true, quotes: {}, chartable: false, quote: { price: 100, change: 0 } } });
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const test = async (name, fn) => { await fn(); console.log('PASS', name); };
const ready = () => page.waitForFunction(() => window.__alfaDebug?.ready && window.__alfaDebug.drawings.ready, null, { timeout: 45000 });
const drag = (source, target, position = 'before') => page.evaluate(({ source, target, position }) => {
  const from = document.querySelector(`[data-drag-symbol="${source}"]`);
  const to = document.querySelector(target);
  if (!from || !to) throw new Error(`missing drag nodes: ${source} -> ${target}`);
  const dt = new DataTransfer();
  from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  const r = to.getBoundingClientRect();
  to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: r.top + (position === 'after' ? r.height - 2 : 2) }));
  to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: r.top + (position === 'after' ? r.height - 2 : 2) }));
  from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
}, { source, target, position });
const sectionOrder = key => page.evaluate(key => [...document.querySelectorAll(`[data-watch-section="${key}"] [data-symbol]`)].map(el => el.dataset.symbol), key);

try {
  await page.goto((arg('url') || 'http://127.0.0.1:8788') + '/alfa-charts.html?debug=1');
  await ready();

  await test('top BTCUSDT opens the full pair picker without a dropdown arrow', async () => {
    assert.equal(await page.locator('#symbol-search').count(), 0);
    assert.equal(await page.locator('#market-picker').count(), 1, 'desktop picker button must exist');
    assert.equal(await page.locator('#market-picker').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#market-picker svg').count(), 0, 'picker must not render a caret');
    await page.click('#market-picker');
    await page.waitForFunction(() => !!document.querySelector('dialog[open].pair-explorer-dialog'), null, { timeout: 5000 });
    assert.ok(await page.locator('.pair-explorer-dialog .pair-explorer-row').count() > 0, 'full pair list must be visible');
    await page.keyboard.press('Escape');
  });

  await test('top settings and brush buttons open desktop surfaces, not dead buttons or a bottom sheet', async () => {
    await page.click('#mobile-settings-toggle');
    await page.waitForFunction(() => !!document.querySelector('dialog[open] #settings-all'), null, { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.click('#mobile-tools-toggle');
    await page.waitForFunction(() => !!document.querySelector('.tool-flyout'), null, { timeout: 5000 });
    const geometry = await page.evaluate(() => {
      const menu = document.querySelector('.tool-flyout'), anchor = document.getElementById('mobile-tools-toggle');
      const m = menu.getBoundingClientRect(), a = anchor.getBoundingClientRect();
      return { top: m.top, anchorBottom: a.bottom, bottom: m.bottom, viewport: innerHeight };
    });
    assert.ok(geometry.top < geometry.anchorBottom, `desktop brush menu must open above the button: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.bottom <= geometry.viewport, 'brush menu must stay inside the viewport');
    const tools = await page.locator('.tool-flyout [data-tool]').evaluateAll(nodes => nodes.map(n => n.dataset.tool));
    for (const tool of ['cursor', 'trend', 'fibonacci', 'brush', 'text', 'long', 'ruler', 'delete']) assert.ok(tools.includes(tool), tool);
    await page.keyboard.press('Escape');
    // The same top-bar pencil restores the draggable rail for later drawing steps.
    await page.click('#mobile-tools-toggle');
  });

  await test('indicator fold arrow points up to hide and down to show; volume count is hidden while its pane is open', async () => {
    const toggle = page.locator('#study-legend-toggle');
    assert.equal(await toggle.count(), 1);
    const direction = async () => toggle.locator('path').first().getAttribute('d');
    const up = await direction();
    assert.match(up, /l-6$|15 6-6 6 6|6 15 6-6 6 6/, `expected up chevron, got ${up}`);
    await toggle.click();
    const down = await direction();
    assert.notEqual(down, up, 'folded legend must show the opposite arrow');
    assert.match(down, /l6 6|m6 9 6 6 6-6/, `expected down chevron, got ${down}`);
    await toggle.click();
    assert.equal(await direction(), up);
    const count = page.locator('#study-count');
    assert.equal(await count.isVisible(), false, 'study count is redundant while the volume pane is open');
    await page.click('#study-legend [data-study-collapse="volume"]');
    await page.waitForFunction(() => document.querySelector('#study-legend [data-study-chip="volume"]')?.classList.contains('is-collapsed'));
    assert.equal(await count.isVisible(), true, 'study count returns when the pane is collapsed');
    await page.click('#study-legend [data-study-collapse="volume"]');
  });

  await test('left-clicking a drawing selects it without opening the right-click action menu', async () => {
    const box = await page.locator('#chart').boundingBox();
    await page.click('#drawing-tools [data-tool="fibonacci"]');
    await page.click('.tool-flyout [data-tool="fibonacci"]');
    await page.mouse.click(box.x + box.width * .3, box.y + box.height * .7);
    await page.mouse.click(box.x + box.width * .65, box.y + box.height * .3);
    await page.waitForFunction(() => window.__alfaDebug.drawings.history.doc.drawings.length === 1);
    const id = await page.evaluate(() => window.__alfaDebug.drawings.history.doc.drawings.at(-1).id);
    const hit = await page.evaluate(id => {
      const node = document.querySelector(`[data-id="${id}"] .drawing-hit`);
      if (!node) throw new Error('drawing hit target missing');
      const svg = node.ownerSVGElement, r = svg.getBoundingClientRect();
      const sx = r.width / Number(svg.getAttribute('width')), sy = r.height / Number(svg.getAttribute('height'));
      const x1 = Number(node.getAttribute('x1')), y1 = Number(node.getAttribute('y1'));
      const x2 = Number(node.getAttribute('x2')), y2 = Number(node.getAttribute('y2'));
      return { x: r.left + (x1 + (x2 - x1) * .5) * sx, y: r.top + (y1 + (y2 - y1) * .5) * sy };
    }, id);
    await page.mouse.click(hit.x, hit.y);
    assert.equal(await page.locator('.chart-context-menu').count(), 0, 'left click must not open the action menu');
    assert.equal(await page.locator('#drawing-selection').isVisible(), true, 'left click must keep selection reachable');
    await page.mouse.click(hit.x, hit.y, { button: 'right' });
    assert.equal(await page.locator('.chart-context-menu').count(), 1, 'right click still opens the action menu');
    assert.match(await page.locator('.chart-context-menu').textContent(), /ÇİZİM/);
    await page.keyboard.press('Escape');
  });

  await test('Fibonacci settings commit on close without a per-setting Apply step', async () => {
    const id = await page.evaluate(() => window.__alfaDebug.drawings.history.doc.drawings.at(-1).id);
    await page.click('#drawing-manage');
    await page.locator(`#drawing-objects [data-object-id="${id}"]`).click();
    assert.equal(await page.locator('#drawing-settings button[type="submit"]').textContent(), 'Tamam');
    assert.equal(await page.getByRole('button', { name: 'Ayarları uygula' }).count(), 0);
    await page.fill('#fib-levels', '0, 0.382, 0.5, 1');
    await page.fill('#drawing-width', '4');
    await page.locator('#chart').click({ position: { x: 600, y: 500 } });
    const drawing = await page.evaluate(id => window.__alfaDebug.drawings.history.doc.drawings.find(d => d.id === id), id);
    assert.deepEqual(drawing.levels, [0, 0.382, 0.5, 1]);
    assert.equal(drawing.width, 4);
  });

  await test('watchlist rows reorder across sections and persist after reload', async () => {
    assert.deepEqual(await sectionOrder('section-crypto'), ['BTCUSDT', 'ETHUSDT', 'XRPUSDT']);
    await drag('BTCUSDT', '[data-watch-section="section-crypto"] [data-symbol="XRPUSDT"]');
    assert.deepEqual(await sectionOrder('section-crypto'), ['ETHUSDT', 'BTCUSDT', 'XRPUSDT']);
    await drag('ETHUSDT', '[data-watch-section="section-fx"]');
    assert.deepEqual(await sectionOrder('section-crypto'), ['BTCUSDT', 'XRPUSDT']);
    assert.deepEqual(await sectionOrder('section-fx'), ['ETHUSDT', 'OKX:BNBUSDT.P', 'OKX:AVAXUSDT.P']);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('alfa-watchlist:v1:guest')));
    assert.deepEqual(saved.lists[0].sections[0].symbols, ['BTCUSDT', 'XRPUSDT']);
    assert.deepEqual(saved.lists[0].sections[1].symbols, ['ETHUSDT', 'OKX:BNBUSDT.P', 'OKX:AVAXUSDT.P']);
    await page.reload(); await ready();
    assert.deepEqual(await sectionOrder('section-crypto'), ['BTCUSDT', 'XRPUSDT']);
    assert.deepEqual(await sectionOrder('section-fx'), ['ETHUSDT', 'OKX:BNBUSDT.P', 'OKX:AVAXUSDT.P']);
  });

  await test('tester entry starts a replay with the backtest panel visible and selected', async () => {
    await page.click('#lab-menu summary');
    await page.click('#tester-open');
    await page.click('#tester-replay');
    await page.waitForFunction(() => document.body.classList.contains('replay-mode'), null, { timeout: 30000 });
    assert.equal(await page.locator('#paper-panel').isVisible(), true, 'backtest panel must open with the session');
    assert.equal(await page.locator('#paper-panel [data-filter="tester"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#strategy-tester').isVisible(), true);
    assert.match(await page.locator('#strategy-tester').textContent(), /Performans|İşlem|Sermaye|Net R|Toplam/);
    for (const id of ['replay-play', 'replay-pause', 'replay-prev', 'replay-next', 'replay-restart', 'replay-stop', 'replay-timeline', 'replay-speed']) {
      assert.equal(await page.locator('#' + id).isVisible(), true, id);
    }
    await page.click('#replay-stop');
    await page.waitForFunction(() => !document.body.classList.contains('replay-mode'));
  });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, surface: 'web', batch: 'ux-corrections' }));
} finally {
  await browser.close();
}
