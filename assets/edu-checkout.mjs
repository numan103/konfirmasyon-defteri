import { EDU_PLANS, EDU_PAYMENT, eduQuestionURL } from './edu-plans-model.mjs?v=4';
const API = '/api/analytics?education=1';
const t = (tr, en) => window.LANG === 'en' ? en : tr;
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const button = (label, action, cls = 'btn') => { const n = el('button', label, cls); n.type = 'button'; n.onclick = action; return n; };
let dialog = null, owner = '', pending = null;
function user() { try { return AUTH.user || null; } catch { return null; } }
async function api(body) {
  const response = await window.siteFetch(API + (body ? '' : '&mine=1'), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const out = await response.json();
  if (!response.ok || !out.ok) throw new Error(out.error || 'request_failed');
  return out;
}
const errors = () => ({
  invalid_txid: t('TXID 64 karakterlik işlem kimliği olmalı.', 'TXID must be a 64-character transaction hash.'),
  evidence_already_submitted: t('Bu TXID veya Breakout hesabı başka bir eğitim başvurusunda kullanılmış. Yeniden ödeme yapmadan bize sor.', 'This TXID or Breakout account is already linked to another training application. Ask us before paying again.'),
  invalid_breakout_reference: t('Hesap ve sipariş kimliklerini kontrol et.', 'Check the account and order IDs.'),
  invalid_purchase_email: t('Breakout kayıt e-postanı kontrol et.', 'Check your Breakout signup email.'),
  slow_down: t('Kısa süre önce bildirim gönderdin. Biraz sonra tekrar dene.', 'You recently submitted a notification. Please retry shortly.'),
  login_required: t('Bildirim için site hesabına giriş yap.', 'Sign in to submit your notification.'),
  unauthorized: t('Oturumunu yenileyip tekrar dene.', 'Refresh your session and retry.'),
});
function open(plan, route) {
  dialog?.close();
  const current = user();
  const node = el('dialog', undefined, 'edu-application edu-checkout'); dialog = node; owner = current?.id || '';
  node.setAttribute('aria-label', t('Eğitim katılımı', 'Training enrollment'));
  node.append(el('h2', plan.name[window.LANG === 'en' ? 'en' : 'tr']));
  const close = button(t('Kapat', 'Close'), () => { pending = null; node.close(); });
  node.addEventListener('cancel', () => { pending = null; });
  node.addEventListener('close', () => { if (dialog === node) dialog = null; node.remove(); });
  if (!current) {
    pending = { plan, route };
    node.append(el('p', t('Ödeme yapmadan veya hesap alımını bildirmeden önce site hesabına giriş yap. Başvurunu bu hesapla takip edeceksin.', 'Sign in before paying or submitting an account purchase. Your application will be tracked under that account.')),
      button(t('Giriş yap / Ücretsiz kaydol', 'Sign in / Register free'), () => {
        node.close(); document.getElementById('auth-gate')?.classList.add('open');
      }, 'btn solid'), close);
    document.body.appendChild(node); node.showModal(); return;
  }
  pending = null;
  const status = el('p', t('Başvuru durumun kontrol ediliyor…', 'Checking your application status…')); status.setAttribute('role', 'status');
  const content = el('div'); node.append(status, content, close);
  const valid = () => node.isConnected && dialog === node && user()?.id === current.id;
  async function load() {
    content.replaceChildren();
    try {
      const out = await api();
      if (!valid()) return;
      if (!Array.isArray(out.applications)) throw new Error('invalid_response');
      const prior = out.applications.find(item => item.plan === plan.id && item.route === route);
      if (prior) {
        const label = prior.reviewPending ? t('Onay bekliyor', 'Awaiting review') : { applied: t('Onay bekliyor', 'Awaiting review'), verified: t('Alım onaylandı', 'Purchase approved'), declined: t('Uygun bulunmadı', 'Declined'), cancelled: t('İptal', 'Cancelled'), interested: t('İnceleme bekliyor', 'Awaiting review') }[prior.stage] || prior.stage;
        status.textContent = label + ' · ' + prior.reference;
        content.append(el('p', t('Bu paket/yol için mevcut bildirimin var. Yeniden ödeme yapma. Ödeme/alım kontrolü ve eğitim haklarının tanımlanması yönetici tarafından yapılır.', 'You already have a notification for this package/route. Do not pay again. Payment/purchase review and training rights are handled by the administrator.')));
        if (prior.stage !== 'verified') content.appendChild(button(t('Bilgimi düzelt / Yeni belge bilgisi gönder', 'Correct my details / Submit new evidence'), () => buildForm(prior)));
      } else { status.textContent = ''; buildForm(); }
    } catch {
      if (valid()) { status.textContent = t('Durumun alınamadı. Tekrar ödeme yapmadan önce yeniden kontrol et.', 'Could not load your status. Check again before making another payment.'); content.appendChild(button(t('Yeniden kontrol et', 'Check again'), load)); }
    }
  }
  function buildForm(prior) {
    content.replaceChildren();
    const cash = route === 'cash', account = route === 'breakout100k' ? '100K Classic' : { video: '10K Classic', live: '25K Classic', personal: '50K Classic' }[plan.id];
    const form = el('form'); form.className = 'edu-checkout-form';
    function field(name, label, max, type = 'text') {
      const wrap = el('label', label), input = el('input'); input.name = name; input.type = type; input.maxLength = max; input.required = true;
      wrap.appendChild(input); form.appendChild(wrap); return input;
    }
    function check(name, label) {
      const wrap = el('label', undefined, 'edu-consent'), input = el('input'); input.name = name; input.type = 'checkbox'; input.required = true;
      wrap.append(input, el('span', label)); form.appendChild(wrap); return input;
    }
    content.append(el('p', prior ? t('Mevcut bildirimin bilgilerini düzelt. Yeniden ödeme yapma; bu ekran yeni ödeme talebi değildir.', 'Correct your existing notification. Do not pay again; this screen is not a new payment request.') : t('1 · Ödemeni / alımını tamamla. 2 · Bilgileri gönder. 3 · Eğitim onayını bekle. Telegram’dan mesaj göndermek zorunlu değil.', '1 · Complete payment / purchase. 2 · Submit details. 3 · Await training approval. Sending a Telegram message is optional.')));
    if (cash) {
      const box = el('div', undefined, 'edu-checkout-payment');
      box.append(el('strong', plan.usd + ' USDT'), el('p', 'USDT · TRON (TRC20)'),
        el('code', EDU_PAYMENT.address));
      const copied = el('p'); copied.setAttribute('role', 'status');
      box.append(button(t('Adresi kopyala', 'Copy address'), async () => {
        try { await navigator.clipboard.writeText(EDU_PAYMENT.address); copied.textContent = t('Adres kopyalandı.', 'Address copied.'); }
        catch { copied.textContent = t('Kopyalanamadı; adresi elle kopyala.', 'Could not copy; copy the address manually.'); }
      }), copied, el('p', t('Yalnızca USDT’yi TRON/TRC20 ağından gönder. Ağ ücretini ayrıca karşıla; alıcıya tam tutar ulaşmalı. Bu bir otomatik tahsilat veya onay değildir.', 'Send only USDT on TRON/TRC20. Cover the network fee separately so the full amount reaches the recipient. This is not automatic payment collection or approval.')));
      content.appendChild(box);
      const txid = field('txid', t('Ödeme sonrası TXID (64 karakter)', 'TXID after payment (64 characters)'), 64);
      txid.pattern = '[A-Fa-f0-9]{64}'; txid.minLength = 64; txid.spellcheck = false; txid.autocomplete = 'off';
      txid.value = prior?.evidence?.txid || '';
    } else {
      const box = el('div', undefined, 'edu-checkout-payment');
      const buy = el('a', t('Breakout’tan hesap al ↗', 'Buy an account on Breakout ↗'), 'btn solid');
      buy.href = 'https://www.breakoutprop.com/'; buy.target = '_blank'; buy.rel = 'noopener noreferrer';
      box.append(el('strong', account), el('p', t('Partner kodu: ALFA · İlk kayıt + uygun ilk hesap alımı.', 'Partner code: ALFA · First signup + qualifying first account purchase.')), buy,
        el('p', t('Hesabını zaten aldıysan aşağıdaki bilgileri gönder. Şifre, özel anahtar veya API anahtarı istemiyoruz. Pro muadili alacaksan önceden uygunluğunu sor.', 'If you already purchased, submit the details below. We never ask for passwords, private keys or API keys. Ask about eligibility before buying a Pro equivalent.')));
      content.appendChild(box);
      field('breakoutEmail', t('Breakout kayıt e-postası', 'Breakout signup email'), 160, 'email').value = prior?.evidence?.email || current.email || '';
      field('accountId', t('Breakout hesap kimliği', 'Breakout account ID'), 100).value = prior?.evidence?.accountId || '';
      field('orderId', t('Sipariş / satın alım numarası', 'Order / purchase reference'), 100).value = prior?.evidence?.orderId || '';
      const label = el('label', t('Hesap türü', 'Account type')), type = el('select'); type.name = 'accountType';
      const classic = el('option', 'Classic'); classic.value = 'classic'; type.appendChild(classic);
      if (plan.id === 'personal' && route !== 'breakout100k') { const pro = el('option', t('Pro muadili · ayrıca incelenir', 'Pro equivalent · separate review')); pro.value = 'pro'; type.appendChild(pro); }
      label.appendChild(type); form.appendChild(label);
      check('firstPurchaseClaim', t('ALFA referansı ile ilk kayıt ve bu uygun ilk hesap alımını yaptığımı beyan ediyorum. Uygunluğum ayrıca incelenecek.', 'I declare first signup through ALFA and this qualifying first account purchase. Eligibility will be reviewed separately.'));
    }
    const note = field('note', t('Ek açıklama (isteğe bağlı)', 'Additional note (optional)'), 500); note.required = false;
    check('consent', t('Başvurumun incelenmesi ve bu başvuru hakkında iletişim için bilgilerimin işlenmesini kabul ediyorum.', 'I agree to processing my details to review and communicate about this application.'));
    check('acknowledgePending', t('TXID/hesap bilgisi göndermenin ödeme veya eğitim onayı olmadığını, manuel onay bekleyeceğimi biliyorum.', 'I understand submitting a TXID/account details is not payment or training approval; I will await manual review.'));
    const submit = el('button', cash ? t('Ödememi eğitim onayına gönder', 'Submit payment for training review') : t('Hesabımı eğitim onayına gönder', 'Submit account for training review'), 'btn solid');
    submit.type = 'submit'; form.appendChild(submit); content.appendChild(form);
    form.onsubmit = async event => {
      event.preventDefault(); if (!form.reportValidity() || submit.disabled || !valid()) return;
      const body = { op: 'submitPurchase', plan: plan.id, route, name: current.user_metadata?.name || '', consent: form.elements.consent.checked, acknowledgePending: form.elements.acknowledgePending.checked, note: form.elements.note.value };
      if (cash) body.txid = form.elements.txid.value.trim();
      else Object.assign(body, { breakoutEmail: form.elements.breakoutEmail.value, accountId: form.elements.accountId.value, orderId: form.elements.orderId.value, accountType: form.elements.accountType.value, firstPurchaseClaim: form.elements.firstPurchaseClaim.checked });
      submit.disabled = true; status.textContent = t('Bildirimin kaydediliyor…', 'Saving your notification…');
      try {
        const out = await api(body); if (!valid()) return;
        content.replaceChildren(el('p', t('Bildirimin yönetici paneline eklendi. Kontrol tamamlanana kadar onay bekle; bu bildirim erişimi otomatik açmaz.', 'Your notification is in the admin panel. Await review; submitting does not automatically unlock access.')));
        status.textContent = (out.status === 'already_verified'
          ? t('Alımın zaten onaylandı. Yeniden ödeme yapma. Başvuru: ', 'Your purchase is already approved. Do not pay again. Reference: ')
          : t('Bildirimin kaydedildi · Eğitim onayı bekliyor. Yeniden ödeme yapma. Başvuru: ', 'Notification saved · Awaiting training review. Do not pay again. Reference: ')) + out.reference;
      } catch (error) { if (valid()) { status.textContent = errors()[error.message] || t('Kayıt tamamlanamadı. Yeniden ödeme yapma; bilgilerini kontrol edip bildirimi tekrar dene.', 'Could not save. Do not pay again; check your details and retry submitting.'); submit.disabled = false; } }
    };
  }
  const question = el('a', t('Kafama takılan bir şey var · Soru sor ↗', 'I have a question ↗')); question.href = eduQuestionURL(plan.id, window.LANG); question.target = '_blank'; question.rel = 'noopener noreferrer'; node.appendChild(question);
  document.body.appendChild(node); node.showModal(); load();
}
document.addEventListener('click', event => {
  const trigger = event.target.closest?.('[data-edu-apply][data-edu-route]');
  if (!trigger) return;
  const plan = EDU_PLANS.find(plan => plan.id === trigger.dataset.eduApply), route = trigger.dataset.eduRoute;
  if (!plan || !['cash','breakout','breakout100k'].includes(route) || (route === 'breakout100k' && !plan.upgrade)) return;
  open(plan, route);
});
function context() {
  if (dialog && owner && user()?.id !== owner) {
    const stale = dialog; dialog = null; stale.close(); stale.remove(); pending = null;
  }
  if (pending && user()?.id) { const next = pending; pending = null; open(next.plan, next.route); }
}
new MutationObserver(context).observe(document.body, { attributes: true, attributeFilter: ['class','data-page'] });
window.AlfaEduCheckout = { refreshContext: context };
