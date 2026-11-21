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

test('home embeds the real weekly flipbook in read-only mode for everyone', () => {
  const home = html.slice(html.indexOf('id="home-member-video"'), html.indexOf('id="home-diary-link"'));
  assert.match(home, /id="home-mag-reader"/);
  assert.match(home, /class="mag-book hmr-book" id="hmr-book"/);
  assert.match(home, /id="hmr-viewport"/);
  assert.match(home, /id="hmr-stage"/);
  assert.match(home, /id="hmr-prev"/);
  assert.match(home, /id="hmr-next"/);
  assert.match(home, /id="hmr-dots"/);
  assert.match(home, /id="hmr-counter"/);
  assert.ok(!home.includes('mag-tools'), 'embedded flipbook never shows editor tools');
  assert.ok(!home.includes('hmr-card'), 'no preview-like card strip remains');
  assert.ok(!home.includes('Okuyucu Modu'), 'no preview-style label');
  assert.match(html, /async function loadHomeMagazine\(\)/);
  assert.match(html, /function renderHomeMagazine\(\)/);
  assert.match(html, /pages = \[magBuildCover\(\), magBuildToc\(hmrGoTo\)\]/);
  assert.match(html, /magBuildEntry\(e, magData\.entries\.indexOf\(e\), false\)/);
  assert.match(html, /window\.__magForceReader = true/);
  assert.match(html, /function invalidateHomeMagazine\(\)/);
  assert.match(html, /magInvalidateHome\(\)/);
  assert.match(html, /if \(name === 'home'\).*loadHomeMagazine\(\)/);
  assert.match(html, /Tam ekranda aç/);
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

test('Telegram entries share one stream with a category badge and safe same-origin photos', () => {
  const load = html.slice(html.indexOf('async function loadNews()'), html.indexOf('function magAuthor('));
  assert.match(load, /\['Haber', 'BTC Bias', 'Makro', 'Teknik Analiz'\]\.includes\(e\.category\)/);
  assert.match(load, /Array\.isArray\(e\.photoIds\)/);
  assert.match(load, /rawAdmin/, 'admin raw data must map photoIds to proxy URLs too');
  assert.match(load, /'\/api\/tg\?magPhoto=' \+ encodeURIComponent\(String\(id\)\)/);
  assert.match(html, /\.e-cat\.news/);
  assert.match(html, /\.e-cat\.tech/);
  assert.match(html, /\.toc-cat\.news/);
  assert.match(html, /\.e-cat\.bias/);
  assert.match(html, /\.e-cat\.macro/);
  const toc = html.slice(html.indexOf('function magBuildToc('), html.indexOf('function magBuildEntry('));
  assert.match(toc, /toc-cat/);
  assert.match(toc, /MAG_CATS\.includes\(en\.category\)/);
  const entry = html.slice(html.indexOf('function magBuildEntry('), html.indexOf('function magBuildUpdates('));
  assert.match(entry, /'BTC Bias': 'BTC BIAS'/);
  assert.match(entry, /\[\['', 'Analiz'\]\]\.concat\(MAG_CATS\.map/);
  assert.match(entry, /e-img-missing/);
  assert.match(api, /\['Haber', 'BTC Bias', 'Makro', 'Teknik Analiz'\]\.includes\(e && e\.category\)/);
  assert.match(api, /sourceMessageId: sourceMessageId\(e\)/);
  assert.ok(!/sourceLink: text\(/.test(api), 'public projection must not expose a Telegram link');
  assert.match(api, /publishedAt: text\(e && e\.publishedAt, 40\)/);
  assert.match(api, /'\/api\/tg\?magPhoto=' \+ encodeURIComponent\(id\)/);
  assert.ok(!/\/api\/edu-shared[\s\S]{0,400}t\.me\//.test(api), 'no Telegram CDN hotlink in the public projection');
});

test('complete data URI media survives the public projection; truncated ones are dropped', () => {
  const projection = api.slice(api.indexOf('const media ='), api.indexOf('const entries ='));
  assert.match(projection, /payload\.length % 4 === 0/);
  assert.match(api, /images\.slice\(0, 12\)\.map\(u => media\(u\)\)/);
  assert.match(api, /beforeImg: media\(e && e\.beforeImg\)/);
  assert.match(api, /afterImg: media\(e && e\.afterImg\)/);
  assert.match(api, /photo: media\(a && a\.photo\)/);
  assert.match(api, /coverBg: media\(raw\.coverBg\)/);
  const safe = html.slice(html.indexOf('function magSafeBg('), html.indexOf('async function saveNews('));
  assert.match(safe, /payload\.length % 4 !== 0/);
  assert.ok(html.includes("magData.coverTheme === 'custom' && magSafeBg(magData.coverBg)"));
  assert.ok(html.includes("'/assets/alfa-dergi-cover.svg?v=1'"));
  assert.match(html, /const avBg = magSafeBg\(a\.photo\)/);
  assert.match(html, /const avBg = author && magSafeBg\(author\.photo\)/);
});
