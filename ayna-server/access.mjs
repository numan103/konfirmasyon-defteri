import { isAdminEmail } from '../lib/auth.mjs';

// `user` must come from Supabase getUser(jwt), never the request payload.
// Keep invitation-only access for members while recognizing the site's owner.
export function canUseAyna(user) {
  if (!user || !user.id) return false;
  const invited = (process.env.AYNA_ALLOWED_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
  if (invited.includes(user.id)) return true;
  return !!user.email_confirmed_at && isAdminEmail(user.email);
}
