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
  // Draw towards the observable window's extremes, not tiny adjacent internal
  // pivots or an invented 2.5R target. Endpoints are context, never TP forecasts.
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
  const paddedBottom=Math.max(lo-spread*.28,lo*.1),paddedTop=hi+spread*.28;
  const raw=(paddedTop-paddedBottom)/7,power=10**Math.floor(Math.log10(raw));
  const normalized=raw/power,step=(normalized<=1?1:normalized<=2?2:normalized<=5?5:10)*power;
  const bottom=Math.max(step,Math.floor(paddedBottom/step)*step),top=Math.ceil(paddedTop/step)*step;
  const ticks=[];
  for(let p=Math.ceil(bottom/step)*step;p<=top;p+=step)ticks.push(p);
  return {lo,hi,bottom,top,ticks,step};
}

export function biasChartSvg(m) {
  const W=1600,H=1000,L=65,R=1430,T=155,B=755,X=920;
  const {bottom,top,ticks}=biasChartViewport(m);
  const y=p=>T+(top-p)/(top-bottom)*(B-T);
  const x=i=>L+(X-L)*i/(m.bars.length-1);
  const parts=[];
  const text=(xx,yy,s,size=17,color='#a1a1aa',extra='')=>`<text x="${xx}" y="${yy}" fill="${color}" font-family="Inter" font-size="${size}" ${extra}>${esc(s)}</text>`;
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><clipPath id="priceClip"><rect x="${L}" y="${T}" width="${X-L+6}" height="${B-T}"/></clipPath>`);
  for (const [id,color] of [['red','#ff3656'],['green','#43d6a1']]) parts.push(`<marker id="${id}" markerWidth="14" markerHeight="14" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L11 5 L1 9" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/></marker>`);
  parts.push(`</defs><rect width="${W}" height="${H}" fill="#101012"/><rect x="24" y="24" width="1552" height="952" rx="18" stroke="#28282d" fill="none"/>`);
  parts.push(text(60,66,`ALFA / ${m.symbol === 'XAUUSD' ? 'XAUT-USDT · altın proxy' : m.symbol+'USDT'}`,27,'#f4f4f5','font-weight="700"'));
  const hours=(m.lastClosedAt-m.bars[0].t)/3600000;
  parts.push(text(60,103,`15M · ${m.source} · ${hours.toLocaleString('tr-TR',{maximumFractionDigits:1})} saat görünüm · ${stamp(m.lastClosedAt)} TSİ son kapanış`,18));
  const bias=m.bias==='bearish'?'BIAS: AŞAĞI':m.bias==='bullish'?'BIAS: YUKARI':'BIAS: KARIŞIK / İKİ YÖN AÇIK';
  parts.push(text(1515,68,bias,20,'#e8c4cc','text-anchor="end" font-weight="700"'));
  parts.push(`<rect x="${X+12}" y="${T}" width="${R-X-12}" height="${B-T}" fill="#191215" opacity=".50"/>`);
  parts.push(text(X+25,T+24,'GELECEK MUM VERİSİ DEĞİL',16,'#b1a4b4'));
  if(m.recentEvent){
    parts.push(text(L+10,T+24,`${biasEventText(m)} · ${fmt(m.recentEvent.level)} (ana swing teyidi değil)`,16,'#d4b477'));
    const idx=m.bars.findIndex(b=>b.t===m.recentEvent.barTime);
    if(idx>=0)parts.push(`<circle cx="${x(idx)}" cy="${y(m.bars[idx].c)}" r="9" fill="none" stroke="#d4b477" stroke-width="2"/>`);
  }
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
  parts.push(text(60,790,'HACİM · turuncu çizgi EMA50 (betimsel)',12,'#71717a'));
  parts.push(`<path d="M${L} ${y(m.price)} H${R}" stroke="#99999f" stroke-dasharray="2 5" opacity=".6"/>`);
  const anchor=m.anchorPrice??m.price;
  if(m.liveQuote)parts.push(`<path d="M${L} ${y(anchor)} H${R}" stroke="#55bde8" stroke-dasharray="5 6" opacity=".65"/>`);
  parts.push(`<rect x="${R+4}" y="${y(anchor)-17}" width="118" height="34" rx="4" fill="${m.liveQuote?'#24627c':'#666670'}"/>`,text(R+63,y(anchor)+7,fmt(anchor),22,'#fff','text-anchor="middle" font-weight="600"'));
  parts.push(text(60,130,m.liveQuote?`Anlık ${fmt(anchor)} · kapalı mum ${fmt(m.price)} (mum teyidi ayrı)`:`Son kapalı mum ${fmt(m.price)} · canlı tick değil`,16,'#91cce1'));
  for(const [p,label] of [[m.above,'Görünen tepe'],[m.below,'Görünen dip']]){
    parts.push(`<path d="M${L} ${y(p)} H${X-12}" stroke="#73737e" stroke-dasharray="6 6" opacity=".6"/>`);
    parts.push(text(L+10,y(p)-9,`${label}: ${fmt(p)}`,16,'#b8b8c3'));
  }
  for(const [p,col] of [[m.lower,'#ff3656'],[m.upper,'#43d6a1']]){
    parts.push(`<path d="M${X-120} ${y(p)} H${R-8}" stroke="${col}" stroke-dasharray="3 7" opacity=".3"/>`);
  }
  parts.push(`<path d="M${X+12} ${T+38} V${B+5}" stroke="#4e343b" stroke-dasharray="5 7"/>`);
  const circle=(cx,cy,col)=>`<path d="M${cx-22} ${cy-19} C${cx+3} ${cy-41},${cx+33} ${cy-14},${cx+20} ${cy+12} C${cx+6} ${cy+34},${cx-30} ${cy+18},${cx-22} ${cy-19} M${cx-18} ${cy-23} C${cx+14} ${cy-36},${cx+34} ${cy-2},${cx+12} ${cy+20}" fill="${col}" fill-opacity=".10" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`;
  for(const short of [true,false]){
    const id=short?'red':'green',color=short?'#ff3656':'#43d6a1';
    const ref=short?m.lower:m.upper,ext=short?m.below:m.above;
    const cy=y(ref),ey=y(ext),firstY=y(short?m.lowerBreak:m.upperBreak),sy=y(anchor),cx=X+(short?125:215);
    const primary=short?m.bias==='bearish':m.bias==='bullish';
    const path=`M${X+25} ${sy} C${X+48} ${sy},${X+56} ${firstY},${X+84} ${firstY} C${X+105} ${firstY},${cx-28} ${cy},${cx} ${cy} C${cx+45} ${cy},${X+290} ${ey},${X+350} ${ey}`;
    parts.push(`<path d="${path}" stroke="${color}" stroke-width="${primary?3.5:2.8}" ${m.bias!=='mixed'&&!primary?'stroke-dasharray="10 7"':''} opacity="${primary?1:.85}" fill="none" stroke-linecap="round" marker-end="url(#${id})"/>`,circle(cx,cy,color));
    const labelY=short?Math.max(T+320,Math.min(B-45,cy+70)):Math.min(T+200,Math.max(T+85,cy-70));
    const labelX=X+230;
    const label=(short?'SATIŞ':'ALIŞ')+(m.bias==='mixed'?' · KOŞULLU':primary?' · ANA SENARYO':' · KARŞI SENARYO');
    parts.push(text(labelX,labelY,label,19,color,'font-weight="700"'));
    parts.push(text(labelX,labelY+27,`${short?m.lowerTf:m.upperTf} ${fmt(ref)} · teyit yok`,19,short?'#efb0ba':'#b0dfcc'));
    parts.push(`<path d="M${labelX-14} ${labelY+4} Q${X+205} ${(labelY+cy)/2} ${cx+26} ${cy}" stroke="${color}" stroke-width="2.2" fill="none" marker-end="url(#${id})"/>`);
  }
  parts.push(text(X+40,B+39,'ŞİMDİ',13,'#bda0a7'),text(X+340,B+39,'OLASI YOLLAR →',13,'#bda0a7'));
  parts.push(text(60,952,'Çemberlerde teyit henüz yok; yollar şematiktir. Gerçekleşmiş sinyal, olasılık yüzdesi, TP veya işlem planı değildir.',14,'#8e8589'));
  parts.push('</svg>');
  return parts.join('\n');
}
