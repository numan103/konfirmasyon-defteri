import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('weekly previews open on-page, support zoom, reset, text-only posts and restore focus', async () => {
  let document;
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.handlers = {}; this.style = {}; this.attrs = {}; this.classList = { add() {} }; }
    set textContent(text) { this.text = String(text); this.children = []; }
    get textContent() { return (this.text || '') + this.children.map(n => n.textContent).join(''); }
    append(...nodes) { nodes.forEach(n => { n.parent = this; this.children.push(n); }); }
    replaceChildren(...nodes) { this.text = ''; this.children = []; this.append(...nodes); }
    setAttribute(key, value) { this.attrs[key] = value; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); }
    dispatch(name, event = {}) { (this.handlers[name] || []).forEach(fn => fn({ target: this, ...event })); }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatch('close'); }
    scrollTo(x, y) { this.scroll = [x, y]; }
    focus() { document.activeElement = this; }
    remove() { this.parent.children = this.parent.children.filter(n => n !== this); }
  }
  const hosts = Object.fromEntries(['lp-live-portfolio', 'lp-live-trades', 'lp-live-bias'].map(id => [id, new Node('article')]));
  document = { body: new Node('body'), getElementById: id => hosts[id], createElement: tag => new Node(tag) };
  const posts = [
    { id: 'a', title: 'İlk bias', date: '2026-11-01', excerpt: 'Gerçek açıklama', image: '/api/edu-shared?kind=landing&image=a' },
    { id: 'b', title: 'İkinci bias', date: '2026-10-31', excerpt: 'İkinci açıklama', image: '/api/edu-shared?kind=landing&image=b' },
    { id: 'c', title: 'Metin paylaşımı', date: '2026-10-30', excerpt: 'Grafiksiz analiz', image: '' },
  ];
  const source = fs.readFileSync(new URL('../assets/landing-live.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, {
    document, Intl, Date, AbortSignal,
    fetch: async () => ({ ok: true, json: async () => ({ portfolio: null, status: { portfolio: 'empty', channel: 'ok' }, channel: { trades: { count: 0, latest: [] }, biases: { count: 3, latest: posts } } }) }),
  });
  await new Promise(resolve => setImmediate(resolve));
  const find = (node, predicate) => predicate(node) ? node : node.children.map(n => find(n, predicate)).find(Boolean);
  const all = (node, predicate) => [...(predicate(node) ? [node] : []), ...node.children.flatMap(n => all(n, predicate))];
  assert.match(hosts['lp-live-trades'].textContent, /Son 7 günde işlem paylaşımı yok/);
  const imageButton = find(hosts['lp-live-bias'], n => n.className === 'lp-post-image-link');
  imageButton.dispatch('click');
  const dialog = document.body.children[0];
  assert.equal(dialog.open, true);
  const image = find(dialog, n => n.tagName === 'IMG');
  assert.equal(image.src, posts[0].image);
  const plus = find(dialog, n => n.tagName === 'BUTTON' && n.textContent === '+');
  for (let i = 0; i < 8; i++) plus.dispatch('click');
  assert.equal(image.style.width, '400%');
  assert.equal(plus.disabled, true);
  const reset = find(dialog, n => n.attrs['aria-label']?.startsWith('Görseli sığdır'));
  reset.dispatch('click');
  assert.equal(image.style.width, '100%');
  image.dispatch('click');
  assert.equal(image.style.width, '200%');
  dialog.dispatch('keydown', { key: '-', preventDefault() {} });
  assert.equal(image.style.width, '150%');
  dialog.close();
  assert.equal(document.activeElement, imageButton);
  const weekly = all(hosts['lp-live-bias'], n => n.className === 'lp-week-post');
  assert.equal(weekly.length, 2);
  weekly[0].dispatch('click');
  assert.equal(image.src, posts[1].image);
  assert.equal(image.style.width, '100%');
  weekly[1].dispatch('click');
  assert.equal(find(dialog, n => n.className === 'lp-preview-dialog-viewport').hidden, true);
  assert.match(dialog.textContent, /Bu paylaşımda grafik bulunmuyor/);
});
