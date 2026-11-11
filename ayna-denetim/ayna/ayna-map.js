/* AYNA Map tab - J5 */
Ayna.tabs.map = { render: function (c) { renderMap(c); } };

var _mapPeople = [];
var _mapPending = [];
var _mapEvents = [];
var _mapEntries = [];
var _mapSelected = null;
var _mapFormEdit = null;

function renderMap(c) {
  c.innerHTML = '<div class="ay-card">' + Ayna.t('common.loading') + '</div>';
  _mapSelected = null;
  var uid = Ayna.uid;
  var sb = Ayna.sb();
  var d90 = Ayna.addDays(Ayna.today(), -89);
  Promise.all([
    sb.from('ayna_people').select('*').eq('user_id', uid).eq('status', 'active'),
    sb.from('ayna_people').select('*').eq('user_id', uid).eq('status', 'pending'),
    sb.from('ayna_events').select('*').eq('user_id', uid).gte('local_date', d90).eq('is_closed', false),
    sb.from('ayna_entries').select('local_date,pleasantness').eq('user_id', uid).eq('kind', 'evening').not('pleasantness', 'is', null).gte('local_date', d90)
  ]).then(function (results) {
    _mapPeople = (results[0].data || []).sort(function (a, b) { return a.display_name.localeCompare(b.display_name, 'tr-TR'); });
    _mapPending = results[1].data || [];
    _mapEvents = results[2].data || [];
    _mapEntries = results[3].data || [];
    renderMapContent(c);
  }).catch(function () {
    c.innerHTML = '<div class="ay-card">' + Ayna.t('err.default') + '</div>';
  });
}

function renderMapContent(c) {
  var hasPeople = _mapPeople.length > 0;
  var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
  html += '<h3 style="margin:0;font-family:var(--font-display)">' + Ayna.t('map.title') + '</h3>';
  html += '<button class="btn solid" id="ay-map-add">' + Ayna.t('map.add_person') + '</button></div>';
  if (hasPeople) {
    html += '<div class="ay-map-wrap" id="ay-map-wrap"><div id="ay-map-svg-wrap"></div>';
    html += '<div id="ay-map-card" class="ay-map-card">' + Ayna.t('map.select_hint') + '</div></div>';
  } else {
    html += '<div class="ay-map-wrap"><div id="ay-map-svg-wrap"></div>';
    html += '<div class="ay-map-card">' + Ayna.t('map.select_hint') + '</div></div>';
  }
  if (_mapPending.length > 0) {
    html += '<div class="ay-card" style="margin-top:12px">';
    html += '<h4 style="margin:0 0 6px">' + Ayna.t('map.pending_title') + '</h4>';
    html += '<p style="margin:0 0 10px;font-size:13px;color:var(--text-2)">' + Ayna.t('map.pending_body') + '</p>';
    html += '<div id="ay-pending-list"></div></div>';
  }
  c.innerHTML = html;
  drawMap(document.getElementById('ay-map-svg-wrap'));
  document.getElementById('ay-map-add').addEventListener('click', function () { showPersonForm(null); });
  if (_mapPending.length > 0) renderPendingList(document.getElementById('ay-pending-list'));
  injectMapStyle();
}

function injectMapStyle() {
  if (document.getElementById('ay-map-style')) return;
  var s = document.createElement('style');
  s.id = 'ay-map-style';
  s.textContent = '.ay-map-wrap{display:flex;gap:16px;align-items:flex-start}'
    + '@media(max-width:899px){.ay-map-wrap{flex-direction:column}.ay-map-card{width:100%!important;min-width:0!important}}'
    + '.ay-map-card{width:380px;min-width:300px;flex-shrink:0}'
    + '.ay-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}'
    + '@media(max-width:480px){.ay-metrics{grid-template-columns:1fr}}';
  document.head.appendChild(s);
}
var _sectorCfg = {
  family: { start: -90, color: 'var(--green)' },
  friends: { start: 0, color: 'var(--acc-2)' },
  work: { start: 90, color: 'var(--blue-txt)' },
  other: { start: 180, color: 'var(--text-3)' }
};
var _ringR = { 1: 38, 2: 85, 3: 135 };

