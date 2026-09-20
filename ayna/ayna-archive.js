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
    else if (activeSub === 'reports') renderReports(body);
    else if (activeSub === 'good') renderGood(body);
    else if (activeSub === 'decisions') renderDecisions(body);
  }

  function renderReports(body) {
    body.innerHTML = '<div class="ay-card">' + Ayna.t('common.loading') + '</div>';
    var offset = 0;
    var PAGE = 20;
    function load(append) {
      Ayna.sb().from('ayna_insights')
        .select('*', { count: 'exact' })
        .eq('user_id', Ayna.uid)
        .in('kind', ['daily', 'instant', 'weekly', 'monthly', 'decision_review'])
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1)
        .then(function (res) {
          var rows = res.data || [];
          var total = res.count || 0;
          if (!rows.length && !offset) { body.innerHTML = '<div class="ay-card">' + Ayna.t('archive.reports_empty') + '</div>'; return; }
          var h = append ? body.innerHTML : '';
          rows.forEach(function (r) { h += insightCard(r); });
          if (offset + PAGE < total) h += '<div class="ay-card" style="text-align:center"><button class="btn" id="ay-rpt-more">' + Ayna.t('common.more') + '</button></div>';
          body.innerHTML = h;
          bindInsights(body);
          var moreBtn = document.getElementById('ay-rpt-more');
          if (moreBtn) moreBtn.addEventListener('click', function () { offset += PAGE; load(true); });
        }).catch(function () {
          body.innerHTML = '<div class="ay-card">' + Ayna.t('err.default') + '</div>';
        });
    }
    load(false);
  }

  function insightCard(r) {
    var h = '<div class="ay-card ay-arc-entry" data-iid="' + r.id + '">';
    h += '<div class="ay-arc-meta"><span class="ay-arc-kind">' + Ayna.t('insight.' + r.kind) + '</span>';
    h += '<span class="ay-arc-date">' + Ayna.fmtDate(r.period_start) + '</span></div>';
    h += '<h4>' + Ayna.esc(r.title || '') + '</h4>';
    h += '<div class="ay-arc-body-text" id="ay-rp-' + r.id + '">' + Ayna.md(r.body || '') + '</div>';
    if (r.focus) h += '<div class="ay-arc-field"><span class="ay-arc-lbl">' + Ayna.t('archive.focus', { focus: Ayna.esc(r.focus) }) + '</span></div>';
    if (r.evidence && r.evidence.length) {
      h += '<div style="margin-top:4px"><button class="btn" data-ev="' + r.id + '">' + Ayna.t('coach.evidence', { n: r.evidence.length }) + '</button></div>';
    }
    h += '<div class="ay-arc-actions">';
    h += '<button class="btn" data-fb-u="' + r.id + '">' + Ayna.t('archive.fb_useful') + '</button>';
    h += '<button class="btn" data-fb-n="' + r.id + '">' + Ayna.t('archive.fb_not_useful') + '</button>';
    h += '<button class="btn" data-fb-w="' + r.id + '">' + Ayna.t('archive.fb_wrong') + '</button>';
    if (r.kind === 'decision_review' && r.decision_id) {
      h += '<button class="btn" data-goto-dec="' + r.decision_id + '">' + Ayna.t('archive.decisions') + '</button>';
    }
    h += '</div></div>';
    return h;
  }

  function bindInsights(root) {
    root.querySelectorAll('[data-ev]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-ev');
        var card = root.querySelector('[data-iid="' + id + '"]');
        var bodyEl = card ? card.querySelector('.ay-arc-body-text') : null;
        if (!bodyEl) return;
        btn.disabled = true;
        Ayna.sb().from('ayna_insights').select('evidence').eq('id', id).eq('user_id', Ayna.uid).single()
          .then(function (res) {
            var ids = res.data && res.data.evidence ? res.data.evidence : [];
            if (!ids.length) return;
            return Ayna.sb().from('ayna_entries').select('id,local_date,kind,body,summary').in('id', ids).order('local_date', { ascending: false });
          }).then(function (res2) {
            if (!res2 || !res2.data || !res2.data.length) return;
            var evH = '';
            res2.data.forEach(function (e) {
              evH += '<div style="margin:4px 0;padding:4px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px">';
              evH += '<span class="ay-arc-date">' + Ayna.fmtDate(e.local_date) + '</span> ';
              evH += Ayna.t('entry.' + e.kind) + ' ';
              if (e.summary) evH += Ayna.esc(e.summary);
              if (e.body) evH += ' ' + Ayna.esc(e.body.slice(0, 200));
              evH += '</div>';
            });
            bodyEl.insertAdjacentHTML('beforeend', evH);
          }).catch(function () {});
      });
    });
    root.querySelectorAll('[data-fb-u]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-fb-u');
        btn.disabled = true;
        Ayna.sb().from('ayna_insights').update({ feedback: 'useful' }).eq('id', id).eq('user_id', Ayna.uid)
          .then(function () { Ayna.flash(Ayna.t('common.saved')); }).catch(function () { btn.disabled = false; });
      });
    });
    root.querySelectorAll('[data-fb-n]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-fb-n');
        btn.disabled = true;
        Ayna.sb().from('ayna_insights').update({ feedback: 'not_useful' }).eq('id', id).eq('user_id', Ayna.uid)
          .then(function () { Ayna.flash(Ayna.t('common.saved')); }).catch(function () { btn.disabled = false; });
      });
    });
    root.querySelectorAll('[data-fb-w]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-fb-w');
        btn.disabled = true;
        Ayna.sb().from('ayna_insights').update({ feedback: 'wrong' }).eq('id', id).eq('user_id', Ayna.uid)
          .then(function () { Ayna.flash(Ayna.t('common.saved')); }).catch(function () { btn.disabled = false; });
      });
    });
    root.querySelectorAll('[data-goto-dec]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeSub = 'decisions';
        c.querySelectorAll('#ay-arc-seg button').forEach(function (b) { b.classList.remove('ay-on'); });
        c.querySelector('#ay-arc-seg button[data-sub="decisions"]').classList.add('ay-on');
        renderBody();
      });
    });
  }

  function renderGood(body) {
    body.innerHTML = '<div class="ay-card">' + Ayna.t('common.loading') + '</div>';
    Ayna.sb().from('ayna_entries')
      .select('local_date,good_moment')
      .eq('user_id', Ayna.uid)
      .not('good_moment', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(function (res) {
        var rows = res.data || [];
        if (!rows.length) { body.innerHTML = '<div class="ay-card">' + Ayna.t('archive.good_empty') + '</div>'; return; }
        var h = '';
        rows.forEach(function (r) {
          h += '<div class="ay-card"><div class="ay-arc-meta"><span class="ay-arc-date">' + Ayna.fmtDate(r.local_date) + '</span></div>';
          h += '<p>' + Ayna.esc(r.good_moment) + '</p></div>';
        });
        body.innerHTML = h;
      }).catch(function () {
        body.innerHTML = '<div class="ay-card">' + Ayna.t('err.default') + '</div>';
      });
  }

  function renderDecisions(body) {
    body.innerHTML = '<div class="ay-card">' + Ayna.t('common.loading') + '</div>';
    Ayna.sb().from('ayna_decisions')
      .select('*')
      .eq('user_id', Ayna.uid)
      .order('created_at', { ascending: false })
      .then(function (res) {
        var rows = res.data || [];
        if (!rows.length) { body.innerHTML = '<div class="ay-card">' + Ayna.t('archive.decisions_empty') + '</div>'; return; }
        var h = '';
        rows.forEach(function (r) {
          h += '<div class="ay-card ay-arc-entry" data-did="' + r.id + '">';
          h += '<h4>' + Ayna.esc(r.title) + '</h4>';
          h += '<div class="ay-arc-meta"><span class="ay-arc-date">' + Ayna.fmtDate(r.created_at) + '</span></div>';
          if (r.review_date) h += '<p>' + Ayna.t('archive.decision_review_on', { date: Ayna.fmtDate(r.review_date) }) + '</p>';
          if (r.reasoning) h += '<div class="ay-arc-field"><span class="ay-arc-lbl">' + Ayna.t('label.reasoning') + ':</span> ' + Ayna.esc(r.reasoning) + '</div>';
          if (r.feeling) h += '<div class="ay-arc-field"><span class="ay-arc-lbl">' + Ayna.t('label.feeling') + ':</span> ' + Ayna.esc(r.feeling) + '</div>';
          if (r.premortem) h += '<div class="ay-arc-field"><span class="ay-arc-lbl">' + Ayna.t('label.premortem') + ':</span> ' + Ayna.esc(r.premortem) + '</div>';
          if (r.outcome) {
            h += '<div class="ay-arc-field"><span class="ay-arc-lbl">' + Ayna.t('archive.decision_outcome') + ':</span> ' + Ayna.esc(r.outcome) + '</div>';
          } else {
            h += '<div style="margin-top:6px">';
            h += '<textarea class="ay-ta" id="ay-dec-out-' + r.id + '" rows="3" placeholder="' + Ayna.esc(Ayna.t('archive.decision_outcome')) + '"></textarea>';
            h += '<button class="btn solid" data-dec-save="' + r.id + '">' + Ayna.t('archive.decision_outcome_save') + '</button>';
            h += '</div>';
          }
          h += '</div>';
        });
        body.innerHTML = h;
        body.querySelectorAll('[data-dec-save]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var did = btn.getAttribute('data-dec-save');
            var ta = document.getElementById('ay-dec-out-' + did);
            var val = ta ? ta.value.trim() : '';
            if (!val) return;
            btn.disabled = true;
            Ayna.sb().from('ayna_decisions').update({ outcome: val, reviewed_at: new Date().toISOString() }).eq('id', did).eq('user_id', Ayna.uid)
              .then(function () { Ayna.flash(Ayna.t('common.saved')); renderDecisions(body); })
              .catch(function () { btn.disabled = false; Ayna.flash(Ayna.errText('default')); });
          });
        });
      }).catch(function () {
        body.innerHTML = '<div class="ay-card">' + Ayna.t('err.default') + '</div>';
      });
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
