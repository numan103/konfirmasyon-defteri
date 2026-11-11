// Telegram soru-cevap botu.
// Kullanicilarin piyasa sorularini mevcut veriler esliginde AI ile cevaplar.
import { groq } from './macro/research.mjs';
import { readStrategies, formatStrategiesForPrompt, addStrategy, removeStrategy } from './telegram-qa-strategies.mjs';
import { collectOrderbookLevels } from './orderbook-levels.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const FALLBACK_PUB = 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const QA_RATE_ROW = 'telegram_qa_rate';

function supabaseKey(write) {
  const secret = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (write && secret) return secret;
  return String(process.env.SUPABASE_PUBLISHABLE || FALLBACK_PUB).trim();
}
function sbHeaders(key) {
  const h = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) h.Authorization = 'Bearer ' + key;
  return h;
}

// Rate limit: kullanici basina saatte max 5 soru.
async function checkRateLimit(userId) {
  const key = supabaseKey(false);
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + QA_RATE_ROW + '&select=data', {
      headers: sbHeaders(key), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return true; // hata durumunda izin ver
    const rows = await r.json();
    const data = (rows && rows[0] && rows[0].data) || {};
    const userKey = String(userId);
    const now = Date.now();
    const hourAgo = now - 3600000;
    const entries = (data[userKey] || []).filter(t => t > hourAgo);
    if (entries.length >= 20) return false;
    entries.push(now);
    data[userKey] = entries;
    // Temizlik: 24 saatlik eski verileri sil
    for (const k of Object.keys(data)) {
      data[k] = (data[k] || []).filter(t => t > now - 86400000);
      if (!data[k].length) delete data[k];
    }
    const wKey = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
    if (wKey) {
      await fetch(SUPABASE_URL + '/rest/v1/edu_shared', {
        method: 'POST',
        headers: { ...sbHeaders(wKey), Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ id: QA_RATE_ROW, data }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
    return true;
  } catch { return true; }
}

// Piyasa verisi topla (cache: 5 dk).
let cachedData = null;
let cachedAt = 0;
async function getMarketData() {
  if (cachedData && Date.now() - cachedAt < 300000) { console.log('getMarketData: cached'); return cachedData; }
  console.log('getMarketData: fetching...');
  const data = {};
  try {
    const c = await collectCoinalyzeData(Date.now(), process.env.COINALYZE_API_KEY);
    data.coinalyze = c;
  } catch (e) { data.coinalyzeError = String(e.message || e).slice(0, 100); }
  try {
    const o = await collectOrderbookLevels();
    data.orderbook = o;
  } catch (e) { data.orderbookError = String(e.message || e).slice(0, 100); }
  cachedData = data;
  cachedAt = Date.now();
  return data;
}

function formatMarketContext(data) {
  const lines = [];
  if (data.coinalyze?.cvd) {
    lines.push('Spot CVD (24s): ' + (data.coinalyze.cvd.coin ?? 0).toFixed(0) + ' BTC · ' + ((data.coinalyze.cvd.usd ?? 0) / 1e6).toFixed(1) + ' mn$');
  }
  if (data.coinalyze?.lsr) {
    lines.push('Long/Short: ' + (data.coinalyze.lsr.ratio ?? 0).toFixed(2) + ' · Long %' + (data.coinalyze.lsr.longPct ?? 0).toFixed(1) + ' / Short %' + (data.coinalyze.lsr.shortPct ?? 0).toFixed(1));
  }
  if (data.coinalyze?.oi) {
    const oi = data.coinalyze.oi.total;
    const prev = data.coinalyze.oiPrev?.total;
    let oiLine = 'Açık pozisyon: ' + (oi / 1e9).toFixed(2) + ' mlr$';
    if (prev && prev > 0) oiLine += ' · 24s ' + ((oi / prev - 1) * 100).toFixed(1) + '%';
    lines.push(oiLine);
  }
  if (data.coinalyze?.verdict) {
    lines.push('Yön: ' + data.coinalyze.verdict.bias + ' — ' + (data.coinalyze.verdict.reasons || []).join(', '));
  }
  if (data.orderbook?.bidWalls?.length) {
    const topBid = data.orderbook.bidWalls.reduce((a, b) => a[1] > b[1] ? a : b);
    const topAsk = data.orderbook.askWalls.length ? data.orderbook.askWalls.reduce((a, b) => a[1] > b[1] ? a : b) : null;
    lines.push('En büyük alış duvarı: $' + Number(topBid[0]).toLocaleString('tr-TR') + ' (' + Number(topBid[1]).toFixed(0) + ' BTC)');
    if (topAsk) lines.push('En büyük satış duvarı: $' + Number(topAsk[0]).toLocaleString('tr-TR') + ' (' + Number(topAsk[1]).toFixed(0) + ' BTC)');
  }
  if (data.coinalyzeError) lines.push('Coinalyze verisi alınamadı: ' + data.coinalyzeError);
  if (data.orderbookError) lines.push('Order book verisi alınamadı: ' + data.orderbookError);
  return lines.join('\n');
}

export async function answerQuestion(question, userId) {
  console.log('answerQuestion called:', question?.slice(0, 50));
  if (!question || question.trim().length < 3) return 'Lütfen bir soru yaz. Örnek: "BTC şu an hangi yöne baskın?"';
  if (!(await checkRateLimit(userId))) return 'Saatte en fazla 5 soru sorabilirsin. Lütfen biraz bekle.';

  const marketData = await getMarketData();
  const context = formatMarketContext(marketData);
  const strategies = await readStrategies();
  const stratContext = formatStrategiesForPrompt(strategies);

  const messages = [
    {
      role: 'system',
      content: 'Sen Alfa Traders topluluğunun piyasa analist asistanısın. Türkçe cevap ver. Kısa, net ve bilgilendirici ol. Yatırım tavsiyesi verme; "bu bir yatırım tavsiyesi değildir" notunu ekle.\n\nÖNEMLİ: Şu an yalnızca BTC (Bitcoin) için güncel piyasa verisi mevcut. Başka bir coin (PEPE, ETH, SOL vb.) sorulursa, "Şu an yalnızca BTC verisi mevcut, diğer coinler için veri yok" de. Veriler sınırlı olabilir; eksik veri varsa belirt. Piyasa geneli, makro ve genel kripto bilgisi sorularına da cevap verebilirsin.' + stratContext,
    },
    {
      role: 'user',
      content: 'Mevcut piyasa verileri (yalnızca BTC):\n' + context + '\n\nSoru: ' + question.trim(),
    },
  ];

  try {
    const { groq } = await import('./macro/research.mjs');
    const answer = await groq(messages, { format: 'text', tokens: 1000 });
    return answer + '\n\n⚠️ Bu bir yatırım tavsiyesi değildir.';
  } catch (e) {
    return 'Cevap üretilemedi: ' + String(e.message || e).slice(0, 120);
  }
}

export async function handleTelegramUpdate(update) {
  const msg = update?.message || update?.edited_message;
  if (!msg) return null;
  // Fotoğraf mesajları: caption varsa işle, yoksa bilgi ver
  const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
  if (!msg.text && !msg.caption && !hasPhoto) return null;
  console.log('handleTelegramUpdate:', (msg.text || msg.caption || '[photo]')?.slice(0, 50), 'chat:', msg.chat?.id, 'type:', msg.chat?.type, 'thread:', msg.message_thread_id, 'photo:', hasPhoto);
  const chatId = msg.chat?.id;
  const threadId = msg.message_thread_id || null;
  const userId = msg.from?.id;
  const text = (msg.text || msg.caption || '').trim();
  if (!text && hasPhoto) {
    // Sadece fotoğraf gönderilmiş, metin yok
    return { chatId, threadId, reply: 'Fotoğraf aldım. Ne hakkında yorum yapmamı istiyorsun? Sorunu yaz, fotoğrafı da ekleyebilirsin.' };
  }

  // Yalnızca izin verilen chat'te veya DM'de cevap ver
  const allowedChat = process.env.TG_QA_CHAT_ID || process.env.TG_CHAT_ID;
  const isPrivate = msg.chat?.type === 'private';
  if (!isPrivate && allowedChat && String(chatId) !== String(allowedChat)) return null;
  const allowedThread = process.env.TG_QA_THREAD;
  if (!isPrivate && allowedThread && threadId && String(threadId) !== String(allowedThread)) return null;

  // Komutlar
  if (text === '/start' || text === '/help') {
    return {
      chatId, threadId,
      reply: 'Merhaba! Ben Alfa Traders piyasa asistanıyım. BTC, ETH ve makro veriler hakkında soru sorabilirsin.\n\nKomutlar:\n/ask <soru> - Soru sor\n/data - Güncel piyasa verileri\n/strateji - Stratejileri listele/ekle/sil\n/help - Yardım\n\nÖrnek: /ask BTC şu an hangi yöne baskın?\n\nSaatte en fazla 20 soru sorabilirsin.',
    };
  }

  if (text === '/data') {
    const marketData = await getMarketData();
    const context = formatMarketContext(marketData);
    return { chatId, threadId, reply: '📊 Güncel Piyasa Verileri:\n\n' + context + '\n\n⚠️ Bu bir yatırım tavsiyesi değildir.' };
  }

  // /strateji komutu: stratejileri listele/ekle/sil
  if (text === '/strateji' || text === '/strategy') {
    const strategies = await readStrategies();
    if (!strategies.length) return { chatId, threadId, reply: 'Henüz strateji eklenmemiş. Eklemek için:\n/strateji ekle <isim> | <açıklama>\n\nÖrnek: /strateji ekle CVD Momentum | Spot CVD işlem yönünde ve OI artıyorsa giriş yap' };
    return { chatId, threadId, reply: '📋 Stratejilerin:\n\n' + strategies.map(s => '• ' + s.name + ': ' + s.description).join('\n') + '\n\nEklemek için: /strateji ekle <isim> | <açıklama>\nSilmek için: /strateji sil <isim>' };
  }
  if (text.startsWith('/strateji ekle ') || text.startsWith('/strategy add ')) {
    const parts = text.replace(/^\/strateji ekle |^\/strategy add /, '').split('|');
    const name = (parts[0] || '').trim();
    const desc = (parts[1] || '').trim();
    if (!name || !desc) return { chatId, threadId, reply: 'Format: /strateji ekle <isim> | <açıklama>' };
    const ok = await addStrategy(name, desc);
    return { chatId, threadId, reply: ok ? '✅ Strateji eklendi: ' + name : '❌ Strateji kaydedilemedi.' };
  }
  if (text.startsWith('/strateji sil ') || text.startsWith('/strategy remove ')) {
    const name = text.replace(/^\/strateji sil |^\/strategy remove /, '').trim();
    if (!name) return { chatId, threadId, reply: 'Format: /strateji sil <isim>' };
    const ok = await removeStrategy(name);
    return { chatId, threadId, reply: ok ? '✅ Strateji silindi: ' + name : '❌ Strateji bulunamadı.' };
  }
  // /ask komutu
  if (text.startsWith('/ask ')) {
    const question = text.slice(5).trim();
    const answer = await answerQuestion(question, userId);
    return { chatId, threadId, reply: answer };
  }

  // Soru olarak işle (sadece DM'de veya bot mention'ında)
  const isQaTopic = allowedChat && String(chatId) === String(allowedChat);
  const isMention = text.includes('@alfaportfoy_bot');

  if (isQaTopic || isPrivate || isMention) {
    const cleanText = text.replace(/@alfaportfoy_bot/g, '').trim();
    const answer = await answerQuestion(cleanText, userId);
    return { chatId, threadId, reply: answer };
  }

  // Grup mesajı ve komut değilse sessiz kal
  return null;
}
