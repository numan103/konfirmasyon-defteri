const https = require('https');
function fetchText(u, headers) {
  return new Promise((res, rej) => {
    https.get(u, { headers: headers || {} }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
    }).on('error', rej);
  });
}
(async () => {
  const q = '?v=' + Date.now();
  const html = await fetchText('https://alfa-trader.com/' + q);
  const sw = await fetchText('https://alfa-trader.com/sw.js' + q);
  const botHome = await fetchText('https://alfa-trader.com/', { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
  const botAt = await fetchText('https://alfa-trader.com/?page=alfatrading', { 'User-Agent': 'TelegramBot (like TwitterBot)' });
  const marks = {
    APP_BUILD_b57: html.includes("APP_BUILD = 'b57'"),
    og_title_static: html.includes('Alfa Traders — Konfirmasyon Defteri'),
    og_not_old: !html.includes('Setup Kalitesi'),
    og_image_static: html.includes('alfa-trader.com/og.png'),
    bot_og_title: botHome.includes('<title>Alfa Traders — Konfirmasyon Defteri</title>'),
    bot_og_page: botAt.includes('og:title" content="Alfa Traders — Alfa Trading"') && botAt.includes('og:description" content="Alfa Trading — analiz ve işlem paylaşım akışı'),
    bot_og_image: botAt.includes('https://alfa-trader.com/og.png'),
    bot_og_card: botAt.includes('summary_large_image'),
    beklenti_panel: html.includes('bd-pl-beklenti'),
    beklenti_body: html.includes('bd-pl-beklenti-body'),
    beklenti_after_mid: html.indexOf('bd-pl-beklenti') > html.indexOf('bd-pl-mid') && html.indexOf('bd-pl-beklenti') < html.indexOf('bd-pl-holdings-panel'),
    plans_at_bottom: html.indexOf('bd-pl-table-panel') < html.indexOf('bd-pl-plans'),
    no_note_div: !html.includes('id="bd-pl-note"'),
    price_optional_label: html.includes('opsiyonel'),
    price_hint: html.includes('sadece yatırdığın tutar'),
    pfPosCalc_fallback: html.includes('if (a === null || pos.type === \'custom\') { value = cost; }'),
    pfPosCalc_guard: html.includes('if (cur !== null && !(cur > 0)) cur = null;'),
    pfGoldGramFix_fn: html.includes('function pfGoldGramFix'),
    pfSummary_unpriced: html.includes('else { totalValue += c.cost; unpriced++; }'),
    pfPlanBeklenti_fn: html.includes('function pfPlanBeklenti'),
    pfHoldings_key: html.includes('groups[k].key = k'),
    life_panel: html.includes('id="bd-life-panel"'),
    life_body: html.includes('id="bd-life-body"'),
    life_css: html.includes('.bd-life-track'),
    life_key: html.includes("LIFE_KEY = 'alfa-karne-life-v1'"),
    life_i18n: html.includes("'pg.life.t'"),
    life_save_btn: html.includes('id="bd-life-save"'),
    life_after_daily: html.indexOf('id="bd-life-panel"') > html.indexOf('id="kr-ai-wrap"') && html.indexOf('id="bd-life-panel"') < html.indexOf('id="kr-hist"'),
    icon_pick: html.includes('BUTCE_ICONS'),
    icon_pick_css: html.includes('.bd-iconpick-btn'),
    clear_filter_btn: html.includes('bd-clear-cat'),
    coingecko_fallback: html.includes('api.coingecko.com'),
    earnings_per_pos: html.includes('bd-pl-hrow-earn'),
    earnings_summary: html.includes('bd-pl-hld-summary'),
    sw_v21: sw.includes('alfa-v21'),
    basvuru_admin_gate: html.includes("name === 'basvuru' && !amAllowed()"),
    basvuru_nav_hidden: html.includes('id="tab-basvuru"') && html.includes('id="mnav-basvuru"'),
    alfa_portfoy_page: !html.includes('id="page-alfaportfoy"'),
    alfa_portfoy_tab: html.includes('data-bdt="alfaportfoy"'),
    alfa_portfoy_view: html.includes('id="bd-view-alfaportfoy"'),
    alfa_portfoy_render: html.includes('function renderAlfaPortfoy2'),
    alfa_portfoy_data_key: html.includes("AP2_KEY = 'alfa-fund-v1'"),
    alfa_portfoy_bind: html.includes('function bindAlfaPortfoy2'),
    sw_b57: sw.includes("'b57'"),
    alfa_portfoy_render_fix: html.includes("if (bdTab === 'alfaportfoy') { renderAlfaPortfoy2();"),
    alfa_portfoy_autoprice: html.includes('function ap2LoadPrices'),
  };
  let ok = true;
  for (const [k, v] of Object.entries(marks)) {
    console.log((v ? 'OK   ' : 'MISS ') + k);
    if (!v) ok = false;
  }
  console.log(ok ? 'ALL LIVE OK' : 'MISSING MARKERS');
})().catch(e => { console.error('fetch error', e.message); process.exit(1); });
