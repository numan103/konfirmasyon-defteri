import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanBiases, persistBiases, listBiasBeliefs, rejectedBiasLabels, BIAS_LABELS, BIAS_PREFIX } from '../ayna-server/biases.mjs';
import { tradeNotesText } from '../ayna-server/context.mjs';

const uid = '22222222-2222-4222-8222-222222222222';
const bid = '33333333-3333-4333-8333-333333333333';

const observation = 'İki notta da stop sonrası aynı gün yeniden giriş yazmışsın.';

function mockFetch(handler) {
  const calls = [];
  const old = global.fetch;
  global.fetch = async (url, options = {}) => {
    const entry = { url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null };
    calls.push(entry);
    return handler(entry);
  };
  return { calls, restore() { global.fetch = old; } };
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('only closed-vocabulary, evidence-shaped observations survive cleaning', () => {
  const cleaned = cleanBiases([
    { code: 'revenge_trading', observation, question: 'Ne hissettin?', evidence: ['30 Ekim BTC notu'] },
    { code: 'revenge_trading', observation: 'aynı kod tekrar', question: '', evidence: [] },
    { code: 'not_a_bias', observation, question: '', evidence: [] },
    { code: 'fomo', observation: 'kısa', question: '', evidence: [] },
    null,
    { code: 'fomo', observation: 'Notlarda iki kez kaçırma korkusuyla girdiğini yazmışsın.', question: 'Bu senin için doğru mu?', evidence: ['12 Ekim ETH notu', '12 Ekim ETH notu'] }
  ]);
  assert.equal(cleaned.length, 2);
  assert.equal(cleaned[0].code, 'revenge_trading');
  assert.equal(cleaned[0].label, BIAS_LABELS.revenge_trading);
  assert.deepEqual(cleaned[1].evidence, ['12 Ekim ETH notu']);
  assert.equal(BIAS_LABELS.outcome_bias, 'Sonuca göre karar değerlendirme');
});

test('a new observation is proposed, never confirmed', async () => {
  const mock = mockFetch((call) => {
    if (call.url.includes('ayna_beliefs') && call.method === 'GET') return json([]);
    if (call.url.includes('ayna_beliefs') && call.method === 'POST') return json([Object.assign({ id: bid, status: 'proposed' }, call.body[0])]);
    return json([]);
  });
  try {
    const saved = await persistBiases({ service: true }, uid, [{ code: 'fomo', observation, evidence: ['30 Ekim BTC notu'] }], []);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].status, 'proposed');
    assert.equal(saved[0].hidden, false);
    assert.equal(saved[0].belief_id, bid);
    const insert = mock.calls.find((call) => call.method === 'POST');
    assert.equal(insert.body[0].status, 'proposed');
    assert.equal(insert.body[0].statement, BIAS_PREFIX + BIAS_LABELS.fomo + ' — ' + observation);
  } finally { mock.restore(); }
});

test('rejected labels are not resurrected and confirmed ones are left alone', async () => {
  const existing = [
    { id: bid, statement: BIAS_PREFIX + BIAS_LABELS.fomo + ' — eski gözlem', status: 'rejected', evidence: [], correction: 'Bana uymuyor' },
    { id: '44444444-4444-4444-8444-444444444444', statement: BIAS_PREFIX + BIAS_LABELS.sunk_cost + ' — eski gözlem', status: 'corrected', evidence: [], correction: 'Aslında planlıydı' }
  ];
  const mock = mockFetch((call) => {
    if (call.url.includes('ayna_beliefs') && call.method === 'GET') return json(existing);
    return json([]);
  });
  try {
    const saved = await persistBiases({ service: true }, uid, [
      { code: 'fomo', observation, evidence: ['yeni not'] },
      { code: 'sunk_cost', observation, evidence: ['yeni not'] }
    ], []);
    assert.equal(saved[0].status, 'rejected');
    assert.equal(saved[0].hidden, true);
    assert.equal(saved[1].status, 'corrected');
    assert.equal(saved[1].hidden, true);
    assert.equal(mock.calls.some((call) => call.method === 'POST' || call.method === 'PATCH'), false);
  } finally { mock.restore(); }
});

test('a still-proposed observation is updated in place instead of duplicated', async () => {
  const existing = [{ id: bid, statement: BIAS_PREFIX + BIAS_LABELS.fomo + ' — eski gözlem', status: 'proposed', evidence: ['eski not'], correction: null }];
  const mock = mockFetch((call) => {
    if (call.url.includes('ayna_beliefs') && call.method === 'GET') return json(existing);
    if (call.method === 'PATCH') return json([Object.assign({ id: bid }, call.body)]);
    return json([]);
  });
  try {
    const saved = await persistBiases({ service: true }, uid, [{ code: 'fomo', observation, evidence: ['yeni not'] }], []);
    assert.equal(saved[0].status, 'proposed');
    assert.deepEqual(saved[0].evidence, ['eski not', 'yeni not']);
    const patch = mock.calls.find((call) => call.method === 'PATCH');
    assert.ok(patch.url.includes('id=eq.' + bid));
    assert.ok(patch.url.includes('user_id=eq.' + uid));
  } finally { mock.restore(); }
});

