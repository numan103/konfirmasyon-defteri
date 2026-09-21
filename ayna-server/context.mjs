import { db, q } from './supabase.mjs';
import { localDate, addDays, formatTR } from './time.mjs';
import { KOC_TEMEL, TON } from './prompts.mjs';
import { dependencyFlag } from './metrics.mjs';

const norm = (s) => String(s || '').toLocaleLowerCase('tr-TR').trim().replace(/\s+/g, ' ');

export const TRLabels = {
  entry: { morning: 'Sabah niyeti', evening: 'Akşam kapanışı', note: 'Not' },
  sector: { family: 'Aile', friends: 'Arkadaşlar', work: 'İş / okul', other: 'Diğer' },
  ring: { 1: 'Yakın', 2: 'Güvenilir', 3: 'Tanıdık' },
  event: {
    support_received: 'Destek aldın',
    support_given: 'Destek verdin',
    request: 'Senden bir şey istendi',
    lent_money: 'Borç verdin',
    borrowed_money: 'Borç aldın',
    conflict: 'Gerginlik',
    time_together: 'Birlikte vakit',
    praise: 'Takdir',
    criticism: 'Eleştiri',
    promise: 'Söz',
    other: 'Diğer'
  },
  loop: {
    i_promised: 'Söz verdin',
    promised_to_me: 'Sana söz verildi',
    i_lent: 'Borç verdin',
    i_borrowed: 'Borç aldın',
    waiting: 'Bekleniyor',
    other: 'Diğer'
  },
  direction: { long: 'Long', short: 'Short' },
  domain: { trade: 'Trade', relationships: 'İlişkiler', spending: 'Harcama', general: 'Genel' }
};

