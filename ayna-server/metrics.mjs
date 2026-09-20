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


export async function weeklyPackage(auth, userId, start, end) {
  const parts = [];

  parts.push('## Dönem: ' + start + ' \u2013 ' + end);

  const profiles = await db(auth, 'GET', 'ayna_profiles?user_id=eq.' + q(userId) + '&select=*');
  const profile = profiles[0];
  parts.push(await userModelText(auth, profile));

  const entries = await db(auth, 'GET', 'ayna_entries?user_id=eq.' + q(userId) + '&local_date=gte.' + start + '&local_date=lte.' + end + '&select=id,kind,local_date,pleasantness,energy,mood_words,sleep_hours,intention,body,summary,good_moment&order=local_date.asc');
  parts.push('## Günlükler');
  if (entries.length) {
    for (const e of entries) {
      const parts2 = ['[' + e.id + '] ' + e.local_date + ' ' + (TRLabels.entry[e.kind] || e.kind)];
      if (e.pleasantness != null) parts2.push('hoşluk ' + e.pleasantness);
      if (e.energy != null) parts2.push('enerji ' + e.energy);
      if (e.mood_words && e.mood_words.length) parts2.push('kelimeler: ' + e.mood_words.join(', '));
      if (e.sleep_hours != null) parts2.push('uyku ' + e.sleep_hours);
      if (e.summary) parts2.push('özet: ' + e.summary);
      if (e.good_moment) parts2.push('iyi an: ' + e.good_moment);
      if (e.body) parts2.push('not: ' + e.body.slice(0, 400));
      parts.push('- ' + parts2.join(' | '));
    }
  } else {
    parts.push('- kayit yok');
  }

  const events = await db(auth, 'GET', 'ayna_events?user_id=eq.' + q(userId) + '&local_date=gte.' + start + '&local_date=lte.' + end + '&is_closed=eq.false&select=id,entry_id,local_date,event_type,summary,impact,person_id&order=local_date.asc');
  const personIds = [...new Set(events.filter((e) => e.person_id).map((e) => e.person_id))];
  let personMap = {};
  if (personIds.length) {
    const people = await db(auth, 'GET', 'ayna_people?id=in.(' + personIds.join(',') + ')&select=id,display_name,sector,ring');
    for (const p of people) personMap[p.id] = p;
  }
  parts.push('## Kişilerle olaylar');
  if (events.length) {
    const grouped = {};
    for (const ev of events) {
      const pid = ev.person_id || '_none';
      if (!grouped[pid]) grouped[pid] = [];
      grouped[pid].push(ev);
    }
    for (const pid of Object.keys(grouped)) {
      const evs = grouped[pid];
      if (pid === '_none') {
        parts.push('### Kullanici');
      } else {
        const p = personMap[pid];
        if (p) parts.push('### ' + p.display_name + ' (' + (TRLabels.sector[p.sector] || p.sector) + ', ' + (TRLabels.ring[p.ring] || p.ring) + ')');
        else parts.push('### Bilinmeyen kişi');
      }
      for (const ev of evs) {
        parts.push('- [' + (ev.entry_id || '') + '] ' + ev.local_date + ' ' + (TRLabels.event[ev.event_type] || ev.event_type) + ': ' + ev.summary + ' (etki ' + ev.impact + ')');
      }
    }
  } else {
    parts.push('- olay yok');
  }

  const trades = await db(auth, 'GET', 'ayna_trades?user_id=eq.' + q(userId) + '&local_date=gte.' + start + '&local_date=lte.' + end + '&select=symbol,direction,pnl,planned,emotions&order=local_date.asc');
  parts.push('## Trade');
  if (trades.length) {
    const n = trades.length;
    const totalR = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0).toFixed(1);
    const plannedCount = trades.filter((t) => t.planned === true).length;
    const unplannedCount = trades.filter((t) => t.planned === false).length;
    const unknownCount = n - plannedCount - unplannedCount;
    parts.push('İşlem sayısı: ' + n + '; toplam R: ' + totalR + '; planli: ' + plannedCount + ', plan disi: ' + unplannedCount + ', bilinmiyor: ' + unknownCount);

    const emotionMap = {};
    for (const t of trades) {
      if (t.emotions && t.emotions.length) {
        for (const em of t.emotions) {
          emotionMap[em] = (emotionMap[em] || 0) + 1;
        }
      }
    }
    const emotionEntries = Object.entries(emotionMap).sort((a, b) => b[1] - a[1]);
    if (emotionEntries.length) parts.push('Duygu dağılımı: ' + emotionEntries.map((e) => e[0] + ' ' + e[1]).join(', '));

    const eveningDates = [];
    for (const e of entries) {
      if (e.kind === 'evening' && e.pleasantness != null && e.pleasantness <= -2) eveningDates.push(e.local_date);
    }
    if (eveningDates.length) {
      const unplannedBadDays = trades.filter((t) => t.planned === false && eveningDates.includes(t.local_date)).length;
      parts.push('Hoşluk −2 veya altı günlerdeki plan dışı işlem: ' + unplannedBadDays);
    }
  } else {
    parts.push('Veri kaynagi yok.');
  }

  const expenses = await db(auth, 'GET', 'ayna_expenses?user_id=eq.' + q(userId) + '&local_date=gte.' + start + '&local_date=lte.' + end + '&select=amount,category,is_income,local_date&order=local_date.asc');
  parts.push('## Harcama');
  if (expenses.length) {
    const total = expenses.filter((e) => !e.is_income).reduce((s, e) => s + (Number(e.amount) || 0), 0).toFixed(0);
    const catMap = {};
    for (const e of expenses) {
      if (!e.is_income) {
        const cat = e.category || 'Diğer';
        catMap[cat] = (catMap[cat] || 0) + (Number(e.amount) || 0);
      }
    }
    const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    parts.push('Toplam gider: ' + total + ' TRY; ilk 5 kategori: ' + topCats.map((c) => c[0] + ' ' + Math.round(c[1])).join(', '));

    const eveningPleasant = {};
    for (const e of entries) {
      if (e.kind === 'evening' && e.pleasantness != null) eveningPleasant[e.local_date] = e.pleasantness;
    }
    const badDates = Object.entries(eveningPleasant).filter(([, p]) => p <= -2).map(([d]) => d);
    const goodDates = Object.entries(eveningPleasant).filter(([, p]) => p > -2).map(([d]) => d);
    const badDayExpenses = expenses.filter((e) => !e.is_income && badDates.includes(e.local_date));
    const goodDayExpenses = expenses.filter((e) => !e.is_income && goodDates.includes(e.local_date));
    const avgBad = badDates.length ? (badDayExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0) / badDates.length).toFixed(0) : '\u2014';
    const avgGood = goodDates.length ? (goodDayExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0) / goodDates.length).toFixed(0) : '\u2014';
    parts.push('Hoşluk −2 veya altı günlerde günlük ortalama gider: ' + avgBad + '; diğer günlerde: ' + avgGood);
  } else {
    parts.push('Veri kaynagi yok.');
  }

  const rules = await db(auth, 'GET', 'ayna_rules?user_id=eq.' + q(userId) + '&is_active=eq.true&select=id,domain,if_text,then_text');
  parts.push('## Kurallar');
  if (rules.length) {
    const checks = await db(auth, 'GET', 'ayna_rule_checks?user_id=eq.' + q(userId) + '&local_date=gte.' + start + '&local_date=lte.' + end + '&select=rule_id,result');
    for (const r of rules) {
      const rc = checks.filter((c) => c.rule_id === r.id);
      const kept = rc.filter((c) => c.result === 'kept').length;
      const broken = rc.filter((c) => c.result === 'broken').length;
      parts.push('- [' + r.id + '] Eğer ' + r.if_text + ', o zaman ' + r.then_text + ': uyuldu ' + kept + ', çiğnendi ' + broken);
    }
  } else {
    parts.push('- kural yok');
  }

  const openLoops = await db(auth, 'GET', 'ayna_open_loops?user_id=eq.' + q(userId) + '&status=eq.open&select=id,kind,description,due_date,person_id');
  parts.push('## Vadesi geçen açık uçlar');
  const todayDate = localDate();
  const overdue = openLoops.filter((l) => l.due_date && l.due_date < todayDate);
  if (overdue.length) {
    for (const lo of overdue) {
      let personName = '';
      if (lo.person_id) {
        const persons = await db(auth, 'GET', 'ayna_people?id=eq.' + q(lo.person_id) + '&select=display_name');
        personName = persons.length ? ' (kişi: ' + persons[0].display_name + ')' : '';
      }
      parts.push('- [' + lo.id + '] ' + (TRLabels.loop[lo.kind] || lo.kind) + ': ' + lo.description + personName + ' (vade: ' + lo.due_date + ')');
    }
  } else {
    parts.push('- yok');
  }

  const blindSpots = await blindSpot(auth, userId);
  parts.push('## Kör nokta');
  if (blindSpots && blindSpots.length) {
    for (const bs of blindSpots) {
      parts.push('- ' + bs.display_name);
    }
  } else {
    parts.push('- yok');
  }

  const usageWarn = await dependencyFlag(auth, userId);
  parts.push('## Kullanım uyarısı');
  parts.push(usageWarn || 'yok');

  const allMoodWords = [];
  for (const e of entries) {
    if (e.mood_words && e.mood_words.length) allMoodWords.push(...e.mood_words);
  }
  const uniqueWords = [...new Set(allMoodWords)];
  parts.push('## Duygu kelime çeşitliliği');
  parts.push('Bu hafta farklı kelime: ' + uniqueWords.length);

  const beliefs = await db(auth, 'GET', 'ayna_beliefs?user_id=eq.' + q(userId) + '&status=in.(confirmed,corrected)&select=statement');
  parts.push('## Mevcut gözlemler (tekrar önerme)');
  if (beliefs.length) {
    for (const b of beliefs) {
      parts.push('- ' + b.statement);
    }
  } else {
    parts.push('- yok');
  }

  return { text: parts.join('\n') };
}

