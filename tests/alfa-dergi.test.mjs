import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { previewRequest } from '../assets/admin-preview-policy.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/edu-shared.mjs', import.meta.url), 'utf8');
const policy = fs.readFileSync(new URL('../assets/admin-preview-policy.mjs', import.meta.url), 'utf8');

test('Edu opens the packages directly; the AlfaNews calendar dropdown is gone from both menus', () => {
  assert.match(html, /<a href="\?page=eduplans" class="nav-link" id="tab-eduplans" data-nav/);
  assert.match(html, /<a href="\?page=eduplans" class="mnav-link" data-nav data-mnav="eduplans"/);
  const menus = html.slice(html.indexOf('<nav class="navbar">'), html.indexOf('<div class="nav-contact"'));
  const mobile = html.slice(html.indexOf('<div class="nav-mobile-body">'), html.indexOf('<div class="mnav-contact"'));
  assert.ok(!menus.includes('📰 AlfaNews ▾'));
  assert.ok(!mobile.includes('📰 AlfaNews'));
  assert.ok(!html.includes('id="tab-calendar"'));
  assert.ok(!html.includes('data-mnav="calendar"'));
  for (const id of ['tab-egitim', 'tab-strategies', 'tab-analiz', 'tab-indicators', 'tab-designer']) {
    assert.ok(!html.includes('id="' + id + '"'), id + ' must stay out of the direct Edu link');
  }
});

test('the magazine is readable by everyone and editing stays behind site admin', () => {
  const tiers = html.slice(html.indexOf('const PAGE_TIER = {'), html.indexOf('// Referans linkleri'));
  assert.match(tiers, /news:\s*'free'/);
  const mag = html.slice(html.indexOf('function magIsAdmin()'), html.indexOf('async function loadNews()'));
  assert.match(mag, /typeof siteIsAdmin === 'function' && siteIsAdmin\(\)/);
  assert.ok(!/AUTH\.user\) \? .+ : true/.test(mag), 'anonymous visitors must never get editor tools');
  const load = html.slice(html.indexOf('async function loadNews()'), html.indexOf('function magAuthor('));
  assert.ok(load.includes("/api/edu-shared?kind=news"));
});

test('Alfa Dergi sits directly under the home video and has a weekly reading section', () => {
  const video = html.indexOf('id="home-member-video"');
  const card = html.indexOf('id="home-magazine-link"');
  assert.ok(video > -1 && card > video, 'magazine card must follow the video');
  assert.match(html.slice(card, card + 400), /href="\?page=news" data-nav class="home-magazine"/);
  assert.match(html, /id="news-weekly"/);
  assert.match(html, /id="news-weekly-list"/);
  assert.match(html, /function renderNewsWeekly\(\)/);
  assert.match(html, /Haftalık · /);
  assert.match(html, /Bu hafta için dergi yazısı bekleniyor\./);
  const tierUi = html.slice(html.indexOf('function applyTierUi()'), html.indexOf('function accessErrText('));
  assert.ok(!/\['data', 'karne', 'news'/.test(tierUi), 'magazine card must not be hidden for non-admin');
});

test('news read endpoint is a public, read-only projection without personal data', () => {
  assert.match(api, /kind === 'news'.*res\.status\(200\)/s);
  assert.match(api, /function alfaNews\(req, res\)/);
  assert.match(api, /if \(req\.method !== 'GET'\) return res\.status\(405\)/);
  assert.match(api, /id=eq\.1&select=data,updated_at/);
  assert.match(api, /authors,\s*entries/);
  assert.ok(!/SUPABASE_SERVICE_ROLE/.test(api.slice(api.indexOf('async function alfaNews'), api.indexOf('async function writeEduShared'))));
  for (const role of ['landing', 'free', 'premium']) {
    assert.equal(previewRequest('/api/edu-shared?kind=news', 'GET', role, 'https://alfa-trader.com').url, '/api/edu-shared?kind=news');
    assert.equal(previewRequest('/api/edu-shared?kind=news', 'POST', role, 'https://alfa-trader.com').status, 403);
  }
  assert.match(policy, /'landing','podcast','youtube','news'/);
});
