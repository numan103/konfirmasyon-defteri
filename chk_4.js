(function () {
      var calData = [];
      var calImp = 1;
      function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function impCls(impact) { return String(impact || '').toLowerCase(); }
      function calDayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
      function fmtTime(ts) { var d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
      function dayLabel(ts) {
        var d = new Date(ts), now = new Date();
        var same = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
        var names = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
        return (same ? 'Bugün · ' : '') + names[d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
      }
      function sortEvents(a, b) { return (a._ts || 0) - (b._ts || 0); }
      function renderCal() {
        var list = document.getElementById('cal-list');
        var status = document.getElementById('cal-status');
        if (!list) return;
        if (!calData.length) { list.innerHTML = '<div class="cal-empty">📅 Bu hafta için veri bulunamadı.</div>'; return; }
        var filtered = calData.filter(function (e) { return calImp === 2 || e.impact === 'high'; }).slice().sort(sortEvents);
        var groups = {};
        filtered.forEach(function (e) { var k = calDayKey(e._ts); (groups[k] = groups[k] || []).push(e); });
        var html = '';
        Object.keys(groups).sort().forEach(function (k) {
          var evs = groups[k];
          html += '<div class="cal-day"><div class="cal-day-head">' + esc(dayLabel(evs[0]._ts)) + '</div>';
          evs.forEach(function (e) {
            var badge = '';
            if (e.impact === 'high') badge = '<span class="cal-imp high">Yüksek</span>';
            else if (e.impact === 'medium') badge = '<span class="cal-imp medium">Orta</span>';
            else badge = '<span class="cal-imp low">Düşük</span>';
            html += '<div class="cal-row">' +
              '<span class="cal-time">' + fmtTime(e._ts) + '</span>' +
              '<span class="cal-flag">' + esc(e.country) + '</span>' +
              '<span class="cal-title">' + esc(e.title) + '</span>' +
              badge +
              '<span class="cal-fp">' + (e.forecast ? 'Beklenti: ' + esc(e.forecast) : '') + '</span>' +
              '<span class="cal-fp prev">' + (e.previous ? 'Önceki: ' + esc(e.previous) : '') + '</span>' +
              '</div>';
          });
          html += '</div>';
        });
        list.innerHTML = html;
        if (status) status.textContent = filtered.length + ' etkinlik';
      }
      function loadCal() {
        var list = document.getElementById('cal-list');
        var status = document.getElementById('cal-status');
        if (list) list.innerHTML = '<div class="cal-empty">⏳ Takvim yükleniyor…</div>';
        if (status) status.textContent = '';
        fetch('/api/eco-cal').then(function (r) { return r.json(); }).then(function (j) {
          if (j && j.ok && Array.isArray(j.items)) {
            calData = j.items.map(function (e) {
              var ts = e.date ? new Date(e.date).getTime() : 0;
              return { title: e.title, country: e.country, impact: impCls(e.impact), forecast: e.forecast, previous: e.previous, _ts: ts };
            }).filter(function (e) { return e._ts > 0 && e.title; });
          } else {
            calData = [];
            if (status) status.textContent = '⚠ ' + ((j && j.error) || 'Veri alınamadı');
          }
          renderCal();
        }).catch(function () {
          calData = [];
          if (status) status.textContent = '⚠ Takvim yüklenemedi (ağ hatası)';
          if (list) list.innerHTML = '<div class="cal-empty">Takvim yüklenemedi. Bağlantını kontrol et.</div>';
        });
      }
      window.loadCal = loadCal;
      document.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('#cal-imp-seg button') : null;
        if (b) {
          calImp = Number(b.getAttribute('data-imp'));
          document.querySelectorAll('#cal-imp-seg button').forEach(function (x) { x.classList.toggle('on-gold', x === b); });
          renderCal();
          return;
        }
        var rf = ev.target.closest ? ev.target.closest('#cal-refresh') : null;
        if (rf) { loadCal(); }
      });
    })();