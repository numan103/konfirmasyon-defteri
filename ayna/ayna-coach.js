/* AYNA Coach tab - J6 */
Ayna.tabs.coach = { render: function (c) { renderCoach(c); } };

var _coachMode = 'chat';
var _coachMessages = [];
var _coachEntries = {};
var _coachLastSend = 0;

function _normMsgs() {
  var seen = {};
  var out = [];
  for (var i = 0; i < _coachMessages.length; i++) {
    var m = _coachMessages[i];
    if (!m) continue;
    var id = m.id || ('x-' + i);
    var temp = String(id).indexOf('temp-') === 0;
    if (seen[id] !== undefined) {
      var prev = seen[id];
      if (!prev.isTemp && temp) continue;
      out[prev.idx] = m;
      prev.isTemp = temp;
      continue;
    }
    seen[id] = { idx: out.length, isTemp: temp };
    out.push(m);
  }
  _coachMessages = out;
}

var _coachModes = ['chat', 'pre_trade', 'pre_conversation', 'big_decision'];
var _coachModeLabels = { chat: 'coach.mode_chat', pre_trade: 'coach.mode_pre_trade', pre_conversation: 'coach.mode_pre_conversation', big_decision: 'coach.mode_big_decision' };
var _coachModeHelp = { chat: 'coach.help_chat', pre_trade: 'coach.help_pre_trade', pre_conversation: 'coach.help_pre_conversation', big_decision: 'coach.help_big_decision' };

function renderCoach(c) {
  c.innerHTML = '<div class="ay-card">' + Ayna.t('common.loading') + '</div>';
  var uid = Ayna.uid, sb = Ayna.sb();
  sb.from('ayna_chat_messages').select('id,mode,role,content,evidence,risk,decision_proposal,created_at')
    .eq('user_id', uid).neq('mode', 'onboarding').order('created_at', { ascending: true }).limit(50)
    .then(function (res) {
      _coachMessages = (res.data || []).slice().sort(function (a, b) {
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      });
      _normMsgs();
      renderCoachContent(c);
    }).catch(function () {
      _coachMessages = [];
      renderCoachContent(c);
    });
}

function renderCoachContent(c, keepInput) {
  var h = '';

  h += '<div class="ay-seg" id="ay-coach-modes">';
  _coachModes.forEach(function (m) {
    h += '<button' + (m === _coachMode ? ' class="on-gold"' : '') + ' data-mode="' + m + '">' + Ayna.t(_coachModeLabels[m]) + '</button>';
  });
  h += '</div>';
  h += '<p style="margin:6px 0 12px;font-size:13px;color:var(--text-2)">' + Ayna.t(_coachModeHelp[_coachMode]) + '</p>';

  h += '<div id="ay-coach-crisis"></div>';
  h += '<div id="ay-coach-list" class="ay-coach-list"></div>';
  h += '<div id="ay-coach-input" class="ay-coach-input-wrap"></div>';

  c.innerHTML = h;

  document.getElementById('ay-coach-modes').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-mode]');
    if (!btn) return;
    _coachMode = btn.getAttribute('data-mode');
    renderCoachContent(c);
  });

  renderCrisisCard(document.getElementById('ay-coach-crisis'));
  renderMessageList(document.getElementById('ay-coach-list'));
  renderInputArea(document.getElementById('ay-coach-input'), keepInput);
}

function renderCrisisCard(el) {
  if (!_coachMessages.length) { el.innerHTML = ''; return; }
  var last = null;
  for (var i = _coachMessages.length - 1; i >= 0; i--) {
    if (_coachMessages[i].role === 'assistant' && _coachMessages[i].risk === 'crisis') { last = _coachMessages[i]; break; }
  }
  if (!last) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="ay-card" style="border-left:3px solid var(--red);border-radius:0;margin-bottom:12px">' +
    '<h4 style="margin:0 0 4px">' + Ayna.t('crisis.title') + '</h4>' +
    '<p style="margin:0">' + Ayna.t('crisis.body') + '</p></div>';
}

function renderMessageList(el) {
  if (!_coachMessages.length) {
    el.innerHTML = '<div class="ay-card" style="text-align:center;color:var(--text-2)">' + Ayna.t('coach.empty') + '</div>';
    return;
  }
  var ids = [];
  _coachMessages.forEach(function (m) {
    if (m.evidence && m.evidence.length) {
      m.evidence.forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
    }
  });
  if (ids.length) {
    Ayna.sb().from('ayna_entries').select('id,local_date,kind,summary').eq('user_id', Ayna.uid).in('id', ids)
      .then(function (res) {
        var rows = res.data || [];
        _coachEntries = {};
        rows.forEach(function (r) { _coachEntries[r.id] = r; });
        _drawMessages(el);
      }).catch(function () { _drawMessages(el); });
  } else {
    _drawMessages(el);
  }
}

