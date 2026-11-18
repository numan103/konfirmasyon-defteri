import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../lib/edu-feedback.mjs';

const scope = { channel: 'teacher-1', section: 'teknik', topic: 'course-1' };
let serial = 0;
function fixture(t, { admin = false, premium = true, missing = false, posts = [] } = {}) {
  const userId = '10000000-0000-0000-0000-' + String(++serial).padStart(12, '0');
  const rows = structuredClone(posts), calls = [];
  let clock = Date.now();
  t.mock.method(Date, 'now', () => clock);
  const key = process.env.SUPABASE_SERVICE_ROLE, open = process.env.SITE_ACCESS_OPEN;
  process.env.SUPABASE_SERVICE_ROLE = 'test-service-key'; delete process.env.SITE_ACCESS_OPEN;
  t.after(() => {
    if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE; else process.env.SUPABASE_SERVICE_ROLE = key;
    if (open === undefined) delete process.env.SITE_ACCESS_OPEN; else process.env.SITE_ACCESS_OPEN = open;
  });
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    calls.push({ url, opts });
    const u = new URL(url);
    if (u.pathname === '/auth/v1/user') return Response.json({
      id: userId, email: admin ? 'ahmetnuman20@gmail.com' : 'student-secret@example.com'
    });
    if (u.pathname.endsWith('/site_access')) return missing ? Response.json({}, { status: 404 }) : Response.json(premium ? [{ status: 'verified' }] : []);
    if (u.pathname.endsWith('/edu_shared')) return Response.json([{ data: { traders: {
      'teacher-1': { sections: { teknik: [{ id: 'course-1', videos: [{ id: 'lesson-1' }, { id: 'lesson-2' }] }] } }
    } } }]);
    if (!u.pathname.endsWith('/edu_feedback')) throw new Error('unexpected URL');
    if (missing) return Response.json({}, { status: 404 });
    const method = opts.method || 'GET';
    if (method === 'POST') {
      const value = JSON.parse(opts.body);
      const id = '20000000-0000-0000-0000-' + String(rows.length + 1).padStart(12, '0');
      rows.push({ id, created_at: new Date().toISOString(), ...value });
      return Response.json([rows.at(-1)]);
    }
    const selected = rows.filter(row => {
      for (const [key, value] of u.searchParams) {
        if (['select', 'order', 'offset', 'limit'].includes(key)) continue;
        if (value.startsWith('eq.') && String(row[key]) !== value.slice(3)) return false;
        if (value.startsWith('in.(') && !value.slice(4, -1).split(',').includes(row[key])) return false;
        if (value.startsWith('gte.') && row[key] < value.slice(4)) return false;
      }
      return true;
    });
    if (method === 'PATCH') {
      const value = JSON.parse(opts.body); selected.forEach(row => Object.assign(row, value)); return Response.json(selected);
    }
    if (method === 'DELETE') {
      const ids = selected.map(row => row.id);
      for (let i = rows.length - 1; i >= 0; i--) if (ids.includes(rows[i].id) || ids.includes(rows[i].parent_id)) rows.splice(i, 1);
      return Response.json(selected);
    }
    const offset = Number(u.searchParams.get('offset') || 0), limit = Number(u.searchParams.get('limit') || 1000);
    return Response.json(selected.slice(offset, offset + limit));
  });
  async function request(body = {}, method = 'GET', headers = { authorization: 'Bearer user-token' }) {
    clock += 4000;
    let value;
    const res = { statusCode: 0, setHeader() {}, end(text) { value = JSON.parse(text); } };
    const req = { method, headers, ...(method === 'GET' ? { query: { ...scope, ...body } } : { body: { ...scope, ...body } }) };
    await handler(req, res);
    return { status: res.statusCode, body: value };
  }
  return { request, rows, calls, userId };
}
test('girişsiz kullanıcı okuyamaz veya paylaşamaz', async t => {
  const f = fixture(t);
  assert.equal((await f.request({}, 'GET', {})).status, 401);
  assert.equal(f.calls.length, 0);
});
test('premium olmayan öğrenci ve eksik erişim tablosu fail-closed çalışır', async t => {
  const f = fixture(t, { premium: false });
  assert.equal((await f.request()).status, 403);
});
test('kurulum eksikse başarı veya boş başarı kaydı uydurulmaz', async t => {
  const f = fixture(t, { admin: true, missing: true });
  const result = await f.request();
  assert.equal(result.status, 503); assert.equal(result.body.error, 'setup_required');
});
test('öğrenci için eksik erişim tablosu premium erişim sayılmaz', async t => {
  const f = fixture(t, { missing: true });
  const result = await f.request();
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'setup_required');
  assert.ok(!f.calls.some(call => call.url.includes('/edu_feedback')));
});
test('var olmayan eğitim kanalı için paylaşım kaydedilmez', async t => {
  const f = fixture(t);
  assert.equal((await f.request({ channel: 'missing', op: 'question', text: 'Bir sorum var', anonymous: true }, 'POST')).status, 404);
  assert.equal(f.rows.length, 0);
});
test('anonim kayıt hesapla bağlıdır fakat okuma yanıtında kimlik/e-posta bulunmaz', async t => {
  const f = fixture(t);
  const r = await f.request({ op: 'question', lesson: 'lesson-1', text: 'Bu konuyu açıklar mısınız?', anonymous: true, name: 'Özel ad', user_id: 'forged', instructor: true }, 'POST');
  assert.equal(r.status, 200); assert.equal(f.rows[0].user_id, f.userId);
  assert.equal(f.rows[0].display_name, 'Anonim'); assert.equal(f.rows[0].instructor, false);
  assert.equal(f.rows[0].lesson_id, null);
  assert.equal(f.rows[0].section_id, 'general'); assert.equal(f.rows[0].topic_id, 'general');
  const read = await f.request({ view: 'questions' });
  assert.equal(read.body.posts[0].name, 'Anonim'); assert.equal(read.body.posts[0].mine, true);
  assert.ok(!JSON.stringify(read.body).includes(f.userId));
  assert.ok(!JSON.stringify(read.body).includes('student-secret@example.com'));
  assert.ok(!Object.hasOwn(read.body.posts[0], 'user_id'));
});
test('yorum güncellemesi yeni yorum oluşturmaz, öğrenci kendi adını seçebilir', async t => {
  const f = fixture(t);
  assert.equal((await f.request({ op: 'review', rating: 3, text: 'İlk izlenimim olumlu.', stage: 'start', anonymous: false, name: 'Öğrenci A' }, 'POST')).status, 200);
  assert.equal((await f.request({ op: 'review', rating: 4, text: 'İçeriğin devamını da izledim.', stage: 'middle', anonymous: true }, 'POST')).status, 200);
  assert.equal(f.rows.length, 1); assert.equal(f.rows[0].rating, 4);
  assert.equal(f.rows[0].stage, 'middle'); assert.equal(f.rows[0].display_name, 'Anonim');
});
test('puan, metin ve görünür ad sunucuda doğrulanır', async t => {
  const f = fixture(t);
  assert.equal((await f.request({ op: 'review', rating: 6, text: 'Uzun bir yorum', anonymous: true }, 'POST')).status, 400);
  assert.equal((await f.request({ op: 'question', text: 'ab', anonymous: true }, 'POST')).status, 400);
  assert.equal((await f.request({ op: 'question', text: 'Yeterince uzun soru', anonymous: false, name: '' }, 'POST')).status, 400);
  assert.equal(f.rows.length, 0);
});
test('öğrenci eğitmen yanıtı üretemez veya başka öğrencinin kaydını silemez', async t => {
  const other = { ...scope, channel_id: scope.channel, section_id: scope.section, topic_id: scope.topic,
    id: '20000000-0000-0000-0000-000000000099', user_id: 'another-student', kind: 'question', body: 'Soru metni', anonymous: true };
  const f = fixture(t, { posts: [other] });
  assert.equal((await f.request({ op: 'answer', parent: other.id, text: 'Sahte eğitmen yanıtı', anonymous: true }, 'POST')).status, 403);
  assert.equal((await f.request({ op: 'remove', id: other.id }, 'POST')).status, 403);
  assert.equal(f.rows.length, 1);
});
test('yönetici yanıtı doğru soruya bağlanır, video bağlantısı yayımlanmaz', async t => {
  const question = { id: '20000000-0000-0000-0000-000000000099', user_id: 'another-student', channel_id: scope.channel,
    section_id: scope.section, topic_id: scope.topic, lesson_id: 'lesson-2', kind: 'question', body: 'Bir soru var', anonymous: true };
  const f = fixture(t, { admin: true, posts: [question] });
  assert.equal((await f.request({ op: 'answer', parent: question.id, text: 'Açıklayıcı eğitmen yanıtı', name: 'Eğitmen', anonymous: false, lesson: 'lesson-1' }, 'POST')).status, 200);
  assert.equal(f.rows[1].lesson_id, null); assert.equal(f.rows[1].instructor, true);
  const result = await f.request({ view: 'questions' });
  assert.equal(result.body.answers.length, 1);
  assert.ok(!Object.hasOwn(result.body.posts[0], 'lesson_id'));
  assert.equal(f.rows[0].lesson_id, 'lesson-2'); // Old metadata stays stored.
});
test('video veya konu değişince aynı genel yorum güncellenir; eski kayıtlar korunur', async t => {
  const f = fixture(t);
  await f.request({ op: 'review', rating: 3, text: 'Eğitimin ilk kısmı açıklayıcı.', anonymous: true, topic: 'course-1' }, 'POST');
  await f.request({ op: 'review', rating: 4, text: 'Eğitimin genelinden memnunum.', anonymous: true, section: 'other', topic: 'course-2' }, 'POST');
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].rating, 4);
  const read = await f.request({ topic: 'unrelated', section: 'unrelated' });
  assert.equal(read.status, 200); assert.equal(read.body.posts.length, 1);
  assert.equal(read.body.myReview.id, f.rows[0].id);
});
test('kalemle düzenleme başka öğrencinin yorumunu değiştiremez', async t => {
  const row = { id: '20000000-0000-0000-0000-000000000099', channel_id: scope.channel,
    section_id: 'old-section', topic_id: 'old-topic', kind: 'review', user_id: 'another-student',
    rating: 2, body: 'Eski öğrencinin yorumu', anonymous: true };
  const f = fixture(t, { posts: [row] });
  assert.equal((await f.request({ op: 'review', id: row.id, rating: 5, text: 'Yorumu değiştirmeye çalışıyorum', anonymous: true }, 'POST')).status, 403);
  assert.equal(f.rows[0].rating, 2);
});
test('eski konu yorumları ve soruları genel akışta görünür, silinmez', async t => {
  const rows = ['review', 'question'].map((kind, i) => ({ id: '20000000-0000-0000-0000-' + String(i + 1).padStart(12, '0'),
    user_id: 'another-student', channel_id: scope.channel, section_id: 'old-section', topic_id: 'old-topic',
    lesson_id: 'old-lesson', kind, body: 'Eski kayıt burada kalmalı', anonymous: true, rating: kind === 'review' ? 4 : null }));
  const f = fixture(t, { posts: rows });
  assert.equal((await f.request()).body.posts.length, 1);
  assert.equal((await f.request({ view: 'questions' })).body.posts.length, 1);
  assert.equal(f.rows.length, 2);
  assert.equal(f.rows[1].topic_id, 'old-topic');
});
test('migration RLS ve tek öğrenci/konu yorumu kısıtını içerir', () => {
  const sql = fs.readFileSync(new URL('../supabase/site/016_edu_feedback.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all .* from anon, authenticated/i);
  assert.match(sql, /create unique index if not exists edu_feedback_one_review/i);
});
test('yorumlar sayfalanır, eski kayıtlar kaybolmaz', async t => {
  const posts = Array.from({ length: 31 }, (_, i) => ({
    id: '20000000-0000-0000-0000-' + String(i + 1).padStart(12, '0'),
    channel_id: scope.channel, section_id: scope.section, topic_id: scope.topic,
    user_id: 'student-' + i, kind: 'review', display_name: 'Ad', anonymous: true, rating: 4, body: 'Açıklayıcı eğitim.'
  }));
  const f = fixture(t, { posts });
  const first = await f.request(), second = await f.request({ offset: 30 });
  assert.equal(first.body.posts.length, 30); assert.equal(first.body.hasMore, true);
  assert.equal(second.body.posts.length, 1); assert.equal(second.body.hasMore, false);
});
test('Alfa Edu mevcut kanal görünümüne ve mevcut API fonksiyonuna bağlanır', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../api/edu-shared.mjs', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../assets/edu-feedback.js', import.meta.url), 'utf8');
  assert.match(html, /id="edu-feedback" class="edu-feedback hidden"/);
  assert.match(html, /mountEduFeedback\(t, cur, curVid\)/);
  assert.match(api, /kind === 'feedback'/);
  assert.match(client, /alfa-edu-feedback-prompts-v1/);
  for (const word of ['promptStart', 'promptMiddle', 'promptEnd', 'Sonra']) assert.ok(client.includes(word));
  assert.ok(!client.includes('innerHTML'));
});

