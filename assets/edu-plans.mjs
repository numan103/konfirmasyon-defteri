import { EDU_PLANS, eduApplicationURL } from './edu-plans-model.mjs?v=2';
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
    actions.append(link(text('Paket seçimi için konuşalım ↗', 'Discuss your package ↗'), 'https://t.me/traderahmetd', 'btn solid'),
      link(text('Mevcut derslerime git →', 'Go to my existing courses →'), '?page=egitim'));
    copy.appendChild(actions);
    const art = el('figure', undefined, 'eduplans-art'), img = el('img');
    img.src = '/assets/edu-technical.jpg'; img.alt = text('Fiyat ve hacim grafikleri', 'Price and volume charts'); img.loading = 'lazy';
    art.append(img, el('figcaption', text('Fotoğraf temsilidir.', 'Illustrative photo.')));
    hero.append(copy, art); root.appendChild(hero);
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
      buttons.appendChild(link(text('$' + plan.usd + ' ile başvur ↗', 'Apply for $' + plan.usd + ' ↗'), eduApplicationURL(plan.id, 'cash', window.LANG), 'btn solid'));
      const breakout = link(text('İlk alım için Breakout linkini iste ↗', 'Request a first-purchase Breakout link ↗'), eduApplicationURL(plan.id, 'breakout', window.LANG));
      breakout.dataset.route = 'breakout'; buttons.appendChild(breakout);
      if (plan.upgrade) {
        const upgrade = link(text('100K ile 4 özel ders için başvur ↗', 'Apply for 4 private lessons with 100K ↗'), eduApplicationURL(plan.id, 'breakout100k', window.LANG));
        upgrade.dataset.route = 'breakout100k'; buttons.appendChild(upgrade);
      }
      buttons.querySelectorAll('a').forEach(anchor => {
        anchor.dataset.product = 'education'; anchor.dataset.plan = plan.id;
        if (!anchor.dataset.route) anchor.dataset.route = 'cash';
      });
      const apply = el('button', text('Talep bırak · Size ulaşalım', 'Leave an application · Contact me'), 'btn');
      apply.type = 'button'; apply.dataset.eduApply = plan.id; apply.dataset.anCta = 'education-application';
      apply.dataset.product = 'education'; apply.dataset.plan = plan.id; apply.dataset.route = 'undecided';
      buttons.appendChild(apply);
      card.appendChild(buttons); grid.appendChild(card);
    });
    root.appendChild(grid);
    const terms = el('div', undefined, 'eduplans-terms');
    const notes = [
      [text('01 · Video hakkın kalıcı', '01 · Your videos stay accessible'), text('Uygun eğitim ödemesi veya Breakout satın alımı doğrulandıktan sonra video hakkın ömür boyu sürer. Sonradan gruptan ayrılman bu hakkı kaldırmaz.', 'After a qualifying education payment or Breakout purchase is verified, your video access lasts for life. Leaving the group later does not remove that right.')],
      [text('02 · İkinci aydan itibaren grup', '02 · Group access from month two'), text('Grupta kalmak için bizim referansımızla OKX veya Bybit’e katılıp işlemlerini orada yapman gerekir. Devam uygunluğu doğrulanır. Bu şart kalıcı video hakkını etkilemez.', 'To stay in the group, join OKX or Bybit through our referral and carry out your trading there. Continuing eligibility is verified. This condition does not affect lifetime video access.')],
      [text('03 · Özel ders, gerçekten kişiye özel', '03 · Truly personal lessons'), text('İster sıfırdan başla ister deneyimli ol: strateji, risk yönetimi, psikoloji ve uygulamadaki ihtiyaçlarına göre plan hazırlanır. Her birebir görüşme öğrencinin durumuna göre 1,5–3 saattir. Funded değerlendirmesine hazırlıkta destek sağlanır; başarı veya kazanç garantisi verilmez.', 'Whether you are starting out or experienced, we tailor strategy, risk management, psychology and execution work to your needs. Each private session lasts 1.5–3 hours depending on the student. We support funded evaluation preparation, without guaranteeing success or profit.')],
      [text('04 · Başvuru ve doğrulama', '04 · Application and verification'), text('Breakout hakkı bizim linkimizden ilk kayıt ve uygun ilk hesap alımına bağlıdır. Hesap almadan önce referans linkini ve paket uygunluğunu teyit et; Pro muadili ayrıca onaylanır. Ödeme ve satın alım manuel doğrulandıktan sonra hakların tanımlanır. Birebir dersler ve ilk paket ders adetleri otomatik yenilenmez.', 'Breakout benefits require first-time signup through our link and a qualifying first account purchase. Confirm the referral link and eligibility before buying; Pro equivalents need separate approval. Benefits are assigned after payment or purchase is manually verified. Private lessons and initial package lesson allowances do not renew automatically.')],
    ];
    notes.forEach(([title, body]) => { const note = el('section', undefined, 'eduplans-term'); note.append(el('h2', title), el('p', body)); terms.appendChild(note); });
    root.append(terms, el('p', text('10K / 25K / 50K / 100K hesap büyüklüğüdür, hesap satın alma ücreti değildir. Eğitim ücretleri ile Breakout hesap ücretleri ayrı seçeneklerdir. Referanslı satın alımlardan komisyon kazanabiliriz. Prop değerlendirme ve ödeme kuralları ilgili firmaya aittir. Başvuru düğmeleri ödeme almaz veya otomatik erişim açmaz.', '10K / 25K / 50K / 100K describe account sizes, not purchase prices. Education fees and Breakout account fees are alternative routes. We may earn referral commissions. Prop evaluation and payout rules belong to the provider. Application buttons do not collect payment or automatically unlock access.'), 'eduplans-disclosure'));
  }
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  render();
}
