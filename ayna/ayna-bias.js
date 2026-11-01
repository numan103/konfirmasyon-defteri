/* Cognitive-bias observations are proposals, not facts. The user can confirm,
   correct or reject each one; rejected labels are never resurrected without
   new evidence because the server keeps them out of later analyses. */
(function () {
  var PREFIX = 'Bilişsel hata: ';
  var STATUS_LABEL = { proposed: 'proposed', confirmed: 'confirmed', corrected: 'corrected', rejected: 'rejected' };
  var drafts = {};

  function t(key, vars) { return Ayna.t('bias.' + key, vars); }
  function esc(value) { return Ayna.esc(value); }

  function stripPrefix(statement) {
    var text = String(statement || '');
    if (text.indexOf(PREFIX) === 0) text = text.slice(PREFIX.length);
    var dash = text.indexOf(' — ');
    return dash >= 0 ? text.slice(dash + 3) : text;
  }

  function normalize(row) {
    var statement = row.statement || '';
    var label = row.label || null;
    if (!label && statement.indexOf(PREFIX) === 0) {
      var rest = statement.slice(PREFIX.length);
      var dash = rest.indexOf(' — ');
      label = dash >= 0 ? rest.slice(0, dash) : rest;
    }
    return {
      id: row.id || row.belief_id || null,
      label: label || row.code || '',
      text: row.observation || stripPrefix(statement),
      question: row.question || '',
      evidence: Array.isArray(row.evidence) ? row.evidence.filter(function (item) { return typeof item === 'string' && item.trim(); }).slice(0, 10) : [],
      status: STATUS_LABEL[row.status] || 'proposed',
      correction: row.correction || ''
    };
  }

  function statusLabel(status) {
    if (status === 'confirmed') return t('confirmed');
    if (status === 'corrected') return t('corrected');
    return '';
  }

  function itemMarkup(bias) {
    var draft = drafts[Ayna.uid + ':' + bias.id] || '';
    var h = '<article class="ay-bias-item" data-bias-id="' + esc(bias.id || '') + '" data-bias-status="' + esc(bias.status) + '">';
    h += '<div class="ay-bias-head"><strong>' + esc(bias.label) + '</strong>';
    var badge = statusLabel(bias.status);
    if (badge) h += '<span class="chip on">' + esc(badge) + '</span>';
    h += '</div>';
    h += '<p class="ay-bias-text">' + esc(bias.text) + '</p>';
    if (bias.question) h += '<p class="ay-bias-question">' + esc(t('question_prefix')) + ' ' + esc(bias.question) + '</p>';
    if (bias.correction) h += '<p class="ay-bias-correction">' + esc(t('your_correction')) + ' ' + esc(bias.correction) + '</p>';
    if (bias.evidence.length) {
      h += '<details class="ay-bias-evidence"><summary>' + esc(t('evidence')) + '</summary><ul>';
      bias.evidence.forEach(function (item) { h += '<li>' + esc(item) + '</li>'; });
      h += '</ul></details>';
    }
    h += '<div class="ay-bias-actions">';
    if (bias.status !== 'confirmed') h += '<button type="button" class="btn" data-bias-confirm>' + esc(t('confirm')) + '</button>';
    h += '<button type="button" class="btn" data-bias-correct>' + esc(t('correct')) + '</button>';
    h += '<button type="button" class="btn" data-bias-reject>' + esc(t('reject')) + '</button>';
    h += '</div>';
    h += '<div class="ay-bias-correct-box"' + (draft ? '' : ' hidden') + '><label>' + esc(t('correction_label'));
    h += '<textarea class="ay-inp" rows="2" maxlength="600" data-bias-correction-text>' + esc(draft || bias.correction || '') + '</textarea></label>';
    h += '<button type="button" class="btn solid" data-bias-correction-save>' + esc(t('save_correction')) + '</button></div>';
    h += '<p class="ay-bias-state" data-bias-state role="status"></p></article>';
    return h;
  }

  function update(id, patch) {
    return Ayna.sb().from('ayna_beliefs')
      .update(Object.assign({ updated_at: new Date().toISOString() }, patch))
      .eq('id', id).eq('user_id', Ayna.uid)
      .then(function (res) { if (res && res.error) throw res.error; return res; });
  }

  function bind(root, bubble) {
    var uid = Ayna.uid;
    function live(node) { return node.isConnected && Ayna.uid === uid; }
    root.querySelectorAll('[data-bias-id]').forEach(function (card) {
      var id = card.getAttribute('data-bias-id');
      if (!id) return;
      var state = card.querySelector('[data-bias-state]');
      function setState(text) { if (state) state.textContent = text; }
      function disable(value) { card.querySelectorAll('button').forEach(function (b) { b.disabled = value; }); }
      function apply(status, correction, message) {
        disable(true);
        setState(t('saving'));
        return update(id, { status: status, correction: correction || null }).then(function () {
          delete drafts[uid + ':' + id];
          if (live(card)) {
            card.setAttribute('data-bias-status', status);
            if (status === 'rejected') card.remove();
            else setState(message || t('saved'));
          }
          if (bubble) bubble();
        }).catch(function () {
          if (live(card)) setState(Ayna.errText('default'));
        }).finally(function () { if (live(card)) disable(false); });
      }
      var confirmButton = card.querySelector('[data-bias-confirm]');
      if (confirmButton) confirmButton.addEventListener('click', function () {
        if (confirmButton.disabled) return;
        apply('confirmed', '', t('confirmed_saved'));
      });
      var rejectButton = card.querySelector('[data-bias-reject]');
      if (rejectButton) rejectButton.addEventListener('click', function () {
        if (rejectButton.disabled) return;
        apply('rejected', '', t('rejected_saved'));
      });
      var correctButton = card.querySelector('[data-bias-correct]');
      var box = card.querySelector('.ay-bias-correct-box');
      var area = card.querySelector('[data-bias-correction-text]');
      if (correctButton && box && area) {
        correctButton.addEventListener('click', function () { box.hidden = false; area.focus(); });
        area.addEventListener('input', function () { drafts[uid + ':' + id] = area.value; });
        var save = card.querySelector('[data-bias-correction-save]');
        if (save) save.addEventListener('click', function () {
          if (save.disabled) return;
          var text = area.value.trim();
          if (!text) { setState(t('correction_required')); area.focus(); return; }
          apply('corrected', text, t('corrected_saved'));
        });
      }
    });
  }

  function render(host, rows) {
    host.hidden = false;
    if (!rows.length) {
      host.innerHTML = '<h4>' + esc(t('title')) + '</h4><p>' + esc(t('empty')) + '</p>';
      return;
    }
    host.innerHTML = '<h4>' + esc(t('title')) + '</h4><p>' + esc(t('help')) + '</p>' + rows.map(itemMarkup).join('');
    bind(host, function () { if (host._container) pending(host._container); });
  }

  function pending(container) {
    var host = container.querySelector('#ay-bias-card');
    if (!host) return Promise.resolve();
    host._container = container;
    var uid = Ayna.uid;
    var version = host._version = (host._version || 0) + 1;
    host.hidden = true;
    return Ayna.api('journal-followup', { op: 'biases' }).then(function (res) {
      if (!host.isConnected || Ayna.uid !== uid || version !== host._version) return;
      var rows = (res.biases || []).map(normalize).filter(function (row) { return row.id && row.status !== 'rejected'; });
      render(host, rows);
    }).catch(function () {
      // Bias observations are supplementary; never block the journal on them.
      if (host.isConnected && Ayna.uid === uid && version === host._version) host.hidden = true;
    });
  }

  // Proposals produced by the latest analysis appear right under it, so the
  // user sees them in context and can act before leaving the page.
  function attach(container, biases) {
    var result = container.querySelector('#ay-analysis-result');
    if (!result) return;
    var existing = result.querySelector('#ay-bias-proposals');
    var rows = (biases || []).map(normalize).filter(function (row) { return row.status !== 'rejected'; });
    if (!rows.length) { if (existing) existing.remove(); return; }
    var host = existing || document.createElement('section');
    host.id = 'ay-bias-proposals';
    host.className = 'ay-bias-proposals';
    host.innerHTML = '<h4>' + esc(t('new_title')) + '</h4><p>' + esc(t('proposal_help')) + '</p>' + rows.map(itemMarkup).join('');
    if (!existing) result.appendChild(host);
    bind(host, function () { pending(container); });
  }

  Ayna.bias = { pending: pending, attach: attach, normalize: normalize };
})();