function _drawMessages(el) {
  _normMsgs();
  var html = '';
  _coachMessages.forEach(function (m) {
    var isUser = m.role === 'user';
    var align = isUser ? 'right' : 'left';
    var bg = isUser ? 'var(--acc-soft)' : 'var(--card-2)';
    var ml = isUser ? 'margin-left:40px' : 'margin-right:40px';
    var time = _coachTime(m.created_at);
    var modeLabel = Ayna.t(_coachModeLabels[m.mode] || 'coach.mode_chat');

    html += '<div style="text-align:' + align + ';margin-bottom:8px;' + ml + '">';
    html += '<div style="display:inline-block;text-align:left;background:' + bg + ';padding:8px 12px;border-radius:var(--radius);max-width:100%;box-sizing:border-box;overflow-wrap:anywhere">';
    html += '<div style="font-size:11px;color:var(--text-3);margin-bottom:2px">' + Ayna.esc(modeLabel) + ' · ' + Ayna.esc(time) + '</div>';
    html += '<div style="white-space:pre-wrap">' + Ayna.esc(m.content) + '</div>';

    if (!isUser && m.evidence && m.evidence.length) {
      html += '<div style="margin-top:6px">';
      html += '<button class="btn" data-ev="' + Ayna.esc(m.id) + '" style="font-size:12px;padding:2px 8px">' + Ayna.t('coach.evidence', { n: m.evidence.length }) + '</button>';
      html += '<div id="ay-ev-' + m.id + '"></div></div>';
    }

    if (!isUser && m.decision_proposal && m.decision_proposal.title && m.decision_proposal.reasoning) {
      var dp = m.decision_proposal;
      html += '<div class="ay-card" style="margin-top:8px;border-left:3px solid var(--pc);padding:8px 12px">';
      html += '<p style="margin:0 0 4px;font-size:13px;color:var(--text-2)">' + Ayna.t('coach.decision_card') + '</p>';
      html += '<h4 style="margin:0 0 4px">' + Ayna.esc(dp.title) + '</h4>';
      html += '<p style="margin:0 0 8px;font-size:13px;white-space:pre-wrap">' + Ayna.esc(dp.reasoning) + '</p>';
      html += '<button class="btn solid" data-dp="' + Ayna.esc(m.id) + '">' + Ayna.t('coach.decision_save') + '</button>';
      html += '<div id="ay-dp-' + m.id + '"></div>';
      html += '</div>';
    }

    html += '</div></div>';
  });

  el.innerHTML = html;

  el.querySelectorAll('[data-ev]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var msgId = btn.getAttribute('data-ev');
      var msg = _coachMessages.find(function (m) { return m.id === msgId; });
      if (!msg || !msg.evidence || !msg.evidence.length) return;
      var wrap = document.getElementById('ay-ev-' + msgId);
      if (!wrap) return;
      if (wrap.innerHTML) { wrap.innerHTML = ''; return; }
      var ids = msg.evidence.slice(0, 10);
      Ayna.sb().from('ayna_entries').select('id,local_date,kind,summary').eq('user_id', Ayna.uid).in('id', ids)
        .then(function (res) {
          var rows = res.data || [];
          var map = {};
          rows.forEach(function (r) { map[r.id] = r; });
          var h2 = '';
          ids.forEach(function (eid) {
            var r = map[eid];
            if (!r) return;
            h2 += '<div style="font-size:12px;margin-top:4px;cursor:pointer" data-oe="' + Ayna.esc(eid) + '">';
            h2 += Ayna.esc(Ayna.fmtDate(r.local_date)) + ', ' + Ayna.esc(Ayna.t('entry.' + r.kind)) + ': ' + Ayna.esc(r.summary || '');
            h2 += '</div>';
          });
          wrap.innerHTML = h2;
          wrap.querySelectorAll('[data-oe]').forEach(function (d) {
            d.addEventListener('click', function () { Ayna.openEntry(d.getAttribute('data-oe')); });
          });
        }).catch(function () { wrap.innerHTML = '<div style="font-size:12px;color:var(--text-3)">' + Ayna.t('err.default') + '</div>'; });
    });
  });

  el.querySelectorAll('[data-dp]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var msgId = btn.getAttribute('data-dp');
      var msg = _coachMessages.find(function (m) { return m.id === msgId; });
      if (!msg || !msg.decision_proposal) return;
      var dp = msg.decision_proposal;
      var wrap = document.getElementById('ay-dp-' + msgId);
      if (!wrap) return;
      btn.disabled = true;
      var reviewDate = Ayna.addDays(Ayna.today(), dp.review_in_days || 30);
      Ayna.sb().from('ayna_decisions').insert({
        user_id: Ayna.uid,
        title: dp.title,
        reasoning: dp.reasoning,
        feeling: dp.feeling || null,
        premortem: dp.premortem || null,
        review_date: reviewDate
      }).then(function () {
        wrap.innerHTML = '<p style="margin:4px 0 0;font-size:13px;color:var(--green)">' + Ayna.t('coach.decision_saved', { date: Ayna.fmtDate(reviewDate) }) + '</p>';
        btn.style.display = 'none';
      }).catch(function (e) {
        btn.disabled = false;
        Ayna.flash(Ayna.errText(e.code || 'default'));
      });
    });
  });

  el.scrollTop = el.scrollHeight;
}

