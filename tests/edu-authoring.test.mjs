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
    chCanEdit: () => true, ytId: () => null, ytListId: () => null, chUid: () => 'new-item',
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
