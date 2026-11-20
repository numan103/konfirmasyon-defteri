// Read-only, candle-backed scenario sketch. Never an order or a confirmed M2.
import { closedBars, pivotCandidates } from './alpha-strategy-v16.mjs';
import { structureFromCandles } from './market-structure.mjs';

export function wantsBiasChart(question) {
  const q = String(question || '').toLowerCase().replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/grafiksiz|gorselsiz|grafik\s+(?:istemi|isteme|gonderme|atma|yollama|degil)|gorsel\s+(?:istemi|isteme|gonderme|atma|yollama|degil)/.test(q)) return false;
  return /(?:^|[\s/])(?:grafik\w*|grafig\w*|gorsel\w*|ciz|cizsene|cizer\s+misin|chart)(?:\s|[?!.]|$)/.test(q);
}

export function buildBiasChartModel({ detail, symbol = 'BTC', asOf = Date.now() }) {
  if (!['BTC', 'ETH', 'XAUUSD'].includes(symbol)) throw new Error('chart_symbol_unsupported');
  const all = closedBars(detail?.['15m']?.candles, '15m', asOf);
  if (all.length < 24 || !detail?.['15m']?.source) throw new Error('chart_candles_missing');
  const last = all.at(-1);
  if (asOf - last.closeTime > 30 * 60000) throw new Error('chart_candles_stale');
  const visible = all.slice(-72);
  const candidates = pivotCandidates(all).filter(p => p.t >= visible[0].t);
  const price = last.c;
  // These are observable reference pivots, NOT user-confirmed external swings.
  const highs = [...new Set(candidates.filter(p => p.kind === 'high' && p.price > price).map(p => p.price))].sort((a,b) => a-b);
  const lows = [...new Set(candidates.filter(p => p.kind === 'low' && p.price < price).map(p => p.price))].sort((a,b) => b-a);
  const max = Math.max(...visible.map(b => b.h)), min = Math.min(...visible.map(b => b.l));
  const upper = highs[0] ?? max, lower = lows[0] ?? min;
  if (!(lower < price && upper > price)) throw new Error('chart_reference_levels_missing');
  // Draw towards the observable window's extremes, not tiny adjacent internal
  // pivots or an invented 2.5R target. Endpoints are context, never TP forecasts.
  const above = max, below = min;
  const h1 = structureFromCandles(closedBars(detail?.['1h']?.candles, '1h', asOf));
  const h4 = structureFromCandles(closedBars(detail?.['4h']?.candles, '4h', asOf), 6);
  const bias = h1?.trend === 'aşağı' && h4?.trend === 'aşağı' ? 'bearish' :
    h1?.trend === 'yukarı' && h4?.trend === 'yukarı' ? 'bullish' : 'mixed';
  let ema = all[0].c;
  const series = all.map(b => { ema = b.c * 2/51 + ema * (1-2/51); return { t: b.t, price: ema }; });
  return { version: 1, symbol, asOf, source: detail['15m'].source, lastClosedAt: last.closeTime,
    price, bias, upper, lower, above, below, bars: visible, ema: series.slice(-72),
    scenarios: {
      short: { reference: lower, continuationReference: below, confirmed: false, condition: 'Alt referans kaybedilip tepki satılırsa' },
      long: { reference: upper, continuationReference: above, confirmed: false, condition: 'Üst referans geri kazanılıp korunursa' },
    },
    executionAuthorized: false, schematic: true };
}

export function biasChartContext(model) {
  return `GÖRSELLE AYNI VERİ: ${model.symbol}, 15M ${model.source}, son kapanış ${model.price} @${new Date(model.lastClosedAt).toISOString()}.
Görseldeki betimsel 1H/4H eğilim: ${model.bias}; bu tek başına işlem sinyali değil.
Alt referans pivot ${model.lower}, üst referans pivot ${model.upper}. Bunlar doğrulanmış ana swing veya HTF zone diye sunulmaz.
Kırmızı koşullu yol: alt referans kaybedilip tepki satılırsa. Yeşil koşullu yol: üst referans geri kazanılıp korunursa.
İki çember de BEKLENEN teyit noktası; henüz gerçekleşmiş teyit veya v16 M2 planı değil. Çizimin sonları fiyat tahmini/TP değildir.
Bu fotoğraf isteğinde kısa yorumunu aynı referanslarla tutarlı yaz; zıt bir yönü kesin hüküm diye sunma.`;
}

