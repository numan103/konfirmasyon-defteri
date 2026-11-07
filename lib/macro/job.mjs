import { randomUUID } from 'node:crypto';
import { dayKey, hash, isDue, singleTelegram, verifiedDate } from './core.mjs';
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
    try { result.target = (await targetFor(AbortSignal.timeout(7000))).public; } catch (e) { result.errors.push(safeError(e)); }
    try { result.model = await (deps.modelAvailability || modelAvailability)(); } catch (e) { result.errors.push(safeError(e)); }
    try {
      const settings = await store.settings();
      result.storageReady = true;
      result.enabled = settings.payload.enabled === true && process.env.MACRO_ENABLED !== '0';
      result.targetApproved = settings.payload.approvedTargetHash === result.target?.targetHash;
      result.tested = settings.payload.testedTargetHash === result.target?.targetHash;
      const topicKey = dayKey(new Date(clock())) + ':' + result.target?.targetHash;
      const topicCopy = settings.payload.topicCopies?.[topicKey];
      if (topicCopy) result.topicCopy = { phase: topicCopy.phase, sourceCutoff: topicCopy.sourceCutoff, sentAt: topicCopy.sentAt || null, hasMessageId: !!topicCopy.messageId };
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
    const payload = { phase: 'researching', attempts: (row?.payload.attempts || 0) + 1, owner: randomUUID(), leaseUntil: clock() + 120000,
      ...(row?.payload.rejectedReport ? { rejectedReport: row.payload.rejectedReport, reviewReason: row.payload.reviewReason || null } : {}),
      ...(row?.payload.earlierRejectedReport ? { earlierRejectedReport: row.payload.earlierRejectedReport } : {}),
      ...(row?.payload.rejectedReportHistory ? { rejectedReportHistory: row.payload.rejectedReportHistory } : {}),
      ...(row?.payload.maintenanceReason ? { maintenanceReason: row.payload.maintenanceReason, previousAttempts: row.payload.previousAttempts ?? null } : {}),
      ...(row?.payload.preModelRefund ? { preModelRefund: true, preModelRefundReason: row.payload.preModelRefundReason } : {}),
    };
    row = row ? await store.save(row, payload) : await store.create(day, payload);
    if (!row) throw new Error('macro_busy');
    try {
      const evidence = await collect({ now: clock(), signal });
      const previous = await store.previous(day);
      const report = await generate(evidence, previous, signal);
      if (!fresh(report) || dayKey(new Date(clock())) !== day) throw new Error('macro_report_expired');
      return await store.save(row, { ...payload, phase: 'ready', leaseUntil: null, report });
    } catch (e) {
      await store.save(row, { ...payload, phase: 'research_failed', leaseUntil: null, error: safeError(e), ...(e.diagnostic ? { diagnostic: e.diagnostic } : {}) }).catch(() => {});
      const wrapped = new Error(safeError(e));
      wrapped.number = e?.number || null;
      wrapped.stats = e?.stats || null;
      wrapped.shape = e?.shape || null;
      wrapped.provider = e?.provider || null;
      throw wrapped;
    }
  }
  async function deliver(row, target, signal, test) {
    if (!fresh(row.payload.report) || row.report_date !== dayKey(new Date(clock()))) throw new Error('macro_report_expired');
    if (target.public.warning) throw new Error(target.public.warning);
    if (row.payload.phase !== 'ready') throw new Error('macro_already_claimed');
    const chunks = row.payload.report.chunks;
    if (!Array.isArray(chunks) || chunks.length !== 1 || chunks.some(c => typeof c !== 'string' || c.length > 3900)) throw new Error('macro_invalid_chunks');
    let entities;
    if (['single-v1', 'narrative-v1'].includes(row.payload.report.telegramFormat)) {
      const verified = singleTelegram(row.payload.report.text, row.payload.report.telegramFormat === 'narrative-v1' ? [] : row.payload.report.sources);
      if (chunks.length !== 1 || chunks[0] !== verified.text) throw new Error('macro_invalid_chunks');
      entities = verified.entities;
    }
    // Persist the sending claim BEFORE the first network effect. No timeout takeover.
    row = await store.save(row, { ...row.payload, phase: 'sending', targetHash: target.public.targetHash, test: !!test, delivery: [] });
    for (let i = 0; i < chunks.length; i++) {
      row = await store.save(row, { ...row.payload, delivery: [...row.payload.delivery, { part: i + 1, state: 'sending' }] });
      let result;
      const prefix = test && i === 0 ? 'TEST GÖNDERİMİ\n' : '';
      const messageEntities = entities?.map(e => ({ ...e, offset: e.offset + prefix.length }));
      try { result = await send(prefix + chunks[i], target.chatId, target.threadId, null, { signal, ...(messageEntities ? { entities: messageEntities } : {}) }); }
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
    failureDiagnostic: async () => {
      const row = await store.read(dayKey(new Date(clock())));
      return { phase: row?.payload.phase || null, diagnostic: row?.payload.phase === 'research_failed' ? row.payload.diagnostic || null : null };
    },
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
    // Explicit user-requested copy of TODAY'S already delivered report into a
    // DIFFERENT topic. Not research, not a freshness fallback, not a daily reset.
    // Independent durable claim prevents retries after uncertain delivery.
    testTopicCopy: async body => {
      const target = await targetFor(AbortSignal.timeout(7000));
      const day = dayKey(new Date(clock()));
      const row = await store.read(day);
      const report = row?.payload.report;
      if (body.confirmSend !== true || body.confirmArchivedCopy !== true || !report || body.targetHash !== target.public.targetHash || body.reportHash !== report.reportHash) throw new Error('macro_confirmation_required');
      if (target.public.warning) throw new Error(target.public.warning);
      if (!target.threadId || row?.report_date !== day || row.payload.phase !== 'sent' || row.payload.targetHash === target.public.targetHash) throw new Error('macro_topic_copy_not_allowed');
      if (!verifiedDate(report.cutoff) || Date.parse(report.cutoff) > clock() || dayKey(new Date(report.cutoff)) !== day || hash(report.text) !== report.reportHash) throw new Error('macro_report_expired');
      const message = singleTelegram(report.text, report.telegramFormat === 'narrative-v1' ? [] : report.sources);
      const prefix = 'KONU TESTİ · Bugünkü raporun kopyası; özgün veri saati korunmuştur.\n';
      if (prefix.length + message.text.length > 3900) throw new Error('macro_invalid_chunks');
      const key = day + ':' + target.public.targetHash;
      let settings = await store.settings();
      if (settings.payload.topicCopies?.[key]) throw new Error('macro_already_claimed');
      const claim = { phase: 'sending', reportHash: report.reportHash, sourceCutoff: report.cutoff, targetHash: target.public.targetHash, startedAt: new Date(clock()).toISOString() };
      settings = await store.saveSettings(settings, { ...settings.payload, topicCopies: { ...settings.payload.topicCopies, [key]: claim } });
      let result;
      try { result = await send(prefix + message.text, target.chatId, target.threadId, null, { signal: AbortSignal.timeout(20000), entities: message.entities.map(e => ({ ...e, offset: e.offset + prefix.length })) }); }
      catch {
        await store.saveSettings(settings, { ...settings.payload, topicCopies: { ...settings.payload.topicCopies, [key]: { ...claim, phase: 'delivery_unknown' } } }).catch(() => {});
        throw new Error('telegram_delivery_unknown');
      }
      if (!result.ok || !result.result?.message_id) {
        const known = result.ok === false && result.http >= 400 && result.http < 500;
        await store.saveSettings(settings, { ...settings.payload, topicCopies: { ...settings.payload.topicCopies, [key]: { ...claim, phase: known ? 'delivery_failed' : 'delivery_unknown' } } }).catch(() => {});
        throw new Error(known ? 'telegram_rejected' : 'telegram_delivery_unknown');
      }
      await store.saveSettings(settings, { ...settings.payload, testedTargetHash: target.public.targetHash, approvedTargetHash: target.public.targetHash,
        topicCopies: { ...settings.payload.topicCopies, [key]: { ...claim, phase: 'sent', sentAt: new Date(clock()).toISOString(), messageId: result.result.message_id } } });
      return { phase: 'sent', parts: 1, archivedCopy: true, cutoff: report.cutoff };
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
