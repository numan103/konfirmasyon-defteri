import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const preview = fs.readFileSync(new URL('../assets/mentor-results-preview.mjs', import.meta.url), 'utf8');
const module = fs.readFileSync(new URL('../assets/mentor-before-after.mjs', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/mentor-before-after.css', import.meta.url), 'utf8');

test('registered members see safe before/after trade results without a Telegram exit', () => {
  assert.ok(html.includes('/assets/mentor-results-preview.mjs?v=4'));
  assert.ok(html.includes('/assets/mentor-before-after.mjs?v=2'));
  assert.ok(html.includes('/assets/mentor-before-after.css?v=1'));
  assert.match(preview, /renderMentorBeforeAfter\(results, records\)/);
  assert.match(preview, /renderMentorBeforeAfter\(home, records\)/);
  assert.match(module, /\/api\/ai\?mentorTrades=1/);
  assert.match(module, /window\.siteFetch/);
  assert.match(module, /imageCount\) >= 2/);
  assert.match(module, /\[1, 'ÖNCE · İlk grafik'\], \[0, 'SONRA · Sonuç'\]/);
  assert.match(css, /\.mentor-ba-pair/);
  assert.ok(!/t\.me|https?:\/\//.test(module), 'before/after assets must stay on the authenticated same-origin proxy');
  assert.ok(!/<a\b|href\s*=/.test(module), 'result cards must not render an external link');
});