const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const stamp = t => new Date(t).toLocaleString('tr-TR', { timeZone:'Europe/Istanbul', day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit' });
const fmt = p => Number(p).toLocaleString('tr-TR', { maximumFractionDigits: p < 100 ? 3 : 0 });

export function biasChartSvg(m) {
  const W=1600,H=1000,L=70,R=1480,T=155,B=755,X=900;
  const lo=Math.min(...m.bars.map(b=>b.l), m.below), hi=Math.max(...m.bars.map(b=>b.h),m.above);
  const spread=hi-lo;
  if (!(spread>0)) throw new Error('chart_range_invalid');
  const bottom=lo-spread*.10, top=hi+spread*.18;
  const y=p=>T+(top-p)/(top-bottom)*(B-T);
  const x=i=>L+(X-L)*i/(m.bars.length-1);
  const parts=[];
  const text=(xx,yy,s,size=17,color='#a1a1aa',extra='')=>`<text x="${xx}" y="${yy}" fill="${color}" font-family="Inter" font-size="${size}" ${extra}>${esc(s)}</text>`;
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><clipPath id="priceClip"><rect x="${L}" y="${T}" width="${X-L+6}" height="${B-T}"/></clipPath>`);
  for (const [id,color] of [['red','#ff3656'],['green','#43d6a1']]) parts.push(`<marker id="${id}" markerWidth="14" markerHeight="14" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L11 5 L1 9" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/></marker>`);
  parts.push(`</defs><rect width="${W}" height="${H}" fill="#101012"/><rect x="24" y="24" width="1552" height="952" rx="18" stroke="#28282d" fill="none"/>`);
  parts.push(text(60,66,`ALFA / ${m.symbol === 'XAUUSD' ? 'XAUT-USDT · altın proxy' : m.symbol+'USDT'}`,27,'#f4f4f5','font-weight="700"'));
  parts.push(text(60,103,`15M · ${m.source} · ${stamp(m.lastClosedAt)} TSİ son kapalı mum`,17));
  const bias=m.bias==='bearish'?'BIAS: AŞAĞI':m.bias==='bullish'?'BIAS: YUKARI':'BIAS: KARIŞIK / İKİ YÖN AÇIK';
  parts.push(text(1515,68,bias,20,'#e8c4cc','text-anchor="end" font-weight="700"'));
  parts.push(`<rect x="${X+12}" y="${T}" width="${R-X-12}" height="${B-T}" fill="#191215" opacity=".50"/>`);
  parts.push(text(X+28,T+24,'İKİ KOŞULLU YOL · GELECEK MUM VERİSİ DEĞİL',14,'#b1a4b4'));
  for(let i=0;i<=5;i++){
    const p=lo+spread*i/5;
    parts.push(`<path d="M${L} ${y(p)} H${R}" stroke="#252528" stroke-dasharray="2 7"/>`,text(R+8,y(p)+5,fmt(p),14));
  }
  const volMax=Math.max(1,...m.bars.map(b=>b.v||0));
  m.bars.forEach((b,i)=>{
    const xx=x(i),col=b.c>=b.o?'#c4c4c8':'#696970',v=(b.v||0)/volMax*90;
    parts.push(`<path d="M${xx} ${y(b.h)} V${y(b.l)}" stroke="${col}" stroke-width="1.2"/><rect x="${xx-3.4}" y="${y(Math.max(b.o,b.c))}" width="6.8" height="${Math.max(1.4,Math.abs(y(b.o)-y(b.c)))}" fill="${col}"/>`);
    parts.push(`<rect x="${xx-3.4}" y="${895-v}" width="6.8" height="${v}" fill="${col}" opacity=".6"/>`);
    if(i%12===0)parts.push(text(xx,923,new Date(b.t).toLocaleTimeString('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}),14,'#71717a','text-anchor="middle"'));
  });
  parts.push(`<path d="${m.ema.map((b,i)=>`${i?'L':'M'}${x(i)} ${y(b.price)}`).join(' ')}" clip-path="url(#priceClip)" stroke="#c98b31" stroke-width="1.6" fill="none"/>`);
  parts.push(text(60,790,'HACİM · turuncu çizgi EMA50 (betimsel)',12,'#71717a'));
  parts.push(`<path d="M${L} ${y(m.price)} H${R}" stroke="#99999f" stroke-dasharray="2 5" opacity=".6"/>`);
  parts.push(`<rect x="${R-90}" y="${y(m.price)-14}" width="90" height="28" rx="3" fill="#77777e"/>`,text(R-45,y(m.price)+6,fmt(m.price),16,'#fff','text-anchor="middle"'));
  parts.push(`<path d="M${X+12} ${T+38} V${B+5}" stroke="#4e343b" stroke-dasharray="5 7"/>`);
  const circle=(cx,cy,col)=>`<path d="M${cx-22} ${cy-19} C${cx+3} ${cy-41},${cx+33} ${cy-14},${cx+20} ${cy+12} C${cx+6} ${cy+34},${cx-30} ${cy+18},${cx-22} ${cy-19} M${cx-18} ${cy-23} C${cx+14} ${cy-36},${cx+34} ${cy-2},${cx+12} ${cy+20}" fill="${col}" fill-opacity=".10" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
  for(const short of [true,false]){
    const id=short?'red':'green',color=short?'#ff3656':'#43d6a1';
    const ref=short?m.lower:m.upper,ext=short?m.below:m.above;
    const cy=y(ref),ey=y(ext),sy=y(m.price),cx=X+158;
    const primary=short?m.bias==='bearish':m.bias==='bullish';
    const path=`M${X+25} ${sy} C${X+48} ${sy},${X+56} ${ey},${X+84} ${ey} C${X+105} ${ey},${X+130} ${cy},${cx} ${cy} C${X+200} ${cy},${X+250} ${ey},${X+350} ${ey}`;
    parts.push(`<path d="${path}" stroke="${color}" stroke-width="${primary?3.5:2.8}" ${m.bias!=='mixed'&&!primary?'stroke-dasharray="10 7"':''} opacity="${primary?1:.85}" fill="none" stroke-linecap="round" marker-end="url(#${id})"/>`,circle(cx,cy,color));
    const labelY=short?Math.max(T+320,Math.min(B-45,cy+70)):Math.min(T+200,Math.max(T+85,cy-70));
    const labelX=X+255;
    const label=(short?'SATIŞ':'ALIŞ')+(m.bias==='mixed'?' · KOŞULLU':primary?' · ANA SENARYO':' · KARŞI SENARYO');
    parts.push(text(labelX,labelY,label,18,color,'font-weight="700"'));
    parts.push(text(labelX,labelY+25,`${fmt(ref)} referansı · teyit henüz yok`,15,short?'#b77884':'#81a997'));
    parts.push(`<path d="M${labelX+4} ${labelY-10} Q${X+225} ${labelY-25} ${cx+26} ${cy}" stroke="${color}" stroke-width="2.2" fill="none" marker-end="url(#${id})"/>`);
  }
  parts.push(text(X+40,B+39,'ŞİMDİ',13,'#bda0a7'),text(X+340,B+39,'OLASI YOLLAR →',13,'#bda0a7'));
  parts.push(text(60,952,'Çemberler beklenen teyit yerleri; yollar şematiktir. Gerçekleşmiş sinyal, olasılık yüzdesi, TP veya işlem planı değildir.',14,'#8e8589'));
  parts.push('</svg>');
  return parts.join('\n');
}
