import { send, fail } from '../ayna-server/http.mjs';
import { getUser, db, q } from '../ayna-server/supabase.mjs';
import { underLimit } from '../ayna-server/limits.mjs';
import runDaily from '../ayna-server/jobs/daily.mjs';
import ping from '../ayna-server/actions/ping.mjs';
import scribe from '../ayna-server/actions/scribe.mjs';
import reflect from '../ayna-server/actions/reflect.mjs';
import coach from '../ayna-server/actions/coach.mjs';
import onboardingSummary from '../ayna-server/actions/onboarding-summary.mjs';
import sync from '../ayna-server/actions/sync.mjs';

const ACTIONS = { ping, scribe, reflect, coach, 'onboarding-summary': onboardingSummary, sync };

export default async function handler(req, res) {
  if (req.method === 'GET') return cron(req, res);
  if (req.method !== 'POST') return fail(res, 405, 'bad_request');
  const header = req.headers.authorization || '';
  const jwt = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!jwt) return fail(res, 401, 'unauthorized');
  let user = null;
  try { user = await getUser(jwt); } catch (e) { user = null; }
  if (!user) return fail(res, 401, 'unauthorized');
  const allowed = (process.env.AYNA_ALLOWED_USER_IDS || '').split(',').map((sx) => sx.trim()).filter(Boolean);
  if (!allowed.includes(user.id)) return fail(res, 403, 'not_allowed');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = ACTIONS[body.action];
  if (!action) return fail(res, 400, 'bad_request');
  const auth = { jwt };
  try {
    if (body.action === 'ping') return await action({ req, res, auth, user, profile: null, body });
    const profiles = await db(auth, 'GET', `ayna_profiles?user_id=eq.${q(user.id)}&select=*`);
    if (!profiles.length) return fail(res, 409, 'no_profile');
    if (!(await underLimit(auth, user.id, body.action))) return fail(res, 429, 'daily_limit');
    return await action({ req, res, auth, user, profile: profiles[0], body });
  } catch (e) {
    return fail(res, 500, 'server_error', e.message);
  }
}

async function cron(req, res) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return fail(res, 401, 'unauthorized');
  const url = new URL(req.url, 'http://localhost');
  const force = url.searchParams.get('force');
  const onlyUser = url.searchParams.get('user');
  try {
    const result = await runDaily({ force: force === 'weekly' || force === 'monthly' ? force : null, onlyUser });
    return send(res, 200, { ok: true, ...result });
  } catch (e) {
    return fail(res, 500, 'server_error', e.message);
  }
}
