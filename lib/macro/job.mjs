import { randomUUID } from 'node:crypto';
import { dayKey, isDue } from './core.mjs';
import { macroStore } from './store.mjs';
import { macroTarget } from './target.mjs';
import { research, modelAvailability } from './research.mjs';
import { generateReport } from './report.mjs';
import { sendTelegram } from '../telegram.mjs';

export function macroService(deps = {}) {
  const store = deps.store || macroStore();
  const clock = deps.clock || (() => Date.now());
  const targetFor = deps.target || macroTarget;
  const collect = deps.research || research;
  const generate = deps.generate || generateReport;
  const send = deps.send || sendTelegram;
  const terminal = new Set(['sent', 'sending', 'delivery_unknown', 'delivery_failed']);
  const fresh = report => report && Date.parse(report.cutoff) <= clock() && clock() - Date.parse(report.cutoff) <= 15 * 60000;
  async function status() {
    const result = { enabled: false, target: null, storageReady: false, report: null, missing: [], errors: [] };
    for (const key of ['GROQ_API_KEY', 'TG_BOT_TOKEN', 'SUPABASE_SERVICE_ROLE', 'MACRO_CRON_SECRET']) if (!process.env[key]) result.missing.push(key);
    if (process.env.MACRO_WEB_PROVIDER === 'tavily' && !process.env.TAVILY_API_KEY) result.missing.push('TAVILY_API_KEY');
    try { result.target = (await targetFor(AbortSignal.timeout(7000))).public; } catch (e) { result.errors.push(safeError(e)); }
    try { result.model = await (deps.modelAvailability || modelAvailability)(); } catch (e) { result.errors.push(safeError(e)); }
    try {
      const settings = await store.settings();
      result.storageReady = true;
      result.enabled = settings.payload.enabled === true && process.env.MACRO_ENABLED !== '0';
      result.targetApproved = settings.payload.approvedTargetHash === result.target?.targetHash;
      result.tested = settings.payload.testedTargetHash === result.target?.targetHash;
      const row = await store.read(dayKey(new Date(clock())));
      if (row) result.report = { phase: row.payload.phase, report: row.payload.report || null, error: row.payload.error || null, delivery: row.payload.delivery || [] };
    } catch (e) { result.errors.push(safeError(e)); }
    return result;
  }
  async function prepare(signal) {
    if (!process.env.GROQ_API_KEY) throw new Error('missing_GROQ_API_KEY');
    await store.settings(); // Fail closed before spending on research if durable storage is absent.
    const day = dayKey(new Date(clock()));
    let row = await store.read(day);
    if (row && terminal.has(row.payload.phase)) return row;
    if (row?.payload.phase === 'ready' && fresh(row.payload.report)) return row;
    if (row?.payload.phase === 'researching' && row.payload.leaseUntil > clock()) throw new Error('macro_busy');
    if ((row?.payload.attempts || 0) >= 3) throw new Error('macro_attempt_limit');
    const payload = { phase: 'researching', attempts: (row?.payload.attempts || 0) + 1, owner: randomUUID(), leaseUntil: clock() + 120000 };
    row = row ? await store.save(row, payload) : await store.create(day, payload);
    if (!row) throw new Error('macro_busy');
    try {
      const evidence = await collect({ now: clock(), signal });
      const previous = await store.previous(day);
      const report = await generate(evidence, previous, signal);
      if (!fresh(report) || dayKey(new Date(clock())) !== day) throw new Error('macro_report_expired');
      return await store.save(row, { ...payload, phase: 'ready', leaseUntil: null, report });
    } catch (e) {
      await store.save(row, { ...payload, phase: 'research_failed', leaseUntil: null, error: safeError(e) }).catch(() => {});
      throw new Error(safeError(e));
    }
  }
  async function deliver(row, target, signal, test) {
    if (!fresh(row.payload.report) || row.report_date !== dayKey(new Date(clock()))) throw new Error('macro_report_expired');
    if (target.public.warning) throw new Error(target.public.warning);
    if (row.payload.phase !== 'ready') throw new Error('macro_already_claimed');
    const chunks = row.payload.report.chunks;
    if (!Array.isArray(chunks) || !chunks.length || chunks.length > 4 || chunks.some(c => typeof c !== 'string' || c.length > 3900)) throw new Error('macro_invalid_chunks');
    // Persist the sending claim BEFORE the first network effect. No timeout takeover.
    row = await store.save(row, { ...row.payload, phase: 'sending', targetHash: target.public.targetHash, test: !!test, delivery: [] });
    for (let i = 0; i < chunks.length; i++) {
      row = await store.save(row, { ...row.payload, delivery: [...row.payload.delivery, { part: i + 1, state: 'sending' }] });
      let result;
      try { result = await send((test && i === 0 ? 'TEST GÖNDERİMİ\n' : '') + chunks[i], target.chatId, target.threadId, null, { signal }); }
      catch {
        await store.save(row, { ...row.payload, phase: 'delivery_unknown', error: 'telegram_delivery_unknown' }).catch(() => {});
        throw new Error('telegram_delivery_unknown');
      }
      if (!result.ok || !result.result?.message_id) {
        const knownRejection = result.ok === false && result.http >= 400 && result.http < 500;
        await store.save(row, { ...row.payload, phase: knownRejection ? 'delivery_failed' : 'delivery_unknown', error: knownRejection ? 'telegram_rejected' : 'telegram_delivery_unknown' }).catch(() => {});
        throw new Error(knownRejection ? 'telegram_rejected' : 'telegram_delivery_unknown');
      }
      // If this acknowledgement cannot be committed, the stored 'sending' state
      // blocks EVERY subsequent automatic attempt, including following cron ticks.
      const delivery = row.payload.delivery.map((d, n) => n === i ? { ...d, state: 'sent', messageId: result.result.message_id } : d);
      row = await store.save(row, { ...row.payload, delivery });
    }
    row = await store.save(row, { ...row.payload, phase: 'sent', sentAt: new Date(clock()).toISOString() });
    if (test) {
      const settings = await store.settings();
      await store.saveSettings(settings, { ...settings.payload, testedTargetHash: target.public.targetHash, approvedTargetHash: target.public.targetHash });
    }
    return { phase: row.payload.phase, parts: chunks.length };
  }
  return {
    status,
    preview: async () => {
      const target = await targetFor(AbortSignal.timeout(7000));
      const row = await prepare(AbortSignal.timeout(42000));
      return { target: target.public, phase: row.payload.phase, report: row.payload.report || null };
    },
    testSend: async body => {
      const target = await targetFor(AbortSignal.timeout(7000));
      const row = await store.read(dayKey(new Date(clock())));
      if (body.confirmSend !== true || !row || body.reportHash !== row.payload.report?.reportHash || body.targetHash !== target.public.targetHash) throw new Error('macro_confirmation_required');
      return deliver(row, target, AbortSignal.timeout(25000), true);
    },
    setEnabled: async body => {
      const settings = await store.settings();
      if (body.enabled === false) { await store.saveSettings(settings, { ...settings.payload, enabled: false }); return { enabled: false }; }
      const target = await targetFor(AbortSignal.timeout(7000));
      if (body.confirmEnable !== true || body.targetHash !== target.public.targetHash || settings.payload.testedTargetHash !== target.public.targetHash) throw new Error('macro_test_required');
      await store.saveSettings(settings, { ...settings.payload, enabled: true, approvedTargetHash: target.public.targetHash });
      return { enabled: true };
    },
    run: async () => {
      const settings = await store.settings();
      if (settings.payload.enabled !== true || process.env.MACRO_ENABLED === '0') return { phase: 'disabled' };
      if (!isDue(new Date(clock()))) return { phase: 'outside_window' };
      const signal = AbortSignal.timeout(50000);
      const target = await targetFor(signal);
      if (settings.payload.approvedTargetHash !== target.public.targetHash || settings.payload.testedTargetHash !== target.public.targetHash) throw new Error('macro_target_not_approved');
      const row = await prepare(signal);
      if (row.payload.phase !== 'ready') return { phase: row.payload.phase };
      const latest = await store.settings();
      if (latest.payload.enabled !== true || latest.payload.approvedTargetHash !== target.public.targetHash) return { phase: 'disabled' };
      return deliver(row, target, signal, false);
    },
  };
}

export function safeError(e) {
  const code = String(e?.message || 'macro_error');
  return /^(?:macro_|report_|model_|web_|source_|telegram_|provider_|insufficient_|missing_|invalid_web_)[a-zA-Z0-9_]+$/.test(code) ? code : 'macro_error';
}
