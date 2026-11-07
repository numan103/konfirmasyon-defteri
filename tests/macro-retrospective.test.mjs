import test from 'node:test';
import assert from 'node:assert/strict';
import { collectRetrospective, parseRealYieldWeek, REAL_YIELD_URL, retrospectiveReport } from '../lib/macro/retrospective.mjs';
import { macroEvents } from '../lib/macro/events.mjs';

const NOW = Date.parse('2026-11-07T09:30:00Z');
const yieldCsv = 'Date,"5 YR","7 YR","10 YR","20 YR","30 YR"\n11/06/2026,2.35,2.48,2.63,2.91,3.07\n11/05/2026,2.33,2.46,2.60,2.90,3.05\n11/02/2026,2.31,2.45,2.62,2.91,3.06\n10/30/2026,2.25,2.42,2.60,2.92,3.08\n10/29/2026,2.31,2.46,2.63,2.92,3.07';
const api = (id, rows) => JSON.stringify({ status: 'REQUEST_SUCCEEDED', Results: { series: [{ seriesID: id, data: rows.map(([period, value]) => ({ year: period.slice(0, 4), period: 'M' + period.slice(5), value: String(value) })) }] } });

const data = () => ({
  period: '2026-10',
  previousPeriod: '2026-09',
  payrolls: { change: 165, previousChange: 60 },
  unemployment: { value: 4.1, previous: 4.2, change: -0.1 },
  yields: { latest: { date: '2026-11-06', value: 2.63 }, previous: { date: '2026-10-30', value: 2.6 }, change: 0.03 },
  cutoff: '2026-11-07T09:30:00.000Z',
  sources: [{ url: 'https://api.bls.gov/x', fetchedAt: '2026-11-07T09:29:00Z', kind: 'primary', text: 'secret body' }],
});

test('weekly real-yield comparison uses the latest official 10-year observation and the prior week', () => {
  const out = parseRealYieldWeek(yieldCsv, NOW);
  assert.equal(out.latest.date, '2026-11-06');
  assert.equal(out.latest.value, 2.63);
  assert.equal(out.previous.date, '2026-10-30');
  assert.equal(out.previous.value, 2.6);
  assert.equal(out.change, 0.03);
  assert.throws(() => parseRealYieldWeek(yieldCsv, Date.parse('2026-12-07T09:30:00Z')), /yield_stale/);
  assert.throws(() => parseRealYieldWeek('Date,"10 YR"\n11/06/2026,2.63\n11/05/2026,2.60', NOW), /yield_week_missing/);
});

test('retrospective text is clearly dated, source-list free and uses only verified numbers', () => {
  const report = retrospectiveReport(data());
  assert.match(report.text, /Geriye dönük veri değerlendirmesi/);
  assert.match(report.text, /165 bin/);
  assert.match(report.text, /60 bin/);
  assert.match(report.text, /%4,2'den %4,1'e/);
  assert.match(report.text, /%2,60 seviyesinden .*%2,63 seviyesine/);
  assert.match(report.text, /30 Ekim–6 Kasım 2026/);
  assert.ok(!/https?:\/\/|\[[A-Z]\d+\]|^[•\-]\s/m.test(report.text));
  assert.ok(report.wordCount <= 200);
  assert.equal(report.telegramFormat, 'retro-v1');
});

test('retrospective collection re-fetches BLS API and Treasury data with reference periods', async () => {
  const out = await collectRetrospective({ now: NOW, read: async url => {
    if (url === REAL_YIELD_URL) return { url, text: yieldCsv, fetchedAt: '2026-11-07T09:29:00Z' };
    if (url.includes('CES000')) return { url, text: api('CES0000000001', [['2026-10', 159293], ['2026-09', 159128], ['2026-08', 159068]]), fetchedAt: '2026-11-07T09:29:00Z' };
    return { url, text: api('LNS14000000', [['2026-10', 4.1], ['2026-09', 4.2], ['2026-08', 4.1]]), fetchedAt: '2026-11-07T09:29:00Z' };
  } });
  assert.equal(out.period, '2026-10');
  assert.equal(out.payrolls.change, 165);
  assert.equal(out.payrolls.previousChange, 60);
  assert.equal(out.unemployment.value, 4.1);
  assert.equal(out.yields.change, 0.03);
  assert.equal(out.sources.length, 3);
  assert.ok(out.sources.every(s => !s.text || s.text.length > 0));
});

