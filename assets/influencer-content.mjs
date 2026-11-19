import { mediaUrl } from './influencer-content-model.mjs';
import { bindSortable } from './content-sortable.mjs';
import { REMINDER_DAYS, progressState } from './topic-progress.mjs';

let root, context, data = { topics: [] }, revision = null, selected = '', editing = false, dirty = false, loading = false, saving = false, uploading = false, epoch = 0, owner = '';
let activeSection = '';
let searchQuery = '';
let progress = null, progressBusy = false, progressError = '';
async function loadProgress() {
  const seq = epoch;
  try { const result = await api(undefined, 'influencer-progress'); if (seq === epoch) { progress = result.data; progressError = ''; } }
  catch { if (seq === epoch) { progress = null; progressError = 'Kişisel takip yüklenemedi.'; } }
}
async function updateProgress(topicId, op, intervalDays) {
  if (progressBusy || !progress) return;
  const seq = epoch; progressBusy = true; draw();
  try {
    const result = await api({ topicId, op, ...(op === 'schedule' ? { intervalDays } : {}) }, 'influencer-progress');
    if (seq !== epoch) return;
    progress = result.data; progressError = '';
  } catch { if (seq === epoch) progressError = 'Takip kaydedilemedi. Tekrar dene.'; }
  finally { if (seq === epoch) { progressBusy = false; draw(); } }
}
function topicRoutine(node, topic) {
  const value = progress?.topics?.[topic.id], state = progressState(value);
  const box = el('div', '', 'ic-routine'); box.dataset.routineId = topic.id;
  const label = el('label', '', 'ic-done-label'), check = el('input'); check.type = 'checkbox';
  check.checked = state.done && !state.due; check.disabled = !progress || progressBusy;
  check.setAttribute('aria-label', 'Yaptım: ' + topic.title);
  check.onchange = () => void updateProgress(topic.id, check.checked ? 'complete' : 'uncheck');
  label.append(check, document.createTextNode('Yaptım')); box.append(label);
  const schedule = el('label', 'Tekrar kontrol'), select = el('select');
  const names = ['Hatırlatma kapalı', 'Her gün', '3 günde bir', 'Her hafta', '2 haftada bir', 'Her ay'];
  REMINDER_DAYS.forEach((days, i) => { const option = el('option', names[i]); option.value = days; select.append(option); });
  select.value = value?.intervalDays || 0; select.disabled = !progress || progressBusy;
  select.setAttribute('aria-label', 'Hatırlatma: ' + topic.title);
  select.onchange = () => void updateProgress(topic.id, 'schedule', Number(select.value));
  schedule.append(select); box.append(schedule);
  const note = el('small', '', 'ic-routine-state'); box.append(note);
  node.append(box);
}
function refreshRoutines() {
  if (!root || !owner || !progress) return;
  let due = 0;
  data.topics.forEach(topic => {
    const state = progressState(progress.topics?.[topic.id]);
    if (state.due) due++;
    const box = root.querySelector('[data-routine-id="' + topic.id + '"]');
    if (!box) return;
    box.classList.toggle('ic-is-due', state.due);
    box.querySelector('input').checked = state.done && !state.due;
    box.querySelector('.ic-routine-state').textContent = state.due ? 'Kontrol zamanı: Bu konuyu uyguluyor musun?'
      : state.nextAt ? 'Sonraki kontrol: ' + new Date(state.nextAt).toLocaleDateString('tr-TR')
      : state.done ? 'Tamamlandı · ' + new Date(progress.topics[topic.id].doneAt).toLocaleDateString('tr-TR') : 'Henüz işaretlenmedi';
  });
  const summary = root.querySelector('.ic-routine-summary');
  if (summary) summary.textContent = due ? due + ' konu tekrar kontrol bekliyor. Uyguladıysan “Yaptım” kutusunu işaretle.' : 'Kişisel takibin güncel. Hatırlatmalar yalnızca site içinde gösterilir; e-posta veya bildirim gönderilmez.';
}
const lower = s => String(s || '').toLocaleLowerCase('tr');
const matchingTopics = () => data.topics.filter(t => lower([t.title, t.description, ...t.sections.map(s => s.title)].join(' ')).includes(lower(searchQuery)));
function sortHandle(node, list, item, kind) {
  node.dataset.sortId = item.id;
  const handle = button(node, '⠿', () => {}, 'ic-drag-handle');
  handle.disabled ||= !!searchQuery;
  handle.setAttribute('aria-label', (kind === 'topic' ? 'Konuyu taşı: ' : 'Alt başlığı taşı: ') + item.title);
  handle.setAttribute('aria-pressed', 'false');
  bindSortable(handle, {
    list, item, node, selector: kind === 'topic' ? '.ic-topic-node' : '.ic-map-branch',
    axis: kind === 'topic' ? 'grid' : 'vertical', announce:message,
    onChange: id => {
      change(); draw();
      root.querySelector('[data-sort-id="' + id + '"] > .ic-drag-handle')?.focus({ preventScroll:true });
      message('Sıralama değiştirildi. Kalıcı olması için kaydet.');
    },
  });
}
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
const uid = () => crypto.randomUUID();
function message(text) { const n = root?.querySelector('[role="status"]'); if (n) n.textContent = text; }
function change() { dirty = true; message('Kaydedilmemiş değişiklikler var.'); }
function button(parent, title, action, cls) {
  const b = el('button', title, cls); b.type = 'button'; b.disabled = saving || uploading;
  b.addEventListener('click', action); parent.append(b); return b;
}
function field(parent, title, value, update, area = false) {
  const label = el('label', title), input = el(area ? 'textarea' : 'input'); input.value = value || '';
  input.disabled = saving || uploading;
  input.addEventListener('input', () => { update(input.value); change(); });
  input.addEventListener('keydown', e => e.stopPropagation());
  label.append(input); parent.append(label); return input;
}
async function api(body, kind = 'influencer-content') {
  const token = await context.getToken();
  if (!token) throw new Error('Oturumunu yenileyip tekrar dene.');
  const r = await fetch('/api/edu-shared?kind=' + kind, {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(r.status === 409
    ? 'Başka bir oturum içeriği güncelledi. Değişikliklerini kopyala, ardından yeniden yükle.'
    : r.status === 403 ? 'Bu içerik için Influencer paket erişimi gerekiyor.'
    : r.status === 413 ? 'İçerik boyutu fazla. Bazı görselleri bağlantı olarak ekle.'
    : 'İçerik yüklenemedi veya kaydedilemedi. Tekrar dene.');
  return j;
}
export function clear() { epoch++; data = { topics: [] }; owner = ''; dirty = false; editing = false; loading = false; saving = false; uploading = false; activeSection = ''; searchQuery = ''; progress = null; progressBusy = false; progressError = ''; if (root) root.replaceChildren(); }
export function mount(node, ctx) {
  root = node; context = ctx;
  if (!ctx.unlocked || !ctx.userId) { clear(); return; }
  const key = ctx.userId + ':' + ctx.admin;
  if (owner !== key) { clear(); owner = key; editing = ctx.admin; void load(); }
}
async function load() {
  if (loading) return;
  loading = true; const seq = ++epoch;
  root.replaceChildren(el('p', 'İçerik kütüphanesi yükleniyor…'));
  try {
    const j = await api();
    if (seq !== epoch) return;
    data = j.data; revision = j.revision || null; dirty = false;
    await loadProgress();
    if (seq !== epoch) return;
    if (!data.topics.some(t => t.id === selected)) selected = data.topics[0]?.id || '';
    draw();
  } catch (e) {
    if (seq !== epoch) return;
    root.replaceChildren(el('p', e.message)); button(root, 'Tekrar dene', () => { loading = false; void load(); });
  } finally { if (seq === epoch) loading = false; }
}
async function save() {
  if (saving || uploading) return;
  saving = true; const seq = epoch; draw(); message('Kaydediliyor…');
  try {
    const published = { topics: data.topics.map(topic => ({ ...topic, published: true })) };
    const j = await api({ data: published, revision });
    if (seq !== epoch) return;
    data = j.data; revision = j.revision; dirty = false; saving = false; draw(); message('Kaydedildi ve yayınlandı.');
  } catch (e) { if (seq === epoch) { saving = false; draw(); message(e.message); } }
}
function remove(list, value) {
  if (!confirm('“' + (value.title || 'Bu öğe') + '” silinsin mi? Kaydettiğinde uygulanır.')) return;
  list.splice(list.indexOf(value), 1);
  if (selected === value.id) { selected = data.topics[0]?.id || ''; activeSection = ''; }
  if (activeSection === value.id) activeSection = '';
  change(); draw();
}
function order(parent, list, item) {
  const i = list.indexOf(item);
  for (const [label, delta] of [['↑', -1], ['↓', 1]]) {
    const b = button(parent, label, () => { [list[i], list[i + delta]] = [list[i + delta], list[i]]; change(); draw(); });
    b.setAttribute('aria-label', delta < 0 ? 'Yukarı taşı' : 'Aşağı taşı'); b.disabled ||= i + delta < 0 || i + delta >= list.length;
  }
  button(parent, 'Sil', () => remove(list, item));
}
function sample() {
  const t = { id: uid(), title: 'Viral Gönderi', description: 'İlgi gören bir fikri analiz et, kendi bakış açınla yeniden üret.', published: false, sections: [
    { id: uid(), title: '1. Neden ilgi gördüğünü bul', blocks: [{ id: uid(), type: 'text', body: 'Güçlü bir giriş mi, güncel bir konu mu, görsel mi? Gönderinin hangi unsurunun dikkat çektiğini not al. Konunun hâlâ güncel olup olmadığını kontrol et.' }] },
    { id: uid(), title: '2. Kendi yorumunu kat', blocks: [{ id: uid(), type: 'text', body: 'Metni birebir kopyalamak yerine fikri kendi kitlene uyarla. Yeni bir örnek, farklı bir bakış açısı veya güncel veri ekle. Kaynak kullanıyorsan belirt; başkasının görselini izin olmadan yeniden yayımlama.' }] },
    { id: uid(), title: '3. Örnekler ve uygulama', blocks: [{ id: uid(), type: 'text', body: 'Buraya kaynak gönderiyi, kendi uyarlamanı ve aralarındaki farkları ekle. Örnek ekran görüntülerini ve anlatım videosunu bu başlığın altında paylaşabilirsin. Benzer bir formatın tutması, yeni gönderinin de viral olacağını garanti etmez.' }] },
  ] };
  data.topics.push(t); selected = t.id; activeSection = ''; searchQuery = ''; editing = true; change(); draw();
}
async function imageFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12000000) throw new Error('En fazla 12 MB JPG, PNG veya WebP seç.');
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const url = canvas.toDataURL('image/webp', .78);
  if (url.length > 500000) throw new Error('Görsel fazla büyük. Daha küçük bir görsel seç.');
  return url;
}
async function addImages(section, files) {
  if (saving || uploading || !context.admin || !editing) return;
  const images = Array.from(files || []);
  if (!images.length) { message('Panoda fotoğraf bulunamadı. Fotoğrafı kopyalayıp bu alanda Ctrl+V yap.'); return; }
  const seq = epoch; uploading = true; draw();
  let added = 0; const errors = [];
  try {
    for (const file of images) {
      if (seq !== epoch) return;
      if (section.blocks.length >= 80) { errors.push('Bir alt başlıkta en fazla 80 içerik olabilir.'); break; }
      message('Fotoğraflar hazırlanıyor… ' + (added + 1) + ' / ' + images.length);
      try {
        const url = await imageFile(file);
        if (seq !== epoch) return;
        const block = { id: uid(), type: 'image', url, caption: '' };
        section.blocks.push(block);
        if (new TextEncoder().encode(JSON.stringify({ data, revision })).length > 2800000) {
          section.blocks.pop(); errors.push('Kütüphane görsel sınırına ulaştı. Diğer görselleri bağlantı olarak ekle.'); break;
        }
        added++; change();
      } catch (e) { errors.push(e.message); }
    }
  } finally {
    if (seq === epoch) {
      uploading = false; draw();
      message((added ? added + ' fotoğraf eklendi. Kaydetmeyi unutma. ' : '') + [...new Set(errors)].join(' '));
      root.querySelector('[data-image-section="' + section.id + '"]')?.focus({ preventScroll: true });
    }
  }
}
function imageZone(parent, section) {
  const zone = el('div', '', 'ic-image-zone'); zone.tabIndex = 0;
  zone.dataset.imageSection = section.id;
  zone.setAttribute('role', 'group'); zone.setAttribute('aria-label', 'Fotoğraf yapıştırma alanı: ' + section.title);
  zone.setAttribute('aria-disabled', String(saving || uploading));
  zone.append(el('strong', 'Fotoğrafları buraya ekle'), el('p', 'Bu alana tıkla → Ctrl+V ile yapıştır. Birden fazla fotoğraf seçebilir veya sürükleyip bırakabilirsin.', 'ic-muted'));
  const input = el('input'); input.type = 'file'; input.multiple = true; input.accept = 'image/jpeg,image/png,image/webp'; input.hidden = true;
  input.disabled = saving || uploading;
  input.onchange = () => void addImages(section, input.files);
  zone.append(input); button(zone, '↑ Görsel yükle', () => input.click());
  zone.addEventListener('click', e => { if (!e.target.closest('button,input')) zone.focus(); });
  zone.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.target === zone && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); input.click(); }
  });
  zone.addEventListener('paste', e => {
    e.preventDefault(); e.stopPropagation();
    const items = Array.from(e.clipboardData?.items || []);
    const files = items.filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
    void addImages(section, files.length ? files : e.clipboardData?.files);
  });
  zone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('ic-dragging'); });
  zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('ic-dragging'); });
  zone.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('ic-dragging'); void addImages(section, e.dataTransfer?.files); });
  parent.append(zone);
}
function media(parent, b) {
  const url = mediaUrl(b.url, b.type); if (!url) return;
  const figure = el('figure');
  if (b.type === 'image') { const img = el('img'); img.src = url; img.alt = b.caption || 'İçerik örneği'; img.loading = 'lazy'; figure.append(img); }
  else {
    const u = new URL(url); let id = '';
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(u.hostname)) id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean)[1] || '';
    if (/^[\w-]{11}$/.test(id)) {
      const frame = el('iframe'); frame.src = 'https://www.youtube-nocookie.com/embed/' + id; frame.title = b.caption || 'Anlatım videosu';
      frame.loading = 'lazy'; frame.allowFullscreen = true; frame.referrerPolicy = 'strict-origin-when-cross-origin'; figure.append(frame);
    } else if (/\.mp4$/i.test(u.pathname)) { const v = el('video'); v.src = url; v.controls = true; v.preload = 'none'; figure.append(v); }
    else { const a = el('a', 'Videoyu aç ↗'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; figure.append(a); }
  }
  if (b.caption) figure.append(el('figcaption', b.caption)); parent.append(figure);
}
function draw() {
  if (!root || !owner) return;
  root.className = 'ic-library' + (editing ? ' ic-edit' : ''); root.replaceChildren();
  root.append(el('h2', context.admin ? 'İçerik Yönetim Paneli' : 'İçerik Kütüphanesi'), el('p', 'Konu kartını seç → alt başlığa gir → içeriği aç.' + (context.admin ? ' Kaydettiğin içerik otomatik yayınlanır.' : ''), 'ic-muted'));
  if (context.admin) {
    const guide = el('div', '', 'ic-guide');
    for (const [title, text] of [
      ['01 · Konuyu seç', 'Haritadaki konu kartından ilerle. Konuların yanındaki çöp kutusuyla sil.'],
      ['02 · Alt başlığı aç', 'Bir alt başlık kartına tıkla. Yalnızca o başlığın metinleri, fotoğrafları, videoları ve gönderileri açılır.'],
      ['03 · Kaydet ve bitir', 'Ayrı yayınlama adımı yok. Kaydettiğinde içerikler onaylı Influencer üyelerine açılır.'],
    ]) { const card = el('div'); card.append(el('strong', title), el('p', text)); guide.append(card); }
    const help = el('details', '', 'ic-help'); help.append(el('summary', 'Nasıl kullanılır?'), guide); root.append(help);
    const count = data.topics.reduce((n, t) => n + t.sections.length, 0);
    root.append(el('p', data.topics.length + ' konu · ' + count + ' alt başlık · ' + data.topics.filter(t => t.published).length + ' yayında', 'ic-muted'));
  }
  const toolbar = el('div', '', 'ic-toolbar'); root.append(toolbar);
  if (context.admin) {
    button(toolbar, editing ? 'Okuyucu önizlemesi' : 'İçerikleri düzenle', () => { editing = !editing; draw(); });
    button(toolbar, '+ Konu ekle', () => { const t = { id: uid(), title: 'Yeni konu', description: '', published: false, sections: [{ id: uid(), title: 'İlk alt başlık', blocks: [] }] }; data.topics.push(t); selected = t.id; activeSection = ''; searchQuery = ''; editing = true; change(); draw(); });
    button(toolbar, 'Viral Gönderi örneğini ekle', sample);
    button(toolbar, dirty ? 'Değişiklikleri kaydet' : 'Kaydet', save, 'ic-primary');
    button(toolbar, 'Yeniden yükle', () => { if (!dirty || confirm('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?')) void load(); });
  }
  const status = el('p', dirty ? 'Kaydedilmemiş değişiklikler var.' : context.admin && data.topics.length ? data.topics.every(t => t.published) ? 'Kaydedilen konular yayında. Değişikliklerden sonra tekrar kaydet.' : 'Kaydettiğinde tüm konular yayınlanır.' : ''); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.append(status);
  root.append(el('p', progressError, 'ic-progress-error'), el('p', '', 'ic-routine-summary'));
  if (!progress) button(root, 'Kişisel takibi yeniden yükle', async () => { const seq = epoch; await loadProgress(); if (seq === epoch) draw(); });
  if (!data.topics.length) { root.append(el('p', context.admin ? 'İlk konunu ekle veya Viral Gönderi örneğiyle başla.' : 'İçerikler hazırlanıyor.', 'ic-empty')); return; }
  const search = el('div', '', 'ic-search');
  const searchLabel = el('label', 'Haritada ara'), searchInput = el('input');
  searchInput.value = searchQuery; searchInput.disabled = saving || uploading;
  searchLabel.append(searchInput); search.append(searchLabel);
  searchInput.addEventListener('keydown', e => e.stopPropagation());
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    const matches = matchingTopics();
    if (!matches.some(t => t.id === selected)) { selected = matches[0]?.id || ''; activeSection = ''; }
    const caret = searchInput.selectionStart; draw();
    const next = root.querySelector('.ic-search input'); next?.focus({ preventScroll:true }); next?.setSelectionRange(caret, caret);
  });
  searchInput.placeholder = 'Konu veya alt başlık bul…';
  root.append(search);
  if (searchQuery) button(search, 'Aramayı temizle', () => { searchQuery = ''; draw(); });
  const visibleTopics = matchingTopics();
  if (!visibleTopics.length) { root.append(el('p', 'Bu aramayla eşleşen konu veya alt başlık bulunamadı.', 'ic-empty')); return; }
  if (!visibleTopics.some(t => t.id === selected)) selected = visibleTopics[0].id;
  if (context.admin && editing) root.append(el('p', searchQuery ? 'Sıralamak için aramayı temizle.' : '⠿ tutamaçlarından sürükleyerek konu ve alt başlık sırasını değiştir. Ok tuşlarıyla da taşıyabilirsin.', 'ic-muted'));
  const layout = el('div', '', 'ic-layout ic-map-layout'), nav = el('nav', '', 'ic-nav ic-topic-map'), article = el('article', '', 'ic-topic ic-map-detail');
  nav.setAttribute('aria-label', 'İçerik konuları'); layout.append(nav, article); root.append(layout);
  visibleTopics.forEach(t => {
    const i = data.topics.indexOf(t);
    const node = el('div', '', 'ic-topic-node'); nav.append(node);
    const b = button(node, String(i + 1).padStart(2, '0') + ' · ' + t.title, () => { selected = t.id; activeSection = ''; draw(); }, 'ic-topic-open');
    b.setAttribute('aria-current', String(t.id === selected));
    node.append(el('small', t.sections.length + ' alt başlık' + (context.admin ? t.published ? ' · Yayında' : ' · Kaydedilmedi' : ''), 'ic-muted'));
    topicRoutine(node, t);
    if (context.admin && editing) {
      sortHandle(node, data.topics, t, 'topic');
      const del = button(node, '🗑', () => remove(data.topics, t), 'ic-topic-delete');
      del.setAttribute('aria-label', 'Konuyu sil: ' + t.title); del.title = 'Konuyu sil';
    }
  });
  const t = visibleTopics.find(t => t.id === selected) || visibleTopics[0];
  if (!t.sections.some(s => s.id === activeSection)) activeSection = '';
  const path = el('div', '', 'ic-toolbar ic-breadcrumb');
  button(path, '⌘ ' + t.title, () => { activeSection = ''; draw(); });
  if (activeSection) path.append(el('span', '→ ' + t.sections.find(s => s.id === activeSection).title));
  article.append(path);
  if (!activeSection) {
    article.append(el('h3', t.title), el('p', t.description));
    if (editing && context.admin) {
      const settings = el('details', '', 'ic-topic-settings'); settings.append(el('summary', 'Konu adını / açıklamasını düzenle'));
      field(settings, 'Konu başlığı', t.title, v => t.title = v);
      field(settings, 'Konu açıklaması', t.description, v => t.description = v, true);
      const tools = el('div', '', 'ic-toolbar'); order(tools, data.topics, t); settings.append(tools); article.append(settings);
    }
    const map = el('div', '', 'ic-branch-map'); map.setAttribute('aria-label', t.title + ' alt başlık haritası');
    map.append(el('div', t.title, 'ic-map-root'));
    const branches = el('div', '', 'ic-map-branches'); map.append(branches);
    t.sections.forEach((s, i) => {
      const branch = el('div', '', 'ic-map-branch');
      if (searchQuery && lower(s.title).includes(lower(searchQuery))) branch.classList.add('ic-search-match');
      const b = button(branch, String(i + 1).padStart(2, '0') + ' · ' + s.title, () => {
        activeSection = s.id; draw();
        root.querySelector('.ic-section')?.scrollIntoView({ block:'nearest', behavior:'instant' });
        root.querySelector('.ic-section')?.focus({ preventScroll:true });
      }, 'ic-section-open');
      const types = [['text', 'metin'], ['image', 'görsel'], ['video', 'video'], ['post', 'gönderi']]
        .map(([type, name]) => { const n = s.blocks.filter(b => b.type === type).length; return n ? n + ' ' + name : ''; }).filter(Boolean);
      b.append(el('small', (types.join(' · ') || 'Henüz içerik yok') + ' · Aç →'));
      if (context.admin && editing) sortHandle(branch, t.sections, s, 'section');
      branches.append(branch);
    });
    if (!t.sections.length) branches.append(el('p', 'Bu konuya ilk alt başlığını ekle.', 'ic-muted'));
    article.append(map);
  } else button(article, '← Alt başlık haritasına dön', () => { activeSection = ''; draw(); });
  for (const s of t.sections) {
    if (s.id !== activeSection) continue;
    const section = el('section', '', 'ic-section'); section.tabIndex = -1; section.setAttribute('aria-label', s.title); article.append(section);
    if (editing && context.admin) { field(section, 'Alt başlık', s.title, v => s.title = v); const tools = el('div', '', 'ic-toolbar'); order(tools, t.sections, s); section.append(tools); }
    else section.append(el('h3', s.title));
    for (const b of s.blocks) {
      const block = el('div', '', 'ic-block'); section.append(block);
      if (editing && context.admin) {
        if (b.type === 'text' || b.type === 'post') {
          field(block, b.type === 'post' ? 'Gönderi metni / örneği' : 'Açıklama', b.body, v => b.body = v, true);
          if (b.type === 'post') field(block, 'Kaynak gönderi bağlantısı (isteğe bağlı)', b.url, v => b.url = v);
        } else {
          if (b.type === 'image' && b.url.startsWith('data:')) block.append(el('p', 'Yüklenen fotoğraf', 'ic-muted'));
          else field(block, b.type === 'image' ? 'Görsel adresi' : 'Video adresi (YouTube / MP4)', b.url, v => b.url = v);
          field(block, 'Görsel / video açıklaması', b.caption, v => b.caption = v); media(block, b);
        }
        const tools = el('div', '', 'ic-toolbar'); order(tools, s.blocks, b); block.append(tools);
      } else if (b.type === 'text' || b.type === 'post') {
        block.append(el('p', b.body));
        if (b.type === 'post' && b.url && mediaUrl(b.url, 'link')) { const link = el('a', 'Kaynak gönderiyi aç ↗'); link.href = mediaUrl(b.url, 'link'); link.target = '_blank'; link.rel = 'noopener noreferrer'; block.append(link); }
      } else media(block, b);
    }
    if (editing && context.admin) {
      const tools = el('div', '', 'ic-toolbar'); section.append(tools);
      button(tools, '+ Açıklama', () => { s.blocks.push({ id: uid(), type: 'text', body: '' }); change(); draw(); });
      button(tools, '+ Gönderi örneği', () => { s.blocks.push({ id: uid(), type: 'post', body: '', url: '', caption: '' }); change(); draw(); });
      for (const [type, title] of [['image', '+ Görsel bağlantısı'], ['video', '+ Video']]) button(tools, title, () => {
        const url = prompt(type === 'image' ? 'HTTPS görsel adresi:' : 'YouTube veya HTTPS MP4 adresi:');
        if (!url) return;
        if (!mediaUrl(url, type)) { message('Geçerli bir medya bağlantısı gir.'); return; }
        s.blocks.push({ id: uid(), type, url, caption: '' }); change(); draw();
      });
      imageZone(section, s);
    }
  }
  if (editing && context.admin) button(article, '+ Alt başlık ekle', () => { const s = { id: uid(), title: 'Yeni alt başlık', blocks: [] }; t.sections.push(s); activeSection = s.id; change(); draw(); });
  refreshRoutines();
}
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshRoutines(); });
window.addEventListener('focus', refreshRoutines);
setInterval(() => { if (!document.hidden) refreshRoutines(); }, 60000);
