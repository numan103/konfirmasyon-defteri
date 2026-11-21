// The parent chooses authority. Nothing supplied by a frame can select its role,
// pass through request headers, or turn a read into a write.
export const PREVIEW_ROLES = Object.freeze(['landing', 'free', 'premium']);
const member = role => role === 'free' || role === 'premium';
export function previewAccess(role) {
  return { ok:true, admin:false, tier:role === 'premium' ? 'ref' : 'free',
    status:role === 'premium' ? 'verified' : 'none', configured:{ okx:true, bybit:true },
    mentor:{ enabled:false, status:'none', invite:null }, attempts:0 };
}
export function resultProjection(records) {
  return (Array.isArray(records) ? records : [])
    .filter(r => typeof r.coin === 'string' && Number.isFinite(r.r) && Number.isFinite(r.date))
    .map(r => ({ coin:r.coin, r:r.r, date:r.date }));
}
const deny = () => ({ status:403, json:{ ok:false, error:'preview_read_only', preview:true } });
export function previewRequest(raw, method, role, origin) {
  if (!PREVIEW_ROLES.includes(role) || method !== 'GET' || typeof raw !== 'string' || raw.length > 4096) return deny();
  let u;
  try { u = new URL(raw, origin); } catch { return deny(); }
  if (u.username || u.password) return deny();
  if (u.origin !== origin) {
    const markets = {
      'api.binance.com':['/api/v3/ticker/24hr','/api/v3/klines'],
      'www.okx.com':['/api/v5/market/tickers','/api/v5/market/ticker'],
      'api.frankfurter.dev':['/v1/latest'], 'api.gold-api.com':['/price/XAU','/price/XAG'],
      'api.coingecko.com':['/api/v3/search','/api/v3/simple/price'],
      'open.er-api.com':['/v6/latest/USD']
    };
    return u.protocol === 'https:' && markets[u.hostname]?.includes(u.pathname) && !u.port
      ? { url:u.href, authenticated:false } : deny();
  }
  if (/^\/assets\/[\w./-]+\.(?:txt|json|svg|png|jpg|webp|mp3|mjs|js)$/.test(u.pathname))
    return { url:u.pathname + u.search, authenticated:false };
  const q = u.searchParams;
  if (u.pathname === '/api/access') return !u.search ? { status:200, json:previewAccess(role) } : deny();
  if (u.pathname === '/api/analytics' && q.get('education') === '1' && q.get('mine') === '1')
    return { status:200, json:{ ok:true, applications:[], preview:true } };
  if (u.pathname === '/api/eco-cal' && !u.search) return { url:'/api/eco-cal', authenticated:false };
  if (u.pathname === '/api/tg' && q.size === 1 && /^[A-Za-z0-9_-]{10,250}$/.test(q.get('magPhoto') || ''))
    return { url:'/api/tg?magPhoto=' + q.get('magPhoto'), authenticated:false };
  if (u.pathname === '/api/edu-shared') {
    const kind = q.get('kind') || '';
    if (kind === 'channel' && q.get('view') === 'daily-notes') {
      const id = q.get('note') || q.get('photo');
      if (id && !/^edutg_[a-f0-9]{64}$/.test(id)) return deny();
      const offset = q.get('offset') || '0', n = q.get('n') || '0';
      if (!/^\d{1,4}$/.test(offset) || Number(offset) > 1000 || !/^\d$/.test(n)) return deny();
      return { url:'/api/edu-shared?kind=channel&view=daily-notes' +
        (id ? (q.has('photo') ? '&photo=' + id + '&n=' + n : '&note=' + id) : '&offset=' + Number(offset)), authenticated:false };
    }
    if (['landing','podcast','youtube','news'].includes(kind))
      return { url:'/api/edu-shared?kind=' + kind, authenticated:false };
    if (kind === 'portfolio' && member(role)) {
      const summary = role !== 'premium' || q.get('view') === 'summary';
      return { url:'/api/edu-shared?kind=portfolio' + (summary ? '&view=summary' : ''), authenticated:true };
    }
    if (['','channel'].includes(kind) && role === 'premium')
      return { url:'/api/edu-shared' + (kind ? '?kind=channel' : ''), authenticated:false };
    if (kind === 'short' && /^[\w-]{1,80}$/.test(q.get('code') || ''))
      return { url:'/api/edu-shared?kind=short&code=' + encodeURIComponent(q.get('code')), authenticated:false };
    return deny();
  }
  if (u.pathname === '/api/ai' && q.get('mentorTrades') === '1') {
    if (q.get('summary') === '1') return { url:'/api/ai?mentorTrades=1&summary=1', authenticated:false };
    if (!member(role)) return deny();
    if (q.has('image')) {
      if (role !== 'premium' || !/^mentortrade_[a-f0-9]{64}$/.test(q.get('image') || '') || !['0','1'].includes(q.get('index'))) return deny();
      return { url:'/api/ai?mentorTrades=1&image=' + q.get('image') + '&index=' + q.get('index'), authenticated:true };
    }
    const page = q.get('page') || '0';
    if (!/^\d{1,4}$/.test(page) || Number(page) > 1000) return deny();
    const results = role !== 'premium' || q.get('results') === '1';
    const category = ['all','trade','bias','result','post'].includes(q.get('category')) ? q.get('category') : 'all';
    const coin = (q.get('coin') || '').replace(/[^\w.-]/g,'').slice(0,20);
    return { url:'/api/ai?mentorTrades=1&page=' + Number(page) + (results ? '&results=1' : '&category=' + category + '&coin=' + encodeURIComponent(coin)),
      authenticated:true, results };
  }
  if (u.pathname === '/api/ai' && q.get('influencer') === '1') {
    if (q.get('op') === 'prices') return { url:'/api/ai?influencer=1&op=prices', authenticated:false };
    return deny(); // Premium is not an Influencer subscription.
  }
  if (u.pathname === '/api/contrib' && member(role) && ['pano','alfatrading'].includes(q.get('store')))
    return { status:200, json:{ ok:true, entries:[], preview:true } };
  return deny();
}
