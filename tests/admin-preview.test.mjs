import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { previewRequest, resultProjection, previewAccess } from '../assets/admin-preview-policy.mjs';
const origin = 'https://alfa-trader.com';
const policy = (url,role = 'free',method = 'GET') => previewRequest(url,method,role,origin);
test('preview has no administrator role or real personal access', () => {
  for (const role of ['landing','free','premium']) {
    assert.equal(previewAccess(role).admin,false);
    assert.equal(policy('/api/access?op=list',role).status,403);
    assert.equal(policy('/api/analytics?days=30',role).status,403);
    assert.equal(policy('/api/notion-trades?mode=week',role).status,403);
    assert.deepEqual(policy('/api/analytics?education=1&mine=1',role).json.applications,[]);
  }
  assert.equal(policy('/api/edu-shared','admin').status,403);
  assert.equal(previewAccess('premium').tier,'ref');
});
test('all preview writes and dangerous GET operations fail closed', () => {
  for (const method of ['POST','PATCH','DELETE','PUT','OPTIONS','HEAD']) {
    assert.equal(policy('/api/ai?mentorTrades=1','premium',method).status,403);
    assert.equal(policy('/api/edu-shared?kind=portfolio','premium',method).status,403);
  }
  for (const url of ['/api/analytics?prune=1','/api/ai?cron=1','/api/ai?telegram-webhook=1',
    '/api/access?op=approve','/api/tg?notify=1','/api/contrib?upload=1','/api/ai?influencer=1&op=me',
    'https://attacker.example/','//attacker.example/api/ai','https://u:p@alfa-trader.com/api/ai']) assert.equal(policy(url,'premium').status,403,url);
});
test('shared role reads are reconstructed, never forwarded with arbitrary admin flags', () => {
  assert.equal(policy('/api/ai?mentorTrades=1&connect=1&category=trade').url,'/api/ai?mentorTrades=1&page=0&results=1');
  assert.equal(policy('/api/ai?mentorTrades=1').results,true);
  assert.equal(policy('/api/ai?mentorTrades=1','landing').status,403);
  assert.equal(policy('/api/edu-shared?kind=portfolio&versions=1').url,'/api/edu-shared?kind=portfolio&view=summary');
  assert.equal(policy('/api/edu-shared?kind=portfolio&versions=1','premium').url,'/api/edu-shared?kind=portfolio');
  assert.equal(policy('/api/edu-shared?kind=podcast&manage=1').url,'/api/edu-shared?kind=podcast');
  assert.equal(policy('/api/edu-shared','free').status,403);
  assert.equal(policy('/api/edu-shared','premium').url,'/api/edu-shared');
});
test('free results cannot carry premium fields even under a broad admin API response', () => {
  assert.deepEqual(resultProjection([{coin:'GOLD',r:2,date:100,text:'PRIVATE',imageCount:2,id:'secret'},{coin:'BTC',r:null,date:100}]),[{coin:'GOLD',r:2,date:100}]);
  const url = '/api/ai?mentorTrades=1&image=mentortrade_' + 'a'.repeat(64) + '&index=0';
  assert.equal(policy(url).status,403);
  assert.equal(policy(url,'premium').authenticated,true);
});
test('opaque live runtime keeps tokens and parent storage out; native network remains blocked', () => {
  const parent = fs.readFileSync(new URL('../assets/admin-preview.mjs',import.meta.url),'utf8');
  const runtime = fs.readFileSync(new URL('../assets/admin-preview-runtime.js',import.meta.url),'utf8');
  assert.match(parent,/frame\.setAttribute\('sandbox', 'allow-scripts'\)/);
  assert.doesNotMatch(parent,/frame\.setAttribute\([^)]*allow-same-origin|frame\.setAttribute\([^)]*allow-forms|frame\.setAttribute\([^)]*allow-top-navigation/);
  assert.match(parent,/player\.setAttribute\('sandbox', 'allow-scripts allow-same-origin allow-presentation'\)/);
  assert.match(parent,/connect-src 'none'/);
  assert.match(parent,/event\.source !== frame\.contentWindow/);
  assert.match(parent,/message\.channel !== channel/);
  assert.match(parent,/preview_boot_contract_changed/);
  assert.match(runtime,/Object\.defineProperty\(window,name,\{ value:memoryStorage\(\) \}\)/);
  assert.match(runtime,/access_token:'preview-no-authority'/);
  assert.doesNotMatch(parent,/postMessage\([^;]*(?:access_token|Authorization)/);
});
test('minimal switcher, light member previews and November evaluation are wired in', () => {
  const parent = fs.readFileSync(new URL('../assets/admin-preview.mjs',import.meta.url),'utf8');
  const css = fs.readFileSync(new URL('../assets/admin-preview.css',import.meta.url),'utf8');
  const runtime = fs.readFileSync(new URL('../assets/admin-preview-runtime.js',import.meta.url),'utf8');
  const curve = fs.readFileSync(new URL('../assets/mentor-curve.mjs',import.meta.url),'utf8');
  const panel = fs.readFileSync(new URL('../assets/mentor-results-preview.mjs',import.meta.url),'utf8');
  const html = fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(parent,/icons = \{ landing:'⌂', free:'＋', premium:'★', admin:'⚙' \}/);
  assert.match(parent,/b\.setAttribute\('aria-label', label\)/);
  assert.match(parent,/theme:role === 'premium' \? 'dark' : 'light'/);
  assert.match(css,/#admin-view-switch \{ position:fixed[^}]*height:34px/);
  assert.match(css,/html\.admin-preview-role-premium #page-alfatrading \.mentor-trades-head/);
  assert.match(css,/html\.admin-preview-role-premium #page-alfatrading \.mentor-trades-filters/);
  assert.match(runtime,/if \(config\.theme === 'light'\) localStorage\.setItem\('alfa-theme', 'light'\)/);
  assert.match(runtime,/videoPoster\(video\)/);
  assert.match(runtime,/type:'preview:video'/);
  assert.match(curve,/2026-11-01T00:00:00\+03:00/);
  assert.match(curve,/renderMentorEvaluation/);
  assert.match(panel,/home-results-bottom/);
  assert.match(html,/id="home-results-bottom"/);
});
test('magazine Telegram photos stay same-origin and allowlisted in previews', () => {
  const id = 'aBc123_-xyz456789';
  for (const role of ['landing','free','premium']) {
    assert.equal(policy('/api/tg?magPhoto=' + id,role).url,'/api/tg?magPhoto=' + id);
    assert.equal(policy('/api/tg?magPhoto=' + id,role,'POST').status,403);
  }
  for (const bad of ['/api/tg?magPhoto=short','/api/tg?magPhoto=../../etc/passwd','/api/tg?magPhoto=' + 'a'.repeat(251),
    '/api/tg?notify=1','/api/tg?magPhoto=' + id + '&notify=1']) assert.equal(policy(bad,'premium').status,403,bad);
});
test('public Daily Notes stay readable in member previews without forwarding admin credentials or permitting writes', () => {
  const id = 'edutg_' + 'a'.repeat(64);
  for (const role of ['landing', 'free', 'premium']) {
    const feed = policy('/api/edu-shared?kind=channel&view=daily-notes&offset=3&admin=1', role);
    assert.equal(feed.url, '/api/edu-shared?kind=channel&view=daily-notes&offset=3');
    assert.equal(feed.authenticated, false);
    assert.equal(policy('/api/edu-shared?kind=channel&view=daily-notes&note=' + id, role).authenticated, false);
    assert.equal(policy('/api/edu-shared?kind=channel&view=daily-notes&photo=' + id + '&n=0', role).authenticated, false);
    assert.equal(policy('/api/edu-shared?kind=channel&view=daily-notes', role, 'POST').status, 403);
  }
  assert.equal(policy('/api/edu-shared?kind=channel&view=daily-notes&note=channels').status, 403);
  assert.equal(policy('/api/edu-shared?kind=channel&view=daily-notes&offset=9999').status, 403);
});
