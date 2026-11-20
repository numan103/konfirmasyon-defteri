// Read-only, candle-backed scenario sketch. Never an order or a confirmed M2.
import { closedBars, pivotCandidates, msbCheck } from './alpha-strategy-v16.mjs';
import { structureFromCandles } from './market-structure.mjs';

export function wantsBiasChart(question) {
  const q = String(question || '').toLowerCase().replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/grafiksiz|gorselsiz|grafik\s+(?:istemi|isteme|gonderme|atma|yollama|degil)|gorsel\s+(?:istemi|isteme|gonderme|atma|yollama|degil)/.test(q)) return false;
  return /(?:^|[\s/])(?:grafik\w*|grafig\w*|gorsel\w*|ciz|cizsene|cizer\s+misin|chart)(?:\s|[?!.]|$)/.test(q);
}

export function buildBiasChartModel({ detail, symbol = 'BTC', asOf = Date.now(), quote = null }) {
  if (!['BTC', 'ETH', 'XAUUSD'].includes(symbol)) throw new Error('chart_symbol_unsupported');
  const all = closedBars(detail?.['15m']?.candles, '15m', asOf);
  if (all.length < 24 || !detail?.['15m']?.source) throw new Error('chart_candles_missing');
  const last = all.at(-1);
  if (asOf - last.closeTime > 30 * 60000) throw new Error('chart_candles_stale');
  const visible = all.slice(-144); // Up to 36h context rather than an 18h close-up.
  const candidates = pivotCandidates(all).filter(p => p.t >= visible[0].t);
  const price = last.c;
  const quoteAt = typeof quote?.at === 'number' ? quote.at : Date.parse(quote?.at);
  const liveQuote = quote?.price > 0 && quote.source === detail['15m'].source &&
    Number.isFinite(quoteAt) && quoteAt <= asOf && asOf-quoteAt <= 5*60000
    ? { price: quote.price, at: quoteAt, source: quote.source } : null;
  const anchorPrice = liveQuote?.price ?? price;
  // These are observable reference pivots, NOT user-confirmed external swings.
  const highs = [...new Set(candidates.filter(p => p.kind === 'high' && p.price > anchorPrice).map(p => p.price))].sort((a,b) => a-b);
  const lows = [...new Set(candidates.filter(p => p.kind === 'low' && p.price < anchorPrice).map(p => p.price))].sort((a,b) => b-a);
  const hourly=closedBars(detail?.['1h']?.candles,'1h',asOf);
  const hourPivots=detail?.['1h']?.source===detail['15m'].source
    ? pivotCandidates(hourly).filter(p=>p.t>=visible[0].t) : [];
  const hHighs=hourPivots.filter(p=>p.kind==='high'&&p.price>anchorPrice).map(p=>p.price).sort((a,b)=>a-b);
  const hLows=hourPivots.filter(p=>p.kind==='low'&&p.price<anchorPrice).map(p=>p.price).sort((a,b)=>b-a);
  const visibleHigh=Math.max(...visible.map(b=>b.h)),visibleLow=Math.min(...visible.map(b=>b.l));
  // Prefer observable 1H context for this visual, not tiny adjacent 15M pivots.
  // This is a display selection, NOT a new setup filter or protected-swing claim.
  const upper=hHighs[0]??highs[0]??visibleHigh,lower=hLows[0]??lows[0]??visibleLow;
  const upperTf=hHighs.length?'1H':'15M',lowerTf=hLows.length?'1H':'15M';
  const max=Math.max(visibleHigh,upper),min=Math.min(visibleLow,lower);
  if (!(lower < anchorPrice && upper > anchorPrice)) throw new Error('chart_reference_levels_missing');
  // Preserve observed range references in the analysis model. The separate
  // screen-space sketch can extend further, but never creates numeric TP levels.
  const above = max, below = min;
  const upperBreak=[...highs,...hHighs].filter(p=>p>upper).sort((a,b)=>a-b)[0]??max;
  const lowerBreak=[...lows,...hLows].filter(p=>p<lower).sort((a,b)=>b-a)[0]??min;
  const h1 = structureFromCandles(hourly);
  const h4 = structureFromCandles(closedBars(detail?.['4h']?.candles, '4h', asOf), 6);
  const bias = h1?.trend === 'aşağı' && h4?.trend === 'aşağı' ? 'bearish' :
    h1?.trend === 'yukarı' && h4?.trend === 'yukarı' ? 'bullish' : 'mixed';
  const events = [];
  for (let i=Math.max(1,all.length-8);i<all.length;i++) {
    const bar=all[i],prev=all[i-1];
    const crossed=candidates.filter(p=>p.knownAt<=bar.t &&
      (p.kind==='high' ? prev.c<=p.price&&bar.c>p.price : prev.c>=p.price&&bar.c<p.price))
      .sort((a,b)=>b.knownAt-a.knownAt);
    for(const pivot of crossed) {
      const direction=pivot.kind==='high'?'long':'short',check=msbCheck(bar,pivot,direction);
      if(!check.valid) continue;
      const reclaimed=all.slice(i+1).find(b=>direction==='short'?b.c>pivot.price:b.c<pivot.price);
      events.push({direction,level:pivot.price,at:bar.closeTime,bodyRatio:check.bodyRatio,
        reclaimedAt:reclaimed?.closeTime || null,barTime:bar.t,candidateOnly:true});
      break;
    }
  }
  const recentEvent=events.filter(e=>e.reclaimedAt).at(-1)||events.at(-1)||null;
  let ema = all[0].c;
  const series = all.map(b => { ema = b.c * 2/51 + ema * (1-2/51); return { t: b.t, price: ema }; });
  return { version: 2, symbol, asOf, source: detail['15m'].source, lastClosedAt: last.closeTime,
    price, anchorPrice, liveQuote, bias, upper, lower, upperTf, lowerTf, upperBreak, lowerBreak,
    above, below, recentEvent, bars: visible, ema: series.slice(-visible.length),
    scenarios: {
      short: { reference: lower, continuationReference: below, confirmed: false, condition: 'Alt referans kaybedilip tepki satılırsa' },
      long: { reference: upper, continuationReference: above, confirmed: false, condition: 'Üst referans geri kazanılıp korunursa' },
    },
    executionAuthorized: false, schematic: true };
}

