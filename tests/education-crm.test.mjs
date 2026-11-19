import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordId, sealRecord, openRecord, sanitizeApplication, sanitizeAdminRecord, lessonAllowance, educationInterest, sanitizePurchase, memberPurchaseId,
} from '../lib/education-crm.mjs';
import handler, { sanitizePayload } from '../api/analytics.mjs';
import { educationTotals, educationCSV, filterEducationRecords, groupState, allowance } from '../assets/education-crm-model.mjs';
const NOW = Date.parse('2026-11-18T12:00:00Z'), actor = { id: 'admin-id' };
let serial = 0;
let buyerSerial = 0;
function config(t) {
  const before = process.env.SUPABASE_SERVICE_ROLE;
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-role';
  t.after(() => { if (before === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = before; });
}
const application = overrides => ({ op: 'apply', plan: 'personal', route: 'breakout100k', contact: 'student@example.com', name: 'Öğrenci', note: 'Risk yönetimi desteği', consent: true, ...overrides });
const verified = overrides => ({ ...application(), op: 'save', stage: 'verified', confirmPurchase: true, firstPurchaseConfirmed: true, verification: 'Admin checked purchase #1', privateUsed: 1, groupUsed: 0, ...overrides });
function fixture(t) {
  config(t);
  const buyerId = 'buyer-' + (++buyerSerial);
  let clock = NOW;
  t.mock.method(Date, 'now', () => clock);
  const rows = new Map(), calls = [];
  let outage = false, conflict = false, failPurchaseWrite = false;
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    const u = new URL(url), method = opts.method || 'GET'; calls.push({ u, method, opts });
    if (u.pathname === '/auth/v1/user') {
      const token = opts.headers.Authorization;
      if (token === 'Bearer admin') return Response.json({ id: 'admin-id', email: 'ahmetnuman20@gmail.com' });
      if (token === 'Bearer member') return Response.json({ id: 'member-id', email: 'member@example.com' });
      if (token === 'Bearer buyer') return Response.json({ id: buyerId, email: buyerId + '@example.com' });
      if (token === 'Bearer buyer-other') return Response.json({ id: buyerId + '-other', email: buyerId + '-other@example.com' });
      return Response.json({}, { status: 401 });
    }
    if (u.pathname !== '/rest/v1/edu_shared') throw new Error('Unexpected URL');
    assert.equal(opts.headers.apikey, 'test-service-role', 'no publishable-key fallback for private records');
    if (outage) return Response.json({}, { status: 503 });
    const id = u.searchParams.get('id')?.replace(/^eq\./, '');
    if (method === 'GET') {
      const result = u.searchParams.get('id')?.startsWith('like.') ? [...rows.values()] : rows.has(id) ? [rows.get(id)] : [];
      return Response.json(structuredClone(result));
    }
    if (method === 'POST') {
      const body = JSON.parse(opts.body);
      if (failPurchaseWrite && body.id?.startsWith('educrm_')) { failPurchaseWrite = false; return Response.json({}, { status: 503 }); }
      if (rows.has(body.id)) return Response.json({}, { status: 409 });
      rows.set(body.id, body); return Response.json([body], { status: 201 });
    }
    const row = rows.get(id), revision = u.searchParams.get('updated_at')?.replace(/^eq\./, '');
    if (conflict || !row || row.updated_at !== revision) return Response.json([]);
    if (method === 'DELETE') { rows.delete(id); return Response.json([row]); }
    const next = { ...row, ...JSON.parse(opts.body) }; rows.set(id, next); return Response.json([next]);
  });
  async function request(body, token = '', method = body ? 'POST' : 'GET') {
    clock += 31000;
    let data;
    const res = { statusCode: 200, setHeader() {}, end(text) { data = JSON.parse(text); } };
    await handler({ method, query: { education: '1' }, headers: token ? { authorization: 'Bearer ' + token } : {}, body }, res);
    return { status: res.statusCode, body: data };
  }
  return { rows, calls, request, buyerId, contact: 'student' + (++serial) + '@example.com', failPurchaseWrite: () => { failPurchaseWrite = true; }, setOutage: value => { outage = value; }, setConflict: value => { conflict = value; } };
}
test('private CRM records are authenticated encrypted and bound to the exact row ID', t => {
  config(t);
  const id = recordId('private@example.com', 'personal', 'cash');
  const data = sealRecord(id, { contact: 'private@example.com', stage: 'verified' });
  assert.ok(!JSON.stringify(data).includes('private@example.com'));
  assert.equal(openRecord(id, data).stage, 'verified');
  assert.throws(() => openRecord(recordId('other@example.com', 'personal', 'cash'), data));
  assert.throws(() => openRecord(id, { contact: 'plaintext@example.com' }));
});
test('application consent and contact are required; customer claims never become approval, amounts or lesson rights', () => {
  const row = sanitizeApplication(application({ stage: 'verified', memberId: 'forged', cashReceivedUsd: 250, privateAllowance: 100 }), { id: 'real-user' }, NOW);
  assert.equal(row.stage, 'applied'); assert.equal(row.memberId, 'real-user'); assert.equal(row.cashReceivedUsd, null);
  assert.equal(row.privateAllowance, null); assert.equal(row.privateUsed, 0); assert.equal(row.firstPurchaseConfirmed, false);
  assert.throws(() => sanitizeApplication(application({ consent: false }), null), /consent_required/);
  assert.throws(() => sanitizeApplication(application({ contact: 'invalid' }), null), /invalid_contact/);
  assert.throws(() => sanitizeApplication(application({ plan: 'video', route: 'breakout100k' }), null), /invalid_package/);
});
test('admin approval requires evidence and separate first-purchase validation; no estimated income is manufactured', () => {
  assert.throws(() => sanitizeAdminRecord(verified({ confirmPurchase: false }), null, actor, NOW), /verification_required/);
  assert.throws(() => sanitizeAdminRecord(verified({ verification: '' }), null, actor, NOW), /verification_required/);
  assert.throws(() => sanitizeAdminRecord(verified({ firstPurchaseConfirmed: false }), null, actor, NOW), /first_purchase_required/);
  const row = sanitizeAdminRecord(verified(), null, actor, NOW);
  assert.equal(row.privateAllowance, 4); assert.equal(row.groupAllowance, 4);
  assert.equal(row.cashReceivedUsd, null); assert.equal(row.commissionReceivedUsd, null);
  assert.equal(row.audit[0].actor, 'admin-id');
  assert.deepEqual(lessonAllowance('personal', 'cash'), { privateLessons: 2, groupLessons: 4 });
  assert.throws(() => sanitizeAdminRecord(verified({ route: 'cash', privateUsed: 3 }), null, actor), /invalid_lesson_count/);
  assert.throws(() => sanitizeAdminRecord(verified({ groupStart: '2026-02-30', groupEnd: '2026-03-30' }), null, actor), /invalid_date/);
  assert.throws(() => sanitizeAdminRecord(verified({ groupStart: '2026-12-01', groupEnd: '2026-11-01' }), null, actor), /invalid_group_period/);
});
test('non-admins cannot list, approve, change usage or erase private records', async t => {
  const f = fixture(t);
  assert.equal((await f.request()).status, 401);
  assert.equal((await f.request(undefined, 'member')).status, 403);
  assert.equal((await f.request(verified(), 'member')).status, 403);
  assert.equal((await f.request({ op: 'erase', id: 'anything' }, 'member')).status, 403);
  assert.equal(f.calls.filter(call => call.u.pathname.includes('/rest/')).length, 0);
});
test('missing service configuration and invalid bearer tokens fail before private storage', async t => {
  const f = fixture(t);
  assert.equal((await f.request(application({ contact: f.contact }), 'invalid')).status, 401);
  delete process.env.SUPABASE_SERVICE_ROLE;
  assert.equal((await f.request(application({ contact: f.contact }))).status, 503);
  assert.equal(f.calls.filter(call => call.u.pathname.includes('/rest/')).length, 0);
});
test('corrupt ciphertext cannot appear as a valid empty CRM report', async t => {
  const f = fixture(t), id = recordId(f.contact, 'video', 'cash');
  f.rows.set(id, { id, data: { enc: 'educrm1', iv: 'bad', tag: 'bad', ct: 'bad' }, updated_at: new Date(NOW).toISOString() });
  const result = await f.request(undefined, 'admin');
  assert.equal(result.status, 503); assert.equal(Object.hasOwn(result.body, 'records'), false);
});
test('a real application persists encrypted, publicly returns no contact details and uses only server identity', async t => {
  const f = fixture(t);
  const result = await f.request(application({ contact: f.contact, memberId: 'forged', stage: 'verified' }), 'member');
  assert.equal(result.status, 200); assert.equal(result.body.status, 'received');
  assert.ok(!JSON.stringify(result.body).includes(f.contact));
  const [row] = f.rows.values(), data = openRecord(row.id, row.data);
  assert.match(result.body.reference, /^EDU-[a-f0-9]{16}$/);
  assert.notEqual(result.body.reference, row.id, 'public acknowledgements never expose the storage ID');
  assert.equal(data.stage, 'applied'); assert.equal(data.memberId, 'member-id');
  assert.ok(!JSON.stringify(row.data).includes(f.contact));
  const list = await f.request(undefined, 'admin');
  assert.equal(list.body.records[0].contact, f.contact);
  assert.equal(Object.hasOwn(list.body.records[0], 'audit'), false);
});
test('repeated public applications cannot overwrite approval, financials or consumed lessons', async t => {
  const f = fixture(t);
  const created = await f.request(verified({ contact: f.contact, commissionReceivedUsd: 123.45 }), 'admin');
  const saved = created.body.record;
  assert.equal(saved.privateAllowance, 4);
  await f.request(application({ contact: f.contact, stage: 'applied', cashReceivedUsd: 999, privateUsed: 0, note: 'Follow-up' }));
  assert.equal(f.rows.size, 1);
  const after = (await f.request(undefined, 'admin')).body.records[0];
  assert.equal(after.stage, 'verified'); assert.equal(after.commissionReceivedUsd, 123.45);
  assert.equal(after.privateUsed, 1); assert.equal(after.privateAllowance, 4);
  assert.equal(after.lastApplication.note, 'Follow-up');
});
test('explicit application advances a manual interest, never a bare click', async t => {
  const f = fixture(t);
  await f.request(verified({ contact: f.contact, stage: 'interested', confirmPurchase: false, privateUsed: 0 }), 'admin');
  await f.request(application({ contact: f.contact }));
  const record = (await f.request(undefined, 'admin')).body.records[0];
  assert.equal(record.stage, 'applied'); assert.equal(record.privateAllowance, null);
});
test('stale and concurrently changed records fail closed instead of silently overwriting', async t => {
  const f = fixture(t), created = (await f.request(verified({ contact: f.contact }), 'admin')).body.record;
  const stale = await f.request({ ...verified({ contact: f.contact }), id: created.id, revision: 'old' }, 'admin');
  assert.equal(stale.status, 409);
  f.setConflict(true);
  const racing = await f.request({ ...verified({ contact: f.contact }), id: created.id, revision: created.revision }, 'admin');
  assert.equal(racing.status, 409);
});
test('storage failures never claim success or return a fake empty CRM', async t => {
  const f = fixture(t); f.setOutage(true);
  assert.equal((await f.request(application({ contact: f.contact }))).status, 503);
  assert.equal((await f.request(undefined, 'admin')).status, 503);
  assert.equal(f.rows.size, 0);
});
test('personal data erasure is explicit, admin-only and revision protected', async t => {
  const f = fixture(t), created = (await f.request(verified({ contact: f.contact }), 'admin')).body.record;
  assert.equal((await f.request({ op: 'erase', id: created.id, revision: created.revision }, 'admin')).status, 400);
  assert.equal((await f.request({ op: 'erase', id: created.id, revision: 'stale', confirmation: 'ERASE' }, 'admin')).status, 409);
  assert.equal(f.rows.size, 1);
  assert.equal((await f.request({ op: 'erase', id: created.id, revision: created.revision, confirmation: 'ERASE' }, 'admin')).status, 200);
  assert.equal(f.rows.size, 0);
});
test('product clicks are whitelisted, deduplicated by visitor and never counted as purchases', () => {
  const t = new Date(NOW).toISOString();
  const payload = sanitizePayload({ sid: 'session_123', clicks: [{ t, kind: 'cta', label: 'Apply', product: 'education', plan: 'personal', route: 'breakout100k', stage: 'verified', cashReceivedUsd: 250 }] }, NOW);
  assert.equal(payload.clicks[0].product, 'education');
  assert.equal(Object.hasOwn(payload.clicks[0], 'stage'), false);
  const visit = { sid: 'session_123', vid: 'visitor123', last: t, pages: { eduplans: { v: 1 } }, clicks: payload.clicks };
  const summary = educationInterest([{ data: visit }, { data: { ...visit, sid: 'another' } }, { data: { ...visit, admin: true } }, { data: { ...visit, bot: true } }], { now: NOW });
  assert.equal(summary.viewers, 1); assert.equal(summary.interestedVisitors, 1); assert.equal(summary.plans.personal, 1);
  assert.equal(Object.hasOwn(summary, 'purchases'), false);
});
test('CRM totals count only explicitly entered amounts in confirmed records and CSV cells cannot execute formulas', () => {
  const confirmed = sanitizeAdminRecord(verified({ name: '=HYPERLINK("bad")', cashReceivedUsd: '', commissionReceivedUsd: '123.45', groupStart: '2026-11-01', groupEnd: '2026-12-01' }), null, actor, NOW);
  const records = [confirmed, { ...confirmed, stage: 'applied', contact: 'other@example.com', cashReceivedUsd: 999 }];
  const total = educationTotals(records);
  assert.equal(total.cash, null); assert.equal(total.commission, 123.45); assert.equal(total.verified, 1);
  assert.equal(educationTotals([{ ...confirmed, cashReceivedUsd: 0 }]).cash, 0, 'explicit zero is distinct from unknown');
  assert.equal(total.privateRemaining, 3);
  assert.equal(groupState(confirmed, '2026-12-01'), 'expired');
  assert.equal(groupState(confirmed, '2026-11-18'), 'active');
  assert.equal(filterEducationRecords(records, { stage: 'applied' }).length, 1);
  assert.ok(educationCSV(records).includes("'=HYPERLINK"));
  assert.deepEqual(allowance(confirmed), { private: 4, group: 4 });
});
const purchase = overrides => ({ op: 'submitPurchase', plan: 'video', route: 'cash', txid: 'a'.repeat(64), consent: true, acknowledgePending: true, ...overrides });
test('purchase evidence requires a logged-in member and never accepts client payment/approval claims', async t => {
  const f = fixture(t);
  assert.equal((await f.request(purchase())).status, 401);
  const result = await f.request(purchase({ plan: 'personal', amount: 1, recipient: 'attacker', stage: 'verified', cashReceivedUsd: 250, memberId: 'forged' }), 'buyer');
  assert.equal(result.status, 200); assert.equal(result.body.status, 'pending_review');
  const id = memberPurchaseId(f.buyerId, 'personal', 'cash'), data = openRecord(id, f.rows.get(id).data);
  assert.equal(data.memberId, f.buyerId); assert.equal(data.stage, 'applied'); assert.equal(data.cashReceivedUsd, null);
  assert.equal(data.privateAllowance, null); assert.equal(data.evidence.verified, false);
  assert.equal(data.evidence.expectedAmount, 250);
  assert.equal(data.evidence.recipient, 'TPipnkFzdUF8Vb5cPpuwNLyRR6wcePxqG6');
  assert.equal(data.evidence.currency, 'USDT'); assert.equal(data.evidence.network, 'TRC20');
  assert.ok(!JSON.stringify(result.body).includes('a'.repeat(64)));
});
test('TRC20 and Breakout evidence have strict required fields without granting payment approval', () => {
  const buyer = { id: 'buyer', email: 'buyer@example.com' };
  assert.throws(() => sanitizePurchase(purchase({ txid: 'short' }), buyer), /invalid_txid/);
  assert.throws(() => sanitizePurchase(purchase({ acknowledgePending: false }), buyer), /pending_ack_required/);
  assert.throws(() => sanitizePurchase(purchase({ consent: false }), buyer), /consent_required/);
  const claim = purchase({ plan: 'personal', route: 'breakout100k', breakoutEmail: 'buyer@example.com', accountId: 'ACC123', orderId: 'ORDER123', accountType: 'classic', firstPurchaseClaim: true, firstPurchaseConfirmed: true });
  const record = sanitizePurchase(claim, buyer);
  assert.equal(record.evidence.accountSize, '100K'); assert.equal(record.evidence.partnerCode, 'ALFA');
  assert.equal(record.firstPurchaseConfirmed, false); assert.equal(record.stage, 'applied');
  assert.throws(() => sanitizePurchase({ ...claim, accountType: 'pro' }, buyer), /invalid_account_type/);
  assert.throws(() => sanitizePurchase({ ...claim, firstPurchaseClaim: false }, buyer), /first_purchase_claim_required/);
});
test('member status is identity-bound and excludes admin notes, audits and other applicants', async t => {
  const f = fixture(t);
  await f.request(purchase(), 'buyer');
  const id = memberPurchaseId(f.buyerId, 'video', 'cash');
  const row = f.rows.get(id), stored = openRecord(id, row.data);
  stored.adminNote = 'PRIVATE ADMIN NOTE'; stored.audit = [{ actor: 'admin-id', to: 'applied' }];
  row.data = sealRecord(id, stored);
  async function mine(token) {
    let out, status;
    const res = { setHeader() {}, end(value) { out = JSON.parse(value); }, set statusCode(n) { status = n; }, get statusCode() { return status; } };
    await handler({ method: 'GET', query: { education: '1', mine: '1' }, headers: { authorization: 'Bearer ' + token } }, res);
    return { status, out };
  }
  const own = await mine('buyer'), other = await mine('buyer-other');
  assert.equal(own.status, 200); assert.equal(own.out.applications.length, 1);
  assert.equal(other.out.applications.length, 0);
  assert.ok(!JSON.stringify(own.out).includes('PRIVATE ADMIN NOTE'));
  assert.ok(!JSON.stringify(own.out).includes('admin-id'));
});
test('the same TXID cannot back two education claims and duplicate errors reveal no other member', async t => {
  const f = fixture(t);
  assert.equal((await f.request(purchase(), 'buyer')).status, 200);
  const collision = await f.request(purchase({ plan: 'live' }), 'buyer-other');
  assert.equal(collision.status, 409); assert.equal(collision.body.error, 'evidence_already_submitted');
  assert.ok(!JSON.stringify(collision.body).includes(f.buyerId));
  assert.equal([...f.rows.keys()].filter(id => id.startsWith('educrm_')).length, 1);
});
test('resubmitting evidence cannot overwrite an approved purchase or its rights', async t => {
  const f = fixture(t);
  await f.request(purchase(), 'buyer');
  const id = memberPurchaseId(f.buyerId, 'video', 'cash'), row = f.rows.get(id), data = openRecord(id, row.data);
  data.stage = 'verified'; data.cashReceivedUsd = 50; data.privateAllowance = 0; data.adminNote = 'Checked on-chain';
  row.data = sealRecord(id, data);
  const repeat = await f.request(purchase({ txid: 'b'.repeat(64) }), 'buyer');
  assert.equal(repeat.body.status, 'already_verified');
  const after = openRecord(id, f.rows.get(id).data);
  assert.equal(after.stage, 'verified'); assert.equal(after.cashReceivedUsd, 50);
  assert.equal(after.evidence.txid, 'a'.repeat(64)); assert.equal(after.adminNote, 'Checked on-chain');
});
test('purchase retries are idempotent and a reserved proof remains retryable after a failed record write', async t => {
  const f = fixture(t); f.failPurchaseWrite();
  assert.equal((await f.request(purchase(), 'buyer')).status, 503);
  assert.equal([...f.rows.keys()].filter(id => id.startsWith('educrm_')).length, 0);
  assert.equal((await f.request(purchase(), 'buyer')).status, 200);
  const id = memberPurchaseId(f.buyerId, 'video', 'cash'), stamp = f.rows.get(id).updated_at;
  const repeat = await f.request(purchase(), 'buyer');
  assert.equal(repeat.body.duplicate, true); assert.equal(f.rows.get(id).updated_at, stamp);
  assert.equal([...f.rows.keys()].filter(id => id.startsWith('educrm_')).length, 1);
});
