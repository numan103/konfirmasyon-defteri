/* Daily analysis -> user response -> explicitly accepted small step -> outcome. */
(function () {
  var drafts = {};
  var outcomeDrafts = {};
  var outcomes = { tried: 'Denedim', not_tried: 'Denemedim', changed: 'Değiştirdim' };
  function t(key, vars) { return Ayna.t('followup.' + key, vars); }
  function esc(value) { return Ayna.esc(value); }
  function live(node, uid) { return node.isConnected && Ayna.uid === uid; }
  function draft(insight) {
    var key = Ayna.uid + ':' + insight.id;
    return drafts[key] || (drafts[key] = { reply: '', feedback: 'useful', step: insight.focus || '', date: Ayna.addDays(Ayna.today(), 1) });
  }
  function stepMarkup(step) {
    var lines = String(step.outcome || '').split('\n');
    var knownStatus = Object.keys(outcomes).find(function (key) { return outcomes[key] === lines[0]; });
    var status = knownStatus || 'tried';
    var savedDraft = outcomeDrafts[Ayna.uid + ':' + step.id];
    if (savedDraft) status = savedDraft.status;
    var note = savedDraft ? savedDraft.note : (knownStatus ? lines.slice(1).join('\n') : (step.outcome || ''));
    return '<article class="ay-followup-step" data-followup-step="' + esc(step.id) + '">' +
      '<h4>' + esc(String(step.title).replace(/^Küçük adım: /, '')) + '</h4>' +
      '<p class="ay-followup-meta">' + t('review_date') + ': ' + esc(Ayna.fmtDate(step.review_date)) + '</p>' +
      (step.outcome ? '<p class="ay-followup-outcome">' + esc(step.outcome) + '</p>' : '<p>' + t('not_reported') + '</p>') +
      '<details><summary>' + t(step.outcome ? 'update_outcome' : 'report_outcome') + '</summary>' +
      '<label>' + t('what_happened') + '<select class="ay-inp" data-followup-status>' + Object.keys(outcomes).map(function (key) { return '<option value="' + key + '"' + (key === status ? ' selected' : '') + '>' + t(key) + '</option>'; }).join('') + '</select></label>' +
      '<label>' + t('outcome_note') + '<textarea class="ay-inp" data-followup-note rows="2" maxlength="2000">' + esc(note) + '</textarea></label>' +
      '<button type="button" class="btn" data-followup-outcome-save>' + t('save_outcome') + '</button>' +
      '<p data-followup-outcome-status role="status"></p></details></article>';
  }
  function bindOutcomes(root, onSaved) {
    var uid = Ayna.uid;
    root.querySelectorAll('[data-followup-step]').forEach(function (card) {
      var draftKey = uid + ':' + card.getAttribute('data-followup-step');
      function remember() {
        outcomeDrafts[draftKey] = { status: card.querySelector('[data-followup-status]').value, note: card.querySelector('[data-followup-note]').value };
      }
      card.querySelector('[data-followup-status]').addEventListener('change', remember);
      card.querySelector('[data-followup-note]').addEventListener('input', remember);
      var button = card.querySelector('[data-followup-outcome-save]');
      button.addEventListener('click', function () {
        if (button.disabled) return;
        var status = card.querySelector('[data-followup-status]').value;
        var note = card.querySelector('[data-followup-note]').value;
        var message = card.querySelector('[data-followup-outcome-status]');
        button.disabled = true;
        message.textContent = t('saving');
        Ayna.api('journal-followup', { op: 'outcome', decision_id: card.getAttribute('data-followup-step'), status: status, note: note }).then(function (res) {
          if (!live(card, uid)) return;
          delete outcomeDrafts[draftKey];
          // Only this card changes; other draft answers and the journal stay intact.
          var holder = document.createElement('div');
          holder.innerHTML = stepMarkup(res.step);
          bindOutcomes(holder, onSaved);
          card.replaceWith(holder.firstElementChild);
          if (onSaved) onSaved(res.step);
        }).catch(function (error) { if (live(card, uid)) message.textContent = Ayna.errText(error.code || 'default'); })
          .finally(function () { button.disabled = false; });
      });
    });
  }
  function pending(container) {
    var host = container.querySelector('#ay-followup-steps');
    if (!host) return;
    var uid = Ayna.uid;
    var version = host._version = (host._version || 0) + 1;
    Ayna.api('journal-followup', { op: 'steps' }).then(function (res) {
      if (!live(host, uid) || version !== host._version) return;
      var steps = res.steps || [];
      host.hidden = !steps.length;
      host.innerHTML = '<h4>' + t('my_steps') + '</h4><p>' + t('steps_help') + '</p>' + steps.slice(0, 8).map(stepMarkup).join('') +
        (steps.length > 8 ? '<details><summary>' + t('more_steps') + '</summary>' + steps.slice(8).map(stepMarkup).join('') + '</details>' : '');
      bindOutcomes(host);
    }).catch(function (error) {
      if (!live(host, uid) || version !== host._version) return;
      host.hidden = false;
      host.textContent = t('load_failed') + ' ' + Ayna.errText(error.code || 'default');
    });
  }
  function mount(container, insight, risk) {
    var result = container.querySelector('#ay-analysis-result');
    if (!result || !insight.id || !insight.source_entry_id) return;
    var uid = Ayna.uid, state = draft(insight);
    var host = document.createElement('section');
    host.className = 'ay-followup';
    host.innerHTML = '<h4>' + t('title') + '</h4><p>' + t('help') + '</p>' +
      '<label>' + t('feedback') + '<select class="ay-inp" data-followup-feedback><option value="useful">' + t('agree') + '</option><option value="not_useful">' + t('partial') + '</option><option value="wrong">' + t('wrong') + '</option></select></label>' +
      '<label>' + t('your_reply') + '<textarea class="ay-inp" data-followup-reply rows="3" maxlength="2000" placeholder="' + esc(t('reply_placeholder')) + '">' + esc(state.reply) + '</textarea></label>' +
      '<button type="button" class="btn solid" data-followup-save>' + t('save_reply') + '</button>' +
      '<p data-followup-save-status role="status"></p><div class="ay-followup-messages" data-followup-messages aria-live="polite"></div>' +
      '<div class="ay-followup-plan" data-followup-plan>' + t('loading') + '</div>';
    result.appendChild(host);
    var feedback = host.querySelector('[data-followup-feedback]');
    var reply = host.querySelector('[data-followup-reply]');
    var save = host.querySelector('[data-followup-save]');
    var status = host.querySelector('[data-followup-save-status]');
    var messagesHost = host.querySelector('[data-followup-messages]');
    var plan = host.querySelector('[data-followup-plan]');
    var messages = [];
    feedback.value = state.feedback;
    feedback.addEventListener('change', function () { state.feedback = feedback.value; });
    reply.addEventListener('input', function () { state.reply = reply.value; });

    function paintMessages() {
      var users = messages.filter(function (row) { return row.role === 'user'; });
      var latest = users.length ? users[users.length - 1].id : null;
      messagesHost.innerHTML = messages.map(function (row) {
        var marker = '\nYanıtım:\n';
        var at = row.role === 'user' ? row.content.lastIndexOf(marker) : -1;
        var text = at >= 0 ? row.content.slice(at + marker.length) : row.content;
        var label = row.role === 'user' ? t('you') : t('coach');
        return '<article class="ay-followup-message"><strong>' + label + '</strong><div>' + (row.role === 'user' ? esc(text) : Ayna.md(text)) + '</div>' +
          (at >= 0 ? '<details><summary>' + t('source') + '</summary><p>' + esc(row.content.slice(0, at)) + '</p></details>' : '') +
          (row.id === latest ? '<button type="button" class="btn" data-followup-ask="' + esc(row.id) + '">' + t('ask_coach') + '</button><p data-followup-ask-status role="status"></p>' : '') + '</article>';
      }).join('');
      var ask = messagesHost.querySelector('[data-followup-ask]');
      if (ask) ask.addEventListener('click', function () {
        if (ask.disabled) return;
        var responseStatus = ask.nextElementSibling;
        ask.disabled = true;
        responseStatus.textContent = t('thinking');
        Ayna.api('coach', { mode: 'chat', message: t('continue_request'), insight_id: insight.id, followup_message_id: ask.getAttribute('data-followup-ask') }).then(function (res) {
          if (!live(host, uid)) return;
          messages.push({ id: res.message_id, role: 'assistant', content: res.reply });
          paintMessages();
        }).catch(function (error) {
          if (live(host, uid)) responseStatus.textContent = t('reply_safe') + ' ' + Ayna.errText(error.code || 'default');
        }).finally(function () { ask.disabled = false; });
      });
    }
    function paintPlan(step) {
      if (step) {
        plan.innerHTML = '<h4>' + t('accepted_step') + '</h4>' + stepMarkup(step);
        bindOutcomes(plan, function () { pending(container); });
        return;
      }
      if (risk === 'crisis') { plan.innerHTML = ''; return; }
      if (!insight.focus) { plan.textContent = t('no_step'); return; }
      plan.innerHTML = '<h4>' + t('one_step') + '</h4><p>' + t('step_help') + '</p><label>' + t('step_text') + '<textarea class="ay-inp" data-followup-step-text maxlength="200" rows="2">' + esc(state.step) + '</textarea></label>' +
        '<label>' + t('review_date') + '<input class="ay-inp" type="date" data-followup-date min="' + Ayna.today() + '" value="' + esc(state.date) + '"></label><button type="button" class="btn" data-followup-accept>' + t('accept') + '</button><p data-followup-step-status role="status"></p>';
      var text = plan.querySelector('[data-followup-step-text]');
      var date = plan.querySelector('[data-followup-date]');
      text.addEventListener('input', function () { state.step = text.value; });
      date.addEventListener('input', function () { state.date = date.value; });
      var accept = plan.querySelector('[data-followup-accept]');
      accept.addEventListener('click', function () {
        var message = plan.querySelector('[data-followup-step-status]');
        if (!text.value.trim() || !date.value || !date.checkValidity()) { message.textContent = t('step_required'); return; }
        if (accept.disabled) return;
        accept.disabled = true;
        message.textContent = t('saving');
        Ayna.api('journal-followup', { op: 'step', insight_id: insight.id, step: text.value.trim(), review_date: date.value }).then(function (res) {
          if (!live(host, uid)) return;
          paintPlan(res.step); pending(container);
        }).catch(function (error) { if (live(host, uid)) message.textContent = Ayna.errText(error.code || 'default'); })
          .finally(function () { accept.disabled = false; });
      });
    }
    save.addEventListener('click', function () {
      if (save.disabled) return;
      var text = reply.value.trim();
      if (!text) { status.textContent = t('reply_required'); reply.focus(); return; }
      var requestKey = insight.body + '\n' + feedback.value + '\n' + text;
      if (state.requestKey !== requestKey) {
        state.requestKey = requestKey;
        state.requestId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : null;
      }
      save.disabled = true;
      status.textContent = t('saving');
      Ayna.api('journal-followup', { op: 'reply', insight_id: insight.id, feedback: feedback.value, message: text, request_id: state.requestId }).then(function (res) {
        if (!live(host, uid)) return;
        if (!messages.some(function (row) { return row.id === res.message.id; })) messages.push(res.message);
        paintMessages();
        if (reply.value.trim() === text) { reply.value = ''; state.reply = ''; }
        state.requestKey = null; state.requestId = null;
        status.textContent = t('reply_saved');
      }).catch(function (error) { if (live(host, uid)) status.textContent = Ayna.errText(error.code || 'default'); })
        .finally(function () { save.disabled = false; });
    });
    Ayna.api('journal-followup', { op: 'load', insight_id: insight.id }).then(function (res) {
      if (!live(host, uid)) return;
      messages = res.messages || []; paintMessages(); paintPlan(res.step);
      if (res.feedback && !state.reply) { feedback.value = res.feedback; state.feedback = res.feedback; }
    }).catch(function (error) {
      if (!live(host, uid)) return;
      status.textContent = t('load_failed') + ' ' + Ayna.errText(error.code || 'default');
      // Never offer to create a duplicate step if we couldn't load the accepted one.
      plan.textContent = t('load_failed');
    });
  }
  Ayna.followup = { mount: mount, pending: pending };
})();
