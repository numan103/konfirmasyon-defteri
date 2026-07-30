const SYSTEM_PROMPT = `Sen Alfa Traders topluluğunun AI asistanısın. Kısa, net ve yardımsever cevaplar ver (max 3-4 cümle). Türkçe konuş.

Topluluk hakkında bilgiler:
- Alfa Traders: disiplinli trading, hayat boyu öğrenme ve güçlü topluluk ortamı
- Referans linkleri ile katılım: Bybit (https://partner.bybit.com/b/cryptoahmet), OKX (https://www.okx.com/join/CRYPTOAHMET)
- Kayıt olanlar UID'lerini girerek topluluğa katılır
- Eğitim içerikleri: Alfa Edu bölümünde (teknik analiz, temel analiz, psikoloji, işlem, onchain)
- Telegram grubu: https://t.me/alfatraderspublic
- Deneyimli trader'lar başvuru formu doldurur (Google Sheets'e kaydedilir)
- Topluluk akışında işlem, konu, eğitim ve duyuru paylaşımları var
- Platform: alfatraders.vercel.app (trade günlüğü, checklist, haftalık değerlendirme, dergi, indikatörler)`;

const HF_MODEL = 'gpt2';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { message } = req.body || {};
  if (!message) return res.status(400).json({ reply: 'Mesaj girmelisin.' });

  const API_KEY = process.env.GEMINI_API_KEY || process.env.HF_API_KEY;
  if (!API_KEY) {
    return res.json({ reply: '🤖 AI henüz aktif değil. Sorunu kaydettim, ekibimiz dönecek.' });
  }

  const isGemini = API_KEY.startsWith('AIzaSy');

  try {
    if (isGemini) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
            { role: 'model', parts: [{ text: 'Anlaşıldı.' }] },
            { role: 'user', parts: [{ text: message }] }
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
        })
      });
      const data = await r.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) return res.json({ reply });
      return res.json({ reply: 'Üzgünüm, cevap veremiyorum.' });
    }

    const targetUrl = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
    if (!API_KEY.startsWith('hf_')) return res.json({ reply: 'Token hatası: ' + API_KEY.substring(0, 10) + '...' });
    const r = await fetch(targetUrl, { signal: AbortSignal.timeout(8000) });
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: `<s>[INST] ${SYSTEM_PROMPT}\n\nKullanıcı: ${message} [/INST]`,
        parameters: { max_new_tokens: 300, temperature: 0.7, return_full_text: false }
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.json({ reply: 'HF hatası (' + r.status + '): ' + errText.substring(0, 200) });
    }

    const data = await r.json();
    const reply = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
    if (reply) return res.json({ reply: reply.trim() });
    const errMsg = typeof data === 'object' ? (data.error || JSON.stringify(data)) : 'Hata';
    return res.json({ reply: 'Cevap alınamadı: ' + errMsg });
  } catch (e) {
    return res.json({ reply: 'Hata: ' + e.constructor.name + ' - ' + e.message.substring(0, 150) });
  }
}
