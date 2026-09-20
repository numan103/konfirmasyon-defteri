/* AYNA Settings tab - J9 FAZ 3+5 */
Ayna.tabs.settings = { render: function (c) { renderSettings(c); } };

function renderSettings(c) {
  c.innerHTML = '<div class="ay-card">' + Ayna.t('common.loading') + '</div>';
  var sb = Ayna.sb(), uid = Ayna.uid;
  Promise.all([
    sb.from('ayna_profiles').select('coach_tone').eq('user_id', uid).single(),
    sb.from('ayna_beliefs').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    sb.from('ayna_consents').select('*').eq('user_id', uid).order('created_at', { ascending: false })
  ]).then(function (r) {
    var profile = r[0].data || {};
    var beliefs = r[1].data || [];
    var consents = r[2].data || [];
    var h = '';
    h += _settingsTone(profile.coach_tone || 'mentor');
    h += _settingsBeliefs(beliefs);
    h += _settingsMeet();
    h += _settingsConsents(consents);
    h += _settingsExport();
    h += _settingsDelete();
    c.innerHTML = h;
    _bindTone(c, uid, profile);
    _bindBeliefs(c, uid, beliefs);
    _bindMeet(c, uid);
    _bindConsents(c, uid, consents);
    _bindExport(c, uid);
    _bindDelete(c, uid);
  }).catch(function () { c.innerHTML = '<div class="ay-card">' + Ayna.t('err.default') + '</div>'; });
}

function _settingsTone(current) {
  var tones = ['mentor', 'coach', 'friendly'];
  var h = '<div class="ay-card"><h4>' + Ayna.t('settings.tone_title') + '</h4>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">';
  tones.forEach(function (tone) {
    var on = tone === current;
    h += '<button class="btn' + (on ? ' solid' : '') + '" data-tone="' + tone + '">' +
      Ayna.t('tone.' + tone) + '<br><small>' + Ayna.t('tone.' + tone + '_desc') + '</small></button>';
  });
  h += '</div></div>';
  return h;
}

function _bindTone(c, uid, profile) {
  c.querySelectorAll('[data-tone]').forEach(function (b) {
    b.addEventListener('click', function () {
      var tone = b.getAttribute('data-tone');
      if (tone === profile.coach_tone) return;
      Ayna.sb().from('ayna_profiles').update({ coach_tone: tone }).eq('user_id', uid).then(function () {
        profile.coach_tone = tone;
        c.querySelectorAll('[data-tone]').forEach(function (x) { x.classList.remove('solid'); });
        b.classList.add('solid');
        Ayna.flash(Ayna.t('common.saved'));
      }).catch(function (e) { Ayna.flash(Ayna.errText(e.code || 'default')); });
    });
  });
}

function _settingsBeliefs(beliefs) {
  var h = '<div class="ay-card"><h4>' + Ayna.t('settings.beliefs_title') + '</h4>';
  h += '<p style="font-size:13px;color:var(--text-3)">' + Ayna.t('settings.beliefs_intro') + '</p>';
  var proposed = beliefs.filter(function (b) { return b.status === 'proposed'; });
  var confirmed = beliefs.filter(function (b) { return b.status === 'confirmed'; });
  var corrected = beliefs.filter(function (b) { return b.status === 'corrected'; });
  if (!proposed.length && !confirmed.length && !corrected.length) {
    h += '<p style="margin-top:8px;color:var(--text-3)">' + Ayna.t('settings.beliefs_empty') + '</p></div>';
    return h;
  }
  proposed.forEach(function (b) {
    h += '<div style="margin:10px 0;padding:8px;border:1px solid var(--border);border-radius:var(--radius)">';
    h += '<p>' + Ayna.esc(b.statement) + '</p>';
    if (b.evidence && b.evidence.length) {
      h += '<p style="font-size:12px;color:var(--text-3)">' + Ayna.t('coach.evidence', { n: b.evidence.length }) + '</p>';
    }
    h += '<div style="display:flex;gap:4px;margin-top:6px">';
    h += '<button class="btn solid" data-belief-action="confirm" data-belief-id="' + b.id + '">' + Ayna.t('settings.belief_confirm') + '</button>';
    h += '<button class="btn" data-belief-action="correct" data-belief-id="' + b.id + '">' + Ayna.t('settings.belief_correct') + '</button>';
    h += '<button class="btn" data-belief-action="reject" data-belief-id="' + b.id + '">' + Ayna.t('settings.belief_reject') + '</button>';
    h += '</div><div id="ay-bc-' + b.id + '"></div></div>';
  });
  confirmed.concat(corrected).forEach(function (b) {
    var label = b.status === 'confirmed' ? Ayna.t('belief.confirmed') : Ayna.t('belief.corrected');
    h += '<div style="margin:10px 0;padding:8px;border:1px solid var(--border);border-radius:var(--radius)">';
    h += '<p>' + Ayna.esc(b.status === 'corrected' && b.correction ? b.correction : b.statement) + '</p>';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-top:4px">';
    h += '<span class="chip">' + label + '</span>';
    h += '<button class="btn" data-belief-action="reject" data-belief-id="' + b.id + '">' + Ayna.t('settings.belief_reject') + '</button>';
    h += '</div></div>';
  });
  h += '</div>';
  return h;
}

