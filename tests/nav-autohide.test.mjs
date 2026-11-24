import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../assets/nav-autohide.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../assets/nav-autohide.mjs', import.meta.url), 'utf8');

test('scrolled mobile navigation exposes a labelled reveal control', () => {
  assert.match(css, /body\.nav-scrolled \.navbar \{ transform:translateY\(calc\(-100% - 12px\)\)/);
  assert.match(css, /@media \(hover:none\), \(max-width:680px\)[\s\S]*body\.nav-scrolled \.nav-reveal \{/);
  assert.match(js, /reveal\.setAttribute\('aria-controls', nav\.id\)/);
  assert.match(js, /reveal\.setAttribute\('aria-label', '☰ Menü'\)/);
});

test('chat bubble does not cover the mobile reveal button', () => {
  const mobile = css.slice(css.indexOf('@media (hover:none), (max-width:680px)'));
  assert.match(mobile, /body\.nav-scrolled \.chat-bubble \{ bottom:calc\(80px \+ env\(safe-area-inset-bottom\)\); \}/);
  // The reveal sits 16px above the bottom edge and is 48px tall; lifting the
  // 52px bubble to 80px leaves a real gap for touch targets.
  assert.match(mobile, /body\.nav-scrolled \.nav-reveal \{[\s\S]*bottom:calc\(16px \+ env\(safe-area-inset-bottom\)\);[\s\S]*width:48px; height:48px/);
});
