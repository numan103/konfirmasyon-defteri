import { db, q } from '../supabase.mjs';
import { localDate } from '../time.mjs';
import { logUsage } from '../limits.mjs';
import { callTool, modelFor } from '../anthropic.mjs';
import { GOREV_HAFTALIK } from '../prompts.mjs';
import { TOOLS } from '../tools.mjs';
import { kocTemel } from '../context.mjs';
import { weeklyPackage } from '../metrics.mjs';

const truncate = (s, max) => typeof s === 'string' ? s.slice(0, max) : s;
const norm = (s) => String(s || '').toLocaleLowerCase('tr-TR').trim().replace(/\s+/g, ' ');

export default async function runWeekly(auth, profile, start, end) {
  const userId = profile.user_id;

  const pkg = await weeklyPackage(auth, userId, start, end);
  if (pkg.entryCount < 2) return;

  const systemDynamic = GOREV_HAFTALIK
    .replace('{BASLANGIC}', start)
    .replace('{BITIS}', end) + '\n\n' + pkg.text;

  const result = await callTool({
    model: modelFor('coach'),
    systemStatic: kocTemel(profile),
    systemDynamic,
    messages: [{ role: 'user', content: 'Haftalık raporu hazırla.' }],
    tool: TOOLS.weekly_report,
    maxTokens: 2500
  });

  const ai = result.input;
  const today = localDate();
  const title = truncate(ai.title || '', 80);
  const body = truncate(ai.body_markdown || '', 6000);
  const focus = truncate(ai.focus || '', 200);

  try {
    await db(auth, 'POST', 'ayna_insights', [{
      user_id: userId,
      kind: 'weekly',
      period_start: start,
      period_end: end,
      title,
      body,
      focus,
      evidence: Array.isArray(ai.evidence_entry_ids)
        ? ai.evidence_entry_ids.filter((id) => typeof id === 'string' && id.length === 36).slice(0, 10)
        : []
    }], 'return=minimal');
  } catch (e) {
    if (e.code === '23505') return;
    throw e;
  }

  if (Array.isArray(ai.belief_proposals)) {
    const existingBeliefs = await db(auth, 'GET', `ayna_beliefs?user_id=eq.${q(userId)}&select=statement`);
    const existingNorms = new Set(existingBeliefs.map((b) => norm(b.statement)));

    let added = 0;
    for (const bp of ai.belief_proposals) {
      if (added >= 3) break;
      if (!bp.statement || typeof bp.statement !== 'string') continue;
      const statement = truncate(bp.statement, 200);
      if (norm(statement) === '' || existingNorms.has(norm(statement))) continue;

      const evidenceIds = Array.isArray(bp.evidence_entry_ids)
        ? bp.evidence_entry_ids.filter((id) => typeof id === 'string' && id.length === 36)
        : [];
      if (evidenceIds.length < 3) continue;

      try {
        await db(auth, 'POST', 'ayna_beliefs', [{
          user_id: userId,
          statement,
          evidence: evidenceIds.slice(0, 10),
          status: 'proposed'
        }], 'return=minimal');
        added++;
      } catch (e) {
        if (e.code === '23505') continue;
        console.error('[AYNA] weekly belief insert error', userId, e.message);
      }
    }
  }

  await logUsage(auth, userId, 'weekly', result);
}
