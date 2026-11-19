import { EDU_PLANS } from './edu-plans-model.mjs?v=4';
import './edu-checkout.mjs?v=2';
const en = () => window.LANG === 'en';
const t = (a, b) => en() ? b : a;
const el = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-edu-apply]');
  if (!button) return;
  if (button.dataset.eduRoute) return; // Direct purchase/verification flow, not a contact lead.
  const plan = EDU_PLANS.find(plan => plan.id === button.dataset.eduApply);
  if (!plan || document.querySelector('dialog.edu-application')) return;
  const dialog = el('dialog'); dialog.className = 'edu-application'; dialog.setAttribute('aria-label', t('Eğitim talebi', 'Training application'));
  dialog.append(el('h2', t(plan.name.tr, plan.name.en)), el('p', t('Bilgilerini bırakırsan seninle iletişime geçelim. Talep kaydı ödeme, satın alım veya erişim onayı değildir.', 'Leave your details so we can contact you. An application is not a payment, purchase or access approval.')));
  const form = el('form');
  function input(label, name, max) {
    const wrap = el('label', label), field = el('input'); field.name = name; field.maxLength = max; wrap.appendChild(field); form.appendChild(wrap); return field;
  }
  input(t('Adın (isteğe bağlı)', 'Name (optional)'), 'name', 80);
  const contact = input(t('E-posta veya @Telegram kullanıcı adın', 'Email or @Telegram username'), 'contact', 160); contact.required = true;
  try { if (typeof AUTH !== 'undefined' && AUTH.user?.email) contact.value = AUTH.user.email; } catch {}
  const routeLabel = el('label', t('İlgilendiğin katılım yolu', 'Preferred way to join')), route = el('select'); route.name = 'route';
  const options = [['cash', t('Eğitim ücreti: $' + plan.usd, 'Education fee: $' + plan.usd)], ['breakout', t('Breakout: ' + plan.account.tr, 'Breakout: ' + plan.account.en)]];
  if (plan.upgrade) options.push(['breakout100k', t('100K Classic · 4 özel ders', '100K Classic · 4 private lessons')]);
  options.forEach(([value, label]) => { const option = el('option', label); option.value = value; route.appendChild(option); });
  routeLabel.appendChild(route); form.appendChild(routeLabel);
  const noteLabel = el('label', t('Ne konuda destek istiyorsun? (isteğe bağlı)', 'What would you like help with? (optional)'));
  const note = el('textarea'); note.name = 'note'; note.maxLength = 500; noteLabel.appendChild(note); form.appendChild(noteLabel);
  const consentLabel = el('label'); consentLabel.className = 'edu-consent';
  const consent = el('input'); consent.type = 'checkbox'; consent.required = true;
  consentLabel.append(consent, el('span', t('Bu taleple ilgili iletişime geçilmesini ve bu bilgilerin yönetici tarafından takip edilmesini kabul ediyorum.', 'I agree to be contacted about this application and to have these details tracked by the administrator.')));
  form.appendChild(consentLabel);
  const status = el('p'); status.setAttribute('role', 'status');
  const submit = el('button', t('Talebimi kaydet', 'Submit application')); submit.type = 'submit'; submit.className = 'btn solid';
  form.append(submit); const close = el('button', t('Kapat', 'Close')); close.type = 'button'; close.className = 'btn';
  close.onclick = () => dialog.close(); dialog.append(form, status, close);
  dialog.addEventListener('close', () => dialog.remove());
  form.onsubmit = async event => {
    event.preventDefault(); if (!form.reportValidity() || submit.disabled) return;
    submit.disabled = true; status.textContent = t('Kaydediliyor…', 'Saving…');
    try {
      const headers = { 'Content-Type': 'application/json', ...(typeof window.siteAuthHeaders === 'function' ? await window.siteAuthHeaders() : {}) };
      const response = await fetch('/api/analytics?education=1', { method: 'POST', headers,
        body: JSON.stringify({ op: 'apply', plan: plan.id, route: route.value, name: form.elements.name.value, contact: contact.value, note: note.value, consent: consent.checked }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error);
      form.hidden = true; status.textContent = t('Talebin kaydedildi. Bu, ödeme veya erişim onayı değildir; iletişime geçeceğiz.', 'Your application has been received. This is not a payment or access approval; we will contact you.');
      if (/^EDU-[a-f0-9]{16}$/.test(result.reference)) status.textContent += t(' Talep referansı: ', ' Application reference: ') + result.reference;
    } catch (error) {
      status.textContent = error.message === 'slow_down' ? t('Kısa süre önce talep gönderildi; biraz sonra tekrar dene.', 'An application was recently submitted; please try again later.')
        : t('Talep kaydedilemedi. İletişim bilgini ve oturumunu kontrol edip tekrar dene; Telegram üzerinden de yazabilirsin.', 'Application could not be saved. Check your contact details and session, then retry; you can also contact us on Telegram.');
      submit.disabled = false;
    }
  };
  document.body.appendChild(dialog); dialog.showModal();
});