export function biasChartContext(model) {
  return `GÖRSELLE AYNI VERİ: ${model.symbol}, 15M ${model.source}, son kapanış ${model.price} @${new Date(model.lastClosedAt).toISOString()}.
Görseldeki betimsel 1H/4H eğilim: ${model.bias}; bu tek başına işlem sinyali değil.
${model.liveQuote ? `Anlık referans ${model.liveQuote.price} @${new Date(model.liveQuote.at).toISOString()}, kapalı mumdan ayrı fiyat; mum teyidi değildir.` : ''}
Alt ${model.lowerTf} referans pivot ${model.lower}, üst ${model.upperTf} referans pivot ${model.upper}. Bunlar doğrulanmış ana swing veya HTF zone diye sunulmaz.
${model.recentEvent ? `Gözlenen yerel 15M olay: ${JSON.stringify(model.recentEvent)}. Güncel açıklama: ${biasEventText(model)}. reclaimedAt geçmişteki kapanışı anlatır; sonraki anlık quote bunu koruyan yeni mum teyidi değildir. Bu M2 ana swing teyidi değildir.` : ''}
Kırmızı koşullu yol: alt referans kaybedilip tepki satılırsa. Yeşil koşullu yol: üst referans geri kazanılıp korunursa.
İki çember de BEKLENEN teyit noktası; henüz gerçekleşmiş teyit veya v16 M2 planı değil. Çizimin sonları fiyat tahmini/TP değildir.
Bu fotoğraf isteğinde kısa yorumunu aynı referanslarla tutarlı yaz; zıt bir yönü kesin hüküm diye sunma.`;
}

export function biasEventText(model) {
  const e=model?.recentEvent;
  if(!e) return '';
  if(model.liveQuote?.at>=e.at){
    const above=model.liveQuote.price>e.level,below=model.liveQuote.price<e.level;
    if(e.reclaimedAt&&model.liveQuote.at>=e.reclaimedAt){
      if(e.direction==='short'&&below)return 'Geri kazanım sonrası anlık fiyat yeniden altında';
      if(e.direction==='long'&&above)return 'Geri kayıp sonrası anlık fiyat yeniden üstünde';
    } else if(!e.reclaimedAt) {
      if(e.direction==='short'&&above)return 'Yerel aşağı kırılıma anlık geri kazanım denemesi';
      if(e.direction==='long'&&below)return 'Yerel yukarı kırılıma anlık geri kayıp denemesi';
    }
  }
  if(e.reclaimedAt) return e.direction==='short' ? 'Yerel aşağı kırılım geri kazanıldı' : 'Yerel yukarı kırılım geri kaybedildi';
  return e.direction==='short' ? 'Son güçlü yerel kapanış aşağı' : 'Son güçlü yerel kapanış yukarı';
}

