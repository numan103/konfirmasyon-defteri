import { db, q } from './supabase.mjs';
import { localDate } from './time.mjs';

export const DAILY_LIMITS = { scribe: 40, reflect: 15, coach: 60, 'onboarding-summary': 3, sync: 10 };

export async function underLimit(auth, userId, action) {
  const limit = DAILY_LIMITS[action];
  if (!limit) return true;
  const rows = await db(auth, 'GET', `ayna_usage?user_id=eq.${q(userId)}&local_date=eq.${localDate()}&action=eq.${q(action)}&select=id`);
  return rows.length < limit;
}

export async function logUsage(auth, userId, action, result) {
  const u = (result && result.usage) || {};
  await db(auth, 'POST', 'ayna_usage', [{
    user_id: userId,
    local_date: localDate(),
    action,
    model: (result && result.model) || 'none',
    input_tokens: u.input_tokens || 0,
    output_tokens: u.output_tokens || 0,
    cache_read_tokens: u.cache_read_input_tokens || 0,
    cache_write_tokens: u.cache_creation_input_tokens || 0
  }], 'return=minimal');
}
