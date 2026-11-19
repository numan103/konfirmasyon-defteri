const slot = document.getElementById('home-member-video');
if (slot) {
  let video = null, pending = null, lastFetched = 0;
  const tr = (a, b) => window.LANG === 'en' ? b : a;
  function member() { return typeof AUTH !== 'undefined' && !!AUTH.user?.id; }
  function visible() { return member() && !document.body.classList.contains('landed') && document.body.dataset.page === 'home'; }
  function element(tag, text, cls) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  function render() {
    const show = visible();
    slot.hidden = !show;
    if (!show) { slot.replaceChildren(); delete slot.dataset.video; return; }
    if (!video) {
      if (!slot.firstChild) slot.appendChild(element('p', tr('Son video yükleniyor…', 'Loading latest video…'), 'member-video-note'));
      return;
    }
    if (slot.dataset.video === video.id && slot.dataset.lang === window.LANG) return;
    slot.replaceChildren(); slot.dataset.video = video.id; slot.dataset.lang = window.LANG || 'tr';
    const head = element('div', undefined, 'member-video-head');
    head.append(element('span', tr('YOUTUBE · SON VİDEO', 'YOUTUBE · LATEST VIDEO'), 'member-video-kicker'),
      element('span', tr('Ücretsiz üyeliğine dahil · Podcast + video', 'Included with your free account · Podcast + video'), 'member-video-perk'));
    const title = element('h2', video.title);
    const date = element('div', new Date(video.publishedAt).toLocaleDateString(window.LANG === 'en' ? 'en-GB' : 'tr-TR') + ' · Crypto Ahmet', 'member-video-meta');
    const frame = element('div', undefined, 'member-video-frame');
    const preview = window.AlfaPreviewRuntime?.videoPoster?.(video);
    if (preview) {
      // The opaque preview frame cannot run third-party players; the parent
      // opens the same video in a small, isolated player on demand.
      frame.appendChild(preview);
    } else {
      const iframe = element('iframe');
      iframe.title = video.title; iframe.loading = 'lazy'; iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allow = 'encrypted-media; picture-in-picture; fullscreen';
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + video.id + '?rel=0&playsinline=1';
      frame.appendChild(iframe);
    }
    const note = element('p', preview
      ? tr('Önizlemede güvenli oynatıcı açılır. ', 'The secure player opens inside the preview. ')
      : tr('Video açılmıyorsa: ', 'If the video does not load: '), 'member-video-note');
    const link = element('a', tr('YouTube’da izle ↗', 'Watch on YouTube ↗'));
    link.href = 'https://www.youtube.com/watch?v=' + video.id; link.target = '_blank'; link.rel = 'noopener noreferrer';
    note.appendChild(link); slot.append(head, title, date, frame, note);
  }
  async function refresh() {
    if (!visible() || pending || Date.now() - lastFetched < 15 * 60000) return;
    pending = (async () => {
      try {
        const response = await fetch('/api/edu-shared?kind=youtube', { signal: AbortSignal.timeout(12000) });
        const data = await response.json(), next = data.video;
        if (!response.ok || !next || !/^[\w-]{11}$/.test(next.id) || typeof next.title !== 'string' || !Number.isFinite(Date.parse(next.publishedAt))) throw new Error('video_unavailable');
        video = { id: next.id, title: next.title.slice(0, 240), publishedAt: next.publishedAt };
        lastFetched = Date.now(); render();
      } catch {
        if (visible() && !video) {
          slot.replaceChildren(element('p', tr('Son video bilgisi şu an alınamadı. ', 'Latest video unavailable right now. '), 'member-video-note'));
          const link = element('a', tr('Kanalı aç ↗', 'Open channel ↗'));
          link.href = 'https://www.youtube.com/@cryptotraderahmet/videos'; link.target = '_blank'; link.rel = 'noopener noreferrer';
          slot.firstChild.appendChild(link);
        }
      } finally { pending = null; }
    })();
    return pending;
  }
  function context() { render(); refresh(); }
  new MutationObserver(context).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-page'] });
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  const status = document.getElementById('home-status');
  if (status) new MutationObserver(context).observe(status, { childList: true, subtree: true });
  window.addEventListener('focus', context);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) context(); });
  window.AlfaMemberVideo = { refreshContext: context };
  context();
}
