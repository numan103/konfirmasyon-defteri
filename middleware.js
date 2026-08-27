// Alfa Traders — Vercel Routing Middleware (dinamik sosyal önizleme)
// Sosyal botlar (Telegram, Twitter/X, Facebook, LinkedIn, WhatsApp, Discord vb.) gelince
// ?page=...&post=... sorgusuna göre içeriğe özel og:title / og:description döndürür.
// İnsan kullanıcılar için `undefined` döner → istek statik SPA'ya olduğu gibi devam eder.
// Not: Vercel, Next.js olmayan projelerde standart Request/Response API'sini kullanır
// (next/server import'u desteklenmez).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE || 'sb_publishable_3esU1e0mIeUaSrmqPxsEfQ_Lcv11GLa';
const IMG = '/og.png';

const BOT_RE = /(telegrambot|twitterbot|facebookexternalhit|facebookcatalog|linkedinbot|slackbot|discordbot|whatsapp|viber|line-preview|linespider|tumblr|redditbot|snapchat|skypeuripreview|microblog|embedly|ia_archiver|bingbot|googlebot|google-inspectiontool|duckduckbot|petalbot|yandex|baiduspider|curl|wget|python-requests|urllib)/i;

const PAGES = {
  home: { title: 'Alfa Traders — Konfirmasyon Defteri', desc: 'Konfluens analizi, işlem karnesi, plan ve disiplin — tüm araçlar tek panelde.' },
  butce: { title: 'Alfa Traders — Alfa Defter (Bütçe)', desc: 'Alfa Defter — bütçe ve sermaye yönetimiyle işlemlerini takip et.' },
  defter: { title: 'Alfa Traders — Check List', desc: 'Check List — kriter analizi, konfluens skoru ve planla setup kalitesini ölç.' },
  data: { title: 'Alfa Traders — Trade Günlüğü', desc: 'Trade Günlüğü — işlemlerini kaydet, günlük veriyi analiz et.' },
  onchain: { title: 'Alfa Traders — Onchain', desc: 'Onchain — zincir üstü verileri ve akışları takip et.' },
  calc: { title: 'Alfa Traders — Alfa Calculator', desc: 'Alfa Calculator — kaldıraç, risk, R:R ve konum büyüklüğü hesapları.' },
  review: { title: 'Alfa Traders — Haftalık Değerlendirme', desc: 'Haftalık Değerlendirme — haftanın işlemlerini ve planlarını gözden geçir.' },
  karne: { title: 'Alfa Traders — Günün Karnesi', desc: 'Günün Karnesi — günlük işlem karnesi ve yaşam dengesi takibi.' },
  trading: { title: 'Alfa Traders — Trading', desc: 'Trading — işlem disiplini ve psikolojisi.' },
  alfatrading: { title: 'Alfa Traders — Alfa Trading', desc: 'Alfa Trading — analiz ve işlem paylaşım akışı, topluluk.' },
  egitim: { title: 'Alfa Traders — Alfa Edu', desc: 'Alfa Edu — eğitim ve öğrenme materyalleri.' },
  strategies: { title: 'Alfa Traders — Stratejiler', desc: 'Stratejiler — strateji açıklamaları ve kuralları.' },
  analiz: { title: 'Alfa Traders — Analiz Köşesi', desc: 'Analiz Köşesi — piyasa analizleri ve yorumlar.' },
  pano: { title: 'Alfa Traders — Çalışma Panosu', desc: 'Çalışma Panosu — takım ve ortak görev panosu.' },
  mentoring: { title: 'Alfa Traders — Mentoring', desc: 'Mentoring — mentorluk ve birebir koçluk.' },
  indicators: { title: 'Alfa Traders — İndikatörler', desc: 'İndikatörler — özel indikatör setleri.' },
  designer: { title: 'Alfa Traders — Alfa Designer', desc: 'Alfa Designer — tasarım ve gösterge yapılandırma.' },
  calendar: { title: 'Alfa Traders — Ekonomik Takvim', desc: 'Ekonomik Takvim — önemli ekonomik veriler ve takvim.' },
  news: { title: 'Alfa Traders — AlfaNews', desc: 'AlfaNews — paylaşımlı analiz dergisi.' },
  basvuru: { title: 'Alfa Traders — Alfa Ol', desc: 'Alfa Ol — topluluğa katılma başvurusu.' },
  apps: { title: 'Alfa Traders — Başvurular', desc: 'Başvurular — admin başvuru yönetimi.' },
  'chat-admin': { title: 'Alfa Traders — Alfa Chat', desc: 'Alfa Chat — topluluk sohbeti.' },
};