test('Alfa Edu katalogdan kurs oynatıcıya direkt geçer', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of [
    'edu-hero', 'edu-search', 'edu-chips', 'edu-grid', 'edu-empty', 'edu-overall',
    'edu-continue', 'edu-manage-toggle', 'edu-crumb-course', 'edu-meta-pills',
    'ch-now-kicker', 'ch-admin-controls'
  ]) assert.ok(html.includes('id="' + id + '"'), id + ' eksik');
  assert.match(html, /function renderEduCatalog\(\)/);
  assert.match(html, /function openCourse\(traderId, secId\)/);
  assert.match(html, /openCourse\(c\.t\.id, c\.sec\.id\)/);
  assert.match(html, /refreshEduDynamic\(\)/);
  assert.ok(!html.includes('eg-no-channel'), 'ara kanal seçim metni kalmamalı');
  assert.match(html, /\/assets\/edu-feedback\.js\?v=4/);
  assert.match(html, /\/assets\/edu-feedback\.css\?v=4/);
});

test('Alfa Edu kurs kartları sabit yerel görseller kullanır', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const map = {
    teknik: 'assets/edu-technical.jpg',
    temel: 'assets/edu-fundamental.jpg',
    psikoloji: 'assets/edu-psychology.jpg',
    islem: 'assets/edu-execution.jpg',
    onchain: 'assets/edu-onchain.jpg'
  };
  for (const [id, src] of Object.entries(map)) {
    assert.ok(html.includes(id + ": '" + src + "'"), id + ' görsel eşlemesi eksik');
  }
  assert.match(html, /function eduThumb\(secId\)/);
  assert.match(html, /img\.src = eduThumb\(c\.sec\.id\)/);
  const helperEnd = html.indexOf('function eduLast()');
  const helperBlock = html.slice(html.indexOf('const EDU_THUMBS'), helperEnd);
  assert.ok(!/alfa-influencer-(trading|writing|network|creator)\.jpg/.test(helperBlock), 'influencer rotation kalmamalı');
  for (const file of [...Object.values(map), 'assets/edu-advanced.jpg']) {
    const path = new URL('../' + file, import.meta.url);
    assert.ok(fs.existsSync(path), file + ' eksik');
    const buf = fs.readFileSync(path);
    assert.equal(buf.subarray(0, 3).toString('hex'), 'ffd8ff', file + ' JPEG değil');
    assert.ok(buf.length > 10000, file + ' çok küçük');
  }
});

