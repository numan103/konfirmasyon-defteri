/* Alfa Traders — Partner şeridi.
   Eğitim paketleri sayfasının altındaki partner logoları artık tüm sayfaların
   en altında görünür. OKX / Bybit linkleri sunucudan gelen referans
   linklerini (SITE.links) kullanır; Breakout ALFA koduyla resmi siteye gider. */

const DEFAULT_LINKS = {
  okx: 'https://www.okx.com/join/CRYPTOAHMET',
  bybit: 'https://partner.bybit.com/b/cryptoahmet',
  breakout: 'https://www.breakoutprop.com/'
};

const BRANDS = [
  ['OKX', 'okx.svg', 'okx', 'okx'],
  ['Bybit', 'bybit.svg', 'bybit', 'bybit'],
  ['Breakout', 'breakout.svg', 'breakout', 'breakout']
];

const created = {};

function text(tr, en) { return window.LANG === 'en' ? en : tr; }

function el(tag, content, cls) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (cls) node.className = cls;
  return node;
}

function partnerLinks() {
  const configured = (window.SITE && window.SITE.links) || {};
  return {
    okx: configured.okx || DEFAULT_LINKS.okx,
    bybit: configured.bybit || DEFAULT_LINKS.bybit,
    breakout: DEFAULT_LINKS.breakout
  };
}

function syncLinks() {
  const links = partnerLinks();
  for (const anchor of created.links || []) {
    anchor.href = links[anchor.dataset.partner] || DEFAULT_LINKS[anchor.dataset.partner];
  }
}

function syncLang() {
  if (!created.title) return;
  const paused = !!(created.section && created.section.classList.contains('is-paused'));
  created.title.textContent = text('Partnerler', 'Partners');
  created.pause.textContent = paused
    ? text('Akışı sürdür', 'Resume animation')
    : text('Akışı duraklat', 'Pause animation');
  created.disclosure.textContent = text(
    'Partner bağlantıları referans içerir; uygun işlemlerden komisyon kazanabiliriz.',
    'Partner links include referrals; we may earn commissions from qualifying activity.'
  );
  for (const anchor of created.links || []) {
    const brand = anchor.dataset.partner;
    anchor.setAttribute('aria-label', brand === 'breakout'
      ? text('Breakout — ALFA partner kodu', 'Breakout — ALFA partner code')
      : text(brand.toUpperCase() + ' — referans linki', brand.toUpperCase() + ' — referral link'));
  }
}

function build() {
  const footer = el('div', undefined, 'site-partners-footer');
  const section = el('section', undefined, 'edu-partners');
  section.setAttribute('aria-label', text('Partnerler', 'Partners'));

  const head = el('div', undefined, 'edu-partners-head');
  created.title = el('h2', text('Partnerler', 'Partners'));
  created.pause = el('button', text('Akışı duraklat', 'Pause animation'), 'btn');
  created.pause.type = 'button';
  created.pause.setAttribute('aria-pressed', 'false');
  created.pause.onclick = () => {
    const paused = section.classList.toggle('is-paused');
    created.pause.setAttribute('aria-pressed', String(paused));
    created.pause.textContent = paused
      ? text('Akışı sürdür', 'Resume animation')
      : text('Akışı duraklat', 'Pause animation');
  };
  head.append(created.title, created.pause);

  const viewport = el('div', undefined, 'edu-partners-viewport');
  const track = el('div', undefined, 'edu-partners-track');
  created.links = [];
  for (let groupIndex = 0; groupIndex < 2; groupIndex++) {
    const group = el('div', undefined, 'edu-partners-group');
    if (groupIndex) group.setAttribute('aria-hidden', 'true');
    for (let repeat = 0; repeat < 2; repeat++) {
      BRANDS.forEach(([name, asset, brand, key]) => {
        const accessible = groupIndex === 0 && repeat === 0;
        const item = accessible ? el('a', '', 'edu-partner-logo ' + brand) : el('span', undefined, 'edu-partner-logo ' + brand);
        item.target = '_blank';
        item.rel = 'noopener noreferrer';
        if (accessible) {
          item.dataset.partner = key;
          created.links.push(item);
        } else {
          item.setAttribute('aria-hidden', 'true');
        }
        const logo = el('img');
        logo.src = '/assets/partners/' + asset;
        logo.alt = accessible ? name : '';
        logo.width = 150; logo.height = 48; logo.loading = 'lazy';
        item.appendChild(logo);
        group.appendChild(item);
      });
    }
    track.appendChild(group);
  }
  viewport.appendChild(track);

  created.disclosure = el('p', text(
    'Partner bağlantıları referans içerir; uygun işlemlerden komisyon kazanabiliriz.',
    'Partner links include referrals; we may earn commissions from qualifying activity.'
  ));
  section.append(head, viewport, created.disclosure);
  footer.appendChild(section);
  document.body.appendChild(footer);
  created.footer = footer;
  created.section = section;
  syncLinks();
  syncLang();
}

build();

try {
  new MutationObserver(syncLang).observe(document.documentElement, {
    attributes: true, attributeFilter: ['lang']
  });
} catch (e) {}
window.addEventListener('alfa:site-access', syncLinks);

window.AlfaSitePartners = Object.freeze({
  node: () => created.footer,
  links: partnerLinks,
  syncLinks
});
