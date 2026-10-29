/* Optional browser dictation. No audio is stored or sent by the site. */
Ayna.voice = (function () {
  var active = null;
  var bound = new WeakSet();
  function engine() { return window.SpeechRecognition || window.webkitSpeechRecognition; }
  function supported() { return !!engine() && window.isSecureContext !== false; }
  function markup(id) {
    return '<div class="ay-voice"><button type="button" class="btn" data-ay-voice="' + Ayna.esc(id) + '" aria-controls="' + Ayna.esc(id) + '" aria-pressed="false">🎙 ' + Ayna.t('voice.start') + '</button>' +
      '<span id="' + id + '-voice-status" class="ay-voice-status" role="status" aria-live="polite"></span>' +
      '<small>' + Ayna.t('voice.privacy') + '</small></div>';
  }
  function status(session, key, text) {
    if (session.status) session.status.textContent = Ayna.t(key) + (text ? ' ' + text : '');
  }
  function finish(session) {
    session.button.textContent = '🎙 ' + Ayna.t('voice.start');
    session.button.setAttribute('aria-pressed', 'false');
    if (session.save) session.save.disabled = session.saveDisabled;
    if (active === session) active = null;
  }
  function cancel() {
    var session = active;
    if (!session) return;
    active = null;
    try { session.recognition.abort(); } catch (e) {}
    finish(session);
    status(session, 'voice.stopped');
  }
  function start(button, id) {
    if (active) {
      if (active.button === button) {
        status(active, 'voice.finishing');
        try { active.recognition.stop(); } catch (e) { cancel(); }
        return;
      }
      cancel();
    }
    var target = document.getElementById(id);
    if (!target || !supported()) return;
    var session = {
      button: button, target: target,
      status: document.getElementById(id + '-voice-status'),
      save: document.getElementById(id === 'ay-qn' ? 'ay-qns' : 'ay-cd'),
      finals: {}, failed: false
    };
    session.saveDisabled = session.save ? session.save.disabled : false;
    try {
      session.recognition = new (engine())();
      session.recognition.lang = Ayna.lang() === 'en' ? 'en-US' : 'tr-TR';
      session.recognition.continuous = true;
      session.recognition.interimResults = true;
      session.recognition.maxAlternatives = 1;
      if (session.save) session.save.disabled = true;
      active = session;
      button.textContent = '■ ' + Ayna.t('voice.stop');
      button.setAttribute('aria-pressed', 'true');
      status(session, 'voice.requesting');
      session.recognition.onstart = function () { if (active === session) status(session, 'voice.listening'); };
      session.recognition.onresult = function (event) {
        if (active !== session || !target.isConnected) return;
        var interim = '';
        for (var i = event.resultIndex || 0; i < event.results.length; i++) {
          var result = event.results[i], text = String(result[0].transcript || '').trim();
          if (!result.isFinal) { interim += text + ' '; continue; }
          if (session.finals[i]) continue;
          session.finals[i] = true;
          if (!text) continue;
          var addition = (target.value && !/\s$/.test(target.value) ? ' ' : '') + text;
          var limit = target.maxLength >= 0 ? target.maxLength : Infinity;
          var room = Math.max(0, limit - target.value.length);
          target.value += addition.slice(0, room);
          target.dispatchEvent(new Event('input', { bubbles: true }));
          if (addition.length > room) {
            session.failed = true;
            status(session, 'voice.limit');
            session.recognition.stop();
            return;
          }
        }
        status(session, interim ? 'voice.hearing' : 'voice.listening', interim.trim());
      };
      session.recognition.onerror = function (event) {
        if (active !== session) return;
        session.failed = true;
        var errors = { 'not-allowed': 'permission', 'service-not-allowed': 'permission', 'audio-capture': 'microphone', 'no-speech': 'no_speech', network: 'network' };
        status(session, 'voice.' + (errors[event.error] || 'error'));
        finish(session);
        try { session.recognition.abort(); } catch (e) {}
      };
      session.recognition.onend = function () {
        if (active !== session) return;
        if (!session.failed) status(session, 'voice.stopped');
        finish(session);
      };
      session.recognition.start();
    } catch (e) {
      status(session, 'voice.error');
      finish(session);
    }
  }
  function bind(container) {
    container.querySelectorAll('[data-ay-voice]').forEach(function (button) {
      if (bound.has(button)) return;
      bound.add(button);
      var id = button.getAttribute('data-ay-voice');
      if (!supported()) {
        button.disabled = true;
        var label = document.getElementById(id + '-voice-status');
        if (label) label.textContent = Ayna.t('voice.unsupported');
        return;
      }
      button.addEventListener('click', function () { start(button, id); });
    });
  }
  window.addEventListener('pagehide', cancel);
  document.addEventListener('visibilitychange', function () { if (document.hidden) cancel(); });
  return { markup: markup, bind: bind, cancel: cancel };
})();
