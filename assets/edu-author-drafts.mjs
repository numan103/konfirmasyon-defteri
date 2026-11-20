// Author-created drafts only, never a cache of student/admin channel responses.
// Every operation is scoped to the signed-in account. IndexedDB handles images
// without localStorage's small synchronous quota.
export function draftScope(account) {
  if (typeof account !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(account)) throw new Error('draft_account_required');
  return account;
}
export function draftRecord(account, draft) {
  draftScope(account);
  if (!draft || !/^[a-zA-Z0-9_-]{1,120}$/.test(draft.id || '') || !draft.channelId || !draft.mode) throw new Error('draft_invalid');
  return { ...structuredClone(draft), account, updatedAt: Date.now() };
}
export function createDraftStore(idb = globalThis.indexedDB) {
  let opening;
  function open() {
    if (!idb) return Promise.reject(new Error('draft_storage_unavailable'));
    if (!opening) opening = new Promise((resolve, reject) => {
      const r = idb.open('alfa-edu-author-drafts', 1);
      r.onupgradeneeded = () => {
        const store = r.result.createObjectStore('drafts', { keyPath: ['account', 'id'] });
        store.createIndex('account', 'account');
      };
      r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); resolve(r.result); };
      r.onerror = () => { opening = null; reject(r.error); };
      r.onblocked = () => { opening = null; reject(new Error('draft_storage_blocked')); };
    });
    return opening;
  }
  async function transaction(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', mode), request = action(tx.objectStore('drafts'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('draft_storage_failed'));
    });
  }
  return {
    async list(account) {
      draftScope(account);
      const records = await transaction('readonly', store => store.index('account').getAll(account));
      return records.filter(r => r.account === account).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    put(account, draft) { return transaction('readwrite', store => store.put(draftRecord(account, draft))); },
    remove(account, id) { draftScope(account); return transaction('readwrite', store => store.delete([account, id])); },
  };
}
export const drafts = createDraftStore();
