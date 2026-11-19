const nav = document.querySelector('.navbar');
if (nav) {
  nav.id ||= 'main-navigation';
  const reveal = document.createElement('button');
  reveal.type = 'button'; reveal.className = 'nav-reveal'; reveal.textContent = '☰ Menü';
  reveal.setAttribute('aria-controls', nav.id); reveal.setAttribute('aria-expanded', 'false');
  document.body.append(reveal);
  let scheduled = false, last = window.scrollY;
  function peek(open) {
    document.body.classList.toggle('nav-peek', open);
    reveal.setAttribute('aria-expanded', String(open));
    reveal.textContent = open ? 'Menüyü kapat' : '☰ Menü';
  }
  function update() {
    scheduled = false;
    const y = window.scrollY;
    const scrolled = y > 90 && nav.getClientRects().length > 0;
    if (document.body.classList.contains('nav-scrolled') !== scrolled) document.body.classList.toggle('nav-scrolled', scrolled);
    if (!scrolled || (y > last + 10 && !document.querySelector('#nav-mobile.open'))) peek(false);
    last = y;
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }
  reveal.addEventListener('click', () => peek(!document.body.classList.contains('nav-peek')));
  window.addEventListener('scroll', schedule, { passive:true });
  window.addEventListener('resize', schedule, { passive:true });
  document.addEventListener('pointerdown', e => { if (!nav.contains(e.target) && e.target !== reveal) peek(false); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      peek(false);
      if (nav.contains(document.activeElement) && getComputedStyle(reveal).display !== 'none') reveal.focus();
    }
  });
  new MutationObserver(schedule).observe(document.body, { attributes:true, attributeFilter:['data-page'] });
  update();
}
