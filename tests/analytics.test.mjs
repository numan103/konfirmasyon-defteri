import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  dayKey,
  mergeVisit,
  parseDevice,
  sanitizePayload,
  sourceOf,
  summarizeSessions,
} from '../api/analytics.mjs';

const NOW = Date.parse('2026-11-14T09:00:00.000Z');

function row(sid, data, updatedAt) {
  return { id: 'visit_' + sid, data: data, updated_at: updatedAt || new Date(NOW).toISOString() };
}

test('sanitizePayload rejects bad session ids and clamps values', () => {
  assert.equal(sanitizePayload({ sid: 'x', vid: 'v123456' }, NOW), null);
  assert.equal(sanitizePayload({ sid: 'has space in it', vid: 'v123456' }, NOW), null);

  const clean = sanitizePayload({
    sid: 'session_123456',
    vid: 'visitor_123456',
    page: 'home',
    entry: '/?page=home',
    activeMs: 999999999,
    scroll: 250,
    pages: {
      home: { v: 2, ms: 12000, s: 60 },
      '../bad': { v: 1, ms: 1, s: 1 },
    },
    days: { '2026-11-14': { ms: 12000, pv: 2 } },
    clicks: [
      { t: new Date(NOW).toISOString(), kind: 'affiliate', label: 'Bybit', url: 'partner.bybit.com/b/cryptoahmet' },
      { t: new Date(NOW).toISOString(), kind: 'evil', label: 'x', url: 'x' },
    ],
    member: { id: 'fake-member' },
  }, NOW);

  assert.equal(clean.sid, 'session_123456');
  assert.equal(clean.activeMs, 12 * 60 * 60 * 1000);
  assert.equal(clean.scroll, 100);
  assert.equal(clean.pages.home.v, 2);
  assert.equal(clean.pages['../bad'], undefined);
  assert.equal(clean.clicks.length, 1);
  assert.equal(clean.clicks[0].kind, 'affiliate');
  assert.equal(clean.member, undefined, 'client cannot claim a member identity');
});

test('mergeVisit keeps first visit, caps clocks and keeps member only from server context', () => {
  const existing = {
    sid: 'session_123456',
    vid: 'visitor_123456',
    first: '2026-11-14T08:00:00.000Z',
    last: '2026-11-14T08:30:00.000Z',
    activeMs: 30000,
    pages: { home: { v: 1, ms: 10000, s: 20 } },
    days: { '2026-11-14': { ms: 10000, pv: 1 } },
    clicks: [{ t: '2026-11-14T08:10:00.000Z', kind: 'external', label: 'A', url: 'a.com' }],
    ref: 'https://www.google.com/',
  };

  const incoming = sanitizePayload({
    sid: 'session_123456',
    vid: 'visitor_123456',
    page: 'portfoy',
    activeMs: 180000,
    pages: {
      home: { v: 2, ms: 15000, s: 45 },
      portfoy: { v: 1, ms: 60000, s: 80 },
    },
    days: { '2026-11-14': { ms: 75000, pv: 3 } },
    clicks: [
      { t: '2026-11-14T08:10:00.000Z', kind: 'external', label: 'A', url: 'a.com' },
      { t: '2026-11-14T08:40:00.000Z', kind: 'affiliate', label: 'OKX', url: 'okx.com/join/CRYPTOAHMET' },
    ],
    member: { id: 'fake-member' },
  }, NOW);

  const merged = mergeVisit(existing, incoming, {
    now: NOW,
    country: 'TR',
    device: 'Mobil',
    browser: 'Safari',
    os: 'iOS',
    bot: false,
    member: { id: 'real-member-uuid', name: 'Sefa' },
    admin: false,
  });

  assert.equal(merged.first, '2026-11-14T08:00:00.000Z');
  assert.equal(merged.last, new Date(NOW).toISOString());
  assert.equal(merged.activeMs, 180000);
  assert.equal(merged.pages.home.v, 2);
  assert.equal(merged.pages.home.ms, 15000);
  assert.equal(merged.pages.portfoy.v, 1);
  assert.equal(merged.days['2026-11-14'].pv, 3);
  assert.equal(merged.clicks.length, 2, 'duplicate click is collapsed');
  assert.equal(merged.member.id, 'real-member-uuid');
  assert.equal(merged.country, 'TR');
  assert.equal(merged.device, 'Mobil');
  assert.equal(merged.ref, 'https://www.google.com/');
});

test('device, source and Istanbul day parsing', () => {
  assert.deepEqual(parseDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1'), {
    bot: false, device: 'Mobil', os: 'iOS', browser: 'Safari',
  });
  assert.equal(parseDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36 Edg/120').browser, 'Edge');
  assert.equal(parseDevice('Mozilla/5.0 (Linux; Android 14; SM-X700) AppleWebKit/537.36 Chrome/120 Safari/537.36').device, 'Tablet');
  assert.equal(parseDevice('TelegramBot (like TwitterBot)').bot, true);

  assert.equal(sourceOf(''), 'Doğrudan');
  assert.equal(sourceOf('https://www.google.com/search?q=alfa'), 'Google');
  assert.equal(sourceOf('https://t.me/alfakasim'), 'Telegram');
  assert.equal(sourceOf('https://alfa-trader.com/?page=home'), 'Site içi');
  assert.equal(sourceOf('https://www.instagram.com/'), 'Instagram');

  assert.equal(dayKey('2026-11-14T22:30:00.000Z'), '2026-11-15');
});

