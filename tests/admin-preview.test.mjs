import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/admin-preview.mjs', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('export function previewCanOpen'), source.indexOf('const labels')).replaceAll('export ', '');
const context = vm.createContext({});
vm.runInContext(functions, context);
test('preview role gates never inherit administrator rights', () => {
  const tiers = { home: 'free', egitim: 'ref', alfacharts: 'admin', trading: 'admin', portfoy: 'ref' };
  for (const role of ['free','premium']) {
    assert.equal(context.previewCanOpen(tiers, 'home', role), true);
    assert.equal(context.previewCanOpen(tiers, 'alfacharts', role), false);
    assert.equal(context.previewCanOpen(tiers, 'trading', role), false);
    assert.equal(context.previewCanOpen(tiers, 'unknown', role), false);
    assert.equal(context.previewCanOpen(tiers, 'portfoy', role), true);
  }
  assert.equal(context.previewCanOpen(tiers, 'egitim', 'free'), false);
  assert.equal(context.previewCanOpen(tiers, 'egitim', 'premium'), true);
  assert.equal(context.previewCanOpen(tiers, 'home', 'landing'), false);
});
test('free preview always projects results through a strict allowlist', () => {
  const records = context.resultProjection([{ coin:'GOLD', r:2, date:100, text:'PRIVATE', imageCount:2, link:'secret', id:'hidden' }, { coin:'BTC', r:null, date:10 }]);
  assert.equal(JSON.stringify(records), '[{"coin":"GOLD","r":2,"date":100}]');
});
test('preview is opaque, scriptless and cannot write, authenticate or share storage', () => {
  assert.match(source, /frame\.setAttribute\('sandbox', ''\)/);
  assert.match(source, /script-src 'none'; connect-src 'none'/);
  assert.match(source, /form-action 'none'/);
  assert.match(source, /credentials: 'omit'/);
  assert.doesNotMatch(source, /getSession|signOut|localStorage|sessionStorage|method:\s*['"]POST|AUTH\.\w+\s*=(?!=)|SITE\.\w+\s*=(?!=)/);
  assert.match(source, /SITE\.admin === true/);
});
