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
