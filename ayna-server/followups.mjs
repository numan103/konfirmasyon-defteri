import { db, q } from './supabase.mjs';

export const REPLY_PREFIX = 'Günlük analizine yanıt';
export const STEP_PREFIX = 'Küçük adım: ';
export const FEEDBACK = { useful: 'Katılıyorum', not_useful: 'Kısmen katılıyorum', wrong: 'Yanlış anladın' };
export const OUTCOMES = { tried: 'Denedim', not_tried: 'Denemedim', changed: 'Değiştirdim' };
export const isUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function ownedInsight(auth, userId, id) {
  if (!isUuid(id)) return null;
  const rows = await db(auth, 'GET', `ayna_insights?user_id=eq.${q(userId)}&id=eq.${q(id)}&kind=in.(daily,instant)&select=*`);
  return rows[0] || null;
}

export async function insightMessages(auth, userId, entryId) {
  if (!isUuid(entryId)) return [];
  const rows = await db(auth, 'GET', `ayna_chat_messages?user_id=eq.${q(userId)}&mode=eq.chat&evidence=cs.${q(JSON.stringify([entryId]))}&select=id,role,content,evidence,created_at&order=created_at.desc&limit=30`);
  return rows.reverse();
}

export async function linkedSteps(auth, userId) {
  const links = await db(auth, 'GET', `ayna_insights?user_id=eq.${q(userId)}&kind=in.(daily,instant)&decision_id=not.is.null&select=decision_id&period_start=not.is.null&order=period_start.desc&limit=100`);
  const ids = [...new Set(links.map((row) => row.decision_id).filter(isUuid))];
  if (!ids.length) return [];
  return db(auth, 'GET', `ayna_decisions?user_id=eq.${q(userId)}&id=in.(${ids.join(',')})&select=*&order=reviewed_at.desc.nullsfirst,review_date.asc&limit=30`);
}

// Feedback is user testimony, not a confirmed personality trait. Preserve that distinction.
export async function followupContext(auth, userId, start, end) {
  // Journal days are Europe/Istanbul, not UTC calendar days.
  const from = new Date(`${start}T00:00:00+03:00`).toISOString();
  const through = new Date(`${end}T23:59:59.999+03:00`).toISOString();
  const [messages, steps] = await Promise.all([
    db(auth, 'GET', `ayna_chat_messages?user_id=eq.${q(userId)}&mode=eq.chat&role=eq.user&content=like.${q(REPLY_PREFIX + '*')}&created_at=gte.${from}&created_at=lte.${through}&select=content,evidence,created_at&order=created_at.desc&limit=15`),
    db(auth, 'GET', `ayna_decisions?user_id=eq.${q(userId)}&title=like.${q(STEP_PREFIX + '*')}&or=(and(created_at.gte.${from},created_at.lte.${through}),and(reviewed_at.gte.${from},reviewed_at.lte.${through}))&select=title,review_date,outcome,reviewed_at&order=created_at.desc&limit=20`)
  ]);
  if (!messages.length && !steps.length) return '';
  const parts = ['## Kullanıcının analiz yanıtları ve kabul ettiği küçük adımlar', 'Koçun eski yorumu bir varsayımdır, gerçek değildir. Kullanıcının itirazını/düzeltmesini önceliklendir; yanlış bulduğu yorumu doğrulanmış karakter özelliği gibi tekrarlama. Adım önerisi kabul edilmeden görev sayılmaz. Denemedim sonucu başarısızlık veya kişilik etiketi değildir.'];
  // Put outcomes and the newest corrections first so a long history cannot
  // push the user's most recent clarification out of the context budget.
  for (const step of steps) parts.push(`${step.title}; kontrol tarihi: ${step.review_date}; kullanıcının bildirdiği sonuç: ${step.outcome || 'henüz bildirilmedi'}`);
  for (const message of messages) {
    // Keep the actual reply rather than letting a long quoted analysis displace it.
    const marker = '\nYanıtım:\n';
    const at = message.content.lastIndexOf(marker);
    const reply = at >= 0 ? message.content.slice(at + marker.length) : message.content;
    const label = message.content.match(/Değerlendirmem: ([^\n]+)/)?.[1] || '';
    const evidence = (message.evidence || []).filter(isUuid).map((id) => `[${id}]`).join(' ');
    parts.push(`${evidence} ${message.created_at}: ${label}. Kullanıcının yanıtı: ${reply.slice(0, 2000)}`);
  }
  return parts.join('\n').slice(0, 18000);
}
