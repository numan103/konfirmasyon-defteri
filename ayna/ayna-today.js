/* AYNA Today tab - J3 */
Ayna.tabs.today = { render: function (c) { renderToday(c); } };
var _W_HH = ['heyecanlı','coşkulu','umutlu','gururlu','meraklı','odaklı','neşeli','istekli'];
var _W_HU = ['gergin','öfkeli','kaygılı','stresli','sabırsız','huzursuz','sinirli','panik içinde'];
var _W_LU = ['yorgun','üzgün','kırgın','bıkkın','yalnız','hayal kırıklıgına uğramış','tükkenmiş','umutsuz'];
var _W_LH = ['sakin','huzurlu','rahat','minnettar','dingin','memnun','güvende','dinlenmiş'];

function _qw(p, e) {
  if (e >= 0 && p >= 0) return _W_HH;
  if (e >= 0 && p < 0) return _W_HU;
  if (e < 0 && p < 0) return _W_LU;
  return _W_LH;
}

function _localHour() {
  try { return parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: 'numeric', hour12: false }).format(new Date()), 10); }
  catch (e) { return 12; }
}

function _goTab(name) {
  document.querySelectorAll('.ay-tabs button').forEach(function (b) { if (b.getAttribute('data-ay-tab') === name) b.click(); });
}

function renderToday(c) {
  c.innerHTML = '<div class="ay-card">' + Ayna.t('common.loading') + '</div>';
  var d = Ayna.today(), uid = Ayna.uid, sb = Ayna.sb();
  Promise.all([
    sb.from('ayna_people').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'pending'),
    sb.from('ayna_entries').select('*').eq('user_id', uid).eq('local_date', d).order('created_at', { ascending: true }),
    sb.from('ayna_people').select('id,display_name,ring,status').eq('user_id', uid).in('status', ['active','pending']).order('ring', { ascending: true }).order('display_name', { ascending: true }),
    sb.from('ayna_rules').select('id,if_text,then_text,domain').eq('user_id', uid).eq('is_active', true),
    sb.from('ayna_open_loops').select('id,person_id,kind,description,amount,due_date').eq('user_id', uid).eq('status', 'open'),
    sb.from('ayna_trades').select('id,symbol,direction,opened_at,pnl,planned,emotions').eq('user_id', uid).eq('local_date', d).order('opened_at', { ascending: true }),
    sb.from('ayna_chat_messages').select('risk').eq('user_id', uid).eq('role', 'assistant').eq('risk', 'crisis').limit(1)
  ]).then(function (r) {
    var pendingCount = r[0].count || 0, entries = r[1].data || [], people = r[2].data || [];
    var rules = r[3].data || [], loops = r[4].data || [], trades = r[5].data || [];
    var hasCrisis = r[6].data && r[6].data.length > 0;
    var morning = null, evening = null;
    entries.forEach(function (e) { if (e.kind === 'morning' && !morning) morning = e; if (e.kind === 'evening' && !evening) evening = e; });
    var h = '';
    if (pendingCount > 0) h += '<div class="ay-card"><p>' + Ayna.t('today.pending_notice', { n: pendingCount }) + '</p><button class="btn" id="ay-go-map">' + Ayna.t('today.pending_link') + '</button></div>';
    if (hasCrisis) h += _cardCrisis();
    h += _cardMorning(morning);
    h += evening ? _cardEveningDone(evening) : _cardEveningForm(people, rules);
    h += _cardQuickNote();
    h += _cardLoops(loops);
    h += _cardTrades(trades);
    c.innerHTML = h;
    _bindPending(c);
    _bindMorning(c, d);
    if (evening) _bindEveningEdit(c, d, evening); else _bindEveningForm(c, d, people, rules);
    _bindQuickNote(c, d);
    _bindLoops(c);
    _bindTrades(c, d);
    if (evening) _checkEveningReflection(c, evening);
  }).catch(function () { c.innerHTML = '<div class="ay-card">' + Ayna.t('err.default') + '</div>'; });
}

function _bindPending(c) {
  var b = c.querySelector('#ay-go-map');
  if (b) b.addEventListener('click', function () { _goTab('map'); });
}

