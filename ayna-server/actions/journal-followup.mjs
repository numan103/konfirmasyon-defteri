import { db, q } from '../supabase.mjs';
import { send, fail } from '../http.mjs';
import { localDate } from '../time.mjs';
import { ownedInsight, insightMessages, linkedSteps, FEEDBACK, OUTCOMES, REPLY_PREFIX, STEP_PREFIX, isUuid } from '../followups.mjs';
import { listBiasBeliefs } from '../biases.mjs';

const text = (value, max) => typeof value === 'string' && value.trim().length <= max ? value.trim() : null;

export default async function journalFollowup({ res, auth, user, body }) {
  const op = body.op;
  try {
    if (op === 'steps') return send(res, 200, { ok: true, steps: await linkedSteps(auth, user.id) });
    if (op === 'biases') return send(res, 200, { ok: true, biases: await listBiasBeliefs(auth, user.id) });
    if (op === 'outcome') {
      if (!isUuid(body.decision_id) || !Object.hasOwn(OUTCOMES, body.status)) return fail(res, 400, 'bad_request');
      const note = text(body.note || '', 2000);
      if (note === null) return fail(res, 400, 'bad_request');
      const links = await db(auth, 'GET', `ayna_insights?user_id=eq.${q(user.id)}&kind=in.(daily,instant)&decision_id=eq.${q(body.decision_id)}&select=id&limit=1`);
      if (!links.length) return fail(res, 404, 'not_found');
      const rows = await db(auth, 'PATCH', `ayna_decisions?user_id=eq.${q(user.id)}&id=eq.${q(body.decision_id)}`, {
        outcome: OUTCOMES[body.status] + (note ? '\n' + note : ''), reviewed_at: new Date().toISOString()
      }, 'return=representation');
      if (!rows.length) return fail(res, 404, 'not_found');
      return send(res, 200, { ok: true, step: rows[0] });
    }

    const insight = await ownedInsight(auth, user.id, body.insight_id);
    if (!insight || !insight.source_entry_id) return fail(res, 404, 'not_found');
    if (op === 'load') {
      const messages = await insightMessages(auth, user.id, insight.source_entry_id);
      const steps = insight.decision_id ? await db(auth, 'GET', `ayna_decisions?user_id=eq.${q(user.id)}&id=eq.${q(insight.decision_id)}&select=*`) : [];
      return send(res, 200, { ok: true, messages, step: steps[0] || null, feedback: insight.feedback });
    }
    if (op === 'reply') {
      const reply = text(body.message, 2000);
      if (!reply || !Object.hasOwn(FEEDBACK, body.feedback) || (body.request_id && !isUuid(body.request_id))) return fail(res, 400, 'bad_request');
      const content = `${REPLY_PREFIX} (${insight.period_start})\nAnaliz: ${insight.title}\nKoçun o sıradaki yorumu (çıkarım, doğrulanmış gerçek değil):\n${String(insight.body).slice(0, 3000)}\nDeğerlendirmem: ${FEEDBACK[body.feedback]}\nYanıtım:\n${reply}`;
      // Persist the user's answer without requiring the model to be available.
      const findExisting = () => db(auth, 'GET', `ayna_chat_messages?user_id=eq.${q(user.id)}&id=eq.${q(body.request_id)}&mode=eq.chat&role=eq.user&select=*`);
      let messages = body.request_id ? await findExisting() : [];
      if (!messages.length) {
        try {
          messages = await db(auth, 'POST', 'ayna_chat_messages', [{ ...(body.request_id ? { id: body.request_id } : {}), user_id: user.id, mode: 'chat', role: 'user', content, evidence: [insight.source_entry_id], risk: null }], 'return=representation');
        } catch (error) {
          if (error.code !== '23505' || !body.request_id) throw error;
          messages = await findExisting();
        }
      }
      if (!messages[0] || messages[0].content !== content || !(messages[0].evidence || []).includes(insight.source_entry_id)) return fail(res, 409, 'bad_request');
      await db(auth, 'PATCH', `ayna_insights?user_id=eq.${q(user.id)}&id=eq.${q(insight.id)}`, { feedback: body.feedback });
      return send(res, 200, { ok: true, message: messages[0], feedback: body.feedback });
    }
    if (op === 'step') {
      if (insight.decision_id) {
        const rows = await db(auth, 'GET', `ayna_decisions?user_id=eq.${q(user.id)}&id=eq.${q(insight.decision_id)}&select=*`);
        return send(res, 200, { ok: true, step: rows[0] || null });
      }
      const step = text(body.step, 200);
      const date = text(body.review_date, 10);
      if (!step || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || Number.isNaN(Date.parse(date + 'T12:00:00Z')) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date || date < localDate()) return fail(res, 400, 'bad_request');
      // A stable cross-table ID makes a retry recoverable if creation succeeded
      // but linking the step failed. A second click cannot create another step.
      let rows = await db(auth, 'GET', `ayna_decisions?user_id=eq.${q(user.id)}&id=eq.${q(insight.id)}&select=*`);
      if (!rows.length) {
        try {
          rows = await db(auth, 'POST', 'ayna_decisions', [{
            id: insight.id, user_id: user.id, title: STEP_PREFIX + step,
            reasoning: `Kullanıcı bu adımı kendi isteğiyle kabul etti.\nKaynak analiz: ${insight.title} (${insight.period_start})\n${String(insight.body).slice(0, 3000)}`,
            review_date: date
          }], 'return=representation');
        } catch (error) {
          if (error.code !== '23505') throw error;
          rows = await db(auth, 'GET', `ayna_decisions?user_id=eq.${q(user.id)}&id=eq.${q(insight.id)}&select=*`);
        }
      }
      const decision = rows[0];
      if (!decision) throw new Error('step_not_saved');
      await db(auth, 'PATCH', `ayna_insights?user_id=eq.${q(user.id)}&id=eq.${q(insight.id)}`, { decision_id: decision.id });
      return send(res, 200, { ok: true, step: decision });
    }
    return fail(res, 400, 'bad_request');
  } catch (error) {
    console.error('[AYNA journal-followup] persistence failed');
    return fail(res, 500, 'server_error');
  }
}
