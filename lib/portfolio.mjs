import { bearer, isAdminEmail, requestTier } from './auth.mjs';
import { getUser } from '../ayna-server/supabase.mjs';
import { portfolioSummary } from './portfolio-summary.mjs';

const n = value => { const x = Number(value); return Number.isFinite(x) ? x : 0; };
const MAX_LEVERAGE = 1000;

// Kaldıraç opsiyoneldir. Kayıt yoksa / 1x ise eski spot davranışı korunur.
function leverageIsValid(raw) {
  if (raw == null) return true;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 && v <= MAX_LEVERAGE;
}
export function leverageOf(p) {
  const raw = p && p.leverage;
  if (!leverageIsValid(raw)) return 1;
  return raw == null ? 1 : Number(raw);
}
export function marginFor(notional, leverage) {
  const lev = leverageIsValid(leverage) ? (leverage == null ? 1 : Number(leverage)) : 1;
  if (!(lev > 1)) return notional; // eski kayıtlar ve 1x: tam tutar blokeli
  return Math.round((notional / lev) * 100) / 100;
}
export function reservedOf(p) {
  return marginFor(n(p && p.qty) * n(p && p.cost), p && p.leverage);
}

// Nakit, pozisyonlar ve satış geçmişinden türetilir; istemciden gelen cash
// değeri tek başına güvenilir sayılmaz. Böylece "para düştü ama pozisyon yok"
// durumu sunucuya hiç yazılamaz. Kaldıraçlı pozisyonda blokelenen tutar
// notional değil, notional / kaldıraç kadar marjdır.
export function reconcileCash(data) {
  const start = Number.isFinite(Number(data && data.startBalance)) ? Number(data.startBalance) : 1000;
  const spent = (Array.isArray(data && data.positions) ? data.positions : []).reduce((sum, p) => {
    if (!p || (p.lim && !p.filled)) return sum; // bekleyen emir nakit ayırmaz
    return sum + reservedOf(p);
  }, 0);
  const realized = (Array.isArray(data && data.sells) ? data.sells : []).reduce((sum, sl) => {
    if (!sl) return sum;
    for (const key of ['pnl', 'profit']) {
      if (sl[key] == null || sl[key] === '') continue;
      const value = Number(sl[key]);
      if (Number.isFinite(value)) return sum + value;
    }
    return sum;
  }, 0);
  return Math.round((start - spent + realized) * 100) / 100;
}

export function validatePortfolio(data) {
  if (!data || data.v !== 2 || !Array.isArray(data.positions) || !Array.isArray(data.sells) ||
      !Array.isArray(data.ideas) || !Array.isArray(data.history) ||
      !Number.isFinite(data.startBalance) || data.startBalance <= 0 ||
      !Number.isFinite(data.cash) || Buffer.byteLength(JSON.stringify(data)) > 262144) return false;
  const ids = new Set();
  return data.positions.every(p => {
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 120 || ids.has(p.id) ||
        typeof p.symbol !== 'string' || !p.symbol || p.symbol.length > 40 ||
        !Number.isFinite(p.qty) || p.qty <= 0 || !Number.isFinite(p.cost) || p.cost <= 0 ||
        !leverageIsValid(p.leverage)) return false;
    ids.add(p.id); return true;
  }) && data.sells.every(s => s && typeof s === 'object' && !Array.isArray(s));
}

// Reuse the existing endpoint. Writes require the atomic, versioned DB RPC.
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
  const versions = req.query?.versions !== undefined;
  const selectedVersion = req.query?.version !== undefined;
  if ((versions || selectedVersion) && tier !== 'admin') return res.status(403).json({ error: 'admin_required' });
  const summaryOnly = req.method === 'GET' && req.query?.view === 'summary';
  if (!summaryOnly && tier !== 'admin' && tier !== 'ref') return res.status(403).json({ error: 'referral_required' });
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) return res.status(503).json({ error: 'portfolio_storage_unavailable' });
  const base = (process.env.SUPABASE_URL || 'https://fssrtlpjqbavzomynwmg.supabase.co') + '/rest/v1/edu_shared';
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  try {
    const url = base + '?id=eq.alfa_portfoy_public';
    if (req.method === 'GET') {
      if (versions || selectedVersion) {
        const versionBase = base.replace(/\/edu_shared$/, '/portfolio_versions');
        const value = String(selectedVersion ? req.query.version : req.query?.before || '');
        if ((selectedVersion || value) && !/^[1-9]\d{0,14}$/.test(value)) return res.status(400).json({ error: 'invalid_version' });
        const query = selectedVersion ? '?id=eq.' + value + '&select=id,revision,saved_at,data,action' :
          '?select=id,revision,saved_at,action,position_count,sale_count&order=id.desc&limit=20' + (value ? '&id=lt.' + value : '');
        const r = await fetch(versionBase + query, { headers, signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error('versions_unavailable');
        const rows = await r.json();
        if (selectedVersion) return rows[0] ? res.status(200).json({ version: rows[0] }) : res.status(404).json({ error: 'version_missing' });
        return res.status(200).json({ versions: rows, nextBefore: rows.length === 20 ? rows.at(-1).id : null });
      }
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
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
    catch { return res.status(400).json({ error: 'bad_json' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'bad_json' });
    const action = body.action || 'save';
    if (!body.revision || !Number.isFinite(Date.parse(body.revision)) ||
        !['save', 'delete_position', 'reset', 'restore'].includes(action)) {
      return res.status(400).json({ error: 'invalid_portfolio' });
    }
    if (action === 'reset' && body.confirmation !== 'PORTFOYU SIFIRLA' ||
        action === 'restore' && (body.confirmation !== 'RESTORE' || !/^[1-9]\d{0,14}$/.test(String(body.versionId)))) {
      return res.status(400).json({ error: 'confirmation_required' });
    }
    if (action !== 'reset' && action !== 'restore' && !validatePortfolio(body.data)) {
      return res.status(400).json({ error: 'invalid_portfolio' });
    }
    const cash = action === 'save' || action === 'delete_position' ? reconcileCash(body.data) : null;
    const changed = cash != null && Math.abs(n(body.data.cash) - cash) > 0.01;
    const payload = cash != null ? { ...body.data, cash } : null;
    const r = await fetch(base.replace(/\/edu_shared$/, '/rpc/portfolio_commit'), {
      method: 'POST', headers,
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ p_revision: body.revision, p_data: payload, p_action: action,
        p_actor: user.id, p_restore_id: action === 'restore' ? body.versionId : null,
        p_confirmation: body.confirmation || null })
    });
    if (!r.ok) {
      const failure = await r.json().catch(() => ({}));
      if (failure.message === 'portfolio_conflict') return res.status(409).json({ error: 'portfolio_conflict' });
      if (failure.code === '23514') return res.status(422).json({ error: 'portfolio_safety_blocked', reason: String(failure.message).slice(0, 100) });
      if (failure.message === 'portfolio_version_missing') return res.status(404).json({ error: 'version_missing' });
      // Missing migration/backups must fail closed; never fall back to a raw PATCH.
      throw new Error('versioned_write_failed');
    }
    const result = await r.json();
    if (!result.revision || !result.backedUp || !result.versionId) throw new Error('unverified_write');
    return res.status(200).json({ ok: true, ...result, cashAdjusted: changed });
  } catch (e) {
    return res.status(503).json({ error: 'portfolio_storage_unavailable' });
  }
}
