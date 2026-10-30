import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup() {
  const context = vm.createContext({ window: {}, console, Intl, Date });
  for (const file of ['ayna-i18n.js', 'ayna-core.js']) {
    vm.runInContext(fs.readFileSync(new URL('../ayna/' + file, import.meta.url), 'utf8'), context);
  }
  context.Ayna = context.window.Ayna;
  vm.runInContext(fs.readFileSync(new URL('../ayna/ayna-today.js', import.meta.url), 'utf8'), context);
  return context;
}

test('journal page is outside the access page, not hidden by its parent', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('<div id="page-erisim"');
  const end = html.indexOf('<div id="page-ayna"', start);
  assert.ok(start >= 0 && end > start);
  const tags = html.slice(start, end).match(/<\/?div\b[^>]*>/g) || [];
  let depth = 0;
  for (const tag of tags) {
    depth += tag.startsWith('</') ? -1 : 1;
    assert.ok(depth >= 0, 'unexpected extra closing div');
  }
  assert.equal(depth, 0, 'access page must be fully closed before journal page');
});

test('journal title is translated consistently', () => {
  const c = setup();
  assert.equal(c.Ayna.t('app.title'), 'Kişisel Günlük Asistan');
  c.window.LANG = 'en';
  assert.equal(c.Ayna.t('app.title'), 'Personal Journal Assistant');
});

test('priority stays available after 14:00 and escapes saved text', () => {
  const c = setup();
  c._localHour = () => 23;
  assert.match(c._cardMorning(null), /id="ay-mi"/);
  assert.match(c._cardMorning({ intention: '<script>unsafe</script>' }), /&lt;script&gt;/);
});

test('weekly overview counts distinct dates, not number of entries', () => {
  const c = setup();
  const html = c._cardRhythm(null, null, [], [
    { local_date: '2026-10-28', sleep_hours: null },
    { local_date: '2026-10-28', sleep_hours: 8 },
    { local_date: '2026-10-29', sleep_hours: 6 }
  ]);
  assert.match(html, /2 gün yazdın/);
  assert.match(html, /Ortalama uyku: 7 saat/);
});

test('entry preview escapes private text and preserves line breaks in CSS', () => {
  const c = setup();
  const html = c._cardJournalNotes([{ id: '1', body: '<img onerror="attack()">\nA note' }]);
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;img/);
  assert.match(html, /data-ay-entry="1"/);
});

test('resolved database errors must not be treated as successful saves', () => {
  const c = setup();
  const error = { code: '42501', message: 'Permission denied' };
  assert.throws(() => c.Ayna.checked({ error }), e => e === error);
  assert.equal(c.Ayna.checked({ data: 1 }).data, 1);
});

test('evening editor replaces only its host, leaving other journal sections intact', () => {
  const c = setup();
  const host = { innerHTML: '' };
  const container = {
    innerHTML: 'morning and quick note',
    querySelector: selector => selector === '#ay-evening-host' ? host : { addEventListener() {} }
  };
  for (const name of ['_initCompass', '_initWords', '_initPeopleChips', '_initRules']) c[name] = () => {};
  c._renderEveningForm(container, '2026-10-29', [], [], null, [], {});
  assert.equal(container.innerHTML, 'morning and quick note');
  assert.match(host.innerHTML, /id="ay-nb"/);
});

test('morning saves update in place and later saves update the same entry', async () => {
  const c = setup();
  let click, inserts = 0, updates = 0;
  const button = { disabled: false, addEventListener: (_, fn) => { click = fn; } };
  const input = { value: 'One priority' };
  const container = { querySelector: selector => selector === '#ay-ms' ? button : selector === '#ay-mi' ? input : { textContent: '' } };
  const query = { insert() { inserts++; return this; }, update() { updates++; return this; }, eq() { return this; }, select() { return this; }, single() { return Promise.resolve({ data: { id: 'morning-1' } }); } };
  c.Ayna.sb = () => ({ from: () => query });
  c.Ayna.flash = () => {};
  c.renderToday = () => { throw new Error('must not redraw'); };
  c._bindMorning(container, '2026-10-29', null);
  click(); await new Promise(setImmediate);
  input.value = 'Adjusted priority'; click(); await new Promise(setImmediate);
  assert.equal(inserts, 1);
  assert.equal(updates, 1);
  assert.equal(button.disabled, false);
});

test('coach analysis can be requested for an ordinary note, without importance threshold', async () => {
  const c = setup(); let request;
  const result = { textContent: '', innerHTML: '' }, button = { disabled: false };
  const container = { isConnected: true, querySelector: id => id === '#ay-analyze' ? button : result };
  c.Ayna.api = async (action, payload) => { request = { action, payload }; return { insight: { title: 'A reflection', body: 'One useful step' } }; };
  await c._runJournalAnalysis(container, { id: 'entry-1', kind: 'note', body: 'A quiet day' });
  assert.equal(request.action, 'reflect');
  assert.equal(request.payload.overview, true);
  assert.equal(request.payload.kind, 'instant');
  assert.match(result.innerHTML, /One useful step/);
  assert.equal(button.disabled, false);
});

test('empty people map still has an addressable card for the add-person form', () => {
  const c = setup();
  c.document = { getElementById: () => ({ addEventListener() {} }) };
  vm.runInContext(fs.readFileSync(new URL('../ayna/ayna-map.js', import.meta.url), 'utf8'), c);
  for (const name of ['drawMap', 'renderRingCard', 'injectMapStyle']) c[name] = () => {};
  const container = { innerHTML: '' };
  c.renderMapContent(container);
  assert.match(container.innerHTML, /id="ay-map-card"/);
  assert.match(container.innerHTML, /id="ay-person-picker"/);
});

test('relationship metrics ignore closed events and events older than 90 days', () => {
  const c = setup();
  vm.runInContext(fs.readFileSync(new URL('../ayna/ayna-map.js', import.meta.url), 'utf8'), c);
  c.Ayna.today = () => '2026-10-29';
  c._mapEvents = [
    { person_id: 'friend', local_date: '2026-10-29', impact: 2 },
    { person_id: 'friend', local_date: '2026-10-28', impact: -2, is_closed: true },
    { person_id: 'friend', local_date: '2025-01-01', impact: -2 }
  ];
  const metrics = c.calcMetrics('friend');
  assert.equal(metrics.n, 1);
  assert.equal(metrics.avgImpact, 2);
});