export async function monthlyPackage(auth, userId, start, end) {
  const parts = [];
  const today = localDate();

  parts.push('## Dönem: ' + start + ' \u2013 ' + end);

  const profiles = await db(auth, 'GET', 'ayna_profiles?user_id=eq.' + q(userId) + '&select=*');
  const profile = profiles[0];
  parts.push(await userModelText(auth, profile));

  async function periodMetrics(pStart, pEnd) {
    const evs = await db(auth, 'GET', 'ayna_entries?user_id=eq.' + q(userId) + '&kind=eq.evening&pleasantness=not.is.null&local_date=gte.' + pStart + '&local_date=lte.' + pEnd + '&select=pleasantness,energy,mood_words');
    const avgP = evs.length ? (evs.reduce((s, e) => s + e.pleasantness, 0) / evs.length).toFixed(1) : '\u2014';
    const avgE = evs.length ? (evs.reduce((s, e) => s + e.energy, 0) / evs.length).toFixed(1) : '\u2014';
    const eveningCount = evs.length;
    const allWords = [];
    for (const e of evs) { if (e.mood_words) allWords.push(...e.mood_words); }
    const uniqueWords = [...new Set(allWords)].length;

    const periodTrades = await db(auth, 'GET', 'ayna_trades?user_id=eq.' + q(userId) + '&local_date=gte.' + pStart + '&local_date=lte.' + pEnd + '&select=planned');
    const plannedDefined = periodTrades.filter((t) => t.planned !== null && t.planned !== undefined);
    const unplannedRatio = plannedDefined.length ? (plannedDefined.filter((t) => t.planned === false).length / plannedDefined.length).toFixed(2) : '\u2014';

    const checks = await db(auth, 'GET', 'ayna_rule_checks?user_id=eq.' + q(userId) + '&local_date=gte.' + pStart + '&local_date=lte.' + pEnd + '&select=result');
    const keptCount = checks.filter((c) => c.result === 'kept').length;
    const brokenCount = checks.filter((c) => c.result === 'broken').length;
    const ruleRatio = (keptCount + brokenCount) ? (keptCount / (keptCount + brokenCount)).toFixed(2) : '\u2014';

    const personEvents = await db(auth, 'GET', 'ayna_events?user_id=eq.' + q(userId) + '&person_id=not.is.null&local_date=gte.' + pStart + '&local_date=lte.' + pEnd + '&select=id');

    return { avgP, avgE, eveningCount, uniqueWords, unplannedRatio, ruleRatio, personEventCount: personEvents.length };
  }

  const thisMonth = await periodMetrics(start, end);

  const prev = previousMonthRange(start);
  const prevMonth = await periodMetrics(prev.start, prev.end);

  const profileCreated = profile.created_at ? profile.created_at.slice(0, 10) : today;
  const initStart = profileCreated;
  const initEnd = addDays(profileCreated, 29);
  const initMonth = await periodMetrics(initStart, initEnd);

  parts.push('## Üç sütunlu özet');
  parts.push('Metrik | Bu ay | Onceki ay | Başlangıç dönemi');
  parts.push('Ortalama hoşluk | ' + thisMonth.avgP + ' | ' + prevMonth.avgP + ' | ' + initMonth.avgP);
  parts.push('Ortalama enerji | ' + thisMonth.avgE + ' | ' + prevMonth.avgE + ' | ' + initMonth.avgE);
  parts.push('Akşam kaydı sayısı | ' + thisMonth.eveningCount + ' | ' + prevMonth.eveningCount + ' | ' + initMonth.eveningCount);
  parts.push('Farklı duygu kelimesi | ' + thisMonth.uniqueWords + ' | ' + prevMonth.uniqueWords + ' | ' + initMonth.uniqueWords);
  parts.push('Plan dışı işlem oranı | ' + thisMonth.unplannedRatio + ' | ' + prevMonth.unplannedRatio + ' | ' + initMonth.unplannedRatio);
  parts.push('Kural uyum oranı | ' + thisMonth.ruleRatio + ' | ' + prevMonth.ruleRatio + ' | ' + initMonth.ruleRatio);
  parts.push('Kişilerle olay | ' + thisMonth.personEventCount + ' | ' + prevMonth.personEventCount + ' | ' + initMonth.personEventCount);

  const lastYearStart = addDays(start, -365);
  const lastYearEnd = addDays(end, -365);
  const lyEvenings = await db(auth, 'GET', 'ayna_entries?user_id=eq.' + q(userId) + '&kind=eq.evening&local_date=gte.' + lastYearStart + '&local_date=lte.' + lastYearEnd + '&select=id');
  parts.push('## Geçen yılın aynı ayı');
  if (lyEvenings.length >= 5) {
    const lyMetrics = await periodMetrics(lastYearStart, lastYearEnd);
    parts.push('Ortalama hoşluk: ' + lyMetrics.avgP + ', enerji: ' + lyMetrics.avgE + ', akşam: ' + lyMetrics.eveningCount + ', kelime: ' + lyMetrics.uniqueWords);
  } else {
    parts.push('yeterli veri yok');
  }

  const weeklyInsights = await db(auth, 'GET', 'ayna_insights?user_id=eq.' + q(userId) + '&kind=eq.weekly&period_start=gte.' + start + '&period_start=lte.' + end + '&select=focus&order=period_start.asc');
  parts.push('## Haftalik rapor odaklari');
  if (weeklyInsights.length) {
    for (const wi of weeklyInsights) {
      parts.push('- ' + (wi.focus || '\u2014'));
    }
  } else {
    parts.push('\u2014');
  }

  const allEvents = await db(auth, 'GET', 'ayna_events?user_id=eq.' + q(userId) + '&local_date=gte.' + start + '&local_date=lte.' + end + '&is_closed=eq.false&select=id,local_date,event_type,summary,impact,person_id,emotion_words&order=local_date.asc');
  const pIds = [...new Set(allEvents.filter((e) => e.person_id).map((e) => e.person_id))];
  let pMap = {};
  if (pIds.length) {
    const ppl = await db(auth, 'GET', 'ayna_people?id=in.(' + pIds.join(',') + ')&select=id,display_name,sector,ring');
    for (const p of ppl) pMap[p.id] = p;
  }

  parts.push('## halka-basina-olay');
  if (allEvents.length) {
    const ringCount = {};
    for (const ev of allEvents) {
      const p = ev.person_id ? pMap[ev.person_id] : null;
      const ring = p ? p.ring : 3;
      ringCount[ring] = (ringCount[ring] || 0) + 1;
    }
    for (const r of [1, 2, 3]) {
      if (ringCount[r]) parts.push('Halka ' + r + ': ' + ringCount[r]);
    }
  } else {
    parts.push('\u2014');
  }

  parts.push('## en-cok-olay-5-kisi');
  if (allEvents.length) {
    const pc = {};
    for (const ev of allEvents) {
      if (ev.person_id) pc[ev.person_id] = (pc[ev.person_id] || 0) + 1;
    }
    const top5 = Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [pid, count] of top5) {
      const p = pMap[pid];
      if (p) parts.push('- ' + p.display_name + ': ' + count + ' olay');
    }
  } else {
    parts.push('\u2014');
  }

  parts.push('## dusuk-etki-3-kisi');
  if (allEvents.length) {
    const pImpacts = {};
    const pCounts = {};
    for (const ev of allEvents) {
      if (ev.person_id) {
        if (!pImpacts[ev.person_id]) pImpacts[ev.person_id] = [];
        pImpacts[ev.person_id].push(ev.impact || 0);
        pCounts[ev.person_id] = (pCounts[ev.person_id] || 0) + 1;
      }
    }
    const eligible = Object.entries(pImpacts)
      .filter(([pid]) => pCounts[pid] >= 3)
      .map(([pid, impacts]) => ({ pid, avg: impacts.reduce((a, b) => a + b, 0) / impacts.length }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 3);
    for (const { pid, avg } of eligible) {
      const p = pMap[pid];
      if (p) parts.push('- ' + p.display_name + ': ' + avg.toFixed(1));
    }
    if (!eligible.length) parts.push('\u2014');
  } else {
    parts.push('\u2014');
  }

  parts.push('## Talep ve borc olaylari');
  const requestLent = allEvents.filter((e) => e.event_type === 'request' || e.event_type === 'lent_money' || e.event_type === 'borrowed_money');
  if (requestLent.length) {
    for (const ev of requestLent) {
      const p = ev.person_id ? pMap[ev.person_id] : null;
      parts.push('- ' + (p ? p.display_name : '\u2014') + ' ' + ev.local_date + ' ' + (TRLabels.event[ev.event_type] || ev.event_type) + ': ' + ev.summary);
    }
  } else {
    parts.push('\u2014');
  }

  parts.push('## İş-okul dilimindeki olaylar');
  const workEvents = allEvents.filter((e) => e.person_id && pMap[e.person_id] && pMap[e.person_id].sector === 'work');
  if (workEvents.length) {
    for (const ev of workEvents) {
      const p = pMap[ev.person_id];
      parts.push('- ' + (p ? p.display_name : '\u2014') + ' ' + ev.local_date + ' ' + (TRLabels.event[ev.event_type] || ev.event_type) + ': ' + ev.summary);
    }
  } else {
    parts.push('\u2014');
  }

  const decisions = await db(auth, 'GET', 'ayna_decisions?user_id=eq.' + q(userId) + '&created_at=gte.' + start + 'T00:00:00Z&created_at=lte.' + end + 'T23:59:59Z&select=id,title,outcome,reviewed_at');
  parts.push('## Kararlar');
  if (decisions.length) {
    for (const d of decisions) {
      parts.push('- ' + d.title + (d.outcome ? ' (sonuçlandı)' : ' (bekliyor)'));
    }
  } else {
    parts.push('\u2014');
  }

  return { text: parts.join('\n') };
}
