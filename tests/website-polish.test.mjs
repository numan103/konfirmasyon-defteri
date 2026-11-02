import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('auth gate offers password visibility toggle and clear access note', () => {
  assert.ok(html.includes('id="au-pass-toggle"'));
  assert.ok(html.includes('class="auth-note"'));
  assert.ok(html.includes('Abonelik ücreti alınmaz'));
});

test('home subtitle is role-aware', () => {
  assert.ok(html.includes("Yönetici görünümü — tüm modüller ve onay panelleri açık."));
  assert.ok(html.includes("Premium erişim açık — tüm araçlar kullanılabilir."));
  assert.ok(html.includes("Temel araçlar ve paylaşılan portföy özeti. Premium, referans doğrulamasıyla açılır."));
});

test('premium empty states use proper Turkish copy', () => {
  assert.ok(html.includes('İşlem kanalı premium üyelere açık.'));
  assert.ok(html.includes('Henüz paylaşım yok.'));
});