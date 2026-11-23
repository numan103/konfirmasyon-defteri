// Isolated navigation fixture: no real member login or account impersonation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const arg = key => process.argv.find(s => s.startsWith('--' + key + '='))?.slice(key.length + 3);
const { chromium } = await import(pathToFileURL(arg('playwright')));
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
function source(name) {
  const start = html.indexOf('function ' + name + '(');
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
const tierStart = html.indexOf('const PAGE_TIER = {');
const tiers = html.slice(tierStart, html.indexOf('};', tierStart) + 2);
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.evaluate(html => {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.body.append(parsed.querySelector('.navbar'), parsed.querySelector('.nav-mobile'));
    Object.assign(window, {
      AUTH: { user: null }, ADMIN_EMAIL: 'admin@example.test',
      SITE: { admin: false, tier: 'free', features: { alfacharts: false }, feature_user_id: null },
      SITE_REF_LINKS: {}, currentPage: 'home', infAccess: false, bindAccessForm() {},
    });
  }, html);
  await page.addScriptTag({ content: tiers + '\n' + ['siteIsAdminEmail', 'siteIsAdmin', 'refUnlocked', 'sitePageTier', 'siteCanOpen', 'siteApplyAccess', 'applyTierUi'].map(source).join('\n') });
  const apply = async granted => page.evaluate(granted => {
    siteApplyAccess({ user_id: AUTH.user?.id, tier: 'free', admin: false, features: { alfacharts: granted } });
    applyTierUi();
  }, granted);
  await apply(false);
  assert.equal(await page.locator('#tab-alfacharts').isVisible(), false);
  await page.evaluate(() => { AUTH.user = { id: 'fixture-tester', email: 'tester@example.test' }; });
  await apply(false);
  assert.equal(await page.locator('#tab-alfacharts').isVisible(), false);
  await apply(true);
  assert.equal(await page.locator('#tab-alfacharts').isVisible(), true);
  assert.equal(await page.locator('#mnav-alfacharts').isVisible(), true);
  assert.equal(await page.locator('#tab-alfacharts').evaluate(el => el.closest('.nav-drop').style.display), '');
  assert.equal(await page.locator('#tab-edustudio').isVisible(), false);
  assert.equal(await page.locator('#tab-ek').isVisible(), false);
  assert.equal(await page.evaluate(() => siteIsAdmin()), false);
  assert.equal(await page.evaluate(() => siteCanOpen('trading')), false);
  await page.evaluate(() => { AUTH.user = { id: 'fixture-other', email: 'other@example.test' }; applyTierUi(); });
  assert.equal(await page.locator('#tab-alfacharts').isVisible(), false, 'account switch removes old tester navigation');
  await apply(false);
  assert.equal(await page.locator('#mnav-alfacharts').isVisible(), false);
  console.log(JSON.stringify({ passed: true, scopedTesterDesktopAndMobile: true, noAdminUpgrade: true, accountIsolation: true, realMemberLogin: false }));
} finally { await browser.close(); }
