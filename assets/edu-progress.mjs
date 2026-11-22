const LEGACY_KEY = 'alfa-chprog-v1';
const MIGRATION_PREFIX = 'alfa-eduprog-migrated-v1:';

function enc(v) { return encodeURIComponent(String(v || '')); }
export function canonicalKey(chId, secId, topicId, videoId) {
  const parts = [chId, secId, topicId, videoId].map(v => String(v || ''));
  if (parts.some(p => !p)) return '';
  return parts.map(enc).join(':');
}
export function courseKey(chId, secId) { return enc(chId) + ':' + enc(secId); }

function readLegacy() {
  try { const raw = localStorage.getItem(LEGACY_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function writeLegacy(obj) {
  try { localStorage.setItem(LEGACY_KEY, JSON.stringify(obj)); } catch { /* ignore */ }
}

let state = {
  mode: 'guest', // guest | user
  userId: '',
  epoch: 0,
  marks: {}, // canonicalKey -> 1
  certificates: [], // from server
  revision: null,
  loaded: false,
  loading: null,
  pending: new Map(), // key -> timer/id not needed; we just send
  saveTimer: 0,
  dirty: new Map(), // key -> {k,d,t,src}
  migrationDone: false,
};

function emit() {
  if (typeof window !== 'undefined' && typeof window.refreshEduLearningRewards === 'function') window.refreshEduLearningRewards();
  if (typeof window.renderChannelView === 'function' && window.currentPage === 'egitim') window.renderChannelView();
}

function guestBucketId() {
  const email = typeof window !== 'undefined' && window.AUTH?.user?.email ? String(window.AUTH.user.email).toLowerCase() : '';
  return email || 'guest';
}

function loadGuestMarks() {
  const all = readLegacy();
  const bucket = all[guestBucketId()] || {};
  const marks = {};
  for (const [k, v] of Object.entries(bucket)) { if (v) marks[k] = 1; }
  return marks;
}
function saveGuestMark(key, on) {
  const all = readLegacy();
  const u = guestBucketId();
  if (!all[u] || typeof all[u] !== 'object') all[u] = {};
  if (on) all[u][key] = 1; else delete all[u][key];
  writeLegacy(all);
}

function dailyStoreId() {
  if (state.mode === 'user' && state.userId) return 'u:' + state.userId;
  return 'g:' + guestBucketId();
}
function dailyDayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function readDaily() {
  try {
    const raw = localStorage.getItem('alfa-edu-daily-v1:' + dailyStoreId());
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch { return {}; }
}
function writeDaily(obj) {
  try { localStorage.setItem('alfa-edu-daily-v1:' + dailyStoreId(), JSON.stringify(obj)); } catch {}
}
function recordDailyDone() {
  const day = dailyDayKey();
  const obj = readDaily();
  obj[day] = (Number(obj[day]) || 0) + 1;
  // keep last 120 days
  const keys = Object.keys(obj).sort();
  while (keys.length > 120) { delete obj[keys.shift()]; }
  writeDaily(obj);
}
export function dailyStats(today = new Date()) {
  const obj = readDaily();
  const day = dailyDayKey(today);
  const todayCount = Number(obj[day]) || 0;
  let streak = 0;
  const cur = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // count streak including today if done, else allow continuing streak from yesterday
  const hasToday = (Number(obj[dailyDayKey(cur)]) || 0) > 0;
  if (!hasToday) cur.setDate(cur.getDate() - 1);
  while ((Number(obj[dailyDayKey(cur)]) || 0) > 0) { streak++; cur.setDate(cur.getDate() - 1); if (streak > 365) break; }
  return { todayCount, goal: 1, goalDone: todayCount >= 1, streak, hasToday };
}

async function api(path, opts) {
  const fn = typeof window !== 'undefined' && typeof window.siteFetch === 'function' ? window.siteFetch : fetch;
  return fn(path, opts);
}

async function fetchServer() {
  const res = await api('/api/edu-shared?kind=progress', { method: 'GET' });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !j.ok) throw new Error(j?.error || 'service_unavailable');
  return j;
}

function marksFromServer(data) {
  const out = {};
  const marks = data?.marks && typeof data.marks === 'object' ? data.marks : {};
  for (const [k, v] of Object.entries(marks)) {
    if (v && (v.d === 1 || v.d === true)) out[k] = 1;
  }
  return out;
}

function scheduleFlush() {
  if (state.mode !== 'user') return;
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(flush, 400);
}

async function flush() {
  if (state.mode !== 'user' || !state.userId) return;
  if (state.saveTimer) { clearTimeout(state.saveTimer); state.saveTimer = 0; }
  if (!state.dirty.size) return;
  const batch = Array.from(state.dirty.values()).slice(0, 200);
  for (const m of batch) state.dirty.delete(m.k);
  const epoch = state.epoch;
  try {
    const res = await api('/api/edu-shared?kind=progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'merge', mode: batch.some(x => x.src === 'migration') && batch.every(x => x.src === 'migration') ? 'migration' : 'user', marks: batch }),
    });
    const j = await res.json().catch(() => null);
    if (epoch !== state.epoch || state.userId !== state.userId) return;
    if (!res.ok || !j || !j.ok) throw new Error(j?.error || 'service_unavailable');
    state.revision = j.revision || state.revision;
    // reconcile: server returns authoritative done marks
    if (j.data && j.data.marks) {
      // merge server marks into local cache without wiping optimistic marks not yet flushed
      const serverMarks = marksFromServer(j.data);
      for (const k of Object.keys(state.marks)) {
        if (!serverMarks[k] && !state.dirty.has(k)) delete state.marks[k];
      }
      for (const [k, v] of Object.entries(serverMarks)) state.marks[k] = v;
    }
    if (Array.isArray(j.certificates)) state.certificates = j.certificates;
    if (state.dirty.size) scheduleFlush();
    emit();
  } catch (e) {
    // rollback batch into dirty for retry; restore optimistic? simpler: requeue and show warning
    for (const m of batch) if (!state.dirty.has(m.k)) state.dirty.set(m.k, m);
    console.warn('[EduProgress] save failed', e);
    if (typeof window !== 'undefined' && window.chToast) window.chToast('İlerleme senkronize edilemedi. Tekrar denenecek.');
    setTimeout(() => { if (state.mode === 'user') scheduleFlush(); }, 3000);
  }
}

function legacyCanonicalKey(oldKey, channelsData) {
  // old key: channelId:videoId (2 parts) based on existing usage
  if (typeof oldKey !== 'string' || !oldKey) return [];
  const parts = oldKey.split(':');
  if (parts.length !== 2) return [];
  const [chId, vId] = parts;
  const trader = channelsData?.traders?.[chId];
  if (!trader || !trader.sections) return [];
  const out = [];
  for (const [secId, topics] of Object.entries(trader.sections)) {
    if (!Array.isArray(topics)) continue;
    for (const topic of topics) {
      if (!Array.isArray(topic?.videos)) continue;
      for (const v of topic.videos) {
        if (v && v.id === vId) out.push(canonicalKey(chId, secId, topic.id, v.id));
      }
    }
  }
  return out.filter(Boolean);
}

async function maybeMigrate(userId, channelsData) {
  if (!userId || state.migrationDone) return;
  const marker = MIGRATION_PREFIX + userId;
  try { if (localStorage.getItem(marker)) { state.migrationDone = true; return; } } catch { return; }
  const all = readLegacy();
  const email = typeof window !== 'undefined' && window.AUTH?.user?.email ? String(window.AUTH.user.email).toLowerCase() : '';
  const bucket = email && all[email] && typeof all[email] === 'object' ? all[email] : null;
  if (!bucket) { try { localStorage.setItem(marker, '1'); } catch {} state.migrationDone = true; return; }
  const marks = [];
  for (const [oldKey, val] of Object.entries(bucket)) {
    if (!val) continue;
    for (const k of legacyCanonicalKey(oldKey, channelsData)) {
      marks.push({ k, d: 1, t: Date.now(), src: 'migration' });
    }
  }
  if (!marks.length) { try { localStorage.setItem(marker, '1'); } catch {} state.migrationDone = true; return; }
  // send in chunks
  for (let i = 0; i < marks.length; i += 200) {
    const chunk = marks.slice(i, i + 200);
    const res = await api('/api/edu-shared?kind=progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'merge', mode: 'migration', marks: chunk }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || !j.ok) throw new Error(j?.error || 'migration_failed');
    state.revision = j.revision || state.revision;
    if (j.data && j.data.marks) {
      const serverMarks = marksFromServer(j.data);
      for (const [k, v] of Object.entries(serverMarks)) state.marks[k] = v;
    }
    if (Array.isArray(j.certificates)) state.certificates = j.certificates;
  }
  try { localStorage.setItem(marker, '1'); } catch {}
  state.migrationDone = true;
  emit();
}

async function boot(userId, epoch) {
  const uid = String(userId || '');
  state.epoch = epoch || 0;
  if (!uid) {
    state.mode = 'guest'; state.userId = ''; state.marks = loadGuestMarks(); state.certificates = []; state.revision = null; state.loaded = true; state.migrationDone = false; state.dirty.clear();
    return;
  }
  if (state.userId === uid && state.mode === 'user' && state.loaded) return;
  state.mode = 'user'; state.userId = uid; state.loaded = false; state.marks = {}; state.certificates = []; state.revision = null; state.dirty.clear(); state.migrationDone = false;
  try {
    const j = await fetchServer();
    if (state.userId !== uid || state.epoch !== epoch) return;
    state.revision = j.revision || null;
    state.marks = marksFromServer(j.data);
    state.certificates = Array.isArray(j.certificates) ? j.certificates : [];
    state.loaded = true;
    emit();
  } catch (e) {
    console.warn('[EduProgress] boot failed', e);
    state.loaded = false; // keep empty, UI can show sync warning
  }
}

function get(key) { return !!state.marks[key]; }
function snapshot() { return { ...state.marks }; }

function set(key, on) {
  if (!key) return;
  const want = !!on;
  if (state.mode !== 'user') {
    const prev = !!state.marks[key];
    if (prev === want) return;
    if (want) { state.marks[key] = 1; recordDailyDone(); } else delete state.marks[key];
    saveGuestMark(key, want);
    emit();
    return;
  }
  const prev = !!state.marks[key];
  if (prev === want) return;
  if (want) { state.marks[key] = 1; recordDailyDone(); } else delete state.marks[key];
  state.dirty.set(key, { k: key, d: want ? 1 : 0, t: Date.now(), src: 'user' });
  emit();
  scheduleFlush();
}

async function issueCertificate(course) {
  const res = await api('/api/edu-shared?kind=progress', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'issueCertificate', course }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !j.ok) throw new Error(j?.error || 'service_unavailable');
  if (j.certificate) {
    const idx = state.certificates.findIndex(c => c.course === j.certificate.course);
    const entry = { course: j.certificate.course, chId: '', secId: '', title: j.certificate.courseTitle, items: j.certificate.items, eligible: true, serial: j.certificate.serial, issuedAt: j.certificate.issuedAt };
    if (idx >= 0) state.certificates[idx] = { ...state.certificates[idx], ...entry }; else state.certificates.push(entry);
  }
  return j.certificate;
}

function eligibleCourses() { return (state.certificates || []).filter(c => c.eligible); }
function certificates() { return (state.certificates || []).slice(); }

const apiObj = { boot, snapshot, get, set, issueCertificate, eligibleCourses, certificates, canonicalKey, courseKey, maybeMigrate, flush, dailyStats, _state: () => state };
if (typeof window !== 'undefined') {
  window.EduProgress = apiObj;
  // Guest boot by default; auth flow will re-boot with user id.
  boot('', 0).catch(() => {});
}
export default apiObj;