function _cardCrisis() {
  return '<div class="ay-card" style="border-left:3px solid var(--red);border-radius:0">' +
    '<h4>' + Ayna.t('crisis.title') + '</h4><p>' + Ayna.t('crisis.body') + '</p></div>';
}

function _checkEveningReflection(c, evening) {
  var sb = Ayna.sb();
  sb.from('ayna_insights').select('id').eq('user_id', Ayna.uid).eq('kind', 'daily').eq('source_entry_id', evening.id).limit(1)
    .then(function (res) {
      if (res.data && res.data.length > 0) return;
      var el = c.querySelector('#ay-ev');
      if (!el) return;
      var btnHtml = '<div style="margin-top:8px"><button class="btn" id="ay-ref-retry">' + Ayna.t('common.retry') + '</button></div>';
      el.insertAdjacentHTML('beforeend', btnHtml);
      var rb = c.querySelector('#ay-ref-retry');
      if (rb) rb.addEventListener('click', function () {
        rb.disabled = true;
        Ayna.api('reflect', { entry_id: evening.id, kind: 'daily' }).then(function (res) {
          var html = '<div class="ay-card"><h4>' + Ayna.t('today.reflection_title') + '</h4>' + Ayna.md(res.insight.body) + '</div>';
          if (res.risk === 'crisis') html += _cardCrisis();
          el.insertAdjacentHTML('beforeend', html);
        }).catch(function () { Ayna.flash(Ayna.errText('model_failed')); rb.disabled = false; });
      });
    }).catch(function () {});
}

function _cardMorning(entry) {
  if (entry) return '<div class="ay-card"><h4>' + Ayna.t('today.morning_saved') + '</h4><p>' + Ayna.esc(entry.intention || '') + '</p></div>';
  if (_localHour() >= 14) return '';
  return '<div class="ay-card"><h4>' + Ayna.t('today.morning_title') + '</h4><p>' + Ayna.t('today.morning_prompt') + '</p>' +
    '<input type="text" class="ay-inp" id="ay-mi" maxlength="200" placeholder="' + Ayna.esc(Ayna.t('today.morning_placeholder')) + '">' +
    '<button class="btn solid" id="ay-ms">' + Ayna.t('common.save') + '</button></div>';
}

function _bindMorning(c, d) {
  var b = c.querySelector('#ay-ms'), i = c.querySelector('#ay-mi');
  if (!b || !i) return;
  b.addEventListener('click', function () {
    var v = i.value.trim();
    if (!v) return;
    b.disabled = true;
    Ayna.sb().from('ayna_entries').insert({ user_id: Ayna.uid, kind: 'morning', local_date: d, intention: v, processed_at: new Date().toISOString() })
      .then(function () { renderToday(c); })
      .catch(function (e) { b.disabled = false; Ayna.flash(Ayna.errText(e.code || 'default')); });
  });
}

function _cardEveningDone(entry) {
  var h = '<div class="ay-card"><h4>' + Ayna.t('today.evening_done') + '</h4>';
  if (entry.pleasantness != null && entry.energy != null)
    h += '<p>' + Ayna.t('today.compass_value', { p: Ayna.num(entry.pleasantness, true), e: Ayna.num(entry.energy, true) }) + '</p>';
  if (entry.mood_words && entry.mood_words.length)
    h += '<p>' + Ayna.t('label.words') + ': ' + entry.mood_words.map(function (w) { return Ayna.esc(w); }).join(', ') + '</p>';
  h += '<button class="btn" id="ay-ee">' + Ayna.t('common.edit') + '</button></div>';
  return h;
}

