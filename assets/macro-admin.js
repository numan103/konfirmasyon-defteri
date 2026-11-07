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
    macro_event_not_found: 'Önizleme için resmî takvimden doğrulanmış bir olay seçilmeli.',
    macro_event_not_due: 'Bu aşamanın zamanı değil. Eski açıklama yeni veri gibi sunulmaz.',
    source_release_not_due: 'Verinin planlanan saatinden en az beş dakika geçmeden sonuç önizlemesi yapılmaz.',
    source_release_unconfirmed: 'Resmî açıklama henüz doğrulanamadı. Eski veri sonuç diye sunulmadı.',
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
    const intro = el('p', 'Her gün 09.00 kısa sabah görüşü; kritik veri öncesinde beklenti ve resmî açıklama sonrasında görüş güncellemesi. Önizlemeler mesaj göndermez. Günlük ve veri güncellemesi izinleri ayrıdır.');
    const target = el('p', 'Hedef kontrol ediliyor…', 'macro-admin-target');
    const message = el('p'); message.setAttribute('role', 'status');
    const report = el('pre', 'Henüz rapor önizlenmedi.');
    const controls = el('div', null, 'macro-admin-actions');
    const status = el('button', 'Durumu yenile');
    const preview = el('button', 'Raporu önizle');
    const test = el('button', 'Test gönder'); test.disabled = true;
    const enable = el('button', 'Günlük otomasyonu aç');
    const disable = el('button', 'Otomasyonu durdur');
    const morningPreview = el('button', 'Yeni sabah akışını önizle');
    const agendaRefresh = el('button', 'Veri takvimini yenile');
    const eventEnable = el('button', 'Veri güncellemelerine izin ver');
    const eventDisable = el('button', 'Veri güncellemelerini kapat');
    const eventSelect = el('select'); eventSelect.setAttribute('aria-label', 'Doğrulanmış kritik veri');
    const prePreview = el('button', 'Veri öncesini önizle');
    const postPreview = el('button', 'Veri sonucunu önizle');
    let agendaEvents = [];
    const eventStatus = el('p', 'Veri takvimi henüz yüklenmedi.');
    const actionButtons = [status, preview, enable, disable, morningPreview, agendaRefresh, eventEnable, eventDisable, prePreview, postPreview];
    [...actionButtons, test].forEach(b => { b.type = 'button'; });
    controls.append(status, preview, morningPreview, test, enable, disable, agendaRefresh, eventSelect, prePreview, postPreview, eventEnable, eventDisable);
    const label = el('label'); const confirm = el('input'); confirm.type = 'checkbox';
    label.append(confirm, document.createTextNode(' Hedefi ve önizlemeyi inceledim. Test gerçek mesajı, yalnızca gösterilen tek hedefe gönderecek.'));
    confirm.addEventListener('change', () => { test.disabled = !confirm.checked || !draft?.report || draft.phase !== 'ready' || !!draft.target?.warning; });
    const show = d => {
      const t = d.target;
      target.textContent = t ? `Hedef: ${t.name} · ${t.type}${t.username ? ' · @' + t.username : ''}${t.hasThread ? ' · konu seçili' : ''}${t.warning ? ' · ' + textError(t.warning) : ''}` : 'Hedef doğrulanamadı; gönderim kapalı.';
      if (t?.topicUrl) target.textContent += ' · ' + t.topicUrl;
      if (d.report?.text) report.textContent = d.report.text;
      else if (d.report?.report?.text) report.textContent = d.report.report.text;
    };
    const work = async fn => {
      if (busy) return;
      busy = true; controls.querySelectorAll('button').forEach(b => { b.disabled = true; }); message.textContent = 'İşleniyor…';
      try { await fn(); } catch (e) { message.textContent = textError(e.message); message.className = 'macro-admin-error'; if (/delivery|already_claimed/.test(e.message)) { draft = null; confirm.checked = false; } }
      finally { busy = false; actionButtons.forEach(b => { b.disabled = false; }); prePreview.disabled = !eventSelect.value; postPreview.disabled = !eventSelect.value || Date.now() < Date.parse(agendaEvents.find(e => e.id === eventSelect.value)?.at) + 5 * 60000; test.disabled = !confirm.checked || !draft?.report || draft.phase !== 'ready' || !!draft.target?.warning; }
    };
    const loadEvents = async () => {
      const d = await api('macro-event-status'); agendaEvents = d.events;
      eventSelect.replaceChildren();
      const empty = el('option', 'Kritik veri seç'); empty.value = ''; eventSelect.append(empty);
      for (const event of agendaEvents) { const option = el('option', event.title + ' · ' + new Date(event.at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })); option.value = event.id; eventSelect.append(option); }
      eventStatus.textContent = `Veri güncellemeleri: ${d.enabled ? 'açık' : 'kapalı'} · Doğrulanmış olay: ${d.events.length}${d.agenda?.failures?.length ? ' · Eksik resmî takvim: ' + d.agenda.failures.map(f => f.name).join(', ') : ''}`;
    };
    const refresh = () => work(async () => {
      const d = await api('macro-status'); show(d); draft = null; confirm.checked = false;
      message.textContent = `Otomasyon: ${d.enabled ? 'açık' : 'kapalı'} · Kayıt altyapısı: ${d.storageReady ? 'hazır' : 'eksik'} · Model erişimi: ${d.model?.available ? d.model.name : 'doğrulanamadı'}${d.missing.length ? ' · Eksik değişkenler: ' + d.missing.join(', ') : ''}${d.errors.length ? ' · ' + d.errors.map(textError).join(' / ') : ''}`;
      try { await loadEvents(); } catch { eventStatus.textContent = 'Olay kayıtları hazır değil; supabase/site/004_macro_events.sql kurulmalı.'; }
    });
    status.addEventListener('click', refresh);
    preview.addEventListener('click', () => work(async () => {
      draft = null; confirm.checked = false;
      report.textContent = 'Güncel kaynaklar araştırılıyor; henüz yeni rapor yok…';
      const d = await api('macro-preview'); show(d); draft = d;
      message.className = ''; message.textContent = `Rapor durumu: ${d.phase}. Telegram’a mesaj gönderilmedi.`;
    }));
    morningPreview.addEventListener('click', () => work(async () => {
      draft = null; confirm.checked = false;
      report.textContent = 'Yeni araştırma yapılıyor…';
      const d = await api('macro-morning-preview');
      report.textContent = d.report?.text || 'Önizleme hazır değil.';
      message.textContent = 'Yeni sabah akışının mesaj göndermeyen önizlemesi. Bugünün gönderim kaydı değiştirilmedi.';
    }));
    agendaRefresh.addEventListener('click', () => work(async () => { await api('macro-agenda-refresh'); await loadEvents(); message.textContent = 'Resmî takvim ve açıklama öncesi beklenti kesitleri yenilendi. Mesaj gönderilmedi.'; }));
    eventSelect.addEventListener('change', () => { prePreview.disabled = !eventSelect.value; postPreview.disabled = !eventSelect.value || Date.now() < Date.parse(agendaEvents.find(e => e.id === eventSelect.value)?.at) + 5 * 60000; });
    for (const [button, stage] of [[prePreview, 'pre'], [postPreview, 'post']]) button.addEventListener('click', () => work(async () => {
      draft = null; confirm.checked = false;
      const d = await api('macro-event-preview', { eventId: eventSelect.value, stage });
      report.textContent = d.report?.text || 'Yeni, doğrulanmış sonuç yok; mesaj hazırlanmadı.';
      message.textContent = 'Olay önizlemesi; Telegram’a gönderilmedi.';
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
    disable.addEventListener('click', () => work(async () => { await api('macro-enable', { enabled: false }); try { await loadEvents(); } catch { eventStatus.textContent = 'Ana gönderim izni kapalı.'; } message.textContent = 'Otomasyon durduruldu.'; }));
    eventEnable.addEventListener('click', () => work(async () => {
      const d = await api('macro-status');
      if (!d.target || !d.tested) throw new Error('macro_test_required');
      if (!window.confirm(`${d.target.name} · ${d.target.topicUrl || ''} için kritik veri öncesi/sonrası otomatik güncellemelere izin verilsin mi? Günlük otomasyon ana izni de açık olmalı.`)) return;
      const result = await api('macro-events-enable', { enabled: true, confirmEnable: true, targetHash: d.target.targetHash });
      await loadEvents(); message.textContent = result.requiresDailyEnable ? 'Veri güncellemesi izni kaydedildi; günlük ana izin kapalı, gönderim başlamaz.' : 'Veri güncellemesi izni açık.';
    }));
    eventDisable.addEventListener('click', () => work(async () => { await api('macro-events-enable', { enabled: false }); await loadEvents(); message.textContent = 'Veri güncellemeleri kapatıldı.'; }));
    dialog.append(head, intro, target, message, eventStatus, controls, report, label);
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
