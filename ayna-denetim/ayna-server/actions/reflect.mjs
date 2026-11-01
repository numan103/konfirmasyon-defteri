import { send, fail } from '../http.mjs';
import { db, q } from '../supabase.mjs';
import { callTool, modelFor } from '../openai.mjs';
import { logUsage } from '../limits.mjs';
import { GOREV_GUNLUK, GOREV_ZOR_GUN, GOREV_ANLIK } from '../prompts.mjs';
import { TOOLS } from '../tools.mjs';
import { localDate } from '../time.mjs';
import { kocTemel, buildReflectContext } from '../context.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function truncate(s, max) {
  if (typeof s !== 'string') return s;
  return s.length > max ? s.slice(0, max) : s;
}

export default async function reflect({ res, auth, user, profile, body }) {
  const entryId = body && body.entry_id;
  const kind = body && body.kind;

  if (!entryId || typeof entryId !== 'string' || entryId.length !== 36 || !UUID_RE.test(entryId)) {
    return fail(res, 400, 'bad_request');
  }
  if (kind !== 'daily' && kind !== 'instant') {
    return fail(res, 400, 'bad_request');
  }

  try {
    const rows = await db(auth, 'GET', `ayna_entries?id=eq.${q(entryId)}&user_id=eq.${q(user.id)}&select=*`);
    if (!rows.length) return fail(res, 404, 'not_found');
    const entry = rows[0];

    if (kind === 'daily' && entry.kind !== 'evening') {
      return fail(res, 400, 'bad_request');
    }

    let taskBlock;
    if (kind === 'instant') {
      taskBlock = GOREV_ANLIK;
    } else if (entry.pleasantness != null && entry.pleasantness <= -3) {
      taskBlock = GOREV_ZOR_GUN;
    } else {
      taskBlock = GOREV_GUNLUK;
    }

    const context = await buildReflectContext(auth, profile, entry);
    const maxTokens = kind === 'instant' ? 1200 : 700;
    const message = kind === 'daily'
      ? `Bugünkü kaydıma yansıma yaz. Kayıt: [${entryId}]`
      : `Bu önemli kayda yansıma yaz. Kayıt: [${entryId}]`;

    const result = await callTool({
      model: modelFor('coach'),
      systemStatic: kocTemel(profile),
      systemDynamic: taskBlock + '\n\n' + context,
      messages: [{ role: 'user', content: message }],
      tool: TOOLS.record_reflection,
      maxTokens
    });

    const ai = result.input;

    const title = truncate(ai.title || '', 80);
    const bodyText = truncate(ai.body || '', 3000);
    const risk = ['none', 'low', 'crisis'].includes(ai.risk) ? ai.risk : 'none';

    const evidenceIds = Array.isArray(ai.evidence_entry_ids)
      ? [...new Set(ai.evidence_entry_ids.filter((id) => typeof id === 'string' && id.length === 36))].slice(0, 10)
      : [];

    await db(auth, 'DELETE', `ayna_insights?user_id=eq.${q(user.id)}&kind=eq.${q(kind)}&source_entry_id=eq.${q(entryId)}`);

    const insight = {
      user_id: user.id,
      kind,
      period_start: entry.local_date,
      period_end: entry.local_date,
      title,
      body: bodyText,
      evidence: evidenceIds,
      source_entry_id: entryId
    };

    const inserted = await db(auth, 'POST', 'ayna_insights', [insight], 'return=representation');
    const savedInsight = inserted && inserted.length ? inserted[0] : insight;

    await logUsage(auth, user.id, 'reflect', result);

    return send(res, 200, {
      ok: true,
      insight: savedInsight,
      risk
    });
  } catch (e) {
    await logUsage(auth, user.id, 'reflect', null);
    if (e.status === 404) return fail(res, 404, 'not_found');
    return fail(res, 500, 'model_failed', e.message);
  }
}
