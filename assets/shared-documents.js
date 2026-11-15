(function (root) {
  'use strict';
  // Only AlfaNews/Mentoring documents; never journals, access tiers or auth tokens.
  function create(options) {
    var clock = options && options.clock || Date.now;
    var entries = new Map(), pending = new Map(), epoch = 0;
    function key(owner, id) { return String(owner || 'guest') + ':' + id; }
    return {
      invalidate: function (owner, id) { epoch++; entries.delete(key(owner, id)); pending.delete(key(owner, id)); },
      read: async function (client, owner, id) {
        if (id !== 1 && id !== 2) throw new Error('Unsupported shared document');
        var k = key(owner, id), hit = entries.get(k), now = clock();
        if (hit && hit.checkAfter > now && hit.expires > now) return structuredClone(hit.result);
        if (pending.has(k)) return structuredClone(await pending.get(k));
        var generation = epoch;
        var job = (async function () {
          if (hit && hit.revision && hit.expires > now) {
            var check = await client.from('alfanews').select('updated_at').eq('id', id).maybeSingle();
            if (check.error) throw check.error;
            if (!check.data) { entries.delete(k); return { data: null }; }
            if (check.data.updated_at === hit.revision) {
              if (epoch === generation) hit.checkAfter = clock() + 10000;
              return hit.result;
            }
          }
          var result = await client.from('alfanews').select('data,updated_at').eq('id', id).maybeSingle();
          if (result.error) throw result.error;
          if (epoch === generation && result.data) {
            entries.set(k, { result: structuredClone(result), revision: result.data.updated_at,
              checkAfter: clock() + 10000, expires: clock() + 300000 });
            while (entries.size > 4) entries.delete(entries.keys().next().value);
          }
          return result;
        })();
        pending.set(k, job);
        try { return structuredClone(await job); }
        finally { if (pending.get(k) === job) pending.delete(k); }
      }
    };
  }
  root.AlfaSharedDocuments = create();
  root.AlfaSharedDocuments.create = create;
})(globalThis);
