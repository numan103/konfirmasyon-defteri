import { db, q } from '../supabase.mjs';
import { callTool } from '../llm.mjs';
import { localDate } from '../time.mjs';
import { KATIP } from '../prompts.mjs';
import { TOOLS } from '../tools.mjs';
import { send, fail } from '../http.mjs';
import { logUsage } from '../limits.mjs';
import { norm, truncate, clipNum, truncateArray } from './scribe.mjs';

// Koça yazılan mesajı katip mantığıyla yapılandırılmış bilgiye çevirir.
// entry_id yok: ayna_events.entry_id ve ayna_facts/open_loops.source_entry_id nullable,
// bu yüzden sohbetden gelen kayıtlar günlük kaydına bağlanmaz ama sistemde yaşar.
//
// Client, coach yanıtını aldıktan sonra bu action'a message_id ile bir kez istek atar.
// Böylece çıkarım, coach isteğinin süre bütçesini yemez ve mesaj başına tam bir kez çalışır.

const EVENT_TYPES = [
  'support_received', 'support_given', 'request', 'lent_money', 'borrowed_money',
  'conflict', 'time_together', 'praise', 'criticism', 'promise', 'other'
];
const LOOP_KINDS = ['i_promised', 'promised_to_me', 'i_lent', 'i_borrowed', 'waiting', 'other'];

async function buildContext(auth, userId) {
  const [peopleRows, openLoopsRows, factsRows, rulesRows] = await Promise.all([
    db(auth, 'GET', `ayna_people?user_id=eq.${q(userId)}&status=in.(active,pending)&select=id,display_name,aliases,relation,sector,status`),
    db(auth, 'GET', `ayna_open_loops?user_id=eq.${q(userId)}&status=eq.open&select=id,person_id,kind,description`),
    db(auth, 'GET', `ayna_facts?user_id=eq.${q(userId)}&valid_to=is.null&select=id,person_id,statement,valid_from`),
    db(auth, 'GET', `ayna_rules?user_id=eq.${q(userId)}&is_active=eq.true&select=id,if_text,then_text`)
  ]);

  const lines = [];
  lines.push(`Bugünün tarihi: ${localDate()}`);
  lines.push('');
  lines.push('Kişiler (id | ad | takma adlar | ilişki | alan | durum):');
  if (peopleRows.length) {
    for (const p of peopleRows) {
      lines.push(`- ${p.id} | ${p.display_name} | ${(p.aliases || []).join(', ')} | ${p.relation} | ${p.sector} | ${p.status}`);
    }
  } else {
    lines.push('- yok');
  }
  lines.push('');
  lines.push('Açık uçlar (id | kişi | tür | açıklama):');
  if (openLoopsRows.length) {
    for (const l of openLoopsRows) {
      const personName = (() => {
        const found = peopleRows.find((p) => p.id === l.person_id);
        return found ? found.display_name : '->';
      })();
      lines.push(`- ${l.id} | ${personName} | ${l.kind} | ${l.description}`);
    }
  } else {
    lines.push('- yok');
  }
  lines.push('');
  lines.push('Aktif durumlar (id | kişi | ifade | başlangıç):');
  if (factsRows.length) {
    for (const f of factsRows) {
      const personName = (() => {
        const found = peopleRows.find((p) => p.id === f.person_id);
        return found ? found.display_name : 'Kullanıcı';
      })();
      lines.push(`- ${f.id} | ${personName} | ${f.statement} | ${f.valid_from}`);
    }
  } else {
    lines.push('- yok');
  }
  lines.push('');
  lines.push('Aktif kurallar (id | eğer | o zaman):');
  if (rulesRows.length) {
    for (const r of rulesRows) lines.push(`- ${r.id} | ${r.if_text} | ${r.then_text}`);
  } else {
    lines.push('- yok');
  }

  return {
    systemDynamic: lines.join('\n'),
    people: peopleRows,
    openLoops: openLoopsRows,
    facts: factsRows,
    rules: rulesRows
  };
}

export default async function chatExtract({ res, auth, user, body }) {
  const messageId = body && body.message_id;
  if (!messageId || typeof messageId !== 'string' || messageId.length !== 36) {
    return fail(res, 400, 'bad_request');
  }
  try {
    const rows = await db(
      auth, 'GET',
      `ayna_chat_messages?id=eq.${q(messageId)}&user_id=eq.${q(user.id)}&role=eq.user&select=id,content`
    );
    if (!rows.length) return fail(res, 404, 'not_found');
    const ex = await extractFromMessage(auth, user.id, rows[0].content);
    if (ex && ex.model) {
      await logUsage(auth, user.id, 'chat-extract', ex);
    }
    return send(res, 200, { ok: true, written: ex ? ex.written : null });
  } catch (e) {
    return fail(res, 500, 'model_failed', e && e.message);
  }
}

