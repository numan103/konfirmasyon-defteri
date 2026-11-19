import { EDU_PLANS, eduQuestionURL } from './edu-plans-model.mjs?v=4';
const root = document.getElementById('eduplans-root');
if (root) {
  const text = (tr, en) => window.LANG === 'en' ? en : tr;
  const el = (tag, content, cls) => {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    if (cls) node.className = cls;
    return node;
  };
  function link(label, href, cls = 'btn') {
    const node = el('a', label, cls); node.href = href;
    if (href.startsWith('https://')) { node.target = '_blank'; node.rel = 'noopener noreferrer'; }
    else node.onclick = event => {
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); window.showPage('egitim');
    };
    return node;
  }
  function render() {
    root.replaceChildren();
    const hero = el('section', undefined, 'eduplans-hero'), copy = el('div');
    copy.append(el('span', 'ALFA EDU · ' + text('EĞİTİM PAKETLERİ', 'EDUCATION PACKAGES'), 'eduplans-kicker'),
      el('h1', text('İzlemekten uygulamaya. Sana uygun eğitim.', 'From watching to practice. Training that fits you.')),
      el('p', text('Kendi hızında video eğitim, birlikte canlı piyasa değerlendirmeleri veya tamamen sana özel birebir çalışma. Nerede olduğunu birlikte belirleyip bir sonraki adıma odaklanıyoruz.', 'Self-paced videos, shared live market reviews or fully personal one-to-one work. We assess where you are and focus on your next step.'), 'eduplans-lead'));
    const actions = el('div', undefined, 'eduplans-actions');
    const choose = el('button', text('Paketini seç · Katıl ↓', 'Choose your package · Join ↓'), 'btn solid');
    choose.type = 'button'; choose.onclick = () => root.querySelector('.eduplans-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    actions.append(choose, link(text('Sorum var ↗', 'I have a question ↗'), 'https://t.me/traderahmetd'),
      link(text('Mevcut derslerime git →', 'Go to my existing courses →'), '?page=egitim'));
    copy.appendChild(actions);
    const art = el('figure', undefined, 'eduplans-art'), img = el('img');
    img.src = '/assets/edu-technical.jpg'; img.alt = text('Fiyat ve hacim grafikleri', 'Price and volume charts'); img.loading = 'lazy';
    art.append(img, el('figcaption', text('Fotoğraf temsilidir.', 'Illustrative photo.')));
    hero.append(copy, art); root.appendChild(hero);
    const partner = el('section', undefined, 'eduplans-partnership');
    partner.setAttribute('aria-label', text('Breakout partnerliği', 'Breakout partnership'));
    const poster = el('img');
    poster.src = '/assets/partners/breakout-trader-ahmet.jpg';
    poster.alt = text('Breakout × Trader Ahmet partnerlik duyurusu. Kod: ALFA. breakoutprop.com', 'Breakout × Trader Ahmet partnership announcement. Code: ALFA. breakoutprop.com');
    poster.width = 1280; poster.height = 720; poster.loading = 'lazy';
    const partnerCopy = el('div', undefined, 'eduplans-partnership-copy');
    partnerCopy.append(el('span', text('PARTNERLİK DUYURUSU', 'PARTNERSHIP ANNOUNCEMENT'), 'eduplans-kicker'),
      el('h2', 'Breakout × Trader Ahmet'),
      el('p', text('Breakout partner kodumuz hazır. Uygun ilk hesap alımında eğitim paketini birlikte planlayalım.', 'Our Breakout partner code is here. Let’s plan your training package with a qualifying first account purchase.')));
    const codeRow = el('div', undefined, 'eduplans-code');
    const code = el('code', 'ALFA'), copyCode = el('button', text('Kodu kopyala', 'Copy code'), 'btn');
    copyCode.type = 'button';
    const copyStatus = el('span', '', 'eduplans-copy-status'); copyStatus.setAttribute('role', 'status');
    copyCode.onclick = async () => {
      try {
        await navigator.clipboard.writeText('ALFA');
        copyStatus.textContent = text('Kopyalandı', 'Copied');
      } catch {
        copyStatus.textContent = text('Kopyalanamadı; ALFA kodunu elle kopyala.', 'Could not copy; copy ALFA manually.');
      }
    };
    codeRow.append(el('span', text('Partner kodu', 'Partner code')), code, copyCode);
    partnerCopy.append(codeRow, copyStatus,
      link(text('Breakout’u ziyaret et ↗', 'Visit Breakout ↗'), 'https://www.breakoutprop.com/', 'btn solid'),
      el('small', text('ALFA koduyla ilk kaydını ve uygun Classic hesap alımını yap; ardından hesap/sipariş bilgilerini siteden doğrulamaya gönder. Pro muadili ayrıca onay gerektirir. Kod otomatik erişim açmaz.', 'Use ALFA for first-time signup and a qualifying Classic account purchase, then submit account/order details here. Pro equivalents require separate approval. The code does not automatically unlock access.')));
    partner.append(poster, partnerCopy); root.appendChild(partner);
    const intro = el('div', undefined, 'eduplans-intro');
    intro.append(el('h2', text('Üç paket. İhtiyacına göre eğitim.', 'Three packages. Training for your needs.')),
      el('p', text('Her üst paket önceki paketlerin tamamını içerir. Ders ve grup hakları ilk aylık döneme aittir; videolar ömür boyu açık kalır.', 'Each higher package includes all previous package benefits. Lesson and group allowances apply to the first monthly period; video access lasts for life.')),
      el('p', text('Breakout fırsatları yalnızca bizim referansımızdan ilk kayıt ve uygun ilk hesap alımına özeldir. Mevcut hesaplara veya sonraki alımlara otomatik uygulanmaz.', 'Breakout offers apply only to first-time signup through our referral and a qualifying first account purchase. They do not automatically apply to existing accounts or subsequent purchases.'), 'eduplans-offer-note'));
    root.appendChild(intro);
    const grid = el('div', undefined, 'eduplans-grid');
    EDU_PLANS.forEach((plan, index) => {
      const card = el('article', undefined, 'eduplan' + (plan.id === 'personal' ? ' featured' : '')); card.dataset.plan = plan.id;
      card.append(el('span', '0' + (index + 1), 'eduplan-level'), el('h3', text(plan.name.tr, plan.name.en)),
        el('div', '$' + plan.usd, 'eduplan-price'),
        el('div', plan.id === 'video' ? text('Tek ödeme · kalıcı video hakkı', 'One-time · lifetime videos') : text('İlk aylık eğitim paketi', 'Initial monthly training package'), 'eduplan-period'),
        el('div', text('veya Breakout ilk alım: ', 'or Breakout first purchase: ') + text(plan.account.tr, plan.account.en), 'eduplan-account'));
      const list = el('ul');
      const benefits = [text('Ömür boyu eğitim videoları', 'Lifetime training videos'), text('İlk ay grup erişimi', 'First month of group access')];
      if (plan.groupLessons) benefits.push(text('Haftalık canlı grup eğitimi · ilk ay 4 ders', 'Weekly live group training · 4 lessons in the first month'), text('Canlı konu anlatımı, market analizi, işlem değerlendirme ve soru-cevap', 'Live teaching, market analysis, trade reviews and Q&A'));
      if (plan.privateLessons) benefits.push(text(plan.privateLessons + ' adet birebir özel ders — toplam', plan.privateLessons + ' private one-to-one lessons — total'), text('Her özel ders 1,5–3 saat', 'Each private lesson lasts 1.5–3 hours'), text('Seviyene ve yaşadığın sorunlara özel plan', 'A plan tailored to your level and difficulties'));
      benefits.forEach(benefit => list.appendChild(el('li', benefit)));
      card.appendChild(list);
      if (index) card.appendChild(el('small', text('Önceki paketlerin tüm hakları dahil.', 'Includes all previous package benefits.')));
      if (plan.upgrade) {
        const upgrade = el('div', undefined, 'eduplan-upgrade');
        upgrade.append(el('strong', text('100K Classic ilk alımında: 4 özel ders', '100K Classic first purchase: 4 private lessons')),
          el('p', text('Aynı Personal Coaching paketi. Özel ders hakkın 2 yerine toplam 4 olur; videolar, grup erişimi ve haftalık canlı eğitim de dahildir. Dersler senin ihtiyacına ve çalışmak istediğin konulara göre planlanır.', 'The same Personal Coaching package. Your private allowance increases from 2 to 4 total; videos, group access and weekly live training remain included. Lessons are tailored to your needs and the topics you want to work on.')));
        card.appendChild(upgrade);
      }
      const buttons = el('div', undefined, 'eduplan-buttons');
      function checkout(label, route, solid = false) {
        const button = el('button', label, 'btn' + (solid ? ' solid' : '')); button.type = 'button';
        button.dataset.eduApply = plan.id; button.dataset.eduRoute = route; button.dataset.anCta = 'education-checkout';
        button.dataset.product = 'education'; button.dataset.plan = plan.id; button.dataset.route = route;
        return button;
      }
      buttons.append(checkout(text(plan.usd + ' USDT · TRC20 ile katıl', plan.usd + ' USDT · Join via TRC20'), 'cash', true),
        checkout(text('Breakout hesabıyla katıl', 'Join with a Breakout account'), 'breakout'));
      if (plan.upgrade) {
        buttons.appendChild(checkout(text('100K alımını bildir · 4 özel ders', 'Submit 100K purchase · 4 private lessons'), 'breakout100k'));
      }
      const question = link(text('Sorum var ↗', 'I have a question ↗'), eduQuestionURL(plan.id, window.LANG));
      question.dataset.product = 'education'; question.dataset.plan = plan.id; question.dataset.route = 'undecided'; buttons.appendChild(question);
      card.appendChild(buttons); grid.appendChild(card);
    });
    root.appendChild(grid);
    const terms = el('div', undefined, 'eduplans-terms');
    const notes = [
      [text('01 · Video hakkın kalıcı', '01 · Your videos stay accessible'), text('Uygun eğitim ödemesi veya Breakout satın alımı doğrulandıktan sonra video hakkın ömür boyu sürer. Sonradan gruptan ayrılman bu hakkı kaldırmaz.', 'After a qualifying education payment or Breakout purchase is verified, your video access lasts for life. Leaving the group later does not remove that right.')],
      [text('02 · İkinci aydan itibaren grup', '02 · Group access from month two'), text('Grupta kalmak için bizim referansımızla OKX veya Bybit’e katılıp işlemlerini orada yapman gerekir. Devam uygunluğu doğrulanır. Bu şart kalıcı video hakkını etkilemez.', 'To stay in the group, join OKX or Bybit through our referral and carry out your trading there. Continuing eligibility is verified. This condition does not affect lifetime video access.')],
      [text('03 · Özel ders, gerçekten kişiye özel', '03 · Truly personal lessons'), text('İster sıfırdan başla ister deneyimli ol: strateji, risk yönetimi, psikoloji ve uygulamadaki ihtiyaçlarına göre plan hazırlanır. Her birebir görüşme öğrencinin durumuna göre 1,5–3 saattir. Funded değerlendirmesine hazırlıkta destek sağlanır; başarı veya kazanç garantisi verilmez.', 'Whether you are starting out or experienced, we tailor strategy, risk management, psychology and execution work to your needs. Each private session lasts 1.5–3 hours depending on the student. We support funded evaluation preparation, without guaranteeing success or profit.')],
      [text('04 · Öde / hesabını al → Bildir → Onay bekle', '04 · Pay / buy an account → Submit → Await review'), text('TRC20 yolunda ekrandaki sabit USDT tutarını gönderip TXID’ni bildir. Breakout yolunda ALFA koduyla ilk kayıt ve uygun ilk Classic hesap alımını tamamlayıp hesap/sipariş bilgilerini gönder. Pro muadili ayrıca onaylanır. Bildirimler manuel incelenir; form göndermek ödeme veya erişim onayı değildir. Soru sormak isteğe bağlıdır. Birebir dersler ve ilk paket ders adetleri otomatik yenilenmez.', 'For TRC20, send the displayed fixed USDT amount and submit your TXID. For Breakout, use ALFA for first-time signup and a qualifying first Classic account purchase, then submit account/order details. Pro equivalents need separate approval. Submissions are manually reviewed, not payment or access approval. Questions are optional. Private lessons and initial package lesson allowances do not renew automatically.')],
    ];
    notes.forEach(([title, body]) => { const note = el('section', undefined, 'eduplans-term'); note.append(el('h2', title), el('p', body)); terms.appendChild(note); });
    root.append(terms, el('p', text('10K / 25K / 50K / 100K hesap büyüklüğüdür, hesap satın alma ücreti değildir. Eğitim ücretleri ile Breakout hesap ücretleri ayrı seçeneklerdir. Referanslı satın alımlardan komisyon kazanabiliriz. Prop değerlendirme ve ödeme kuralları ilgili firmaya aittir. Başvuru düğmeleri ödeme almaz veya otomatik erişim açmaz.', '10K / 25K / 50K / 100K describe account sizes, not purchase prices. Education fees and Breakout account fees are alternative routes. We may earn referral commissions. Prop evaluation and payout rules belong to the provider. Application buttons do not collect payment or automatically unlock access.'), 'eduplans-disclosure'));
    const partners = el('section', undefined, 'edu-partners');
    partners.setAttribute('aria-label', text('Partnerler', 'Partners'));
    const partnerHead = el('div', undefined, 'edu-partners-head');
    const pause = el('button', text('Akışı duraklat', 'Pause animation'), 'btn');
    pause.type = 'button'; pause.setAttribute('aria-pressed', 'false');
    pause.onclick = () => {
      const paused = partners.classList.toggle('is-paused');
      pause.setAttribute('aria-pressed', String(paused));
      pause.textContent = paused ? text('Akışı sürdür', 'Resume animation') : text('Akışı duraklat', 'Pause animation');
    };
    partnerHead.append(el('h2', text('Partnerler', 'Partners')), pause);
    const viewport = el('div', undefined, 'edu-partners-viewport'), track = el('div', undefined, 'edu-partners-track');
    const brands = [
      ['OKX', 'okx.svg', 'https://www.okx.com/join/CRYPTOAHMET', 'okx'],
      ['Bybit', 'bybit.svg', 'https://partner.bybit.com/b/cryptoahmet', 'bybit'],
      ['Breakout', 'breakout.svg', 'https://www.breakoutprop.com/', 'breakout'],
    ];
    for (let groupIndex = 0; groupIndex < 2; groupIndex++) {
      const group = el('div', undefined, 'edu-partners-group');
      if (groupIndex) group.setAttribute('aria-hidden', 'true');
      for (let repeat = 0; repeat < 2; repeat++) brands.forEach(([name, asset, url, brand]) => {
        const accessible = groupIndex === 0 && repeat === 0;
        const item = accessible ? link('', url, 'edu-partner-logo ' + brand) : el('span', undefined, 'edu-partner-logo ' + brand);
        if (!accessible) item.setAttribute('aria-hidden', 'true');
        const logo = el('img'); logo.src = '/assets/partners/' + asset; logo.alt = accessible ? name : '';
        logo.width = 150; logo.height = 48; logo.loading = 'lazy';
        item.appendChild(logo); group.appendChild(item);
      });
      track.appendChild(group);
    }
    viewport.appendChild(track); partners.append(partnerHead, viewport,
      el('p', text('Partner bağlantıları referans içerir; uygun işlemlerden komisyon kazanabiliriz.', 'Partner links include referrals; we may earn commissions from qualifying activity.')));
    root.appendChild(partners);
  }
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  render();
}
