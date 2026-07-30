const COINALYZE_BASE = 'https://api.coinalyze.net/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.COINALYZE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Coinalyze API key not configured. Add COINALYZE_API_KEY to Vercel env.' });
  }

  const { type, symbols, interval, from, to } = req.query;
  if (!type || !symbols) {
    return res.status(400).json({ error: 'Missing required params: type, symbols' });
  }

  const endpointMap = {
    'open-interest': '/open-interest',
    'open-interest-history': '/open-interest-history',
    'funding-rate': '/funding-rate',
    'funding-rate-history': '/funding-rate-history',
    'predicted-funding-rate': '/predicted-funding-rate',
    'long-short-ratio-history': '/long-short-ratio-history',
    'liquidation-history': '/liquidation-history',
  };

  const path = endpointMap[type];
  if (!path) {
    return res.status(400).json({ error: `Unknown type: ${type}` });
  }

  const params = new URLSearchParams({ symbols, api_key: apiKey });
  if (interval) params.set('interval', interval);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  try {
    const url = `${COINALYZE_BASE}${path}?${params}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: `Coinalyze API error: ${resp.status}`, detail: text });
    }
    const data = await resp.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