test('summarizeSessions aggregates people, duration, pages and excludes admin/bot', () => {
  const today = dayKey(NOW);
  const rows = [
    row('session_aaa111', {
      sid: 'session_aaa111',
      vid: 'visitor_aaa111',
      first: new Date(NOW - 10 * 60000).toISOString(),
      last: new Date(NOW - 1000).toISOString(),
      activeMs: 45000,
      page: 'portfoy',
      entry: '/?page=home',
      ref: 'https://www.google.com/',
      pages: {
        home: { v: 2, ms: 15000, s: 55 },
        portfoy: { v: 1, ms: 30000, s: 90 },
      },
      days: { [today]: { ms: 45000, pv: 3 } },
      clicks: [{ t: new Date(NOW).toISOString(), kind: 'affiliate', label: 'Bybit', url: 'partner.bybit.com/b/cryptoahmet' }],
    }),
    row('session_bbb222', {
      sid: 'session_bbb222',
      vid: 'visitor_bbb222',
      first: new Date(NOW - 20 * 60000).toISOString(),
      last: new Date(NOW - 10 * 60000).toISOString(),
      activeMs: 15000,
      page: 'home',
      ref: 'https://t.me/alfakasim',
      pages: { home: { v: 1, ms: 15000, s: 30 } },
      days: { [today]: { ms: 15000, pv: 1 } },
      member: { id: 'member-uuid-1', name: 'Sefa' },
    }),
    row('session_ccc333', {
      sid: 'session_ccc333',
      vid: 'visitor_ccc333',
      last: new Date(NOW).toISOString(),
      activeMs: 5000,
      page: 'apps',
      pages: { apps: { v: 1, ms: 5000, s: 10 } },
      days: { [today]: { ms: 5000, pv: 1 } },
      admin: true,
    }),
    row('session_ddd444', {
      sid: 'session_ddd444',
      vid: 'visitor_ddd444',
      last: new Date(NOW).toISOString(),
      bot: true,
      pages: { home: { v: 1, ms: 0, s: 0 } },
    }),
  ];

  const out = summarizeSessions(rows, {
    now: NOW,
    days: 7,
    includeAdmin: false,
    emailMap: { 'member-uuid-1': { email: 'sefa@example.com', name: 'Sefa' } },
  });

  assert.equal(out.totals.sessions, 2);
  assert.equal(out.totals.uniqueVisitors, 2);
  assert.equal(out.totals.pageviews, 4);
  assert.equal(out.totals.onlineNow, 1);
  assert.equal(out.totals.avgActiveMs, 30000);
  assert.equal(out.totals.memberSessions, 1);
  assert.equal(out.totals.anonymousSessions, 1);
  assert.equal(out.totals.adminSessions, 1);
  assert.equal(out.totals.botSessions, 1);

  const home = out.topPages.find((p) => p.page === 'home');
  assert.equal(home.views, 3);
  assert.equal(home.visitors, 2);

  assert.equal(out.referrers.find((r) => r.source === 'Google').sessions, 1);
  assert.equal(out.referrers.find((r) => r.source === 'Telegram').sessions, 1);

  const member = out.sessions.find((s) => s.sid === 'session_bbb222');
  assert.equal(member.label, 'Sefa');
  assert.equal(member.member.email, 'sefa@example.com');

  const anonymous = out.sessions.find((s) => s.sid === 'session_aaa111');
  assert.match(anonymous.label, /^Ziyaretçi [A-Z0-9]{4}$/);
  assert.equal(anonymous.live, true);

  assert.equal(out.daily.length, 7);
  assert.equal(out.daily[6].date, today);
  assert.equal(out.daily[6].pageviews, 4);

  const withAdmin = summarizeSessions(rows, { now: NOW, days: 7, includeAdmin: true });
  assert.equal(withAdmin.totals.sessions, 3);
  assert.ok(withAdmin.sessions.some((s) => s.admin === true));
});

test('summarizeSessions ignores sessions older than the requested range', () => {
  const old = row('session_eee555', {
    sid: 'session_eee555',
    vid: 'visitor_eee555',
    first: '2026-10-01T09:00:00.000Z',
    last: '2026-10-01T09:30:00.000Z',
    activeMs: 10000,
    pages: { home: { v: 1, ms: 10000, s: 10 } },
  }, '2026-10-01T09:30:00.000Z');

  const out = summarizeSessions([old], { now: NOW, days: 7, includeAdmin: true });
  assert.equal(out.totals.sessions, 0);
  assert.equal(out.sessions.length, 0);
});

test('site wires the admin analytics page and anonymous tracker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="page-analitik"'));
  assert.ok(html.includes('?page=analitik'));
  assert.ok(html.includes("analitik: 'admin'"));
  assert.ok(html.includes("'/api/analytics'"));
  assert.ok(html.includes('function anaPageView'));
  assert.ok(html.includes("if (name === 'analitik')"));
  assert.ok(html.includes('Yönetici ziyaretleri'));
  assert.ok(html.includes("anaPageView('landing')"), 'landing-only visitors are tracked as landing');
  assert.ok(html.includes("anaPageView(currentPage || 'home')"), 'entering the app counts the real page');
  assert.ok(html.includes("anaTrack.curPage = 'landing'"), 'landing view is deferred for logged-in members');
  assert.ok(html.includes('anaPendingLanding'), 'pending landing flag wires deferred view');
});

