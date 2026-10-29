import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup({ supported = true, throws = false } = {}) {
  const instances = [], nodes = {}, events = {};
  function button(id) {
    return { disabled: false, attrs: {}, listeners: {},
      getAttribute: () => id,
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(k, fn) { this.listeners[k] = fn; },
      click() { this.listeners.click(); }
    };
  }
  const buttons = ['ay-qn', 'ay-nb'].map(button);
  for (const id of ['ay-qn', 'ay-nb']) {
    nodes[id] = { value: 'My existing note.', maxLength: 5000, isConnected: true, dispatchEvent() {} };
    nodes[id + '-voice-status'] = { textContent: '' };
  }
  nodes['ay-qns'] = { disabled: false };
  nodes['ay-cd'] = { disabled: false };
  class Recognition {
    constructor() { if (throws) throw new Error('unavailable'); instances.push(this); }
    start() { this.started = true; this.onstart(); }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
  }
  const window = { isSecureContext: true, addEventListener: (k, fn) => { events[k] = fn; } };
  if (supported) window.SpeechRecognition = Recognition;
  const document = { hidden: false, getElementById: id => nodes[id], addEventListener: (k, fn) => { events[k] = fn; } };
  const context = vm.createContext({ window, document, Event: class {}, WeakSet, Ayna: { esc: String, t: k => k, lang: () => 'tr' } });
  vm.runInContext(fs.readFileSync(new URL('../ayna/ayna-voice.js', import.meta.url), 'utf8'), context);
  context.Ayna.voice.bind({ querySelectorAll: () => buttons });
  return { voice: context.Ayna.voice, nodes, buttons, instances, events, document };
}
function result(recognition, text, final = true) {
  const value = [{ transcript: text }]; value.isFinal = final;
  recognition.onresult({ resultIndex: 0, results: [value] });
}

test('microphone never starts automatically; unsupported browsers can keep typing', () => {
  const s = setup({ supported: false });
  assert.equal(s.instances.length, 0);
  assert.equal(s.buttons[0].disabled, true);
  assert.equal(s.nodes['ay-qns'].disabled, false);
  assert.equal(s.nodes['ay-qn-voice-status'].textContent, 'voice.unsupported');
});

test('final speech appends to current text, interim stays separate, duplicate finals are ignored', () => {
  const s = setup();
  assert.equal(s.instances.length, 0);
  s.buttons[0].click();
  const r = s.instances[0];
  assert.equal(r.lang, 'tr-TR');
  assert.equal(s.nodes['ay-qns'].disabled, true);
  result(r, 'partial', false);
  assert.equal(s.nodes['ay-qn'].value, 'My existing note.');
  s.nodes['ay-qn'].value += ' Typed while listening.';
  result(r, 'Spoken words.');
  result(r, 'Spoken words.');
  assert.equal(s.nodes['ay-qn'].value, 'My existing note. Typed while listening. Spoken words.');
  s.buttons[0].click();
  assert.equal(r.stopped, true);
  r.onend();
  assert.equal(s.nodes['ay-qns'].disabled, false);
  assert.equal(s.buttons[0].attrs['aria-pressed'], 'false');
});

test('permission error releases controls and does not erase text', () => {
  const s = setup(); s.buttons[0].click();
  s.instances[0].onerror({ error: 'not-allowed' });
  assert.equal(s.nodes['ay-qn-voice-status'].textContent, 'voice.permission');
  assert.equal(s.nodes['ay-qns'].disabled, false);
  assert.equal(s.instances[0].aborted, true);
  assert.equal(s.nodes['ay-qn'].value, 'My existing note.');
});

test('dictation respects textarea length and stops at the limit', () => {
  const s = setup(); s.nodes['ay-qn'].maxLength = 20;
  s.buttons[0].click(); result(s.instances[0], 'A long sentence that cannot fit.');
  assert.equal(s.nodes['ay-qn'].value.length, 20);
  assert.equal(s.instances[0].stopped, true);
  assert.equal(s.nodes['ay-qn-voice-status'].textContent, 'voice.limit');
});

test('navigation or hiding the page aborts the microphone and rejects late results', () => {
  const s = setup(); s.buttons[0].click();
  s.document.hidden = true; s.events.visibilitychange();
  result(s.instances[0], 'Late speech');
  assert.equal(s.instances[0].aborted, true);
  assert.equal(s.nodes['ay-qn'].value, 'My existing note.');
  assert.equal(s.nodes['ay-qns'].disabled, false);
});

test('switching note fields stops previous recognition; constructor failure unlocks Save', () => {
  const s = setup(); s.buttons[0].click(); s.buttons[1].click();
  assert.equal(s.instances[0].aborted, true);
  assert.equal(s.nodes['ay-qns'].disabled, false);
  assert.equal(s.nodes['ay-cd'].disabled, true);
  s.voice.cancel();
  assert.equal(s.nodes['ay-cd'].disabled, false);
  const fail = setup({ throws: true }); fail.buttons[0].click();
  assert.equal(fail.nodes['ay-qns'].disabled, false);
  assert.equal(fail.nodes['ay-qn-voice-status'].textContent, 'voice.error');
});
