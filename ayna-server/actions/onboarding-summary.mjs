import { send, fail } from '../http.mjs';
import { db, q } from '../supabase.mjs';
import { callTool, modelFor } from '../openai.mjs';
import { logUsage } from '../limits.mjs';
import { KATIP_TANISMA } from '../prompts.mjs';
import { TOOLS } from '../tools.mjs';

export default async function onboardingSummary({ res, auth, user }) {
  try {
    const rows = await db(
      auth,
      'GET',
      `ayna_chat_messages?user_id=eq.${q(user.id)}&mode=eq.onboarding&order=created_at.asc&limit=80&select=role,content`
    );

    const userMsgCount = rows.filter((r) => r.role === 'user').length;
    if (userMsgCount < 3) {
      return fail(res, 400, 'bad_request');
    }

    const transcript = rows.map((r) => {
      const prefix = r.role === 'user' ? 'Kullanıcı' : 'Koç';
      return `${prefix}: ${r.content}`;
    }).join('\n');

    const result = await callTool({
      model: modelFor('coach'),
      systemStatic: KATIP_TANISMA,
      systemDynamic: null,
      messages: [{ role: 'user', content: `Tanışma görüşmesi:\n"""\n${transcript}\n"""` }],
      tool: TOOLS.onboarding_summary,
      maxTokens: 2500
    });

    const ai = result.input;

    const proposal = {
      display_name: ai.display_name || null,
      people: Array.isArray(ai.people) ? ai.people.map((p) => ({
        name: truncate(p.name || '', 60),
        relation: p.relation ? truncate(String(p.relation), 60) : null,
        sector: ['family', 'friends', 'work', 'other'].includes(p.sector) ? p.sector : 'other',
        ring: [1, 2, 3].includes(p.ring) ? p.ring : 3,
        traits: Array.isArray(p.traits) ? p.traits.slice(0, 10).map((t) => truncate(String(t), 30)) : []
      })) : [],
      values: Array.isArray(ai.values) ? ai.values.slice(0, 20).map((v) => truncate(String(v), 200)) : [],
      goals: Array.isArray(ai.goals) ? ai.goals.slice(0, 20).map((g) => truncate(String(g), 200)) : [],
      rules: Array.isArray(ai.rules) ? ai.rules.map((r) => ({
        domain: ['trade', 'relationships', 'spending', 'general'].includes(r.domain) ? r.domain : 'general',
        if_text: truncate(r.if_text || '', 300),
        then_text: truncate(r.then_text || '', 300)
      })) : []
    };

    await logUsage(auth, user.id, 'onboarding-summary', result);

    return send(res, 200, {
      ok: true,
      proposal
    });
  } catch (e) {
    await logUsage(auth, user.id, 'onboarding-summary', null);
    return fail(res, 500, 'model_failed', e.message);
  }
}

function truncate(s, max) {
  if (typeof s !== 'string') return s;
  return s.length > max ? s.slice(0, max) : s;
}