const DEFAULT = {
  title: 'Alfa Traders — Konfirmasyon Defteri',
  desc: 'Konfluens analizi, işlem karnesi, plan ve disiplin. Alfa Trading analiz & işlem akışı, haftalık değerlendirme ve topluluk.',
};

export const config = { matcher: ['/', '/index.html'] };

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_RE.test(ua)) return undefined;

  const url = new URL(request.url);
  const page = url.searchParams.get('page');
  const post = url.searchParams.get('post');

  let meta = DEFAULT;
  if (page === 'alfatrading') {
    meta = post ? (await fetchPost(post)) || PAGES.alfatrading : PAGES.alfatrading;
  } else if (page && PAGES[page]) {
    meta = PAGES[page];
  }

  const html = render(url.origin, url.pathname + url.search, meta, page === 'alfatrading' && !!post);
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=600, s-maxage=600',
    },
  });
}

async function fetchPost(pid) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/edu_shared?id=eq.alfa_trading&select=data',
      {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
        signal: ctrl.signal,
      }
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const rows = await res.json();
    const data = rows && rows[0] && rows[0].data;
    const posts = (data && data.posts) || [];
    const p = posts.find(x => x.id === pid);
    if (!p) return null;
    return postMeta(p);
  } catch (e) {
    return null;
  }
}

function postMeta(p) {
  const typeLabel = p.type === 'islem' ? 'İşlem' : 'Analiz';
  const head = [];
  if (p.coin) head.push(p.coin);
  head.push(typeLabel);
  if (p.type === 'islem' && p.dir) head.push(p.dir === 'long' ? 'LONG' : 'SHORT');
  const headStr = head.join(' · ');
  const title = (p.title ? p.title + ' — ' : '') + headStr;

  let desc = String(p.text || '').replace(/\s+/g, ' ').trim();
  if (!desc && p.repost) desc = String(p.repost.text || p.repost.title || '').replace(/\s+/g, ' ').trim();
  if (!desc && p.type === 'islem') {
    const parts = [];
    if (p.entry) parts.push('Entry ' + p.entry);
    if (p.tp) parts.push('TP ' + p.tp);
    if (p.sl) parts.push('SL ' + p.sl);
    if (p.lev) parts.push('Kaldıraç ' + p.lev);
    desc = parts.join(' · ');
  }
  if (!desc) desc = 'Alfa Trading topluluk paylaşımı.';
  if (desc.length > 180) desc = desc.slice(0, 177) + '…';

  const author = String(p.author || 'Admin').slice(0, 40);
  let when = '';
  if (p.ts) {
    try { when = new Date(p.ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { when = ''; }
  }
  return { title, desc, sub: [author, when].filter(Boolean).join(' · ') };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(origin, path, meta, isPost) {
  const url = origin + path;
  const img = origin + IMG;
  const sub = meta.sub ? '<br>' + esc(meta.sub) : '';
  return '<!DOCTYPE html>\n<html lang="tr"><head><meta charset="utf-8">\n' +
    '<title>' + esc(meta.title) + '</title>\n' +
    '<meta name="description" content="' + esc(meta.desc) + '">\n' +
    '<meta property="og:site_name" content="Alfa Traders">\n' +
    '<meta property="og:type" content="' + (isPost ? 'article' : 'website') + '">\n' +
    '<meta property="og:title" content="' + esc(meta.title) + '">\n' +
    '<meta property="og:description" content="' + esc(meta.desc) + '">\n' +
    '<meta property="og:url" content="' + esc(url) + '">\n' +
    '<meta property="og:image" content="' + esc(img) + '">\n' +
    '<meta property="og:image:width" content="1200">\n' +
    '<meta property="og:image:height" content="630">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + esc(meta.title) + '">\n' +
    '<meta name="twitter:description" content="' + esc(meta.desc) + '">\n' +
    '<meta name="twitter:image" content="' + esc(img) + '">\n' +
    '<meta http-equiv="refresh" content="0; url=' + esc(url) + '">\n' +
    '<link rel="canonical" href="' + esc(url) + '">\n' +
    '</head><body style="margin:0;background:#0c0d1b;color:#fff;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center">' +
    '<div><h1 style="font-size:22px;margin:0 0 8px">' + esc(meta.title) + '</h1>' +
    '<p style="margin:0;color:#9fb0cf;line-height:1.5">' + esc(meta.desc) + sub + '</p>' +
    '<p style="margin:18px 0 0;color:#2aabee;font-size:13px;letter-spacing:.04em">ALFA TRADERS · Analiz · İşlem · Topluluk</p></div></body></html>';
}
