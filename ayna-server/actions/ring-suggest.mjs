import { db, q } from '../supabase.mjs';
import { send, fail } from '../http.mjs';
import { localDate, addDays } from '../time.mjs';

// Yakınlık önerisi şeffaf olsun diye puanlamanın her parçası yanıtta döner.
const WINDOW_DAYS = 30;
const W = { day: 3, event: 1, impact: 1, loop: 2, tag: 1 };
const RING1_MIN = 12;
const RING2_MIN = 5;
const RING1_CAP = 5; // "çok yakın" etiketi her zaman değerli kalmalı

export default async function ringSuggest({ res, auth, user }) {
  try {
    const today = localDate();
    const from = addDays(today, -WINDOW_DAYS);

    const [people, events, tags, loops] = await Promise.all([
      db(auth, 'GET', `ayna_people?user_id=eq.${q(user.id)}&select=id,display_name,ring,status,sector`),
      db(auth, 'GET', `ayna_events?user_id=eq.${q(user.id)}&person_id=not.is.null&local_date=gte.${from}&select=person_id,local_date,impact,event_type`),
      db(auth, 'GET', `ayna_entry_people?user_id=eq.${q(user.id)}&select=person_id,entry_id`),
      db(auth, 'GET', `ayna_open_loops?user_id=eq.${q(user.id)}&person_id=not.is.null&status=eq.open&select=person_id`)
    ]);

    // Etiketli kayıtların tarihleri: ayna_entry_people'da tarih yok, entry_id üzerinden bakılır.
    const entryIds = [...new Set((tags || []).map((t) => t.entry_id).filter(Boolean))];
    let tagDates = new Map();
    if (entryIds.length) {
      const rows = await db(
        auth,
        'GET',
        `ayna_entries?id=in.(${entryIds.map(q).join(',')})&select=id,local_date`
      );
      tagDates = new Map((rows || []).map((r) => [r.id, r.local_date]));
    }

    const byPerson = new Map();
    function slot(pid) {
      if (!byPerson.has(pid)) {
        byPerson.set(pid, { days: new Set(), events: 0, impact: 0, tags: 0, loops: 0, last: null });
      }
      return byPerson.get(pid);
    }

    for (const e of events || []) {
      const s = slot(e.person_id);
      s.events += 1;
      s.impact += Math.min(Math.abs(Number(e.impact) || 0), 2);
      if (e.local_date) {
        s.days.add(e.local_date);
        if (!s.last || e.local_date > s.last) s.last = e.local_date;
      }
    }

    for (const t of tags || []) {
      const d = tagDates.get(t.entry_id);
      if (!d || d < from || d > today) continue;
      slot(t.person_id).tags += 1;
    }

    for (const l of loops || []) slot(l.person_id).loops += 1;

    const scored = (people || []).map((p) => {
      const s = byPerson.get(p.id) || { days: new Set(), events: 0, impact: 0, tags: 0, loops: 0, last: null };
      const score =
        W.day * s.days.size +
        W.event * s.events +
        W.impact * s.impact +
        W.loop * s.loops +
        W.tag * s.tags;
      return {
        id: p.id,
        display_name: p.display_name,
        current_ring: Number(p.ring) || 3,
        status: p.status,
        score,
        breakdown: {
          days: s.days.size,
          events: s.events,
          impact: s.impact,
          loops: s.loops,
          tags: s.tags
        },
        last_interaction: s.last
      };
    });

    const active = scored.filter((p) => p.score > 0);

    // Ham puandan halka, en yüksek puanlı en fazla RING1_CAP kişi 1. halka olabilir.
    const byScore = active.slice().sort((a, b) => b.score - a.score);
    const ring1Ids = new Set(
      byScore.filter((p) => p.score >= RING1_MIN).slice(0, RING1_CAP).map((p) => p.id)
    );

    for (const p of active) {
      p.suggested_ring = ring1Ids.has(p.id) ? 1 : (p.score >= RING2_MIN ? 2 : 3);
    }

    const suggestions = active
      .filter((p) => p.suggested_ring !== p.current_ring)
      .sort((a, b) => b.score - a.score);

    const distribution = { 1: 0, 2: 0, 3: 0 };
    for (const p of scored) {
      if (p.status === 'active') distribution[Number(p.current_ring) || 3] += 1;
    }

    return send(res, 200, {
      ok: true,
      window_days: WINDOW_DAYS,
      suggestions,
      distribution,
      total_people: (people || []).length
    });
  } catch (e) {
    return fail(res, 500, 'server_error', e && e.message);
  }
}
