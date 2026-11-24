// Influencer ödeme yüzeyinin canlı ön kontrolleri. Gerçek satın alma JWT ister;
// burada fiyat kayıt defteri ve sipariş tablosunun servis-role sınırı sınanır.
// Satın alma → onay → geçmiş zinciri tests/influencer-orders.test.mjs içinde
// durumlu bir Supabase taklidiyle uçtan uca koşar.
import { INF_PACKAGE_PRICES } from '../api/ai.mjs';

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fssrtlpjqbavzomynwmg.supabase.co';
export const SUPABASE_PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_Zo8BS0jA6f0RBY0DIRUmvg_WsXngIx-';
export const SITE_URL = process.env.PUBLIC_SITE_URL || process.env.SITE_URL || 'https://alfa-trader.com';
const LEGACY_REF = 'zvnjslmptwmnuhftgqsr';
const check = (name, ok, detail) => ({ name, ok: !!ok, detail });

export async function runInfluencerProbe({
  fetchImpl = fetch,
  supabaseUrl = SUPABASE_URL,
  publishable = SUPABASE_PUBLISHABLE,
  siteUrl = SITE_URL,
} = {}) {
  const checks = [];
  let dbOrigin = null;
  try { dbOrigin = new URL(supabaseUrl).origin; } catch { /* fail closed below */ }
  checks.push(check('project_ref', !!dbOrigin && !dbOrigin.includes(LEGACY_REF), dbOrigin || 'invalid URL'));
  if (!checks[0].ok) return { ok: false, checks };
  const siteOrigin = (() => { try { return new URL(siteUrl).origin; } catch { return 'https://alfa-trader.com'; } })();

  try {
    const priceRes = await fetchImpl(siteOrigin + '/api/ai?influencer=1&op=prices', { signal: AbortSignal.timeout(20000) });
    const prices = await priceRes.json().catch(() => null);
    const cache = String(priceRes.headers.get('cache-control') || '');
    checks.push(check('fixed_prices', priceRes.status === 200 &&
      JSON.stringify(prices?.prices) === JSON.stringify(INF_PACKAGE_PRICES) &&
      prices?.currency === 'USDT' && prices?.network === 'TRC20' &&
      cache.includes('private') && cache.includes('no-store'),
      'HTTP ' + priceRes.status + ', ' + JSON.stringify(prices?.prices || null)));

    const rowsRes = await fetchImpl(dbOrigin + '/rest/v1/influencer_orders?select=id&limit=1', {
      headers: { apikey: publishable, Authorization: 'Bearer ' + publishable },
      signal: AbortSignal.timeout(20000),
    });
    const text = await rowsRes.text();
    checks.push(check('orders_service_only', [401, 403].includes(rowsRes.status) &&
      /permission denied|row-level security|rls/i.test(text),
      'HTTP ' + rowsRes.status));
  } catch (error) {
    checks.push(check('probe_error', false, String(error?.message || error).slice(0, 160)));
  }
  return { ok: checks.every(c => c.ok), checks };
}
