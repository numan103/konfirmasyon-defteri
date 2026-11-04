import { portfolioSummary } from './portfolio-summary.mjs';
import { TRADE_DATABASES } from './notion-databases.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value)) ? value.slice(0, 10) : null;
const round = value => Math.round(value * 100) / 100;

// Construct an explicit allowlist. Never send the shared row or monetary history.
export function publicPortfolio(data, summary, revision) {
  if (!data || (data.positions || []).some(p => p.id === 'eth-sep5')) return null;
  if (!finite(data.startBalance) || data.startBalance <= 0 || !finite(summary?.pnlPct)) return null;
  const byDay = new Map();
  for (const point of Array.isArray(data.history) ? data.history : []) {
    const date = day(point?.d);
    if (date && finite(point.v) && point.v >= 0) byDay.set(date, { date, pct: round((point.v / data.startBalance - 1) * 100) });
  }
  const series = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
  return {
    returnPct: round(summary.pnlPct),
    asOf: summary.asOf || null,
    recordedAt: revision || null,
    live: summary.live === true,
    series,
    from: series[0]?.date || null,
    to: series.at(-1)?.date || null,
  };
}

// A numeric Profit is the journal's recorded R result, not a monetary profit.
// No titles, pairs, notes, images or open-position details leave this function.
export function publicTradeResults(rows) {
  const unique = new Map();
  for (const { page, market } of rows) {
    const date = day(page.properties?.Tarih?.date?.start);
    const r = page.properties?.Profit?.number;
    if (!page.id || !date || !finite(r)) continue;
    unique.set(page.id, { date, market, r: round(r) });
  }
  const results = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!results.length) return null;
  const wins = results.filter(r => r.r > 0).length;
  const losses = results.filter(r => r.r < 0).length;
  return {
    count: results.length, wins, losses, breakeven: results.length - wins - losses,
    totalR: round(results.reduce((sum, r) => sum + r.r, 0)),
    winRate: round(wins / results.length * 100),
    from: results[0].date, to: results.at(-1).date,
    latest: results.slice(-4).reverse(),
  };
}

async function loadPortfolio() {
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('unavailable');
  const base = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
  const headers = { apikey: key };
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  const r = await fetch(base + '/rest/v1/edu_shared?id=eq.alfa_portfoy_public&select=data,updated_at', { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('unavailable');
  const rows = await r.json();
  if (!rows[0]?.data) return null;
  const { data, updated_at: revision } = rows[0];
  return publicPortfolio(data, await portfolioSummary(data, revision), revision);
}

async function loadResults() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('unavailable');
  const deadline = AbortSignal.timeout(20000);
  const databases = await Promise.all(TRADE_DATABASES.map(async db => {
    const rows = [];
    let cursor;
    // Bound work; never publish a partial database as a complete track record.
    for (let page = 0; page < 20; page++) {
      const r = await fetch('https://api.notion.com/v1/databases/' + db.id + '/query', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
        signal: AbortSignal.any([deadline, AbortSignal.timeout(8000)]),
      });
      if (!r.ok) throw new Error('unavailable');
      const data = await r.json();
      if (!Array.isArray(data.results)) throw new Error('unavailable');
      rows.push(...data.results.map(page => ({ page, market: db.market })));
      if (!data.has_more) return rows;
      if (!data.next_cursor || data.next_cursor === cursor) throw new Error('incomplete');
      cursor = data.next_cursor;
    }
    throw new Error('incomplete');
  }));
  return publicTradeResults(databases.flat());
}

let cache = null;
let pending = null;
export default async function landing(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  // One bounded request per warm instance; failures are short-cached, not disguised as zero.
  if (!cache || Date.now() > cache.expires) {
    if (!pending) pending = Promise.allSettled([loadPortfolio(), loadResults()]).then(([p, t]) => {
      const body = {
        portfolio: p.status === 'fulfilled' ? p.value : null,
        trades: t.status === 'fulfilled' ? t.value : null,
        status: { portfolio: p.status === 'rejected' ? 'unavailable' : p.value ? 'ok' : 'empty', trades: t.status === 'rejected' ? 'unavailable' : t.value ? 'ok' : 'empty' },
        fetchedAt: new Date().toISOString(),
      };
      cache = { body, expires: Date.now() + (p.status === 'rejected' || t.status === 'rejected' ? 30000 : 60000) };
    }).finally(() => { pending = null; });
    await pending;
  }
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
  return res.status(200).json(cache.body);
}
