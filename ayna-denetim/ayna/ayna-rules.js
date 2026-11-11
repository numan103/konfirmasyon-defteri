/* AYNA Rules tab - J7 */
Ayna.tabs.rules = { render: function (c) { renderRules(c); } };

var _rulesData = [];
var _rulesChecks = [];
var _goalsData = [];

function renderRules(c) {
  c.innerHTML = '<div class="ay-card">' + Ayna.t('common.loading') + '</div>';
  var uid = Ayna.uid, sb = Ayna.sb();
  var d30 = Ayna.addDays(Ayna.today(), -29);
  Promise.all([
    sb.from('ayna_rules').select('id,domain,if_text,then_text,is_active').eq('user_id', uid).order('created_at', { ascending: false }),
    sb.from('ayna_rule_checks').select('rule_id,result,local_date').eq('user_id', uid).gte('local_date', d30),
    sb.from('ayna_goals').select('id,kind,text,sort_order').eq('user_id', uid).in('kind', ['value', 'goal']).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  ]).then(function (r) {
    _rulesData = r[0].data || [];
    _rulesChecks = r[1].data || [];
    _goalsData = r[2].data || [];
    renderRulesContent(c);
  }).catch(function () {
    c.innerHTML = '<div class="ay-card">' + Ayna.t('err.default') + '</div>';
  });
}

function renderRulesContent(c) {
  var h = '';

  h += '<h3 style="margin:0 0 4px;font-family:var(--font-display)">' + Ayna.t('rules.title') + '</h3>';
  h += '<p style="margin:0 0 16px;font-size:13px;color:var(--text-2)">' + Ayna.t('rules.intro') + '</p>';

  h += '<div id="ay-rules-list">';
  if (!_rulesData.length) {
    h += '<div class="ay-card" style="color:var(--text-2)">' + Ayna.t('rules.empty') + '</div>';
  } else {
    _rulesData.forEach(function (r) {
      h += _renderRuleRow(r);
    });
  }
  h += '</div>';

  h += '<div class="ay-card" style="margin-top:12px">';
  h += '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">';
  h += '<input class="ay-inp" id="ay-r-if" maxlength="140" placeholder="' + Ayna.esc(Ayna.t('rules.if_placeholder')) + '" style="flex:1;min-width:150px">';
  h += '<input class="ay-inp" id="ay-r-then" maxlength="140" placeholder="' + Ayna.esc(Ayna.t('rules.then_placeholder')) + '" style="flex:1;min-width:150px">';
  h += '</div>';
  h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  h += '<select class="ay-sel" id="ay-r-domain">';
  ['trade', 'relationships', 'spending', 'general'].forEach(function (d) {
    h += '<option value="' + d + '">' + Ayna.t('domain.' + d) + '</option>';
  });
  h += '</select>';
  h += '<button class="btn solid" id="ay-r-add">' + Ayna.esc(Ayna.t('rules.add')) + '</button>';
  h += '</div></div>';

  h += _renderGoalsSection('value', 'rules.values_title', 'rules.values_placeholder', 'rules.values_add');
  h += _renderGoalsSection('goal', 'rules.goals_title', 'rules.goals_placeholder', 'rules.goals_add');

  c.innerHTML = h;

  document.getElementById('ay-r-add').addEventListener('click', _addRule);
  document.getElementById('ay-r-if').addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('ay-r-then').focus(); });
  document.getElementById('ay-r-then').addEventListener('keydown', function (e) { if (e.key === 'Enter') _addRule(); });

  c.querySelectorAll('[data-del-rule]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!confirm(Ayna.t('common.confirm_delete'))) return;
      var id = btn.getAttribute('data-del-rule');
      Ayna.sb().from('ayna_rules').delete().eq('id', id).eq('user_id', Ayna.uid).then(function () {
        renderRules(document.getElementById('ay-content'));
      }).catch(function (e) { Ayna.flash(Ayna.errText(e.code || 'default')); });
    });
  });

  c.querySelectorAll('[data-toggle-rule]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-toggle-rule');
      var rule = _rulesData.find(function (r) { return r.id === id; });
      if (!rule) return;
      Ayna.sb().from('ayna_rules').update({ is_active: !rule.is_active }).eq('id', id).eq('user_id', Ayna.uid).then(function () {
        renderRules(document.getElementById('ay-content'));
      }).catch(function (e) { Ayna.flash(Ayna.errText(e.code || 'default')); });
    });
  });

  _bindGoalEvents(c, 'value');
  _bindGoalEvents(c, 'goal');
}