function renderInputArea(el, keepText) {
  var html = '<div style="display:flex;gap:8px;align-items:flex-end">';
  html += '<textarea id="ay-coach-ta" class="ay-ta" rows="3" maxlength="4000" placeholder="' + Ayna.esc(Ayna.t('coach.placeholder')) + '" style="flex:1"></textarea>';
  html += '<button class="btn solid" id="ay-coach-send">' + Ayna.esc(Ayna.t('coach.send')) + '</button>';
  html += '</div>';
  el.innerHTML = html;

  var ta = document.getElementById('ay-coach-ta');
  var sendBtn = document.getElementById('ay-coach-send');
  if (keepText) ta.value = keepText;

  var submitting = false;
  function submit() {
    if (submitting) return;
    var text = ta.value.trim();
    if (!text) return;
    submitting = true;
    sendCoachMessage(text, function () { submitting = false; });
  }

  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  sendBtn.addEventListener('click', submit);
}

function sendCoachMessage(text, onDone) {
  var ta = document.getElementById('ay-coach-ta');
  var sendBtn = document.getElementById('ay-coach-send');
  var listEl = document.getElementById('ay-coach-list');
  var done = function () { if (onDone) onDone(); };

  if (!ta || !sendBtn || !listEl || sendBtn.disabled) { done(); return; }

  var now = Date.now();
  if (now - _coachLastSend < 1500) { done(); return; }
  _coachLastSend = now;

  ta.disabled = true;
  sendBtn.disabled = true;

  var thinkingDiv = document.createElement('div');
  thinkingDiv.style.cssText = 'text-align:left;margin-bottom:8px;margin-right:40px';
  thinkingDiv.innerHTML = '<div style="display:inline-block;background:var(--card-2);padding:8px 12px;border-radius:var(--radius);font-size:13px;color:var(--text-2)">' + Ayna.t('coach.thinking') + '</div>';
  thinkingDiv.setAttribute('aria-live', 'polite');
  listEl.appendChild(thinkingDiv);
  listEl.scrollTop = listEl.scrollHeight;

  Ayna.api('coach', { message: text, mode: _coachMode }).then(function (res) {
    thinkingDiv.remove();
    var sentMode = _coachMode;
    _coachMessages.push({
      id: res.user_message_id || ('temp-user-' + now),
      mode: sentMode,
      role: 'user',
      content: text,
      evidence: [],
      risk: null,
      decision_proposal: null,
      created_at: new Date().toISOString()
    });
    _coachMessages.push({
      id: res.message_id || ('temp-coach-' + now),
      mode: sentMode,
      role: 'assistant',
      content: res.reply || '',
      evidence: res.evidence || [],
      risk: res.risk || 'none',
      decision_proposal: res.decision_proposal || null,
      created_at: new Date().toISOString()
    });
    _normMsgs();
    ta.value = '';
    ta.disabled = false;
    sendBtn.disabled = false;
    _drawMessages(listEl);
    done();
  }).catch(function (e) {
    thinkingDiv.remove();
    ta.value = text;
    ta.disabled = false;
    sendBtn.disabled = false;
    Ayna.flash(Ayna.errText(e.code || 'default'));
    done();
  });
}

function _coachTime(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    return d.toLocaleTimeString(Ayna.lang() === 'en' ? 'en-GB' : 'tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}
