import { db, q } from '../supabase.mjs';
import { localDate, weekday, addDays, formatTR, previousMonthRange } from '../time.mjs';
import { logUsage } from '../limits.mjs';
import runSync from '../actions/sync.mjs';
import { runScribe } from '../actions/scribe.mjs';
import runWeekly from './weekly.mjs';
import runMonthly from './monthly.mjs';

const truncate = (s, max) => typeof s === 'string' ? s.slice(0, max) : s;

export default async function runDaily({ force, onlyUser } = {}) {
  const auth = { service: true };
  const started = Date.now();
  const today = localDate();
  const wd = weekday();
  const allowed = (process.env.AYNA_ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

  const where = ['onboarding_done=eq.true'];
  if (onlyUser) where.push(`user_id=eq.${q(onlyUser)}`);
  const profiles = await db(auth, 'GET', `ayna_profiles?${where.join('&')}&order=last_daily_job_on.asc.nullsfirst&limit=20`);

  let processed = 0;

  for (const profile of profiles) {
    if (Date.now() - started > 45000) break;
    const userId = profile.user_id;
    if (allowed.length && !allowed.includes(userId)) continue;
    if (!force && profile.last_daily_job_on === today) continue;

    try {
      try {
        await runSync(auth, userId, profile);
      } catch (e) {
        console.error('[AYNA] daily sync error', userId, e.message);
      }

      try {
        const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const threeDaysAgo = addDays(today, -2);
        const pending = await db(auth, 'GET', `ayna_entries?user_id=eq.${q(userId)}&local_date=gte.${threeDaysAgo}&local_date=lte.${today}&created_at=lt.${cutoff}&processed_at=is.null&processing_error=is.null&select=id&limit=5&order=local_date.asc`);
        for (const entry of pending) {
          try {
            const result = await runScribe(auth, userId, entry.id);
            await logUsage(auth, userId, 'scribe_retry', result);
          } catch (e) {
            console.error('[AYNA] daily scribe retry error', userId, entry.id, e.message);
          }
        }
      } catch (e) {
        console.error('[AYNA] daily reprocess error', userId, e.message);
      }

      try {
        const decisions = await db(auth, 'GET', `ayna_decisions?user_id=eq.${q(userId)}&reviewed_at=is.null&review_date=lte.${today}&select=id,title,reasoning,created_at`);
        for (const d of decisions) {
          try {
            const title = `Karar dönüşü: ${truncate(d.title, 57)}`;
            const body = `${formatTR(d.created_at)} tarihinde bu kararı şu gerekçeyle vermiştin: "${d.reasoning}". Sonuç ne oldu? Arşiv sekmesindeki Kararlar bölümünden yazabilirsin.`;
            await db(auth, 'POST', 'ayna_insights', [{
              user_id: userId,
              kind: 'decision_review',
              period_start: today,
              period_end: today,
              title: truncate(title, 80),
              body,
              decision_id: d.id,
              evidence: []
            }], 'return=minimal');
          } catch (e) {
            if (e.code === '23505') continue;
            console.error('[AYNA] daily decision review error', userId, d.id, e.message);
          }
        }
      } catch (e) {
        console.error('[AYNA] daily decisions error', userId, e.message);
      }

      try {
        if ((force === 'weekly' || [0, 1, 2].includes(wd)) && (Date.now() - started) < 30000) {
          const lastSunday = wd === 0 ? today : addDays(today, -wd);
          const weekStart = addDays(lastSunday, -6);
          const existing = await db(auth, 'GET', `ayna_insights?user_id=eq.${q(userId)}&kind=eq.weekly&period_start=eq.${weekStart}&select=id`);
          if (!existing.length) {
            try {
              await runWeekly(auth, profile, weekStart, lastSunday);
            } catch (e) {
              console.error('[AYNA] daily weekly error', userId, e.message);
            }
          }
        }
      } catch (e) {
        console.error('[AYNA] daily weekly check error', userId, e.message);
      }

      try {
        if ((force === 'monthly' || new Date().getDate() <= 7) && (Date.now() - started) < 30000) {
          const { start, end } = previousMonthRange(today);
          const existing = await db(auth, 'GET', `ayna_insights?user_id=eq.${q(userId)}&kind=eq.monthly&period_start=eq.${start}&select=id`);
          if (!existing.length) {
            try {
              await runMonthly(auth, profile, start, end);
            } catch (e) {
              console.error('[AYNA] daily monthly error', userId, e.message);
            }
          }
        }
      } catch (e) {
        console.error('[AYNA] daily monthly check error', userId, e.message);
      }

      try {
        await db(auth, 'PATCH', `ayna_profiles?user_id=eq.${q(userId)}`, { last_daily_job_on: today }, 'return=minimal');
      } catch (e) {
        console.error('[AYNA] daily profile update error', userId, e.message);
      }

      processed++;
    } catch (e) {
      console.error('[AYNA] daily profile error', userId, e.message);
    }
  }

  return { processed };
}