function _bindEveningEdit(c, d, entry) {
  var b = c.querySelector('#ay-ee');
  if (!b) return;
  b.addEventListener('click', function () {
    Promise.all([
      Ayna.sb().from('ayna_people').select('id,display_name,ring,status').eq('user_id', Ayna.uid).in('status', ['active','pending']).order('ring', { ascending: true }).order('display_name', { ascending: true }),
      Ayna.sb().from('ayna_rules').select('id,if_text,then_text,domain').eq('user_id', Ayna.uid).eq('is_active', true),
      Ayna.sb().from('ayna_entry_people').select('person_id').eq('user_id', Ayna.uid).eq('entry_id', entry.id),
      Ayna.sb().from('ayna_rule_checks').select('rule_id,result').eq('user_id', Ayna.uid).eq('local_date', d)
    ]).then(function (r) {
      var ppl = r[0].data || [], rls = r[1].data || [];
      var tagged = (r[2].data || []).map(function (x) { return x.person_id; });
      var checks = {}; (r[3].data || []).forEach(function (rc) { checks[rc.rule_id] = rc.result; });
      _renderEveningForm(c, d, ppl, rls, entry, tagged, checks);
    });
  });
}

function _cardEveningForm(people, rules) {
  return '<div class="ay-card"><h4>' + Ayna.t('today.evening_title') + '</h4><div id="ay-ev">' +
    '<p>' + Ayna.t('today.compass_title') + '</p></div></div>';
}

function _renderEveningForm(c, d, people, rules, entry, taggedIds, checkMap) {
  var isEdit = !!entry;
  var p = isEdit ? entry.pleasantness : null, e = isEdit ? entry.energy : null;
  var words = isEdit && entry.mood_words ? entry.mood_words.slice() : [];
  var sleep = isEdit && entry.sleep_hours != null ? entry.sleep_hours : '';
  var body = isEdit && entry.body ? entry.body : '';
  var h = '<div class="ay-card"><h4>' + Ayna.t('today.evening_title') + '</h4>';
  h += '<div id="ay-ev">';
  h += '<p>' + Ayna.t('today.compass_title') + '</p>';
  h += '<div id="ay-compass-box" class="ay-compass" tabindex="0" role="group" aria-label="' + Ayna.esc(Ayna.t('today.compass_title')) + '"></div>';
  h += '<p id="ay-cv" style="margin:6px 0 0"></p>';
  h += '<p style="font-size:12px;color:var(--text-3)">' + Ayna.t('today.compass_help') + '</p>';
  h += '<p style="margin-top:10px">' + Ayna.t('today.words_title') + '</p>';
  h += '<div id="ay-wc" style="display:flex;flex-wrap:wrap;gap:4px"></div>';
  h += '<div style="margin-top:6px;display:flex;gap:4px;align-items:center">' +
    '<input type="text" class="ay-inp" id="ay-wi" maxlength="20" placeholder="' + Ayna.esc(Ayna.t('today.words_custom')) + '" style="flex:1">' +
    '<button class="btn" id="ay-wa">' + Ayna.t('today.words_add') + '</button></div>';
  h += '<p style="margin-top:10px">' + Ayna.t('today.sleep') + ' <span style="font-size:12px;color:var(--text-3)">(' + Ayna.t('common.optional') + ')</span></p>';
  h += '<input type="number" class="ay-inp" id="ay-sl" min="0" max="24" step="0.5" value="' + Ayna.esc(String(sleep)) + '">';
  h += '<p style="margin-top:10px">' + Ayna.t('today.people_title') + '</p><div id="ay-pc" style="display:flex;flex-wrap:wrap;gap:4px"></div>';
  h += '<div style="margin-top:4px;display:flex;gap:4px;align-items:center">' +
    '<input type="text" class="ay-inp" id="ay-pi" maxlength="60" placeholder="' + Ayna.esc(Ayna.t('today.people_add')) + '" style="flex:1">' +
    '<button class="btn" id="ay-pa">' + Ayna.t('today.people_add') + '</button></div>';
  h += '<p style="margin-top:10px">' + Ayna.t('today.rules_title') + '</p><div id="ay-rc"></div>';
  h += '<p style="margin-top:10px">' + Ayna.t('today.note_title') + '</p>';
  h += '<textarea class="ay-inp" id="ay-nb" maxlength="5000" rows="4" placeholder="' + Ayna.esc(Ayna.t('today.note_placeholder')) + '">' + Ayna.esc(body) + '</textarea>';
  h += '<button class="btn solid" id="ay-cd">' + Ayna.t('today.close_day') + '</button>';
  h += '</div></div>';
  c.innerHTML = h;
  _initCompass(c, p, e, function (np, ne) { p = np; e = ne; });
  _initWords(c, p, e, words);
  _initPeopleChips(c, people, taggedIds);
  _initRules(c, rules, checkMap);
  c.querySelector('#ay-cd').addEventListener('click', function () {
    _closeDay(c, d, entry, p, e, words, people, rules, checkMap);
  });
}

