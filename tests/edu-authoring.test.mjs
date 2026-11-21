import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createDraftStore, draftRecord, draftScope } from '../assets/edu-author-drafts.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fakeIndexedDB() {
  const data = new Map();
  const db = {
    createObjectStore() { return { createIndex() {} }; },
    close() {},
    transaction() {
      const tx = {
        objectStore() {
          function request(action) {
            const r = {};
            queueMicrotask(() => {
              try { r.result = action(); tx.oncomplete?.(); }
              catch (e) { tx.error = e; tx.onerror?.(); }
            });
            return r;
          }
          return {
            put: record => request(() => { data.set(JSON.stringify([record.account, record.id]), structuredClone(record)); return [record.account, record.id]; }),
            delete: key => request(() => data.delete(JSON.stringify(key))),
            index: () => ({ getAll: account => request(() => [...data.values()].filter(r => r.account === account).map(record => structuredClone(record))) }),
          };
        },
      };
      return tx;
    },
  };
  return {
    open() {
      const r = { result: db };
      queueMicrotask(() => { r.onupgradeneeded?.(); r.onsuccess?.(); });
      return r;
    },
  };
}
const note = (id = 'draft-1') => ({
  id, channelId: 'teacher', sectionId: 'paid', topicId: 'obo', mode: 'video-add',
  fields: { title: 'OBO – TOBO', body: 'Açıklama\n{{foto:1}}', tricks: 'Boyun çizgisi', access: 'paid', plans: ['video'], photos: [{ url: 'data:image/png;base64,AAAA', caption: 'Örnek' }], vids: [{ url: 'https://youtu.be/extra' }] },
});
test('author drafts are account-scoped, cloned and never trust a supplied account', () => {
  const original = note();
  const stored = draftRecord('account-A', { ...original, account: 'account-B' });
  assert.equal(stored.account, 'account-A');
  original.fields.body = 'changed';
  assert.equal(stored.fields.body, 'Açıklama\n{{foto:1}}');
  for (const invalid of ['', '../other', 'user@email.com', null]) assert.throws(() => draftScope(invalid));
  assert.throws(() => draftRecord('account-A', { id: 'bad key' }));
});
test('durable draft roundtrip preserves images/tricks/videos and deletion never crosses accounts', async () => {
  const idb = fakeIndexedDB(), first = createDraftStore(idb);
  await first.put('account-A', note());
  await first.put('account-B', { ...note(), fields: { body: 'Başka hesabın notu' } });
  const afterReload = createDraftStore(idb);
  const records = await afterReload.list('account-A');
  assert.equal(records.length, 1);
  assert.equal(records[0].fields.photos[0].caption, 'Örnek');
  assert.equal(records[0].fields.tricks, 'Boyun çizgisi');
  assert.equal(records[0].fields.vids[0].url, 'https://youtu.be/extra');
  await afterReload.remove('account-A', 'draft-1');
  assert.equal((await afterReload.list('account-A')).length, 0);
  assert.equal((await afterReload.list('account-B'))[0].fields.body, 'Başka hesabın notu');
});
test('storage unavailable rejects rather than reporting a durable draft', async () => {
  await assert.rejects(createDraftStore(null).list('account-A'), /unavailable/);
  await assert.rejects(createDraftStore(null).put('account-A', note()), /unavailable/);
});
test('studio is a direct admin route, with independent editor and no student evaluation mount', () => {
  assert.match(html, /edustudio: 'admin'/);
  assert.match(html, /id="tab-edustudio"/);
  assert.match(html, /id="page-edustudio"/);
  const studioMarkup = html.slice(html.indexOf('<div id="page-edustudio"'), html.indexOf('<div id="page-egitim"'));
  assert.doesNotMatch(studioMarkup, /id="edu-feedback"|eduplans-root|Öğrenci değerlendirm/);
  const feedback = html.slice(html.indexOf('function mountEduFeedback('), html.indexOf('// EDU_FEEDBACK_CONTEXT_END'));
  assert.match(feedback, /if \(chIsAdmin\(\) \|\| currentPage === 'edustudio'\).*clear\(\); return/);
});
test('drafts survive form closure/navigation and save targets original context, not the browsing selection', () => {
  assert.match(html, /function showPage\(name, skipAnim\) \{\s+if \(typeof chDraftCapture === 'function'\) chDraftCapture\(\)/);
  assert.match(html, /function chCloseForm\(\) \{\s+chDraftCapture\(\)/);
  assert.match(html, /channelsData\.traders\[context\.channelId\]/);
  assert.match(html, /sectionId = context\.sectionId/);
  assert.match(html, /if \(currentPage === 'edustudio' && isVideo\)/);
  assert.match(html, /chForm\.mode = 'video-edit'; chForm\.vidId = nextVid/);
  assert.match(html, /e\.key\.toLowerCase\(\) === 's'/);
  assert.match(html, /window\.addEventListener\('beforeunload'/);
  assert.doesNotMatch(html, /localStorage\.setItem\(['"]alfa-edu-(?:author-)?draft/);
});
function saveFixture({ succeeds = true, mode = 'video-add' } = {}) {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', disabled: false, inert: false, textContent: '' });
    return nodes.get(id);
  };
  get('ch-in-title').value = 'Yeni not'; get('ch-in-body').value = 'İlk açıklama'; get('ch-in-access').value = 'paid';
  let closes = 0;
  const saves = [];
  const trader = { id: 'teacher', name: 'Teacher', secMeta: [{ id: 'paid', title: 'Ücretli', access: 'paid' }, { id: 'other', title: 'Ücretsiz' }], sections: {
    paid: [{ id: 'obo', title: 'OBO', videos: [] }], other: [{ id: 'other-topic', videos: [] }],
  } };
  const state = {
    structuredClone, document: { getElementById: get, querySelectorAll: () => [] },
    chForm: { mode, channelId: 'teacher', sectionId: 'paid', topicId: 'obo', vidId: null },
    channelsData: { traders: { teacher: trader }, order: ['teacher'] },
    chDraftId: 'draft-1', chDraftAccount: 'author', chDraftBaseline: '', chDraftPersisted: '',
    chStudioBusy: false, chMediaPending: 0, AUTH: { user: { id: 'author' } },
    currentPage: 'edustudio', channelOpen: 'teacher', chSec: 'other', chTopic: 'other-topic', chVid: null,
    chCanEdit: () => true, chIsDailyForm: () => false, ytId: () => null, ytListId: () => null, chUid: () => 'new-item',
    chSelectedPlans: () => ['video'], chCollectPhotos: () => [], chCollectVideos: () => [],
    chSecMeta: t => t.secMeta, chDraftFields: () => ({ body: get('ch-in-body').value }),
    chDraftForget: async () => true, chDraftStatus: text => { state.status = text; },
    renderEduStudioTree() {}, chStudioNotice() {}, chCloseForm: () => { closes++; },
    async saveChannel(t) {
      saves.push(structuredClone(t));
      if (succeeds) state.channelsData.traders[t.id] = structuredClone(t);
      return succeeds;
    },
  };
  const context = vm.createContext(state);
  vm.runInContext(html.slice(html.indexOf('async function chSaveForm()'), html.indexOf('function chOpenNew()')), context);
  return { state, get, saves, closes: () => closes, save: () => vm.runInContext('chSaveForm()', context) };
}
test('saving a studio note keeps editor open, targets original topic and subsequent saves update rather than duplicate', async () => {
  const f = saveFixture();
  await f.save();
  assert.equal(f.closes(), 0);
  assert.equal(f.state.chForm.mode, 'video-edit');
  assert.equal(f.state.chForm.vidId, 'new-item');
  assert.equal(f.saves[0].sections.paid[0].videos[0].body, 'İlk açıklama');
  assert.equal(f.saves[0].sections.other[0].videos.length, 0);
  f.get('ch-in-body').value = 'Devam eden açıklama';
  await f.save();
  assert.equal(f.saves[1].sections.paid[0].videos.length, 1);
  assert.equal(f.saves[1].sections.paid[0].videos[0].body, 'Devam eden açıklama');
  assert.match(f.state.status, /Sunucuya kaydedildi/);
});
test('failed saves preserve form, draft context and current selection without mutating saved content', async () => {
  const f = saveFixture({ succeeds: false });
  await f.save();
  assert.equal(f.closes(), 0);
  assert.equal(f.state.chForm.mode, 'video-add');
  assert.equal(f.state.chDraftId, 'draft-1');
  assert.equal(f.state.chSec, 'other');
  assert.equal(f.state.chTopic, 'other-topic');
  assert.equal(f.state.channelsData.traders.teacher.sections.paid[0].videos.length, 0);
  assert.equal(f.get('ch-in-save').disabled, false);
  assert.equal(f.get('ch-form').inert, false);
});
test('section defaults can be edited without repricing existing free lessons', async () => {
  const f = saveFixture({ mode: 'sec-edit' });
  f.state.channelsData.traders.teacher.sections.paid[0].videos.push({ id: 'old', title: 'Eski ders', access: 'free', url: 'https://youtu.be/old' });
  await f.save();
  assert.equal(f.saves[0].secMeta[0].title, 'Yeni not');
  assert.equal(f.saves[0].secMeta[0].access, 'paid');
  assert.equal(f.saves[0].sections.paid[0].videos[0].access, 'free');
});
test('same-account sign-in, token refresh and profile updates never invalidate author workspace', () => {
  const context = vm.createContext({});
  vm.runInContext(html.slice(html.indexOf('function chWorkspaceIdentityChanged('), html.indexOf('function chStudioNavigate(')), context);
  for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED']) {
    assert.equal(vm.runInContext(`chWorkspaceIdentityChanged('${event}','same-id','same-id')`, context), false);
  }
  assert.equal(vm.runInContext("chWorkspaceIdentityChanged('SIGNED_OUT','same-id',undefined)", context), true);
  assert.equal(vm.runInContext("chWorkspaceIdentityChanged('SIGNED_IN','old-id','new-id')", context), true);
});
test('actual auth callback preserves form/data on tab-focus reauthentication and captures drafts before account reset', () => {
  let callback, closes = 0, capturedWithData = false;
  const state = {
    AUTH: { user: { id: 'author' }, client: { auth: { onAuthStateChange(fn) { callback = fn; } } } },
    channelsData: { traders: { teacher: { id: 'teacher' } }, order: ['teacher'] }, channelsLoaded: true, channelsLoading: null, channelsError: '',
    chDraftAccount: 'author', chDraftId: 'draft', chDraftPersisted: 'body', chStudioRestoredFor: 'author',
    chDraftMemory: new Map(), chStudioWorkspace: { account: 'author' }, chWorkspaceEpoch: 0,
    chDraftCapture() { capturedWithData = !!state.channelsData.traders.teacher; }, chCloseForm() { closes++; }, chCloseProf() {},
    document: { getElementById: () => null, querySelectorAll: () => [] }, localStorage: { removeItem() {} },
  };
  const context = vm.createContext(state);
  vm.runInContext(html.slice(html.indexOf('function chWorkspaceIdentityChanged('), html.indexOf('function chStudioNavigate(')), context);
  vm.runInContext(html.slice(html.indexOf('AUTH.client.auth.onAuthStateChange((event, session)'), html.indexOf("  $('auth-form').addEventListener")), context);
  callback('SIGNED_IN', { user: { id: 'author' } });
  callback('USER_UPDATED', { user: { id: 'author' } });
  assert.equal(closes, 0); assert.ok(state.channelsData.traders.teacher); assert.ok(state.chStudioWorkspace);
  callback('SIGNED_OUT', null);
  assert.equal(closes, 1); assert.equal(capturedWithData, true);
  assert.equal(Object.keys(state.channelsData.traders).length, 0); assert.equal(state.chStudioWorkspace, null);
});
test('journal setup is deterministic per day, does not mutate existing courses and only materializes on save', () => {
  const context = vm.createContext({ chSecMeta: t => t.secMeta });
  vm.runInContext(html.slice(html.indexOf('function chJournalSetup('), html.indexOf('function chQuickJournal(')), context);
  vm.runInContext(html.slice(html.indexOf('function chEnsureJournal('), html.indexOf('function chDraftStore(')), context);
  const trader = { id: 'teacher', secMeta: [{ id: 'free', title: 'Ücretsiz kurs' }], sections: { free: [{ id: 'old', videos: [{ id: 'free-video', access: 'free' }] }] } };
  context.trader = trader;
  vm.runInContext("setup=chJournalSetup(trader,'2026-11-20')", context);
  assert.equal(trader.secMeta.length, 1, 'opening a journal editor must not create saved content');
  vm.runInContext('chEnsureJournal(trader,setup);chEnsureJournal(trader,setup)', context);
  assert.equal(trader.secMeta.length, 2);
  assert.equal(trader.secMeta[1].kind, 'journal');
  assert.equal(trader.secMeta[1].access, 'paid', 'private-source notes do not default to public');
  assert.equal(trader.sections['trader-gunlugu'].length, 1, 'same-day retries never duplicate a topic');
  assert.equal(trader.sections.free[0].videos[0].access, 'free');
  vm.runInContext("chEnsureJournal(trader,chJournalSetup(trader,'2026-11-21'))", context);
  assert.equal(trader.sections['trader-gunlugu'][0].title, '2026-11-21');
  trader.sections['trader-gunlugu'] = Array.from({ length: 1000 }, (_, i) => ({ id: 'old-' + i, videos: [] }));
  trader.secMeta[1].access = 'free';
  const rollover = vm.runInContext("chJournalSetup(trader,'2026-11-22')", context);
  assert.equal(rollover.sectionId, 'trader-gunlugu-2');
  assert.equal(rollover.title, 'Trader Günlüğü · 2');
  assert.equal(rollover.access, 'free', 'archive rollover inherits the author-selected visibility');
  assert.equal(trader.sections['trader-gunlugu'].length, 1000);
});
function channelLoaderFixture(siteFetch) {
  const original = { traders: { teacher: { id: 'teacher', name: 'Saved channel' } }, order: ['teacher'] };
  const state = {
    channelsData: original, channelsLoaded: false, channelsLoading: null, channelOpen: 'teacher',
    chWorkspaceEpoch: 0, channelsError: '', chUserEmail: () => 'admin@test.dev',
    localStorage: { removeItem() {} }, siteFetch, AbortSignal,
  };
  const context = vm.createContext(state);
  vm.runInContext(html.slice(html.indexOf('async function loadChannels()'), html.indexOf('// Adminin kendi kanalı')), context);
  return { state, original, load: () => vm.runInContext('loadChannels()', context) };
}
test('concurrent student/studio loading shares one request instead of marking an empty cache as loaded', async () => {
  let resolve, calls = 0;
  const f = channelLoaderFixture(() => { calls++; return new Promise(r => { resolve = r; }); });
  const a = f.load(), b = f.load();
  assert.equal(calls, 1); assert.equal(f.state.channelsLoaded, false);
  resolve(Response.json({ ok: true, data: { traders: { loaded: { id: 'loaded' } }, order: ['loaded'] } }));
  await Promise.all([a, b]);
  assert.equal(f.state.channelsLoaded, true); assert.ok(f.state.channelsData.traders.loaded);
});
test('account-epoch guard prevents late requests from putting the previous user data back into the workspace', async () => {
  let resolve;
  const f = channelLoaderFixture(() => new Promise(r => { resolve = r; }));
  const pending = f.load();
  f.state.chWorkspaceEpoch++; f.state.channelsData = { traders: {}, order: [] }; f.state.channelsLoading = null;
  resolve(Response.json({ ok: true, data: { traders: { secret: { body: 'Old account data' } }, order: ['secret'] } }));
  await pending;
  assert.equal(Object.keys(f.state.channelsData.traders).length, 0);
});
test('temporary channel read failure keeps the saved channel and current selection visible', async () => {
  const f = channelLoaderFixture(async () => Response.json({}, { status: 503 }));
  await f.load();
  assert.equal(f.state.channelsData, f.original); assert.equal(f.state.channelOpen, 'teacher');
  assert.equal(f.state.channelsLoaded, true); assert.match(f.state.channelsError, /yüklenemedi/);
});
test('public Daily Notes belong to the home page and have a separate studio mode without a Telegram approval step', () => {
  const home = html.indexOf('id="page-home"'), notes = html.indexOf('id="home-daily-notes"'), studio = html.indexOf('id="page-edustudio"');
  assert.ok(home >= 0 && notes > home && notes < studio);
  assert.equal([...html.matchAll(/id="home-daily-notes"/g)].length, 1);
  assert.match(html, /data-author-mode="daily"/); assert.match(html, /data-author-mode="course"/);
  assert.doesNotMatch(html, /Günlüğe taslak olarak al|Taslağa alıp kontrol ederek kaydet/);
  assert.match(html, /g\('edu-author-journal'\)\.addEventListener\('click', \(\) => chOpenDailyNote\(\)\)/);
  assert.match(html, /dailyId: chForm\.dailyId/);
});
test('Daily Notes live on the education page too, with a featured "günün yazısı" on both surfaces', () => {
  const edu = html.indexOf('id="page-egitim"'), eduNotes = html.indexOf('id="edu-daily-notes"');
  assert.ok(edu > 0 && eduNotes > edu);
  assert.equal([...html.matchAll(/id="home-daily-feature"/g)].length, 1);
  assert.equal([...html.matchAll(/id="edu-daily-feature"/g)].length, 1);
  assert.equal([...html.matchAll(/Günün yazısı · Alfa Edu/g)].length, 2);
  assert.match(html, /function chDailyFeature\(item\)/);
  assert.match(html, /function chRenderDaily\(scope, items, more, hasMore\)/);
  assert.match(html, /chLoadEduDaily\(\)/);
  assert.match(html, /g\('edu-daily-refresh'\)\?\.addEventListener\('click', \(\) => \{ chCloseDailyReader\(\); chLoadEduDaily\(false, true\); \}\)/);
  assert.match(html, /if \(dailyPanel\) dailyPanel\.classList\.add\('hidden'\);/);
});
test('daily notes open inline in the education panel with paging for older notes', () => {
  assert.match(html, /id="edu-daily-reader" class="daily-reader hidden"/);
  assert.match(html, /id="edu-daily-more"/);
  assert.match(html, /g\('edu-daily-more'\)\?\.addEventListener\('click', \(\) => chLoadEduDaily\(true\)\)/);
  assert.match(html, /async function chOpenDailyReader\(id\)/);
  assert.match(html, /function chCloseDailyReader\(\)/);
  assert.match(html, /view=daily-notes&note=' \+ id/);
  assert.match(html, /chBuildNoteBox\(\{ \.\.\.item, access: 'free' \}, item\.title\)/);
  assert.match(html, /showPage\('egitim'\)/);
  assert.match(html, /chEditDailyById\(id\)/);
  assert.match(html, /'Listeye dön ×'/);
  assert.doesNotMatch(html, /Yazıyı oku →'.*chOpenDailyViewer/);
});
test('education catalog opens on "Sana açık" with a separate package option', () => {
  assert.match(html, /id="edu-access-tabs"/);
  assert.match(html, /data-access="mine" aria-pressed="true"/);
  assert.match(html, /data-access="package" aria-pressed="false"/);
  assert.match(html, /let eduAccessView = 'mine'/);
  assert.match(html, /const mine = courses\.filter\(c => c\.openTotal > 0\)/);
  assert.match(html, /const locked = courses\.filter\(c => c\.lockedTotal > 0\)/);
  assert.match(html, /grid\.appendChild\(eduCard\(c, i, packageView\)\)/);
  assert.doesNotMatch(html, /grid\.appendChild\(eduAdvancedCard\(\)\);\s*list\.forEach\(\(c, i\) => grid\.appendChild\(eduCard\(c, i\)\)\)/);
  assert.match(html, /button\.classList\.toggle\('hidden', isPackage && !locked\.length\)/);
  assert.match(html, /g\('edu-access-tabs'\)\?\.addEventListener\('click'/);
});
test('admin analytics opens with shortcut cards and folds the heavy charts', () => {
  const page = html.indexOf('id="page-analitik"'), shortcuts = html.indexOf('id="ana-shortcuts"');
  assert.ok(page > 0 && shortcuts > page);
  assert.match(html, /data-ana-go="daily"/);
  assert.match(html, /data-ana-go="edustudio"/);
  assert.match(html, /class="ana-fold ana-visual-fold"/);
  assert.match(html, /visual\.push\('<div class="ana-section ana-growth"/);
  assert.match(html, /if \(go === 'daily'\) \{ showPage\('edustudio'\); chSetStudioMode\('daily'\); return; \}/);
});
