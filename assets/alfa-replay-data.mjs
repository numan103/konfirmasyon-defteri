import { candleCloseTime } from './alfa-replay-model.mjs?v=3';
import { fetchHistory } from './alfa-charts-data.mjs?v=6';

// Sequential pages; no future dataset is passed to an analysis/render consumer.
export async function replayRange({symbol,timeframe,start,end,signal,fetcher=fetch,maxBars=50000}) {
  const result=[];
  let cursor=start;
  while(cursor<=end) {
    signal?.throwIfAborted();
    const page=await fetchHistory(symbol,timeframe,signal,fetcher,(end+1)*1000-1,cursor*1000);
    const sorted=[...new Map(page.filter(b=>b.time>=cursor && b.time<=end).map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time);
    if(!sorted.length || sorted[0].time!==cursor)throw new Error('Missing replay history at '+cursor);
    for(const b of sorted) {
      if(b.time!==cursor)throw new Error('Missing replay candle at '+cursor);
      result.push(b); cursor=candleCloseTime(b.time,timeframe);
      if(result.length>maxBars)throw new Error('Replay history limit exceeded');
    }
  }
  return result;
}
