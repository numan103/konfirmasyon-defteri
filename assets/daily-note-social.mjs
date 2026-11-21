// Public reading; authenticated, server-persisted reactions. No optimistic/fake counts.
const roots = new Map(), cache = new Map(), requests = new Map(), drafts = new Map();
let epoch = 0;
const identity = () => typeof AUTH !== 'undefined' ? AUTH.user?.id || '' : '';
const node = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };
const button = (text, fn) => { const el = node('button', text, 'btn'); el.type = 'button'; el.onclick = fn; return el; };
const messages = { login_required: 'Beğenmek veya yorum yapmak için giriş yap.', too_many_requests: 'Biraz bekleyip tekrar dene.',
  not_allowed: 'Bu yorum için yetkin yok.', invalid_content: 'Yorum 2–1500, takma ad en fazla 40 karakter olmalı. Ad alanına e-posta yazma.',
  capacity: 'Bu yazının etkileşim alanı dolu.', note_not_found: 'Bu yazı artık yayında değil.' };
function key(id, account = identity()) { return account + ':' + id; }
function draftFor(id) { const k = key(id); if (!drafts.has(k)) drafts.set(k, { text: '', name: '', expanded: false, requestId: null }); return drafts.get(k); }
async function api(id, body, offset = 0) {
  const url = '/api/edu-shared?kind=channel&view=daily-notes&social=' + id + (offset ? '&offset=' + offset : '');
  const request = typeof window.siteFetch === 'function' ? window.siteFetch : fetch;
  let r;
  if (body) {
    // A write must never be automatically retried with a different account's
    // refreshed token. Capture authority once and let the user retry explicitly.
    const account = identity(), generation = epoch;
    const headers = typeof window.siteAuthHeaders === 'function' ? await window.siteAuthHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    if (account !== identity() || generation !== epoch) throw new Error('account_changed');
    r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  } else r = await request(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await r.json();
  if (!r.ok || !data.ok || data.social !== true) throw new Error(data.error || 'unavailable');
  return data;
}
function login() { if (typeof openAuth === 'function') openAuth('login'); }
function update(id, data) {
  cache.set(key(id), { at: Date.now(), data });
  for (const [root, state] of roots) {
    if (!root.isConnected) { roots.delete(root); continue; }
    if (state.id === id && state.account === identity()) { state.data = data; state.pending = false; state.error = ''; paint(root, state); }
  }
}
function paint(root, state) {
  if (state.account !== identity() || state.epoch !== epoch) return;
  root.replaceChildren();
  const preview = !!window.ALFA_PREVIEW_CONFIG, data = state.data, draft = draftFor(state.id);
  if (preview) { root.append(node('p', 'Önizleme salt okunur; beğeni ve yorum gönderilmez.', 'hint')); return; }
  const actions = node('div', null, 'daily-social-actions');
  const like = button(data ? (data.liked ? '♥ Beğendin · ' : '♡ Beğen · ') + data.likes : '♡ Beğen', () => {
    if (!identity()) return login();
    if (data) mutate(root, state, { op: 'like', liked: !data.liked });
  });
  like.setAttribute('aria-pressed', String(!!data?.liked)); like.disabled = state.pending || (!data && !!identity());
  const comments = button('💬 Yorumlar' + (data ? ' · ' + data.commentCount : ''), () => { draft.expanded = !draft.expanded; paint(root, state); });
  comments.setAttribute('aria-expanded', String(draft.expanded)); actions.append(like, comments); root.append(actions);
  if (state.error) root.append(node('p', state.error, 'daily-social-error'));
  if (!data && !state.pending) root.append(button('Tekrar yükle', () => load(root, state, true)));
  if (!draft.expanded) return;
  const panel = node('section', null, 'daily-social-comments'); panel.setAttribute('aria-label', 'Yazının yorumları');
  panel.append(node('p', 'Yorumlar herkese açıktır. E-posta, telefon veya hesap bilgisi paylaşma.', 'hint'));
  if (identity()) {
    const form = document.createElement('form');
    const label = node('label', 'Takma ad (isteğe bağlı)');
    const name = document.createElement('input'); name.maxLength = 40; name.autocomplete = 'nickname'; name.value = draft.name; name.oninput = () => { draft.name = name.value; }; label.append(name);
    const textLabel = node('label', 'Yorumun');
    const text = document.createElement('textarea'); text.minLength = 2; text.maxLength = 1500; text.required = true; text.value = draft.text;
    text.oninput = () => { draft.text = text.value; draft.requestId = null; }; textLabel.append(text);
    const submit = node('button', 'Yorumu paylaş', 'btn solid'); submit.type = 'submit'; submit.disabled = state.pending || !data;
    form.append(label, textLabel, submit);
    form.onsubmit = e => { e.preventDefault(); if (state.pending) return; draft.requestId ||= crypto.randomUUID(); mutate(root, state, { op: 'comment', text: draft.text, name: draft.name, requestId: draft.requestId }); };
    panel.append(form);
  } else panel.append(button('Yorum yapmak için giriş yap', login));
  if (data && !data.comments.length) panel.append(node('p', 'İlk yorumu sen yaz.', 'hint'));
  for (const comment of data?.comments || []) {
    const article = node('article', null, 'daily-social-comment'), head = node('div');
    head.append(node('strong', comment.name));
    if (comment.instructor) head.append(node('span', 'Eğitmen', 'daily-social-badge'));
    head.append(node('time', new Date(comment.createdAt).toLocaleDateString('tr-TR')));
    article.append(head, node('p', comment.text));
    if (comment.removable) article.append(button('Sil', () => {
      if (!state.pending && confirm('Bu yorum silinsin mi?')) mutate(root, state, { op: 'remove', id: comment.id });
    }));
    panel.append(article);
  }
  if (data?.hasMore) {
    const more = button('Önceki yorumlar', async () => {
      if (state.pending) return;
      state.pending = true; more.disabled = true;
      const account = identity(), generation = epoch;
      try {
        const next = await api(state.id, null, data.comments.length);
        if (account !== identity() || generation !== epoch || !root.isConnected) return;
        state.data = { ...next, comments: [...data.comments, ...next.comments.filter(c => !data.comments.some(old => old.id === c.id))] };
      } catch (e) { state.error = messages[e.message] || 'Yorumlar yüklenemedi. Tekrar dene.'; }
      finally { state.pending = false; if (generation === epoch) paint(root, state); }
    }); panel.append(more);
  }
  root.append(panel);
}
async function mutate(root, state, body) {
  if (state.pending || window.ALFA_PREVIEW_CONFIG || state.account !== identity() || state.epoch !== epoch) return;
  state.pending = true; state.error = ''; paint(root, state);
  const generation = epoch, account = identity();
  try {
    const data = await api(state.id, body);
    if (generation !== epoch || account !== identity()) return;
    if (body.op === 'comment') { const draft = draftFor(state.id); draft.text = ''; draft.requestId = null; }
    update(state.id, data);
  } catch (e) {
    if (generation !== epoch || account !== identity()) return;
    state.pending = false; state.error = messages[e.message] || 'Kaydedilemedi. Tekrar dene.'; paint(root, state);
  }
}
async function load(root, state, force = false) {
  if (window.ALFA_PREVIEW_CONFIG) return paint(root, state);
  const k = key(state.id, state.account), generation = epoch;
  const hit = cache.get(k);
  if (!force && hit && Date.now() - hit.at < 30000) { state.data = hit.data; state.pending = false; return paint(root, state); }
  state.pending = true; paint(root, state);
  if (!requests.has(k)) {
    const pending = api(state.id).finally(() => { if (requests.get(k) === pending) requests.delete(k); });
    requests.set(k, pending);
  }
  try {
    const data = await requests.get(k);
    if (generation !== epoch || state.account !== identity() || !root.isConnected) return;
    state.data = data; cache.set(k, { at: Date.now(), data });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
  } catch (e) { state.error = messages[e.message] || 'Etkileşimler yüklenemedi.'; }
  finally { state.pending = false; if (generation === epoch && root.isConnected) paint(root, state); }
}
function mount(root, id) {
  if (!root || !/^edutg_[a-f0-9]{64}$/.test(id)) return;
  for (const [old] of roots) if (!old.isConnected) roots.delete(old);
  const state = { id, account: identity(), epoch, data: null, pending: false, error: '' };
  roots.set(root, state); load(root, state);
}
function scan() { document.querySelectorAll('.daily-social[data-note-id]').forEach(root => mount(root, root.dataset.noteId)); }
function reset() { epoch++; drafts.clear(); cache.clear(); requests.clear(); for (const [root] of roots) root.replaceChildren(); roots.clear(); }
window.DailyNoteSocial = { mount, scan, reset };
scan();