function drawMap(wrap) {
  if (!wrap) return;
  var svg = '<svg viewBox="0 0 360 380" class="ay-map">';
  svg += '<circle cx="180" cy="180" r="160" fill="none" stroke="var(--border)" stroke-width="1"/>';
  svg += '<circle cx="180" cy="180" r="110" fill="none" stroke="var(--border)" stroke-width="1"/>';
  svg += '<circle cx="180" cy="180" r="60" fill="none" stroke="var(--border)" stroke-width="1"/>';
  svg += '<line x1="180" y1="20" x2="180" y2="340" stroke="var(--border)" stroke-width="0.5"/>';
  svg += '<line x1="20" y1="180" x2="340" y2="180" stroke="var(--border)" stroke-width="0.5"/>';
  svg += '<circle cx="180" cy="180" r="16" fill="var(--card-2)" stroke="var(--border)" stroke-width="1"/>';
  svg += '<text x="180" y="184" text-anchor="middle" font-size="11" fill="var(--text)">' + Ayna.esc(Ayna.t('map.center')) + '</text>';
  svg += '<text x="330" y="30" text-anchor="start" font-size="11" fill="var(--text-3)">' + Ayna.esc(Ayna.t('sector.family')) + '</text>';
  svg += '<text x="330" y="336" text-anchor="start" font-size="11" fill="var(--text-3)">' + Ayna.esc(Ayna.t('sector.friends')) + '</text>';
  svg += '<text x="30" y="336" text-anchor="end" font-size="11" fill="var(--text-3)">' + Ayna.esc(Ayna.t('sector.work')) + '</text>';
  svg += '<text x="30" y="30" text-anchor="end" font-size="11" fill="var(--text-3)">' + Ayna.esc(Ayna.t('sector.other')) + '</text>';

  if (_mapPeople.length === 0) {
    svg += '</svg>';
    svg += '<p style="text-align:center;font-size:13px;color:var(--text-3);margin:8px 0 0">' + Ayna.esc(Ayna.t('map.empty')) + '</p>';
    wrap.innerHTML = svg;
    addMapLegend(wrap);
    return;
  }

  var groups = {};
  _mapPeople.forEach(function (p) {
    var key = p.sector + '_' + p.ring;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  Object.keys(groups).forEach(function (key) {
    var parts = key.split('_');
    var sector = parts[0];
    var ring = Number(parts[1]);
    var cfg = _sectorCfg[sector];
    var r = _ringR[ring];
    var items = groups[key];
    var n = items.length;
    items.forEach(function (p, i) {
      var angleDeg = cfg.start + (i + 1) * 90 / (n + 1);
      var angleRad = angleDeg * Math.PI / 180;
      var rr = r + (n > 6 && i % 2 === 1 ? 12 : 0);
      var x = 180 + rr * Math.cos(angleRad);
      var y = 180 + rr * Math.sin(angleRad);
      var isSel = _mapSelected && _mapSelected.id === p.id;
      var met = calcMetrics(p.id);
      var warn = met.warning;
      var pr = isSel ? 12 : (warn ? 11 : 7);
      var sc = isSel ? 'var(--pc)' : (warn ? 'var(--amber)' : 'none');
      var sw = isSel ? 2 : (warn ? 1.5 : 0);
      var fill = isSel ? 'none' : cfg.color;
      var label = p.display_name.length > 10 ? p.display_name.slice(0, 10) + '\u2026' : p.display_name;
      var cosA = Math.cos(angleRad);
      var lx = cosA >= 0 ? x + 11 : x - 11;
      var anchor = cosA >= 0 ? 'start' : 'end';
      var al = Ayna.esc(p.display_name + ', ' + Ayna.t('sector.' + p.sector) + ', ' + Ayna.t('ring.' + p.ring));
      svg += '<g role="button" tabindex="0" aria-label="' + al + '" data-pid="' + p.id + '">';
      svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + pr + '" fill="' + fill + '" stroke="' + sc + '" stroke-width="' + sw + '"/>';
      if (n <= 12) {
        svg += '<text x="' + lx.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="' + anchor + '" font-size="11" fill="var(--text-2)">' + Ayna.esc(label) + '</text>';
      }
      svg += '</g>';
    });
  });

  svg += '</svg>';
  wrap.innerHTML = svg;
  wrap.querySelectorAll('[data-pid]').forEach(function (g) {
    var pid = g.getAttribute('data-pid');
    g.addEventListener('click', function () { selectPerson(pid); });
    g.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPerson(pid); }
    });
  });
  addMapLegend(wrap);
}

