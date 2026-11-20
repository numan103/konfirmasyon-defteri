/* Ayna ← Sabah Kartı: moodCheckin olayını günlük sabah kaydına işler. */
(function () {
  var seen = {}; // bellek içi tekilleştirme; tarayıcıda kişisel veri saklanmaz

  function score(values) {
    var positive = ['slept-well', 'motivated', 'clear-after-win', 'sees-opportunity'];
    var negative = ['tired', 'angry', 'loss-pain'];
    var p = 0, e = 0, n = 0;
    (values || []).forEach(function (id) {
      if (positive.indexOf(id) >= 0) { p += 2; e += id === 'tired' ? 0 : 1; n++; }
      else if (negative.indexOf(id) >= 0) { p -= 2; e -= id === 'loss-pain' ? 1 : 2; n++; }
    });
    if (!n) return { pleasantness: 0, energy: 0 };
    return {
      pleasantness: Math.max(-5, Math.min(5, Math.round(p / n * 1.5))),
      energy: Math.max(-5, Math.min(5, Math.round(e / n * 2)))
    };
  }

  function words(detail) {
    var list = (detail.labels && detail.labels.length ? detail.labels : detail.values) || [];
    return list.slice(0, 3).map(function (w) { return String(w).slice(0, 80); });
  }

  async function allowed(Ayna) {
    if (typeof window.siteIsAdmin === 'function' && window.siteIsAdmin()) return true;
    return !!(window.SITE && window.SITE.admin === true);
  }

  async function sync(detail) {
    var Ayna = window.Ayna;
    if (!Ayna || typeof Ayna.sb !== 'function') return;
    var client = Ayna.sb();
    if (!client || !client.auth || !client.auth.getSession) return;

    var date = (typeof Ayna.today === 'function' && Ayna.today()) || detail.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
    if (seen[date]) return;
    seen[date] = true;

    try {
      var sessionRes = await client.auth.getSession();
      var session = sessionRes && sessionRes.data ? sessionRes.data.session : null;
      if (!session || !session.user || !session.user.id) return;
      if (!(await allowed(Ayna))) return;

      var s = score(detail.values);
      var payload = {
        mood_words: words(detail),
        pleasantness: s.pleasantness,
        energy: s.energy,
        processed_at: new Date().toISOString()
      };
      var uid = session.user.id;

      var found = await client.from('ayna_entries').select('id')
        .eq('user_id', uid).eq('local_date', date).eq('kind', 'morning').maybeSingle();
      if (found && found.error) throw found.error;

      var result;
      if (found && found.data && found.data.id) {
        result = await client.from('ayna_entries').update(payload)
          .eq('id', found.data.id).eq('user_id', uid).select('id').single();
      } else {
        result = await client.from('ayna_entries').insert(Object.assign({
          user_id: uid, kind: 'morning', local_date: date
        }, payload)).select('id').single();
      }
      if (result && result.error) throw result.error;
      window.dispatchEvent(new CustomEvent('ayna:morning-synced', {
        detail: { date: date, id: result && result.data ? result.data.id : null }
      }));
    } catch (e) {
      delete seen[date];
    }
  }

  window.addEventListener('moodCheckin', function (event) {
    var detail = event && event.detail;
    if (!detail || !Array.isArray(detail.values)) return;
    return sync(detail);
  });
})();