test('Edu konu etiketleri ve fotoğraf notu TR/EN tanımlı', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const keys = [
    ["'edu.topic.teknik': { tr: 'PRICE ACTION · HACİM', en: 'PRICE ACTION · VOLUME' }"],
    ["'edu.topic.temel': { tr: 'MAKRO · HABER · WASH', en: 'MACRO · NEWS · WASH' }"],
    ["'edu.topic.psikoloji': { tr: 'SABIR · ÇİPALAMA · AÇGÖZLÜK', en: 'PATIENCE · FOMO · GREED' }"],
    ["'edu.topic.islem': { tr: 'BACKTEST · UYGULAMA', en: 'BACKTEST · EXECUTION' }"],
    ["'edu.topic.onchain': { tr: 'L/S · OI · SPOT CVD', en: 'L/S · OI · SPOT CVD' }"],
    ["'edu.photoNote': { tr: 'Fotoğraflar temsilidir.', en: 'Photos are illustrative.' }"]
  ];
  keys.forEach(([entry]) => assert.ok(html.includes(entry), entry + ' eksik'));
  assert.ok(html.includes("topic.className = 'edu-thumb-topic'"));
  assert.ok(html.includes('data-i18n="edu.photoNote"'));
});

test('Edu paket kartı herkese açık karşılaştırmaya gider; ders veya erişim kodu içermez', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../assets/edu-feedback.css', import.meta.url), 'utf8');
  const start = html.indexOf('function eduAdvancedCard()');
  const end = html.indexOf('function eduCard(c, i)', start);
  assert.ok(start > -1 && end > start);
  const block = html.slice(start, end);
  assert.ok(block.includes("card.className = 'edu-card edu-plan-link'"));
  assert.ok(block.includes("img.src = 'assets/edu-advanced.jpg'"));
  assert.ok(block.includes("showPage('eduplans')"));
  assert.ok(!block.includes('card.disabled = true'));
  assert.ok(html.includes('grid.appendChild(eduAdvancedCard())'));
  assert.ok(html.indexOf('grid.appendChild(eduAdvancedCard())') < html.indexOf('list.forEach((c, i) => grid.appendChild(eduCard(c, i)))'));
  for (const leak of ['href', 'location', 'fetch(', 'accessCode', 't.me', 'http', '?page=']) {
    assert.ok(!block.toLowerCase().includes(leak.toLowerCase()), leak + ' kilitli kartta sızdı');
  }
  for (const rule of ['.edu-card.locked', '.edu-thumb-topic', '.edu-lock', '.edu-photo-note']) {
    assert.ok(css.includes(rule), rule + ' stili eksik');
  }
});
