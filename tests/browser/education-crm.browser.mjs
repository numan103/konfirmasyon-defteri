import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith(`--${key}=`))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(path.resolve(arg('playwright'))));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const records = []; let adminReads = 0, writes = 0;
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), admin = request.headers().authorization === 'Bearer crm-admin';
    if (url.pathname === '/api/analytics' && url.searchParams.get('education') === '1') {
      if (request.method() === 'GET' && url.searchParams.get('mine') === '1') return route.fulfill({ json: { ok: true, applications: [] } });
      if (request.method() === 'GET') {
        adminReads++;
        return route.fulfill({ status: admin ? 200 : 403, json: admin ? { ok: true, records, truncated: false } : { ok: false, error: 'admin_required' } });
      }
      const body = request.postDataJSON(); writes++;
      if (body.op === 'submitPurchase') {
        records.push({ id: 'educrm_' + 'a'.repeat(64), revision: '2026-11-18T10:00:00Z', ...body,
          contact: 'student@example.com', evidenceReviewPending: true,
          evidence: { kind: 'breakout', accountSize: '100K', accountType: 'classic', email: body.breakoutEmail, accountId: body.accountId, orderId: body.orderId, partnerCode: 'ALFA' },
          stage: 'applied', source: 'purchase_submission', createdAt: '2026-11-18T10:00:00Z',
          memberId: 'member-id', verification: '', privateUsed: 0, groupUsed: 0, privateAllowance: null, groupAllowance: null,
          cashReceivedUsd: null, commissionReceivedUsd: null, groupStart: null, groupEnd: null, adminNote: '' });
        return route.fulfill({ json: { ok: true, status: 'pending_review', reference: 'EDU-' + 'a'.repeat(16) } });
      }
      if (!admin) return route.fulfill({ status: 403, json: { ok: false, error: 'admin_required' } });
      const row = records.find(r => r.id === body.id);
      Object.assign(row, body, { revision: '2026-11-18T11:00:00Z',
        privateAllowance: 4, groupAllowance: 4, privateUsed: Number(body.privateUsed), groupUsed: Number(body.groupUsed),
        cashReceivedUsd: body.cashReceivedUsd === '' ? null : Number(body.cashReceivedUsd),
        commissionReceivedUsd: body.commissionReceivedUsd === '' ? null : Number(body.commissionReceivedUsd) });
      return route.fulfill({ json: { ok: true, record: row } });
    }
    if (url.pathname === '/api/analytics' && request.method() === 'GET') return route.fulfill({ json: {
      ok: true, totals: {}, sessions: [], range: { days: 7 },
      educationInterest: { days: 7, viewers: 12, interestedVisitors: 4, plans: { video: 1, live: 1, personal: 2 }, truncated: false },
    } });
    if (url.pathname === '/api/access' && url.searchParams.get('op') === 'list') return route.fulfill({ json: { ok: true, rows: [{ user_id: 'another-member', exchange: 'okx', status: 'verified' }], telegram: [] } });
    return route.fulfill({ json: { ok: true, admin, tier: admin ? 'admin' : 'free', episode: null } });
  });
  await page.goto((arg('url') || 'http://127.0.0.1:4186') + '/?page=eduplans');
  await page.locator('[data-edu-apply="personal"][data-edu-route="breakout100k"]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!window.AlfaEduCheckout);
  assert.equal(adminReads, 0, 'anonymous page never loads CRM records');
  await page.evaluate(() => {
    AUTH.user = { id: 'member-id', email: 'student@example.com', user_metadata: { name: 'Student <img src=x>' } };
    window.siteFetch = (url, init = {}) => fetch(url, init);
  });
  await page.locator('[data-edu-apply="personal"][data-edu-route="breakout100k"]').click();
  const application = page.locator('dialog.edu-checkout');
  await application.locator('[name="breakoutEmail"]').fill('student@example.com');
  await application.locator('[name="accountId"]').fill('ACC123');
  await application.locator('[name="orderId"]').fill('ORDER123');
  await application.locator('[name="note"]').fill('Risk yönetimi desteği');
  await application.locator('[name="firstPurchaseClaim"]').check();
  await application.locator('[name="consent"]').check();
  await application.locator('[name="acknowledgePending"]').check();
  await application.locator('button[type="submit"]').click();
  await application.getByRole('status').filter({ hasText: 'Bildirimin kaydedildi' }).waitFor();
  assert.equal(records[0].stage, 'applied');
  assert.equal(records[0].cashReceivedUsd, null);
  await application.getByRole('button', { name: 'Kapat', exact: true }).click();
  await page.evaluate(() => {
    AUTH.user = { id: 'crm-admin-id', email: 'ahmetnuman20@gmail.com' }; SITE.admin = true; SITE.tier = 'admin';
    siteIsAdmin = () => true; showLanding = () => {}; hideLanding();
    window.siteFetch = (url, init = {}) => fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer crm-admin' } });
    showPage('analitik', true);
  });
  const crm = page.locator('#education-crm');
  await crm.locator('[data-education-record]').waitFor();
  assert.match(await crm.innerText(), /12 paket sayfası ziyaretçisi/);
  assert.match(await crm.innerText(), /1 onaylı/);
  assert.equal(await crm.locator('img').count(), 0);
  assert.match(await crm.locator('[data-education-record]').innerText(), /Başvurdu/);
  await crm.locator('[data-education-record] button').click();
  const editor = page.locator('dialog.education-crm-editor');
  await editor.locator('[name="stage"]').selectOption('verified');
  await editor.locator('[name="verification"]').fill('Manual purchase check TEST-1');
  await editor.locator('[name="commissionReceivedUsd"]').fill('200');
  await editor.locator('[name="privateUsed"]').fill('2');
  await editor.locator('[name="groupStart"]').fill('2026-11-01');
  await editor.locator('[name="groupEnd"]').fill('2026-12-01');
  assert.equal(await editor.locator('[name="privateUsed"]').getAttribute('max'), '4');
  const before = writes;
  await editor.locator('button[type="submit"]').click();
  assert.equal(writes, before, 'approval requires explicit confirmation');
  await editor.locator('[name="confirmPurchase"]').check();
  await editor.locator('[name="firstPurchaseConfirmed"]').check();
  await editor.locator('button[type="submit"]').click();
  await editor.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('[data-education-record]')?.textContent.includes('Alımı onaylandı'));
  assert.equal(records[0].stage, 'verified');
  assert.equal(records[0].privateUsed, 2);
  assert.equal(records[0].cashReceivedUsd, null);
  assert.match(await crm.locator('.education-crm-kpi').filter({ hasText: 'Kalan özel ders' }).innerText(), /\b2\b/);
  await crm.locator('.education-crm-toolbar select').first().selectOption('applied');
  assert.equal(await crm.locator('[data-education-record]').count(), 0);
  await crm.locator('.education-crm-toolbar select').first().selectOption('verified');
  assert.equal(await crm.locator('[data-education-record]').count(), 1);
  await page.setViewportSize({ width: 360, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => {
    AUTH.user = null; SITE.admin = false; siteIsAdmin = () => false;
    document.body.classList.add('landed'); AlfaEducationCRM.refreshContext();
  });
  assert.equal(await crm.isVisible(), false);
  assert.equal(await crm.textContent(), '', 'logout clears contact data from the DOM');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, consentedApplication: true, adminOnlyRecords: true, explicitManualApproval: true,
    privateAllowanceFour: true, noAutoRevenue: true, filters: true, mobile: true, logoutClearsPII: true, productionWrites: false, pageErrors: errors }));
} finally { await browser.close(); }
