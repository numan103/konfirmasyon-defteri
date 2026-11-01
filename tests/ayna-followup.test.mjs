import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import followup from '../ayna-server/actions/journal-followup.mjs';
import reflect from '../ayna-server/actions/reflect.mjs';
import coach from '../ayna-server/actions/coach.mjs';
import { followupContext } from '../ayna-server/followups.mjs';
import { localDate, addDays } from '../ayna-server/time.mjs';

const uid = '11111111-1111-4111-8111-111111111111';
const entryId = '22222222-2222-4222-8222-222222222222';
const insightId = '33333333-3333-4333-8333-333333333333';
const otherId = '44444444-4444-4444-8444-444444444444';
const profile = { user_id: uid, display_name: 'Test' };

async function withStore(work) {
  const originalFetch = global.fetch;
  const previous = { provider: process.env.AYNA_PROVIDER, key: process.env.OPENAI_API_KEY };
  const tables = {
    ayna_insights: [{ id: insightId, user_id: uid, kind: 'daily', source_entry_id: entryId, title: 'Eski analiz', body: 'Bu bir koç varsayımı.', period_start: localDate(), focus: 'Yarın 10 dakika ayır' }],
    ayna_entries: [{ id: entryId, user_id: uid, kind: 'evening', local_date: localDate(), body: 'Bugün zorlandım.' }],
    ayna_chat_messages: [], ayna_decisions: [], ayna_usage: []
  };
  let counter = 0, modelCalls = 0, modelFailure = false, linkFailure = false;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('api.openai.com')) {
      modelCalls++;
      if (modelFailure) return Response.json({ error: { code: 'invalid_request_error' } }, { status: 400 });
      const request = JSON.parse(options.body);
      const name = request.tools[0].function.name;
      const input = name === 'record_reflection'
        ? { title: 'Yeni analiz', body: 'Yeni değerlendirme.', small_step: 'Yarın 5 dakika düşün', evidence_entry_ids: [entryId], risk: 'none' }
        : { message: 'Düzeltmeni dikkate alıyorum.', evidence_entry_ids: [entryId], risk: 'none' };
      return Response.json({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name, arguments: JSON.stringify(input) } }] } }], usage: {} });
    }
    const u = new URL(String(url));
    const table = u.pathname.split('/').pop();
    const method = options.method || 'GET';
    requests.push({ table, method, url: u, body: options.body ? JSON.parse(options.body) : null });
    if (linkFailure && table === 'ayna_insights' && method === 'PATCH' && JSON.parse(options.body).decision_id) {
      linkFailure = false;
      return Response.json({ message: 'temporary database error' }, { status: 500 });
    }
    if (!tables[table]) tables[table] = [];
    let rows = tables[table].filter((row) => {
      for (const [key, value] of u.searchParams) {
        if (value.startsWith('eq.') && row[key] !== value.slice(3)) return false;
        if (value === 'not.is.null' && row[key] == null) return false;
        if (value.startsWith('in.(') && !value.slice(4, -1).split(',').includes(row[key])) return false;
        if (value.startsWith('cs.') && !JSON.parse(value.slice(3)).every((id) => (row[key] || []).includes(id))) return false;
      }
      return true;
    });
    if (method === 'POST') {
      rows = JSON.parse(options.body).map((row) => ({ id: `55555555-5555-4555-8555-${String(++counter).padStart(12, '0')}`, created_at: new Date().toISOString(), ...row }));
      tables[table].push(...rows);
    } else if (method === 'PATCH') rows.forEach((row) => Object.assign(row, JSON.parse(options.body)));
    else if (method === 'DELETE') throw new Error('Existing analysis must never be deleted');
    return Response.json(rows);
  };
  process.env.AYNA_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-only-not-real';
  async function call(action, body) {
    let status, data;
    await action({ auth: { jwt: 'mock' }, user: { id: uid }, profile, body, res: {
      set statusCode(value) { status = value; }, setHeader() {}, end(value) { data = JSON.parse(value); }
    } });
    return { status, data };
  }
  try { await work({ tables, requests, call, modelCalls: () => modelCalls, failModel: () => { modelFailure = true; }, failLink: () => { linkFailure = true; } }); }
  finally {
    global.fetch = originalFetch;
    if (previous.provider === undefined) delete process.env.AYNA_PROVIDER; else process.env.AYNA_PROVIDER = previous.provider;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key;
  }
}

test('reply is saved with original analysis and entry reference without any model call', async () => {
  await withStore(async ({ tables, call, modelCalls }) => {
    const res = await call(followup, { op: 'reply', insight_id: insightId, feedback: 'wrong', message: 'Aslında olay başka türlü oldu.' });
    assert.equal(res.status, 200);
    assert.equal(modelCalls(), 0);
    assert.equal(tables.ayna_insights[0].feedback, 'wrong');
    const saved = tables.ayna_chat_messages[0];
    assert.deepEqual(saved.evidence, [entryId]);
    assert.match(saved.content, /Bu bir koç varsayımı/);
    assert.match(saved.content, /Yanlış anladın/);
    assert.match(saved.content, /Aslında olay başka türlü oldu/);
    const loaded = await call(followup, { op: 'load', insight_id: insightId });
    assert.equal(loaded.data.messages[0].id, saved.id);
    assert.equal(loaded.data.step, null);
  });
});

