const GROQ_MODEL = 'llama-3.1-8b-instant';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `Sen Alfa Traders topluluğunun trading koçusun. Kullanıcının kişisel profiline (strateji, deneyim, duygusal zayıflıklar, problemler, ilgi/hedefler) göre kişiye özel bir işlem-öncesi kontrol listesi (checklist) tasarlarsın.

Görevin SADECE tek bir geçerli JSON nesnesi döndürmek. Açıklama, kod blokları (json ... işaretleri) EKLEME. Markdown yok.

JSON şeması:
{
  "criteria": [ { "name": "Kriter cümlesi", "cat": "veri|teknik|pozisyon|duygu", "l": 8, "s": 8 } ],
  "thresholds": { "aplus": 70, "b": 50 },
  "strategies": ["Strateji 1", "Strateji 2"],
  "pos": [ { "name": "Pozisyon esnasında kural cümlesi", "valid": true|false } ],
  "summary": "2-3 cümlelik kişiselleştirilmiş açıklama"
}

Kurallar:
- cat alanları: "veri" (piyasa verisi/orderflow), "teknik" (yapı, seviye, pattern), "pozisyon" (risk, plan, pozisyon yönetimi), "duygu" (psikolojik zayıflık filtresi).
- l (long) ve s (short) puanlardır; -12 ile +31 arasında olabilir, genelde aynı değer. duygu kategorisindeki maddeler NEGATİF puanlıdır (-6..-15) çünkü onlar kilit/ceza maddesidir. veri/teknik/pozisyon pozitif ya da (nadiren) negatif olabilir.
- Kullanıcının seçtiği duygusal zayıflıkları mutlaka "duygu" kategorisine negatif kilit maddesi olarak yansıt.
- Kripto profili için veri/orderflow kriterleri ekle; Altın (XAU) için teknik odaklı (manipülasyon, likidite, OTE, arz-talep) set kur ve veri maddelerini azalt.
- Toplam pozitif puanın tavanı ~95-100 olacak şekilde puanları dengele; eşikleri 70/50 civarında tut.
- "strategies" kullanıcının yazdığı strateji(ler)i içermeli, ekstra uygun olanları da ekleyebilirsin.
- "pos" 4-7 madde içermeli: en az bir tane "valid": true (plan gereği çıkış: invalidasyon, plan dışı haber) ve gerisi "valid": false (dürtü).
- Türkçe yaz, kısa ve uygulanabilir cümleler kullan.`;

function cleanJson(text) {
  if (!text) return null;
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  t = t.slice(start, end + 1);
  try { return JSON.parse(t); } catch (e) {
    // trailing comma temizleme denemesi
    try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); } catch (e2) { return null; }
  }
}

function validCat(c) { return c === 'veri' || c === 'teknik' || c === 'pozisyon' || c === 'duygu'; }

function sanitize(obj) {
  const out = { criteria: [], thresholds: { aplus: 70, b: 50 }, strategies: [], pos: [], summary: '' };
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj.criteria)) {
    obj.criteria.slice(0, 30).forEach(c => {
      if (!c || typeof c.name !== 'string') return;
      const name = String(c.name).trim().slice(0, 90);
      if (!name) return;
      const cat = validCat(c.cat) ? c.cat : 'teknik';
      let pts = Number(c.l);
      if (!isFinite(pts)) pts = Number(c.s);
      if (!isFinite(pts)) pts = 5;
      pts = Math.max(-15, Math.min(31, Math.round(pts)));
      const s = Number(c.s); const sp = isFinite(s) ? Math.max(-15, Math.min(31, Math.round(s))) : pts;
      if (cat === 'duygu' && pts > 0) pts = -Math.abs(pts);
      out.criteria.push({ name, cat, l: pts, s: (cat === 'duygu' ? -Math.abs(sp) : sp) });
    });
  }
  if (obj.thresholds && typeof obj.thresholds === 'object') {
    const a = Number(obj.thresholds.aplus); if (isFinite(a)) out.thresholds.aplus = Math.max(1, Math.min(100, Math.round(a)));
    const b = Number(obj.thresholds.b); if (isFinite(b)) out.thresholds.b = Math.max(0, Math.min(99, Math.round(b)));
    if (out.thresholds.b >= out.thresholds.aplus) out.thresholds.b = out.thresholds.aplus - 5;
  }
  if (Array.isArray(obj.strategies)) {
    obj.strategies.slice(0, 12).forEach(s => { const t = String(s).trim().slice(0, 40); if (t && !out.strategies.includes(t)) out.strategies.push(t); });
  }
  if (Array.isArray(obj.pos)) {
    obj.pos.slice(0, 8).forEach(p => {
      if (!p || typeof p.name !== 'string') return;
      const name = String(p.name).trim().slice(0, 110);
      if (!name) return;
      out.pos.push({ name, valid: !!p.valid });
    });
  }
  if (out.criteria.length === 0) out.criteria.push({ name: 'Key levelda', cat: 'teknik', l: 10, s: 10 });
  if (out.pos.length === 0) out.pos.push({ name: 'İnvalidasyon gerçekleşti — senaryo bozuldu', valid: true });
  if (typeof obj.summary === 'string') out.summary = obj.summary.trim().slice(0, 600);
  return out;
}

