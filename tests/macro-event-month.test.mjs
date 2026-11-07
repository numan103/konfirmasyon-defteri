import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlsMonthCalendar } from '../lib/macro/coverage.mjs';
import { collectEventAgenda } from '../lib/macro/event-sources.mjs';
const html='<h1 style="float:left;">November 2026</h1><table class="release-calendar"><tr><td id="d1110"><p class="day">10</p><p><strong>Consumer Price Index<br></strong>October 2026<br>08:30 AM</p></td><td id="d1111"><p class="day">11</p><p><strong>Veterans Day</strong>Holiday</p></td></tr></table><p>All times on calendar are Eastern Time.</p>';
test('official month-view calendar binds month, civil day, real clock and Eastern timezone',()=>{
  const rows=parseBlsMonthCalendar(html,'BLS',Date.parse('2026-11-09T06:00:00Z'),'2026-11');
  assert.equal(rows.length,1);assert.equal(rows[0].at,'2026-11-10T13:30:00.000Z');
  assert.throws(()=>parseBlsMonthCalendar(html,'BLS',Date.now(),'2026-12'),/month_mismatch/);
  assert.throws(()=>parseBlsMonthCalendar(html.replace('Eastern Time','local time'),'BLS',Date.now(),'2026-11'),/timezone_missing/);
  assert.deepEqual(parseBlsMonthCalendar(html.replace('id="d1110"','id="d1131"'),'BLS',Date.parse('2026-11-09T06:00:00Z'),'2026-11'),[]);
});
test('a separately published official month view is a bounded fallback, not secondary forecast timing',async()=>{
  const out=await collectEventAgenda({now:Date.parse('2026-11-07T06:00:00Z'),read:async url=>{
    if(url.endsWith('11_sched.htm'))return {url,text:html,fetchedAt:'2026-11-07T06:00:00Z'};
    if(url.includes('bea.gov'))return {url,text:'BEGIN:VCALENDAR\nEND:VCALENDAR',fetchedAt:'2026-11-07T06:00:00Z'};
    throw new Error('source_unavailable');
  }});
  assert.equal(out.events.length,1);assert.equal(out.events[0].kind,'cpi');assert.ok(out.authorities.includes('BLS'));
  assert.equal(out.events[0].source.url,'https://www.bls.gov/schedule/2026/11_sched.htm');
});