test('only explicitly accepted steps are saved, outcomes persist, analysis regeneration preserves links', async () => {
  await withStore(async ({ tables, call }) => {
    await call(followup, { op: 'load', insight_id: insightId });
    assert.equal(tables.ayna_decisions.length, 0);
    const accepted = await call(followup, { op: 'step', insight_id: insightId, step: 'Yarın 10 dakika yürü', review_date: addDays(localDate(), 1) });
    assert.equal(accepted.status, 200);
    const step = accepted.data.step;
    assert.equal(tables.ayna_insights[0].decision_id, step.id);
    await call(followup, { op: 'step', insight_id: insightId, step: 'Tekrar', review_date: addDays(localDate(), 1) });
    assert.equal(tables.ayna_decisions.length, 1);
    await call(followup, { op: 'outcome', decision_id: step.id, status: 'not_tried', note: 'Vakit bulamadım.' });
    assert.match(tables.ayna_decisions[0].outcome, /Denemedim\nVakit bulamadım/);
    const renewed = await call(reflect, { entry_id: entryId, kind: 'daily', overview: true });
    assert.equal(renewed.status, 200);
    assert.equal(renewed.data.insight.id, insightId);
    assert.equal(renewed.data.insight.decision_id, step.id);
    assert.equal(renewed.data.insight.focus, 'Yarın 5 dakika düşün');
    assert.equal(tables.ayna_decisions[0].title, 'Küçük adım: Yarın 10 dakika yürü');
    const listed = await call(followup, { op: 'steps' });
    assert.equal(listed.data.steps[0].id, step.id);
  });
});

test('follow-up coaching uses the saved correction without duplicating or extracting quoted analysis', async () => {
  await withStore(async ({ tables, call, requests }) => {
    const saved = await call(followup, { op: 'reply', insight_id: insightId, feedback: 'wrong', message: 'Bu bir örüntü değil.' });
    const result = await call(coach, { mode: 'chat', message: 'Yanıtımı konuşalım', insight_id: insightId, followup_message_id: saved.data.message.id });
    assert.equal(result.status, 200);
    assert.equal(result.data.extract, false);
    assert.equal(tables.ayna_chat_messages.filter((m) => m.role === 'user').length, 1);
    assert.equal(tables.ayna_chat_messages.filter((m) => m.role === 'assistant').length, 1);
    assert.ok(result.data.evidence.includes(entryId));
    assert.ok(requests.filter((r) => r.table === 'ayna_insights' && r.method !== 'POST').every((r) => r.url.searchParams.get('user_id') === `eq.${uid}`));
  });
});

test('foreign or unlinked references and invalid outcomes are refused without writes', async () => {
  await withStore(async ({ tables, call }) => {
    const other = await call(followup, { op: 'reply', insight_id: otherId, feedback: 'wrong', message: 'Not mine' });
    assert.equal(other.status, 404);
    const outcome = await call(followup, { op: 'outcome', decision_id: otherId, status: 'tried', note: '' });
    assert.equal(outcome.status, 404);
    const bad = await call(followup, { op: 'reply', insight_id: insightId, feedback: 'unknown', message: 'test' });
    assert.equal(bad.status, 400);
    assert.equal(tables.ayna_chat_messages.length, 0);
    assert.equal(tables.ayna_decisions.length, 0);
  });
});

test('a failed coach response leaves the saved answer intact', async () => {
  await withStore(async ({ tables, call, failModel }) => {
    const saved = await call(followup, { op: 'reply', insight_id: insightId, feedback: 'useful', message: 'Bunu denemek istiyorum.' });
    failModel();
    const result = await call(coach, { mode: 'chat', message: 'Yanıtımı konuşalım', insight_id: insightId, followup_message_id: saved.data.message.id });
    assert.equal(result.status, 500);
    assert.equal(tables.ayna_chat_messages.length, 1);
    assert.equal(tables.ayna_chat_messages[0].id, saved.data.message.id);
  });
});

test('retry after interrupted step linking and repeated reply requests does not duplicate records', async () => {
  await withStore(async ({ tables, call, failLink }) => {
    const body = { op: 'reply', insight_id: insightId, feedback: 'wrong', message: 'Düzeltmem bu.', request_id: otherId };
    await call(followup, body);
    await call(followup, body);
    assert.equal(tables.ayna_chat_messages.length, 1);
    failLink();
    const stepBody = { op: 'step', insight_id: insightId, step: 'Yarın bir kez dene', review_date: addDays(localDate(), 1) };
    assert.equal((await call(followup, stepBody)).status, 500);
    assert.equal(tables.ayna_decisions.length, 1);
    assert.equal((await call(followup, stepBody)).status, 200);
    assert.equal(tables.ayna_decisions.length, 1);
    assert.equal(tables.ayna_insights[0].decision_id, tables.ayna_decisions[0].id);
  });
});

test('future coaching and weekly reviews receive corrections and step outcomes as testimony, not traits', async () => {
  await withStore(async ({ call }) => {
    await call(followup, { op: 'reply', insight_id: insightId, feedback: 'wrong', message: 'Tahminin yanlış; önceden planlamıştım.' });
    const accepted = await call(followup, { op: 'step', insight_id: insightId, step: 'Bir kez dene', review_date: localDate() });
    await call(followup, { op: 'outcome', decision_id: accepted.data.step.id, status: 'changed', note: 'Daha kısa yaptım.' });
    const context = await followupContext({ jwt: 'mock' }, uid, addDays(localDate(), -6), localDate());
    assert.match(context, /önceden planlamıştım/);
    assert.match(context, /Değiştirdim/);
    assert.match(context, /kişilik etiketi değildir/);
    const weekly = fs.readFileSync(new URL('../ayna-server/jobs/weekly.mjs', import.meta.url), 'utf8');
    assert.ok(weekly.includes('await followupContext(auth, userId, start, end)'));
  });
});
