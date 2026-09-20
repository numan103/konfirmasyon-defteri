/* AYNA Archive tab - J8 */
Ayna.tabs.archive = { render: function (c) {
  var PAGE = 30;
  var offset = 0;
  var activeSub = 'journal';

  function renderSubtabs() {
    var keys = ['reports', 'good', 'decisions', 'journal'];
    var h = '<div class="ay-seg" id="ay-arc-seg">';
    keys.forEach(function (k) {
      h += '<button' + (k === activeSub ? ' class="ay-on"' : '') + ' data-sub="' + k + '">' + Ayna.t('archive.' + k) + '</button>';
    });
    h += '</div><div id="ay-arc-body"></div>';
    c.innerHTML = h;
    c.querySelector('#ay-arc-seg').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sub]');
      if (!btn) return;
      activeSub = btn.getAttribute('data-sub');
      c.querySelectorAll('#ay-arc-seg button').forEach(function (b) { b.classList.remove('ay-on'); });
      btn.classList.add('ay-on');
      renderBody();
    });
    renderBody();
  }

  function renderBody() {
    var body = document.getElementById('ay-arc-body');
    if (!body) return;
    if (activeSub === 'journal') renderJournal(body);
    else body.innerHTML = '<div class="ay-card">' + Ayna.t('common.next_phase') + '</div>';
  }

  function renderJournal(body) {
    body.innerHTML = '<div class="ay-card">' + Ayna.t('common.loading') + '</div>';
    Ayna.sb().from('ayna_entries')
      .select('*', { count: 'exact' })
      .eq('user_id', Ayna.uid)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1)
      .then(function (res) {
        var rows = res.data || [];
        var total = res.count || 0;
        if (!rows.length && !offset) { body.innerHTML = '<div class="ay-card">' + Ayna.t('archive.journal_empty') + '</div>'; return; }
        var h = '';
        rows.forEach(function (r) { h += entryCard(r); });
        if (offset + PAGE < total) h += '<div class="ay-card" style="text-align:center"><button class="btn" id="ay-arc-more">' + Ayna.t('common.more') + '</button></div>';
        body.innerHTML = h;
        bindEntries(body);
        var moreBtn = document.getElementById('ay-arc-more');
        if (moreBtn) moreBtn.addEventListener('click', function () { offset += PAGE; renderJournal(body); });
      }).catch(function () {
        body.innerHTML = '<div class="ay-card">' + Ayna.t('err.default') + '</div>';
      });
  }

  function entryCard(r) {
    var h = '<div class="ay-card ay-arc-entry" data-id="' + r.id + '">';
    h += '<div class="ay-arc-meta"><span class="ay-arc-date">' + Ayna.fmtDate(r.local_date) + '</span>';
    h += '<span class="ay-arc-kind">' + Ayna.t('entry.' + r.kind) + '</span></div>';
    if (r.pleasantness != null && r.energy != null) h += '<div class="ay-arc-compass">' + Ayna.t('today.compass_value', { p: Ayna.num(r.pleasantness, true), e: Ayna.num(r.energy, true) }) + '</div>';
    if (r.mood_words && r.mood_words.length) h += '<div class="ay-arc-field"><span class="ay-arc-lbl">' + Ayna.t('label.words') + ':</span> ' + Ayna.esc(r.mood_words.join(', ')) + '</div>';
    if (r.sleep_hours != null) h += '<div class="ay-arc-field"><span class="ay-arc-lbl">' + Ayna.t('label.sleep_hours', { s: Ayna.num(r.sleep_hours) }) + '</span></div>';
    if (r.intention) h += '<div class="ay-arc-field"><span class="ay-arc-lbl">' + Ayna.t('label.intention') + ':</span> ' + Ayna.esc(r.intention) + '</div>';
    if (r.summary) h += '<div class="ay-arc-field"><span class="ay-arc-lbl">' + Ayna.t('label.summary') + ':</span> ' + Ayna.esc(r.summary) + '</div>';
    if (r.processing_error) h += '<div class="ay-err-msg">' + Ayna.t('archive.entry_error') + ' <button class="btn" data-reprocess="' + r.id + '">' + Ayna.t('archive.entry_reprocess') + '</button></div>';
    if (r.body) h += '<div class="ay-arc-body-text">' + Ayna.esc(r.body) + '</div>';
    if (r.kind === 'evening' || r.kind === 'note') {
      h += '<div class="ay-arc-actions">';
      h += '<button class="btn" data-edit="' + r.id + '">' + Ayna.t('common.edit') + '</button>';
      h += '<button class="btn danger" data-del="' + r.id + '">' + Ayna.t('common.delete') + '</button>';
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function bindEntries(root) {
    root.querySelectorAll('[data-reprocess]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-reprocess');
        btn.disabled = true;
        Ayna.api('scribe', { entry_id: id }).then(function () {
          Ayna.flash(Ayna.t('common.saved'));
          renderJournal(document.getElementById('ay-arc-body'));
        }).catch(function (e) { Ayna.flash(Ayna.errText(e.code)); btn.disabled = false; });
      });
    });
    root.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-edit');
        var card = root.querySelector('[data-id="' + id + '"]');
        var bodyEl = card.querySelector('.ay-arc-body-text');
        var current = '';
        var rows = card.querySelectorAll('.ay-arc-field');
        var allCards = root.querySelectorAll('.ay-arc-entry');
        allCards.forEach(function (el) { if (el.getAttribute('data-id') === id) { /* found */ } });
        var entry = null;
        Ayna.sb().from('ayna_entries').select('body,kind').eq('id', id).eq('user_id', Ayna.uid).maybeSingle().then(function (res) {
          entry = res.data;
          current = entry ? entry.body || '' : '';
          var editH = '<textarea class="ay-ta" id="ay-edit-body" rows="4">' + Ayna.esc(current) + '</textarea>';
          editH += '<div class="ay-arc-actions"><button class="btn solid" id="ay-edit-save">' + Ayna.t('common.save') + '</button>';
          editH += '<button class="btn" id="ay-edit-cancel">' + Ayna.t('common.cancel') + '</button></div>';
          bodyEl.innerHTML = editH;
          card.querySelector('[data-edit]').style.display = 'none';
          document.getElementById('ay-edit-save').addEventListener('click', function () {
            var newBody = document.getElementById('ay-edit-body').value;
            Ayna.sb().from('ayna_entries').update({ body: newBody }).eq('id', id).eq('user_id', Ayna.uid).then(function () {
              return Ayna.api('scribe', { entry_id: id });
            }).then(function () {
              Ayna.flash(Ayna.t('common.saved'));
              renderJournal(document.getElementById('ay-arc-body'));
            }).catch(function (e) { Ayna.flash(Ayna.errText(e.code)); });
          });
          document.getElementById('ay-edit-cancel').addEventListener('click', function () { renderJournal(document.getElementById('ay-arc-body')); });
        });
      });
    });
    root.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-del');
        if (!confirm(Ayna.t('common.confirm_delete'))) return;
        btn.disabled = true;
        Ayna.sb().from('ayna_events').delete().eq('entry_id', id).eq('user_id', Ayna.uid).then(function () {
          return Ayna.sb().from('ayna_entry_people').delete().eq('entry_id', id).eq('user_id', Ayna.uid);
        }).then(function () {
          return Ayna.sb().from('ayna_open_loops').delete().eq('source_entry_id', id).eq('user_id', Ayna.uid);
        }).then(function () {
          return Ayna.sb().from('ayna_facts').delete().eq('source_entry_id', id).eq('user_id', Ayna.uid);
        }).then(function () {
          return Ayna.sb().from('ayna_insights').delete().eq('source_entry_id', id).eq('user_id', Ayna.uid);
        }).then(function () {
          return Ayna.sb().from('ayna_entries').delete().eq('id', id).eq('user_id', Ayna.uid);
        }).then(function () {
          Ayna.flash(Ayna.t('common.saved'));
          renderJournal(document.getElementById('ay-arc-body'));
        }).catch(function (e) { Ayna.flash(Ayna.errText(e.code)); btn.disabled = false; });
      });
    });
  }

  renderSubtabs();
}};
