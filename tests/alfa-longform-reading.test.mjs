import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { groupMagazineArticles, isEducationArticle } from '../assets/magazine-articles.mjs';
import { speechChunks } from '../assets/article-speech.mjs';
import { cleanPDF, MAX_PDF_BYTES } from '../lib/edu-pdf.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const publishedAt = '2026-11-21T12:18:08.000Z';
const part = (n, body, extra = {}) => ({
  id: 'mag_' + n, authorId: 'traderahmetd', publishedAt,
  sourceLink: 'https://t.me/alfakasim/977/' + n, body, images: [], ...extra,
});

test('long Alfa Edu Telegram split is read as one continuous article', () => {
  const entries = [
    part(987, 'BTC - HTF', { id: 'btc', title: 'BTC - HTF' }),
    part(992, '# Alfa Edu\nPİYASAYI OKUMAK: MAKRODAN TRADER PSİKOLOJİSİNE\n' + 'A'.repeat(4000), { images: ['https://example.com/chart.jpg'] }),
    part(993, 'olduğu sonucuna varılamaz.\n' + 'B'.repeat(4000)),
    part(994, 'kapatılmasına yol açabilir.\n' + 'C'.repeat(2500)),
    part(995, 'Alfa Edu - Bir Düşüşün Anatomisi ve Çıkarılan Dersler', { id: 'pdf', title: 'Alfa Edu - Bir Düşüşün Anatomisi ve Çıkarılan Dersler' }),
  ];
  const grouped = groupMagazineArticles(entries);
  assert.equal(grouped.length, 2);
  const article = grouped.find(e => e.sourceLink.endsWith('/992'));
  assert.equal(article.education, true);
  assert.equal(article.title, 'PİYASAYI OKUMAK: MAKRODAN TRADER PSİKOLOJİSİNE');
  assert.equal(article.sourceParts.length, 3);
  assert.deepEqual(article.sourceParts.map(p => p.sourceLink), [
    'https://t.me/alfakasim/977/992',
    'https://t.me/alfakasim/977/993',
    'https://t.me/alfakasim/977/994',
  ]);
  assert.deepEqual(article.images, ['https://example.com/chart.jpg']);
  assert.ok(article.body.startsWith('# Alfa Edu'));
  assert.ok(article.body.includes('olduğu sonucuna varılamaz.'));
  assert.ok(article.body.endsWith('C'.repeat(2500)));
  assert.equal(article.body.length, entries.slice(1, 4).reduce((sum, e) => sum + e.body.length + 2, 0) - 2);
  assert.equal(article.pdfLink, 'https://t.me/alfakasim/977/995');
});

test('continuations never swallow another topic, author or oversized document', () => {
  const first = part(992, '# Alfa Edu\nUzun eğitim yazısı\n' + 'A'.repeat(3600));
  const otherAuthor = part(993, 'devam eden metin\n' + 'B'.repeat(3600), { authorId: 'someoneelse' });
  assert.equal(groupMagazineArticles([first, otherAuthor]).length, 2);

  const oldTopic = part(992, '# Alfa Edu\nUzun eğitim yazısı\n' + 'A'.repeat(3600));
  const nextDay = part(993, 'devam eden metin\n' + 'B'.repeat(3600), { publishedAt: '2026-11-22T12:18:08.000Z' });
  assert.equal(groupMagazineArticles([oldTopic, nextDay]).length, 2);

  const oversized = part(993, 'devam eden metin\n' + 'B'.repeat(200001));
  assert.equal(groupMagazineArticles([first, oversized]).length, 2);
  assert.equal(isEducationArticle(first), true);
  assert.equal(isEducationArticle(part(987, 'BTC - HTF')), false);
});

test('PDF attachments stay inside the verified Vercel Blob path', () => {
  const url = 'https://alfa-edu-xyz.public.blob.vercel-storage.com/alfa-edu-pdf/lesson-123.pdf';
  const pdf = cleanPDF({ url, name: 'Ders.pdf', size: 2048 });
  assert.deepEqual(pdf, { url, name: 'Ders.pdf', size: 2048 });
  assert.equal(cleanPDF({ url, size: MAX_PDF_BYTES + 1 }), null);
  assert.equal(cleanPDF({ url: url.replace('.pdf', '.html'), size: 2048 }), null);
  assert.equal(cleanPDF({ url: 'https://example.com/alfa-edu-pdf/lesson-123.pdf', size: 2048 }), null);
});

test('speech reading keeps every word inside bounded chunks', () => {
  const words = Array.from({ length: 90 }, (_, i) => 'kelime' + i);
  const chunks = speechChunks('# Başlık\n' + words.join(' '), 120);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 120));
  assert.deepEqual(chunks.join(' ').split(' ').filter(Boolean), ['Başlık', ...words]);
});

test('continuous reader and speech controls are wired into both surfaces', () => {
  for (const marker of [
    'id="home-mag-article-reader"', 'id="edu-magazine-reading"', 'id="ch-pdf-editor"',
    '/assets/magazine-reading.mjs?v=1', '/assets/magazine-reading.css?v=1',
    'AlfaArticleSpeech.controls', 'window.MagazineReading.renderHome'
  ]) assert.ok(html.includes(marker), marker + ' bulunamadı');
});
