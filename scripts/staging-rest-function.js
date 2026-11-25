// Synthetic, staging-only Supabase-compatible REST surface.
// Serves no production data and accepts only staging publishable/service keys.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
});
const eq = (query, key) => query.get(key)?.startsWith('eq.') ? query.get(key).slice(3) : null;

const postId = 'staging-preview-1';
// Cloud Workers evaluate module scope with a fixed clock; derive time per request.
function payloads() {
  const now = Date.now();
  return {
    landing: {
      posts: [{
        id: postId,
        isAdmin: true,
        type: 'islem',
        ts: now - 3600000,
        title: 'Sentetik staging işlem',
        text: 'Yalnızca egress doğrulaması için üretilmiş kayıt.',
        coin: 'BTC',
        dir: 'long',
        status: 'aktif',
        hasInlineImage: true,
        img: 'data:image/png;base64,' + PNG,
      }],
    },
    portfolio: {
      startBalance: 10000,
      cash: 10000,
      positions: [],
      history: [{ d: new Date(now).toISOString().slice(0, 10), v: 10000 }],
    },
    now,
  };
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'apikey,authorization,content-type',
  } });
  if (request.method !== 'GET') return json({ message: 'method not allowed' }, 405);

  const url = new URL(request.url);
  const apikey = request.headers.get('apikey');
  const allowed = [env.SUPABASE_PUBLISHABLE, env.SUPABASE_SERVICE_ROLE].filter(Boolean);
  if (!allowed.includes(apikey)) return json({ message: 'Invalid API key' }, 401);

  const { landing, portfolio, now } = payloads();
  const parts = url.pathname.split('/').filter(Boolean);
  const table = parts[2] || '';
  const id = eq(url.searchParams, 'id');
  const post = eq(url.searchParams, 'post_id');

  if (table === 'alfa_landing_preview' && id === 'alfa_trading') return json([{ data: landing }]);
  if (table === 'alfa_landing_images' && post === postId) return json([{ img: 'data:image/png;base64,' + PNG }]);
  if (table === 'edu_shared' && id === 'alfa_portfoy_public') {
    return json([{ data: portfolio, updated_at: new Date(now).toISOString() }]);
  }
  if (table === 'edu_shared' && id === 'v1') return json([{ data: { modules: [], notes: [] } }]);
  if (table === 'edu_shared' && id === 'site-features') return json([{ data: { flags: {} } }]);
  if (table === 'edu_shared' && id === 'shortlinks') return json([{ data: {} }]);
  if (table === 'alfa_landing_images') return json([]);
  if (table === 'alfanews') return json({ message: 'not available in staging' }, 404);
  return json([], 200);
}
