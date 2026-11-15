// Bounded incremental reads for an authorized, time-windowed report.
// Authorization belongs to the caller and must run BEFORE every read.
export function createWindowRowsCache({ clock = Date.now, maxAgeMs = 300000, maxRows = 5000, maxEntries = 3, maxBytes = 4 * 1024 * 1024 } = {}) {
  const entries = new Map(), pending = new Map();
  let epoch = 0;
  return {
    clear() { epoch++; entries.clear(); pending.clear(); },
    async read(key, since, load) {
      if (pending.has(key)) return structuredClone(await pending.get(key));
      const now = clock(), generation = epoch;
      const sinceTime = Date.parse(since);
      if (!Number.isFinite(sinceTime)) throw new Error('invalid_report_window');
      const old = entries.get(key), hit = old && old.expires > now && old.since <= sinceTime ? old : null;
      // Overlap one second so equal/sub-millisecond timestamps cannot be skipped.
      const filter = hit ? new Date(Math.max(sinceTime, hit.watermark - 1000)).toISOString() : since;
      const job = (async () => {
        const result = await load(filter);
        if (result.error) return result; // No stale-success response on upstream failure.
        if (result.truncated) { if (epoch === generation) entries.delete(key); return result; }
        const rows = new Map((hit?.rows || []).map(row => [row.id, row]));
        for (const row of result.rows) {
          const previous = rows.get(row.id);
          if (!previous || Date.parse(row.updated_at) >= Date.parse(previous.updated_at)) rows.set(row.id, row);
        }
        const all = [...rows.values()].filter(row => Date.parse(row.updated_at) >= sinceTime)
          .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, maxRows);
        let watermark = sinceTime;
        for (const row of all) if (row.data) watermark = Math.max(watermark, Math.min(now, Date.parse(row.updated_at) || sinceTime));
        if (epoch === generation) {
          if (all.length < maxRows && Buffer.byteLength(JSON.stringify(all)) <= maxBytes) {
            entries.set(key, { rows: structuredClone(all), since: sinceTime, watermark, expires: hit?.expires || clock() + maxAgeMs });
            while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
          } else entries.delete(key);
        }
        return { rows: all };
      })();
      pending.set(key, job);
      try { return structuredClone(await job); }
      finally { if (pending.get(key) === job) pending.delete(key); }
    }
  };
}
