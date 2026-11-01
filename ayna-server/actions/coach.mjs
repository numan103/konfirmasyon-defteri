import { send, fail } from '../http.mjs';
import { db, q } from '../supabase.mjs';
import { callTool } from '../llm.mjs';
import { logUsage } from '../limits.mjs';
import { KOC_TEMEL, MOD, GOREV_GUNLUK } from '../prompts.mjs';
import { TOOLS } from '../tools.mjs';
import { kocTemel, buildCoachContext } from '../context.mjs';
import { aiErrorCode } from '../ai-error.mjs';
import { ownedInsight, isUuid, REPLY_PREFIX } from '../followups.mjs';

const VALID_MODES = ['chat', 'pre_trade', 'pre_conversation', 'big_decision', 'onboarding'];
// Bu modlarda kullanıcının yazdığı kişi/olay bilgisi kayda çevrilir.
// pre_trade (işlem) ve onboarding bu çıkarıma girmez.
const EXTRACT_MODES = ['chat', 'pre_conversation', 'big_decision'];

function truncate(s, max) {
  if (typeof s !== 'string') return s;
  return s.length > max ? s.slice(0, max) : s;
}

function clipNum(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeMessages(msgs) {
  const filtered = [];
  for (const m of msgs) {
    if (filtered.length === 0 && m.role === 'assistant') continue;
    if (filtered.length > 0 && filtered[filtered.length - 1].role === m.role) {
      filtered[filtered.length - 1].content += '\n\n' + m.content;
    } else {
      filtered.push({ role: m.role, content: m.content });
    }
  }
  return filtered;
}

export default async function coach({ res, auth, user, profile, body }) {
  const message = body && typeof body.message === 'string' ? body.message.trim() : '';
  const mode = body && body.mode;

  if (!message || message.length < 1 || message.length > 4000) {
    return fail(res, 400, 'bad_request');
  }
  if (!VALID_MODES.includes(mode)) {
    return fail(res, 400, 'bad_request');
  }

  try {
    let followup = null;
    let linkedInsight = null;
    if (body.followup_message_id) {
      if (mode !== 'chat' || !isUuid(body.followup_message_id)) return fail(res, 400, 'bad_request');
      linkedInsight = await ownedInsight(auth, user.id, body.insight_id);
      if (!linkedInsight) return fail(res, 404, 'not_found');
      const rows = await db(auth, 'GET', `ayna_chat_messages?user_id=eq.${q(user.id)}&id=eq.${q(body.followup_message_id)}&mode=eq.chat&role=eq.user&select=*`);
      followup = rows[0];
      if (!followup || !followup.content.startsWith(REPLY_PREFIX) || !(followup.evidence || []).includes(linkedInsight.source_entry_id)) return fail(res, 404, 'not_found');
    }
    const ctx = await buildCoachContext(auth, profile, message, mode);
    if (followup) {
      ctx.text += `\n\n## Kullanıcının yanıt verdiği analiz [${linkedInsight.source_entry_id}]\n${followup.content}\nGörev: Kullanıcının bu yanıtını konuş. İtirazını veya düzeltmesini ciddiye al; eski koç çıkarımını gerçek sayma. Günlüğü baştan özetleme. En fazla bir somut sonraki adım veya tek açıklayıcı soru sun. Kullanıcı kabul etmeden görev veya kalıcı kişilik özelliği üretme.`;
      ctx.entryIds.push(linkedInsight.source_entry_id);
    }

    const historyLimit = mode === 'onboarding' ? 40 : 20;
    const historyRows = await db(
      auth,
      'GET',
      `ayna_chat_messages?user_id=eq.${q(user.id)}&mode=eq.${q(mode)}&order=created_at.desc&limit=${historyLimit}&select=id,role,content`
    );

    const historyMsgs = historyRows.filter((r) => !followup || r.id !== followup.id).slice().reverse().map((r) => ({ role: r.role, content: r.content }));
    historyMsgs.push({ role: 'user', content: message });
    const messages = normalizeMessages(historyMsgs);

    const result = await callTool({
      kind: 'coach',
      systemStatic: kocTemel(profile),
      systemDynamic: (mode === 'chat' && body.review_day === true ? GOREV_GUNLUK : (MOD[mode] || '')) + '\n\n' + ctx.text,
      messages,
      tool: TOOLS.coach_reply,
      maxTokens: 1200
    });

    const ai = result.input;

    if (!ai.message || typeof ai.message !== 'string' || !ai.message.trim()) {
      return fail(res, 500, 'model_failed');
    }

    const reply = ai.message.trim();
    const risk = ['none', 'low', 'crisis'].includes(ai.risk) ? ai.risk : 'none';

    const allowedIds = new Set(ctx.entryIds || []);
    let evidenceIds = Array.isArray(ai.evidence_entry_ids)
      ? [...new Set(ai.evidence_entry_ids.filter((id) => typeof id === 'string' && allowedIds.has(id)))].slice(0, 10)
      : [];
    if (followup) evidenceIds = [...new Set([linkedInsight.source_entry_id, ...evidenceIds])].slice(0, 10);

    let decisionProposal = null;
    if (mode === 'big_decision' && ai.decision_proposal) {
      const dp = ai.decision_proposal;
      if (dp.title && typeof dp.title === 'string' && dp.title.trim() &&
          dp.reasoning && typeof dp.reasoning === 'string' && dp.reasoning.trim()) {
        decisionProposal = {
          title: truncate(dp.title.trim(), 200),
          reasoning: truncate(dp.reasoning.trim(), 2000),
          feeling: dp.feeling ? truncate(String(dp.feeling), 200) : null,
          premortem: dp.premortem ? truncate(String(dp.premortem), 2000) : null,
          review_in_days: clipNum(dp.review_in_days, 7, 180) || 30
        };
      }
    }

    const userRow = {
      user_id: user.id,
      mode,
      role: 'user',
      content: message,
      evidence: [],
      risk: null
    };
    const userInserted = followup ? [followup] : await db(auth, 'POST', 'ayna_chat_messages', [userRow], 'return=representation');
    const userMsgId = userInserted && userInserted.length ? userInserted[0].id : null;

    const assistantRow = {
      user_id: user.id,
      mode,
      role: 'assistant',
      content: reply,
      evidence: evidenceIds,
      risk
    };
    const assistantInserted = await db(auth, 'POST', 'ayna_chat_messages', [assistantRow], 'return=representation');
    const assistantMsgId = assistantInserted && assistantInserted.length ? assistantInserted[0].id : null;

    await logUsage(auth, user.id, 'coach', result);

    return send(res, 200, {
      ok: true,
      reply,
      evidence: evidenceIds,
      risk,
      decision_proposal: decisionProposal,
      message_id: assistantMsgId,
      user_message_id: userMsgId,
      extract: !followup && EXTRACT_MODES.includes(mode) && message.length >= 12
    });
  } catch (e) {
    // Başarısız çağrı koteden düşülmez; sadece başarılı yanıtlar sayılır.
    const code = aiErrorCode(e);
    console.error('[AYNA coach]', code);
    return fail(res, 500, code);
  }
}
