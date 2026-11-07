import { hash, istanbul, publicUrl, singleTelegram, verifiedDate } from './core.mjs';
import { groq, macroModel } from './research.mjs';
import { buildReportRequest, decodeReportDraft, proseFields } from './generation.mjs';
import { analystNarrative } from './narrative.mjs';
import { morningBrief } from './event-report.mjs';
import { monthlyObservationFact } from './observations.mjs';

const STAGES = { poll: 'Anket', prediction_market: 'Tahmin piyasası', preliminary: 'Geçici sayım', projection: 'Medya projeksiyonu', certified: 'Kesinleşmiş resmi sonuç', policy: 'Politika gelişmesi', unknown: 'Doğrulanmadı' };
const parts = ['support', 'pressure', 'confirm', 'invalidate'];
const labels = ['Destek', 'Baskı', 'Doğrulama', 'Bozulma'];
const objectSchema = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const factProperties = {
  text: { type: 'string' }, sourceIds: { type: 'array', items: { type: 'string' } },
  asOf: { type: ['string', 'null'] }, eventAt: { type: ['string', 'null'] }, opinion: { type: 'boolean' },
};
const factSchema = objectSchema(factProperties);
const assetSchema = objectSchema(Object.fromEntries(parts.map(p => [p, factSchema])));
export const reportSchema = objectSchema({
  developments: { type: 'array', items: factSchema, minItems: 3, maxItems: 3 },
  channels: { type: 'array', items: factSchema, minItems: 1, maxItems: 3 },
  btc: assetSchema, gold: assetSchema,
  election: objectSchema({ ...factProperties, stage: { type: 'string', enum: Object.keys(STAGES) } }),
  eventIds: { type: 'array', items: { type: 'string' } }, missing: { type: 'array', items: { type: 'string' } },
});
const valueDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + ' (saat belirtilmedi)' : istanbul(value) + ' TSİ';
// Accept a number written in either Turkish (76.011,2) or plain (76011.2) form,
// but only if the exact value appears in the cited source text.
export function numberVariants(value) {
  const s = String(value).replace(/\s/g, '');
  const out = new Set([s]);
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  let canonical = s;
  if (comma >= 0 && dot >= 0) canonical = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (comma >= 0) canonical = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  out.add(canonical);
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) out.add(s.replace(/[.,]/g, ''));
  return out;
}
export function marketNumbers(text) {
  const months = 'Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık|January|February|March|April|May|June|July|August|September|October|November|December';
  const cleaned = String(text)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(new RegExp(`\\b\\d{1,2}\\s+(?:${months})\\s+\\d{4}\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b(?:${months})\\s+\\d{1,2},?\\s+\\d{4}\\b`, 'gi'), ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ');
  return cleaned.match(/\d+(?:[.,]\d+)*/g) || [];
}
export function validateReport(d, evidence, previous = null) {
  const map = new Map(evidence.sources.map(s => [s.id, s]));
  const used = new Set();
  const now = Date.parse(evidence.cutoff);
  const fact = f => {
    if (!f || typeof f.text !== 'string' || f.text.trim().length < 20 || f.text.length > 1800 || !Array.isArray(f.sourceIds) || !f.sourceIds.length) throw new Error('report_invalid_fact');
    if (f.eventAt && (!verifiedDate(f.eventAt) || !f.eventAt.includes('T') || Date.parse(f.eventAt) > now + 48 * 3600000)) throw new Error('report_invalid_event_time');
    if (f.sourceIds.some(id => !map.has(id))) throw new Error('report_unknown_source');
    if (/https?:\/\//i.test(f.text)) throw new Error('report_inline_url');
    const lower = f.text.toLocaleLowerCase('tr-TR');
    if (['pozisyon aç', 'riskini artır', 'riski artır', 'sabit 3r', 'zorunlu yön', 'kesin kazanç'].some(s => lower.includes(s))) throw new Error('report_trade_instruction');
    f.sourceIds.forEach(id => used.add(id));
    const numbers = marketNumbers(f.text);
    if (numbers.length) {
      // Publication time is not necessarily the observation time; never substitute it.
      const monthly=typeof f.referencePeriod==='string'&&/^\d{4}-(?:0[1-9]|1[0-2])$/.test(f.referencePeriod)&&verifiedDate(f.referencePeriod+'-01')&&Date.parse(f.referencePeriod+'-01')<=now&&f.sourceIds.every(id=>map.get(id).referencePeriod===f.referencePeriod);
      if (!monthly && (!verifiedDate(f.asOf) || Date.parse(f.asOf) > now)) throw new Error('report_undated_number');
      const raw = f.sourceIds.map(id => map.get(id).text).join(' ');
      const rawNumbers = new Set();
      for (const token of raw.match(/\d+(?:[.,]\d+)*/g) || []) for (const v of numberVariants(token)) rawNumbers.add(v);
      const bad = numbers.find(n => ![...numberVariants(n)].some(v => rawNumbers.has(v)));
      if (bad) { const err = new Error('report_unsupported_number'); err.number = bad; throw err; }
      if (/XAUUSD/i.test(f.text) && !/XAUUSD|spot gold|spot altın/i.test(raw)) throw new Error('report_wrong_gold_instrument');
    }
    const opinion = f.opinion === true || f.sourceIds.some(id => map.get(id).kind === 'opinion');
    const old = f.eventAt && Date.parse(f.eventAt) < now - 24 * 3600000;
    const stamp=numbers.length?(f.referencePeriod?(d.presentation==='morning-v2'?'':' (referans dönemi: '+f.referencePeriod+')'):' (veri: '+valueDate(f.asOf)+')'):'';
    return (old ? 'Arka plan: ' : f.eventAt && Date.parse(f.eventAt) > now ? 'İleriye dönük takip: ' : '') + (opinion ? 'Kurum görüşü: ' : '') + f.text.trim() + stamp + ' [' + f.sourceIds.join(', ') + ']';
  };
  if (!Array.isArray(d.developments) || d.developments.length !== 3 || !Array.isArray(d.channels) || d.channels.length < 1 || d.channels.length > 3) throw new Error('report_missing_sections');
  const developmentTexts = d.developments.map(f => fact(f));
  const lines = ['ALFA MAKRO ANALİST', 'Veri kesiti: ' + istanbul(evidence.cutoff) + ' Europe/Istanbul', '', '1 · Öne çıkan üç gelişme', ...developmentTexts.map(t => '• ' + t), '', '2 · Etki kanalları', ...d.channels.map(f => '• ' + fact(f))];
  if (d.etfSourceId) {
    const s = map.get(d.etfSourceId);
    let text = 'İhraççı varlık ve pay kesiti yalnız tek fonu gösterir; günlük net akış veya tüm spot ETF pazarı toplamı değildir.';
    if (s?.kind === 'secondary' && s.flowType === 'spot_btc_etf_net_flows') {
      const directions = { inflow: 'net giriş', outflow: 'net çıkış', flat: 'dengeli net akış' };
      if (!directions[s.flowDirection] || !verifiedDate(s.observedAt) || Date.parse(s.observedAt) > now) throw new Error('report_wrong_etf_source');
      text = 'Akış ölçümü ikincil tablonun fon kapsamındadır; tüm piyasa evreni veya ihraççı/ajans mutabakatı doğrulanmadı. Bugünün boş satırı sıfır akış sayılmaz.';
    } else if (s?.kind !== 'issuer') throw new Error('report_wrong_etf_source');
    lines.push('• ETF kapsamı: ' + fact({ text, sourceIds: [d.etfSourceId], asOf: null, eventAt: null }));
  }
  for (const [key, title] of [['btc', 'BTC'], ['gold', 'Spot altın · XAUUSD']]) {
    if (!d[key]) throw new Error('report_missing_asset');
    lines.push('', '3 · ' + title + (d.conditionalFramework ? ' · Koşullu çerçeve' : ''));
    parts.forEach((p, i) => lines.push('• ' + labels[i] + ': ' + fact(d[key][p])));
  }
  if (!d.election || !STAGES[d.election.stage]) throw new Error('report_election_status_missing');
  const e = d.election;
  const electionFingerprint = hash([e.stage, e.eventAt || null, [...(e.sourceIds || [])].sort().map(id => map.get(id)?.url)]);
  const newElection = e.eventAt && Number.isFinite(Date.parse(e.eventAt)) && Date.parse(e.eventAt) <= now && Date.parse(e.eventAt) >= now - 24 * 3600000 && e.sourceIds?.some(id => map.get(id)?.publishedAt && Date.parse(map.get(id).publishedAt) >= now - 24 * 3600000 && Date.parse(map.get(id).publishedAt) <= now) && electionFingerprint !== previous?.electionFingerprint;
  if (e.stage === 'certified' && !e.sourceIds?.some(id => map.get(id)?.kind === 'primary' && map.get(id)?.electionStage === 'certified' && e.scope && map.get(id)?.electionScope === e.scope)) throw new Error('report_election_not_certified');
  if (e.stage !== 'unknown' && (!e.scope || !e.sourceIds?.some(id => map.get(id)?.electionScope === e.scope && map.get(id)?.electionStage === e.stage))) throw new Error('report_election_scope_unverified');
  // Missing election coverage is a limitation of this run, not a claim backed by an
  // unrelated Fed/Treasury citation. Unknown-stage model prose is never published.
  const unknownElection = e.stage === 'unknown';
  const electionText = unknownElection ? 'Doğrulanmış yeni gelişme yok; resmi seçim sonucu kaynağı bu çalıştırmada doğrulanamadı, sonuç çıkarımı yapılmıyor.' : fact(e);
  const scopeLabel = e.scope === 'Solano County, California only' ? ' · Yalnız Solano County/California' : e.scope === 'California only' ? ' · Yalnız California' : '';
  lines.push('', 'Ara seçim · ' + STAGES[e.stage] + scopeLabel, unknownElection || newElection ? electionText : 'Durum özeti (yeni olay iddiası değil): ' + electionText);
  lines.push('', '4 · Önümüzdeki 48 saat · Türkiye saati');
  for (const id of d.recentScheduledIds || []) {
    const event = evidence.recentEvents?.find(e => e.id === id);
    if (!event || !map.has(event.sourceId) || !verifiedDate(event.at) || !event.at.includes('T') || Date.parse(event.at) > now || Date.parse(event.at) < now - 24 * 3600000) throw new Error('report_unverified_event');
    used.add(event.sourceId);
    lines.push('• Yakın takvim: ' + istanbul(event.at) + ' TSİ — ' + event.title + ' için resmî planlanan saat; tek başına gerçekleşmiş yayın teyidi değildir. [' + event.sourceId + ']');
  }
  const ids = Array.isArray(d.eventIds) ? d.eventIds : [];
  if (ids.length > 5 || ids.some(id => !evidence.events.some(e => e.id === id))) throw new Error('report_unverified_event');
  const events = ids.map(id => evidence.events.find(e => e.id === id));
  for (const event of events) {
    if (!map.has(event.sourceId) || !verifiedDate(event.at) || !event.at.includes('T') || Date.parse(event.at) < now || Date.parse(event.at) > now + 48 * 3600000) throw new Error('report_unverified_event');
    used.add(event.sourceId);
    lines.push('• ' + istanbul(event.at) + ' TSİ — ' + event.title + ' [' + event.sourceId + ']');
  }
  if (!events.length) lines.push('• Kesin saati doğrulanmış kritik olay bulunamadı; bu, takvimin risksiz olduğu anlamına gelmez.');
  lines.push('• Takvim kapsamı: resmî BLS/BEA; diğer saatler doğrulanmadı.');
  if (!Array.isArray(d.missing) || d.missing.some(s => typeof s !== 'string' || s.length > 250 || /https?:|\d/.test(s))) throw new Error('report_invalid_missing');
  const disclosures = Array.isArray(evidence.disclosures) ? evidence.disclosures.filter(s => typeof s === 'string' && s.length <= 250 && !/https?:|\d/.test(s)) : [];
  const missing = [...new Set([...disclosures, ...d.missing, ...(evidence.calendarFailures.length ? ['resmi takvim erişiminde eksik kapsam'] : [])])];
  lines.push('', 'Eksikler: ' + missing.join('; ') + '.', 'Makro bağlam teknik giriş sinyali değildir. Fiyat tepkisi tek başına nedensellik kanıtı değildir.');
  if (used.size < 3 || used.size > 6) throw new Error('report_source_count');
  const sources = [...used].map(id => map.get(id));
  if (!sources.every(s => publicUrl(s.url))) throw new Error('report_invalid_url');
  lines.push('', '5 · Kaynaklar');
  sources.forEach(s => lines.push('[' + s.id + '] ' + s.title + (s.observedAt ? ' · veri: ' + valueDate(s.observedAt) : s.updatedAt ? ' · güncelleme: ' + valueDate(s.updatedAt) : s.publishedAt ? ' · yayın: ' + valueDate(s.publishedAt) : s.referencePeriod ? ' · referans dönemi: ' + s.referencePeriod + ' (yayın saati doğrulanmadı)' : ' · yayın zamanı belirtilmemiş') + '\n' + s.url));
  const brief = d.presentation === 'morning-v2';
  const narrative = d.presentation === 'analyst-v1' || brief;
  const cleanDevelopments = developmentTexts.map((text, i) => {
    const citation = ' [' + d.developments[i].sourceIds.join(', ') + ']';
    return text.slice(0, -citation.length).replace(/^Veri kesiti: /, '').replace(/^Hazine’nin /, '').replace(/^Farside’ın /, 'Fon akışlarının ').replace(/\b\d{4}-\d{2}-\d{2}\b/g, value => verifiedDate(value) ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : value);
  });
  const morning = brief ? morningBrief({ cutoff:evidence.cutoff,developments:cleanDevelopments,sources,events,freshNewsCount:evidence.freshNewsCount,previous,observationFacts:d.observationFacts===true }) : null;
  const text = brief ? morning.text : narrative ? analystNarrative({ cutoff: evidence.cutoff, developments: cleanDevelopments, sources, events, electionStage: e.stage, freshNewsCount: evidence.freshNewsCount }) : lines.join('\n');
  const minWords=brief?(morning.quiet?50:120):350, maxWords=brief?(morning.quiet?120:200):550;
  const plainWords = text.trim().split(/\s+/u).length;
  if (plainWords < minWords || plainWords > maxWords) { const e = new Error('report_word_limit'); e.wordCount = plainWords; throw e; }
  const telegram = singleTelegram(text, narrative ? [] : sources);
  const wordCount = telegram.text.trim().split(/\s+/u).length;
  if (wordCount < minWords || wordCount > maxWords) { const e = new Error('report_word_limit'); e.wordCount = wordCount; throw e; }
  return { text, wordCount, chunks: [telegram.text], telegramFormat: narrative ? 'narrative-v1' : 'single-v1', ...(morning?{outlook:morning.outlook,format:morning.quiet?'quiet-morning-v1':'morning-v2'}:{}), telegramEntities: telegram.entities, reportHash: hash(text), cutoff: evidence.cutoff, sources, disclosures: missing, electionFingerprint, electionSummary: unknownElection ? electionText : e.text, research: { provider: evidence.provider, freshCount: evidence.freshCount, freshNewsCount: evidence.freshNewsCount ?? null, fetchedAt: evidence.cutoff } };
}

export async function generateReport(evidence, previous, signal, deps = {}) {
  const presentation=deps.presentation||'morning-v2';
  const request = buildReportRequest(evidence, previous);
  if(presentation==='morning-v2'&&proseFields.every(key=>request.bindings[key].length===1&&monthlyObservationFact(request.bindings[key][0]))) {
    try {
      const report=validateReport(decodeReportDraft(null,request,evidence,{presentation,useObservations:true}),evidence,previous);
      return {...report,research:{...report.research,model:null,generation:'verified-observations-v1'}};
    }catch(e){e.diagnostic={format:'verified-observations-v1',draft:null,evidence,failure:e.message,wordCount:e.wordCount??null};throw e;}
  }
  if(deps.requireObservations)throw new Error('source_structured_observations_missing');
  // Measure the actual server-owned headers, disclosures and source URLs before
  // asking for prose. This never relaxes the final 350–550-word gate.
  const sample = 'Kaynaklara dayalı geçici ölçüm paragrafıdır.';
  const probe = proseFields.map(k => '[' + k + '] ' + sample).join('\n');
  let measured;
  try { measured = validateReport(decodeReportDraft(probe, request, evidence, { presentation }), evidence, previous).wordCount; }
  catch (e) { if (e.message !== 'report_word_limit') throw e; measured = e.wordCount; }
  const overhead = measured - proseFields.length * sample.split(/\s+/u).length;
  const budget = (presentation==='morning-v2'?175:390) - overhead;
  if (budget < proseFields.length * 8) throw new Error('report_word_budget');
  request.messages[0].content += `\nBütün paragraf metinlerinin toplamı yaklaşık ${budget} kelime; paragraf başına yaklaşık ${Math.round(budget / proseFields.length)} kelime olsun. Bu bütçeye etiketler dahil değildir.`;
  request.messages[0].content += '\nAkıcı bir analist yazısının girişini oluşturacak iki doğal cümle grubu yaz. API, veri temin yeri, kaynak künyesi ve metodoloji anlatma; doğrudan neyin değiştiğini ve veri dönemini niteliksel olarak özetle. Kurum adı ancak gelişmenin doğrudan öznesiyse kullanılsın; kaynak gösterme amacıyla eklenmesin. Madde veya ek başlık kullanma.';
  let wire;
  try {
    wire = await (deps.complete || groq)(request.messages, { signal, tokens: 3000, format: 'text' });
  } catch (e) {
    if (e.rejectedDraft) e.diagnostic = { format: 'flat-v1', draft: e.rejectedDraft, evidence, failure: e.message };
    throw e;
  }
  let d;
  try {
    d = decodeReportDraft(wire, request, evidence, { presentation });
    const report = validateReport(d, evidence, previous);
    return { ...report, research: { ...report.research, model: macroModel(), generation: 'prose-v5' } };
  } catch (e) {
    e.diagnostic = { format: 'prose-v5', draft: wire, evidence, failure: e.message, wordCount:e.wordCount??null };
    const describe = f => ({ type: typeof f, length: typeof f?.text === 'string' ? f.text.trim().length : null, sources: f?.sourceIds, asOf: f?.asOf, eventAt: f?.eventAt });
    e.shape = d && typeof d === 'object' ? { keys: Object.keys(d).slice(0, 12), developments: Array.isArray(d.developments) ? d.developments.map(describe) : typeof d.developments, channels: Array.isArray(d.channels) ? d.channels.map(describe) : typeof d.channels, btc: Object.fromEntries(parts.map(p => [p, describe(d.btc?.[p])])), gold: Object.fromEntries(parts.map(p => [p, describe(d.gold?.[p])])) } : null;
    throw e;
  }
}
