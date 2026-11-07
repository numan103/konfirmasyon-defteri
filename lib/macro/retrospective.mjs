import { hash, istanbul } from './core.mjs';
import { parseMonthlySeries } from './event-sources.mjs';
import { readSource } from './research.mjs';

const CES = 'CES0000000001';
const LNS = 'LNS14000000';
export const REAL_YIELD_URL = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_real_yield_curve&field_tdr_date_value=2026&page&_format=csv';

const pad = n => String(n).padStart(2, '0');
const round = (value, digits = 1) => Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;
const trNumber = (value, digits = 1) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
const trYield = value => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const monthName = period => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(period + '-01T12:00:00Z'));
const monthOnly = period => new Intl.DateTimeFormat('tr-TR', { month: 'long', timeZone: 'UTC' }).format(new Date(period + '-01T12:00:00Z'));
const dayName = iso => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));

function referencePeriod(now) {
  const ny = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const d = new Date(ny + 'T12:00:00Z');
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

// Treasury CSV is a fixed official file. Only the 10-year real yield column is used.
export function parseRealYieldWeek(text, now) {
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('source_yield_invalid');
  const header = lines.shift().split(',').map(value => value.replace(/"/g, '').trim());
  const column = header.indexOf('10 YR');
  if (column < 0) throw new Error('source_yield_invalid');
  const rows = lines.map(line => {
    const cells = line.split(',');
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((cells[0] || '').trim());
    if (!match || !/^\d+(?:\.\d+)?$/.test((cells[column] || '').trim())) return null;
    const value = Number(cells[column]);
    if (!Number.isFinite(value) || value <= 0 || value > 20) return null;
    return { date: `${match[3]}-${pad(match[1])}-${pad(match[2])}`, value };
  }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  if (rows.length < 2) throw new Error('source_yield_invalid');
  const latest = rows[0];
  const latestAt = Date.parse(latest.date + 'T12:00:00Z');
  if (!Number.isFinite(latestAt) || now - latestAt > 4 * 86400000) throw new Error('source_yield_stale');
  const previous = rows.find(row => {
    const at = Date.parse(row.date + 'T12:00:00Z');
    const age = latestAt - at;
    return age >= 5 * 86400000 && age <= 10 * 86400000;
  });
  if (!previous) throw new Error('source_yield_week_missing');
  return { latest, previous, change: round(latest.value - previous.value, 2), fetchedAt: null };
}

export async function collectRetrospective({ now = Date.now(), signal, read = readSource } = {}) {
  const period = referencePeriod(now);
  const year = Number(period.slice(0, 4));
  const [payrollsSource, unemploymentSource, yieldSource] = await Promise.all([
    read(`https://api.bls.gov/publicAPI/v1/timeseries/data/${CES}?startyear=${year - 1}&endyear=${year}`, signal),
    read(`https://api.bls.gov/publicAPI/v1/timeseries/data/${LNS}?startyear=${year - 1}&endyear=${year}`, signal),
    read(REAL_YIELD_URL, signal),
  ]);
  const payrolls = parseMonthlySeries(payrollsSource.text, CES, period);
  const unemployment = parseMonthlySeries(unemploymentSource.text, LNS, period);
  const yields = parseRealYieldWeek(yieldSource.text, now);
  const payrollChange = round(payrolls[0].value - payrolls[1].value, 1);
  const previousPayrollChange = payrolls[2] ? round(payrolls[1].value - payrolls[2].value, 1) : null;
  const unemploymentChange = round(unemployment[0].value - unemployment[1].value, 1);
  if (!Number.isFinite(payrollChange) || !Number.isFinite(unemployment[0].value)) throw new Error('source_release_api_invalid');
  return {
    period,
    previousPeriod: payrolls[1].period,
    payrolls: { change: payrollChange, previousChange: previousPayrollChange },
    unemployment: { value: unemployment[0].value, previous: unemployment[1].value, change: unemploymentChange },
    yields,
    cutoff: new Date(now).toISOString(),
    sources: [
      { url: payrollsSource.url, fetchedAt: payrollsSource.fetchedAt, kind: 'primary', text: payrollsSource.text, seriesId: CES, referencePeriod: period },
      { url: unemploymentSource.url, fetchedAt: unemploymentSource.fetchedAt, kind: 'primary', text: unemploymentSource.text, seriesId: LNS, referencePeriod: period },
      { url: yieldSource.url, fetchedAt: yieldSource.fetchedAt, kind: 'primary', text: yieldSource.text, instrument: 'real_yield', observedAt: yields.latest.date, previousObservedAt: yields.previous.date, currentTenYearValue: String(yields.latest.value), previousTenYearValue: String(yields.previous.value) },
    ],
  };
}

export function retrospectiveReport(data) {
  const month = monthOnly(data.period);
  const previousMonth = monthOnly(data.previousPeriod);
  const payrollLine = data.payrolls.previousChange === null
    ? `${month} ayında tarım dışı istihdam ${trNumber(data.payrolls.change)} bin arttı; önceki ay değişimi bu kesitte doğrulanamadı.`
    : `${month} ayında tarım dışı istihdam ${trNumber(data.payrolls.change)} bin arttı; ${previousMonth} ayındaki artış ${trNumber(data.payrolls.previousChange)} bin.`;
  const unemploymentLine = `İşsizlik oranı %${trNumber(data.unemployment.previous, 1)}'den %${trNumber(data.unemployment.value, 1)}'e ${data.unemployment.change < 0 ? 'geriledi' : data.unemployment.change > 0 ? 'yükseldi' : 'değişmedi'}.`;
  const yieldLine = `Aynı hafta 10 yıllık ABD reel getirisi ${dayName(data.yields.previous.date)} tarihinde %${trYield(data.yields.previous.value)} seviyesinden ${dayName(data.yields.latest.date)} tarihinde %${trYield(data.yields.latest.value)} seviyesine ${data.yields.change > 0 ? 'yükseldi' : data.yields.change < 0 ? 'geriledi' : 'yatay kaldı'}.`;
  const direction = data.yields.change > 0 && data.unemployment.change <= 0
    ? 'Güçlü istihdam ve yükselen reel faiz birlikte, faizlerin daha uzun süre yüksek kalması kanalını destekleyebilir; altında fırsat maliyeti, BTC’de finansal koşullar üzerinden baskı anlamına gelebilir.'
    : data.yields.change < 0
      ? 'Reel getirinin gerilemesi faiz baskısının hafiflediği yönünde bir okumayı destekleyebilir; ancak tek haftalık hareket ve istihdam verisi bunu kesinleştirmez.'
      : 'İstihdam ve reel getiri aynı yönde net bir sürpriz üretmedi; tek haftalık veriden kesin bir faiz veya fiyat yönü çıkarmıyorum.';
  const text = [
    'ALFA MAKRO · Geçen hafta',
    `${dayName(data.yields.previous.date)}–${dayName(data.yields.latest.date)} ${data.period.slice(0, 4)} · Türkiye saati`,
    '',
    'Geriye dönük veri değerlendirmesi; bugünkü görünüm veya yeni gelişme değildir.',
    '',
    `Haftanın makro odağında ${month} istihdam verisi vardı. Resmî BLS serisine göre ${payrollLine} ${unemploymentLine} İstihdam artışı hızlanırken işsizlik sınırlı da olsa düştü; bu, işgücü piyasasının henüz belirgin şekilde soğumadığı yönünde bir okuma.`,
    '',
    `${yieldLine} Artış ${Math.abs(data.yields.change) <= 0.05 ? 'küçük ama yön ' + (data.yields.change > 0 ? 'yukarı' : 'aşağı') : 'belirgin'}. ${direction}`,
    '',
    'Beklenti sürprizi hesaplanmadı; yalnız resmî sonuçlar ve önceki ay karşılaştırıldı. Tek haftalık veri ve sınırlı getiri hareketi kesin bir yön vermez. Fiyat tepkisi bu değerlendirmede kullanılmadı. Bu bir işlem sinyali değildir.',
  ].join('\n');
  const words = text.trim().split(/\s+/u).length;
  if (text.length > 3900 || words > 200) throw new Error('report_retro_length');
  if (/https?:\/\/|\[[A-Z]\d+\]|^[•\-]\s/m.test(text)) throw new Error('report_retro_format');
  return {
    text,
    chunks: [text],
    telegramFormat: 'retro-v1',
    reportHash: hash(text),
    cutoff: data.cutoff,
    wordCount: words,
    period: data.period,
    window: { from: data.yields.previous.date, to: data.yields.latest.date },
    sources: data.sources,
    kind: 'retrospective',
  };
}
