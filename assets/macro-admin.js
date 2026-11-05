(function () {
  'use strict';
  let dialog, draft, busy = false;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const errors = {
    macro_storage_unavailable: 'Kalıcı kayıt tabloları hazır değil. supabase/site/002_macro.sql kurulmalı.',
    telegram_target_unavailable: 'Mevcut botun hedefi doğrulanamadı. Telegram sunucu ayarlarını kontrol et.',
    macro_target_ambiguous: 'Birden fazla hedef var. MACRO_TARGET ile yalnızca public veya premium seçilmeli.',
    macro_thread_not_supported: 'Bu hedef, ayarlardaki Telegram konusunu desteklemiyor. MACRO_TARGET_THREAD ayarı doğrulanmalı.',
    macro_busy: 'Araştırma zaten devam ediyor; paralel işlem başlatılmadı.',
    macro_attempt_limit: 'Bugünün araştırma deneme sınırına ulaşıldı.',
    macro_report_expired: 'Önizleme eskidi. Yeniden araştırıp önizle.',
    macro_confirmation_required: 'Güncel rapor ve hedef için açık gönderim onayı gerekli.',
    macro_already_claimed: 'Bu günün gönderimi zaten alınmış. Tekrar gönderilmedi.',
    telegram_delivery_unknown: 'Teslim sonucu belirsiz. Mükerrer mesaj riskine karşı otomatik tekrar yok; Telegram’ı kontrol et.',
    provider_rate_limited: 'Araştırma/model kotası dolu. Eski rapor gönderilmedi.',
    model_credentials_rejected: 'Model API anahtarı reddedildi; gerçek rapor üretilemedi.',
    web_search_unavailable: 'Güncel tarayıcı araştırması kullanılamıyor. Gerekirse Tavily yapılandırılmalı.',
    insufficient_fresh_evidence: 'Yeterli, tarihi doğrulanmış güncel kaynak alınamadı. Rapor gönderilmedi.',
  };
  function textError(code) { return errors[code] || ('İşlem tamamlanamadı: ' + code); }
  async function api(action, data = {}) {
    const r = await siteFetch('/api/ai?macro=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...data }) });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || 'macro_error');
    return result;
  }
  function mount() {
    dialog = el('dialog', null, 'macro-admin');
    dialog.setAttribute('aria-labelledby', 'macro-admin-title');
    const head = el('header'); const title = el('h2', 'Alfa Makro Analist'); title.id = 'macro-admin-title';
    const close = el('button', 'Kapat'); close.type = 'button'; close.addEventListener('click', () => dialog.close());
    head.append(title, close);
    const intro = el('p', 'Her gün 09.00 Europe/Istanbul. Önce hedefi ve gerçek raporu incele. Test gönderimi gerçek Telegram mesajıdır; bugünün günlük kaydını tüketir. Otomasyon ayrı onayla açılır.');
    const target = el('p', 'Hedef kontrol ediliyor…', 'macro-admin-target');
    const message = el('p'); message.setAttribute('role', 'status');
    const report = el('pre', 'Henüz rapor önizlenmedi.');
    const controls = el('div', null, 'macro-admin-actions');
    const status = el('button', 'Durumu yenile');
    const preview = el('button', 'Raporu önizle');
    const test = el('button', 'Test gönder'); test.disabled = true;
    const enable = el('button', 'Günlük otomasyonu aç');
    const disable = el('button', 'Otomasyonu durdur');
    [status, preview, test, enable, disable].forEach(b => { b.type = 'button'; });
    controls.append(status, preview, test, enable, disable);
    const label = el('label'); const confirm = el('input'); confirm.type = 'checkbox';
    label.append(confirm, document.createTextNode(' Hedefi ve önizlemeyi inceledim. Test gerçek mesajı, yalnızca gösterilen tek hedefe gönderecek.'));
    confirm.addEventListener('change', () => { test.disabled = !confirm.checked || !draft?.report || draft.phase !== 'ready' || !!draft.target?.warning; });
    const show = d => {
      const t = d.target;
      target.textContent = t ? `Hedef: ${t.name} · ${t.type}${t.username ? ' · @' + t.username : ''}${t.hasThread ? ' · konu seçili' : ''}${t.warning ? ' · ' + textError(t.warning) : ''}` : 'Hedef doğrulanamadı; gönderim kapalı.';
      if (d.report?.text) report.textContent = d.report.text;
      else if (d.report?.report?.text) report.textContent = d.report.report.text;
    };
    const work = async fn => {
      if (busy) return;
      busy = true; controls.querySelectorAll('button').forEach(b => { b.disabled = true; }); message.textContent = 'İşleniyor…';
      try { await fn(); } catch (e) { message.textContent = textError(e.message); message.className = 'macro-admin-error'; if (/delivery|already_claimed/.test(e.message)) { draft = null; confirm.checked = false; } }
      finally { busy = false; [status, preview, enable, disable].forEach(b => { b.disabled = false; }); test.disabled = !confirm.checked || !draft?.report || draft.phase !== 'ready' || !!draft.target?.warning; }
    };
    const refresh = () => work(async () => {
      const d = await api('macro-status'); show(d); draft = null; confirm.checked = false;
      message.textContent = `Otomasyon: ${d.enabled ? 'açık' : 'kapalı'} · Kayıt altyapısı: ${d.storageReady ? 'hazır' : 'eksik'} · Model erişimi: ${d.model?.available ? d.model.name : 'doğrulanamadı'}${d.missing.length ? ' · Eksik değişkenler: ' + d.missing.join(', ') : ''}${d.errors.length ? ' · ' + d.errors.map(textError).join(' / ') : ''}`;
    });
    status.addEventListener('click', refresh);
    preview.addEventListener('click', () => work(async () => {
      draft = null; confirm.checked = false;
      report.textContent = 'Güncel kaynaklar araştırılıyor; henüz yeni rapor yok…';
      const d = await api('macro-preview'); show(d); draft = d;
      message.className = ''; message.textContent = `Rapor durumu: ${d.phase}. Telegram’a mesaj gönderilmedi.`;
    }));
    test.addEventListener('click', () => work(async () => {
      if (!confirm.checked || !draft?.target || !draft.report) throw new Error('macro_confirmation_required');
      if (!window.confirm(`${draft.target.name} (${draft.target.type}) hedefine yukarıdaki rapor GERÇEK mesaj olarak gönderilsin mi?${['channel', 'supergroup', 'group'].includes(draft.target.type) ? '\nHedefin üyeleri bu mesajı görebilir.' : ''}`)) { message.textContent = 'Gönderim iptal edildi.'; return; }
      const d = await api('macro-test-send', { confirmSend: true, reportHash: draft.report.reportHash, targetHash: draft.target.targetHash });
      draft = null; confirm.checked = false; message.textContent = `Gönderim: ${d.phase} · ${d.parts} parça. Bugün tekrar gönderilmez.`;
    }));
    enable.addEventListener('click', () => work(async () => {
      const d = await api('macro-status'); show(d);
      if (!d.target || !d.tested) throw new Error('macro_test_required');
      if (!window.confirm(`${d.target.name} için günlük 09.00 otomatik gönderim açılsın mı? Sunucudaki Supabase zamanlayıcısının da kurulmuş olması gerekir.`)) return;
      await api('macro-enable', { enabled: true, confirmEnable: true, targetHash: d.target.targetHash }); message.textContent = 'Otomasyon izni açık. Zamanlayıcı kurulumu ayrıca doğrulanmalı.';
    }));
    disable.addEventListener('click', () => work(async () => { await api('macro-enable', { enabled: false }); message.textContent = 'Otomasyon durduruldu.'; }));
    dialog.append(head, intro, target, message, controls, report, label);
    document.body.append(dialog);
    return refresh;
  }
  let refresh;
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-macro-open]')) return;
    if (typeof siteIsAdmin !== 'function' || !siteIsAdmin()) return;
    if (!dialog) refresh = mount();
    dialog.showModal(); refresh();
  });
})();
