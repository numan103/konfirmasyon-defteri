const FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 429/5xx'te tek tekrar. Hata cevabi asla cache'lenmez; aksi halde kisa
// sureli bir rate limit 5 dakika boyunca "takvim yok" olarak donar.
async function fetchFeed() {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(FEED, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AlfaTraders/1.0',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        let data = null;
        try { data = await r.json(); } catch { data = null; }
        if (!Array.isArray(data)) return { ok: false, status: r.status, error: 'Takvim verisi çözümlenemedi' };
        return { ok: true, data };
      }
      lastStatus = r.status;
      if (r.status !== 429 && r.status < 500) break;
    } catch {
      lastStatus = 0;
    }
    if (attempt === 0) await sleep(1200);
  }
  return {
    ok: false,
    status: lastStatus,
    error: lastStatus
      ? 'Takvim kaynağı yanıt vermedi (HTTP ' + lastStatus + ')'
      : 'Takvim kaynağına ulaşılamadı',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET gerekli' });

  const out = await fetchFeed();
  if (!out.ok) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: false, error: out.error });
  }

  const items = out.data
    .map((x) => ({
      title: String(x.title || '').trim(),
      country: String(x.country || '').trim(),
      date: String(x.date || '').trim(),
      impact: String(x.impact || 'Low').trim(),
      forecast: String(x.forecast || '').trim(),
      previous: String(x.previous || '').trim(),
    }))
    .filter((x) => x.title);

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  return res.json({ ok: true, items });
}