function _initCompass(c, initP, initE, onChange) {
  var box = c.querySelector('#ay-compass-box');
  var valEl = c.querySelector('#ay-cv');
  if (!box || !valEl) return;
  var hasP = initP != null, curP = hasP ? initP : 0, curE = hasP ? initE : 0;

  function draw() {
    var m = '<div style="position:relative;width:100%;max-width:320px;aspect-ratio:1;touch-action:none;cursor:crosshair">';
    m += '<div style="position:absolute;inset:0;display:grid;grid-template:1fr 1fr/1fr 1fr;pointer-events:none">';
    m += '<div style="background:var(--red-soft)"></div><div style="background:var(--amber-soft)"></div>';
    m += '<div style="background:var(--blue-hover)"></div><div style="background:var(--green-soft)"></div></div>';
    m += '<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--border)"></div>';
    m += '<div style="position:absolute;top:50%;left:0;right:0;height:1px;background:var(--border)"></div>';
    m += '<span style="position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--text-3)">' + Ayna.t('today.axis_pleasant') + '</span>';
    m += '<span style="position:absolute;left:2px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--text-3)">' + Ayna.t('today.axis_unpleasant') + '</span>';
    m += '<span style="position:absolute;top:2px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--text-3)">' + Ayna.t('today.axis_high') + '</span>';
    m += '<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--text-3)">' + Ayna.t('today.axis_low') + '</span>';
    if (hasP) {
      var px = ((curP + 5) / 10) * 100, py = ((5 - curE) / 10) * 100;
      m += '<div style="position:absolute;left:' + px + '%;top:' + py + '%;width:14px;height:14px;border-radius:50%;background:var(--text);border:2px solid var(--bg);transform:translate(-50%,-50%);pointer-events:none"></div>';
    }
    m += '</div>';
    box.innerHTML = m;
    valEl.textContent = hasP ? Ayna.t('today.compass_value', { p: Ayna.num(curP, true), e: Ayna.num(curE, true) }) : '';
    var pad = box.querySelector('div');
    if (pad) {
      pad.addEventListener('click', function (ev) {
        var r = pad.getBoundingClientRect();
        curP = Math.max(-5, Math.min(5, Math.round((ev.clientX - r.left) / r.width * 10 - 5)));
        curE = Math.max(-5, Math.min(5, Math.round(5 - (ev.clientY - r.top) / r.height * 10)));
        hasP = true; draw(); onChange(curP, curE);
      });
    }
  }

  box.addEventListener('keydown', function (ev) {
    var k = ev.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'ArrowDown') {
      ev.preventDefault();
      if (!hasP) { hasP = true; curP = 0; curE = 0; }
      if (k === 'ArrowRight') curP = Math.min(5, curP + 1);
      if (k === 'ArrowLeft') curP = Math.max(-5, curP - 1);
      if (k === 'ArrowUp') curE = Math.min(5, curE + 1);
      if (k === 'ArrowDown') curE = Math.max(-5, curE - 1);
      draw(); onChange(curP, curE);
    }
  });
  draw();
}

