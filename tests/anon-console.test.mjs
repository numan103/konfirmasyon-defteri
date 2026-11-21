import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('anonymous visitors do not fire authenticated-only requests', () => {
  const summary = html.slice(html.indexOf('async function ap2FetchSummary()'), html.indexOf('function ap2SummaryCaption('));
  assert.match(summary, /!AUTH\.user\) return null/);
  const teaser = html.slice(html.indexOf('async function renderHomeTeaser()'), html.indexOf("window.addEventListener('popstate'"));
  assert.match(teaser, /Önizleme için giriş yapman yeterli/);
  const infStart = html.indexOf('function renderInfluencer(');
  const influencer = html.slice(infStart, infStart + 6000);
  assert.match(influencer, /typeof AUTH === 'undefined' \|\| !AUTH\.user/);
  const authed = html.slice(html.indexOf('async function onAuthed('), html.indexOf('function authError('));
  assert.match(authed, /loadNotionOptions\(\);/);
  const bindings = html.slice(html.indexOf('// Açılır seçiciler: dışarı tıklayınca kapat'), html.indexOf('// Mobil hamburger menü'));
  assert.ok(!bindings.includes('loadNotionOptions()'), 'no unauthenticated Notion options fetch on page load');
});

test('senior form ids no longer collide with strategy form ids', () => {
  const senior = html.slice(html.indexOf('<div class="form" id="senior-form">'), html.indexOf('<div class="row">', html.indexOf('<div class="form" id="senior-form">')));
  assert.match(senior, /id="sr-name"/);
  assert.ok(!senior.includes('id="sf-name"'));
  assert.match(html, /document\.getElementById\('sr-name'\)\.value\.trim\(\)/);
  assert.match(html, /document\.getElementById\('sr-market'\)\.value/);
  assert.ok(!html.includes('<img id="sfx-lg-img" src=""'));
});
