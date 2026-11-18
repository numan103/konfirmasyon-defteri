import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseYoutubeFeed, CHANNEL_ID } from '../lib/youtube-latest.mjs';
const entry = (id, date, title = 'Trading &amp; piyasa', channel = CHANNEL_ID) => `<entry><yt:videoId>${id}</yt:videoId><yt:channelId>${channel}</yt:channelId><title>${title}</title><published>${date}</published><updated>2030-01-01T00:00:00Z</updated></entry>`;
const now = Date.parse('2026-11-18T12:00:00Z');
test('latest YouTube video comes from the configured channel and publication date, not update order', () => {
  const older = entry('QULIiVngcu4', '2026-11-06T16:16:38Z');
  const latest = entry('g1z4tZUnEF8', '2026-11-13T17:49:59Z', 'Son &quot;video&quot; &#x1f3ac;');
  const wrong = entry('aaaaaaaaaaa', '2026-11-17T00:00:00Z', 'Wrong', 'UCother');
  const future = entry('bbbbbbbbbbb', '2026-11-20T00:00:00Z');
  assert.deepEqual(parseYoutubeFeed('<feed>' + older + latest + wrong + future + '</feed>', now), {
    id: 'g1z4tZUnEF8', title: 'Son "video" 🎬', publishedAt: '2026-11-13T17:49:59.000Z',
  });
});
test('invalid upstream content never invents a latest video or an embed URL', () => {
  for (const input of ['', '<html>blocked</html>', entry('bad', '2026-11-13T00:00:00Z'),
    entry('g1z4tZUnEF8', 'bad'), 'x'.repeat(512001)]) assert.equal(parseYoutubeFeed(input, now), null);
});
function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
test('YouTube endpoint uses the official fixed RSS feed, coalesces and caches metadata without DB writes', async t => {
  const { default: handler } = await import('../lib/youtube-latest.mjs?cache-test');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls++; assert.equal(url, 'https://www.youtube.com/feeds/videos.xml?channel_id=' + CHANNEL_ID);
    assert.equal(opts.redirect, 'error');
    return new Response('<feed>' + entry('g1z4tZUnEF8', '2026-11-13T17:49:59Z') + '</feed>');
  });
  const a = response(), b = response();
  await Promise.all([handler({ method: 'GET' }, a), handler({ method: 'GET' }, b)]);
  assert.equal(calls, 1); assert.equal(a.body.video.id, 'g1z4tZUnEF8');
  assert.match(a.headers['Cache-Control'], /s-maxage=300/);
  const post = response(); await handler({ method: 'POST' }, post);
  assert.equal(post.code, 405); assert.equal(calls, 1);
});
test('YouTube failures are not cached as success and expose no upstream secrets', async t => {
  const { default: handler } = await import('../lib/youtube-latest.mjs?failure-test');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('private upstream detail', { status: 403 }); });
  for (let i = 0; i < 2; i++) {
    const res = response(); await handler({ method: 'GET' }, res);
    assert.equal(res.code, 503); assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(res.body, { error: 'youtube_unavailable' });
  }
  assert.equal(calls, 2);
});
test('free registered members get podcast and latest video; publishing and private pages are unchanged', () => {
  const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const podcast = read('assets/alfa-podcast.mjs'), video = read('assets/member-video.mjs'), html = read('index.html');
  assert.match(podcast, /function canListen\(\).*AUTH\.user\?\.id/);
  assert.ok(!podcast.includes('refUnlocked'));
  assert.match(podcast, /!episode \|\| !canListen\(\)/);
  assert.match(podcast, /audio\.removeAttribute\('src'\)/);
  assert.match(podcast, /if\(!admin\(\)\|\|editing\)return/);
  assert.match(video, /AUTH\.user\?\.id/);
  assert.match(video, /youtube-nocookie\.com\/embed\//);
  assert.ok(!video.includes('autoplay=1'));
  assert.ok(!video.includes('innerHTML'));
  assert.ok(html.includes('id="home-member-video"'));
  assert.match(html, /alfa-podcast\.mjs\?v=5/);
  assert.match(read('api/edu-shared.mjs'), /kind === 'youtube'/);
});
