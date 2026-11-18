(function () {
  'use strict';
  const words = {
    heading: ['Öğrenci yorumları ve sorular', 'Student reviews and questions'],
    reviews: ['Yorumlar', 'Reviews'], questions: ['Sorular', 'Questions'],
    privacy: ['Paylaşımlar eğitimi açabilen öğrencilere görünür. Anonim adını gizler; kayıt yine hesabına bağlıdır.', 'Posts are visible to students with course access. Anonymous hides your name, but the record remains linked to your account.'],
    mode: ['Görünen ad', 'Display name'], anonymous: ['Anonim', 'Anonymous'], named: ['Kendi yazdığım ad', 'Name I enter'],
    name: ['Adın / takma adın', 'Name / nickname'], rating: ['Eğitim puanın', 'Your course rating'],
    choose: ['Puan seç', 'Choose a rating'], reviewText: ['Eğitim hakkındaki yorumun', 'Your review of the course'],
    questionText: ['Eğitimle ilgili sorun', 'Your question about the course'], lesson: ['İlgili ders', 'Related lesson'],
    course: ['Konunun geneli', 'Whole topic'], save: ['Yorumumu kaydet / güncelle', 'Save / update my review'],
    ask: ['Soruyu paylaş', 'Post question'], minimum: ['5–3000 karakter. Kişisel veya hesap bilgilerini paylaşma.', '5–3000 characters. Do not share personal or account information.'],
    more: ['Daha fazla göster', 'Load more'], loading: ['Yükleniyor…', 'Loading…'], empty: ['Henüz paylaşım yok. İlk paylaşımı sen yapabilirsin.', 'No posts yet. You can be the first.'],
    retry: ['Yeniden dene', 'Retry'], saved: ['Paylaşım kaydedildi.', 'Post saved.'],
    remove: ['Sil', 'Delete'], confirm: ['Bu paylaşım silinsin mi? Sorunun yanıtları da silinir.', 'Delete this post? Answers to a question will also be deleted.'],
    reply: ['Yanıtla', 'Reply'], answer: ['Eğitmen yanıtı', 'Instructor answer'], sendAnswer: ['Yanıtı paylaş', 'Post answer'],
    instructor: ['Eğitmen', 'Instructor'], cancelled: ['Vazgeç', 'Cancel'],
    promptStart: ['İlk izlenimin nasıl? Eğitimi değerlendirmek ister misin?', 'What is your first impression? Would you like to review the course?'],
    promptMiddle: ['İlerleme kaydettin. Eğitim hakkında ne düşünüyorsun?', 'You have made progress. What do you think of the course?'],
    promptEnd: ['Bu konuyu tamamladın. Deneyimini diğer öğrencilerle paylaşır mısın?', 'You completed this topic. Would you share your experience with other students?'],
    write: ['Yorum yaz / güncelle', 'Write / update review'], later: ['Şimdi değil', 'Not now'],
    start: ['İlk izlenim', 'First impression'], middle: ['Eğitimin ortasında', 'During the course'], end: ['Konu tamamlandı', 'Topic completed'], manual: ['Öğrenci yorumu', 'Student review'],
    login_required: ['Paylaşım için giriş yap.', 'Sign in to participate.'],
    premium_required: ['Bu alan premium öğrencilere açık.', 'This area is for premium students.'],
    setup_required: ['Yorum ve soru alanının veritabanı kurulumu henüz tamamlanmadı.', 'The feedback database has not been set up yet.'],
    service_unavailable: ['Şu an yüklenemedi. Tekrar dene; paylaşımın başarıyla kaydedildiği varsayılmadı.', 'Could not load right now. Try again; the post was not assumed to be saved.'],
    invalid_content: ['Adı ve 5–3000 karakterlik metni kontrol et.', 'Check the name and a message of 5–3000 characters.'],
    invalid_rating: ['1–5 arasında puan seç.', 'Choose a rating from 1 to 5.'],
    too_many_requests: ['Çok hızlı veya çok fazla paylaşım yaptın. Biraz sonra dene.', 'Too many requests. Please try again later.'],
    conflict: ['Kaydın başka bir sekmede değişmiş olabilir. Yenile ve tekrar dene.', 'The record may have changed in another tab. Refresh and try again.'],
    course_not_found: ['Bu eğitim artık bulunamıyor.', 'This course is no longer available.'],
    not_allowed: ['Bu işlem için yetkin yok.', 'You do not have permission for this action.']
  };
  const tr = key => (words[key] || words.service_unavailable)[window.LANG === 'en' ? 1 : 0];
  let ctx = null, epoch = 0, loadSerial = 0, ready = false, view = 'reviews', offset = 0, posts = [], answers = [], own = null, dirty = false;
  let pending = false, stage = 'manual', promptStage = null, sessionSeen = {};
  const host = () => document.getElementById('edu-feedback');
  const node = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  function keyed(tag, key, cls) { const el = node(tag, tr(key), cls); el.dataset.ef = key; return el; }
  function button(key, action) { const b = keyed('button', key, 'btn'); b.type = 'button'; b.onclick = action; return b; }
  function status(key) { const el = host()?.querySelector('.ef-status'); if (el) el.textContent = key ? tr(key) : ''; }
  function contextKey(c) { return JSON.stringify([c.account, c.channel, c.section, c.topic]); }
  function promptKey() { return 'alfa-edu-feedback-prompts-v1:' + contextKey(ctx); }
  function seen() {
    try { const value = JSON.parse(localStorage.getItem(promptKey()) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch { return sessionSeen[promptKey()] || {}; }
  }
  function markSeen(value) {
    const data = seen();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    data[value] = true; sessionSeen[promptKey()] = data;
    try { localStorage.setItem(promptKey(), JSON.stringify(data)); } catch { /* session fallback */ }
  }
  async function api(values, method = 'GET') {
    const scope = { channel: ctx.channel, section: ctx.section, topic: ctx.topic };
    const data = { ...scope, ...values };
    const url = '/api/edu-shared?kind=feedback' + (method === 'GET' ? '&' + new URLSearchParams(data) : '');
    const r = await window.siteFetch(url, method === 'POST' ? {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    } : { cache: 'no-store' });
    const out = await r.json();
    if (!r.ok || !out.ok) throw new Error(out.error || 'service_unavailable');
    return out;
  }
  function identity(form) {
    const anonymous = form.elements.mode.value === 'anonymous';
    return { anonymous, name: anonymous ? '' : form.elements.displayName.value.trim() };
  }
  function nameFields(form) {
    const row = node('div', null, 'ef-name-row');
    const left = node('div'), right = node('div');
    const select = document.createElement('select'); select.name = 'mode';
    for (const key of ['anonymous', 'named']) { const option = keyed('option', key); option.value = key; select.append(option); }
    const input = document.createElement('input'); input.name = 'displayName'; input.maxLength = 60; input.autocomplete = 'nickname'; input.hidden = true; input.disabled = true;
    const selectLabel = keyed('label', 'mode'); selectLabel.append(select);
    const nameLabel = keyed('label', 'name'); nameLabel.hidden = true; nameLabel.append(input);
    select.onchange = () => { const named = select.value === 'named'; nameLabel.hidden = input.hidden = !named; input.disabled = !named; input.required = named; dirty = true; };
    left.append(selectLabel); right.append(nameLabel); row.append(left, right); form.append(row);
  }
  function form(kind) {
    const form = document.createElement('form'); form.className = 'ef-form'; form.dataset.kind = kind;
    nameFields(form);
    if (kind === 'review') {
      const label = keyed('label', 'rating'), rating = document.createElement('select');
      rating.name = 'rating'; rating.required = true;
      const empty = keyed('option', 'choose'); empty.value = ''; rating.append(empty);
      for (let i = 1; i <= 5; i++) { const option = node('option', i + ' — ' + '★'.repeat(i)); option.value = String(i); rating.append(option); }
      label.append(rating); form.append(label);
    } else {
      const label = keyed('label', 'lesson'), select = document.createElement('select');
      select.name = 'lesson'; const all = keyed('option', 'course'); all.value = ''; select.append(all);
      ctx.lessons.forEach(lesson => { const o = node('option', lesson.title); o.value = lesson.id; select.append(o); });
      select.value = ctx.lesson || ''; label.append(select); form.append(label);
    }
    const label = keyed('label', kind === 'review' ? 'reviewText' : 'questionText');
    const textarea = document.createElement('textarea'); textarea.name = 'text'; textarea.required = true; textarea.minLength = 5; textarea.maxLength = 3000;
    label.append(textarea); form.append(label, keyed('p', 'minimum', 'ef-muted'));
    const submit = keyed('button', kind === 'review' ? 'save' : 'ask', 'btn solid'); submit.type = 'submit'; form.append(submit);
    form.addEventListener('input', () => { dirty = true; });
    form.onsubmit = async event => {
      event.preventDefault(); if (pending) return;
      const serial = epoch, values = { ...identity(form), op: kind, text: textarea.value.trim() };
      if (kind === 'review') { values.rating = Number(form.elements.rating.value); values.stage = stage; }
      else values.lesson = form.elements.lesson.value;
      pending = true; submit.disabled = true;
      try {
        await api(values, 'POST'); if (serial !== epoch) return;
        status('saved'); dirty = false;
        if (kind === 'review') { markSeen(stage); host().querySelector('.ef-prompt').hidden = true; }
        else textarea.value = '';
        await load(false);
      } catch (e) { if (serial === epoch) status(e.message); }
      finally { if (serial === epoch) { pending = false; submit.disabled = false; } }
    };
    return form;
  }
  function showTab(next) {
    view = next; offset = 0; posts = []; answers = [];
    host().querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === view)));
    host().querySelector('[data-kind="review"]').hidden = view !== 'reviews';
    host().querySelector('[data-kind="question"]').hidden = view !== 'questions';
    load(false);
  }
  function showPrompt() {
    const box = host()?.querySelector('.ef-prompt');
    if (!box || !ready || ctx.admin || !ctx.account || !ctx.total) return;
    const value = ctx.total && ctx.done >= ctx.total ? 'end' : ctx.total && ctx.done / ctx.total >= 0.5 ? 'middle' : 'start';
    const order = { start: 0, middle: 1, end: 2, manual: 3 };
    const already = seen();
    if (already?.[value] || (own && order[own.stage] >= order[value])) { box.hidden = true; return; }
    promptStage = value;
    box.replaceChildren(keyed('p', { start: 'promptStart', middle: 'promptMiddle', end: 'promptEnd' }[value]));
    const actions = node('div', null, 'ef-actions');
    actions.append(button('write', () => {
      stage = promptStage; markSeen(stage); box.hidden = true; showTab('reviews');
      host().querySelector('[data-kind="review"] textarea').focus();
    }), button('later', () => { markSeen(value); box.hidden = true; }));
    box.append(actions); box.hidden = false;
  }
  function fillOwn() {
    if (!own || dirty) return;
    const f = host().querySelector('[data-kind="review"]');
    f.elements.rating.value = String(own.rating);
    f.elements.text.value = own.body;
    f.elements.mode.value = own.anonymous ? 'anonymous' : 'named';
    const input = f.elements.displayName;
    input.value = own.anonymous ? '' : own.name;
    input.hidden = input.disabled = own.anonymous; input.required = !own.anonymous; input.parentElement.hidden = own.anonymous;
  }
  function drawPost(row, answer = false) {
    const article = node('article', null, answer ? 'ef-post ef-answer' : 'ef-post'), head = node('div', null, 'ef-post-head');
    head.append(node('b', row.anonymous ? tr('anonymous') : row.name));
    if (row.instructor) head.append(keyed('span', 'instructor', 'ef-badge'));
    if (row.rating) { const stars = node('span', '★'.repeat(row.rating) + '☆'.repeat(5 - row.rating), 'ef-stars'); stars.setAttribute('aria-label', row.rating + '/5'); head.append(stars); }
    if (row.kind === 'review') head.append(keyed('span', row.stage, 'ef-stage'));
    const date = new Date(row.created_at);
    if (Number.isFinite(date.getTime())) head.append(node('time', date.toLocaleDateString(window.LANG === 'en' ? 'en-GB' : 'tr-TR')));
    if (row.lesson_id) {
      const lesson = ctx.lessons.find(l => l.id === row.lesson_id);
      if (lesson) head.append(node('span', lesson.title, 'ef-muted'));
    }
    article.append(head, node('p', row.body, 'ef-body'));
    const actions = node('div', null, 'ef-actions');
    if (row.mine || ctx.admin) actions.append(button('remove', async () => {
      if (pending || !confirm(tr('confirm'))) return;
      const serial = epoch; pending = true;
      try { await api({ op: 'remove', id: row.id }, 'POST'); if (serial === epoch) { if (own?.id === row.id) own = null; await load(false); } }
      catch (e) { if (serial === epoch) status(e.message); }
      finally { if (serial === epoch) pending = false; }
    }));
    if (row.kind === 'question' && ctx.admin) {
      const f = document.createElement('form'); f.className = 'ef-form ef-reply-form'; f.hidden = true;
      const label = keyed('label', 'answer'), area = document.createElement('textarea'); area.required = true; area.minLength = 5; area.maxLength = 3000; label.append(area);
      const submit = keyed('button', 'sendAnswer', 'btn solid'); submit.type = 'submit'; f.append(label, submit);
      const open = button('reply', () => { f.hidden = !f.hidden; open.setAttribute('aria-expanded', String(!f.hidden)); if (!f.hidden) area.focus(); });
      open.setAttribute('aria-expanded', 'false'); actions.append(open);
      f.onsubmit = async e => {
        e.preventDefault(); if (pending) return;
        const serial = epoch; pending = true; submit.disabled = true;
        try { await api({ op: 'answer', parent: row.id, text: area.value.trim(), anonymous: false, name: tr('instructor') }, 'POST'); if (serial === epoch) await load(false); }
        catch (error) { if (serial === epoch) status(error.message); }
        finally { if (serial === epoch) { pending = false; submit.disabled = false; } }
      };
      article.append(f);
    }
    article.append(actions);
    if (row.kind === 'question') answers.filter(a => a.parent_id === row.id).forEach(a => article.append(drawPost(a, true)));
    return article;
  }
  async function load(append) {
    const serial = epoch, ticket = ++loadSerial;
    status('loading');
    try {
      const data = await api({ view, offset: append ? posts.length : 0 });
      if (serial !== epoch || ticket !== loadSerial) return;
      ready = true;
      posts = append ? [...posts, ...data.posts.filter(p => !posts.some(old => old.id === p.id))] : data.posts;
      answers = append ? [...answers, ...data.answers.filter(a => !answers.some(old => old.id === a.id))] : data.answers;
      own = data.myReview; fillOwn();
      const list = host().querySelector('.ef-list'); list.replaceChildren();
      if (!posts.length) list.append(keyed('p', 'empty', 'ef-muted'));
      posts.forEach(row => list.append(drawPost(row)));
      host().querySelector('.ef-more').hidden = !data.hasMore;
      status(''); showPrompt();
    } catch (e) { if (serial === epoch && ticket === loadSerial) { ready = false; status(e.message); host().querySelector('.ef-prompt').hidden = true; } }
  }
  function clear() {
    epoch++; ready = false; ctx = null; posts = []; answers = []; own = null; dirty = false; pending = false;
    const el = host(); if (el) { el.replaceChildren(); el.classList.add('hidden'); }
  }
  function mount(next) {
    const el = host(); if (!el || !next?.topic) return clear();
    if (ctx && contextKey(ctx) === contextKey(next)) {
      const changedLesson = ctx.lesson !== next.lesson; ctx = next;
      const f = el.querySelector('[data-kind="question"]');
      if (f) {
        const select = f.elements.lesson, selected = select.value;
        select.replaceChildren();
        const all = keyed('option', 'course'); all.value = ''; select.append(all);
        ctx.lessons.forEach(lesson => { const o = node('option', lesson.title); o.value = lesson.id; select.append(o); });
        select.value = selected;
      }
      if (changedLesson && f && !f.elements.text.value.trim()) f.elements.lesson.value = ctx.lesson || '';
      showPrompt(); return;
    }
    clear(); ctx = next; view = 'reviews'; stage = 'manual'; el.classList.remove('hidden');
    el.append(keyed('h3', 'heading', 'ef-heading'), node('p', ctx.title, 'ef-muted'), keyed('p', 'privacy', 'ef-muted'));
    const prompt = node('div', null, 'ef-prompt'); prompt.hidden = true; el.append(prompt);
    const tabs = node('div', null, 'ef-tabs'); tabs.setAttribute('role', 'tablist');
    for (const key of ['reviews', 'questions']) {
      const b = button(key, () => showTab(key)); b.dataset.tab = key; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(key === view)); tabs.append(b);
    }
    el.append(tabs, form('review'), form('question'));
    el.querySelector('[data-kind="question"]').hidden = true;
    const message = node('p', '', 'ef-status'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite'); el.append(message);
    el.append(button('retry', () => load(false)), node('div', null, 'ef-list'));
    const more = button('more', () => load(true)); more.classList.add('ef-more'); more.hidden = true; el.append(more);
    load(false);
  }
  // Change only translation text nodes, preserving partially written drafts.
  new MutationObserver(() => {
    const el = host(); if (!el || !ctx) return;
    el.querySelectorAll('[data-ef]').forEach(n => {
      const text = [...n.childNodes].find(child => child.nodeType === Node.TEXT_NODE);
      if (text) text.textContent = tr(n.dataset.ef); else n.prepend(document.createTextNode(tr(n.dataset.ef)));
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  window.EduFeedback = { mount, clear };
  if (typeof window.refreshEduFeedback === 'function') window.refreshEduFeedback();
})();