function _initWords(c, p, e, selected) {
  var wc = c.querySelector('#ay-wc');
  var wi = c.querySelector('#ay-wi');
  var wa = c.querySelector('#ay-wa');
  if (!wc) return;
  var qp = (p != null && e != null) ? _qw(p, e) : _W_HH;
  function drawChips() {
    var h = '';
    qp.forEach(function (w) {
      var on = selected.indexOf(w) >= 0;
      h += '<button class="chip' + (on ? ' on' : '') + '" data-aw="' + Ayna.esc(w) + '">' + Ayna.esc(w) + '</button>';
    });
    wc.innerHTML = h;
    wc.querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () {
        var w = b.getAttribute('data-aw');
        var idx = selected.indexOf(w);
        if (idx >= 0) { selected.splice(idx, 1); }
        else if (selected.length < 3) { selected.push(w); }
        drawChips();
      });
    });
  }
  drawChips();
  if (wa) {
    wa.addEventListener('click', function () {
      var v = (wi.value || '').trim();
      if (!v || v.length > 20 || selected.length >= 3) return;
      if (selected.indexOf(v) < 0) selected.push(v);
      wi.value = ''; drawChips();
    });
  }
}

function _initPeopleChips(c, people, taggedIds) {
  var pc = c.querySelector('#ay-pc');
  var pi = c.querySelector('#ay-pi');
  var pa = c.querySelector('#ay-pa');
  if (!pc) return;
  function drawChips() {
    var h = '';
    people.forEach(function (p) {
      var on = taggedIds.indexOf(p.id) >= 0;
      h += '<button class="chip' + (on ? ' on' : '') + '" data-ap="' + p.id + '">' + Ayna.esc(p.display_name) + '</button>';
    });
    pc.innerHTML = h;
    pc.querySelectorAll('.chip').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-ap');
        var idx = taggedIds.indexOf(id);
        if (idx >= 0) taggedIds.splice(idx, 1); else taggedIds.push(id);
        drawChips();
      });
    });
  }
  drawChips();
  if (pa) {
    pa.addEventListener('click', function () {
      var name = (pi.value || '').trim();
      if (!name || name.length > 60) return;
      pa.disabled = true;
      Ayna.sb().from('ayna_people').insert({ user_id: Ayna.uid, display_name: name, status: 'active', sector: 'other', ring: 3, created_by: 'user' })
        .select('id,display_name,ring,status').single()
        .then(function (r) {
          if (r.data) { people.push(r.data); taggedIds.push(r.data.id); }
          pi.value = ''; pa.disabled = false; drawChips();
        }).catch(function () { pa.disabled = false; Ayna.flash(Ayna.errText('default')); });
    });
  }
}

function _initRules(c, rules, checkMap) {
  var rc = c.querySelector('#ay-rc');
  if (!rc || !rules.length) { if (rc) rc.innerHTML = ''; return; }
  var h = '';
  rules.forEach(function (r) {
    h += '<div style="margin:6px 0"><p style="font-size:13px">' + Ayna.esc(r.if_text) + ' → ' + Ayna.esc(r.then_text) + '</p>';
    h += '<div style="display:flex;gap:4px">';
    ['kept', 'broken', 'na'].forEach(function (v) {
      var on = checkMap[r.id] === v;
      h += '<button class="chip' + (on ? ' on' : '') + '" data-ar="' + r.id + '" data-arv="' + v + '">' + Ayna.t('today.rule_' + v) + '</button>';
    });
    h += '</div></div>';
  });
  rc.innerHTML = h;
  rc.querySelectorAll('.chip').forEach(function (b) {
    b.addEventListener('click', function () {
      var rid = b.getAttribute('data-ar'), val = b.getAttribute('data-arv');
      if (checkMap[rid] === val) delete checkMap[rid]; else checkMap[rid] = val;
      _initRules(c, rules, checkMap);
    });
  });
}

