import { DEFAULT_SCRIPT, runSandboxedScript, validateScriptCode } from './alfa-script-sandbox.mjs?v=3';

const $ = id => document.getElementById(id);

export function initRightPanel({
  getSymbol, getInterval, getBars, getAlarms, alarmLabel,
  openAlarms, openObjectTree, getDrawings, runScript, storageKey
}) {
  const code = $('script-code');
  const output = $('script-output');
  let currentResult = null;
  let lastRun = 0;

  const readSavedCode = () => {
    try { return localStorage.getItem(storageKey) || DEFAULT_SCRIPT; } catch { return DEFAULT_SCRIPT; }
  };
  const saveCode = value => { try { localStorage.setItem(storageKey, value); } catch {} };

  function update() {
    const symbol = getSymbol() || '—';
    const interval = getInterval() || '—';
    const bars = getBars() || [];
    const last = bars.at(-1);
    const alarms = getAlarms() || [];
    const drawings = getDrawings() || [];
    $('right-data-symbol').textContent = symbol;
    $('right-data-timeframe').textContent = interval;
    $('right-data-ohlc').textContent = last
      ? `A ${Number(last.open).toFixed(2)} · Y ${Number(last.high).toFixed(2)} · D ${Number(last.low).toFixed(2)} · K ${Number(last.close).toFixed(2)}`
      : 'Veri bekleniyor';
    $('right-data-volume').textContent = last ? String(Number(last.volume) || 0) : '—';
    const active = alarms.filter(alarm => alarm.symbol === symbol && alarm.enabled !== false);
    $('right-alarm-summary').textContent = active.length
      ? `${active.length} aktif alarm · ${alarmLabel(active.at(-1))}`
      : 'Bu sembolde aktif alarm yok.';
    $('right-object-summary').textContent = drawings.length
      ? `${drawings.length} nesne · ağaçta seçim ve stiller düzenlenebilir`
      : 'Bu sembolde çizim yok.';
  }

  function setOutput(text, kind = '') {
    output.textContent = text;
    output.dataset.state = kind;
  }

  async function execute() {
    const started = ++lastRun;
    setOutput('Script kum havuzda çalıştırılıyor…', 'running');
    try {
      validateScriptCode(code.value);
      saveCode(code.value);
      const result = await runScript(code.value);
      if (started !== lastRun) return;
      currentResult = result;
      setOutput(`${result.study.name} · ${result.plots.length} çizgi · son değerler güncellendi`, 'ok');
      update();
    } catch (error) {
      if (started !== lastRun) return;
      currentResult = null;
      setOutput(`Script hatası: ${error.message}`, 'error');
    }
  }

  $('right-alarm-open').addEventListener('click', openAlarms);
  $('right-object-open').addEventListener('click', openObjectTree);
  $('script-run').addEventListener('click', execute);
  $('script-reset').addEventListener('click', () => {
    code.value = DEFAULT_SCRIPT;
    saveCode(code.value);
    setOutput('Örnek script geri yüklendi.', 'ok');
  });
  code.value = readSavedCode();

  return {
    update,
    execute,
    focus() { code.focus({ preventScroll: true }); code.select(); },
    get result() { return currentResult; },
    get code() { return code.value; },
    get runner() { return runScript; }
  };
}

export { runSandboxedScript };
