import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('320px phones keep every navbar control inside the viewport', () => {
  const narrow = html.slice(html.indexOf('@media (max-width: 360px)'), html.indexOf('.navbar .user-badge', html.indexOf('@media (max-width: 360px)')));
  assert.match(narrow, /\.navbar \{ gap: 4px; \}/);
  assert.match(narrow, /\.navbar \.nav-lang \{ padding: 8px; \}/);
  assert.match(narrow, /\.navbar \.nav-login \{ padding: 8px 10px; font-size: 12\.5px; \}/);
  assert.match(narrow, /\.navbar \.nav-mobile-btn \{ margin-left: 4px; \}/);
});
