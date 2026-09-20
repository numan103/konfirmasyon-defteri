import { send } from '../http.mjs';

export default async function ping({ res, user }) {
  return send(res, 200, { ok: true, user_id: user.id });
}