function _renderRuleRow(r) {
  var h = '<div class="ay-card" style="margin-bottom:8px;padding:10px 12px">';
  h += '<div style="font-size:14px">';
  h += Ayna.esc(Ayna.t('rules.if')) + ' ' + Ayna.esc(r.if_text) + ', ' + Ayna.esc(Ayna.t('rules.then')) + ' ' + Ayna.esc(r.then_text);
  h += '</div>';
  h += '<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">';
  h += '<span class="chip" style="font-size:11px">' + Ayna.esc(Ayna.t('domain.' + r.domain)) + '</span>';
  h += '<span style="font-size:12px;color:var(--text-2)">' + _adherenceText(r.id) + '</span>';
  h += '<button class="btn' + (r.is_active ? ' chip on' : ' chip') + '" data-toggle-rule="' + r.id + '" style="font-size:11px;padding:2px 8px">' + Ayna.t(r.is_active ? 'rules.active' : 'rules.inactive') + '</button>';
  h += '<button class="btn" data-del-rule="' + r.id + '" style="font-size:11px;padding:2px 8px;color:var(--red)">' + Ayna.t('common.delete') + '</button>';
  h += '</div></div>';
  return h;
}

function _adherenceText(ruleId) {
  var checks = _rulesChecks.filter(function (c) { return c.rule_id === ruleId; });
  var kept = 0, broken = 0;
  checks.forEach(function (c) {
    if (c.result === 'kept') kept++;
    if (c.result === 'broken') broken++;
  });
  var total = kept + broken;
  if (total < 3) return Ayna.t('rules.adherence_none');
  return Ayna.t('rules.adherence', { k: kept, t: total });
}

function _addRule() {
  var ifEl = document.getElementById('ay-r-if');
  var thenEl = document.getElementById('ay-r-then');
  var domainEl = document.getElementById('ay-r-domain');
  var ifVal = ifEl.value.trim();
  var thenVal = thenEl.value.trim();
  if (!ifVal || !thenVal) {
    Ayna.flash(Ayna.t('rules.required'));
    return;
  }
  Ayna.sb().from('ayna_rules').insert({
    user_id: Ayna.uid,
    domain: domainEl.value,
    if_text: ifVal,
    then_text: thenVal,
    is_active: true
  }).then(function () {
    renderRules(document.getElementById('ay-content'));
  }).catch(function (e) { Ayna.flash(Ayna.errText(e.code || 'default')); });
}

function _renderGoalsSection(kind, titleKey, placeholderKey, addKey) {
  var items = _goalsData.filter(function (g) { return g.kind === kind; });
  var h = '<div class="ay-card" style="margin-top:12px">';
  h += '<h4 style="margin:0 0 8px;font-family:var(--font-display)">' + Ayna.t(titleKey) + '</h4>';
  if (!items.length) {
    h += '<p style="margin:0 0 8px;font-size:13px;color:var(--text-2)">—</p>';
  } else {
    items.forEach(function (item) {
      h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
      h += '<span style="flex:1;font-size:14px">' + Ayna.esc(item.text) + '</span>';
      h += '<button class="btn" data-del-goal="' + item.id + '" style="font-size:11px;padding:2px 8px;color:var(--red)">' + Ayna.t('common.delete') + '</button>';
      h += '</div>';
    });
  }
  h += '<div style="display:flex;gap:8px;margin-top:8px">';
  h += '<input class="ay-inp" id="ay-g-' + kind + '" maxlength="' + (kind === 'value' ? '60' : '140') + '" placeholder="' + Ayna.esc(Ayna.t(placeholderKey)) + '" style="flex:1">';
  h += '<button class="btn solid" data-add-goal="' + kind + '">' + Ayna.esc(Ayna.t(addKey)) + '</button>';
  h += '</div></div>';
  return h;
}

function _bindGoalEvents(c, kind) {
  var addBtn = c.querySelector('[data-add-goal="' + kind + '"]');
  var input = document.getElementById('ay-g-' + kind);
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      var val = input.value.trim();
      if (!val) return;
      Ayna.sb().from('ayna_goals').insert({
        user_id: Ayna.uid,
        kind: kind,
        text: val,
        is_active: true,
        sort_order: 0
      }).then(function () {
        renderRules(document.getElementById('ay-content'));
      }).catch(function (e) { Ayna.flash(Ayna.errText(e.code || 'default')); });
    });
  }
  if (input) {
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') addBtn.click(); });
  }
  c.querySelectorAll('[data-del-goal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!confirm(Ayna.t('common.confirm_delete'))) return;
      var id = btn.getAttribute('data-del-goal');
      Ayna.sb().from('ayna_goals').delete().eq('id', id).eq('user_id', Ayna.uid).then(function () {
        renderRules(document.getElementById('ay-content'));
      }).catch(function (e) { Ayna.flash(Ayna.errText(e.code || 'default')); });
    });
  });
}
