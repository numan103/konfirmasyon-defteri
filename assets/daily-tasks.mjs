// Günlük görevler + hatırlatma + ödül. Yeni API yok, sunucuya yazılmaz.
// Veri hesaba özel, yalnızca bu cihazın localStorage'ında tutulur.
const $ = id => document.getElementById(id);
const XP_PER_LEVEL = 150;
const ALL_DONE_BONUS = 50;

const BASE_TASKS = [
  { id: 'calendar', icon: '📅', label: 'Piyasa takvimini kontrol et', meta: 'Bugün piyasayı ne etkiliyor?', time: '08:30', xp: 20, href: '?page=calendar' },
  { id: 'checkin', icon: '☀️', label: 'Sabah check-in yap', meta: 'Bugün nasıl hissediyorsun?', time: '09:00', xp: 25, href: '#morning-checkin' },
  { id: 'risk', icon: '🧮', label: 'Riskini hesapla', meta: 'İşlemden önce stop ve boyut', time: '10:00', xp: 20, href: '?page=calc' },
  { id: 'note', icon: '✍️', label: 'Günün notunu oku', meta: 'Alfa Edu’dan bir yazı', time: '12:30', xp: 25, href: '?page=egitim' },
  { id: 'portfolio', icon: '💼', label: 'Portföyünü güncelle', meta: 'Açık pozisyonları gözden geçir', time: '18:00', xp: 30, href: '?page=portfoy&portfoyTab=mine' },
  { id: 'dergi', icon: '🗞️', label: 'Alfa Dergi’ye göz at', meta: 'Haftanın piyasa özeti', time: '20:30', xp: 20, href: '?page=news' }
];
const BADGES = [
  { id: 'first', icon: '🌱', title: 'İlk Adım' },
  { id: 'all', icon: '🏆', title: 'Günün Kahramanı' },
  { id: 'streak3', icon: '🔥', title: '3 Gün Seri' },
  { id: 'streak7', icon: '⚡', title: '7 Gün Seri' },
  { id: 'master', icon: '👑', title: 'Görev Ustası' }
];

function uid() {
  try { return AUTH.user?.id ? String(AUTH.user.id) : 'guest'; } catch (e) { return 'guest'; }
}
const key = () => 'alfa_daily_tasks_' + uid();
function localDate(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function shiftDay(base, delta) {
  const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + delta); return localDate(d);
}
const nowMinute = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 80);

function blank() {
  return { day: localDate(), done: {}, custom: [], streak: 0, lastDay: '', xp: 0, bonus: '', badges: [], reminder: false, lastFired: '' };
}
function load() {
  let d = blank();
  try {
    const raw = JSON.parse(localStorage.getItem(key()) || 'null');
    if (raw && typeof raw === 'object') d = { ...d, ...raw };
  } catch (e) {}
  d.done = (d.done && typeof d.done === 'object' && !Array.isArray(d.done)) ? d.done : {};
  d.custom = Array.isArray(d.custom) ? d.custom.slice(0, 20).filter(x => x && str(x.label, 80)).map(x => ({
    id: str(x.id, 60) || newId(), label: str(x.label, 80), time: /^\d{2}:\d{2}$/.test(x.time) ? x.time : '', xp: 15
  })) : [];
  d.badges = Array.isArray(d.badges) ? d.badges.filter(x => BADGES.some(b => b.id === x)) : [];
  d.xp = Math.max(0, num(d.xp)); d.streak = Math.max(0, num(d.streak));
  const today = localDate();
  if (d.day !== today) {
    const hadAny = Object.keys(d.done).length > 0;
    d.streak = hadAny ? (d.lastDay === shiftDay(today, -1) ? d.streak + 1 : 1) : 0;
    d.done = {}; d.bonus = ''; d.day = today; d.lastFired = '';
  }
  return d;
}
function save() { try { localStorage.setItem(key(), JSON.stringify(data)); } catch (e) {} }
function newId() { return 'dt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }
function tasks() {
  return BASE_TASKS.concat(data.custom.map(c => ({ id: c.id, icon: '📌', label: c.label, meta: 'Kendi görevin' + (c.time ? ' · ' + c.time : ''), time: c.time, xp: c.xp, href: '', custom: true })));
}

let data = load();

function toast(text) {
  const box = $('dt-toast'); if (!box) return;
  box.textContent = text; box.classList.add('open');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => box.classList.remove('open'), 3200);
}
function earnedBadges() {
  const doneCount = Object.keys(data.done).length;
  const all = BASE_TASKS.every(t => data.done[t.id]);
  const ids = [];
  if (doneCount >= 1) ids.push('first');
  if (all) ids.push('all');
  if (data.streak >= 3) ids.push('streak3');
  if (data.streak >= 7) ids.push('streak7');
  if (data.xp >= 500) ids.push('master');
  return ids;
}
function syncRewards() {
  const current = earnedBadges();
  const fresh = current.filter(id => !data.badges.includes(id));
  data.badges = current;
  if (fresh.length) {
    const badge = BADGES.find(b => b.id === fresh[0]);
    toast(badge ? badge.icon + ' Yeni rozet: ' + badge.title + '!' : 'Yeni rozet kazandın!');
  }
}
function toggleTask(id) {
  const task = tasks().find(t => t.id === id); if (!task) return;
  if (data.done[id]) {
    delete data.done[id]; data.xp = Math.max(0, data.xp - task.xp);
    if (data.bonus === data.day) { data.xp = Math.max(0, data.xp - ALL_DONE_BONUS); data.bonus = ''; }
  } else {
    data.done[id] = Date.now(); data.xp += task.xp; data.lastDay = data.day;
    const all = BASE_TASKS.every(t => data.done[t.id]);
    if (all && data.bonus !== data.day) {
      data.xp += ALL_DONE_BONUS; data.bonus = data.day;
      toast('🎉 Bugünün tüm görevleri tamam! +' + ALL_DONE_BONUS + ' bonus XP');
    } else if (!all) toast('+' + task.xp + ' XP · güzel gidiyorsun kanka!');
  }
  syncRewards(); save(); render();
}

