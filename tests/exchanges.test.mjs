import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBybit, verifyOkx, isConfigured, submitStatusFor } from '../lib/exchanges.mjs';

const saved = { ...process.env };
function clean() {
  delete process.env.BYBIT_API_KEY;
  delete process.env.BYBIT_API_SECRET;
  delete process.env.OKX_API_KEY;
  delete process.env.OKX_API_SECRET;
  delete process.env.OKX_API_PASSPHRASE;
}
function restore() {
  process.env = { ...saved };
}

function stubFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return handler(String(url), init || {});
  };
  return {
    calls,
    restore() { globalThis.fetch = real; }
  };
}

function jsonResponse(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => obj
  };
}

test('borsa: anahtar yoksa dogrulama yapilmaz', async () => {
  clean();
  assert.equal(isConfigured('bybit'), false);
  assert.equal(isConfigured('okx'), false);
  assert.deepEqual(await verifyBybit('123'), { verified: false, reason: 'not_configured' });
  assert.deepEqual(await verifyOkx('123'), { verified: false, reason: 'not_configured' });
  restore();
});

test('bybit: bizim invitee ise hacim ve vip bilgisi doner', async () => {
  clean();
  process.env.BYBIT_API_KEY = 'key';
  process.env.BYBIT_API_SECRET = 'secret';
  const stub = stubFetch(() => jsonResponse({
    retCode: 0,
    retMsg: '',
    result: {
      uid: '1513500',
      vipLevel: '2',
      tradeVol30Day: '27818.103972',
      tradeVol365Day: '1183752.53919162',
      depositAmount365Day: '500'
    }
  }));
  try {
    const out = await verifyBybit('1513500');
    assert.equal(out.verified, true);
    assert.equal(out.reason, 'ok');
    assert.equal(out.volume, 1183752.53919162);
    assert.equal(out.volume30d, 27818.103972);
    assert.equal(out.depositAmount, 500);
    assert.equal(out.vipLevel, '2');

    const call = stub.calls[0];
    assert.match(call.url, /\/v5\/user\/aff-customer-info\?uid=1513500$/);
    assert.equal(call.init.headers['X-BAPI-API-KEY'], 'key');
    assert.equal(call.init.headers['X-BAPI-RECV-WINDOW'], '5000');
    assert.ok(call.init.headers['X-BAPI-SIGN']);
  } finally {
    stub.restore();
    restore();
  }
});

test('bybit: bos sonuc not_found sayilir', async () => {
  clean();
  process.env.BYBIT_API_KEY = 'key';
  process.env.BYBIT_API_SECRET = 'secret';
  const stub = stubFetch(() => jsonResponse({ retCode: 0, retMsg: '', result: {} }));
  try {
    const out = await verifyBybit('999');
    assert.equal(out.verified, false);
    assert.equal(out.reason, 'not_found');
  } finally {
    stub.restore();
    restore();
  }
});

test('bybit: anahtar/izin hatasi kullaniciyi suclu gostermez', async () => {
  clean();
  process.env.BYBIT_API_KEY = 'key';
  process.env.BYBIT_API_SECRET = 'secret';
  const stub = stubFetch(() => jsonResponse({ retCode: 10003, retMsg: 'API key is invalid.', result: {} }));
  try {
    const out = await verifyBybit('999');
    assert.equal(out.verified, false);
    assert.equal(out.reason, 'auth_error');
  } finally {
    stub.restore();
    restore();
  }
});

test('bybit: rate limit ayri raporlanir', async () => {
  clean();
  process.env.BYBIT_API_KEY = 'key';
  process.env.BYBIT_API_SECRET = 'secret';
  const stub = stubFetch(() => jsonResponse({ retCode: 10006, retMsg: 'too many visits', result: {} }));
  try {
    const out = await verifyBybit('999');
    assert.equal(out.reason, 'rate_limited');
  } finally {
    stub.restore();
    restore();
  }
});

test('bybit: ag hatasi error olur, not_found olmaz', async () => {
  clean();
  process.env.BYBIT_API_KEY = 'key';
  process.env.BYBIT_API_SECRET = 'secret';
  const stub = stubFetch(() => { throw new Error('offline'); });
  try {
    const out = await verifyBybit('999');
    assert.equal(out.verified, false);
    assert.equal(out.reason, 'error');
  } finally {
    stub.restore();
    restore();
  }
});

