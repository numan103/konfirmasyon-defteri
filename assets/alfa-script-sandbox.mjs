// Sandboxed user-study runner. User code executes in an opaque-origin iframe
// with a strict CSP; the parent only receives numeric plot arrays.
const MAX_CODE = 20000;
const MAX_BARS = 600;
const MAX_PLOTS = 8;

export const DEFAULT_SCRIPT = `study({ name: 'Özel ortalama', overlay: true });
// onBar(ctx): ctx.close / open / high / low / volume / time / index
// ctx.plot(name, value, { color }) çizer; değer null ise boşluk bırakır.
function onBar(ctx) {
  const period = input(14, 'Periyot');
  const start = Math.max(0, ctx.index - period + 1);
  let sum = 0;
  for (let i = start; i <= ctx.index; i++) sum += ctx.close[i];
  ctx.plot('Ortalama', sum / (ctx.index - start + 1), { color: '#2962ff' });
}`;

export function validateScriptCode(code) {
  const text = String(code ?? '');
  if (!text.trim()) throw new Error('Script kodu boş olamaz');
  if (text.length > MAX_CODE) throw new Error(`Script kodu en fazla ${MAX_CODE} karakter olabilir`);
  if (!/\bonBar\s*\(/.test(text)) throw new Error("'function onBar(ctx)' tanımı gerekli");
  return text;
}

export function normalizeScriptResult(raw, barCount) {
  if (!raw || typeof raw !== 'object') throw new Error('Script sonucu okunamadı');
  if (!raw.ok) throw new Error(String(raw.error || 'Script çalıştırılamadı').slice(0, 300));
  const study = raw.study && typeof raw.study === 'object'
    ? { name: String(raw.study.name || 'Özel script').replace(/[^\w \u00c0-\u017f-]/g, '').slice(0, 48) || 'Özel script',
        overlay: raw.study.overlay !== false }
    : { name: 'Özel script', overlay: true };
  const plots = Array.isArray(raw.plots) ? raw.plots.slice(0, MAX_PLOTS).map(plot => {
    const values = Array.isArray(plot?.values) ? plot.values.slice(0, MAX_BARS) : [];
    while (values.length < barCount) values.push(null);
    return {
      name: String(plot?.name || 'plot').replace(/[^\w \u00c0-\u017f-]/g, '').slice(0, 40) || 'plot',
      color: /^#[0-9a-f]{3,8}$/i.test(String(plot?.color || '')) ? String(plot.color) : '#2962ff',
      values: values.map(v => Number.isFinite(v) ? Number(v) : null)
    };
  }) : [];
  return { ok: true, study, plots };
}

const IFRAME_HTML = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; connect-src 'none'; style-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"></head><body><script>
(function () {
  var CHANNEL = 'alfa-script-run';
  var MAX_BARS = ${MAX_BARS};
  var MAX_PLOTS = ${MAX_PLOTS};
  function cleanName(value, fallback) {
    var text = String(value == null ? fallback : value).replace(/[^A-Za-z0-9 _\\u00c0-\\u017f-]/g, '').slice(0, 40).trim();
    return text || fallback;
  }
  function sma(values, period) {
    var p = Math.max(1, Math.floor(Number(period) || 14)), out = new Array(values.length), sum = 0;
    for (var i = 0; i < values.length; i++) {
      sum += Number(values[i]) || 0;
      if (i >= p) sum -= Number(values[i - p]) || 0;
      out[i] = i >= p - 1 ? sum / p : null;
    }
    return out;
  }
  function ema(values, period) {
    var p = Math.max(1, Math.floor(Number(period) || 14)), k = 2 / (p + 1), out = new Array(values.length), seed = null, sum = 0, count = 0;
    for (var i = 0; i < values.length; i++) {
      var v = Number(values[i]) || 0;
      if (count < p) { sum += v; count++; if (count === p) { seed = sum / p; out[i] = seed; } }
      else { seed = v * k + seed * (1 - k); out[i] = seed; }
    }
    return out;
  }
  addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.channel !== CHANNEL || typeof msg.id !== 'string') return;
    var bars = Array.isArray(msg.bars) ? msg.bars.slice(0, MAX_BARS) : [];
    var meta = { name: 'Özel script', overlay: true }, plots = [], byName = {};
    function ensurePlot(name) {
      var key = String(name || 'plot');
      if (!byName[key] && plots.length < MAX_PLOTS) {
        byName[key] = { name: cleanName(key, 'plot'), color: '#2962ff', values: new Array(bars.length).fill(null) };
        plots.push(byName[key]);
      }
      return byName[key];
    }
    var plotIndex = 0;
    function apiPlot(name, value, options) {
      var plot = ensurePlot(name);
      if (!plot) return;
      if (options && /^#[0-9a-f]{3,8}$/i.test(String(options.color || ''))) plot.color = String(options.color);
      var finite = Number(value);
      if (Number.isFinite(finite) && plotIndex >= 0 && plotIndex < plot.values.length) plot.values[plotIndex] = finite;
    }
    var api = {
      study: function (info) { if (info && typeof info === 'object') { meta.name = cleanName(info.name, 'Özel script'); meta.overlay = info.overlay !== false; } },
      input: function (value) { var n = Number(value); return Number.isFinite(n) ? Math.min(10000, Math.max(1, n)) : value; },
      ta: { sma: sma, ema: ema }
    };
    try {
      var source = String(msg.code || '');
      var factory = new Function('api', 'document', 'window', 'parent', 'top', 'self', 'globalThis', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'location', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'Worker', 'Function',
        '"use strict";var study=api.study,input=api.input,ta=api.ta;\\n' + source + '\\n;return typeof onBar==="function"?onBar:null;');
      var onBar = factory(api, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
      if (typeof onBar !== 'function') throw new Error("'function onBar(ctx)' tanımı gerekli");
      var opens = [], highs = [], lows = [], closes = [], volumes = [];
      for (var i = 0; i < bars.length; i++) {
        plotIndex = i;
        var bar = bars[i];
        opens.push(Number(bar.open)); highs.push(Number(bar.high)); lows.push(Number(bar.low));
        closes.push(Number(bar.close)); volumes.push(Number(bar.volume) || 0);
        var ctx = {
          time: Number(bar.time), index: Number(msg.startIndex || 0) + i, bar: bar,
          price: Number(bar.close), open: opens, high: highs, low: lows, close: closes, volume: volumes,
          plot: function (name, value, options) { apiPlot(name, value, options); }
        };
        onBar(ctx);
      }
      parent.postMessage({ channel: 'alfa-script-result', id: msg.id, ok: true, study: meta, plots: plots }, '*');
    } catch (error) {
      parent.postMessage({ channel: 'alfa-script-result', id: msg.id, ok: false, error: String(error && error.message || error) }, '*');
    }
  });
})();
</script></body></html>`;

export function runSandboxedScript({ code, bars, startIndex = 0 }) {
  const source = validateScriptCode(code);
  const rows = (bars || []).slice(-MAX_BARS).map(bar => ({
    time: Number(bar.time), open: Number(bar.open), high: Number(bar.high),
    low: Number(bar.low), close: Number(bar.close), volume: Number(bar.volume) || 0
  }));
  if (!rows.length) throw new Error('Grafikte script için yeterli veri yok');
  const id = 'script-' + Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.hidden = true;
    frame.style.display = 'none';
    frame.srcdoc = IFRAME_HTML;
    let done = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      frame.remove();
    };
    const onMessage = event => {
      if (done || event.source !== frame.contentWindow) return;
      const msg = event.data;
      if (!msg || msg.channel !== 'alfa-script-result' || msg.id !== id) return;
      done = true;
      cleanup();
      try { resolve(normalizeScriptResult(msg, rows.length)); }
      catch (error) { reject(error); }
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true; cleanup();
      reject(new Error('Script zaman aşımına uğradı'));
    }, 5000);
    window.addEventListener('message', onMessage);
    frame.addEventListener('error', () => {
      if (done) return;
      done = true; cleanup();
      reject(new Error('Script kum havuzu açılamadı'));
    });
    document.body.append(frame);
    frame.addEventListener('load', () => {
      frame.contentWindow?.postMessage({ channel: CHANNEL_MESSAGE, id, code: source, bars: rows, startIndex }, '*');
    }, { once: true });
  });
}

const CHANNEL_MESSAGE = 'alfa-script-run';