function _bindBeliefs(c, uid, beliefs) {
  c.querySelectorAll('[data-belief-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.getAttribute('data-belief-action');
      var id = btn.getAttribute('data-belief-id');
      if (action === 'confirm') {
        btn.disabled = true;
        Ayna.sb().from('ayna_beliefs').update({ status: 'confirmed' }).eq('id', id).eq('user_id', uid)
          .then(function () { renderSettings(c); }).catch(function (e) { btn.disabled = false; Ayna.flash(Ayna.errText(e.code || 'default')); });
      } else if (action === 'reject') {
        btn.disabled = true;
        Ayna.sb().from('ayna_beliefs').update({ status: 'rejected' }).eq('id', id).eq('user_id', uid)
          .then(function () { renderSettings(c); }).catch(function (e) { btn.disabled = false; Ayna.flash(Ayna.errText(e.code || 'default')); });
      } else if (action === 'correct') {
        var container = c.querySelector('#ay-bc-' + id);
        if (container && !container.querySelector('input')) {
          container.innerHTML = '<div style="display:flex;gap:4px;margin-top:4px;align-items:center">' +
            '<input type="text" class="ay-inp" id="ay-bci-' + id + '" maxlength="200" placeholder="' + Ayna.esc(Ayna.t('settings.belief_correct_placeholder')) + '" style="flex:1">' +
            '<button class="btn solid" data-belief-action="confirm-correct" data-belief-id="' + id + '">' + Ayna.t('common.save') + '</button></div>';
          container.querySelector('[data-belief-action="confirm-correct"]').addEventListener('click', function () {
            var input = container.querySelector('#ay-bci-' + id);
            var val = input ? input.value.trim() : '';
            if (!val) return;
            Ayna.sb().from('ayna_beliefs').update({ status: 'corrected', correction: val }).eq('id', id).eq('user_id', uid)
              .then(function () { renderSettings(c); }).catch(function (e) { Ayna.flash(Ayna.errText(e.code || 'default')); });
          });
        }
      }
    });
  });
}

function _settingsMeet() {
  return '<div class="ay-card"><h4>' + Ayna.t('settings.meet') + '</h4>' +
    '<button class="btn solid" id="ay-settings-meet">' + Ayna.t('settings.meet') + '</button></div>';
}

function _bindMeet(c, uid) {
  var btn = c.querySelector('#ay-settings-meet');
  if (!btn) return;
  btn.addEventListener('click', function () {
    Ayna.sb().from('ayna_profiles').update({ onboarding_done: false }).eq('user_id', uid).then(function () {
      Ayna.render();
    }).catch(function (e) { Ayna.flash(Ayna.errText(e.code || 'default')); });
  });
}

function _settingsConsents(consents) {
  var kinds = ['age_18', 'service', 'sensitive_data', 'statistics'];
  var latest = {};
  kinds.forEach(function (k) {
    var found = consents.find(function (c) { return c.kind === k; });
    if (found) latest[k] = found;
  });
  var h = '<div class="ay-card"><h4>' + Ayna.t('settings.consents_title') + '</h4>';
  kinds.forEach(function (k) {
    var c = latest[k];
    var granted = c ? c.granted : false;
    var statusText = granted ? Ayna.t('settings.consent_on') : Ayna.t('settings.consent_off');
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin:8px 0;padding:8px;border:1px solid var(--border);border-radius:var(--radius)">';
    h += '<span>' + Ayna.t('consent.' + k) + '</span>';
    h += '<span class="chip">' + Ayna.esc(statusText) + '</span>';
    h += '</div>';
  });
  var statsGranted = latest.statistics ? latest.statistics.granted : false;
  h += '<div style="margin:12px 0">';
  h += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer">';
  h += '<input type="checkbox" id="ay-consent-stats"' + (statsGranted ? ' checked' : '') + '>';
  h += '<span>' + Ayna.t('settings.consent_stats_toggle') + '</span>';
  h += '</label></div></div>';
  return h;
}

