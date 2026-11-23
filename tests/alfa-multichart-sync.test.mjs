import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNC_CHANNEL, quantize, normalizePayload, makeEnvelope, readEnvelope, fingerprint,
  echoFingerprint, createEchoLedger, createMessageGate, rememberCommand, isRecentEcho
} from '../assets/alfa-multichart-sync.mjs';

const source = {};
const options = {
  origin: 'https://alfa.test', expectedOrigin: 'https://alfa.test',
  allowedSources: new Set([source]), source, session: 'session-1'
};
const envelope = (patch = {}) => makeEnvelope({
  session: 'session-1', instance: 'pane-a', paneId: 1, seq: 1,
  type: 'symbol', payload: { symbol: 'ETHUSDT' }, replyTo: 0, ...patch
});

test('envelopes require same origin, registered source, matching session and whitelisted payload', () => {
  const valid = envelope();
  assert.deepEqual(readEnvelope(valid, options), valid);
  assert.equal(readEnvelope(valid, { ...options, origin: 'https://evil.test' }), null);
  assert.equal(readEnvelope(valid, { ...options, allowedSources: new Set([{}]) }), null);
  assert.equal(readEnvelope({ ...valid, session: 'other' }, options), null);
  assert.equal(readEnvelope({ ...valid, channel: 'other' }, options), null);
  assert.equal(readEnvelope({ ...valid, type: 'weather' }, options), null);
  assert.equal(readEnvelope({ ...valid, seq: 0 }, options), null);
  assert.equal(readEnvelope({ ...valid, seq: 1.5 }, options), null);
  assert.equal(readEnvelope({ ...valid, replyTo: -1 }, options), null);
  assert.equal(readEnvelope({ ...valid, paneId: 1000001 }, options), null);
  assert.ok(readEnvelope({ ...valid, paneId: 42 }, options));
  assert.equal(readEnvelope({ ...valid, payload: [] }, options), null);
  assert.equal(readEnvelope({ ...valid, payload: { symbol: 'javascript:alert(1)' } }, options), null);
  assert.equal(SYNC_CHANNEL, 'alfa-multichart:sync:v1');
});

test('payload normalization rejects malformed geometry and keeps only allowed fields', () => {
  assert.deepEqual(normalizePayload('crosshair', { visible: false }), { visible: false, time: null, logical: null, point: null });
  assert.deepEqual(normalizePayload('crosshair', { visible: true, time: 100, logical: 10.123456, point: { x: 10.4, y: 20 } }),
    { visible: true, time: 100, logical: 10.123, point: null });
  assert.deepEqual(normalizePayload('crosshair', { visible: true, time: 100, logical: 10.12349, point: { x: 10, y: 20 }, extra: 1 }),
    { visible: true, time: 100, logical: 10.123, point: { x: 10, y: 20 } });
  assert.deepEqual(normalizePayload('range', { logical: { from: 100.0000001, to: 200.9999999 }, time: { from: 1, to: 2 } }),
    { logical: { from: 100, to: 201 }, time: { from: 1, to: 2 } });
  assert.equal(normalizePayload('range', { logical: { from: 1, to: null } }), null);
  assert.deepEqual(normalizePayload('symbol', { symbol: 'OKX:BTCUSDT.P', note: 'x' }), { symbol: 'OKX:BTCUSDT.P' });
  assert.equal(normalizePayload('symbol', { symbol: '' }), null);
  assert.deepEqual(normalizePayload('state', { symbol: 'BTCUSDT', interval: '1h', range: { logical: { from: 1, to: 2 } } }).symbol, 'BTCUSDT');
  assert.equal(quantize(-0), 0);
  assert.equal(quantize(Number.NaN), null);
  assert.equal(quantize(1.23456, 2), 1.23);
});

test('fingerprints ignore key order and sub-millisecond float noise', () => {
  assert.equal(fingerprint('range', { logical: { from: 10.0000001, to: 20 } }), fingerprint('range', { logical: { to: 20, from: 10 } }));
  assert.notEqual(fingerprint('range', { logical: { from: 10, to: 20 } }), fingerprint('crosshair', { logical: { from: 10, to: 20 } }));
});

test('echo ledger recognizes late chart callbacks by semantic crosshair anchor', () => {
  let now = 2000;
  const ledger = createEchoLedger({ now: () => now, windowMs: 1000 });
  const inbound = { visible: true, time: 1795467601, logical: 101, point: { x: 13, y: 35 } };
  ledger.remember('crosshair', inbound);
  assert.equal(echoFingerprint('crosshair', inbound),
    echoFingerprint('crosshair', { ...inbound, point: { x: 999, y: 1 } }));
  assert.equal(ledger.matches('crosshair', { ...inbound, point: { x: 999, y: 1 } }), true);
  assert.equal(ledger.matches('crosshair', { ...inbound, time: inbound.time + 1 }), false);
  assert.equal(ledger.matches('range', inbound), false);
  now += 1100;
  assert.equal(ledger.matches('crosshair', inbound), false);
  assert.equal(ledger.size, 0);
});

test('message gate assigns monotonic seq, drops duplicates and suppresses sends while applying', () => {
  const sent = [];
  let now = 1000;
  const gate = createMessageGate({ session: 'session-1', instance: 'pane-a', paneId: 1, post: e => sent.push(e), now: () => now });
  const first = gate.send('crosshair', { visible: true, time: 100, logical: 10.0000001, point: { x: 10, y: 20 } });
  assert.equal(first.seq, 1);
  assert.equal(first.payload.logical, 10);
  assert.equal(gate.send('crosshair', { visible: true, time: 100, logical: 10, point: { x: 10, y: 20 } }), null);
  gate.begin();
  assert.equal(gate.send('symbol', { symbol: 'ETHUSDT' }), null);
  gate.end();
  const second = gate.send('symbol', { symbol: 'ETHUSDT' }, { replyTo: first.seq });
  assert.equal(second.seq, 2);
  assert.equal(second.replyTo, 1);
  assert.equal(sent.length, 2);
  assert.equal(gate.isReply({ replyTo: first.seq }), true);
  assert.equal(gate.isReply({ replyTo: 99 }), false);
  now += 200;
  const third = gate.send('crosshair', { visible: true, time: 100, logical: 10, point: { x: 10, y: 20 } });
  assert.equal(third.seq, 3);
});

test('recent command ledger blocks echo after quantization without blocking other panes', () => {
  const recent = new Map(), now = 5000;
  rememberCommand(recent, 2, 'range', { logical: { from: 100, to: 200 } }, now);
  const echoed = { paneId: 2, type: 'range', payload: { logical: { from: 100.0000001, to: 200 } } };
  assert.equal(isRecentEcho(echoed, recent, now), true);
  assert.equal(isRecentEcho({ ...echoed, paneId: 1 }, recent, now), false);
  assert.equal(isRecentEcho({ ...echoed, type: 'crosshair' }, recent, now), false);
  assert.equal(isRecentEcho(echoed, recent, now + 2000), false);
});
