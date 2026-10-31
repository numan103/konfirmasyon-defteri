import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { journalEntriesText, buildCoachContext, buildReflectContext } from '../ayna-server/context.mjs';
import { localDate } from '../ayna-server/time.mjs';
import { aiErrorCode } from '../ayna-server/ai-error.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const uid = '22222222-2222-4222-8222-222222222222';
const today = localDate();
const marker = 'ASİL OLAY GÜNLÜĞÜN SONUNDA';
const entry = { id, kind: 'evening', local_date: today, body: 'Günün notu. '.repeat(180) + marker, intention: 'Önceliğim', sleep_hours: 6, pleasantness: 0, energy: -2, mood_words: ['yorgun'] };

test('day context preserves journal ending, priority, sleep and emotions', () => {
  const text = journalEntriesText([entry], today);
  for (const value of [marker, 'Önceliğim', 'Uyku: 6', 'Hoşluk: 0', 'Enerji: -2', 'yorgun']) assert.ok(text.includes(value), value);
  assert.match(journalEntriesText([], today), /kaydedilmiş günlük yok/);
});

test('coach and reflection both load full current-day journal scoped to its owner', async () => {
  const oldFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const path = String(url);
    calls.push(path);
    const data = path.includes('ayna_entries?') ? [entry] : [];
    return new Response(JSON.stringify(data), { status: 200 });
  };
  try {
    const profile = { user_id: uid, display_name: 'Test' };
    const coach = await buildCoachContext({ jwt: 'mock' }, profile, 'Bugünkü günlüğümü değerlendir', 'chat');
    const reflect = await buildReflectContext({ jwt: 'mock' }, profile, entry);
    assert.ok(coach.text.includes(marker));
    assert.ok(reflect.text.includes(marker));
    assert.ok(coach.entryIds.includes(id));
    assert.ok(reflect.entryIds.includes(id));
    const dayCalls = calls.filter((p) => p.includes('ayna_entries?') && p.includes(`local_date=eq.${today}`));
    assert.ok(dayCalls.length >= 2);
    assert.ok(dayCalls.every((p) => p.includes(`user_id=eq.${uid}`)));
  } finally { global.fetch = oldFetch; }
});

test('service errors distinguish configuration, provider quota and database failures without details', () => {
  assert.equal(aiErrorCode(new Error('openai 429 insufficient_quota')), 'provider_busy');
  assert.equal(aiErrorCode(new Error('no_provider_key')), 'ai_unconfigured');
  assert.equal(aiErrorCode(new Error('groq 401 rejected')), 'ai_unconfigured');
  assert.equal(aiErrorCode(new Error('openai network AbortError')), 'timeout');
  assert.equal(aiErrorCode(new Error('db GET ayna_entries 403')), 'server_error');
});

test('journal review shortcut prepares an explicit request and failures remain visible', () => {
  const client = fs.readFileSync(new URL('../ayna/ayna-coach.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../ayna-server/actions/coach.mjs', import.meta.url), 'utf8');
  assert.ok(client.includes('ta.dataset.reviewDay'));
  assert.ok(client.includes('review_day: reviewDay'));
  assert.ok(client.includes('id="ay-coach-error"'));
  assert.ok(server.includes('body.review_day === true ? GOREV_GUNLUK'));
});
