import { send, fail } from '../http.mjs';
import { db, q } from '../supabase.mjs';
import { isAdminEmail } from '../../lib/auth.mjs';
import { notionSync, notionDatabases, cleanNotionToken } from '../notion.mjs';

// The owner's Notion workspace can be read with the deployment token. Other
// Ayna users must supply their own OAuth token; a server token is never used
// for them because it would expose someone else's trade journal.
function mayUseEnvToken(user) {
  return !!user && !!user.email_confirmed_at && isAdminEmail(user.email);
}

export default async function notionSyncAction({ res, auth, user, body }) {
  const supplied = cleanNotionToken(body && body.token);
  if (body && body.token && !supplied) return fail(res, 400, 'bad_request');

  const token = supplied || (mayUseEnvToken(user) ? cleanNotionToken(process.env.NOTION_TOKEN) : null);
  if (!token) return fail(res, 409, 'notion_not_connected');

  let dbs = null;
  if (body && body.dbs != null) {
    const parsed = notionDatabases(body.dbs);
    if (!parsed) return fail(res, 400, 'bad_request');
    dbs = parsed;
  }

  try {
    const result = await notionSync(auth, user.id, { token, dbs });
    try {
      await db(auth, 'PATCH', `ayna_profiles?user_id=eq.${q(user.id)}`, { last_trade_sync_at: new Date().toISOString() }, 'return=minimal');
    } catch (e) { /* sync itself succeeded; profile timestamp is optional */ }
    return send(res, 200, { ok: true, ...result });
  } catch (e) {
    if (e && e.name === 'AbortError') return fail(res, 504, 'timeout');
    if (e && e.status === 401) return fail(res, 502, 'notion_auth');
    if (e && e.status === 404) return fail(res, 502, 'notion_not_found');
    if (String(e && e.message).indexOf('notion_token_invalid') >= 0) return fail(res, 400, 'bad_request');
    console.error('[AYNA notion] sync failed', e && e.status ? e.status : 'unknown');
    return fail(res, 502, 'notion_failed');
  }
}
