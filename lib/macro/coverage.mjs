import { hash, verifiedDate, zonedUTC } from './core.mjs';

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const plain = value => String(value || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const pad = n => String(n).padStart(2, '0');

function englishDay(value) {
  const m = String(value).trim().match(/^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;
  const month = months.findIndex(v => v === m[1].toLowerCase() || v.slice(0, 3) === m[1].toLowerCase());
  return month < 0 ? null : verifiedDate(`${m[3]}-${pad(month + 1)}-${pad(m[2])}`);
}

// Only the official table and its explicitly stated Eastern Time are accepted.
// All-day holidays have no verified clock and therefore cannot become events.
export function parseBlsCalendarHTML(html, sourceId, now) {
  if (!/All times on calendar are Eastern Time/i.test(plain(html))) throw new Error('source_calendar_timezone_missing');
  const table = String(html).match(/<table\b[^>]*class=["'][^"']*\brelease-list\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) throw new Error('source_calendar_table_missing');
  const entries = [];
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => plain(m[1]));
    if (cells.length !== 3) continue;
    const day = englishDay(cells[0]);
    const time = cells[1].match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!day || !time || !cells[2] || +time[1] < 1 || +time[1] > 12 || +time[2] > 59) continue;
    const hour = (+time[1] % 12) + (time[3].toUpperCase() === 'PM' ? 12 : 0);
    const at = zonedUTC(day.replace(/-/g, '') + 'T' + pad(hour) + time[2] + '00', 'America/New_York');
    if (!at || Date.parse(at) < now - 24 * 3600000 || Date.parse(at) > now + 48 * 3600000) continue;
    entries.push({ id: hash([sourceId, at, cells[2]]).slice(0, 12), sourceId, title: cells[2], at });
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

// The publisher's separate month-view page is another official representation,
// not a proxy or inferred recurring schedule. Header, civil day and timezone bind.
export function parseBlsMonthCalendar(html, sourceId, now, yearMonth) {
  const [year,month]=yearMonth.split('-').map(Number);
  if(!Number.isInteger(year)||month<1||month>12||!/All times on calendar are Eastern Time/i.test(plain(html)))throw new Error('source_calendar_timezone_missing');
  if(!new RegExp('<h1[^>]*>\\s*'+months[month-1]+'\\s+'+year+'\\s*</h1>','i').test(html))throw new Error('source_calendar_month_mismatch');
  const table=String(html).match(/<table\b[^>]*class=["'][^"']*\brelease-calendar\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if(!table)throw new Error('source_calendar_table_missing');
  const entries=[];
  for(const cell of table.matchAll(/<td\b[^>]*\bid=["']d(\d{2})(\d{2})["'][^>]*>([\s\S]*?)<\/td>/gi)) {
    const m=Number(cell[1]),d=Number(cell[2]);
    if(m!==month&&m!==(month%12)+1)continue;
    const y=year+(month===12&&m===1?1:0),day=verifiedDate(`${y}-${pad(m)}-${pad(d)}`);
    if(!day||Number(plain(cell[3].match(/<p\b[^>]*class=["']day["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]))!==d)continue;
    for(const p of cell[3].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
      const title=plain(p[1].match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1]);
      const time=plain(p[1]).match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
      if(!title||!time||+time[1]<1||+time[1]>12||+time[2]>59)continue;
      const at=zonedUTC(day.replace(/-/g,'')+'T'+pad((+time[1]%12)+(time[3].toUpperCase()==='PM'?12:0))+time[2]+'00','America/New_York');
      if(at&&Date.parse(at)>=now-86400000&&Date.parse(at)<=now+48*3600000)entries.push({id:hash([sourceId,at,title]).slice(0,12),sourceId,title,at});
    }
  }
  return entries.sort((a,b)=>a.at.localeCompare(b.at));
}

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  const s = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      if (quoted && s[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('source_csv_unclosed_quote');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseIbitHoldings(text, now) {
  const rows = parseCSV(text);
  if (!rows.some(r => /iShares Bitcoin Trust ETF/i.test(r[0]))) throw new Error('source_issuer_identity_missing');
  const day = englishDay(rows.find(r => /^Fund Holdings as of$/i.test(r[0]))?.[1]);
  if (!day || Date.parse(day) > now) throw new Error('source_issuer_date_invalid');
  const shares = rows.find(r => /^Shares Outstanding$/i.test(r[0]))?.[1];
  const headerAt = rows.findIndex(r => r[0] === 'Ticker' && r.includes('Quantity'));
  const quantityAt = rows[headerAt]?.indexOf('Quantity');
  const btc = headerAt < 0 ? null : rows.slice(headerAt + 1).find(r => r[0] === 'BTC' && r[1] === 'BITCOIN');
  const number = value => /^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/.test(value || '') && Number.isFinite(Number(value.replace(/,/g, ''))) && Number(value.replace(/,/g, '')) > 0;
  if (!number(shares) || !number(btc?.[quantityAt])) throw new Error('source_issuer_values_invalid');
  return { asOf: day, sharesOutstanding: shares, bitcoinQuantity: btc[quantityAt], kind: 'holdings_not_flows', scope: 'IBIT only' };
}

// An unofficial STATE result page cannot certify nationwide Congressional control.
// Links mentioning certified candidates or a future certification date do not count.
export function parseCaliforniaStage(html, now = Date.now()) {
  const body = plain(String(html).replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, ' '));
  if (/Request unsuccessful|Incapsula incident ID|Access Denied/i.test(body)) throw new Error('source_access_challenge');
  if (now < Date.parse('2026-11-03') || !/November\s+3,\s+2026/i.test(body) || !/California/i.test(body) || !/Unofficial Election Results/i.test(body) || !/Secretary of State/i.test(body)) throw new Error('source_election_stage_unverified');
  return { stage: 'preliminary', scope: 'California only', text: 'California resmî seçim sayfası sonuçları geçici olarak etiketliyor; bu eyalet kapsamı ülke geneli Kongre kontrolünü veya kesinleşmiş sonucu kanıtlamaz.' };
}

export function parseSolanoStage(html, now = Date.now()) {
  const body = plain(String(html).replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, ' '));
  if (now < Date.parse('2026-11-03') || !/Solano County/i.test(body) || !/November\s+3,\s+2026/i.test(body) || !/Unofficial Election Results/i.test(body)) throw new Error('source_election_stage_unverified');
  const updated = body.match(new RegExp(`Last updated:\\s*((?:${months.join('|')})\\s+\\d{1,2},\\s*\\d{4})`, 'i'));
  const updatedAt = updated ? englishDay(updated[1]) : null;
  if (updated && (!updatedAt || Date.parse(updatedAt) > now || Date.parse(updatedAt) < Date.parse('2026-11-03'))) throw new Error('source_election_date_invalid');
  return { stage: 'preliminary', scope: 'Solano County, California only', updatedAt,
    text: 'Solano County (California) resmî sayım sayfası geçici sonuçlar yayımlıyor; bu yerel kesit ulusal Kongre kontrolünü veya ülke geneli kesinleşmeyi kanıtlamaz.' };
}

export function previousNewYorkWeekday(now) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const d = new Date(day + 'T12:00:00Z');
  do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

export function parseFarsideFlows(html, now) {
  if (!/Bitcoin ETF Flow\s*\(US\$m\)/i.test(plain(html))) throw new Error('source_flow_identity_missing');
  const expectedDay = previousNewYorkWeekday(now);
  const number = value => {
    const s = value.trim();
    const parenthesized = s.startsWith('(') && s.endsWith(')');
    const magnitude = parenthesized ? s.slice(1, -1) : s.replace(/^-/, '');
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(magnitude)) return null;
    return (parenthesized || s.startsWith('-') ? -1 : 1) * Number(magnitude.replace(/,/g, ''));
  };
  for (const table of String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => plain(m[1])));
    const header = rows.find(r => r.includes('IBIT') && r.includes('FBTC') && r.includes('GBTC'));
    if (!header || header.length < 5 || !rows.some(r => r[r.length - 1] === 'Total')) continue;
    const candidates = rows.map(r => {
      const m = r[0]?.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
      return { row: r, day: m ? englishDay(`${m[2]} ${m[1]}, ${m[3]}`) : null };
    }).filter(r => r.day && r.day <= expectedDay).sort((a, b) => b.day.localeCompare(a.day));
    if (!candidates.length || candidates[0].day !== expectedDay) throw new Error('source_flow_not_latest_weekday');
    if (candidates.filter(r => r.day === expectedDay).length !== 1) throw new Error('source_flow_duplicate_day');
    const latest = candidates[0];
    if (latest.row.length !== header.length) throw new Error('source_flow_columns_changed');
    const values = latest.row.slice(1).map(number);
    // A dash is unknown, not zero. Never fall back to an older completed row.
    if (values.some(v => v === null || !Number.isFinite(v))) throw new Error('source_flow_latest_incomplete');
    const total = values[values.length - 1];
    const funds = values.slice(0, -1);
    if (Math.abs(funds.reduce((s, v) => s + v, 0) - total) > (funds.length + 1) * .051) throw new Error('source_flow_total_mismatch');
    return { asOf: latest.day, totalUSDM: total, direction: total < 0 ? 'outflow' : total > 0 ? 'inflow' : 'flat', kind: 'third_party_net_flows', scope: 'Farside table constituents', fundCount: funds.length };
  }
  throw new Error('source_flow_table_missing');
}

export async function collectCoverage({ now, signal, readSource }) {
  const sources = [], attempts = [];
  let election = null, etf = null, etfFlows = null;
  const get = async (name, url, consume) => {
    try { const p = await readSource(url, signal); return consume(p); }
    catch (e) { attempts.push({ stage: 'coverage', host: new URL(url).hostname, name, error: e.message, status: e.status || null }); return null; }
  };
  await Promise.all([
    (async () => { await get('California', 'https://electionresults.sos.ca.gov/', p => {
      const parsed = parseCaliforniaStage(p.text, now);
      const id = 'coverage-election-ca';
      sources.push({ id, url: p.url, title: 'California resmî geçici seçim sonuçları (yalnız eyalet kapsamı)', kind: 'primary', electionStage: parsed.stage, electionScope: parsed.scope, publishedAt: null, fetchedAt: p.fetchedAt, text: plain(p.text).slice(0, 12000) });
      election = { text: parsed.text, stage: parsed.stage, scope: parsed.scope, sourceIds: [id], asOf: null, eventAt: null, opinion: false };
    });
      if (!election) await get('Solano County', 'https://www.solanocounty.gov/unofficial-election-results', p => {
        const parsed = parseSolanoStage(p.text, now);
        const id = 'coverage-election-solano';
        sources.push({ id, url: p.url, title: 'Solano County resmî geçici sayımı (yalnız yerel kapsam)', kind: 'primary', electionStage: parsed.stage, electionScope: parsed.scope, publishedAt: null, updatedAt: parsed.updatedAt, fetchedAt: p.fetchedAt, text: plain(p.text).slice(0, 12000) });
        election = { text: parsed.text, stage: parsed.stage, scope: parsed.scope, sourceIds: [id], asOf: null, eventAt: null, opinion: false };
      });
    })(),
    get('IBIT', 'https://www.ishares.com/us/products/333011/ishares-bitcoin-trust-etf/latest-holdings.csv', p => {
      const parsed = parseIbitHoldings(p.text, now);
      const id = 'coverage-ibit';
      sources.push({ id, url: p.url, title: 'IBIT ihraççı varlık/pay kesiti — net akış değildir', kind: 'issuer', publishedAt: null, observedAt: parsed.asOf, fetchedAt: p.fetchedAt,
        text: `İhraççı IBIT varlık kesiti ${parsed.asOf}: BTC miktarı ${parsed.bitcoinQuantity}; dolaşımdaki pay adedi ${parsed.sharesOutstanding}. Tek fonun varlık/pay görüntüsüdür; günlük net giriş/çıkış veya tüm ETF piyasası toplamı değildir.` });
      etf = { ...parsed, sourceId: id };
    }),
    get('Farside', 'https://farside.co.uk/btc/', p => {
      const parsed = parseFarsideFlows(p.text, now);
      const id = 'coverage-etf-flows';
      sources.push({ id, url: p.url, title: 'Farside BTC ETF akış tablosu — ikincil kaynak', kind: 'secondary', flowType: 'spot_btc_etf_net_flows', flowDirection: parsed.direction, publishedAt: null, observedAt: parsed.asOf, fetchedAt: p.fetchedAt,
        text: `Farside tablosunun kapsadığı fonların ${parsed.asOf} günlük net akış toplamı: ${parsed.totalUSDM} milyon ABD doları. Kaynakta fon hücreleri sayısal ve toplamlarıyla uyumlu; bugünün boş hücreleri sıfır sayılmadı. İkincil toplayıcıdır; ihraççı veya ajans teyidi değildir.` });
      etfFlows = { ...parsed, sourceId: id };
    }),
    // A successful fetch is recorded as access, not automatic corroboration of a claim.
    get('AP', 'https://apnews.com/live/midterm-election-2026', () => { attempts.push({ stage: 'coverage', host: 'apnews.com', name: 'AP', error: 'source_news_claim_not_independently_verified', status: 200 }); }),
  ]);
  return { sources, election, etf, etfFlows, attempts };
}
