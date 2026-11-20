import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const source = html.slice(html.indexOf('function authError('), html.indexOf('function bootAuth('));
const context = vm.createContext({});
vm.runInContext(source, context);
test('email quota errors are not reported as incorrect passwords or generic login attempts', () => {
  for (const err of [{code:'over_email_send_rate_limit',message:'limit'}, {message:'Email rate limit exceeded'}]) {
    assert.match(context.authError(err), /E-posta servisinin gönderim sınırına/);
    assert.match(context.authError(err), /Bu bir şifre hatası değil/);
  }
  assert.match(context.authError({message:'For security purposes, you can only request this after 60 seconds.'}), /60 saniye/);
  assert.equal(context.authError({message:'Invalid login credentials'}),'E-posta veya şifre hatalı.');
  assert.match(context.authError({code:'reauthentication_needed'}),/yeniden giriş/);
});
