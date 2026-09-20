/* AYNA Settings tab - J9 FAZ 3 */
Ayna.tabs.settings = { render: function (c) { renderSettings(c); } };

function renderSettings(c) {
  c.innerHTML = '<div class="ay-card">' + Ayna.t('common.loading') + '</div>';
  var sb = Ayna.sb(), uid = Ayna.uid;
  Promise.all([
    sb.from('ayna_profiles').select('coach_tone').eq('user_id', uid).single(),
    sb.from('ayna_beliefs').select('*').eq('user_id', uid).order('created_at', { ascending: false })
  ]).then(function (r) {
    var profile = r[0].data || {};
    var beliefs = r[1].data || [];
    var h = '';
    h += _settingsTone(profile.coach_tone || 'mentor');
    h += _settingsBeliefs(beliefs);
    h += _settingsMeet();
    c.innerHTML = h;
    _bindTone(c, uid, profile);
    _bindBeliefs(c, uid, beliefs);
    _bindMeet(c, uid);
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