function fallbackProfile(profile) {
  const p = profile || {};
  const market = String(p.market || 'kripto').toLowerCase();
  const gold = market.indexOf('gold') !== -1 || market.indexOf('xau') !== -1 || market.indexOf('altın') !== -1 || market.indexOf('altin') !== -1;
  const exp = String(p.experience || '').toLowerCase();
  const beginner = exp.indexOf('yeni') !== -1 || exp.indexOf('başla') !== -1 || exp.indexOf('basla') !== -1;

  let base;
  if (gold) {
    base = [
      { name: 'Kırmızı haber var / yaklaşıyor', cat: 'veri', l: -15, s: -15 },
      { name: 'Manipülasyon kesin', cat: 'teknik', l: 14, s: 14 },
      { name: 'Likidite alındı', cat: 'teknik', l: 14, s: 14 },
      { name: 'Daily / 4H OTE bölgesinde', cat: 'teknik', l: 10, s: 10 },
      { name: 'Daily / 4H arz-talep bölgesinde', cat: 'teknik', l: 10, s: 10 },
      { name: 'Yapı net', cat: 'teknik', l: 8, s: 8 },
      { name: 'Günlük / 4H / 1H mum uyumlu', cat: 'teknik', l: 8, s: 8 },
      { name: 'Manipülasyon saatinde', cat: 'teknik', l: 6, s: 6 },
      { name: 'Entry sabah yazılan Daily Bias planından geliyor', cat: 'pozisyon', l: 20, s: 20 },
      { name: 'Peş peşe 2. kez aynı bölgeden giriyorum', cat: 'pozisyon', l: -12, s: -12 },
      { name: 'Daily plana zıt işlem', cat: 'pozisyon', l: -15, s: -15 }
    ];
  } else {
    base = [
      { name: 'Spot CVD işlem yönünde', cat: 'veri', l: 8, s: 8 },
      { name: 'Open Interest işlem yönünde', cat: 'veri', l: 6, s: 6 },
      { name: 'Long & Shorts Ratio işlem yönünde', cat: 'veri', l: 5, s: 5 },
      { name: 'Futures CVD işlem yönünde', cat: 'veri', l: 6, s: 6 },
      { name: 'Bid & Ask Delta işlem yönünde', cat: 'veri', l: 4, s: 4 },
      { name: 'Orderbook kümelenmesi destekliyor', cat: 'veri', l: 2, s: 2 },
      { name: 'İşlem trend yönünde', cat: 'teknik', l: 10, s: 10 },
      { name: 'Key levelda', cat: 'teknik', l: 10, s: 10 },
      { name: 'Manipülasyon gerçekleşti', cat: 'teknik', l: 8, s: 8 },
      { name: 'Bias flip', cat: 'teknik', l: 3, s: 3 },
      { name: 'Planlanmış entry', cat: 'pozisyon', l: 31, s: 31 },
      { name: '16:30 sonrası', cat: 'pozisyon', l: 3, s: 3 },
      { name: 'TP/SL paylaşımdan önce girildi', cat: 'pozisyon', l: 4, s: 4 }
    ];
  }

  const criteria = base.map(c => ({ ...c }));

  const emoMap = {
    fomo: { name: 'FOMO — hareket kaçıyor hissi', pts: 12 },
    revenge: { name: 'Az önce stop oldum — revenge penceresi', pts: 12 },
    impatience: { name: 'Sabırsızlık — setup eksikken girme dürtüsü', pts: 10 },
    fear: { name: 'Korku / çekinme — plana rağmen girememe', pts: 8 },
    overconfidence: { name: 'Aşırı özgüven — risk büyütme dürtüsü', pts: 10 },
    distracted: { name: 'Dikkat dağınıklığı / bölünmüş odak', pts: 8 },
    overtrading: { name: 'Aşırı işlem — boş ekran dürtüsü', pts: 10 }
  };
  const emos = Array.isArray(p.emotions) ? p.emotions : [];
  emos.forEach(e => {
    const m = emoMap[String(e).toLowerCase()];
    if (m && !criteria.some(c => c.cat === 'duygu' && c.name === m.name)) {
      criteria.push({ name: m.name, cat: 'duygu', l: -m.pts, s: -m.pts });
    }
  });
  if (criteria.some(c => c.cat === 'duygu')) {
    if (!criteria.some(c => c.name.indexOf('uykusuz') !== -1 || c.name.indexOf('yorgun') !== -1)) {
      criteria.push({ name: 'Uykusuz / yorgunum', cat: 'duygu', l: -8, s: -8 });
    }
  }

  if (beginner) {
    criteria.push({ name: 'Bu setup dünkü planda yazılıydı — canlı icat değil', cat: 'pozisyon', l: 15, s: 15 });
    criteria.push({ name: 'Risk masadan önce yazıldı — ekran açılmadan', cat: 'pozisyon', l: 10, s: 10 });
  }

  const strategies = [];
  const stratInput = String(p.strategy || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  stratInput.slice(0, 4).forEach(s => { if (!strategies.includes(s)) strategies.push(s); });
  (gold ? ['Breaker', 'LHPB/LLPB', 'IFVG'] : ['Breaker', 'LHPB', 'Monday Manipulation', 'IFVG']).forEach(s => { if (!strategies.includes(s)) strategies.push(s); });

  const pos = gold
    ? [
        { name: 'İnvalidasyon gerçekleşti mi?', valid: true },
        { name: 'TP doğru şekilde mi uzatıldı?', valid: false },
        { name: 'Geceye bırakılan işlem mantıklı mı?', valid: false },
        { name: 'TP ucundan dönen işlem kapandı mı?', valid: false }
      ]
    : [
        { name: 'İnvalidasyon gerçekleşti — senaryo bozuldu', valid: true },
        { name: 'Planda yazılı haber riski geldi / yaklaşıyor', valid: true },
        { name: 'Fiyat istediğim gibi gitmiyor (invalidasyon yok)', valid: false },
        { name: 'PnL paylaştım', valid: false },
        { name: "TP'nin ucundan geri döndü — kapat dürtüsü", valid: false },
        { name: 'Her muma tepki veriyorum — ekrandan kalk', valid: false }
      ];

  const summary = 'Profiline göre hazırlandı: ' + (gold ? 'altın teknik seti' : 'kripto veri/teknik seti') +
    (emos.length ? ' ve duygusal zayıflıkların için ' + emos.length + ' kilit maddesi' : '') +
    (beginner ? '; yeni başlayan disiplini için plan/risk maddeleri eklendi' : '') + '. Puanlama 70/50 eşiğiyle çalışır; uygulayıp checklist\'e geçebilirsin.';

  return { criteria, thresholds: { aplus: 70, b: 50 }, strategies, pos, summary };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { profile } = req.body || {};
  if (!profile) return res.status(400).json({ reply: null });

  const API_KEY = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY;
  if (!API_KEY) {
    return res.json({ ok: false, reason: 'no-key', profile: sanitize(fallbackProfile(profile)) });
  }

  const userText = [
    'Piyasa/Profil:', profile.market || 'Kripto',
    'Deneyim:', profile.experience || 'Orta',
    'Strateji(ler):', profile.strategy || '-',
    'Duygusal zayıflıklar:', Array.isArray(profile.emotions) ? profile.emotions.join(', ') : '-',
    'Problemler:', profile.problem || '-',
    'İlgi / hedef:', profile.interest || '-'
  ].join('\n');

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userText }
        ],
        temperature: 0.4,
        max_tokens: 1500
      })
    });
    if (!r.ok) return res.json({ ok: false, reason: 'http-' + r.status, profile: sanitize(fallbackProfile(profile)) });
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = cleanJson(content);
    if (!parsed) return res.json({ ok: false, reason: 'parse', profile: sanitize(fallbackProfile(profile)) });
    const out = sanitize(parsed);
    if (!out.summary) out.summary = parsed.summary || 'Yapay zeka profiline göre bu checklist\'i kurdu.';
    return res.json({ ok: true, profile: out });
  } catch (e) {
    return res.json({ ok: false, reason: 'error', profile: sanitize(fallbackProfile(profile)) });
  }
}