function _closeDay(c, d, entry, p, e, words, people, rules, checkMap) {
  if (p == null || e == null) { Ayna.flash(Ayna.t('today.compass_required')); return; }
  var sb = Ayna.sb();
  var payload = {
    local_date: d, kind: 'evening', pleasantness: p, energy: e,
    mood_words: words, sleep_hours: (function () { var v = parseFloat(c.querySelector('#ay-sl').value); return isNaN(v) ? null : v; })(),
    body: (c.querySelector('#ay-nb') || {}).value || ''
  };
  var taggedIds = [];
  var pc = c.querySelector('#ay-pc');
  if (pc) pc.querySelectorAll('.chip.on').forEach(function (b) { taggedIds.push(b.getAttribute('data-ap')); });
  var savePeople = function (entryId) {
    return sb.from('ayna_entry_people').delete().eq('user_id', Ayna.uid).eq('entry_id', entryId).then(function () {
      if (!taggedIds.length) return;
      var rows = taggedIds.map(function (pid) { return { entry_id: entryId, person_id: pid, user_id: Ayna.uid }; });
      return sb.from('ayna_entry_people').insert(rows);
    });
  };
  var promise;
  if (entry) {
    payload.id = entry.id;
    promise = sb.from('ayna_entries').update(payload).eq('id', entry.id).eq('user_id', Ayna.uid).then(function () { return entry.id; });
  } else {
    payload.user_id = Ayna.uid;
    payload.processed_at = new Date().toISOString();
    promise = sb.from('ayna_entries').insert(payload).select('id').single().then(function (r) { return r.data.id; });
  }
  promise.then(function (entryId) {
    return savePeople(entryId).then(function () {
      var checks = [];
      Object.keys(checkMap).forEach(function (rid) {
        checks.push({ user_id: Ayna.uid, rule_id: rid, local_date: d, result: checkMap[rid], source: 'user' });
      });
      if (checks.length) return sb.from('ayna_rule_checks').upsert(checks, { onConflict: 'user_id,rule_id,local_date' });
    }).then(function () { return entryId; });
  }).then(function (entryId) {
    var ev = c.querySelector('#ay-ev');
    if (ev) ev.innerHTML = '<p>' + Ayna.t('today.processing') + '</p>';
    return Ayna.api('scribe', { entry_id: entryId }).then(function (scribeRes) {
      if (scribeRes.needs_reflection && scribeRes.reflection_kind) {
        return Ayna.api('reflect', { entry_id: entryId, kind: scribeRes.reflection_kind }).then(function (refRes) {
          var title = refRes.insight && refRes.insight.kind === 'instant' ? Ayna.t('today.instant_title') : Ayna.t('today.reflection_title');
          var html = '<div class="ay-card"><h4>' + title + '</h4>' + (refRes.insight ? Ayna.md(refRes.insight.body) : '') + '</div>';
          if (refRes.risk === 'crisis') html += _cardCrisis();
          if (ev) ev.insertAdjacentHTML('beforeend', html);
          renderToday(c);
        }).catch(function () { renderToday(c); });
      }
      renderToday(c);
    }).catch(function (err) {
      if (ev) ev.innerHTML = '<p>' + Ayna.t('err.scribe_failed') + '</p><button class="btn" id="ay-rs">' + Ayna.t('common.retry') + '</button>';
      var rb = c.querySelector('#ay-rs');
      if (rb) rb.addEventListener('click', function () {
        if (ev) ev.innerHTML = '<p>' + Ayna.t('today.processing') + '</p>';
        Ayna.api('scribe', { entry_id: entryId }).then(function (sr) {
          if (sr.needs_reflection && sr.reflection_kind) {
            return Ayna.api('reflect', { entry_id: entryId, kind: sr.reflection_kind }).then(function () { renderToday(c); }).catch(function () { renderToday(c); });
          }
          renderToday(c);
        }).catch(function () { Ayna.flash(Ayna.errText('scribe_failed')); });
      });
    });
  }).catch(function (err) { Ayna.flash(Ayna.errText(err.code || 'default')); });
}

function _cardQuickNote() {
  return '<div class="ay-card"><h4>' + Ayna.t('today.quick_note_title') + '</h4>' +
    '<textarea class="ay-inp" id="ay-qn" maxlength="5000" rows="3" placeholder="' + Ayna.esc(Ayna.t('today.quick_note_placeholder')) + '"></textarea>' +
    '<button class="btn solid" id="ay-qns">' + Ayna.t('common.save') + '</button></div>';
}

