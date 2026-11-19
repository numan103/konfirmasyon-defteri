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
  invalid_account_description: t('Aldığın hesabı yaz. Örn. 25K · 1 Step Turbo (3–160 karakter).', 'Describe the purchased account, e.g. 25K · 1 Step Turbo (3–160 characters).'),
  slow_down: t('Kısa süre önce bildirim gönderdin. Biraz sonra tekrar dene.', 'You recently submitted a notification. Please retry shortly.'),
  login_required: t('Bildirim için site hesabına giriş yap.', 'Sign in to submit your notification.'),
  unauthorized: t('Oturumunu yenileyip tekrar dene.', 'Refresh your session and retry.'),
});
function open(plan, route) {
  dialog?.close();
  const current = user();
  const node = el('dialog', undefined, 'edu-application edu-checkout'); dialog = node; owner = current?.id || '';
  node.setAttribute('aria-label', t('Eğitim katılımı', 'Training enrollment'));
  const close = button(t('Kapat', 'Close'), () => { pending = null; node.close(); });
  close.className = 'edu-checkout-close'; close.setAttribute('aria-label', t('Kapat', 'Close'));
  close.textContent = '×';
  const header = el('header', undefined, 'edu-checkout-header'), heading = el('div');
  heading.append(el('span', 'ALFA EDU · ' + t('KATILIM', 'ENROLLMENT'), 'eduplans-kicker'), el('h2', plan.name[window.LANG === 'en' ? 'en' : 'tr']));
  header.append(heading, close); node.appendChild(header);
  const tabs = el('div', undefined, 'edu-checkout-tabs'); tabs.setAttribute('aria-label', t('Katılım yolu', 'Enrollment route'));
  for (const [label, next] of [['USDT · TRC20','cash'],['Breakout',route === 'breakout100k' ? route : 'breakout']]) {
    const tab = button(label, () => { if (next !== route) open(plan, next); }); tab.setAttribute('aria-pressed', String(next === route)); tabs.appendChild(tab);
  }
  header.appendChild(tabs);
  const scroll = el('div', undefined, 'edu-checkout-scroll'); node.appendChild(scroll);
  const footer = el('footer', undefined, 'edu-checkout-footer');
  const question = el('a', t('Sorum var ↗', 'I have a question ↗')); question.href = eduQuestionURL(plan.id, window.LANG); question.target = '_blank'; question.rel = 'noopener noreferrer';
  footer.append(el('span', t('🔒 Bilgilerin özel · Manuel onay', '🔒 Private details · Manual review')), question); node.appendChild(footer);
  node.addEventListener('cancel', () => { pending = null; });
  node.addEventListener('close', () => { if (dialog === node) dialog = null; node.remove(); });
  if (!current) {
    pending = { plan, route };
    const art = el('img'); art.src = '/assets/edu-execution.jpg'; art.alt = t('Temsili eğitim ve grafik çalışması', 'Illustrative training and chart study'); art.className = 'edu-checkout-login-art';
    scroll.append(art, el('h3', t('Önce hesabına giriş yap', 'Sign in first')), el('p', t('Katılmak ve başvurunu takip etmek için. Henüz ödeme yapma.', 'To enroll and track your application. Do not pay yet.')),
      button(t('Giriş yap / Ücretsiz kaydol', 'Sign in / Register free'), () => {
        node.close(); document.getElementById('auth-gate')?.classList.add('open');
      }, 'btn solid'));
    document.body.appendChild(node); node.showModal(); return;
  }
  pending = null;
  const status = el('p', t('Başvuru durumun kontrol ediliyor…', 'Checking your application status…')); status.setAttribute('role', 'status');
  status.className = 'edu-checkout-status';
  const content = el('div'); scroll.append(status, content);
  const valid = () => node.isConnected && dialog === node && user()?.id === current.id;
  async function load() {
    content.replaceChildren();
    try {
      const out = await api();
      if (!valid()) return;
      if (!Array.isArray(out.applications)) throw new Error('invalid_response');
      const prior = out.applications.find(item => item.plan === plan.id && item.route === route);
      const other = out.applications.find(item => item.plan === plan.id && item.route !== route && (item.reviewPending || item.stage === 'verified'));
      if (!prior && other) {
        status.textContent = t('Bu paket için zaten bir bildirimin var.', 'You already have a notification for this package.');
        content.append(el('p', t('Tekrar ödeme yapma. Mevcut başvurunun durumunu kontrol et.', 'Do not pay again. Check your existing application.')),
          button(t('Başvurumu göster →', 'View my application →'), () => open(plan, other.route), 'btn solid'));
        return;
      }
      if (prior) {
        const label = prior.reviewPending ? t('Onay bekliyor', 'Awaiting review') : { applied: t('Onay bekliyor', 'Awaiting review'), verified: t('Alım onaylandı', 'Purchase approved'), declined: t('Uygun bulunmadı', 'Declined'), cancelled: t('İptal', 'Cancelled'), interested: t('İnceleme bekliyor', 'Awaiting review') }[prior.stage] || prior.stage;
        status.textContent = label + ' · ' + prior.reference;
        content.append(el('div', '◷', 'edu-checkout-state-icon'), el('h3', t('Başvurun burada, güvende.', 'Your application is here.')), el('p', t('Yeniden ödeme yapma. Alımın incelenir; eğitim hakların onaydan sonra tanımlanır.', 'Do not pay again. Your purchase is reviewed; training rights are assigned after approval.')));
        if (prior.stage !== 'verified') content.appendChild(button(t('Bilgimi düzelt / Yeni belge bilgisi gönder', 'Correct my details / Submit new evidence'), () => buildForm(prior)));
      } else { status.textContent = ''; buildForm(); }
    } catch {
      if (valid()) { status.textContent = t('Durumun alınamadı. Tekrar ödeme yapmadan önce yeniden kontrol et.', 'Could not load your status. Check again before making another payment.'); content.appendChild(button(t('Yeniden kontrol et', 'Check again'), load)); }
    }
  }
  function buildForm(prior) {
    content.replaceChildren();
    const cash = route === 'cash', account = route === 'breakout100k' ? '100K Classic' : { video: '10K Classic', live: '25K Classic', personal: '50K Classic' }[plan.id];
    const steps = el('ol', undefined, 'edu-checkout-steps');
    [cash ? t('Öde', 'Pay') : t('Hesabını al', 'Buy an account'), t('Bilgilerini gönder', 'Submit details'), t('Onay bekle', 'Await review')].forEach((label, i) => { const step = el('li'); step.append(el('b', String(i + 1)), el('span', label)); steps.appendChild(step); });
    content.appendChild(steps);
    const layout = el('div', undefined, 'edu-checkout-layout'); content.appendChild(layout);
    const form = el('form'); form.className = 'edu-checkout-form';
    function field(name, label, max, type = 'text') {
      const wrap = el('label', label), input = el('input'); input.name = name; input.type = type; input.maxLength = max; input.required = true;
      wrap.appendChild(input); form.appendChild(wrap); return input;
    }
    function check(name, label) {
      const wrap = el('label', undefined, 'edu-consent'), input = el('input'); input.name = name; input.type = 'checkbox'; input.required = true;
      wrap.append(input, el('span', label)); form.appendChild(wrap); return input;
    }
    if (prior) content.prepend(el('p', t('Bilgilerini düzelt; yeniden ödeme yapma.', 'Correct your details; do not pay again.'), 'edu-checkout-warning'));
    if (cash) {
      const box = el('div', undefined, 'edu-checkout-payment');
      box.append(el('span', t('ÖDENECEK TUTAR', 'AMOUNT TO SEND'), 'eduplans-kicker'), el('strong', plan.usd + ' USDT'), el('p', 'USDT · TRON (TRC20)'),
        el('code', EDU_PAYMENT.address));
      const copied = el('p'); copied.setAttribute('role', 'status');
      box.append(button(t('Adresi kopyala', 'Copy address'), async () => {
        try { await navigator.clipboard.writeText(EDU_PAYMENT.address); copied.textContent = t('Adres kopyalandı.', 'Address copied.'); }
        catch { copied.textContent = t('Kopyalanamadı; adresi elle kopyala.', 'Could not copy; copy the address manually.'); }
      }), copied, el('p', t('⚠ Yalnız USDT / TRC20. Ağ ücretini ayrıca karşıla; tam tutar ulaşmalı.', '⚠ USDT / TRC20 only. Cover network fees separately; send the full amount.'), 'edu-checkout-warning'));
      layout.appendChild(box);
      const txid = field('txid', t('Ödeme sonrası TXID (64 karakter)', 'TXID after payment (64 characters)'), 64);
      txid.pattern = '[A-Fa-f0-9]{64}'; txid.minLength = 64; txid.spellcheck = false; txid.autocomplete = 'off';
      txid.value = prior?.evidence?.txid || '';
    } else {
      const box = el('div', undefined, 'edu-checkout-payment');
      const poster = el('img'); poster.src = '/assets/partners/breakout-trader-ahmet.jpg'; poster.alt = 'Breakout × Trader Ahmet · ALFA'; poster.className = 'edu-checkout-partner-art'; box.appendChild(poster);
      const buy = el('a', t('Breakout’tan hesap al ↗', 'Buy an account on Breakout ↗'), 'btn solid');
      buy.href = 'https://www.breakoutprop.com/'; buy.target = '_blank'; buy.rel = 'noopener noreferrer';
      box.append(el('strong', t('Kodun: ALFA', 'Your code: ALFA')), buy,
        el('p', t('Classic, Pro, Turbo veya başka bir hesap: aldığını forma yaz.', 'Classic, Pro, Turbo or another account: enter what you purchased.')),
        el('small', t('Paket referansı: ', 'Package reference: ') + account + t(' · Farklı hesapların uygunluğu manuel incelenir.', ' · Other accounts require eligibility review.')));
      layout.appendChild(box);
      const description = field('accountDescription', t('Aldığın hesap', 'Account you purchased'), 160);
      description.placeholder = t('Örn. 25K · 1 Step Pro / Turbo', 'e.g. 25K · 1 Step Pro / Turbo');
      description.minLength = 3;
      description.value = prior?.evidence?.accountDescription || '';
      const presets = el('div', undefined, 'edu-account-presets');
      for (const value of ['25K · 1 Step Pro', '25K · 1 Step Turbo', '50K Classic']) {
        const preset = button(value, () => { description.value = value; description.dispatchEvent(new Event('input')); description.focus(); });
        preset.setAttribute('aria-pressed', String(description.value === value)); presets.appendChild(preset);
      }
      description.oninput = () => [...presets.children].forEach(node => node.setAttribute('aria-pressed', String(description.value === node.textContent)));
      const nameLabel = description.parentNode, nameGroup = el('div', undefined, 'edu-account-name');
      nameLabel.replaceWith(nameGroup); nameGroup.append(nameLabel, presets);
      field('breakoutEmail', t('Breakout kayıt e-postası', 'Breakout signup email'), 160, 'email').value = prior?.evidence?.email || current.email || '';
      field('accountId', t('Breakout hesap kimliği', 'Breakout account ID'), 100).value = prior?.evidence?.accountId || '';
      field('orderId', t('Sipariş / satın alım numarası', 'Order / purchase reference'), 100).value = prior?.evidence?.orderId || '';
      const refs = el('div', undefined, 'edu-checkout-refs'); refs.append(form.elements.accountId.parentNode, form.elements.orderId.parentNode); form.appendChild(refs);
      check('firstPurchaseClaim', t('ALFA ile ilk kayıt ve ilk alım yaptığımı beyan ediyorum.', 'I declare first signup and first purchase through ALFA.'));
    }
    const note = field('note', t('Ek açıklama (isteğe bağlı)', 'Additional note (optional)'), 500); note.required = false;
    const extra = el('details', undefined, 'edu-checkout-extra'); extra.append(el('summary', t('＋ Not ekle', '＋ Add a note')), note.parentNode); form.appendChild(extra);
    check('consent', t('Başvuru incelemesi ve iletişim için veri işlenmesini kabul ediyorum.', 'I agree to data processing for application review and contact.'));
    check('acknowledgePending', t('Bildirim otomatik onay değildir; incelemeyi bekleyeceğim.', 'Submitting is not automatic approval; I will await review.'));
    const submit = el('button', t('Onaya gönder →', 'Submit for review →'), 'btn solid');
    submit.type = 'submit'; form.appendChild(submit); layout.appendChild(form);
    content.appendChild(el('p', t('Şifre / API anahtarı istemiyoruz. Eğitim uygunluğu ve ödeme ayrıca kontrol edilir.', 'We never ask for passwords / API keys. Training eligibility and payment are checked separately.'), 'edu-checkout-safety'));
    form.onsubmit = async event => {
      event.preventDefault(); if (!form.reportValidity() || submit.disabled || !valid()) return;
      const body = { op: 'submitPurchase', plan: plan.id, route, name: current.user_metadata?.name || '', consent: form.elements.consent.checked, acknowledgePending: form.elements.acknowledgePending.checked, note: form.elements.note.value };
      if (cash) body.txid = form.elements.txid.value.trim();
      else Object.assign(body, { breakoutEmail: form.elements.breakoutEmail.value, accountId: form.elements.accountId.value, orderId: form.elements.orderId.value, accountType: 'custom', accountDescription: form.elements.accountDescription.value, firstPurchaseClaim: form.elements.firstPurchaseClaim.checked });
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
