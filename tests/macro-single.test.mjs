import test from 'node:test';
import assert from 'node:assert/strict';
import { singleTelegram } from '../lib/macro/core.mjs';
import { sendTelegram } from '../lib/telegram.mjs';
import { macroTarget } from '../lib/macro/target.mjs';

test('single message preserves prose and real sources using UTF-16 text-link entities', () => {
  const sources = [{ url: 'https://www.bls.gov/test?a=1&b=2' }, { url: 'https://www.bea.gov/news/test' }];
  const prose = '🔎 Türkçe <b>kaynak talimatı değil</b> & düz metin\n\nKaynaklar';
  const raw = prose + sources.map(s => '\nResmî kaynak\n' + s.url).join('');
  const result = singleTelegram(raw, sources);
  assert.ok(result.text.startsWith(prose));
  assert.equal(result.entities.length, 2);
  for (const [i, entity] of result.entities.entries()) {
    assert.equal(entity.type, 'text_link');
    assert.equal(result.text.slice(entity.offset, entity.offset + entity.length), 'Kaynağı aç');
    assert.equal(entity.url, sources[i].url);
  }
  assert.ok(!result.text.includes('https://'));
  assert.ok(result.text.includes('<b>kaynak talimatı değil</b>'));
});

test('single-message size fails closed without splitting or truncating report text', () => {
  assert.equal(singleTelegram('a'.repeat(3900), []).text.length, 3900);
  assert.ok(3900 + 'TEST GÖNDERİMİ\n'.length < 4096);
  assert.throws(() => singleTelegram('a'.repeat(3901), []), /telegram_length/);
  assert.throws(() => singleTelegram('Kaynak yok', [{ url: 'https://www.bls.gov/test' }]), /telegram_sources/);
  assert.throws(() => singleTelegram('https://evil.test/', [{ url: 'https://evil.test/' }]), /telegram_sources/);
});

test('existing Telegram transport uses explicit link entities but never activates parse_mode', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  const requests = [];
  global.fetch = async (_url, init) => { requests.push(JSON.parse(init.body)); return { status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) }; };
  const entities = [{ type: 'text_link', offset: 0, length: 6, url: 'https://www.bls.gov/' }];
  await sendTelegram('Kaynak', 'one-chat', 772, null, { entities });
  assert.equal(requests[0].message_thread_id, 772);
  assert.deepEqual(requests[0].entities, entities);
  assert.equal(requests[0].parse_mode, undefined);
  await sendTelegram('Portföy bildirimi', 'one-chat', 434);
  assert.equal(requests[1].message_thread_id, 434);
  assert.equal(requests[1].entities, undefined);
});

test('macro topic override changes approval fingerprint without changing portfolio topic', async t => {
  const keys = ['TG_CHAT_ID', 'TG_PREMIUM_CHAT_ID', 'TG_BOT_TOKEN', 'TG_THREAD', 'MACRO_TARGET', 'MACRO_TARGET_THREAD'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const oldFetch = global.fetch;
  t.after(() => { global.fetch = oldFetch; for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
  Object.assign(process.env, { TG_CHAT_ID: 'test-chat', TG_BOT_TOKEN: 'test-only', TG_THREAD: '434', MACRO_TARGET: 'public' });
  delete process.env.TG_PREMIUM_CHAT_ID;
  delete process.env.MACRO_TARGET_THREAD;
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: true, result: { id: -123, type: 'supergroup', is_forum: true, title: 'Alfa Traders Public', username: 'alfatraderspublic' } }) });
  const previous = await macroTarget();
  process.env.MACRO_TARGET_THREAD = '772';
  const next = await macroTarget();
  assert.equal(next.threadId, 772);
  assert.equal(next.public.topicUrl, 'https://t.me/alfatraderspublic/772');
  assert.notEqual(next.public.targetHash, previous.public.targetHash);
  assert.equal(process.env.TG_THREAD, '434');
});
