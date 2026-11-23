import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALARM_SOUNDS, DEFAULT_ALARM_SETTINGS, normalizeAlarmSettings, normalizeAlarm,
  alarmLevel, alarmConditionLabel, shouldFire, markAlarmFired, alarmMessage, alarmPayload,
  playAlarmSound, soundDuration, postAlarmWebhook, createPriceTracker,
  ALARM_HISTORY_LIMIT, isAlarmMuted, muteAlarmIds, unmuteAlarmIds, recordAlarmTrigger
} from '../assets/alfa-alerts.mjs';

const base = { id: 'a1', symbol: 'BTCUSDT', price: 100, cond: 'above', basePrice: 100, pct: 1, note: 'test' };
const alarm = (patch = {}) => ({ ...DEFAULT_ALARM_SETTINGS, ...base, ...patch });

test('alarm settings are sanitized without inventing delivery destinations', () => {
  assert.deepEqual(normalizeAlarmSettings({}), DEFAULT_ALARM_SETTINGS);
  const s = normalizeAlarmSettings({ sound: 'hack', repeat: 'forever', volume: 9, webhook: 'javascript:alert(1)', telegramChat: 'abc' });
  assert.equal(s.sound, 'bip'); assert.equal(s.repeat, 'once'); assert.equal(s.volume, 1);
  assert.equal(s.webhook, ''); assert.equal(s.telegramChat, '');
  assert.equal(normalizeAlarmSettings({ telegramChat: '  123456789  ' }).telegramChat, '123456789');
  assert.equal(normalizeAlarmSettings({ webhook: 'https://example.com/hook' }).webhook, 'https://example.com/hook');
  assert.ok(Object.keys(ALARM_SOUNDS).length >= 6);
});

test('six condition types fire from real price movement, including crosses and percent moves', () => {
  assert.equal(shouldFire(alarm({ cond: 'above' }), 101), true);
  assert.equal(shouldFire(alarm({ cond: 'above' }), 99), false);
  assert.equal(shouldFire(alarm({ cond: 'below' }), 99), true);
  assert.equal(shouldFire(alarm({ cond: 'crossAbove' }), 101, 99), true);
  assert.equal(shouldFire(alarm({ cond: 'crossAbove' }), 101, 100), false);
  assert.equal(shouldFire(alarm({ cond: 'crossBelow' }), 99, 101), true);
  assert.equal(shouldFire(alarm({ cond: 'pctUp', pct: 2 }), 102), true);
  assert.equal(shouldFire(alarm({ cond: 'pctUp', pct: 2 }), 101.9), false);
  assert.equal(shouldFire(alarm({ cond: 'pctDown', pct: 2 }), 98), true);
  assert.equal(alarmLevel(alarm({ cond: 'pctDown', pct: 2 })), 98);
  assert.match(alarmConditionLabel(alarm({ cond: 'pctUp', pct: 2 })), /\+2/);
  assert.equal(shouldFire(alarm({ cond: 'above' }), NaN), false);
});

test('repeat modes respect one-shot, three-shot and 30s cooldown contracts', () => {
  const now = 1_700_000_000_000;
  const once = alarm({ repeat: 'once' });
  assert.equal(shouldFire(once, 101, null, now), true);
  markAlarmFired(once, 101, now);
  assert.equal(shouldFire(once, 102, null, now + 60000), false);
  const three = alarm({ repeat: 'three' });
  for (let i = 0; i < 3; i++) {
    assert.equal(shouldFire(three, 101, null, now + i * 60000), true);
    markAlarmFired(three, 101, now + i * 60000);
  }
  assert.equal(shouldFire(three, 101, null, now + 180000), false);
  const always = alarm({ repeat: 'always' });
  markAlarmFired(always, 101, now);
  assert.equal(shouldFire(always, 101, null, now + 1000), false);
  assert.equal(shouldFire(always, 101, null, now + 31000), true);
  assert.equal(always.triggered, false);
});

