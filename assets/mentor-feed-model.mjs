export function parseMentorResults(text) {
  const out = [], seen = new Set();
  for (const line of String(text || '').slice(0, 4000).split(/\r?\n/)) {
    const match = line.trim().match(/^\$?([a-z][a-z0-9]{1,14}(?:\/(?:usdt|usd))?)\s*[:：]?\s+([+\-−]\s*\d{1,3}(?:[.,]\d{1,3})?)\s*r\s*[.!✅]*$/i);
    if (!match) continue;
    const coin = match[1].toUpperCase().replace(/\/(USDT|USD)$/, '');
    if (seen.has(coin)) return [];
    const r = Number(match[2].replace(/\s/g, '').replace('−', '-').replace(',', '.'));
    if (!Number.isFinite(r) || Math.abs(r) > 100) continue;
    seen.add(coin); out.push({ coin, r });
  }
  return out;
}
export function mentorCategory(record) {
  return ['trade', 'bias', 'post', 'result'].includes(record.category) ? record.category :
    Number.isFinite(record.r) ? 'result' : 'post';
}
export function classifyMentorPost(text) {
  const value = String(text || '');
  if (parseMentorResults(value).length) return 'result';
  if (/(?:#bias\b|\bbias\b|yön görüş|yon gorus|piyasa görüş|market outlook)/i.test(value)) return 'bias';
  if (/(?:#(?:işlem|islem|trade)\b|\b(?:long|short|entry|stop|pozisyon|aldım|açtım|girdik|girdim|tp|sl)\b|işleme gird|isleme gird)/i.test(value)) return 'trade';
  return 'post';
}
export function mentorCoin(text) {
  return String(text || '').toUpperCase().match(/\b(?:BTC|ETH|SOL|GOLD|XAUUSD|XAU|NZDCAD|USDCHF|EURUSD|GBPUSD|USDJPY|AUDUSD|USDCAD|NZDUSD|DXY|NASDAQ|NAS100|SPX|XRP|BNB)\b/)?.[0] || 'GENEL';
}
export function cleanMentorText(text, coin = '') {
  const seen = new Set(), symbol = String(coin).toUpperCase();
  return String(text || '').slice(0, 4000).split(/\r?\n/).map(line => line.trim()).filter(line => {
    if (!line || parseMentorResults(line).length || /^#(?:bias|işlem|islem|trade|sonuç|sonuc|post)$/i.test(line)) return false;
    const bare = line.replace(/^[#$]/, '').replace(/[.!:]+$/, '').toUpperCase();
    if (bare === symbol || bare === symbol + 'USDT' || bare === symbol + '/USDT') return false;
    if (seen.has(line)) return false;
    seen.add(line); return /[\p{L}]{3}/u.test(line);
  }).join('\n');
}
export function mentorDescription(record) {
  return [...new Set([cleanMentorText(record.rootText, record.coin), cleanMentorText(record.text, record.coin)].filter(Boolean))].join('\n\n');
}
export function completedMentorResults(records) {
  const unique = new Map();
  for (const record of records) {
    if (mentorCategory(record) !== 'result' || record.retracted || record.needsReview ||
        !Number.isFinite(record.r) || Math.abs(record.r) > 100 || !/^[A-Z][A-Z0-9]{1,14}$/.test(record.coin || '') ||
        !Number.isFinite(record.date) || record.date <= 0) continue;
    const old = unique.get(record.id);
    if (!old || (record.version || 0) >= (old.version || 0)) unique.set(record.id, record);
  }
  // Explicit allowlist: no text, images, links, source message IDs or trade plans.
  return [...unique.values()].sort((a,b) => a.date - b.date || a.id.localeCompare(b.id))
    .map(({ id, coin, r, date }) => ({ id, coin, r, date }));
}
export function mentorResultSummary(results) {
  const byDay = new Map(); let total = 0;
  for (const result of results) {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(result.date * 1000));
    byDay.set(day, (byDay.get(day) || 0) + Math.round(result.r * 1000));
  }
  const series = [...byDay].sort(([a],[b]) => a.localeCompare(b)).map(([day, delta]) => {
    total += delta; return { day, cumulativeR: total / 1000 };
  });
  return { count: results.length, netR: total / 1000, wins: results.filter(r => r.r > 0).length,
    losses: results.filter(r => r.r < 0).length, flat: results.filter(r => r.r === 0).length,
    series, from: series[0]?.day || null, to: series.at(-1)?.day || null,
    basis: 'Aktarılan ve eşleşmesi teyitli sonuçlar · tüm kayıtlı dönem · başlangıç 0R. Eksiksiz işlem geçmişi veya bağımsız doğrulanmış getiri değildir.' };
}
