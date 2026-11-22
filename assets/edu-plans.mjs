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
      el('h1', text('Sadece izleme. Uygulamaya geç.', 'Don’t just watch. Put it into practice.')),
      el('p', text('Videoyla başla. Canlı eğitimle ilerle. İstersen birebir çalış.', 'Start with videos. Progress with live sessions. Go one-to-one if you choose.'), 'eduplans-lead'));
    const chips = el('div', undefined, 'eduplans-chips');
    [text('∞ Ömür boyu video', '∞ Lifetime videos'), text('◉ Canlı eğitim', '◉ Live training'), text('↗ Birebir odak', '↗ Personal focus')].forEach(label => chips.appendChild(el('span', label)));
    copy.appendChild(chips);
    const actions = el('div', undefined, 'eduplans-actions');
    const choose = el('button', text('Paketini seç · Katıl ↓', 'Choose your package · Join ↓'), 'btn solid');
    choose.type = 'button'; choose.onclick = () => root.querySelector('.eduplans-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    actions.append(choose, link(text('Sorum var ↗', 'I have a question ↗'), 'https://t.me/traderahmetd'),
      link(text('Mevcut derslerime git →', 'Go to my existing courses →'), '?page=egitim'));
    copy.appendChild(actions);
    const art = el('figure', undefined, 'eduplans-art'), img = el('img');
    img.src = '/assets/edu-apply-poster.webp?v=1';
    img.alt = text('ALFA EDU eğitim paketleri: sadece izleme değil uygulamaya geç; ömür boyu video, canlı eğitim ve birebir odak posterimi', 'ALFA EDU education packages: not just watching but practising; lifetime videos, live training and personal focus poster');
    img.loading = 'eager'; img.width = 1122; img.height = 1402;
    art.appendChild(img);
    hero.append(copy, art); root.appendChild(hero);
    const flow = el('section', undefined, 'eduplans-flow'); flow.setAttribute('aria-label', text('Üç adımda katıl', 'Join in three steps'));
    [[text('Paketini seç', 'Choose a package'), text('Video · Canlı · Birebir', 'Video · Live · Personal')],
      [text('Katılım yolunu seç', 'Choose how to join'), text('USDT / TRC20 veya Breakout', 'USDT / TRC20 or Breakout')],
      [text('Bilgini gönder', 'Submit your details'), text('Onayını siteden takip et', 'Track your review here')]].forEach(([title, body], i) => {
      const step = el('div'); step.append(el('b', '0' + (i + 1)), el('strong', title), el('span', body)); flow.appendChild(step);
    }); root.appendChild(flow);
    const partner = el('section', undefined, 'eduplans-partnership');
    partner.setAttribute('aria-label', text('Breakout partnerliği', 'Breakout partnership'));
    const poster = el('img');
    poster.src = '/assets/partners/breakout-trader-ahmet.jpg';
    poster.alt = text('Breakout × Trader Ahmet partnerlik duyurusu. Kod: ALFA. breakoutprop.com', 'Breakout × Trader Ahmet partnership announcement. Code: ALFA. breakoutprop.com');
    poster.width = 1280; poster.height = 720; poster.loading = 'lazy';
    const partnerCopy = el('div', undefined, 'eduplans-partnership-copy');
    partnerCopy.append(el('span', text('PARTNERLİK DUYURUSU', 'PARTNERSHIP ANNOUNCEMENT'), 'eduplans-kicker'),
      el('h2', 'Breakout × Trader Ahmet'),
      el('p', text('ALFA kodunu kullan. Aldığın hesabı yaz. Onayını bekle.', 'Use ALFA. Enter your purchased account. Await review.')));
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
      el('small', text('Classic, Pro, Turbo veya başka hesap: aldığını yazabilirsin. Referans/ilk alım ve eğitim uygunluğu manuel incelenir. Otomatik erişim açılmaz.', 'Classic, Pro, Turbo or another account: enter what you purchased. Referral/first-purchase and training eligibility are manually reviewed. No automatic access.')));
    partner.append(poster, partnerCopy);
    const intro = el('div', undefined, 'eduplans-intro');
    intro.append(el('h2', text('Üç paket. İhtiyacına göre eğitim.', 'Three packages. Training for your needs.')),
      el('p', text('Üst paket, önceki hakları da içerir. Videolar kalıcı; ders/grup hakları ilk dönem içindir.', 'Higher packages include previous benefits. Videos stay accessible; lessons/groups cover the initial period.')),
      el('p', text('Breakout fırsatları yalnızca bizim referansımızdan ilk kayıt ve uygun ilk hesap alımına özeldir. Başka hesap türünü yazabilirsin; uygunluğu onayda netleşir.', 'Breakout offers apply only to first-time signup through our referral and a qualifying first account purchase. You may enter other account types; eligibility is determined in review.'), 'eduplans-offer-note'));
    root.appendChild(intro);
    const grid = el('div', undefined, 'eduplans-grid');
    EDU_PLANS.forEach((plan, index) => {
      const card = el('article', undefined, 'eduplan' + (plan.id === 'personal' ? ' featured' : '')); card.dataset.plan = plan.id;
      const cover = el('div', undefined, 'eduplan-cover'), photo = el('img');
      photo.src = '/assets/' + { video: 'edu-technical.jpg', live: 'edu-fundamental.jpg', personal: 'edu-advanced.jpg' }[plan.id];
      photo.alt = text('Temsili eğitim ve grafik görseli', 'Illustrative training and chart photo'); photo.width = 960; photo.height = 540; photo.loading = 'lazy';
      cover.append(photo, el('span', [text('Kendi hızında', 'At your pace'), text('Birlikte ilerle', 'Progress together'), text('Sana özel', 'Made for you')][index])); card.appendChild(cover);
      card.append(el('span', '0' + (index + 1), 'eduplan-level'), el('h3', text(plan.name.tr, plan.name.en)),
        el('div', '$' + plan.usd, 'eduplan-price'),
        el('div', plan.id === 'video' ? text('Tek ödeme · kalıcı video hakkı', 'One-time · lifetime videos') : text('İlk aylık eğitim paketi', 'Initial monthly training package'), 'eduplan-period'),
        el('div', text('Breakout referans hesabı: ', 'Breakout reference account: ') + text(plan.account.tr, plan.account.en), 'eduplan-account'));
      const list = el('ul');
      const benefits = [text('Ömür boyu eğitim videoları', 'Lifetime training videos'), text('İlk ay grup erişimi', 'First month of group access')];
      if (plan.groupLessons) benefits.push(text('Haftalık canlı grup eğitimi · ilk ay 4 ders', 'Weekly live group training · 4 lessons in the first month'));
      if (plan.privateLessons) benefits.push(text(plan.privateLessons + ' adet birebir özel ders — toplam', plan.privateLessons + ' private one-to-one lessons — total'), text('Her özel ders 1,5–3 saat', 'Each private lesson lasts 1.5–3 hours'));
      benefits.forEach(benefit => list.appendChild(el('li', benefit)));
      card.appendChild(list);
      if (plan.groupLessons) {
        const liveDetails = el('details', undefined, 'eduplan-live-details');
        liveDetails.append(el('summary', text('Canlıda neler var?', 'What’s covered live?')), el('p', text('Canlı konu anlatımı, market analizi, işlem değerlendirme ve soru-cevap.', 'Live teaching, market analysis, trade reviews and Q&A.'))); card.appendChild(liveDetails);
      }
      if (index) card.appendChild(el('small', text('Önceki paketlerin tüm hakları dahil.', 'Includes all previous package benefits.')));
      if (plan.upgrade) {
        const upgrade = el('div', undefined, 'eduplan-upgrade');
        upgrade.append(el('strong', text('100K Classic ilk alımında: 4 özel ders', '100K Classic first purchase: 4 private lessons')),
          el('p', text('Aynı pakette özel ders hakkın 2 yerine toplam 4 olur. Ek bir paket değil.', 'In the same package, your allowance increases from 2 to 4 total. Not a separate package.')));
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
    root.append(grid, el('p', text('Aldığın hesap farklı mı? Pro / Turbo / 1 Step dahil, gerçek hesap adını forma yaz. Eğitim paketi ve ders hakkı otomatik değişmez; uygunluğu inceleriz.', 'Purchased a different account? Enter the actual name, including Pro / Turbo / 1 Step. Training package and lesson allowances do not change automatically; eligibility is reviewed.'), 'eduplans-account-help'), partner);
    root.appendChild(el('h2', text('Merak edilenler · Kısa cevaplar', 'Quick answers'), 'eduplans-faq-title'));
    const terms = el('div', undefined, 'eduplans-terms');
    const notes = [
      [text('01 · Video hakkın kalıcı', '01 · Your videos stay accessible'), text('Uygun eğitim ödemesi veya Breakout satın alımı doğrulandıktan sonra video hakkın ömür boyu sürer. Sonradan gruptan ayrılman bu hakkı kaldırmaz.', 'After a qualifying education payment or Breakout purchase is verified, your video access lasts for life. Leaving the group later does not remove that right.')],
      [text('02 · İkinci aydan itibaren grup', '02 · Group access from month two'), text('Grupta kalmak için bizim referansımızla OKX veya Bybit’e katılıp işlemlerini orada yapman gerekir. Devam uygunluğu doğrulanır. Bu şart kalıcı video hakkını etkilemez.', 'To stay in the group, join OKX or Bybit through our referral and carry out your trading there. Continuing eligibility is verified. This condition does not affect lifetime video access.')],
      [text('03 · Özel ders, gerçekten kişiye özel', '03 · Truly personal lessons'), text('İster sıfırdan başla ister deneyimli ol: strateji, risk yönetimi, psikoloji ve uygulamadaki ihtiyaçlarına göre plan hazırlanır. Her birebir görüşme öğrencinin durumuna göre 1,5–3 saattir. Funded değerlendirmesine hazırlıkta destek sağlanır; başarı veya kazanç garantisi verilmez.', 'Whether you are starting out or experienced, we tailor strategy, risk management, psychology and execution work to your needs. Each private session lasts 1.5–3 hours depending on the student. We support funded evaluation preparation, without guaranteeing success or profit.')],
      [text('04 · Öde / hesabını al → Bildir → Onay bekle', '04 · Pay / buy an account → Submit → Await review'), text('TRC20 yolunda ekrandaki sabit USDT tutarını gönderip TXID’ni bildir. Breakout yolunda ALFA referansı ile ilk kayıt/alım bilgilerini ve aldığın hesabın tam adını gönder. Classic dışındaki hesapların eğitim uygunluğu ayrıca onaylanır. Bildirimler manuel incelenir; form göndermek ödeme veya erişim onayı değildir. Soru sormak isteğe bağlıdır. Birebir dersler ve ilk paket ders adetleri otomatik yenilenmez.', 'For TRC20, send the displayed fixed USDT amount and submit your TXID. For Breakout, submit first signup/purchase details through ALFA and the exact account name. Non-Classic account eligibility needs separate approval. Submissions are manually reviewed, not payment or access approval. Questions are optional. Private lessons and initial package lesson allowances do not renew automatically.')],
    ];
    notes.forEach(([title, body]) => { const note = el('details', undefined, 'eduplans-term'); note.append(el('summary', title), el('p', body)); terms.appendChild(note); });
    root.append(terms, el('p', text('10K / 25K / 50K / 100K hesap büyüklüğüdür, hesap satın alma ücreti değildir. Eğitim ücretleri ile Breakout hesap ücretleri ayrı seçeneklerdir. Referanslı satın alımlardan komisyon kazanabiliriz. Prop değerlendirme ve ödeme kuralları ilgili firmaya aittir. Başvuru düğmeleri ödeme almaz veya otomatik erişim açmaz.', '10K / 25K / 50K / 100K describe account sizes, not purchase prices. Education fees and Breakout account fees are alternative routes. We may earn referral commissions. Prop evaluation and payout rules belong to the provider. Application buttons do not collect payment or automatically unlock access.'), 'eduplans-disclosure'));
    // Partner şeridi bu sayfadan kaldırıldı; assets/site-partners.mjs onu
    // artık tüm sayfaların en altına ortak olarak ekliyor.
  }
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  render();
}
