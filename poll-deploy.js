const { execSync } = require('child_process');
const sleepMs = ms => { const t0 = Date.now(); while (Date.now() - t0 < ms) execSync('powershell -command "Start-Sleep -Milliseconds 500"'); };
const KEYS = ['sosyalmetre_page', 'sosyalmetre_route', 'sosyalmetre_tabs', 'sosyalmetre_checklist', 'sosyalmetre_trades', 'sosyalmetre_bands', 'sosyalmetre_share', 'sosyalmetre_edit', 'sosyalmetre_img', 'sosyalmetre_save', 'sosyalmetre_old_removed', 'ap2_sellmeta', 'ap2_deposit', 'ap2_pricefix', 'alfa_portfoy_tg_endpoint', 'alfa_portfoy_tg_pnl_events', 'ap2_modern_form', 'ap2_growth_row', 'ap2_donut_gaps', 'ap2_sym_chips', 'butce_cleanhead', 'butce_rename', 'sosyalmetre_private', 'sosyalmetre_rules', 'sosyalmetre_catedit', 'alfa_portfoy_hedge', 'alfa_portfoy_ui', 'alfa_portfoy_histrobust', 'alfa_portfoy_limit', 'uyap', 'uyap_autolink', 'uyap_notes'];
for (let i = 0; i < 12; i++) {
  if (i) sleepMs(25000);
  try {
    const out = execSync('node ds-verify.js', { encoding: 'utf8' });
    const lines = out.split(/\r?\n/);
    const mk = lines.filter(l => KEYS.some(k => l.includes(k)));
    if (mk.length === KEYS.length && mk.every(l => l.startsWith('OK'))) {
      console.log('DEPLOYED at poll ' + i);
      console.log(mk.join('\n'));
      process.exit(0);
    }
    console.log('poll ' + i + ': ' + (mk.join(' | ') || 'n/a'));
  } catch (e) { console.log('poll ' + i + ': error ' + e.message); }
}
console.log('timeout'); process.exit(1);