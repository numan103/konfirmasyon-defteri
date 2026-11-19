import { mediaUrl } from './influencer-content-model.mjs';

let root, context, data = { topics: [] }, revision = null, selected = '', editing = false, dirty = false, loading = false, saving = false, epoch = 0, owner = '';
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
const uid = () => crypto.randomUUID();
function message(text) { const n = root?.querySelector('[role="status"]'); if (n) n.textContent = text; }
function change() { dirty = true; message('Kaydedilmemiş değişiklikler var.'); }
function button(parent, title, action, cls) {
  const b = el('button', title, cls); b.type = 'button'; b.disabled = saving;
  b.addEventListener('click', action); parent.append(b); return b;
}
function field(parent, title, value, update, area = false) {
  const label = el('label', title), input = el(area ? 'textarea' : 'input'); input.value = value || '';
  input.disabled = saving;
  input.addEventListener('input', () => { update(input.value); change(); });
  input.addEventListener('keydown', e => e.stopPropagation());
  label.append(input); parent.append(label); return input;
}
async function api(body) {
  const token = await context.getToken();
  if (!token) throw new Error('Oturumunu yenileyip tekrar dene.');
  const r = await fetch('/api/edu-shared?kind=influencer-content', {
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
export function clear() { epoch++; data = { topics: [] }; owner = ''; dirty = false; editing = false; loading = false; saving = false; if (root) root.replaceChildren(); }
export function mount(node, ctx) {
  root = node; context = ctx;
  if (!ctx.unlocked || !ctx.userId) { clear(); return; }
  const key = ctx.userId + ':' + ctx.admin;
  if (owner !== key) { clear(); owner = key; void load(); }
}
async function load() {
  if (loading) return;
  loading = true; const seq = ++epoch;
  root.replaceChildren(el('p', 'İçerik kütüphanesi yükleniyor…'));
  try {
    const j = await api();
    if (seq !== epoch) return;
    data = j.data; revision = j.revision || null; dirty = false;
    if (!data.topics.some(t => t.id === selected)) selected = data.topics[0]?.id || '';
    draw();
  } catch (e) {
    if (seq !== epoch) return;
    root.replaceChildren(el('p', e.message)); button(root, 'Tekrar dene', () => { loading = false; void load(); });
  } finally { if (seq === epoch) loading = false; }
}
async function save() {
  saving = true; const seq = epoch; draw(); message('Kaydediliyor…');
  try {
    const j = await api({ data, revision });
    if (seq !== epoch) return;
    data = j.data; revision = j.revision; dirty = false; saving = false; draw(); message('Kaydedildi.');
  } catch (e) { if (seq === epoch) { saving = false; draw(); message(e.message); } }
}
function remove(list, value) { if (!confirm('Bu öğe kaldırılsın mı? Kaydettiğinde uygulanır.')) return; list.splice(list.indexOf(value), 1); change(); draw(); }
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
  data.topics.push(t); selected = t.id; editing = true; change(); draw();
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
  root.append(el('h2', 'İçerik Kütüphanesi'), el('p', 'Fikirden uygulamaya: konu anlatımları, örnekler ve videolar.', 'ic-muted'));
  const toolbar = el('div', '', 'ic-toolbar'); root.append(toolbar);
  if (context.admin) {
    button(toolbar, editing ? 'Okuyucu önizlemesi' : 'İçerikleri düzenle', () => { editing = !editing; draw(); });
    button(toolbar, '+ Konu ekle', () => { const t = { id: uid(), title: 'Yeni konu', description: '', published: false, sections: [] }; data.topics.push(t); selected = t.id; editing = true; change(); draw(); });
    button(toolbar, 'Viral Gönderi taslağı ekle', sample);
    button(toolbar, dirty ? 'Değişiklikleri kaydet' : 'Kaydet', save, 'ic-primary');
    button(toolbar, 'Yeniden yükle', () => { if (!dirty || confirm('Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?')) void load(); });
  }
  const status = el('p', dirty ? 'Kaydedilmemiş değişiklikler var.' : ''); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.append(status);
  if (!data.topics.length) { root.append(el('p', context.admin ? 'İlk konunu ekle veya Viral Gönderi taslağıyla başla.' : 'İçerikler hazırlanıyor.', 'ic-empty')); return; }
  const layout = el('div', '', 'ic-layout'), nav = el('nav', '', 'ic-nav'), article = el('article', '', 'ic-topic');
  nav.setAttribute('aria-label', 'İçerik konuları'); layout.append(nav, article); root.append(layout);
  data.topics.forEach((t, i) => {
    const b = button(nav, String(i + 1).padStart(2, '0') + ' · ' + t.title + (context.admin && !t.published ? ' · Taslak' : ''), () => { selected = t.id; draw(); });
    b.setAttribute('aria-current', String(t.id === selected));
  });
  const t = data.topics.find(t => t.id === selected) || data.topics[0];
  if (editing && context.admin) {
    field(article, 'Konu başlığı', t.title, v => t.title = v);
    field(article, 'Konu açıklaması', t.description, v => t.description = v, true);
    const label = el('label', '', 'ic-check'), check = el('input'); check.type = 'checkbox'; check.checked = t.published; check.disabled = saving;
    check.onchange = () => { t.published = check.checked; change(); }; label.append(check, document.createTextNode('Yayında · onaylı Influencer üyeleri okuyabilir')); article.append(label);
    const tools = el('div', '', 'ic-toolbar'); order(tools, data.topics, t); article.append(tools);
  } else article.append(el('h3', t.title), el('p', t.description));
  for (const s of t.sections) {
    const section = el('section', '', 'ic-section'); article.append(section);
    if (editing && context.admin) { field(section, 'Alt başlık', s.title, v => s.title = v); const tools = el('div', '', 'ic-toolbar'); order(tools, t.sections, s); section.append(tools); }
    else section.append(el('h3', s.title));
    for (const b of s.blocks) {
      const block = el('div', '', 'ic-block'); section.append(block);
      if (editing && context.admin) {
        if (b.type === 'text') field(block, 'Açıklama', b.body, v => b.body = v, true);
        else { field(block, b.type === 'image' ? 'Görsel adresi' : 'Video adresi (YouTube / MP4)', b.url, v => b.url = v); field(block, 'Görsel / video açıklaması', b.caption, v => b.caption = v); media(block, b); }
        const tools = el('div', '', 'ic-toolbar'); order(tools, s.blocks, b); block.append(tools);
      } else if (b.type === 'text') block.append(el('p', b.body)); else media(block, b);
    }
    if (editing && context.admin) {
      const tools = el('div', '', 'ic-toolbar'); section.append(tools);
      button(tools, '+ Açıklama', () => { s.blocks.push({ id: uid(), type: 'text', body: '' }); change(); draw(); });
      for (const [type, title] of [['image', '+ Görsel bağlantısı'], ['video', '+ Video']]) button(tools, title, () => {
        const url = prompt(type === 'image' ? 'HTTPS görsel adresi:' : 'YouTube veya HTTPS MP4 adresi:');
        if (!url) return;
        if (!mediaUrl(url, type)) { message('Geçerli bir medya bağlantısı gir.'); return; }
        s.blocks.push({ id: uid(), type, url, caption: '' }); change(); draw();
      });
      const input = el('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.hidden = true;
      input.onchange = async () => {
        const seq = epoch;
        try { const url = await imageFile(input.files[0]); if (seq !== epoch) return; s.blocks.push({ id: uid(), type: 'image', url, caption: '' }); change(); draw(); }
        catch (e) { message(e.message); }
      };
      tools.append(input); button(tools, '↑ Görsel yükle', () => input.click());
    }
  }
  if (editing && context.admin) button(article, '+ Alt başlık ekle', () => { t.sections.push({ id: uid(), title: 'Yeni alt başlık', blocks: [] }); change(); draw(); });
}
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
