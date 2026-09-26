import { send, fail } from '../http.mjs';
import { db, q } from '../supabase.mjs';
import { callTool } from '../llm.mjs';
import { logUsage } from '../limits.mjs';
import { KOC_TEMEL, MOD } from '../prompts.mjs';
import { TOOLS } from '../tools.mjs';
import { kocTemel, buildCoachContext } from '../context.mjs';

const VALID_MODES = ['chat', 'pre_trade', 'pre_conversation', 'big_decision', 'onboarding'];

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
    const ctx = await buildCoachContext(auth, profile, message, mode);

    const historyLimit = mode === 'onboarding' ? 40 : 20;
    const historyRows = await db(
      auth,
      'GET',
      `ayna_chat_messages?user_id=eq.${q(user.id)}&mode=eq.${q(mode)}&order=created_at.desc&limit=${historyLimit}&select=role,content`
    );

    const historyMsgs = historyRows.slice().reverse().map((r) => ({ role: r.role, content: r.content }));
    historyMsgs.push({ role: 'user', content: message });
    const messages = normalizeMessages(historyMsgs);

    const result = await callTool({
      kind: 'coach',
      systemStatic: kocTemel(profile),
      systemDynamic: (MOD[mode] || '') + '\n\n' + ctx.text,
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
    const evidenceIds = Array.isArray(ai.evidence_entry_ids)
      ? [...new Set(ai.evidence_entry_ids.filter((id) => typeof id === 'string' && allowedIds.has(id)))].slice(0, 10)
      : [];

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
    const userInserted = await db(auth, 'POST', 'ayna_chat_messages', [userRow], 'return=representation');
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
      message_id: assistantMsgId
    });
  } catch (e) {
    console.error('[AYNA] COACH_DEBUG', e && e.message);
    try { await logUsage(auth, user.id, 'coach', null); } catch (e2) {}
    return fail(res, 500, 'model_failed', e.message);
  }
}
