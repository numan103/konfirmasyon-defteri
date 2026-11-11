/* AYNA core - J1 + J2 */
window.Ayna = (function () {
  var _profile = null;
  var _uid = null;
  var P = 'ay-';
  var I18N = window.AYNA_I18N || { tr: {}, en: {} };

  function sb() { return AUTH.client; }
  function lang() {
    try { return (window.LANG === 'en') ? 'en' : 'tr'; } catch (e) { return 'tr'; }
  }
  function t(key, vars) {
    var d = I18N[lang()] || I18N.tr || {};
    var v = d[key] || (I18N.tr && I18N.tr[key]) || key;
    if (vars) { Object.keys(vars).forEach(function (k) { v = v.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]); }); }
    return v;
  }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function md(s) {
    return esc(s).split('\n').map(function (line) {
      if (line.indexOf('## ') === 0) return '<h4>' + line.slice(3) + '</h4>';
      return line;
    }).join('<br>');
  }
  function today() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function addDays(iso, n) { var p = iso.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00Z')); } catch (e) { return iso; }
  }
  function ago(iso) { return iso === today() ? t('common.today') : t('common.days_ago', { n: Math.round((Date.now() - new Date(iso + 'T12:00:00Z').getTime()) / 86400000) }); }
  function num(x, signed) { if (x == null || isNaN(x)) return '\u2014'; var s = Number(x).toLocaleString(lang() === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 1 }); return (signed && Number(x) > 0 ? '+' : '') + s; }

  function flash(msg) {
    var el = document.getElementById('ayna-flash');
    if (!el) { el = document.createElement('div'); el.id = 'ayna-flash'; el.className = P + 'flash'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add(P + 'on');
    clearTimeout(flash._t); flash._t = setTimeout(function () { el.classList.remove(P + 'on'); }, 4000);
  }

  function errText(code) { return t('err.' + code) || t('err.default'); }

  async function api(action, payload) {
    var session = await sb().auth.getSession();
    var token = session && session.data && session.data.session ? session.data.session.access_token : null;
    if (!token) throw { code: 'unauthorized' };
    var r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    var json = await r.json().catch(function () { return null; });
    if (!r.ok || !json || json.error) throw { code: (json && json.error) || 'default' };
    return json;
  }

  var tabs = {};

  function openEntry(id) {
    try { Ayna._archiveEntry = id; } catch (e) {}
    var tabBtns = document.querySelectorAll('.' + P + 'tabs button');
    tabBtns.forEach(function (b) { if (b.getAttribute('data-' + P + 'tab') === 'archive') b.click(); });
  }

  function renderSetup(root) {
    if (_profile) {
      sb().from('ayna_consents').select('kind, granted, created_at')
        .eq('user_id', _uid).in('kind', ['age_18', 'service', 'sensitive_data'])
        .order('created_at', { ascending: false })
        .then(function (res) {
          var rows = res && res.data ? res.data : [];
          var latest = {};
          rows.forEach(function (r) { if (!latest[r.kind]) latest[r.kind] = r; });
          var allGranted = ['age_18', 'service', 'sensitive_data'].every(function (k) {
            return latest[k] && latest[k].granted;
          });
          if (allGranted) { renderToneStep(root); } else { renderConsentStep(root); }
        }).catch(function () { renderConsentStep(root); });
    } else {
      renderConsentStep(root);
    }
  }

  function renderConsentStep(root) {
    root.innerHTML = '<div class="' + P + 'card"><h3>' + t('ob.welcome_title') + '</h3><p>' + t('ob.welcome_body') + '</p>' +
      '<p style="margin-top:8px;font-weight:600">' + t('ob.consent_title') + '</p>' +
      '<div style="margin-top:12px">' +
      '<label style="display:block;margin:6px 0"><input type="checkbox" id="ay-c1"> ' + t('ob.consent_age_18') + '</label>' +
      '<label style="display:block;margin:6px 0"><input type="checkbox" id="ay-c2"> ' + t('ob.consent_service') + '</label>' +
      '<label style="display:block;margin:6px 0"><input type="checkbox" id="ay-c3"> ' + t('ob.consent_sensitive_data') + '</label>' +
      '<label style="display:block;margin:6px 0"><input type="checkbox" id="ay-c4"> ' + t('ob.consent_statistics') + '</label>' +
      '<p style="font-size:12px;color:var(--text-3)">' + t('ob.consent_draft') + '</p>' +
      '<button class="btn solid" id="ay-ob-next">' + t('common.continue') + '</button></div></div>';
    document.getElementById('ay-ob-next').addEventListener('click', function () {
      if (!document.getElementById('ay-c1').checked || !document.getElementById('ay-c2').checked || !document.getElementById('ay-c3').checked) {
        flash(t('ob.consent_required')); return;
      }
      var profileData = { user_id: _uid, onboarding_done: false };
      sb().from('ayna_profiles').upsert(profileData, { onConflict: 'user_id' }).then(function () {
        var consents = [
          { user_id: _uid, kind: 'age_18', granted: document.getElementById('ay-c1').checked, text_version: 'taslak-1' },
          { user_id: _uid, kind: 'service', granted: document.getElementById('ay-c2').checked, text_version: 'taslak-1' },
          { user_id: _uid, kind: 'sensitive_data', granted: document.getElementById('ay-c3').checked, text_version: 'taslak-1' },
          { user_id: _uid, kind: 'statistics', granted: document.getElementById('ay-c4').checked, text_version: 'taslak-1' }
        ];
        return sb().from('ayna_consents').insert(consents);
      }).then(function () {
        renderToneStep(root);
      }).catch(function (e) { flash(errText(e.code || 'default')); });
    });
  }

  function renderToneStep(root) {
    root.innerHTML = '<div class="' + P + 'card"><h3>' + t('ob.tone_title') + '</h3>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">' +
      '<button class="btn" data-tone="mentor">' + t('tone.mentor') + '<br><small>' + t('tone.mentor_desc') + '</small></button>' +
      '<button class="btn" data-tone="coach">' + t('tone.coach') + '<br><small>' + t('tone.coach_desc') + '</small></button>' +
      '<button class="btn" data-tone="friendly">' + t('tone.friendly') + '<br><small>' + t('tone.friendly_desc') + '</small></button>' +
      '</div><button class="btn solid" id="ay-tone-ok">' + t('common.continue') + '</button></div>';
    var selected = 'mentor';
    root.querySelectorAll('[data-tone]').forEach(function (b) {
      b.addEventListener('click', function () {
        selected = b.getAttribute('data-tone');
        root.querySelectorAll('[data-tone]').forEach(function (x) { x.classList.remove('solid'); });
        b.classList.add('solid');
      });
    });
    root.querySelector('[data-tone="mentor"]').classList.add('solid');
    document.getElementById('ay-tone-ok').addEventListener('click', function () {
      sb().from('ayna_profiles').update({ coach_tone: selected }).eq('user_id', _uid).then(function () {
        _profile = _profile || {}; _profile.coach_tone = selected;
        renderMeetStep(root);
      }).catch(function (e) { flash(errText(e.code || 'default')); });
    });
  }

  function renderMeetStep(root) {
    root.innerHTML = '<div class="' + P + 'card"><h3>' + t('ob.meet_title') + '</h3><p>' + t('ob.meet_body') + '</p>' +
      '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
      '<button class="btn solid" id="ay-ob-meet-start">' + t('ob.meet_start') + '</button>' +
      '<button class="btn" id="ay-ob-meet-later">' + t('ob.meet_later') + '</button>' +
      '</div></div>';
    document.getElementById('ay-ob-meet-start').addEventListener('click', function () {
      renderMeetingView(root);
    });
    document.getElementById('ay-ob-meet-later').addEventListener('click', function () {
      sb().from('ayna_profiles').update({ onboarding_done: true }).eq('user_id', _uid).then(function () {
        _profile.onboarding_done = true;
        renderApp(document.getElementById('ayna-root'));
      }).catch(function (e) { flash(errText(e.code || 'default')); });
    });
  }

  function renderMeetingView(root) {
    root.innerHTML = '<div class="' + P + 'card"><h3>' + t('ob.meet_title') + '</h3>' +
      '<div id="ay-ob-chat" style="max-height:60vh;overflow-y:auto;margin:12px 0"></div>' +
      '<div style="display:flex;gap:4px;align-items:center">' +
      '<textarea class="ay-inp" id="ay-ob-input" rows="2" maxlength="4000" placeholder="' + esc(t('coach.placeholder')) + '" style="flex:1"></textarea>' +
      '<button class="btn solid" id="ay-ob-send">' + t('coach.send') + '</button>' +
      '</div>' +
      '<div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center">' +
      '<button class="btn solid" id="ay-ob-finish" disabled>' + t('ob.meet_finish') + '</button>' +
      '<span id="ay-ob-finish-hint" style="font-size:12px;color:var(--text-3)">' + t('ob.meet_finish_hint') + '</span>' +
      '</div></div>';
    var chatEl = document.getElementById('ay-ob-chat');
    var inputEl = document.getElementById('ay-ob-input');
    var sendBtn = document.getElementById('ay-ob-send');
    var finishBtn = document.getElementById('ay-ob-finish');

    function loadMessages() {
      return sb().from('ayna_chat_messages').select('*').eq('user_id', _uid).eq('mode', 'onboarding').order('created_at', { ascending: true }).then(function (res) {
        return res.data || [];
      }).catch(function () { return []; });
    }

    function renderMessages(msgs) {
      var h = '';
      msgs.forEach(function (m) {
        var isUser = m.role === 'user';
        var style = isUser ? 'margin-left:auto;background:var(--acc-soft)' : 'margin-right:auto;background:var(--card-2)';
        h += '<div style="' + style + ';max-width:80%;padding:8px 12px;border-radius:var(--radius);margin:4px 0;white-space:pre-wrap">' +
          esc(m.content) + '</div>';
      });
      chatEl.innerHTML = h;
      chatEl.scrollTop = chatEl.scrollHeight;
      var userCount = msgs.filter(function (m) { return m.role === 'user'; }).length;
      finishBtn.disabled = userCount < 3;
    }

    loadMessages().then(function (msgs) {
      if (msgs.length === 0) {
        var firstMsg = t('ob.meet_first_message');
        return sb().from('ayna_chat_messages').insert({ user_id: _uid, mode: 'onboarding', role: 'user', content: firstMsg })
          .then(function () { return loadMessages(); });
      }
      return msgs;
    }).then(function (msgs) {
      renderMessages(msgs);

      function sendMsg() {
        var v = inputEl.value.trim();
        if (!v) return;
        sendBtn.disabled = true;
        inputEl.disabled = true;
        sb().from('ayna_chat_messages').insert({ user_id: _uid, mode: 'onboarding', role: 'user', content: v })
          .then(function () {
            inputEl.value = '';
            return api('coach', { message: v, mode: 'onboarding' });
          }).then(function (res) {
            return loadMessages();
          }).then(function (msgs) {
            renderMessages(msgs);
            sendBtn.disabled = false;
            inputEl.disabled = false;
            inputEl.focus();
          }).catch(function () {
            sendBtn.disabled = false;
            inputEl.disabled = false;
            flash(errText('model_failed'));
          });
      }

      sendBtn.addEventListener('click', sendMsg);
      inputEl.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendMsg(); }
      });

      finishBtn.addEventListener('click', function () {
        if (finishBtn.disabled) return;
        finishBtn.disabled = true;
        var hintEl = document.getElementById('ay-ob-finish-hint');
        if (hintEl) hintEl.textContent = t('ob.summary_loading');
        api('onboarding-summary').then(function (res) {
          renderSummaryView(root, res.proposal);
        }).catch(function () {
          finishBtn.disabled = false;
          if (hintEl) hintEl.textContent = t('ob.meet_finish_hint');
          flash(errText('model_failed'));
        });
      });
    });
  }

  function renderSummaryView(root, proposal) {
    if (!proposal) { renderApp(document.getElementById('ayna-root')); return; }
    var people = proposal.people || [];
    var values = proposal.values || [];
    var goals = proposal.goals || [];
    var rules = proposal.rules || [];

    function checkboxList(items, prefix) {
      var h = '';
      items.forEach(function (item, i) {
        var id = prefix + '-' + i;
        var text = typeof item === 'string' ? item : (item.if_text ? item.if_text + ' → ' + item.then_text : item.name || '');
        h += '<label style="display:block;margin:4px 0"><input type="checkbox" checked data-ob-check="' + id + '"> ' + esc(text) + '</label>';
      });
      return h;
    }

    var h = '<div class="' + P + 'card"><h3>' + t('ob.summary_title') + '</h3><p>' + t('ob.summary_body') + '</p>';
    if (proposal.display_name) h += '<p style="margin-top:8px"><strong>' + esc(proposal.display_name) + '</strong></p>';

    h += '<h4 style="margin-top:12px">' + t('ob.summary_people') + '</h4>';
    people.forEach(function (p, i) {
      h += '<div style="margin:6px 0;padding:6px;border:1px solid var(--border);border-radius:var(--radius)">';
      h += '<label><input type="checkbox" checked data-ob-check="people-' + i + '"> ' + esc(p.name) + '</label>';
      h += '<div style="display:flex;gap:4px;margin-top:4px">';
      h += '<select class="ay-inp" data-ob-sel="sector-' + i + '" style="flex:1">';
      ['family', 'friends', 'work', 'other'].forEach(function (s) {
        h += '<option value="' + s + '"' + (p.sector === s ? ' selected' : '') + '>' + t('sector.' + s) + '</option>';
      });
      h += '</select>';
      h += '<select class="ay-inp" data-ob-sel="ring-' + i + '" style="flex:1">';
      [1, 2, 3].forEach(function (r) {
        h += '<option value="' + r + '"' + (p.ring === r ? ' selected' : '') + '>' + t('ring.' + r) + '</option>';
      });
      h += '</select></div></div>';
    });

    if (values.length) {
      h += '<h4 style="margin-top:12px">' + t('ob.summary_values') + '</h4>';
      h += checkboxList(values, 'values');
    }
    if (goals.length) {
      h += '<h4 style="margin-top:12px">' + t('ob.summary_goals') + '</h4>';
      h += checkboxList(goals, 'goals');
    }
    if (rules.length) {
      h += '<h4 style="margin-top:12px">' + t('ob.summary_rules') + '</h4>';
      h += checkboxList(rules, 'rules');
    }

    h += '<button class="btn solid" id="ay-ob-save" style="margin-top:12px">' + t('ob.summary_save') + '</button></div>';
    root.innerHTML = h;

    document.getElementById('ay-ob-save').addEventListener('click', function () {
      var saveBtn = document.getElementById('ay-ob-save');
      saveBtn.disabled = true;

      function isChecked(key) {
        var el = root.querySelector('[data-ob-check="' + key + '"]');
        return el ? el.checked : false;
      }

      var inserts = [];

      people.forEach(function (p, i) {
        if (!isChecked('people-' + i)) return;
        var sectorEl = root.querySelector('[data-ob-sel="sector-' + i + '"]');
        var ringEl = root.querySelector('[data-ob-sel="ring-' + i + '"]');
        inserts.push(
          sb().from('ayna_people').insert({
            user_id: _uid, display_name: p.name, relation: p.relation || null,
            sector: sectorEl ? sectorEl.value : (p.sector || 'other'),
            ring: ringEl ? parseInt(ringEl.value) : (p.ring || 3),
            traits: p.traits || [], status: 'active', created_by: 'onboarding'
          }).then(function () {}).catch(function () {})
        );
      });

      values.forEach(function (v, i) {
        if (!isChecked('values-' + i)) return;
        inserts.push(
          sb().from('ayna_goals').insert({ user_id: _uid, kind: 'value', text: v }).then(function () {}).catch(function () {})
        );
      });

      goals.forEach(function (g, i) {
        if (!isChecked('goals-' + i)) return;
        inserts.push(
          sb().from('ayna_goals').insert({ user_id: _uid, kind: 'goal', text: g }).then(function () {}).catch(function () {})
        );
      });

      rules.forEach(function (r, i) {
        if (!isChecked('rules-' + i)) return;
        inserts.push(
          sb().from('ayna_rules').insert({ user_id: _uid, domain: r.domain || 'general', if_text: r.if_text, then_text: r.then_text }).then(function () {}).catch(function () {})
        );
      });

      if (proposal.display_name && _profile && !_profile.display_name) {
        inserts.push(
          sb().from('ayna_profiles').update({ display_name: proposal.display_name }).eq('user_id', _uid).then(function () {
            _profile.display_name = proposal.display_name;
          }).catch(function () {})
        );
      }

      Promise.all(inserts).then(function () {
        return sb().from('ayna_profiles').update({ onboarding_done: true }).eq('user_id', _uid);
      }).then(function () {
        _profile.onboarding_done = true;
        renderApp(document.getElementById('ayna-root'));
      }).catch(function () {
        saveBtn.disabled = false;
        flash(errText('default'));
      });
    });
  }

  function render() {
    var root = document.getElementById('ayna-root');
    if (!root) return;
    root.innerHTML = '<div class="' + P + 'card">' + t('common.loading') + '</div>';
    root.className = P + 'root';

    if (!sb()) { root.innerHTML = '<div class="' + P + 'card">' + t('app.login_required') + '</div>'; return; }

    sb().auth.getSession().then(function (res) {
      var session = res && res.data ? res.data.session : null;
      if (!session || !session.user) { root.innerHTML = '<div class="' + P + 'card">' + t('app.login_required') + '</div>'; return; }
      _uid = session.user.id;
      return sb().from('ayna_profiles').select('*').eq('user_id', _uid).maybeSingle().then(function (profRes) {
        _profile = profRes && profRes.data ? profRes.data : null;
        if (!_profile || !_profile.onboarding_done) { renderSetup(root); return; }
        renderApp(root);
      });
    }).catch(function () {
      root.innerHTML = '<div class="' + P + 'card">' + t('err.default') + '</div>';
    });
  }

  function renderApp(root) {
    var tabKeys = ['today', 'map', 'coach', 'rules', 'archive', 'settings'];
    var savedTab = null;
    try { savedTab = localStorage.getItem('ayna.tab'); } catch (e) {}
    var activeTab = tabKeys.indexOf(savedTab) >= 0 ? savedTab : 'today';

    root.innerHTML = '<div class="' + P + 'hdr"><h2>' + t('app.title') + '</h2><span class="' + P + 'date">' + fmtDate(today()) + '</span></div>' +
      '<div class="' + P + 'tabs" id="ay-tabs"></div><div class="' + P + 'content" id="ay-content"></div><div id="ayna-flash" class="' + P + 'flash" aria-live="polite"></div>';

    var tabsEl = document.getElementById('ay-tabs');
    tabKeys.forEach(function (k) {
      var btn = document.createElement('button');
      btn.textContent = t('tab.' + k);
      btn.setAttribute('data-' + P + 'tab', k);
      if (k === activeTab) btn.className = P + 'on';
      btn.addEventListener('click', function () {
        tabsEl.querySelectorAll('button').forEach(function (b) { b.classList.remove(P + 'on'); });
        btn.classList.add(P + 'on');
        try { localStorage.setItem('ayna.tab', k); } catch (e) {}
        renderTab(k);
      });
      tabsEl.appendChild(btn);
    });
    renderTab(activeTab);
  }

  function renderTab(name) {
    var container = document.getElementById('ay-content');
    if (!container) return;
    container.innerHTML = '<div class="' + P + 'card">' + t('common.loading') + '</div>';
    if (tabs[name] && typeof tabs[name].render === 'function') {
      tabs[name].render(container);
    } else {
      container.innerHTML = '<div class="' + P + 'card">' + t('common.next_phase') + '</div>';
    }
  }

  return {
    sb: sb, get uid() { return _uid; }, get profile() { return _profile; },
    lang: lang, t: t, esc: esc, md: md, today: today, addDays: addDays, fmtDate: fmtDate, ago: ago, num: num,
    flash: flash, errText: errText, api: api, tabs: tabs, openEntry: openEntry, render: render, P: P
  };
})();