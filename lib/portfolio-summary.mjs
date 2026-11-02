export function summarizePortfolio(data, quotes = {}, asOf = null) {
  const d = data?.data || data || {};
  const start = Number(d.startBalance) || 0;
  const cash = Number(d.cash) || 0;
  let value = 0, fresh = true;
  for (const p of d.positions || []) {
    if (p.lim && !p.filled) continue;
    const qty = Number(p.qty) || 0, cost = Number(p.cost) || 0;
    const quote = Number(quotes[String(p.symbol || '').toUpperCase()]);
    const price = quote > 0 ? quote : Number(p.price) > 0 ? Number(p.price) : cost;
    if (!(quote > 0)) fresh = false;
    value += p.side === 'SHORT' ? qty * (2 * cost - price) : qty * price;
  }
  const portfolioValue = cash + value;
  const count = (d.positions || []).filter(p => !(p.lim && !p.filled) && Number(p.qty) > 0).length;
  return { portfolioValue, count, pnl: portfolioValue - start, pnlPct: start > 0 ? (portfolioValue - start) / start * 100 : null,
    asOf: fresh ? asOf : d.syncedAt || d.lastUpdate || asOf, live: fresh };
}

let cache = null;
export async function portfolioSummary(data, revision) {
  const key = JSON.stringify([data, revision]);
  if (cache?.key === key && Date.now() - cache.at < 30000) return cache.value;
  const symbols = [...new Set((data?.positions || []).filter(p => p.type === 'kripto' && !(p.lim && !p.filled))
    .map(p => String(p.symbol || '').toUpperCase()).filter(s => /^[A-Z0-9]{1,20}$/.test(s)))].slice(0, 30);
  const quotes = {};
  await Promise.all(symbols.map(async symbol => {
    try {
      const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=' + symbol + 'USDT', { signal: AbortSignal.timeout(4000) });
      if (r.ok) { const j = await r.json(); if (Number(j.price) > 0) quotes[symbol] = Number(j.price); }
    } catch (e) { /* Fall back to the saved valuation, explicitly marked not live. */ }
    if (!quotes[symbol]) {
      try {
        const r = await fetch('https://www.okx.com/api/v5/market/ticker?instId=' + symbol + '-USDT', { signal: AbortSignal.timeout(4000) });
        if (r.ok) { const j = await r.json(); if (Number(j.data?.[0]?.last) > 0) quotes[symbol] = Number(j.data[0].last); }
      } catch (e) { /* Saved quote remains explicitly labelled as a fallback. */ }
    }
  }));
  const value = summarizePortfolio(data, quotes, new Date().toISOString());
  cache = { key, at: Date.now(), value };
  return value;
}
