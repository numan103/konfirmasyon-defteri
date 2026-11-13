import crypto from 'node:crypto';

// Bir kullanicinin, bizim affiliate hesabimiz uzerinden acilmis bir borsa
// hesabi olup olmadigini borsaya sorar. Tahmin yok: cevap gelmezse dogrulanmaz.
//
// Donus: { verified, reason, uid?, volume?, volume30d?, depositAmount?, joinedAt? }
//   reason:
//     'ok'            -> UID bizim invitee'miz, dogrulandi
//     'not_found'     -> borsa "bu UID senin invitee'n degil" dedi
//     'not_configured'-> API anahtari yok (elle onaya duser)
//     'auth_error'    -> anahtar/izin hatasi (kullaniciyi suclama)
//     'rate_limited'  -> borsa limiti (biraz sonra tekrar)
//     'error'         -> ag/beklenmeyen cevap (kullaniciyi suclama)
//
// Onemli: yalnizca 'not_found' kullaniciya "bulunamadi" olarak yansitilir.
// Diger hatalar 'pending' kalir; yonetici karar verir.

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

function asNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoFromMs(v) {
  const n = asNum(v);
  if (n === null || n <= 0) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Bybit: gecersiz anahtar / imza / izin / IP hatalari kullaniciyi baglamaz.
const BYBIT_AUTH_CODES = new Set([10003, 10004, 10005, 10010, 33004]);
const BYBIT_RATE_CODES = new Set([10006, 10018]);

// OKX: anahtar, imza, passphrase ve zaman damgasi hatalari.
const OKX_AUTH_CODES = new Set(['50101', '50102', '50103', '50104', '50105', '50106', '50111', '50112', '50113', '50114']);
const OKX_RATE_CODES = new Set(['50011', '50013']);

function httpErrorReason(status) {
  if (status === 401 || status === 403) return 'auth_error';
  if (status === 429) return 'rate_limited';
  return 'error';
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
  if (!json) return { verified: false, reason: httpErrorReason(r.status) };

  const code = Number(json.retCode);
  if (code !== 0) {
    if (BYBIT_AUTH_CODES.has(code)) return { verified: false, reason: 'auth_error', detail: json.retMsg || '' };
    if (BYBIT_RATE_CODES.has(code)) return { verified: false, reason: 'rate_limited', detail: json.retMsg || '' };
    return { verified: false, reason: 'error', detail: json.retMsg || '' };
  }

  const res = json.result;
  // Bize ait olmayan UID'de Bybit bos sonuc doner; bu bir "bulunamadi"dir.
  if (!res || !res.uid) return { verified: false, reason: 'not_found' };
  if (String(res.uid) !== String(uid)) return { verified: false, reason: 'not_found' };

  return {
    verified: true,
    reason: 'ok',
    uid: String(res.uid),
    volume: asNum(res.tradeVol365Day),
    volume30d: asNum(res.tradeVol30Day),
    depositAmount: asNum(res.depositAmount365Day !== undefined ? res.depositAmount365Day : res.depositAmount),
    joinedAt: null,
    vipLevel: res.vipLevel === undefined || res.vipLevel === null ? null : String(res.vipLevel)
  };
}

// OKX v5: imza = base64(HMAC_SHA256(secret, timestamp + METHOD + requestPath + body))
// requestPath sorgu dizesini de icerir; GET'te body ''.
//
// "invitee/detail" tek UID icin kesin cevap verir. Baska bir affiliate'in
// invitee'si ya da taninmayan UID icin data bos doner.
export async function verifyOkx(uid) {
  const key = process.env.OKX_API_KEY || '';
  const secret = process.env.OKX_API_SECRET || '';
  const pass = process.env.OKX_API_PASSPHRASE || '';
  if (!key || !secret || !pass) return { verified: false, reason: 'not_configured' };

  const basePath = process.env.OKX_AFFILIATE_DETAIL_PATH || '/api/v5/affiliate/invitee/detail';
  const query = `?uid=${encodeURIComponent(String(uid))}`;
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
  if (!json) return { verified: false, reason: httpErrorReason(r.status) };

  const code = String(json.code === undefined ? '' : json.code);
  if (code !== '0') {
    if (OKX_AUTH_CODES.has(code)) return { verified: false, reason: 'auth_error', detail: json.msg || '' };
    if (OKX_RATE_CODES.has(code)) return { verified: false, reason: 'rate_limited', detail: json.msg || '' };
    return { verified: false, reason: 'error', detail: json.msg || '' };
  }

  const data = Array.isArray(json.data) ? json.data : [];
  const d = data.find((x) => x && String(x.uid || '') === String(uid)) || null;
  if (!d) return { verified: false, reason: 'not_found' };

  const lifetime = d.totalVol !== undefined ? d.totalVol : d.tradeVol;
  return {
    verified: true,
    reason: 'ok',
    uid: String(d.uid),
    volume: asNum(lifetime),
    volume30d: asNum(d.volPeriod),
    depositAmount: asNum(d.depositAmount !== undefined ? d.depositAmount : d.depAmount),
    joinedAt: isoFromMs(d.joinTime),
    kycStatus: d.kycStatus === undefined ? null : String(d.kycStatus)
  };
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

// Kullaniciya gosterilecek durum: yalnizca kesin "yok" cevabi reddedilir.
export function submitStatusFor(result) {
  if (result && result.verified) return 'verified';
  if (result && result.reason === 'not_configured') return 'pending';
  if (result && result.reason === 'not_found') return 'rejected';
  return 'pending';
}
