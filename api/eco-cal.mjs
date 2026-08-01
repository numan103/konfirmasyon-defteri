const FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET gerekli' });
  try {
    const r = await fetch(FEED, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AlfaTraders/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: 'Takvim kaynağı yanıt vermedi (HTTP ' + r.status + ')' });
    let data;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!Array.isArray(data)) return res.status(200).json({ ok: false, error: 'Takvim verisi çözümlenemedi' });
    const items = data
      .map(x => ({
        title: String(x.title || '').trim(),
        country: String(x.country || '').trim(),
        date: String(x.date || '').trim(),
        impact: String(x.impact || 'Low').trim(),
        forecast: String(x.forecast || '').trim(),
        previous: String(x.previous || '').trim()
      }))
      .filter(x => x.title);
    return res.json({ ok: true, items });
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) || 'Ağ hatası' });
  }
}
