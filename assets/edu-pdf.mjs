const root = document.getElementById('ch-pdf-editor');
const safeURL = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(u.hostname) && /^\/alfa-edu-pdf\/[\w-]+\.pdf$/.test(u.pathname) && !u.search && !u.hash && !u.username && !u.password && !u.port; } catch { return false; }
};
export function pdfViewer(pdf) {
  if (!pdf || !safeURL(pdf.url)) return null;
  const box = document.createElement('section'); box.className = 'article-pdf';
  const link = document.createElement('a'); link.href = pdf.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'btn';
  link.textContent = '📄 PDF’yi aç / indir · ' + (pdf.name || 'Eğitim dokümanı');
  const show = document.createElement('button'); show.type = 'button'; show.className = 'btn'; show.textContent = 'PDF’yi burada göster'; show.setAttribute('aria-expanded', 'false');
  const stage = document.createElement('div');
  show.onclick = () => {
    if (stage.children.length) { stage.replaceChildren(); show.textContent = 'PDF’yi burada göster'; show.setAttribute('aria-expanded', 'false'); return; }
    const frame = document.createElement('iframe'); frame.src = pdf.url; frame.title = pdf.name || 'Eğitim PDF dokümanı'; frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer'; frame.setAttribute('sandbox', 'allow-scripts allow-same-origin'); stage.append(frame);
    show.textContent = 'PDF’yi kapat'; show.setAttribute('aria-expanded', 'true');
  };
  const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Sesli dinle düğmesi yazı metnini okur; PDF’nin içeriği otomatik seslendirilmez.';
  box.append(link, show, stage, hint); return box;
}
function paint() {
  if (!root) return;
  root.replaceChildren();
  const label = document.createElement('label'); label.textContent = '📄 PDF ekle (en fazla 20 MB)';
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'application/pdf,.pdf'; file.disabled = root.dataset.uploading === 'true'; label.append(file);
  const status = document.createElement('p'); status.className = 'hint'; status.setAttribute('role', 'status');
  status.textContent = 'PDF, notu kaydettiğinde Ana Sayfa ve Alfa Edu’da görünür. Sesli okuma için metni de yazı alanına ekle.';
  root.append(label, status);
  if (root._pdf) {
    const name = document.createElement('span'); name.textContent = root._pdf.name;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn'; remove.textContent = 'PDF’yi nottan kaldır';
    remove.onclick = () => { root._pdf = null; paint(); if (typeof chDraftSchedule === 'function') chDraftSchedule(); };
    root.append(name, remove);
  }
  file.onchange = async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    if (!/\.pdf$/i.test(selected.name) || selected.size > 20 * 1024 * 1024 || selected.size < 5 || await selected.slice(0, 5).text() !== '%PDF-') {
      status.textContent = 'Geçerli bir PDF seç; dosya en fazla 20 MB olmalı.'; return;
    }
    if (window.ALFA_PREVIEW_CONFIG || typeof siteIsAdmin !== 'function' || !siteIsAdmin()) { status.textContent = 'PDF yüklemek için yönetici girişi gerekli.'; return; }
    const account = AUTH.user?.id, form = document.getElementById('ch-form'), generation = form.dataset.generation;
    root.dataset.uploading = 'true'; file.disabled = true;
    try {
      const { upload } = await import('./vendor/vercel-blob-upload.mjs?v=1');
      const headers = await window.siteAuthHeaders();
      if (AUTH.user?.id !== account || form.dataset.generation !== generation) return;
      const result = await upload('alfa-edu-pdf/' + crypto.randomUUID() + '.pdf', selected, {
        access: 'public', contentType: 'application/pdf', multipart: selected.size > 5 * 1024 * 1024,
        handleUploadUrl: '/api/edu-shared?kind=channel&view=daily-notes&pdf-upload=1', headers,
        onUploadProgress: event => { if (form.dataset.generation === generation) status.textContent = 'PDF yükleniyor: %' + Math.round(event.percentage); }
      });
      if (AUTH.user?.id !== account || form.dataset.generation !== generation) return;
      root._pdf = { url: result.url, name: selected.name, size: selected.size };
      if (typeof chDraftSchedule === 'function') chDraftSchedule();
      root.dataset.uploading = 'false'; paint();
    } catch { if (form.dataset.generation === generation) status.textContent = 'PDF yüklenemedi. Dosyanı tekrar seçip dene; notun henüz yayınlanmadı.'; }
    finally { root.dataset.uploading = 'false'; file.disabled = false; }
  };
}
if (typeof window !== 'undefined') { window.EduPDF = { viewer: pdfViewer, paint }; paint(); }