function render() {
  const list = $('dt-list'); if (!list) return;
  const all = tasks(); const doneCount = BASE_TASKS.filter(t => data.done[t.id]).length;
  const total = BASE_TASKS.length;
  list.replaceChildren();
  all.forEach(task => {
    const done = !!data.done[task.id];
    const row = document.createElement('div'); row.className = 'dt-item' + (done ? ' done' : '');
    const check = document.createElement('button'); check.type = 'button'; check.className = 'dt-check';
    check.textContent = done ? '✓' : ''; check.setAttribute('aria-label', (done ? 'Geri al: ' : 'Tamamla: ') + task.label);
    check.addEventListener('click', () => toggleTask(task.id));
    const icon = document.createElement('span'); icon.className = 'dt-icon'; icon.textContent = task.icon;
    const body = document.createElement('div'); body.className = 'dt-body';
    const label = document.createElement('span'); label.className = 'dt-label'; label.textContent = task.label;
    const meta = document.createElement('span'); meta.className = 'dt-meta';
    meta.textContent = task.meta + (task.time ? ' · ⏰ ' + task.time : '');
    body.append(label, meta);
    const xp = document.createElement('span'); xp.className = 'dt-xp'; xp.textContent = '+' + task.xp + ' XP';
    row.append(check, icon, body, xp);
    if (task.href) {
      const link = document.createElement('a'); link.className = 'dt-link'; link.href = task.href;
      link.textContent = task.href.startsWith('#') ? 'Git ↑' : 'Aç →';
      if (!task.href.startsWith('#')) link.setAttribute('data-nav', '');
      else link.addEventListener('click', e => {
        e.preventDefault(); const target = $(task.href.slice(1));
        if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.querySelector('button')?.focus(); }
        else toast('Check-in bugün zaten göründü, birazdan tekrar dene.');
      });
      row.appendChild(link);
    } else if (task.custom) {
      const del = document.createElement('button'); del.type = 'button'; del.className = 'dt-del';
      del.textContent = '×'; del.title = 'Görevi sil';
      del.addEventListener('click', () => {
        data.custom = data.custom.filter(c => c.id !== task.id);
        delete data.done[task.id]; data.xp = Math.max(0, data.xp - task.xp);
        if (data.bonus === data.day) { data.xp = Math.max(0, data.xp - ALL_DONE_BONUS); data.bonus = ''; }
        save(); render(); toast('Görev silindi.');
      });
      row.appendChild(del);
    }
    list.appendChild(row);
  });
  if ($('dt-count')) $('dt-count').textContent = doneCount + ' / ' + total + ' tamamlandı';
  if ($('dt-progress-fill')) $('dt-progress-fill').style.width = Math.round((doneCount / total) * 100) + '%';
  if ($('dt-streak')) $('dt-streak').textContent = '🔥 ' + data.streak + ' gün';
  const level = Math.floor(data.xp / XP_PER_LEVEL) + 1;
  if ($('dt-level')) $('dt-level').textContent = 'Seviye ' + level;
  if ($('dt-xp-fill')) $('dt-xp-fill').style.width = ((data.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100 + '%';
  if ($('dt-xp-text')) $('dt-xp-text').textContent = (data.xp % XP_PER_LEVEL) + ' / ' + XP_PER_LEVEL + ' XP';
  if ($('dt-remind')) $('dt-remind').textContent = data.reminder ? '🔔 Hatırlatıcı: açık' : '🔔 Hatırlatıcı: kapalı';
  const badgeBox = $('dt-badges');
  if (badgeBox) {
    badgeBox.replaceChildren();
    BADGES.forEach(b => {
      const on = data.badges.includes(b.id);
      const el = document.createElement('span'); el.className = 'dt-badge' + (on ? ' on' : '');
      const ic = document.createElement('i'); ic.textContent = b.icon;
      el.append(ic, document.createTextNode(b.title)); badgeBox.appendChild(el);
    });
  }
}

async function toggleReminder() {
  data.reminder = !data.reminder;
  if (data.reminder && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (e) {}
  }
  save(); render();
  toast(data.reminder
    ? '🔔 Hatırlatıcı açık — görev saatlerinde haber vereceğim.'
    : 'Hatırlatıcı kapatıldı. Görevler yine burada duruyor.');
  if (data.reminder) remindNow(true);
}

function pending() { return tasks().filter(t => !data.done[t.id] && t.time); }
function fire(message, title) {
  const body = message;
  if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(title || 'Alfa · Günlük Görevler', { body, tag: 'alfa-daily-tasks' }); return; } catch (e) {}
  }
  toast(body);
  $('daily-tasks-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function remindNow(force = false) {
  if (!data.reminder) return;
  const stamp = localDate() + ' ' + nowMinute();
  if (!force && data.lastFired === stamp) return;
  const due = pending(); if (!due.length) return;
  data.lastFired = stamp; save();
  const task = due[0];
  fire((due.length > 1 ? due.length + ' görevin bekliyor. ' : '') + task.icon + ' ' + task.label + ' — ' + task.xp + ' XP seni bekliyor.',
    'Alfa · Günlük Görevler');
}

