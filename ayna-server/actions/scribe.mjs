import { db, q } from '../supabase.mjs';
import { callTool, modelFor } from '../anthropic.mjs';
import { localDate } from '../time.mjs';
import { logUsage } from '../limits.mjs';
import { KATIP } from '../prompts.mjs';
import { TOOLS } from '../tools.mjs';
import { send, fail } from '../http.mjs';

const KIND_TR = { morning: 'Sabah niyeti', evening: 'Akşam kapanışı', note: 'Not' };

const norm = (s) => String(s || '').toLocaleLowerCase('tr-TR').trim().replace(/\s+/g, ' ');

function truncate(s, max) {
  if (typeof s !== 'string') return s;
  return s.length > max ? s.slice(0, max) : s;
}

function clipNum(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function truncateArray(arr, maxLen, maxItem) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, maxLen).map((s) => truncate(String(s || ''), maxItem));
}

export default async function scribe({ req, res, auth, user, profile, body }) {
  const entryId = body && body.entry_id;
  if (!entryId || typeof entryId !== 'string' || entryId.length !== 36) {
    return fail(res, 400, 'bad_request');
  }
  try {
    const result = await runScribe(auth, user.id, entryId);
    await logUsage(auth, user.id, 'scribe', result);
    const reflectionKind =
      (result.importance || 0) >= 8
        ? 'instant'
        : (result.entry && result.entry.kind === 'evening')
          ? 'daily'
          : null;
    return send(res, 200, {
      ok: true,
      ...result,
      reflection_kind: reflectionKind,
      needs_reflection: reflectionKind !== null,
      pending_people_count: result.pendingCount || 0
    });
  } catch (e) {
    await logUsage(auth, user.id, 'scribe', null);
    if (e.status === 404) return fail(res, 404, 'not_found');
    return fail(res, 500, 'scribe_failed', e.message);
  }
}

