import { bearer, isAdminEmail, requestTier } from './auth.mjs';
import { getUser } from '../ayna-server/supabase.mjs';
import { portfolioSummary } from './portfolio-summary.mjs';

const n = value => { const x = Number(value); return Number.isFinite(x) ? x : 0; };

// Nakit, pozisyonlar ve satış geçmişinden türetilir; istemciden gelen cash
// değeri tek başına güvenilir sayılmaz. Böylece "para düştü ama pozisyon yok"
// durumu sunucuya hiç yazılamaz.
export function reconcileCash(data) {
  const start = Number.isFinite(Number(data && data.startBalance)) ? Number(data.startBalance) : 1000;
  const spent = (Array.isArray(data && data.positions) ? data.positions : []).reduce((sum, p) => {
    if (!p || (p.lim && !p.filled)) return sum; // bekleyen emir nakit ayırmaz
    return sum + n(p.qty) * n(p.cost);
  }, 0);
  const realized = (Array.isArray(data && data.sells) ? data.sells : []).reduce((sum, sl) => {
    if (!sl) return sum;
    const value = sl.pnl != null && sl.pnl !== '' ? Number(sl.pnl) : Number(sl.profit);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  return Math.round((start - spent + realized) * 100) / 100;
}

// Reuse the existing endpoint: no extra Vercel function or schema migration.
export default async function portfolio(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const jwt = bearer(req);
  let user = null;
  try {
    if (jwt) {
      const verified = await getUser(jwt);
      if (verified) user = { ...verified, jwt, admin: isAdminEmail(verified.email) };
    }
  } catch (e) {
    return res.status(503).json({ error: 'auth_unavailable' });
  }
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  const tier = await requestTier(user);
  const summaryOnly = req.method === 'GET' && req.query?.view === 'summary';
  if (!summaryOnly && tier !== 'admin' && tier !== 'ref') return res.status(403).json({ error: 'referral_required' });
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) return res.status(503).json({ error: 'portfolio_storage_unavailable' });
  const base = (process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co') + '/rest/v1/edu_shared';
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  try {
    const url = base + '?id=eq.alfa_portfoy_public';
    if (req.method === 'GET') {
      const r = await fetch(url + '&select=data,updated_at', { headers });
      if (!r.ok) throw new Error('read_failed');
      const rows = await r.json();
      if (summaryOnly) {
        if (!rows[0]?.data) return res.status(200).json({ summary: null });
        return res.status(200).json({ summary: await portfolioSummary(rows[0].data, rows[0].updated_at) });
      }
      return res.status(200).json({ data: rows[0]?.data || null, revision: rows[0]?.updated_at || null });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (tier !== 'admin') return res.status(403).json({ error: 'admin_required' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (!body.revision || !body.data || body.data.v !== 2 || !Array.isArray(body.data.positions) || !Array.isArray(body.data.sells)) {
      return res.status(400).json({ error: 'invalid_portfolio' });
    }
    // Compare-and-swap: a stale phone must never overwrite a newer desktop edit.
    const revision = new Date().toISOString();
    const cash = reconcileCash(body.data);
    const changed = Math.abs(n(body.data.cash) - cash) > 0.01;
    const payload = { ...body.data, cash };
    const r = await fetch(url + '&updated_at=eq.' + encodeURIComponent(body.revision) + '&select=updated_at', {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ data: payload, updated_at: revision })
    });
    if (!r.ok) throw new Error('write_failed');
    const rows = await r.json();
    if (!rows.length) return res.status(409).json({ error: 'portfolio_conflict' });
    return res.status(200).json({ ok: true, revision: rows[0].updated_at, cash, cashAdjusted: changed });
  } catch (e) {
    return res.status(503).json({ error: 'portfolio_storage_unavailable' });
  }
}