function addMapLegend(wrap) {
  var d = document.createElement('div');
  d.style.cssText = 'margin-top:8px;font-size:12px;color:var(--text-3)';
  var h = '';
  ['family', 'friends', 'work', 'other'].forEach(function (s) {
    h += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + _sectorCfg[s].color + ';margin-right:4px;vertical-align:middle"></span>' + Ayna.esc(Ayna.t('sector.' + s)) + '&nbsp;&nbsp;';
  });
  h += '<br>' + Ayna.esc(Ayna.t('map.legend_rings')) + '<br>' + Ayna.esc(Ayna.t('map.legend_warning'));
  d.innerHTML = h;
  wrap.appendChild(d);
}

function selectPerson(pid) {
  var p = _mapPeople.find(function (x) { return x.id === pid; });
  if (!p) return;
  _mapSelected = p;
  showPersonCard(p);
  drawMap(document.getElementById('ay-map-svg-wrap'));
}
function calcMetrics(personId) {
  var W = _mapEvents.filter(function (e) { return e.person_id === personId; });
  var n = W.length;
  var avgImpact = null;
  var requestRatio = null;
  var reciprocity = null;
  var moodDiff = null;
  var warning = false;
  if (n > 0) {
    var sumI = 0;
    W.forEach(function (e) { sumI += (e.impact || 0); });
    avgImpact = Math.round(sumI / n * 10) / 10;
    var reqCount = 0;
    W.forEach(function (e) { if (e.event_type === 'request' || e.event_type === 'lent_money') reqCount++; });
    if (n >= 4) requestRatio = Math.round(reqCount / n * 100);
    var received = 0, given = 0;
    W.forEach(function (e) {
      if (e.event_type === 'support_received' || e.event_type === 'praise' || e.event_type === 'borrowed_money') received++;
      if (e.event_type === 'support_given' || e.event_type === 'request' || e.event_type === 'lent_money') given++;
    });
    if (received + given >= 3) {
      var a = Math.round(100 * received / (received + given));
      reciprocity = { a: a, v: 100 - a };
    }
    var eventDates = {};
    W.forEach(function (e) { eventDates[e.local_date] = true; });
    var D = Object.keys(eventDates);
    if (D.length >= 3) {
      var matchingEntries = _mapEntries.filter(function (en) { return eventDates[en.local_date]; });
      if (matchingEntries.length >= 3) {
        var sumM = 0;
        matchingEntries.forEach(function (en) { sumM += en.pleasantness; });
        var avgM = sumM / matchingEntries.length;
        var allSum = 0;
        _mapEntries.forEach(function (en) { allSum += en.pleasantness; });
        var allAvg = allSum / _mapEntries.length;
        moodDiff = Math.round((avgM - allAvg) * 10) / 10;
      }
    }
    if (n >= 4 && (requestRatio >= 50 || avgImpact <= -1)) warning = true;
  }
  return { n: n, avgImpact: avgImpact, requestRatio: requestRatio, reciprocity: reciprocity, moodDiff: moodDiff, warning: warning };
}