test('messages and payloads carry the complete alarm context', () => {
  const a = alarm();
  const message = alarmMessage(a, 102, v => `$${v}`);
  assert.match(message, /BTCUSDT/); assert.match(message, /\$102/); assert.match(message, /test/);
  const payload = alarmPayload(a, 102, message);
  assert.equal(payload.type, 'alfa-charts-alarm');
  assert.equal(payload.level, 100);
  assert.equal(payload.price, 102);
  assert.match(payload.at, /^\d{4}-\d\d-\d\dT/);
  // lastAt is preserved through normalization (byte-compatible history).
  const withLast = normalizeAlarm({ ...base, lastAt: 12345 }, 'BTCUSDT', 100);
  assert.equal(withLast.lastAt, 12345);
  // Disabled alarms never fire.
  assert.equal(shouldFire(alarm({ enabled: false }), 101), false);
  assert.equal(shouldFire(alarm({ enabled: true }), 101), true);
  assert.throws(() => normalizeAlarm({}, 'BTCUSDT', 100), /Geçersiz alarm/);
  assert.equal(normalizeAlarm({ price: 100, cond: 'bogus' }, 'BTCUSDT', 100).cond, 'above');
});

test('previous alarm price is tracked per symbol and reset on market switch', () => {
  const tracker = createPriceTracker(2);
  assert.equal(tracker.update('BTCUSDT', 100), null);
  assert.equal(tracker.update('BTCUSDT', 101), 100);
  assert.equal(shouldFire(alarm({ cond: 'crossAbove' }), 101, tracker.update('BTCUSDT', 101)), false);
  // A first tick of another market must not inherit BTCUSDT's previous price.
  assert.equal(tracker.update('ETHUSDT', 3999), null);
  assert.equal(shouldFire(alarm({ symbol: 'ETHUSDT', cond: 'crossAbove', price: 4000 }), 3999, tracker.update('ETHUSDT', 3999)), false);
  assert.equal(shouldFire(alarm({ symbol: 'ETHUSDT', cond: 'crossAbove', price: 4000 }), 4001, tracker.update('ETHUSDT', 4001)), true);
  tracker.reset('ETHUSDT');
  assert.equal(tracker.update('ETHUSDT', 4002), null);
  tracker.update('SOLUSDT', 200);
  // Bounded map keeps long sessions from retaining every visited market.
  assert.equal(tracker.update('BNBUSDT', 600), null);
  assert.equal(tracker.update('BTCUSDT', 102), null);
  assert.equal(tracker.update('BTCUSDT', 103), 102);
});

test('sound presets schedule oscillator notes and never depend on media files', () => {
  const created = [];
  class FakeCtx {
    constructor() { this.currentTime = 0; this.destination = {}; }
    createOscillator() { const o = { frequency: { setValueAtTime() {} }, connect() {}, start(t) { this.started = t; }, stop(t) { this.stopped = t; } }; created.push(o); return o; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    close() {}
  }
  assert.equal(playAlarmSound('bip', .5, FakeCtx), 120);
  assert.equal(playAlarmSound('ascending', .5, FakeCtx), 560);
  assert.equal(created.length, 5);
  assert.ok(created[2].started > created[1].started);
  assert.equal(playAlarmSound('none', .5, FakeCtx), 0);
  assert.equal(soundDuration('double'), 250);
});

test('webhook delivery is https-only and reports upstream failures', async () => {
  const calls = [];
  const fetcher = async (url, opts) => { calls.push({ url, opts }); return { ok: true }; };
  assert.equal(await postAlarmWebhook('https://example.com/hook', { a: 1 }, fetcher), true);
  assert.equal(JSON.parse(calls[0].opts.body).a, 1);
  await assert.rejects(() => postAlarmWebhook('http://example.com/hook', {}, fetcher), /bad_webhook/);
  await assert.rejects(() => postAlarmWebhook('https://example.com/hook', {}, async () => ({ ok: false, status: 500 })), /webhook_500/);
});

test('mute IDs and bounded trigger history keep alarm storage byte-compatible', () => {
  assert.equal(ALARM_HISTORY_LIMIT, 100);
  let muted = [];
  muted = muteAlarmIds(muted, 'a1');
  assert.deepEqual(muted, ['a1']);
  assert.equal(isAlarmMuted(muted, 'a1'), true);
  assert.equal(isAlarmMuted(muted, 'a2'), false);
  muted = muteAlarmIds(muted, 'a1');
  assert.deepEqual(muted, ['a1']);
  muted = unmuteAlarmIds(muted, 'a1');
  assert.deepEqual(muted, []);
  assert.equal(isAlarmMuted(muted, 'a1'), false);

  let history = [];
  for (let i = 0; i < 105; i++) history = recordAlarmTrigger(history, { id: `a${i}`, at: i });
  assert.equal(history.length, 100);
  assert.equal(history[0].id, 'a104');
  assert.equal(history[99].id, 'a5');
});