async function extractFromMessage(auth, userId, text) {
  const message = String(text || '').trim();
  if (!message || message.length < 12) return null;

  const ctx = await buildContext(auth, userId);

  const result = await callTool({
    kind: 'scribe',
    systemStatic: KATIP,
    systemDynamic: ctx.systemDynamic,
    messages: [{ role: 'user', content: 'Metin:\n"""\n' + message + '\n"""' }],
    tool: TOOLS.record_extraction,
    maxTokens: 2000
  });

  const ai = result.input || {};
  const day = localDate();
  const refMap = {};
  const peopleContext = ctx.people.map((p) => ({ ...p, aliases: p.aliases || [] }));
  const written = { people: 0, events: 0, loops: 0, facts: 0, links: 0 };

  if (Array.isArray(ai.people)) {
    for (const p of ai.people) {
      if (!p.ref || !p.name) continue;
      let resolvedId = null;
      if (p.matched_person_id && peopleContext.some((cp) => cp.id === p.matched_person_id)) {
        resolvedId = p.matched_person_id;
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
          // created_by kontrol kısıtı yalnız user/scribe/onboarding kabul eder.
          created_by: 'scribe'
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
          written.people += 1;
        }
      }
      refMap[p.ref] = resolvedId;
    }
  }

  if (Array.isArray(ai.events)) {
    const rows = [];
    for (const ev of ai.events) {
      const personId = ev.person_ref ? refMap[ev.person_ref] || null : null;
      const summary = truncate(ev.summary || '', 300);
      if (!summary) continue;
      rows.push({
        user_id: userId,
        entry_id: null,
        person_id: personId,
        local_date: typeof ev.local_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ev.local_date) ? ev.local_date : day,
        event_type: EVENT_TYPES.includes(ev.event_type) ? ev.event_type : 'other',
        summary,
        emotion_words: truncateArray(ev.emotion_words || [], 5, 30),
        impact: clipNum(ev.impact, -2, 2)
      });
    }
    if (rows.length) {
      await db(auth, 'POST', 'ayna_events', rows, 'return=minimal');
      written.events += rows.length;
    }
  }

  if (Array.isArray(ai.open_loops_new)) {
    const rows = [];
    for (const ol of ai.open_loops_new) {
      const description = truncate(ol.description || '', 300);
      if (!description) continue;
      rows.push({
        user_id: userId,
        person_id: ol.person_ref ? refMap[ol.person_ref] || null : null,
        kind: LOOP_KINDS.includes(ol.kind) ? ol.kind : 'other',
        description,
        amount: typeof ol.amount === 'number' && Number.isFinite(ol.amount) ? ol.amount : null,
        due_date: typeof ol.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ol.due_date) ? ol.due_date : null,
        status: 'open',
        source_entry_id: null
      });
    }
    if (rows.length) {
      await db(auth, 'POST', 'ayna_open_loops', rows, 'return=minimal');
      written.loops += rows.length;
    }
  }

  if (Array.isArray(ai.open_loops_closed)) {
    const ids = ai.open_loops_closed.filter(
      (id) => typeof id === 'string' && ctx.openLoops.some((cl) => cl.id === id)
    );
    if (ids.length) {
      await db(auth, 'PATCH', `ayna_open_loops?id=in.(${ids.map(q).join(',')})`, {
        status: 'closed',
        closed_at: new Date().toISOString()
      }, 'return=minimal');
    }
  }

  if (Array.isArray(ai.facts_new)) {
    const rows = [];
    for (const f of ai.facts_new) {
      const statement = truncate(f.statement || '', 300);
      if (!statement) continue;
      rows.push({
        user_id: userId,
        person_id: f.person_ref ? refMap[f.person_ref] || null : null,
        statement,
        valid_from: typeof f.valid_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.valid_from) ? f.valid_from : day,
        source_entry_id: null
      });
    }
    if (rows.length) {
      await db(auth, 'POST', 'ayna_facts', rows, 'return=minimal');
      written.facts += rows.length;
    }
  }

  if (Array.isArray(ai.facts_ended)) {
    // facts_ended elemanları { id, valid_to } nesnesidir.
    const rows = ai.facts_ended
      .filter((f) => f && f.id && ctx.facts.some((cf) => cf.id === f.id))
      .map((f) => ({
        id: f.id,
        valid_to: typeof f.valid_to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.valid_to) ? f.valid_to : day
      }));
    if (rows.length) {
      for (const r of rows) {
        await db(auth, 'PATCH', `ayna_facts?id=eq.${q(r.id)}`, { valid_to: r.valid_to }, 'return=minimal');
      }
    }
  }

  if (Array.isArray(ai.person_links)) {
    const rows = [];
    for (const pl of ai.person_links) {
      const aId = pl.person_a_ref ? refMap[pl.person_a_ref] : null;
      const bId = pl.person_b_ref ? refMap[pl.person_b_ref] : null;
      if (!aId || !bId || aId === bId) continue;
      rows.push({
        user_id: userId,
        person_a: aId,
        person_b: bId,
        relation: truncate(pl.relation || '', 60),
        source_entry_id: null
      });
    }
    if (rows.length) {
      await db(auth, 'POST', 'ayna_person_links', rows, 'return=minimal');
      written.links += rows.length;
    }
  }

  return { written, model: result.model, provider: result.provider, usage: result.usage };
}