test('bybit: HTTP 403 auth_error olur', async () => {
  clean();
  process.env.BYBIT_API_KEY = 'key';
  process.env.BYBIT_API_SECRET = 'secret';
  const stub = stubFetch(() => jsonResponse(null, 403));
  try {
    const out = await verifyBybit('999');
    assert.equal(out.reason, 'auth_error');
  } finally {
    stub.restore();
    restore();
  }
});

test('okx: invitee/detail uzerinden dogrulanir ve hacim okunur', async () => {
  clean();
  process.env.OKX_API_KEY = 'key';
  process.env.OKX_API_SECRET = 'secret';
  process.env.OKX_API_PASSPHRASE = 'pass';
  const stub = stubFetch(() => jsonResponse({
    code: '0',
    msg: '',
    data: [{
      uid: '11111111',
      joinTime: '1700000000000',
      kycStatus: 'verified',
      totalVol: '42000.5',
      volPeriod: '1200.25'
    }]
  }));
  try {
    const out = await verifyOkx('11111111');
    assert.equal(out.verified, true);
    assert.equal(out.reason, 'ok');
    assert.equal(out.volume, 42000.5);
    assert.equal(out.volume30d, 1200.25);
    assert.equal(out.joinedAt, new Date(1700000000000).toISOString());
    assert.equal(out.kycStatus, 'verified');

    const call = stub.calls[0];
    assert.match(call.url, /\/api\/v5\/affiliate\/invitee\/detail\?uid=11111111$/);
    assert.equal(call.init.headers['OK-ACCESS-KEY'], 'key');
    assert.equal(call.init.headers['OK-ACCESS-PASSPHRASE'], 'pass');
    assert.ok(call.init.headers['OK-ACCESS-SIGN']);
  } finally {
    stub.restore();
    restore();
  }
});

test('okx: baska affiliate invitee ise not_found', async () => {
  clean();
  process.env.OKX_API_KEY = 'key';
  process.env.OKX_API_SECRET = 'secret';
  process.env.OKX_API_PASSPHRASE = 'pass';
  const stub = stubFetch(() => jsonResponse({ code: '0', msg: '', data: [] }));
  try {
    const out = await verifyOkx('11111111');
    assert.equal(out.verified, false);
    assert.equal(out.reason, 'not_found');
  } finally {
    stub.restore();
    restore();
  }
});

test('okx: imza hatasi auth_error olur', async () => {
  clean();
  process.env.OKX_API_KEY = 'key';
  process.env.OKX_API_SECRET = 'secret';
  process.env.OKX_API_PASSPHRASE = 'pass';
  const stub = stubFetch(() => jsonResponse({ code: '50113', msg: 'Invalid Sign', data: [] }));
  try {
    const out = await verifyOkx('11111111');
    assert.equal(out.reason, 'auth_error');
  } finally {
    stub.restore();
    restore();
  }
});

test('okx: farkli uid donerse dogrulanmaz', async () => {
  clean();
  process.env.OKX_API_KEY = 'key';
  process.env.OKX_API_SECRET = 'secret';
  process.env.OKX_API_PASSPHRASE = 'pass';
  const stub = stubFetch(() => jsonResponse({
    code: '0', msg: '', data: [{ uid: '22222222', totalVol: '10' }]
  }));
  try {
    const out = await verifyOkx('11111111');
    assert.equal(out.verified, false);
    assert.equal(out.reason, 'not_found');
  } finally {
    stub.restore();
    restore();
  }
});

test('gonderim durumu: yalnizca kesin yok reddedilir', () => {
  assert.equal(submitStatusFor({ verified: true, reason: 'ok' }), 'verified');
  assert.equal(submitStatusFor({ verified: false, reason: 'not_found' }), 'rejected');
  assert.equal(submitStatusFor({ verified: false, reason: 'not_configured' }), 'pending');
  assert.equal(submitStatusFor({ verified: false, reason: 'auth_error' }), 'pending');
  assert.equal(submitStatusFor({ verified: false, reason: 'rate_limited' }), 'pending');
  assert.equal(submitStatusFor({ verified: false, reason: 'error' }), 'pending');
});
