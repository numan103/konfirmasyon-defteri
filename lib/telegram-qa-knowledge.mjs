// Bilgi tabani: stratejiler + notlar + grafik analizleri.
// Supabase edu_shared 'qa_knowledge' satirinda saklanir.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co';
const FALLBACK_PUB = 'sb_publishable_bReG5UKaWcQkU0Z9GnGiJQ_0T4_Qm9X';
const KNOWLEDGE_ROW = 'qa_knowledge';

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

export async function readKnowledge() {
  const key = supabaseKey(false);
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared?id=eq.' + KNOWLEDGE_ROW + '&select=data', {
      headers: sbHeaders(key), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { notes: [], images: [] };
    const rows = await r.json();
    const data = (rows && rows[0] && rows[0].data) || {};
    return { notes: Array.isArray(data.notes) ? data.notes : [], images: Array.isArray(data.images) ? data.images : [] };
  } catch { return { notes: [], images: [] }; }
}

export async function saveKnowledge(knowledge) {
  const key = String(process.env.SUPABASE_SERVICE_ROLE || '').trim();
  if (!key) return false;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/edu_shared', {
      method: 'POST',
      headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: KNOWLEDGE_ROW, data: knowledge }),
      signal: AbortSignal.timeout(5000),
    });
    return r.ok;
  } catch { return false; }
}

export async function addNote(text) {
  const knowledge = await readKnowledge();
  knowledge.notes.push({ text: text.slice(0, 2000), addedAt: new Date().toISOString() });
  // Son 20 notu tut
  if (knowledge.notes.length > 20) knowledge.notes = knowledge.notes.slice(-20);
  return saveKnowledge(knowledge);
}

export async function addImageAnalysis(analysis) {
  const knowledge = await readKnowledge();
  knowledge.images.push({ analysis: analysis.slice(0, 2000), addedAt: new Date().toISOString() });
  // Son 10 grafik analizini tut
  if (knowledge.images.length > 10) knowledge.images = knowledge.images.slice(-10);
  return saveKnowledge(knowledge);
}

export function formatKnowledgeForPrompt(knowledge) {
  const parts = [];
  if (knowledge.notes.length) {
    parts.push('KULLANICININ NOTLARI:\n' + knowledge.notes.map(n => '- ' + n.text).join('\n'));
  }
  if (knowledge.images.length) {
    parts.push('GRAFİK ANALİZLERİ:\n' + knowledge.images.map(i => '- ' + i.analysis).join('\n'));
  }
  return parts.length ? '\n\n' + parts.join('\n\n') : '';
}

// Groq vision model ile grafik analizi yap.
export async function analyzeChart(imageBase64, question = '') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('missing_GROQ_API_KEY');
  const model = 'meta-llama/llama-4-scout-17b-16e-instruct'; // Groq vision model
  const messages = [
    {
      role: 'system',
      content: 'Sen bir kripto piyasa analistisin. Gönderilen grafiği analiz et. Türkçe cevap ver. Kısa ve net ol. Destek/direnç seviyeleri, trend yönü, hacim ve momentum hakkında yorum yap.',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: question || 'Bu grafiği analiz et ve önemli seviyeleri belirt.' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageBase64 } },
      ],
    },
  ];
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_completion_tokens: 500 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error('vision_model_' + r.status + '_' + (body?.error?.message || ''));
  }
  const d = await r.json();
  return d.choices?.[0]?.message?.content || 'Analiz üretilemedi.';
}
