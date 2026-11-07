import { randomUUID } from 'node:crypto';

export function macroStore(fetcher = fetch) {
  const base = (process.env.SUPABASE_URL || 'https://zvnjslmptwmnuhftgqsr.supabase.co') + '/rest/v1/';
  async function call(table, method, query, body) {
    const key = process.env.SUPABASE_SERVICE_ROLE;
    if (!key) throw new Error('missing_SUPABASE_SERVICE_ROLE');
    const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
    const r = await fetcher(base + table + query, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3500) });
    if (r.status === 409) return null;
    if (!r.ok) throw new Error('macro_storage_unavailable');
    return r.json();
  }
  const read = async day => (await call('alfa_macro_reports', 'GET', '?report_date=eq.' + encodeURIComponent(day) + '&select=*'))[0] || null;
  const create = async (day, payload) => (await call('alfa_macro_reports', 'POST', '', { report_date: day, revision: randomUUID(), payload }) || [])[0] || null;
  async function cas(table, row, payload) {
    const key = table === 'alfa_macro_reports' ? 'report_date=eq.' + row.report_date : table === 'alfa_macro_settings' ? 'id=eq.1' : 'id=eq.' + encodeURIComponent(row.id);
    const rows = await call(table, 'PATCH', '?' + key + '&revision=eq.' + encodeURIComponent(row.revision), { payload, revision: randomUUID(), updated_at: new Date().toISOString(), ...(table === 'alfa_macro_events' ? { scheduled_at: payload.event.at } : {}) });
    if (!rows?.length) throw new Error('macro_conflict');
    return rows[0];
  }
  return {
    read, create,
    save: (row, data) => cas('alfa_macro_reports', row, data),
    settings: async () => {
      const row = (await call('alfa_macro_settings', 'GET', '?id=eq.1&select=*'))[0];
      if (!row) throw new Error('macro_storage_unavailable');
      return row;
    },
    saveSettings: (row, data) => cas('alfa_macro_settings', row, data),
    previous: async day => (await call('alfa_macro_reports', 'GET', '?report_date=lt.' + encodeURIComponent(day) + '&order=report_date.desc&limit=1&select=payload'))[0]?.payload?.report || null,
    event: async id => (await call('alfa_macro_events','GET','?id=eq.' + encodeURIComponent(id) + '&select=*'))[0] || null,
    events: async (from,to) => call('alfa_macro_events','GET','?scheduled_at=gte.' + encodeURIComponent(from) + '&scheduled_at=lte.' + encodeURIComponent(to) + '&order=scheduled_at.asc&limit=40&select=*'),
    createEvent: async event => (await call('alfa_macro_events','POST','',{id:event.id,scheduled_at:event.at,revision:randomUUID(),payload:{event}}) || [])[0] || null,
    saveEvent: (row,payload) => cas('alfa_macro_events',row,payload),
    update: async id => (await call('alfa_macro_updates','GET','?id=eq.' + encodeURIComponent(id) + '&select=*'))[0] || null,
    createUpdate: async (id,payload) => (await call('alfa_macro_updates','POST','',{id,revision:randomUUID(),payload}) || [])[0] || null,
    saveUpdate: (row,payload) => cas('alfa_macro_updates',row,payload),
  };
}
