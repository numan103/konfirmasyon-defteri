function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return String(iso || ''); }
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function ensureHost() {
  let host = document.getElementById('edu-certificate-host');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'edu-certificate-host';
  document.body.appendChild(host);
  return host;
}

function show(cert) {
  if (!cert) return;
  const host = ensureHost();
  host.hidden = false;
  host.innerHTML = `
    <div class="ec-backdrop" data-ec-close="1">
      <div class="ec-dialog" role="dialog" aria-modal="true" aria-label="Tamamlama Belgesi">
        <div class="ec-actions no-print">
          <button type="button" class="btn ghost" data-ec-close="1">Kapat</button>
          <button type="button" class="btn solid" id="ec-print">Yazdır / PDF Kaydet</button>
        </div>
        <div class="ec-sheet" id="ec-sheet">
          <div class="ec-brand">ALFA EDU</div>
          <div class="ec-type">Tamamlama / Katılım Belgesi</div>
          <div class="ec-name">${esc(cert.name || 'Alfa Edu Öğrencisi')}</div>
          <div class="ec-text">aşağıdaki bölümü tamamladığını belgelemek amacıyla bu belge düzenlenmiştir.</div>
          <div class="ec-course">${esc(cert.courseTitle || 'Bölüm')}</div>
          <div class="ec-meta">
            <div><span>Eğitmen</span><strong>${esc(cert.instructor || 'Alfa Edu')}</strong></div>
            <div><span>Tamamlanan İçerik</span><strong>${Number(cert.items || 0)} ders</strong></div>
            <div><span>Tamamlanma Tarihi</span><strong>${esc(fmtDate(cert.completedAt))}</strong></div>
            <div><span>Belge Tarihi</span><strong>${esc(fmtDate(cert.issuedAt))}</strong></div>
          </div>
          <div class="ec-serial">Seri No: ${esc(cert.serial || '')}</div>
          <div class="ec-foot">Bu belge sembolik bir katılım/tamamlama belgesidir; resmi akreditasyon veya yatırım tavsiyesi niteliği taşımaz.</div>
        </div>
      </div>
    </div>`;
  host.querySelectorAll('[data-ec-close]').forEach(el => el.addEventListener('click', (e) => {
    if (e.target && e.target.getAttribute('data-ec-close')) close();
  }));
  const printBtn = host.querySelector('#ec-print');
  if (printBtn) printBtn.addEventListener('click', () => window.print());
}

function close() {
  const host = document.getElementById('edu-certificate-host');
  if (host) { host.hidden = true; host.replaceChildren(); }
}

if (typeof window !== 'undefined') window.EduCertificate = { show, close };
export default { show, close };
