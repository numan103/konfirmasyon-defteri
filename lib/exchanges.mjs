import crypto from 'node:crypto';

// Bir kullanicinin, bizim affiliate hesabimiz uzerinden acilmis bir borsa
// hesabi olup olmadigini borsaya sorar. Tahmin yok: cevap gelmezse dogrulanmaz.
//
// Donus: { verified: boolean, reason: string }
//   reason: 'ok' | 'not_found' | 'not_configured' | 'error'

const TIMEOUT_MS = 8000;

async function withTimeout(url, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function hmacHex(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

// Bybit v5: GET imzasi = timestamp + apiKey + recvWindow + queryString
export async function verifyBybit(uid) {
  const key = process.env.BYBIT_API_KEY || '';
  const secret = process.env.BYBIT_API_SECRET || '';
  if (!key || !secret) return { verified: false, reason: 'not_configured' };

  const qs = `uid=${encodeURIComponent(String(uid))}`;
  const ts = Date.now().toString();
  const recv = '5000';
  const sign = hmacHex(secret, ts + key + recv + qs);

  let r;
  try {
    r = await withTimeout(`https://api.bybit.com/v5/user/aff-customer-info?${qs}`, {
      headers: {
        'X-BAPI-API-KEY': key,
        'X-BAPI-TIMESTAMP': ts,
        'X-BAPI-RECV-WINDOW': recv,
        'X-BAPI-SIGN': sign
      }
    });
  } catch (e) {
    return { verified: false, reason: 'error' };
  }

  const json = await r.json().catch(() => null);
  if (!json || json.retCode !== 0) return { verified: false, reason: 'not_found' };
  const res = json.result;
  return { verified: !!(res && String(res.uid) === String(uid)), reason: res ? 'ok' : 'not_found' };
}

// OKX v5: imza = base64(HMAC_SHA256(secret, timestamp + METHOD + requestPath + body))
// requestPath sorgu dizesini de icerir; GET'te body ''.
// NOT: OKX invitee listesi 'uid' parametresiyle filtrelenir ve taninmayan UID
// sessizce atlanir; sonuc bos donerse kullanici bizim davetlimiz degildir.
export async function verifyOkx(uid) {
  const key = process.env.OKX_API_KEY || '';
  const secret = process.env.OKX_API_SECRET || '';
  const pass = process.env.OKX_API_PASSPHRASE || '';
  if (!key || !secret || !pass) return { verified: false, reason: 'not_configured' };

  const basePath = process.env.OKX_AFFILIATE_PATH || '/api/v5/affiliate/invitee/list';
  const query = `?uid=${encodeURIComponent(String(uid))}&page=1&limit=100`;
  const ts = new Date().toISOString();
  const sign = crypto.createHmac('sha256', secret).update(ts + 'GET' + basePath + query).digest('base64');

  let r;
  try {
    r = await withTimeout(`https://www.okx.com${basePath}${query}`, {
      headers: {
        'OK-ACCESS-KEY': key,
        'OK-ACCESS-SIGN': sign,
        'OK-ACCESS-TIMESTAMP': ts,
        'OK-ACCESS-PASSPHRASE': pass,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return { verified: false, reason: 'error' };
  }

  const json = await r.json().catch(() => null);
  if (!json || json.code !== '0' || !Array.isArray(json.data)) return { verified: false, reason: 'not_found' };

  const ids = json.data.map((d) => String((d && (d.uid || d.userId)) || ''));
  return { verified: ids.includes(String(uid)), reason: 'ok' };
}

export function verifyExchange(exchange, uid) {
  if (exchange === 'bybit') return verifyBybit(uid);
  if (exchange === 'okx') return verifyOkx(uid);
  return Promise.resolve({ verified: false, reason: 'not_configured' });
}

export function isConfigured(exchange) {
  if (exchange === 'bybit') return !!(process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET);
  if (exchange === 'okx') return !!(process.env.OKX_API_KEY && process.env.OKX_API_SECRET && process.env.OKX_API_PASSPHRASE);
  return false;
}
