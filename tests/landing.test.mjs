import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const landing = html.slice(html.indexOf('<div id="landing">'), html.indexOf('<div id="auth-gate">'));

test('landing excludes sample performance, social invitations and admin-only benefits', () => {
  for (const text of ['lp-hero-shot', 'hseq-svg', '+52.4R', 'lp-comm-tg', 'Bir fikrin mi var', 'Kişisel Günlük Asistan', 'AlfaNews', 'Check List']) {
    assert.ok(!landing.includes(text), text);
  }
});

test('landing keeps registration hooks and accurate premium descriptions', () => {
  for (const id of ['nav-login', 'hero-register', 'hero-login', 'cta-register']) {
    assert.ok(landing.includes(`id="${id}"`), id);
  }
  assert.equal((landing.match(/<article class="lp-card">/g) || []).length, 6);
  assert.ok(landing.includes('salt okunur'));
  assert.ok(landing.includes('referans doğrulamasıyla'));
  assert.ok(landing.includes('komisyon kazanabiliriz'));
  assert.ok(landing.includes('Geçmiş sonuçlar gelecekteki getiriyi garanti etmez'));
});