function bind() {
  $('dt-remind')?.addEventListener('click', toggleReminder);
  $('dt-add')?.addEventListener('click', () => {
    const label = str($('dt-new')?.value, 80); if (!label) return;
    data.custom.push({ id: newId(), label, time: /^\d{2}:\d{2}$/.test($('dt-time')?.value || '') ? $('dt-time').value : '', xp: 15 });
    $('dt-new').value = ''; $('dt-time').value = '';
    save(); render(); toast('Görev eklendi · +15 XP');
  });
  $('dt-new')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('dt-add')?.click(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const fresh = load();
    if (fresh.day !== data.day || JSON.stringify(fresh.done) !== JSON.stringify(data.done)) { data = fresh; render(); }
  });
  setInterval(() => {
    const fresh = load();
    if (fresh.day !== data.day || fresh.xp !== data.xp || JSON.stringify(fresh.done) !== JSON.stringify(data.done)) {
      data = fresh; render();
    }
    if (!data.reminder) return;
    const minute = nowMinute();
    const due = pending().filter(t => t.time === minute);
    if (due.length) { remindNow(); return; }
    if (!data.lastFired && new Date().getHours() >= 9) {
      const left = pending().length;
      if (left) { data.lastFired = localDate() + ' ' + minute; save(); fire('Bugün ' + left + ' görevin var. Küçük adımlar, büyük fark.', 'Alfa · Günlük Görevler'); }
    }
  }, 30000);
}

syncRewards(); // gün başladığında/seri değiştiğinde rozetler yansısın
bind();
render();
window.AlfaDailyTasks = {
  state: () => JSON.parse(JSON.stringify(data)),
  toggle: toggleTask,
  refresh: render,
  remind: () => remindNow(true)
};
