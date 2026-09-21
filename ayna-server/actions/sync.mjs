import { fail } from '../http.mjs';
import { db, q } from '../supabase.mjs';
import { localDate, isIsoDate } from '../time.mjs';

export default async function sync({ res, auth, user, profile }) {
  const result = await runSync(auth, user.id, profile);
  if (result.trades.error || result.expenses.error) {
    return fail(res, 500, 'sync_failed');
  }
  const { send } = await import('../http.mjs');
  return send(res, 200, { ok: true, trades: result.trades, expenses: result.expenses });
}

export async function runSync(auth, userId, profile) {
  const result = { trades: { skipped: true }, expenses: { skipped: true } };

  let rows;
  try {
    rows = await db(auth, 'GET', `journals?user_id=eq.${q(userId)}&select=data`);
  } catch (e) {
    console.error('[AYNA]', 'sync_journals_read', e.message);
    return result;
  }

  if (!rows.length || typeof rows[0].data !== 'object' || rows[0].data === null) {
    return result;
  }

  const data = rows[0].data;

  try {
    const tradeArr = data['defter-data-v1'];
    if (!Array.isArray(tradeArr)) {
      result.trades = { skipped: true };
    } else {
      const sorted = tradeArr
        .filter((t) => typeof t.ts === 'number')
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 500);

      const rows = [];
      for (const t of sorted) {
        const local_date = isIsoDate(t.date) ? t.date : localDate(new Date(t.ts));
        if (!local_date) continue;

        const row = {
          user_id: userId,
          source: 'site',
          source_id: String(t.id),
          local_date,
          symbol: typeof t.pair === 'string' ? t.pair : null,
          direction: t.dir === 'LONG' ? 'long' : t.dir === 'SHORT' ? 'short' : null,
          opened_at: typeof t.ts === 'number' ? new Date(t.ts).toISOString() : null,
          closed_at: null,
          pnl: typeof t.r === 'number' ? Number(t.r) : null,
          raw: { strat: t.strat, model: t.model, criteria: t.criteria, kKalite: t.kKalite }
        };

        if (t.kKalite === 'Kurallı') {
          row.planned = true;
        } else if (t.kKalite === 'Zorlama') {
          row.planned = false;
        }

        if (typeof t.note === 'string') {
          row.note = t.note.slice(0, 500);
        }

        rows.push(row);
      }

      if (rows.length) {
        await db(auth, 'POST', `ayna_trades?on_conflict=user_id,source_id`, rows, 'resolution=merge-duplicates,return=minimal');
      }
      result.trades = { upserted: rows.length };
    }
  } catch (e) {
    console.error('[AYNA]', 'sync_trades', e.message);
    result.trades = { error: 'sync_failed' };
  }

  if (result.trades.upserted !== undefined) {
    try {
      await db(auth, 'PATCH', `ayna_profiles?user_id=eq.${q(userId)}`, { last_trade_sync_at: new Date().toISOString() }, 'return=minimal');
    } catch (e) {
      console.error('[AYNA]', 'sync_trades_profile_update', e.message);
    }
  }

  try {
    const budgetObj = data['defter-butce-v1'];
    if (!budgetObj || typeof budgetObj !== 'object' || !Array.isArray(budgetObj.entries)) {
      result.expenses = { skipped: true };
    } else {
      const cats = Array.isArray(budgetObj.cats) ? budgetObj.cats : [];
      const catMap = {};
      for (const c of cats) {
        if (c && c.id != null) catMap[c.id] = c.name;
      }

      const sorted = budgetObj.entries
        .filter((e) => typeof e.date === 'string')
        .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0))
        .slice(0, 1000);

      const rows = [];
      for (const e of sorted) {
        if (!isIsoDate(e.date)) continue;

        const amt = Number(e.amount);
        if (typeof amt !== 'number' || isNaN(amt)) continue;

        const row = {
          user_id: userId,
          source: 'site',
          source_id: String(e.id),
          local_date: e.date,
          amount: Math.abs(amt),
          is_income: e.type === 'gelir',
          currency: 'TRY',
          raw: e
        };

        if (typeof e.note === 'string') {
          row.description = e.note.slice(0, 200);
        }

        rows.push(row);
      }

      if (rows.length) {
        await db(auth, 'POST', `ayna_expenses?on_conflict=user_id,source_id`, rows, 'resolution=merge-duplicates,return=minimal');
      }
      result.expenses = { upserted: rows.length };
    }
  } catch (e) {
    console.error('[AYNA]', 'sync_expenses', e.message);
    result.expenses = { error: 'sync_failed' };
  }

  if (result.expenses.upserted !== undefined) {
    try {
      await db(auth, 'PATCH', `ayna_profiles?user_id=eq.${q(userId)}`, { last_expense_sync_at: new Date().toISOString() }, 'return=minimal');
    } catch (e) {
      console.error('[AYNA]', 'sync_expenses_profile_update', e.message);
    }
  }

  return result;
}