function _bindQuickNote(c, d) {
  var b = c.querySelector('#ay-qns'), ta = c.querySelector('#ay-qn');
  if (!b || !ta) return;
  b.addEventListener('click', function () {
    var v = ta.value.trim();
    if (!v) return;
    b.disabled = true;
    Ayna.sb().from('ayna_entries').insert({ user_id: Ayna.uid, kind: 'note', local_date: d, body: v, processed_at: new Date().toISOString() })
      .select('id').single()
      .then(function (r) { return Ayna.api('scribe', { entry_id: r.data.id }).then(function (sr) {
        if (sr.needs_reflection && sr.reflection_kind) {
          return Ayna.api('reflect', { entry_id: r.data.id, kind: sr.reflection_kind }).then(function (refRes) {
            renderToday(c);
            var content = c.querySelector('#ay-content');
            if (content && refRes.insight) {
              var title = refRes.reflection_kind === 'instant' ? Ayna.t('today.instant_title') : Ayna.t('today.reflection_title');
              var html = '<div class="ay-card"><h4>' + title + '</h4>' + Ayna.md(refRes.insight.body) + '</div>';
              if (refRes.risk === 'crisis') html += _cardCrisis();
              content.insertAdjacentHTML('beforeend', html);
            }
          }).catch(function () { renderToday(c); });
        }
        renderToday(c);
      }); })
      .catch(function (err) { b.disabled = false; Ayna.flash(Ayna.errText(err.code || 'default')); });
  });
}

function _cardLoops(loops) {
  var sorted = loops.slice().sort(function (a, b) {
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
    return 0;
  });
  if (sorted.length > 5) sorted = sorted.slice(0, 5);
  if (!sorted.length) return '<div class="ay-card"><h4>' + Ayna.t('today.loops_title') + '</h4><p>' + Ayna.t('today.loops_empty') + '</p></div>';
  var h = '<div class="ay-card"><h4>' + Ayna.t('today.loops_title') + '</h4>';
  sorted.forEach(function (l) {
    h += '<div style="margin:6px 0;padding:6px;border:1px solid var(--border);border-radius:var(--radius)">';
    h += '<span class="chip">' + Ayna.t('loop.' + l.kind) + '</span> ';
    h += Ayna.esc(l.description);
    if (l.amount) h += ' (' + Ayna.num(l.amount) + ')';
    if (l.due_date) h += ' <span style="font-size:12px;color:var(--text-3)">' + Ayna.t('label.due', { date: Ayna.fmtDate(l.due_date) }) + '</span>';
    h += ' <button class="btn" data-alc="' + l.id + '">' + Ayna.t('common.close') + '</button></div>';
  });
  h += '</div>';
  return h;
}

function _bindLoops(c) {
  c.querySelectorAll('[data-alc]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.getAttribute('data-alc');
      b.disabled = true;
      Ayna.sb().from('ayna_open_loops').update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', Ayna.uid)
        .then(function () { renderToday(c); })
        .catch(function () { b.disabled = false; Ayna.flash(Ayna.errText('default')); });
    });
  });
}

function _cardTrades(trades) {
  if (!trades || !trades.length) return '<div class="ay-card"><h4>' + Ayna.t('today.trades_title') + '</h4><p>' + Ayna.t('today.trades_empty') + '</p>' +
    '<button class="btn" id="ay-sync">' + Ayna.t('today.sync') + '</button></div>';
  var h = '<div class="ay-card"><h4>' + Ayna.t('today.trades_title') + '</h4>';
  trades.forEach(function (t) {
    h += '<div style="margin:4px 0"><strong>' + Ayna.esc(t.symbol || '?') + '</strong> ' + Ayna.t('direction.' + (t.direction || 'long')) + ' ';
    var pnlColor = t.pnl > 0 ? 'var(--green)' : t.pnl < 0 ? 'var(--red)' : '';
    h += Ayna.t('label.pnl') + ': <span style="color:' + pnlColor + '">' + Ayna.num(t.pnl) + '</span></div>';
  });
  h += '<button class="btn" id="ay-sync">' + Ayna.t('today.sync') + '</button></div>';
  return h;
}

function _bindTrades(c, d) {
  var b = c.querySelector('#ay-sync');
  if (!b) return;
  b.addEventListener('click', function () {
    b.disabled = true;
    Ayna.api('sync').then(function () { renderToday(c); })
      .catch(function (err) { b.disabled = false; Ayna.flash(Ayna.errText(err.code || 'default')); });
  });
}