const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const stamp = t => new Date(t).toLocaleString('tr-TR', { timeZone:'Europe/Istanbul', day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit' });
const fmt = p => Number(p).toLocaleString('tr-TR', { maximumFractionDigits: p < 100 ? 3 : 0 });

export function biasChartViewport(m) {
  const lo=Math.min(...m.bars.map(b=>b.l),m.below,m.anchorPrice??m.price);
  const hi=Math.max(...m.bars.map(b=>b.h),m.above,m.anchorPrice??m.price);
  const spread=hi-lo;
  if(!(spread>0)) throw new Error('chart_range_invalid');
  // Display padding only, NOT additional PA/ATR/strategy conditions.
  const paddedBottom=Math.max(lo-spread*.65,lo*.1),paddedTop=hi+spread*.28;
  const raw=(paddedTop-paddedBottom)/7,power=10**Math.floor(Math.log10(raw));
  const normalized=raw/power,step=(normalized<=1?1:normalized<=2?2:normalized<=5?5:10)*power;
  const bottom=Math.max(step,Math.floor(paddedBottom/step)*step),top=Math.ceil(paddedTop/step)*step;
  const ticks=[];
  for(let p=Math.ceil(bottom/step)*step;p<=top;p+=step)ticks.push(p);
  return {lo,hi,bottom,top,ticks,step};
}

export function biasChartSvg(m) {
  const W=1600,H=1000,L=65,R=1430,T=135,B=755,X=920;
  const {bottom,top,ticks}=biasChartViewport(m);
  const y=p=>T+(top-p)/(top-bottom)*(B-T);
  const x=i=>L+(X-L)*i/(m.bars.length-1);
  const parts=[];
  const text=(xx,yy,s,size=17,color='#a1a1aa',extra='')=>`<text x="${xx}" y="${yy}" fill="${color}" font-family="Inter" font-size="${size}" ${extra}>${esc(s)}</text>`;
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><clipPath id="priceClip"><rect x="${L}" y="${T}" width="${X-L+6}" height="${B-T}"/></clipPath>`);
  for (const [id,color] of [['red','#ff3656'],['green','#43d6a1']]) parts.push(`<marker id="${id}" markerWidth="14" markerHeight="14" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L11 5 L1 9" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/></marker>`);
  parts.push(`</defs><rect width="${W}" height="${H}" fill="#101012"/><rect x="24" y="24" width="1552" height="952" rx="18" stroke="#28282d" fill="none"/>`);
  parts.push(text(60,66,`ALFA / ${m.symbol === 'XAUUSD' ? 'XAUT-USDT · altın proxy' : m.symbol+'USDT'} · 15M`,27,'#f4f4f5','font-weight="600"'));
  parts.push(text(60,99,`${m.source} · ${stamp(m.lastClosedAt)} TSİ`,16,'#8b8b96'));
  parts.push(`<rect x="${X+12}" y="${T}" width="${R-X-12}" height="${B-T}" fill="#191215" opacity=".50"/>`);
  parts.push(`<rect x="${R+1}" y="${T}" width="124" height="${B-T}" fill="#151519"/>`);
  for(const p of ticks){
    parts.push(`<path d="M${L} ${y(p)} H${R}" stroke="#323238" stroke-dasharray="2 7"/>`,text(R+18,y(p)+7,fmt(p),21,'#d4d4d8'));
  }
  const volMax=Math.max(1,...m.bars.map(b=>b.v||0));
  m.bars.forEach((b,i)=>{
    const xx=x(i),col=b.c>=b.o?'#c4c4c8':'#696970',v=(b.v||0)/volMax*90;
    const width=Math.min(7,(X-L)/(m.bars.length-1)*.65);
    parts.push(`<path d="M${xx} ${y(b.h)} V${y(b.l)}" stroke="${col}" stroke-width="1.2"/><rect x="${xx-width/2}" y="${y(Math.max(b.o,b.c))}" width="${width}" height="${Math.max(1.4,Math.abs(y(b.o)-y(b.c)))}" fill="${col}"/>`);
    parts.push(`<rect x="${xx-width/2}" y="${895-v}" width="${width}" height="${v}" fill="${col}" opacity=".6"/>`);
    if(i%24===0)parts.push(text(xx,923,stamp(b.t),15,'#a1a1aa','text-anchor="middle"'));
  });
  parts.push(`<path d="${m.ema.map((b,i)=>`${i?'L':'M'}${x(i)} ${y(b.price)}`).join(' ')}" clip-path="url(#priceClip)" stroke="#c98b31" stroke-width="1.6" fill="none"/>`);
  const anchor=m.anchorPrice??m.price;
  parts.push(`<path d="M${L} ${y(anchor)} H${R}" stroke="${m.liveQuote?'#55bde8':'#99999f'}" stroke-dasharray="3 6" opacity=".55"/>`);
  parts.push(`<rect x="${R+4}" y="${y(anchor)-17}" width="118" height="34" rx="4" fill="${m.liveQuote?'#24627c':'#666670'}"/>`,text(R+63,y(anchor)+7,fmt(anchor),22,'#fff','text-anchor="middle" font-weight="600"'));
  parts.push(`<path d="M${X+12} ${T} V${B+5}" stroke="#4e343b" stroke-dasharray="3 9" opacity=".4"/>`);
  const circle=(cx,cy,col)=>`<path d="M${cx-22} ${cy-19} C${cx+3} ${cy-41},${cx+33} ${cy-14},${cx+20} ${cy+12} C${cx+6} ${cy+34},${cx-30} ${cy+18},${cx-22} ${cy-19} M${cx-18} ${cy-23} C${cx+14} ${cy-36},${cx+34} ${cy-2},${cx+12} ${cy+20}" fill="${col}" fill-opacity=".10" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
  for(const short of [true,false]){
    const id=short?'red':'green',color=short?'#ff3656':'#43d6a1';
    const geometry=biasScenarioGeometry(m,short);
    parts.push(`<path data-scenario="${short?'short':'long'}" d="${geometry.path}" stroke="${color}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#${id})"/>`,
      circle(geometry.cx,geometry.cy,color));
    const dir=short?1:-1;
    parts.push(`<path d="M${geometry.cx+70} ${geometry.cy-dir*52} Q${geometry.cx+45} ${geometry.cy-dir*36} ${geometry.cx+24} ${geometry.cy-dir*12}" stroke="${color}" stroke-width="2.1" fill="none" stroke-linecap="round" marker-end="url(#${id})"/>`);
  }
  parts.push(text(60,952,'Yollar şematik · çemberler beklenen teyit · hedef / işlem planı değil',14,'#77717a'));
  parts.push('</svg>');
  return parts.join('\n');
}

// Display-only brush geometry. The circles stay at real reference prices;
// extensions beyond the observed range are illustrative, not numeric targets
// and never enter the analysis/strategy model or its 2.5R calculations.
export function biasScenarioGeometry(m, short) {
  const T=135,B=755,X=920,{bottom,top}=biasChartViewport(m);
  const y=p=>T+(top-p)/(top-bottom)*(B-T);
  const dir=short?1:-1,sy=y(m.anchorPrice??m.price);
  const cx=X+(short?155:245),cy=y(short?m.lower:m.upper);
  const endY=short?B-45:T+45;
  const turnY=short
    ? Math.min(Math.max(y(m.lowerBreak),sy+75,cy+65),endY-65)
    : Math.max(Math.min(y(m.upperBreak),sy-75,cy-55),T+20);
  const knots=[
    [X+25,sy],[X+80,turnY],[cx-30,cy+dir*27],[cx,cy],
    [cx+30,cy+dir*25],[cx+85,(cy+endY)/2],[X+405,endY],
  ];
  const n=v=>Number(v.toFixed(2));
  let path=`M${n(knots[0][0])} ${n(knots[0][1])}`;
  for(let i=0;i<knots.length-1;i++){
    const a=knots[Math.max(0,i-1)],b=knots[i],c=knots[i+1],d=knots[Math.min(knots.length-1,i+2)];
    path+=` C${n(b[0]+(c[0]-a[0])/6)} ${n(b[1]+(c[1]-a[1])/6)} ${n(c[0]-(d[0]-b[0])/6)} ${n(c[1]-(d[1]-b[1])/6)} ${n(c[0])} ${n(c[1])}`;
  }
  return {path,cx,cy,knots,illustrationOnly:true};
}
