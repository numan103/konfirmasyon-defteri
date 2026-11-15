(function (root) {
  'use strict';
  var keys = ['alfa-fund-v1', 'alfa-fund-recovery-v1', 'alfa-fund-recovery-latest-v1', 'alfa-fund-before-restore-v1'];
  function parse(raw) { try { return JSON.parse(raw); } catch (e) { return null; } }
  function valid(d) { return !!d && Array.isArray(d.positions) && d.positions.every(function (p) { return p && typeof p === 'object'; }) &&
    (!d.sells || (Array.isArray(d.sells) && d.sells.every(function (p) { return p && typeof p === 'object'; }))); }
  function active(d) { return valid(d) && (d.positions.length > 0 || (d.sells || []).length > 0); }
  function seed(d) {
    return valid(d) && d.positions.some(function (p) { return p.id === 'eth-sep5'; }) &&
      !d.positions.some(function (p) { return p.id !== 'eth-sep5'; }) &&
      String(d.lastUpdate || '2026-09-05').slice(0, 10) <= '2026-09-05';
  }
  function scan(storage) {
    return keys.map(function (key) {
      var data = null;
      try { data = parse(storage.getItem(key)); } catch (e) {}
      return valid(data) ? { key: key, data: data, active: active(data), legacy: seed(data) } : null;
    }).filter(Boolean);
  }
  function preserve(storage, data) {
    if (!active(data) || seed(data)) return false;
    try {
      var old = parse(storage.getItem('alfa-fund-recovery-v1'));
      var key = active(old) && !seed(old) ? 'alfa-fund-recovery-latest-v1' : 'alfa-fund-recovery-v1';
      if (JSON.stringify(old) === JSON.stringify(data)) return true;
      storage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) { return false; }
  }
  function download(data, source) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'portfoy-yedek-' + source.replace(/[^a-z0-9_-]/gi, '') + '.json';
    a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  root.AlfaPortfolioRecovery = { keys: keys, parse: parse, valid: valid, active: active, seed: seed, scan: scan, preserve: preserve, download: download };
})(globalThis);
