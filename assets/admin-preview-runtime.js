/* Runs only in an opaque sandbox: no real tokens, session, storage or DB client. */
(function () {
  'use strict';
  const config = window.ALFA_PREVIEW_CONFIG;
  if (!config || !['landing','free','premium'].includes(config.role) || window.parent === window) return;
  const send = message => parent.postMessage({ ...message, channel:config.channel }, config.origin);
  function memoryStorage() {
    const data = Object.create(null);
    return new Proxy(data, { get(target, key) {
      if (key === 'getItem') return k => Object.hasOwn(target, k) ? target[k] : null;
      if (key === 'setItem') return (k,v) => { target[String(k)] = String(v); };
      if (key === 'removeItem') return k => { delete target[k]; };
      if (key === 'clear') return () => Object.keys(target).forEach(k => delete target[k]);
      if (key === 'key') return i => Object.keys(target)[i] ?? null;
      if (key === 'length') return Object.keys(target).length;
      return target[key];
    }, set(target,key,value) { target[key] = String(value); return true; } });
  }
  for (const name of ['localStorage','sessionStorage']) Object.defineProperty(window,name,{ value:memoryStorage() });
  // Legacy cache-cleanup code may inspect CacheStorage even though this frame
  // has no persistent cache. Supply only an empty, in-memory no-op facade.
  Object.defineProperty(window,'caches',{ value:{
    keys:async () => [], match:async () => undefined, has:async () => false, delete:async () => false
  } });
  try { Object.defineProperty(document,'cookie',{ get:() => '', set:() => {} }); } catch {}
  let counter = 0;
  const pending = new Map();
  function notice(text = 'Önizleme: gerçek ödeme, başvuru veya kayıt gönderilmez.') {
    let n = document.getElementById('preview-notice');
    if (!n) {
      n = document.createElement('div'); n.id = 'preview-notice'; n.setAttribute('role','status');
      n.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:2147483000;background:#202c4c;color:white;border:1px solid #7888bd;padding:14px 20px;border-radius:12px;max-width:90vw;font:13px/1.5 Inter,sans-serif;box-shadow:0 8px 30px #0008';
      document.body?.append(n);
    }
    n.textContent = text; n.hidden = false; clearTimeout(notice.timer); notice.timer = setTimeout(() => { n.hidden = true; },5000);
  }
  const blocked = (silent = false) => {
    if (!silent) notice();
    return Promise.resolve(new Response(JSON.stringify({ ok:false, error:'preview_read_only', preview:true }),{ status:403,headers:{'Content-Type':'application/json'} }));
  };
  window.fetch = async function (input, init = {}) {
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const raw = typeof input === 'string' ? input : input?.url || String(input);
    const parsed = new URL(raw,config.origin);
    if (method !== 'GET') return blocked(parsed.pathname === '/api/analytics' && !parsed.searchParams.has('education'));
    if (/^(?:blob:|data:)/.test(raw)) return blocked();
    const url = new URL(raw, config.origin).href;
    if (init.signal?.aborted) throw new DOMException('Aborted','AbortError');
    const id = ++counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('preview_timeout')); },30000);
      const abort = () => { pending.delete(id); clearTimeout(timer); reject(new DOMException('Aborted','AbortError')); };
      init.signal?.addEventListener('abort',abort,{once:true});
      pending.set(id, { resolve, timer, cleanup:() => init.signal?.removeEventListener('abort',abort) });
      send({ type:'preview:fetch', id, url, method });
    });
  };
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== parent || event.origin !== config.origin || data?.channel !== config.channel || data.type !== 'preview:response') return;
    const item = pending.get(data.id); if (!item) return;
    pending.delete(data.id); clearTimeout(item.timer); item.cleanup();
    const json = data.json !== undefined;
    item.resolve(new Response(json ? JSON.stringify(data.json) : data.bytes, {
      status:data.status, headers:{ 'Content-Type':json ? 'application/json' : data.contentType }
    }));
  });
  // No native XHR/beacon/socket escape route. CSP connect-src 'none' also
  // enforces this in the browser, independently of the fetch adapter.
  window.XMLHttpRequest = class { open() { throw new Error('preview_read_only'); } };
  window.WebSocket = class { constructor() { throw new Error('preview_read_only'); } };
  try { Object.defineProperty(navigator,'sendBeacon',{ value:() => false }); } catch {}
  const dbError = { message:'Önizleme: sunucuya kayıt yapılmaz.', code:'preview_read_only' };
  function query() {
    let single = false, write = false;
    const result = () => ({ data:single ? null : [], error:write ? dbError : null });
    const chain = new Proxy({}, { get(_, key) {
      if (key === 'then') return (resolve,reject) => Promise.resolve(result()).then(resolve,reject);
      if (key === 'catch') return reject => Promise.resolve(result()).catch(reject);
      return () => {
        if (['single','maybeSingle'].includes(key)) single = true;
        if (['upsert','insert','update','delete'].includes(key)) { write = true; notice(); }
        return chain;
      };
    } });
    return chain;
  }
  const user = config.role === 'landing' ? null : { id:'preview-' + config.role, email:config.role + '@preview.invalid',
    user_metadata:{ name:config.role === 'premium' ? 'Örnek premium üye' : 'Örnek yeni üye' } };
  const session = user ? { user, access_token:'preview-no-authority', expires_at:4102444800 } : null;
  const fakeAuth = {
    getSession:async () => ({ data:{session}, error:null }), refreshSession:async () => ({ data:{session}, error:null }),
    getUser:async () => ({ data:{user}, error:null }),
    onAuthStateChange:() => ({ data:{ subscription:{ unsubscribe() {} } } }),
    signOut:async () => { send({ type:'preview:logout' }); return {error:null}; }
  };
  const client = { auth:fakeAuth, from:query, rpc:async () => ({ data:null,error:dbError }) };
  Object.defineProperty(window,'supabase',{ value:{ createClient:() => client } });
  // Preserve app-internal Back/Forward without navigating the frame out of its
  // sandbox or changing the administrator's URL.
  const stack = []; let cursor = -1;
  history.pushState = function (state) { stack.splice(cursor + 1); stack.push(state); cursor++; };
  history.replaceState = function (state) { if (cursor < 0) { stack.push(state); cursor = 0; } else stack[cursor] = state; };
  const go = delta => { const next = cursor + delta; if (next < 0 || next >= stack.length) return; cursor = next; window.dispatchEvent(new PopStateEvent('popstate',{state:stack[cursor]})); };
  history.back = () => go(-1); history.forward = () => go(1); history.go = go;
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (/^#/.test(href)) {
      event.preventDefault();
      const target = document.getElementById(href.slice(1));
      target?.scrollIntoView({behavior:'smooth'}); return;
    }
    const url = new URL(href,config.origin);
    const page = url.origin === config.origin && url.pathname === '/' && url.searchParams.get('page');
    if (page) {
      event.preventDefault(); hideLanding();
      // Let the app's real handlers close drawers and update active tabs.
      if (link.hasAttribute('data-nav') && !event.ctrlKey && !event.metaKey && !event.shiftKey) return;
      event.preventDefault(); event.stopImmediatePropagation();
      showPage(page); return;
    }
    if (link.hasAttribute('download')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    notice('Önizleme: harici bağlantı açılmaz. Gerçek işlem için Yönetici görünümüne dön.');
  },true);
  // Forms handled by app JavaScript still open, validate and show errors;
  // their server-side writes are rejected by fetch. Native submissions cannot
  // navigate thanks to sandbox + CSP form-action.
  window.AlfaPreviewRuntime = { async start() {
    AUTH.client = client; AUTH.user = user; AUTH.cloud = {}; AUTH.ns = 'preview:';
    scheduleCloudSync = function () {}; // Ephemeral local exercises, never cloud sync.
    await loadSiteAccess();
    await bootApp({seed:false});
    applyTierUi();
    if (user) {
      document.getElementById('user-name').textContent = user.user_metadata.name;
      document.getElementById('user-badge').classList.remove('hidden');
      document.getElementById('nav-login-app').style.display = 'none';
      hideLanding();
      showPage(siteCanOpen(config.page) ? config.page : 'home',true);
    } else showLanding();
    const mode = register => {
      showGate();
      document.getElementById('f-name').classList.toggle('hidden',!register);
      document.getElementById('tab-login').classList.toggle('on',!register);
      document.getElementById('tab-register').classList.toggle('on',register);
      document.getElementById('au-submit').textContent = register ? 'Kayıt ol' : 'Giriş yap';
    };
    for (const id of ['nav-login','nav-login-app','hero-login','tab-login']) document.getElementById(id)?.addEventListener('click',() => mode(false));
    for (const id of ['hero-register','cta-register','tab-register']) document.getElementById(id)?.addEventListener('click',() => mode(true));
    document.getElementById('auth-close')?.addEventListener('click',hideGate);
    document.getElementById('auth-form')?.addEventListener('submit',event => { event.preventDefault(); notice('Bu bir test görünümü. Üstteki Yeni kayıt / Premium butonuyla devam et; gerçek hesap oluşturulmaz.'); });
    document.getElementById('btn-logout')?.addEventListener('click',() => send({type:'preview:logout'}));
    new MutationObserver(() => send({type:'preview:page',page:document.body.dataset.page || 'home'}))
      .observe(document.body,{attributes:true,attributeFilter:['data-page']});
    send({type:'preview:page',page:document.body.dataset.page || 'home'});
  } };
})();