test('listed and rejected beliefs keep their label and correction', async () => {
  const rows = [
    { id: bid, statement: BIAS_PREFIX + BIAS_LABELS.anchoring + ' — iki notta giriş fiyatına bağlı kaldın.', status: 'corrected', evidence: ['not 1'], correction: 'Aslında stop seviyesiydi.' }
  ];
  const mock = mockFetch(() => json(rows));
  try {
    const list = await listBiasBeliefs({ service: true }, uid);
    assert.equal(list[0].code, 'anchoring');
    assert.equal(list[0].label, BIAS_LABELS.anchoring);
    assert.equal(list[0].correction, 'Aslında stop seviyesiydi.');
    assert.ok(mock.calls[0].url.includes('status=in.(proposed,confirmed,corrected)'));
    const rejected = await rejectedBiasLabels({ service: true }, uid);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].startsWith(BIAS_PREFIX));
  } finally { mock.restore(); }
});

test('trade notes reach the coach verbatim and absence forbids inference', async () => {
  const rows = [
    { local_date: '2026-10-30', symbol: 'BTC', direction: 'short', pnl: -1, planned: false, note: 'Stop sonrası tekrar girdim.', source: 'notion' },
    { local_date: '2026-10-29', symbol: 'ETH', direction: 'long', pnl: 2, planned: true, note: '', source: 'site' }
  ];
  const mock = mockFetch((call) => json(call.url.includes('ayna_trades?') ? rows : []));
  try {
    const text = await tradeNotesText({ service: true }, uid, '2026-10-01', '2026-10-31');
    assert.ok(text.includes('Stop sonrası tekrar girdim.'));
    assert.ok(text.includes('Notion'));
    assert.ok(text.includes('plan dışı'));
    assert.equal(text.includes('ETH'), false);
    assert.match(text, /kanıt olarak kullan/);
    const url = mock.calls[0].url;
    assert.ok(url.includes('user_id=eq.' + uid));
    assert.ok(url.includes('note=not.is.null'));
  } finally { mock.restore(); }

  const empty = mockFetch(() => json([]));
  try {
    const text = await tradeNotesText({ service: true }, uid, '2026-10-01', '2026-10-31');
    assert.match(text, /Not yoksa bilişsel hata çıkarımı yapma/);
  } finally { empty.restore(); }
});

test('reflection persists bias proposals only outside a crisis', () => {
  const reflect = fs.readFileSync(new URL('../ayna-server/actions/reflect.mjs', import.meta.url), 'utf8');
  assert.ok(reflect.includes('allowBiases && risk !== \'crisis\''));
  assert.ok(reflect.includes('persistBiases'));
  assert.ok(reflect.includes('biases: biases.filter((b) => !b.hidden)'));
});

test('coach context carries trade notes and rejected bias labels', () => {
  const context = fs.readFileSync(new URL('../ayna-server/context.mjs', import.meta.url), 'utf8');
  assert.ok(context.includes('tradeNotesText(auth, userId, addDays(today, -20), today)'));
  assert.ok(context.includes('tradeNotesText(auth, userId, addDays(entry.local_date, -20), entry.local_date)'));
  assert.ok(context.includes('reddettiği bilişsel hata yorumları'));
  const tools = fs.readFileSync(new URL('../ayna-server/tools.mjs', import.meta.url), 'utf8');
  assert.ok(tools.includes('"biases"'));
  assert.ok(tools.includes('"revenge_trading"'));
  const prompts = fs.readFileSync(new URL('../ayna-server/prompts.mjs', import.meta.url), 'utf8');
  assert.ok(prompts.includes('bilişsel hata'));
  assert.ok(prompts.includes('reddettiği bir bilişsel hata yorumunu yeni kanıt olmadan tekrar açma'));
});

test('the journal page mounts the bias card and Notion sync', () => {
  const today = fs.readFileSync(new URL('../ayna/ayna-today.js', import.meta.url), 'utf8');
  assert.ok(today.includes('id="ay-bias-card"'));
  assert.ok(today.includes('Ayna.bias.pending(c)'));
  assert.ok(today.includes('Ayna.notion.mount(c)'));
  assert.ok(today.includes('Ayna.bias.attach(c, biases)'));
  assert.ok(today.includes('note,source'));
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('/ayna/ayna-notion.js?v=1'));
  assert.ok(html.includes('/ayna/ayna-bias.js?v=1'));
});
