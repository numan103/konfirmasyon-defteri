import { timingSafeEqual } from 'node:crypto';
import { requestUser, throttle } from '../auth.mjs';
import { macroService, safeError } from './job.mjs';

function scheduler(req) {
  const secret = process.env.MACRO_CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const supplied = Buffer.from(String(req.headers?.authorization || ''));
  const expected = Buffer.from('Bearer ' + secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export default async function macroHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const service = macroService();
  try {
    if (req.method === 'GET') {
      if (!scheduler(req)) return res.status(401).json({ error: 'unauthorized' });
      if (req.query.action === 'status') return res.status(200).json(await service.status());
      if (req.query.action === 'preview') return res.status(200).json(await service.preview());
      if (req.query.action && req.query.action !== 'run') return res.status(400).json({ error: 'macro_invalid_action' });
      return res.status(200).json(await service.run());
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const user = await requestUser(req);
    if (!user?.admin) return res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthorized' });
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; } catch { return res.status(400).json({ error: 'invalid_json' }); }
    const action = body.action;
    if (!throttle('macro:' + user.id + ':' + action, action === 'macro-preview' ? 10000 : 1500)) return res.status(429).json({ error: 'too_many_requests' });
    if (action === 'macro-status') return res.status(200).json(await service.status());
    if (action === 'macro-preview') return res.status(200).json(await service.preview());
    if (action === 'macro-test-send') return res.status(200).json(await service.testSend(body));
    if (action === 'macro-enable') return res.status(200).json(await service.setEnabled(body));
    return res.status(400).json({ error: 'macro_invalid_action' });
  } catch (e) {
    const error = safeError(e);
    const conflict = /busy|conflict|already_claimed|attempt_limit|confirmation_required|test_required/.test(error);
    return res.status(conflict ? 409 : 503).json({ error });
  }
}