function _bindConsents(c, uid, consents) {
  var cb = c.querySelector('#ay-consent-stats');
  if (!cb) return;
  cb.addEventListener('change', function () {
    cb.disabled = true;
    var granted = cb.checked;
    Ayna.sb().from('ayna_consents').insert({
      user_id: uid,
      kind: 'statistics',
      granted: granted,
      text_version: 'taslak-1'
    }).then(function () {
      cb.disabled = false;
      Ayna.flash(Ayna.t('common.saved'));
    }).catch(function (e) {
      cb.disabled = false;
      cb.checked = !granted;
      Ayna.flash(Ayna.errText(e.code || 'default'));
    });
  });
}

function _settingsExport() {
  var h = '<div class="ay-card"><h4>' + Ayna.t('settings.export_title') + '</h4>';
  h += '<p style="font-size:13px;color:var(--text-3)">' + Ayna.t('settings.export_body') + '</p>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">';
  h += '<button class="btn solid" id="ay-export-json">' + Ayna.t('settings.export_json') + '</button>';
  h += '<button class="btn" id="ay-export-obsidian">' + Ayna.t('settings.export_obsidian') + '</button>';
  h += '</div></div>';
  return h;
}

function _bindExport(c, uid) {
  var btnJson = c.querySelector('#ay-export-json');
  var btnObs = c.querySelector('#ay-export-obsidian');

  if (btnJson) {
    btnJson.addEventListener('click', function () {
      btnJson.disabled = true;
      btnJson.textContent = Ayna.t('settings.export_working');
      var tables = [
        'ayna_profiles', 'ayna_consents', 'ayna_entries', 'ayna_people', 'ayna_entry_people',
        'ayna_events', 'ayna_person_links', 'ayna_facts', 'ayna_open_loops', 'ayna_rules',
        'ayna_rule_checks', 'ayna_goals', 'ayna_decisions', 'ayna_insights', 'ayna_beliefs',
        'ayna_chat_messages', 'ayna_trades', 'ayna_expenses', 'ayna_usage'
      ];
      var result = {};
      var done = 0;
      tables.forEach(function (tbl) {
        _fetchAll(tbl, uid).then(function (rows) {
          result[tbl] = rows;
          done++;
          if (done === tables.length) _downloadJson(result);
        }).catch(function () {
          result[tbl] = [];
          done++;
          if (done === tables.length) _downloadJson(result);
        });
      });
    });
  }

  if (btnObs) {
    btnObs.addEventListener('click', function () {
      btnObs.disabled = true;
      btnObs.textContent = Ayna.t('settings.export_working');
      _loadJsZip().then(function () {
        return _buildObsidianZip(uid);
      }).then(function (zip) {
        return zip.generateAsync({ type: 'blob' });
      }).then(function (blob) {
        _downloadBlob(blob, 'ayna-obsidian-' + Ayna.today() + '.zip');
        btnObs.disabled = false;
        btnObs.textContent = Ayna.t('settings.export_obsidian');
      }).catch(function () {
        btnObs.disabled = false;
        btnObs.textContent = Ayna.t('settings.export_obsidian');
        Ayna.flash(Ayna.errText('default'));
      });
    });
  }
}

function _fetchAll(table, uid) {
  var PAGE = 1000;
  var sb = Ayna.sb();
  function loadPage(from) {
    return sb.from(table).select('*').eq('user_id', uid).range(from, from + PAGE - 1).then(function (r) {
      return r.data || [];
    });
  }
  return loadPage(0).then(function (first) {
    if (first.length < PAGE) return first;
    var all = first;
    function next() {
      return loadPage(all.length).then(function (rows) {
        if (!rows.length) return all;
        all = all.concat(rows);
        if (rows.length < PAGE) return all;
        return next();
      });
    }
    return next();
  });
}

