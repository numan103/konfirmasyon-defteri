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
  assert.match(parent,/setAttribute\('sandbox', 'allow-scripts'\)/);
  assert.doesNotMatch(parent,/allow-same-origin|allow-forms|allow-top-navigation/);
  assert.match(parent,/connect-src 'none'/);
  assert.match(parent,/event\.source !== frame\.contentWindow/);
  assert.match(parent,/message\.channel !== channel/);
  assert.match(parent,/preview_boot_contract_changed/);
  assert.match(runtime,/Object\.defineProperty\(window,name,\{ value:memoryStorage\(\) \}\)/);
  assert.match(runtime,/access_token:'preview-no-authority'/);
  assert.doesNotMatch(parent,/postMessage\([^;]*(?:access_token|Authorization)/);
});
