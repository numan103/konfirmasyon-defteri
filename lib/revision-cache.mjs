// Process-local source cache, NOT an HTTP/public user-response cache.
// Callers must authorize every request before accessing private data.
export function createRevisionCache({ probeMs = 10000, maxAgeMs = 300000, maxEntries = 8, clock = Date.now } = {}) {
  const entries = new Map(), pending = new Map();
  let epoch = 0;
  return {
    invalidate(key) { epoch++; entries.delete(key); pending.delete(key); },
    async get(key, revision, load) {
      const now = clock(), hit = entries.get(key);
      if (hit && hit.checkAfter > now && hit.expires > now) return structuredClone(hit.value);
      if (pending.has(key)) return structuredClone(await pending.get(key));
      const generation = epoch;
      const promise = (async () => {
        if (hit && hit.expires > now && hit.revision != null) {
          const current = await revision();
          if (current != null && current === hit.revision) {
            if (epoch === generation) hit.checkAfter = clock() + probeMs;
            return hit.value;
          }
        }
        const result = await load();
        // Failed/missing responses must be thrown by the loader, never cached as empty.
        const value = structuredClone(result.value);
        if (epoch === generation) {
          entries.set(key, { value, revision: result.revision ?? null, checkAfter: clock() + probeMs, expires: clock() + maxAgeMs });
          while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
        }
        return value;
      })();
      pending.set(key, promise);
      try { return structuredClone(await promise); }
      finally { if (pending.get(key) === promise) pending.delete(key); }
    }
  };
}
