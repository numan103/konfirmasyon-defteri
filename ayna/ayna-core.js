/* AYNA core - J1 */
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
  function num(x, signed) { if (x == null || isNaN(x)) return '—'; var s = Number(x).toLocaleString(lang() === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 1 }); return (signed && Number(x) > 0 ? '+' : '') + s; }

  function flash(msg) {
    var el = document.getElementById('ayna-flash');
    if (!el) { el = document.createElement('div'); el.id = 'ayna-flash'; el.className = 'ay-flash'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('ay-on');
    clearTimeout(flash._t); flash._t = setTimeout(function () { el.classList.remove('ay-on'); }, 4000);
  }

  function errText(code) { return t('err.' + code) || t('err.default'); }

  async function api(action, payload) {
    var session = await sb().auth.getSession();
    var token = session && session.data && session.data.session ? session.data.session.access_token : null;
    if (!token) throw { code: 'unauthorized' };
    var r = await fetch('/api/ayna', {
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
    var tabBtns = document.querySelectorAll('.ay-tabs button');
    tabBtns.forEach(function (b) { if (b.getAttribute('data-ay-tab') === 'archive') b.click(); });
  }

  function render() {
    var root = document.getElementById('ayna-root');
    if (!root) return;
    root.innerHTML = '<div class="ay-card">' + t('common.loading') + '</div>';
    root.className = 'ay-root';

    if (!sb()) { root.innerHTML = '<div class="ay-card">' + t('app.login_required') + '</div>'; return; }

    sb().auth.getSession().then(function (res) {
      var session = res && res.data ? res.data.session : null;
      if (!session || !session.user) { root.innerHTML = '<div class="ay-card">' + t('app.login_required') + '</div>'; return; }
      _uid = session.user.id;
      return sb().from('ayna_profiles').select('*').eq('user_id', _uid).maybeSingle().then(function (profRes) {
        _profile = profRes && profRes.data ? profRes.data : null;
        if (!_profile || !_profile.onboarding_done) { renderSetup(root); return; }
        renderApp(root);
      });
    }).catch(function () {
      root.innerHTML = '<div class="ay-card">' + t('err.default') + '</div>';
    });
  }

  function renderSetup(root) {
    root.innerHTML = '<div class="ay-card"><h3>' + t('ob.welcome_title') + '</h3><p>' + t('ob.welcome_body') + '</p>' +
      '<div style="margin-top:12px"><label style="display:block;margin:6px 0"><input type="checkbox" id="ay-c1"> ' + t('ob.consent_age_18') + '</label>' +
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
    root.innerHTML = '<div class="ay-card"><h3>' + t('ob.tone_title') + '</h3>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">' +
      '<button class="btn" data-tone="mentor">' + t('tone.mentor') + '<br><small>' + t('tone.mentor_desc') + '</small></button>' +
      '<button class="btn" data-tone="coach">' + t('tone.coach') + '<br><small>' + t('tone.coach_desc') + '</small></button>' +
      '<button class="btn" data-tone="friendly">' + t('tone.friendly') + '<br><small>' + t('tone.friendly_desc') + '</small></button>' +
      '</div><button class="btn solid" id="ay-tone-ok">' + t('common.continue') + '</button></div>';
    var selected = 'mentor';
    root.querySelectorAll('[data-tone]').forEach(function (b) {
      b.addEventListener('click', function () { selected = b.getAttribute('data-tone'); root.querySelectorAll('[data-tone]').forEach(function (x) { x.classList.remove('solid'); }); b.classList.add('solid'); });
    });
    root.querySelector('[data-tone="mentor"]').classList.add('solid');
    document.getElementById('ay-tone-ok').addEventListener('click', function () {
      sb().from('ayna_profiles').update({ coach_tone: selected }).eq('user_id', _uid).then(function () {
        _profile = _profile || {}; _profile.coach_tone = selected; _profile.onboarding_done = true;
        sb().from('ayna_profiles').update({ onboarding_done: true }).eq('user_id', _uid).then(function () { renderApp(root); });
      });
    });
  }

  function renderApp(root) {
    var tabKeys = ['today', 'map', 'coach', 'rules', 'archive', 'settings'];
    var savedTab = null;
    try { savedTab = localStorage.getItem('ayna.tab'); } catch (e) {}
    var activeTab = tabKeys.indexOf(savedTab) >= 0 ? savedTab : 'today';

    root.innerHTML = '<div class="ay-hdr"><h2>' + t('app.title') + '</h2><span class="ay-date">' + fmtDate(today()) + '</span></div>' +
      '<div class="ay-tabs" id="ay-tabs"></div><div class="ay-content" id="ay-content"></div><div id="ayna-flash" class="ay-flash" aria-live="polite"></div>';

    var tabsEl = document.getElementById('ay-tabs');
    tabKeys.forEach(function (k) {
      var btn = document.createElement('button');
      btn.textContent = t('tab.' + k);
      btn.setAttribute('data-ay-tab', k);
      if (k === activeTab) btn.className = 'ay-on';
      btn.addEventListener('click', function () {
        tabsEl.querySelectorAll('button').forEach(function (b) { b.classList.remove('ay-on'); });
        btn.classList.add('ay-on');
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
    container.innerHTML = '<div class="ay-card">' + t('common.loading') + '</div>';
    if (tabs[name] && typeof tabs[name].render === 'function') {
      tabs[name].render(container);
    } else {
      container.innerHTML = '<div class="ay-card">' + t('common.next_phase') + '</div>';
    }
  }

  return {
    sb: sb, get uid() { return _uid; }, get profile() { return _profile; },
    lang: lang, t: t, esc: esc, md: md, today: today, addDays: addDays, fmtDate: fmtDate, ago: ago, num: num,
    flash: flash, errText: errText, api: api, tabs: tabs, openEntry: openEntry, render: render, P: P
  };
})();
