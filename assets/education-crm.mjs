import { EDU_PLANS } from './edu-plans-model.mjs?v=2';
import { EDU_STAGES, EDU_ROUTES, planName, allowance, groupState, filterEducationRecords, educationTotals, educationCSV } from './education-crm-model.mjs?v=1';
const API = '/api/analytics?education=1';
const root = document.createElement('section'); root.className = 'education-crm'; root.id = 'education-crm'; root.hidden = true;
let records = null, exchange = null, interest = null, loading = false, error = '', truncated = false, editor = null, lastOwner = '', lastFetched = 0;
let filters = { query: '', stage: '', plan: '', route: '', group: '' };
let pageIndex = 0;
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
const money = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD' }).format(value);
function admin() {
  try { return !!(typeof AUTH !== 'undefined' && AUTH.user?.id && typeof SITE !== 'undefined' && SITE.admin === true && window.siteIsAdmin?.()); } catch { return false; }
}
function active() { return admin() && !document.body.classList.contains('landed') && ['analitik', 'erisim'].includes(document.body.dataset.page); }
function button(text, handler) { const node = el('button', text, 'btn'); node.type = 'button'; node.onclick = handler; return node; }
const errors = {
  conflict: 'Kayıt başka yerde değişti veya zaten mevcut. Listeyi yenileyip kaydı aç.',
  verification_required: 'Alımı onaylamak için açık onay kutusu ve doğrulama referansı gerekir.',
  first_purchase_required: 'Breakout alımı için ilk kayıt/ilk alım uygunluğunu ayrıca doğrula.',
  invalid_contact: 'Geçerli e-posta veya @Telegram kullanıcı adı gir.',
  invalid_lesson_count: 'Kullanılan ders sayısı paket hakkını aşamaz.',
  invalid_group_period: 'Grup başlangıç ve bitiş tarihlerini birlikte, doğru sırada gir.',
  invalid_amount: 'Tutar negatif olamaz; en fazla iki ondalık kullan.',
  identity_locked: 'Paket, iletişim ve alım yolu bu kayıtta sabittir. Farklı seçenek için ayrı kayıt aç.',
  invalid_package: '100K seçeneği yalnızca Personal Coaching için kullanılabilir.',
  invalid_date: 'Geçerli grup tarihleri gir.',
};
async function api(body) {
  if (!admin() || typeof window.siteFetch !== 'function') throw new Error('admin_required');
  const response = await window.siteFetch(API + (body ? '' : '&page=' + pageIndex), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'request_failed');
  if (!body && !Array.isArray(data.records)) throw new Error('invalid_response');
  return data;
}
function kpi(label, value, note) {
  const card = el('div', undefined, 'education-crm-kpi');
  card.append(el('span', label), el('strong', String(value)), el('small', note)); return card;
}
function select(options, value, changed) {
  const node = el('select'); node.setAttribute('aria-label', options[0][1]);
  for (const [id, title] of options) { const item = el('option', title); item.value = id; node.appendChild(item); }
  node.value = value; node.onchange = () => changed(node.value); return node;
}
function render() {
  if (!active()) { root.hidden = true; return; }
  root.hidden = false; root.replaceChildren();
  const head = el('div', undefined, 'education-crm-head');
  head.append(el('h2', '🎓 Eğitim · Talepler & Alımlar'),
    button('Yenile', () => load(true)), button('Manuel kayıt ekle', () => edit(null)));
  const prev = button('← Önceki kayıtlar', () => { pageIndex--; load(true); }); prev.disabled = pageIndex === 0 || loading;
  const next = button('Sonraki kayıtlar →', () => { pageIndex++; load(true); }); next.disabled = !truncated || loading;
  head.append(prev, next);
  root.append(head, el('p', 'Sayfa ziyareti ve buton tıklaması ilgi sinyalidir; başvuru veya satın alım değildir. Alımı yalnızca sen doğrulayabilirsin. Bu ekran mevcut eğitim/Telegram erişimlerini otomatik değiştirmez.'));
  if (interest) root.appendChild(el('div', 'Son ' + interest.days + ' gün ziyaret oturumları: ' + interest.viewers + ' paket sayfası ziyaretçisi · ' + interest.interestedVisitors + ' başvuru/iletişim butonuna tıklayan ziyaretçi. ' +
    EDU_PLANS.map(p => p.name.tr + ': ' + (interest.plans?.[p.id] || 0)).join(' · ') +
    (interest.truncated ? ' · Ziyaret verisi sınıra ulaştı; sayılar kısmi.' : '') + ' · Anonim ziyaretçiler kimliklendirilmez.', 'education-crm-summary'));
  else root.appendChild(el('p', 'İlgi/tıklama özeti için Analitik bölümündeki ziyaret raporunu yenile. Bu özet, eğitim kayıtlarından ayrı bir zaman aralığına sahiptir.'));
  if (exchange?.ok) root.appendChild(el('div', 'Borsa kayıtları: ' + exchange.verified + ' onaylı · ' + exchange.pending + ' bekleyen · ' + exchange.total + ' toplam site/Telegram kaydı. Bunlar tekil kişi veya eğitim alımı sayısı değildir.', 'education-crm-summary'));
  else root.appendChild(el('p', exchange?.error || 'Borsa özeti henüz alınmadı.'));
  if (loading) root.appendChild(el('p', 'Kayıtlar yükleniyor…'));
  if (error) { root.appendChild(el('p', 'Eğitim CRM alınamadı. ' + error + ' Bu durum “kayıt yok” anlamına gelmez.', 'education-crm-error')); return; }
  if (!records) return;
  if (truncated || pageIndex > 0) root.appendChild(el('p', 'Kayıt sayfası ' + (pageIndex + 1) + ' · En çok 300 kayıt. Arama, toplamlar ve CSV bu sayfayı kapsar; diğer kayıtlar için sayfa düğmelerini kullan.', 'education-crm-summary'));
  const totals = educationTotals(records), cards = el('div', undefined, 'education-crm-kpis');
  cards.append(kpi('Eğitim fırsatı', totals.records, totals.people + ' farklı iletişim bilgisi'),
    kpi('İlgileniyor', totals.interested, 'manuel takip'),
    kpi('Başvuru', totals.applied, 'form veya manuel kayıt'),
    kpi('Alımı onaylandı', totals.verified, 'yönetici doğrulaması'),
    kpi('Girilen tahsilat', money(totals.cash), totals.cashEntries + ' onaylı kayıtta girilmiş'),
    kpi('Girilen komisyon', money(totals.commission), totals.commissionEntries + ' onaylı kayıtta girilmiş'),
    kpi('Kalan özel ders', totals.privateRemaining, 'onaylı paket hakları'),
    kpi('Grup süresi dolan', totals.groupExpired, 'girilen tarihlere göre'));
  root.appendChild(cards);
  root.appendChild(el('p', 'Toplamlar bu sayfadaki CRM kayıtlarının tüm tarihlerini kapsar. Tutar boşsa bilinmiyor kabul edilir; paket fiyatı, Breakout hesap büyüklüğü veya tahmini komisyon gelir yazılmaz. Bu ekran muhasebe defteri değildir.'));
  root.appendChild(el('div', EDU_PLANS.map(p => p.name.tr + ': ' + totals.byPlan[p.id].all + ' kayıt / ' + totals.byPlan[p.id].verified + ' onaylı').join(' · '), 'education-crm-summary'));
  const controls = el('div', undefined, 'education-crm-toolbar'), search = el('input'); search.type = 'search'; search.placeholder = 'Ad, iletişim, not veya doğrulama referansı ara'; search.value = filters.query; search.setAttribute('aria-label', 'Eğitim kayıtlarında ara');
  const list = el('div', undefined, 'education-crm-table');
  const count = el('p');
  function table() {
    const visible = filterEducationRecords(records, filters);
    count.textContent = visible.length + ' / ' + records.length + ' kayıt · Aynı kişi farklı paket/alım yolları için ayrı kayda sahip olabilir.';
    list.replaceChildren();
    if (!visible.length) { list.appendChild(el('p', 'Bu filtrelerde kayıt yok.')); return; }
    const table = el('table'), thead = el('thead'), header = el('tr');
    ['Kişi / iletişim', 'Paket / alım yolu', 'Durum', 'Tutarlar', 'Ders / grup takibi', 'Borsa eşleşmesi', 'İşlem'].forEach(label => header.appendChild(el('th', label)));
    thead.appendChild(header); table.appendChild(thead); const tbody = el('tbody');
    for (const record of visible) {
      const row = el('tr'); row.dataset.educationRecord = record.id;
      const who = el('td'); who.append(el('strong', record.name || 'İsimsiz'), el('span', record.contact), el('small', record.source === 'application_form' ? 'Açık talep formu' : 'Manuel kayıt'), el('small', new Date(record.createdAt).toLocaleDateString('tr-TR')));
      if (record.publicReference) who.appendChild(el('small', record.publicReference));
      const packageCell = el('td'); packageCell.append(el('strong', planName(record.plan)), el('span', EDU_ROUTES[record.route]));
      const stage = el('td'); stage.append(el('strong', EDU_STAGES[record.stage]), el('small', record.verification || 'Doğrulama referansı yok'));
      const amounts = el('td'); amounts.append(el('span', 'Tahsilat: ' + money(record.cashReceivedUsd)), el('span', 'Komisyon: ' + money(record.commissionReceivedUsd)));
      const lessons = el('td'), allowed = allowance(record);
      const groupLabels = { unverified: 'Alım onaylı değil', undated: 'Grup tarihi girilmedi', scheduled: 'Grup dönemi başlamadı', active: 'Tarihe göre ilk grup dönemi aktif', expired: 'Grup dönemi doldu' };
      lessons.append(el('span', 'Özel: ' + record.privateUsed + ' / ' + allowed.private + ' kullanıldı'), el('span', 'Ortak: ' + record.groupUsed + ' / ' + allowed.group + ' kullanıldı'), el('small', groupLabels[groupState(record)]), el('small', record.groupStart ? record.groupStart + ' → ' + record.groupEnd : ''));
      const linked = exchange?.rows?.find(member => member.user_id === record.memberId);
      const exchangeCell = el('td', linked ? (linked.exchange || '').toUpperCase() + ' · ' + linked.status : 'Doğrulanmış üye ID eşleşmesi yok');
      const action = el('td'); action.appendChild(button('İncele / düzenle', () => edit(record)));
      row.append(who, packageCell, stage, amounts, lessons, exchangeCell, action); tbody.appendChild(row);
    }
    table.appendChild(tbody); list.appendChild(table);
  }
  search.oninput = () => { filters.query = search.value; table(); };
  controls.append(search,
    select([['', 'Tüm durumlar'], ...Object.entries(EDU_STAGES)], filters.stage, value => { filters.stage = value; table(); }),
    select([['', 'Tüm paketler'], ...EDU_PLANS.map(p => [p.id, p.name.tr])], filters.plan, value => { filters.plan = value; table(); }),
    select([['', 'Tüm alım yolları'], ...Object.entries(EDU_ROUTES)], filters.route, value => { filters.route = value; table(); }),
    select([['', 'Tüm grup durumları'], ['undated', 'Tarih girilmemiş'], ['active', 'İlk dönem aktif'], ['expired', 'Süresi dolan']], filters.group, value => { filters.group = value; table(); }),
    button('Filtrelenenleri CSV indir', () => {
      if (!admin()) return;
      const url = URL.createObjectURL(new Blob([educationCSV(filterEducationRecords(records, filters))], { type: 'text/csv;charset=utf-8' }));
      const anchor = el('a'); anchor.href = url; anchor.download = 'alfa-edu-crm.csv'; anchor.click(); URL.revokeObjectURL(url);
    }));
  root.append(controls, count, list); table();
}
async function load(force = false) {
  if (!active() || loading || (!force && Date.now() - lastFetched < 60000)) return;
  const owner = AUTH.user.id; loading = true; error = ''; render();
  const [crm, access] = await Promise.allSettled([api(), window.siteFetch('/api/access?op=list', { cache: 'no-store' }).then(async response => { const data = await response.json(); if (!response.ok || !data.ok || !Array.isArray(data.rows) || (data.telegram && !Array.isArray(data.telegram))) throw new Error('Borsa özeti alınamadı.'); return data; })]);
  loading = false;
  if (!admin() || AUTH.user.id !== owner) { records = null; exchange = null; root.replaceChildren(); root.hidden = true; context(); return; }
  if (crm.status === 'fulfilled') { records = crm.value.records; truncated = crm.value.truncated; lastFetched = Date.now(); }
  else { records = null; error = ['unauthorized', 'admin_required'].includes(crm.reason.message) ? 'Yönetici oturumunu doğrula.' : 'Yenile ile tekrar dene.'; }
  if (access.status === 'fulfilled') {
    const all = [...(access.value.rows || []), ...(access.value.telegram || [])];
    exchange = { ok: true, rows: access.value.rows || [], total: all.length, verified: all.filter(r => r.status === 'verified').length, pending: all.filter(r => r.status === 'pending').length };
  } else exchange = { ok: false, error: 'Borsa özeti alınamadı; borsa için sıfır sayı gösterilmiyor.' };
  render();
}
function edit(record) {
  if (!admin() || editor) return;
  const owner = AUTH.user.id, dialog = el('dialog'); editor = dialog; dialog.className = 'education-crm-editor'; dialog.setAttribute('aria-label', 'Eğitim kaydı');
  dialog.append(el('h2', record ? 'Eğitim kaydını incele' : 'Manuel eğitim kaydı'), el('p', 'Alım onayı erişim açmaz. Ödeme, Breakout ilk alımı ve Pro muadilliği manuel doğrulanmalıdır. İletişim/paket/alım yolu kayıt oluşturulduktan sonra değişmez.'));
  if (record?.note) dialog.appendChild(el('p', 'Öğrenci talebi: ' + record.note));
  if (record?.lastApplication) dialog.appendChild(el('p', 'Son form talebi (kimlik/alım teyidi değildir): ' + (record.lastApplication.name || '') + ' · ' + (record.lastApplication.note || '') + ' · ' + record.lastApplication.at));
  const form = el('form'), grid = el('div', undefined, 'crm-editor-grid'); form.appendChild(grid);
  const fields = {};
  function field(name, label, type = 'text', value = '') {
    const wrap = el('label', label), node = el('input'); node.name = name; node.type = type; node.value = value ?? ''; fields[name] = node; wrap.appendChild(node); grid.appendChild(wrap); return node;
  }
  function dropdown(name, label, values, value) {
    const wrap = el('label', label), node = select(values, value, () => updateLimits()); node.name = name; fields[name] = node; wrap.appendChild(node); grid.appendChild(wrap); return node;
  }
  field('name', 'Ad', 'text', record?.name).maxLength = 80;
  const contact = field('contact', 'E-posta veya @Telegram', 'text', record?.contact); contact.required = true; contact.maxLength = 160;
  dropdown('plan', 'Paket', EDU_PLANS.map(p => [p.id, p.name.tr]), record?.plan || 'video');
  dropdown('route', 'Alım yolu', Object.entries(EDU_ROUTES), record?.route || 'cash');
  dropdown('stage', 'Durum', Object.entries(EDU_STAGES), record?.stage || 'interested');
  for (const [name, label] of [['cashReceivedUsd', 'Gerçekte alınan eğitim ücreti USD (boş = bilinmiyor)'], ['commissionReceivedUsd', 'Gerçekte alınan komisyon USD (boş = bilinmiyor)']]) {
    const node = field(name, label, 'number', record?.[name]); node.min = '0'; node.step = '0.01';
  }
  field('verification', 'Doğrulama referansı / kontrol notu', 'text', record?.verification).maxLength = 240;
  field('groupStart', 'İlk grup dönemi başlangıcı', 'date', record?.groupStart);
  field('groupEnd', 'İlk grup dönemi bitişi (bu tarih dahil değil)', 'date', record?.groupEnd);
  field('privateUsed', 'Kullanılan özel ders', 'number', record?.privateUsed || 0).min = '0';
  field('groupUsed', 'Kullanılan ortak ders', 'number', record?.groupUsed || 0).min = '0';
  const noteLabel = el('label', 'Yönetici takip notu'), note = el('textarea'); note.name = 'adminNote'; note.maxLength = 1000; note.value = record?.adminNote || ''; fields.adminNote = note; noteLabel.appendChild(note); form.appendChild(noteLabel);
  function checkbox(name, label, checked) {
    const wrap = el('label', undefined, 'edu-consent'), node = el('input'); node.type = 'checkbox'; node.name = name; node.checked = checked; fields[name] = node; wrap.append(node, el('span', label)); form.appendChild(wrap);
  }
  checkbox('confirmPurchase', 'Alımı manuel olarak kontrol ettim; ziyaret veya başvuruyu satış saymıyorum.', record?.stage === 'verified');
  checkbox('firstPurchaseConfirmed', 'Breakout referans/ilk kayıt/uygun ilk hesap alımı şartını ve varsa Pro muadilini kontrol ettim.', !!record?.firstPurchaseConfirmed);
  const limits = el('p'); form.appendChild(limits);
  function updateLimits() {
    if (!fields.privateUsed) return;
    const upgrade = fields.route.querySelector('option[value="breakout100k"]');
    upgrade.disabled = fields.plan.value !== 'personal';
    if (upgrade.disabled && fields.route.value === 'breakout100k' && !record) fields.route.value = 'breakout';
    const allowed = allowance({ ...record, plan: fields.plan.value, route: fields.route.value });
    fields.privateUsed.max = String(allowed.private); fields.groupUsed.max = String(allowed.group);
    limits.textContent = 'Paket hakkı: ' + allowed.private + ' özel, ' + allowed.group + ' ortak ders. Video hakkı kalıcıdır; grup devamı ayrı doğrulama gerektirir.';
    fields.verification.required = fields.stage.value === 'verified';
    fields.confirmPurchase.required = fields.stage.value === 'verified';
    fields.firstPurchaseConfirmed.required = fields.stage.value === 'verified' && fields.route.value !== 'cash';
  }
  if (record) for (const name of ['contact', 'plan', 'route']) fields[name].disabled = true;
  updateLimits();
  const feedback = el('p'); feedback.setAttribute('role', 'status');
  const save = button('Kaydet', () => {}); save.type = 'submit'; form.appendChild(save);
  const close = button('Kapat', () => dialog.close());
  dialog.append(form, feedback, close);
  if (record) dialog.appendChild(button('Kişisel veriyi kalıcı sil', async () => {
    if (save.disabled || !admin() || AUTH.user.id !== owner || prompt('Bu eğitim kaydı kalıcı silinecek. Devam etmek için SIL yaz.')?.trim() !== 'SIL') return;
    save.disabled = true; close.disabled = true;
    try { await api({ op: 'erase', id: record.id, revision: record.revision, confirmation: 'ERASE' }); dialog.close(); lastFetched = 0; await load(true); }
    catch (error) { feedback.textContent = errors[error.message] || 'Kayıt silinemedi.'; }
    finally { save.disabled = false; close.disabled = false; }
  }));
  dialog.addEventListener('close', () => { editor = null; dialog.remove(); });
  form.onsubmit = async event => {
    event.preventDefault(); if (save.disabled || !form.reportValidity() || !admin() || AUTH.user.id !== owner) return;
    const body = { op: 'save', ...(record ? { id: record.id, revision: record.revision } : {}) };
    Object.entries(fields).forEach(([name, node]) => { body[name] = node.type === 'checkbox' ? node.checked : node.value; });
    save.disabled = true; close.disabled = true; feedback.textContent = 'Kaydediliyor…';
    try {
      await api(body);
      if (!admin() || AUTH.user.id !== owner) { dialog.close(); return; }
      dialog.close(); pageIndex = 0; lastFetched = 0; await load(true);
    } catch (error) { feedback.textContent = errors[error.message] || 'Kayıt kaydedilemedi. Oturumunu ve bağlantını kontrol et.'; }
    finally { save.disabled = false; close.disabled = false; }
  };
  document.body.appendChild(dialog); dialog.showModal();
}
function context() {
  const owner = admin() ? AUTH.user.id : '';
  if (owner !== lastOwner) {
    records = null; exchange = null; interest = null; lastFetched = 0; pageIndex = 0; truncated = false; lastOwner = owner; error = '';
    if (editor) editor.close();
  }
  if (!active()) { root.replaceChildren(); root.hidden = true; return; }
  try { if (!interest && typeof anaState !== 'undefined') interest = anaState.data?.educationInterest || null; } catch {}
  const parent = document.body.dataset.page === 'analitik' ? document.getElementById('education-crm-slot') : document.getElementById('acc-admin-panel');
  if (!parent) return;
  if (root.parentNode !== parent) parent.appendChild(root);
  render(); load();
}
new MutationObserver(context).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-page'] });
const accessPanel = document.getElementById('acc-admin-panel');
if (accessPanel) new MutationObserver(context).observe(accessPanel, { attributes: true, attributeFilter: ['style'] });
window.addEventListener('focus', context);
window.addEventListener('alfa-analytics-loaded', event => { if (admin()) { interest = event.detail || null; render(); } });
window.AlfaEducationCRM = { refreshContext: context };
context();