function showPersonCard(p) {
  var cardEl = document.getElementById('ay-map-card');
  if (!cardEl) return;
  var events = _mapEvents.filter(function (e) { return e.person_id === p.id; });
  var met = calcMetrics(p.id);
  var lastSeen = null;
  events.forEach(function (e) { if (!lastSeen || e.local_date > lastSeen) lastSeen = e.local_date; });
  var html = '';
  html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">';
  html += '<h3 style="margin:0;font-family:var(--font-display)">' + Ayna.esc(p.display_name) + '</h3>';
  if (p.relation) html += '<span style="font-size:12px;color:var(--text-2)">' + Ayna.esc(p.relation) + '</span>';
  html += '</div>';
  html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">';
  html += '<span class="ay-chip" style="cursor:default">' + Ayna.esc(Ayna.t('sector.' + p.sector)) + '</span>';
  html += '<span class="ay-chip" style="cursor:default">' + Ayna.esc(Ayna.t('ring.' + p.ring)) + '</span>';
  html += '</div>';
  if (p.traits && p.traits.length) {
    html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">';
    p.traits.forEach(function (tr) { html += '<span class="ay-chip" style="cursor:default;font-size:11px">' + Ayna.esc(tr) + '</span>'; });
    html += '</div>';
  }
  if (lastSeen) html += '<p style="margin:0 0 10px;font-size:12px;color:var(--text-3)">' + Ayna.t('map.last_seen', { when: Ayna.ago(lastSeen) }) + '</p>';
  html += '<div class="ay-metrics">';
  html += '<div class="ay-kpi"><div class="k-lbl">' + Ayna.t('map.metric_events') + '</div><div class="k-val">' + met.n + '</div></div>';
  html += '<div class="ay-kpi"><div class="k-lbl">' + Ayna.t('map.metric_impact') + '</div><div class="k-val">' + (met.avgImpact != null ? Ayna.num(met.avgImpact, true) : Ayna.t('common.dash')) + '</div></div>';
  html += '<div class="ay-kpi"><div class="k-lbl">' + Ayna.t('map.metric_request') + '</div><div class="k-val">' + (met.requestRatio != null ? '%' + met.requestRatio : Ayna.t('common.dash')) + '</div></div>';
  html += '<div class="ay-kpi"><div class="k-lbl">' + Ayna.t('map.metric_reciprocity') + '</div><div class="k-val">' + (met.reciprocity ? Ayna.t('map.metric_reciprocity_value', { a: met.reciprocity.a, v: met.reciprocity.v }) : Ayna.t('common.dash')) + '</div></div>';
  html += '<div class="ay-kpi"><div class="k-lbl">' + Ayna.t('map.metric_mood') + '</div><div class="k-val">' + (met.moodDiff != null ? Ayna.t('map.metric_mood_value', { d: Ayna.num(met.moodDiff, true) }) : Ayna.t('common.dash')) + '</div></div>';
  html += '</div>';
  if (met.warning) {
    html += '<div class="ay-card" style="border-left:3px solid var(--amber);border-radius:0;margin-bottom:10px">';
    if (met.requestRatio != null && met.requestRatio >= 50) {
      var k = events.filter(function (e) { return e.event_type === 'request' || e.event_type === 'lent_money'; }).length;
      html += '<p style="margin:0 0 4px;font-size:13px">' + Ayna.esc(Ayna.t('map.warning_request', { n: met.n, k: k })) + '</p>';
    }
    if (met.avgImpact != null && met.avgImpact <= -1) {
      html += '<p style="margin:0 0 4px;font-size:13px">' + Ayna.esc(Ayna.t('map.warning_impact', { x: Ayna.num(met.avgImpact, true) })) + '</p>';
    }
    html += '<p style="margin:0;font-size:11px;color:var(--text-3)">' + Ayna.esc(Ayna.t('map.warning_note')) + '</p>';
    html += '</div>';
  }
  html += '<h4 style="margin:12px 0 4px">' + Ayna.t('map.events_title') + '</h4>';
  html += '<p style="margin:0 0 6px;font-size:11px;color:var(--text-3)">' + Ayna.esc(Ayna.t('map.event_close_hint')) + '</p>';
  var sorted = events.slice().sort(function (a, b) { return b.local_date > a.local_date ? 1 : b.local_date < a.local_date ? -1 : 0; });
  var shown = sorted.slice(0, 20);
  if (shown.length === 0) {
    html += '<p style="font-size:13px;color:var(--text-3)">' + Ayna.esc(Ayna.t('map.events_empty')) + '</p>';
  } else {
    shown.forEach(function (ev) {
      var cls = ev.is_closed ? 'ay-closed' : '';
      html += '<div class="' + cls + '" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">';
      html += '<span style="color:var(--text-3)">' + Ayna.fmtDate(ev.local_date) + '</span> ';
      html += '<span style="font-weight:600">' + Ayna.esc(Ayna.t('event.' + ev.event_type)) + '</span>';
      if (ev.is_closed) html += '<span class="ay-closed-tag">' + Ayna.esc(Ayna.t('map.event_closed')) + '</span>';
      html += '<br>' + Ayna.esc(ev.summary);
      html += ' <span style="font-size:11px;color:var(--text-3)">' + Ayna.t('label.impact', { x: Ayna.num(ev.impact, true) }) + '</span>';
      html += '<div style="margin-top:4px">';
      if (ev.is_closed) {
        html += '<button class="btn" data-reopen="' + ev.id + '">' + Ayna.t('common.reopen') + '</button> ';
      } else {
        html += '<button class="btn" data-closeev="' + ev.id + '">' + Ayna.t('common.close') + '</button> ';
      }
      html += '</div></div>';
    });
  }
  html += '<div id="ay-map-facts"></div>';
  html += '<div id="ay-map-loops"></div>';
  html += '<div id="ay-map-links"></div>';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">';
  html += '<button class="btn" id="ay-card-edit">' + Ayna.t('common.edit') + '</button> ';
  html += '<button class="btn" id="ay-card-archive">' + Ayna.t('map.archive_person') + '</button> ';
  html += '<button class="btn danger" id="ay-card-delete">' + Ayna.t('common.delete') + '</button>';
  html += '</div>';
  cardEl.innerHTML = html;
  var uid = Ayna.uid;
  var sb = Ayna.sb();
  cardEl.querySelectorAll('[data-closeev]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var eid = btn.getAttribute('data-closeev');
      sb.from('ayna_events').update({ is_closed: true, closed_at: new Date().toISOString() }).eq('id', eid).eq('user_id', uid).then(function () {
        var ev = _mapEvents.find(function (x) { return x.id === eid; });
        if (ev) { ev.is_closed = true; ev.closed_at = new Date().toISOString(); }
        showPersonCard(_mapSelected);
        drawMap(document.getElementById('ay-map-svg-wrap'));
      });
    });
  });
  cardEl.querySelectorAll('[data-reopen]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var eid = btn.getAttribute('data-reopen');
      sb.from('ayna_events').update({ is_closed: false, closed_at: null }).eq('id', eid).eq('user_id', uid).then(function () {
        var ev = _mapEvents.find(function (x) { return x.id === eid; });
        if (ev) { ev.is_closed = false; ev.closed_at = null; }
        showPersonCard(_mapSelected);
        drawMap(document.getElementById('ay-map-svg-wrap'));
      });
    });
  });
  document.getElementById('ay-card-edit').addEventListener('click', function () { showPersonForm(p); });
  document.getElementById('ay-card-archive').addEventListener('click', function () {
    sb.from('ayna_people').update({ status: 'archived' }).eq('id', p.id).eq('user_id', uid).then(function () {
      _mapPeople = _mapPeople.filter(function (x) { return x.id !== p.id; });
      _mapSelected = null;
      renderMapContent(cardEl.parentElement.parentElement);
    });
  });
  document.getElementById('ay-card-delete').addEventListener('click', function () {
    if (!confirm(Ayna.t('common.confirm_delete'))) return;
    sb.from('ayna_people').delete().eq('id', p.id).eq('user_id', uid).then(function () {
      _mapPeople = _mapPeople.filter(function (x) { return x.id !== p.id; });
      _mapSelected = null;
      renderMapContent(cardEl.parentElement.parentElement);
    });
  });
  loadCardFacts(p);
  loadCardLoops(p);
  loadCardLinks(p);
}
function loadCardFacts(p) {
  var el = document.getElementById('ay-map-facts');
  if (!el) return;
  Ayna.sb().from('ayna_facts').select('*').eq('user_id', Ayna.uid).eq('person_id', p.id).is('valid_to', null).then(function (res) {
    var facts = res.data || [];
    if (!facts.length) { el.innerHTML = ''; return; }
    var h = '<h4 style="margin:12px 0 4px">' + Ayna.t('map.facts_title') + '</h4>';
    facts.forEach(function (f) {
      h += '<div style="padding:4px 0;font-size:13px;border-bottom:1px solid var(--border)">';
      h += Ayna.esc(f.statement) + ' <span style="font-size:11px;color:var(--text-3)">' + Ayna.fmtDate(f.valid_from) + '</span>';
      h += ' <button class="btn" data-endfact="' + f.id + '" style="font-size:11px">' + Ayna.t('map.fact_end') + '</button>';
      h += '</div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-endfact]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Ayna.sb().from('ayna_facts').update({ valid_to: Ayna.today() }).eq('id', btn.getAttribute('data-endfact')).eq('user_id', Ayna.uid).then(function () {
          loadCardFacts(p);
        });
      });
    });
  });
}

