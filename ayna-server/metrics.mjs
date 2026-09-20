import { db, q } from './supabase.mjs';
import { localDate, addDays } from './time.mjs';

export async function personMetricsText(auth, userId, personId) {
  const today = localDate();
  const ninetyAgo = addDays(today, -89);
  const events = await db(auth, 'GET', `ayna_events?user_id=eq.${q(userId)}&person_id=eq.${q(personId)}&local_date=gte.${ninetyAgo}&local_date=lte.${today}&is_closed=eq.false&select=event_type,impact,local_date`);

  const n = events.length;
  if (!n) return 'Son 90 günde olay yok';

  const avgImpact = (events.reduce((s, e) => s + (e.impact || 0), 0) / n).toFixed(1);
  const requestCount = events.filter((e) => e.event_type === 'request' || e.event_type === 'lent_money').length;
  const requestRatio = n >= 4 ? `${Math.round(100 * requestCount / n)}%` : null;
  const received = events.filter((e) => e.event_type === 'support_received' || e.event_type === 'praise' || e.event_type === 'borrowed_money').length;
  const given = events.filter((e) => e.event_type === 'support_given' || e.event_type === 'request' || e.event_type === 'lent_money').length;
  let reciprocity = null;
  if (received + given >= 3) {
    const a = Math.round(100 * received / (received + given));
    reciprocity = `${a}/${100 - a}`;
  }

  let moodDiff = null;
  const eventDates = [...new Set(events.map((e) => e.local_date))];
  if (eventDates.length >= 3) {
    const matchingEvenings = await db(auth, 'GET', `ayna_entries?user_id=eq.${q(userId)}&kind=eq.evening&pleasantness=not.is.null&local_date=in.(${eventDates.join(',')})&select=pleasantness`);
    const allEvenings = await db(auth, 'GET', `ayna_entries?user_id=eq.${q(userId)}&kind=eq.evening&pleasantness=not.is.null&local_date=gte.${ninetyAgo}&local_date=lte.${today}&select=pleasantness`);
    if (matchingEvenings.length >= 3 && allEvenings.length >= 3) {
      const avgMatch = matchingEvenings.reduce((s, e) => s + e.pleasantness, 0) / matchingEvenings.length;
      const avgAll = allEvenings.reduce((s, e) => s + e.pleasantness, 0) / allEvenings.length;
      moodDiff = (avgMatch - avgAll).toFixed(1);
    }
  }

  const parts = [`Son 90 günde ${n} olay; ortalama etki ${avgImpact}`];
  parts.push(`talep oranı ${requestRatio || '—'}`);
  parts.push(`alınan/verilen ${reciprocity || '—'}`);
  parts.push(`birlikteyken ruh hali farkı ${moodDiff || '—'}`);
  return parts.join('; ');
}
export async function dependencyFlag(auth, userId) {
  const today = localDate();
  const fourteenAgo = addDays(today, -14);
  const twentyEightAgo = addDays(today, -28);

  const nowMessages = await db(auth, 'GET', `ayna_chat_messages?user_id=eq.${q(userId)}&role=eq.user&mode=neq.onboarding&created_at=gte.${fourteenAgo}T00:00:00Z&created_at=lte.${today}T23:59:59Z&select=id`);
  const prevMessages = await db(auth, 'GET', `ayna_chat_messages?user_id=eq.${q(userId)}&role=eq.user&mode=neq.onboarding&created_at=gte.${twentyEightAgo}T00:00:00Z&created_at=lt.${fourteenAgo}T00:00:00Z&select=id`);

  const nowCount = nowMessages.length;
  const prevCount = prevMessages.length;

  const nowEvents = await db(auth, 'GET', `ayna_events?user_id=eq.${q(userId)}&person_id=not.is.null&local_date=gte.${fourteenAgo}&local_date=lte.${today}&select=id`);
  const prevEvents = await db(auth, 'GET', `ayna_events?user_id=eq.${q(userId)}&person_id=not.is.null&local_date=gte.${twentyEightAgo}&local_date=lt.${fourteenAgo}&select=id`);

  const nowEventCount = nowEvents.length;
  const prevEventCount = prevEvents.length;

  if (
    nowCount >= 10 &&
    nowCount >= 1.5 * Math.max(prevCount, 1) &&
    prevEventCount >= 3 &&
    nowEventCount <= 0.7 * prevEventCount
  ) {
    return `Son 14 günde koçla ${nowCount} mesaj (önceki 14 gün: ${prevCount}); kişilerle kayıtlı olay ${nowEventCount} (önceki: ${prevEventCount}).`;
  }

  return null;
}
export async function blindSpot(auth, userId) {
  const today = localDate();
  const thirtyAgo = addDays(today, -30);

  const candidates = await db(auth, 'GET', `ayna_people?user_id=eq.${q(userId)}&status=eq.active&ring=in.(1,2)&created_at=lt.${thirtyAgo}T00:00:00Z&select=id,display_name`);

  const blindSpots = [];
  for (const p of candidates) {
    const recentEvents = await db(auth, 'GET', `ayna_events?user_id=eq.${q(userId)}&person_id=eq.${q(p.id)}&local_date=gte.${thirtyAgo}&local_date=lte.${today}&is_closed=eq.false&select=id`);
    if (recentEvents.length === 0) {
      blindSpots.push(p);
      if (blindSpots.length >= 5) break;
    }
  }

  return blindSpots.length ? blindSpots : null;
}
