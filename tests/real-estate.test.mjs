import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function section(start, end) { return html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))); }

test('Turkish amounts round trip as numeric millions and decimal costs', () => {
  const context = vm.createContext({});
  vm.runInContext(section('function uyapMoneyFormat(', 'function uyapQuickNote('), context);
  for (const [input, expected] of [['1000000', '1.000.000'], ['12345678,90', '12.345.678,90'], ['1.000.000', '1.000.000'], ['', '']]) {
    assert.equal(context.uyapMoneyFormat(input), expected);
  }
  assert.equal(context.uyapMoneyParse('1.250.000,50'), 1250000.5);
  assert.equal(context.uyapMoneyParse(context.uyapMoneyFormat(1200000.25)), 1200000.25);
  assert.ok(html.includes('amount: uyapMoneyParse(ca.value)'));
});

test('copy feedback reflects actual success, never a timeout or denied clipboard', async () => {
  const context = vm.createContext({ navigator: { clipboard: { writeText: async () => {} } }, setTimeout() {} });
  vm.runInContext(section('async function uyapCopyText(', 'function renderUyap('), context);
  const btn = { textContent: 'Kopyala', disabled: false };
  await context.uyapCopyText('https://example.com', btn);
  assert.equal(btn.textContent, 'Kopyalandı ✓');
  context.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
  btn.textContent = 'Kopyala';
  await context.uyapCopyText('https://example.com', btn);
  assert.equal(btn.textContent, 'Kopyalanamadı');
  assert.equal(btn.disabled, false);
});

test('inline notes save and clear without opening the property form', () => {
  const p = { id: 'one', notes: 'old' };
  let saves = 0;
  const context = vm.createContext({ uyapData: { properties: [p] }, uyapSave() { saves++; }, uyapQuickNote() {} });
  vm.runInContext(section('function uyapQuickNoteSave(', 'function uyapOpenForm('), context);
  const host = { querySelector: () => ({ value: ' new note ' }) };
  context.uyapQuickNoteSave(host, 'one', false);
  assert.equal(p.notes, 'new note');
  context.uyapQuickNoteSave(host, 'one', true);
  assert.equal(p.notes, '');
  assert.equal(saves, 2);
});

test('photo area focuses on click and only opens picker on double click', () => {
  assert.ok(html.includes('id="uyap-f-img-input" accept="image/*" multiple hidden'));
  assert.ok(html.includes("drop.addEventListener('click', function () { drop.focus(); })"));
  assert.ok(html.includes("drop.addEventListener('dblclick'"));
  assert.ok(html.includes("if (!page || page.classList.contains('hidden')) return;"));
});

test('property note text is selectable and edit is a separate header button', () => {
  const context = vm.createContext({ esc: (s) => String(s), uyapFmt: (n) => Number(n).toLocaleString('tr-TR') });
  vm.runInContext(section('function uyapCostBreakdown(', 'function uyapQuickNote('), context);
  const preview = context.uyapNotePreview({ id: 'one', notes: 'Read me' });
  assert.match(preview, /class="uyap-note-edit-btn"/);
  assert.match(preview, /<\/button><\/div><div class="uyap-card-notes-text">Read me<\/div>/);
  const costs = context.uyapCostBreakdown({ additionalCosts: [{ name: 'Tapu', amount: 1250000 }] });
  assert.match(costs, /Tapu/);
  assert.match(costs, /1\.250\.000/);
  assert.ok(html.includes('id="uyap-f-costs" readonly'));
  assert.ok(html.includes('totalEl.value = uyapMoneyFormat(total)'));
});