function loadCardLoops(p) {
  var el = document.getElementById('ay-map-loops');
  if (!el) return;
  Ayna.sb().from('ayna_open_loops').select('*').eq('user_id', Ayna.uid).eq('person_id', p.id).eq('status', 'open').then(function (res) {
    var loops = res.data || [];
    if (!loops.length) { el.innerHTML = ''; return; }
    var h = '<h4 style="margin:12px 0 4px">' + Ayna.t('map.loops_title') + '</h4>';
    loops.forEach(function (lo) {
      h += '<div style="padding:4px 0;font-size:13px;border-bottom:1px solid var(--border)">';
      h += Ayna.esc(Ayna.t('loop.' + lo.kind)) + ': ' + Ayna.esc(lo.description);
      if (lo.due_date) h += ' <span style="font-size:11px;color:var(--text-3)">' + Ayna.t('label.due', { date: Ayna.fmtDate(lo.due_date) }) + '</span>';
      h += ' <button class="btn" data-closeloop="' + lo.id + '" style="font-size:11px">' + Ayna.t('common.close') + '</button>';
      h += '</div>';
    });
    el.innerHTML = h;
    el.querySelectorAll('[data-closeloop]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Ayna.sb().from('ayna_open_loops').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', btn.getAttribute('data-closeloop')).eq('user_id', Ayna.uid).then(function () {
          loadCardLoops(p);
        });
      });
    });
  });
}