export function kocTemel(profile) {
  const ad = profile.display_name || 'kullanıcı';
  const ton = TON[profile.coach_tone] || TON.mentor;
  return KOC_TEMEL.replace('{AD}', ad).replace('{TON}', ton);
}
export async function userModelText(auth, profile) {
  const userId = profile.user_id;
  const lines = ['## Kullanıcı modeli'];
  lines.push(`Ad: ${profile.display_name || 'belirtilmedi'}`);
  lines.push(`Bu ayın odağı: ${profile.current_focus || 'belirlenmedi'}`);

  const values = await db(auth, 'GET', `ayna_goals?user_id=eq.${q(userId)}&kind=eq.value&is_active=eq.true&select=text`);
  lines.push(`Değerler: ${values.length ? values.map((v) => v.text).join('; ') : 'yok'}`);

  const goals = await db(auth, 'GET', `ayna_goals?user_id=eq.${q(userId)}&kind=eq.goal&is_active=eq.true&select=text`);
  lines.push(`Hedefler: ${goals.length ? goals.map((g) => g.text).join('; ') : 'yok'}`);

  const rules = await db(auth, 'GET', `ayna_rules?user_id=eq.${q(userId)}&is_active=eq.true&select=id,domain,if_text,then_text`);
  const today = localDate();
  const thirtyAgo = addDays(today, -30);
  lines.push('Aktif kurallar:');
  if (rules.length) {
    for (const r of rules) {
      const checks = await db(auth, 'GET', `ayna_rule_checks?user_id=eq.${q(userId)}&rule_id=eq.${q(r.id)}&local_date=gte.${thirtyAgo}&local_date=lte.${today}&select=result`);
      const kept = checks.filter((c) => c.result === 'kept').length;
      const broken = checks.filter((c) => c.result === 'broken').length;
      const domain = TRLabels.domain[r.domain] || r.domain;
      lines.push(`- [${r.id}] Eğer ${r.if_text}, o zaman ${r.then_text} (${domain}). Son 30 gün: ${kept}/${kept + broken} uyuldu`);
    }
  } else {
    lines.push('- yok');
  }

  const beliefs = await db(auth, 'GET', `ayna_beliefs?user_id=eq.${q(userId)}&status=in.(confirmed,corrected)&select=statement,correction,status`);
  lines.push('Koçun onaylanmış gözlemleri:');
  if (beliefs.length) {
    for (const b of beliefs) {
      lines.push(`- ${b.correction || b.statement}`);
    }
  } else {
    lines.push('- yok');
  }

  return lines.join('\n');
}
export async function recentEntriesText(auth, userId, days, bodyLimit) {
  const today = localDate();
  const startDate = addDays(today, -days + 1);
  const entries = await db(auth, 'GET', `ayna_entries?user_id=eq.${q(userId)}&local_date=gte.${startDate}&local_date=lte.${today}&select=id,kind,local_date,pleasantness,energy,mood_words,sleep_hours,intention,body,summary,good_moment&order=local_date.asc`);

  if (!entries.length) return `## Son ${days} gün\n- kayıt yok`;

  const lines = [`## Son ${days} gün`];
  for (const e of entries) {
    const parts = [`[${e.id}] ${e.local_date} ${TRLabels.entry[e.kind] || e.kind}`];
    if (e.pleasantness !== null && e.pleasantness !== undefined) parts.push(`hoşluk ${e.pleasantness}`);
    if (e.energy !== null && e.energy !== undefined) parts.push(`enerji ${e.energy}`);
    if (e.mood_words && e.mood_words.length) parts.push(`kelimeler: ${e.mood_words.join(', ')}`);
    if (e.sleep_hours !== null && e.sleep_hours !== undefined) parts.push(`uyku ${e.sleep_hours}`);
    if (e.intention) parts.push(`niyet: ${e.intention}`);
    if (e.summary) parts.push(`özet: ${e.summary}`);
    if (e.good_moment) parts.push(`iyi an: ${e.good_moment}`);
    if (e.body) parts.push(`not: ${e.body.slice(0, bodyLimit)}`);
    lines.push(`- ${parts.join(' | ')}`);
  }
  return lines.join('\n');
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchInText(normMsg, name) {
  if (!name || name.length < 1) return false;
  const re = new RegExp('(^|[^\\p{L}])' + escapeRegex(name) + '([^\\p{L}]|$)', 'u');
  return re.test(normMsg);
}

async function getPersonMetrics(auth, userId, personId) {
  const today = localDate();
  const ninetyAgo = addDays(today, -89);
  const events = await db(auth, 'GET', `ayna_events?user_id=eq.${q(userId)}&person_id=eq.${q(personId)}&local_date=gte.${ninetyAgo}&local_date=lte.${today}&is_closed=eq.false&select=event_type,impact`);

  const n = events.length;
  if (!n) return `Son 90 günde olay yok`;

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
  const matchingEvenings = await db(auth, 'GET', `ayna_entries?user_id=eq.${q(userId)}&kind=eq.evening&pleasantness=not.is.null&local_date=in.(${eventDates.join(',')})&select=pleasantness`);
  const allEvenings = await db(auth, 'GET', `ayna_entries?user_id=eq.${q(userId)}&kind=eq.evening&pleasantness=not.is.null&local_date=gte.${ninetyAgo}&local_date=lte.${today}&select=pleasantness`);
  if (matchingEvenings.length >= 3 && allEvenings.length >= 3) {
    const avgMatch = matchingEvenings.reduce((s, e) => s + e.pleasantness, 0) / matchingEvenings.length;
    const avgAll = allEvenings.reduce((s, e) => s + e.pleasantness, 0) / allEvenings.length;
    moodDiff = (avgMatch - avgAll).toFixed(1);
  }

  const parts = [`Son 90 günde ${n} olay; ortalama etki ${avgImpact}`];
  parts.push(`talep oranı ${requestRatio || '—'}`);
  parts.push(`alınan/verilen ${reciprocity || '—'}`);
  parts.push(`birlikteyken ruh hali farkı ${moodDiff || '—'}`);
  return parts.join('; ');
}

export async function buildCoachContext(auth, profile, message, mode) {
  const userId = profile.user_id;
  const today = localDate();
  const parts = [];

  let userModel = await userModelText(auth, profile);
  parts.push(userModel);

  let recentText = await recentEntriesText(auth, userId, 7, 600);
  parts.push(recentText);

  const trades = await db(auth, 'GET', `ayna_trades?user_id=eq.${q(userId)}&local_date=eq.${today}&select=symbol,direction,pnl,planned,emotions&order=opened_at.asc`);
  const todayRules = await db(auth, 'GET', `ayna_rules?user_id=eq.${q(userId)}&is_active=eq.true&select=id,domain,if_text,then_text`);
  const todayChecks = await db(auth, 'GET', `ayna_rule_checks?user_id=eq.${q(userId)}&local_date=eq.${today}&select=rule_id,result`);

  let tradeSection = '## Bugünkü işlemler\n';
  if (trades.length) {
    for (const t of trades) {
      const dir = TRLabels.direction[t.direction] || t.direction || '';
      const planned = t.planned === true ? 'evet' : t.planned === false ? 'hayır' : 'bilinmiyor';
      const emotions = t.emotions && t.emotions.length ? t.emotions.join(', ') : '';
      tradeSection += `- ${t.symbol || ''} ${dir} R: ${t.pnl ?? ''} | planlı: ${planned} | duygu: ${emotions}\n`;
    }
  } else {
    tradeSection += '- işlem yok\n';
  }

  tradeSection += '## Bugünkü kural kontrolleri\n';
  if (todayRules.length) {
    for (const r of todayRules) {
      const check = todayChecks.find((c) => c.rule_id === r.id);
      let result = 'geçerli değildi';
      if (check) result = check.result === 'kept' ? 'uyuldu' : 'çiğnendi';
      tradeSection += `- Eğer ${r.if_text}, o zaman ${r.then_text}: ${result}\n`;
    }
  } else {
    tradeSection += '- kural yok\n';
  }

  if (mode === 'pre_trade') {
    const last7Trades = await db(auth, 'GET', `ayna_trades?user_id=eq.${q(userId)}&local_date=gte.${addDays(today, -7)}&local_date=lte.${today}&select=symbol,direction,pnl,planned&order=local_date.desc`);
    tradeSection += '## Son 7 günün işlemleri\n';
    if (last7Trades.length) {
      for (const t of last7Trades) {
        const dir = TRLabels.direction[t.direction] || t.direction || '';
        const planned = t.planned === true ? 'evet' : t.planned === false ? 'hayır' : 'bilinmiyor';
        tradeSection += `- ${t.symbol || ''} ${dir} R: ${t.pnl ?? ''} | planlı: ${planned}\n`;
      }
    } else {
      tradeSection += '- işlem yok\n';
    }
  }
  parts.push(tradeSection);
  const openLoops = await db(auth, 'GET', `ayna_open_loops?user_id=eq.${q(userId)}&status=eq.open&select=id,kind,description,due_date,person_id&limit=20`);
  let loopSection = '## Açık uçlar\n';
  if (openLoops.length) {
    for (const lo of openLoops.slice(0, 5)) {
      let personName = '';
      if (lo.person_id) {
        const persons = await db(auth, 'GET', `ayna_people?id=eq.${q(lo.person_id)}&select=display_name`);
        personName = persons.length ? persons[0].display_name : '';
      }
      const due = lo.due_date ? ` (vade: ${lo.due_date})` : '';
      const personPart = personName ? ` (kişi: ${personName})` : '';
      loopSection += `- [${lo.id}] ${TRLabels.loop[lo.kind] || lo.kind}: ${lo.description}${personPart}${due}\n`;
    }
  } else {
    loopSection += '- yok\n';
  }
  parts.push(loopSection);

  const facts = await db(auth, 'GET', `ayna_facts?user_id=eq.${q(userId)}&valid_to=is.null&select=id,person_id,statement,valid_from&limit=20`);
  let factsSection = '## Süren durumlar\n';
  if (facts.length) {
    const limited = facts.slice(0, 15);
    for (const f of limited) {
      let name = 'Kullanıcı';
      if (f.person_id) {
        const persons = await db(auth, 'GET', `ayna_people?id=eq.${q(f.person_id)}&select=display_name`);
        name = persons.length ? persons[0].display_name : 'Kullanıcı';
      }
      factsSection += `- [${f.id}] ${name}: ${f.statement} (başlangıç ${f.valid_from})\n`;
    }
  } else {
    factsSection += '- yok\n';
  }
  parts.push(factsSection);

  let peopleSection = '';
  const matchedPeople = [];
  if (message) {
    const normMsg = norm(message);
    const activePeople = await db(auth, 'GET', `ayna_people?user_id=eq.${q(userId)}&status=in.(active,pending)&select=id,display_name,aliases,relation,sector,ring,traits`);

    for (const p of activePeople) {
      let matched = false;
      const normName = norm(p.display_name);
      if (normName && matchInText(normMsg, normName)) {
        matched = true;
      }
      if (!matched && p.aliases) {
        for (const alias of p.aliases) {
          const normAlias = norm(alias);
          if (normAlias && normAlias.length > 3 && matchInText(normMsg, normAlias)) {
            matched = true;
            break;
          }
        }
      }
      if (matched) matchedPeople.push(p);
      if (matchedPeople.length >= 5) break;
    }
  }

  if (matchedPeople.length) {
    peopleSection = '## Mesajda geçen kişiler\n';
    for (const p of matchedPeople) {
      peopleSection += `### ${p.display_name} (${TRLabels.sector[p.sector] || p.sector}, ${TRLabels.ring[p.ring] || p.ring})\n`;
      peopleSection += `İlişki: ${p.relation || ''} | Özellikler: ${p.traits && p.traits.length ? p.traits.join(', ') : ''}\n`;

      const metrics = await getPersonMetrics(auth, userId, p.id);
      peopleSection += `Metrikler: ${metrics}\n`;

      const recentEvents = await db(auth, 'GET', `ayna_events?user_id=eq.${q(userId)}&person_id=eq.${q(p.id)}&is_closed=eq.false&select=id,entry_id,local_date,event_type,summary,impact&order=local_date.desc&limit=10`);
      if (recentEvents.length) {
        peopleSection += 'Son olaylar:\n';
        for (const ev of recentEvents) {
          peopleSection += `- [${ev.entry_id || ''}] ${ev.local_date} ${TRLabels.event[ev.event_type] || ev.event_type}: ${ev.summary} (etki ${ev.impact})\n`;
        }
      }

      const personFacts = await db(auth, 'GET', `ayna_facts?user_id=eq.${q(userId)}&person_id=eq.${q(p.id)}&valid_to=is.null&select=statement`);
      const personLoops = await db(auth, 'GET', `ayna_open_loops?user_id=eq.${q(userId)}&person_id=eq.${q(p.id)}&status=eq.open&select=kind,description`);
      const links = await db(auth, 'GET', `ayna_person_links?user_id=eq.${q(userId)}&or=(person_a.eq.${q(p.id)},person_b.eq.${q(p.id)})&select=relation,person_a,person_b`);

      const extra = [];
      if (personFacts.length) extra.push(`Süren durumlar: ${personFacts.map((f) => f.statement).join(' | ')}`);
      if (personLoops.length) extra.push(`Açık uçlar: ${personLoops.map((l) => `${TRLabels.loop[l.kind] || l.kind}: ${l.description}`).join(' | ')}`);
      if (links.length) {
        const linkTexts = [];
        for (const lk of links) {
          const otherId = lk.person_a === p.id ? lk.person_b : lk.person_a;
          const otherPersons = await db(auth, 'GET', `ayna_people?id=eq.${q(otherId)}&select=display_name`);
          const otherName = otherPersons.length ? otherPersons[0].display_name : '?';
          linkTexts.push(`${otherName} — ${lk.relation}`);
        }
        extra.push(`Bağlar: ${linkTexts.join(' | ')}`);
      }
      if (extra.length) peopleSection += extra.join('\n') + '\n';
    }
  }
  parts.push(peopleSection);
  const weeklyInsights = await db(auth, 'GET', `ayna_insights?user_id=eq.${q(userId)}&kind=eq.weekly&select=focus&order=period_start.desc&limit=1`);
  if (weeklyInsights.length && weeklyInsights[0].focus) {
    parts.push(`## Son haftalık odak: ${weeklyInsights[0].focus}`);
  }

  let fullText = parts.join('\n\n');
  if (fullText.length > 24000) {
    recentText = await recentEntriesText(auth, userId, 7, 200);
    parts[1] = recentText;
    fullText = parts.join('\n\n');
  }

  if (fullText.length > 24000 && matchedPeople.length > 3) {
    const reduced = matchedPeople.slice(0, 3);
    peopleSection = '';
    for (const p of reduced) {
      peopleSection += `### ${p.display_name} (${TRLabels.sector[p.sector] || p.sector}, ${TRLabels.ring[p.ring] || p.ring})\n`;
      peopleSection += `İlişki: ${p.relation || ''} | Özellikler: ${p.traits && p.traits.length ? p.traits.join(', ') : ''}\n`;
      const metrics = await getPersonMetrics(auth, userId, p.id);
      peopleSection += `Metrikler: ${metrics}\n`;
      const recentEvents = await db(auth, 'GET', `ayna_events?user_id=eq.${q(userId)}&person_id=eq.${q(p.id)}&is_closed=eq.false&select=id,entry_id,local_date,event_type,summary,impact&order=local_date.desc&limit=10`);
      if (recentEvents.length) {
        peopleSection += 'Son olaylar:\n';
        for (const ev of recentEvents) {
          peopleSection += `- [${ev.entry_id || ''}] ${ev.local_date} ${TRLabels.event[ev.event_type] || ev.event_type}: ${ev.summary} (etki ${ev.impact})\n`;
        }
      }
    }
    parts[5] = peopleSection;
    fullText = parts.join('\n\n');
  }

  if (fullText.length > 24000) {
    const limitedFacts = facts.slice(0, 5);
    let trimmedFacts = '## Süren durumlar\n';
    for (const f of limitedFacts) {
      let name = 'Kullanıcı';
      if (f.person_id) {
        const persons = await db(auth, 'GET', `ayna_people?id=eq.${q(f.person_id)}&select=display_name`);
        name = persons.length ? persons[0].display_name : 'Kullanıcı';
      }
      trimmedFacts += `- [${f.id}] ${name}: ${f.statement} (başlangıç ${f.valid_from})\n`;
    }
    parts[4] = trimmedFacts;
    fullText = parts.join('\n\n');
  }

  const entryIds = [...fullText.matchAll(/\[([0-9a-f-]{36})\]/g)].map((m) => m[1]);

  const history = await db(auth, 'GET', `ayna_chat_messages?user_id=eq.${q(userId)}&mode=eq.${q(mode)}&select=role,content&order=created_at.asc&limit=${mode === 'onboarding' ? 40 : 20}`);

  const usageWarning = await dependencyFlag(auth, userId);

  if (usageWarning) {
    fullText += '\n\n## Kullanım uyarısı\n' + usageWarning;
  }

  return { text: fullText, entryIds, history, usageWarning };
}
export async function buildReflectContext(auth, profile, entry) {
  const userId = profile.user_id;
  const today = localDate();
  const parts = [];

  let userModel = await userModelText(auth, profile);
  parts.push(userModel);

  let recentText = await recentEntriesText(auth, userId, 7, 400);
  parts.push(recentText);

  const entryPeople = await db(auth, 'GET', `ayna_entry_people?user_id=eq.${q(userId)}&entry_id=eq.${q(entry.id)}&select=person_id`);
  if (entryPeople.length) {
    const personIds = entryPeople.map((ep) => ep.person_id);
    const people = await db(auth, 'GET', `ayna_people?id=in.(${personIds.join(',')})&select=id,display_name`);
    const personMap = {};
    for (const p of people) personMap[p.id] = p.display_name;

    const events = await db(auth, 'GET', `ayna_events?user_id=eq.${q(userId)}&entry_id=eq.${q(entry.id)}&select=id,local_date,event_type,summary,impact,person_id`);
    if (events.length) {
      let eventsSection = '## Bu kaydın olayları\n';
      for (const ev of events) {
        const personName = ev.person_id ? (personMap[ev.person_id] || '') : '';
        eventsSection += `- [${ev.id}] ${ev.local_date} ${personName ? personName + ': ' : ''}${TRLabels.event[ev.event_type] || ev.event_type}: ${ev.summary} (etki ${ev.impact})\n`;
      }
      parts.push(eventsSection);
    }
  }

  const trades = await db(auth, 'GET', `ayna_trades?user_id=eq.${q(userId)}&local_date=eq.${entry.local_date}&select=symbol,direction,pnl,planned&order=opened_at.asc`);
  const todayRules = await db(auth, 'GET', `ayna_rules?user_id=eq.${q(userId)}&is_active=eq.true&select=id,domain,if_text,then_text`);
  const todayChecks = await db(auth, 'GET', `ayna_rule_checks?user_id=eq.${q(userId)}&local_date=eq.${entry.local_date}&select=rule_id,result`);

  let tradeSection = '';
  if (trades.length || todayRules.length) {
    tradeSection += '## Kayıt tarihindeki işlemler ve kontroller\n';
    for (const t of trades) {
      const dir = TRLabels.direction[t.direction] || t.direction || '';
      const planned = t.planned === true ? 'evet' : t.planned === false ? 'hayır' : 'bilinmiyor';
      tradeSection += `- ${t.symbol || ''} ${dir} R: ${t.pnl ?? ''} | planlı: ${planned}\n`;
    }
    for (const r of todayRules) {
      const check = todayChecks.find((c) => c.rule_id === r.id);
      let result = 'geçerli değildi';
      if (check) result = check.result === 'kept' ? 'uyuldu' : 'çiğnendi';
      tradeSection += `- Eğer ${r.if_text}, o zaman ${r.then_text}: ${result}\n`;
    }
    parts.push(tradeSection);
  }

  const openLoops = await db(auth, 'GET', `ayna_open_loops?user_id=eq.${q(userId)}&status=eq.open&select=id,kind,description,due_date,person_id&limit=5`);
  if (openLoops.length) {
    let loopSection = '## Açık uçlar\n';
    for (const lo of openLoops) {
      let personName = '';
      if (lo.person_id) {
        const persons = await db(auth, 'GET', `ayna_people?id=eq.${q(lo.person_id)}&select=display_name`);
        personName = persons.length ? persons[0].display_name : '';
      }
      const due = lo.due_date ? ` (vade: ${lo.due_date})` : '';
      const personPart = personName ? ` (kişi: ${personName})` : '';
      loopSection += `- [${lo.id}] ${TRLabels.loop[lo.kind] || lo.kind}: ${lo.description}${personPart}${due}\n`;
    }
    parts.push(loopSection);
  }

  const fullText = parts.join('\n\n');
  const entryIds = [...fullText.matchAll(/\[([0-9a-f-]{36})\]/g)].map((m) => m[1]);

  return { text: fullText, entryIds };
}

export async function validEntryIds(auth, userId, ids, start, end) {
  const uniq = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 20);
  if (!uniq.length) return [];
  let path = `ayna_entries?user_id=eq.${q(userId)}&id=in.(${uniq.join(',')})&select=id`;
  if (start) path += `&local_date=gte.${start}`;
  if (end) path += `&local_date=lte.${end}`;
  const rows = await db(auth, 'GET', path);
  const found = new Set(rows.map((r) => r.id));
  return uniq.filter((id) => found.has(id)).slice(0, 10);
}
