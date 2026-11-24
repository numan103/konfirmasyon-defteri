// Yeni Supabase projesinin minimum çalışma şartlarını doğrular.
// Sır göstermez: yalnızca publishable anahtar kullanır; service-role erişimi
// site üzerinden dolaylı olarak sınanır. Eski, egress'i kısıtlanmış proje
// referansı görülürse hiçbir istek atılmadan başarısız olur.
export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fssrtlpjqbavzomynwmg.supabase.co';
export const SUPABASE_PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_Zo8BS0jA6f0RBY0DIRUmvg_WsXngIx-';
export const SITE_URL = process.env.PUBLIC_SITE_URL || process.env.SITE_URL || 'https://alfa-trader.com';
export const EDU_SEED_IDS = Object.freeze(['channels', 'shortlinks', 'site-features', 'v1']);
export const ALFANEWS_SEED_ID = 1;
const LEGACY_REF = 'zvnjslmptwmnuhftgqsr';

const originOf = value => {
  try { return new URL(value).origin; } catch { return null; }
};
const check = (name, ok, detail) => ({ name, ok: !!ok, detail });

export async function runBootstrapProbe({
  fetchImpl = fetch,
  supabaseUrl = SUPABASE_URL,
  publishable = SUPABASE_PUBLISHABLE,
  siteUrl = SITE_URL,
} = {}) {
  const checks = [];
  const dbOrigin = originOf(supabaseUrl);
  const siteOrigin = originOf(siteUrl) || 'https://alfa-trader.com';
  checks.push(check('project_ref', !!dbOrigin && !dbOrigin.includes(LEGACY_REF), dbOrigin || 'invalid URL'));
  if (!checks[0].ok) return { ok: false, checks };

  const rest = async path => {
    const r = await fetchImpl(dbOrigin + '/rest/v1/' + path, {
      headers: { apikey: publishable, Authorization: 'Bearer ' + publishable, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* non-JSON detail is captured below */ }
    return { status: r.status, body, text };
  };
  const api = async path => {
    const r = await fetchImpl(siteOrigin + path, { signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* non-JSON detail is captured below */ }
    return { status: r.status, body, text };
  };

  try {
    const seeds = await rest('edu_shared?select=id,updated_at&id=in.(' + EDU_SEED_IDS.join(',') + ')&order=id');
    const found = Array.isArray(seeds.body) ? seeds.body.map(row => row.id) : [];
    checks.push(check('edu_shared_seed', seeds.status === 200 && EDU_SEED_IDS.every(id => found.includes(id)),
      seeds.status === 200 ? found.join(',') : 'HTTP ' + seeds.status + ' ' + seeds.text.slice(0, 100)));

    const newsRow = await rest('alfanews?id=eq.' + ALFANEWS_SEED_ID + '&select=id,updated_at');
    const rows = Array.isArray(newsRow.body) ? newsRow.body : [];
    checks.push(check('alfanews_seed', newsRow.status === 200 && rows.length === 1 && rows[0].id === ALFANEWS_SEED_ID,
      newsRow.status === 200 ? rows.map(row => row.id).join(',') : 'HTTP ' + newsRow.status + ' ' + newsRow.text.slice(0, 100)));

    const [journals, access] = await Promise.all([
      rest('journals?select=user_id&limit=1'),
      rest('site_access?select=user_id&limit=1'),
    ]);
    const privateCounts = [journals, access].map(r => Array.isArray(r.body) ? r.body.length : -1);
    checks.push(check('private_rows_not_public', privateCounts.every(n => n === 0),
      'journals=' + privateCounts[0] + ',site_access=' + privateCounts[1]));

    const landing = await api('/api/edu-shared?kind=landing');
    checks.push(check('service_role_read', landing.status === 200 && !!landing.body?.portfolio,
      'HTTP ' + landing.status));

    const news = await api('/api/edu-shared?kind=news');
    const count = Array.isArray(news.body?.data?.entries) ? news.body.data.entries.length : -1;
    checks.push(check('public_news_projection', news.status === 200 && news.body?.ok === true && count > 0,
      'HTTP ' + news.status + ',entries=' + count));
  } catch (error) {
    checks.push(check('probe_error', false, String(error?.message || error).slice(0, 160)));
  }
  return { ok: checks.every(c => c.ok), checks };
}