export async function runScribe(auth, userId, entryId) {
  const rows = await db(auth, 'GET', `ayna_entries?id=eq.${q(entryId)}&user_id=eq.${q(userId)}&select=*`);
  if (!rows.length) {
    const err = new Error('not_found');
    err.status = 404;
    throw err;
  }
  const entry = rows[0];
  const body = String(entry.body || '').trim();
  if (!body) {
    await db(auth, 'PATCH', `ayna_entries?id=eq.${q(entryId)}`, {
      processed_at: new Date().toISOString(),
      processing_error: null
    }, 'return=minimal');
    return { skipped: true, entry, result: null, pendingCount: 0 };
  }

  let result;
  try {
    const [
      peopleRows,
      openLoopsRows,
      factsRows,
      rulesRows,
      entryPeopleRows
    ] = await Promise.all([
      db(auth, 'GET', `ayna_people?user_id=eq.${q(userId)}&status=in.(active,pending)&select=id,display_name,aliases,relation,sector,status`),
      db(auth, 'GET', `ayna_open_loops?user_id=eq.${q(userId)}&status=eq.open&select=id,person_id,kind,description`),
      db(auth, 'GET', `ayna_facts?user_id=eq.${q(userId)}&valid_to=is.null&select=id,person_id,statement,valid_from`),
      db(auth, 'GET', `ayna_rules?user_id=eq.${q(userId)}&is_active=eq.true&select=id,if_text,then_text`),
      db(auth, 'GET', `ayna_entry_people?entry_id=eq.${q(entryId)}&select=person_id`)
    ]);

    const contextPeople = peopleRows.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      aliases: p.aliases || [],
      relation: p.relation || '',
      sector: p.sector || 'other',
      status: p.status
    }));

    const contextLoops = openLoopsRows.map((l) => ({
      id: l.id,
      person_id: l.person_id,
      kind: l.kind,
      description: l.description
    }));

    const contextFacts = factsRows.map((f) => ({
      id: f.id,
      person_id: f.person_id,
      statement: f.statement,
      valid_from: f.valid_from
    }));

    const contextRules = rulesRows.map((r) => ({
      id: r.id,
      if_text: r.if_text,
      then_text: r.then_text
    }));

    const contextEntryPeople = entryPeopleRows.map((ep) => ep.person_id);

    const dynamicLines = [];
    dynamicLines.push(`Bugünün tarihi: ${localDate()}`);
    dynamicLines.push('');
    dynamicLines.push('Kişiler (id | ad | takma adlar | ilişki | alan | durum):');
    if (contextPeople.length) {
      for (const p of contextPeople) {
        dynamicLines.push(`- ${p.id} | ${p.display_name} | ${(p.aliases || []).join(', ')} | ${p.relation} | ${p.sector} | ${p.status}`);
      }
    } else {
      dynamicLines.push('- yok');
    }
    dynamicLines.push('');
    dynamicLines.push('Açık uçlar (id | kişi | tür | açıklama):');
    if (contextLoops.length) {
      for (const l of contextLoops) {
        const personName = (() => {
          const found = contextPeople.find((p) => p.id === l.person_id);
          return found ? found.display_name : '->';
        })();
        dynamicLines.push(`- ${l.id} | ${personName} | ${l.kind} | ${l.description}`);
      }
    } else {
      dynamicLines.push('- yok');
    }
    dynamicLines.push('');
    dynamicLines.push('Aktif durumlar (id | kişi | ifade | başlangıç):');
    if (contextFacts.length) {
      for (const f of contextFacts) {
        const personName = (() => {
          if (!f.person_id) return 'Kullanıcı';
          const found = contextPeople.find((p) => p.id === f.person_id);
          return found ? found.display_name : 'Kullanıcı';
        })();
        dynamicLines.push(`- ${f.id} | ${personName} | ${f.statement} | ${f.valid_from}`);
      }
    } else {
      dynamicLines.push('- yok');
    }
    dynamicLines.push('');
    dynamicLines.push('Aktif kurallar (id | eğer | o zaman):');
    if (contextRules.length) {
      for (const r of contextRules) {
        dynamicLines.push(`- ${r.id} | ${r.if_text} | ${r.then_text}`);
      }
    } else {
      dynamicLines.push('- yok');
    }

    const systemDynamic = dynamicLines.join('\n');

    const msgLines = [];
    msgLines.push(`Kayıt tarihi: ${entry.local_date}`);
    msgLines.push(`Kayıt türü: ${KIND_TR[entry.kind] || entry.kind}`);
    if (entry.pleasantness != null && entry.energy != null) {
      const mw = (entry.mood_words || []).join(', ');
      msgLines.push(`Duygu pusulası: hoşluk ${entry.pleasantness}, enerji ${entry.energy}; kelimeler: ${mw}`);
    }
    if (contextEntryPeople.length) {
      const labeled = contextEntryPeople.map((pid) => {
        const found = contextPeople.find((p) => p.id === pid);
        return found ? `${found.display_name} (${found.id})` : pid;
      });
      msgLines.push(`Etiketlenen kişiler: ${labeled.join(', ')}`);
    }
    if (entry.intention) {
      msgLines.push(`Niyet: ${entry.intention}`);
    }
    msgLines.push('Metin:');
    msgLines.push('"""');
    msgLines.push(body);
    msgLines.push('"""');

    const messages = [{ role: 'user', content: msgLines.join('\n') }];

    result = await callTool({
      model: modelFor('scribe'),
      systemStatic: KATIP,
      systemDynamic,
      messages,
      tool: TOOLS.record_extraction,
      maxTokens: 2000
    });

    const ai = result.input;

    await db(auth, 'DELETE', `ayna_events?entry_id=eq.${q(entryId)}`);
    await db(auth, 'DELETE', `ayna_facts?source_entry_id=eq.${q(entryId)}`);
    await db(auth, 'DELETE', `ayna_person_links?source_entry_id=eq.${q(entryId)}`);
    await db(auth, 'DELETE', `ayna_open_loops?source_entry_id=eq.${q(entryId)}`);
    await db(auth, 'DELETE', `ayna_rule_checks?user_id=eq.${q(userId)}&local_date=eq.${q(entry.local_date)}&source=eq.scribe`);

    const peopleContext = [...contextPeople];
    const refMap = {};

    if (Array.isArray(ai.people)) {
      for (const p of ai.people) {
        if (!p.ref || !p.name) continue;
        let resolvedId = null;
        if (p.matched_person_id) {
          const exists = peopleContext.find((cp) => cp.id === p.matched_person_id);
          if (exists) resolvedId = exists.id;
        }
        if (!resolvedId) {
          const n = norm(p.name);
          const found = peopleContext.find(
            (cp) => norm(cp.display_name) === n || (cp.aliases || []).some((a) => norm(a) === n)
          );
          if (found) resolvedId = found.id;
        }
        if (!resolvedId) {
          const newPerson = {
            user_id: userId,
            display_name: truncate(p.name, 60),
            relation: p.relation_guess || null,
            sector: p.sector_guess === 'unknown' ? 'other' : (p.sector_guess || 'other'),
            ring: 3,
            status: 'pending',
            created_by: 'scribe',
            source_entry_id: entryId
          };
          const inserted = await db(auth, 'POST', 'ayna_people', [newPerson], 'return=representation');
          if (inserted && inserted.length) {
            resolvedId = inserted[0].id;
            peopleContext.push({
              id: resolvedId,
              display_name: newPerson.display_name,
              aliases: [],
              relation: newPerson.relation,
              sector: newPerson.sector,
              status: 'pending'
            });
          }
        }
        refMap[p.ref] = resolvedId;
      }
    }

    const validPeopleIds = Object.values(refMap).filter(Boolean);

    if (Array.isArray(ai.events)) {
      const eventRows = [];
      for (const ev of ai.events) {
        const personId = ev.person_ref ? refMap[ev.person_ref] || null : null;
        const evType = [
          'support_received', 'support_given', 'request', 'lent_money', 'borrowed_money',
          'conflict', 'time_together', 'praise', 'criticism', 'promise', 'other'
        ].includes(ev.event_type) ? ev.event_type : 'other';
        const impact = clipNum(ev.impact, -2, 2);
        const words = truncateArray(ev.emotion_words || [], 5, 30);
        const summary = truncate(ev.summary || '', 300);
        if (!summary) continue;
        eventRows.push({
          user_id: userId,
          entry_id: entryId,
          person_id: personId,
          local_date: entry.local_date,
          event_type: evType,
          summary,
          emotion_words: words,
          impact
        });
      }
      if (eventRows.length) {
        await db(auth, 'POST', 'ayna_events', eventRows, 'return=minimal');
      }
    }

    if (Array.isArray(ai.open_loops_new)) {
      const loopRows = [];
      for (const ol of ai.open_loops_new) {
        const personId = ol.person_ref ? refMap[ol.person_ref] || null : null;
        const kind = [
          'i_promised', 'promised_to_me', 'i_lent', 'i_borrowed', 'waiting', 'other'
        ].includes(ol.kind) ? ol.kind : 'other';
        const description = truncate(ol.description || '', 300);
        if (!description) continue;
        const amount = typeof ol.amount === 'number' && Number.isFinite(ol.amount) ? ol.amount : null;
        const dueDate = ol.due_date && typeof ol.due_date === 'string' && ol.due_date.length === 10 ? ol.due_date : null;
        loopRows.push({
          user_id: userId,
          person_id: personId,
          kind,
          description,
          amount,
          due_date: dueDate,
          status: 'open',
          source_entry_id: entryId
        });
      }
      if (loopRows.length) {
        await db(auth, 'POST', 'ayna_open_loops', loopRows, 'return=minimal');
      }
    }

    if (Array.isArray(ai.open_loops_closed)) {
      const closedIds = ai.open_loops_closed.filter(
        (id) => typeof id === 'string' && contextLoops.some((cl) => cl.id === id)
      );
      if (closedIds.length) {
        await db(auth, 'PATCH', `ayna_open_loops?id=in.(${closedIds.map(q).join(',')})`, {
          status: 'closed',
          closed_at: new Date().toISOString()
        }, 'return=minimal');
      }
    }

    if (Array.isArray(ai.facts_new)) {
      const factRows = [];
      for (const f of ai.facts_new) {
        const personId = f.person_ref ? refMap[f.person_ref] || null : null;
        const statement = truncate(f.statement || '', 300);
        if (!statement) continue;
        const validFrom = f.valid_from && typeof f.valid_from === 'string' && f.valid_from.length === 10
          ? f.valid_from
          : entry.local_date;
        factRows.push({
          user_id: userId,
          person_id: personId,
          statement,
          valid_from: validFrom,
          source_entry_id: entryId
        });
      }
      if (factRows.length) {
        await db(auth, 'POST', 'ayna_facts', factRows, 'return=minimal');
      }
    }

    if (Array.isArray(ai.facts_ended)) {
      const endIds = ai.facts_ended
        .filter((f) => f && f.id && contextFacts.some((cf) => cf.id === f.id))
        .map((f) => f.id);
      if (endIds.length) {
        await db(auth, 'PATCH', `ayna_facts?id=in.(${endIds.map(q).join(',')})`, {
          valid_to: entry.local_date
        }, 'return=minimal');
      }
    }

    if (Array.isArray(ai.person_links)) {
      const linkRows = [];
      for (const pl of ai.person_links) {
        const aId = pl.person_a_ref ? refMap[pl.person_a_ref] : null;
        const bId = pl.person_b_ref ? refMap[pl.person_b_ref] : null;
        if (!aId || !bId || aId === bId) continue;
        const relation = truncate(pl.relation || '', 60);
        if (!relation) continue;
        linkRows.push({
          user_id: userId,
          person_a: aId,
          person_b: bId,
          relation,
          source_entry_id: entryId
        });
      }
      if (linkRows.length) {
        await db(auth, 'POST', 'ayna_person_links', linkRows, 'return=minimal');
      }
    }

    if (Array.isArray(ai.rule_checks)) {
      const ruleCheckRows = [];
      for (const rc of ai.rule_checks) {
        if (!rc.rule_id || !contextRules.some((cr) => cr.id === rc.rule_id)) continue;
        const resultVal = rc.result === 'kept' || rc.result === 'broken' ? rc.result : null;
        if (!resultVal) continue;
        ruleCheckRows.push({
          user_id: userId,
          rule_id: rc.rule_id,
          local_date: entry.local_date,
          result: resultVal,
          source: 'scribe',
          note: rc.note ? truncate(rc.note, 200) : null
        });
      }
      if (ruleCheckRows.length) {
        await db(auth, 'POST', 'ayna_rule_checks', ruleCheckRows, 'resolution=ignore-duplicates,return=minimal');
      }
    }

    const allTagged = [...new Set([...contextEntryPeople, ...validPeopleIds])];
    if (allTagged.length) {
      const tagRows = allTagged.map((pid) => ({
        entry_id: entryId,
        person_id: pid,
        user_id: userId
      }));
      await db(auth, 'POST', 'ayna_entry_people', tagRows, 'on_conflict=entry_id,person_id,resolution=ignore-duplicates,return=minimal');
    }

    const importance = clipNum(ai.importance, 1, 10);
    const summary = truncate(ai.summary || '', 300);
    const goodMoment = ai.good_moment != null ? truncate(ai.good_moment, 300) : null;

    await db(auth, 'PATCH', `ayna_entries?id=eq.${q(entryId)}`, {
      importance,
      summary,
      good_moment: goodMoment,
      processed_at: new Date().toISOString(),
      processing_error: null
    }, 'return=minimal');

    const pendingCount = peopleContext.filter((p) => p.status === 'pending').length;

    return {
      skipped: false,
      entry: { ...entry, importance, summary, good_moment: goodMoment, processed_at: new Date().toISOString(), processing_error: null },
      result: { importance, summary, good_moment: goodMoment },
      importance,
      pendingCount
    };
  } catch (e) {
    const errorMsg = truncate(e.message || 'unknown_error', 300);
    try {
      await db(auth, 'PATCH', `ayna_entries?id=eq.${q(entryId)}`, {
        processing_error: errorMsg
      }, 'return=minimal');
    } catch (_) {}
    throw e;
  }
}
