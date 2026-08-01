const GROQ_MODEL = 'llama-3.1-8b-instant';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `Sen Alfa Traders topluluğunun kıdemli trading koçusun ve araştırmacısın. Kullanıcının kişisel profiline (piyasa, deneyim, çalışma tarzı, risk toleransı, kullandığı konsept/araçlar, strateji, duygusal zayıflıklar, problemler, ilgi/hedefler) göre DERİN, kişiye özel bir işlem-öncesi kontrol listesi (checklist) tasarlarsın. Tek bir cümlelik boş şablon DEĞİL; gerçek bir koçun trader'ı tanıyıp yazacağı, uygulanabilir, spesifik ve kapsamlı bir araştırma çıktısı üretirsin.

Görevin SADECE tek bir geçerli JSON nesnesi döndürmek. Açıklama, kod blokları (json ... işaretleri), markdown EKLEME.

JSON şeması:
{
  "criteria": [ { "name": "Kriter cümlesi", "cat": "veri|teknik|pozisyon|duygu", "l": 8, "s": 8 } ],
  "thresholds": { "aplus": 70, "b": 50 },
  "strategies": ["Strateji 1", "Strateji 2", "Strateji 3"],
  "pos": [ { "name": "Pozisyon esnasında kural cümlesi", "valid": true|false } ],
  "summary": "3-4 cümlelik kişiselleştirilmiş açıklama"
}

CRITERIA — 28 ila 40 madde üret (kategoriler):
- cat "veri" (piyasa verisi): haber takvimi/red folder, hacim, CVD, open interest, funding, likidite/orderbook, on-chain akış, DXY. Kripto profili SADECE orderflow değil; BTC trendi, hacim, haber, funding normalitesi gibi temel veriler de olmalı. XAU için DXY + haber + sakin veri takvimi. FX için parite haberleri + likidite pencereleri (London/NY açılışı).
- cat "teknik" (yapı/seviye/pattern/konsept): kullanıcının seçtiği konseptlere GÖRE maddeler:
  * ICT/SMC: likidite sweep, manipulasyon, OTE, daily bias, order block/FVG, BOS/CHoCH, killzone saatleri.
  * Price Action: destek/direnç, trend yönü, tepki mumları (engulfing/pin), mum yapıları hizası.
  * İndikatörler: EMA/VWAP yönü, RSI aşırı uç kontrolü, MACD/osilatör teyidi.
  * Klasik/Fib: S/R veya fib bölgesi, yapı netliği (HH/HL, LH/LL).
  En az bir teknik madde her zaman olmalı; konsept seçilmemişse genel (yapı+seviye) set kur.
- cat "pozisyon" (risk/plan/pozisyon yönetimi): plan yazılılığı, RR oranı, risk/bakiye, SL seviyesi, net giriş tetikleyicisi, parti büyüklüğü (risk toleransına göre), geceye/pozisyon taşıma kararı (stile göre), yeni başlayanlar için ek disiplin maddeleri.
- cat "duygu" (PSİKOLOJİK KİLİT — hepsi NEGATİF puan, -6..-15): kullanıcının seçtiği duygusal zayıflıklar mutlaka buraya yansı; ayrıca zihinsel/mental analiz maddeleri ekle (uykusuzluk, hedef dolunca ekstra işlem dürtüsü, plan dışı risk büyütme, belirsizlikte panik vb.). Bu maddeler kilit olarak çalışır — işaretlenirse işlem engellenir.

PUANLAMA KURALLARI:
- l (long) ve s (short) puanlardır; -15 ile +16 arasında, genelde aynı değer. duygu maddeleri NEGATİF olmalı.
- Toplam POZİTİF puan ~100-115 olacak şekilde dengele (negatifler bu toplama dahil değil). Bunu sağlamak için önemli maddelere 8-11, destekleyicilere 3-6 puan ver.
- thresholds 70/50 civarında tut.

STRATEJİLER: kullanıcının yazdığı strateji(ler)i koru; konseptlerine ve piyasaya göre 1-3 uygun ekle (duplicate olmasın). Toplam 3-7 arası.

POS (pozisyon esnasında) 6-8 madde:
- En az 1 tane "valid": true (plan gereği çıkış: invalidasyon, plan dışı haber, OTE reaksiyonu alınmaması).
- Gerisi "valid": false (dürtü: TP ucundan dönünce kapatma, her muma tepki, PnL paylaşma isteği, ekrandan ayrılma vb.).
- Stile göre pozisyon taşıma / gün içi kapanış kuralları ekleyebilirsin.

SUMMARY: 3-4 cümle — neden bu kriterlerin seçildiğini, piyasa/stil/risk konseptine göre hangi odağın konulduğunu ve nasıl kullanılacağını Türkçe açıkla.

ÇIKTI KURALLARI:
- Türkçe, kısa ve uygulanabilir cümleler; markdown/emoji yok; başlık yok.
- Maddeler birbirinin tekrarı olmasın; spesifik olsun ("Seviye görüldü" değil "Aşırı riskli seviyeden değil — tetikleyici olmadan girilmez").`;