function memory() {
  let rev = 0;
  let settings = { revision: '0', payload: { enabled: true, eventUpdatesEnabled: true, testedTargetHash: 'target', approvedTargetHash: 'target' } };
  const updates = new Map();
  const copy = value => value ? structuredClone(value) : null;
  return {
    settings: async () => copy(settings),
    saveSettings: async (row, payload) => { settings = { revision: String(++rev), payload: copy(payload) }; return copy(settings); },
    update: async id => copy(updates.get(id)),
    createUpdate: async (id, payload) => { if (updates.has(id)) return null; const row = { id, revision: String(++rev), payload: copy(payload) }; updates.set(id, row); return copy(row); },
    saveUpdate: async (row, payload) => { const cur = updates.get(row.id); if (!cur || cur.revision !== row.revision) throw new Error('conflict'); const next = { id: row.id, revision: String(++rev), payload: copy(payload) }; updates.set(row.id, next); return copy(next); },
  };
}
function engine({ fail = null } = {}) {
  const store = memory();
  let sends = 0;
  const svc = macroEvents({
    store,
    clock: () => NOW,
    target: async () => ({ chatId: 'chat', threadId: 772, public: { targetHash: 'target' } }),
    retrospective: async () => data(),
    send: async () => { sends++; if (fail === 'throw') throw new Error('timeout'); if (fail === 'http') return { ok: false, http: 400, description: 'bad' }; return { ok: true, result: { message_id: 901 } }; },
  });
  return { store, svc, sends: () => sends };
}

test('retrospective preview never sends and never claims the durable slot', async () => {
  const f = engine();
  const out = await f.svc.retrospective({});
  assert.equal(out.preview, true);
  assert.equal(f.sends(), 0);
  assert.equal(await f.store.update('retro-2026-11-06-2026-10'), null);
});

test('retrospective send requires confirmation and the tested target, then sends exactly once', async () => {
  const f = engine();
  await assert.rejects(() => f.svc.retrospective({ confirmSend: true }), /test_required/);
  await assert.rejects(() => f.svc.retrospective({ confirmSend: true, targetHash: 'other' }), /test_required/);
  assert.equal(f.sends(), 0);
  const out = await f.svc.retrospective({ confirmSend: true, targetHash: 'target' });
  assert.equal(out.phase, 'sent');
  assert.equal(out.messageId, 901);
  assert.equal(f.sends(), 1);
  const row = await f.store.update('retro-2026-11-06-2026-10');
  assert.equal(row.payload.phase, 'sent');
  assert.equal(row.payload.messageId, 901);
  assert.ok(!JSON.stringify(row.payload).includes('secret body'));
  const again = await f.svc.retrospective({ confirmSend: true, targetHash: 'target' });
  assert.equal(again.alreadySent, true);
  assert.equal(f.sends(), 1);
});

test('uncertain or rejected retrospective delivery is never retried blindly', async () => {
  for (const fail of ['throw', 'http']) {
    const f = engine({ fail });
    await assert.rejects(() => f.svc.retrospective({ confirmSend: true, targetHash: 'target' }), /delivery_unknown|telegram_rejected/);
    assert.equal(f.sends(), 1);
    const row = await f.store.update('retro-2026-11-06-2026-10');
    assert.ok(['delivery_unknown', 'delivery_failed'].includes(row.payload.phase));
    const again = await f.svc.retrospective({ confirmSend: true, targetHash: 'target' });
    assert.ok(['delivery_unknown', 'delivery_failed'].includes(again.phase));
    assert.equal(f.sends(), 1);
  }
});
