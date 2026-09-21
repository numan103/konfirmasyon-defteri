import { db, q } from '../supabase.mjs';
import { localDate } from '../time.mjs';
import { logUsage } from '../limits.mjs';
import { callTool } from '../llm.mjs';
import { GOREV_AYLIK } from '../prompts.mjs';
import { TOOLS } from '../tools.mjs';
import { kocTemel, validEntryIds } from '../context.mjs';
import { monthlyPackage } from '../metrics.mjs';

const truncate = (s, max) => typeof s === 'string' ? s.slice(0, max) : s;

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export default async function runMonthly(auth, profile, start, end) {
  const userId = profile.user_id;

  const pkg = await monthlyPackage(auth, userId, start, end);
  if (pkg.eveningCount < 5) return;

  const [y, m] = start.split('-').map(Number);
  const ayAd = `${TR_MONTHS[m - 1]} ${y}`;

  const systemDynamic = GOREV_AYLIK
    .replace('{AY}', ayAd) + '\n\n' + pkg.text;

  const result = await callTool({
    kind: 'coach',
    systemStatic: kocTemel(profile),
    systemDynamic,
    messages: [{ role: 'user', content: 'Aylık değerlendirmeyi hazırla.' }],
    tool: TOOLS.monthly_report,
    maxTokens: 3000
  });

  const ai = result.input;
  const title = truncate(ai.title || '', 80);
  const body = truncate(ai.body_markdown || '', 6000);
  const focus = truncate(ai.focus || '', 200);

  try {
    await db(auth, 'POST', 'ayna_insights', [{
      user_id: userId,
      kind: 'monthly',
      period_start: start,
      period_end: end,
      title,
      body,
      focus,
      evidence: await validEntryIds(auth, userId, ai.evidence_entry_ids, start, end)
    }], 'return=minimal');
  } catch (e) {
    if (e.code === '23505') return;
    throw e;
  }

  try {
    await db(auth, 'PATCH', `ayna_profiles?user_id=eq.${q(userId)}`, { current_focus: focus }, 'return=minimal');
  } catch (e) {
  }

  await logUsage(auth, userId, 'monthly', result);
}
