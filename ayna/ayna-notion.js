/* Notion trade import. The user's own token stays in the browser; the server
   only receives it for the duration of one sync request. */
(function () {
  var THROTTLE_MS = 15 * 60 * 1000;
  var STATE_KEY = 'ayna-notion-sync';
  var running = null;

  function t(key, vars) { return Ayna.t('notion.' + key, vars); }

  function token() {
    try { if (typeof getNotionToken === 'function') { var value = getNotionToken(); if (value) return value; } } catch (e) {}
    try { var raw = localStorage.getItem('notion_oauth_token'); return raw && raw.length > 20 ? raw : null; } catch (e) { return null; }
  }

  function databases() {
    try {
      if (typeof getNotionDbIds !== 'function') return null;
      var ids = getNotionDbIds() || {};
      var out = {};
      if (ids.kripto) out.kripto = ids.kripto;
      if (ids.fx) out.fx = ids.fx;
      return Object.keys(out).length ? out : null;
    } catch (e) { return null; }
  }

  function stateKey() { return STATE_KEY + ':' + (Ayna.uid || 'anon'); }
  function readState() {
    try { var raw = localStorage.getItem(stateKey()); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  }
  function writeState(state) {
    try { localStorage.setItem(stateKey(), JSON.stringify(state)); } catch (e) {}
  }

  function connected() { return !!token(); }
  function lastAt() { return readState().lastAt || null; }

  function ago(iso) {
    if (!iso) return '';
    var diff = Date.now() - Date.parse(iso);
    if (!isFinite(diff) || diff < 0) return '';
    var min = Math.round(diff / 60000);
    if (min < 1) return t('just_now');
    if (min < 60) return t('minutes_ago', { n: min });
    var hours = Math.round(min / 60);
    if (hours < 48) return t('hours_ago', { n: hours });
    return Ayna.fmtDate(String(iso).slice(0, 10));
  }

  function statusText() {
    if (!connected()) return t('not_connected');
    var last = lastAt();
    return last ? t('last', { when: ago(last) }) : t('ready');
  }

  function paintStatus(container) {
    var node = container.querySelector('#ay-notion-status');
    if (node) node.textContent = statusText();
  }

  // One request at a time; repeated clicks or the automatic pass share it.
  function sync() {
    if (running) return running;
    var accessToken = token();
    if (!accessToken) return Promise.reject({ code: 'notion_not_connected' });
    var payload = { token: accessToken };
    var dbIds = databases();
    if (dbIds) payload.dbs = dbIds;
    running = Ayna.api('notion-sync', payload).then(function (res) {
      writeState({ lastAt: new Date().toISOString(), upserted: res.upserted || 0, withNotes: res.withNotes || 0 });
      try { window.dispatchEvent(new CustomEvent('ayna:notion-synced', { detail: res })); } catch (e) {}
      return res;
    }).finally(function () { running = null; });
    return running;
  }

  function auto(force) {
    if (!connected()) return Promise.resolve(null);
    if (!force) {
      var last = lastAt();
      if (last && Date.now() - Date.parse(last) < THROTTLE_MS) return Promise.resolve(null);
    }
    return sync().catch(function () { return null; });
  }

  function refreshTrades(container) {
    if (Ayna.todayTrades && typeof Ayna.todayTrades.refresh === 'function') return Ayna.todayTrades.refresh(container);
    return Promise.resolve();
  }

  function mount(container) {
    paintStatus(container);
    var button = container.querySelector('#ay-notion-sync');
    var status = container.querySelector('#ay-notion-status');
    if (button) {
      button.disabled = running !== null;
      button.addEventListener('click', function () {
        if (button.disabled) return;
        button.disabled = true;
        if (status) status.textContent = t('syncing');
        sync().then(function (res) {
          if (status) status.textContent = res && res.upserted ? t('done', { n: res.upserted, notes: res.withNotes || 0 }) : t('empty');
          return refreshTrades(container);
        }).catch(function (error) {
          if (status) status.textContent = Ayna.errText(error.code || 'default');
          Ayna.flash(Ayna.errText(error.code || 'default'));
        }).finally(function () {
          button.disabled = false;
          paintStatus(container);
        });
      });
    }
    // Background catch-up keeps the journal useful without a manual click.
    return auto().then(function (res) {
      paintStatus(container);
      if (res && res.upserted) return refreshTrades(container);
    }).catch(function () {});
  }

  // OAuth: the API handler redirects to Notion and back to /#notion-token=...
  function connect() {
    var state = Ayna.uid ? '&state=' + encodeURIComponent(Ayna.uid) : '';
    window.location.href = '/api/notion-callback?action=auth' + state;
  }

  // Internal integration secret (ntn_...) or an OAuth token. No redirect URI
  // dance needed; the token is kept in this browser and in the user's cloud row.
  function saveToken(value) {
    var token = String(value || '').trim();
    if (token.length < 20) return false;
    try {
      if (typeof setNotionToken === 'function') setNotionToken(token);
      else localStorage.setItem('notion_oauth_token', token);
    } catch (e) {
      try { localStorage.setItem('notion_oauth_token', token); } catch (e2) { return false; }
    }
    return true;
  }

  function disconnect() {
    try { localStorage.removeItem('notion_oauth_token'); } catch (e) {}
    try {
      if (typeof AUTH !== 'undefined' && AUTH.cloud) {
        delete AUTH.cloud.notion_oauth_token;
        if (typeof scheduleCloudSync === 'function') scheduleCloudSync();
      }
    } catch (e) {}
    try { localStorage.removeItem(stateKey()); } catch (e) {}
  }

  function redirectUri() {
    return window.location.origin + '/api/notion-callback';
  }

  function settingsCard() {
    var h = '<div class="ay-card" id="ay-notion-card"><h4>' + t('settings_title') + '</h4>';
    h += '<p class="ay-notion-status" id="ay-notion-settings-status" role="status">' + Ayna.esc(statusText()) + '</p>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">';
    h += '<button type="button" class="btn solid" id="ay-notion-connect">' + t('connect') + '</button>';
    h += '<button type="button" class="btn" id="ay-notion-settings-sync">' + t('sync') + '</button>';
    if (connected()) h += '<button type="button" class="btn" id="ay-notion-disconnect">' + t('disconnect') + '</button>';
    h += '</div>';
    h += '<details class="ay-notion-help"><summary>' + t('help_summary') + '</summary>';
    h += '<p>' + t('help_oauth') + '</p>';
    h += '<p class="ay-notion-uri"><code id="ay-notion-uri">' + Ayna.esc(redirectUri()) + '</code> ';
    h += '<button type="button" class="btn" id="ay-notion-copy-uri">' + t('copy') + '</button></p>';
    h += '<p>' + t('help_token') + '</p>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    h += '<input type="password" class="ay-inp" id="ay-notion-token" autocomplete="off" spellcheck="false" placeholder="ntn_..." style="flex:1;min-width:200px">';
    h += '<button type="button" class="btn solid" id="ay-notion-save-token">' + t('save_token') + '</button>';
    h += '</div></details></div>';
    return h;
  }

  function mountSettings(container) {
    var status = container.querySelector('#ay-notion-settings-status');
    function setStatus(text) { if (status) status.textContent = text; }

    var connectBtn = container.querySelector('#ay-notion-connect');
    if (connectBtn) connectBtn.addEventListener('click', connect);

    var disconnectBtn = container.querySelector('#ay-notion-disconnect');
    if (disconnectBtn) disconnectBtn.addEventListener('click', function () {
      disconnect();
      Ayna.render();
    });

    var copyBtn = container.querySelector('#ay-notion-copy-uri');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var uri = redirectUri();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(uri);
        else {
          var tmp = document.createElement('textarea');
          tmp.value = uri; document.body.appendChild(tmp); tmp.select();
          document.execCommand('copy'); document.body.removeChild(tmp);
        }
        copyBtn.textContent = t('copied');
      } catch (e) {
        setStatus(uri);
      }
    });

    var saveBtn = container.querySelector('#ay-notion-save-token');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var input = container.querySelector('#ay-notion-token');
      var value = input ? input.value : '';
      if (!saveToken(value)) { setStatus(t('invalid_token')); return; }
      if (input) input.value = '';
      setStatus(t('syncing'));
      sync().then(function (res) {
        setStatus(res && res.upserted ? t('done', { n: res.upserted, notes: res.withNotes || 0 }) : t('empty'));
        return refreshTrades(container);
      }).catch(function (error) {
        setStatus(Ayna.errText(error.code || 'default'));
      });
    });

    var syncBtn = container.querySelector('#ay-notion-settings-sync');
    if (syncBtn) syncBtn.addEventListener('click', function () {
      if (!connected()) { setStatus(t('not_connected')); return; }
      syncBtn.disabled = true;
      setStatus(t('syncing'));
      sync().then(function (res) {
        setStatus(res && res.upserted ? t('done', { n: res.upserted, notes: res.withNotes || 0 }) : t('empty'));
        return refreshTrades(container);
      }).catch(function (error) {
        setStatus(Ayna.errText(error.code || 'default'));
      }).finally(function () { syncBtn.disabled = false; });
    });

    if (connected()) {
      auto().then(function (res) {
        if (status) status.textContent = statusText();
        if (res && res.upserted) refreshTrades(container);
      }).catch(function () {});
    }
  }

  Ayna.notion = {
    connected: connected,
    status: statusText,
    lastAt: lastAt,
    sync: sync,
    auto: auto,
    mount: mount,
    mountSettings: mountSettings,
    settingsCard: settingsCard,
    connect: connect,
    saveToken: saveToken,
    disconnect: disconnect,
    redirectUri: redirectUri,
    refreshTrades: refreshTrades
  };
})();