function loadCardLinks(p) {
  var el = document.getElementById('ay-map-links');
  if (!el) return;
  Ayna.sb().from('ayna_person_links').select('*,person_a:ayna_people!person_a(id,display_name),person_b:ayna_people!person_b(id,display_name)').eq('user_id', Ayna.uid).or('person_a.eq.' + p.id + ',person_b.eq.' + p.id).then(function (res) {
    var links = res.data || [];
    if (!links.length) { el.innerHTML = ''; return; }
    var h = '<h4 style="margin:12px 0 4px">' + Ayna.t('map.links_title') + '</h4>';
    links.forEach(function (lk) {
      var otherName = '';
      if (lk.person_a && lk.person_a.id === p.id && lk.person_b) otherName = lk.person_b.display_name;
      else if (lk.person_b && lk.person_b.id === p.id && lk.person_a) otherName = lk.person_a.display_name;
      h += '<div style="padding:3px 0;font-size:13px">' + Ayna.esc(otherName) + ' \u2014 ' + Ayna.esc(lk.relation) + '</div>';
    });
    el.innerHTML = h;
  });
}

function renderPendingList(container) {
  if (!container) return;
  var uid = Ayna.uid;
  var sb = Ayna.sb();
  var html = '';
  _mapPending.forEach(function (p) {
    html += '<div style="padding:8px 0;border-bottom:1px solid var(--border)" id="ay-pend-' + p.id + '">';
    html += '<strong>' + Ayna.esc(p.display_name) + '</strong>';
    if (p.relation) html += ' <span style="font-size:12px;color:var(--text-2)">(' + Ayna.esc(p.relation) + ')</span>';
    html += '<div style="font-size:12px;color:var(--text-3)" id="ay-pend-src-' + p.id + '"></div>';
    html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">';
    html += '<button class="btn solid" data-pconfirm="' + p.id + '">' + Ayna.t('common.confirm') + '</button>';
    html += '<button class="btn" data-pmerge="' + p.id + '">' + Ayna.t('map.merge') + '</button>';
    html += '<button class="btn danger" data-pdelete="' + p.id + '">' + Ayna.t('common.delete') + '</button>';
    html += '</div>';
    html += '<div id="ay-pend-opts-' + p.id + '"></div>';
    html += '</div>';
  });
  container.innerHTML = html;
  _mapPending.forEach(function (p) {
    if (!p.source_entry_id) return;
    sb.from('ayna_entries').select('summary').eq('id', p.source_entry_id).eq('user_id', uid).maybeSingle().then(function (res) {
      if (res && res.data && res.data.summary) {
        var el = document.getElementById('ay-pend-src-' + p.id);
        if (el) el.innerHTML = Ayna.esc(Ayna.t('map.pending_from', { summary: res.data.summary }));
      }
    });
  });
  container.querySelectorAll('[data-pconfirm]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pid = btn.getAttribute('data-pconfirm');
      var optsEl = document.getElementById('ay-pend-opts-' + pid);
      if (!optsEl) return;
      var fHtml = '<div style="margin-top:8px">';
      fHtml += '<label style="font-size:12px">' + Ayna.t('map.form_sector') + '</label> ';
      fHtml += '<select class="ay-sel" id="ay-psec-' + pid + '" style="width:auto;display:inline-block">';
      ['family', 'friends', 'work', 'other'].forEach(function (s) { fHtml += '<option value="' + s + '">' + Ayna.t('sector.' + s) + '</option>'; });
      fHtml += '</select> ';
      fHtml += '<label style="font-size:12px">' + Ayna.t('map.form_ring') + '</label> ';
      fHtml += '<select class="ay-sel" id="ay-pring-' + pid + '" style="width:auto;display:inline-block">';
      [1, 2, 3].forEach(function (r) { fHtml += '<option value="' + r + '">' + Ayna.t('ring.' + r) + '</option>'; });
      fHtml += '</select><br>';
      fHtml += '<label style="font-size:12px">' + Ayna.t('map.form_relation') + '</label><br>';
      fHtml += '<input class="ay-inp" id="ay-prel-' + pid + '" placeholder="' + Ayna.esc(Ayna.t('map.form_relation_placeholder')) + '"><br>';
      fHtml += '<button class="btn solid" id="ay-pok-' + pid + '">' + Ayna.t('common.confirm') + '</button>';
      fHtml += '</div>';
      optsEl.innerHTML = fHtml;
      document.getElementById('ay-pok-' + pid).addEventListener('click', function () {
        var sec = document.getElementById('ay-psec-' + pid).value;
        var ring = Number(document.getElementById('ay-pring-' + pid).value);
        var rel = document.getElementById('ay-prel-' + pid).value.trim();
        sb.from('ayna_people').update({ status: 'active', sector: sec, ring: ring, relation: rel || null }).eq('id', pid).eq('user_id', uid).then(function () {
          _mapPending = _mapPending.filter(function (x) { return x.id !== pid; });
          return sb.from('ayna_people').select('*').eq('user_id', uid).eq('status', 'active');
        }).then(function (res) {
          _mapPeople = (res.data || []).sort(function (a, b) { return a.display_name.localeCompare(b.display_name, 'tr-TR'); });
          renderMapContent(container.parentElement);
        });
      });
    });
  });
  container.querySelectorAll('[data-pmerge]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pid = btn.getAttribute('data-pmerge');
      var optsEl = document.getElementById('ay-pend-opts-' + pid);
      if (!optsEl) return;
      var fHtml = '<div style="margin-top:8px"><label style="font-size:12px">' + Ayna.t('map.merge_select') + '</label><br>';
      fHtml += '<select class="ay-sel" id="ay-pmkeep-' + pid + '" style="width:100%;margin:4px 0">';
      _mapPeople.forEach(function (ap) {
        fHtml += '<option value="' + ap.id + '">' + Ayna.esc(ap.display_name) + ' (' + Ayna.t('sector.' + ap.sector) + ')</option>';
      });
      fHtml += '</select>';
      fHtml += '<button class="btn solid" id="ay-pmok-' + pid + '">' + Ayna.t('common.confirm') + '</button></div>';
      optsEl.innerHTML = fHtml;
      document.getElementById('ay-pmok-' + pid).addEventListener('click', function () {
        var keepId = document.getElementById('ay-pmkeep-' + pid).value;
        sb.rpc('ayna_merge_people', { keep_id: keepId, drop_id: pid }).then(function () {
          _mapPending = _mapPending.filter(function (x) { return x.id !== pid; });
          return sb.from('ayna_people').select('*').eq('user_id', uid).eq('status', 'active');
        }).then(function (res) {
          _mapPeople = (res.data || []).sort(function (a, b) { return a.display_name.localeCompare(b.display_name, 'tr-TR'); });
          return sb.from('ayna_events').select('*').eq('user_id', uid).gte('local_date', Ayna.addDays(Ayna.today(), -89)).eq('is_closed', false);
        }).then(function (res) {
          _mapEvents = res.data || [];
          renderMapContent(container.parentElement);
        });
      });
    });
  });
  container.querySelectorAll('[data-pdelete]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pid = btn.getAttribute('data-pdelete');
      if (!confirm(Ayna.t('common.confirm_delete'))) return;
      sb.from('ayna_people').delete().eq('id', pid).eq('user_id', uid).then(function () {
        _mapPending = _mapPending.filter(function (x) { return x.id !== pid; });
        renderMapContent(container.parentElement);
      });
    });
  });
}
function showPersonForm(person) {
  _mapFormEdit = person;
  var isNew = !person;
  var cardEl = document.getElementById('ay-map-card');
  if (!cardEl) return;
  var name = person ? person.display_name : '';
  var aliases = person && person.aliases ? person.aliases.join(', ') : '';
  var relation = person ? (person.relation || '') : '';
  var sector = person ? person.sector : 'other';
  var ring = person ? person.ring : 3;
  var traits = person && person.traits ? person.traits.join(', ') : '';
  var notes = person ? (person.notes || '') : '';
  var html = '<h4 style="margin:0 0 10px">' + Ayna.t(isNew ? 'map.form_title_new' : 'map.form_title_edit') + '</h4>';
  html += '<label style="font-size:12px;font-weight:600">' + Ayna.t('map.form_name') + '</label>';
  html += '<input class="ay-inp" id="ay-fname" value="' + Ayna.esc(name) + '" maxlength="60"><br>';
  html += '<label style="font-size:12px;font-weight:600">' + Ayna.t('map.form_aliases') + '</label>';
  html += '<input class="ay-inp" id="ay-faliases" value="' + Ayna.esc(aliases) + '"><br>';
  html += '<label style="font-size:12px;font-weight:600">' + Ayna.t('map.form_relation') + '</label>';
  html += '<input class="ay-inp" id="ay-frelation" value="' + Ayna.esc(relation) + '" maxlength="40" placeholder="' + Ayna.esc(Ayna.t('map.form_relation_placeholder')) + '"><br>';
  html += '<label style="font-size:12px;font-weight:600">' + Ayna.t('map.form_sector') + '</label>';
  html += '<select class="ay-sel" id="ay-fsector">';
  ['family', 'friends', 'work', 'other'].forEach(function (s) {
    html += '<option value="' + s + '"' + (s === sector ? ' selected' : '') + '>' + Ayna.t('sector.' + s) + '</option>';
  });
  html += '</select><br>';
  html += '<label style="font-size:12px;font-weight:600">' + Ayna.t('map.form_ring') + '</label>';
  html += '<select class="ay-sel" id="ay-firing">';
  [1, 2, 3].forEach(function (r) {
    html += '<option value="' + r + '"' + (r === ring ? ' selected' : '') + '>' + Ayna.t('ring.' + r) + '</option>';
  });
  html += '</select><br>';
  html += '<label style="font-size:12px;font-weight:600">' + Ayna.t('map.form_traits') + '</label>';
  html += '<input class="ay-inp" id="ay-ftraits" value="' + Ayna.esc(traits) + '"><br>';
  html += '<label style="font-size:12px;font-weight:600">' + Ayna.t('map.form_notes') + '</label>';
  html += '<textarea class="ay-ta" id="ay-fnotes" maxlength="1000">' + Ayna.esc(notes) + '</textarea><br>';
  html += '<div style="display:flex;gap:6px;margin-top:8px">';
  html += '<button class="btn solid" id="ay-fsave">' + Ayna.t('common.save') + '</button> ';
  html += '<button class="btn" id="ay-fcancel">' + Ayna.t('common.cancel') + '</button>';
  html += '</div>';
  cardEl.innerHTML = html;
  document.getElementById('ay-fsave').addEventListener('click', function () {
    var vname = document.getElementById('ay-fname').value.trim();
    if (!vname) { Ayna.flash(Ayna.t('map.form_name_required')); return; }
    var valiases = document.getElementById('ay-faliases').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 10);
    var vrel = document.getElementById('ay-frelation').value.trim() || null;
    var vsec = document.getElementById('ay-fsector').value;
    var vring = Number(document.getElementById('ay-firing').value);
    var vtraits = document.getElementById('ay-ftraits').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 10);
    var vnotes = document.getElementById('ay-fnotes').value.trim() || null;
    var uid = Ayna.uid;
    var sb = Ayna.sb();
    var payload = { display_name: vname, aliases: valiases, relation: vrel, sector: vsec, ring: vring, traits: vtraits, notes: vnotes };
    var promise;
    if (_mapFormEdit) {
      promise = sb.from('ayna_people').update(payload).eq('id', _mapFormEdit.id).eq('user_id', uid);
    } else {
      payload.user_id = uid;
      payload.status = 'active';
      payload.created_by = 'user';
      promise = sb.from('ayna_people').insert(payload);
    }
    promise.then(function () {
      _mapFormEdit = null;
      return sb.from('ayna_people').select('*').eq('user_id', uid).eq('status', 'active');
    }).then(function (res) {
      _mapPeople = (res.data || []).sort(function (a, b) { return a.display_name.localeCompare(b.display_name, 'tr-TR'); });
      _mapSelected = null;
      renderMapContent(cardEl.parentElement.parentElement);
    }).catch(function (e) { Ayna.flash(Ayna.errText(e.code || 'default')); });
  });
  document.getElementById('ay-fcancel').addEventListener('click', function () {
    _mapFormEdit = null;
    if (_mapSelected) {
      showPersonCard(_mapSelected);
    } else {
      _mapSelected = null;
      renderMapContent(cardEl.parentElement.parentElement);
    }
  });
}