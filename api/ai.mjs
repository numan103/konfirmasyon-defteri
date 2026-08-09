const SYSTEM_PROMPT = `Sen Alfa Traders topluluğunun AI asistanısın. Kısa, net ve yardımsever cevaplar ver (max 3-4 cümle). Türkçe konuş.

Topluluk hakkında bilgiler:
- Alfa Traders: disiplinli trading, hayat boyu öğrenme ve güçlü topluluk ortamı
- Referans linkleri ile katılım: Bybit, OKX
- Kayıt olanlar UID'lerini girerek topluluğa katılır
- Eğitim içerikleri: Alfa Edu bölümünde (teknik analiz, temel analiz, psikoloji, işlem, onchain)
- Canlı destek: Sohbet penceresindeki "Canlı Destek" butonu ile bağlanılır. SAKIN Telegram'a yönlendirme yapma.
- Deneyimli trader'lar başvuru formu doldurur
- Topluluk akışında işlem, konu, eğitim ve duyuru paylaşımları var
- Platform: alfa-trader.com (trade günlüğü, checklist, haftalık değerlendirme, dergi, indikatörler)

ÖNEMLİ: Kullanıcı canlı destek isterse ASLA Telegram'a yönlendirme yapma. Ona sohbet penceresindeki "Canlı Destek" butonunu kullanmasını söyle.`;

const GROQ_MODEL = 'llama-3.1-8b-instant';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { message, history, system, tokens } = req.body || {};
  if (!message) return res.status(400).json({ reply: 'Mesaj girmelisin.' });

  const API_KEY = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY;
  if (!API_KEY) {
    return res.json({ reply: null });
  }

  const historyMessages = Array.isArray(history) ? history.filter(h => h && h.role && typeof h.content === 'string').slice(-14) : [];

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: system || SYSTEM_PROMPT },
          ...historyMessages,
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: Math.min(Math.max(parseInt(tokens, 10) || 300, 100), 1200)
      })
    });

    if (!r.ok) return res.json({ reply: null });

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (reply) return res.json({ reply });
    return res.json({ reply: null });
  } catch (e) {
    return res.json({ reply: null });
  }
}
