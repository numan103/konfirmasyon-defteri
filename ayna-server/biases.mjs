import { db, q } from './supabase.mjs';

// A closed vocabulary makes deduplication and the user's rejection durable.
export const BIAS_LABELS = {
  revenge_trading: 'Kayıptan sonra intikam işlemi',
  loss_chasing: 'Kaybı kovalamak',
  overconfidence: 'Aşırı güven',
  confirmation_bias: 'Doğrulama yanlılığı',
  fomo: 'Fırsatı kaçırma korkusu',
  anchoring: 'Çapalama',
  disposition_effect: 'Kârı erken kapatma / zararı uzatma',
  plan_deviation: 'Plan dışına çıkma',
  position_sizing: 'Risk boyutunu büyütme',
  recency_bias: 'Son olaya aşırı ağırlık verme',
  hindsight_bias: 'Sonradan bilme yanlılığı',
  sunk_cost: 'Batık maliyete bağlı kalma',
  outcome_bias: 'Sonuca göre karar değerlendirme'
};

const PREFIX = 'Bilişsel hata: ';
const MAX_OBSERVATION = 400;
const MAX_QUESTION = 300;
const MAX_EVIDENCE = 10;

const plain = (value, max) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function biasLabel(code) {
  return Object.hasOwn(BIAS_LABELS, code) ? BIAS_LABELS[code] : null;
}

export function cleanBiases(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const item of input.slice(0, 20)) {
    if (!item || typeof item !== 'object') continue;
    const label = biasLabel(item.code);
    const observation = plain(item.observation, MAX_OBSERVATION);
    if (!label || !observation || observation.length < 12 || seen.has(item.code)) continue;
    seen.add(item.code);
    const evidence = Array.isArray(item.evidence)
      ? [...new Set(item.evidence.map((value) => plain(String(value || ''), 80)).filter(Boolean))].slice(0, MAX_EVIDENCE)
      : [];
    out.push({
      code: item.code,
      label,
      observation,
      question: plain(item.question, MAX_QUESTION),
      evidence
    });
    if (out.length >= 3) break;
  }
  return out;
}

function sameBias(row, label) {
  return typeof row.statement === 'string' && row.statement.indexOf(PREFIX + label) === 0;
}

// A bias observation is a proposal, never a fact. Rejected labels are not
// resurrected; confirmed corrections are left untouched.
export async function persistBiases(auth, userId, biases, fallbackEvidence) {
  const cleaned = cleanBiases(biases);
  if (!cleaned.length) return [];
  const existing = await db(auth, 'GET', `ayna_beliefs?user_id=eq.${q(userId)}&statement=like.${q(PREFIX + '*')}&select=id,statement,status,evidence,correction`);
  const saved = [];
  for (const bias of cleaned) {
    const evidence = bias.evidence.length ? bias.evidence : (fallbackEvidence || []).slice(0, MAX_EVIDENCE);
    const statement = PREFIX + bias.label + ' — ' + bias.observation;
    const row = existing.find((item) => sameBias(item, bias.label));
    if (row && row.status === 'rejected') {
      saved.push({ ...bias, belief_id: row.id, status: 'rejected', hidden: true });
      continue;
    }
    if (row && (row.status === 'confirmed' || row.status === 'corrected')) {
      saved.push({ ...bias, belief_id: row.id, status: row.status, hidden: true });
      continue;
    }
    if (row) {
      const merged = [...new Set([...(Array.isArray(row.evidence) ? row.evidence : []), ...evidence])].slice(0, MAX_EVIDENCE);
      const updated = await db(auth, 'PATCH', `ayna_beliefs?user_id=eq.${q(userId)}&id=eq.${q(row.id)}`, {
        statement, evidence: merged, updated_at: new Date().toISOString()
      }, 'return=representation');
      saved.push({ ...bias, evidence: merged, belief_id: row.id, status: 'proposed', hidden: false, belief: updated && updated[0] });
      continue;
    }
    const inserted = await db(auth, 'POST', 'ayna_beliefs', [{
      user_id: userId,
      statement,
      evidence,
      status: 'proposed'
    }], 'return=representation');
    const belief = inserted && inserted[0];
    saved.push({ ...bias, evidence, belief_id: belief && belief.id, status: 'proposed', hidden: false, belief });
  }
  return saved;
}

// Visible proposals for the journal page. Rejected rows stay hidden.
export async function listBiasBeliefs(auth, userId) {
  const rows = await db(auth, 'GET', `ayna_beliefs?user_id=eq.${q(userId)}&statement=like.${q(PREFIX + '*')}&status=in.(proposed,confirmed,corrected)&select=id,statement,status,evidence,correction,updated_at&order=updated_at.desc&limit=20`);
  return rows.map((row) => {
    const label = Object.keys(BIAS_LABELS).find((code) => sameBias(row, BIAS_LABELS[code]));
    return {
      id: row.id,
      code: label || null,
      label: label ? BIAS_LABELS[label] : null,
      statement: row.statement,
      status: row.status,
      correction: row.correction || null,
      evidence: Array.isArray(row.evidence) ? row.evidence.filter((value) => typeof value === 'string').slice(0, 10) : []
    };
  });
}

export async function rejectedBiasLabels(auth, userId) {
  const rows = await db(auth, 'GET', `ayna_beliefs?user_id=eq.${q(userId)}&statement=like.${q(PREFIX + '*')}&status=eq.rejected&select=statement,correction`);
  return rows.map((row) => row.statement);
}

export { PREFIX as BIAS_PREFIX };
