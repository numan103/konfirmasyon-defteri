import { previewRequest, resultProjection } from './admin-preview-policy.mjs?v=3';
const labels = { landing:'Giriş sayfası', free:'Yeni kayıt', premium:'Premium üye', admin:'Yönetici' };
const icons = { landing:'⌂', free:'＋', premium:'★', admin:'⚙' };
const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
function admin() {
  try { return !!(AUTH.user?.id && SITE.admin === true && window.siteIsAdmin?.()); } catch { return false; }
}
let bar, frame, status, videoLayer, active = 'admin', generation = 0, channel = '', source = '', lastPage = 'home', inFlight = 0;
function clearFrame() {
  generation++; channel = ''; inFlight = 0;
  closeVideo();
  frame?.remove(); frame = null;
  document.body.classList.remove('admin-preview-active');
}
function syncButtons() {
  bar?.querySelectorAll('[data-preview-role]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.previewRole === active)));
}
function exit() {
  clearFrame(); active = 'admin'; syncButtons();
  if (status) status.textContent = 'Gerçek yönetici oturumu';
}
function closeVideo() { videoLayer?.remove(); videoLayer = null; }
function openVideo(id, title) {
  closeVideo();
  if (!frame || !/^[\w-]{11}$/.test(String(id || ''))) return;
  const safeTitle = String(title || 'YouTube').slice(0, 160);
  videoLayer = el('div'); videoLayer.className = 'admin-preview-video-layer';
  const box = el('div'); box.className = 'admin-preview-video-box';
  const head = el('div');
  head.append(el('strong', safeTitle));
  const close = el('button', '×'); close.type = 'button'; close.title = 'Videoyu kapat';
  close.setAttribute('aria-label', 'Videoyu kapat'); close.onclick = closeVideo; head.appendChild(close);
  const player = el('iframe');
  player.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0&playsinline=1';
  player.title = safeTitle; player.referrerPolicy = 'no-referrer';
  player.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';
  player.setAttribute('allowfullscreen', '');
  player.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
  box.append(head, player); videoLayer.appendChild(box);
  videoLayer.addEventListener('click', event => { if (event.target === videoLayer) closeVideo(); });
  document.body.appendChild(videoLayer);
  close.focus();
}
function buildDocument(html, config) {
  // Fail closed if the app boot contract changes. Real bootAuth must NEVER run.
  const anchor = 'if (AUTH_ENABLED) {\n  bootApp({ seed: false });\n  bootAuth();\n  statsInit();';
  html = html.replace(/\r\n/g, '\n');
  if (html.split(anchor).length !== 2) throw new Error('preview_boot_contract_changed');
  html = html.replace(anchor, 'if (window.AlfaPreviewRuntime) {\n  window.AlfaPreviewRuntime.start();\n} else ' + anchor);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('base,meta[http-equiv="Content-Security-Policy"],script[src*="/assets/admin-preview."],script[src*="supabase-js"]').forEach(n => n.remove());
  const base = doc.createElement('base'); base.href = location.origin + '/';
  const csp = doc.createElement('meta'); csp.httpEquiv = 'Content-Security-Policy';
  csp.content = `default-src 'none'; connect-src 'none'; script-src 'unsafe-inline' ${location.origin} https://cdn.jsdelivr.net https://s3.tradingview.com; style-src 'unsafe-inline' ${location.origin} https://fonts.googleapis.com; font-src ${location.origin} https://fonts.gstatic.com data:; img-src ${location.origin} https: data: blob:; media-src ${location.origin} https: blob: data:; frame-src https://*.tradingview.com; worker-src 'none'; form-action 'none'; base-uri ${location.origin}`;
  const setup = doc.createElement('script');
  setup.textContent = 'Object.defineProperty(window,"ALFA_PREVIEW_CONFIG",{value:Object.freeze(' + JSON.stringify(config).replace(/</g,'\\u003c') + ')});';
  const runtime = doc.createElement('script'); runtime.src = location.origin + '/assets/admin-preview-runtime.js?v=2';
  doc.head.prepend(csp, base, setup, runtime);
  doc.documentElement.setAttribute('data-theme', config.theme);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
async function select(role) {
  if (!admin()) { exit(); return; }
  if (role === 'admin') { exit(); return; }
  if (!['landing','free','premium'].includes(role)) return;
  clearFrame(); active = role; syncButtons();
  const run = generation;
  status.textContent = labels[role] + ' · yükleniyor';
  try {
    if (!source) {
      const response = await fetch('/', { cache:'no-store', credentials:'omit' });
      if (!response.ok) throw new Error('source');
      source = await response.text();
    }
    if (run !== generation || !admin()) return;
    channel = crypto.randomUUID();
    frame = el('iframe'); frame.id = 'admin-preview-frame'; frame.title = labels[role] + ' · Canlı site önizlemesi';
    frame.setAttribute('sandbox', 'allow-scripts'); frame.referrerPolicy = 'no-referrer';
    frame.srcdoc = buildDocument(source, { role, channel, origin:location.origin, page:lastPage,
      theme:role === 'premium' ? 'dark' : 'light' });
    document.body.append(frame);
    document.body.classList.add('admin-preview-active');
    status.textContent = labels[role] + ' · test verileri geçici';
  } catch {
    clearFrame(); active = 'admin'; syncButtons();
    status.textContent = 'Önizleme açılamadı; yönetici oturumun korunuyor';
  }
}
window.addEventListener('message', async event => {
  const message = event.data;
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' ||
      !message || message.channel !== channel || !admin()) return;
  if (message.type === 'preview:page') {
    if (/^[\w-]{1,40}$/.test(message.page || '')) lastPage = message.page;
    return;
  }
  if (message.type === 'preview:video') { openVideo(message.id, message.title); return; }
  if (message.type === 'preview:logout') { select('landing'); return; }
  if (message.type !== 'preview:fetch' || !Number.isSafeInteger(message.id)) return;
  const target = frame.contentWindow, run = generation, replyChannel = channel;
  const send = (payload, transfer = []) => {
    if (run === generation && frame?.contentWindow === target && admin())
      target.postMessage({ type:'preview:response', id:message.id, channel:replyChannel, ...payload }, '*', transfer);
  };
  if (inFlight >= 24) { send({status:429,json:{ok:false,error:'preview_busy'}}); return; }
  inFlight++;
  try {
    const policy = previewRequest(message.url, message.method, active, location.origin);
    if (policy.json) { send({ status:policy.status, json:policy.json }); return; }
    const response = await (policy.authenticated ? window.siteFetch(policy.url, { cache:'no-store', redirect:'error' }) :
      fetch(policy.url, { cache:'no-store', credentials:'omit', redirect:'error' }));
    if (policy.results && response.ok) {
      const data = await response.json();
      send({ status:200, json:{ ok:!!data.ok, access:'results', records:resultProjection(data.records),
        page:data.page, more:!!data.more, summary:data.summary } });
    } else {
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 16 * 1024 * 1024) throw new Error('preview_response_too_large');
      send({ status:response.status, contentType:response.headers.get('content-type') || 'application/octet-stream', bytes }, [bytes]);
    }
  } catch { send({ status:503, json:{ ok:false, error:'preview_unavailable' } }); }
  finally { if (run === generation) inFlight--; }
});
function sync() {
  // This module never runs in the isolated app.
  if (window.ALFA_PREVIEW_CONFIG) return;
  if (!bar) {
    bar = el('nav'); bar.id = 'admin-view-switch'; bar.setAttribute('aria-label','Site görünümü');
    bar.append(el('span', '◉'));
    for (const [role, label] of Object.entries(labels)) {
      const b = el('button', icons[role]); b.type = 'button'; b.dataset.previewRole = role;
      b.setAttribute('aria-label', label); b.title = label;
      b.onclick = () => select(role); bar.append(b);
    }
    status = el('span','Gerçek yönetici oturumu'); status.className = 'preview-status'; status.setAttribute('role','status'); bar.append(status);
    document.body.prepend(bar); syncButtons();
    new ResizeObserver(() => {
      if (!bar.hidden) document.documentElement.style.setProperty('--admin-view-height', bar.getBoundingClientRect().height + 16 + 'px');
    }).observe(bar);
  }
  const allowed = admin();
  bar.hidden = !allowed;
  if (document.body.classList.contains('admin-view-enabled') !== allowed) document.body.classList.toggle('admin-view-enabled', allowed);
  if (!allowed && frame) exit();
}
new MutationObserver(sync).observe(document.body, { attributes:true, attributeFilter:['class','data-page'] });
window.addEventListener('focus', sync);
window.addEventListener('pagehide', clearFrame);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (videoLayer) closeVideo();
  else if (frame) exit();
});
sync();
