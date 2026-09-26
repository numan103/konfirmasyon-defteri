import { db, q } from '../supabase.mjs';
import { send, fail } from '../http.mjs';

const WINDOW_SEC = 120;
const MAX_DELETE = 200;

export default async function dedupeChat({ res, auth, user }) {
  try {
    const rows = await db(
      auth,
      'GET',
      `ayna_chat_messages?user_id=eq.${q(user.id)}&select=id,mode,role,content,created_at&order=created_at.asc&limit=500`
    );
    if (!Array.isArray(rows)) return send(res, 200, { ok: true, removed: 0 });

    const kept = new Map();
    const doomed = [];

    for (const r of rows) {
      if (!r || !r.id) continue;
      const key = [r.mode || '', r.role || '', String(r.content || '').trim()].join('\u0000');
      const prev = kept.get(key);
      if (!prev) {
        kept.set(key, r);
        continue;
      }
      const prevMs = Date.parse(prev.created_at || '') || 0;
      const curMs = Date.parse(r.created_at || '') || 0;
      if (prevMs && curMs && Math.abs(curMs - prevMs) <= WINDOW_SEC * 1000) doomed.push(r.id);
    }

    let removed = 0;
    for (let i = 0; i < doomed.length && removed < MAX_DELETE; i += 50) {
      const batch = doomed.slice(i, i + 50);
      await db(auth, 'DELETE', `ayna_chat_messages?id=in.(${batch.map(q).join(',')})`);
      removed += batch.length;
    }

    return send(res, 200, { ok: true, removed, scanned: rows.length });
  } catch (e) {
    return fail(res, 500, 'server_error', e && e.message);
  }
}