function _downloadJson(tables) {
  var obj = { exported_at: new Date().toISOString(), version: 1, tables: tables };
  var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  _downloadBlob(blob, 'ayna-yedek-' + Ayna.today() + '.json');
  var btn = document.querySelector('#ay-export-json');
  if (btn) { btn.disabled = false; btn.textContent = Ayna.t('settings.export_json'); }
}

function _downloadBlob(blob, name) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _loadJsZip() {
  if (window.JSZip) return Promise.resolve();
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function _safeName(name) {
  var s = String(name || 'isimsiz').replace(/[\\/:*?"<>|#^\[\]]/g, '-').replace(/\s+/g, ' ').trim();
  if (s.length > 80) s = s.slice(0, 80);
  return s || 'isimsiz';
}

function _safeNameDedup(name, used) {
  var base = _safeName(name);
  var candidate = base;
  var n = 2;
  while (used[candidate]) {
    candidate = base + ' (' + n + ')';
    n++;
  }
  used[candidate] = true;
  return candidate;
}

function _buildObsidianZip(uid) {
  var JSZip = window.JSZip;
  var zip = new JSZip();
  var sb = Ayna.sb();
  var root = zip.folder('Ayna');
  var usedNames = {};
  var lang = Ayna.lang();

  return Promise.all([
    sb.from('ayna_people').select('*').eq('user_id', uid),
    sb.from('ayna_events').select('*').eq('user_id', uid),
    sb.from('ayna_facts').select('*').eq('user_id', uid),
    sb.from('ayna_open_loops').select('*').eq('user_id', uid),
    sb.from('ayna_person_links').select('*').eq('user_id', uid),
    sb.from('ayna_entries').select('*').eq('user_id', uid),
    sb.from('ayna_insights').select('*').eq('user_id', uid),
    sb.from('ayna_rules').select('*').eq('user_id', uid),
    sb.from('ayna_goals').select('*').eq('user_id', uid),
    sb.from('ayna_decisions').select('*').eq('user_id', uid),
    sb.from('ayna_entry_people').select('*').eq('user_id', uid),
    sb.from('ayna_trades').select('*').eq('user_id', uid)
  ]).then(function (res) {
    var people = (res[0].data || []);
    var events = (res[1].data || []);
    var facts = (res[2].data || []);
    var loops = (res[3].data || []);
    var links = (res[4].data || []);
    var entries = (res[5].data || []);
    var insights = (res[6].data || []);
    var rules = (res[7].data || []);
    var goals = (res[8].data || []);
    var decisions = (res[9].data || []);
    var entryPeople = (res[10].data || []);

    var personMap = {};
    people.forEach(function (p) { personMap[p.id] = p; });

    var entryPersonMap = {};
    entryPeople.forEach(function (ep) {
      if (!entryPersonMap[ep.entry_id]) entryPersonMap[ep.entry_id] = [];
      entryPersonMap[ep.entry_id].push(ep.person_id);
    });

    var eventsByPerson = {};
    events.forEach(function (e) {
      if (!e.person_id) return;
      if (!eventsByPerson[e.person_id]) eventsByPerson[e.person_id] = [];
      eventsByPerson[e.person_id].push(e);
    });

    var factsByPerson = {};
    facts.forEach(function (f) {
      if (!f.person_id) return;
      if (!factsByPerson[f.person_id]) factsByPerson[f.person_id] = [];
      factsByPerson[f.person_id].push(f);
    });

    var loopsByPerson = {};
    loops.forEach(function (l) {
      if (!l.person_id) return;
      if (!loopsByPerson[l.person_id]) loopsByPerson[l.person_id] = [];
      loopsByPerson[l.person_id].push(l);
    });

    var linksByPerson = {};
    links.forEach(function (l) {
      if (!linksByPerson[l.person_a]) linksByPerson[l.person_a] = [];
      if (!linksByPerson[l.person_b]) linksByPerson[l.person_b] = [];
      linksByPerson[l.person_a].push({ other: l.person_b, relation: l.relation });
      linksByPerson[l.person_b].push({ other: l.person_a, relation: l.relation });
    });

    var entriesByDate = {};
    entries.forEach(function (e) {
      if (!entriesByDate[e.local_date]) entriesByDate[e.local_date] = [];
      entriesByDate[e.local_date].push(e);
    });

    var TR = {
      morning: 'Sabah', evening: 'Akşam', note: 'Not',
      support_received: 'destek aldı', support_given: 'destek verdi',
      request: 'talep', lent_money: 'ödünç verdi', borrowed_money: 'ödünç aldı',
      conflict: 'çatışma', time_together: 'birlikte vakit',
      praise: 'övgü', criticism: 'eleştiri', promise: 'söz',
      other: 'diğer', family: 'aile', friends: 'arkadaşlar',
      work: 'iş', other_sector: 'diğer', trade: 'trade',
      relationships: 'ilişkiler', spending: 'harcama', general: 'genel'
    };

    people.forEach(function (p) {
      var sn = _safeNameDedup(p.display_name, usedNames);
      var events = eventsByPerson[p.id] || [];
      var pFacts = factsByPerson[p.id] || [];
      var pLoops = loopsByPerson[p.id] || [];
      var pLinks = linksByPerson[p.id] || [];

      var md = '---\n';
      md += 'iliski: ' + (p.relation || '') + '\n';
      md += 'alan: ' + (TR[p.sector] || p.sector || '') + '\n';
      md += 'halka: ' + (p.ring || 3) + '\n';
      md += 'ozellikler: [' + (p.traits || []).join(', ') + ']\n';
      md += '---\n\n';
      md += '# ' + p.display_name + '\n\n';
      if (p.notes) md += p.notes + '\n\n';

      if (events.length) {
        md += '## Olaylar\n';
        events.sort(function (a, b) { return a.local_date < b.local_date ? 1 : -1; });
        events.forEach(function (e) {
          md += '- [[' + e.local_date + ']] ' + (TR[e.event_type] || e.event_type) + ': ' + e.summary + ' (etki ' + e.impact + ')';
          if (e.is_closed) md += ', kapandı';
          md += '\n';
        });
        md += '\n';
      }

      if (pFacts.length) {
        md += '## Süren durumlar\n';
        pFacts.forEach(function (f) {
          md += '- ' + f.statement + ' (' + f.valid_from + ' – ' + (f.valid_to || 'devam ediyor') + ')\n';
        });
        md += '\n';
      }

      if (pLoops.length) {
        md += '## Açık uçlar\n';
        pLoops.forEach(function (l) {
          md += '- ' + l.description + ' (' + (l.status === 'open' ? 'açık' : 'kapalı') + ')\n';
        });
        md += '\n';
      }

      if (pLinks.length) {
        md += '## Bağlantılar\n';
        pLinks.forEach(function (lk) {
          var other = personMap[lk.other];
          if (other) md += '- [[' + _safeName(other.display_name) + ']]: ' + lk.relation + '\n';
        });
        md += '\n';
      }

      root.folder('Kisiler').file(sn + '.md', md);
    });

    var dates = Object.keys(entriesByDate).sort().reverse();
    var gunluk = root.folder('Gunluk');
    dates.forEach(function (date) {
      var dayEntries = entriesByDate[date];
      var md = '# ' + date + '\n\n';
      dayEntries.forEach(function (e) {
        md += '## ' + (TR[e.kind] || e.kind) + '\n';
        if (e.pleasantness != null) md += 'Hoşluk: ' + e.pleasantness + ', Enerji: ' + (e.energy != null ? e.energy : '?') + '\n';
        if (e.mood_words && e.mood_words.length) md += 'Kelimeler: ' + e.mood_words.join(', ') + '\n';
        if (e.sleep_hours != null) md += 'Uyku: ' + e.sleep_hours + '\n';
        if (e.intention) md += 'Niyet: ' + e.intention + '\n';
        var tagged = entryPersonMap[e.id] || [];
        if (tagged.length) {
          var names = tagged.map(function (pid) { var pp = personMap[pid]; return pp ? '[[' + _safeName(pp.display_name) + ']]' : ''; }).filter(Boolean);
          if (names.length) md += 'Kişiler: ' + names.join(', ') + '\n';
        }
        if (e.summary) md += 'Özet: ' + e.summary + '\n';
        if (e.good_moment) md += 'İyi an: ' + e.good_moment + '\n';
        if (e.body) md += '\n' + e.body + '\n';
        md += '\n';
      });
      gunluk.file(date + '.md', md);
    });

    var raporlar = root.folder('Raporlar');
    var usedReportNames = {};
    insights.forEach(function (ins) {
      var fileName = _safeNameDedup(ins.kind + '-' + ins.period_start, usedReportNames);
      var md = '# ' + ins.title + '\n\n';
      md += ins.body + '\n\n';
      if (ins.focus) md += 'Odak: ' + ins.focus + '\n';
      if (ins.evidence && ins.evidence.length) {
        var refs = ins.evidence.map(function (eid) {
          var entry = entries.find(function (en) { return en.id === eid; });
          return entry ? '[[' + entry.local_date + ']]' : '';
        }).filter(Boolean);
        if (refs.length) md += 'Dayanak: ' + refs.join(', ') + '\n';
      }
      raporlar.file(fileName + '.md', md);
    });

    var kurallarMd = '# Kurallar\n\n';
    rules.forEach(function (r) {
      kurallarMd += '- Eğer ' + r.if_text + ', o zaman ' + r.then_text;
      kurallarMd += ' (' + (TR[r.domain] || r.domain) + ', ' + (r.is_active ? 'etkin' : 'pasif') + ')';
      kurallarMd += '\n';
    });
    root.file('Kurallar.md', kurallarMd);

    var degerlerHedefler = '# Degerler ve hedefler\n\n';
    var activeGoals = goals.filter(function (g) { return g.is_active; });
    var values = activeGoals.filter(function (g) { return g.kind === 'value'; });
    var goalsList = activeGoals.filter(function (g) { return g.kind === 'goal'; });
    degerlerHedefler += '## Değerler\n';
    values.forEach(function (v) { degerlerHedefler += '- ' + v.text + '\n'; });
    degerlerHedefler += '\n## Hedefler\n';
    goalsList.forEach(function (g) { degerlerHedefler += '- ' + g.text + '\n'; });
    root.file('Degerler ve hedefler.md', degerlerHedefler);

    var kararlarMd = '# Kararlar\n\n';
    decisions.forEach(function (d) {
      kararlarMd += '## ' + d.title + '\n\n';
      kararlarMd += '- Tarih: ' + d.created_at.slice(0, 10) + '\n';
      kararlarMd += '- Gerekçe: ' + d.reasoning + '\n';
      if (d.feeling) kararlarMd += '- Duygu: ' + d.feeling + '\n';
      if (d.premortem) kararlarMd += '- Ön değerlendirme: ' + d.premortem + '\n';
      kararlarMd += '- Dönüş: ' + d.review_date + '\n';
      if (d.outcome) kararlarMd += '- Sonuç: ' + d.outcome + '\n';
      kararlarMd += '\n';
    });
    root.file('Kararlar.md', kararlarMd);

    return zip;
  });
}

function _settingsDelete() {
  var h = '<div class="ay-card"><h4>' + Ayna.t('settings.delete_title') + '</h4>';
  h += '<p style="font-size:13px;color:var(--text-3)">' + Ayna.t('settings.delete_body') + '</p>';
  h += '<div style="margin:12px 0">';
  h += '<label style="display:block;margin-bottom:4px">' + Ayna.t('settings.delete_confirm_label') + '</label>';
  h += '<div style="display:flex;gap:8px;align-items:center">';
  h += '<input type="text" class="ay-inp" id="ay-delete-input" maxlength="10" style="width:120px" autocomplete="off">';
  h += '<button class="btn danger" id="ay-delete-btn" disabled>' + Ayna.t('settings.delete_button') + '</button>';
  h += '</div></div></div>';
  return h;
}

function _bindDelete(c, uid) {
  var input = c.querySelector('#ay-delete-input');
  var btn = c.querySelector('#ay-delete-btn');
  if (!input || !btn) return;
  input.addEventListener('input', function () {
    btn.disabled = input.value !== 'SİL';
  });
  btn.addEventListener('click', function () {
    if (input.value !== 'SİL') return;
    btn.disabled = true;
    Ayna.sb().from('ayna_profiles').delete().eq('user_id', uid).then(function () {
      localStorage.removeItem('ayna.tab');
      Ayna.flash(Ayna.t('settings.deleted'));
      Ayna.render();
    }).catch(function (e) {
      btn.disabled = false;
      Ayna.flash(Ayna.errText(e.code || 'default'));
    });
  });
}
