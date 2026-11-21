import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/daily-tasks.css', import.meta.url), 'utf8');
const src = fs.readFileSync(new URL('../assets/daily-tasks.mjs', import.meta.url), 'utf8');

function localDate(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function shift(delta) {
  const d = new Date(localDate() + 'T12:00:00'); d.setDate(d.getDate() + delta); return localDate(d);
}
function boot(user, store = new Map()) {
  const sandbox = {
    document: {
      hidden: false,
      getElementById: () => null,
      addEventListener: () => {},
      createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {}, append() {}, appendChild() {}, replaceChildren() {}, setAttribute() {} })
    },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    },
    AUTH: user ? { user: { id: user } } : {},
    setInterval: () => 0, setTimeout: () => 0, clearTimeout: () => {},
    console, Date, JSON, Math, Number, String, Object, Array
  };
  sandbox.window = sandbox;
  const names = Object.keys(sandbox);
  const api = new Function(...names, src + '\nreturn window.AlfaDailyTasks;')(...names.map(n => sandbox[n]));
  return { api, store };
}

test('günlük görev paneli ana sayfada, yerel ve hesaba özel kurulu', () => {
  assert.ok(html.includes('/assets/daily-tasks.css?v=1'));
  assert.ok(html.includes('/assets/daily-tasks.mjs?v=1'));
  assert.ok(html.includes('id="daily-tasks-panel"'));
  for (const id of ['dt-remind', 'dt-list', 'dt-count', 'dt-streak', 'dt-new', 'dt-time', 'dt-add', 'dt-badges', 'dt-toast']) {
    assert.ok(html.includes('id="' + id + '"'), id + ' eksik');
  }
  assert.match(css, /\.dt-item\.done/);
  assert.match(src, /'alfa_daily_tasks_' \+ uid\(\)/);
  assert.equal(src.includes('siteFetch'), false);
  assert.equal(src.includes('/api/'), false, 'yeni API çağrısı yok');
  const panel = html.slice(html.indexOf('id="daily-tasks-panel"'), html.indexOf('<a id="home-diary-link"'));
  assert.equal(panel.includes('Telegram'), false, 'görev panelinde Telegram çıkışı yok');
});

test('görev tamamlama XP, rozet ve günlük bonus verir', () => {
  const { api } = boot('u1');
  assert.equal(api.state().xp, 0);
  assert.equal(api.state().day, localDate());
  api.toggle('calendar');
  assert.equal(api.state().xp, 20);
  assert.equal(api.state().done.calendar > 0, true);
  assert.ok(api.state().badges.includes('first'));
  ['checkin', 'risk', 'note', 'portfolio', 'dergi'].forEach(id => api.toggle(id));
  assert.equal(api.state().xp, 190, '140 görev XP + 50 tamamlama bonusu');
  assert.ok(api.state().badges.includes('all'));
  api.toggle('calendar');
  assert.equal(api.state().done.calendar, undefined);
  assert.equal(api.state().xp, 120, 'bonus geri alınır, yanlış XP birikmez');
});

test('gün değişince görevler sıfırlanır, seri korunur', () => {
  const store = new Map([
    ['alfa_daily_tasks_u2', JSON.stringify({ day: shift(-1), lastDay: shift(-1), streak: 2,
      done: { calendar: 1, risk: 1 }, custom: [], xp: 40, bonus: shift(-1), badges: [], reminder: false })]
  ]);
  const { api } = boot('u2', store);
  const s = api.state();
  assert.equal(s.day, localDate());
  assert.deepEqual(s.done, {});
  assert.equal(s.streak, 3);
  assert.equal(s.bonus, '');
  assert.equal(s.xp, 40, 'toplam XP kalıcı');
  assert.equal(s.badges.includes('streak3'), true);
});

test('üye verileri birbirinden ayrı, hatırlatıcı opt-in', () => {
  const store = new Map();
  const a = boot('u3', store).api;
  const b = boot('u4', store).api;
  a.toggle('note');
  assert.equal(a.state().xp, 25);
  assert.equal(b.state().xp, 0);
  assert.equal(store.has('alfa_daily_tasks_u3'), true);
  assert.equal(store.has('alfa_daily_tasks_u4'), false, 'dokunulmayan üye için kayıt oluşmaz');
  assert.match(src, /Notification\.requestPermission\(\)/);
  assert.match(src, /Notification\.permission === 'granted'/);
});
