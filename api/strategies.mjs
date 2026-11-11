// Strateji yonetimi: admin only.
import { requestUser } from '../lib/auth.mjs';
import { readStrategies, addStrategy, removeStrategy } from '../lib/telegram-qa-strategies.mjs';

export default async function strategiesHandler(req, res) {
  const user = await requestUser(req);
  if (!user?.admin) return res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthorized' });

  if (req.method === 'GET') {
    const strategies = await readStrategies();
    return res.status(200).json({ strategies });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; } catch { return res.status(400).json({ error: 'invalid_json' }); }

  const action = body.action;
  if (action === 'add') {
    if (!body.name || !body.description) return res.status(400).json({ error: 'name_and_description_required' });
    const ok = await addStrategy(String(body.name).slice(0, 80), String(body.description).slice(0, 2000));
    return res.status(ok ? 200 : 500).json({ ok, name: body.name });
  }
  if (action === 'remove') {
    if (!body.name) return res.status(400).json({ error: 'name_required' });
    const ok = await removeStrategy(String(body.name).slice(0, 80));
    return res.status(ok ? 200 : 404).json({ ok, name: body.name });
  }
  if (action === 'list') {
    const strategies = await readStrategies();
    return res.status(200).json({ strategies });
  }
  return res.status(400).json({ error: 'invalid_action' });
}
