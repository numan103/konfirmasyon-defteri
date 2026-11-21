import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('günün notu okuma rengi yalnızca not yazı alanına uygulanır', () => {
  assert.ok(html.includes("const DAILY_NOTE_THEME_KEY = 'alfa_daily_note_theme'"));
  assert.match(html, /return DAILY_NOTE_THEMES\.some\(t => t\.id === v\) \? v : 'sepia'/);
  for (const [id, bg, fg] of [
    ['sepia', '#FBF0D9', '#3F301D'],
    ['light', '#F8F9FA', '#1A1A1A'],
    ['night', '#0F1123', '#E2E8F0'],
    ['oled', '#000000', '#D1D5DB'],
    ['sage', '#E8F0EC', '#1E2C24']
  ]) {
    assert.ok(html.includes(`id: '${id}'`), id);
    assert.ok(html.includes(`bg: '${bg}', fg: '${fg}'`), id);
    assert.ok(html.includes(`.ch-note-view.daily-theme-${id} {`), id);
  }
  assert.ok(html.includes('localStorage.setItem(DAILY_NOTE_THEME_KEY, theme.id)'));
  assert.ok(html.includes("document.querySelectorAll('.ch-note-view[data-daily-theme]').forEach(chDailyThemeApply)"));
  assert.equal(html.includes('body.daily-theme'), false, 'tema sayfa geneline yayılmaz');
  assert.equal(html.includes('daily-note-card.daily-theme'), false, 'kartların tamamı boyanmaz');
});

test('renk seçici günün notu okuyucularının içinde, not kutusundan önce gelir', () => {
  const reader = html.slice(html.indexOf('async function chOpenDailyReader'), html.indexOf('async function chOpenDailyViewer'));
  const viewer = html.slice(html.indexOf('async function chOpenDailyViewer'), html.indexOf('async function chCheckTelegramConnection'));
  assert.match(reader, /appendChild\(chDailyThemePicker\(\)\)/);
  assert.match(viewer, /replaceChildren\(chDailyThemePicker\(\)\)/);
  for (const block of [reader, viewer]) assert.match(block, /chDailyThemeApply\(note\); body\.appendChild\(note\)/);
  assert.equal((html.match(/function chDailyThemePicker\(\)/g) || []).length, 1);
  assert.match(html, /btn\.setAttribute\('aria-pressed', String\(theme\.id === current\)\)/);
});