function cleanJson(text) {
  if (!text) return null;
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  t = t.slice(start, end + 1);
  // 1) düz, 2) trailing comma
  const stripTrailing = s => s.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(t); } catch (e) {}
  try { return JSON.parse(stripTrailing(t)); } catch (e) {}
  // 3) kesik JSON kurtarması: sondan geriye tam eleman sınırlarını dene
  const candidates = [];
  for (let i = t.length - 1; i > 0 && candidates.length < 60; i--) {
    if (t[i] === '}') candidates.push(i);
  }
  for (const cut of candidates) {
    try { return JSON.parse(stripTrailing(t.slice(0, cut + 1))); } catch (e) {}
  }
  return null;
}

function validCat(c) { return c === 'veri' || c === 'teknik' || c === 'pozisyon' || c === 'duygu'; }

function sanitize(obj) {
  const out = { criteria: [], thresholds: { aplus: 70, b: 50 }, strategies: [], pos: [], summary: '' };
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj.criteria)) {
    obj.criteria.slice(0, 45).forEach(c => {
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
    obj.pos.slice(0, 10).forEach(p => {
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
  const fx = market.indexOf('fx') !== -1 || market.indexOf('endeks') !== -1;
  const exp = String(p.experience || '').toLowerCase();
  const beginner = exp.indexOf('yeni') !== -1 || exp.indexOf('başla') !== -1 || exp.indexOf('basla') !== -1;
  const style = String(p.style || 'intraday').toLowerCase();
  const rtf = String(p.risk || 'orta').toLowerCase();
  const concepts = (Array.isArray(p.concepts) ? p.concepts : []).map(String);
  const has = (v) => concepts.indexOf(v) !== -1;
  const emoPts = { fomo: 12, revenge: 12, impatience: 10, fear: 8, overconfidence: 10, distracted: 8, overtrading: 10 };
  const emoChipLbl = { fomo: 'FOMO — hareket kaçıyor hissi', revenge: 'Az önce stop oldum — revenge penceresi', impatience: 'Sabırsızlık — setup eksikken girme dürtüsü', fear: 'Korku / çekinme — plana rağmen girememe', overconfidence: 'Aşırı özgüven — risk büyütme dürtüsü', distracted: 'Dikkat dağınıklığı / bölünmüş odak', overtrading: 'Aşırı işlem — boş ekran dürtüsü' };
  const criteria = [];
  const add = (c) => { if (!criteria.some(x => x.name === c.name)) criteria.push(c); };

  // ---------- VERİ ----------
  if (gold) {
    add({ name: 'Kırmızı haber var / yaklaşıyor (merkez bankası, ABD verileri)', cat: 'veri', l: -15, s: -15 });
    add({ name: 'DXY (dolar endeksi) işlem yönüyle uyumlu', cat: 'veri', l: 6, s: 6 });
    add({ name: 'Veri takvimi sakin — sürpriz riski düşük', cat: 'veri', l: 5, s: 5 });
  } else if (fx) {
    add({ name: 'Pariteyi etkileyen haber / merkez bankası sakin', cat: 'veri', l: -12, s: -12 });
    add({ name: 'Dolar endeksi / ilgili çapraz trend yönünde', cat: 'veri', l: 5, s: 5 });
    add({ name: 'Likidite penceresi (London/NY açılışı) uygun', cat: 'veri', l: 4, s: 4 });
  } else {
    add({ name: 'BTC genel trendi işlem yönünde (H1/günlük)', cat: 'veri', l: 7, s: 7 });
    add({ name: 'Kripto-aktif haber riski yok (CPI/FED/ETF olayı)', cat: 'veri', l: 5, s: 5 });
    if (has('OF')) {
      add({ name: 'Spot CVD işlem yönünde', cat: 'veri', l: 6, s: 6 });
      add({ name: 'Futures CVD işlem yönünde', cat: 'veri', l: 5, s: 5 });
      add({ name: 'Open Interest aşırı kalabalık değil / yönü destekliyor', cat: 'veri', l: 4, s: 4 });
      add({ name: 'Funding normal — aşırı long/short birikmiş değil', cat: 'veri', l: 4, s: 4 });
      add({ name: 'Orderbook kümelenmesi entry alanını destekliyor', cat: 'veri', l: 3, s: 3 });
    } else if (has('ONC')) {
      add({ name: 'Whale / büyük akış işlem yönünde', cat: 'veri', l: 5, s: 5 });
      add({ name: 'Funding / OI aşırı kalabalık değil', cat: 'veri', l: 5, s: 5 });
      add({ name: 'Exchange rezervlerinde anomali yok', cat: 'veri', l: 3, s: 3 });
    } else {
      add({ name: 'Hacim artışı yönü doğruluyor', cat: 'veri', l: 5, s: 5 });
      add({ name: 'Funding / OI normal — aşırı kalabalık değil', cat: 'veri', l: 4, s: 4 });
    }
  }

  // ---------- TEKNİK ----------
  if (has('ICT')) {
    add({ name: 'Likidite / eşikler alındı (sweep) — tuzak temizlendi', cat: 'teknik', l: 11, s: 11 });
    add({ name: 'Manipülasyon gerçekleşti — fiyat önce yanlış yöne gitti', cat: 'teknik', l: 9, s: 9 });
    add({ name: 'OTE bölgesinde reaksiyon bekleniyor', cat: 'teknik', l: 8, s: 8 });
    add({ name: 'Daily bias ile uyumlu', cat: 'teknik', l: 7, s: 7 });
    add({ name: 'Order block / FVG alanına denk geliyor', cat: 'teknik', l: 7, s: 7 });
    add({ name: 'BOS / CHoCH ile yapı doğrulandı', cat: 'teknik', l: 6, s: 6 });
    add({ name: 'Killzone (Asian/London/NY) saatine uygun', cat: 'teknik', l: 5, s: 5 });
  }
  if (has('PA')) {
    add({ name: 'Ana destek / direnç seviyesinde', cat: 'teknik', l: 8, s: 8 });
    add({ name: 'Trend yönüne doğru tepki mumu (engulfing/pin)', cat: 'teknik', l: 6, s: 6 });
    add({ name: 'Günlük / 4H / 1H mum yapıları uyumlu', cat: 'teknik', l: 6, s: 6 });
  }
  if (has('IND')) {
    add({ name: 'EMA / VWAP yönü işlemle uyumlu', cat: 'teknik', l: 5, s: 5 });
    add({ name: 'RSI aşırı alım / satımda değil', cat: 'teknik', l: 4, s: 4 });
    add({ name: 'MACD / osilatör teyidi var', cat: 'teknik', l: 3, s: 3 });
  }
  if (has('KLASIK') || (!has('ICT') && !has('PA') && !has('IND'))) {
    add({ name: 'S/R ya da fib bölgesinde', cat: 'teknik', l: 7, s: 7 });
    add({ name: 'Yapı net (HH/HL veya LH/LL)', cat: 'teknik', l: 6, s: 6 });
    add({ name: 'Trend yönü işlem yönünde', cat: 'teknik', l: 5, s: 5 });
    add({ name: 'Key seviyede denge — ilk deneme değil, tepki var', cat: 'teknik', l: 4, s: 4 });
  }
  if (!criteria.some(c => c.cat === 'teknik')) {
    add({ name: 'Yapı net ve key seviyede', cat: 'teknik', l: 8, s: 8 });
  }

  // ---------- POZİSYON ----------
  add({ name: 'Bu setup planda yazılıydı — canlı icat değil', cat: 'pozisyon', l: 16, s: 16 });
  add({ name: 'RR en az 1:3 (küçük risk, büyük TP)', cat: 'pozisyon', l: 9, s: 9 });
  add({ name: 'Risk oranı önceden yazıldı (risk/bakiye)', cat: 'pozisyon', l: 8, s: 8 });
  add({ name: 'SL anlamlı seviyenin ötesinde — stop bilinçli kondu', cat: 'pozisyon', l: 7, s: 7 });
  add({ name: 'Giriş tetikleyicisi net — “bu seviye görülürse girerim”', cat: 'pozisyon', l: 7, s: 7 });
  if (rtf === 'düşük') add({ name: 'Parti büyüklüğü normalin altında (düşük risk modu)', cat: 'pozisyon', l: 6, s: 6 });
  if (rtf === 'yüksek') add({ name: 'Risk payı agresif modda bile büyütülmedi', cat: 'pozisyon', l: 6, s: 6 });
  if (style === 'swing' || style === 'mix') add({ name: 'Geceye / hafta sonuna kalma kararı mantıklı', cat: 'pozisyon', l: 5, s: 5 });
  if (beginner) add({ name: 'Risk masadan önce yazıldı — ekran açılmadan', cat: 'pozisyon', l: 9, s: 9 });

  // ---------- DUYGU (negatif kilit) ----------
  const emos = Array.isArray(p.emotions) ? p.emotions : [];
  emos.forEach(e => {
    const lbl = emoChipLbl[String(e).toLowerCase()];
    const pts = emoPts[String(e).toLowerCase()] || 8;
    if (lbl) add({ name: lbl, cat: 'duygu', l: -pts, s: -pts });
  });
  add({ name: 'Uykusuz / yorgunum', cat: 'duygu', l: -8, s: -8 });
  add({ name: 'Günün hedefi doldu — ekstra işlem dürtüsü', cat: 'duygu', l: -8, s: -8 });
  if (String(p.problem || '').indexOf('stop') !== -1) {
    add({ name: 'Stop düşünüyorum — plan yoksa hareket yok', cat: 'duygu', l: -10, s: -10 });
  }

  // ---------- STRATEJİLER ----------
  const strategies = [];
  const stratInput = String(p.strategy || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  stratInput.slice(0, 5).forEach(s => { if (!strategies.includes(s)) strategies.push(s); });
  const defaults = [];
  if (has('ICT')) defaults.push('Breaker', 'IFVG', 'OTE', 'Sweep & Reclaim');
  if (has('PA')) defaults.push('S/R Bounce', 'Trend Follow');
  if (has('IND')) defaults.push('EMA Pullback', 'VWAP Reclaim');
  if (has('OF')) defaults.push('CVD Diverjans', 'Liquidity Grab');
  if (has('ONC')) defaults.push('Funding + Whale Flow');
  if (gold) defaults.push('Breaker', 'LHPB/LLPB', 'IFVG');
  if (!has('ICT') && !has('PA') && !has('IND') && !has('OF') && !has('ONC') && !gold) defaults.push('Breaker', 'LHPB', 'IFVG');
  defaults.forEach(s => { if (!strategies.includes(s)) strategies.push(s); });

  // ---------- POZİSYON KURALLARI ----------
  const pos = [];
  if (has('ICT')) pos.push({ name: 'İnvalidasyon: OTE reaksiyonu almadı — senaryo bozuldu', valid: true });
  else pos.push({ name: 'İnvalidasyon gerçekleşti — senaryo bozuldu', valid: true });
  pos.push({ name: 'Planda yazılı haber riski geldi / yaklaşıyor', valid: true });
  pos.push({ name: 'Fiyat istediğim gibi gitmiyor (invalidasyon yok)', valid: false });
  pos.push({ name: 'PnL paylaştım', valid: false });
  pos.push({ name: 'TP’nin ucundan geri döndü — kapat dürtüsü', valid: false });
  pos.push({ name: 'Her muma tepki veriyorum — ekrandan kalk', valid: false });
  if (beginner) pos.push({ name: 'Belirsizlikte plana dön — akşamki yazıya bak', valid: false });

  const summary = 'Profiline göre hazırlandı: ' +
    (gold ? 'altın (XAU) için haber+DXY+likidite ağırlıklı' : fx ? 'FX için haber+trend+seviye ağırlıklı' : 'kripto için BTC trendi + ' + (has('OF') ? 'orderflow' : has('ONC') ? 'onchain' : 'hacim') + ' ağırlıklı') +
    ' — ' + criteria.length + ' kriter' +
    (emos.length ? ', ' + emos.length + ' duygusal kilit maddesi' : '') +
    (has('ICT') ? ', ICT/SMC lensi' : '') +
    ', stil: ' + (style === 'scalp' ? 'scalp' : style === 'swing' ? 'swing' : style === 'mix' ? 'karışık' : 'gün içi') +
    '. Eşikler 70/50; uygulayıp checklist\'e geçebilirsin.';

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
    'Piyasa:', profile.market || 'Kripto',
    'Deneyim:', profile.experience || 'Orta',
    'Çalışma tarzı:', profile.style || 'Gün içi',
    'Risk toleransı:', profile.risk || 'Orta',
    'Konsept/araçlar:', Array.isArray(profile.concepts) ? profile.concepts.join(', ') : '-',
    'Strateji(ler):', profile.strategy || '-',
    'Duygusal zayıflıklar:', Array.isArray(profile.emotions) ? profile.emotions.join(', ') : '-',
    'Problemler:', profile.problem || '-',
    'İlgi / hedef:', profile.interest || '-'
  ].join('\n');

  try {
    const attempts = [8192, 4096, 2048];
    let content = null;
    let lastStatus = null;
    let lastErr = null;
    for (const mt of attempts) {
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
          max_tokens: mt
        })
      });
      lastStatus = r.status;
      if (!r.ok) {
        try { const e = await r.json(); lastErr = (e && e.error && (e.error.message || e.error.type)) || String(r.status); } catch { lastErr = String(r.status); }
        continue;
      }
      const data = await r.json();
      content = data?.choices?.[0]?.message?.content;
      if (content) break;
    }
    if (!content) return res.json({ ok: false, reason: 'http-' + lastStatus, err: lastErr, profile: sanitize(fallbackProfile(profile)) });
    const parsed = cleanJson(content);
    if (!parsed) return res.json({ ok: false, reason: 'parse', profile: sanitize(fallbackProfile(profile)) });
    const out = sanitize(parsed);
    if (!out.summary) out.summary = parsed.summary || 'Yapay zeka profiline göre bu checklist\'i kurdu.';
    return res.json({ ok: true, profile: out });
  } catch (e) {
    return res.json({ ok: false, reason: 'error', profile: sanitize(fallbackProfile(profile)) });
  }
}
